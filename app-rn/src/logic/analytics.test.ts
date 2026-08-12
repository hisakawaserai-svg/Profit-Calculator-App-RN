// データタブ（UI-SPEC §1.5 / 採用案 7b）の純粋ロジックの検証。
// 期待値はすべて UI-SPEC / SPEC の記述から導出している（実装からの逆算ではない）。
//
// 旧テストが検証していた期間リセット（明細/日別=7日…）と ◀▶ の平行移動は、
// 期間指定 UI そのものの廃止で対象の関数ごとなくなった（§5-5 / §6-10）。

import { describe, expect, it } from 'vitest';

import { roundForDisplay } from './profit';

import {
  chartSlots,
  chartSpan,
  chartUnitFor,
  cumulativeProfits,
  densifySeries,
  dualAxisBounds,
  formatChartLabel,
  formatPointDate,
  labelSlotIndices,
  nearestRecordedIndex,
  yAxisLowerBound,
  yAxisUpperBound,
  YEAR_UNIT_MONTH_THRESHOLD,
  type ChartPoint,
} from './analytics';

/** ローカル時刻の Date を組み立てる（DB もローカル暦で扱うため） */
const d = (y: number, m: number, day: number, h = 12, min = 0) =>
  new Date(y, m - 1, day, h, min, 0, 0);

describe('§5-5 刻みは期間から自動で決まる（月 = 日ごと / 全期間 = 月ごと・36 か月超で年ごと）', () => {
  const today = d(2026, 8, 10);

  it('月を選んでいれば日ごと（記録がどれだけ古くても変わらない）', () => {
    expect(chartUnitFor({ monthKey: '2026-08', earliestMonthKey: '2026-01', today })).toBe('day');
    expect(chartUnitFor({ monthKey: '2025-01', earliestMonthKey: '2015-01', today })).toBe('day');
  });

  it('全期間で 36 か月以内なら月ごと', () => {
    // 2026-08 から見て 2024-09 は 24 か月ぶん
    expect(chartUnitFor({ monthKey: null, earliestMonthKey: '2024-09', today })).toBe('month');
    // 同じ月に 1 件だけ = 1 か月
    expect(chartUnitFor({ monthKey: null, earliestMonthKey: '2026-08', today })).toBe('month');
  });

  it('境界: ちょうど 36 か月は月ごと、37 か月から年ごと', () => {
    // 2023-09 〜 2026-08 は両端を含めて 36 か月
    expect(chartUnitFor({ monthKey: null, earliestMonthKey: '2023-09', today })).toBe('month');
    // 1 か月古いだけで 37 か月になり、切り替わる
    expect(chartUnitFor({ monthKey: null, earliestMonthKey: '2023-08', today })).toBe('year');
  });

  it('全期間で 37 か月以上なら年ごと（5 年ぶんの棒 60 本を作らない）', () => {
    expect(chartUnitFor({ monthKey: null, earliestMonthKey: '2021-09', today })).toBe('year');
    expect(chartUnitFor({ monthKey: null, earliestMonthKey: '2015-01', today })).toBe('year');
  });

  it('全期間で記録が 1 件もなければ月ごと（軸そのものが引けない）', () => {
    expect(chartUnitFor({ monthKey: null, earliestMonthKey: null, today })).toBe('month');
  });

  it('閾値は 36 か月（画面ではなくここに閉じている）', () => {
    expect(YEAR_UNIT_MONTH_THRESHOLD).toBe(36);
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

describe('UI-SPEC §1.5-4 累計収支（折れ線）', () => {
  it('期間の先頭からの running sum', () => {
    expect(cumulativeProfits([100, 200, 50])).toEqual([100, 300, 350]);
  });

  it('赤字の点では下がる（単調増加とは限らない）', () => {
    expect(cumulativeProfits([100, -300, 50])).toEqual([100, -200, -150]);
  });

  it('最後の値は期間の合計と一致する（合計行と食い違わないこと）', () => {
    const values = [1200, -400, 900];
    const cumulative = cumulativeProfits(values);
    expect(cumulative[cumulative.length - 1]).toBe(
      values.reduce((sum, value) => sum + value, 0),
    );
  });

  /**
   * **折れ線の終点と集計段の「この月の収支」が必ず同じ値になること**（UI-SPEC §1.5-4）。
   *
   * 決定 §7-2 / §2.6 のとおり「Double で合算 → 表示の瞬間に丸め」なので、
   * 一致すべきなのは**丸める前**の値と、**同じ丸めを 1 回だけ通した後**の表示。
   * 手数料は率で掛かるので刻みごとの収支に小数が出得る（1055 円の 10% = 105.5 円）──
   * ここで**点ごとに丸めてから足す**と合計が数円ずれる。それが起きないことを固定する。
   */
  it('小数を含む点でも、終点は「合算してから丸めた」値と一致する（点ごとに丸めない。§7-2）', () => {
    // 手数料 10% で端数が出る額を並べる（1055 円の 10% = 105.5 円 → 収支 949.5 円 …）
    const values = [1055.5, 2000.5, 980.5];
    const total = values.reduce((sum, value) => sum + value, 0);
    const cumulative = cumulativeProfits(values);

    // 丸める前の値どうしが一致する（グラフの終点＝期間の合計）
    expect(cumulative[cumulative.length - 1]).toBeCloseTo(total, 10);
    // 表示（roundForDisplay を 1 回だけ通した後）も一致する
    expect(roundForDisplay(cumulative[cumulative.length - 1])).toBe(roundForDisplay(total));
    // 点ごとに丸めてから足すと合計がずれる（この経路を採らないことの確認）
    const roundedFirst = values.reduce((sum, value) => sum + roundForDisplay(value), 0);
    expect(roundedFirst).not.toBe(roundForDisplay(total));
  });

  it('点が 1 つもなければ空', () => {
    expect(cumulativeProfits([])).toEqual([]);
  });
});

describe('UI-SPEC §1.5-4 2 軸の範囲: キリのいい目盛りと 0 の高さ', () => {
  /** 負側が占める割合。両軸で等しければ 0 は同じ高さに来る */
  const negativeRatio = (max: number, min: number) => -min / max;
  /** 目盛りの並び（0 を除く上側） */
  const ticks = (max: number, sections: number) =>
    Array.from({ length: sections }, (_, i) => (max / sections) * (i + 1));

  it('半端な数を避けてキリのいい目盛りにする（8596 → 3000/6000/9000）', () => {
    // 素の上限は 7475 × 1.15 = 8596。4 等分すると 2149 という半端な数になっていた
    const bounds = dualAxisBounds([7475], [7475]);
    expect(ticks(bounds.barMax, bounds.sections)).toEqual([3000, 6000, 9000]);
  });

  it('累計側も同じ規則で丸める（14588 → 5000/10000/15000）', () => {
    const bounds = dualAxisBounds([7475], [12685]);
    expect(ticks(bounds.cumulativeMax, bounds.sections)).toEqual([5000, 10000, 15000]);
  });

  it('データが小さくても目盛りは丸める（下駄の 1000 → 300/600/900/1200）', () => {
    const bounds = dualAxisBounds([500], [500]);
    expect(ticks(bounds.barMax, bounds.sections)).toEqual([300, 600, 900, 1200]);
  });

  it('上限はデータを必ず覆う', () => {
    const bounds = dualAxisBounds([7475], [12685]);
    expect(bounds.barMax).toBeGreaterThanOrEqual(7475);
    expect(bounds.cumulativeMax).toBeGreaterThanOrEqual(12685);
  });

  it('段数は両軸で共有する（罫線が 1 組に収まる）', () => {
    const bounds = dualAxisBounds([7475], [12685]);
    expect(bounds.sections).toBe(3);
  });

  it('どちらにも負値がなければ両軸とも下限 0', () => {
    const bounds = dualAxisBounds([1000, 2000], [1000, 3000]);
    expect(bounds.barMin).toBe(0);
    expect(bounds.cumulativeMin).toBe(0);
    expect(bounds.sectionsBelow).toBe(0);
  });

  it('棒だけが負でも、負側の割合は両軸で等しくなる', () => {
    const bounds = dualAxisBounds([2000, -1000], [2000, 1000]);
    expect(negativeRatio(bounds.barMax, bounds.barMin)).toBeCloseTo(
      negativeRatio(bounds.cumulativeMax, bounds.cumulativeMin),
      10,
    );
    expect(bounds.cumulativeMin).toBeLessThan(0);
  });

  it('累計だけが負でも同じ（割合の大きい方に合わせて広げる）', () => {
    const bounds = dualAxisBounds([2000, 1000], [-5000, -8000]);
    expect(negativeRatio(bounds.barMax, bounds.barMin)).toBeCloseTo(
      negativeRatio(bounds.cumulativeMax, bounds.cumulativeMin),
      10,
    );
    // 累計の下限は実データを覆えていること（軸から食み出さない）
    expect(bounds.cumulativeMin).toBeLessThanOrEqual(-8000);
  });

  /**
   * **段数が青天井にならないこと。** 1 段の幅を「0 より上の範囲」だけから決めていた頃は、
   * 赤字の 1 日が黒字の何十倍にもなると、細かい幅で下を刻むことになって段数が爆発した
   * （+7,475 円の月に −999,910 円の日で合計 387 段。罫線と目盛りが画面を埋めた。実機で確認）。
   * 幅を上下合わせた範囲から決めれば、外れ値がどれだけ大きくても段数は目安の前後に収まる。
   */
  it('赤字が黒字の何十倍でも段数は増えすぎない（罫線が画面を埋めない）', () => {
    const bounds = dualAxisBounds([7475, -999910], [7475, -999910]);

    expect(bounds.sections + bounds.sectionsBelow).toBeLessThanOrEqual(8);
    // 外れ値は軸の中に収まったまま（段を間引いて棒を飛び出させたりしない）
    expect(bounds.barMin).toBeLessThanOrEqual(-999910);
    expect(bounds.barMax).toBeGreaterThanOrEqual(7475);
  });

  it('桁違いの赤字でも 0 の高さは両軸で揃う', () => {
    const bounds = dualAxisBounds([7475, -999910], [12685, -500000]);

    expect(negativeRatio(bounds.barMax, bounds.barMin)).toBeCloseTo(
      negativeRatio(bounds.cumulativeMax, bounds.cumulativeMin),
      10,
    );
  });

  it('負側の目盛りもキリのいい数（下は上と同じ幅で刻む）', () => {
    const bounds = dualAxisBounds([7475, -2000], [7475, -2000]);
    const step = bounds.barMax / bounds.sections;
    expect(bounds.barMin).toBe(-step * bounds.sectionsBelow);
    expect(step % 1000).toBe(0);
  });
});

describe('UI-SPEC §1.5-4 X 軸を日付の軸にする', () => {
  const d = (y: number, m: number, day: number) => new Date(y, m - 1, day);

  describe('chartSpan: 軸が覆う範囲', () => {
    it('過去の月は 1 日から末日まで', () => {
      const span = chartSpan({
        monthKey: '2026-07',
        earliestMonthKey: '2026-01',
        today: d(2026, 8, 10),
      });
      expect(span).toEqual({ from: d(2026, 7, 1), to: d(2026, 7, 31) });
    });

    it('今月は今日まで（来ていない日まで軸を伸ばさない）', () => {
      const today = new Date(2026, 7, 10, 9, 30);
      const span = chartSpan({ monthKey: '2026-08', earliestMonthKey: '2026-01', today });
      expect(span).toEqual({ from: d(2026, 8, 1), to: today });
    });

    it('うるう年の 2 月は 29 日まで', () => {
      const span = chartSpan({
        monthKey: '2024-02',
        earliestMonthKey: '2024-01',
        today: d(2026, 8, 10),
      });
      expect(span?.to).toEqual(d(2024, 2, 29));
    });

    it('全期間は最も古い記録の月から今月まで', () => {
      const today = d(2026, 8, 10);
      const span = chartSpan({ monthKey: null, earliestMonthKey: '2025-03', today });
      expect(span).toEqual({ from: d(2025, 3, 1), to: today });
    });

    it('全期間で記録が 1 件もなければ軸を引けない', () => {
      expect(
        chartSpan({ monthKey: null, earliestMonthKey: null, today: d(2026, 8, 10) }),
      ).toBeNull();
    });
  });

  describe('chartSlots: 等間隔のスロット', () => {
    it('日ごとは 1 日ずつ、両端を含む', () => {
      const slots = chartSlots('day', d(2026, 7, 1), d(2026, 7, 31));
      expect(slots).toHaveLength(31);
      expect(slots[0].key).toBe('2026-07-01');
      expect(slots[30].key).toBe('2026-07-31');
    });

    it('月をまたいでも日付が連続する', () => {
      const slots = chartSlots('day', d(2026, 1, 30), d(2026, 2, 2));
      expect(slots.map((slot) => slot.key)).toEqual([
        '2026-01-30',
        '2026-01-31',
        '2026-02-01',
        '2026-02-02',
      ]);
    });

    it('月ごとは 1 か月ずつ、年をまたいで続く', () => {
      const slots = chartSlots('month', d(2025, 11, 20), d(2026, 2, 5));
      expect(slots.map((slot) => slot.key)).toEqual([
        '2025-11',
        '2025-12',
        '2026-01',
        '2026-02',
      ]);
    });

    it('年ごとは 1 年ずつ、両端の年を含む', () => {
      const slots = chartSlots('year', d(2022, 11, 20), d(2026, 2, 5));
      expect(slots.map((slot) => slot.key)).toEqual(['2022', '2023', '2024', '2025', '2026']);
    });

    it('年ごとの代表日は元日（集計キー → 日付の変換と揃える）', () => {
      const slots = chartSlots('year', d(2025, 6, 15), d(2026, 6, 15));
      expect(slots.map((slot) => slot.date)).toEqual([d(2025, 1, 1), d(2026, 1, 1)]);
    });

    it('キーは repository の集計キーと同じ形式（0 埋め）', () => {
      expect(chartSlots('day', d(2026, 3, 5), d(2026, 3, 5))[0].key).toBe('2026-03-05');
      expect(chartSlots('month', d(2026, 3, 1), d(2026, 3, 1))[0].key).toBe('2026-03');
      expect(chartSlots('year', d(2026, 3, 1), d(2026, 3, 1))[0].key).toBe('2026');
    });
  });

  describe('densifySeries: 記録のない日は空白', () => {
    const point = (key: string, date: Date, profit: number): ChartPoint => ({
      key,
      date,
      profit,
      recordCount: 1,
    });

    it('月初と月末だけの記録が 30 日ぶん離れて並ぶ', () => {
      const dense = densifySeries(
        [point('2026-07-01', d(2026, 7, 1), 1000), point('2026-07-31', d(2026, 7, 31), 2000)],
        'day',
        { from: d(2026, 7, 1), to: d(2026, 7, 31) },
      );

      expect(dense).toHaveLength(31);
      expect(dense[0].profit).toBe(1000);
      expect(dense[30].profit).toBe(2000);
      // 間はすべて空（棒が出ない）
      expect(dense.slice(1, 30).every((slot) => slot.recordCount === 0)).toBe(true);
    });

    it('埋めたスロットは値も件数も 0（棒を出さない目印になる）', () => {
      const dense = densifySeries([], 'day', { from: d(2026, 7, 1), to: d(2026, 7, 3) });
      expect(dense).toEqual([
        { key: '2026-07-01', date: d(2026, 7, 1), profit: 0, recordCount: 0 },
        { key: '2026-07-02', date: d(2026, 7, 2), profit: 0, recordCount: 0 },
        { key: '2026-07-03', date: d(2026, 7, 3), profit: 0, recordCount: 0 },
      ]);
    });

    it('年ごとも同じ ── 記録のない年が空きの枠として入る', () => {
      const dense = densifySeries(
        [point('2022', d(2022, 1, 1), 1000), point('2026', d(2026, 1, 1), 2000)],
        'year',
        { from: d(2022, 5, 9), to: d(2026, 8, 10) },
      );

      expect(dense.map((slot) => slot.key)).toEqual(['2022', '2023', '2024', '2025', '2026']);
      expect(dense[0].profit).toBe(1000);
      expect(dense[4].profit).toBe(2000);
      // 記録のなかった 3 年ぶんも枠として残る（詰めない）
      expect(dense.slice(1, 4)).toEqual([
        { key: '2023', date: d(2023, 1, 1), profit: 0, recordCount: 0 },
        { key: '2024', date: d(2024, 1, 1), profit: 0, recordCount: 0 },
        { key: '2025', date: d(2025, 1, 1), profit: 0, recordCount: 0 },
      ]);
    });

    it('空白の日をまたいでも累計は横ばいで伸びる', () => {
      const dense = densifySeries(
        [point('2026-07-01', d(2026, 7, 1), 1000), point('2026-07-05', d(2026, 7, 5), 500)],
        'day',
        { from: d(2026, 7, 1), to: d(2026, 7, 5) },
      );
      expect(cumulativeProfits(dense.map((slot) => slot.profit))).toEqual([
        1000, 1000, 1000, 1000, 1500,
      ]);
    });
  });

  describe('labelSlotIndices: X 軸ラベルは両端を必ず打つ', () => {
    const labels = (slotCount: number) => labelSlotIndices(slotCount, 5);

    it('31 日の月は末尾（31 日）が必ず入る', () => {
      const indices = labels(31);
      expect(indices[0]).toBe(0);
      expect(indices[indices.length - 1]).toBe(30);
      expect(indices).toEqual([0, 8, 16, 24, 30]);
    });

    it('30 日の月も末尾が入る（従来は 5 日ぶん余っていた）', () => {
      const indices = labels(30);
      expect(indices[indices.length - 1]).toBe(29);
      expect(indices).toEqual([0, 8, 16, 24, 29]);
    });

    it('28 日の 2 月も末尾が入る', () => {
      expect(labels(28)).toEqual([0, 7, 14, 21, 27]);
    });

    it('うるう年の 29 日も末尾が入る', () => {
      expect(labels(29)).toEqual([0, 7, 14, 21, 28]);
    });

    it('日数が変わっても必ず先頭と末尾が入る（28〜31 日と月途中）', () => {
      for (const slotCount of [1, 2, 3, 5, 8, 11, 20, 28, 29, 30, 31]) {
        const indices = labels(slotCount);
        expect(indices[0]).toBe(0);
        expect(indices[indices.length - 1]).toBe(slotCount - 1);
      }
    });

    it('末尾が直前と近すぎるときは直前を落とす（端で 2 つ重ねない）', () => {
      // 11 スロットは間隔 3 → 0,3,6,9 の 9 が末尾 10 の隣になるので落とす
      expect(labels(11)).toEqual([0, 3, 6, 10]);
      expect(labels(8)).toEqual([0, 2, 4, 7]);
    });

    /**
     * 末尾の判定を**文字の幅**で行う（minEndGap）。スロット数の半分だけで見ていた頃は、
     * 12 スロットの月で末尾の 2 つが 2 スロットしか離れず、実機で文字が地続きに見えた。
     * 呼び出し側は「必要な pt ÷ スロットの幅」を渡す。
     */
    it('幅が足りなければ直前のラベルを落とす（minEndGap）', () => {
      // 12 スロットで幅を見ないと 9 と 11 が隣り合う（2 スロット）
      expect(labelSlotIndices(12, 5)).toEqual([0, 3, 6, 9, 11]);
      // 「最低 2.3 スロットぶん空ける」を要求すると 9 が落ちる
      expect(labelSlotIndices(12, 5, 2.3)).toEqual([0, 3, 6, 11]);
    });

    it('minEndGap が大きくても先頭と末尾は必ず残る', () => {
      expect(labelSlotIndices(12, 5, 99)).toEqual([0, 11]);
      expect(labelSlotIndices(31, 5, 99)).toEqual([0, 30]);
    });

    it('minEndGap を渡さなければ従来どおり（既定は幅を見ない）', () => {
      expect(labelSlotIndices(31, 5, 0)).toEqual(labelSlotIndices(31, 5));
      expect(labelSlotIndices(11, 5, 0)).toEqual([0, 3, 6, 10]);
    });

    it('目安の数を超えない', () => {
      for (let slotCount = 1; slotCount <= 40; slotCount += 1) {
        expect(labels(slotCount).length).toBeLessThanOrEqual(5);
      }
    });

    it('ラベルの間隔は末尾を除いて一定（読み取りの手がかりになる）', () => {
      const indices = labels(31);
      const gaps = indices.slice(1, -1).map((value, i) => value - indices[i]);
      expect(new Set(gaps).size).toBe(1);
    });

    it('スロットが 1 つなら 1 つだけ / 0 なら空', () => {
      expect(labels(1)).toEqual([0]);
      expect(labels(0)).toEqual([]);
    });
  });

  describe('nearestRecordedIndex: タップは最も近い棒を選ぶ', () => {
    const slots = (pattern: string): ChartPoint[] =>
      [...pattern].map((mark, index) => ({
        key: String(index),
        date: new Date(2026, 6, index + 1),
        profit: mark === '#' ? 100 : 0,
        recordCount: mark === '#' ? 1 : 0,
      }));

    it('押した位置に記録があればそのまま', () => {
      expect(nearestRecordedIndex(slots('#..#'), 3)).toBe(3);
    });

    it('空きを押したら近い側の棒を選ぶ', () => {
      expect(nearestRecordedIndex(slots('#....#'), 1)).toBe(0);
      expect(nearestRecordedIndex(slots('#....#'), 4)).toBe(5);
    });

    it('同じ距離なら古い側（左）を選ぶ', () => {
      expect(nearestRecordedIndex(slots('#.#'), 1)).toBe(0);
    });

    it('遠く離れていても必ずどれかを選ぶ（空振りにしない）', () => {
      expect(nearestRecordedIndex(slots('#..............'), 14)).toBe(0);
    });

    it('記録が 1 件もなければ null', () => {
      expect(nearestRecordedIndex(slots('....'), 2)).toBeNull();
    });
  });
});

describe('§6.2 / §1.5-5 軸ラベル・選択した点の見出しの書式', () => {
  const date = d(2026, 8, 9, 14, 30);

  it('X 軸ラベルは 日ごと = MM/DD、月ごと = YYYY/MM、年ごと = YYYY', () => {
    expect(formatChartLabel(date, 'day')).toBe('08/09');
    expect(formatChartLabel(date, 'month')).toBe('2026/08');
    // 年ごとに「2026/08」と出すと、その年の 8 月だけを指しているように読める
    expect(formatChartLabel(date, 'year')).toBe('2026');
  });

  it('選択した点の見出しは刻みの粒度に合わせる', () => {
    expect(formatPointDate(date, 'day')).toBe('8月9日');
    expect(formatPointDate(date, 'month')).toBe('2026年8月');
    expect(formatPointDate(date, 'year')).toBe('2026年');
  });
});
