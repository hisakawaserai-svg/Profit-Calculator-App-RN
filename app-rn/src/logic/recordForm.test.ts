// SPEC.md §3.2（RecordFormView）・§5.2（保存バリデーション）・§7-7 / §7-8 / §7-11 の検証テスト。
// 期待値は SPEC の記述から導出している（実装からの逆算ではない）。

import { describe, expect, it } from 'vitest';

import type { SaleRecord } from '@/db/schema';

import {
  DEFAULT_COMMISSION,
  amountToInput,
  canSave,
  changeKind,
  newFormValues,
  recordToFormValues,
  toSaveInput,
} from './recordForm';

const NOW = new Date(2026, 7, 9, 15, 30, 0);

const record = (partial: Partial<SaleRecord> = {}): SaleRecord => ({
  id: 'id-1',
  itemName: 'えんぴつ',
  kind: 'used',
  salesPrice: 0,
  purchasePrice: 0,
  postage: 0,
  envelopeCost: 0,
  othersCost: 0,
  commission: 10,
  isSold: false,
  saleStartDate: '2026-07-01T09:00:00.000',
  saleDate: null,
  memo: '',
  ...partial,
});

describe('§3.2 / §7-8 / §7-11 新規追加時の初期値', () => {
  it('手数料は 10%、出品中（isSold = false）、出品日は当日', () => {
    const values = newFormValues('used', undefined, NOW);

    expect(values.commission).toBe(DEFAULT_COMMISSION);
    expect(values.isSold).toBe(false); // 決定 §7-8
    expect(values.saleStartDate).toEqual(NOW); // 決定 §7-11: 必須項目・初期値は当日
    expect(values.itemName).toBe('');
    expect(values.salesPrice).toBe('');
  });

  it('計算タブから渡された入力値を初期値として引き継ぐ（§3.2 prepareNewRecord 相当）', () => {
    const values = newFormValues(
      'used',
      {
        kind: 'sourced',
        salesPrice: '1000',
        purchasePrice: '300',
        postage: '175',
        envelopeCost: '20',
        othersCost: '5',
        commission: 8,
      },
      NOW,
    );

    expect(values.salesPrice).toBe('1000');
    expect(values.commission).toBe(8);
    // 引き継ぐのは金額・手数料・種別だけ。商品名は空・出品中のまま
    expect(values.itemName).toBe('');
    expect(values.isSold).toBe(false);
  });
});

describe('SPEC-V2 §1.4 種別の初期値', () => {
  it('一覧・月別詳細の＋（引き継ぎなし）は設定の既定種別になる', () => {
    expect(newFormValues('used', undefined, NOW).kind).toBe('used');
    expect(newFormValues('sourced', undefined, NOW).kind).toBe('sourced');
  });

  it('計算タブの＋は、設定値ではなく計算タブで選択中の種別を引き継ぐ', () => {
    const amounts = {
      kind: 'sourced',
      salesPrice: '1000',
      purchasePrice: '300',
      postage: '',
      envelopeCost: '',
      othersCost: '',
      commission: 10,
    } as const;

    // 設定は不用品でも、画面の見た目に合わせて仕入品で開く
    expect(newFormValues('used', amounts, NOW).kind).toBe('sourced');
    expect(newFormValues('used', amounts, NOW).purchasePrice).toBe('300');
  });

  it('既存レコードの編集はそのレコードの kind', () => {
    expect(recordToFormValues(record({ kind: 'sourced' }), NOW).kind).toBe('sourced');
    expect(recordToFormValues(record({ kind: 'used' }), NOW).kind).toBe('used');
  });
});

describe('SPEC-V2 §1.5 フォーム上で種別を切り替えたときの挙動', () => {
  const sourcedValues = {
    ...newFormValues('sourced', undefined, NOW),
    itemName: 'えんぴつ',
    purchasePrice: '300',
    postage: '175',
  };

  it('仕入品 → 不用品 で仕入価格をその場でクリアする（保存時に黙って 0 にはしない）', () => {
    const next = changeKind(sourcedValues, 'used');

    expect(next.kind).toBe('used');
    expect(next.purchasePrice).toBe('');
    expect(toSaveInput(next).purchasePrice).toBe(0);
  });

  it('仕入価格以外の値は変えない', () => {
    const next = changeKind(sourcedValues, 'used');

    expect(next.itemName).toBe('えんぴつ');
    expect(next.postage).toBe('175');
    expect(next.commission).toBe(sourcedValues.commission);
  });

  it('不用品 → 仕入品 では仕入価格が空欄で現れる', () => {
    const next = changeKind(changeKind(sourcedValues, 'used'), 'sourced');

    expect(next.kind).toBe('sourced');
    expect(next.purchasePrice).toBe('');
  });

  it('同じ種別を選び直しても値は変わらない', () => {
    expect(changeKind(sourcedValues, 'sourced')).toBe(sourcedValues);
  });
});

describe('§5.2 保存バリデーション（必須は商品名のみ）', () => {
  it('商品名が空なら保存できない', () => {
    expect(canSave(newFormValues('used', undefined, NOW))).toBe(false);
  });

  it('商品名があれば、金額が空でもメモが空でも保存できる', () => {
    const values = { ...newFormValues('used', undefined, NOW), itemName: 'えんぴつ' };

    expect(canSave(values)).toBe(true);
    expect(toSaveInput(values).salesPrice).toBe(0);
    expect(toSaveInput(values).memo).toBe('');
  });
});

describe('§5.1 金額の数値化', () => {
  it('空文字・"." のみは 0 として保存される', () => {
    const values = {
      ...newFormValues('used', undefined, NOW),
      itemName: 'えんぴつ',
      salesPrice: '',
      postage: '.',
    };
    const input = toSaveInput(values);

    expect(input.salesPrice).toBe(0);
    expect(input.postage).toBe(0);
  });

  it('小数はそのまま Double として保存される（§2.6 保存値は丸めない）', () => {
    const values = { ...newFormValues('used', undefined, NOW), itemName: 'えんぴつ', salesPrice: '999.5' };

    expect(toSaveInput(values).salesPrice).toBe(999.5);
  });
});

describe('SPEC-V2 §1.1 保存入力への種別の受け渡し', () => {
  it('フォームで選んだ種別をそのまま渡す（入力値からは導出しない）', () => {
    const base = { ...newFormValues('used', undefined, NOW), itemName: 'えんぴつ' };

    expect(toSaveInput({ ...base, kind: 'used' }).kind).toBe('used');
    expect(toSaveInput({ ...base, kind: 'sourced', purchasePrice: '300' }).kind).toBe('sourced');
  });

  it('仕入品の仕入価格はそのまま保存値になる', () => {
    const values = {
      ...newFormValues('sourced', undefined, NOW),
      itemName: 'えんぴつ',
      purchasePrice: '300',
    };

    expect(toSaveInput(values).purchasePrice).toBe(300);
  });
});

describe('§5.2 saleDate の正規化は repository に任せる', () => {
  it('出品中でもフォームの saleDate はそのまま渡す（null 化は repository 側）', () => {
    const values = { ...newFormValues('used', undefined, NOW), itemName: 'えんぴつ', isSold: false };

    expect(toSaveInput(values).saleDate).toEqual(NOW);
    expect(toSaveInput(values).isSold).toBe(false);
  });
});

describe('編集時の初期値（Swift 版 loadInitialData 相当）', () => {
  it('0 円の欄は空欄にする', () => {
    expect(amountToInput(0)).toBe('');
    expect(amountToInput(1200)).toBe('1200');
  });

  it('小数を含む保存値は丸めずに入力欄へ戻す（開いて保存し直しても値が変わらない）', () => {
    expect(amountToInput(99.9)).toBe('99.9');
  });

  it('レコードの値をフォームへ展開する', () => {
    const values = recordToFormValues(
      record({ salesPrice: 1000, isSold: true, saleDate: '2026-07-20T10:00:00.000', memo: 'メモ' }),
      NOW,
    );

    expect(values.itemName).toBe('えんぴつ');
    expect(values.salesPrice).toBe('1000');
    expect(values.isSold).toBe(true);
    expect(values.saleDate).toEqual(new Date(2026, 6, 20, 10, 0, 0));
    expect(values.saleStartDate).toEqual(new Date(2026, 6, 1, 9, 0, 0));
    expect(values.memo).toBe('メモ');
  });

  it('出品中（saleDate = null）のレコードは販売日の初期表示を当日にする', () => {
    const values = recordToFormValues(record({ isSold: false, saleDate: null }), NOW);

    expect(values.isSold).toBe(false);
    expect(values.saleDate).toEqual(NOW);
  });
});
