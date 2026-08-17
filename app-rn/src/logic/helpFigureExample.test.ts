// 「売る」ページの図が共有する題材（helpFigureExample.ts）の不変条件。
//
// **金額そのものを固定しない。** 5,000 円でなければならない理由は無く、
// 額を書き写すとテストが「変えるな」としか言わなくなる。
//
// 固定するのは**図が図として成り立つ条件**だけ ── 題材を差し替えたときに、
// 目盛りが 2 点に潰れたりつまみが端に貼り付いたりするのを、画面を開く前に止める。
import { describe, expect, it } from 'vitest';

import {
  achievementBadgeTier,
  achievementCategory,
  achievementDifficulty,
} from './achievements';
import {
  ACHIEVEMENT_LADDER_IDS,
  ACHIEVEMENT_ONCE_ID,
  PRICING_EXAMPLE,
  PRICING_EXAMPLE_SIMULATED_PRICE,
} from './helpFigureExample';
import { achievementBadgeTierName } from './labels';
import { analyzePricing, priceLineTicks } from './pricing';

const analysis = analyzePricing(PRICING_EXAMPLE);

describe('価格ラインの図（PriceLineFigure）', () => {
  // 目標ありの記録を選んである意味がここ。目標が null の題材だと 2 点になり、
  // 「目標を決めていない記録では真ん中の目盛りが出ません」という注記が読めなくなる
  it('目盛りが 3 点そろう（分岐点・目標・今の価格）', () => {
    expect(priceLineTicks(analysis)).toHaveLength(3);
  });

  it('3 点はすべて違う額（重なると 1 点に見える）', () => {
    const values = priceLineTicks(analysis).map((tick) => tick.value);
    expect(new Set(values).size).toBe(values.length);
  });

  // 分岐点 < 目標が出る価格 < 今の価格。この並びが崩れると、
  // 「まだ下げられる」を説明する図なのに下げ幅が無い記録になる
  it('分岐点 → 目標 → 今の価格 の順に並ぶ', () => {
    expect(analysis.breakEven).toBeLessThan(analysis.targetPrice as number);
    expect(analysis.targetPrice as number).toBeLessThan(analysis.currentPrice);
  });
});

describe('シミュレーターの図（SimulatorFigure）', () => {
  it('黒字の題材（赤字だと画面の向きが反転し、別の場面の図になる）', () => {
    expect(analysis.state).toBe('profit');
  });

  it('試している価格はつまみの範囲の内側', () => {
    expect(PRICING_EXAMPLE_SIMULATED_PRICE).toBeGreaterThan(analysis.range.min);
    expect(PRICING_EXAMPLE_SIMULATED_PRICE).toBeLessThan(analysis.range.max);
  });

  it('試している価格は今の価格より下（値下げを試している図）', () => {
    expect(PRICING_EXAMPLE_SIMULATED_PRICE).toBeLessThan(PRICING_EXAMPLE.salesPrice);
  });

  it('試した価格でも黒字（見込み利益がマイナスだと下の説明と食い違う）', () => {
    const simulated = analyzePricing({
      ...PRICING_EXAMPLE,
      salesPrice: PRICING_EXAMPLE_SIMULATED_PRICE,
    });
    expect(simulated.current?.netProfit).toBeGreaterThan(0);
  });
});

describe('実績の図（AchievementKindsFigure）', () => {
  // 図は各段に★と段位名（ブロンズ〜レジェンド）を添える。段が欠けると、
  // 本文の「5 段階」と図の行数が合わなくなる
  it('段は 5 つ', () => {
    expect(ACHIEVEMENT_LADDER_IDS).toHaveLength(5);
  });

  // ★は難易度の数だけ塗る。並びが崩れると★が増えたり減ったりしながら下へ進む
  it('難易度が 1 から 5 まで 1 つずつ上がる', () => {
    expect(ACHIEVEMENT_LADDER_IDS.map(achievementDifficulty)).toEqual([1, 2, 3, 4, 5]);
  });

  it('段位がブロンズからレジェンドまで順に並ぶ', () => {
    expect(ACHIEVEMENT_LADDER_IDS.map(achievementBadgeTier)).toEqual([
      'bronze',
      'silver',
      'gold',
      'platinum',
      'legend',
    ]);
  });

  // 同じ段位名が 2 度出ると、段位の列が段の区別になっていないことになる
  it('段位名は 5 つとも違う', () => {
    const names = ACHIEVEMENT_LADDER_IDS.map((id) =>
      achievementBadgeTierName(achievementBadgeTier(id)),
    );
    expect(new Set(names).size).toBe(names.length);
  });

  // 「5 つのジャンルをそれぞれ 5 段階」の例なので、途中で別のジャンルが混ざると例にならない
  it('5 段はすべて同じジャンル', () => {
    const categories = new Set(ACHIEVEMENT_LADDER_IDS.map(achievementCategory));
    expect(categories.size).toBe(1);
  });

  it('1 回だけ付く例は、段を登るジャンルとは別のジャンルから採る', () => {
    expect(achievementCategory(ACHIEVEMENT_ONCE_ID)).not.toBe(
      achievementCategory(ACHIEVEMENT_LADDER_IDS[0]),
    );
  });

  // 図は単発の実績にも★と段位名を出す（実物の実績詳細と同じ）。段位が引けないと
  // その行だけ★の無い行になり、「違うのは段を登るかどうかだけ」が読めなくなる
  it('1 回だけ付く例にも段位がある', () => {
    expect(achievementBadgeTierName(achievementBadgeTier(ACHIEVEMENT_ONCE_ID))).not.toBe('');
  });
});

describe('目標と下げ幅の図（TargetRoomFigure）', () => {
  // 図の 3 行が同じ値になると、表として何も言っていないことになる
  it('目標の持ち方 3 通りで、出る下げ幅が変わる', () => {
    const unset = analyzePricing({ ...PRICING_EXAMPLE, targetProfit: null });
    const zero = analyzePricing({ ...PRICING_EXAMPLE, targetProfit: 0 });

    // 決めていない行は下げ幅を出さない（room の値ではなく hasTarget で切る。§4.3）
    expect(unset.hasTarget).toBe(false);
    // 0 円は有効な目標なので出す。分岐点までの差
    expect(zero.hasTarget).toBe(true);
    expect(zero.room).toBe(PRICING_EXAMPLE.salesPrice - analysis.breakEven);
    // 目標ありは目標ラインまでの差で、0 円のときより小さい
    expect(analysis.room).toBeGreaterThan(0);
    expect(analysis.room).toBeLessThan(zero.room);
  });
});
