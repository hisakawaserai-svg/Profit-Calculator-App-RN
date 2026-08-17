// データタブ「前期間比較」（収支セクション新規）の純粋ロジック。DB も React も触らない。
//
// 比較対象は選択中の期間で決まる（月バーで表示中の期間。logic/period.ts）:
//   - 月を選択中 → 前月
//   - 年を選択中 → 前年同期間（今年ならまだ来ていない月まで、去年側もそこで揃える）
//   - 全期間を選択中 → 比較の基準がないのでセクションごと非表示（呼び出し側が null を見て隠す）
//
// 集計そのものは既存の repository.analyticsSummary を対象期間だけずらして呼び直す
// （db/useRecords.ts）。ここでは「どの月範囲と比べるか」「実額から差分をどう出すか」だけを持つ。

import { periodProfitPerRecord, periodProfitRate } from './profit';
import { isAllPeriod, isMonthPeriod, periodYear, shiftMonthKey, type Period } from './period';

/** 前期間比較の対象範囲（AnalyticsFilter.monthKeyRange にそのまま渡せる形） */
export type PeriodComparisonQuery = {
  monthKeyRange: { from: string; to: string };
  /** 見出しに出す期間ラベル「7月 → 8月」「2025年1〜8月 → 2026年1〜8月」 */
  label: string;
  /** 各行の比較対象側に添える短いラベル「7月」「2025年1〜8月」 */
  previousLabel: string;
};

/**
 * 表示中の期間 → 比較対象の月範囲。全期間なら null（セクションごと非表示。呼び出し側の責務）。
 */
export function periodComparisonQuery(period: Period, today: Date): PeriodComparisonQuery | null {
  if (isAllPeriod(period)) return null;

  if (isMonthPeriod(period) && period != null) {
    const previousMonthKey = shiftMonthKey(period, -1);
    const currentMonth = Number(period.slice(5, 7));
    const previousMonth = Number(previousMonthKey.slice(5, 7));
    const previousLabel = `${previousMonth}月`;
    return {
      monthKeyRange: { from: previousMonthKey, to: previousMonthKey },
      label: `${previousLabel} → ${currentMonth}月`,
      previousLabel,
    };
  }

  // 年を選択中。今年ならまだ来ていない月まで軸を伸ばさない（chartSpan と同じ考え方）
  const year = periodYear(period) as number;
  const isCurrentYear = year === today.getFullYear();
  const endMonth = isCurrentYear ? today.getMonth() + 1 : 12;
  const previousYear = year - 1;

  const rangeSuffix = endMonth === 12 ? '' : `1〜${endMonth}月`;
  const currentLabel = `${year}年${rangeSuffix}`;
  const previousLabel = `${previousYear}年${rangeSuffix}`;

  return {
    monthKeyRange: { from: `${previousYear}-01`, to: `${previousYear}-${String(endMonth).padStart(2, '0')}` },
    label: `${previousLabel} → ${currentLabel}`,
    previousLabel,
  };
}

/** 金額・件数など「大小をミニバーで比べられる」行の比較結果 */
export type ComparisonAmountRow = {
  current: number;
  previous: number;
  diff: number;
  /** ミニバーの長さ（0〜1）。今期・前期のうち大きい方を 1 とした比率。両方 0 以下なら 0 */
  currentRatio: number;
  previousRatio: number;
};

function amountRow(current: number, previous: number): ComparisonAmountRow {
  const maxValue = Math.max(current, previous, 0);
  const ratio = (value: number) => (maxValue <= 0 ? 0 : Math.min(1, Math.max(0, value / maxValue)));
  return {
    current,
    previous,
    diff: current - previous,
    currentRatio: ratio(current),
    previousRatio: ratio(previous),
  };
}

/** 利益率の比較結果。売上合計が 0 の期間があると算出できないので null（periodProfitRate と同じ理由） */
export type ComparisonRateRow = {
  current: number | null;
  previous: number | null;
  /** ポイント差（current − previous）。どちらかが null なら null */
  diffPt: number | null;
};

function rateRow(
  currentSales: number,
  currentProfit: number,
  previousSales: number,
  previousProfit: number,
): ComparisonRateRow {
  const current = periodProfitRate(currentSales, currentProfit);
  const previous = periodProfitRate(previousSales, previousProfit);
  return {
    current,
    previous,
    diffPt: current == null || previous == null ? null : current - previous,
  };
}

/**
 * 1 件あたり純利益の比較結果。件数が 0（periodProfitPerRecord が null）の期間があると
 * 算出できないので null（profitRate と同じ理由）。**ミニバー付き**（金額・件数と同じ形式）
 * だが、どちらかが null のときは比べようがないので比率も 0 のまま返す（呼び出し側はバーを出さない）。
 */
export type ComparisonPerRecordProfitRow = {
  current: number | null;
  previous: number | null;
  /** 今期 − 前期。どちらかが null なら null */
  diff: number | null;
  currentRatio: number;
  previousRatio: number;
};

function perRecordProfitRow(
  currentProfit: number,
  currentCount: number,
  previousProfit: number,
  previousCount: number,
): ComparisonPerRecordProfitRow {
  const current = periodProfitPerRecord(currentProfit, currentCount);
  const previous = periodProfitPerRecord(previousProfit, previousCount);
  if (current == null || previous == null) {
    return { current, previous, diff: null, currentRatio: 0, previousRatio: 0 };
  }
  const { diff, currentRatio, previousRatio } = amountRow(current, previous);
  return { current, previous, diff, currentRatio, previousRatio };
}

export type PeriodComparisonMetrics = {
  netProfit: ComparisonAmountRow;
  sales: ComparisonAmountRow;
  profitRate: ComparisonRateRow;
  recordCount: ComparisonAmountRow;
  /** 5 項目目（新規）。既存の詳細行と同じ periodProfitPerRecord を対象期間だけずらして再利用する */
  perRecordProfit: ComparisonPerRecordProfitRow;
};

/** repository.analyticsSummary が返す形のうち、比較に使う 3 値だけ */
export type ComparisonSummaryInput = {
  totalNetProfit: number;
  totalSales: number;
  recordCount: number;
};

/**
 * 今期・前期の集計（analyticsSummary をそれぞれの期間で呼んだ結果）から比較行を組む。
 * **比較対象（前期）に売却済み記録が 1 件も無ければ null** ── 実額 0 と「データが無い」は
 * 意味が違う（0 件の月と比べて「▲+¥45,717」と出すと、あたかも前月も収支があったかのように読める）。
 * 呼び出し側はこの null を見て「比較対象のデータがありません」を出す。
 */
export function periodComparisonMetrics(
  current: ComparisonSummaryInput,
  previous: ComparisonSummaryInput,
): PeriodComparisonMetrics | null {
  if (previous.recordCount === 0) return null;
  return {
    netProfit: amountRow(current.totalNetProfit, previous.totalNetProfit),
    sales: amountRow(current.totalSales, previous.totalSales),
    profitRate: rateRow(current.totalSales, current.totalNetProfit, previous.totalSales, previous.totalNetProfit),
    recordCount: amountRow(current.recordCount, previous.recordCount),
    perRecordProfit: perRecordProfitRow(
      current.totalNetProfit,
      current.recordCount,
      previous.totalNetProfit,
      previous.recordCount,
    ),
  };
}
