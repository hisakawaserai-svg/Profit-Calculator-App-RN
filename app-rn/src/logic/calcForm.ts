// 計算タブ（UI-SPEC §1.1 / 採用案 3a）の入力値の扱い。
//
// recordForm.ts と同じ考え方で、画面（app/(tabs)/index.tsx）から
// 「入力値の組み立て・クリア判定・CostInput への変換」を切り出した純粋関数。
// 計算式そのものは logic/profit.ts のみが持ち、ここでも画面でも再実装しない（SPEC §2）。

import type { RecordKind } from '@/db/schema';
import type { Locale } from '@/settings/language';

import { parseNumericInput } from './input';
import {
  commissionItemLabel,
  envelopeCostLabel,
  keptLabel,
  othersCostLabel,
  postageLabel,
  purchasePriceLabel,
} from './labels';
import {
  commissionCost,
  exactRequiredSalesPrice,
  netProfit,
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
  /**
   * 選んだ販売サイトの名前（SPEC-V3 §1.5.1）。空文字 = 未設定。
   *
   * 計算タブは記録を作らないので、これは**画面ローカルの state**でしかない ──
   * 「この内容で記録する」で toInitialAmounts に乗ってフォームへ渡り、そこで初めて
   * 保存の対象になる（kind と同じ扱い。SPEC-V2 §1.4）。計算式には一切入らない。
   */
  siteName: string;
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
    siteName: '',
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

/**
 * 帯グラフの 1 区画。逆算側では内訳一覧の 1 行も同じものを指す。
 * key は帯と一覧で色を対応づけるためのもので、色そのものは画面（theme）が決める。
 */
export type BreakdownPartKey =
  | 'kept'
  | 'commission'
  | 'purchasePrice'
  | 'postage'
  | 'envelopeCost'
  | 'othersCost';

export type BreakdownPart = {
  key: BreakdownPartKey;
  label: string;
  /** 表示用に丸め済み。合計は必ず salesPrice に一致する */
  amount: number;
};

/**
 * 販売価格の内訳（帯グラフと、その下の「手元 ◯円 ／ 引かれる分 ◯円」の材料）。
 * 結果側・逆算側のどちらも同じ形で作る（UI-SPEC §1.1-3a / §1.1-3b）。
 */
export type CostBreakdown = {
  /** 帯全体が表す額。結果側は入力の販売価格、逆算側は必要販売価格 */
  salesPrice: number;
  /** 手元に残る額（＝ netProfit）。salesPrice − deducted */
  kept: number;
  /** 引かれる分の合計（販売手数料 ＋ 経費） */
  deducted: number;
  commissionAmount: number;
  /** 手数料以外の経費の合計 */
  expenses: number;
  /** 帯に出す項目。入力順（仕入 → 送料 → 販売手数料 → 梱包材・その他）、最後に kept */
  parts: BreakdownPart[];
};

/** 「計算のしかた」に出す式の材料 */
export type RequiredPriceFormula = {
  targetProfit: number;
  /** 手数料以外の経費の合計 */
  expenses: number;
  /** targetProfit + expenses。画面上で足し算が閉じるよう、表示値どうしの和にする */
  subtotal: number;
  /** 手数料率(%) */
  commissionRate: number;
  /** 割る数（手数料 10% なら 0.9）。0% のときは割り算の行自体を出さない */
  divisor: number;
  /** 切り上げ前の値。Math.ceil すると requiredPrice になる */
  exact: number;
  requiredPrice: number;
  /** 切り上げが実際に効いたか。割り切れたときは「切り上げて」と言わない */
  roundedUp: boolean;
};

/** 「950円では90円にしかならず、目標に届きません」の材料 */
export type LowerPriceExample = { price: number; profit: number };

/**
 * 逆算結果ぜんぶ。帯・2 値・説明文・一覧・式が同じ数字を見るように 1 か所で作る。
 * salesPrice は逆算の結果なので、この画面では requiredPrice の名前でも読めるようにしてある。
 */
export type RequiredPriceResult = CostBreakdown & {
  /** CostBreakdown.salesPrice と同じ値。逆算側の見出し・式で使う名前 */
  requiredPrice: number;
  formula: RequiredPriceFormula;
  /** 1 つ下の価格の例。0 円以下になる場合や、丸めのせいで話が合わなくなる場合は null */
  lowerPrice: LowerPriceExample | null;
};

/**
 * 経費 4 項目の並び。帯・一覧・式のすべてでこの順に出す（手数料はこの間の postage の次に挟む）。
 * 内訳（§1.1-3a）と違って梱包材とその他をまとめないのは、帯の区画と一覧の行を
 * 1 対 1 で対応させるため（まとめると色 1 つに 2 つの入力欄がぶら下がる）。
 *
 * 入力欄の並び（仕入 → 送料 → 手数料 → 梱包材・その他）と揃える。
 * 記録詳細の帯（recordBreakdown）・ミニ帯グラフ（MINI_BAR_ORDER）と同じ「入力順」で、
 * 利益（kept）だけが最後に来る。
 */
type ExpensePartDefinition = {
  key: BreakdownPartKey;
  label: string;
  of: (costs: CostInput) => number;
};

// **モジュールスコープの配列にしない。** 表示語は locale で決まるので、
// import 時に畳むと言語を切り替えても帯の項目名が前の言語のまま残る（src/i18n/index.ts の冒頭）
function expensePartsBeforeCommission(locale: Locale): ExpensePartDefinition[] {
  return [
    { key: 'purchasePrice', label: purchasePriceLabel(locale), of: (costs) => costs.purchasePrice },
    { key: 'postage', label: postageLabel(locale), of: (costs) => costs.postage },
  ];
}

function expensePartsAfterCommission(locale: Locale): ExpensePartDefinition[] {
  return [
    { key: 'envelopeCost', label: envelopeCostLabel(locale), of: (costs) => costs.envelopeCost },
    { key: 'othersCost', label: othersCostLabel(locale), of: (costs) => costs.othersCost },
  ];
}

/**
 * 「1 つ下の価格」の刻み（注意文の例に使う値）。
 *
 * 必要販売価格から 1 円下げても「届かない」ことは伝わらないので、実際に売値として置きうる
 * キリのいい額まで下げる。刻みを金額帯で変えるのは、112 円に対する 50 円刻みも
 * 9,800 円に対する 10 円刻みも「1 つ下の値段」には見えないため。
 * 200 円以下を 10 円刻みにしてあるので、指摘のあった 112 円のケースは 110 円が例になる。
 */
function priceStep(price: number): number {
  if (price <= 200) return 10;
  if (price <= 1000) return 50;
  if (price <= 10000) return 100;
  return 500;
}

/**
 * 帯グラフとその下の 2 値の材料（UI-SPEC §1.1-3a / §1.1-3b）。
 *
 * 結果側（入力した販売価格）と逆算側（必要販売価格）で同じものを出すので、作るのはここ 1 か所。
 * 呼び出し側の違いは costs.salesPrice に何が入っているかだけ。
 *
 * 数字の作り方の約束:
 *
 * 1. **各項を先に丸めてから引く。** 帯の区画・一覧の行・説明文の数字を足すと、画面に出ている
 *    販売価格にぴったり一致する。先に丸めない（実数で引いて最後に丸める）と
 *    「96 と 765 が引かれて 101 が残る」の足し算が 1 円合わない、という指摘を生む。
 * 2. **手元は引き算の結果。** 逆算側の必要販売価格は §2.5 の Math.ceil で切り上げるので、
 *    その価格で売ると手元には目標額をわずかに超える額が残る（目標 100 → 112 円で 101 円）。
 *    目標額をそのまま置くと帯の合計が合わなくなる。
 *
 * kept は結果側ではマイナスにもなる（経費が販売価格を超えている状態）。帯は 0 円より大きい
 * 区画だけを描くので、その場合の帯は「引かれる分」だけが並ぶ形になり、実額は下の 2 値が持つ。
 */
export function costBreakdown(
  locale: Locale,
  costs: CostInput,
  kind: RecordKind,
): CostBreakdown {
  const salesPrice = roundForDisplay(costs.salesPrice);
  const commissionAmount = roundForDisplay(commissionCost(costs));

  const buildExpenseParts = (
    definitions: ExpensePartDefinition[],
  ) =>
    definitions
      // 不用品は仕入価格を帯・一覧・式のどこにも出さない（SPEC-V2 §1.3）。toCostInput で 0 なので
      // 0 円の項として落としても結果は同じだが、種別の意味として出さないことを明示する
      .filter((part) => part.key !== 'purchasePrice' || kind === 'sourced')
      .map((part) => ({ key: part.key, label: part.label, amount: roundForDisplay(part.of(costs)) }))
      // 0 円の項は帯にも一覧にも出さない（「送料 0 円」は根拠の説明にならない）
      .filter((part) => part.amount !== 0);

  const partsBeforeCommission = buildExpenseParts(expensePartsBeforeCommission(locale));
  const partsAfterCommission = buildExpenseParts(expensePartsAfterCommission(locale));
  const expenseParts = [...partsBeforeCommission, ...partsAfterCommission];

  const expenses = expenseParts.reduce((sum, part) => sum + part.amount, 0);
  const deducted = commissionAmount + expenses;

  return {
    salesPrice,
    kept: salesPrice - deducted,
    deducted,
    commissionAmount,
    expenses,
    parts: [
      ...partsBeforeCommission,
      ...(commissionAmount !== 0
        ? [
            {
              key: 'commission' as const,
              label: commissionItemLabel(locale, costs.commission),
              amount: commissionAmount,
            },
          ]
        : []),
      ...partsAfterCommission,
      // 手元は 0 円でも必ず出す。この画面の主語なので、消えると帯の緑が何だったのか読めなくなる
      { key: 'kept', label: keptLabel(locale), amount: salesPrice - deducted },
    ],
  };
}

/** 結果側（UI-SPEC §1.1-3a）の帯・2 値。入力した販売価格をそのまま分解する */
export function profitBreakdown(locale: Locale, values: CalcFormValues): CostBreakdown {
  return costBreakdown(locale, toCostInput(values), values.kind);
}

/**
 * 逆算結果の表示材料をまとめて作る（UI-SPEC §1.1-3b / 採用案 12c）。
 *
 * 逆算の結果が手数料率からの暗算（目標 100 円・手数料 10% なら 110 円）と食い違って見える、
 * という利用者の指摘への対応。帯・説明文・一覧・式が全部この 1 つの戻り値を見る。
 */
export function requiredPriceResult(
  locale: Locale,
  values: CalcFormValues,
): RequiredPriceResult {
  const costs = toRequiredCostInput(values);
  const breakdown = costBreakdown(locale, costs, values.kind);

  const targetProfit = parseNumericInput(values.targetProfit);
  const targetProfitDisplay = roundForDisplay(targetProfit);
  const exact = exactRequiredSalesPrice(targetProfit, costs);
  const { expenses, salesPrice: requiredPrice } = breakdown;

  return {
    ...breakdown,
    requiredPrice,
    formula: {
      targetProfit: targetProfitDisplay,
      expenses,
      // 表示値どうしの和にして、画面上で足し算が必ず閉じるようにする
      subtotal: targetProfitDisplay + expenses,
      commissionRate: values.commission,
      // 1 - rate/100 だと手数料 7% で 0.9299999999999999 になる。率は整数なので
      // 分子側で引いてから割れば表示できる値になる（計算に使うのは profit.ts 側）
      divisor: (100 - values.commission) / 100,
      exact,
      requiredPrice,
      roundedUp: !Number.isInteger(exact),
    },
    lowerPrice: lowerPriceExample(values, requiredPrice, targetProfitDisplay),
  };
}

/**
 * 必要販売価格から 1 段下げた価格と、その価格で売ったときに残る額。
 *
 * 丸めのせいで「その額でも目標に届いてしまう」場合は null を返して注意文ごと出さない。
 * 必要販売価格が刻みより小さくて 0 円以下になる場合も同じ（「0円では」は例にならない）。
 */
function lowerPriceExample(
  values: CalcFormValues,
  requiredPrice: number,
  targetProfit: number,
): LowerPriceExample | null {
  const step = priceStep(requiredPrice);
  const price = Math.floor((requiredPrice - 1) / step) * step;
  if (price <= 0) return null;

  const profit = roundForDisplay(netProfit({ ...toCostInput(values), salesPrice: price }));
  return profit < targetProfit ? { price, profit } : null;
}

/**
 * 記録フォームへ引き継ぐ初期値（SPEC §3.2 prepareNewRecord 相当）。
 * 決定 §7-7 によりレコードは作らず、メモリ上の初期値として渡すだけ。
 * 種別も引き継ぐ（設定値ではなく画面の見た目に合わせる。SPEC-V2 §1.4）。
 *
 * @param salesPrice 画面の販売価格欄に出ている値。逆算モードでは入力値ではなく逆算結果に
 *   なるので、呼び出し側がモードを解決して渡す。欄に 439 と出ているのに 0 が記録される、
 *   という食い違いを型で防ぐために省略できない引数にしてある。
 * @param targetProfit 逆算モードの目標額（SPEC-V9 §5.3）。**salesPrice と同じ理由で
 *   呼び出し側がモードを解決して渡す** ── values.targetProfit はモードを戻しても残るので、
 *   「利益を出す」モードのまま記録すると、画面のどこにも出ていない目標が付いてしまう。
 *   逆算モード以外では空文字（＝決めていない）を渡す。
 */
export function toInitialAmounts(
  values: CalcFormValues,
  salesPrice: string,
  targetProfit: string,
): InitialAmounts {
  return {
    // 記録フォームの目標欄の初期値。欄に見える状態で渡すだけで、保存されるのは
    // フォームで「保存」を押したとき（書き換えたならその値）
    targetProfit,
    kind: values.kind,
    salesPrice,
    // 不用品では欄を出していないので、入力が残っていてもフォームには渡さない
    purchasePrice: values.kind === 'used' ? '' : values.purchasePrice,
    postage: values.postage,
    envelopeCost: values.envelopeCost,
    othersCost: values.othersCost,
    commission: values.commission,
    siteName: values.siteName,
  };
}
