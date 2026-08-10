// データタブ（UI-SPEC §1.5 / 採用案 7b）の純粋ロジック。
// Y 軸レンジと軸ラベルの整形、そして「期間から刻みを決める」規則だけを持ち、DB も React も触らない。
// 集計そのものは repository（SQL の GROUP BY / SUM）の担当。
//
// 案 7b で切替が 3 つとも廃止されたため、この層からも対応する概念が消えている（§6-10）:
//   - 指標切替（売上金額 / 収支）  → MetricType / METRIC_TYPES
//   - 表示単位切替（明細/日別/月別/年別） → CHART_UNITS と 'record' / 'year'
//   - 期間指定（startDate / endDate と ◀▶ の平行移動） → Period / defaultPeriod / shiftPeriod
// 期間は月キー（または全期間）だけになり、刻みはそこから自動で決まる（§5-5）。

import { formatMonthDay, formatMonthTitle } from './format';

/**
 * グラフの刻み（UI-SPEC §5-5）。期間から自動で決まる 2 値。
 * 設計案 6b の 62 日規則は採らない（期間指定 UI そのものがないため働く場面がない）。
 */
export type ChartUnit = 'day' | 'month';

/**
 * 期間 → 刻み（UI-SPEC §5-5「月を選択 = 日ごと / 全期間 = 月ごと」）。
 * 画面に切替を出さないので、ここが刻みを決める唯一の場所になる。
 *
 * @param monthKey 表示中の月キー "YYYY-MM"。null = 全期間
 */
export function chartUnitFor(monthKey: string | null): ChartUnit {
  return monthKey == null ? 'month' : 'day';
}

/** SPEC §6.2 Y 軸上限 = max(1000, データ最大値) × 1.15 */
export function yAxisUpperBound(values: number[]): number {
  const maxValue = values.length === 0 ? 0 : Math.max(...values);
  return Math.max(1000, maxValue) * 1.15;
}

/**
 * Y 軸下限。
 * SPEC §6.2 が規定しているのは上限だけで、Swift 版の domain は 0...upper だった。
 * ただし純利益はマイナスになり得（§2.3）、0 始まりだとその点が軸下に隠れて読めないため、
 * 負値があるときだけ上限と同じ倍率で下へ広げる。負値がなければ Swift 版と同じ 0。
 */
export function yAxisLowerBound(values: number[]): number {
  const minValue = values.length === 0 ? 0 : Math.min(...values);
  return minValue < 0 ? minValue * 1.15 : 0;
}

/** X 軸ラベル（Swift 版 AxisValueLabel の書式） */
export function formatChartLabel(date: Date, unit: ChartUnit): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return unit === 'day'
    ? `${month}/${String(date.getDate()).padStart(2, '0')}`
    : `${date.getFullYear()}/${month}`;
}

/**
 * 選択した棒の見出しに出す日付（UI-SPEC §1.5-5「8月9日の記録　N件」）。
 * 刻みと同じ粒度で出す ── 月ごとの棒に日付まで出すと、実在しない「その月の 1 日」を
 * 指しているように読めるため。
 */
export function formatPointDate(date: Date, unit: ChartUnit): string {
  return unit === 'day' ? formatMonthDay(date) : formatMonthTitle(date);
}
