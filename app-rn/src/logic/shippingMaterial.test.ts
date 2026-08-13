import { describe, expect, it } from 'vitest';

import {
  hasShippingMaterial,
  selectShippingPreset,
  setExcludesShippingMaterial,
  shippingPresetTotal,
  showsShippingMaterialToggle,
  type ShippingMaterialState,
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

describe('hasShippingMaterial / showsShippingMaterialToggle', () => {
  it('資材費があるときだけ true', () => {
    expect(hasShippingMaterial(withMaterial)).toBe(true);
    expect(hasShippingMaterial(withoutMaterial)).toBe(false);
  });

  it('記録側は控えの有無で決まる', () => {
    expect(showsShippingMaterialToggle({ shippingMaterialCost: 70 })).toBe(true);
    // 資材費のないプリセット・手入力の記録はどちらも 0
    expect(showsShippingMaterialToggle({ shippingMaterialCost: 0 })).toBe(false);
  });
});

describe('selectShippingPreset', () => {
  it('既定で合計が入り、控えを残す', () => {
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

describe('setExcludesShippingMaterial', () => {
  const selected: ShippingMaterialState = selectShippingPreset(withMaterial);

  it('オンにすると資材費ぶん引く', () => {
    expect(setExcludesShippingMaterial(selected, true)).toEqual({
      postage: '450',
      shippingMaterialCost: 70,
      excludesShippingMaterial: true,
    });
  });

  it('オフに戻すと足し直す', () => {
    const excluded = setExcludesShippingMaterial(selected, true);
    expect(setExcludesShippingMaterial(excluded, false)).toEqual(selected);
  });

  it('同じ向きに 2 度押しても二重に引かない', () => {
    const once = setExcludesShippingMaterial(selected, true);
    expect(setExcludesShippingMaterial(once, true)).toBe(once);
  });

  it('控えが 0 なら金額は動かない', () => {
    const noMaterial = selectShippingPreset(withoutMaterial);
    expect(setExcludesShippingMaterial(noMaterial, true).postage).toBe('210');
  });

  it('送料を手で小さく直したあとにオンにしても負にならない', () => {
    const edited: ShippingMaterialState = { ...selected, postage: '50' };
    expect(setExcludesShippingMaterial(edited, true).postage).toBe('');
  });

  it('送料を手で直しても、控えぶんの増減は保たれる', () => {
    const edited: ShippingMaterialState = { ...selected, postage: '600' };
    const excluded = setExcludesShippingMaterial(edited, true);
    expect(excluded.postage).toBe('530');
    expect(setExcludesShippingMaterial(excluded, false).postage).toBe('600');
  });

  it('小数の資材費でも往復して元に戻る', () => {
    const fractional = selectShippingPreset({ value: 450, materialCost: 15.5 });
    const excluded = setExcludesShippingMaterial(fractional, true);
    expect(excluded.postage).toBe('450');
    expect(setExcludesShippingMaterial(excluded, false).postage).toBe('465.5');
  });
});
