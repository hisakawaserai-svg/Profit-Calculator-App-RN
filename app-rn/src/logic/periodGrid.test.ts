// UI-SPEC §1.2「期間シート」の月グリッドの規則を検証する。
// 期待値は UI-SPEC の記述から導出している（実装からの逆算ではない）。

import { describe, expect, it } from 'vitest';

import { periodGrid } from './periodGrid';

const grid = (currentMonthKey: string, monthsWithRecords: string[] = []) =>
  periodGrid({ currentMonthKey, monthsWithRecords });

describe('出す年の範囲: 今年から「記録の最も古い月を含む年」まで（降順）', () => {
  it('最古の記録の年まで、今年から降順に並ぶ', () => {
    const blocks = grid('2026-08', ['2024-11', '2025-03', '2026-08']);
    expect(blocks.map((block) => block.year)).toEqual([2026, 2025, 2024]);
  });

  it('記録が 1 件もないときは今年だけ（グリッドを空にしない）', () => {
    expect(grid('2026-08').map((block) => block.year)).toEqual([2026]);
  });

  it('記録が今年だけなら今年だけ', () => {
    expect(grid('2026-08', ['2026-01']).map((block) => block.year)).toEqual([2026]);
  });
});

describe('各年は 1〜12 月を必ず全部出す', () => {
  it('最古の記録より前の月も未来の月も枠としては出る', () => {
    const blocks = grid('2026-08', ['2026-08']);
    expect(blocks[0].months.map((cell) => cell.month)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);
    expect(blocks[0].months.map((cell) => cell.monthKey)).toContain('2026-12');
  });

  it('どの年も 12 マス', () => {
    for (const block of grid('2026-08', ['2024-01'])) {
      expect(block.months).toHaveLength(12);
    }
  });
});

describe('マスの状態: 記録の有無と未来かどうか', () => {
  const blocks = grid('2026-08', ['2026-03', '2026-08']);
  const cell = (monthKey: string) =>
    blocks.flatMap((block) => block.months).find((c) => c.monthKey === monthKey)!;

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
    const december = grid('2025-12', ['2025-01']);
    const cells = december.flatMap((block) => block.months);
    expect(cells.find((c) => c.monthKey === '2025-12')!.isFuture).toBe(false);
    expect(cells.find((c) => c.monthKey === '2025-11')!.isFuture).toBe(false);
  });
});
