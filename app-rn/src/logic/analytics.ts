// SPEC.md §6.2 DataView（分析グラフ）の純粋ロジック。
// 期間の既定値・平行移動・Y 軸レンジ・軸ラベルの整形だけを持ち、DB も React も触らない。
// 集計そのものは repository（SQL の GROUP BY / SUM）の担当。

import { formatRecordDate, formatRecordDateTime } from './format';

/** SPEC §6.2 の表示単位。明細だけ丸めなし（レコードの販売日そのままがキー） */
export type ChartUnit = 'record' | 'day' | 'month' | 'year';

/** SPEC §6.2 の指標切替 */
export type MetricType = 'sales' | 'netProfit';

/** セグメント表示の並び順（Swift 版 ChartType.allCases と同じ） */
export const CHART_UNITS: ChartUnit[] = ['record', 'day', 'month', 'year'];

export const CHART_UNIT_LABELS: Record<ChartUnit, string> = {
  record: '明細',
  day: '日別',
  month: '月別',
  year: '年別',
};

/** セグメント表示の並び順（Swift 版 MetricType.allCases と同じ） */
export const METRIC_TYPES: MetricType[] = ['sales', 'netProfit'];

export const METRIC_LABELS: Record<MetricType, string> = {
  sales: '売上金額',
  netProfit: '純利益',
};

/** 集計対象の期間。null（= 全期間を表示）は呼び出し側で扱う */
export type Period = { startDate: Date; endDate: Date };

export type CalendarUnit = 'day' | 'month' | 'year';

/**
 * 期間リセット・◀▶ の平行移動で使う暦の単位（SPEC §6.2）。
 * 明細は日別と同じ「日」単位で動く（Swift 版 .record, .day: return .day）。
 */
const CALENDAR_UNIT: Record<ChartUnit, CalendarUnit> = {
  record: 'day',
  day: 'day',
  month: 'month',
  year: 'year',
};

/** 表示単位切替時に戻す期間の幅（SPEC §6.2: 明細/日別 = 7 日、月別 = 6 ヶ月、年別 = 4 年） */
const RESET_SPAN: Record<ChartUnit, number> = {
  record: 7,
  day: 7,
  month: 6,
  year: 4,
};

/**
 * 日 / 月 / 年の加算。
 * 月・年の加算は Swift の Calendar.date(byAdding:) と同じく、
 * 加算先の月に存在しない日はその月の末日へ丸める（例: 8/31 の 6 ヶ月前 → 2/28）。
 * JS の Date は月をまたいで繰り上がってしまう（2/31 → 3/3）ため、自前で丸める。
 */
export function addCalendarUnit(date: Date, unit: CalendarUnit, amount: number): Date {
  const [hours, minutes, seconds, ms] = [
    date.getHours(),
    date.getMinutes(),
    date.getSeconds(),
    date.getMilliseconds(),
  ];

  if (unit === 'day') {
    return new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate() + amount,
      hours,
      minutes,
      seconds,
      ms,
    );
  }

  const months = unit === 'month' ? amount : amount * 12;
  // 1 日に固定して月を動かし、繰り上がりを起こさずに年月だけを確定させる
  const target = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return new Date(
    target.getFullYear(),
    target.getMonth(),
    Math.min(date.getDate(), lastDay),
    hours,
    minutes,
    seconds,
    ms,
  );
}

/**
 * 表示単位に対応する既定の期間（SPEC §6.2）。
 * 初期表示と、表示単位を切り替えたときの自動リセットの両方で使う。
 * 終了日は常に「今」。
 */
export function defaultPeriod(unit: ChartUnit, now: Date = new Date()): Period {
  return {
    startDate: addCalendarUnit(now, CALENDAR_UNIT[unit], -RESET_SPAN[unit]),
    endDate: now,
  };
}

/** ◀▶ による単位ぶんの平行移動（SPEC §6.2）。開始・終了を同じ量だけ動かすので幅は変わらない */
export function shiftPeriod(period: Period, unit: ChartUnit, step: number): Period {
  const calendarUnit = CALENDAR_UNIT[unit];
  return {
    startDate: addCalendarUnit(period.startDate, calendarUnit, step),
    endDate: addCalendarUnit(period.endDate, calendarUnit, step),
  };
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
  switch (unit) {
    case 'record':
    case 'day':
      return `${month}/${String(date.getDate()).padStart(2, '0')}`;
    case 'month':
      return `${date.getFullYear()}/${month}`;
    case 'year':
      return `${date.getFullYear()}`;
  }
}

/**
 * 選択した集計点の見出し日付。
 * Swift 版は単位に関わらず「YYYY/MM/DD」固定だったが、それだと月別・年別で
 * 実在しない「その月の 1 日」を指しているように読め、明細では同じ日の複数点が
 * 区別できない。ここでは単位に合わせた粒度で出す。
 */
export function formatPointDate(date: Date, unit: ChartUnit): string {
  switch (unit) {
    case 'record':
      return formatRecordDateTime(date);
    case 'day':
      return formatRecordDate(date);
    case 'month':
      return `${date.getFullYear()}年${String(date.getMonth() + 1).padStart(2, '0')}月`;
    case 'year':
      return `${date.getFullYear()}年`;
  }
}
