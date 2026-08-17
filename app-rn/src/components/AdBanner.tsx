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
import { Platform, StyleSheet, View } from 'react-native';
import { BannerAd, BannerAdSize, useForeground } from 'react-native-google-mobile-ads';

import { useAdsInitialized } from '@/ads/consent';
import { useThemeColors } from '@/theme';

/**
 * 読み込みが終わるまで確保しておく高さ。
 *
 * ANCHORED_ADAPTIVE_BANNER の高さは**端末の幅と向きからネイティブ側が決める**ので
 * （画面の高さの 15% を超えない範囲）、アプリ側で正確な値は持てない。
 * ここは「読み込み中の仮の場所取り」に徹し、実寸が返ってきたらそちらに合わせる
 * （固定値のまま実寸を無視すると、背の高い広告がはみ出す／切れる ── 切れた広告の
 * インプレッションは無効トラフィックとして扱われ得る）。
 *
 * 縦画面のスマートフォンで返るのはほぼ 50dp なので、その値を置いてある。
 * **読み込みの前後で枠が動かない**のが狙いなので、実測とずれたら here を直すこと。
 */
const PLACEHOLDER_HEIGHT = 50;

/**
 * 広告の上下に置く余白。
 *
 * 上側は**追加ボタン（FAB）との距離**を稼ぐぶん。FAB は一覧側（listArea）の中で
 * `bottom: 24` に絶対配置されていて、listArea の下端がこの枠の上端なので、
 * FAB の下端から広告の中身までは `24 + AD_SPACING` になる。押し損ねた指が広告に
 * 当たると無効トラフィックとして数えられるため、ここは詰めないこと。
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
  const bannerRef = useRef<BannerAd>(null);
  /** 実際に返ってきた広告の高さ。まだ読み込めていなければ null */
  const [loadedHeight, setLoadedHeight] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);

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
          height: (loadedHeight ?? PLACEHOLDER_HEIGHT) + AD_SPACING * 2,
          backgroundColor: colors.background,
          borderTopColor: colors.separator,
        },
      ]}>
      <BannerAd
        ref={bannerRef}
        unitId={unitId}
        // 非推奨の定数をあえて使っている（理由は冒頭のコメント）
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
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
