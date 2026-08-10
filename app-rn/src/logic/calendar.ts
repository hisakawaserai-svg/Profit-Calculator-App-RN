// カレンダー形式の日付ピッカーの盤面（UI-SPEC §8.10）。
//
// 方針は「**選択肢を消すのではなく、出したうえで選べないと分かる形にする**」。
// 旧実装（ホイールから範囲外の年月日を外す）は選択肢そのものを消していたため、
// 利用者に「過去に入力した内容しか出てこない」と誤解された。回しても出てこない欠落は、
// 制約なのか不具合なのか入力履歴なのかを区別できない。盤面は月の全日を必ず返し、
// 選べるかどうかは selectable のフラグで伝える（描く側が淡くする）。
//
// 週の始まりは**日曜固定**。ロケールで振らない ── 本アプリは日本語のみ・日本の利用者向け（§0）。
//
// 判定はすべて暦日（listingDays.daysBetween）で行う。時刻まで見ると「同じ日なのに範囲外」が
// 起きて、経過日数の数え方（§5-2）とも食い違うため（saleDate.ts と同じ理由）。

import { RELATIVE_DAY_LABELS } from './labels';
import { daysBetween } from './listingDays';
import type { PartialDateRange } from './saleDate';

/** 1 週の日数。盤面は必ずこの倍数のマスになる */
export const DAYS_PER_WEEK = 7;

/** 年月グリッドの列数（UI-SPEC §8.10.3。期間選択シートと同じ 4 列 × 3 行） */
export const MONTH_GRID_COLUMNS = 4;

const MONTHS_PER_YEAR = 12;

/**
 * 範囲の片側が開いているときに年月グリッドへ出す年の幅（前後 5 年。決定 §7-12）。
 * 出品日の欄は過去に下限がないので、どこかで打ち切らないとグリッドが無限に伸びる。
 */
export const YEAR_GRID_SPAN = 5;

/** 盤面の 1 マス。月の外側の埋めマスは null で表す（CalendarWeek を参照） */
export type CalendarDay = {
  /** その日の 0:00。書き戻すときの時刻は呼び出し側が元の値から引き継ぐ */
  date: Date;
  /** 日にち（1〜31） */
  day: number;
  /** 選べるか（範囲内か）。false のマスは淡く出すだけで、盤面からは消さない（§8.10） */
  selectable: boolean;
  /** 今日（印を出す） */
  isToday: boolean;
  /** 出品日（小さな旗を出す） */
  isFlagged: boolean;
  /** いま選ばれている日 */
  isSelected: boolean;
};

/**
 * 盤面の 1 週。前後の月にはみ出すマスは null（**隣の月の日付を出さない**）。
 * 淡い表示は「選べない」の意味に取ってあるので、月外の日を淡く出すと意味が二重になる。
 */
export type CalendarWeek = readonly (CalendarDay | null)[];

/** その月の 1 日 0:00 */
export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

/** offset か月ずらした月の 1 日（負で前の月） */
export function shiftMonth(month: Date, offset: number): Date {
  return new Date(month.getFullYear(), month.getMonth() + offset, 1);
}

/** 範囲内か（両端を含む・暦日で判定）。範囲を渡さなければ全部選べる */
export function isDateSelectable(date: Date, range: PartialDateRange = {}): boolean {
  if (range.min != null && daysBetween(date, range.min) > 0) return false;
  if (range.max != null && daysBetween(range.max, date) > 0) return false;
  return true;
}

/**
 * 月の盤面。日曜始まりの週の配列で、**月の全日**が必ず入る（§8.10）。
 *
 * @param month    表示する月（その月のどの日を渡してもよい）
 * @param range    選べる範囲。省略した側は制限なし
 * @param today    「今日」の基準。印を出す日
 * @param flagged  小さな旗を出す日（売れた日のピッカーでは出品日）
 * @param selected いま選ばれている日
 */
export function monthGrid({
  month,
  range = {},
  today,
  flagged,
  selected,
}: {
  month: Date;
  range?: PartialDateRange;
  today?: Date | null;
  flagged?: Date | null;
  selected?: Date | null;
}): CalendarWeek[] {
  const first = startOfMonth(month);
  const cells: (CalendarDay | null)[] = [];

  // 1 日の曜日ぶんだけ頭を空ける（getDay は 0 = 日曜なので、そのまま日曜始まりの列数になる）
  for (let i = 0; i < first.getDay(); i += 1) cells.push(null);

  for (let day = 1; day <= daysInMonth(first); day += 1) {
    const date = new Date(first.getFullYear(), first.getMonth(), day);
    cells.push({
      date,
      day,
      selectable: isDateSelectable(date, range),
      isToday: today != null && daysBetween(date, today) === 0,
      isFlagged: flagged != null && daysBetween(date, flagged) === 0,
      isSelected: selected != null && daysBetween(date, selected) === 0,
    });
  }

  // 最終週も 7 マスに揃える。行ごとのマスの幅が週で変わらないようにするため
  while (cells.length % DAYS_PER_WEEK !== 0) cells.push(null);

  const weeks: CalendarWeek[] = [];
  for (let i = 0; i < cells.length; i += DAYS_PER_WEEK) {
    weeks.push(cells.slice(i, i + DAYS_PER_WEEK));
  }
  return weeks;
}

/**
 * その月に選べる日が 1 日でもあるか。月送りの矢印（§8.10.2）と年月グリッドのマス（§8.10.3）が
 * どちらもこの判定を使う ── 同じ「その月へ行けるか」を 2 通りに実装しない。
 */
export function isMonthSelectable(month: Date, range: PartialDateRange = {}): boolean {
  const target = startOfMonth(month).getTime();
  if (range.min != null && target < startOfMonth(range.min).getTime()) return false;
  if (range.max != null && startOfMonth(range.max).getTime() < target) return false;
  return true;
}

/**
 * 隣の月へ動かせるか（UI-SPEC §5-14 の月バーと同じ考え方 ── 選べる日が 1 日もない月には行かせない）。
 * 範囲の外へ出る矢印は無効にする。盤面の中の「選べない日」は淡く出すが、
 * **選べる日が皆無の月**まで見せても読む物がない。
 */
export function canShiftMonth(
  month: Date,
  offset: number,
  range: PartialDateRange = {},
): boolean {
  return isMonthSelectable(shiftMonth(month, offset), range);
}

/**
 * 行とシートの上部に常設するチップ（UI-SPEC §8.10.1）。
 * 「今日 → 昨日 → 一昨日」の**固定の並び**で、多数派の日付をシートを開かずに 1 タップで決める。
 *
 * **範囲外のチップは落とさず、選べないことが分かる形で残す**（§8.10 の方針 3）── 落とすと
 * 並びが日によって変わり、「昨日」を押したつもりで「一昨日」を押す事故が起きる。
 *
 * 日付は today の**時刻を引き継いだ**まま日だけを戻す。チップで選んだ値も日付そのもの（§8.10.1）。
 */
export type DayChip = {
  /** 「今日」「昨日」「一昨日」 */
  label: string;
  /** 今日から遡る日数（0 = 今日） */
  offset: number;
  date: Date;
  /** 選べるか。false のチップは淡色にして押せなくする（消さない） */
  selectable: boolean;
  isSelected: boolean;
};

export function dayChips({
  today,
  range = {},
  selected,
}: {
  today: Date;
  range?: PartialDateRange;
  selected?: Date | null;
}): DayChip[] {
  return RELATIVE_DAY_LABELS.map((label, offset) => {
    const date = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate() - offset,
      today.getHours(),
      today.getMinutes(),
      today.getSeconds(),
      today.getMilliseconds(),
    );

    return {
      label,
      offset,
      date,
      selectable: isDateSelectable(date, range),
      isSelected: selected != null && daysBetween(date, selected) === 0,
    };
  });
}

/** 年月グリッドの 1 マス（UI-SPEC §8.10.3） */
export type MonthCell = {
  /** 1〜12 */
  month: number;
  /** その月の 1 日 0:00。押すとこの月の盤面へ戻る */
  date: Date;
  /** 選べる日が 1 日でもあるか。false は淡色で押せない（盤面と同じ規則。消さない） */
  selectable: boolean;
  /** いま盤面に出ている月 */
  isCurrent: boolean;
};

/** 年月グリッドの 1 年ぶん。年見出し＋ 1〜12 月（UI-SPEC §8.10.3） */
export type YearBlock = { year: number; months: MonthCell[] };

/**
 * 年月グリッドの候補（UI-SPEC §8.10.3）。**◀ の連打を避けるための導線**なので、
 * 数か月前・去年へ月送りを繰り返さずに移れるところまでを出す。
 *
 * 期間選択シート（§1.2 の月グリッド）に揃えて**年は降順・新しい年が上**、
 * 各年は 1〜12 月をすべて並べる（範囲外の月も枠としては出し、淡色で選べなくする）。
 *
 * 範囲の片側が開いている欄（出品日は過去に下限がない）は YEAR_GRID_SPAN 年で打ち切る。
 * 表示中の月はどんな範囲でも必ずグリッドに含める ── いま見ている月がグリッドに無いと、
 * 開いた瞬間に自分の居場所を見失う。
 */
export function yearMonthGrid({
  displayed,
  range = {},
  span = YEAR_GRID_SPAN,
}: {
  displayed: Date;
  range?: PartialDateRange;
  span?: number;
}): YearBlock[] {
  const displayedYear = displayed.getFullYear();
  const newest = Math.max(range.max?.getFullYear() ?? displayedYear + span, displayedYear);
  const oldest = Math.min(range.min?.getFullYear() ?? displayedYear - span, displayedYear);

  const blocks: YearBlock[] = [];
  for (let year = newest; year >= oldest; year -= 1) {
    const months: MonthCell[] = [];
    for (let month = 1; month <= MONTHS_PER_YEAR; month += 1) {
      const date = new Date(year, month - 1, 1);
      months.push({
        month,
        date,
        selectable: isMonthSelectable(date, range),
        isCurrent: year === displayedYear && month === displayed.getMonth() + 1,
      });
    }
    blocks.push({ year, months });
  }
  return blocks;
}

/** その年月の日数（翌月 0 日 = 当月の末日） */
function daysInMonth(month: Date): number {
  return new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
}
