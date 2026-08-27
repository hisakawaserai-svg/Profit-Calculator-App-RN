// アプリ内レビュー依頼の実行。判定は logic/reviewPrompt.ts（純粋関数）が持ち、
// ここは「いつ・どういう状態のときに実際に呼ぶか」だけを持つ。
// 設計の全体は docs/DESIGN-REVIEW-PROMPT.md。
//
// ads/consent.ts と同じ分け方 ── 手順と条件をテストできる側へ引き剥がし、
// この層には native（expo-store-review）・タイマー・画面の状態だけを残す。
//
// ## 出したかどうかは分からない
//
// **`requestReview()` は「頼んだ」以上のことを返さない。** iOS は成否を返さず、
// Android は割り当てに引っかかって何も表示されなくても成功で返る（logic/reviewPrompt.ts の冒頭）。
// だからこのファイルには、出たあとの処理が何も無い ── お礼も、状態遷移も、実績も付けない。
// 呼び出し側にも何も返さない（`void`）。返せる意味のある値が無いため。
import * as StoreReview from 'expo-store-review';
import { AppState } from 'react-native';

import { TRANSIENT_FEEDBACK_MS } from '@/components/UndoBar';
import { repository } from '@/db/client';
import { decideReviewPrompt, type SaveOutcome } from '@/logic/reviewPrompt';
import { getReviewPromptHistory, markReviewRequested } from '@/settings';

import { isAnyModalOpen } from './modalPresence';

/**
 * 保存してからレビュー画面を出すまでの間。
 *
 * 保存直後には**既に下端に家具が出ている** ── 実績獲得トーストと UndoBar（「売れた」の
 * 取り消し）で、どちらも `TRANSIENT_FEEDBACK_MS`（4 秒）で消える。その上へ被せると、
 * 消える前に読み終えられなかった合図を押し流すことになる。
 *
 * 消え切ってから 1.5 秒空けるのは、Apple のドキュメントが例示している「割り込まないための
 * 待ち」と同じ考え方（あちらは 2 秒）。合計 5.5 秒。
 *
 * トーストの長さを直接ここに書かず `TRANSIENT_FEEDBACK_MS` から作るのは、
 * 片方だけ変えられないようにするため。
 */
export const REVIEW_PROMPT_DELAY_MS = TRANSIENT_FEEDBACK_MS + 1500;

/**
 * 起動してからこの時間は出さない。
 *
 * 広告の同意フォーム（UMP）は起動直後に出ることがあり、あれは RN の Modal ではないので
 * `isAnyModalOpen()` では見えない。ゲート（起動 5 回以上・初回起動から 7 日以上）を
 * 満たした端末では同意が済んでいるのが普通なので実際にはまず衝突しないが、
 * **見えないものを避ける手当ては条件ではなく時間で置く**しかない。
 *
 * 「同意フローが終わったか」を見に行かないのは、同意の取得は失敗しうるものだから
 * （ads/consent.ts）── 失敗した端末でレビュー依頼が永久に出なくなるほうが困る。
 */
const MIN_MS_SINCE_PROCESS_START = 30_000;

/** このプロセスが始まった時刻。モジュールの読み込みは起動につき 1 回だけ */
const PROCESS_STARTED_AT = Date.now();

/** 予約済みのタイマー。二重に積まないための番人（下記） */
let pending: ReturnType<typeof setTimeout> | null = null;

/**
 * 記録を保存したあとに呼ぶ。**条件を満たさなければ何もしない**（呼び出し側は判定を持たない）。
 *
 * 呼ぶのは保存の 2 経路だけ:
 *   - 記録フォームの保存（RecordFormSheet）
 *   - 記録詳細の「売れた」（SaleRecordDetailScreen）
 * 「売れた → 出品中に戻す」「取り消し」からは呼ばない ── 取り消しは
 * ポジティブな場面ではないため（設計の除外条件）。
 *
 * バックアップの復元・書き出し・各種の失敗からも呼ばない。**呼ばないことで外している**ので、
 * このファイルにそれらを弾く条件は無い。
 */
export function requestReviewAfterSave(outcome: SaveOutcome): void {
  // 既に 1 回ぶん予約してあるなら積み増さない。連続で保存されたときに
  // タイマーが 2 本走ると、1 回目が出したあと 2 回目が続けて出そうとする
  if (pending != null) return;

  const now = Date.now();
  const state = { ...getReviewPromptHistory(), soldRecordCount: repository.soldCount() };
  if (decideReviewPrompt(outcome, state, now) == null) return;

  pending = setTimeout(() => {
    pending = null;
    void present();
  }, REVIEW_PROMPT_DELAY_MS);
}

/**
 * いま出してよい画面の状態か。
 *
 * **満たさなければ見送り、何も記録しない**（`markReviewRequested` を呼ばない）──
 * 出していないのだから、頼んだ回数にもクールダウンにも入れない。
 * 条件は次の保存操作でまた判定されるので、失った機会はすぐ戻ってくる。
 */
function canPresentNow(now: number): boolean {
  if (isAnyModalOpen()) return false;
  // 背面に回っていたら出さない。iOS は前面のシーンが取れないと例外になり、
  // Android は次に前面へ戻ったときに唐突に出ることになる
  if (AppState.currentState !== 'active') return false;
  if (now - PROCESS_STARTED_AT < MIN_MS_SINCE_PROCESS_START) return false;

  return true;
}

async function present(): Promise<void> {
  if (!canPresentNow(Date.now())) return;

  // **TestFlight（iOS）と Play ストアの無い端末（Android）では出ない。**
  // ここで先に外さないと、テスターの端末で「見えないまま通算 3 回」を使い切ってしまう
  if (!(await StoreReview.isAvailableAsync())) return;

  // await の間にモーダルが開いた・背面に回った、はありうるのでもう一度見る
  if (!canPresentNow(Date.now())) return;

  // **呼ぶ直前に記録する。** 呼んだあとにすると、レビュー画面が出ている最中に
  // プロセスが終わったときに記録が残らず、次の保存でまた頼んでしまう。
  // ここが数えているのは「頼んだ」であって「見せた」ではない（ファイル冒頭）ので、
  // 呼びに行った時点で記録するのが意味とも合う
  markReviewRequested(Date.now());

  try {
    await StoreReview.requestReview();
  } catch (error) {
    warnReviewFailure(error);
  }
}

/**
 * 失敗はログに残すだけ。ads/consent.ts の warnAdsFailure と同じ扱い ──
 * レビューが出ないだけで、アプリの機能は何も損なわれない。
 * 利用者に見せるものは無い（そもそも出ようとしたことを知らせていない）。
 */
function warnReviewFailure(error: unknown): void {
  if (__DEV__) {
    console.warn('[review] レビュー依頼に失敗しました:', error);
  }
}
