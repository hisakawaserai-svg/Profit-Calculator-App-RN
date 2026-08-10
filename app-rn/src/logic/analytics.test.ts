// データタブ（UI-SPEC §1.5 / 採用案 7b）の純粋ロジックの検証。
// 期待値はすべて UI-SPEC / SPEC の記述から導出している（実装からの逆算ではない）。
//
// 旧テストが検証していた期間リセット（明細/日別=7日…）と ◀▶ の平行移動は、
// 期間指定 UI そのものの廃止で対象の関数ごとなくなった（§5-5 / §6-10）。

import { describe, expect, it } from 'vitest';

import {
  chartUnitFor,
  formatChartLabel,
  formatPointDate,
  yAxisLowerBound,
  yAxisUpperBound,
} from './analytics';

/** ローカル時刻の Date を組み立てる（DB もローカル暦で扱うため） */
const d = (y: number, m: number, day: number, h = 12, min = 0) =>
  new Date(y, m - 1, day, h, min, 0, 0);

describe('§5-5 刻みは期間から自動で決まる（月を選択 = 日ごと / 全期間 = 月ごと）', () => {
  it('月を選んでいれば日ごと', () => {
    expect(chartUnitFor('2026-08')).toBe('day');
    expect(chartUnitFor('2025-01')).toBe('day');
  });

  it('全期間（null）なら月ごと', () => {
    expect(chartUnitFor(null)).toBe('month');
  });
});

describe('§6.2 Y 軸上限 = max(1000, データ最大値) × 1.15', () => {
  it('データが 1000 以下なら 1000 × 1.15 = 1150', () => {
    expect(yAxisUpperBound([])).toBe(1150);
    expect(yAxisUpperBound([500, 300])).toBe(1150);
    expect(yAxisUpperBound([1000])).toBe(1150);
  });

  it('データが 1000 を超えたらその最大値 × 1.15', () => {
    expect(yAxisUpperBound([2000, 500])).toBeCloseTo(2300, 10);
  });

  it('収支が全部マイナスでも上限は 1150（max の下駄が効く）', () => {
    expect(yAxisUpperBound([-500, -200])).toBe(1150);
  });
});

describe('Y 軸下限（負の収支を軸下に隠さないための拡張）', () => {
  it('負値がなければ Swift 版と同じ 0', () => {
    expect(yAxisLowerBound([])).toBe(0);
    expect(yAxisLowerBound([100, 2000])).toBe(0);
  });

  it('負値があれば最小値 × 1.15 まで下へ広げる', () => {
    expect(yAxisLowerBound([100, -400])).toBeCloseTo(-460, 10);
  });
});

describe('§6.2 / §1.5-5 軸ラベル・選択した棒の見出しの書式', () => {
  const date = d(2026, 8, 9, 14, 30);

  it('X 軸ラベルは 日ごと = MM/DD、月ごと = YYYY/MM', () => {
    expect(formatChartLabel(date, 'day')).toBe('08/09');
    expect(formatChartLabel(date, 'month')).toBe('2026/08');
  });

  it('選択した棒の見出しは刻みの粒度に合わせる', () => {
    expect(formatPointDate(date, 'day')).toBe('8月9日');
    expect(formatPointDate(date, 'month')).toBe('2026年8月');
  });
});
