// 枠の高さを**読み込む前に**当てるための計算。外れると読み込み後に一覧の下端が跳ねるので、
// 基準・上下限・実測値の 3 種類を固定しておく。

import { describe, expect, it } from 'vitest';

import { anchoredBannerHeight } from './bannerSize';

describe('anchoredBannerHeight', () => {
  it('基準の幅（320pt）では 50pt', () => {
    expect(anchoredBannerHeight(320)).toBe(50);
  });

  it('iPhone 17 Pro の幅（402pt）では 63pt（シミュレータで実測した値）', () => {
    expect(anchoredBannerHeight(402)).toBe(63);
  });

  it('幅に比例して高くなる', () => {
    expect(anchoredBannerHeight(360)).toBeGreaterThan(anchoredBannerHeight(320));
    expect(anchoredBannerHeight(430)).toBeGreaterThan(anchoredBannerHeight(402));
  });

  it('狭い端末でも 50pt を下回らない', () => {
    expect(anchoredBannerHeight(280)).toBe(50);
    expect(anchoredBannerHeight(1)).toBe(50);
  });

  it('広い端末でも 90pt を上回らない（タブレット・横向き）', () => {
    expect(anchoredBannerHeight(1024)).toBe(90);
    expect(anchoredBannerHeight(2048)).toBe(90);
  });

  it('幅が決まっていないときは下限の高さを返す（高さ 0 の枠を作らない）', () => {
    expect(anchoredBannerHeight(0)).toBe(50);
    expect(anchoredBannerHeight(-1)).toBe(50);
    expect(anchoredBannerHeight(Number.NaN)).toBe(50);
  });
});
