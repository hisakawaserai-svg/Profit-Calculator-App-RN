// SPEC.md §6.2（DataView の期間・Y 軸・ラベル）の検証テスト。
// 期待値はすべて SPEC の記述から導出している（実装からの逆算ではない）。

import { describe, expect, it } from 'vitest';

import {
  addCalendarUnit,
  defaultPeriod,
  formatChartLabel,
  formatPointDate,
  shiftPeriod,
  yAxisLowerBound,
  yAxisUpperBound,
  type ChartUnit,
} from './analytics';

/** ローカル時刻の Date を組み立てる（DB もローカル暦で扱うため） */
const d = (y: number, m: number, day: number, h = 12, min = 0) =>
  new Date(y, m - 1, day, h, min, 0, 0);

describe('§6.2 表示単位切替時の期間リセット（明細/日別=7日, 月別=6ヶ月, 年別=4年）', () => {
  const now = d(2026, 8, 9);

  it.each([
    ['record' as ChartUnit, d(2026, 8, 2)],
    ['day' as ChartUnit, d(2026, 8, 2)],
    ['month' as ChartUnit, d(2026, 2, 9)],
    ['year' as ChartUnit, d(2022, 8, 9)],
  ])('%s の開始日', (unit, expectedStart) => {
    const period = defaultPeriod(unit, now);
    expect(period.startDate).toEqual(expectedStart);
    // 終了日は常に「今」（SPEC §6.2 / §4.3 初期値 endDate = 今）
    expect(period.endDate).toEqual(now);
  });

  it('月の加算で月末を超える日はその月の末日に丸める（Swift の Calendar と同じ挙動）', () => {
    // 8/31 の 6 ヶ月前は 2/31 → 存在しないので 2/28（2026 年は平年）
    const period = defaultPeriod('month', d(2026, 8, 31));
    expect(period.startDate).toEqual(d(2026, 2, 28));
    // JS の Date の素朴な繰り上がり（3/3）になっていないこと
    expect(period.startDate.getMonth()).toBe(1);
  });

  it('うるう年の 2/29 から 1 年前後へ動かすと 2/28 に丸まる', () => {
    expect(addCalendarUnit(d(2024, 2, 29), 'year', 1)).toEqual(d(2025, 2, 28));
    expect(addCalendarUnit(d(2024, 2, 29), 'year', -1)).toEqual(d(2023, 2, 28));
  });
});

describe('§6.2 ◀▶ による単位ぶんの平行移動', () => {
  const period = { startDate: d(2026, 8, 2), endDate: d(2026, 8, 9) };

  it('明細・日別は 1 日ずつ動く', () => {
    expect(shiftPeriod(period, 'day', 1)).toEqual({
      startDate: d(2026, 8, 3),
      endDate: d(2026, 8, 10),
    });
    expect(shiftPeriod(period, 'record', -1)).toEqual({
      startDate: d(2026, 8, 1),
      endDate: d(2026, 8, 8),
    });
  });

  it('月別は 1 ヶ月、年別は 1 年ずつ動く', () => {
    expect(shiftPeriod(period, 'month', -1)).toEqual({
      startDate: d(2026, 7, 2),
      endDate: d(2026, 7, 9),
    });
    expect(shiftPeriod(period, 'year', 1)).toEqual({
      startDate: d(2027, 8, 2),
      endDate: d(2027, 8, 9),
    });
  });

  it('開始・終了を同じ量だけ動かすので期間の幅は変わらない', () => {
    const width = period.endDate.getTime() - period.startDate.getTime();
    for (const unit of ['record', 'day'] as ChartUnit[]) {
      const moved = shiftPeriod(period, unit, 3);
      expect(moved.endDate.getTime() - moved.startDate.getTime()).toBe(width);
    }
  });

  it('往復すると元に戻る', () => {
    expect(shiftPeriod(shiftPeriod(period, 'month', 1), 'month', -1)).toEqual(period);
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

  it('純利益が全部マイナスでも上限は 1150（max の下駄が効く）', () => {
    expect(yAxisUpperBound([-500, -200])).toBe(1150);
  });
});

describe('Y 軸下限（負の純利益を軸下に隠さないための拡張）', () => {
  it('負値がなければ Swift 版と同じ 0', () => {
    expect(yAxisLowerBound([])).toBe(0);
    expect(yAxisLowerBound([100, 2000])).toBe(0);
  });

  it('負値があれば最小値 × 1.15 まで下へ広げる', () => {
    expect(yAxisLowerBound([100, -400])).toBeCloseTo(-460, 10);
  });
});

describe('§6.2 軸ラベル・内訳見出しの書式', () => {
  const date = d(2026, 8, 9, 14, 30);

  it('X 軸ラベルは 明細/日別 = MM/DD、月別 = YYYY/MM、年別 = YYYY', () => {
    expect(formatChartLabel(date, 'record')).toBe('08/09');
    expect(formatChartLabel(date, 'day')).toBe('08/09');
    expect(formatChartLabel(date, 'month')).toBe('2026/08');
    expect(formatChartLabel(date, 'year')).toBe('2026');
  });

  it('内訳の見出しは単位の粒度に合わせる（明細は同日の複数点を時刻で見分ける）', () => {
    expect(formatPointDate(date, 'record')).toBe('2026/08/09 14:30');
    expect(formatPointDate(date, 'day')).toBe('2026/08/09');
    expect(formatPointDate(date, 'month')).toBe('2026年08月');
    expect(formatPointDate(date, 'year')).toBe('2026年');
  });
});
