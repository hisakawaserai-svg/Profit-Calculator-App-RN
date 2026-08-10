// 計算タブ（UI-SPEC §1.1 / 採用案 3a）の入力値の扱い。
//
// recordForm.ts と同じ考え方で、画面（app/(tabs)/index.tsx）から
// 「入力値の組み立て・クリア判定・CostInput への変換」を切り出した純粋関数。
// 計算式そのものは logic/profit.ts のみが持ち、ここでも画面でも再実装しない（SPEC §2）。

import type { RecordKind } from '@/db/schema';

import { parseNumericInput } from './input';
import {
  COMMISSION_LABEL,
  ENVELOPE_AND_OTHERS_LABEL,
  POSTAGE_LABEL,
  PURCHASE_PRICE_LABEL,
} from './labels';
import {
  commissionCost,
  requiredSalesPrice,
  roundForDisplay,
  type CostInput,
} from './profit';
import { DEFAULT_COMMISSION, type InitialAmounts } from './recordForm';

/**
 * 計算タブの一時状態。レコードではなくシミュレーションなので DB には触れない（SPEC-V2 §1.3）。
 * 金額は入力中の文字列のまま持つ（sanitizeNumericInput 済みの値。SPEC §5.1）。
 */
export type CalcFormValues = {
  /** 画面ローカルの種別。初期値は設定の既定種別（SPEC-V2 §1.4） */
  kind: RecordKind;
  salesPrice: string;
  purchasePrice: string;
  postage: string;
  envelopeCost: string;
  othersCost: string;
  /** 逆算モードの「目標の純利益 / 目標利益」 */
  targetProfit: string;
  /** 手数料「率」(%)。10 = 10% */
  commission: number;
};

/**
 * クリア直後の状態（＝画面を開いた直後の状態）。
 * 金額だけでなく種別も設定の既定値に戻す（SPEC-V2 §1.3 のリセット）。
 */
export function newCalcValues(defaultKind: RecordKind): CalcFormValues {
  return {
    kind: defaultKind,
    salesPrice: '',
    purchasePrice: '',
    postage: '',
    envelopeCost: '',
    othersCost: '',
    targetProfit: '',
    commission: DEFAULT_COMMISSION,
  };
}

/**
 * 「クリア」を押せるかどうか（UI-SPEC §5-8「入力が空でないときだけ有効」）。
 *
 * 判定はクリアで戻る状態との比較で行う。押しても何も変わらないときだけ無効になり、
 * 値の種類（金額・手数料・種別）が増えても判定を書き足さずに済む。
 * undo は今回実装しない（§5-8）。
 */
export function hasAnyInput(values: CalcFormValues, defaultKind: RecordKind): boolean {
  const cleared = newCalcValues(defaultKind);
  return (Object.keys(cleared) as (keyof CalcFormValues)[]).some(
    (key) => values[key] !== cleared[key],
  );
}

/**
 * 計算に渡す入力（SPEC §2）。空文字・"." は 0 扱い（SPEC §5.1）。
 * 不用品は仕入価格の概念がないので 0 扱い（SPEC-V2 §1.3）。計算式自体は種別で変えない（§1.2）。
 */
export function toCostInput(values: CalcFormValues): CostInput {
  return {
    salesPrice: parseNumericInput(values.salesPrice),
    purchasePrice: values.kind === 'used' ? 0 : parseNumericInput(values.purchasePrice),
    postage: parseNumericInput(values.postage),
    envelopeCost: parseNumericInput(values.envelopeCost),
    othersCost: parseNumericInput(values.othersCost),
    commission: values.commission,
  };
}

/**
 * 逆算モードの数字（UI-SPEC §1.1「挙動」）。
 * 販売価格は入力ではなく逆算結果になるので、固定バーの「必要な売上」・経費・内訳は
 * 「必要な販売価格で売れた場合」の値で出す。手数料額が売上に比例するため、
 * 入力欄の販売価格（無効化されている）をそのまま使うと経費が食い違う。
 */
export function toRequiredCostInput(values: CalcFormValues): CostInput {
  const costs = toCostInput(values);
  return {
    ...costs,
    salesPrice: requiredSalesPrice(parseNumericInput(values.targetProfit), costs),
  };
}

/** 検算行の引かれる項（「− 販売手数料 11」の 1 つぶん） */
export type EquationDeduction = { label: string; amount: number };

/** 検算行の材料。表示に出る数字だけで引き算が閉じている */
export type RequiredPriceEquation = {
  sales: number;
  deductions: EquationDeduction[];
  profit: number;
};

/**
 * 逆算結果の検算（「売上 112 − 販売手数料 11 = 純利益 101 円」）。
 *
 * 逆算の結果が手数料率から直感的に出る額（100 円 ＋ 10% = 110 円）と食い違って見える、
 * という利用者の指摘への対応。根拠を結果のすぐ下に常時出すためのデータを組み立てる。
 *
 * 数字の作り方には 2 つ約束がある:
 *
 * 1. **各項を先に丸めてから引く。** 表示された数字どうしの引き算が画面上で必ず合うようにする。
 *    先に丸めない（内部の実数で引いて最後に丸める）と、112 − 11 の答えが 101 と出るのに
 *    結果だけ 100 と表示される、という食い違いが起きうる。指摘そのものを増やさないため。
 * 2. **右辺は目標額ではなく実際の利益。** 必要販売価格は §2.5 の Math.ceil で切り上げるので、
 *    その価格で売ると利益は目標額をわずかに上回る（目標 100 → 112 円で売ると 101 円残る）。
 *    右辺に目標額を置くと、この 1 円が「合わない引き算」として見えてしまう。
 *
 * 0 円の項は出さない（「− 送料 0」は根拠の説明にならないため）。
 */
export function requiredPriceEquation(values: CalcFormValues): RequiredPriceEquation {
  const costs = toRequiredCostInput(values);
  const sales = roundForDisplay(costs.salesPrice);

  const deductions = [
    // 不用品は仕入価格の行を出さない（SPEC-V2 §1.3）。toCostInput で 0 なので結果は同じだが、
    // 0 円の項として落ちるのに任せず、種別の意味として出さないことを明示する
    ...(values.kind === 'sourced'
      ? [{ label: PURCHASE_PRICE_LABEL, amount: roundForDisplay(costs.purchasePrice) }]
      : []),
    { label: POSTAGE_LABEL, amount: roundForDisplay(costs.postage) },
    {
      label: ENVELOPE_AND_OTHERS_LABEL,
      amount: roundForDisplay(costs.envelopeCost + costs.othersCost),
    },
    { label: COMMISSION_LABEL, amount: roundForDisplay(commissionCost(costs)) },
  ].filter((deduction) => deduction.amount !== 0);

  return {
    sales,
    deductions,
    profit: deductions.reduce((rest, deduction) => rest - deduction.amount, sales),
  };
}

/**
 * 記録フォームへ引き継ぐ初期値（SPEC §3.2 prepareNewRecord 相当）。
 * 決定 §7-7 によりレコードは作らず、メモリ上の初期値として渡すだけ。
 * 種別も引き継ぐ（設定値ではなく画面の見た目に合わせる。SPEC-V2 §1.4）。
 */
export function toInitialAmounts(values: CalcFormValues): InitialAmounts {
  return {
    kind: values.kind,
    salesPrice: values.salesPrice,
    // 不用品では欄を出していないので、入力が残っていてもフォームには渡さない
    purchasePrice: values.kind === 'used' ? '' : values.purchasePrice,
    postage: values.postage,
    envelopeCost: values.envelopeCost,
    othersCost: values.othersCost,
    commission: values.commission,
  };
}
