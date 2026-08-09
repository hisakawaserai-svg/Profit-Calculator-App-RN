// SPEC.md §2（計算ロジック）・§5.1（入力フィルタ）・§7（確定決定）の検証テスト。
// 期待値はすべて SPEC の数式から手計算で導出している（実装からの逆算ではない）。

import { describe, expect, it } from 'vitest';
import {
  commissionCost,
  netProfit,
  requiredSalesPrice,
  roundForDisplay,
  totalExpenses,
  type CostInput,
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
