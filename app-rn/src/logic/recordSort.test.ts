// 採用案 22b の並び替え（項目 × 方向）の単体テスト:
//   - sortRows（売れた記録は 4 行 / 出品中は販売日を落として 3 行・収支の語が変わる）
//   - 8 通りのソートキーが行のどこかに 1 回ずつ現れること（＝どれも選べる）
//   - fallbackSortType（販売日 → 出品日。方向は保つ。戻すときは動かさない）

import { describe, expect, it } from 'vitest';

import type { RecordSortType } from '@/db/repository';

import { fallbackSortType, sortRows } from './recordSort';

/** repository の ORDER BY が持つ 8 値（ここが減っていないことをテスト側でも固定する） */
const ALL_SORT_TYPES: RecordSortType[] = [
  'saleDateDesc',
  'saleDateAsc',
  'saleStartDateDesc',
  'saleStartDateAsc',
  'profitDesc',
  'profitAsc',
  'expensesDesc',
  'expensesAsc',
];

const labelsOf = (isSoldMode: boolean) => sortRows(isSoldMode).map((row) => row.label);
const valuesOf = (isSoldMode: boolean) =>
  sortRows(isSoldMode).flatMap((row) => row.segments.map((segment) => segment.value));

describe('sortRows: 売れた記録（4 行）', () => {
  it('販売日・出品日・収支・経費の 4 行がこの順に並ぶ', () => {
    expect(labelsOf(true)).toEqual(['販売日', '出品日', '収支', '経費']);
  });

  it('8 通りのソートキーがすべて 1 回ずつ選べる', () => {
    expect(valuesOf(true).slice().sort()).toEqual(ALL_SORT_TYPES.slice().sort());
  });

  it('方向は「新しい / 多い」が先で、日付と金額で語が違う', () => {
    const rows = sortRows(true);
    expect(rows[0].segments.map((segment) => segment.label)).toEqual(['新しい順', '古い順']);
    expect(rows[2].segments.map((segment) => segment.label)).toEqual(['多い順', '少ない順']);
  });
});

describe('sortRows: 出品中（3 行）', () => {
  it('販売日の行が消え、出品日が先頭になる', () => {
    expect(labelsOf(false)).toEqual(['出品日', '見込みの収支', '経費']);
  });

  it('販売日のソートキーはどこにも出さない（無効表示で残さない）', () => {
    expect(valuesOf(false)).not.toContain('saleDateDesc');
    expect(valuesOf(false)).not.toContain('saleDateAsc');
  });

  it('収支の行の値は売れた記録と同じ（語だけが「見込みの収支」になる）', () => {
    expect(sortRows(false)[1].segments.map((segment) => segment.value)).toEqual([
      'profitDesc',
      'profitAsc',
    ]);
  });
});

describe('fallbackSortType: 販売日 → 出品日', () => {
  it('出品中では販売日を出品日へ移し、方向は保つ', () => {
    expect(fallbackSortType('saleDateDesc', false)).toBe('saleStartDateDesc');
    expect(fallbackSortType('saleDateAsc', false)).toBe('saleStartDateAsc');
  });

  it('販売日以外は出品中でも動かさない', () => {
    expect(fallbackSortType('profitAsc', false)).toBe('profitAsc');
    expect(fallbackSortType('expensesDesc', false)).toBe('expensesDesc');
    expect(fallbackSortType('saleStartDateAsc', false)).toBe('saleStartDateAsc');
  });

  it('売れた記録へ戻すときは何もしない（フォールバック後の状態を維持する）', () => {
    for (const sortType of ALL_SORT_TYPES) {
      expect(fallbackSortType(sortType, true)).toBe(sortType);
    }
  });

  it('フォールバック後の値は、出品中に出ている行のどれかで選べる', () => {
    expect(valuesOf(false)).toContain(fallbackSortType('saleDateDesc', false));
    expect(valuesOf(false)).toContain(fallbackSortType('saleDateAsc', false));
  });
});
