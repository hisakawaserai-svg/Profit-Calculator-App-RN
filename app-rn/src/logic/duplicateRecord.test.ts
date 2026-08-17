// 「過去の記録から複製」でフォームに入る初期値（logic/duplicateRecord.ts）。
//
// **写す／写さないの境目だけを試す。** 金額の文字列化（0 は空欄）や目標の null と 0 の
// 区別は `recordToFormValues` の規則で、そちらの試験（recordForm.test.ts）が持っている ──
// ここで同じことをもう一度確かめると、規則を変えたときに直す場所が 2 つになる。
import { describe, expect, it } from 'vitest';

import { toDbDate } from '@/db/dates';
import type { SaleRecord } from '@/db/schema';

import { duplicateFormValues } from './duplicateRecord';

const NOW = new Date(2026, 7, 17, 10, 0, 0);

/** 複製元。**全部の欄が埋まっている**ので、写らない欄は「空になった」ことで判別できる */
const source: SaleRecord = {
  id: 'source-1',
  itemName: 'ワンピース Lサイズ',
  kind: 'sourced',
  salesPrice: 4800,
  purchasePrice: 1300,
  postage: 400,
  envelopeCost: 100,
  othersCost: 60,
  commission: 10,
  isSold: true,
  // 保存値は文字列（schema.ts の日付列の決定）。フォームへの復元は recordToFormValues が行う
  saleStartDate: toDbDate(new Date(2026, 1, 3, 9, 0, 0)),
  saleDate: toDbDate(new Date(2026, 2, 1, 9, 0, 0)),
  memo: '第 2 ボタンに小傷',
  siteName: 'フリマA',
  photoFileName: 'abc.jpg',
  shippingMaterialCost: 100,
  excludesShippingMaterial: false,
  targetProfit: 900,
  // SPEC-V9 §1.1 で列だけ確保した将来用の出品日。読み書きしないので複製にも関わらない
  listedAt: null,
};

describe('写す欄', () => {
  it('商品名はそのまま入る（書き換える前提でも、打ち直しより速い）', () => {
    expect(duplicateFormValues(source, [], NOW).itemName).toBe('ワンピース Lサイズ');
  });

  it('種別と仕入価格が入る', () => {
    const values = duplicateFormValues(source, [], NOW);

    expect(values.kind).toBe('sourced');
    expect(values.purchasePrice).toBe('1300');
  });

  it('経費（送料・梱包材・その他）と手数料率が入る', () => {
    const values = duplicateFormValues(source, [], NOW);

    expect(values.postage).toBe('400');
    expect(values.envelopeCost).toBe('100');
    expect(values.othersCost).toBe('60');
    expect(values.commission).toBe(10);
  });

  it('専用資材費の控えも入る（送料の 2 択を複製先でも押し戻せる）', () => {
    const values = duplicateFormValues(source, [], NOW);

    expect(values.shippingMaterialCost).toBe(100);
    expect(values.excludesShippingMaterial).toBe(false);
  });

  it('「専用資材を使わない」を選んでいた記録は、その状態ごと入る', () => {
    const values = duplicateFormValues(
      { ...source, excludesShippingMaterial: true },
      [],
      NOW,
    );

    expect(values.excludesShippingMaterial).toBe(true);
  });

  // 手数料率と同時にしか入らない値（SPEC-V3 §4.3）。率だけ写すと札の消えた記録ができる
  it('販売サイト名も入る（手数料率と対になっているため）', () => {
    expect(duplicateFormValues(source, [], NOW).siteName).toBe('フリマA');
  });

  it('タグが入る', () => {
    expect(duplicateFormValues(source, ['tag-a', 'tag-b'], NOW).tagIds).toEqual([
      'tag-a',
      'tag-b',
    ]);
  });

  it('タグの配列は複製元と共有しない（フォームで足しても元の配列を書き換えない）', () => {
    const tagIds = ['tag-a'];
    const values = duplicateFormValues(source, tagIds, NOW);
    values.tagIds.push('tag-b');

    expect(tagIds).toEqual(['tag-a']);
  });

  it('目標利益が入る', () => {
    expect(duplicateFormValues(source, [], NOW).targetProfit).toBe('900');
  });

  // SPEC-V9 §1.2: 0 は「赤字にならなければよい」という目標そのもので、未設定とは別のもの
  it('目標 0 円は 0 のまま写る（「決めていない」に化けない）', () => {
    expect(duplicateFormValues({ ...source, targetProfit: 0 }, [], NOW).targetProfit).toBe('0');
  });

  it('目標を決めていない記録からは、決めていないまま始まる', () => {
    expect(duplicateFormValues({ ...source, targetProfit: null }, [], NOW).targetProfit).toBe('');
  });
});

describe('写さない欄', () => {
  it('販売価格は空で始まる', () => {
    expect(duplicateFormValues(source, [], NOW).salesPrice).toBe('');
  });

  it('写真は付かない', () => {
    expect(duplicateFormValues(source, [], NOW).photoFileName).toBeNull();
  });

  it('メモは空で始まる', () => {
    expect(duplicateFormValues(source, [], NOW).memo).toBe('');
  });

  // 写すと、今日出す物に半年前の日付が入る。しかも販売日は出品日より前にできない
  it('出品日・販売日は複製元の日付ではなく「今日」から始まる', () => {
    const values = duplicateFormValues(source, [], NOW);

    expect(values.saleStartDate).toEqual(NOW);
    expect(values.saleDate).toEqual(NOW);
  });
});

describe('複製元は売却済み・出品中のどちらでもよい', () => {
  it('売却済みの記録からでも、作られるのは出品中の記録', () => {
    expect(duplicateFormValues(source, [], NOW).isSold).toBe(false);
  });

  it('出品中の記録からも複製できる（販売日が無くても日付が壊れない）', () => {
    const listing: SaleRecord = {
      ...source,
      isSold: false,
      saleDate: null,
      salesPrice: 0,
      photoFileName: null,
      memo: '',
    };
    const values = duplicateFormValues(listing, ['tag-a'], NOW);

    expect(values.isSold).toBe(false);
    expect(values.saleDate).toEqual(NOW);
    // 写す欄は売却済みのときと同じように入る
    expect(values.postage).toBe('400');
    expect(values.commission).toBe(10);
    expect(values.tagIds).toEqual(['tag-a']);
    expect(values.targetProfit).toBe('900');
  });

  it('売却済みと出品中で、写る欄の中身は変わらない', () => {
    const fromSold = duplicateFormValues(source, ['tag-a'], NOW);
    const fromListing = duplicateFormValues(
      { ...source, isSold: false, saleDate: null },
      ['tag-a'],
      NOW,
    );

    expect(fromListing).toEqual(fromSold);
  });
});

describe('複製そのものは何も書き換えない', () => {
  it('複製元のオブジェクトに触らない', () => {
    const before = { ...source };
    duplicateFormValues(source, ['tag-a'], NOW);

    expect(source).toEqual(before);
  });
});
