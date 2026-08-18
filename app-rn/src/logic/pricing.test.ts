// 「いくらで売る？」画面（SPEC-V9 §9）の材料の検証。
//
// 期待値はすべて手計算（実装からの逆算ではない）。式は §4 の 1 本:
//   必要販売価格 = ceil((目標 + 経費 + 固定額) / (1 − 率/100))
//
// 経費は仕様書のモックと同じ 1 件を使う:
//   仕入 2,000 ＋ 送料 750 ＋ 梱包 50 = 2,800 円、手数料 10%
//   → 分岐点 = ceil(2800 / 0.9) = ceil(3111.1…) = 3112
//   → 目標 1,000 円の達成価格 = ceil(3800 / 0.9) = ceil(4222.2…) = 4223

import { describe, expect, it } from 'vitest';

import {
  CONCLUSION_TONES,
  analyzePricing,
  canApplyPrice,
  initialSimulationPrice,
  priceLineTicks,
  pricingConclusion,
  recordDetailConclusion,
  simulationVerdict,
  soldConclusion,
  soldElapsed,
  soldPerDayProfit,
  targetAchievementRatio,
  type PricingInput,
} from './pricing';
import type { TargetCostInput } from './profit';

/** モックの 1 件ぶんの経費。base = 2,800 円 / 手数料 10% */
const costs: TargetCostInput = {
  purchasePrice: 2000,
  postage: 750,
  envelopeCost: 50,
  othersCost: 0,
  commission: 10,
};

const record = (salesPrice: number, targetProfit: number | null): PricingInput => ({
  ...costs,
  salesPrice,
  targetProfit,
});

/** A. 目標なし・黒字（標準ケース） */
const stateA = analyzePricing(record(5000, null));
/** B. 目標あり・黒字 */
const stateB = analyzePricing(record(5000, 1000));
/** C. 目標なし・赤字 */
const stateC = analyzePricing(record(2500, null));
/** D. 目標あり・赤字 */
const stateD = analyzePricing(record(2500, 1000));
/** E. 価格が未設定 */
const stateE = analyzePricing(record(0, null));

describe('状態の判定（§9.3）', () => {
  it('価格 0 は「赤字」ではなく「未設定」', () => {
    // 0 円は必ず分岐点を割るが、それは値付けの失敗ではなく「まだ決めていない」
    expect(stateE.state).toBe('unpriced');
    expect(stateE.current).toBeNull();
  });

  it('分岐点未満は赤字 / 以上は黒字', () => {
    expect(stateC.state).toBe('loss');
    expect(stateA.state).toBe('profit');
  });

  it('分岐点ちょうど（3112・境界）は黒字側', () => {
    expect(analyzePricing(record(3112, null)).state).toBe('profit');
    expect(analyzePricing(record(3111, null)).state).toBe('loss');
  });

  it('**目標 0 円は「決めている」**（null と混ぜない。§1.2）', () => {
    const zeroTarget = analyzePricing(record(5000, 0));

    expect(zeroTarget.hasTarget).toBe(true);
    // 目標 0 円の達成価格は分岐点そのもの（§4.2）
    expect(zeroTarget.targetPrice).toBe(3112);
    expect(stateA.hasTarget).toBe(false);
    expect(stateA.targetPrice).toBeNull();
  });
});

describe('A. 目標なし・黒字（モックの数字）', () => {
  it('今の価格 5,000 の見込み: 5000 −(2800 + 500) = 1,700 / 利益率 34.0%', () => {
    expect(stateA.current?.netProfit).toBe(1700);
    expect(stateA.current?.profitRate).toBeCloseTo(34, 10);
  });

  it('基準線は分岐点（3,112）。余裕 = 5000 − 3112 = 1,888', () => {
    expect(stateA.breakEven).toBe(3112);
    expect(stateA.floorPrice).toBe(3112);
    expect(stateA.room).toBe(1888);
  });

  it('目標の値はすべて null（0 にしない。§7-3）', () => {
    expect(stateA.targetPrice).toBeNull();
    expect(stateA.targetShortfall).toBeNull();
    expect(stateA.meetsTarget).toBeNull();
  });

  it('結論の帯は safe（青）', () => {
    expect(pricingConclusion(stateA)).toBe('safe');
    expect(CONCLUSION_TONES.safe).toBe('good');
  });

  it('価格ラインは 2 点だけ（**空の目標の目盛りを作らない**）', () => {
    expect(priceLineTicks(stateA)).toEqual([
      { key: 'breakEven', value: 3112 },
      { key: 'current', value: 5000 },
    ]);
  });
});

describe('B. 目標あり・黒字（基準線が目標ラインへ上がる）', () => {
  it('目標 1,000 の達成価格 = ceil(3800 / 0.9) = 4,223', () => {
    expect(stateB.targetPrice).toBe(4223);
    expect(stateB.floorPrice).toBe(4223);
  });

  it('余裕は分岐点までではなく目標ラインまで: 5000 − 4223 = 777', () => {
    expect(stateB.room).toBe(777);
    expect(stateB.meetsTarget).toBe(true);
    expect(stateB.targetShortfall).toBe(0);
  });

  it('結論の帯は safeWithTarget', () => {
    expect(pricingConclusion(stateB)).toBe('safeWithTarget');
  });

  it('価格ラインは 3 点（利益ゼロ → 目標 → 今の価格）', () => {
    expect(priceLineTicks(stateB).map((tick) => tick.key)).toEqual([
      'breakEven',
      'target',
      'current',
    ]);
  });
});

describe('C. 目標なし・赤字', () => {
  it('今の価格 2,500 の見込みは負: 2500 −(2800 + 250) = −550', () => {
    expect(stateC.current?.netProfit).toBe(-550);
  });

  it('分岐点までの不足 = 3112 − 2500 = 612', () => {
    expect(stateC.breakEvenShortfall).toBe(612);
  });

  it('**余裕は 0**（負の下げ幅を作らない）', () => {
    expect(stateC.room).toBe(0);
  });

  it('結論の帯は loss（赤）', () => {
    expect(pricingConclusion(stateC)).toBe('loss');
    expect(CONCLUSION_TONES.loss).toBe('bad');
  });

  it('**価格ラインの 2 点は順序が逆転する**（今の価格が左・分岐点が右）', () => {
    expect(priceLineTicks(stateC)).toEqual([
      { key: 'current', value: 2500 },
      { key: 'breakEven', value: 3112 },
    ]);
  });
});

describe('D. 目標あり・赤字', () => {
  it('目標へ戻す価格は 4,223。今より 1,723 上', () => {
    expect(stateD.targetPrice).toBe(4223);
    expect(stateD.targetShortfall).toBe(1723);
    expect(stateD.meetsTarget).toBe(false);
  });

  it('結論の帯は lossWithTarget（赤のまま・2 行目だけ変わる）', () => {
    expect(pricingConclusion(stateD)).toBe('lossWithTarget');
    expect(CONCLUSION_TONES.lossWithTarget).toBe('bad');
  });

  it('価格ラインは 3 点で、今の価格が左端', () => {
    expect(priceLineTicks(stateD).map((tick) => tick.key)).toEqual([
      'current',
      'breakEven',
      'target',
    ]);
  });
});

describe('E. 価格が未設定', () => {
  it('主役の数字は出せない（null）。帯も出さない', () => {
    expect(stateE.current).toBeNull();
    expect(pricingConclusion(stateE)).toBeNull();
  });

  it('価格が無くても分岐点と「すでにかかった費用」は出る', () => {
    expect(stateE.breakEven).toBe(3112);
    expect(stateE.spent).toBe(2800);
  });

  it('目標があれば目標の達成価格も価格なしで出る', () => {
    expect(analyzePricing(record(0, 1000)).targetPrice).toBe(4223);
  });

  it('記録に書き戻す操作はできない', () => {
    expect(canApplyPrice(stateE, 3000)).toBe(false);
  });
});

describe('分岐点と目標ラインの間（モックに無い 5 つ目の状態）', () => {
  const between = analyzePricing(record(3500, 1000));

  it('赤字ではないが目標には届いていない', () => {
    expect(between.state).toBe('profit');
    expect(between.meetsTarget).toBe(false);
    expect(between.targetShortfall).toBe(723); // 4223 − 3500
  });

  it('**「あと ¥0 下げられます」と言わない**ための belowTarget（オレンジ）', () => {
    expect(between.room).toBe(0);
    expect(pricingConclusion(between)).toBe('belowTarget');
    expect(CONCLUSION_TONES.belowTarget).toBe('warn');
  });
});

describe('記録詳細の結論行（O3 案）の 4 状態（recordDetailConclusion）', () => {
  it('A. 目標なし・黒字 → safe', () => {
    expect(recordDetailConclusion(stateA)).toBe('safe');
  });

  it('B. 目標あり・黒字 → safeWithTarget', () => {
    expect(recordDetailConclusion(stateB)).toBe('safeWithTarget');
  });

  it('C. 目標なし・赤字 → loss', () => {
    expect(recordDetailConclusion(stateC)).toBe('loss');
  });

  it('D. 目標あり・赤字 → lossWithTarget', () => {
    expect(recordDetailConclusion(stateD)).toBe('lossWithTarget');
  });

  it('E. 価格未設定 → unpriced（結論文は出せないが、専用文言で入口は出す）', () => {
    expect(recordDetailConclusion(stateE)).toBe('unpriced');
  });

  it('分岐点と目標ラインの間（belowTarget）は safeWithTarget に合流する', () => {
    // 目標に届いていなくても、この行が言うのは「floorPrice まで下げられる」だけ
    const between = analyzePricing(record(3500, 1000));
    expect(recordDetailConclusion(between)).toBe('safeWithTarget');
  });
});

describe('シミュレーターの初期値（§9.9）', () => {
  it('黒字は今の価格（開いた時点では何も変えていない）', () => {
    expect(initialSimulationPrice(stateA)).toBe(5000);
    expect(initialSimulationPrice(stateB)).toBe(5000);
  });

  it('赤字は分岐点（この画面で探しているのはその価格）', () => {
    expect(initialSimulationPrice(stateC)).toBe(3112);
    expect(initialSimulationPrice(stateD)).toBe(3112);
  });

  it('**赤字でも初期値は範囲に収まる**（§4.6 の修正が効いている）', () => {
    expect(initialSimulationPrice(stateC)).toBeLessThanOrEqual(stateC.range.max);
    expect(initialSimulationPrice(stateC)).toBeGreaterThanOrEqual(stateC.range.min);
  });
});

describe('シミュレーターの判定（§9.9）', () => {
  it('A で 4,500: 分岐点までの残り 1,388。**「達成」は言わない**', () => {
    const verdict = simulationVerdict(stateA, 4500, costs);

    expect(verdict.key).toBe('roomLeft');
    expect(verdict.room).toBe(1388);
    expect(verdict.simulation.netProfit).toBe(1250);
    expect(verdict.simulation.profitRate).toBeCloseTo(27.78, 1);
  });

  it('B で 4,500: 目標を達成', () => {
    expect(simulationVerdict(stateB, 4500, costs).key).toBe('targetMet');
  });

  it('B で 4,222（目標達成価格の 1 円下・境界）: まだ届かない', () => {
    const verdict = simulationVerdict(stateB, 4222, costs);

    expect(verdict.key).toBe('belowTarget');
    expect(verdict.shortfall).toBe(1);
  });

  it('C で 3,200: 黒字になる（手元に残る 80 円）', () => {
    const verdict = simulationVerdict(stateC, 3200, costs);

    expect(verdict.key).toBe('turnsProfit');
    expect(verdict.simulation.netProfit).toBe(80);
    expect(verdict.simulation.profitRate).toBeCloseTo(2.5, 10);
  });

  it('分岐点を割る価格はどの状態でも loss', () => {
    expect(simulationVerdict(stateA, 3000, costs).key).toBe('loss');
    expect(simulationVerdict(stateC, 3000, costs).key).toBe('loss');
  });

  it('分岐点ちょうど（境界）は赤字ではない', () => {
    expect(simulationVerdict(stateC, 3112, costs).key).toBe('turnsProfit');
  });
});

describe('売却済み分析「どうだった？」の見出し状態（soldConclusion）', () => {
  it('A. 目標なし → noTarget（標準ケース）', () => {
    expect(soldConclusion(stateA)).toBe('noTarget');
  });

  it('B. 目標あり・達成 → targetMet', () => {
    expect(soldConclusion(stateB)).toBe('targetMet');
  });

  it('C. 目標あり・未達成（黒字のまま） → belowTarget', () => {
    const between = analyzePricing(record(3500, 1000));
    expect(between.state).toBe('profit');
    expect(soldConclusion(between)).toBe('belowTarget');
  });

  it('D. 記録詳細から後で目標を決めた場合も B/C と同じ判定になる（特別扱いをしない）', () => {
    // 「後から決めた」は保存された targetProfit の値としては B と区別が付かない
    // （目標を決めた経緯はこの層の関心事ではない）
    const decidedLater = analyzePricing(record(5000, 1000));
    expect(soldConclusion(decidedLater)).toBe('targetMet');
  });

  // **null を返してはいけない**（2026-08-18 の回帰）。記録詳細の入口の行は戻り値が
  // null かどうかで出す・出さないを決めているので、null だと売値未入力のまま
  // 「売れた」を押した記録だけ、この画面へ到達できなくなる
  it('価格未設定は unpriced（結論は出せないが、状態としては返す）', () => {
    expect(soldConclusion(stateE)).toBe('unpriced');
  });
});

describe('達成バーの割合（targetAchievementRatio）', () => {
  it('目標が無ければ null', () => {
    expect(targetAchievementRatio(stateA)).toBeNull();
  });

  it('達成（170%）はバーとしては 1 で止める（超過分は数字側の役目）', () => {
    // 5000 の見込み 1700 / 目標 1000 = 170% だが、バーの割合は 1 を超えない
    expect(targetAchievementRatio(stateB)).toBe(1);
  });

  it('未達成は目標に対する実額の比率', () => {
    const between = analyzePricing(record(3500, 1000));
    // netProfit = 0.9 * 3500 − 2800 = 350 → 350 / 1000 = 0.35
    expect(targetAchievementRatio(between)).toBeCloseTo(0.35, 10);
  });
});

describe('経過日数の 3 分岐（soldElapsed）', () => {
  it('0 日（記録した日に売れた）は sameDay。割り算をしない', () => {
    expect(soldElapsed(0)).toEqual({ kind: 'sameDay' });
  });

  it('日付が逆転（負の日数）は reversed', () => {
    expect(soldElapsed(-1)).toEqual({ kind: 'reversed' });
  });

  it('通常は normal で日数を持つ', () => {
    expect(soldElapsed(13)).toEqual({ kind: 'normal', days: 13 });
  });
});

describe('1 日あたり利益（soldPerDayProfit）', () => {
  it('仕入品・通常の経過日数なら出す（13日で1700円 → 約130.77円/日）', () => {
    expect(soldPerDayProfit('sourced', { kind: 'normal', days: 13 }, 1700)).toBeCloseTo(
      1700 / 13,
      10,
    );
  });

  it('**不用品では出さない**（仕入れの無い種別に「回収日数」は意味がない）', () => {
    expect(soldPerDayProfit('used', { kind: 'normal', days: 13 }, 1700)).toBeNull();
  });

  it('0 日（sameDay）では割り算をしない', () => {
    expect(soldPerDayProfit('sourced', { kind: 'sameDay' }, 1700)).toBeNull();
  });

  it('日付が逆転（reversed）していても出さない', () => {
    expect(soldPerDayProfit('sourced', { kind: 'reversed' }, 1700)).toBeNull();
  });
});

describe('記録に書き戻せるか（§9.10）', () => {
  it('今の価格と同じなら押せない（書き換えるものが無い）', () => {
    expect(canApplyPrice(stateA, 5000)).toBe(false);
    expect(canApplyPrice(stateA, 4500)).toBe(true);
  });

  it('**赤字では分岐点に届いていないと押せない**（ボタンの語が嘘になるため）', () => {
    expect(canApplyPrice(stateC, 3000)).toBe(false);
    expect(canApplyPrice(stateC, 3112)).toBe(true);
  });

  it('黒字の記録は分岐点を割る価格でも書き戻せる（利用者の判断）', () => {
    expect(canApplyPrice(stateA, 3000)).toBe(true);
  });
});
