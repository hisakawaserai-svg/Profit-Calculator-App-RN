// データタブ「前期間比較」（logic/periodComparison.ts）の純粋ロジックの検証。
// 期待値は仕様（前月比較・前年同期間比較・全期間で非表示・比較対象 0 件）から導出する。

import { describe, expect, it } from 'vitest';

import { periodComparisonMetrics, periodComparisonQuery } from './periodComparison';

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day, 12, 0, 0, 0);

describe('periodComparisonQuery: 表示中の期間 → 比較対象の月範囲', () => {
  it('月を選択中は前月と比較する', () => {
    const result = periodComparisonQuery('2026-08', d(2026, 8, 16));
    expect(result).toEqual({
      monthKeyRange: { from: '2026-07', to: '2026-07' },
      label: '7月 → 8月',
      previousLabel: '7月',
    });
  });

  it('年をまたぐ月（1月）の前月は前年の12月', () => {
    const result = periodComparisonQuery('2026-01', d(2026, 1, 15));
    expect(result?.monthKeyRange).toEqual({ from: '2025-12', to: '2025-12' });
    expect(result?.label).toBe('12月 → 1月');
  });

  it('今年を選択中は前年同期間（今年がまだ8月までなら去年も1〜8月で揃える）', () => {
    const result = periodComparisonQuery('2026', d(2026, 8, 16));
    expect(result).toEqual({
      monthKeyRange: { from: '2025-01', to: '2025-08' },
      label: '2025年1〜8月 → 2026年1〜8月',
      previousLabel: '2025年1〜8月',
    });
  });

  it('過去の完結した年を選択中は前年の1〜12月をまるごと比較する', () => {
    const result = periodComparisonQuery('2025', d(2026, 8, 16));
    expect(result).toEqual({
      monthKeyRange: { from: '2024-01', to: '2024-12' },
      label: '2024年 → 2025年',
      previousLabel: '2024年',
    });
  });

  it('全期間を選択中は比較の基準が無いので null（呼び出し側はセクションごと非表示にする）', () => {
    expect(periodComparisonQuery(null, d(2026, 8, 16))).toBeNull();
  });
});

describe('periodComparisonMetrics: 今期・前期の合計から差分・ミニバー比率を組む', () => {
  const current = { totalNetProfit: 45717, totalSales: 66550, recordCount: 9 };
  const previous = { totalNetProfit: 42517, totalSales: 61200, recordCount: 11 };

  it('金額・件数は今期 − 前期の差分を持つ', () => {
    const metrics = periodComparisonMetrics(current, previous);
    expect(metrics?.netProfit.diff).toBe(3200);
    expect(metrics?.sales.diff).toBe(5350);
    expect(metrics?.recordCount.diff).toBe(-2);
  });

  it('利益率は合計同士の比率から出し、差分は pt（ポイント）', () => {
    const metrics = periodComparisonMetrics(current, previous);
    // 66550 分の 45717 ≈ 68.7% / 61200 分の 42517 ≈ 69.5%
    expect(metrics?.profitRate.current).toBeCloseTo((45717 / 66550) * 100, 5);
    expect(metrics?.profitRate.previous).toBeCloseTo((42517 / 61200) * 100, 5);
    expect(metrics?.profitRate.diffPt).toBeCloseTo(
      (45717 / 66550) * 100 - (42517 / 61200) * 100,
      5,
    );
  });

  it('ミニバー比率は今期・前期のうち大きい方を 1 とする', () => {
    const metrics = periodComparisonMetrics(current, previous);
    expect(metrics?.sales.previousRatio).toBeCloseTo(61200 / 66550, 5);
    expect(metrics?.sales.currentRatio).toBe(1);
  });

  it('今期がマイナス収支でもミニバー比率は 0 未満にならない（負のバー幅を作らない）', () => {
    const metrics = periodComparisonMetrics(
      { totalNetProfit: -1000, totalSales: 5000, recordCount: 2 },
      { totalNetProfit: 3000, totalSales: 5000, recordCount: 2 },
    );
    expect(metrics?.netProfit.currentRatio).toBe(0);
    expect(metrics?.netProfit.previousRatio).toBe(1);
  });

  it('比較対象（前期）に売却済み記録が 1 件も無ければ null', () => {
    expect(periodComparisonMetrics(current, { totalNetProfit: 0, totalSales: 0, recordCount: 0 })).toBeNull();
  });

  it('前期の売上合計が 0（記録はあるが不用品など）なら利益率は null', () => {
    const metrics = periodComparisonMetrics(current, {
      totalNetProfit: 0,
      totalSales: 0,
      recordCount: 1,
    });
    expect(metrics?.profitRate.previous).toBeNull();
    expect(metrics?.profitRate.diffPt).toBeNull();
  });

  describe('perRecordProfit（5 項目目・新規）: 既存の periodProfitPerRecord を対象期間だけずらして再利用する', () => {
    it('今期・前期とも 1 件あたり純利益（= 純利益合計 ÷ 件数）を持ち、差分は今期 − 前期', () => {
      const metrics = periodComparisonMetrics(current, previous);
      const expectedCurrent = 45717 / 9;
      const expectedPrevious = 42517 / 11;
      expect(metrics?.perRecordProfit.current).toBeCloseTo(expectedCurrent, 9);
      expect(metrics?.perRecordProfit.previous).toBeCloseTo(expectedPrevious, 9);
      expect(metrics?.perRecordProfit.diff).toBeCloseTo(expectedCurrent - expectedPrevious, 9);
    });

    it('ミニバー比率は今期・前期のうち大きい方を 1 とする（金額・件数と同じ規則）', () => {
      const metrics = periodComparisonMetrics(current, previous);
      // 45717/9 ≈ 5079.67 のほうが 42517/11 ≈ 3865.18 より大きいので、今期側が 1
      expect(metrics?.perRecordProfit.currentRatio).toBe(1);
      expect(metrics?.perRecordProfit.previousRatio).toBeCloseTo(
        42517 / 11 / (45717 / 9),
        9,
      );
    });

    it('対象期間の件数が 0 件なら「ーー」相当の null（前期が 0 件なのは periodComparisonMetrics 自体が null を返すので、ここでは今期が 0 件の場合を確認する）', () => {
      // 前期の recordCount が 0 の経路は periodComparisonMetrics 自体が null を返す
      // （上の「比較対象（前期）に売却済み記録が 1 件も無ければ null」のテストで確認済み）。
      // ここでは「前期にはデータがあるが、今期はまだ 1 件も売れていない月」を確認する ──
      // この場合は periodComparisonMetrics 自体は null にならず、perRecordProfit だけが
      // null（呼び出し側は AMOUNT_PLACEHOLDER「ーー」を出す）になる。
      const metrics = periodComparisonMetrics(
        { totalNetProfit: 0, totalSales: 0, recordCount: 0 },
        previous,
      );
      expect(metrics?.perRecordProfit.current).toBeNull();
      expect(metrics?.perRecordProfit.diff).toBeNull();
      expect(metrics?.perRecordProfit.currentRatio).toBe(0);
      expect(metrics?.perRecordProfit.previousRatio).toBe(0);
    });
  });
});
