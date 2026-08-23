// 価格ラインの説明の列の算数。**列どうしが重ならないことだけを見る。**
//
// チュートリアル4ページ目（値下げシミュレータ）で実際に文字が重なった ── 器の幅が
// 3 列ぶん（108pt × 3 = 324pt）より狭いページの図で、108pt 固定のまま並べたのが原因。
// `labelColumnWidth` で列の幅を器に合わせて縮めれば、どんな幅でも重ならないはず。

import { describe, expect, it } from 'vitest';

import { IDEAL_LABEL_WIDTH, labelColumnWidth, labelLefts } from './priceLineLayout';

/** 3 点（分岐点・目標・今の価格）の位置比率の例。実物の並びと同じ昇順 */
const THREE_TICK_RATIOS = [0.13, 0.38, 0.87];

describe('価格ラインの説明の列', () => {
  it('広い器では理想の幅（108pt）をそのまま使う', () => {
    expect(labelColumnWidth(400, 3)).toBe(IDEAL_LABEL_WIDTH);
  });

  it('狭い器では列の幅を「器の幅 ÷ 列の数」まで縮める', () => {
    // チュートリアルの図で実測した狭さ（ページ余白24×2＋カードpadding16×2を引いた幅）に近い値
    expect(labelColumnWidth(280, 3)).toBeCloseTo(280 / 3);
  });

  it('幅がまだ測れていない（0）ときは理想の幅を返す', () => {
    expect(labelColumnWidth(0, 3)).toBe(IDEAL_LABEL_WIDTH);
  });

  it('列の数が 0 でも落ちない', () => {
    expect(labelColumnWidth(280, 0)).toBe(IDEAL_LABEL_WIDTH);
  });

  it('広い器では列どうしが重ならない（従来どおりの並び）', () => {
    const width = 400;
    const columnWidth = labelColumnWidth(width, THREE_TICK_RATIOS.length);
    const lefts = labelLefts(THREE_TICK_RATIOS, width, columnWidth);

    for (let i = 1; i < lefts.length; i += 1) {
      expect(lefts[i]).toBeGreaterThanOrEqual(lefts[i - 1] + columnWidth - 1e-9);
    }
    expect(lefts[lefts.length - 1] + columnWidth).toBeLessThanOrEqual(width + 1e-9);
  });

  it('3 列ぶん（324pt）より狭い器でも列どうしが重ならない（実際に重なった不具合の再現）', () => {
    // チュートリアル4ページ目のカードに近い狭さ。108pt 固定のままだと隣の列と重なっていた
    for (const width of [220, 250, 280, 295, 320]) {
      const columnWidth = labelColumnWidth(width, THREE_TICK_RATIOS.length);
      const lefts = labelLefts(THREE_TICK_RATIOS, width, columnWidth);

      for (let i = 1; i < lefts.length; i += 1) {
        expect(lefts[i]).toBeGreaterThanOrEqual(lefts[i - 1] + columnWidth - 1e-9);
      }
      // 右端の列も器の外へはみ出さない
      expect(lefts[lefts.length - 1] + columnWidth).toBeLessThanOrEqual(width + 1e-9);
    }
  });

  it('極端に狭い器（1 点しかない記録・小さい端末）でも重ならず、器の外にも出ない', () => {
    const width = 120;
    const columnWidth = labelColumnWidth(width, 2);
    const lefts = labelLefts([0.5, 0.5], width, columnWidth);

    expect(lefts[1]).toBeGreaterThanOrEqual(lefts[0] + columnWidth - 1e-9);
    expect(lefts[0]).toBeGreaterThanOrEqual(0);
    expect(lefts[1] + columnWidth).toBeLessThanOrEqual(width + 1e-9);
  });

  it('幅がまだ測れていない（0）ときは全列が左端に重なる（1 フレームだけの暫定値）', () => {
    expect(labelLefts(THREE_TICK_RATIOS, 0, IDEAL_LABEL_WIDTH)).toEqual([0, 0, 0]);
  });
});
