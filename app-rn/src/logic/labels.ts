// SPEC-V2 §5.3「確定ラベル表」の表示語を 1 か所に集める（§5.3 の決定）。
//
// 採用したのは案 C:「1 件を指すときは種別語（純利益 / 利益）、2 件以上の合計は中立語（収支）」。
// 混在した合計を種別語で呼べないこと、データが 1 件増えただけでラベルが変わる案 D を
// 採らないことが理由（§5.2）。どちらを使うかは「対象がレコード 1 件か集計値か」で決まり、
// 画面ごとの都合では決めない。
//
// 内部の識別子（netProfit / totalNetProfit / SortTypeMonthly の profitDesc 等）は
// **改名しない**（§5.3）。ここで扱うのは画面に出る文字列だけ。
// 「手取り」はアプリ内のどこでも使わない（§1.2 / §7-8）。

import type { RecordKind } from '@/db/schema';

import type { MetricType } from './analytics';
import { formatYen } from './format';

/** 種別そのものの表示名（§1.1 の確定値）。画面によって変わらない */
const RECORD_KIND_LABELS: Record<RecordKind, string> = {
  used: '不用品',
  sourced: '仕入品',
};

/** レコード 1 件の netProfit に付ける語（§5.3）。不用品は「手取り」ではなく「純利益」（§7-8） */
const PROFIT_LABELS: Record<RecordKind, string> = {
  used: '純利益',
  sourced: '利益',
};

/** 計算タブの逆算入力に付ける語（§5.3） */
const TARGET_PROFIT_LABELS: Record<RecordKind, string> = {
  used: '目標の純利益',
  sourced: '目標利益',
};

/**
 * 複数レコードの Σ netProfit（月次カード / 下部累計 / データタブのサマリー・グラフ・ソート名）。
 * 種別が混ざり得るので中立語。画面タイトル「全期間の収支」で既に使っている語（§5.2）。
 */
export const TOTAL_PROFIT_LABEL = '収支';

/** totalExpenses。1 件でも合計でも種別で変えない（§5.3） */
export const EXPENSES_LABEL = '経費';

/** salesPrice。レコードを指すときは「販売価格」（§5.3） */
export const SALES_PRICE_LABEL = '販売価格';

/** Σ salesPrice。データタブの集計だけ「売上」（§5.3） */
export const TOTAL_SALES_LABEL = '売上';

/** 出品中レコード 1 件の salesPrice（UI-SPEC §6-3）。売れる前の値段なので「販売価格」とは呼ばない */
export const LISTING_PRICE_LABEL = '出品価格';

/** 出品中の Σ salesPrice（合計行。UI-SPEC §6-3） */
export const TOTAL_LISTING_PRICE_LABEL = '出品価格の合計';

/** 出品中の件数（合計行の左の値 A。UI-SPEC §1.2） */
export const LISTING_COUNT_LABEL = '出品中';

/** 一覧のメタ行に出す日付の意味づけ（UI-SPEC §1.2「{種別}　M/D 販売 / M/D 出品」） */
export const SOLD_DATE_LABEL = '販売';
export const LISTED_DATE_LABEL = '出品';

/** 月バー・期間シートで「月を選んでいない」状態を指す語（UI-SPEC §1.2） */
export const ALL_PERIOD_LABEL = '全期間';

/** 記録タブの状態チップ（UI-SPEC §1.2）。「出品中」側は LISTING_COUNT_LABEL と同じ語 */
export const SOLD_RECORDS_LABEL = '売れた記録';

/** commissionCost（§5.3） */
export const COMMISSION_LABEL = '販売手数料';

/** 計算タブの逆算結果。種別で変えない（§5.3） */
export const REQUIRED_SALES_PRICE_LABEL = '必要な販売価格';

/** purchasePrice。種別で変えない（§5.3 の表にはないが、欄名は 1 か所に集める） */
export const PURCHASE_PRICE_LABEL = '仕入価格';

/** postage / envelopeCost / othersCost の欄名 */
export const POSTAGE_LABEL = '送料';
export const ENVELOPE_COST_LABEL = '梱包材';
export const OTHERS_COST_LABEL = 'その他';

/** 内訳の 1 行目。入力欄の「販売価格」と区別して、計算に入った売上の総額を指す */
export const TOTAL_SALES_AMOUNT_LABEL = '売上総額';

/** 内訳では梱包材とその他を 1 行にまとめる（UI-SPEC §1.1-3a） */
export const ENVELOPE_AND_OTHERS_LABEL = '梱包・その他';

/** 結果カード・固定バーの折りたたみ見出し（UI-SPEC §1.1-2 / §1.1-3a） */
export const BREAKDOWN_LABEL = '内訳';

/** 計算タブの入力カードの折りたたみ見出し（UI-SPEC §1.1-6） */
export const OPTIONAL_COSTS_LABEL = '梱包材・その他を入力';

/** 結果カード右上のリセット（UI-SPEC §1.1-3a）。入力が空のときは無効（§5-8） */
export const CLEAR_LABEL = 'クリア';

/** 画面下端の固定ボタン（UI-SPEC §1.1-7）。押すと記録フォームを開く */
export const SAVE_AS_RECORD_LABEL = 'この内容で記録する';

/** 逆算側の結果見出し（UI-SPEC §1.1-3b） */
export const REQUIRED_PRICE_HEADLINE = 'この値段で出せばよい';

/**
 * 逆算モードのときの固定バーの売上側（UI-SPEC §1.1「挙動」）。
 * 通常モードは実績値なので TOTAL_SALES_LABEL、逆算モードはこれから必要になる額なので別語。
 */
export const REQUIRED_SALES_LABEL = '必要な売上';

/** 計算タブの逆算側セグメント名。種別で変えない（UI-SPEC §6-4） */
export const TARGET_TAB_LABEL = '目標から逆算';

/** 入力カードの手数料行（UI-SPEC §1.1-5）: 「手数料 10%」 */
export function commissionFieldLabel(rate: number): string {
  return `手数料 ${rate}%`;
}

/** 逆算結果の下に出す注記（UI-SPEC §1.1-3b） */
export function requiredPriceNote(rate: number): string {
  return `${POSTAGE_LABEL}・手数料 ${rate}% を差し引いた後の金額です`;
}

/**
 * 逆算結果の検算行:「売上 112 − 販売手数料 11 = 純利益 101 円」。
 *
 * 引き算の形にするのは「手数料や経費が引かれた後に目標額が残る」ことを一行で伝えるため。
 * 数字は logic/calcForm.ts の requiredPriceEquation が組み立てる（表示された数字だけで
 * 引き算が閉じるように、各項を先に丸めてある）。
 *
 * 金額に「円」を付けるのは末尾だけ。項ごとに付けると読点だらけになって式に見えなくなる。
 *
 * @param resultLabel 右辺の語。レコード 1 件ぶんの結果なので種別語（profitLabel）を渡す
 */
export function requiredPriceEquationParts(
  equation: { sales: number; deductions: { label: string; amount: number }[]; profit: number },
  resultLabel: string,
): string[] {
  return [
    `${TOTAL_SALES_LABEL} ${equation.sales}`,
    ...equation.deductions.map((deduction) => `− ${deduction.label} ${deduction.amount}`),
    `= ${resultLabel} ${formatYen(equation.profit)}`,
  ];
}

/**
 * 検算行を 1 本の文字列にしたもの。
 * 画面は項ごとに分けて描く（折り返しが項の切れ目でだけ起きるように）ので、
 * こちらは読み上げ用のラベルとテストで使う。
 */
export function requiredPriceEquationText(
  equation: { sales: number; deductions: { label: string; amount: number }[]; profit: number },
  resultLabel: string,
): string {
  return requiredPriceEquationParts(equation, resultLabel).join(' ');
}

/**
 * 合計行の収支の見出し（UI-SPEC §1.2）:「この月の収支」/「全期間の収支」。
 * 合計なので種別語ではなく中立語（§5.3）。
 */
export function periodProfitLabel(monthKey: string | null): string {
  return `${monthKey == null ? ALL_PERIOD_LABEL : 'この月'}の${TOTAL_PROFIT_LABEL}`;
}

/**
 * 出品中レコードの見込み netProfit（UI-SPEC §6-3）。
 * 送料未入力かどうかの判定はしないので「約」は常に付く（§5-3）。金額側は formatApproxYenSymbol。
 */
export function expectedProfitText(approxAmount: string): string {
  return `売れたら ${approxAmount}`;
}

/** 種別の表示名（レコード詳細の「種別」行・種別セレクタ） */
export function recordKindLabel(kind: RecordKind): string {
  return RECORD_KIND_LABELS[kind];
}

/** レコード 1 件の netProfit のラベル。**合計には使わない**（合計は TOTAL_PROFIT_LABEL） */
export function profitLabel(kind: RecordKind): string {
  return PROFIT_LABELS[kind];
}

/**
 * 計算タブの結果側セグメント名（UI-SPEC §6-4）: 「純利益を出す」/「利益を出す」。
 * 逆算側は種別で変えない定数 TARGET_TAB_LABEL（種別語は直下の入力行に出るため）。
 */
export function profitTabLabel(kind: RecordKind): string {
  return `${profitLabel(kind)}を出す`;
}

/** 計算タブの逆算入力欄のラベル（§5.3）: 「目標の純利益」/「目標利益」 */
export function targetProfitLabel(kind: RecordKind): string {
  return TARGET_PROFIT_LABELS[kind];
}

/**
 * データタブの指標セグメント名（§1.3）。
 * 指標は期間内の集計なので、netProfit 側は種別語ではなく中立語になる。
 */
export function metricLabel(metric: MetricType): string {
  return metric === 'sales' ? '売上金額' : TOTAL_PROFIT_LABEL;
}
