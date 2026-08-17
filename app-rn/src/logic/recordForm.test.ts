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
  parseTargetProfitInput,
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
  shippingMaterialCost: 0,
  excludesShippingMaterial: false,
  // 目標利益（SPEC-V9 §1）。既定は「決めていない」= null。listed_at はまだ読み書きしない
  targetProfit: null,
  listedAt: null,
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
        siteName: 'フリマA',
        targetProfit: '',
      },
      NOW,
    );

    expect(values.salesPrice).toBe('1000');
    expect(values.commission).toBe(8);
    // 率と一緒に選んだ販売サイトの名前も引き継ぐ（SPEC-V3 §1.5.1）
    expect(values.siteName).toBe('フリマA');
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
      targetProfit: '',
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
    expect(toSaveInput({ ...base(), siteName: 'フリマA', commission: 10 }).siteName).toBe(
      'フリマA',
    );
  });

  it('手で率を変えても名前は消えない（率の微調整で札は無効にならない）', () => {
    const values = { ...base(), siteName: 'フリマA', commission: 8 };

    expect(toSaveInput(values).commission).toBe(8);
    expect(toSaveInput(values).siteName).toBe('フリマA');
  });

  it('種別を切り替えても名前は消えない（金額の欄ではないため）', () => {
    const values = { ...base(), kind: 'sourced' as const, siteName: 'フリマA' };

    expect(changeKind(values, 'used').siteName).toBe('フリマA');
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
    expect(recordToFormValues(record({ siteName: 'フリマA' }), NOW).siteName).toBe('フリマA');
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

describe('SPEC-V6 §3 送料の専用資材', () => {
  it('新規は控え 0・トグル off から始まる（計算タブから引き継ぐのは金額だけ）', () => {
    const values = newFormValues('used', undefined, NOW);

    expect(values.shippingMaterialCost).toBe(0);
    expect(values.excludesShippingMaterial).toBe(false);
  });

  it('編集で開くと控えとトグルの向きが戻る（§3 の「編集で復元」）', () => {
    const values = recordToFormValues(
      record({ postage: 450, shippingMaterialCost: 70, excludesShippingMaterial: true }),
      NOW,
    );

    expect(values.postage).toBe('450');
    expect(values.shippingMaterialCost).toBe(70);
    expect(values.excludesShippingMaterial).toBe(true);
  });

  it('保存入力にそのまま乗る（postage は総額のまま・控えは別）', () => {
    const values = {
      ...newFormValues('used', undefined, NOW),
      postage: '520',
      shippingMaterialCost: 70,
      excludesShippingMaterial: false,
    };

    expect(toSaveInput(values)).toMatchObject({
      postage: 520,
      shippingMaterialCost: 70,
      excludesShippingMaterial: false,
    });
  });

  it('控えは計算に入らない（伝票の金額は postage だけで決まる）', () => {
    const values = {
      ...newFormValues('used', undefined, NOW),
      salesPrice: '1000',
      postage: '520',
      shippingMaterialCost: 70,
      excludesShippingMaterial: false,
      commission: 0,
    };

    // 1000 − 520 = 480。資材費 70 を二重に引かない
    expect(netProfit(toCostInput(values))).toBeCloseTo(480);
  });
});

describe('SPEC-V9 §5.3 計算タブの目標をフォームの初期値として引き継ぐ', () => {
  const amounts = (targetProfit: string) =>
    ({
      kind: 'sourced',
      salesPrice: '1000',
      purchasePrice: '300',
      postage: '',
      envelopeCost: '',
      othersCost: '',
      commission: 10,
      siteName: '',
      targetProfit,
    }) as const;

  it('逆算で入れた目標額が目標欄の初期値になる', () => {
    expect(newFormValues('used', amounts('500'), NOW).targetProfit).toBe('500');
  });

  it('目標 0 円も引き継ぐ（「決めていない」に落とさない。§1.2）', () => {
    const values = newFormValues('used', amounts('0'), NOW);

    expect(values.targetProfit).toBe('0');
    expect(toSaveInput({ ...values, itemName: 'えんぴつ' }).targetProfit).toBe(0);
  });

  it('目標を入力していなければ null のまま（「利益を出す」モードから来た場合を含む）', () => {
    const values = newFormValues('used', amounts(''), NOW);

    expect(values.targetProfit).toBe('');
    expect(toSaveInput({ ...values, itemName: 'えんぴつ' }).targetProfit).toBeNull();
  });

  it('**渡るのは初期値だけ**で、フォーム側で書き換えたらその値が保存される', () => {
    const values = newFormValues('used', amounts('500'), NOW);
    // 欄に見える状態で渡すので、開いた人が書き換えられる（黙って保存されない）
    const edited = { ...values, itemName: 'えんぴつ', targetProfit: '800' };

    expect(toSaveInput(edited).targetProfit).toBe(800);
  });

  it('フォーム側で消せば「決めていない」に戻せる', () => {
    const values = newFormValues('used', amounts('500'), NOW);
    const cleared = { ...values, itemName: 'えんぴつ', targetProfit: '' };

    expect(toSaveInput(cleared).targetProfit).toBeNull();
  });
});

describe('SPEC-V9 §2 目標利益（空欄 = 決めていない）', () => {
  it('新規は空欄から始まる（アプリ全体の既定値を持たないため設定から引く元も無い）', () => {
    expect(newFormValues('used', undefined, NOW).targetProfit).toBe('');
    expect(newFormValues('sourced', undefined, NOW).targetProfit).toBe('');
  });

  it('**空欄は 0 ではなく null として保存される**（他の金額欄と扱いが違う唯一の欄）', () => {
    const values = { ...newFormValues('used', undefined, NOW), targetProfit: '' };

    expect(toSaveInput(values).targetProfit).toBeNull();
    // 同じ空欄でも、他の金額欄は 0 のまま（§5.1）
    expect(toSaveInput(values).othersCost).toBe(0);
  });

  it('打ちかけの "." も null（0 として保存すると「目標 0 円」に化ける）', () => {
    expect(parseTargetProfitInput('.')).toBeNull();
    expect(parseTargetProfitInput(' ')).toBeNull();
  });

  it('**"0" は 0 として保存される** ── 決めていない状態と混ぜない', () => {
    expect(parseTargetProfitInput('0')).toBe(0);
    expect(toSaveInput({ ...newFormValues('used', undefined, NOW), targetProfit: '0' }).targetProfit)
      .toBe(0);
  });

  it('整数に丸める（列が integer。端数を持つ意味がない）', () => {
    expect(parseTargetProfitInput('1500.4')).toBe(1500);
    expect(parseTargetProfitInput('1500.6')).toBe(1501);
  });

  it('編集で開くと保存値が戻る（null は空欄）', () => {
    expect(recordToFormValues(record({ targetProfit: 2000 }), NOW).targetProfit).toBe('2000');
    expect(recordToFormValues(record({ targetProfit: null }), NOW).targetProfit).toBe('');
  });

  it('**目標 0 円の記録を開き直しても消えない**（amountToInput は 0 を空欄にするので使えない）', () => {
    const values = recordToFormValues(record({ targetProfit: 0 }), NOW);

    expect(values.targetProfit).toBe('0');
    // 開いてそのまま保存し直しても 0 のまま（null に落ちない）
    expect(toSaveInput(values).targetProfit).toBe(0);
    // 参考: 他の金額欄は 0 を空欄に落とす
    expect(amountToInput(0)).toBe('');
  });

  it('保存 → 読み戻しの往復で値が変わらない（null / 0 / 正の額）', () => {
    for (const targetProfit of [null, 0, 2000]) {
      const values = recordToFormValues(record({ targetProfit }), NOW);
      expect(toSaveInput(values).targetProfit).toBe(targetProfit);
    }
  });

  it('目標は計算式に入らない（伝票の純利益は今までどおり）', () => {
    const values = {
      ...newFormValues('used', undefined, NOW),
      salesPrice: '1000',
      postage: '200',
      commission: 0,
      targetProfit: '5000',
    };

    expect(netProfit(toCostInput(values))).toBeCloseTo(800);
  });

  it('目標が空でも保存できる（必須は商品名だけ。§5.2）', () => {
    const values = { ...newFormValues('used', undefined, NOW), itemName: 'えんぴつ', targetProfit: '' };

    expect(canSave(values)).toBe(true);
  });
});
