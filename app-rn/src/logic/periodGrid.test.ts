// UI-SPEC §1.2「期間シート」（案 39b: カード 1 枚 ＋ 見出しの矢印で年を送る）の
// 月グリッドの規則を検証する。期待値は UI-SPEC の記述から導出している（実装からの逆算ではない）。

import { describe, expect, it } from 'vitest';

import { gridYearRange, periodGrid } from './periodGrid';

const grid = (year: number, currentMonthKey: string, monthsWithRecords: string[] = []) =>
  periodGrid({ year, currentMonthKey, monthsWithRecords });

describe('出せる年の範囲: 今年から「記録の最も古い月を含む年」まで', () => {
  it('最古の記録の年が下端になる', () => {
    expect(gridYearRange({ currentMonthKey: '2026-08', monthsWithRecords: ['2024-11', '2025-03'] }))
      .toEqual({ oldest: 2024, newest: 2026 });
  });

  it('記録が 1 件もないときは今年だけ（グリッドを空にしない）', () => {
    expect(gridYearRange({ currentMonthKey: '2026-08', monthsWithRecords: [] })).toEqual({
      oldest: 2026,
      newest: 2026,
    });
  });
});

describe('カードは常に 1 枚（案 39b）', () => {
  it('指定した年の 1〜12 月を返す', () => {
    const block = grid(2025, '2026-08', ['2024-11', '2025-03']);

    expect(block.year).toBe(2025);
    expect(block.months.map((cell) => cell.month)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);
    // 最古の記録より前の月も未来の月も枠としては出る
    expect(block.months.map((cell) => cell.monthKey)).toContain('2025-01');
    expect(grid(2026, '2026-08').months.map((cell) => cell.monthKey)).toContain('2026-12');
  });

  it('範囲の外の年は端に丸める（記録が消えて範囲が縮んでも空にならない）', () => {
    expect(grid(2020, '2026-08', ['2024-11']).year).toBe(2024);
    expect(grid(2030, '2026-08', ['2024-11']).year).toBe(2026);
  });
});

describe('見出しの ‹ › の無効化（§5-14 と同じ考え方）', () => {
  const records = ['2024-11', '2026-08'];

  it('今年では › が無効（未来の年は出さない）', () => {
    expect(grid(2026, '2026-08', records)).toMatchObject({
      canGoBack: true,
      canGoForward: false,
    });
  });

  it('データのある最古の年では ‹ が無効', () => {
    expect(grid(2024, '2026-08', records)).toMatchObject({
      canGoBack: false,
      canGoForward: true,
    });
  });

  it('間の年では両方とも押せる', () => {
    expect(grid(2025, '2026-08', records)).toMatchObject({
      canGoBack: true,
      canGoForward: true,
    });
  });

  it('記録が今年だけなら両方とも無効（動かす先がない）', () => {
    expect(grid(2026, '2026-08', ['2026-01'])).toMatchObject({
      canGoBack: false,
      canGoForward: false,
    });
  });
});

describe('マスの状態: 記録の有無と未来かどうか', () => {
  const block = grid(2026, '2026-08', ['2026-03', '2026-08']);
  const cell = (monthKey: string) => block.months.find((c) => c.monthKey === monthKey)!;

  it('記録のある月は hasRecord', () => {
    expect(cell('2026-03').hasRecord).toBe(true);
    expect(cell('2026-08').hasRecord).toBe(true);
  });

  it('記録のない過去の月は hasRecord = false・未来ではない（薄いが押せる）', () => {
    expect(cell('2026-04')).toMatchObject({ hasRecord: false, isFuture: false });
  });

  it('今月は未来に含めない（今月は選べる）', () => {
    expect(cell('2026-08').isFuture).toBe(false);
  });

  it('今月より後は未来（薄さは記録なしと同じで、押せないだけ）', () => {
    expect(cell('2026-09')).toMatchObject({ hasRecord: false, isFuture: true });
    expect(cell('2026-12').isFuture).toBe(true);
  });

  it('年をまたいでも月キーの比較で未来が決まる', () => {
    const december = grid(2025, '2025-12', ['2025-01']);
    expect(december.months.find((c) => c.monthKey === '2025-12')!.isFuture).toBe(false);
    expect(december.months.find((c) => c.monthKey === '2025-11')!.isFuture).toBe(false);
  });

  it('過去の年はすべて未来ではない（12 月まで押せる）', () => {
    const past = grid(2025, '2026-08', ['2025-01']);
    expect(past.months.every((c) => !c.isFuture)).toBe(true);
  });
});
