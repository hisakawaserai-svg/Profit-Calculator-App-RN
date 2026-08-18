// データタブ「収支」セクションの新規カード「前期間比較」。
//
//   前期間比較                                    7月 → 8月
//   収支                                    ¥45,717
//                                7月 ¥42,517  ▲+¥3,200
//   [======================grey===][====blue====]      ← ミニバー（前期間 / 今期間）
//   売上 / 利益率 / 販売件数 / 1件あたり利益 も同じ並び（利益率だけミニバーなし。
//   1件あたり利益は今期・前期のどちらかが 0 件だと算出できないのでミニバーも出さない）
//
// **今期の実額を主役**にする（20px・右上段）。前期間比較の分は小さく 1 行にまとめて右寄せ ──
// 「実額 → 差分」の順で読めるようにするため（実額を毎回読み比べさせない）。
// 計算（何と比べるか・差分の値）は logic/periodComparison.ts に閉じ、ここは文字列と色に変換するだけ。
import { StyleSheet, Text, View } from 'react-native';

import {
  amountPlaceholder,
  periodComparisonAmountDiffText,
  periodComparisonCountDiffText,
  recordCountValue,
  periodComparisonRateDiffText,
  perRecordProfitLabel,
  periodComparisonEmptyText,
  periodComparisonTitle,
  profitRateLabel,
  soldCountLabel,
  totalProfitLabel,
  totalSalesLabel,
} from '@/logic/labels';
import { formatYenSymbol } from '@/logic/format';
import type {
  ComparisonAmountRow,
  ComparisonPerRecordProfitRow,
  PeriodComparisonMetrics,
} from '@/logic/periodComparison';
import { useLocale } from '@/settings';
import { useThemeColors } from '@/theme';

type Props = {
  /** 見出し脇の期間ラベル「7月 → 8月」 */
  label: string;
  /** 各行の比較対象側に添える短いラベル「7月」 */
  previousLabel: string;
  /** 比較対象に売却済み記録が 1 件も無ければ null（periodComparisonEmptyText(locale) を出す） */
  metrics: PeriodComparisonMetrics | null;
};

export function PeriodComparisonCard({ label, previousLabel, metrics }: Props) {
  // 表示語は locale を引数に取る（渡さないと React Compiler が初回の文字列で固定する。
  // src/i18n/index.ts の冒頭）。この購読で言語を変えたときに引き直される
  const locale = useLocale();

  const colors = useThemeColors();

  return (
    <View style={[styles.card, { backgroundColor: colors.secondaryBackground }]}>
      <View style={styles.headRow}>
        <Text style={[styles.title, { color: colors.label }]}>{periodComparisonTitle(locale)}</Text>
        <Text style={[styles.periodLabel, { color: colors.secondaryLabel }]}>{label}</Text>
      </View>

      {metrics == null ? (
        <Text style={[styles.emptyText, { color: colors.secondaryLabel }]}>
          {periodComparisonEmptyText(locale)}
        </Text>
      ) : (
        <>
          <AmountRow
            label={totalProfitLabel(locale)}
            row={metrics.netProfit}
            previousLabel={previousLabel}
            positiveColor={colors.green}
            negativeColor={colors.red}
            barColor={colors.blue}
          />
          <View style={[styles.divider, { backgroundColor: colors.separator }]} />
          <AmountRow
            label={totalSalesLabel(locale)}
            row={metrics.sales}
            previousLabel={previousLabel}
            positiveColor={colors.green}
            negativeColor={colors.red}
            barColor={colors.blue}
          />
          <View style={[styles.divider, { backgroundColor: colors.separator }]} />
          <RateRow label={profitRateLabel(locale)} previousLabel={previousLabel} metrics={metrics} />
          <View style={[styles.divider, { backgroundColor: colors.separator }]} />
          <AmountRow
            label={soldCountLabel(locale)}
            row={metrics.recordCount}
            previousLabel={previousLabel}
            valueText={(value) => recordCountValue(locale, value)}
            diffText={(diff) => periodComparisonCountDiffText(locale, diff)}
            positiveColor={colors.green}
            negativeColor={colors.red}
            barColor={colors.blue}
          />
          <View style={[styles.divider, { backgroundColor: colors.separator }]} />
          <PerRecordProfitRow
            label={perRecordProfitLabel(locale)}
            row={metrics.perRecordProfit}
            previousLabel={previousLabel}
            positiveColor={colors.green}
            negativeColor={colors.red}
            barColor={colors.blue}
          />
        </>
      )}
    </View>
  );
}

type AmountRowProps = {
  label: string;
  row: ComparisonAmountRow;
  previousLabel: string;
  /** 既定は円表示（formatYenSymbol）。件数行だけ差し替える */
  valueText?: (value: number) => string;
  /** 既定は円の差分（periodComparisonAmountDiffText）。件数行だけ差し替える */
  diffText?: (diff: number) => string;
  positiveColor: string;
  negativeColor: string;
  barColor: string;
};

function AmountRow({
  label,
  row,
  previousLabel,
  valueText = formatYenSymbol,
  diffText = periodComparisonAmountDiffText,
  positiveColor,
  negativeColor,
  barColor,
}: AmountRowProps) {
  const colors = useThemeColors();
  const diffColor = row.diff >= 0 ? positiveColor : negativeColor;

  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, { color: colors.secondaryLabel }]}>{label}</Text>
      <Text style={[styles.currentValue, { color: colors.label }]} numberOfLines={1}>
        {valueText(row.current)}
      </Text>
      <Text style={[styles.diffLine, { color: colors.secondaryLabel }]} numberOfLines={1}>
        {previousLabel} {valueText(row.previous)}{' '}
        <Text style={{ color: diffColor }}>{diffText(row.diff)}</Text>
      </Text>
      <View style={[styles.barTrack, { backgroundColor: colors.separator }]}>
        <View style={[styles.bar, { width: `${row.previousRatio * 100}%`, backgroundColor: colors.gray }]} />
      </View>
      <View style={[styles.barTrack, { backgroundColor: colors.separator }]}>
        <View style={[styles.bar, { width: `${row.currentRatio * 100}%`, backgroundColor: barColor }]} />
      </View>
    </View>
  );
}

function RateRow({
  label,
  previousLabel,
  metrics,
}: {
  label: string;
  previousLabel: string;
  metrics: PeriodComparisonMetrics;
}) {
  // 表示語は locale を引数に取る（渡さないと React Compiler が初回の文字列で固定する。
  // src/i18n/index.ts の冒頭）。この購読で言語を変えたときに引き直される
  const locale = useLocale();

  const colors = useThemeColors();
  const { current, previous, diffPt } = metrics.profitRate;
  const diffColor = diffPt == null || diffPt >= 0 ? colors.green : colors.red;

  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, { color: colors.secondaryLabel }]}>{label}</Text>
      <Text style={[styles.currentValue, { color: colors.label }]} numberOfLines={1}>
        {current == null ? amountPlaceholder(locale) : `${current.toFixed(1)}%`}
      </Text>
      <Text style={[styles.diffLine, { color: colors.secondaryLabel }]} numberOfLines={1}>
        {previousLabel} {previous == null ? amountPlaceholder(locale) : `${previous.toFixed(1)}%`}{' '}
        <Text style={{ color: diffColor }}>{periodComparisonRateDiffText(locale, diffPt)}</Text>
      </Text>
    </View>
  );
}

/**
 * 1 件あたり利益（5 項目目・新規）。金額・件数と同じ形式（実額を大きく・差分を右寄せの 1 行・
 * ミニバー）だが、今期・前期のどちらかで件数が 0 なら periodProfitPerRecord が null を返すので
 * amountPlaceholder(locale)（「ーー」）にする（profitRate の null 表示と同じ扱い）。
 * その場合はミニバーも比べようがないので描かない。
 */
function PerRecordProfitRow({
  label,
  row,
  previousLabel,
  positiveColor,
  negativeColor,
  barColor,
}: {
  label: string;
  row: ComparisonPerRecordProfitRow;
  previousLabel: string;
  positiveColor: string;
  negativeColor: string;
  barColor: string;
}) {
  // 表示語は locale を引数に取る（渡さないと React Compiler が初回の文字列で固定する。
  // src/i18n/index.ts の冒頭）。この購読で言語を変えたときに引き直される
  const locale = useLocale();

  const colors = useThemeColors();
  const diffColor = row.diff == null ? colors.secondaryLabel : row.diff >= 0 ? positiveColor : negativeColor;
  const hasBars = row.current != null && row.previous != null;

  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, { color: colors.secondaryLabel }]}>{label}</Text>
      <Text style={[styles.currentValue, { color: colors.label }]} numberOfLines={1}>
        {row.current == null ? amountPlaceholder(locale) : formatYenSymbol(row.current)}
      </Text>
      <Text style={[styles.diffLine, { color: colors.secondaryLabel }]} numberOfLines={1}>
        {previousLabel} {row.previous == null ? amountPlaceholder(locale) : formatYenSymbol(row.previous)}{' '}
        <Text style={{ color: diffColor }}>
          {row.diff == null ? amountPlaceholder(locale) : periodComparisonAmountDiffText(row.diff)}
        </Text>
      </Text>
      {hasBars && (
        <>
          <View style={[styles.barTrack, { backgroundColor: colors.separator }]}>
            <View
              style={[styles.bar, { width: `${row.previousRatio * 100}%`, backgroundColor: colors.gray }]}
            />
          </View>
          <View style={[styles.barTrack, { backgroundColor: colors.separator }]}>
            <View style={[styles.bar, { width: `${row.currentRatio * 100}%`, backgroundColor: barColor }]} />
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
    borderRadius: 12,
    gap: 14,
  },
  headRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
  },
  periodLabel: {
    fontSize: 13,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 8,
  },
  row: {
    gap: 4,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
  },
  rowLabel: {
    fontSize: 13,
  },
  currentValue: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'right',
  },
  diffLine: {
    fontSize: 12,
    textAlign: 'right',
  },
  barTrack: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  bar: {
    height: '100%',
    borderRadius: 2,
  },
});
