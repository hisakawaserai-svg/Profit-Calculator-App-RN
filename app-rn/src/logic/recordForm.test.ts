// SPEC.md §3.2（RecordFormView）・§5.2（保存バリデーション）・§7-7 / §7-8 / §7-11 の検証テスト。
// 期待値は SPEC の記述から導出している（実装からの逆算ではない）。

import { describe, expect, it } from 'vitest';

import type { SaleRecord } from '@/db/schema';
import { netProfit } from '@/logic/profit';

import {
  DEFAULT_COMMISSION,
  amountToInput,
  canSave,
  changeKind,
  newFormValues,
  recordToFormValues,
  toCostInput,
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
  // 販売サイト名（SPEC-V3 §1.5.1）。既存レコードはバックフィルしないので空文字が既定
  siteName: '',
  // 商品写真（SPEC-V5 §1.3）。CSV には出さないので、csv.ts の期待値は変わらない
  photoFileName: null,
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
        siteName: 'メルカリ',
      },
      NOW,
    );

    expect(values.salesPrice).toBe('1000');
    expect(values.commission).toBe(8);
    // 率と一緒に選んだ販売サイトの名前も引き継ぐ（SPEC-V3 §1.5.1）
    expect(values.siteName).toBe('メルカリ');
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
      siteName: '',
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

describe('SPEC-V3 §1.5.1 販売サイト名の写し', () => {
  const base = () => ({ ...newFormValues('used', undefined, NOW), itemName: 'えんぴつ' });

  it('引き継ぎなしの新規は空文字（未設定）', () => {
    expect(base().siteName).toBe('');
    expect(toSaveInput(base()).siteName).toBe('');
  });

  it('選んだ名前をそのまま保存する', () => {
    expect(toSaveInput({ ...base(), siteName: 'メルカリ', commission: 10 }).siteName).toBe(
      'メルカリ',
    );
  });

  it('手で率を変えても名前は消えない（率の微調整で札は無効にならない）', () => {
    const values = { ...base(), siteName: 'メルカリ', commission: 8 };

    expect(toSaveInput(values).commission).toBe(8);
    expect(toSaveInput(values).siteName).toBe('メルカリ');
  });

  it('種別を切り替えても名前は消えない（金額の欄ではないため）', () => {
    const values = { ...base(), kind: 'sourced' as const, siteName: 'メルカリ' };

    expect(changeKind(values, 'used').siteName).toBe('メルカリ');
  });
});

describe('SPEC-V4 §3.1 タグ', () => {
  const base = () => ({ ...newFormValues('used', undefined, NOW), itemName: 'えんぴつ' });

  it('新規は 0 件から始まる（計算タブから引き継ぐものが無い。決定 §9-4）', () => {
    expect(base().tagIds).toEqual([]);
  });

  it('タグを付けなくても保存できる（§0：必須にしない）', () => {
    expect(canSave(base())).toBe(true);
    expect(toSaveInput(base()).tagIds).toEqual([]);
  });

  it('選んだタグをそのまま保存入力へ渡す', () => {
    expect(toSaveInput({ ...base(), tagIds: ['tag-1', 'tag-2'] }).tagIds).toEqual([
      'tag-1',
      'tag-2',
    ]);
  });

  it('編集は付いているタグを初期値にする（並びは呼び出し側が sortOrder 昇順で渡す）', () => {
    expect(recordToFormValues(record(), NOW, ['tag-2', 'tag-1']).tagIds).toEqual([
      'tag-2',
      'tag-1',
    ]);
  });

  it('タグを渡さなければ 0 件（既存レコードはバックフィルしない）', () => {
    expect(recordToFormValues(record(), NOW).tagIds).toEqual([]);
  });

  it('全部外した状態も保存できる（中間テーブルは全消し → 入れ直し。§1.4）', () => {
    const values = { ...base(), tagIds: ['tag-1'] };

    expect(toSaveInput({ ...values, tagIds: [] }).tagIds).toEqual([]);
  });

  it('種別を切り替えてもタグは消えない（金額の欄ではないため）', () => {
    const values = { ...base(), kind: 'sourced' as const, tagIds: ['tag-1'] };

    expect(changeKind(values, 'used').tagIds).toEqual(['tag-1']);
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

  it('保存済みの販売サイト名をフォームへ戻す（SPEC-V3 §1.5.1）', () => {
    expect(recordToFormValues(record({ siteName: 'メルカリ' }), NOW).siteName).toBe('メルカリ');
    // 既存レコードはバックフィルしないので空文字のまま
    expect(recordToFormValues(record(), NOW).siteName).toBe('');
  });

  it('出品中（saleDate = null）のレコードは販売日の初期表示を当日にする', () => {
    const values = recordToFormValues(record({ isSold: false, saleDate: null }), NOW);

    expect(values.isSold).toBe(false);
    expect(values.saleDate).toEqual(NOW);
  });
});

describe('UI-SPEC §1.3 伝票カードが使う金額（toCostInput）', () => {
  const values = () => ({
    ...newFormValues('sourced', undefined, NOW),
    salesPrice: '1800',
    purchasePrice: '300',
    postage: '95',
    envelopeCost: '50',
    othersCost: '30',
    commission: 10,
  });

  it('入力中の文字列を数値に直すだけで丸めない（SPEC §2.6）', () => {
    expect(toCostInput({ ...values(), salesPrice: '99.9' }).salesPrice).toBe(99.9);
  });

  it('空欄は 0 として扱う（SPEC §5.1）', () => {
    expect(toCostInput({ ...values(), postage: '' }).postage).toBe(0);
  });

  it('不用品は行を出していない仕入価格を結果に効かせない（SPEC-V2 §1.3）', () => {
    const used = { ...values(), kind: 'used' as const, purchasePrice: '300' };

    expect(toCostInput(used).purchasePrice).toBe(0);
    expect(toCostInput(values()).purchasePrice).toBe(300);
  });

  it('結果行は profit.ts の netProfit と一致する（画面で式を再実装しない）', () => {
    expect(netProfit(toCostInput(values()))).toBe(1800 - (300 + 95 + 50 + 30 + 180));
  });
});
