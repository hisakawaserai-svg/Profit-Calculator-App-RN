// アプリ内レビュー依頼の履歴（docs/DESIGN-REVIEW-PROMPT.md）のうち、保存先に依存しない部分。
//
// lastBackupAt.ts と同じ分け方 ── kv-store は文字列しか返さないので、妥当性の検証は
// アプリ側の責務になる。I/O（kv-store と zustand）は ./index.ts にあり、
// このファイルはそれを import しない（native モジュールなしで規則だけを試せるようにする）。
//
// **これは設定ではなく端末の履歴**（利用者が選ぶ値ではない）だが、置き場所は同じ kv-store にする。
// 理由は lastBackupAt.ts と同じ ── 記録の DB に置くと、復元（全置換）でこの値まで
// 書き換わってしまう。「何回起動したか」「前回いつレビューを頼んだか」は端末で起きたことで、
// バックアップの中身ではない。**復元でレビュー依頼の履歴が巻き戻ると、頼み直しが起きる。**
//
// ## なぜ日時を epoch ms（数値）で持つのか
//
// lastBackupAt は "YYYY-MM-DDTHH:mm:ss.SSS" の文字列で持っているが、こちらは数値にする。
// あちらは**画面に出す**値で、こちらは**引き算にしか使わない**値だから ──
// 「前回から 120 日以上」「初回起動から 7 日以上」はどちらも経過時間の比較で、
// 判定（logic/reviewPrompt.ts）が欲しいのは最初から数値。文字列で持つと、
// 日付の形の検証と Date への変換をこの両方に足すことになり、増えるのは変換だけで
// 読めるようになるものが何も無い。

/** kv-store のキー。4 つとも「設定」ではなく「履歴」（ファイル冒頭） */
export const LAUNCH_COUNT_KEY = 'launchCount';
export const FIRST_LAUNCH_AT_KEY = 'firstLaunchAt';
export const REVIEW_REQUESTED_AT_KEY = 'reviewRequestedAt';
export const REVIEW_REQUEST_COUNT_KEY = 'reviewRequestCount';

/**
 * 回数として保存されている値を読める形にする。
 *
 * **読めない値はすべて 0 に倒す。** 0 は「まだ一度も無い」で、レビュー依頼の条件では
 * いちばん厳しい側（＝出さない側）に効く ── 壊れた値を拾ったときに、
 * 起動回数が足りている・依頼済み回数が上限に達していない、のどちらにも転ばせない。
 *
 * 負の数と小数も弾く。どちらも「回数」として書いた覚えのない値で、
 * そのまま通すと `launchCount >= 5` のような比較の意味が読めなくなる。
 */
export function normalizeCounter(value: string | null | undefined): number {
  if (typeof value !== 'string') return 0;

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) return 0;

  return parsed;
}

/**
 * 日時（epoch ms）として保存されている値を読める形にする。読めなければ null。
 *
 * **null の意味は 2 つの鍵で違う。** firstLaunchAt の null は「まだ初回起動を記録していない」で、
 * このあと記録される（＝経過日数の条件はまだ満たせない）。reviewRequestedAt の null は
 * 「まだ一度も頼んでいない」で、クールダウンの条件は無条件で満たす。
 * どちらも判定側（logic/reviewPrompt.ts）が区別して扱うので、ここでは形だけを見る。
 *
 * 0 と負の数は弾く ── epoch ms の 0 は 1970 年で、この端末で起きたこととして
 * ありえない。時計が大きく狂った端末の値をそのまま「大昔に頼んだ」と読ませない。
 */
export function normalizeEpochMs(value: string | null | undefined): number | null {
  if (typeof value !== 'string') return null;

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) return null;

  return parsed;
}
