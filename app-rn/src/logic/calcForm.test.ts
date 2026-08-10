// 計算タブの入力値の扱い（UI-SPEC §1.1）。
// §6.3 のテスト方針どおり、画面のスナップショットは取らず純粋関数だけで担保する。

import { describe, expect, it } from 'vitest';

import {
  hasAnyInput,
  newCalcValues,
  requiredPriceEquation,
  toCostInput,
  toInitialAmounts,
  toRequiredCostInput,
} from './calcForm';
import { netProfit } from './profit';
import { DEFAULT_COMMISSION } from './recordForm';

describe('newCalcValues', () => {
  it('金額は空欄・手数料は既定値・種別は設定の既定種別', () => {
    expect(newCalcValues('sourced')).toEqual({
      kind: 'sourced',
      salesPrice: '',
      purchasePrice: '',
      postage: '',
      envelopeCost: '',
      othersCost: '',
      targetProfit: '',
      commission: DEFAULT_COMMISSION,
    });
  });
});

describe('UI-SPEC §5-8 クリアの有効・無効', () => {
  it('開いた直後は無効', () => {
    expect(hasAnyInput(newCalcValues('used'), 'used')).toBe(false);
  });

  it('金額を入れると有効', () => {
    expect(hasAnyInput({ ...newCalcValues('used'), salesPrice: '100' }, 'used')).toBe(true);
  });

  it('逆算の目標額だけでも有効', () => {
    expect(hasAnyInput({ ...newCalcValues('used'), targetProfit: '500' }, 'used')).toBe(true);
  });

  it('手数料を既定値から動かすと有効（クリアで戻るため）', () => {
    expect(hasAnyInput({ ...newCalcValues('used'), commission: 8 }, 'used')).toBe(true);
  });

  it('種別を既定値から変えると有効（クリアで既定種別に戻るため）', () => {
    expect(hasAnyInput({ ...newCalcValues('used'), kind: 'sourced' }, 'used')).toBe(true);
  });

  it('設定の既定種別が変われば、同じ値でも判定が変わる', () => {
    const values = newCalcValues('used');
    expect(hasAnyInput(values, 'sourced')).toBe(true);
  });
});

describe('toCostInput', () => {
  const filled = {
    ...newCalcValues('sourced'),
    salesPrice: '1000',
    purchasePrice: '300',
    postage: '200',
    envelopeCost: '50',
    othersCost: '',
  };

  it('空欄は 0 扱い（SPEC §5.1）', () => {
    expect(toCostInput(filled).othersCost).toBe(0);
  });

  it('仕入品は仕入価格をそのまま渡す', () => {
    expect(toCostInput(filled).purchasePrice).toBe(300);
  });

  it('不用品は入力が残っていても仕入価格 0（SPEC-V2 §1.3）', () => {
    expect(toCostInput({ ...filled, kind: 'used' }).purchasePrice).toBe(0);
  });
});

describe('toRequiredCostInput', () => {
  it('販売価格が逆算結果に置き換わる（入力欄の販売価格は使わない）', () => {
    const values = {
      ...newCalcValues('used'),
      salesPrice: '99999',
      postage: '200',
      targetProfit: '500',
    };
    // 手数料 10% → (500 + 200) / 0.9 = 777.7… → 778（§2.5 は Math.ceil）
    expect(toRequiredCostInput(values).salesPrice).toBe(778);
  });

  it('その価格で売れば目標額に届く（丸め上げのぶんだけ上振れる）', () => {
    const values = { ...newCalcValues('used'), postage: '200', targetProfit: '500' };
    expect(netProfit(toRequiredCostInput(values))).toBeGreaterThanOrEqual(500);
  });
});

describe('requiredPriceEquation（逆算の検算行）', () => {
  it('指摘された例: 目標 100 円・手数料 10% → 売上 112 − 販売手数料 11', () => {
    const values = { ...newCalcValues('used'), targetProfit: '100' };
    expect(requiredPriceEquation(values)).toEqual({
      sales: 112,
      deductions: [{ label: '販売手数料', amount: 11 }],
      // 112 − 11。切り上げのぶん目標の 100 円をわずかに上回る
      profit: 101,
    });
  });

  it('表示される数字だけで引き算が必ず閉じる', () => {
    // 手数料額が 11.2 のように端数を持つ組み合わせでも、右辺は表示された項の差になる
    const cases = ['100', '333', '1000', '12345'];
    for (const targetProfit of cases) {
      const equation = requiredPriceEquation({
        ...newCalcValues('sourced'),
        purchasePrice: '777',
        postage: '185',
        targetProfit,
      });
      const subtracted = equation.deductions.reduce((rest, term) => rest - term.amount, equation.sales);
      expect(equation.profit).toBe(subtracted);
    }
  });

  it('右辺は目標額以上になる（切り上げのぶんだけ上振れる）', () => {
    const equation = requiredPriceEquation({ ...newCalcValues('used'), targetProfit: '100' });
    expect(equation.profit).toBeGreaterThanOrEqual(100);
  });

  it('入力済みの経費も引き算に含める', () => {
    const equation = requiredPriceEquation({
      ...newCalcValues('sourced'),
      purchasePrice: '500',
      postage: '200',
      envelopeCost: '30',
      othersCost: '20',
      targetProfit: '1000',
    });
    expect(equation.deductions.map((term) => term.label)).toEqual([
      '仕入価格',
      '送料',
      '梱包・その他',
      '販売手数料',
    ]);
  });

  it('0 円の項は出さない', () => {
    const equation = requiredPriceEquation({ ...newCalcValues('used'), targetProfit: '100' });
    expect(equation.deductions.map((term) => term.label)).toEqual(['販売手数料']);
  });

  it('不用品では仕入価格の項を出さない（入力が残っていても）', () => {
    const equation = requiredPriceEquation({
      ...newCalcValues('used'),
      purchasePrice: '500',
      targetProfit: '100',
    });
    expect(equation.deductions.map((term) => term.label)).not.toContain('仕入価格');
  });

  it('手数料 0% なら手数料の項も消える', () => {
    const equation = requiredPriceEquation({
      ...newCalcValues('used'),
      commission: 0,
      targetProfit: '100',
    });
    expect(equation).toEqual({ sales: 100, deductions: [], profit: 100 });
  });
});

describe('toInitialAmounts', () => {
  const values = {
    ...newCalcValues('sourced'),
    salesPrice: '1000',
    purchasePrice: '300',
    commission: 8,
  };

  it('種別と金額をそのまま引き継ぐ（SPEC-V2 §1.4）', () => {
    expect(toInitialAmounts(values)).toMatchObject({
      kind: 'sourced',
      salesPrice: '1000',
      purchasePrice: '300',
      commission: 8,
    });
  });

  it('不用品では仕入価格を渡さない（欄を出していないため）', () => {
    expect(toInitialAmounts({ ...values, kind: 'used' }).purchasePrice).toBe('');
  });

  it('逆算の目標額は引き継がない（レコードの項目ではない）', () => {
    expect(toInitialAmounts(values)).not.toHaveProperty('targetProfit');
  });
});
