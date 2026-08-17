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
// サイズはアンカー型アダプティブバナー。**ANCHORED_ADAPTIVE_BANNER は非推奨**になったので
// （2026-02 の Google Mobile Ads SDK の変更。BannerAdSize.ts の deprecation note）、
// 後継の LARGE_ANCHORED_ADAPTIVE_BANNER を使う。
import { useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { BannerAd, BannerAdSize, useForeground } from 'react-native-google-mobile-ads';

import { useAdsInitialized } from '@/ads/consent';
import { useThemeColors } from '@/theme';

/**
 * 読み込みが終わるまで確保しておく高さ。
 *
 * LARGE_ANCHORED_ADAPTIVE_BANNER の高さは**端末の幅と向きからネイティブ側が決める**ので
 * （50〜150dp の範囲で、画面の高さの 20% を超えない）、アプリ側で正確な値は持てない。
 * ここは「読み込み中の仮の場所取り」に徹し、実寸が返ってきたらそちらに合わせる
 * （固定値のまま実寸を無視すると、背の高い広告がはみ出す／切れる ── 切れた広告の
 * インプレッションは無効トラフィックとして扱われ得る）。
 * 縦画面の一般的なスマートフォンで返る高さに近い値を選んである。
 */
const PLACEHOLDER_HEIGHT = 60;

/** 広告の上下に置く余白。下側はタブバーとの間隔（8pt 以上）になる */
const AD_SPACING = 8;

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
        size={BannerAdSize.LARGE_ANCHORED_ADAPTIVE_BANNER}
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
    // 一覧の続きに見えないよう、上端に区切り線を引いて内容から切り離す
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
