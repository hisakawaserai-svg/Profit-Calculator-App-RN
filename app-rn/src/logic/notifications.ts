// ベル通知（記録タブ）とローカル通知（OS）が共有する「何を出すか」の判定。純粋関数のみ、
// DB・React・Notifications SDK のいずれにも依存しない。
//
// **月次振り返りと出品滞留アラートは同時に出さない。** 月初(1日だけ)は月次振り返りを優先する
// ── 月が変わった当日だけの限定情報なので、滞留アラートより鮮度が高い。それ以外の期間は
// 滞留アラートだけを見る（滞留アラート自体は月をまたいでも対象が変わるだけで、常に「今」の状態）。
import { fromDbDate, toDbDate } from '@/db/dates';
import type { SaleRecord } from '@/db/schema';

import { listingDays } from './listingDays';
import { analyzePricing } from './pricing';

export type ListingAlertItem = {
  record: SaleRecord;
  /** 出品からの経過日数 */
  elapsedDays: number;
  /** 損益分岐点(目標があれば目標ライン)までの値下げ余地。0 以上 */
  discountRoom: number;
};

/**
 * 出品滞留アラートの対象（既定 14 日、設定で変更可）。
 *
 * **経過日数の基準は「値下げ（価格変更）してから」**（0013）。まだ一度も値下げしていない
 * 記録（`priceChangedAt === null`）は出品日を基準にする。「出品からの日数」のままだと、
 * しきい値を超え続けている間ずっと対象になり続けて日々通知が積み上がる ── 値下げを基準に
 * すれば、一度知らせたあとは実際に値下げするまで再び対象にならない（合意: 2026-09）。
 *
 * 抑制条件（対象から外す）:
 *   - `state === 'loss'`（既に損益分岐点以下。これ以上下げると赤字が広がるだけ）
 *   - `hasTarget && meetsTarget === false`（目標が設定済みで、既に目標ラインを下回っている）
 *
 * **records は呼び出し側で isSold = false に絞ってから渡すこと**（DB 側の SQL 条件で
 * 絞る方が、未売却の記録は全履歴よりずっと少ないぶん軽い。ここでは絞り直さない）。
 *
 * `ignoredRecordIds` はお知らせ画面の長押し「今後知らせない」で外した記録（settings の
 * ignoredListingAlerts）。ここで抑制条件と同列に弾く。
 *
 * 経過日数の降順（一番長く値下げしていないものを先頭に）で返す。
 */
export function listingAlertItems(
  records: readonly SaleRecord[],
  today: Date,
  thresholdDays: number,
  ignoredRecordIds: ReadonlySet<string>,
): ListingAlertItem[] {
  return records
    .map((record) => {
      const basisDate = fromDbDate(record.priceChangedAt ?? record.saleStartDate);
      const elapsedDays = listingDays({ saleStartDate: basisDate, saleDate: null }, today);
      const analysis = analyzePricing(record);
      return { record, elapsedDays, analysis };
    })
    .filter(
      ({ record, elapsedDays, analysis }) =>
        elapsedDays >= thresholdDays &&
        analysis.state !== 'loss' &&
        !(analysis.hasTarget && analysis.meetsTarget === false) &&
        !ignoredRecordIds.has(record.id),
    )
    .sort((a, b) => b.elapsedDays - a.elapsedDays)
    .map(({ record, elapsedDays, analysis }) => ({
      record,
      elapsedDays,
      discountRoom: analysis.room,
    }));
}

/**
 * 出品滞留アラートのうち、OS ローカル通知の対象に絞ったもの（ちょうど今日 thresholdDays に
 * 到達した記録だけ）。
 *
 * **ベル（アプリ内一覧）は `>=`（listingAlertItems）のまま、OS 通知だけこちらを使う。**
 * `>=` のままだと、値下げしていない記録は基準日（値下げ日 or 出品日）が動かないので、
 * しきい値を超えた翌日以降も毎日同じ記録が対象であり続け、日々の通知に積み上がって出続けて
 * しまう（合意: 2026-09、実機テストで「289日経過した商品が19件」という通知を見て発覚）。
 * OS 通知は「今日新たにしきい値へ到達した記録」だけを知らせ、それ以外（前からずっと
 * しきい値超えのままの記録）はベルを開いたときに気づいてもらう形にする。
 */
export function newlyEligibleListingAlertItems(
  items: readonly ListingAlertItem[],
  thresholdDays: number,
): ListingAlertItem[] {
  return items.filter((item) => item.elapsedDays === thresholdDays);
}

/** 月次振り返りを出す期間（月初1日だけ）。ローカルの暦日で判定する */
export function isMonthlyReviewActive(today: Date): boolean {
  return today.getDate() === 1;
}

/** 月次振り返りの対象月（先月）の月キー "YYYY-MM" */
export function previousMonthKey(today: Date): string {
  const prev = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
}

export type NotificationContent =
  | { kind: 'monthlyReview'; monthKey: string }
  | { kind: 'listingAlert'; items: readonly ListingAlertItem[] };

/**
 * ベル・ローカル通知の両方が使う「今なら何を出すか」。
 * @param unsoldRecords isSold = false に絞った記録（呼び出し側で用意する）
 * @param dismissedMonthlyReviewMonth 「先月の振り返り」を押して消した対象月（"YYYY-MM"）。
 *   まだ消していなければ null。対象月と一致するときだけ振り返りを抑え、滞留アラート側に回す
 *   （settings の dismissedMonthlyReview。押した瞬間にベルから消すため）
 */
export function currentNotification(
  unsoldRecords: readonly SaleRecord[],
  today: Date,
  listingAlertThresholdDays: number,
  ignoredRecordIds: ReadonlySet<string>,
  dismissedMonthlyReviewMonth: string | null,
): NotificationContent | null {
  if (isMonthlyReviewActive(today)) {
    const monthKey = previousMonthKey(today);
    if (monthKey !== dismissedMonthlyReviewMonth) {
      return { kind: 'monthlyReview', monthKey };
    }
  }

  const items = listingAlertItems(unsoldRecords, today, listingAlertThresholdDays, ignoredRecordIds);
  if (items.length === 0) return null;
  return { kind: 'listingAlert', items };
}

/** 通知履歴（お知らせ画面「すべて」タブ）の1件が指す対象。settings/notificationHistory.ts の
 *  NotificationHistoryEntry から id・occurredAt 等の記録専用フィールドを除いたもの */
export type NotificationHistoryTarget =
  | { kind: 'listingAlert'; recordId: string }
  | { kind: 'monthlyReview'; monthKey: string };

/**
 * 履歴に「今日、同じ対象をすでに記録済みか」を判定する（二重記録の防止）。
 *
 * `rescheduleNotification` は AppState の background 遷移のたびに呼ばれるため、
 * 同じ日にアプリを何度も出入りするだけで同じ「ちょうどしきい値」の記録・同じ月が
 * 繰り返し計算されうる。直近の履歴に、種類・対象・暦日がすべて一致するものが
 * 1件でもあれば記録済みとみなす。
 */
export function alreadyLoggedToday(
  history: readonly {
    kind: 'listingAlert' | 'monthlyReview';
    recordId?: string;
    monthKey?: string;
    occurredAt: string;
  }[],
  target: NotificationHistoryTarget,
  today: Date,
): boolean {
  const todayKey = toDbDate(today).slice(0, 10);
  return history.some((entry) => {
    if (entry.occurredAt.slice(0, 10) !== todayKey) return false;
    if (entry.kind !== target.kind) return false;
    return target.kind === 'listingAlert'
      ? entry.recordId === target.recordId
      : entry.monthKey === target.monthKey;
  });
}
