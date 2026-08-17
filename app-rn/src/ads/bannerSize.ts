// アンカー型アダプティブバナーの高さを**端末の幅から先に求める**ための計算（純粋関数）。
//
// なぜ要るか: BannerAd は読み込みが終わるまで実寸を教えてくれない。枠の高さを固定値で
// 置いておくと、読み込みが終わった瞬間に枠が伸び縮みして一覧の下端が跳ねる。
// 幅さえ分かれば高さは決まるので、**読み込む前から実寸と同じ枠**を確保できる。
//
// 元は Google Mobile Ads SDK の getCurrentOrientationAnchoredAdaptiveBannerAdSize で、
// 「320pt 幅で 50pt」を基準に幅へ比例させ、50〜90pt に収める形（iPhone 17 Pro の
// 幅 402pt で 63pt になることを実機のスクリーンショットから実測して確かめてある）。
//
// **これは予測であって決定ではない。** 実際に返ってきた高さ（onAdLoaded / onSizeChange）が
// あればそちらを優先する ── SDK 側の式が変わってもズレが残らないように。

/** 高さの基準（この幅のとき BASE_HEIGHT になる） */
const BASE_WIDTH = 320;
const BASE_HEIGHT = 50;

/** SDK が収める範囲。これより低くも高くもならない */
const MIN_HEIGHT = 50;
const MAX_HEIGHT = 90;

/**
 * 端末の幅（pt）から、アンカー型アダプティブバナーの高さ（pt）を求める。
 *
 * 幅が 0 や負（レイアウト前など）でも下限の高さを返す ── 「まだ分からない」を
 * 高さ 0 の枠にしてしまうと、結局そこで跳ねるため。
 */
export function anchoredBannerHeight(width: number): number {
  if (!Number.isFinite(width) || width <= 0) return MIN_HEIGHT;

  const proportional = Math.round((width * BASE_HEIGHT) / BASE_WIDTH);
  return Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, proportional));
}
