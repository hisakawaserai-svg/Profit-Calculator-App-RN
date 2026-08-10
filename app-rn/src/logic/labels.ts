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

/** 計算タブの結果側セグメント名（§1.3）: 「純利益表示」/「利益表示」 */
export function profitTabLabel(kind: RecordKind): string {
  return `${profitLabel(kind)}表示`;
}

/** 計算タブの逆算側セグメント名（§1.3）: 「目標純利益逆算」/「目標利益逆算」 */
export function targetProfitTabLabel(kind: RecordKind): string {
  // セグメント名は幅が限られるので「目標の純利益」ではなく「目標純利益」（§1.3 の表のとおり）
  return kind === 'used' ? '目標純利益逆算' : '目標利益逆算';
}

/** 計算タブの逆算入力欄のラベル（§5.3）: 「目標の純利益」/「目標利益」 */
export function targetProfitLabel(kind: RecordKind): string {
  return TARGET_PROFIT_LABELS[kind];
}

/** 計算タブの逆算タブの見出し（§1.3） */
export function targetProfitPrompt(kind: RecordKind): string {
  return `${targetProfitLabel(kind)}を入力してください`;
}

/**
 * データタブの指標セグメント名（§1.3）。
 * 指標は期間内の集計なので、netProfit 側は種別語ではなく中立語になる。
 */
export function metricLabel(metric: MetricType): string {
  return metric === 'sales' ? '売上金額' : TOTAL_PROFIT_LABEL;
}
