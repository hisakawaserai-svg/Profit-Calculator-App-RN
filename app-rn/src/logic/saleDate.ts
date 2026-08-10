// 売れた日（saleDate）の選択範囲と初期値（UI-SPEC §8.5）。
//
// 選べるのは [出品日, 今日] の暦日。範囲外はピッカー側で選択不可にする（選ばせてから叱らない）。
//   - 今日より後: まだ起きていない販売日は入らない
//   - 出品日より前: 出品前に売れることはなく、経過日数（§5-2）が負になる
//
// 出品日が未来の記録（saleStartDate > 今日）では範囲が空になってしまうので、上限を出品日まで
// 押し上げる。この場合「売れた」を押したときに入る値も出品日になる（§8.5 派生決定 3）。
//
// 判定はすべて暦日（listingDays.daysBetween）で行う。時刻まで見ると「同じ日なのに範囲外」が
// 起きて、経過日数の数え方（§5-2）とも食い違うため。

import { daysBetween } from './listingDays';

/** 日付ピッカーに渡す選択範囲。両端を含む */
export type DateRange = { min: Date; max: Date };

/** 片側だけの制限も受け付ける形（DateField の minDate / maxDate はどちらも省略できる） */
export type PartialDateRange = { min?: Date; max?: Date };

/** 売れた日の選択範囲 [出品日, 今日]（UI-SPEC §8.5） */
export function saleDateRange(saleStartDate: Date, today: Date): DateRange {
  return {
    min: saleStartDate,
    // 出品日が未来なら「今日」は下限より前になる。範囲が空にならないよう上限を出品日に合わせる
    max: daysBetween(saleStartDate, today) < 0 ? saleStartDate : today,
  };
}

/**
 * 範囲に収めた日付。時刻は元の値から引き継ぐ（日付だけを選ぶ欄なので。DateField と同じ扱い）。
 * 範囲外の保存済みデータを**表示**するときには使わない（§8.5「表示を偽らない」）。
 */
export function clampToRange(value: Date, range: PartialDateRange): Date {
  if (range.min != null && daysBetween(value, range.min) > 0) return withDatePart(value, range.min);
  if (range.max != null && daysBetween(range.max, value) > 0) return withDatePart(value, range.max);
  return value;
}

/**
 * 「売れた」を押した時点で入る日付（UI-SPEC §8.1 / §8.5 派生決定 3）。
 * 通常は今日。出品日が未来のときだけ出品日（今日を入れると自分の制約を破るため）。
 */
export function initialSaleDate(saleStartDate: Date, today: Date): Date {
  return clampToRange(today, saleDateRange(saleStartDate, today));
}

/** source の時刻に datePart の年月日を載せた Date */
function withDatePart(source: Date, datePart: Date): Date {
  return new Date(
    datePart.getFullYear(),
    datePart.getMonth(),
    datePart.getDate(),
    source.getHours(),
    source.getMinutes(),
    source.getSeconds(),
    source.getMilliseconds(),
  );
}
