// 期間シート（UI-SPEC §1.2「期間シート」・**採用案 39b**）。月バーの中央タップで開く。
// **記録タブとデータタブで同じ部品を共用する**（§1.2「MonthNavBar と対で共用する」）──
// 同じ「期間を選ぶ」操作を画面ごとに違う形で覚えさせないため、月バーと同じく 1 か所に置く。
//
// 構成（上から）
//   1. 見出し「表示する期間」
//   2. クイック選択「今月 / 先月 / 全期間」の 3 つ
//   3. **カード 1 枚**（`‹ 2026年 ›` ＋ 4 列 × 3 行の月グリッド ＋ 注記）
//   4. 凡例「記録あり / 記録なし」
//
// 選べるのは**全期間 / 1 年 / 1 か月**のいずれか（SPEC-V3 §5.5 の改訂）。「期間を指定」は置かない（§5-5）。
// 選んだ時点で即座に反映してシートを閉じる。確定ボタンは持たない。
//
// **カードは常に 1 枚で、見出しの ‹ › が年を送る**（案 39b）。年を縦に積む形（39a）はやめた ──
// 古い年ほど深いスクロールになるのに対し、この形は**何年前でも操作量が同じ**（矢印 1 回 = 1 年）。
// 年ボタンを横に並べる形（39c）も採らない（5 年を超えると横に溢れる）。
// スクロールが無くなったので、**シートの高さは中身ぴったり**になる（maxHeight を持たない）。
//
// **年の選び方は「見出しの年（2026年）を押す」。** 押すとその年 1 年ぶんが選ばれ、
//   - 12 か月のセルがまとめて薄い青（選択中の共通の表し方）で塗られ、カードに枠が付く
//   - 見出しの下に「1年分を選択中」が出る
//   - カード下の注記が「年を押すと1年分」→「月を押すとその月だけ」に入れ替わる
// 「年 = 月の集まり」が図として読めるので、説明の文を足さない。
// **クイック選択に「今年」「昨年」は足さない** ── 年見出しが 1 タップで同じ場所に届くうえ、
// 足すとクイック選択の並びが画面ごと・用途ごとに増えていく。どの画面でも 3 つのまま。
//
// 濃淡と押せるかどうかの規則（§1.2「月セルの出し分け」）:
//   | 月                        | 表示 | 押せるか |
//   | 記録のある月              | 通常 | ○ |
//   | 記録のない過去の月・今月  | 薄い | ○（一覧は空表示になる） |
//   | 未来の月                  | 薄い | × |
// **記録のない月と未来の月は見た目では区別しない。違いは押せるかどうかだけ。**
// 盤面の組み立て（年の範囲・各マスの状態・矢印の可否）は logic/periodGrid.ts の純粋関数が決める。
import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { SheetModal } from '@/components/SheetModal';
import { formatMonthCell, formatMonthKeyTitle, formatYearTitle } from '@/logic/format';
import {
  ALL_PERIOD_LABEL,
  HAS_RECORDS_LEGEND_LABEL,
  LAST_MONTH_LABEL,
  MONTH_TAP_HINT_LABEL,
  NEXT_YEAR_LABEL,
  NO_RECORDS_LEGEND_LABEL,
  PERIOD_SHEET_TITLE,
  PREVIOUS_YEAR_LABEL,
  THIS_MONTH_LABEL,
  YEAR_SELECTED_HINT_LABEL,
  YEAR_TAP_HINT_LABEL,
} from '@/logic/labels';
import { isYearPeriod, periodYear, shiftMonthKey, yearPeriod, type Period } from '@/logic/period';
import { periodGrid, type MonthCell } from '@/logic/periodGrid';
import { useThemeColors } from '@/theme';

type Props = {
  visible: boolean;
  /** 選択中の期間（全期間 / "YYYY" / "YYYY-MM"） */
  period: Period;
  /**
   * 記録が 1 件以上ある月キー（順不同）。マスの濃淡だけに使う。
   * **種別・状態・検索を無視した全記録**で作った集合を渡すこと（§1.2 の派生決定）──
   * 絞り込みでグリッドの見た目が変わると、期間選びの手がかりとして不安定になるため。
   */
  monthsWithRecords: readonly string[];
  /** 今月の月キー。未来かどうかの境目と「今月」ボタンの行き先になる */
  currentMonthKey: string;
  /** 選んだ期間。null = 全期間 / "YYYY" = 年 / "YYYY-MM" = 月 */
  onSelect: (period: Period) => void;
  onClose: () => void;
};

export function PeriodSheet({
  visible,
  period,
  monthsWithRecords,
  currentMonthKey,
  onSelect,
  onClose,
}: Props) {
  const colors = useThemeColors();

  const lastMonthKey = useMemo(() => shiftMonthKey(currentMonthKey, -1), [currentMonthKey]);

  /**
   * カードに出している年。**選択中の期間の年から始める**（全期間なら今年）──
   * 開いた直後に「いま見ている期間」がカードの上にあるのが、次に押す場所を探さずに済む形。
   * シートを開き直すたびに取り直したいので、`visible` の立ち上がりで作り直す
   * （開いている間の ‹ › の操作はこの state が持つ）。
   */
  const initialYear = periodYear(period) ?? periodYear(currentMonthKey) ?? 0;
  const [viewYear, setViewYear] = useState(initialYear);
  const [wasVisible, setWasVisible] = useState(visible);
  if (wasVisible !== visible) {
    setWasVisible(visible);
    if (visible) setViewYear(initialYear);
  }

  // 年の丸めは periodGrid が行う（記録が消えて範囲が縮んだ場合に備える）
  const block = useMemo(
    () => periodGrid({ year: viewYear, currentMonthKey, monthsWithRecords }),
    [viewYear, currentMonthKey, monthsWithRecords],
  );
  const yearSelected = isYearPeriod(period) && periodYear(period) === block.year;

  return (
    <SheetModal visible={visible} onClose={onClose}>
      {(close) => {
        // 選んだ時点で反映してシートを閉じる（§1.2「挙動」）。確定ボタンは置かない。
        // 閉じるのは close 経由（下がり切ってから onClose）
        const choose = (next: Period) => {
          onSelect(next);
          close();
        };

        return (
          <View style={[styles.sheet, { backgroundColor: colors.background }]}>
            <Text style={[styles.title, { color: colors.label }]}>{PERIOD_SHEET_TITLE}</Text>

            {/* クイック選択（§1.2-2）。「今月」を選んでいるときはこのボタンとグリッドの該当月の
                **両方**がハイライトされる。グリッドから直接その月を選んだ場合も同じ状態になる */}
            <View style={styles.quickRow}>
              <QuickButton
                label={THIS_MONTH_LABEL}
                selected={period === currentMonthKey}
                onPress={() => choose(currentMonthKey)}
              />
              <QuickButton
                label={LAST_MONTH_LABEL}
                selected={period === lastMonthKey}
                onPress={() => choose(lastMonthKey)}
              />
              <QuickButton
                label={ALL_PERIOD_LABEL}
                // 全期間のときグリッドにハイライトは出ない（月も年も選んでいないため）
                selected={period == null}
                onPress={() => choose(null)}
              />
            </View>

            <View
              style={[
                styles.card,
                {
                  backgroundColor: colors.secondaryBackground,
                  // 年を選んでいる間だけ枠を付ける。12 セルの塗りだけだと、
                  // 「この 1 枚ぶんが選ばれている」ことが塗りの意味として弱い
                  borderColor: yearSelected ? colors.blue : 'transparent',
                },
              ]}>
              {/* 見出し: ‹ 2026年 ›。年の文字が「その年 1 年分」のボタン、
                  左右の矢印が前年・翌年（§1.2・案 39b） */}
              <View style={styles.cardHeader}>
                <YearArrow
                  name="chevron-back"
                  enabled={block.canGoBack}
                  onPress={() => setViewYear(block.year - 1)}
                  accessibilityLabel={PREVIOUS_YEAR_LABEL}
                />
                <Pressable
                  style={({ pressed }) => [styles.yearButton, { opacity: pressed ? 0.6 : 1 }]}
                  onPress={() => choose(yearPeriod(block.year))}
                  accessibilityRole="button"
                  accessibilityState={{ selected: yearSelected }}
                  accessibilityLabel={`${formatYearTitle(block.year)}・${
                    yearSelected ? YEAR_SELECTED_HINT_LABEL : YEAR_TAP_HINT_LABEL
                  }`}>
                  <Text style={[styles.yearTitle, { color: colors.blue }]}>
                    {formatYearTitle(block.year)}
                  </Text>
                  {/* 選択中だけ出る。未選択のときに場所を空けておくことはしない
                      （カードの高さが変わるが、シートは中身ぴったりなので下端が動くだけ） */}
                  {yearSelected && (
                    <Text style={[styles.yearSelectedHint, { color: colors.blue }]}>
                      {YEAR_SELECTED_HINT_LABEL}
                    </Text>
                  )}
                </Pressable>
                <YearArrow
                  name="chevron-forward"
                  enabled={block.canGoForward}
                  onPress={() => setViewYear(block.year + 1)}
                  accessibilityLabel={NEXT_YEAR_LABEL}
                />
              </View>

              <View style={styles.monthGrid}>
                {block.months.map((cell) => (
                  <MonthButton
                    key={cell.monthKey}
                    cell={cell}
                    // 年を選んでいる間は 12 個ともハイライトされるが、
                    // 押したときの意味は変わらない（その 1 か月）
                    selected={yearSelected || period === cell.monthKey}
                    onPress={() => choose(cell.monthKey)}
                  />
                ))}
              </View>

              {/* 注記は「いま押せるもう一方」を言う。年を選んだ後は年の押し方の説明が要らない */}
              <Text style={[styles.cardHint, { color: colors.secondaryLabel }]}>
                {yearSelected ? MONTH_TAP_HINT_LABEL : YEAR_TAP_HINT_LABEL}
              </Text>
            </View>

            <Legend />
          </View>
        );
      }}
    </SheetModal>
  );
}

/** クイック選択の 1 ボタン（今月 / 先月 / 全期間）。選択中はチップと同じ薄い青地＋青文字 */
function QuickButton({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const colors = useThemeColors();

  return (
    <Pressable
      style={({ pressed }) => [
        styles.quickButton,
        {
          backgroundColor: selected ? colors.highlightBackground : colors.secondaryBackground,
          opacity: pressed ? 0.6 : 1,
        },
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}>
      <Text
        style={[styles.quickLabel, { color: selected ? colors.blue : colors.label }]}
        numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

/** 年見出しの ‹ ›（前年 / 翌年）。無効化の規則は月バーと同じ考え方（§5-14） */
function YearArrow({
  name,
  enabled,
  onPress,
  accessibilityLabel,
}: {
  name: 'chevron-back' | 'chevron-forward';
  enabled: boolean;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  const colors = useThemeColors();

  return (
    <Pressable
      onPress={onPress}
      disabled={!enabled}
      hitSlop={12}
      style={styles.yearArrow}
      accessibilityRole="button"
      accessibilityState={{ disabled: !enabled }}
      accessibilityLabel={accessibilityLabel}>
      <Ionicons name={name} size={20} color={enabled ? colors.blue : colors.disabledContent} />
    </Pressable>
  );
}

/** 月グリッドの 1 マス。未来の月は押しても何も起きない（シートも閉じない。§1.2「挙動」） */
function MonthButton({
  cell,
  selected,
  onPress,
}: {
  cell: MonthCell;
  selected: boolean;
  onPress: () => void;
}) {
  const colors = useThemeColors();

  // 記録のない月と未来の月は同じ薄さ（§1.2）。違いは disabled かどうかだけ
  const textColor = selected
    ? colors.blue
    : cell.hasRecord
      ? colors.label
      : colors.disabledContent;

  return (
    <View style={styles.monthCell}>
      <Pressable
        style={({ pressed }) => [
          styles.monthButton,
          {
            backgroundColor: selected ? colors.highlightBackground : colors.background,
            opacity: pressed && !cell.isFuture ? 0.6 : 1,
          },
        ]}
        onPress={onPress}
        disabled={cell.isFuture}
        accessibilityRole="button"
        accessibilityState={{ selected, disabled: cell.isFuture }}
        // 読み上げでは年も込みで言う（マスには月しか出ていないため）
        accessibilityLabel={`${formatMonthKeyTitle(cell.monthKey)}${
          cell.hasRecord ? `・${HAS_RECORDS_LEGEND_LABEL}` : `・${NO_RECORDS_LEGEND_LABEL}`
        }`}>
        <Text style={[styles.monthLabel, { color: textColor }]}>
          {formatMonthCell(cell.month)}
        </Text>
      </Pressable>
    </View>
  );
}

/**
 * 凡例（§1.2-4）。濃淡が何を意味するかを名指しする。
 * 未来の月は「記録なし」と同じ薄さなので項目を足さない ── 押せないことは押せば分かる。
 */
function Legend() {
  const colors = useThemeColors();

  return (
    <View style={[styles.legend, { borderTopColor: colors.separator }]}>
      <LegendItem color={colors.label} label={HAS_RECORDS_LEGEND_LABEL} />
      <LegendItem color={colors.disabledContent} label={NO_RECORDS_LEGEND_LABEL} />
    </View>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  const colors = useThemeColors();

  return (
    <View style={styles.legendItem}>
      {/* 見本はグリッドの文字色そのもの。色見本と本体の濃さが違うと凡例にならない */}
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={[styles.legendLabel, { color: colors.secondaryLabel }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // **高さは中身ぴったり**（案 39b でスクロールが無くなった）。maxHeight は持たない
  sheet: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    gap: 12,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
  },
  quickRow: {
    flexDirection: 'row',
    gap: 8,
  },
  quickButton: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  // カード 1 枚。枠は選択中だけ色が付くが、**幅は常に取る**（付いた瞬間に中身がずれないため）
  card: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 10,
    gap: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  yearArrow: {
    padding: 6,
  },
  yearButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 2,
  },
  yearTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  yearSelectedHint: {
    fontSize: 12,
    fontWeight: '600',
  },
  cardHint: {
    fontSize: 12,
    textAlign: 'center',
    paddingTop: 2,
  },
  monthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  // 4 列（1〜12 月が 4 列 × 3 行）。幅を割合で持たせて端末幅に追従させる
  monthCell: {
    width: '25%',
    padding: 4,
  },
  monthButton: {
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthLabel: {
    fontSize: 15,
  },
  legend: {
    flexDirection: 'row',
    gap: 16,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendLabel: {
    fontSize: 12,
  },
});
