// バナー広告の枠（Phase 1）。BannerAd をそのまま置かず、必ずこの部品を通す。
//
// 素の BannerAd は**読み込みが終わるまで 0×0、失敗しても 0×0 のまま**（BaseAd が
// onAdLoaded で受け取った実寸を style に入れる作り）。そのまま画面に置くと、
// 読み込みの前後で下端が跳ね、失敗した回は「なぜか空いている隙間」だけが残る。
// ここで枠の高さを持ち、状態ごとに:
//
//   同意前・初期化前 … 何も描画しない（高さ 0）
//   読み込み中       … 仮の高さで場所だけ確保する（読み込み後の跳ねを小さくする）
//   読み込み成功     … 実際に返ってきた高さに合わせる
//   読み込み失敗     … 何も描画しない（高さ 0。空白を残さない）
//
// サイズは**通常の**アンカー型アダプティブバナー（ANCHORED_ADAPTIVE_BANNER）。
//
// この定数は BannerAdSize.ts で `@deprecated` が付いており、SDK は後継として
// LARGE_ANCHORED_ADAPTIVE_BANNER を勧めてくる（2026-02 の Google Mobile Ads SDK の変更）。
// それでもこちらを選んでいるのは、LARGE が 50〜150dp（画面高の 20% まで）と背が高く、
// 記録一覧の下に固定で置くと一覧の可視領域を大きく削るため ── 収益より画面を優先する。
// 非推奨なのは定数の扱いだけで、iOS / Android とも実装は残っている
// （GADCurrentOrientationAnchoredAdaptiveBannerAdSizeWithWidth /
//   AdSize.getCurrentOrientationAnchoredAdaptiveBannerAdSize）。
// 将来 SDK から消えたら、その時点で LARGE か INLINE_ADAPTIVE_BANNER（maxAdHeight で
// 高さを抑えられる）へ移す。
import { useRef, useState } from 'react';
import { Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import { BannerAd, BannerAdSize, useForeground } from 'react-native-google-mobile-ads';

import { anchoredBannerHeight } from '@/ads/bannerSize';
import { useAdsInitialized, useNonPersonalizedAds } from '@/ads/consent';
import { useThemeColors } from '@/theme';

/**
 * 同意の状態が分からないときに渡すリクエスト設定（consent.ts の useNonPersonalizedAds）。
 *
 * **毎回作り直さない。** requestOptions が別物になると BannerAd は広告を要求し直すので、
 * レンダーのたびに新しい object を渡すと読み込みが終わらなくなる。
 */
const NON_PERSONALIZED_REQUEST = { requestNonPersonalizedAdsOnly: true } as const;

/**
 * 広告の上下に置く余白。
 *
 * 上側は**画面の中の押せるものとの距離**を稼ぐぶん。広告を出す 4 画面はどれも
 * 内容側のコンテナの中で FAB を `bottom: 24` に絶対配置していて、そのコンテナの下端が
 * この枠の上端なので、FAB の下端から広告の中身までは `24 + AD_SPACING` になる。
 * 押し損ねた指が広告に当たると無効トラフィックとして数えられるため、ここは詰めないこと。
 *
 * 下側はタブバーとの間隔。0 にすると広告がタブバーに貼り付いて、タブを押すつもりの
 * 指が広告に当たる（上と同じ理由で避ける）。
 */
const AD_SPACING = 12;

/**
 * @param unitId 広告ユニット ID（src/ads/adUnits.ts）。**null なら何も描画しない** ──
 *   本番 ID が未取得の Phase 1 では、本番ビルドで広告枠そのものを出さない
 */
export function AdBanner({ unitId }: { unitId: string | null }) {
  const colors = useThemeColors();
  const initialized = useAdsInitialized();
  const nonPersonalized = useNonPersonalizedAds();
  const bannerRef = useRef<BannerAd>(null);
  /** 実際に返ってきた広告の高さ。まだ読み込めていなければ null */
  const [loadedHeight, setLoadedHeight] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);

  /**
   * 読み込みが終わるまで確保しておく高さ。**幅から実寸を先に当てる**（bannerSize.ts）ので、
   * 読み込みの前後で枠は動かない。向きを変えると幅が変わり、ここも追随する。
   *
   * 実際に返ってきた高さがあればそちらが優先 ── 予測が外れても、そこでズレが残らない
   * （固定値のまま実寸を無視すると、背の高い広告がはみ出す／切れる。切れた広告の
   * インプレッションは無効トラフィックとして扱われ得る）。
   */
  const { width } = useWindowDimensions();
  const slotHeight = (loadedHeight ?? anchoredBannerHeight(width)) + AD_SPACING * 2;

  // iOS の WKWebView はアプリがサスペンドされている間に落ちることがあり、復帰すると
  // 空のバナーになる。復帰のたびに読み直す（公式の推奨。Android では不要）。
  // 失敗して畳んだ枠も、ここで一度やり直す ── 通信が切れていただけなら次は出る
  useForeground(() => {
    setFailed(false);
    if (Platform.OS === 'ios') {
      bannerRef.current?.load();
    }
  });

  // 同意前・初期化前は広告を要求してはいけない。失敗した回は空白を残さず畳む
  if (unitId == null || !initialized || failed) {
    return null;
  }

  return (
    <View
      style={[
        styles.slot,
        {
          height: slotHeight,
          backgroundColor: colors.background,
          borderTopColor: colors.separator,
        },
      ]}>
      <BannerAd
        ref={bannerRef}
        unitId={unitId}
        // 非推奨の定数をあえて使っている（理由は冒頭のコメント）
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        // 同意が取れていれば指定しない ── パーソナライズの可否は UMP が端末に持つ
        // 同意情報から SDK が判断する。分からないときだけ非パーソナライズに倒す
        requestOptions={nonPersonalized ? NON_PERSONALIZED_REQUEST : undefined}
        // 高さは onAdLoaded と onSizeChange の両方から来る（向きを変えたときは後者だけ）。
        // 枠と中身は同じイベントで一緒に更新されるので、途中の 1 フレームでずれることはない
        onAdLoaded={({ height }) => setLoadedHeight(height)}
        onSizeChange={({ height }) => setLoadedHeight(height)}
        onAdFailedToLoad={() => setFailed(true)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  slot: {
    justifyContent: 'center',
    alignItems: 'center',
    // 一覧の続きに見えないよう、上端に区切り線を引いて内容から切り離す。
    // 下端には引かない ── タブバーが自前の上罫線を持っていて、二重線になる
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
