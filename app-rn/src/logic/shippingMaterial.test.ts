import { describe, expect, it } from 'vitest';

import {
  hasShippingMaterial,
  presetRowAmount,
  selectShippingPreset,
  shippingAmountFor,
  shippingMaterialChoiceOf,
  shippingPresetTotal,
} from './shippingMaterial';

const withMaterial = { value: 450, materialCost: 70 };
const withoutMaterial = { value: 210, materialCost: 0 };

describe('shippingPresetTotal', () => {
  it('送料と資材費を足す', () => {
    expect(shippingPresetTotal(withMaterial)).toBe(520);
  });

  it('資材費が 0 なら送料そのまま', () => {
    expect(shippingPresetTotal(withoutMaterial)).toBe(210);
  });

  it('小数の資材費（まとめ買いの単価）でも足せる', () => {
    expect(shippingPresetTotal({ value: 450, materialCost: 15.5 })).toBe(465.5);
  });
});

describe('hasShippingMaterial', () => {
  it('資材費があるときだけ true（＝この行にだけ 2 択を出す。45b）', () => {
    expect(hasShippingMaterial(withMaterial)).toBe(true);
    expect(hasShippingMaterial(withoutMaterial)).toBe(false);
  });
});

describe('shippingAmountFor', () => {
  it('選んだ側の額を返す', () => {
    expect(shippingAmountFor(withMaterial, 'with-material')).toBe(520);
    expect(shippingAmountFor(withMaterial, 'shipping-only')).toBe(450);
  });

  it('資材費が 0 ならどちらでも同じ', () => {
    expect(shippingAmountFor(withoutMaterial, 'with-material')).toBe(210);
    expect(shippingAmountFor(withoutMaterial, 'shipping-only')).toBe(210);
  });
});

describe('shippingMaterialChoiceOf', () => {
  it('合計なら「＋資材」、送料そのものなら「送料のみ」', () => {
    expect(shippingMaterialChoiceOf(withMaterial, 520)).toBe('with-material');
    expect(shippingMaterialChoiceOf(withMaterial, 450)).toBe('shipping-only');
  });

  it('どちらとも違う額・空欄なら null（この行は選ばれていない）', () => {
    expect(shippingMaterialChoiceOf(withMaterial, 500)).toBeNull();
    expect(shippingMaterialChoiceOf(withMaterial, null)).toBeNull();
  });

  it('資材費 0 円では合計と送料が同じなので「＋資材」を返す（2 択は出ない行）', () => {
    expect(shippingMaterialChoiceOf(withoutMaterial, 210)).toBe('with-material');
  });

  it('保存済みの記録の送料からそのまま復元できる（45b の復元）', () => {
    const saved = selectShippingPreset(withMaterial, 'shipping-only');
    expect(shippingMaterialChoiceOf(withMaterial, Number(saved.postage))).toBe('shipping-only');
  });
});

describe('selectShippingPreset', () => {
  it('既定（行そのものを押したとき）は「＋資材」で合計が入り、控えを残す', () => {
    expect(selectShippingPreset(withMaterial)).toEqual({
      postage: '520',
      shippingMaterialCost: 70,
      excludesShippingMaterial: false,
    });
  });

  it('資材費のないプリセットでは控えが 0（＝トグルを出さない）', () => {
    expect(selectShippingPreset(withoutMaterial)).toEqual({
      postage: '210',
      shippingMaterialCost: 0,
      excludesShippingMaterial: false,
    });
  });

  it('選び直すと前のプリセットの控えが残らない', () => {
    const first = selectShippingPreset(withMaterial);
    const second = selectShippingPreset(withoutMaterial);
    expect(first.shippingMaterialCost).toBe(70);
    expect(second.shippingMaterialCost).toBe(0);
  });

  it('送料も資材費も 0 のプリセットは空欄になる（amountToInput と同じ規則）', () => {
    expect(selectShippingPreset({ value: 0, materialCost: 0 }).postage).toBe('');
  });
});

describe('selectShippingPreset（45b の 2 択）', () => {
  it('「送料のみ」を選ぶと送料だけが入り、除外の印が付く', () => {
    expect(selectShippingPreset(withMaterial, 'shipping-only')).toEqual({
      postage: '450',
      shippingMaterialCost: 70,
      excludesShippingMaterial: true,
    });
  });

  it('「送料のみ」でも控えは残る（記録に「そのとき資材がいくらだったか」を残す）', () => {
    expect(selectShippingPreset(withMaterial, 'shipping-only').shippingMaterialCost).toBe(70);
  });

  it('選び直すと側も控えも入れ替わる', () => {
    const first = selectShippingPreset(withMaterial, 'shipping-only');
    const second = selectShippingPreset(withoutMaterial, 'with-material');
    expect(first.excludesShippingMaterial).toBe(true);
    expect(second).toEqual({
      postage: '210',
      shippingMaterialCost: 0,
      excludesShippingMaterial: false,
    });
  });

  it('小数の資材費でも選んだ側の額がそのまま入る', () => {
    const fractional = { value: 450, materialCost: 15.5 };
    expect(selectShippingPreset(fractional, 'with-material').postage).toBe('465.5');
    expect(selectShippingPreset(fractional, 'shipping-only').postage).toBe('450');
  });
});

// SPEC-V6 §1: 一覧の行・設定タブのカードに出す額。
// PresetRow と PresetSummaryCard が同じ 1 本から取ることを、ここで固定する。
describe('presetRowAmount: 一覧に出す額', () => {
  it('資材費のある送料プリセットは合計で出す', () => {
    expect(presetRowAmount({ type: 'shipping', value: 450, materialCost: 100 })).toBe(550);
  });

  it('資材費 0 円の送料はそのまま', () => {
    expect(presetRowAmount({ type: 'shipping', value: 210, materialCost: 0 })).toBe(210);
    expect(presetRowAmount({ type: 'shipping', value: 210 })).toBe(210);
  });

  it('梱包材・販売サイトは materialCost を持たないのでそのまま', () => {
    expect(presetRowAmount({ type: 'packaging', value: 15 })).toBe(15);
    expect(presetRowAmount({ type: 'site', value: 10 })).toBe(10);
  });

  it('種類が送料でなければ materialCost があっても足さない（不整合な行への防御）', () => {
    expect(presetRowAmount({ type: 'packaging', value: 15, materialCost: 100 })).toBe(15);
  });
});
