// 通知履歴（お知らせ画面「すべて」タブ）。実際に組み立てた OS 通知の内容を、
// 届いた順にそのまま積む一覧。lastNotificationsCheckedAt / ignoredListingAlerts と同じく
// 設定というより端末の履歴だが、kv-store を触るのはここだけという規約に乗せるため
// settings/ に置く（詳しくは settings/index.ts の冒頭）。
//
// **件数の上限は 200 件（古い方から自動で切り捨てる）。** 期間（何年分残すか）で切ると、
// 出品ペース・通知頻度は利用者ごとに大きく違うため「何年分あれば十分か」を決められない。
// 件数で揃えれば、利用頻度に関わらず保存量が一定になる（合意: 2026-09）。

/** kv-store のキー。値はエントリ配列（新しい順）を JSON にしたもの */
export const NOTIFICATION_HISTORY_KEY = 'notificationHistory';

/** 保持する最大件数。超えた分は古い方から切り捨てる */
export const NOTIFICATION_HISTORY_LIMIT = 200;

/**
 * 「すべて」タブの1行ぶん。実際に OS 通知として送った内容の再現に要る値だけを持つ
 * （表示文言そのものは logic/labels.ts が組み立てる。ここはデータだけ）。
 *
 * **値を記録した瞬間の値のまま凍結する**（days・totalNetProfit）。あとから記録を編集しても、
 * 「その日実際に届いた通知には何と書いてあったか」という履歴の性質上、動かさない。
 *
 * **`hidden` は「すべて」タブの見た目からだけ消すためのフラグ**（長押し「今後
 * 知らせない」）。エントリ自体は物理削除しない ── `logic/notifications.ts` の
 * `notYetNotifiedListingAlertItems` / `alreadyLoggedToday` は、この履歴を「今の基準で
 * 一度でも知らせたか」の記録として使っており、物理削除すると同じ記録がすぐ再び
 * OS 通知の対象に戻ってしまう（実機で発覚: 2026-09。行を確認しただけで、次にアプリを
 * 開閉すると同じ商品の通知が即座に再送されるという不具合だった）。
 * 行タップでは消さない（届いた通知の見返し）。表示側（NotificationsScreen）だけが
 * `hidden` を見てフィルタする。
 */
export type NotificationHistoryEntry =
  | {
      id: string;
      kind: 'listingAlert';
      recordId: string;
      itemName: string;
      /** 通知した時点の経過日数（しきい値ちょうど。logic/notifications.ts 参照） */
      days: number;
      occurredAt: string;
      /** 未読。新しい履歴は true。古い保存分に無い場合は既読扱い */
      unread?: boolean;
      hidden?: boolean;
    }
  | {
      id: string;
      kind: 'monthlyReview';
      monthKey: string;
      totalNetProfit: number;
      occurredAt: string;
      unread?: boolean;
      hidden?: boolean;
    };

function isNotificationHistoryEntry(value: unknown): value is NotificationHistoryEntry {
  if (typeof value !== 'object' || value == null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.id !== 'string' || typeof v.occurredAt !== 'string') return false;
  if (v.kind === 'listingAlert') {
    return (
      typeof v.recordId === 'string' && typeof v.itemName === 'string' && typeof v.days === 'number'
    );
  }
  if (v.kind === 'monthlyReview') {
    return typeof v.monthKey === 'string' && typeof v.totalNetProfit === 'number';
  }
  return false;
}

/** 保存されている値を読める形にする。形が違えば空配列にする（読めない値で落ちない） */
export function normalizeNotificationHistory(value: string | null | undefined): NotificationHistoryEntry[] {
  if (typeof value !== 'string') return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isNotificationHistoryEntry);
  } catch {
    return [];
  }
}
