// UI-SPEC §5-2「N 日経過」の数え方。暦日差で、出品日当日は 0 日。

import { describe, expect, it } from 'vitest';

import { daysBetween, listingDays } from './listingDays';

describe('daysBetween: 時刻ではなく暦日で数える', () => {
  it('同じ日なら時刻が違っても 0 日', () => {
    expect(daysBetween(new Date(2026, 7, 2, 0, 5), new Date(2026, 7, 2, 23, 55))).toBe(0);
  });

  it('日付が 1 つ進めば 1 日（時刻差が 20 分でも）', () => {
    expect(daysBetween(new Date(2026, 7, 2, 23, 50), new Date(2026, 7, 3, 0, 10))).toBe(1);
  });

  it('UI-SPEC §5-2 の例: 8/2 出品 → 8/9 販売 は 7 日', () => {
    expect(daysBetween(new Date(2026, 7, 2, 9, 0), new Date(2026, 7, 9, 9, 0))).toBe(7);
  });

  it('月をまたいでも暦日差になる', () => {
    expect(daysBetween(new Date(2026, 6, 30), new Date(2026, 7, 2))).toBe(3);
  });

  it('基準日が前なら負の値を返す', () => {
    expect(daysBetween(new Date(2026, 7, 5), new Date(2026, 7, 3))).toBe(-2);
  });
});

describe('listingDays: 基準日は 売却済み = saleDate / 出品中 = 今日', () => {
  const saleStartDate = new Date(2026, 7, 2, 10, 0);

  it('売却済みは出品日から販売日までを数える（今日は使わない）', () => {
    const days = listingDays(
      { saleStartDate, saleDate: new Date(2026, 7, 9, 8, 0) },
      new Date(2026, 7, 31),
    );

    expect(days).toBe(7);
  });

  it('出品中は出品日から今日までを数える', () => {
    expect(listingDays({ saleStartDate, saleDate: null }, new Date(2026, 7, 10))).toBe(8);
  });

  it('出品当日は 0 日', () => {
    expect(listingDays({ saleStartDate, saleDate: null }, new Date(2026, 7, 2, 23, 0))).toBe(0);
  });
});
