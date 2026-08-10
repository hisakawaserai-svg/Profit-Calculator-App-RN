// UI-SPEC §8.5「日付の制約」の検証。
// 範囲そのもの（[出品日, 今日]）と、出品日が未来のときの派生決定 3 を担保する。

import { describe, expect, it } from 'vitest';

import { clampToRange, initialSaleDate, saleDateRange } from './saleDate';

/** 時刻付きで作る。暦日で判定していることを見るため、境界の日は 0:00 / 23:59 を使う */
const at = (year: number, month: number, day: number, hour = 12, minute = 0) =>
  new Date(year, month - 1, day, hour, minute);

describe('saleDateRange: 選択範囲は [出品日, 今日]', () => {
  it('出品日が過去なら下限 = 出品日・上限 = 今日', () => {
    const range = saleDateRange(at(2026, 8, 2), at(2026, 8, 10));

    expect(range.min).toEqual(at(2026, 8, 2));
    expect(range.max).toEqual(at(2026, 8, 10));
  });

  it('当日出品・当日販売（範囲が 1 日しかない）でも同じ扱い', () => {
    const range = saleDateRange(at(2026, 8, 10, 9), at(2026, 8, 10, 23, 59));

    expect(range.min).toEqual(at(2026, 8, 10, 9));
    expect(range.max).toEqual(at(2026, 8, 10, 23, 59));
  });

  it('出品日が未来なら上限を出品日まで押し上げる（範囲を空にしない）', () => {
    const range = saleDateRange(at(2026, 8, 20), at(2026, 8, 10));

    expect(range.min).toEqual(at(2026, 8, 20));
    expect(range.max).toEqual(at(2026, 8, 20));
  });
});

describe('clampToRange: 範囲外は境界へ寄せる（時刻は元の値のまま）', () => {
  const range = saleDateRange(at(2026, 8, 2), at(2026, 8, 10));

  it('範囲内はそのまま', () => {
    const value = at(2026, 8, 5, 3, 30);

    expect(clampToRange(value, range)).toBe(value);
  });

  it('下限より前は下限の日付になる', () => {
    expect(clampToRange(at(2026, 7, 30, 3, 30), range)).toEqual(at(2026, 8, 2, 3, 30));
  });

  it('上限より後は上限の日付になる', () => {
    expect(clampToRange(at(2026, 8, 31, 3, 30), range)).toEqual(at(2026, 8, 10, 3, 30));
  });

  it('境界と同じ暦日なら時刻が前後していても範囲内', () => {
    const early = at(2026, 8, 2, 0, 0);
    const late = at(2026, 8, 10, 23, 59);

    expect(clampToRange(early, range)).toBe(early);
    expect(clampToRange(late, range)).toBe(late);
  });
});

describe('initialSaleDate:「売れた」を押した時点で入る日付（§8.1）', () => {
  it('通常は今日', () => {
    const today = at(2026, 8, 10, 15, 45);

    expect(initialSaleDate(at(2026, 8, 2), today)).toBe(today);
  });

  it('出品当日でも今日', () => {
    const today = at(2026, 8, 10, 15, 45);

    expect(initialSaleDate(at(2026, 8, 10, 9), today)).toBe(today);
  });

  it('出品日が未来なら出品日（派生決定 3。今日を入れると制約を破る）', () => {
    expect(initialSaleDate(at(2026, 8, 20), at(2026, 8, 10, 15, 45))).toEqual(
      at(2026, 8, 20, 15, 45),
    );
  });
});
