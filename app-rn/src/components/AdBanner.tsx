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
//   畳んでいる間     … 高さ 0 のまま**マウントは保つ**（collapsed。下の「要求を増やさない」）
//
// ## 要求を増やさない（AdMob の 60 秒）
//
// BannerAd は**マウントした瞬間に必ず広告を要求する**。だから「消す＝アンマウント」は
// そのまま「次に出すとき新しく要求する」を意味する。AdMob の実装ガイダンス
// （support.google.com/admob/answer/2936217）は「アプリ内で広告のあるページ間を短時間で
// 行き来する場合、新しい広告リクエストは推奨される 60 秒より早く行うべきではない」と
// 明記しているので、この部品は要求が増える経路を 2 つの口で塞ぐ:
//
//   collapsed … 見せたくないだけのときに使う。**アンマウントせず高さ 0 に潰す**ので、
//               戻したときに要求し直さない（計算タブの鍵盤）
//   throttled … マウントし直される場所で使う。前回の要求から 60 秒経つまで
//               BannerAd を作らない（記録詳細の push/pop。ads/requestInterval.ts）
//
// タブの切り替えでは何も起きない ── expo-router の BottomTabView は一度描いたタブを
// 描画対象から外さない（`loaded` は増える一方）ので、AdBanner はマウントされたまま。
// タブごとに広告が違って見えるのは、**タブごとに別のインスタンスが常駐している**ため。
//
// ## サイズ
//
// **通常の**アンカー型アダプティブバナー（ANCHORED_ADAPTIVE_BANNER）。
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
import { useIsFocused } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import { BannerAd, BannerAdSize, useForeground } from 'react-native-google-mobile-ads';

import { anchoredBannerHeight } from '@/ads/bannerSize';
import { useAdsInitialized, useNonPersonalizedAds } from '@/ads/consent';
import { adRequestCooldown, markAdRequested } from '@/ads/requestInterval';
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
 * @param collapsed 高さ 0 に潰して見せない。**アンマウントはしない**ので、戻したときに
 *   広告を要求し直さない（冒頭「要求を増やさない」）。鍵盤の裏に隠れている間など、
 *   「見えていないのに表示だけ数えられる」のを避けたいときに true にする
 * @param throttled 画面の出入りでマウントし直される場所で true にする。前回の要求から
 *   60 秒経つまで BannerAd を作らない（その間は枠も出さない）。出しっぱなしの枠では
 *   要求は最初の 1 回きりなので、待たせる意味がない ── 既定は false
 */
export function AdBanner({
  unitId,
  collapsed = false,
  throttled = false,
}: {
  unitId: string | null;
  collapsed?: boolean;
  throttled?: boolean;
}) {
  const colors = useThemeColors();
  const initialized = useAdsInitialized();
  const nonPersonalized = useNonPersonalizedAds();
  const bannerRef = useRef<BannerAd>(null);
  /** 実際に返ってきた広告の高さ。まだ読み込めていなければ null */
  const [loadedHeight, setLoadedHeight] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);

  /**
   * 要求してよくなる時刻（ms）。null なら今すぐ要求してよい。
   *
   * **残り時間ではなく「いつ」を持つ。** 残りを state にすると、待っている間ずっと
   * 数え直す必要が出る。到達する時刻を 1 つ持てば、そこで 1 回だけ起こせばいい。
   */
  const [blockedUntil, setBlockedUntil] = useState<number | null>(() => {
    if (!throttled) return null;
    const remaining = adRequestCooldown();
    return remaining === 0 ? null : Date.now() + remaining;
  });

  useEffect(() => {
    if (blockedUntil == null) return;

    const timer = setTimeout(
      () => {
        // タイマーは要求した時刻より少し早く起きることがある。残っていれば時刻を
        // 引き直して待ち直す（新しい値を入れるので、この効果がもう一度走る）
        const remaining = adRequestCooldown();
        setBlockedUntil(remaining === 0 ? null : Date.now() + remaining);
      },
      Math.max(0, blockedUntil - Date.now()),
    );

    return () => clearTimeout(timer);
  }, [blockedUntil]);

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

  /** BannerAd を描く＝広告を要求する。この 4 つが揃ったときだけ */
  const requesting = unitId != null && initialized && !failed && blockedUntil == null;

  // 要求したことを時計に記録する（ads/requestInterval.ts）。**出しっぱなしの枠も記録する** ──
  // 記録しないと、タブのバナーが要求した直後に開いた記録詳細が間隔を無視して続けて要求する
  useEffect(() => {
    if (requesting) markAdRequested();
  }, [requesting]);

  const isFocused = useIsFocused();
  /**
   * 復帰したときに読み直してよいか（＝いま画面に出ているか）。
   *
   * **ref で持つ。** useForeground の購読は最初の 1 回だけ張られ、そのとき渡した関数を
   * そのまま保持する（ライブラリ側の useEffect が `[]`）ので、閉包に入れた値は
   * 最初のレンダーのまま固まる。読むのは呼ばれた瞬間なので、ref なら現在値が取れる。
   */
  const reloadableRef = useRef(false);
  useEffect(() => {
    reloadableRef.current = isFocused && !collapsed;
  }, [isFocused, collapsed]);

  // iOS の WKWebView はアプリがサスペンドされている間に落ちることがあり、復帰すると
  // 空のバナーになる。復帰のたびに読み直す（公式の推奨。Android では不要）。
  // 失敗して畳んだ枠も、ここで一度やり直す ── 通信が切れていただけなら次は出る。
  //
  // **いま出ている 1 つだけが読み直す。** 訪問済みのタブぶん（最大 3〜4 個）が全部
  // マウントされたままなので、素通しにすると復帰のたびにその数だけ要求が飛ぶ。
  // 裏のタブが失敗したままなら、そのタブに戻って次に復帰したときにやり直される
  useForeground(() => {
    if (!reloadableRef.current) return;

    setFailed(false);
    if (Platform.OS === 'ios') {
      bannerRef.current?.load();
      markAdRequested();
    }
  });

  // 同意前・初期化前は広告を要求してはいけない。失敗した回は空白を残さず畳む。
  // 間隔待ちの間も枠を出さない（高さ 0）── 空の枠だけ残しても場所を取るだけ
  if (!requesting) {
    return null;
  }

  return (
    <View
      style={[
        styles.slot,
        collapsed
          ? styles.collapsed
          : {
              height: slotHeight,
              backgroundColor: colors.background,
              borderTopColor: colors.separator,
              // 一覧の続きに見えないよう、上端に区切り線を引いて内容から切り離す。
              // 下端には引かない ── タブバーが自前の上罫線を持っていて、二重線になる
              borderTopWidth: StyleSheet.hairlineWidth,
            },
      ]}
      // 潰している間は指も通さない（高さ 0 でも当たり判定を残さない）
      pointerEvents={collapsed ? 'none' : 'auto'}>
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
  },
  /**
   * 潰した状態。**高さ 0・不透明度 0・はみ出しを切る**の 3 つを重ねてかける。
   *
   * 高さ 0 だけだと、中の BannerAd は自分の実寸（幅×高さ）を持ったまま枠から
   * はみ出して見える ── View の overflow は既定 'visible'、flex の子は既定
   * flexShrink: 0 なので、枠を 0 にしても子は縮まないし切られない。
   * opacity を足しているのは、SDK 側の可視判定に対しても「見えていない」を
   * はっきりさせるため（見えていない広告の表示は数えさせない）。
   */
  collapsed: {
    height: 0,
    opacity: 0,
    overflow: 'hidden',
  },
});
