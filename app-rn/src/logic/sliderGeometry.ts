// つまみの上に印を置く位置（SPEC-V9 §9.9）。**画面から切り出した算数だけを持つ。**
//
// 切り出したのは、ここが一度踏んだ罠そのものだから ── PriceSlider のつまみは
// **左端合わせ**で置かれていて、値と位置の対応は器の幅ではなく
// 「器の幅 − つまみの直径」（travel）で取られている。素直に `ratio * width` で
// 印を置くと、右へ行くほどつまみの中心から最大で**半径ぶん**（14pt）ずれる。
//
// 指の位置の読み取りでも同じずれを一度出しているので（PriceSlider の handleAt の
// コメント）、同じ算数を 2 度書かずに、試験できる形でここに 1 つだけ置く。

/** 印 1 本の左端（つまみが動く器の左端からの pt）を返す */
export function markLeft(params: {
  /** 印を出す値（円） */
  value: number;
  /** つまみが動ける値の範囲 */
  min: number;
  max: number;
  /** つまみが動ける幅 ＝ 器の幅 − つまみの直径 */
  travel: number;
  /** つまみの直径 */
  thumbSize: number;
  /** 印の太さ */
  markWidth: number;
}): number {
  const { value, min, max, travel, thumbSize, markWidth } = params;
  const span = max - min;

  // 範囲が潰れている記録（分岐点 = 今の価格 = 0）では割れない。左端に寄せる
  const ratio = span <= 0 ? 0 : clamp((value - min) / span, 0, 1);

  // `ratio * travel` は**つまみの左端**の位置。印は線として読ませたいので、
  // つまみの中心（＋半径）に合わせ、自分の太さの半分だけ戻す
  return ratio * travel + thumbSize / 2 - markWidth / 2;
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}
