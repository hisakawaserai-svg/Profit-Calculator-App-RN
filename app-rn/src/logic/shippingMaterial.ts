// 送料プリセットの「専用資材の代金」（SPEC-V6）。
//
// 一部の配送方法は専用の箱・封筒を買わないと使えず、その代金が送料とは別にかかる。
// プリセットは送料（value）と資材費（materialCost）を**別々に持ち**、記録に入れるときに
// 足す ── 合算した 1 つの値で持つと、「今回は資材を使わない」をあとから引き算できない。
//
// ## 記録の側が持つもの
//
// 記録は**プリセットを id で参照しない**（SPEC-V3 §1.5。値をコピーする）ので、
// 選んだ当時の資材費はプリセットを見に行っても分からない（あとから直っているかもしれない）。
// そのため記録が 2 つを持つ:
//
//   - `postage`               … 支払う送料の総額。**資材費を含む**（含めない設定のときは含まない）
//   - `shippingMaterialCost`  … 選んだときの資材費の控え。**金額の計算には入らない**
//   - `excludesShippingMaterial` … 「専用資材を使わない」を押した状態
//
// **postage が唯一の金額**なので、profit.ts も CSV も従来どおり postage だけを見れば足りる
// （資材費は送料に含まれた形で出る。SPEC-V6 §4）。
//
// トグルの状態を postage から逆算しないのは、選んだあとに送料を手で直せるため ──
// 「postage が資材費ぶん少ないか」では、手で直した記録と区別が付かない。

import { parseNumericInput } from './input';
import { amountToInput } from './recordForm';

/** プリセットのうち、この計算に要る 2 つだけ（テストから作りやすくするため） */
export type ShippingPresetAmounts = {
  /** 送料そのもの（円） */
  value: number;
  /** 専用資材の代金（円）。0 = 資材の要らない配送方法 */
  materialCost: number;
};

/**
 * 記録のフォームが持つ送料まわりの状態。**postage は入力中の文字列のまま**
 * （フォームの他の金額と同じ扱い。SPEC §5.1）。
 */
export type ShippingMaterialState = {
  postage: string;
  shippingMaterialCost: number;
  excludesShippingMaterial: boolean;
};

/** プリセットの合計（送料 ＋ 資材費）。編集画面の合計行と、記録に入る既定値の両方がこれ */
export function shippingPresetTotal(preset: ShippingPresetAmounts): number {
  return preset.value + preset.materialCost;
}

/**
 * 資材費を持つプリセットか（SPEC-V6 §3）。0 円のときはトグルを出さない ──
 * 押しても金額が 1 円も動かないスイッチは、壊れているように見える。
 */
export function hasShippingMaterial(preset: ShippingPresetAmounts): boolean {
  return preset.materialCost > 0;
}

/**
 * 記録の側にトグルを出すか（SPEC-V6 §3）。**控えが 0 なら出さない** ──
 * 資材費のないプリセットを選んだ場合と、プリセットを使わず手で入れた記録がこれに当たる。
 */
export function showsShippingMaterialToggle(state: {
  shippingMaterialCost: number;
}): boolean {
  return state.shippingMaterialCost > 0;
}

/**
 * 送料プリセットを選んだとき（SPEC-V6 §3）。**既定は「資材費を含める」**。
 *
 * 資材の要る配送方法では、それを買わずに送ることはできない ── 含めるほうが多数派なので、
 * 追加のタップ 0 で合計が入る形にする。除くのは選んだあとにトグルで。
 */
export function selectShippingPreset(preset: ShippingPresetAmounts): ShippingMaterialState {
  return {
    postage: amountToInput(shippingPresetTotal(preset)),
    shippingMaterialCost: preset.materialCost,
    excludesShippingMaterial: false,
  };
}

/**
 * 「専用資材を使わない」を押したとき（SPEC-V6 §3）。押した向きへ資材費ぶんだけ動かす。
 *
 * **同じ向きに 2 度押しても二重に引かない**（状態が既にその向きなら何もしない）──
 * 画面はトグルなので普通は起きないが、ここが単調だと呼び出し側が順序を気にせずに済む。
 * 引いた結果が負になることはない（控えは選んだときに足した額そのもの）が、
 * 送料を手で小さく直したあとに押された場合に備えて 0 で止める。
 */
export function setExcludesShippingMaterial(
  state: ShippingMaterialState,
  excludes: boolean,
): ShippingMaterialState {
  if (state.excludesShippingMaterial === excludes) return state;

  const current = parseNumericInput(state.postage);
  const next = excludes
    ? Math.max(0, current - state.shippingMaterialCost)
    : current + state.shippingMaterialCost;

  return { ...state, postage: amountToInput(next), excludesShippingMaterial: excludes };
}
