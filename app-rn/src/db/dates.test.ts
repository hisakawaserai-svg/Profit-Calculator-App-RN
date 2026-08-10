// 月バー（UI-SPEC §1.2）が使う月キーの演算。

import { describe, expect, it } from 'vitest';

import { monthKeysBetween, shiftMonthKey, toMonthKey } from './dates';

describe('shiftMonthKey', () => {
  it('1 か月進める / 戻す', () => {
    expect(shiftMonthKey('2026-08', 1)).toBe('2026-09');
    expect(shiftMonthKey('2026-08', -1)).toBe('2026-07');
  });

  it('年をまたぐ', () => {
    expect(shiftMonthKey('2026-12', 1)).toBe('2027-01');
    expect(shiftMonthKey('2026-01', -1)).toBe('2025-12');
  });

  it('2 桁ゼロ埋めを保つ（文字列比較で大小が判定できること）', () => {
    expect(shiftMonthKey('2026-10', -1)).toBe('2026-09');
    expect('2026-09' < '2026-10').toBe(true);
  });
});

describe('monthKeysBetween: 期間シートの選択肢（新しい順）', () => {
  it('両端を含めて新しい順に並ぶ', () => {
    expect(monthKeysBetween('2026-06', '2026-08')).toEqual(['2026-08', '2026-07', '2026-06']);
  });

  it('同じ月なら 1 つだけ', () => {
    expect(monthKeysBetween('2026-08', '2026-08')).toEqual(['2026-08']);
  });

  it('from が to より後なら空', () => {
    expect(monthKeysBetween('2026-09', '2026-08')).toEqual([]);
  });

  it('年をまたいで連続する', () => {
    expect(monthKeysBetween('2025-11', '2026-02')).toEqual([
      '2026-02',
      '2026-01',
      '2025-12',
      '2025-11',
    ]);
  });

  it('toMonthKey と同じ形式を返す', () => {
    expect(monthKeysBetween('2026-03', '2026-03')[0]).toBe(toMonthKey(new Date(2026, 2, 15)));
  });
});
