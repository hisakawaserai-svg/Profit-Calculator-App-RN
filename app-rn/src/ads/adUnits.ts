// 広告ユニット ID の唯一の置き場（Phase 1）。画面から ID を直接書かないこと。
//
// **Phase 1 では本番 ID を持たない。** 開発ビルド（__DEV__）では Google 公式のテスト ID を返し、
// 本番ビルドでは `null` を返す ── null のとき AdBanner は何も描画しない（高さ 0）。
//
// テスト ID を本番ビルドに載せると収益は 0 のまま広告枠だけが出る。逆に本番 ID を開発ビルドに
// 載せると自分の端末の表示・タップが無効トラフィックとして数えられる（AdMob のポリシー違反）。
// どちらも「取り違えたことに気付けない」不具合なので、**__DEV__ の分岐をここ 1 か所に閉じ込める**。
//
// App ID（アプリ単位の識別子）はユニット ID とは別物で、app.json の
// react-native-google-mobile-ads プラグインに置いてある。そちらは本番 ID をそのまま入れてよい
// ── 開発ビルドでも本番の App ID + テストのユニット ID という組み合わせが正しい。
import { Platform } from 'react-native';
import { TestIds } from 'react-native-google-mobile-ads';

/**
 * 記録一覧タブのバナーの本番ユニット ID（AdMob 管理画面の `uritsumi-list-banner` 系）。
 *
 * 型を `string | null` のままにしてあるのは、web など想定外のプラットフォームで
 * Platform.select が default に落ちるため。BannerAd は空文字の unitId で例外を投げる
 * （BaseAd の `"BannerAd: 'unitId' expected a valid string unit ID."`）ので、
 * 「無い」は空文字ではなく不在として持ち、描画するかどうかの判断に使う。
 */
const PRODUCTION_RECORD_LIST_BANNER: string | null = Platform.select({
  ios: 'ca-app-pub-3194046005390900/6090387277',
  android: 'ca-app-pub-3194046005390900/1049863912',
  default: null,
});

/**
 * 記録一覧タブの最下部に出すバナーのユニット ID。
 * 開発ビルドは公式のテスト ID（アンカー型アダプティブ用）、本番ビルドは上の本番 ID。
 */
export const RECORD_LIST_BANNER_UNIT_ID: string | null = __DEV__
  ? TestIds.ADAPTIVE_BANNER
  : PRODUCTION_RECORD_LIST_BANNER;
