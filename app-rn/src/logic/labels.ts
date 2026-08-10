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
import { formatYenTight } from './format';

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

/**
 * 説明文・式の中で使う短い方（「手数料96円が引かれて」「手数料10%が引かれるので」）。
 * 1 文に金額が 3 つ入る場所では正式名だと文が読めなくなるので、入力欄の
 * commissionFieldLabel と同じ短縮形に合わせる。単独の行や一覧は COMMISSION_LABEL。
 */
export const COMMISSION_SHORT_LABEL = '手数料';

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

/**
 * 逆算結果の折りたたみ見出し（採用案 12c）。
 * 結果側の「内訳」と違って金額の一覧だけでなく式も入るので、開く前にそれが分かる語にする。
 */
export const BREAKDOWN_AND_METHOD_LABEL = '内訳と計算のしかた';

/** 逆算結果の一覧の 1 行目（緑の区画）。売れたあと売り手のものになる額 */
export const KEPT_LABEL = '手元に残る';

/** 帯の下の 2 値の左側。一覧の KEPT_LABEL と同じものを詰めて言う */
export const KEPT_SHORT_LABEL = '手元';

/**
 * 帯の下の 2 値の右側（販売手数料 ＋ 経費 ＝ totalExpenses）。
 *
 * ここを EXPENSES_LABEL（経費）と呼ばないのは、同じ画面の説明文・式で「経費」が
 * 手数料を含まない額を指しているため。手数料込みか否かを語で見分けられるようにする。
 *
 * 逆算モードの固定バーの経費側も同じ理由でこの語を使う（UI-SPEC §1.1-2）。
 * バーとパネルで同じ額に違う語が付くと、スクロールした瞬間に数字が食い違って見える。
 * 通常モードのバーは逆算パネルと同時に出ないので EXPENSES_LABEL のまま。
 */
export const DEDUCTED_LABEL = '引かれる分';

/**
 * 式の左辺に置く目標額の語（「目標100円 ＋ 経費765円」）。
 * 入力欄は targetProfitLabel（「目標の純利益」/「目標利益」）だが、式の中では
 * 項が長いほど式に見えなくなるので短くする。直上の入力欄に正式名が出ている。
 */
export const FORMULA_TARGET_LABEL = '目標';

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

/**
 * 折りたたみ見出しに入力済みの合計を添えた形:「梱包材・その他を入力（80円）」。
 *
 * 畳んだ状態でも中身が結果に効いていることを見出しだけで分かるようにする。
 * 畳まれた欄に入れた梱包材・その他が見えないまま必要販売価格を押し上げていて、
 * 経費が送料だけに見える、という報告への対応。
 *
 * 入力がなければ金額を出さない（「（0円）」は畳んだままでよい欄をわざわざ主張する）。
 * 自動で開く形にしないのは、毎回開いた状態になると畳んでいる意味がなくなるため。
 */
export function optionalCostsLabel(total: number): string {
  return total === 0
    ? OPTIONAL_COSTS_LABEL
    : `${OPTIONAL_COSTS_LABEL}（${formatYenTight(total)}）`;
}

/** 逆算結果の一覧に出す手数料の行名（採用案 12c）:「販売手数料10%」 */
export function commissionItemLabel(rate: number): string {
  return `${COMMISSION_LABEL}${rate}%`;
}

/**
 * 逆算結果の説明文（採用案 12c）:
 * 「962円で売ると、手数料96円と経費765円が引かれて101円が残ります。」
 *
 * 帯グラフと同じ内容を 1 文で言い直したもの。帯は割合、こちらは金額と因果（何が引かれるから
 * いくら残るのか）を担当する。逆算の結果が暗算と食い違って見えるという指摘への対応なので、
 * 折りたたみの中ではなく閉じた状態から読める位置に置く。
 *
 * 引かれる項が 0 のとき（経費なし・手数料 0%）に「引かれて」と言えないので、
 * 引かれるものの有無で文を分ける。
 */
export function requiredPriceSummary(result: {
  requiredPrice: number;
  commissionAmount: number;
  expenses: number;
  kept: number;
}): string {
  const deductions: string[] = [];
  if (result.commissionAmount !== 0) {
    deductions.push(`${COMMISSION_SHORT_LABEL}${formatYenTight(result.commissionAmount)}`);
  }
  if (result.expenses !== 0) {
    deductions.push(`${EXPENSES_LABEL}${formatYenTight(result.expenses)}`);
  }

  const price = formatYenTight(result.requiredPrice);
  const kept = formatYenTight(result.kept);
  return deductions.length === 0
    ? `${price}で売ると、そのまま${kept}が残ります。`
    : `${price}で売ると、${deductions.join('と')}が引かれて${kept}が残ります。`;
}

/** 切り上げ前の値の表示「961.1...」。丸めずに切り捨てるのは、切り上げの話が続くため */
function formatExactPrice(exact: number): string {
  return `${(Math.floor(exact * 10) / 10).toFixed(1)}...`;
}

/**
 * 「計算のしかた」の式（採用案 12c）:
 *
 *     目標100円 ＋ 経費765円 ＝ 865円
 *     手数料10%が引かれるので ÷ 0.9
 *     → 961.1... を切り上げて 962円
 *
 * 「なぜ目標＋手数料率ではなく割り算なのか」がこの 3 行の主題なので、経費や手数料が
 * ない場合はその行を落とす（「＋ 経費0円」「÷ 1」は説明にならない）。
 */
export function requiredPriceFormulaLines(formula: {
  targetProfit: number;
  expenses: number;
  subtotal: number;
  commissionRate: number;
  divisor: number;
  exact: number;
  requiredPrice: number;
  roundedUp: boolean;
}): string[] {
  const target = `${FORMULA_TARGET_LABEL}${formatYenTight(formula.targetProfit)}`;
  const lines = [
    formula.expenses === 0
      ? target
      : `${target} ＋ ${EXPENSES_LABEL}${formatYenTight(formula.expenses)} ＝ ${formatYenTight(formula.subtotal)}`,
  ];

  if (formula.commissionRate !== 0) {
    lines.push(
      `${COMMISSION_SHORT_LABEL}${formula.commissionRate}%が引かれるので ÷ ${formula.divisor}`,
    );
  }

  lines.push(
    formula.roundedUp
      ? `→ ${formatExactPrice(formula.exact)} を切り上げて ${formatYenTight(formula.requiredPrice)}`
      : `→ ${formatYenTight(formula.requiredPrice)}`,
  );

  return lines;
}

/**
 * 式の直下に常設する注意文（採用案 12c）:「950円では90円にしかならず、目標に届きません」。
 *
 * 式だけでは「切り上げの 1 円をけちっても大差ないのでは」と読めてしまうため、
 * 1 つ下の値段を実際に置いたときいくらになるかを添える。何回出したかを数えて
 * 引っ込める仕掛けは持たない（表示条件は数字が成り立つかどうかだけ）。
 */
export function lowerPriceWarning(example: { price: number; profit: number }): string {
  return `${formatYenTight(example.price)}では${formatYenTight(example.profit)}にしかならず、目標に届きません`;
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
