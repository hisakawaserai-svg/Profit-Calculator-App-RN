// 送料プリセットの「専用資材の代金」（SPEC-V6）。
//
// 一部の配送方法は専用の箱・封筒を買わないと使えず、その代金が送料とは別にかかる。
// プリセットは送料（value）と資材費（materialCost）を**別々に持ち**、記録に入れるときに
// 足す ── 合算した 1 つの値で持つと、「今回は資材を使わない」をあとから引き算できない。
//
// ## 選ぶのはシートの中（採用案 45b）
//
// 資材費のあるプリセットの行には**セグメント 2 択**（「送料のみ」/「＋資材 100円」）が出て、
// **選択と資材の有無が 1 タップで同時に決まる**。記録フォーム側のトグル（旧 §3）は廃止した ──
// 「選んでから、別の場所でもう一度決める」形は、選ぶ時点で決められるなら余計な 1 手。
//
// **既定は「＋資材」**（行そのものを押したときもこちら）。資材費を登録してあるプリセットは、
// その資材を使う前提で登録されているため。
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

import type { PresetType } from '@/db/schema';

import { amountToInput } from './recordForm';

/** プリセットのうち、この計算に要る 2 つだけ（テストから作りやすくするため） */
export type ShippingPresetAmounts = {
  /** 送料そのもの（円） */
  value: number;
  /** 専用資材の代金（円）。0 = 資材の要らない配送方法 */
  materialCost: number;
};

/**
 * 資材を使うか（採用案 45b のセグメント 2 択）。**既定は `'with-material'`。**
 * 順番も「送料のみ → ＋資材」ではなく意味の順で持ち、並びはセグメント側が決める。
 */
export type ShippingMaterialChoice = 'with-material' | 'shipping-only';

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
 * **一覧の行・設定タブのカードに出す額**（SPEC-V6 §1）。
 * 資材費のある送料プリセットは**合計**で、それ以外は登録した値そのまま。
 *
 * 判定を 1 本にしてあるのは、**同じプリセットが画面によって違う額で出ないようにするため** ──
 * `PresetRow` と `PresetSummaryCard` はそれぞれ独立に `value` を描いていたので、
 * 一覧を合計に改めたときにカードだけ送料のまま取り残された。
 *
 * 率のプリセット（販売サイト）と梱包材は materialCost を持たないので、そのまま返る。
 */
export function presetRowAmount(preset: {
  type: PresetType;
  value: number;
  materialCost?: number;
}): number {
  const materialCost = preset.materialCost ?? 0;
  return preset.type === 'shipping' && materialCost > 0
    ? preset.value + materialCost
    : preset.value;
}

/**
 * 選んだ側の金額（45b）。**シートの行の右端に出る額でもあり、欄に入る額でもある。**
 * 同じ 1 本から取るので、押す前に見えていた数字とそのあと欄に入る数字が食い違わない。
 */
export function shippingAmountFor(
  preset: ShippingPresetAmounts,
  choice: ShippingMaterialChoice,
): number {
  return choice === 'with-material' ? shippingPresetTotal(preset) : preset.value;
}

/**
 * いま欄に入っている額から、そのプリセットの**どちら側が選ばれているか**を引く（45b）。
 * 一致しなければ null ＝ この行は選ばれていない（手で打った額・別のプリセット）。
 *
 * 記録を開き直したときの復元もこれ 1 本で足りる ── 保存済みの postage は
 * 選んだ側の額そのものなので、保存されている資材の有無がそのまま戻る。
 * **合計の側を先に見る**のは、資材費 0 円のプリセットで両者が同じ額になるため
 * （その行にセグメントは出ないので、どちらを返しても表示は変わらない）。
 */
export function shippingMaterialChoiceOf(
  preset: ShippingPresetAmounts,
  value: number | null,
): ShippingMaterialChoice | null {
  if (value == null) return null;
  if (shippingPresetTotal(preset) === value) return 'with-material';
  if (preset.value === value) return 'shipping-only';
  return null;
}

/**
 * 送料プリセットを選んだとき（45b）。**シートで選んだ側をそのまま記録に写す。**
 *
 * 控え（shippingMaterialCost）は選んだ側に関わらず必ず残す ── 開き直したときに
 * セグメントを出すかどうかは、この控えではなくプリセットの側が決めるが、
 * CSV に出ない「そのとき資材がいくらだったか」の記録としてここにしか残らない。
 */
export function selectShippingPreset(
  preset: ShippingPresetAmounts,
  choice: ShippingMaterialChoice = 'with-material',
): ShippingMaterialState {
  return {
    postage: amountToInput(shippingAmountFor(preset, choice)),
    shippingMaterialCost: preset.materialCost,
    excludesShippingMaterial: choice === 'shipping-only',
  };
}
