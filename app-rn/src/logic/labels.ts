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

import type { PresetType, RecordKind } from '@/db/schema';

import { YEAR_UNIT_MONTH_THRESHOLD, type ChartUnit } from './analytics';
import type { CalcRowSign, CalcSubmitBlockedReason } from './calcMemo';
import {
  formatElapsedDays,
  formatMonthKeyTitle,
  formatShortDate,
  formatUnitYen,
  formatYearTitle,
  formatYenTight,
} from './format';
import { daysBetween } from './listingDays';
import { periodKind, periodYear, type Period } from './period';
import {
  isRatePreset,
  PRESET_INITIAL_MAX_LENGTH,
  PRESET_NAME_MAX_LENGTH,
  PRESET_RATE_MAX,
  type PresetInvalidReason,
} from './preset';
import { TAG_NAME_MAX_LENGTH, TAG_NAME_SEPARATOR, type TagInvalidReason } from './tag';

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

/**
 * 状態そのものの名前（UI-SPEC §1.3-3 の見出し行 / §1.4-2 のバッジ）。
 * 売れている側は SOLD_RECORDS_LABEL（一覧の状態チップ）と SOLD_BADGE_LABEL（詳細のバッジ）で
 * 語が違うが、出品中側はどこでもこの 1 語なので分けない。
 */
export const LISTING_STATUS_LABEL = '出品中';

/** 出品中の件数（合計行の左の値 A。UI-SPEC §1.2）。状態名と同じ語 */
export const LISTING_COUNT_LABEL = LISTING_STATUS_LABEL;

/** 一覧のメタ行に出す日付の意味づけ（UI-SPEC §1.2「{種別}　M/D 販売 / M/D 出品」） */
export const SOLD_DATE_LABEL = '販売';
export const LISTED_DATE_LABEL = '出品';

/**
 * 並び替えの**方向**（採用案 22b）。日付と金額で語を分ける ──
 * 同じ降順でも、日付なら「新しい」、金額なら「多い」でないと読み違える。
 * 旧メニューの「販売日 ↓」のような矢印は使わない（↓ がどちら向きの意味かを覚えさせない）。
 */
export const SORT_NEWEST_LABEL = '新しい順';
export const SORT_OLDEST_LABEL = '古い順';
export const SORT_LARGEST_LABEL = '多い順';
export const SORT_SMALLEST_LABEL = '少ない順';

/**
 * 出品中を見ているときの並び替え項目名（採用案 22b）。まだ売れていない記録の収支は
 * 行の「売れたら 約◯円」と同じ**見込みの値**なので、確定した収支と同じ語で並べない。
 */
export const EXPECTED_TOTAL_PROFIT_LABEL = `見込みの${TOTAL_PROFIT_LABEL}`;

/** 月バー・期間シートで「月を選んでいない」状態を指す語（UI-SPEC §1.2） */
export const ALL_PERIOD_LABEL = '全期間';

/** 期間シートの見出し（UI-SPEC §1.2）。記録タブ・データタブで同じシートを開く */
export const PERIOD_SHEET_TITLE = '表示する期間';

/**
 * 期間シートの先頭に固定するクイック選択（UI-SPEC §1.2-2）。
 * 「全期間」は月バーと同じ語（ALL_PERIOD_LABEL）を使う ── 選んだ結果が月バーに出るので、
 * ボタンとバーで語が違うと同じものを指していると読めない。
 */
export const THIS_MONTH_LABEL = '今月';
export const LAST_MONTH_LABEL = '先月';

/**
 * 期間シートのカードの注記（UI-SPEC §1.2「期間シート」・案 39b。SPEC-V3 §5.5 の改訂）。
 *
 * カードの下の 1 行は**「いま押せるもう一方」を言う**:
 *   - 未選択 → 「年を押すと1年分」（年見出しが押せることは形からは読めない）
 *   - 年を選択中 → 「月を押すとその月だけ」（年の押し方はもう説明が要らない）
 * 選択中は見出しの下に「1年分を選択中」も出る（状態は見出しの側で言う）。
 *
 * **「今年」「昨年」のクイック選択は足さない** ── 年見出しが 1 タップで同じ場所に届くので、
 * どの画面でもクイック選択は「今月 / 先月 / 全期間」の 3 つに揃う。
 */
export const YEAR_TAP_HINT_LABEL = '年を押すと1年分';
export const MONTH_TAP_HINT_LABEL = '月を押すとその月だけ';
export const YEAR_SELECTED_HINT_LABEL = '1年分を選択中';

/**
 * 月グリッドの凡例（UI-SPEC §1.2-4）。
 * 濃淡の意味を名指しする ── 薄いマスを見た人に理由を自分で埋めさせないため（§8.10.5 と同じ方針）。
 * 未来の月も「記録なし」と同じ薄さで、違いは押せるかどうかだけなので、凡例は 2 項目で足りる。
 */
export const HAS_RECORDS_LEGEND_LABEL = '記録あり';
export const NO_RECORDS_LEGEND_LABEL = '記録なし';

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

// 旧 ENVELOPE_AND_OTHERS_LABEL（「梱包・その他」）は削除した。
// 計算タブの内訳が帯グラフと同じ一覧（costBreakdown.parts）を使うようになり、
// 帯の区画と行が 1 対 1 になったため ── まとめた 1 行には対応する区画も色もない。
// 伝票・レシートのまとめ行は ENVELOPE_AND_OTHERS_FIELD_LABEL のままで、こちらは残る。

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
 * 合計行の収支の見出し（UI-SPEC §1.2）:「この月の収支」/「**2025年の収支**」/「全期間の収支」。
 * 合計なので種別語ではなく中立語（§5.3）。
 *
 * 年だけ「この年」ではなく年そのものを出すのは、月バーの表示（「‹ 2025年 ⌄ ›」）と
 * 同じ語にするため ── 年を選ぶのは「去年 1 年でいくら儲かったか」を見る操作なので、
 * どの年の話かが見出しの側にも要る。月は月バーがすぐ上にあり、「この月」で迷わない。
 */
export function periodProfitLabel(period: Period): string {
  const kind = periodKind(period);
  const subject =
    kind === 'all'
      ? ALL_PERIOD_LABEL
      : kind === 'year'
        ? formatYearTitle(periodYear(period) as number)
        : 'この月';
  return `${subject}の${TOTAL_PROFIT_LABEL}`;
}

/**
 * 月バーの ◀ ▶ の読み上げ語（UI-SPEC §8.10.3 と同じ考え方）。
 * 矢印の形は同じでも動く単位が期間の種類で変わるので、語のほうで何が動くかを言う。
 * 全期間では矢印が無効なので、月の語のままでよい。
 */
export function previousPeriodLabel(period: Period): string {
  return periodKind(period) === 'year' ? PREVIOUS_YEAR_LABEL : '前の月';
}

export function nextPeriodLabel(period: Period): string {
  return periodKind(period) === 'year' ? NEXT_YEAR_LABEL : '次の月';
}

/**
 * 年を送る矢印の読み上げ語。月バーの ◀ ▶（年を選んでいるとき）と、
 * 期間シートのカード見出しの ‹ ›（案 39b）が**同じ語**を使う ──
 * どちらも「表示している年を 1 つ前後に動かす」で、操作の意味が同じ。
 */
export const PREVIOUS_YEAR_LABEL = '前の年';
export const NEXT_YEAR_LABEL = '次の年';

/**
 * 期間そのものの表示語（月バーの中央・絞り込みの注記）:
 * 「全期間」/「2025年」/「2026年8月」。
 */
export function periodTitle(period: Period): string {
  const kind = periodKind(period);
  if (kind === 'all') return ALL_PERIOD_LABEL;
  if (kind === 'year') return formatYearTitle(periodYear(period) as number);
  return formatMonthKeyTitle(period as string);
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

// ─────────────────────────────────────────────────────────────────────────────
// データタブ（UI-SPEC §1.5 / 採用案 7b）の表示語。
//
// 指標セグメントの語（旧 metricLabel =「売上金額」/「収支」）は、指標切替そのものの廃止で
// 参照元がなくなったため削除した（§6-10）。グラフは収支だけになり、売上は合計行が持つ。
// ─────────────────────────────────────────────────────────────────────────────

/** グラフカードの見出し（UI-SPEC §1.5-4）。指標が 1 つになったので固定文言 */
export const PROFIT_TREND_LABEL = `${TOTAL_PROFIT_LABEL}の推移`;

/**
 * 現在の刻み（UI-SPEC §1.5-4）。**表示のみで押せない** ──
 * 刻みは期間から自動で決まり、選ばせる操作ではないため（§5-5）。
 * 単独では出さず、凡例の棒の側の語に組み込む（chartBarLegendLabel）。
 */
const CHART_UNIT_LABELS: Record<ChartUnit, string> = {
  day: '日ごと',
  month: '月ごと',
  year: '年ごと',
};

export function chartUnitLabel(unit: ChartUnit): string {
  return CHART_UNIT_LABELS[unit];
}

/**
 * 凡例の棒の側（UI-SPEC §1.5-4）:「日ごとの収支」/「月ごとの収支」。左軸が表すもの。
 *
 * 刻みの表示（旧・見出しの右）をこの語に畳んである ── 棒が何かを言えば刻みも言えるので、
 * 「日ごと」を 2 か所に出す必要がない。凡例と刻みで別々に場所を取ると、
 * グラフ 1 つに説明が 2 段付くことになる。
 */
export function chartBarLegendLabel(unit: ChartUnit): string {
  return `${chartUnitLabel(unit)}の${TOTAL_PROFIT_LABEL}`;
}

/**
 * 凡例の折れ線の側（UI-SPEC §1.5-4）。右軸が表すもの。
 * 起点は表示中の期間の先頭なので、最後の値は合計行の収支と一致する（logic/analytics 参照）。
 */
export const CUMULATIVE_PROFIT_LABEL = `累計${TOTAL_PROFIT_LABEL}`;

/**
 * 選択中の点の累計（UI-SPEC §1.5-4。案 38b）:「累計 ¥8,720」。
 *
 * 凡例の行が選択中に化ける「値の行」の、藍の見本の隣に出る語。
 * 金額は**常に全桁**（軸の目盛りは千円・万円に丸めているが、こちらは実額）。
 *
 * **未選択のときに最終の累計は出さない** ── 同じ値が集計段の「この月の収支」に出ているため
 * （折れ線の終点＝期間の合計）。同じ数字を 1 画面に 2 回出さない。
 */
export function cumulativeValueLabel(amountText: string): string {
  return `累計 ${amountText}`;
}

/** 選択中の点を外すリンク（UI-SPEC §1.5-5）。点をもう一度押す経路は持たないので語で出す */
export const CLEAR_SELECTION_LABEL = '選択を解除';

/** 選択した点の一覧の見出し（UI-SPEC §1.5-5）:「8月9日の記録　3件」 */
export function selectedPointTitle(dateText: string, count: number): string {
  return `${dateText}の記録　${count}件`;
}

/**
 * グラフカードの下に常設する注記（UI-SPEC §1.5-6）。
 * 刻みが勝手に変わるように見えるのを防ぐため、何を選ぶと何が変わるかを先に書いておく。
 *
 * 「年ごと」も名指しする ── 記録がたまるとある日いきなり棒の意味が変わるので、
 * 起きてから驚くより先に書いておくほうがよい。年数は閾値（36 か月）から導いて二重管理を避ける。
 *
 * **期間に年が加わったので（SPEC-V3 §5.5 の改訂）、「年を選んでも月ごとになる」ことを言う。**
 * 年（12 か月）は閾値のはるか下なので必ず「月ごと」で、「年を選んだのだから年ごとだろう」と
 * 読まれるのを先に外す。「年ごと」になるのは全期間が 3 年ぶんを超えたときだけ、と
 * 括弧の中で場所を限定しているのはそのため。
 */
export const CHART_UNIT_NOTE =
  `年や${ALL_PERIOD_LABEL}を選ぶと刻みが「${CHART_UNIT_LABELS.month}」` +
  `（${ALL_PERIOD_LABEL}で記録が${YEAR_UNIT_MONTH_THRESHOLD / 12}年ぶんを超えると「${CHART_UNIT_LABELS.year}」）に変わり、` +
  `見出しも選んだ期間の語（「〇〇年の${TOTAL_PROFIT_LABEL}」「${ALL_PERIOD_LABEL}の${TOTAL_PROFIT_LABEL}」）になります。`;

// ─────────────────────────────────────────────────────────────────────────────
// 記録フォーム（UI-SPEC §1.3 / 採用案 3c）とレコード詳細（§1.4 / 採用案 3d）の表示語。
// どちらも「販売価格から控除を縦に引いて結果に至る」1 枚の伝票なので、行の語は共通にする。
// ─────────────────────────────────────────────────────────────────────────────

/** 記録フォームのシートヘッダ（UI-SPEC §1.3-2）。中央の見出しは新規と編集で出し分ける */
export const NEW_RECORD_TITLE = '新しい記録';
export const EDIT_RECORD_TITLE = '記録を編集';
export const CANCEL_LABEL = 'キャンセル';
export const SAVE_LABEL = '保存';

/**
 * レコード詳細のメタ行の状態バッジ（UI-SPEC §1.4-2）。
 * 一覧の状態チップ（SOLD_RECORDS_LABEL =「売れた記録」）は絞り込みの対象を指すが、
 * こちらはこの 1 件の状態を指すので「記録」を付けない。
 */
export const SOLD_BADGE_LABEL = '売れた';

/**
 * レコード詳細の状態カードのボタン（UI-SPEC §8.1 / §8.4）。状態を変える唯一の手段（§5-13）。
 *
 * 案 15c でトグル（旧 MARK_AS_SOLD_LABEL =「売れた状態にする」）を廃止し、
 * 状態ごとに 1 個のボタンへ置き換えた。順方向の語がバッジ（SOLD_BADGE_LABEL）と同じ「売れた」
 * になるが、バッジは状態の表示・こちらは操作なので定数を分けておく（§8.8）。
 */
export const MARK_AS_SOLD_BUTTON_LABEL = '売れた';
export const REVERT_TO_LISTING_BUTTON_LABEL = '出品中に戻す';

/**
 * 売れた日の行のラベル（UI-SPEC §8.2）。売れた記録である限り常設する行の見出し。
 * 入力欄の SOLD_DATE_FIELD_LABEL（「販売日」）とは**あえて語を揃えない** ──
 * 行は「いつ売れたか」を読む場所、欄は日付を入れる場所で、役割が違う（§8.8）。
 */
export const SOLD_DATE_ROW_LABEL = '売れた日';

/**
 * 「売れた」を押した直後に出すバーの本文と取り消し（UI-SPEC §8.3）。
 * バーは数秒で消えるので、本文は読み上げ（announceForAccessibility）にも使う。
 */
export const MARKED_AS_SOLD_MESSAGE = '売れた記録にしました';
export const UNDO_LABEL = '元に戻す';

/** 出品中に戻す確認の実行ボタン（UI-SPEC §8.4）。破壊的操作なので「はい」とは言わせない */
export const REVERT_TO_LISTING_CONFIRM_LABEL = '戻す';

/**
 * カレンダーの曜日見出し（UI-SPEC §8.10）。
 * **週の始まりは日曜固定**。ロケールで振らない ── 本アプリは日本語のみ・日本の利用者向け（§0）。
 */
export const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'] as const;

/**
 * カレンダーの今日の印の読み上げ語（UI-SPEC §8.10）。
 * 印そのものは記号（今日 = 点、出品日 = 小さな旗）なので、読み上げにだけ語を出す。
 * 出品日の旗の語は LISTED_DATE_FIELD_LABEL をそのまま使う。
 */
export const TODAY_MARKER_LABEL = '今日';

/** カレンダーを閉じる（日付は押した時点で入るので「決定」ではない） */
export const CLOSE_LABEL = '閉じる';

/**
 * 日付行とカレンダーの上部に常設するチップ（UI-SPEC §8.10.1）。
 *
 * **並びは今日 → 昨日 → 一昨日の固定**で、添字がそのまま今日から遡る日数になる
 * （`RELATIVE_DAY_LABELS[2]` = 2 日前 =「一昨日」）。logic/calendar.ts の dayChips が
 * この並びを日付に変換するので、語と日数の対応をここ以外に置かない。
 *
 * 大半の日付が今日・昨日に偏るのに、ホイールはその多数派にまで回す操作を強いていた（§8.10）。
 * 3 つに絞るのは、4 つ目以降は「何日前か」を数える手間がカレンダーを開くより重くなるため。
 */
export const RELATIVE_DAY_LABELS = ['今日', '昨日', '一昨日'] as const;

/**
 * 年月見出しのボタンの読み上げ語（UI-SPEC §8.10.3）。
 * 見出しそのものは「2026年8月 ▾」だが、押すと何が起きるかは形からは読めない。
 */
export const CHOOSE_MONTH_LABEL = '年月を選ぶ';

/** 商品名の欄（UI-SPEC §1.3-4）。必須であることは欄名ではなくキャプションで示す（SPEC §5.2） */
export const ITEM_NAME_LABEL = '商品名';
export const ITEM_NAME_CAPTION = '商品名（必須）';
export const ITEM_NAME_PLACEHOLDER = '例：えんぴつ';

/** 商品名が空のレコードの表示（一覧・レコード詳細） */
export const UNTITLED_LABEL = '無題';

/**
 * 伝票・レシートで梱包材とその他をまとめた 1 行（UI-SPEC §1.3-10 / §1.4-4）。
 * 計算タブの内訳は帯グラフと同じ項目別の一覧（梱包材・その他は別の行）なので、
 * まとめた語を持つのは伝票・レシート側だけになった。
 */
export const ENVELOPE_AND_OTHERS_FIELD_LABEL = '梱包材・その他';

/** 値の入っていない欄に出す語（UI-SPEC §1.3-10 / §1.4-4。40% グレーで出す） */
export const UNSET_INPUT_LABEL = '未入力';

/** メモ（UI-SPEC §1.3-13 / §1.4-6） */
export const MEMO_LABEL = 'メモ';
export const MEMO_EMPTY_LABEL = 'なし';

/** 日付の欄名（UI-SPEC §1.3-12 / §1.4-2） */
export const LISTED_DATE_FIELD_LABEL = '出品日';
export const SOLD_DATE_FIELD_LABEL = '販売日';

/**
 * 売れた日のカレンダーで**選べない理由**を出す一行（UI-SPEC §8.10）。
 *
 * 淡いマスを見た人が理由を自分で埋めずに済むようにする ── 旧ホイールは選択肢ごと消したため、
 * 「過去に入力した内容しか出てこない」と誤解された。制約（§8.5）をそのまま語にした行。
 */
export function soldDatePickerNote(listedDateText: string): string {
  return `出品（${listedDateText}）より前と、今日より後は選べません`;
}

/**
 * 出品日が未来の記録での一行（UI-SPEC §8.5 派生決定 3）。
 * 選べる範囲が出品日 1 日しかないので、上の言い方では何も説明していないことになる。
 */
export function soldDatePickerSingleDayNote(listedDateText: string): string {
  return `${LISTED_DATE_FIELD_LABEL}（${listedDateText}）だけが選べます`;
}

/**
 * **日付行のチップ**の淡色の理由を出す一行（UI-SPEC §8.10.1 / §8.10.5）。
 *
 * カレンダーの一行（soldDatePickerNote）と別の語にしてあるのは、**行とシートで
 * 淡くなっているものが違う**ため ── シートの盤面には未来の日も並ぶが、チップは
 * 今日・昨日・一昨日の 3 つしかなく、落ちるのは必ず下限（出品日）側だけ。
 * 行に「今日より後は選べません」と書くと、対応する淡いチップが画面になく、
 * 読んだ人は在りもしない選択肢を探すことになる。
 */
export function soldDateChipsNote(listedDateText: string): string {
  return `${LISTED_DATE_FIELD_LABEL}（${listedDateText}）より前は選べません`;
}

/**
 * 売れた日の欄に出す「選べない理由」の一行 2 種（UI-SPEC §8.10）。
 *
 * 記録フォームの販売日とレコード詳細の売れた日で**同じ語**にするため、出し分けをここに置く
 * （画面で組み立てない。§0）。同じ制約の説明が画面ごとに違うと、利用者は別の制約だと読む。
 *
 * `calendar` は盤面用（両端の制約）、`chips` は行のチップ用（下限だけ。上記参照）。
 * 出品日が未来のときだけ、どちらも「出品日だけが選べます」に寄せる ── 選べる日が 1 日しかなく、
 * そこでは「〜より前は選べません」が淡色の説明になっていない（§8.5 派生決定 3）。
 */
export function soldDateNotes(
  saleStartDate: Date,
  today: Date,
): { calendar: string; chips: string } {
  const listedDateText = formatShortDate(saleStartDate);

  if (daysBetween(saleStartDate, today) < 0) {
    const singleDay = soldDatePickerSingleDayNote(listedDateText);
    return { calendar: singleDay, chips: singleDay };
  }

  return {
    calendar: soldDatePickerNote(listedDateText),
    chips: soldDateChipsNote(listedDateText),
  };
}

/**
 * 出品日のカレンダーで選べない理由を出す一行（UI-SPEC §8.10.4）。
 *
 * 出品日には下限がなく、落ちるのは未来だけ（§8.10.1）。売れた日と同じ「一行で名指しする」
 * 扱いをここでも通す ── 欄によって淡いマスの説明が出たり出なかったりすると、
 * 説明のない画面では欠落を不具合と読む。
 */
export const LISTED_DATE_PICKER_NOTE = '今日より後は選べません';

/** レコード詳細の下端操作列（UI-SPEC §1.4-7）と削除の確認アラート（SPEC §5.4） */
export const EDIT_RECORD_LABEL = '編集する';
export const DELETE_LABEL = '削除';
export const DELETE_CONFIRM_TITLE = '削除しますか？';

/** 伝票の控除行の行名（UI-SPEC §1.3-7〜9 / §1.4-4）:「− 送料」 */
export function deductionLabel(name: string): string {
  return `− ${name}`;
}

/** 伝票の加算行の行名（UI-SPEC §1.3-10）:「＋ 梱包材・その他」 */
export function additionLabel(name: string): string {
  return `＋ ${name}`;
}

/** レコード詳細のレシートの手数料行（UI-SPEC §1.4-4）:「販売手数料 (10%)」 */
export function commissionRowLabel(rate: number): string {
  return `${COMMISSION_LABEL} (${rate}%)`;
}

/**
 * 記録フォームの状態切替リンク（UI-SPEC §1.3-3）:「出品中にする」/「売れた記録にする」。
 * 引数は**切り替えた先**の状態。見出し行には今の状態が出ているので、リンクは行き先を名乗る。
 */
export function switchStatusLabel(toSold: boolean): string {
  return `${toSold ? SOLD_RECORDS_LABEL : LISTING_STATUS_LABEL}にする`;
}

/**
 * 日付カードの折りたたみ見出し（UI-SPEC §1.3-12）:「販売日 今日（2026/08/09）」。
 *
 * 畳んだままでも操作対象の日付が読めるようにする（optionalCostsLabel と同じ考え方）。
 * 出す日付は状態によって変わる ── 出品中には販売日がない（SPEC.md §3.2）ため。
 */
export function dateSectionLabel(isSold: boolean, dateText: string): string {
  return `${isSold ? SOLD_DATE_FIELD_LABEL : LISTED_DATE_FIELD_LABEL} ${dateText}`;
}

/** 当日の日付（UI-SPEC §1.3-12）:「今日（2026/08/09）」。判定は呼び出し側（暦日差 0） */
export function todayDateLabel(dateText: string): string {
  return `今日（${dateText}）`;
}

/**
 * 出品中に戻すときの確認（UI-SPEC §8.4）:「販売日 8/10 が消えます。戻しますか？」。
 *
 * 逆方向（売れた → 出品中）だけ確認を挟むのは意図どおり ── 入力済みの日付が消える
 * 破壊的操作で、順方向（今日を入れるだけ・すぐ直せる）とは重さが違う。
 * 日付は M/d（メタ行と同じ形式。呼び出し側で formatShortDate する）。
 */
export function revertToListingConfirmTitle(soldDateText: string): string {
  return `${SOLD_DATE_FIELD_LABEL} ${soldDateText} が消えます。戻しますか？`;
}

/**
 * メモの折りたたみ見出し（UI-SPEC §1.3-13）。
 * 入力済みなら畳んだままでもそれが分かるよう語を変える（optionalCostsLabel と同じ考え方）。
 */
export function memoSectionLabel(memo: string): string {
  return memo === '' ? `${MEMO_LABEL}を書く` : MEMO_LABEL;
}

/**
 * レコード詳細のメタ行（UI-SPEC §1.4-2）:
 *
 *     売却済み: 「不用品 ・ 8/2 出品 → 8/9 販売（7日）」
 *     出品中:   「不用品 ・ 8/2 出品（7日経過）」
 *
 * 出品中は行き先の日付がないので矢印を出さず、経過日数だけを添える。
 * 日数は出品日起算・当日 0 日（§5-2。算出は logic/listingDays.ts）。
 */
export function recordTimelineText(timeline: {
  kind: RecordKind;
  /** 出品日「8/2」 */
  listedDate: string;
  /** 販売日「8/9」。出品中は null */
  soldDate: string | null;
  days: number;
}): string {
  const listed = `${timeline.listedDate} ${LISTED_DATE_LABEL}`;
  const head = `${recordKindLabel(timeline.kind)} ・ ${listed}`;

  return timeline.soldDate == null
    ? `${head}（${formatElapsedDays(timeline.days)}）`
    : `${head} → ${timeline.soldDate} ${SOLD_DATE_LABEL}（${timeline.days}日）`;
}

// ---- UI-SPEC §7 電卓 ----

/** 電卓シートの見出し（§7.1）。行き先の欄の名前をそのまま冠する */
export function calculatorTitle(fieldLabel: string): string {
  return `${fieldLabel}の計算`;
}

/** 合計を欄へ書き戻すボタン（§7.1）。「OK」ではなく行き先が読める語にする */
export const CALC_SUBMIT_LABEL = '入れる';

/** 積み上げた行の合計（§7.1） */
export const CALC_TOTAL_LABEL = '合計';

/**
 * 積み上げの末尾（§7.1-4）。記録フォームの「＋ 梱包材・その他」と同じ形にするため、
 * 「＋ 」は additionLabel が付ける（半角の `+` に振れないよう字を 1 か所に持つ）。
 */
export const CALC_ADD_ROW_LABEL = '行を足す';

/**
 * 積み上げの末尾の中央（SPEC-V3 §4.5 / 設計案 26c）。左「＋ 行を足す」と右「AC」の間。
 * 頭のタグ印はアイコンで出す（PresetTagButton と同じ `pricetag-outline`）ので、語だけを持つ。
 */
export const CALC_PICK_PACKAGING_LABEL = '梱包材から選ぶ';

/**
 * 複数選択シートのヘッダ左（§4.5 / 設計案 26c）。「キャンセル」ではなく**戻り先の名前**にする ──
 * このシートは電卓の上に重なって出るので、閉じると電卓に戻ることが語から読める方がよい。
 * 「‹」はアイコンで出す。
 */
export const CALC_PICKER_BACK_LABEL = '電卓';

/** 複数選択シートの合計行（§4.5-3）。選んだ数を「点」で数える（金額と混ざらない単位） */
export function presetPickedCountLabel(count: number): string {
  return `選択中${count}点`;
}

/** 四則の記号（§7.1）。画面には `*` `/` を出さない */
export const CALC_KEY_MULTIPLY = '×';
export const CALC_KEY_DIVIDE = '÷';

/**
 * 行の中の計算を確定するキー（§7.1 追補）。
 * 行を積み上げる `＋` `−` とは別で、こちらは 1 行の中だけに効く。
 */
export const CALC_KEY_EQUALS = '=';

/** キーパッドの積み上げ記号（§7.2）。行頭に出る記号でもある（calcRowSignLabel） */
export const CALC_KEY_MINUS = '−';
export const CALC_KEY_PLUS = '＋';

/**
 * 訂正（§7.3）。旧 `C` を全消去と 1 手戻すに分けたもの。
 *
 * `AC` は `=` を入れた際にキーパッドから出し（4×4 に 17 個は入らない）、
 * 「＋ 行を足す」と同じ行の右端に置いた。行全体に効く操作なので積み上げの側にある方が近く、
 * `0` の隣で押し間違える心配もなくなる（§7.1 が文字色で避けようとしていた事故）。
 */
export const CALC_KEY_CLEAR_ALL = 'AC';
export const CALC_KEY_BACKSPACE = '⌫';

/** `AC` `⌫` の読み上げ語。字だけでは何が起きるか読めないため */
export const CALC_CLEAR_ALL_A11Y_LABEL = 'すべて消す';
export const CALC_BACKSPACE_A11Y_LABEL = '1 文字消す';

/** 行頭の記号（§7.2）。1 行目にも `＋` を出す（列がそろう。派生決定） */
export function calcRowSignLabel(sign: CalcRowSign): string {
  return sign === '-' ? CALC_KEY_MINUS : CALC_KEY_PLUS;
}

/**
 * 「入れる」が押せない理由を合計行の下に出す 1 行（§7.4）。
 * ボタンがグレーなだけでは理由が分からないため、無効の間だけ名指しする。
 */
export function calculatorBlockedNote(reason: CalcSubmitBlockedReason): string {
  return reason === 'negative'
    ? `${CALC_TOTAL_LABEL}がマイナスのままでは入れられません`
    : '数字を入れると合計が出ます';
}

// ---- SPEC-V3 §1 プリセット ----
//
// 3 種の表示名と、編集シートの保存が無効なときの理由（§3.3）。
// 判定そのものは logic/preset.ts が持ち、ここは理由コードを文言に写すだけ
// （calculatorBlockedNote と同じ分担）。

/** 種類そのものの表示名（§2.1 の見出し）。設定タブの行・一覧・選択シートで共通 */
const PRESET_TYPE_LABELS: Record<PresetType, string> = {
  site: '販売サイト',
  shipping: POSTAGE_LABEL,
  packaging: ENVELOPE_COST_LABEL,
};

export function presetTypeLabel(type: PresetType): string {
  return PRESET_TYPE_LABELS[type];
}

/**
 * 保存が押せない理由を値の欄の下に出す 1 行（§3.3）。
 * ボタンがグレーなだけでは理由が分からない（UI-SPEC §7.4 と同じ方針）。
 *
 * 名前の重複は弾かないので、それを咎める文言はここにない（§1.4）。
 */
export function presetBlockedNote(reason: PresetInvalidReason, type: PresetType): string {
  switch (reason) {
    case 'name-required':
      return '名前を入れてください';
    case 'name-too-long':
      return `名前は${PRESET_NAME_MAX_LENGTH}文字までです`;
    case 'value-out-of-range':
      return isRatePreset(type)
        ? `${COMMISSION_SHORT_LABEL}率は 0〜${PRESET_RATE_MAX} の範囲で入れてください`
        : '金額は 0 以上で入れてください';
    // まとめ買い（§2.6.6）。入数は空・0・上限超え・小数のどれも同じ 1 行で足りる ──
    // 直す先が 1 つの欄しかなく、どう間違えたかを言い分けても打ち直す手は変わらない
    case 'pack-quantity-required':
      return '入数を入れてください';
    case 'pack-price-out-of-range':
      return '購入価格は 0 以上で入れてください';
  }
}

/**
 * タグの保存が押せない理由（SPEC-V4 §1.3）。presetBlockedNote と同じ役割。
 *
 * プリセットと違って**重複を咎める文言がある** ── タグは絞り込みの意味そのもので、
 * 同名が 2 つあると解除バーがどちらのことか言えなくなる（§1.3）。
 */
export function tagBlockedNote(reason: TagInvalidReason): string {
  switch (reason) {
    case 'name-required':
      return '名前を入れてください';
    case 'name-too-long':
      return `名前は${TAG_NAME_MAX_LENGTH}文字までです`;
    // 理由を「CSV の区切りに使うから」まで言わない ── 打ち直す手は変わらない
    case 'name-has-separator':
      return `「${TAG_NAME_SEPARATOR}」は使えません`;
    case 'name-duplicated':
      return '同じ名前のタグがあります';
  }
}

/**
 * バッジの右に出す値（§3.2 の一覧・§3.3 のプレビュー）:「210円」/「9.8円」/「10%」。
 *
 * 金額を roundForDisplay（整数）で丸めない ── まとめ買いの単価は小数第 1 位まで意味を持ち
 * （§2.6.3）、記録に入るのもその値なので、一覧だけ「10円」と出ると
 * **同じプリセットの金額が画面によって違って見える**。末尾の `.0` は出さない。
 */
export function presetValueText(type: PresetType, value: number): string {
  return isRatePreset(type) ? `${value}%` : formatUnitYen(value);
}

// ---- SPEC-V3 §3.1 設定タブ「入力を減らす」 ----

/** 群の見出し（§3.1）。UI-SPEC §1.6-3 の「（今後）」を外した形 */
export const PRESET_SECTION_TITLE = '入力を減らす';

/** 群の下の注記 1 行（§3.1） */
export const PRESET_SECTION_NOTE =
  'よく使う値を登録しておくと、記録するときに選ぶだけで入ります。';

/** 登録件数（§3.1）。カードの中に収まりきらないぶんの数でもある（presetOverflowLabel） */
export function presetCountLabel(count: number): string {
  return `${count}件`;
}

/**
 * カードに出しきれなかった残りの数（設計案 24a）。
 * 「＋3」ではなく件数として読める語にする ── カードの中の他の文字（金額）と並ぶため。
 */
export function presetOverflowLabel(count: number): string {
  return `ほか${presetCountLabel(count)}`;
}

/** 1 件も登録がない種類のカードに出す 1 行（設計案 24a）。一覧の空表示（§3.2）とは別の短い形 */
export const PRESET_CARD_EMPTY_LABEL = 'まだ登録がありません';

// ---- SPEC-V3 §3.2 一覧画面 ----

/** カード末尾の追加行（§3.2-3）:「＋ 送料を追加」。「＋ 」は additionLabel が付ける */
export function presetAddLabel(type: PresetType): string {
  return additionLabel(`${presetTypeLabel(type)}を追加`);
}

/** 空表示（§3.2-4）。EmptyState の見出しと本文 */
export const PRESET_EMPTY_TITLE = '登録がありません';
export function presetEmptyBody(type: PresetType): string {
  return `よく使う${presetTypeLabel(type)}を登録すると、記録するときに選ぶだけで入ります。`;
}

/** 一覧の下の注記（§3.5）。「保存済みの記録は変わらない」は販売サイトの行で 1 度だけ明示する */
export function presetListNote(type: PresetType): string {
  switch (type) {
    case 'site':
      return '選ぶと手数料率が入ります。保存済みの記録の手数料は変わりません。';
    case 'shipping':
      return '選ぶと送料が入ります。実際の料金は各配送サービスの案内で確認してください。';
    case 'packaging':
      return '電卓の中から複数選べます。合計が梱包材の欄に入ります。';
  }
}

/** ヘッダ右の編集モードの切り替え（設計案 25a）。押した先ではなく今の状態から見た行き先を出す */
export const PRESET_EDIT_MODE_LABEL = '編集';
export const PRESET_EDIT_MODE_DONE_LABEL = '完了';

// ---- SPEC-V3 §3.3 追加・編集画面 ----

export function presetFormTitle(type: PresetType, isNew: boolean): string {
  return `${presetTypeLabel(type)}を${isNew ? '追加' : '編集'}`;
}

export const PRESET_NAME_FIELD_LABEL = '名前';

/** 値の欄の見出し（§2.1）。site だけ率で、他は金額 */
export function presetValueFieldLabel(type: PresetType): string {
  return isRatePreset(type) ? `${COMMISSION_SHORT_LABEL}率（%）` : '金額';
}

// ---- SPEC-V3 §2.6 梱包材のまとめ買い（金額の入れ方） ----

/** 2 択の見出し（§2.6.2）。梱包材の金額欄の**上**に出る */
export const PRESET_PRICE_MODE_LABEL = '金額の入れ方';

/** 2 択の中身（§2.6.2）。既定は「1個ずつ」＝ 先頭 */
export const PRESET_PRICE_MODE_OPTIONS = ['1個ずつ', 'まとめ買い'];

/** 入数の欄（§2.6.2）。単位を見出しに入れるのは、行の数値が単位を持たないため（金額と同じ形） */
export const PRESET_PACK_QUANTITY_FIELD_LABEL = '入数（個）';

/** 購入価格の欄（§2.6.2）。電卓を出すのはこの欄だけ */
export const PRESET_PACK_PRICE_FIELD_LABEL = '購入価格';

/** 計算結果の行（§2.6.2）。入力欄ではないので、電卓も付かない */
export const PRESET_UNIT_PRICE_LABEL = '1個あたり';

/**
 * 1 個あたりの表示（§2.6.3）。入数が空・0 のあいだは「—」──
 * 行ごと消すと高さが動く（§2.6.6）。
 */
export function presetUnitPriceText(unitPrice: number | null): string {
  return unitPrice == null ? '—' : formatUnitYen(unitPrice);
}

export const PRESET_COLOR_FIELD_LABEL = 'バッジの色';
export const PRESET_INITIAL_FIELD_LABEL = 'バッジの文字';

/** 頭文字の欄の下の 1 行（§1.2）。空のままでも何が出るかを先に言う */
export const PRESET_INITIAL_NOTE = `名前の先頭が入ります。${PRESET_INITIAL_MAX_LENGTH}文字まで変えられます。`;

/**
 * 編集のときだけ出す注記（設計案 25b）。§1.5 の帰結を、値を書き換える場所で名指しする。
 * 追加のときは出さない（まだ「これまでの記録」がない）。
 */
export function presetEditValueNote(type: PresetType): string {
  return isRatePreset(type)
    ? `${COMMISSION_SHORT_LABEL}率を変えても、これまでの記録の${COMMISSION_SHORT_LABEL}はそのままです。`
    : '金額を変えても、これまでの記録の金額はそのままです。';
}

/** 編集画面の下端（設計案 25b）:「この送料を削除」 */
export function presetDeleteLabel(type: PresetType): string {
  return `この${presetTypeLabel(type)}を削除`;
}

/**
 * 削除の確認（設計案 25c）。**使った記録の件数が数えられて 1 件以上のときだけ出す。**
 *
 * 消えるのは今後の入力候補だけで、記録に写った金額は残る（§1.5）── そこが利用者の
 * いちばんの気がかりなので、件数と「残る」ことを 1 文に入れる。
 */
export function presetDeleteConfirmMessage(type: PresetType, usageCount: number): string {
  return `この${presetTypeLabel(type)}を使った記録が${presetCountLabel(usageCount)}あります。記録とその金額は残り、今後の入力候補から外れます。`;
}

/** 削除したあとの取り消しバー（§3.2）。プリセットは手で作った資産なので記録と同じ扱いにする */
export function presetDeletedMessage(type: PresetType): string {
  return `${presetTypeLabel(type)}を削除しました`;
}

// ---- SPEC-V3 §4 入力時の選択 ----

/**
 * 単一選択シートの見出し（§4.3-1）:「送料を選ぶ」。
 * 行の右端のタグボタン（§4.1）の読み上げ語にも同じ語を使う ── 押すと開くシートの
 * 見出しがそのままボタンの名前になるので、語を分ける理由がない。
 */
export function presetPickerTitle(type: PresetType): string {
  return `${presetTypeLabel(type)}を選ぶ`;
}

/**
 * タグボタンの読み上げに足す今の状態（§4.1 / §1.5.1）。
 *
 * 選択中かどうかは見た目（バッジ・薄いバッジ・タグアイコン）で分かるが、
 * 読み上げには色も濃さも乗らない。ボタンの名前（presetPickerTitle）は押すと起きることの語なので、
 * そちらは変えずに、今どうなっているかは値として別に読ませる。
 */
export function presetTagStateLabel(
  state: 'unselected' | 'selected' | 'rate-changed',
  name: string,
): string | undefined {
  if (state === 'unselected') return undefined;
  return state === 'selected' ? name : `${name}（率は変更ずみ）`;
}

/**
 * 選択シートの空表示（§4.3）。見出しは設定タブのカード（PRESET_CARD_EMPTY_LABEL）と同じ語、
 * 本文は一覧の空表示（presetEmptyBody）と同じ文。同じ「登録がない」状態を、
 * 出てくる場所ごとに違う言い方で説明しない。
 */
export const PRESET_PICKER_EMPTY_TITLE = PRESET_CARD_EMPTY_LABEL;

/**
 * シート末尾のリンク（§4.3-3）。登録があるときは「編集する」、0 件のときは「追加する」。
 * 「▸」を字で持つのは presetAddLabel の「＋」と同じ扱い（記号も表示語のうち）。
 */
export const PRESET_PICKER_EDIT_LINK = '設定で編集する ▸';
export const PRESET_PICKER_ADD_LINK = '設定で追加する ▸';

/**
 * リンクを出せない場所（記録フォーム。RN の Modal の裏に遷移してしまう）での空表示の本文。
 *
 * リンクを落とすだけだと、0 件の人にはどこへ行けば登録できるのかが画面から消える。
 * **押せないリンクの代わりに、行き先を文で名指しする** ── 押せる青字がないので、
 * 反応しないボタンを探させることにはならない。
 */
export function presetPickerEmptyBodyWithoutLink(type: PresetType): string {
  return `${presetEmptyBody(type)}\n設定タブの「${PRESET_SECTION_TITLE}」から追加できます。`;
}

/**
 * 伝票カードの販売サイト名の行の「✕」（§1.5.1）。
 * 消えるのは名前の写しだけで、率は残る ── 読み上げでもそれが分かるよう名前を主語にする。
 */
export function siteNameClearLabel(name: string): string {
  return `${name}を外す`;
}

// ---- SPEC-V4 §2 タグ（設定タブの管理画面） ----
//
// **プリセットの語を流用しない。** 群を分けたのと同じ理由（§2.1）で、
// 「入力を減らす」の語（登録・選ぶと入る）はタグには当てはまらない。
// 件数の「N件」だけは presetCountLabel をそのまま使う ── 数え方の表記まで分ける理由はない。

/** タグそのものの表示名（§2.1 のカード・§2.2 の見出し）。設定タブ・一覧・シートで共通 */
export const TAG_LABEL = 'タグ';

/** 群の見出し（§2.1）。「入力を減らす」とは別の群にする */
export const TAG_SECTION_TITLE = '記録を分類する';

/** 群の下の注記 1 行（§2.1）。プリセットの注記（選ぶと欄に入る）と混ざらないようにする */
export const TAG_SECTION_NOTE =
  '記録にタグを付けておくと、あとから『洋服だけ』のように絞り込めます。';

/**
 * 1 件も登録がないときの設定タブのカードの 1 行（§2.1）。
 * プリセットのカード（PRESET_CARD_EMPTY_LABEL）と同じ語 ── 同じ「まだ無い」状態を、
 * 群ごとに違う言い方で説明しない（PRESET_PICKER_EMPTY_TITLE と同じ扱い）。
 */
export const TAG_CARD_EMPTY_LABEL = PRESET_CARD_EMPTY_LABEL;

/**
 * 一覧カード末尾の追加行（§2.2-3）と空表示のボタン（§2.2-4）:「＋ 追加」。
 * プリセット（「＋ 送料を追加」）と違って種類名を冠さないのは、タグが 1 種類しかなく、
 * 画面の見出しが既に「タグ」だから。
 */
export const TAG_ADD_LABEL = additionLabel('追加');

/** 空表示（§2.2-4）。EmptyState の見出しと本文 */
export const TAG_EMPTY_TITLE = 'タグがありません';
export const TAG_EMPTY_BODY = '記録を追加するときにも作れます。';

/**
 * 一覧の下の注記（§2.2-5）。**削除で消えるのはタグだけ**だと先に言う ──
 * 記録に紐付く（§0.1）ぶん、プリセットより「消したら記録も消えるのでは」と読まれやすい。
 */
export const TAG_LIST_NOTE = 'タグを消しても、記録そのものは消えません。';

/** 一覧の行の削除の読み上げ語（§2.2）。スワイプで出る赤い「削除」に名前を添える */
export function tagDeleteA11yLabel(name: string): string {
  return `${name}を${DELETE_LABEL}`;
}

/**
 * 削除したあとの取り消しバー（§2.2）。
 *
 * **使用件数が 1 件以上のときだけ「記録から外れた」ことを添える** ── 記録から剥がれたことが
 * 取り消しの猶予の間に読めないと、バーが消えてから気付くことになる。
 * 0 件のときに「0 件の記録から外れました」と出しても、外れた先が無いので情報にならない。
 */
export function tagDeletedMessage(name: string, usageCount: number): string {
  const head = `『${name}』を削除しました`;
  return usageCount === 0 ? head : `${head}（${presetCountLabel(usageCount)}の記録から外れました）`;
}

// ---- SPEC-V4 §2.3 追加・編集シート ----

export function tagFormTitle(isNew: boolean): string {
  return `${TAG_LABEL}を${isNew ? '追加' : '編集'}`;
}

/**
 * 名前の欄のキャプション（§2.3-3）。**「（必須）」を付ける** ──
 * タグは名前だけが本体で、空のまま保存できる欄が 1 つも無いことを先に言う。
 */
export const TAG_NAME_FIELD_LABEL = '名前（必須）';

/**
 * 名前が未入力のときにプレビューへ薄く出す語（§2.3-2）。
 * チップの形（色の点 ＋ 名前）を先に見せるためのもので、保存される値ではない。
 */
export const TAG_NAME_PLACEHOLDER = '名前';

/**
 * 色の欄の見出し（§2.3-4）。プリセットの「バッジの色」と語を分けるのは、
 * タグの色が札の地色ではなく**名前の左の点**だから（§0.1）。
 */
export const TAG_COLOR_FIELD_LABEL = '色';

/**
 * 編集画面の下端の削除（§2.3。PresetFormScreen の presetDeleteLabel と同じ形）。
 * 追加のときは出さないので「この」で始めてよい ── 指しているのはいま開いている 1 件。
 */
export const TAG_DELETE_LABEL = `この${TAG_LABEL}を削除`;

/**
 * 削除の確認（§2.3）。**使用件数が 1 件以上のときだけ出す。**
 *
 * 一覧のスワイプ削除は確認を挟まない（§2.2。使用件数が行に出ていて、UndoBar で戻せる）が、
 * **編集画面からの削除は押した先で前の画面に戻るので、取り消しの口をその場に置けない。**
 * 押し切る前に「何件から外れるか」を言えるのはここだけなので、プリセット（設計案 25c）と
 * 同じ条件で 1 枚だけ出す。
 *
 * 言うのは tagDeletedMessage と同じ 2 つ ── 記録は残ること、外れるのはタグだけであること。
 */
export function tagDeleteConfirmMessage(usageCount: number): string {
  return `このタグが付いた記録が${presetCountLabel(usageCount)}あります。記録は残り、このタグだけが外れます。`;
}

// ---- SPEC-V4 §3 入力（記録フォームのタグの節・選択シート） ----

/**
 * 記録フォームのタグの節の「＋ 追加」の読み上げ語（§3.1）。
 * 見出しの右のリンクなので、押した先が**選ぶ面**であることは語だけでは読めない。
 */
export const TAG_PICKER_OPEN_LABEL = 'タグを選ぶ';

/**
 * タグの節に 1 件も付いていないとき（§3.1 の改訂）。
 * 設定タブの「まだ登録がありません」（TAG_CARD_EMPTY_LABEL）とは**別の語** ──
 * あちらは「タグそのものが 1 つも無い」、こちらは「この記録に付いていない」で、
 * 次にすることが違う（こちらは見出しの右の「＋ 追加」から選ぶ）。
 */
export const TAG_FIELD_EMPTY_LABEL = 'まだ付いていません';

/**
 * 選択シートの検索欄（§3.2-2）。**「探す」だけでなく「作る」まで言う** ──
 * ここが新規作成の入口（§3.2-3）を兼ねていることは、打ち始めるまで画面に出ない。
 */
export const TAG_PICKER_SEARCH_PLACEHOLDER = 'タグを探す・作る';

/**
 * 検索語に完全一致する既存タグが無いときだけ先頭に出る行（§3.2-3）。
 * 「＋」を字で持つのは TAG_ADD_LABEL（additionLabel）と同じ扱い ── 記号も表示語のうち。
 */
export function tagCreateLabel(name: string): string {
  return `＋『${name}』を作る`;
}

/**
 * シート右上の「完了」（§3.2-1）。選択はチェックした瞬間にフォームへ反映されるので、
 * これは確定ではなく**閉じる**ボタン。プリセットの編集モードの「完了」と同じ語でよい
 * （どちらも「この面での操作を終える」の意）。
 */
export const TAG_PICKER_DONE_LABEL = PRESET_EDIT_MODE_DONE_LABEL;

/**
 * シート末尾のリンク（§3.2-5）。行き先はプリセットとは別（設定タブのタグ一覧）だが、
 * **語は同じ**にする ── 同じ「設定へ行って直す」動きを、シートごとに違う言い方で出さない。
 * 記録フォームから開いたときは出さない（RN の Modal の裏に遷移してしまうため）。
 */
export const TAG_PICKER_EDIT_LINK = PRESET_PICKER_EDIT_LINK;

/**
 * 1 件も登録がないときの選択シートの本文（§3.2）。一覧の空表示（TAG_EMPTY_BODY）と
 * 語を分けるのは、**ここには作る場所が既にある**から ── 「記録を追加するときにも作れます」は、
 * まさにその記録フォームの上で読むと行き先の分からない案内になる。
 */
export const TAG_PICKER_EMPTY_BODY = '上の欄に名前を入れると、その場で作れます。';

// ---- SPEC-V4 §3.4 レコード詳細のタグ ----

/**
 * 詳細画面のタグの節の見出し（設計案 32b）。メモと同じ「補足」の並びに置くので、
 * メモ（MEMO_LABEL）と同じ形の見出しを付ける ── 見出しの無いカードが 1 枚だけ挟まると、
 * 何のカードなのかがチップの中身からしか読めない。
 */
export const TAG_SECTION_LABEL = TAG_LABEL;

// ---- SPEC-V4 §4 絞り込み（記録タブの合計行・シート・解除バー） ----
//
// 語は 1 つの動き（「絞り込む」）から派生させる。チップ・シートの見出し・空表示のリンクが
// 別々の言い方をすると、同じ 1 つの条件を指していることが画面から読めなくなる。

/** 合計行のチップ・シートの見出し（§4.1 / §4.2） */
export const FILTER_LABEL = '絞り込み';

/**
 * 合計行のチップ（§4.1）。N は**効いている条件の本数**（決定 §9-2）。
 * 0 のときは「絞り込み」だけ ── 「絞り込み 0」は「0 件」と読み違えられる。
 */
export function filterChipLabel(count: number): string {
  return count === 0 ? FILTER_LABEL : `${FILTER_LABEL} ${count}`;
}

/** シート左上（§4.2-1）。効くのは 3 条件だけで、期間・検索・並び替えは動かない */
export const FILTER_CLEAR_ALL_LABEL = 'すべて解除';

/** 解除バー右端（§4.3）。「すべて解除」と同じことをするが、1 行に収めるので短い語にする */
export const FILTER_CLEAR_LABEL = '解除';

/**
 * シート右上（§4.2-1）。条件は選んだ瞬間から効くので、これは確定ではなく**閉じる**ボタン
 * （タグの選択シートの「完了」と同じ意味・同じ語）。
 */
export const FILTER_DONE_LABEL = TAG_PICKER_DONE_LABEL;

/** シートの節の見出し（§4.2-2〜4）。販売サイト・タグは既にある語をそのまま使う */
export const FILTER_KIND_SECTION_LABEL = '種別';
export const FILTER_SITE_SECTION_LABEL = presetTypeLabel('site');
export const FILTER_TAG_SECTION_LABEL = TAG_LABEL;

/** 販売サイトを選んでいないときに節の右に出す語（§4.2-3）。種別の「すべて」と同じ語 */
export const FILTER_ALL_LABEL = 'すべて';

/** 解除バーの販売サイトの部分（§4.3）。名前だけでは何の名前か読めないので種類まで言う */
export function filterSitePartLabel(name: string): string {
  return `${FILTER_SITE_SECTION_LABEL}「${name}」`;
}

/**
 * 解除バーのタグの部分（§4.3）。2 つ以上は「タグ「洋服」ほか1件」と畳む ──
 * 全部並べると 1 行に収まらない。件数の表記は presetCountLabel と揃える。
 */
export function filterTagPartLabel(name: string, extraCount: number): string {
  const head = `${TAG_LABEL}「${name}」`;
  return extraCount === 0 ? head : `${head}${presetOverflowLabel(extraCount)}`;
}

/**
 * 絞り込み中の青い行の文（§4.3。案 34a で改訂）。条件を「・」で連ねて
 * 「…の N件だけ」で閉じる。「・」で連ねられるのは、タグ名に「・」を使えないから（§1.3 / §5.2）。
 *
 * **旧「…で絞り込み中」から末尾だけを差し替えた。** 件数の行（リスト上の「N 件」）は
 * 絞り込み中には出さない交代制にしたので（案 34a-D）、その数をこの文が引き取る ──
 * 同じ数を 2 か所に出さないため。条件の並べ方は変えていない（filterSummaryText のまま）。
 */
export function filterSummaryLabel(parts: string[], count: number): string {
  return `${parts.join('・')}の${presetCountLabel(count)}だけ`;
}

/**
 * 下部の見出しと値（§4.2-5 / §4.6）。検索語は含まない条件での件数。
 *
 * **語と数を分けて持つ**のは、下部が左右に分かれた 1 行だから（設計案 30b）──
 * 左に見出し・右に数を置き、数だけを太字にする。1 本の文にすると、条件を触るたびに
 * 動く数字が文の途中で伸び縮みして、目で追う位置が定まらない。
 *
 * **見出しは状態で変わる**（案 35c）。出品中で開くと販売サイトの節ごと消えるので（§4.2）、
 * 数えている対象も「出品中の記録」に変わる ── 節が無い理由の説明文は置かず、
 * 下部の語が対象を言う方を採る（無い欄の理由を読ませるより、無いまま短い方が迷わない）。
 */
export function matchingRecordLabel(isSoldMode: boolean): string {
  return isSoldMode ? 'この条件に合う記録' : `この条件に合う${LISTING_COUNT_LABEL}の記録`;
}

export function matchingRecordCountValue(count: number): string {
  return presetCountLabel(count);
}

/**
 * 該当 0 件のときに下部の帯へ足す 2 行目（§4.2.3 / 案 35e）。
 *
 * **数字だけだと原因（月・条件・不具合）の区別がつかない。** 0 という数字は
 * 「月のせい」と読まれやすいので、月名を文に入れて**期間もこの結果に効いている**ことを示す。
 * 全期間を選んでいるときは月名を出せないので、期間に触れない形に落とす。
 *
 * **条件の名前は出さない。** §4.8 が「条件ごとの文言を作らない」と決めたのは、
 * 組み合わせで文言が爆発するため ── 月名と**本数**だけなら、その決定を破らずに原因を示せる。
 * 解除の口も足さない（ヘッダの「すべて解除」1 つに限る）。
 *
 * **条件が 0 本なら null**（2 行目ごと出さない）── 「この0つが揃った記録がありません」は
 * 文として壊れているうえ、条件 0 本で 0 件なら**原因は期間しかない**。この画面で言えることが
 * 無いので、記録タブに戻って出る「この期間の記録はありません」（§4.8）に受け持たせる。
 *
 * `monthTitle` は月バーと同じ書式（formatMonthTitle）。全期間なら null。
 * `conditionCount` は効いている条件の本数（activeFilterCount）。
 */
export function filterNoMatchNote(
  monthTitle: string | null,
  conditionCount: number,
): string | null {
  if (conditionCount === 0) return null;
  const conditions = `この${conditionCount}つが揃った記録がありません。`;
  return monthTitle == null ? conditions : `${monthTitle}には、${conditions}`;
}

/**
 * タグの節の下に置く 1 行（§4.4 の OR を言葉で説明する。設計案 30b）。
 *
 * **「OR」とは書かない。** 2 つ選んだときに何が起きるかを結果の側から言う ──
 * 選ぶ前に読んでも意味が分かる語にしないと、注記が「選んだ後に読む言い訳」になる。
 */
export const FILTER_TAG_OR_NOTE = '2つ以上選ぶと、どれかが付いた記録が出ます。';

/**
 * 絞り込みで 0 件になったときの空表示（§4.8 / 決定 §9-13）。
 * **条件ごとの文言を作らない** ── 効き得る条件が 6 つに増え、組み合わせで文言が爆発する。
 */
export const FILTER_EMPTY_TITLE = '条件に合う記録がありません';
export const FILTER_EMPTY_ACTION_LABEL = `${FILTER_LABEL}を解除`;

/** 絞り込みが 0 件で、かつ記録も 0 件のとき（§4.8）。従来どおりの追加への導線 */
export const NO_RECORDS_EMPTY_TITLE = 'この期間の記録はありません';
export const NO_RECORDS_EMPTY_BODY = '左下の ＋ を押すと記録できます';

/**
 * 販売サイトの候補が 0 件のとき（§4.2）。候補は**記録に実在する名前**なので、
 * プリセットを登録しても増えない ── 行き先はプリセットではなく記録の側だと言う。
 */
export const FILTER_SITE_EMPTY_TITLE = `${FILTER_SITE_SECTION_LABEL}がありません`;
export const FILTER_SITE_EMPTY_BODY = '記録に販売サイトを入れると、ここから選べます。';

/**
 * タグの登録が 0 件のとき（§4.2.3 / 案 35d）。カードの中に 2 行で出す。
 * 見出しは一覧の空表示と同じ語（TAG_EMPTY_TITLE）── 同じ「1 件もない」を場所ごとに言い分けない。
 *
 * **設定への導線は置かない。** この画面に来た用は「今ある記録を絞ること」で、設定へ飛ぶと
 * 用が中断するうえ、戻り道が記録タブではなく設定になる。記録フォーム側の選択シート（§3.2）には
 * 「設定で編集する ▸」があるが、あちらは**タグを作る・直す場所**で用が違うので揃えない。
 * 代わりに**どこで作れるか**だけを言う（行き先を指さずに、次に開く画面で目に入る場所を教える）。
 */
export const FILTER_TAG_EMPTY_TITLE = TAG_EMPTY_TITLE;
export const FILTER_TAG_EMPTY_BODY =
  'タグは記録するときに、品名の下から作れます。付けたタグはここに並びます。';

/** タグの節の見出しの右（案 35a）。§4.4 の OR を、選ぶ前に読んで分かる言い方で置く */
export const FILTER_TAG_OR_HINT = 'どれかが付いた記録が出ます';

/** タグの検索欄（案 35f）。記録フォーム側と違い**作れない**ので「探す」だけ */
export const FILTER_TAG_SEARCH_PLACEHOLDER = 'タグを探す';
export const FILTER_TAG_SEARCH_CANCEL_LABEL = 'キャンセル';

/**
 * タグの節の見出し「タグ（32件）」（案 35a）。**登録件数**であって選択数ではない。
 * 0 件のときは件数を書かない ── 「タグ（0件）」は、下のカードの「タグがありません」と
 * 同じことを 2 度言うだけになる。
 */
export function filterTagSectionLabel(totalCount: number): string {
  return totalCount === 0 ? FILTER_TAG_SECTION_LABEL : `${FILTER_TAG_SECTION_LABEL}（${presetCountLabel(totalCount)}）`;
}

/**
 * 検索で絞った一覧の下（案 35f）。「32件のうち2件が該当」。
 * **絞り込みの条件ではなく一覧の見え方の話**なので、下部の件数とは別の語にする。
 */
export function filterTagSearchResultLabel(totalCount: number, matchedCount: number): string {
  return `${presetCountLabel(totalCount)}のうち${presetCountLabel(matchedCount)}が該当`;
}

/**
 * 検索して 0 件のとき（案 35f）。カードの中に出す。
 *
 * 2 行目を出すのは、**検索で選択中のタグが画面から隠れる**ため ──
 * 見えていないものが効いている状態は、言わないと「外れた」と読まれる。
 * 選んでいるタグが無いときは 2 行目ごと出さない（言うことがない）。
 */
export function filterTagSearchEmptyTitle(keyword: string): string {
  return `「${keyword}」に合うタグがありません`;
}

/**
 * 上の 2 行目。名前は**先頭の 1 つと残りの数**に畳む（解除バーの filterTagPartLabel と同じ作法）
 * ── 全部並べると、選び方によっては 1 行に収まらない。
 */
export function filterTagSearchEmptyBody(selectedNames: readonly string[]): string | null {
  if (selectedNames.length === 0) return null;
  const head = selectedNames[0];
  const names =
    selectedNames.length === 1 ? head : `${head}${presetOverflowLabel(selectedNames.length - 1)}`;
  return `選んでいるタグ（${names}）は、そのまま効いています。`;
}

// ---- UI-SPEC §1.6-4 データ群 / §1.6-5 フッタ ----

export const DATA_SECTION_TITLE = 'データ';

/**
 * CSV 書き出し（SPEC-V3 §5.6）。**Step 6 で活性化した**ので「準備中」は付かない。
 * 定数そのものは残す ── 他に「準備中」で置いてある行が出たときに語が割れないようにする。
 */
export const CSV_EXPORT_LABEL = '書き出し（CSV）';
export const PREPARING_LABEL = '準備中';

/** 記録の件数（UI-SPEC §1.6-4）。値は presetCountLabel と同じ「N件」 */
export const RECORD_COUNT_LABEL = '記録の件数';

/** 設定タブ最下部のバージョン表記（UI-SPEC §1.6-5） */
export function versionLabel(version: string): string {
  return `バージョン ${version}`;
}

// ---- SPEC-V3 §5 CSV 書き出し ----
//
// **列名は画面の語をそのまま使う**（§5.3）── 会計ソフトの語（「利用日」「利用内容」）に
// 改めることはしない。取込側は列を選ぶだけなので一致している必要がなく、
// 画面と食い違うと書き出した CSV とアプリの対応が読めなくなる。
// だから下の 2 つの配列は**リテラルを並べず、上で定義済みの表示語を並べる**。

/** 経費合計の列（§5.3-9）。単独の「経費」と区別が要るのは CSV だけなのでここに置く */
export const TOTAL_EXPENSES_COLUMN = `${EXPENSES_LABEL}合計`;

/** 手数料率の列（§5.3-11）。額の列（販売手数料）と紛れないよう単位を付ける */
export const COMMISSION_RATE_COLUMN = `${COMMISSION_SHORT_LABEL}率(%)`;

/** 種別の列（§5.3-13）。値は recordKindLabel */
export const RECORD_KIND_COLUMN = '種別';

/** 状態の列（§5.3-15）と、その 2 値 */
export const RECORD_STATUS_COLUMN = '状態';
export const CSV_SOLD_STATUS_VALUE = SOLD_BADGE_LABEL;
export const CSV_LISTING_STATUS_VALUE = LISTING_STATUS_LABEL;

/** 記録 ID の列（§5.3-18）。再書き出し時の突き合わせ用 */
export const RECORD_ID_COLUMN = '記録ID';

/**
 * タグの列の区切り（SPEC-V4 §5.2）。**タグ名で使えない 1 文字**を予約してある（§1.3）ので、
 * エスケープを設計せずに 1 セルへ並べられる。
 */
export const CSV_TAG_SEPARATOR = TAG_NAME_SEPARATOR;

/**
 * データ保存用の 18 列（§5.3 ＋ SPEC-V4 §5.3）。
 * 並びは **先頭 3 列（販売日 / 商品名 / 販売価格）→ 内訳 → 計算値 → 属性 → メモ → 記録ID**（§5.2）。
 * 先頭 3 列が固定なのは、会計ソフトの取込ウィザードで先頭数列だけ選べば済むようにするため。
 */
export const CSV_BACKUP_COLUMNS: readonly string[] = [
  SOLD_DATE_FIELD_LABEL,
  ITEM_NAME_LABEL,
  SALES_PRICE_LABEL,
  PURCHASE_PRICE_LABEL,
  POSTAGE_LABEL,
  COMMISSION_LABEL,
  ENVELOPE_COST_LABEL,
  OTHERS_COST_LABEL,
  TOTAL_EXPENSES_COLUMN,
  TOTAL_PROFIT_LABEL,
  COMMISSION_RATE_COLUMN,
  presetTypeLabel('site'),
  RECORD_KIND_COLUMN,
  TAG_LABEL,
  RECORD_STATUS_COLUMN,
  LISTED_DATE_FIELD_LABEL,
  MEMO_LABEL,
  RECORD_ID_COLUMN,
];

/**
 * 確定申告用の 11 列（§5.3.1）。**帳簿の並び**にする ──
 * 国税庁が求める「取引の年月日・相手方の名称・内容・金額」の順で、
 * 購入者が匿名なので「相手方」は販売サイト名で代用する。
 *
 * **経費は合算せず項目ごとに分ける**（送料 / 梱包材 / その他 / 販売手数料）── 帳簿は
 * 経費を「項目に区分して」記載することを求めており、合算した 1 列では材料にならない。
 * 経費合計の列は置かない（項目の和なので表計算で作れる）。
 * 収支は検算用に残す。**メモとタグは出さない**（帳簿に関係がなく、個人的な記述が混ざる）。
 */
export const CSV_TAX_COLUMNS: readonly string[] = [
  SOLD_DATE_FIELD_LABEL,
  presetTypeLabel('site'),
  ITEM_NAME_LABEL,
  RECORD_KIND_COLUMN,
  SALES_PRICE_LABEL,
  PURCHASE_PRICE_LABEL,
  POSTAGE_LABEL,
  ENVELOPE_COST_LABEL,
  OTHERS_COST_LABEL,
  COMMISSION_LABEL,
  TOTAL_PROFIT_LABEL,
];

/** 日ごとにまとめた行の種別（§5.2.2）。同じ種別だけなら種別名が入る */
export const CSV_KIND_MIXED_LABEL = '混在';

/**
 * 日ごとにまとめた行の販売サイト（§5.2.2）:「メルカリ ほか1件」。
 * **数えるのは名前の種類**（同じサイトが 3 件でも「ほか」は付かない）。
 * 名前が 1 つも無ければ空文字 ── 未設定の記録だけの日に語を足さない（§5.4「空値は空文字」）。
 */
export function csvDaySiteNames(siteNames: readonly string[]): string {
  const unique = [...new Set(siteNames.filter((name) => name !== ''))];
  if (unique.length === 0) return '';
  if (unique.length === 1) return unique[0];
  return `${unique[0]} ${presetOverflowLabel(unique.length - 1)}`;
}

/**
 * 日ごとにまとめた行の商品名（§5.2.2）:「えんぴつ ほか2件」。
 * **こちらは記録の件数**で数える（同じ商品名が 3 件なら「ほか2件」）── 何件ぶんの
 * 金額が 1 行に入っているかが読めるようにするため。空の商品名は一覧と同じ「無題」。
 */
export function csvDayItemNames(itemNames: readonly string[]): string {
  if (itemNames.length === 0) return '';
  const head = itemNames[0] === '' ? UNTITLED_LABEL : itemNames[0];
  if (itemNames.length === 1) return head;
  return `${head} ${presetOverflowLabel(itemNames.length - 1)}`;
}

/** ファイル名の先頭（§5.4）。種類で変える ── 後から見て何の書き出しか読めるように */
export const CSV_FILE_BASE_NAMES: Record<'backup' | 'tax', string> = {
  backup: '売上記録',
  tax: '確定申告',
};

/** ファイル名の期間の部分（全期間のときだけ期間キーが無い） */
export const CSV_ALL_PERIOD_FILE_LABEL = ALL_PERIOD_LABEL;

// ---- SPEC-V3 §5.7 書き出しシート（ExportSheet） ----

/** シートの見出し。設定タブの行と同じ語（押した先が同じものだと読める） */
export const EXPORT_SHEET_TITLE = CSV_EXPORT_LABEL;

/** ヘッダ左。書き出さずに閉じる（§5.7） */
export const EXPORT_CANCEL_LABEL = 'キャンセル';

/** 節の見出し（§5.7 の並び: 種類 → 期間 → まとめ方 → 対象） */
export const EXPORT_KIND_SECTION_LABEL = '種類';
export const EXPORT_PERIOD_SECTION_LABEL = '期間';
export const EXPORT_GROUPING_SECTION_LABEL = 'まとめ方';
export const EXPORT_TARGET_SECTION_LABEL = '対象';

/** 種類の 2 択（§5.2 の改訂）。既定は先頭（データ保存用） */
export const EXPORT_KIND_OPTIONS: readonly { value: 'backup' | 'tax'; label: string }[] = [
  { value: 'backup', label: 'データ保存用' },
  { value: 'tax', label: '確定申告用' },
];

/** 種類の節の下の 1 行。選んでいる方が何のためのものかを言う（列の一覧までは出さない） */
export const EXPORT_KIND_NOTES: Record<'backup' | 'tax', string> = {
  backup: 'メモやタグも含めて、記録した内容をすべて書き出します。バックアップにも使えます。',
  tax: '帳簿に要る列だけを書き出します。メモとタグは出しません。',
};

/** まとめ方の 2 択（§5.2.2）。**確定申告用のときだけ出す** */
export const EXPORT_GROUPING_OPTIONS: readonly { value: 'record' | 'day'; label: string }[] = [
  { value: 'record', label: '1件ずつ' },
  { value: 'day', label: '日ごとにまとめる' },
];

/** まとめ方の節の下の 1 行 */
export const EXPORT_GROUPING_NOTES: Record<'record' | 'day', string> = {
  record: '1行に1件ずつ書き出します。',
  day: '同じ日の記録を1行に合算します。商品名は「えんぴつ ほか2件」の形になります。',
};

/**
 * 対象の 2 択（§5.5-3）。既定は「売れた記録のみ」（決定 §8-9）──
 * 申告も集計も確定した金額しか扱わないため。
 */
export const EXPORT_TARGET_OPTIONS: readonly { value: boolean; label: string }[] = [
  { value: false, label: `${SOLD_RECORDS_LABEL}のみ` },
  { value: true, label: `${LISTING_STATUS_LABEL}も含める` },
];

/** 実行ボタン（§5.7）。**期間シートと違い確定ボタンを置く**（取り消せない操作なので） */
export const EXPORT_SUBMIT_LABEL = '書き出す';

/**
 * 下端の左（§5.7）:「2026年8月・売れた記録」。期間名は月バーと同じ書式（periodTitle）。
 * **押す前に何が出るかを読ませる行**なので、効いている条件をそのまま並べる。
 */
export function exportSummaryLabel(period: Period, includeListing: boolean): string {
  const target = includeListing
    ? `${SOLD_RECORDS_LABEL}と${LISTING_STATUS_LABEL}`
    : SOLD_RECORDS_LABEL;
  return `${periodTitle(period)}・${target}`;
}

/**
 * 下端の右（§5.7）:「12件」/ 日ごとにまとめたときは「12件（5行）」。
 * **件数は記録の数**で、行数はファイルの行の数 ── まとめると行の方が少なくなるので、
 * 変わったことがその場で読めるように両方出す。同じ数のときは括弧を出さない。
 */
export function exportCountLabel(recordCount: number, rowCount: number): string {
  const count = presetCountLabel(recordCount);
  return rowCount === recordCount ? count : `${count}（${rowCount}行）`;
}

/**
 * 対象が 0 件のとき、ボタンの上に出す 1 行（§5.7）。
 *
 * **切り替えれば書き出せることを示す。** 「0件」とだけ出すと、期間の選び直しか
 * 対象の切り替えか、どちらで直るのかが読めない。出品中の記録が 1 件も無いときは
 * 2 文目を足さない（言うことがない）。
 */
export function exportEmptyNote(listingCount: number): string {
  const head = 'この期間に対象の記録がありません。';
  if (listingCount === 0) return head;
  return `${head}${LISTING_STATUS_LABEL}の記録は${presetCountLabel(listingCount)}あります。`;
}

/**
 * 確定申告用を選んだときにシートの中へ出す注意書き（§5.8）。**固定表示で、消す動きは持たない。**
 *
 * 「不用品なら非課税」と読み切られると、課税対象のものを申告から落とす事故になる。
 * **押すとヘルプの「確定申告に使うときの注意」が開く**（UI-SPEC Step 6 で繋いだ）。
 */
export const EXPORT_TAX_NOTICE =
  '不用品でも、課税対象になる場合があります。書き出したあとで仕分けてください。';

/** 上のバナーが押せることを読み上げに足す語（見た目のシェブロンだけでは伝わらないため） */
export const EXPORT_TAX_NOTICE_OPEN_LABEL = '詳しい説明を開く';

// ---- SPEC-V3 §5.9 プレビュー（案 `40a` ＋ `40c`） ----

/** シートの中のカードの見出し（案 `40a`）。「プレビュー」ではなく**何の表かを言う** */
export const EXPORT_PREVIEW_CARD_TITLE = '書き出す表';

/** 全画面（案 `40c`）のヘッダ */
export const EXPORT_PREVIEW_SCREEN_TITLE = 'プレビュー';

/**
 * カード見出しの右（案 `40a`）:「先頭3行・全18列」。
 * **行数が先、列数が後。** 見えているもの（3 行）を先に言い、見えていないもの（列）を後に置く。
 * 出す行が 3 行に満たないときは実際の数を出す（「先頭3行」と出て 2 行しか無いと数が食い違う）。
 */
export function exportPreviewMetaLabel(shownRows: number, columnCount: number): string {
  return `先頭${shownRows}行・全${columnCount}列`;
}

/** 表の下の 1 行（案 `40a`）。横スクロールできることは形からは読めないので語で言う */
export const EXPORT_PREVIEW_SCROLL_HINT = '横に動かすと残りの列が見えます';

/** カードを押すと全画面が開くことの読み上げ語（見た目は右端の `›`） */
export const EXPORT_PREVIEW_OPEN_LABEL = '全部見る';

/** 全画面の下端のボタン（案 `40c`）。行き先を名指しする（「閉じる」とは言わない） */
export const EXPORT_PREVIEW_BACK_LABEL = 'シートに戻る';

/**
 * 全画面の上の行の右（案 `40c`）:「全11列・8件（4行）」。
 * 左は `exportSummaryLabel`（期間と対象）で、シートの下端と同じ語を使う ──
 * 同じ書き出しを指しているので、画面が変わっても読む値が変わらないようにする。
 */
export function exportPreviewScreenMetaLabel(
  columnCount: number,
  recordCount: number,
  rowCount: number,
): string {
  return `全${columnCount}列・${exportCountLabel(recordCount, rowCount)}`;
}

/** 共有シートが使えない端末（§5.6）。書き出しの経路が共有シートしかないので、押した後に出る */
export const EXPORT_SHARING_UNAVAILABLE = 'この端末では共有シートを開けませんでした。';

/** 書き出しに失敗したとき（§5.6）。原因は端末側なので、言えるのは「できなかった」まで */
export const EXPORT_FAILED_MESSAGE = '書き出せませんでした。もう一度お試しください。';

/** 共有シートの見出し（Android / Web のみ表示される。expo-sharing の dialogTitle） */
export const EXPORT_SHARE_DIALOG_TITLE = CSV_EXPORT_LABEL;

// 状態カードの補足行（旧 statusCardTimelineText。UI-SPEC §8.9）は**置かない**。
// §8.9 が実装時送りにしていた重複の整理を、実機で見て「補足行を落とす」と決めたため ──
// 補足行はメタ行（recordTimelineText）から種別を抜いただけの同じ事実で、短いレコードでは
// 両方が同時に画面へ入って同じ日付を 2 度読ませていた。状態カードに残すのはバッジだけ。

// ---- SPEC-V5 商品写真（案 `41a`） ----
//
// 語は「写真」1 つで通す。「画像」「イメージ」を混ぜない ── 撮ってきた 1 枚のことを指すので、
// 記録フォーム・詳細・読み上げのどこでも同じ呼び方にする。

/**
 * 写真そのものを指す語（SPEC-V5 §3.1）。読み上げ語の組み立てにも使う。
 * **見出しの行は持たない** ── 欄は商品名の左の正方形 1 つに畳んだ（§3.1）。
 */
export const PHOTO_FIELD_LABEL = '写真';

/** 写真が無いときに枠の中へ小さく出す語（§3.1）。破線の枠と対で「押せる場所」を示す */
export const PHOTO_SQUARE_LABEL = PHOTO_FIELD_LABEL;

/** 写真が無いときにフォームの欄へ出す誘い（§3.1）。押すとカメラロールが開く */
export const PHOTO_ADD_LABEL = '写真を選ぶ';

/** 枠を押したときの動き（§3.1）。見た目の語ではなく読み上げ語として使う */
export const PHOTO_REPLACE_LABEL = '変更';

/** 枠の右上の「✕」の読み上げ語（§3.1）。消えるのは記録ではなく写真 */
export const PHOTO_REMOVE_LABEL = '削除';

/**
 * 詳細画面で商品名の行の下に出す 1 行（§2.1）。**押せることを語で言う** ──
 * 画像そのものには押せる印が付かないので、形からは読み取れない。
 * 写真が無いときは出さない（押す対象がない）。
 */
export const PHOTO_TAP_HINT = '写真を押すと全画面で見られます';

/**
 * 詳細画面に写真が無いときの 1 行（§2.2 / 決定 §6-4）。**リンクだけを小さく出す。**
 * 枠付きの大きな置き場所にすると、写真の無い記録（多数派）で毎回追加を促すことになる。
 */
export const PHOTO_ADD_FROM_DETAIL_LABEL = '写真を追加';

/** 全画面表示の閉じる（§2.1）。読み上げ用で、見た目は「✕」 */
export const PHOTO_VIEWER_CLOSE_LABEL = '閉じる';

/** 一覧のサムネイル・詳細の写真の読み上げ語（§2.3）。商品名は呼び出し側が前に付ける */
export const PHOTO_IMAGE_LABEL = '商品写真';

/** 写真の無い行のサムネイル枠の読み上げ語（§2.3）。枠が「押せる何か」に見えないようにする */
export const PHOTO_EMPTY_LABEL = '写真なし';

/**
 * 写真へのアクセスを拒否されたとき（§3.3）。**「設定を開く」の口と対で出す** ──
 * アプリの中では直せないので、どこへ行けば直せるかまで言わないと詰む。
 */
export const PHOTO_PERMISSION_DENIED_MESSAGE = '写真へのアクセスが許可されていません。';

/** 上の文と対で出すリンク（§3.3）。iOS の設定アプリのこのアプリの画面を開く */
export const PHOTO_OPEN_SETTINGS_LABEL = '設定を開く';

/** 縮小・保存に失敗したとき（§3.3）。原因は端末側なので言えるのはここまで */
export const PHOTO_SAVE_FAILED_MESSAGE = '写真を保存できませんでした。';
