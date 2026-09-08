// 開発用: 「すべて」タブ（お知らせ画面）の動作確認用に、通知履歴へダミーの行を積む
// （__DEV__ 専用。settings/index.tsx から require で読む。理由は DevSeedCard.tsx 冒頭）。
//
// **出品滞留アラートの行は、実在する出品中の記録から数件借りて作る。** 行をタップしたときに
// 本物の損益分岐点画面へ遷移できないと、削除・「今後知らせない」の動作確認にならないため。
// 出品中の記録が1件も無ければ何もしない。

import { randomUUID } from 'expo-crypto';

import { repository } from '@/db/client';
import { toDbDate } from '@/db/dates';
import { appendNotificationHistory, type NotificationHistoryEntry } from '@/settings';

const DAY_MS = 24 * 60 * 60 * 1000;

/** N日前の Date（時刻は 9:00 に揃える。実際の毎朝の通知と同じ時刻感） */
function daysAgo(days: number): Date {
  const date = new Date(Date.now() - days * DAY_MS);
  date.setHours(9, 0, 0, 0);
  return date;
}

/** 先月の月キー "YYYY-MM"（logic/notifications.ts の previousMonthKey と同じ計算） */
function previousMonthKey(today: Date): string {
  const prev = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * 「すべて」タブ用のダミー履歴を投入する。戻り値は追加した件数
 * （出品中の記録が1件も無ければ 0）。
 *
 * **出品滞留アラートの行は日付をずらして複数件作る**（今日・1日前・2日前…）ので、
 * 「すべて」タブで新しい順に並んでいるか、長押しの無視、行タップでの削除も一通り試せる。
 * 月次振り返りも1件混ぜて、種類の混在（listingAlert / monthlyReview）も確認できるようにする。
 */
export function insertNotificationHistorySeed(): number {
  const unsold = repository.filteredRecords({ isSoldMode: false }, 'saleDateDesc').slice(0, 5);
  if (unsold.length === 0) return 0;

  const listingAlertEntries: NotificationHistoryEntry[] = unsold.map((record, index) => ({
    id: randomUUID(),
    kind: 'listingAlert',
    recordId: record.id,
    itemName: record.itemName,
    days: 14 + index * 7, // 14, 21, 28…とずらして値の違いも見せる
    occurredAt: toDbDate(daysAgo(index)),
  }));

  const monthlyReviewEntry: NotificationHistoryEntry = {
    id: randomUUID(),
    kind: 'monthlyReview',
    monthKey: previousMonthKey(new Date()),
    totalNetProfit: 12345,
    occurredAt: toDbDate(daysAgo(unsold.length)),
  };

  // appendNotificationHistory は毎回「新しい順の先頭」に足す実装（settings/index.ts）なので、
  // 古い方から呼ばないと最終的な並びが逆になる。ここで一番古い（monthlyReview）→
  // 一番新しい（index 0 の listingAlert）の順に呼ぶ
  const entries = [monthlyReviewEntry, ...[...listingAlertEntries].reverse()];
  entries.forEach((entry) => appendNotificationHistory(entry));

  return entries.length;
}
