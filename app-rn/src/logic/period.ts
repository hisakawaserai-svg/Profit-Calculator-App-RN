// 「表示する期間」の型と、その判定・変換（UI-SPEC §1.2 / SPEC.md §6.2）。純粋関数だけを置く。
//
// 期間は **3 値**:
//   | 値              | 意味     | 例         |
//   | null            | 全期間   | —          |
//   | "YYYY"（4 文字）| その 1 年 | "2025"     |
//   | "YYYY-MM"（7 文字）| その 1 か月 | "2025-08" |
//
// **文字列の長さを見て分岐してよいのはこのファイルの中だけ。** 画面・リポジトリは
// periodKind / isMonthPeriod / periodKeyLength などを通して読む ── 3 値になった時点で
// 「null かどうか」の 2 分岐がアプリ中に散っていると、年を足すたびに拾い漏れが出る。
//
// 保存形式が "YYYY-MM-DDTHH:mm:ss.SSS"（db/dates.ts）で先頭から年・月・日と並ぶので、
// **期間キーはそのまま日付の先頭一致**になる（periodKeyLength → SQL の substr の長さ）。
// 年を足しても DB 側の条件の形は変わらない（db/repository.ts の periodKeySql）。

/** 期間キー。null = 全期間 / "YYYY" = 年 / "YYYY-MM" = 月 */
export type Period = string | null;

/** 期間の種類。画面はこの 3 値で分岐する（文字列の長さは見ない） */
export type PeriodKind = 'all' | 'year' | 'month';

/** 年キー "YYYY" の文字数 */
const YEAR_KEY_LENGTH = 4;
/** 月キー "YYYY-MM" の文字数 */
const MONTH_KEY_LENGTH = 7;

/** 期間の種類。**長さで見分けてよい唯一の場所** */
export function periodKind(period: Period): PeriodKind {
  if (period == null) return 'all';
  return period.length === YEAR_KEY_LENGTH ? 'year' : 'month';
}

export function isAllPeriod(period: Period): boolean {
  return periodKind(period) === 'all';
}

export function isYearPeriod(period: Period): boolean {
  return periodKind(period) === 'year';
}

export function isMonthPeriod(period: Period): boolean {
  return periodKind(period) === 'month';
}

/** 年 → 年キー "YYYY"（期間シートの年見出しが作る値） */
export function yearPeriod(year: number): string {
  return String(year);
}

/**
 * 期間が属する年。全期間は null。
 * 年キーはその年、月キーは先頭 4 文字（固定長なので切り出しでよい）。
 */
export function periodYear(period: Period): number | null {
  if (period == null) return null;
  return Number(period.slice(0, YEAR_KEY_LENGTH));
}

/**
 * 期間キーが日付の先頭何文字と一致するか（SQL の `substr(日付, 1, n) = 期間`）。
 * 全期間は期間条件そのものを組まないので呼ばない（防御として 0）。
 */
export function periodKeyLength(period: Period): number {
  const kind = periodKind(period);
  if (kind === 'year') return YEAR_KEY_LENGTH;
  if (kind === 'month') return MONTH_KEY_LENGTH;
  return 0;
}

function toMonthKeyOf(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

/** 月キー "YYYY-MM" → その月の 1 日 0:00（ローカル）。月の加減算のためだけに使う */
function monthKeyStart(monthKey: string): Date {
  const [year, month] = monthKey.split('-').map(Number);
  return new Date(year, month - 1, 1);
}

/**
 * 月キーを delta か月ずらす（月バーの ◀ ▶。UI-SPEC §1.2）。
 * Date の月加算に任せるので年の繰り上がり・繰り下がりも自動で効く。
 *
 * **db/dates.ts から移してきた**（期間の型と同じ場所に置くため）。db → logic の向きでしか
 * 参照しない決まりなので、期間の変換を db 側に残すと logic から呼べない。
 */
export function shiftMonthKey(monthKey: string, delta: number): string {
  const date = monthKeyStart(monthKey);
  const shifted = new Date(date.getFullYear(), date.getMonth() + delta, 1);
  return toMonthKeyOf(shifted.getFullYear(), shifted.getMonth() + 1);
}

/**
 * 期間が覆う月の範囲（両端を含む月キー）。全期間は null。
 *
 * | 期間 | from | to |
 * |---|---|---|
 * | 月 "2025-08" | "2025-08" | "2025-08" |
 * | 年 "2025"    | "2025-01" | "2025-12" |
 *
 * 矢印の無効化（§5-14）も軸の範囲も、ここを通せば期間の種類で分岐せずに書ける。
 */
export function periodMonthRange(period: Period): { from: string; to: string } | null {
  const kind = periodKind(period);
  if (kind === 'all' || period == null) return null;
  if (kind === 'month') return { from: period, to: period };
  return { from: `${period}-01`, to: `${period}-12` };
}

/**
 * 表示中の期間を delta 個ぶん前後に動かす（月バーの ◀ ▶。UI-SPEC §1.2 / §5-14）。
 * **動く単位は期間の種類そのもの** ── 月を見ているなら前後の月、年を見ているなら前年・翌年。
 * 「表示されているものを 1 つ前後に動かす」と読めば、矢印の意味は 1 つのまま。
 * 全期間は動かす基準がないので null のまま（矢印も無効化されている）。
 */
export function shiftPeriod(period: Period, delta: number): Period {
  const kind = periodKind(period);
  if (kind === 'all' || period == null) return null;
  if (kind === 'month') return shiftMonthKey(period, delta);
  return yearPeriod(Number(period) + delta);
}

/**
 * 月バーの矢印を押せるか（UI-SPEC §5-14）。**期間の種類で規則を分けない。**
 *
 * - 前へ（delta < 0）: 期間の**先頭の月**がデータのある最古の月より後なら押せる
 *   （= それより前は必ず 0 件）。月なら最古の月で、年なら最古の年で無効になる。
 * - 次へ（delta > 0）: 期間の**末尾の月**が今月より前なら押せる
 *   （= 未来は選べない）。月なら今月で、年なら今年で無効になる。
 * - 全期間は両方とも無効（動かす基準の月がない）。
 *
 * 月キーは固定長なので大小比較はそのまま文字列比較でよい。
 */
export function canShiftPeriod(
  period: Period,
  delta: number,
  bounds: { earliestMonthKey: string | null; currentMonthKey: string },
): boolean {
  const range = periodMonthRange(period);
  if (range == null) return false;
  if (delta < 0) {
    return bounds.earliestMonthKey != null && range.from > bounds.earliestMonthKey;
  }
  return range.to < bounds.currentMonthKey;
}
