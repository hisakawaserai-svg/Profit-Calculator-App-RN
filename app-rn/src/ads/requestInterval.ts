// 広告を要求してよい間隔を、アプリ全体で 1 つだけ持つ。
//
// なぜ要るか: BannerAd は**マウントした瞬間に必ず広告を要求する**（load を待つ口は無い）。
// 画面の出入りでマウントし直される場所があると、そのぶんだけ要求が増える ── 記録詳細は
// 開くたびにマウント・戻るたびにアンマウントするので、一覧を上から順に見ていくと
// 1 件につき 1 回要求することになる。
//
// AdMob の実装ガイダンス（support.google.com/admob/answer/2936217）は、
// 「アプリ内で広告のあるページ間を短時間で行き来する場合、新しい広告リクエストは
// 推奨される 60 秒より早く行うべきではない」「広告は 60 秒以上表示され続けることを推奨する」
// と明記している。ここはその 60 秒を守るための時計。
//
// **止めるのは要求であって表示ではない。** 出しっぱなしのバナー（計算・記録・データの
// 各タブ）は一度要求したきりなので待たせる必要がない ── 待たせる相手は
// 「マウントし直される場所」だけで、その判断は呼び出し側（AdBanner の throttled）が持つ。
// この時計は**要求したことの記録**は全インスタンスから受け取る ── そうしないと、
// タブのバナーが要求した直後に開いた記録詳細が、間隔を無視して続けて要求してしまう。

/** 広告を要求してよい最短の間隔（ms）。AdMob の推奨する 60 秒 */
export const MIN_AD_REQUEST_INTERVAL_MS = 60_000;

/** 直近に広告を要求した時刻（ms）。まだ一度も要求していなければ null */
let lastRequestedAt: number | null = null;

/**
 * 広告を要求したことを記録する。**実際に要求した側が呼ぶ**
 * （BannerAd をマウントしたとき、および ref 経由で load() を投げたとき）。
 */
export function markAdRequested(now: number = Date.now()): void {
  lastRequestedAt = now;
}

/**
 * 次に要求できるまでの残り（ms）。**0 なら今すぐ要求してよい。**
 *
 * 端末の時計が巻き戻ったとき（手動設定・時刻同期）に `now` が前回より前になり得るので、
 * 負の経過時間は「待たせない」に倒す ── 待つ側は必ず 0 に辿り着ける必要がある。
 */
export function adRequestCooldown(now: number = Date.now()): number {
  if (lastRequestedAt == null) return 0;

  const elapsed = now - lastRequestedAt;
  if (elapsed < 0) return 0;

  return Math.max(0, MIN_AD_REQUEST_INTERVAL_MS - elapsed);
}

/** テストから状態を戻すためのもの。**アプリからは呼ばない** */
export function resetAdRequestInterval(): void {
  lastRequestedAt = null;
}
