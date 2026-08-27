// ストアの掲載ページ（レビューを書く先）の URL。
//
// **設定タブの「レビューを書く」はここを開く。expo-store-review は呼ばない。**
// 理由は Google の In-App Review のガイドラインが名指しで禁じているため:
//   「ユーザーが既に割り当てに達している場合、フローが表示されず壊れた体験になるので、
//     API を起動する CTA（ボタンなど）を置くべきではない」
// Apple も、利用者が自分から書きに行く経路には write-review の URL を案内している。
// つまり**自動の依頼（API）と設定からの導線（URL）は別物**で、混ぜてはいけない。
//
// expo-store-review の `storeUrl()` は使わない。あれは app.json の
// `ios.appStoreUrl` / `android.playStoreUrl` を読むだけの薄い関数で、経由させても
// 増えるのは「app.json に書いた値が埋め込み config に載っているか」という心配だけになる。
// サポート・プライバシーポリシーの URL（設定タブ）と同じく、TS の定数で持つほうが揃う。
//
// os を引数に取るのは Platform.OS を直接読まないため ── そうすると native なしでは
// 試せなくなる。読むのは呼び出し側（設定タブ）で、ここは規則だけを持つ。

/** App Store のアプリ ID（App Store Connect が採番したもの） */
export const APP_STORE_ID = '6804385417';

/** Google Play のパッケージ名（app.json の android.package と同じ） */
export const PLAY_STORE_PACKAGE = 'com.sera.profitcalculator';

/**
 * レビューを書くために開く URL。対応していない OS（web）では null。
 *
 * iOS の `action=write-review` は App Store をレビュー投稿の画面で開く。
 * **Android には同等の直リンクが無い**ので掲載ページを開く（Play ストアアプリが
 * app link で受け取る）。`market://` は使わない ── ストアアプリが無い端末で
 * 開けずに終わるだけで、https なら少なくともブラウザで掲載ページに辿り着ける。
 */
export function storeReviewUrl(os: string): string | null {
  if (os === 'ios') return `https://apps.apple.com/app/id${APP_STORE_ID}?action=write-review`;
  if (os === 'android') {
    return `https://play.google.com/store/apps/details?id=${PLAY_STORE_PACKAGE}`;
  }

  return null;
}
