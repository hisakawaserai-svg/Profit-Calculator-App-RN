// カレンダー形式の日付ピッカー（UI-SPEC §8.10）。廃止したホイールの置き換えで、
// **アプリのすべての日付欄がこの 1 つの部品を使う**（出品日・販売日・売れた日・集計期間）。
//
// **選択肢を消すのではなく、出したうえで選べないと分かる形にする。**
// 旧実装はホイールから範囲外の年月日を外していたため、利用者に
// 「過去に入力した内容しか出てこない」と誤解された。盤面は月の全日を出し、選べない日は
// 淡くするだけにして、理由は下の一行で名指しする（盤面の欠落を推測させない）。
//
// **欄ごとの違いは minDate / maxDate の 2 つだけ**（§8.10.4）。欄ごとの分岐を部品の中に
// 持ち込まない ── 制約に関わる props（範囲 / flag / note）はすべて省略でき、
// 省けば「全部選べる普通のカレンダー」になる。
//
// 構成は上から: 見出し → チップ → 年月見出し（押すと年月グリッド）→ 盤面 → 選べない理由の一行。
// 押した時点で値が決まるので「決定」は持たない（ボタンは閉じるだけ）。
// 日付だけを選び、時刻は元の値のまま引き継ぐ（DateField と同じ扱い）。
import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { DateChips } from '@/components/DateChips';
import { SheetModal } from '@/components/SheetModal';
import { formatMonthTitle } from '@/logic/format';
import {
  CHOOSE_MONTH_LABEL,
  CLOSE_LABEL,
  LISTED_DATE_FIELD_LABEL,
  TODAY_MARKER_LABEL,
  WEEKDAY_LABELS,
} from '@/logic/labels';
import {
  MONTH_GRID_COLUMNS,
  canShiftMonth,
  dayChips,
  monthGrid,
  shiftMonth,
  startOfMonth,
  yearMonthGrid,
  type CalendarDay,
  type MonthCell,
} from '@/logic/calendar';
import { clampToRange, type PartialDateRange } from '@/logic/saleDate';
import { useThemeColors, type ThemeColors } from '@/theme';

/** 日曜・土曜の見出しの色分けはしない（祝日を持たないので、色が意味を持てない） */
const WEEKDAY_COUNT = WEEKDAY_LABELS.length;

type Props = {
  /** シートの見出し（例:「売れた日」） */
  title: string;
  value: Date;
  onChangeValue: (value: Date) => void;
  onClose: () => void;
  /** 選べる範囲（両端を含む）。省略した側は制限なし */
  minDate?: Date;
  maxDate?: Date;
  /** 「今日」の基準。印とチップの起点 */
  today: Date;
  /** 小さな旗を出す日（売れた日のピッカーでは出品日）。省略すると出さない */
  flagDate?: Date | null;
  /** 旗の読み上げ語。既定は「出品日」 */
  flagLabel?: string;
  /** 選べない理由の一行（§8.10）。制約のない欄では省く */
  note?: string;
};

export function CalendarPicker({
  title,
  value,
  onChangeValue,
  onClose,
  minDate,
  maxDate,
  today,
  flagDate,
  flagLabel = LISTED_DATE_FIELD_LABEL,
  note,
}: Props) {
  const colors = useThemeColors();
  const range: PartialDateRange = useMemo(
    () => ({ min: minDate, max: maxDate }),
    [minDate, maxDate],
  );

  /**
   * 最初に開く月。保存済みの値が範囲外のとき（出品日を後から未来に動かした等）は
   * 範囲内へ寄せた月から始める（§8.5）。寄せた値をその場で書き戻さないのは、
   * ピッカーを開いただけで保存済みの値が変わるのを避けるため。
   */
  const [month, setMonth] = useState(() => startOfMonth(clampToRange(value, range)));

  /**
   * 年月グリッドを開いているか（§8.10.3）。開いている間は盤面と入れ替える ──
   * 別のシートを重ねないのは、選んだ月の盤面へ戻るまでが 1 つの操作だから。
   */
  const [choosingMonth, setChoosingMonth] = useState(false);

  const weeks = useMemo(
    () => monthGrid({ month, range, today, flagged: flagDate, selected: value }),
    [month, range, today, flagDate, value],
  );

  const chips = useMemo(
    () => dayChips({ today, range, selected: value }),
    [today, range, value],
  );

  const years = useMemo(
    () => (choosingMonth ? yearMonthGrid({ displayed: month, range }) : []),
    [choosingMonth, month, range],
  );

  /** 日付を入れて閉じる。閉じるのは close 経由（下がり切ってから onClose） */
  const selectAndClose = (date: Date, close: () => void) => {
    // 時刻は元の値から引き継ぐ（日付だけを選ぶ欄なので時刻は編集しない）
    onChangeValue(
      new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
        value.getHours(),
        value.getMinutes(),
        value.getSeconds(),
        value.getMilliseconds(),
      ),
    );
    // 選んだ時点で用は済む。「決定」を挟むと 1 タップぶん増えるだけ（§8 の方針）
    close();
  };

  return (
    <SheetModal onClose={onClose}>
      {(close) => (
      <View style={[styles.sheet, { backgroundColor: colors.background }]}>
        <Text style={[styles.sheetTitle, { color: colors.label }]}>{title}</Text>

        {/* 行と同じチップを上部にも置く（§8.10.2）。シートを開いてから「やっぱり昨日」と
            気づいたときに、盤面から目当ての日を探し直さずに済む */}
        <DateChips
          chips={chips}
          onSelect={(date) => selectAndClose(date, close)}
          style={styles.chips}
        />

        <View style={styles.monthBar}>
          <MonthArrow
            name="chevron-back"
            enabled={canShiftMonth(month, -1, range)}
            onPress={() => setMonth(shiftMonth(month, -1))}
            accessibilityLabel="前の月"
            colors={colors}
          />
          {/* 見出し自体がボタン（§8.10.2 の 3）。◀ の連打を年月グリッドで置き換える */}
          <Pressable
            onPress={() => setChoosingMonth((open) => !open)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={CHOOSE_MONTH_LABEL}
            accessibilityState={{ expanded: choosingMonth }}
            style={({ pressed }) => [styles.monthTitleButton, { opacity: pressed ? 0.5 : 1 }]}>
            <Text style={[styles.monthTitle, { color: colors.label }]}>
              {formatMonthTitle(month)}
            </Text>
            <Ionicons
              name={choosingMonth ? 'chevron-up' : 'chevron-down'}
              size={14}
              color={colors.blue}
            />
          </Pressable>
          <MonthArrow
            name="chevron-forward"
            enabled={canShiftMonth(month, 1, range)}
            onPress={() => setMonth(shiftMonth(month, 1))}
            accessibilityLabel="次の月"
            colors={colors}
          />
        </View>

        {choosingMonth ? (
          <ScrollView style={styles.yearList} bounces={false}>
            {years.map((block) => (
              <View key={block.year} style={styles.yearBlock}>
                <Text style={[styles.yearHeading, { color: colors.secondaryLabel }]}>
                  {block.year}年
                </Text>
                <View style={styles.monthGrid}>
                  {block.months.map((cell) => (
                    <MonthGridCell
                      key={cell.month}
                      cell={cell}
                      onPress={() => {
                        setMonth(cell.date);
                        // 月を押しても日はまだ決まっていない（§8.10.3）。盤面へ戻すだけ
                        setChoosingMonth(false);
                      }}
                      colors={colors}
                    />
                  ))}
                </View>
              </View>
            ))}
          </ScrollView>
        ) : (
          <>
            <View style={styles.week}>
              {WEEKDAY_LABELS.map((weekday) => (
                <Text
                  key={weekday}
                  style={[styles.weekdayLabel, { color: colors.secondaryLabel }]}
                  accessibilityElementsHidden>
                  {weekday}
                </Text>
              ))}
            </View>

            {weeks.map((week, index) => (
              <View key={index} style={styles.week}>
                {week.map((day, column) =>
                  day == null ? (
                    // 隣の月の日は出さない。淡い表示は「選べない」の意味に取ってあるので、
                    // 月外の日を淡く出すと 1 つの見た目が 2 つの意味を持ってしまう
                    <View key={column} style={styles.cell} />
                  ) : (
                    <DayCell
                      key={column}
                      day={day}
                      flagLabel={flagLabel}
                      onPress={() => selectAndClose(day.date, close)}
                      colors={colors}
                    />
                  ),
                )}
              </View>
            ))}
          </>
        )}

        {/* 選べない理由（§8.10）。淡いマスの説明をここで名指しし、推測させない */}
        {note != null && (
          <Text style={[styles.note, { color: colors.secondaryLabel }]}>{note}</Text>
        )}

        <Pressable
          style={[styles.closeButton, { backgroundColor: colors.blue }]}
          onPress={close}
          accessibilityRole="button">
          <Text style={styles.closeLabel}>{CLOSE_LABEL}</Text>
        </Pressable>
      </View>
      )}
    </SheetModal>
  );
}

/**
 * 盤面の 1 マス。
 *
 * 選択中は青の丸に白文字、選べない日は淡いだけで**押せる形には見せない**（押しても何も起きない）。
 * 印は数字の下に小さく置く ── 今日は点、出品日（旗）は小さな旗。数字そのものの大きさを
 * 印で変えないのは、日にちの列が印の有無で凸凹しないようにするため。
 */
function DayCell({
  day,
  flagLabel,
  onPress,
  colors,
}: {
  day: CalendarDay;
  flagLabel: string;
  onPress: () => void;
  colors: ThemeColors;
}) {
  // 印は丸の**外**に置くので、選択中でも白にしない（白い旗はシートの地色に溶けて見えなくなる）
  const markerColor = day.selectable || day.isSelected ? colors.blue : colors.mutedLabel;
  const numberColor = day.isSelected
    ? '#FFFFFF'
    : day.selectable
      ? colors.label
      : colors.mutedLabel;

  const marks = [day.isToday ? TODAY_MARKER_LABEL : null, day.isFlagged ? flagLabel : null]
    .filter((mark) => mark != null)
    .join(' ');

  return (
    <Pressable
      onPress={onPress}
      disabled={!day.selectable}
      accessibilityRole="button"
      accessibilityState={{ disabled: !day.selectable, selected: day.isSelected }}
      accessibilityLabel={marks === '' ? `${day.day}日` : `${day.day}日 ${marks}`}
      style={({ pressed }) => [styles.cell, { opacity: pressed && day.selectable ? 0.5 : 1 }]}>
      <View
        style={[
          styles.dayCircle,
          day.isSelected && { backgroundColor: colors.blue },
          // 選択中でない今日は輪郭だけで示す（塗ると選択中と見分けが付かない）
          !day.isSelected && day.isToday && { borderColor: colors.blue, borderWidth: 1 },
        ]}>
        <Text
          style={[styles.dayNumber, { color: numberColor }, day.isSelected && styles.selectedDay]}>
          {day.day}
        </Text>
      </View>

      <View style={styles.markers}>
        {day.isFlagged && <Ionicons name="flag" size={10} color={markerColor} />}
      </View>
    </Pressable>
  );
}

/**
 * 年月グリッドの 1 マス（UI-SPEC §8.10.3）。期間選択シート（§1.2）と同じ 4 列グリッド ──
 * 同じ「月を選ぶ」操作を 2 通りの形で覚えさせない。
 * 範囲外の月は盤面の日と同じ規則で淡色にして押せなくする（消さない）。
 */
function MonthGridCell({
  cell,
  onPress,
  colors,
}: {
  cell: MonthCell;
  onPress: () => void;
  colors: ThemeColors;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!cell.selectable}
      accessibilityRole="button"
      accessibilityState={{ disabled: !cell.selectable, selected: cell.isCurrent }}
      style={({ pressed }) => [
        styles.monthCell,
        cell.isCurrent && { backgroundColor: colors.highlightBackground },
        { opacity: pressed && cell.selectable ? 0.5 : 1 },
      ]}>
      <Text
        style={[
          styles.monthCellLabel,
          {
            color: cell.isCurrent
              ? colors.blue
              : cell.selectable
                ? colors.label
                : colors.mutedLabel,
          },
        ]}>
        {cell.month}月
      </Text>
    </Pressable>
  );
}

/** 月を送る矢印。範囲の外へ出る側は無効にする（MonthNavBar と同じ考え方。§5-14） */
function MonthArrow({
  name,
  enabled,
  onPress,
  accessibilityLabel,
  colors,
}: {
  name: 'chevron-back' | 'chevron-forward';
  enabled: boolean;
  onPress: () => void;
  accessibilityLabel: string;
  colors: ThemeColors;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!enabled}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityState={{ disabled: !enabled }}
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
      <Ionicons name={name} size={22} color={enabled ? colors.blue : colors.mutedLabel} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sheet: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    gap: 8,
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
  },
  chips: {
    justifyContent: 'center',
    paddingVertical: 2,
  },
  monthBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  monthTitleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  monthTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  yearList: {
    // 盤面（6 週ぶん）とだいたい同じ高さに収め、年月グリッドを開いてもシートの丈が飛ばないようにする
    maxHeight: 300,
  },
  yearBlock: {
    paddingBottom: 12,
  },
  yearHeading: {
    fontSize: 13,
    fontWeight: '600',
    paddingLeft: 4,
    paddingBottom: 4,
  },
  monthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  monthCell: {
    width: `${100 / MONTH_GRID_COLUMNS}%`,
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    borderRadius: 10,
  },
  monthCellLabel: {
    fontSize: 16,
  },
  week: {
    flexDirection: 'row',
  },
  weekdayLabel: {
    // 曜日見出しとマスは同じ 7 等分。列がずれないよう幅の決め方をそろえる
    width: `${100 / WEEKDAY_COUNT}%`,
    fontSize: 12,
    textAlign: 'center',
    paddingBottom: 4,
  },
  cell: {
    width: `${100 / WEEKDAY_COUNT}%`,
    alignItems: 'center',
    paddingVertical: 3,
  },
  dayCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayNumber: {
    fontSize: 16,
  },
  selectedDay: {
    fontWeight: '700',
  },
  markers: {
    // 印の有無で日にちの位置が動かないよう、印がなくても同じ高さを空けておく
    height: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  note: {
    fontSize: 13,
    textAlign: 'center',
    paddingTop: 4,
  },
  closeButton: {
    alignSelf: 'center',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 4,
  },
  closeLabel: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
