// SPEC-V2 §5.3「確定ラベル表」の検証。
// §6.3 のテスト方針どおり、表示ラベルはこの純粋関数のテストだけで担保し、
// 画面のスナップショットは取らない。

import { describe, expect, it } from 'vitest';

import {
  COMMISSION_LABEL,
  EXPENSES_LABEL,
  PURCHASE_PRICE_LABEL,
  REQUIRED_SALES_PRICE_LABEL,
  SALES_PRICE_LABEL,
  TARGET_TAB_LABEL,
  TOTAL_PROFIT_LABEL,
  TOTAL_SALES_LABEL,
  commissionFieldLabel,
  metricLabel,
  profitLabel,
  profitTabLabel,
  recordKindLabel,
  requiredPriceEquationText,
  requiredPriceNote,
  targetProfitLabel,
} from './labels';

describe('§1.1 種別の表示名', () => {
  it('不用品 / 仕入品', () => {
    expect(recordKindLabel('used')).toBe('不用品');
    expect(recordKindLabel('sourced')).toBe('仕入品');
  });
});

describe('§5.3 レコード 1 件の netProfit', () => {
  it('不用品は「純利益」', () => {
    expect(profitLabel('used')).toBe('純利益');
  });

  it('仕入品は「利益」', () => {
    expect(profitLabel('sourced')).toBe('利益');
  });

  it('不用品を「手取り」とは呼ばない（§1.2 / §7-8）', () => {
    expect(profitLabel('used')).not.toBe('手取り');
  });
});

describe('§5.3 複数レコードの Σ netProfit', () => {
  it('種別が混ざるので中立語「収支」', () => {
    expect(TOTAL_PROFIT_LABEL).toBe('収支');
  });

  it('合計は種別語のどちらとも一致しない（案 D の動的ラベルは採らない。§5.2）', () => {
    expect(TOTAL_PROFIT_LABEL).not.toBe(profitLabel('used'));
    expect(TOTAL_PROFIT_LABEL).not.toBe(profitLabel('sourced'));
  });
});

describe('§5.3 種別で変えない語', () => {
  it('経費 / 販売価格 / 仕入価格 / 売上 / 販売手数料 / 必要な販売価格', () => {
    expect(EXPENSES_LABEL).toBe('経費');
    expect(SALES_PRICE_LABEL).toBe('販売価格');
    expect(PURCHASE_PRICE_LABEL).toBe('仕入価格');
    expect(TOTAL_SALES_LABEL).toBe('売上');
    expect(COMMISSION_LABEL).toBe('販売手数料');
    expect(REQUIRED_SALES_PRICE_LABEL).toBe('必要な販売価格');
  });
});

describe('§1.3 / UI-SPEC §6-4 計算タブのラベル', () => {
  it('結果側のセグメント名は種別で出し分ける', () => {
    expect(profitTabLabel('used')).toBe('純利益を出す');
    expect(profitTabLabel('sourced')).toBe('利益を出す');
  });

  it('逆算側のセグメント名は種別で変えない', () => {
    expect(TARGET_TAB_LABEL).toBe('目標から逆算');
  });

  it('逆算入力欄のラベル', () => {
    expect(targetProfitLabel('used')).toBe('目標の純利益');
    expect(targetProfitLabel('sourced')).toBe('目標利益');
  });

  it('手数料の入力行と逆算結果の注記には率が入る', () => {
    expect(commissionFieldLabel(10)).toBe('手数料 10%');
    expect(requiredPriceNote(10)).toBe('送料・手数料 10% を差し引いた後の金額です');
  });

  it('逆算の検算行は引き算の形。「円」は末尾だけに付く', () => {
    const equation = { sales: 112, deductions: [{ label: '販売手数料', amount: 11 }], profit: 101 };
    expect(requiredPriceEquationText(equation, profitLabel('used'))).toBe(
      '売上 112 − 販売手数料 11 = 純利益 101 円',
    );
  });

  it('引かれる項が複数あれば並べて出す', () => {
    const equation = {
      sales: 2000,
      deductions: [
        { label: '送料', amount: 200 },
        { label: '販売手数料', amount: 200 },
      ],
      profit: 1600,
    };
    expect(requiredPriceEquationText(equation, profitLabel('sourced'))).toContain(
      '− 販売手数料 200 = 利益 1600 円',
    );
  });
});

describe('§1.3 データタブの指標セグメント', () => {
  it('売上金額はそのまま / netProfit は集計なので「収支」', () => {
    expect(metricLabel('sales')).toBe('売上金額');
    expect(metricLabel('netProfit')).toBe(TOTAL_PROFIT_LABEL);
  });
});
