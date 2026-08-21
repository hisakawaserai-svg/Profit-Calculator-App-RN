// 印の位置の算数（PriceSlider の縦線）。**つまみの中心に合うことだけを見る。**
//
// `ratio * width` で置いていると右端で半径ぶんずれる ── その取り違えを
// 「両端と中央で、つまみの中心と一致するか」で捕まえる。

import { describe, expect, it } from 'vitest';

import { markLeft } from './sliderGeometry';

/** 実物と同じ寸法（PriceSlider の THUMB_SIZE / MARK_WIDTH） */
const THUMB = 28;
const MARK = 2;
const BASE = { min: 0, max: 1000, travel: 300, thumbSize: THUMB, markWidth: MARK };

/** その値のときにつまみの中心が来る位置（＝印が合っているべき位置） */
function thumbCenter(value: number): number {
  const ratio = (value - BASE.min) / (BASE.max - BASE.min);
  return ratio * BASE.travel + THUMB / 2;
}

describe('スライダーの印の位置', () => {
  it('つまみの中心と重なる（印の太さの半分だけ左に置く）', () => {
    for (const value of [0, 250, 500, 750, 1000]) {
      expect(markLeft({ ...BASE, value })).toBeCloseTo(thumbCenter(value) - MARK / 2);
    }
  });

  it('器の幅で割っていない（右端ほどずれる取り違えを捕まえる）', () => {
    // 器の幅 = travel + thumbSize。それで割ると右端で半径ぶん右へ飛ぶ
    const container = BASE.travel + THUMB;
    const wrong = (1000 - BASE.min) / (BASE.max - BASE.min) * container - MARK / 2;
    expect(markLeft({ ...BASE, value: 1000 })).not.toBeCloseTo(wrong);
    expect(wrong - markLeft({ ...BASE, value: 1000 })).toBeCloseTo(THUMB / 2);
  });

  it('範囲の外の値は端で止まる（線の外へ出さない）', () => {
    expect(markLeft({ ...BASE, value: -500 })).toBeCloseTo(markLeft({ ...BASE, value: 0 }));
    expect(markLeft({ ...BASE, value: 9999 })).toBeCloseTo(markLeft({ ...BASE, value: 1000 }));
  });

  it('範囲が潰れていても割らない（分岐点 = 今の価格 = 0 の記録）', () => {
    expect(markLeft({ ...BASE, value: 0, min: 0, max: 0 })).toBeCloseTo(THUMB / 2 - MARK / 2);
  });

  it('幅が決まる前（travel = 0）でも落ちない', () => {
    expect(markLeft({ ...BASE, value: 500, travel: 0 })).toBeCloseTo(THUMB / 2 - MARK / 2);
  });
});
