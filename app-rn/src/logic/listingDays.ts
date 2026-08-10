// 経過日数の算出（UI-SPEC §5-2）。
//
// 起点は saleStartDate（出品日）。日数 = 基準日 − 出品日 の**暦日差**で、出品日当日は 0 日。
//   - 売却済み: 基準日 = saleDate
//   - 出品中:   基準日 = 今日
//
// 時刻ではなく暦日で数えるのが要点。8/2 23:50 出品 → 8/3 00:10 販売は 1 日（0 日ではない）。
// 夏時間のある地域でも「暦日の差」を保つため、両端を 0:00 に落としてから割り、丸めて返す。

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** その日の 0:00（ローカル）。dates.ts の startOfDay と同じだが、logic 層から db 層を参照しないため再掲 */
function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

/**
 * 暦日の差（to − from）。同じ日なら 0、翌日なら 1。
 * 負の値もそのまま返す（基準日が出品日より前でも呼び出し側で判断できるように）。
 */
export function daysBetween(from: Date, to: Date): number {
  const diff = startOfDay(to).getTime() - startOfDay(from).getTime();
  // 夏時間の切替をまたぐと 23h / 25h の日ができるので、日数に丸めてから返す
  return Math.round(diff / MS_PER_DAY);
}

/**
 * レコードの経過日数（UI-SPEC §5-2）。
 * 売却済みは「出品 → 販売」の日数、出品中は「出品 → 今日」の日数。
 *
 * @param today 出品中のときの基準日。テストから固定日を渡せるように引数にしてある
 */
export function listingDays(
  record: { saleStartDate: Date; saleDate: Date | null },
  today: Date,
): number {
  const basis = record.saleDate ?? today;
  return daysBetween(record.saleStartDate, basis);
}
