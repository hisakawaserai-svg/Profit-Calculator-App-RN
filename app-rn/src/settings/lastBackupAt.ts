// 「前回バックアップを作った日」（設計案 53a の下端の 1 行）のうち、保存先に依存しない部分。
//
// defaultRecordKind.ts と同じ分け方 ── kv-store は文字列しか返さないので、
// 妥当性の検証はアプリ側の責務になる。I/O（kv-store と zustand）は ./index.ts にあり、
// このファイルはそれを import しない（native モジュールなしで規則だけを試せるようにする）。
//
// **これは設定ではなく記録**（利用者が選ぶ値ではない）だが、置き場所は同じ kv-store にする。
// 記録の DB に置くと、復元（全置換）でこの値まで書き換わってしまう ──
// 「前回いつ作ったか」は端末の履歴であって、バックアップの中身ではない。

/** kv-store のキー */
export const LAST_BACKUP_AT_KEY = 'lastBackupAt';

/**
 * 保存されている値を読める形にする。
 *
 * **形が違えば「無かったこと」にする**（null を返す）── 日付として読めない文字列を
 * そのまま画面に出すと、「前回作ったのは ???」という行が消せなくなる。
 * 形は DB と同じ "YYYY-MM-DDTHH:mm:ss.SSS"（db/dates.ts の toDbDate が作る）。
 */
export function normalizeLastBackupAt(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}$/.test(value) ? value : null;
}
