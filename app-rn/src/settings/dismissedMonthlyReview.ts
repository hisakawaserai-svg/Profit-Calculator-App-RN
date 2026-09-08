// 「先月の振り返り」を、開いて対象月ぶんは消した記憶。lastNotificationsCheckedAt.ts と
// 同じ形 ── これも利用者が選ぶ設定値ではなく端末の履歴。
//
// **月キー（"YYYY-MM"）1つだけ持つ。** 振り返りは月初1日しか出さない（isMonthlyReviewActive）
// ので、「どの月ぶんを消したか」さえ覚えておけば、同じ月の間だけ消えていれば十分。
// 月が変われば previousMonthKey が変わるので、比較するだけで自然に「翌月はまた出る」になる。

/** kv-store のキー */
export const DISMISSED_MONTHLY_REVIEW_KEY = 'dismissedMonthlyReview';

/** 保存されている値を読める形にする。形が違えば「消していない」扱い（null）にする */
export function normalizeDismissedMonthlyReview(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  return /^\d{4}-\d{2}$/.test(value) ? value : null;
}
