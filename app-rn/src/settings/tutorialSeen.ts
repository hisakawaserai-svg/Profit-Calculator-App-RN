// 初回起動チュートリアルを見終えたかどうかのうち、保存先に依存しない部分。
//
// defaultRecordKind.ts と同じ分け方 ── kv-store は文字列しか返さないので、
// 妥当性の検証はアプリ側の責務になる。I/O（kv-store と zustand）は ./index.ts にあり、
// このファイルはそれを import しない（native モジュールなしで規則だけを試せるようにする）。

/** kv-store のキー */
export const TUTORIAL_SEEN_KEY = 'tutorialSeen';

/**
 * 保存されている値を読める形にする。
 * 未設定（null）も想定外の文字列も「まだ見ていない」（false）に倒す ──
 * 初回起動時に自動で出す、という要件の既定側に倒れるようにするため。
 */
export function normalizeTutorialSeen(value: string | null | undefined): boolean {
  return value === '1';
}
