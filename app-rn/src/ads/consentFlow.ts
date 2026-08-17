// 同意フロー（UMP）と広告 SDK 初期化の**手順そのもの**。
//
// consent.ts から切り出してあるのは、この手順が「時間」と「順番」でしか壊れないから ──
// 同意が返ってこない・二重に初期化される・打ち切ったのに広告が出ない、はどれも画面を
// 見ても分からない。依存（AdsConsent / mobileAds）を差し替えられる形にして、
// 偽タイマーで固定する（consentFlow.test.ts）。
//
// 実物を繋ぐのは consent.ts。こちらは react-native も zustand も知らない。

import { withTimeout } from './withTimeout';

/** この手順が外に対してすること。実物は consent.ts、テストでは偽物を渡す */
export type ConsentFlowDeps = {
  /** 同意情報を更新し、必要ならフォームを出す。**返ってこないことがある** */
  gatherConsent: () => Promise<unknown>;
  /** いま広告を要求してよいか（UMP が端末に持っている状態を読む） */
  getConsentInfo: () => Promise<{ canRequestAds: boolean }>;
  /** 広告 SDK の初期化。**二重に呼ばれないことはこちらで保証する** */
  initializeSdk: () => Promise<void>;
  /**
   * 初期化が終わった。`nonPersonalized` は同意の状態が分からないまま進んだかどうかで、
   * true なら広告は非パーソナライズとして要求する
   */
  onInitialized: (nonPersonalized: boolean) => void;
  /** 失敗と打ち切りの通知。広告が出ないだけなので、握って先へ進むために使う */
  onFailure: (error: unknown) => void;
  /** 同意取得を待つ上限 */
  timeoutMs: number;
};

/**
 * 同意を取り、広告 SDK を初期化する手順を 1 つ作る。
 *
 * 返ってくる `start()` は**アプリの起動につき 1 回だけ**呼ぶ。状態はこの手順の中だけに
 * 持つので、作り直せば（＝次の起動では）同意取得からやり直す ── 打ち切ったことを
 * どこにも保存しないのは、諦めた状態で固定しないため。
 */
export function createConsentFlow(deps: ConsentFlowDeps): { start: () => void } {
  /** initializeSdk を二重に呼ばないための番人 */
  let sdkStarted = false;

  /**
   * 初期化の試行を**順番に並べる**ための鎖。
   *
   * start() は「同意フローの決着後」と「その場で即時」の 2 経路から試行を積む。
   * この 2 経路は force が違う（即時は同意が取れていなければ出さない、決着後の失敗経路は
   * 出す）ので、走っている試行を使い回すと、後から来た force 付きが force なしの結果で
   * 決着してしまい、打ち切ったのに広告が出ないままになる。前の試行の後ろに繋いで、
   * 必ずもう一度判断させる。
   */
  let queue: Promise<void> = Promise.resolve();

  /**
   * @param force 同意の状態が取れないまま進むか。**同意取得を打ち切ったときだけ true。**
   *   このとき同意の有無が分からないので、広告は非パーソナライズとして要求する
   *   （UMP の公式ガイダンスは「同意取得でエラーが起きても広告リクエストは試みる」）。
   */
  async function attemptStart(force: boolean): Promise<void> {
    if (sdkStarted) return;

    const { canRequestAds } = await deps.getConsentInfo();
    // 同意が必要なのにまだ取れていない状態。**同意フローがまだ動いている間は**要求しない
    if (!canRequestAds && !force) return;

    sdkStarted = true;
    await deps.initializeSdk();
    // canRequestAds が false のまま来た ＝ 同意の状態が分からない。非パーソナライズで出す
    deps.onInitialized(!canRequestAds);
  }

  function enqueue(force: boolean): Promise<void> {
    // 前の試行が失敗していても次は試す（成否にかかわらず後ろに繋ぐ）
    queue = queue.then(
      () => attemptStart(force),
      () => attemptStart(force),
    );
    return queue;
  }

  return {
    start() {
      withTimeout(deps.gatherConsent(), deps.timeoutMs)
        .then(() => enqueue(false))
        .catch((error: unknown) => {
          // 打ち切りも失敗もここに来る。どちらも「同意の状態が分からない」ので force で進める
          deps.onFailure(error);
          return enqueue(true);
        })
        .catch(deps.onFailure);

      // 同意フローの結果を待たずにもう一度試す。前回セッションの同意状態で canRequestAds が
      // すでに true なら、フォームの往復を待たずに初期化できる
      enqueue(false).catch(deps.onFailure);
    },
  };
}
