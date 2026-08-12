// 期間の型（全期間 / 年 / 月）の判定・変換と、月バーの矢印の無効化（UI-SPEC §1.2 / §5-14）。

import { describe, expect, it } from 'vitest';

import {
  canShiftPeriod,
  isAllPeriod,
  isMonthPeriod,
  isYearPeriod,
  periodKeyLength,
  periodKind,
  periodMonthRange,
  periodYear,
  shiftMonthKey,
  shiftPeriod,
  yearPeriod,
} from './period';

describe('periodKind: 3 値の判定', () => {
  it('null = 全期間 / 4 文字 = 年 / 7 文字 = 月', () => {
    expect(periodKind(null)).toBe('all');
    expect(periodKind('2025')).toBe('year');
    expect(periodKind('2025-08')).toBe('month');
  });

  it('述語も同じ判定になる', () => {
    expect([isAllPeriod(null), isYearPeriod(null), isMonthPeriod(null)]).toEqual([
      true,
      false,
      false,
    ]);
    expect([isAllPeriod('2025'), isYearPeriod('2025'), isMonthPeriod('2025')]).toEqual([
      false,
      true,
      false,
    ]);
    expect([isAllPeriod('2025-08'), isYearPeriod('2025-08'), isMonthPeriod('2025-08')]).toEqual([
      false,
      false,
      true,
    ]);
  });
});

describe('periodYear / yearPeriod', () => {
  it('年キー・月キーのどちらからも年が取れる', () => {
    expect(periodYear('2025')).toBe(2025);
    expect(periodYear('2025-08')).toBe(2025);
    expect(periodYear(null)).toBeNull();
  });

  it('年 → 年キーは 4 桁の文字列', () => {
    expect(yearPeriod(2025)).toBe('2025');
  });
});

describe('periodKeyLength: SQL の substr に渡す長さ', () => {
  it('年は 4・月は 7。日付の先頭一致で効く', () => {
    expect(periodKeyLength('2025')).toBe(4);
    expect(periodKeyLength('2025-08')).toBe(7);
    // 保存形式 "YYYY-MM-DDTHH:mm:ss.SSS" の先頭を切り出した結果と一致する
    const saved = '2025-08-09T14:30:00.000';
    expect(saved.slice(0, periodKeyLength('2025'))).toBe('2025');
    expect(saved.slice(0, periodKeyLength('2025-08'))).toBe('2025-08');
  });

  it('全期間は期間条件を組まないので 0', () => {
    expect(periodKeyLength(null)).toBe(0);
  });
});

describe('periodMonthRange: 期間が覆う月', () => {
  it('年は 1 月から 12 月まで', () => {
    expect(periodMonthRange('2025')).toEqual({ from: '2025-01', to: '2025-12' });
  });

  it('月はその月 1 つ', () => {
    expect(periodMonthRange('2025-08')).toEqual({ from: '2025-08', to: '2025-08' });
  });

  it('全期間は範囲を持たない', () => {
    expect(periodMonthRange(null)).toBeNull();
  });
});

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

describe('shiftPeriod: 期間の種類を保ったまま前後に動かす', () => {
  it('月は前後の月へ', () => {
    expect(shiftPeriod('2026-01', -1)).toBe('2025-12');
    expect(shiftPeriod('2026-08', 1)).toBe('2026-09');
  });

  it('年は前年・翌年へ（月にはならない）', () => {
    expect(shiftPeriod('2025', -1)).toBe('2024');
    expect(shiftPeriod('2025', 1)).toBe('2026');
  });

  it('全期間は動かない', () => {
    expect(shiftPeriod(null, 1)).toBeNull();
    expect(shiftPeriod(null, -1)).toBeNull();
  });
});

describe('canShiftPeriod: 月バーの矢印の無効化（§5-14）', () => {
  const bounds = { earliestMonthKey: '2024-05', currentMonthKey: '2026-08' };

  it('月: 今月では ▶ が無効・最古の月では ◀ が無効', () => {
    expect(canShiftPeriod('2026-08', 1, bounds)).toBe(false);
    expect(canShiftPeriod('2026-08', -1, bounds)).toBe(true);
    expect(canShiftPeriod('2024-05', -1, bounds)).toBe(false);
    expect(canShiftPeriod('2024-05', 1, bounds)).toBe(true);
  });

  it('年: 今年では ▶ が無効（今年の途中でも翌年へは行けない）', () => {
    expect(canShiftPeriod('2026', 1, bounds)).toBe(false);
    expect(canShiftPeriod('2026', -1, bounds)).toBe(true);
  });

  it('年: データのある最古の年では ◀ が無効', () => {
    // 最古の記録は 2024-05。2024 年の 1 月〜4 月に記録は無いが、
    // 「2024 年」を選んでいる間は**その年より前へは行けない**
    expect(canShiftPeriod('2024', -1, bounds)).toBe(false);
    expect(canShiftPeriod('2024', 1, bounds)).toBe(true);
    expect(canShiftPeriod('2025', -1, bounds)).toBe(true);
  });

  it('全期間では両方とも無効', () => {
    expect(canShiftPeriod(null, 1, bounds)).toBe(false);
    expect(canShiftPeriod(null, -1, bounds)).toBe(false);
  });

  it('記録が 0 件なら ◀ は無効（動かす下限がない）', () => {
    const empty = { earliestMonthKey: null, currentMonthKey: '2026-08' };
    expect(canShiftPeriod('2026-08', -1, empty)).toBe(false);
    expect(canShiftPeriod('2025', -1, empty)).toBe(false);
  });
});
