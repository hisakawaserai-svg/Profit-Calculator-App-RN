// 通知(記録タブのベル・ローカル通知)の全体オンオフのうち、保存先に依存しない部分。
// tutorialSeen.ts と同じ分け方(理由もそちら参照)。

/** kv-store のキー */
export const NOTIFICATIONS_ENABLED_KEY = 'notificationsEnabled';

/**
 * 保存されている値を読める形にする。未設定・想定外の値は false(オフ)に倒す ──
 * 新機能を既定でオンにして、断りなく通知権限を求めることは避ける(オプトイン)。
 */
export function normalizeNotificationsEnabled(value: string | null | undefined): boolean {
  return value === '1';
}
