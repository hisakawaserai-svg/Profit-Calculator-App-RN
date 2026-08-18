// 計算タブの入力値の扱い（UI-SPEC §1.1）。
// §6.3 のテスト方針どおり、画面のスナップショットは取らず純粋関数だけで担保する。

import { describe, expect, it } from 'vitest';

import {
  hasAnyInput,
  newCalcValues,
  profitBreakdown,
  requiredPriceResult,
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
      siteName: '',
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

  it('販売サイトを選んだだけでも有効（クリアで札も外れるため。SPEC-V3 §1.5.1）', () => {
    expect(hasAnyInput({ ...newCalcValues('used'), siteName: 'フリマA' }, 'used')).toBe(true);
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

describe('profitBreakdown（結果側の帯・2 値）', () => {
  const filled = {
    ...newCalcValues('sourced'),
    salesPrice: '1000',
    purchasePrice: '300',
    postage: '200',
    envelopeCost: '50',
  };

  it('入力した販売価格を分解する（逆算結果ではない）', () => {
    const breakdown = profitBreakdown('ja', filled);
    expect(breakdown.salesPrice).toBe(1000);
    expect(breakdown.commissionAmount).toBe(100);
    expect(breakdown.expenses).toBe(550);
    expect(breakdown.deducted).toBe(650);
    expect(breakdown.kept).toBe(350);
  });

  it('手元は netProfit と一致する', () => {
    expect(profitBreakdown('ja', filled).kept).toBe(netProfit(toCostInput(filled)));
  });

  it('区画を足すと販売価格にぴったり一致する', () => {
    for (const salesPrice of ['1000', '1234', '99', '7777']) {
      const breakdown = profitBreakdown('ja', { ...filled, salesPrice });
      const summed = breakdown.parts.reduce((sum, part) => sum + part.amount, 0);
      expect(summed).toBe(breakdown.salesPrice);
    }
  });

  it('逆算側と同じ並び・同じキーで返す（2 つのモードで見え方を揃えるため）', () => {
    expect(profitBreakdown('ja', { ...filled, othersCost: '20' }).parts.map((part) => part.key)).toEqual([
      'purchasePrice',
      'postage',
      'commission',
      'envelopeCost',
      'othersCost',
      'kept',
    ]);
  });

  it('不用品では仕入価格を帯から外す（入力が残っていても）', () => {
    const breakdown = profitBreakdown('ja', { ...filled, kind: 'used' });
    expect(breakdown.parts.map((part) => part.key)).not.toContain('purchasePrice');
    expect(breakdown.expenses).toBe(250);
  });

  it('経費が販売価格を超えると手元がマイナスになる（帯は引かれる分だけになる）', () => {
    const breakdown = profitBreakdown('ja', { ...filled, salesPrice: '100' });
    expect(breakdown.kept).toBeLessThan(0);
    // 手元の項目自体は残る（一覧では読めるように）が、帯に描かれるのは 0 円より大きい区画だけ
    expect(breakdown.parts[breakdown.parts.length - 1].key).toBe('kept');
    expect(breakdown.parts.filter((part) => part.amount > 0).map((part) => part.key)).toEqual([
      'purchasePrice',
      'postage',
      'commission',
      'envelopeCost',
    ]);
  });

  it('何も入力していなければ全項目 0（帯は空になる）', () => {
    const breakdown = profitBreakdown('ja', newCalcValues('used'));
    expect(breakdown.parts.every((part) => part.amount === 0)).toBe(true);
    expect(breakdown.kept).toBe(0);
  });
});

describe('requiredPriceResult（逆算結果の帯・説明文・式の材料）', () => {
  /** 確定デザイン 12c の例: 目標 100 円・経費 765 円・手数料 10% → 962 円 */
  const designExample = {
    ...newCalcValues('sourced'),
    purchasePrice: '500',
    postage: '215',
    envelopeCost: '50',
    targetProfit: '100',
  };

  it('12c の例と同じ数字になる', () => {
    const result = requiredPriceResult('ja', designExample);
    expect(result.requiredPrice).toBe(962);
    expect(result.commissionAmount).toBe(96);
    expect(result.expenses).toBe(765);
    expect(result.deducted).toBe(861);
    expect(result.kept).toBe(101);
  });

  it('指摘された例: 目標 100 円・手数料 10% のみ → 112 円', () => {
    const result = requiredPriceResult('ja', { ...newCalcValues('used'), targetProfit: '100' });
    expect(result.requiredPrice).toBe(112);
    expect(result.commissionAmount).toBe(11);
    // 切り上げのぶん目標の 100 円をわずかに上回る
    expect(result.kept).toBe(101);
  });

  it('帯・一覧の項目を足すと必要販売価格にぴったり一致する', () => {
    // 手数料額が端数を持つ組み合わせでも、表示される数字だけで足し算が閉じる
    for (const targetProfit of ['100', '333', '1000', '12345']) {
      const result = requiredPriceResult('ja', {
        ...newCalcValues('sourced'),
        purchasePrice: '777',
        postage: '185',
        envelopeCost: '33',
        othersCost: '7',
        targetProfit,
      });
      const summed = result.parts.reduce((sum, part) => sum + part.amount, 0);
      expect(summed).toBe(result.requiredPrice);
      expect(result.kept + result.deducted).toBe(result.requiredPrice);
    }
  });

  it('手元に残る額は目標額以上になる（切り上げのぶんだけ上振れる）', () => {
    const result = requiredPriceResult('ja', { ...newCalcValues('used'), targetProfit: '100' });
    expect(result.kept).toBeGreaterThanOrEqual(100);
  });

  it('項目の並びは 経費 4 項目（仕入 → 送料 → 手数料 → 梱包材・その他）→ 手元', () => {
    const result = requiredPriceResult('ja', {
      ...newCalcValues('sourced'),
      purchasePrice: '500',
      postage: '200',
      envelopeCost: '30',
      othersCost: '20',
      targetProfit: '1000',
    });
    expect(result.parts.map((part) => part.key)).toEqual([
      'purchasePrice',
      'postage',
      'commission',
      'envelopeCost',
      'othersCost',
      'kept',
    ]);
    // 内訳（§1.1-3a）と違い、梱包材とその他はまとめない（帯の区画と 1 対 1 にするため）
    expect(result.parts.map((part) => part.label)).toContain('梱包材');
  });

  it('経費 0 項目でも手元と販売手数料は残る', () => {
    const result = requiredPriceResult('ja', { ...newCalcValues('used'), targetProfit: '100' });
    expect(result.parts.map((part) => part.key)).toEqual(['commission', 'kept']);
    expect(result.expenses).toBe(0);
  });

  it('手数料 0% なら手数料の項も消える（手元だけ）', () => {
    const result = requiredPriceResult('ja', {
      ...newCalcValues('used'),
      commission: 0,
      targetProfit: '100',
    });
    expect(result.parts.map((part) => part.key)).toEqual(['kept']);
    expect(result.requiredPrice).toBe(100);
    expect(result.kept).toBe(100);
  });

  it('不用品では仕入価格を帯・一覧から外す（入力が残っていても）', () => {
    const result = requiredPriceResult('ja', {
      ...newCalcValues('used'),
      purchasePrice: '500',
      postage: '200',
      targetProfit: '100',
    });
    expect(result.parts.map((part) => part.key)).not.toContain('purchasePrice');
    expect(result.expenses).toBe(200);
  });

  it('手元は 0 円でも項目として残る（帯の緑が何かを一覧で読めるように）', () => {
    const result = requiredPriceResult('ja', { ...newCalcValues('used'), commission: 0 });
    expect(result.parts.map((part) => part.key)).toEqual(['kept']);
    expect(result.kept).toBe(0);
  });
});

describe('requiredPriceResult の式（計算のしかた）', () => {
  it('12c の例: 目標100 ＋ 経費765 ＝ 865、÷ 0.9 で 961.1... を切り上げて 962', () => {
    const { formula } = requiredPriceResult('ja', {
      ...newCalcValues('sourced'),
      purchasePrice: '500',
      postage: '215',
      envelopeCost: '50',
      targetProfit: '100',
    });
    expect(formula.targetProfit).toBe(100);
    expect(formula.expenses).toBe(765);
    expect(formula.subtotal).toBe(865);
    expect(formula.divisor).toBe(0.9);
    expect(formula.exact).toBeCloseTo(961.111, 3);
    expect(formula.requiredPrice).toBe(962);
    expect(formula.roundedUp).toBe(true);
  });

  it('式に出る足し算は画面上で必ず閉じる', () => {
    const { formula } = requiredPriceResult('ja', {
      ...newCalcValues('sourced'),
      purchasePrice: '777',
      postage: '185',
      targetProfit: '333',
    });
    expect(formula.subtotal).toBe(formula.targetProfit + formula.expenses);
  });

  it('切り上げ前の値を Math.ceil すると必ず必要販売価格になる', () => {
    for (const commission of [0, 3, 7, 10, 50]) {
      const { formula } = requiredPriceResult('ja', {
        ...newCalcValues('sourced'),
        commission,
        purchasePrice: '480',
        postage: '185',
        targetProfit: '250',
      });
      expect(Math.ceil(formula.exact)).toBe(formula.requiredPrice);
    }
  });

  it('割り切れるときは切り上げたことにしない', () => {
    // 90 / 0.9 = 100 ちょうど
    const { formula } = requiredPriceResult('ja', { ...newCalcValues('used'), targetProfit: '90' });
    expect(formula.roundedUp).toBe(false);
    expect(formula.requiredPrice).toBe(100);
  });

  it('割る数は浮動小数の誤差を持たない（手数料 7% でも 0.93）', () => {
    const { formula } = requiredPriceResult('ja', {
      ...newCalcValues('used'),
      commission: 7,
      targetProfit: '100',
    });
    expect(formula.divisor).toBe(0.93);
  });
});

describe('requiredPriceResult の「1 つ下の価格」', () => {
  it('12c の例: 962 円 → 950 円では 90 円にしかならない', () => {
    const result = requiredPriceResult('ja', {
      ...newCalcValues('sourced'),
      purchasePrice: '500',
      postage: '215',
      envelopeCost: '50',
      targetProfit: '100',
    });
    expect(result.lowerPrice).toEqual({ price: 950, profit: 90 });
  });

  it('指摘された 112 円のケースでは、暗算で出る 110 円が例になる', () => {
    const result = requiredPriceResult('ja', { ...newCalcValues('used'), targetProfit: '100' });
    expect(result.lowerPrice).toEqual({ price: 110, profit: 99 });
  });

  it('刻みは金額帯で変える（200 以下 10 / 1000 以下 50 / 10000 以下 100 / それ以上 500）', () => {
    const lowerPriceOf = (targetProfit: string) =>
      requiredPriceResult('ja', { ...newCalcValues('used'), commission: 0, targetProfit }).lowerPrice;

    expect(lowerPriceOf('150')?.price).toBe(140);
    expect(lowerPriceOf('900')?.price).toBe(850);
    expect(lowerPriceOf('9800')?.price).toBe(9700);
    expect(lowerPriceOf('30000')?.price).toBe(29500);
  });

  it('必ず必要販売価格より安く、目標には届かない', () => {
    for (const targetProfit of ['30', '100', '480', '1200', '9800', '45000']) {
      const result = requiredPriceResult('ja', {
        ...newCalcValues('sourced'),
        postage: '185',
        targetProfit,
      });
      if (result.lowerPrice == null) continue;
      expect(result.lowerPrice.price).toBeLessThan(result.requiredPrice);
      expect(result.lowerPrice.profit).toBeLessThan(result.formula.targetProfit);
    }
  });

  it('刻みより安い価格では例を出さない（0 円では説明にならない）', () => {
    // 目標 5 円・経費なし・手数料 10% → 6 円。10 円刻みで下げると 0 円になる
    const result = requiredPriceResult('ja', { ...newCalcValues('used'), targetProfit: '5' });
    expect(result.requiredPrice).toBe(6);
    expect(result.lowerPrice).toBeNull();
  });

  it('目標も経費もない状態では例を出さない', () => {
    expect(requiredPriceResult('ja', newCalcValues('used')).lowerPrice).toBeNull();
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
    expect(toInitialAmounts(values, values.salesPrice, '')).toMatchObject({
      kind: 'sourced',
      salesPrice: '1000',
      purchasePrice: '300',
      commission: 8,
    });
  });

  it('不用品では仕入価格を渡さない（欄を出していないため）', () => {
    expect(toInitialAmounts({ ...values, kind: 'used' }, '1000', '').purchasePrice).toBe('');
  });

  it('選んだ販売サイトの名前も引き継ぐ（SPEC-V3 §1.5.1）', () => {
    const withSite = { ...values, siteName: 'フリマA' };
    expect(toInitialAmounts(withSite, withSite.salesPrice, '').siteName).toBe('フリマA');
  });

  it('逆算の目標額をフォームの初期値として引き継ぐ（SPEC-V9 §5.3）', () => {
    const target = { ...values, targetProfit: '500' };
    expect(toInitialAmounts(target, target.salesPrice, target.targetProfit).targetProfit).toBe(
      '500',
    );
  });

  it('目標 0 円も引き継ぐ（「決めていない」ではなく立派な目標。§1.2）', () => {
    const target = { ...values, targetProfit: '0' };
    expect(toInitialAmounts(target, target.salesPrice, target.targetProfit).targetProfit).toBe('0');
  });

  it('「利益を出す」モードでは目標を引き継がない（画面に出ていないため。§5.3）', () => {
    // 呼び出し側がモードを解決して空文字を渡す。values に入力の残骸が残っていても渡らない
    const target = { ...values, targetProfit: '500' };
    expect(toInitialAmounts(target, target.salesPrice, '').targetProfit).toBe('');
  });

  it('逆算モードでは画面に出ている逆算結果を引き継ぐ（入力欄の値ではない）', () => {
    // 欄に 439 と出ているのに 0 が記録される、という食い違いを起こさない
    const target = { ...newCalcValues('used'), salesPrice: '', targetProfit: '100' };
    const displayed = String(requiredPriceResult('ja', target).requiredPrice);
    expect(toInitialAmounts(target, displayed, target.targetProfit).salesPrice).toBe(displayed);
  });
});
