// SPEC.md §2（計算ロジック）・§5.1（入力フィルタ）・§7（確定決定）の検証テスト。
// 期待値はすべて SPEC の数式から手計算で導出している（実装からの逆算ではない）。

import { describe, expect, it } from 'vitest';
import {
  allTagProfits,
  breakEvenSalesPrice,
  commissionCost,
  discountRoom,
  elapsedDays,
  lossMargin,
  netProfit,
  periodAverageSaleDays,
  periodProfitPerRecord,
  periodProfitRate,
  requiredSalesPrice,
  roundForDisplay,
  simulateAtPrice,
  simulationPriceRange,
  tagsWithoutRecords,
  targetSalesPrice,
  topTagProfits,
  totalExpenses,
  type CostInput,
  type TagProfitTotals,
  type TargetCostInput,
} from './profit';
import { parseNumericInput, sanitizeNumericInput } from './input';

const input = (partial: Partial<CostInput>): CostInput => ({
  salesPrice: 0,
  purchasePrice: 0,
  postage: 0,
  envelopeCost: 0,
  othersCost: 0,
  commission: 0,
  ...partial,
});

describe('§2.2 手数料額 commissionCost = salesPrice × (commission / 100)', () => {
  it('通常ケース: 1000 円 × 10% = 100', () => {
    expect(commissionCost(input({ salesPrice: 1000, commission: 10 }))).toBe(100);
  });

  it('丸めなしで Double のまま保持（SPEC §2.2 の例: 999 × 10% = 99.9）', () => {
    // §2.2「丸めなし」＋ §7-4「手数料端数処理は保留、丸めなしのまま移植」
    expect(commissionCost(input({ salesPrice: 999, commission: 10 }))).toBeCloseTo(99.9, 10);
  });
});

describe('§2.3 純利益 netProfit = salesPrice − (仕入 + 送料 + 梱包 + その他 + 手数料額)', () => {
  it('通常の純利益計算', () => {
    // 手計算: 手数料 = 1000×0.1 = 100
    // netProfit = 1000 − (300 + 175 + 20 + 5 + 100) = 400
    const c = input({
      salesPrice: 1000,
      purchasePrice: 300,
      postage: 175,
      envelopeCost: 20,
      othersCost: 5,
      commission: 10,
    });
    expect(netProfit(c)).toBe(400);
  });

  it('§2.4 経費合計 totalExpenses に手数料が含まれ、netProfit = salesPrice − totalExpenses', () => {
    const c = input({
      salesPrice: 1000,
      purchasePrice: 300,
      postage: 175,
      envelopeCost: 20,
      othersCost: 5,
      commission: 10,
    });
    // totalExpenses = 300 + 175 + 20 + 5 + 100 = 600
    expect(totalExpenses(c)).toBe(600);
    expect(netProfit(c)).toBe(c.salesPrice - totalExpenses(c));
  });

  it('送料・梱包材・その他が 0 のケース（§1: scalar 属性のデフォルトは 0）', () => {
    const c = input({ salesPrice: 500, purchasePrice: 200, commission: 10 });
    // netProfit = 500 − (200 + 0 + 0 + 0 + 50) = 250
    expect(netProfit(c)).toBe(250);
  });

  it('原価（仕入価格）が 0 のケース', () => {
    const c = input({ salesPrice: 500, postage: 175, commission: 10 });
    // netProfit = 500 − (0 + 175 + 0 + 0 + 50) = 275
    expect(netProfit(c)).toBe(275);
  });

  it('全経費 0・手数料 0% なら netProfit = salesPrice', () => {
    expect(netProfit(input({ salesPrice: 500 }))).toBe(500);
  });

  it('利益がマイナスになるケース', () => {
    // netProfit = 100 − (500 + 0 + 0 + 0 + 10) = −410
    const c = input({ salesPrice: 100, purchasePrice: 500, commission: 10 });
    expect(netProfit(c)).toBe(-410);
  });

  it('中間値は丸めない（§2.6: 丸めは表示の瞬間のみ）', () => {
    // 手数料 = 999×0.1 = 99.9 → netProfit = 999 − (100 + 99.9) = 799.1
    const c = input({ salesPrice: 999, purchasePrice: 100, commission: 10 });
    expect(netProfit(c)).toBeCloseTo(799.1, 10);
  });
});

describe('§2.5 逆算 requiredSalesPrice = ceil((targetProfit + costs) / (1 − commission/100))', () => {
  const costsOnly = (partial: Partial<Omit<CostInput, 'salesPrice'>>) => {
    const { salesPrice: _sp, ...rest } = input(partial);
    return rest;
  };

  it('通常ケース: 目標 500・経費 500・手数料 10% → ceil(1000/0.9) = 1112', () => {
    // (500 + 300+175+20+5) / 0.9 = 1111.11… → ceil → 1112
    const costs = costsOnly({
      purchasePrice: 300,
      postage: 175,
      envelopeCost: 20,
      othersCost: 5,
      commission: 10,
    });
    expect(requiredSalesPrice(500, costs)).toBe(1112);
  });

  it('決定 §7-3: 切り上げにより、逆算価格で順算し直すと利益 ≥ 目標が常に成立する', () => {
    // 切り捨て(Int())では下回り得たケースを含む複数パターンで往復検証。
    // 例: 目標100・経費0・手数料10% → ceil(100/0.9)=112。
    //     floor なら 111 → 実利益 99.9 < 100 で目標割れ（旧 Swift 版の不具合）。
    const cases = [
      { target: 100, purchasePrice: 0, postage: 0, envelopeCost: 0, othersCost: 0, commission: 10 },
      { target: 500, purchasePrice: 300, postage: 175, envelopeCost: 20, othersCost: 5, commission: 10 },
      { target: 1, purchasePrice: 1, postage: 1, envelopeCost: 1, othersCost: 1, commission: 33 },
      { target: 12345, purchasePrice: 678, postage: 90, envelopeCost: 12, othersCost: 3, commission: 7 },
      { target: 0, purchasePrice: 100, postage: 0, envelopeCost: 0, othersCost: 0, commission: 10 },
    ];
    for (const { target, ...costs } of cases) {
      const price = requiredSalesPrice(target, costs);
      const profitAtPrice = netProfit(input({ ...costs, salesPrice: price }));
      // 目標を下回ったら失敗（浮動小数の誤差許容なしの厳密比較）
      expect(profitAtPrice).toBeGreaterThanOrEqual(target);
    }
  });

  it('ceil の効果の裏取り: 1 円安いと目標を下回るケースがある（ceil が最小十分価格を返す）', () => {
    // 目標100・経費0・手数料10%: price=112 → 利益100.8 ≥ 100、price=111 → 99.9 < 100
    const costs = costsOnly({ commission: 10 });
    const price = requiredSalesPrice(100, costs);
    expect(price).toBe(112);
    expect(netProfit(input({ salesPrice: price - 1, commission: 10 }))).toBeLessThan(100);
  });

  it('手数料 0%（Stepper 下限、§2.5）: 割り算の分母 1 → 必要価格 = 目標 + 経費そのもの', () => {
    // (400 + 600) / 1 = 1000（整数なので ceil の影響なし）
    const costs = costsOnly({ purchasePrice: 600 });
    expect(requiredSalesPrice(400, costs)).toBe(1000);
  });

  it('手数料 50%（Stepper 上限、§2.5）: 分母 0.5 → 必要価格 = (目標+経費)×2', () => {
    // (300 + 200) / 0.5 = 1000
    const costs = costsOnly({ purchasePrice: 200, commission: 50 });
    expect(requiredSalesPrice(300, costs)).toBe(1000);
    // 順算でも往復確認: 1000 − (200 + 500) = 300 = 目標ちょうど
    expect(netProfit(input({ salesPrice: 1000, purchasePrice: 200, commission: 50 }))).toBe(300);
  });

  it('手数料 10%（初期値）で経費 0・目標 0 → 価格 0', () => {
    expect(requiredSalesPrice(0, costsOnly({ commission: 10 }))).toBe(0);
  });
});

describe('§2.6 / 決定 §7-5 表示丸め: アプリ全体で Math.round（負値も同様）', () => {
  it('SPEC §2.6 の例: 99.9 → 100、99.4 → 99、−99.9 → −100', () => {
    expect(roundForDisplay(99.9)).toBe(100);
    expect(roundForDisplay(99.4)).toBe(99);
    expect(roundForDisplay(-99.9)).toBe(-100);
  });

  it('.5 ちょうどは常に +∞ 方向（§2.6 注記: round(99.5)=100、round(−99.5)=−99）', () => {
    expect(roundForDisplay(99.5)).toBe(100);
    expect(roundForDisplay(-99.5)).toBe(-99);
  });

  it('旧 Swift 版の Int() 切り捨てとは異なることの確認（§7-5: 四捨五入に変更）', () => {
    // Int(99.9) は 99 だったが、RN 版は 100
    expect(roundForDisplay(99.9)).not.toBe(99);
    // Int(-99.9) は -99（0 方向）だったが、RN 版は -100
    expect(roundForDisplay(-99.9)).not.toBe(-99);
  });

  it('整数はそのまま', () => {
    expect(roundForDisplay(0)).toBe(0);
    expect(roundForDisplay(400)).toBe(400);
    expect(roundForDisplay(-410)).toBe(-410);
  });

  it('決定 §7-2: 集計は「Double で合算 → 表示時に丸め」（レコードごと丸めと結果が異なる例）', () => {
    // 2 レコード: 純利益 99.9 と 99.9。
    // 旧 MonthlySummaryCard 方式: Int(99.9)+Int(99.9) = 198
    // RN 版: round(99.9+99.9) = round(199.8) = 200
    const profits = [99.9, 99.9];
    const sum = profits.reduce((a, b) => a + b, 0);
    expect(roundForDisplay(sum)).toBe(200);
  });
});

describe('§5.1 / 決定 §7-9 数値入力サニタイズ', () => {
  it('数字と "." 以外を除去（エラーは出さず黙って除去）', () => {
    expect(sanitizeNumericInput('12a3円')).toBe('123');
    expect(sanitizeNumericInput('abc')).toBe('');
    expect(sanitizeNumericInput('-500')).toBe('500'); // マイナス記号も許可外
  });

  it('小数点は 1 個まで（§7-9: 2 個目以降の "." は除去。1.2.3 → 1.23）', () => {
    expect(sanitizeNumericInput('1.2.3')).toBe('1.23');
    expect(sanitizeNumericInput('..5')).toBe('.5');
    expect(sanitizeNumericInput('1.5')).toBe('1.5');
  });

  it('サニタイズ結果は常に /^\\d*\\.?\\d*$/ に一致する（§7-9 の許容形式）', () => {
    const samples = ['1.2.3', 'a.b.c', '..', '12.34.56.78', '円1,234.5', ''];
    for (const s of samples) {
      expect(sanitizeNumericInput(s)).toMatch(/^\d*\.?\d*$/);
    }
  });

  it('数値化: 空文字・"." のみは 0 扱い（§5.1: Double(text) ?? 0 相当）', () => {
    expect(parseNumericInput('')).toBe(0);
    expect(parseNumericInput('.')).toBe(0);
    expect(parseNumericInput('1.5')).toBe(1.5);
    expect(parseNumericInput('0')).toBe(0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// SPEC-V9 §4 目標利益まわりの計算。
//
// 期待値はすべて手計算（実装からの逆算ではない）。式は 1 本:
//   必要販売価格 = ceil((目標 + 経費 + 固定額の手数料) / (1 − 率/100))
// 分岐点は「目標 0 円」の場合そのもの。
// ───────────────────────────────────────────────────────────────────────────

/** 仕入品の経費一式。base = 300 + 175 + 20 + 5 = 500 円、手数料 10% */
const sourcedCosts: TargetCostInput = {
  purchasePrice: 300,
  postage: 175,
  envelopeCost: 20,
  othersCost: 5,
  commission: 10,
};

/** 不用品（仕入価格を持たない。SPEC-V2 §1.3）。base = 175 円、手数料 10% */
const usedCosts: TargetCostInput = {
  purchasePrice: 0,
  postage: 175,
  envelopeCost: 0,
  othersCost: 0,
  commission: 10,
};

/** 経費も手数料も 0 の境界 */
const zeroCosts: TargetCostInput = {
  purchasePrice: 0,
  postage: 0,
  envelopeCost: 0,
  othersCost: 0,
  commission: 0,
};

describe('§4.1 損益分岐点 breakEvenSalesPrice = ceil((経費 + 固定額) / (1 − 率/100))', () => {
  it('仕入品: 500 / 0.9 = 555.5… → 切り上げて 556', () => {
    expect(breakEvenSalesPrice(sourcedCosts)).toBe(556);
  });

  it('切り上げの裏取り: 556 なら黒字、1 円安い 555 は赤字のまま', () => {
    expect(netProfit({ ...sourcedCosts, salesPrice: 556 })).toBeGreaterThanOrEqual(0);
    expect(netProfit({ ...sourcedCosts, salesPrice: 555 })).toBeLessThan(0);
  });

  it('不用品（仕入価格なし）: 175 / 0.9 = 194.4… → 195', () => {
    expect(breakEvenSalesPrice(usedCosts)).toBe(195);
  });

  it('固定額の手数料あり: (500 + 100) / 0.9 = 666.6… → 667', () => {
    expect(breakEvenSalesPrice({ ...sourcedCosts, fixedFee: 100 })).toBe(667);
  });

  it('固定額 0 と、固定額を渡さない場合は同じ結果（§4 の要件）', () => {
    expect(breakEvenSalesPrice({ ...sourcedCosts, fixedFee: 0 })).toBe(
      breakEvenSalesPrice(sourcedCosts),
    );
  });

  it('手数料 0%（境界）: 割り算の分母が 1 なので経費そのもの', () => {
    expect(breakEvenSalesPrice({ ...sourcedCosts, commission: 0 })).toBe(500);
    // 固定額だけがある構成でも同じ形で出る
    expect(breakEvenSalesPrice({ ...zeroCosts, fixedFee: 120 })).toBe(120);
  });

  it('経費 0・手数料 0（境界）: 分岐点は 0 円', () => {
    expect(breakEvenSalesPrice(zeroCosts)).toBe(0);
  });
});

describe('§4.2 目標達成の最低販売価格 targetSalesPrice', () => {
  it('**目標が null なら null**（0 を返さない）', () => {
    expect(targetSalesPrice(null, sourcedCosts)).toBeNull();
    expect(targetSalesPrice(null, usedCosts)).toBeNull();
    expect(targetSalesPrice(null, zeroCosts)).toBeNull();
    expect(targetSalesPrice(null, { ...sourcedCosts, fixedFee: 100 })).toBeNull();
  });

  it('**目標 0 円は null ではない** ── 分岐点と同じ価格を返す（「決めていない」と別物）', () => {
    expect(targetSalesPrice(0, sourcedCosts)).toBe(556);
    expect(targetSalesPrice(0, sourcedCosts)).toBe(breakEvenSalesPrice(sourcedCosts));
  });

  it('仕入品・目標 500 円: (500 + 500) / 0.9 = 1111.1… → 1112', () => {
    expect(targetSalesPrice(500, sourcedCosts)).toBe(1112);
    // 計算タブの逆算（固定額を持たない版）と同じ答えになる
    expect(targetSalesPrice(500, sourcedCosts)).toBe(requiredSalesPrice(500, sourcedCosts));
  });

  it('不用品・目標 500 円: (500 + 175) / 0.9 = 750 ちょうど', () => {
    expect(targetSalesPrice(500, usedCosts)).toBe(750);
  });

  it('固定額の手数料あり: (500 + 500 + 100) / 0.9 = 1222.2… → 1223', () => {
    expect(targetSalesPrice(500, { ...sourcedCosts, fixedFee: 100 })).toBe(1223);
  });

  it('固定額 0 と、固定額を渡さない場合は同じ結果（§4 の要件）', () => {
    expect(targetSalesPrice(500, { ...sourcedCosts, fixedFee: 0 })).toBe(1112);
  });

  it('その価格で売れば目標に届く（固定額あり／なしのどちらでも往復する）', () => {
    for (const fixedFee of [0, 100]) {
      const costs = { ...sourcedCosts, fixedFee };
      const price = targetSalesPrice(500, costs)!;
      expect(netProfit({ ...costs, salesPrice: price }) - fixedFee).toBeGreaterThanOrEqual(500);
    }
  });

  it('手数料 0%・経費 0（境界）: 目標そのものが必要価格', () => {
    expect(targetSalesPrice(1000, zeroCosts)).toBe(1000);
    expect(targetSalesPrice(0, zeroCosts)).toBe(0);
  });
});

describe('§4.3 値下げ可能額 discountRoom = 現在価格 − 目標達成最低価格', () => {
  it('**目標が null なら null**（0 を返さない ──「もう下げられない」と読めてしまう）', () => {
    expect(discountRoom(1500, null, sourcedCosts)).toBeNull();
    expect(discountRoom(0, null, zeroCosts)).toBeNull();
  });

  it('目標に余裕があるとき: 1500 − 1112 = 388', () => {
    expect(discountRoom(1500, 500, sourcedCosts)).toBe(388);
  });

  it('目標に届いていないときは負ではなく 0（1000 − 1112 は −112）', () => {
    expect(discountRoom(1000, 500, sourcedCosts)).toBe(0);
  });

  it('目標 0 円は「決めていない」と違い、分岐点までの下げ幅を返す', () => {
    expect(discountRoom(1000, 0, sourcedCosts)).toBe(1000 - 556);
  });

  it('固定額の手数料があると下げ幅はその分だけ縮む', () => {
    expect(discountRoom(1500, 500, { ...sourcedCosts, fixedFee: 100 })).toBe(1500 - 1223);
  });

  it('不用品でも同じ式で出る: 1000 − 750 = 250', () => {
    expect(discountRoom(1000, 500, usedCosts)).toBe(250);
  });

  it('価格 0（境界）: 下げ幅は 0', () => {
    expect(discountRoom(0, 0, zeroCosts)).toBe(0);
  });
});

describe('§4.4 赤字までの余裕 lossMargin = 現在価格 − 分岐点', () => {
  it('黒字の記録: 1000 − 556 = 444', () => {
    expect(lossMargin(1000, sourcedCosts)).toBe(444);
  });

  it('**現在価格が分岐点を下回る赤字の記録は 0**（負を返さない）', () => {
    expect(lossMargin(400, sourcedCosts)).toBe(0);
    expect(netProfit({ ...sourcedCosts, salesPrice: 400 })).toBeLessThan(0);
  });

  it('分岐点ちょうどは 0', () => {
    expect(lossMargin(556, sourcedCosts)).toBe(0);
  });

  it('目標を決めていなくても出せる（この値だけは null にならない）', () => {
    expect(lossMargin(1000, usedCosts)).toBe(1000 - 195);
  });

  it('固定額の手数料は余裕を削る', () => {
    expect(lossMargin(1000, { ...sourcedCosts, fixedFee: 100 })).toBe(1000 - 667);
  });

  it('価格 0・経費 0・手数料 0（境界）: 余裕も 0', () => {
    expect(lossMargin(0, zeroCosts)).toBe(0);
  });
});

describe('§4.5 指定価格での純利益と利益率 simulateAtPrice', () => {
  it('仕入品・1000 円: 1000 − (500 + 100) = 400、利益率 40%', () => {
    const result = simulateAtPrice(1000, sourcedCosts);

    expect(result.price).toBe(1000);
    expect(result.netProfit).toBe(400);
    expect(result.profitRate).toBe(40);
  });

  it('固定額の手数料はそのまま引かれる: 400 − 50 = 350、利益率 35%', () => {
    const result = simulateAtPrice(1000, { ...sourcedCosts, fixedFee: 50 });

    expect(result.netProfit).toBe(350);
    expect(result.profitRate).toBe(35);
  });

  it('固定額 0 と、固定額を渡さない場合は同じ結果（§4 の要件）', () => {
    expect(simulateAtPrice(1000, { ...sourcedCosts, fixedFee: 0 })).toEqual(
      simulateAtPrice(1000, sourcedCosts),
    );
  });

  it('不用品（仕入価格なし）・1000 円: 1000 − (175 + 100) = 725', () => {
    expect(simulateAtPrice(1000, usedCosts).netProfit).toBe(725);
  });

  it('分岐点を下回る価格では純利益も利益率も負', () => {
    const result = simulateAtPrice(400, sourcedCosts);

    // 400 − (500 + 40) = −140 → −140 / 400 = −35%
    expect(result.netProfit).toBe(-140);
    expect(result.profitRate).toBe(-35);
  });

  it('**価格 0（境界）は利益率が null**（0 で割れない。0% と言うと嘘になる）', () => {
    const result = simulateAtPrice(0, sourcedCosts);

    expect(result.netProfit).toBe(-500);
    expect(result.profitRate).toBeNull();
  });

  it('価格 0・経費 0・手数料 0（境界）: 純利益 0 でも利益率は null のまま', () => {
    expect(simulateAtPrice(0, zeroCosts)).toEqual({ price: 0, netProfit: 0, profitRate: null });
  });

  it('手数料 0%（境界）: 販売価格から経費を引いただけ', () => {
    expect(simulateAtPrice(1000, { ...sourcedCosts, commission: 0 }).netProfit).toBe(500);
  });

  it('中間値は丸めない（§2.6）', () => {
    // 999 − (0 + 99.9) = 899.1
    expect(simulateAtPrice(999, { ...zeroCosts, commission: 10 }).netProfit).toBeCloseTo(899.1, 10);
  });
});

describe('データタブ期間サマリー: 利益率 periodProfitRate = 純利益合計 ÷ 売上合計 × 100', () => {
  it('複数件の合計: 売上 15,145・純利益 12,686 → 83.7…%', () => {
    expect(periodProfitRate(15145, 12686)).toBeCloseTo((12686 / 15145) * 100, 10);
  });

  it('**単純平均ではなく合計同士の比率** ── 1 件ずつの利益率を平均した値とは一致しないことがある', () => {
    // 1 件目: 100 円 / 1000 円 = 10%、2 件目: 1000 円 / 1000 円 = 100%（単純平均なら 55%）
    // 合計の比率: (100 + 1000) / (1000 + 1000) = 55% ← たまたま一致しない例で確かめる別ケースも見る
    expect(periodProfitRate(2000, 1100)).toBeCloseTo(55, 10);

    // 単純平均と合計比率がずれる組み合わせ（重みが売上の大きさに偏る）
    // 1 件目: 900 / 1000 = 90%、2 件目: 10 / 9000 ≈ 0.11%（単純平均なら約 45%）
    // 合計の比率: (900 + 10) / (1000 + 9000) = 9.1%
    expect(periodProfitRate(10000, 910)).toBeCloseTo(9.1, 10);
  });

  it('赤字の合計でも負の値をそのまま返す', () => {
    expect(periodProfitRate(1000, -200)).toBe(-20);
  });

  it('**売上合計 0（0 件のケース）は null** ── 0 で割れない。0% と言うと「収支 0」に読めて嘘になる', () => {
    expect(periodProfitRate(0, 0)).toBeNull();
  });
});

describe('データタブ期間サマリー: 1 件あたり periodProfitPerRecord = 純利益合計 ÷ 販売件数', () => {
  it('複数件の合計: 純利益 12,686・9 件 → 12686 / 9', () => {
    expect(periodProfitPerRecord(12686, 9)).toBeCloseTo(12686 / 9, 10);
  });

  it('赤字の合計でも負の値をそのまま返す', () => {
    expect(periodProfitPerRecord(-1000, 5)).toBe(-200);
  });

  it('**販売件数 0 は null** ── 0 で割れない', () => {
    expect(periodProfitPerRecord(0, 0)).toBeNull();
  });
});

describe('データタブ期間サマリー: 平均販売日数 periodAverageSaleDays = elapsedDays の単純平均', () => {
  const today = new Date(2026, 7, 31);
  const record = (saleStartDate: Date, saleDate: Date | null) => ({ saleStartDate, saleDate });

  it('複数件の経過日数を単純平均する（7 日・3 日・5 日 → 5 日）', () => {
    const records = [
      record(new Date(2026, 7, 1), new Date(2026, 7, 8)), // 7 日
      record(new Date(2026, 7, 1), new Date(2026, 7, 4)), // 3 日
      record(new Date(2026, 7, 1), new Date(2026, 7, 6)), // 5 日
    ];
    expect(periodAverageSaleDays(records, today)).toBeCloseTo(5, 10);
  });

  it('**0 日（当日売却）はそのまま含める** ── 逆転ではなく正当な最短の結果のため', () => {
    const records = [
      record(new Date(2026, 7, 1), new Date(2026, 7, 1)), // 0 日
      record(new Date(2026, 7, 1), new Date(2026, 7, 5)), // 4 日
    ];
    expect(periodAverageSaleDays(records, today)).toBeCloseTo(2, 10);
  });

  it('**日付逆転（販売日 < 記録日）の記録は集計から除外する**', () => {
    const records = [
      record(new Date(2026, 7, 10), new Date(2026, 7, 20)), // 10 日
      record(new Date(2026, 7, 10), new Date(2026, 7, 5)), // 逆転（-5 日）→ 除外
    ];
    // 逆転の 1 件を混ぜて平均すると (10 + -5) / 2 = 2.5 になってしまうが、
    // 除外するので残り 1 件（10 日）だけの平均になる
    expect(periodAverageSaleDays(records, today)).toBe(10);
  });

  it('全件が日付逆転なら、有効な記録が 0 件として null を返す', () => {
    const records = [record(new Date(2026, 7, 10), new Date(2026, 7, 5))];
    expect(periodAverageSaleDays(records, today)).toBeNull();
  });

  it('**対象記録が 1 件も無いときは null** ── periodProfitRate と同じ理由', () => {
    expect(periodAverageSaleDays([], today)).toBeNull();
  });
});

describe('データタブ「タグ別利益ランキング」: topTagProfits', () => {
  const stat = (partial: Partial<TagProfitTotals>): TagProfitTotals => ({
    tagId: 'tag-a',
    totalNetProfit: 0,
    totalSales: 0,
    recordCount: 0,
    ...partial,
  });

  it('純利益の降順で並べ、既定では上位 3 件だけ返す', () => {
    const stats = [
      stat({ tagId: 'a', totalNetProfit: 100, totalSales: 1000, recordCount: 1 }),
      stat({ tagId: 'b', totalNetProfit: 400, totalSales: 1000, recordCount: 1 }),
      stat({ tagId: 'c', totalNetProfit: 300, totalSales: 1000, recordCount: 1 }),
      stat({ tagId: 'd', totalNetProfit: 200, totalSales: 1000, recordCount: 1 }),
    ];

    const ranked = topTagProfits(stats);

    expect(ranked.map((r) => r.tagId)).toEqual(['b', 'c', 'd']);
    expect(ranked).toHaveLength(3);
  });

  it('各行の利益率は periodProfitRate と同じ式（このタグの純利益 ÷ 売上）で算出する', () => {
    const ranked = topTagProfits([
      stat({ tagId: 'a', totalNetProfit: 500, totalSales: 2000, recordCount: 2 }),
    ]);

    expect(ranked[0].profitRate).toBeCloseTo(25, 10);
  });

  it('売上合計が 0 のタグは利益率が null（periodProfitRate と同じ理由）', () => {
    const ranked = topTagProfits([stat({ totalNetProfit: 0, totalSales: 0, recordCount: 0 })]);

    expect(ranked[0].profitRate).toBeNull();
  });

  it('同額の純利益は件数が多い方を上にする', () => {
    const stats = [
      stat({ tagId: 'few', totalNetProfit: 500, totalSales: 1000, recordCount: 1 }),
      stat({ tagId: 'many', totalNetProfit: 500, totalSales: 1000, recordCount: 5 }),
    ];

    expect(topTagProfits(stats).map((r) => r.tagId)).toEqual(['many', 'few']);
  });

  it('tagId: null（未分類）も他のタグと同じ 1 行として扱われ、金額で並ぶ', () => {
    const stats = [
      stat({ tagId: null, totalNetProfit: 900, totalSales: 1000, recordCount: 3 }),
      stat({ tagId: 'a', totalNetProfit: 100, totalSales: 1000, recordCount: 1 }),
    ];

    expect(topTagProfits(stats).map((r) => r.tagId)).toEqual([null, 'a']);
  });

  it('0 件（空配列）は空配列を返す ── 呼び出し側はこれを見てセクションを出さない', () => {
    expect(topTagProfits([])).toEqual([]);
  });

  it('純利益が同額でも売上が違えば利益率は別々に出す（総利益に対する寄与度と取り違えていないことの確認）', () => {
    const ranked = topTagProfits([
      stat({ tagId: 'a', totalNetProfit: 3060, totalSales: 3500, recordCount: 1 }),
      stat({ tagId: 'b', totalNetProfit: 3060, totalSales: 7000, recordCount: 1 }),
    ]);

    const rateOf = (tagId: string) => ranked.find((r) => r.tagId === tagId)?.profitRate;
    expect(rateOf('a')).toBeCloseTo((3060 / 3500) * 100, 10);
    expect(rateOf('b')).toBeCloseTo((3060 / 7000) * 100, 10);
    expect(rateOf('a')).not.toBeCloseTo(rateOf('b') ?? NaN, 5);
  });
});

describe('データタブ「タグ別利益ランキング」: allTagProfits（「すべて見る」展開）', () => {
  const stat = (partial: Partial<TagProfitTotals>): TagProfitTotals => ({
    tagId: 'tag-a',
    totalNetProfit: 0,
    totalSales: 0,
    recordCount: 0,
    ...partial,
  });

  it('3 件を超えても全件、純利益の降順で返す', () => {
    const stats = [
      stat({ tagId: 'a', totalNetProfit: 100, totalSales: 1000, recordCount: 1 }),
      stat({ tagId: 'b', totalNetProfit: 400, totalSales: 1000, recordCount: 1 }),
      stat({ tagId: 'c', totalNetProfit: 300, totalSales: 1000, recordCount: 1 }),
      stat({ tagId: 'd', totalNetProfit: 200, totalSales: 1000, recordCount: 1 }),
    ];

    expect(allTagProfits(stats).map((r) => r.tagId)).toEqual(['b', 'c', 'd', 'a']);
  });

  it('topTagProfits と同じ利益率の式を使う', () => {
    const ranked = allTagProfits([
      stat({ tagId: 'a', totalNetProfit: 500, totalSales: 2000, recordCount: 2 }),
    ]);

    expect(ranked[0].profitRate).toBeCloseTo(25, 10);
  });

  it('0 件（空配列）は空配列を返す', () => {
    expect(allTagProfits([])).toEqual([]);
  });
});

describe('データタブ「タグ別利益ランキング」（案 2b）: tagsWithoutRecords（記録のないタグの分離）', () => {
  const tag = (id: string) => ({ id, name: id, colorKey: 'red' });
  const stat = (tagId: string | null): TagProfitTotals => ({
    tagId,
    totalNetProfit: 100,
    totalSales: 1000,
    recordCount: 1,
  });

  it('totals に出てこないタグだけを返す（記録が 1 件も無いタグ）', () => {
    const allTags = [tag('a'), tag('b'), tag('c')];
    const totals = [stat('a')];

    expect(tagsWithoutRecords(allTags, totals).map((t) => t.id)).toEqual(['b', 'c']);
  });

  it('全タグに記録があれば空配列', () => {
    const allTags = [tag('a'), tag('b')];
    const totals = [stat('a'), stat('b')];

    expect(tagsWithoutRecords(allTags, totals)).toEqual([]);
  });

  it('未分類（tagId: null）の集計行があっても無視する（タグの実体を持たないため）', () => {
    const allTags = [tag('a'), tag('b')];
    const totals = [stat('a'), stat(null)];

    expect(tagsWithoutRecords(allTags, totals).map((t) => t.id)).toEqual(['b']);
  });

  it('totals が空なら全タグが「記録のないタグ」', () => {
    const allTags = [tag('a'), tag('b')];

    expect(tagsWithoutRecords(allTags, []).map((t) => t.id)).toEqual(['a', 'b']);
  });
});

describe('データタブ「タグ別純利益の推移」の初期チェック（topTagProfits をそのまま流用）', () => {
  const stat = (partial: Partial<TagProfitTotals>): TagProfitTotals => ({
    tagId: 'tag-a',
    totalNetProfit: 0,
    totalSales: 0,
    recordCount: 0,
    ...partial,
  });

  it('純利益上位 3 タグ（未分類も対象）が初期チェックになる', () => {
    const stats = [
      stat({ tagId: 'a', totalNetProfit: 100, totalSales: 1000, recordCount: 1 }),
      stat({ tagId: null, totalNetProfit: 900, totalSales: 1000, recordCount: 3 }),
      stat({ tagId: 'c', totalNetProfit: 300, totalSales: 1000, recordCount: 1 }),
      stat({ tagId: 'd', totalNetProfit: 200, totalSales: 1000, recordCount: 1 }),
    ];

    const initiallySelected = topTagProfits(stats).map((item) => item.tagId);

    expect(initiallySelected).toEqual([null, 'c', 'd']);
  });

  it('タグが 3 件未満ならあるだけ選ぶ', () => {
    const stats = [
      stat({ tagId: 'a', totalNetProfit: 100, totalSales: 1000, recordCount: 1 }),
      stat({ tagId: 'b', totalNetProfit: 200, totalSales: 1000, recordCount: 1 }),
    ];

    expect(topTagProfits(stats).map((item) => item.tagId)).toEqual(['b', 'a']);
  });

  it('タグが 1 つも無ければ初期チェックも空', () => {
    expect(topTagProfits([]).map((item) => item.tagId)).toEqual([]);
  });
});

describe('§4.6 シミュレーターの範囲 simulationPriceRange', () => {
  /** 分岐点 5556 円になる経費（5000 / 0.9 = 5555.5…） */
  const bigCosts: TargetCostInput = { ...zeroCosts, purchasePrice: 5000, commission: 10 };

  describe('現在価格 >= 分岐点（黒字）: 下へ伸ばす', () => {
    it('最小 =(分岐点 − 500) の 100 円単位切り下げ: 5556 − 500 = 5056 → 5000', () => {
      expect(simulationPriceRange(8000, bigCosts)).toEqual({ min: 5000, max: 8000 });
    });

    it('最大は現在価格そのもの（丸めない）', () => {
      expect(simulationPriceRange(8123, bigCosts).max).toBe(8123);
    });

    it('分岐点が小さいと最小は 0 に張り付く（556 − 500 = 56 → 0）', () => {
      expect(simulationPriceRange(1000, sourcedCosts)).toEqual({ min: 0, max: 1000 });
    });

    it('0 未満にはならない（195 − 500 = −305 でも 0）', () => {
      expect(simulationPriceRange(1000, usedCosts).min).toBe(0);
    });

    it('現在価格 = 分岐点ちょうど（境界）も黒字側の向き', () => {
      expect(simulationPriceRange(556, sourcedCosts)).toEqual({ min: 0, max: 556 });
    });

    it('経費 0・手数料 0・価格 0（境界）: 範囲は 0 〜 0', () => {
      expect(simulationPriceRange(0, zeroCosts)).toEqual({ min: 0, max: 0 });
    });
  });

  describe('現在価格 < 分岐点（赤字）: 上へ伸ばす', () => {
    it('最小は現在価格。最大 = ceil100(分岐点 + 不足額): 5556 + 5456 = 11012 → 11100', () => {
      // 不足額 = 5556 − 100 = 5456
      expect(simulationPriceRange(100, bigCosts)).toEqual({ min: 100, max: 11100 });
    });

    it('**必ず分岐点に届く**（旧仕様の潰れた範囲を作らない）', () => {
      const range = simulationPriceRange(100, bigCosts);

      expect(range.min).toBeLessThan(range.max);
      expect(range.max).toBeGreaterThan(breakEvenSalesPrice(bigCosts));
    });

    it('不足がわずかでも最低 分岐点 + 500 は超える: 5556 + 500 = 6056 → 6100', () => {
      // 不足額 1 円。ceil100(5557) = 5600 では分岐点のすぐ上で頭打ちになる
      expect(simulationPriceRange(5555, bigCosts)).toEqual({ min: 5555, max: 6100 });
    });

    it('SPEC-V9 §4.6 の例（分岐点 3112・現在 2500）: 3112 + 612 = 3724 → 3800', () => {
      // 経費 2800 / 手数料 10% → 2800 / 0.9 = 3111.1… → 3112
      const costs: TargetCostInput = { ...zeroCosts, purchasePrice: 2800, commission: 10 };

      expect(breakEvenSalesPrice(costs)).toBe(3112);
      expect(simulationPriceRange(2500, costs)).toEqual({ min: 2500, max: 3800 });
    });

    it('価格 0 でも経費があれば赤字側（最小 0・最大は分岐点の上）', () => {
      expect(simulationPriceRange(0, sourcedCosts)).toEqual({ min: 0, max: 1200 });
    });
  });
});

describe('§4.7 経過日数 elapsedDays', () => {
  const saleStartDate = new Date(2026, 7, 2, 10, 0);
  const today = new Date(2026, 7, 31);

  it('売却済みは 記録日 → 販売日（今日は使わない）', () => {
    expect(elapsedDays({ saleStartDate, saleDate: new Date(2026, 7, 9, 8, 0) }, today)).toBe(7);
  });

  it('出品中は 記録日 → 今日', () => {
    expect(elapsedDays({ saleStartDate, saleDate: null }, new Date(2026, 7, 10))).toBe(8);
  });

  it('**同じ日に売れたら 0 日**（時刻が違っても暦日で数える）', () => {
    expect(elapsedDays({ saleStartDate, saleDate: new Date(2026, 7, 2, 23, 55) }, today)).toBe(0);
  });

  it('出品当日にまだ売れていなければ 0 日', () => {
    expect(elapsedDays({ saleStartDate, saleDate: null }, new Date(2026, 7, 2, 23, 0))).toBe(0);
  });

  it('**販売日が記録日より前（日付逆転）は負の値をそのまま返す** ── 0 に丸めない', () => {
    expect(elapsedDays({ saleStartDate, saleDate: new Date(2026, 6, 30, 9, 0) }, today)).toBe(-3);
  });

  it('日付逆転は出品中でも起き得る（今日より後の記録日）', () => {
    expect(elapsedDays({ saleStartDate, saleDate: null }, new Date(2026, 6, 31))).toBe(-2);
  });
});
