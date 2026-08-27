// アプリ内レビュー依頼を出してよいかの判定（純粋関数）。設計は docs/DESIGN-REVIEW-PROMPT.md。
//
// **ここには「出すかどうか」だけがある。** 実際に出すのは src/review/requestReview.ts で、
// あちらは expo-store-review・タイマー・モーダルの有無という「実機でしか動かないもの」を持つ。
// 条件は 9 本あり（発火点 2 + 除外 1 + ゲート 5 + 上限 1）、実機で全部を試すのは現実的でない ──
// iOS は TestFlight でレビュー要求そのものが出ず、Android は割り当てが非公開で、
// **どちらも「出たかどうか」をアプリが知る手段が無い**（下記）。だから条件の側だけを
// ここへ引き剥がして、vitest で全部の組み合わせを固める。
//
// ## 数えているのは「表示回数」ではない
//
// **レビュー画面を出す回数は OS が管理する。アプリは数えなくてよいし、数えられない。**
//   - iOS: システムが 365 日あたり最大 3 回まで表示する（Apple のドキュメント明記）
//   - Android: Google Play が時間ベースの割り当てを持つ。値は非公開で予告なく変わりうる
// どちらも**出たかどうかをアプリに返さない。** iOS の requestReview は成否を返さず、
// Android の launchReviewFlow は割り当てに引っかかって何も表示されなくても成功で返る。
//
// したがって `requestCount` / `lastRequestedAt` が数えているのは
// **こちらから「頼んだ」回数と時刻**であって、利用者が実際に見た回数ではない。
// 用途は 2 つだけ:
//   1. 出ないと分かっている状況で無駄に呼ばない（OS の割り当てより手前に自分の門を置く）
//   2. 「どういうときに呼ぶか」をこのファイルの純粋関数に閉じ込め、テストできる形にする
//
// **この帰結として、レビューが書かれたことを前提にした後続処理は一切書かない。**
// お礼の表示も、状態遷移も、実績も付けない ── 出ていない可能性が常にあるため。

/** 起動回数の下限。初回起動の直後に出さないための門（Apple が名指しで避けるよう書いている） */
export const MIN_LAUNCH_COUNT = 5;

/**
 * 初回起動からの経過日数の下限。起動回数だけでは足りない ──
 * 1 日のうちに 5 回起動しただけの人は、まだアプリを評価できる段階にいない。
 */
export const MIN_DAYS_SINCE_FIRST_LAUNCH = 7;

/**
 * 売れた記録の件数の下限。このアプリの中心的な成功体験（売れた）を通った人にだけ頼む。
 * 出品中を含む全件ではなく**売れた件数**なのは、記録しただけの段階では
 * アプリが役に立ったかどうかがまだ分からないため。
 */
export const MIN_SOLD_RECORD_COUNT = 10;

/**
 * 前回頼んでから空ける日数。OS 側の割り当て（iOS は 365 日で 3 回）とぶつからない位置に
 * 自分の門を置く ── 120 日 × 3 回で 360 日となり、こちらの上限のほうが先に効く。
 */
export const MIN_DAYS_BETWEEN_REQUESTS = 120;

/** こちらから頼む通算の上限。OS の表示回数ではない（ファイル冒頭） */
export const MAX_REVIEW_REQUEST_COUNT = 3;

const DAY_MS = 86_400_000;

/**
 * 発火点の種類。**どちらであっても出すものは同じ**（OS のレビュー画面）で、
 * 呼び分けはしない ── 区別を返すのは、どちらの経路で出たかをテストで書き分けられるようにするため。
 */
export type ReviewPromptOccasion =
  /** 実績を新規に獲得した（第一候補） */
  | 'achievement'
  /** 実績は出なかったが、黒字の記録を保存した（第二候補） */
  | 'profitable-record';

/** 保存操作 1 回ぶんの結果。呼び出し側（記録フォーム・記録詳細）が組み立てる */
export type SaveOutcome = {
  /** その保存で**新規に**獲得した実績の数（db/useRecords の saveRecord / setSoldStatus の戻り値） */
  newlyCompletedCount: number;
  /**
   * 保存した記録の純利益。**まだ売れていない（出品中）なら null。**
   *
   * 0 と null を分ける必要がある ── 0 は「売れて、ちょうど収支が合った」で、
   * null は「売れていないので利益という値がまだ無い」。前者は黒字側に入れてよいが、
   * 後者を 0 として扱うと、出品しただけで発火点になってしまう。
   */
  netProfit: number | null;
};

/** 判定に要る、端末に保存してある履歴と記録の件数 */
export type ReviewPromptState = {
  /** これまでの起動回数（settings の countLaunch が数える） */
  launchCount: number;
  /** 初回起動の時刻（epoch ms）。まだ記録していなければ null */
  firstLaunchAt: number | null;
  /** 前回**頼んだ**時刻（epoch ms）。まだ一度も頼んでいなければ null（ファイル冒頭） */
  lastRequestedAt: number | null;
  /** これまでに**頼んだ**回数（ファイル冒頭） */
  requestCount: number;
  /** 売れた記録の件数 */
  soldRecordCount: number;
};

/**
 * この保存が発火点にあたるか。あたらなければ null。
 *
 * **赤字はすべてに優先して外す。** 実績を獲得していても外す ── 実績には
 * 利益を条件にしないもの（「記録を続けよう」「販売デビュー」など、記録した行為そのものを
 * 数えるもの）があり、赤字の記録でも解放されうる。損を確定させた直後にレビューを頼むのは、
 * 「ネガティブな場面で出さない」という条件の中でもいちばん外したい場面なので、
 * 実績のほうを譲る。次の機会（黒字の保存・別の実績）まで待てばよい。
 *
 * 出品中（netProfit が null）は赤字ではないので外さない。実績が出たならそれが発火点になる ──
 * 「記録を続けよう」のような、売る前に達成する実績を拾うため。
 */
export function reviewPromptOccasion(outcome: SaveOutcome): ReviewPromptOccasion | null {
  if (outcome.netProfit != null && outcome.netProfit < 0) return null;
  if (outcome.newlyCompletedCount > 0) return 'achievement';
  if (outcome.netProfit != null) return 'profitable-record';

  return null;
}

/**
 * ゲート（起動回数・経過日数・売れた件数・クールダウン・通算上限）を全部満たすか。
 *
 * **時計が巻き戻った端末では、どの経過日数も負になって不成立に倒れる**（＝出さない）。
 * ads/requestInterval のように「待たせない」側へ倒さないのは、あちらが
 * 「待つ側は必ず 0 に辿り着ける必要がある」ものなのに対し、こちらは
 * 出さないままでも何も損なわれないため。迷ったら出さない側でよい。
 */
export function passesReviewGates(state: ReviewPromptState, now: number): boolean {
  if (state.launchCount < MIN_LAUNCH_COUNT) return false;
  if (state.soldRecordCount < MIN_SOLD_RECORD_COUNT) return false;
  if (state.requestCount >= MAX_REVIEW_REQUEST_COUNT) return false;

  // 初回起動を記録していない端末では経過日数を測れない。測れない＝満たせない
  if (state.firstLaunchAt == null) return false;
  if (elapsedDays(state.firstLaunchAt, now) < MIN_DAYS_SINCE_FIRST_LAUNCH) return false;

  // まだ一度も頼んでいなければクールダウンは無条件で満たす
  if (
    state.lastRequestedAt != null &&
    elapsedDays(state.lastRequestedAt, now) < MIN_DAYS_BETWEEN_REQUESTS
  ) {
    return false;
  }

  return true;
}

/**
 * 発火点の判定とゲートの両方。**呼び出し側（src/review/requestReview.ts）はこれ 1 本だけを使う。**
 * 返り値が null でなければ「頼んでよい」で、その値はどちらの経路で通ったか。
 */
export function decideReviewPrompt(
  outcome: SaveOutcome,
  state: ReviewPromptState,
  now: number,
): ReviewPromptOccasion | null {
  const occasion = reviewPromptOccasion(outcome);
  if (occasion == null) return null;

  return passesReviewGates(state, now) ? occasion : null;
}

/** 経過日数（小数のまま返す）。負なら時計が巻き戻っている（上記の扱い） */
function elapsedDays(from: number, now: number): number {
  return (now - from) / DAY_MS;
}
