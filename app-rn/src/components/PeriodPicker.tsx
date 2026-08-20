// 期間の盤面（UI-SPEC §1.2「期間シート」・採用案 39b）。**シートの器を持たない中身だけ。**
//
// 構成（上から）
//   1. クイック選択「今月 / 先月 / 全期間」の 3 つ
//   2. **カード 1 枚**（`‹ 2026年 ›` ＋ 4 列 × 3 行の月グリッド ＋ 注記）
//   3. 凡例「記録あり / 記録なし」
//
// **器から切り出したのは、書き出しシート（SPEC-V3 §5.7）が同じ盤面を中に埋め込むため。**
// 期間シート（PeriodSheet）は「選んだ瞬間に効いて閉じる」が、書き出しシートは
// 期間を選んでもまだ閉じない（「書き出す」を押すまで何も起きない）。器（開閉・即閉じ）を
// この部品から外しておけば、盤面そのものは 1 か所のままで両方に載る。
//
// **作り直さない**のが要点（SPEC-V3 §5.5 の改訂）── 同じ見た目・同じ操作の月グリッドが
// 2 つあると、片方だけ直される事故（濃淡の規則、未来の月の扱い、年の範囲）が起きるが、
// 見た目が同じなので気づけない。共用しているかぎり、直せば全部に効く。
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

import { formatMonthCell, formatMonthKeyTitle, formatYearTitle } from '@/logic/format';
import {
  allPeriodLabel,
  hasRecordsLegendLabel,
  lastMonthLabel,
  monthTapHintLabel,
  nextYearLabel,
  noRecordsLegendLabel,
  previousYearLabel,
  thisMonthLabel,
  yearSelectedHintLabel,
  yearTapHintLabel,
} from '@/logic/labels';
import { isYearPeriod, periodYear, shiftMonthKey, yearPeriod, type Period } from '@/logic/period';
import { periodGrid, type MonthCell } from '@/logic/periodGrid';
import { useLocale } from '@/settings';
import { useThemeColors } from '@/theme';

type Props = {
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
  /**
   * カードに出す年を取り直す合図（省略可）。値が変わると選択中の期間の年に戻る。
   * 期間シートは開くたびに取り直したいのでこれを渡し、書き出しシートは開きっぱなしなので渡さない。
   */
  resetKey?: unknown;
};

export function PeriodPicker({
  period,
  monthsWithRecords,
  currentMonthKey,
  onSelect,
  resetKey,
}: Props) {
  // 表示語は locale を引数に取る（src/i18n/index.ts の冒頭）
  const locale = useLocale();

  const colors = useThemeColors();

  const lastMonthKey = useMemo(() => shiftMonthKey(currentMonthKey, -1), [currentMonthKey]);

  /**
   * カードに出している年。**選択中の期間の年から始める**（全期間なら今年）──
   * 開いた直後に「いま見ている期間」がカードの上にあるのが、次に押す場所を探さずに済む形。
   */
  const initialYear = periodYear(period) ?? periodYear(currentMonthKey) ?? 0;
  const [viewYear, setViewYear] = useState(initialYear);
  const [lastResetKey, setLastResetKey] = useState(resetKey);
  if (lastResetKey !== resetKey) {
    setLastResetKey(resetKey);
    setViewYear(initialYear);
  }

  // 年の丸めは periodGrid が行う（記録が消えて範囲が縮んだ場合に備える）
  const block = useMemo(
    () => periodGrid({ year: viewYear, currentMonthKey, monthsWithRecords }),
    [viewYear, currentMonthKey, monthsWithRecords],
  );
  const yearSelected = isYearPeriod(period) && periodYear(period) === block.year;

  return (
    <>
      {/* クイック選択（§1.2-2）。「今月」を選んでいるときはこのボタンとグリッドの該当月の
          **両方**がハイライトされる。グリッドから直接その月を選んだ場合も同じ状態になる */}
      <View style={styles.quickRow}>
        <QuickButton
          label={thisMonthLabel(locale)}
          selected={period === currentMonthKey}
          onPress={() => onSelect(currentMonthKey)}
        />
        <QuickButton
          label={lastMonthLabel(locale)}
          selected={period === lastMonthKey}
          onPress={() => onSelect(lastMonthKey)}
        />
        <QuickButton
          label={allPeriodLabel(locale)}
          // 全期間のときグリッドにハイライトは出ない（月も年も選んでいないため）
          selected={period == null}
          onPress={() => onSelect(null)}
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
            左右の矢印が前年・翌年（§1.2・案 39b）。

            **年は枠で囲う。** 青い文字・押した瞬間の 0.6・カード下の注記だけでは
            「押せる」が伝わらなかった（実機の指摘）── すぐ下に 44pt の矩形が 12 個
            並んでいるので、枠のない年は月と較べて「ただの見出し」に読める。
            枠は月のマスと同じ角丸 10 で、選択中は同じ薄い青地（highlightBackground）。
            クイック選択（QuickButton）の選択中とも同じ見え方になる */}
        <View style={styles.cardHeader}>
          <YearArrow
            name="chevron-back"
            enabled={block.canGoBack}
            onPress={() => setViewYear(block.year - 1)}
            accessibilityLabel={previousYearLabel(locale)}
          />
          <Pressable
            style={({ pressed }) => [styles.yearButton, { opacity: pressed ? 0.6 : 1 }]}
            onPress={() => onSelect(yearPeriod(block.year))}
            accessibilityRole="button"
            accessibilityState={{ selected: yearSelected }}
            accessibilityLabel={`${formatYearTitle(locale, block.year)}・${
              yearSelected ? yearSelectedHintLabel(locale) : yearTapHintLabel(locale)
            }`}>
            <Text
              style={[styles.yearTitle, { color: colors.blue, borderBottomColor: colors.blue }]}>
              {formatYearTitle(locale, block.year)}
            </Text>
            {/* **押すと何が起きるかを、押す物の中で言う。** 下線だけでは「いま出している年」
                という状態表示にも読めるので、動作の語をここに置く。選ぶ前と後で語が
                入れ替わるだけなので、行数は変わらない（カードの丈が動かない） */}
            <Text style={[styles.yearHint, { color: colors.blue }]}>
              {yearSelected ? yearSelectedHintLabel(locale) : yearTapHintLabel(locale)}
            </Text>
          </Pressable>
          <YearArrow
            name="chevron-forward"
            enabled={block.canGoForward}
            onPress={() => setViewYear(block.year + 1)}
            accessibilityLabel={nextYearLabel(locale)}
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
              onPress={() => onSelect(cell.monthKey)}
            />
          ))}
        </View>

        {/* 年の押し方は年の下へ移したので、ここに残るのは月の話だけ。
            **年を選んでいる間しか出さない** ── 12 マスがまとめて青くなった直後だけ
            「それでも 1 か月は選べる」が要る。ふだんは月が押せることを説明する必要がない */}
        {yearSelected && (
          <Text style={[styles.cardHint, { color: colors.secondaryLabel }]}>
            {monthTapHintLabel(locale)}
          </Text>
        )}
      </View>

      <Legend />
    </>
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
  // 表示語は locale を引数に取る（src/i18n/index.ts の冒頭）
  const locale = useLocale();

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
        accessibilityLabel={`${formatMonthKeyTitle(locale, cell.monthKey)}${
          cell.hasRecord ? `・${hasRecordsLegendLabel(locale)}` : `・${noRecordsLegendLabel(locale)}`
        }`}>
        <Text style={[styles.monthLabel, { color: textColor }]}>{formatMonthCell(locale, cell.month)}</Text>
      </Pressable>
    </View>
  );
}

/**
 * 凡例（§1.2-4）。濃淡が何を意味するかを名指しする。
 * 未来の月は「記録なし」と同じ薄さなので項目を足さない ── 押せないことは押せば分かる。
 */
function Legend() {
  // 表示語は locale を引数に取る（src/i18n/index.ts の冒頭）
  const locale = useLocale();

  const colors = useThemeColors();

  return (
    <View style={[styles.legend, { borderTopColor: colors.separator }]}>
      <LegendItem color={colors.label} label={hasRecordsLegendLabel(locale)} />
      <LegendItem color={colors.disabledContent} label={noRecordsLegendLabel(locale)} />
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
  // **flex: 1 にしない** ── 伸ばすと当たり判定が左右の ‹ › に届くほどの帯になり、
  // 下線もその幅で引かれて「行の区切り線」に見える。文字幅に寄せて、
  // 余った幅は space-between が矢印との間隔として配る
  yearButton: {
    alignSelf: 'center',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
    gap: 3,
  },
  // 下線は**年の文字だけ**に引く（ボタン全体に引くと下の語まで含んでしまう）
  yearTitle: {
    fontSize: 17,
    fontWeight: '700',
    borderBottomWidth: 2,
    paddingHorizontal: 6,
    paddingBottom: 2,
  },
  yearHint: {
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
