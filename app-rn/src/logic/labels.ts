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

import type { ChartUnit } from './analytics';
import { formatElapsedDays, formatShortDate, formatYenTight } from './format';
import { daysBetween } from './listingDays';

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

/** 選択中の点を外すリンク（UI-SPEC §1.5-5）。点をもう一度押す経路は持たないので語で出す */
export const CLEAR_SELECTION_LABEL = '選択を解除';

/** 選択した点の一覧の見出し（UI-SPEC §1.5-5）:「8月9日の記録　3件」 */
export function selectedPointTitle(dateText: string, count: number): string {
  return `${dateText}の記録　${count}件`;
}

/**
 * グラフカードの下に常設する注記（UI-SPEC §1.5-6）。
 * 刻みが勝手に変わるように見えるのを防ぐため、何を選ぶと何が変わるかを先に書いておく。
 */
export const CHART_UNIT_NOTE =
  `${ALL_PERIOD_LABEL}を選ぶと刻みが「${CHART_UNIT_LABELS.month}」に変わり、` +
  `見出しも「${ALL_PERIOD_LABEL}の${TOTAL_PROFIT_LABEL}」になります。`;

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
 * 計算タブの内訳（ENVELOPE_AND_OTHERS_LABEL =「梱包・その他」）とは幅の制約が違うため、
 * 設計案どおり伝票側は詰めない語を使う。
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

// 状態カードの補足行（旧 statusCardTimelineText。UI-SPEC §8.9）は**置かない**。
// §8.9 が実装時送りにしていた重複の整理を、実機で見て「補足行を落とす」と決めたため ──
// 補足行はメタ行（recordTimelineText）から種別を抜いただけの同じ事実で、短いレコードでは
// 両方が同時に画面へ入って同じ日付を 2 度読ませていた。状態カードに残すのはバッジだけ。
