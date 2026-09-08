// 「ベルを最後に開いた日」のうち、保存先に依存しない部分。lastBackupAt.ts と同じ形。
//
// **これは設定ではなく端末の履歴**（利用者が選ぶ値ではない）。未読ドットの判定にだけ使う ──
// 通知一覧そのものは毎回その場で計算するので、既読・未読を項目ごとに持つ必要はなく、
// 「最後に開いた日」1 つだけで足りる（同じ日にもう一度開けば消える、というだけの粒度）。

/** kv-store のキー */
export const LAST_NOTIFICATIONS_CHECKED_AT_KEY = 'lastNotificationsCheckedAt';

/**
 * 保存されている値を読める形にする。**形が違えば「無かったこと」にする**（null を返す）。
 * 形は DB と同じ "YYYY-MM-DDTHH:mm:ss.SSS"（db/dates.ts の toDbDate が作る）。
 */
export function normalizeLastNotificationsCheckedAt(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}$/.test(value) ? value : null;
}
