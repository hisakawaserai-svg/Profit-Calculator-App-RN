// 価格ラインの説明の列（金額＋キャプション）の横位置（SPEC-V9 §9.8）。
// **画面から切り出した算数だけを持つ。**
//
// 列は本来 108pt を取りたいが、これは「器の幅が 3 列ぶん（324pt）以上ある」ことを
// 前提にした値 ── 前提が崩れる場所が実在する。チュートリアル・使いかたの図は
// 実物の画面より内側に余分な余白（ページの余白＋カードの padding）を重ねて持つため、
// 同じ 3 点（分岐点・目標・今の価格）でも実物の画面より器が狭い。
// 108pt を測らず使うと、狭い器では列どうしが重なって文字が読めなくなる
// （チュートリアル4ページ目で実際に起きた不具合）。
//
// **列の幅を器の幅に合わせて縮める**（`labelColumnWidth`）ことで、どんな器の幅でも
// 列が重ならないことを保証する。狭い器では列の中の文字が省略される
// （`numberOfLines={1}` 側の仕事）が、重なって読めなくなるよりはましな劣化。

/** 説明の列 1 つの理想の幅。器が十分広ければこの幅を使う */
export const IDEAL_LABEL_WIDTH = 108;

/**
 * 説明の列 1 つの実際の幅。**器の幅を列の数で割った値を超えない。**
 * こうしておけば、あとの `labelLefts` が列どうしを重ねずに並べきれる
 * （count 列 × columnWidth ≤ width が常に成り立つ）。
 *
 * 幅がまだ測れていない（0）ときは理想の幅をそのまま返す（PriceLine の労コメントと同じ理由 ──
 * onLayout は同じフレームで返るので目には見えない）。
 */
export function labelColumnWidth(width: number, count: number): number {
  if (width <= 0 || count <= 0) return IDEAL_LABEL_WIDTH;
  return Math.min(IDEAL_LABEL_WIDTH, width / count);
}

/**
 * 説明の列の左端（左の点から順に）。点の真下（中央合わせ）に置き、
 * **近すぎる隣とは押し合って離す**。
 *
 * 押し合いが要るのは、点が寄る組み合わせが普通にあるため ── 赤字の記録では
 * 今の価格と分岐点が数百円しか離れないことがあり、そのまま真下に置くと
 * 「今の価格」と「ここで利益ゼロ」の文字が重なって 1 つの語に読める。
 *
 * 手順は 3 つ: 真下に置く → 左から順に最小間隔を空ける → 右端からはみ出したぶんを左へ戻す。
 * `labelWidth` は `labelColumnWidth` の返り値を渡す前提 ── 列の数 × 幅が器の幅を
 * 超えない値なので、最後の右→左のパスで潰れずに収まる。
 *
 * 幅がまだ測れていない（0）ときは全部 0（1 フレームだけ左端に重なる）。
 */
export function labelLefts(ratios: readonly number[], width: number, labelWidth: number): number[] {
  if (width <= 0) return ratios.map(() => 0);

  const max = Math.max(0, width - labelWidth);
  const lefts = ratios.map((ratio) => Math.min(Math.max(0, ratio * width - labelWidth / 2), max));

  for (let i = 1; i < lefts.length; i += 1) {
    lefts[i] = Math.max(lefts[i], lefts[i - 1] + labelWidth);
  }
  for (let i = lefts.length - 1; i >= 0; i -= 1) {
    const limit = i === lefts.length - 1 ? max : lefts[i + 1] - labelWidth;
    lefts[i] = Math.max(0, Math.min(lefts[i], limit));
  }
  return lefts;
}
