// 予約した OS 通知のうち、まだ「すべて」タブの履歴に記録していない分（保留中）。
//
// **なぜ「予約した瞬間」に履歴へ記録しないか。** rescheduleNotification は AppState の
// background 遷移のたびに走る（ホーム画面に戻る・他アプリへ切り替える等、日常的に何度も
// 起きる）が、実際に OS 通知が届くのは予約した 9:00 だけ。予約した瞬間に履歴へ記録すると、
// 「まだ1通も届いていないのに、バックグラウンドへ送るたびに履歴だけ先に積み上がる」
// 「届く前から『すべて』タブに出る」という食い違いが起きる（実機で発覚: 2026-09）。
//
// ここでは「いま OS に予約している内容」を凍結して持っておくだけにし、
// scheduler.ts が次に走ったとき（アプリ起動・background 遷移のたび）に
// 予約時刻(scheduledFor)をもう過ぎているか見て、過ぎていれば履歴へ記録する。
//
// **複数件持つ。** 到達日は商品（同じ暦日は 1 通にまとめたグループ）ごとに違う朝 9 時へ
// 予約し、月初の振り返りも別予約なので、1 件だけでは足りない。新しい予約一式で
// 丸ごと置き換える（差分マージはしない）。

/** kv-store のキー。値は PendingNotificationLog | null を JSON にしたもの */
export const PENDING_NOTIFICATION_LOG_KEY = 'pendingNotificationLog';

export type PendingNotificationLogEntry =
  | {
      kind: 'listingAlert';
      identifier: string;
      items: readonly { recordId: string; itemName: string; days: number }[];
      /** 予約した OS 通知の発火予定時刻（toDbDate 形式）。これを過ぎたら履歴へ記録する */
      scheduledFor: string;
    }
  | {
      kind: 'monthlyReview';
      identifier: string;
      monthKey: string;
      totalNetProfit: number;
      scheduledFor: string;
    };

/** いま予約している OS 通知。無いときは null（空配列は正規化で null に倒す） */
export type PendingNotificationLog = readonly PendingNotificationLogEntry[];

function isListingItems(
  value: unknown,
): value is readonly { recordId: string; itemName: string; days: number }[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item: unknown) =>
        typeof item === 'object' &&
        item != null &&
        typeof (item as Record<string, unknown>).recordId === 'string' &&
        typeof (item as Record<string, unknown>).itemName === 'string' &&
        typeof (item as Record<string, unknown>).days === 'number',
    )
  );
}

function toPendingNotificationLogEntry(value: unknown): PendingNotificationLogEntry | null {
  if (typeof value !== 'object' || value == null) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.scheduledFor !== 'string') return null;
  const identifier = typeof v.identifier === 'string' ? v.identifier : '';
  if (v.kind === 'listingAlert' && isListingItems(v.items)) {
    return {
      kind: 'listingAlert',
      identifier: identifier || `listing-alert:${v.scheduledFor.slice(0, 10)}`,
      items: v.items,
      scheduledFor: v.scheduledFor,
    };
  }
  if (v.kind === 'monthlyReview' && typeof v.monthKey === 'string' && typeof v.totalNetProfit === 'number') {
    return {
      kind: 'monthlyReview',
      identifier: identifier || 'monthly-review',
      monthKey: v.monthKey,
      totalNetProfit: v.totalNetProfit,
      scheduledFor: v.scheduledFor,
    };
  }
  return null;
}

/** 保存されている値を読める形にする。形が違えば null にする（読めない値で落ちない） */
export function normalizePendingNotificationLog(
  value: string | null | undefined,
): PendingNotificationLog | null {
  if (typeof value !== 'string') return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed)) {
      const entries = parsed
        .map(toPendingNotificationLogEntry)
        .filter((entry): entry is PendingNotificationLogEntry => entry != null);
      return entries.length === 0 ? null : entries;
    }
    // 旧形式（1 件だけの object）。到達日予約に上げたあとでも端末に残っている分を拾う
    const single = toPendingNotificationLogEntry(parsed);
    return single == null ? null : [single];
  } catch {
    return null;
  }
}
