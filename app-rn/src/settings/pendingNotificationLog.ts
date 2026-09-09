// 予約した OS 通知のうち、まだ「すべて」タブの履歴に記録していない分（保留中）。
//
// **なぜ「予約した瞬間」に履歴へ記録しないか。** rescheduleNotification は AppState の
// background 遷移のたびに走る（ホーム画面に戻る・他アプリへ切り替える等、日常的に何度も
// 起きる）が、実際に OS 通知が届くのは次の 9:00 だけ。予約した瞬間に履歴へ記録すると、
// 「まだ1通も届いていないのに、バックグラウンドへ送るたびに履歴だけ先に積み上がる」
// 「届く前から『すべて』タブに出る」「一度記録された時点でテスト通知が『対象なし』に
// なる」という食い違いが起きる（実機で発覚: 2026-09）。
//
// ここでは「次に予約した OS 通知の内容」を凍結して持っておくだけにし、
// scheduler.ts の rescheduleNotification が次に走ったとき（アプリ起動・background 遷移の
// たび）に「予約時刻(scheduledFor)をもう過ぎているか」を見て、過ぎていれば
// そこで初めて履歴（notificationHistory）へ記録する。過ぎていなければ据え置く。
//
// 1件しか持たない（新しい予約が来れば丸ごと上書き） ── 実際の OS 通知も
// DAILY_NOTIFICATION_IDENTIFIER 固定で同じ枠を上書きし続ける方式なので、それに合わせる。

/** kv-store のキー。値は PendingNotificationLog | null を JSON にしたもの */
export const PENDING_NOTIFICATION_LOG_KEY = 'pendingNotificationLog';

export type PendingNotificationLog =
  | {
      kind: 'listingAlert';
      items: readonly { recordId: string; itemName: string; days: number }[];
      /** 予約した OS 通知の発火予定時刻（toDbDate 形式）。これを過ぎたら履歴へ記録する */
      scheduledFor: string;
    }
  | {
      kind: 'monthlyReview';
      monthKey: string;
      totalNetProfit: number;
      scheduledFor: string;
    };

function isPendingNotificationLog(value: unknown): value is PendingNotificationLog {
  if (typeof value !== 'object' || value == null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.scheduledFor !== 'string') return false;
  if (v.kind === 'listingAlert') {
    return (
      Array.isArray(v.items) &&
      v.items.every(
        (item: unknown) =>
          typeof item === 'object' &&
          item != null &&
          typeof (item as Record<string, unknown>).recordId === 'string' &&
          typeof (item as Record<string, unknown>).itemName === 'string' &&
          typeof (item as Record<string, unknown>).days === 'number',
      )
    );
  }
  if (v.kind === 'monthlyReview') {
    return typeof v.monthKey === 'string' && typeof v.totalNetProfit === 'number';
  }
  return false;
}

/** 保存されている値を読める形にする。形が違えば null にする（読めない値で落ちない） */
export function normalizePendingNotificationLog(
  value: string | null | undefined,
): PendingNotificationLog | null {
  if (typeof value !== 'string') return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return isPendingNotificationLog(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
