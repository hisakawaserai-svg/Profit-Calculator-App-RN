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

import {
  LONG_BATTLE_DAYS_THRESHOLD,
  type Achievement,
  type AchievementBadgeTier,
  type AchievementCategory,
  type AchievementId,
  type NextAchievement,
  type PersonalBests,
} from './achievements';
import { YEAR_UNIT_MONTH_THRESHOLD, type ChartUnit } from './analytics';
import type { CalcRowSign, CalcSubmitBlockedReason } from './calcMemo';
import {
  formatApproxYenSymbol,
  formatElapsedDays,
  formatMonthKeyTitle,
  formatShortDate,
  formatSignedYenSymbol,
  formatUnitYen,
  formatYearTitle,
  formatYen,
  formatYenSymbol,
  formatYenTight,
  groupDigits,
} from './format';
import { daysBetween } from './listingDays';
import { periodKind, periodYear, type Period } from './period';
import type {
  PriceTickKey,
  PricingAnalysis,
  PricingConclusion,
  PricingState,
  RecordDetailConclusion,
  SimulationVerdict,
  SoldConclusion,
} from './pricing';
import { roundForDisplay } from './profit';
import {
  DEFAULT_PRESET_CALC_METHOD,
  hasPresetUseSize,
  isPackBuy,
  isRatePreset,
  presetCalcMethod,
  presetColorKeyOf,
  PRESET_COLOR_KEYS,
  PRESET_INITIAL_MAX_LENGTH,
  PRESET_NAME_MAX_LENGTH,
  PRESET_RATE_MAX,
  type PresetCalcMethod,
  type PresetColorKey,
  type PresetInvalidReason,
} from './preset';
import {
  TAG_NAME_MAX_LENGTH,
  TAG_NAME_SEPARATOR,
  type TagInvalidReason,
} from './tag';

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

/**
 * 件数の値そのもの（UI-SPEC §1.2）。**単位が 2 つある** ──
 * 出品中は「まだ手元にある品物」を数えるので「点」、一覧の上に出すのは
 * 「いま並んでいる行」なので「件」。数えているものが違うので語も分ける。
 */
export function listedItemCountValue(count: number): string {
  return `${count} 点`;
}
export function recordCountValue(count: number): string {
  return `${count} 件`;
}

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

// ---- 画面の名前とアイコンボタンの読み上げ語（UI-SPEC §1） ----

/**
 * タブバーと各タブのヘッダに出る画面の名前。**タブ名とヘッダの見出しは同じ語にする** ──
 * 押したタブと開いた画面で名前が違うと、どこに居るのかを 2 度読み直すことになる。
 *
 * 計算タブだけヘッダが別語（「計算」/「利益計算」）なのは、タブ名の幅では
 * **何の計算なのかを言えない**ため。ヘッダには幅があるので、そちらで補う。
 */
export const CALC_TAB_LABEL = '計算';
export const CALC_SCREEN_TITLE = '利益計算';
export const RECORDS_TAB_LABEL = '記録';
export const DATA_TAB_LABEL = 'データ';
export const SETTINGS_TAB_LABEL = '設定';

/**
 * アイコンだけのボタンの読み上げ語（UI-SPEC §1.2-1）。
 * **見た目が記号 1 つのものは、ここでしか語を持てない。**
 *
 * 「＋ 記録」だけは語が画面にも出るが（RECORDS_TAB_LABEL）、それは名詞なので
 * 何が起きるかを言えていない ── 読み上げには動詞まで入れる。
 */
export const ADD_RECORD_ACTION_LABEL = '記録を追加';
export const SEARCH_LABEL = '検索';
export const SEARCH_CLEAR_LABEL = '検索を消去';
export const SORT_SHEET_TITLE = '並び替え';

/** 記録の検索欄（UI-SPEC §5-10）。読み上げ語も同じ文を使う（欄の中に出ている語がそのまま名前） */
export const RECORD_SEARCH_PLACEHOLDER = '商品名で検索';

// ---- 「過去の記録から複製」（記録タブの＋のメニュー） ----
//
// **＋を押しても、すぐにフォームは開かない**（2 択のシートが出る）。1 タップ増えるが、
// 複製を「知っている人だけが辿り着く隠し操作」にしないための形 ── 同じ物を何度も出す人には
// こちらが本命で、入口が見えないと使われないまま終わる。

/** ＋のシートの見出し。何を選ぶ場面かを言う */
export const ADD_RECORD_MENU_TITLE = '記録を作る';

/** 2 択の左（従来どおりの新規作成）。**先に置く** ── 増えたほうを既定にしない */
export const NEW_RECORD_ACTION_LABEL = '新しく作る';
export const NEW_RECORD_ACTION_NOTE = '空の記録から入力します';

/** 2 択の右（複製）。行き先が「選ぶ画面」であることまで言う */
export const DUPLICATE_RECORD_ACTION_LABEL = '過去の記録から複製';
export const DUPLICATE_RECORD_ACTION_NOTE = '送料や手数料を引き継いで作ります';

/** 複製元を選ぶ画面（DuplicateSourceScreen） */
export const DUPLICATE_SCREEN_TITLE = '複製する記録を選ぶ';

/**
 * 画面の先頭に置く 1 行。**写らないものを先に言う。**
 *
 * 「複製」の語からは全部が写ると読めるので、そのまま保存すると前の販売価格が
 * 入った記録ができると思われかねない ── 実際は空で始まる（logic/duplicateRecord.ts）。
 */
export const DUPLICATE_SCREEN_NOTE =
  '商品名・種別・経費・タグ・目標を引き継ぎます。販売価格・写真・メモ・日付は引き継ぎません。';

/** 直近の記録の見出し（絞り込んでいないときだけ出る） */
export const DUPLICATE_RECENT_SECTION_LABEL = '最近の記録';

/** その下の行。押すと全件に切り替わる */
export const DUPLICATE_SHOW_ALL_LABEL = 'すべての記録を見る';

/** 全件に切り替えたあとの見出し */
export const DUPLICATE_ALL_SECTION_LABEL = 'すべての記録';

/** 記録が 1 件も無いとき（複製元が作れない） */
export const DUPLICATE_EMPTY_TITLE = '複製できる記録がありません';
export const DUPLICATE_EMPTY_BODY = '記録を 1 件でも作ると、次からここに出ます。';

/** 検索・タグで絞った結果が 0 件のとき。解除の口は絞り込みの行そのものなので出さない */
export const DUPLICATE_NO_MATCH_TITLE = '条件に合う記録がありません';

/** タグで絞る行の見出し（複製元を選ぶ画面） */
export const DUPLICATE_TAG_FILTER_LABEL = 'タグで絞る';

/** カレンダーの前後の月へ送るボタン（UI-SPEC §8.10）。矢印 1 つなので語は読み上げにしかない */
export const PREVIOUS_MONTH_LABEL = '前の月';
export const NEXT_MONTH_LABEL = '次の月';

/** 月バーの期間ボタンの読み上げ（UI-SPEC §1.2）。押すと開くのが期間シートであることを言う */
export function periodButtonAccessibilityLabel(title: string): string {
  return `${PERIOD_SHEET_TITLE}: ${title}`;
}

/**
 * 一覧の行の読み上げ（UI-SPEC §1.2）。行そのものは押すと詳細へ、
 * 左スワイプで出るのは削除。**どちらも商品名を頭に置く** ── 読み上げは 1 行ずつ流れるので、
 * 何に対する操作なのかが先に来ないと、聞いてから戻って確かめることになる。
 */
export function recordDetailAccessibilityLabel(itemName: string): string {
  return `${itemName} の詳細`;
}
export function deleteAccessibilityLabel(name: string): string {
  return `${name}を${DELETE_LABEL}`;
}

/** ± ボタンの読み上げ（UI-SPEC §1.3-9）。何を増減するのかは呼び出し側の欄名が入る */
export function decreaseAccessibilityLabel(label: string): string {
  return `${label}を減らす`;
}
export function increaseAccessibilityLabel(label: string): string {
  return `${label}を増やす`;
}

/** 金額の欄の右の電卓ボタン（UI-SPEC §7.1）。どの欄の電卓かを言う */
export function calculatorAccessibilityLabel(fieldLabel: string): string {
  return `${fieldLabel}の電卓`;
}

/** カレンダーの日のマス（UI-SPEC §8.10）。印（今日・出品日）は呼び出し側が後ろに足す */
export function calendarDayAccessibilityLabel(day: number): string {
  return `${day}日`;
}

/**
 * 長押しコピー（LongPressCopy）のトースト。
 *
 * **成功のときだけ内容まで出す** ── 何が入ったのかは貼るまで分からないので、
 * 写した値をその場で見せる。失敗では入っていないので、出す値がない。
 */
export function copiedMessage(label: string): string {
  return `${label}をコピーしました`;
}
export function copiedContentMessage(text: string): string {
  return `コピー内容：${text}`;
}
export function copyFailedMessage(label: string): string {
  return `${label}のコピーに失敗しました`;
}

/**
 * データベースの初期化に失敗したとき（app/_layout.tsx）。
 * ここだけは**アプリが起動しきる前**に出るので、他のどの画面の語にも寄りかかれない。
 */
export const DB_INIT_FAILED_MESSAGE = 'データベースの初期化に失敗しました';

/** 未実装の画面の仮表示（PlaceholderScreen） */
export const UNIMPLEMENTED_LABEL = '（未実装）';

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

/** その「クリア」の読み上げ（§1.1-3a）。ボタンの語だけでは、何が消えるのかを言えていない */
export const CLEAR_INPUT_ACTION_LABEL = `入力を${CLEAR_LABEL}`;

/**
 * クリアの確認（UI-SPEC §1.1-3a）。**押した時点で全部消える**操作なのに、
 * 押した直後の「元に戻す」を置いていない（§5-8 は未実装）ので、確認を 1 枚挟む。
 *
 * 本文で「金額」と「種別」の両方を言うのは、種別まで既定値に戻ることが
 * ボタンの語（「クリア」）からは読めないため ── 消えるものを先に全部言う。
 * レコードの削除（DELETE_CONFIRM_TITLE）と違って本文があるのはそのため。
 */
export const CLEAR_CONFIRM_TITLE = '入力をクリアしますか？';
export const CLEAR_CONFIRM_MESSAGE =
  'すべての金額が空欄になり、種別も既定値に戻ります。';

/**
 * 計算タブの FAB の語（UI-SPEC §1.1-7）。押すと記録フォームを開く。
 *
 * 記録タブの FAB は「記録」（RECORDS_TAB_LABEL。タブ名と同じ語で、そのタブに足す意味）。
 * こちらは計算の結果を記録に移す動作なので、動詞にして「記録する」とする。
 * ＋は AddRecordFab が描くので、ここには入れない。
 */
export const SAVE_AS_RECORD_LABEL = '記録する';

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
    deductions.push(
      `${COMMISSION_SHORT_LABEL}${formatYenTight(result.commissionAmount)}`,
    );
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
export function lowerPriceWarning(example: {
  price: number;
  profit: number;
}): string {
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

/**
 * 目標利益の入力欄のラベル（§5.3）: 「目標の純利益」/「目標利益」。
 * 計算タブの逆算（UI-SPEC §1.1-3b）と記録フォームの目標欄（SPEC-V9 §2）で**同じ語**を使う ──
 * 同じものを指す欄なので、画面ごとに呼び名が変わると別の値に見える。
 */
export function targetProfitLabel(kind: RecordKind): string {
  return TARGET_PROFIT_LABELS[kind];
}

/**
 * 目標を決めていない記録の表し方（SPEC-V9 §2）。**「¥0」とは書かない。**
 *
 * 0 は「目標は 0 円（赤字にならなければよい）」という目標そのもので、
 * 決めていない状態とは別のもの ── 金額として書くと、決めていない人の記録に
 * 「目標 0 円」という決めた覚えのない値が出ることになる（schema の targetProfit）。
 * 未入力の欄に出す `UNSET_INPUT_LABEL`（「未入力」）とも分ける ── 目標は
 * 入れ忘れではなく「決めない」のが正しい選択でもあるため。
 */
export const TARGET_PROFIT_UNSET_LABEL = '決めていません';

/**
 * 目標欄の折りたたみ見出しの右端に出す値（SPEC-V9 §2）。
 * 決めていなければ語、決めていれば金額。**null と 0 がここで見分けられる。**
 */
export function targetProfitSummary(targetProfit: number | null): string {
  return targetProfit == null
    ? TARGET_PROFIT_UNSET_LABEL
    : formatYen(targetProfit);
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
 * 集計の対象が 1 件も無いとき（UI-SPEC §1.5）。この画面は**売れた記録だけ**を見るので、
 * 「記録がない」ではなく「売却済みが無い」と言う ── 出品中の記録は持っているのに
 * 「記録がありません」と出ると、消えたのかと読める。
 */
export const NO_SOLD_DATA_MESSAGE = '売却済みのデータがありません';

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

/**
 * 選択した点・タグの記録一覧（SelectedPointList 等）を 1 枚のカードにまとめたアコーディオン。
 * 「達成した記録」（labels.ts achievementShowMoreRecordsText）と同じ考え方 ──
 * 最初は先頭 3 件だけ見せ、「すべて見る」で残りを開く。件数が多い月・タグでもカードの高さが
 * 際限なく伸びないようにするため。
 */
export function selectedRecordsShowMoreText(hiddenCount: number): string {
  return `すべて見る（あと${groupDigits(hiddenCount)}件）`;
}

/** 上記アコーディオンを畳むボタン */
export const SELECTED_RECORDS_COLLAPSE_LABEL = '閉じる';

/** 選択した点の一覧の見出し（UI-SPEC §1.5-5）:「8月9日の記録　3件」 */
export function selectedPointTitle(dateText: string, count: number): string {
  return `${dateText}の記録　${count}件`;
}

/**
 * タグ別利益ランキングの行タップで開く内訳一覧の見出し。selectedPointTitle と同じ形
 * （日付の代わりにタグ名を主語にする）。
 */
export function selectedTagTitle(tagName: string, count: number): string {
  return `${tagName}の記録　${count}件`;
}

/**
 * 「タグ別純利益の推移」グラフの日付内訳、その行をさらにタップして開く記録一覧の見出し。
 * selectedPointTitle・selectedTagTitle と同じ形で、日付とタグ名の両方を主語にする。
 */
export function selectedTagChartTitle(
  dateText: string,
  tagName: string,
  count: number,
): string {
  return `${dateText}の${tagName}の記録　${count}件`;
}

/**
 * 「タグ別純利益の推移」グラフの点タップで開くタグ別内訳の見出し脇の 1 行（採用案 1a）:
 * 「3タグ・3件」。日付そのもの（太字）に添える語で、対象の広さ（何タグ・何件ぶんの合計か）を言う。
 */
export function tagChartDaySummaryMetaText(
  tagCount: number,
  recordCount: number,
): string {
  return `${tagCount}タグ・${recordCountValue(recordCount)}`;
}

/**
 * 期間サマリー段（グラフ直下・新規）の項目名。売上・収支（TOTAL_SALES_LABEL /
 * TOTAL_PROFIT_LABEL）に続く 2 項目 ── どちらもこの画面にしかない値なのでここで定義する。
 */
export const PROFIT_RATE_LABEL = '利益率';
/** 出品中を含まない「売れた」件数だけを数える（LISTING_COUNT_LABEL とは対象が違う） */
export const SOLD_COUNT_LABEL = '販売件数';

/**
 * 利益率の表示。売上合計が 0（= 対象 0 件）で算出できないときは AMOUNT_PLACEHOLDER
 * （「ーー」）── 0% だと「収支ちょうど 0」に読めてしまうため（periodProfitRate 参照）。
 */
export function profitRateSummaryValue(rate: number | null): string {
  return rate == null ? AMOUNT_PLACEHOLDER : `${rate.toFixed(1)}%`;
}

/** 展開行の 3 列目（案 1c）。1 件あたりの純利益（= 純利益合計 ÷ 販売件数） */
export const PER_RECORD_PROFIT_LABEL = '1件あたり';

/**
 * 1 件あたり純利益の表示。販売件数が 0（periodProfitPerRecord が null）のときは
 * AMOUNT_PLACEHOLDER（「ーー」）── profitRateSummaryValue と同じ理由。
 *
 * 符号つきの金額は formatSignedYenSymbol を使う（`-¥3,500` の順。一覧の行の純利益・
 * グラフカードの選択値・帯グラフの不足額と同じ表記）── formatYenSymbol だけを通すと
 * `¥-3,500`（¥ の直後にマイナス）になり、アプリ内の他の符号つき金額と順序が食い違う。
 */
export function perRecordProfitValue(value: number | null): string {
  return value == null ? AMOUNT_PLACEHOLDER : formatSignedYenSymbol(value);
}

/** 展開行の 4 列目。記録日 → 販売日の経過日数の単純平均（periodAverageSaleDays） */
export const AVERAGE_SALE_DAYS_LABEL = '平均販売日数';

/**
 * 平均販売日数の表示。対象記録が 0 件（日付逆転を除いて。periodAverageSaleDays が null）の
 * ときは AMOUNT_PLACEHOLDER（「ーー」）── profitRateSummaryValue と同じ理由。
 * 小数第 1 位までにする（1 件あたり純利益と違って端数が出やすい平均値のため）。
 */
export function averageSaleDaysValue(days: number | null): string {
  return days == null ? AMOUNT_PLACEHOLDER : `${days.toFixed(1)}日`;
}

/** 集計段直下の開閉行の文言（案 1c）。閉じているときにタップを促す語 / 開いているときに畳む語 */
export const DETAILS_EXPAND_LABEL = '詳細を見る';
export const DETAILS_COLLAPSE_LABEL = '閉じる';

export function detailsToggleLabel(expanded: boolean): string {
  return expanded ? DETAILS_COLLAPSE_LABEL : DETAILS_EXPAND_LABEL;
}

/**
 * データタブ「収支」セクションの新規カード（logic/periodComparison.ts）。
 * 見出しと、比較対象が 0 件のときの代替文言。
 */
export const PERIOD_COMPARISON_TITLE = '前期間比較';
export const PERIOD_COMPARISON_EMPTY_TEXT = '比較対象のデータがありません';

/**
 * 金額差分の 1 行「▲+¥3,200」「▼-¥1,234」（前期間比較カード）。
 * 増加は ▲・減少は ▼、変化なしは記号なし。符号つきの金額そのものは
 * formatSignedYenSymbol（一覧の行の純利益と同じ表記）に任せる。
 */
export function periodComparisonAmountDiffText(diff: number): string {
  const arrow = diff > 0 ? '▲' : diff < 0 ? '▼' : '';
  return `${arrow}${formatSignedYenSymbol(diff)}`;
}

/** 件数差分の 1 行「▲+2件」「▼-2件」（前期間比較カード。金額と同じ増減の記号規則） */
export function periodComparisonCountDiffText(diff: number): string {
  const arrow = diff > 0 ? '▲' : diff < 0 ? '▼' : '';
  const sign = diff > 0 ? '+' : '';
  return `${arrow}${sign}${diff}件`;
}

/**
 * 利益率差分の 1 行「▲+3.6pt」（前期間比較カード）。ポイント差なので % ではなく pt を付ける。
 * どちらかの期間の売上合計が 0 で比率が出せないときは AMOUNT_PLACEHOLDER（「ーー」）。
 */
export function periodComparisonRateDiffText(diffPt: number | null): string {
  if (diffPt == null) return AMOUNT_PLACEHOLDER;
  const rounded = Number(diffPt.toFixed(1));
  const arrow = rounded > 0 ? '▲' : rounded < 0 ? '▼' : '';
  const sign = rounded > 0 ? '+' : '';
  return `${arrow}${sign}${rounded.toFixed(1)}pt`;
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

/** タグが 1 つも付いていない売れた記録をまとめる集計名（タグ別利益ランキングの 1 行） */
export const UNCLASSIFIED_TAG_LABEL = '未分類';

/**
 * タグ別利益ランキングの行の補足（「利益率 32.1%・8件」）。
 * 率だけだと何の%か初見で伝わらないため PROFIT_RATE_LABEL を頭に付ける。
 */
export function tagProfitMetaText(rateText: string, countText: string): string {
  return `${PROFIT_RATE_LABEL} ${rateText}・${countText}`;
}

/**
 * 記録のないタグ（そのタグの売れた記録が 0 件）をまとめる開閉行の文言（案 2b）。
 * ランキング本体には出さず、下に畳んでおく ── 0 件のタグまで並ぶと純利益の高い順という
 * 主題が薄まるため。detailsToggleLabel と同じ「開閉状態で語を変える」形。
 */
export function zeroRecordTagsToggleLabel(
  count: number,
  expanded: boolean,
): string {
  return expanded
    ? `記録のない${count}タグを閉じる`
    : `記録のない${count}タグを見る`;
}

/**
 * タグ別利益ランキングのスパークライン（各タグ右端の小さな折れ線。案 2b）の説明文。
 * **全タグ共通の目盛り**であることを言う ── 個々に自動フィットさせると高さがタグごとに
 * 意味を持たなくなり、「背が高い＝良い」に見えてしまうため（実装は combinedAxisBounds）。
 */
export const TAG_SPARKLINE_NOTE =
  '小さな線は1月から12月。高さは全タグ共通の目盛りで、比べられます。';

/**
 * タグ別の純利益セクション（案 1b）の 2 択。既定は「一覧」（行ごとの純利益・ランキング順）、
 * 「グラフ」で選んだタグぶんの折れ線を 1 枚に重ねた表示へ切り替える。
 * ボタンは常にどちらか出ている方のカードの右上に置く（一覧なら一覧カード、グラフならグラフカード）。
 */
export const TAG_SECTION_LIST_MODE_LABEL = '一覧';
export const TAG_SECTION_OVERLAY_MODE_LABEL = 'グラフ';

/**
 * タグ別の純利益セクションの見出し下・小さな 1 行（「2026年・22件」）。
 * 大きく出す金額（期間合計の純利益）に、いつ・何件の話かを添える。
 */
export function tagSectionMetaText(
  periodText: string,
  countText: string,
): string {
  return `${periodText}・${countText}`;
}

/**
 * 「重ねる」モードのグラフカードの見出し。「収支の推移」カード（PROFIT_TREND_LABEL）と
 * 同じ位置・同じ見た目で出す ── カードの仕様を収支のグラフと揃えるため。
 */
export const TAG_PROFIT_TREND_LABEL = 'タグ別純利益の推移';

/**
 * 対象のタグが 1 つも無い（= その期間に売れた記録が無い）ときの空状態。
 * tagProfits が空になる条件はグラフ本体の EmptyChart（series.length === 0）と同じ
 * （売れた記録が 1 件でもあれば、タグ無しでも「未分類」の 1 行として必ず候補に残るため）
 * なので、同じ NO_SOLD_DATA_MESSAGE を使う。
 */
export { NO_SOLD_DATA_MESSAGE as TAG_PROFIT_TREND_EMPTY_MESSAGE };

/**
 * データタブのセグメント（「収支」/「タグ」）。計算タブの「利益を出す/目標から逆算」と
 * 同じ SegmentedControl の型（選んだ瞬間に中身が入れ替わる・状態はタブ内の一時的な useState）。
 *
 * 以前はタグ別利益ランキング・推移をサブ画面に追い出し、入口カード 1 枚から push する形に
 * していたが、押さないと中身が見えず、収支と見比べたいときに行き来が面倒だった。
 * 同じ画面の中で切り替える形に戻し、期間・絞り込みは両モードで共有する（切替でリセットしない）。
 */
export const DATA_MODE_PROFIT_LABEL = '収支';
export const DATA_MODE_TAG_LABEL = 'タグ';
/** 3 つ目のセグメント（案 3c）。累計・自己ベスト・実績バッジを見るモード（月バーとは無関係） */
export const DATA_MODE_ACHIEVEMENTS_LABEL = '実績';

// ─────────────────────────────────────────────────────────────────────────────
// データタブ「実績」（案 3c）の表示語。logic/achievements.ts の判定結果（Achievement /
// PersonalBests）を画面の文言に変換する関数をここに集約する。
// ─────────────────────────────────────────────────────────────────────────────

/** 「次の実績」カードの見出し */
export const NEXT_ACHIEVEMENT_LABEL = '次の実績';
/** 全実績を達成したときのコンプリート表示（構成の「判断はお任せ」を受けた決定） */
export const ACHIEVEMENTS_COMPLETE_TITLE = 'すべての実績を達成しました';
export const ACHIEVEMENTS_COMPLETE_MESSAGE =
  'お疲れさまです。新しい実績が増えたらまたお知らせします。';

/**
 * 実績ごとの名前・目標の単位（獲得済みバッジ・次の実績カードの両方で使う）。
 *
 * 成長系（⚡💰📦🎯🔍）5 ジャンル × 5 段階の名前は「ジャンル名 + しきい値」で統一する ──
 * 段階が増えても命名規則を覚え直さずに済む（利益ハンターだけ、💰累計利益★5=¥1,000,000の
 * 元からの固有名を残した特別扱い）。
 */
const ACHIEVEMENT_NAMES: Record<AchievementId, string> = {
  // 特殊実績: はじめる系
  first_sale: '初めての一歩',
  sale_debut: '販売デビュー',
  first_profit: '初利益',
  career_profit_1000: '累計¥1,000',
  record_count_10: '記録を続けよう',
  // 特殊実績: タグ系
  tag_debut: 'タグデビュー',
  tag_synergy: 'タグの総合力',
  tag_mastery: 'タグの達人',
  // 特殊実績: その他
  long_battle: '長期戦突破',
  instant_sale: '即売れ',
  goal_kept: '有言実行',
  goal_master: '目標マスター',
  all_rounder: 'なんでも屋',
  // 成長系: ⚡一撃
  profit_1000: '一撃¥1,000',
  profit_5000: '一撃¥5,000',
  profit_10000: '一撃¥10,000',
  profit_30000: '一撃¥30,000',
  profit_50000: '一撃¥50,000',
  // 成長系: 💰累計利益
  career_profit_10000: '累計利益¥10,000',
  career_profit_50000: '累計利益¥50,000',
  career_profit_100000: '累計利益¥100,000',
  career_profit_500000: '累計利益¥500,000',
  career_profit_1000000: '利益ハンター',
  // 成長系: 📦販売件数
  sold_1: '1個売れました',
  sold_10: '10個販売',
  sold_50: '50個販売',
  sold_250: '250個販売',
  sold_500: '500個販売',
  // 成長系: 🎯得意分野
  tag_specialty_1000: '得意分野¥1,000',
  tag_specialty_5000: '得意分野¥5,000',
  tag_specialty_10000: '得意分野¥10,000',
  tag_specialty_50000: '得意分野¥50,000',
  tag_specialty_100000: '得意分野¥100,000',
  // 成長系: 🔍売れ筋
  tag_bestseller_3: '売れ筋3件',
  tag_bestseller_10: '売れ筋10件',
  tag_bestseller_25: '売れ筋25件',
  tag_bestseller_50: '売れ筋50件',
  tag_bestseller_100: '売れ筋100件',
};

export function achievementName(id: AchievementId): string {
  return ACHIEVEMENT_NAMES[id];
}

/**
 * 記録保存時の実績獲得トースト（text1）。
 * 1個だけ新規獲得なら実績名をそのまま、複数なら件数でまとめる。
 */
export function achievementToastText(newlyCompletedIds: readonly AchievementId[]): string {
  if (newlyCompletedIds.length === 1) {
    return `実績「${achievementName(newlyCompletedIds[0])}」を達成しました`;
  }
  return `実績を${newlyCompletedIds.length}件達成しました`;
}

/** 実績ごとの説明文（全画面表示。獲得した実績の一覧はこれを出さない） */
const ACHIEVEMENT_DESCRIPTIONS: Record<AchievementId, string> = {
  first_sale: '初めて商品が売れた',
  sale_debut: '初めて商品を出品した',
  first_profit: '初めて純利益がプラスの記録で売れた',
  career_profit_1000: '累計純利益¥1,000に到達',
  record_count_10: '記録を10件作った',
  tag_debut: '初めてタグを付けた記録を作った',
  tag_synergy: '3つの異なるタグで、それぞれ累計純利益¥5,000以上を達成',
  tag_mastery: '3つの異なるタグで、それぞれ累計純利益¥10,000以上を達成',
  long_battle: `出品から${LONG_BATTLE_DAYS_THRESHOLD}日以上かけて売れた商品がある`,
  instant_sale: '出品したその日のうちに売れた商品がある',
  goal_kept: '目標利益を達成した記録がある',
  goal_master: '目標利益を達成した記録が10件以上',
  all_rounder: '仕入品・不用品の両方で純利益がプラスの記録がある',
  profit_1000: '1件の商品で純利益¥1,000以上を達成',
  profit_5000: '1件の商品で純利益¥5,000以上を達成',
  profit_10000: '1件の商品で純利益¥10,000以上を達成',
  profit_30000: '1件の商品で純利益¥30,000以上を達成',
  profit_50000: '1件の商品で純利益¥50,000以上を達成',
  career_profit_10000: '累計純利益¥10,000に到達',
  career_profit_50000: '累計純利益¥50,000に到達',
  career_profit_100000: '累計純利益¥100,000に到達',
  career_profit_500000: '累計純利益¥500,000に到達',
  career_profit_1000000: '累計純利益¥1,000,000に到達',
  sold_1: '累計1件を販売',
  sold_10: '累計10件を販売',
  sold_50: '累計50件を販売',
  sold_250: '累計250件を販売',
  sold_500: '累計500件を販売',
  tag_specialty_1000: '1つのタグで累計純利益¥1,000以上',
  tag_specialty_5000: '1つのタグで累計純利益¥5,000以上',
  tag_specialty_10000: '1つのタグで累計純利益¥10,000以上',
  tag_specialty_50000: '1つのタグで累計純利益¥50,000以上',
  tag_specialty_100000: '1つのタグで累計純利益¥100,000以上',
  tag_bestseller_3: '1つのタグで売却済み記録が3件以上',
  tag_bestseller_10: '1つのタグで売却済み記録が10件以上',
  tag_bestseller_25: '1つのタグで売却済み記録が25件以上',
  tag_bestseller_50: '1つのタグで売却済み記録が50件以上',
  tag_bestseller_100: '1つのタグで売却済み記録が100件以上',
};

export function achievementDescription(id: AchievementId): string {
  return ACHIEVEMENT_DESCRIPTIONS[id];
}

/** 段位（ブロンズ〜レジェンド）の表示語 */
const BADGE_TIER_NAMES: Record<AchievementBadgeTier, string> = {
  bronze: 'ブロンズ',
  silver: 'シルバー',
  gold: 'ゴールド',
  platinum: 'プラチナ',
  legend: 'レジェンド',
};

export function achievementBadgeTierName(tier: AchievementBadgeTier): string {
  return BADGE_TIER_NAMES[tier];
}

/** 全画面表示「達成した記録」行の純利益（符号つき。緑／赤の色分けは呼び出し側） */
export function achievementCompletedRecordProfitText(
  netProfit: number,
): string {
  return formatSignedYenSymbol(netProfit);
}

/** 目標値の単位が「円」の実績（それ以外はすべて「件」）。進捗表示・「次点」の文言に使う */
const YEN_UNIT_ACHIEVEMENT_IDS: ReadonlySet<AchievementId> = new Set([
  'career_profit_1000',
  'profit_1000',
  'profit_5000',
  'profit_10000',
  'profit_30000',
  'profit_50000',
  'career_profit_10000',
  'career_profit_50000',
  'career_profit_100000',
  'career_profit_500000',
  'career_profit_1000000',
  'tag_specialty_1000',
  'tag_specialty_5000',
  'tag_specialty_10000',
  'tag_specialty_50000',
  'tag_specialty_100000',
]);

/** 実績の目標値の単位が「件」か「円」かを見分ける（進捗表示・「次点」の文言に使う） */
function isProfitAchievement(id: AchievementId): boolean {
  return YEN_UNIT_ACHIEVEMENT_IDS.has(id);
}

/** 「次の実績」カードのリング中央「32 / 50件」（利益系の実績は円で出す） */
export function nextAchievementProgressText(next: NextAchievement): string {
  const unit = isProfitAchievement(next.id) ? '円' : '件';
  return `${groupDigits(next.current)} / ${groupDigits(next.target)}${unit}`;
}

/** 「あと18件で解除」（構成のモック文言どおり。利益系は「あと¥◯◯」） */
export function remainingToUnlockText(next: NextAchievement): string {
  const remaining = Math.max(0, next.target - next.current);
  return isProfitAchievement(next.id)
    ? `あと${formatYenSymbol(remaining)}で解除`
    : `あと${groupDigits(remaining)}件で解除`;
}

/**
 * 「次点」の 1 行（構成の「次点の実績名も小さく添える」）。次の実績の次に進捗率が高い
 * 未達成の実績を、その実績の達成条件つきで小さく示す。無ければ出さない（呼び出し側で判定）。
 */
export function nextAchievementRunnerUpText(runnerUp: Achievement): string {
  const remaining = Math.max(0, runnerUp.target - runnerUp.current);
  const remainingText = isProfitAchievement(runnerUp.id)
    ? formatYenSymbol(remaining)
    : `${groupDigits(remaining)}件`;
  return `次点：${achievementName(runnerUp.id)}達成（あと${remainingText}）`;
}

export const YOUR_RECORDS_LABEL = 'あなたの記録';
export const CAREER_NET_PROFIT_LABEL = '累計純利益';
export const CAREER_SALES_LABEL = '累計売上';

export const EARNED_ACHIEVEMENTS_LABEL = '獲得した実績';
/** 「獲得した実績」見出し横の「すべて見る ›」（実績一覧画面への導線） */
export const VIEW_ALL_ACHIEVEMENTS_LABEL = 'すべて見る';
/** 実績一覧画面（AchievementListScreen）のヘッダタイトル */
export const ACHIEVEMENT_LIST_TITLE = '実績一覧';

/** 獲得した実績カード見出し右の「4/8」 */
export function achievementProgressCountText(
  earnedCount: number,
  totalCount: number,
): string {
  return `${earnedCount}/${totalCount}`;
}

/**
 * 「未解除」セクションの見出し「未解除（3）」。
 * 「獲得した実績」カードの未解除チップ列・実績一覧画面（AchievementListScreen）の
 * 未解除グリッドの両方で使う（同じ言い回しを 1 か所にまとめる）。
 */
export function lockedAchievementsSectionTitle(count: number): string {
  return `未解除（${count}）`;
}

/** 実績一覧画面（AchievementListScreen）のジャンル別カードの見出し（AchievementCategory → 表示名） */
const ACHIEVEMENT_GENRE_TITLES: Record<AchievementCategory, string> = {
  strike: '⚡一撃',
  career_profit: '💰累計利益',
  sold_count: '📦販売件数',
  tag_specialty: '🎯得意分野',
  tag_bestseller: '🔍売れ筋',
  start: '🌱はじめる系',
  tag: '🏷️タグ系',
  sales_technique: 'その他',
};

export function achievementGenreTitle(category: AchievementCategory): string {
  return ACHIEVEMENT_GENRE_TITLES[category];
}

/** 全画面表示（実績タップ時）の「達成した記録」行の見出し */
export const ACHIEVEMENT_COMPLETED_RECORD_LABEL = '達成した記録';

/**
 * 全画面表示「達成した記録」セクションの見出し。1 件なら件数を付けない（従来どおり）。
 * 累計利益・販売件数などの積み重ね系は複数件になるので「達成した記録（12件）」と件数を添える。
 */
export function achievementCompletedRecordsSectionTitle(count: number): string {
  return count <= 1
    ? ACHIEVEMENT_COMPLETED_RECORD_LABEL
    : `${ACHIEVEMENT_COMPLETED_RECORD_LABEL}（${count}件）`;
}

/** 「達成した記録」アコーディオンの「もっと見る」（構成：最初の3件だけ表示し、残りは開いて見る） */
export function achievementShowMoreRecordsText(hiddenCount: number): string {
  return `すべて見る（あと${groupDigits(hiddenCount)}件）`;
}

/** 「達成した記録」アコーディオンを閉じるボタン */
export const ACHIEVEMENT_COLLAPSE_RECORDS_LABEL = '閉じる';

/** 全画面表示のページ番号「3 / 4」 */
export function achievementPageIndicatorText(
  index: number,
  total: number,
): string {
  return `${index + 1} / ${total}`;
}

/** 全画面表示の左右の矢印。スワイプ以外にも移動できることを示す（読み上げ用） */
export const ACHIEVEMENT_DETAIL_PREVIOUS_LABEL = '前の実績を見る';
export const ACHIEVEMENT_DETAIL_NEXT_LABEL = '次の実績を見る';

export const PERSONAL_BESTS_LABEL = '自己ベスト';
export const BEST_NET_PROFIT_LABEL = '最高純利益';
export const BEST_SALES_PRICE_LABEL = '最高販売価格';
export const FASTEST_SALE_LABEL = '最速販売';
export const BEST_MONTH_BY_COUNT_LABEL = '最多販売月';
export const BEST_MONTH_BY_PROFIT_LABEL = '最高月間利益';
export const BEST_TAG_LABEL = '最多販売タグ';

/**
 * 自己ベストのタイルに値が無い（0 件）ときのプレースホルダ。
 * AMOUNT_PLACEHOLDER と同じ表記だが、定義がこの位置より後ろにあるため文字列を直書きする
 * （TDZ を避けるための重複。値は 1 か所で変えられるよう AMOUNT_PLACEHOLDER 側が真実）。
 */
const PERSONAL_BEST_EMPTY_VALUE = 'ーー';

/** 最速販売のタイルの値「2日」 */
export function fastestSaleValueText(bests: PersonalBests): string {
  return bests.fastestSale == null
    ? PERSONAL_BEST_EMPTY_VALUE
    : `${bests.fastestSale.days}日`;
}

/** 最多販売月のタイルの値「8月・9件」 */
export function bestMonthByCountValueText(bests: PersonalBests): string {
  if (bests.bestMonthByCount == null) return PERSONAL_BEST_EMPTY_VALUE;
  const [, month] = bests.bestMonthByCount.monthKey.split('-').map(Number);
  return `${month}月・${bests.bestMonthByCount.count}件`;
}

/** 最高月間利益のタイルのサブ見出し「2026年8月」 */
export function bestMonthProfitDateText(bests: PersonalBests): string | null {
  return bests.bestMonthByProfit == null
    ? null
    : formatMonthKeyTitle(bests.bestMonthByProfit.monthKey);
}

/**
 * 最多販売タグのタイルの値「未分類・7件」「全32件中」。タグ名は呼び出し側（tags 一覧を
 * 持つ画面）が解決する ── logic 層は tagId しか知らないため（DataScreen の joinTagRanking と同じ分担）。
 */
export function bestTagValueText(tagName: string, count: number): string {
  return `${tagName}・${count}件`;
}

export function bestTagOfTotalText(totalCount: number): string {
  return `全${totalCount}件中`;
}

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
export const WEEKDAY_LABELS = [
  '日',
  '月',
  '火',
  '水',
  '木',
  '金',
  '土',
] as const;

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

/** 帯グラフの凡例の割合（例:「32%」）。整数に丸める ── 小数第 1 位まで読む場面ではない */
export function percentLabel(ratio: number): string {
  const percent = Math.round(ratio * 100);
  // 丸めて 0% になる項目は「無い」ように読めるので、0 とは言わずに小ささのほうを言う。
  // 帯にはこの項目も最低幅の区画で残っている（消えると合計が合わないように見えるため）
  if (percent === 0) return LESS_THAN_ONE_PERCENT_LABEL;
  // **全部ではないのに「100%」と言わない**（上の 0% と同じ話の裏返し）。
  // 仕入 400,000 円・手数料 100 円の記録では 99.975% が 100% に丸まり、
  // 隣の区画が「1%未満」と出ているのに合計が 100% を超えて読める。
  // 帯は「どう分かれたか」を見せる面なので、区画の割合の和が 100% を超えて見えてはいけない
  if (percent >= 100 && ratio < 1) return ALMOST_ALL_PERCENT_LABEL;
  return `${percent}%`;
}

/** 丸めると 0% になる項目に出す語（percentLabel） */
export const LESS_THAN_ONE_PERCENT_LABEL = '1%未満';

/** 丸めると 100% になるが、全部ではない項目に出す語（percentLabel） */
export const ALMOST_ALL_PERCENT_LABEL = 'ほぼ100%';

/**
 * 赤字の帯で、黒字の「手元に残る」の位置に入る斜線の区画の名前。
 *
 * 区画そのものは斜線（色でも塗りでもない模様）で「足りていない」ことを示すが、
 * **模様だけを手がかりにしない**（§0.1「色は識別の補助」と同じ話）── 名前を添える。
 */
export const SHORTFALL_SEGMENT_LABEL = '足りない';

/**
 * 斜線の区画に添える不足額「-¥550」。
 *
 * **符号つきで出す**（帯の中／脇には「足りませんでした」を添える幅が無いので、
 * 数字だけで足りない側だと読めなければならない）。
 * 引数は不足額（正の数）で、表示は負になる ── レシートの「手元に残る」行と同じ向き。
 */
export function shortfallAmountLabel(shortfall: number): string {
  return formatSignedYenSymbol(-shortfall);
}

/**
 * 帯グラフの代わりに出す不活性文（RecordBreakdownBar。§価格未設定）。
 *
 * 販売価格が未設定（0 円）の記録は、費用だけを分母にした割合や「足りない」を出すと
 * 未確定の入力を確定した赤字に見せてしまう。帯そのものを不活性にして、この文だけを出す ──
 * 「いくらで売る?」画面の未設定時（E。PRICE_UNSET_DESCRIPTION）と同じ考え方。
 */
export const BREAKDOWN_BAR_UNPRICED_NOTE = '価格を入れると内訳が計算できます';

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
export function presetBlockedNote(
  reason: PresetInvalidReason,
  type: PresetType,
  /**
   * 単価の計算方式（SPEC-V10 §1.4）。**割る数の欄の名前が方式で変わる**ので、
   * 同じ理由コードでも指す欄が読み取れるようにここまで渡す。既定は既存方式。
   */
  method: PresetCalcMethod = DEFAULT_PRESET_CALC_METHOD,
): string {
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
      return method === 'usage' ? '想定使用回数を入れてください' : '入数を入れてください';
    case 'pack-price-out-of-range':
      return '購入価格は 0 以上で入れてください';
    // 面積方式（SPEC-V10 §1.4）。購入サイズは必須、平均使用サイズは「両方か、両方空か」
    case 'pack-size-required':
      return '購入サイズの縦・横を入れてください';
    case 'use-size-invalid':
      return '平均使用サイズは縦・横の両方を入れてください';
    // 専用資材の代金（SPEC-V6 §2）。0 円を許すので「入れてください」ではない ──
    // 咎めるのは範囲の外だけで、空欄はそのまま 0 円として保存できる
    case 'material-cost-out-of-range':
      return `${SHIPPING_MATERIAL_LABEL}は 0 以上で入れてください`;
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

/**
 * 送料プリセットの行に足す 1 行（SPEC-V6 §1）。資材費があるときだけ出す。
 *
 * **右端の金額は合計**（選ぶと入る額）で、この行がその**内訳**を言う。
 *
 * 当初は逆で、右端が登録した送料・この行が「＋専用資材 100円（合計 550円）」だった。
 * 改めたのは、一覧・選択シート・記録に入る額の 3 つで**主役の数字を揃える**ため ──
 * 基本的に専用資材は使うので、まず読みたいのは「これを選ぶといくらか」。
 * 打った 450 が消えるわけではなく、この行の中に内訳として残る。
 */
export function shippingMaterialRowNote(
  value: number,
  materialCost: number,
): string {
  return `${POSTAGE_LABEL} ${formatUnitYen(value)} ＋ ${SHIPPING_MATERIAL_LABEL} ${formatUnitYen(materialCost)}`;
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

// ---- SPEC-V10 梱包材の単価計算方式（個数 / 面積 / 使用回数） ----

/** 3 択の見出し（§1.1）。「金額の入れ方」で**まとめ買い**を選んだときだけ出る */
export const PRESET_CALC_METHOD_LABEL = '計算方式';

/**
 * 3 択の中身（§1.1）。並びは PRESET_CALC_METHODS そのもの（既定の「個数から」が先頭）。
 * 「〜から」で揃えているのは、どれも**何を割るか**を選んでいるため。
 */
export const PRESET_CALC_METHOD_OPTIONS = ['個数から', '面積から', '使用回数から'];

/**
 * 割る数の欄の見出し（§1.2）。**個数方式と使用回数方式で同じ欄**の名前が変わる ──
 * 入れる数の意味が違うので、単位（個 / 回）まで含めて言い分ける。
 */
export function presetPackQuantityFieldLabel(method: PresetCalcMethod): string {
  return method === 'usage' ? PRESET_USAGE_COUNT_FIELD_LABEL : PRESET_PACK_QUANTITY_FIELD_LABEL;
}

/** 想定使用回数の欄（§1.2）。「何回ぶん使えるか」を人が見積もって入れる */
export const PRESET_USAGE_COUNT_FIELD_LABEL = '想定使用回数（回）';

/** 購入サイズの欄（§1.2）。cm で入れる（㎡ への換算は presetAreaUnitPrice がする） */
export const PRESET_PACK_HEIGHT_FIELD_LABEL = '購入サイズ 縦（cm）';
export const PRESET_PACK_WIDTH_FIELD_LABEL = '購入サイズ 横（cm）';

/** 平均使用サイズの欄（§1.2）。**任意入力**で、入れると 1 回あたりまで出る */
export const PRESET_USE_HEIGHT_FIELD_LABEL = '平均使用サイズ 縦（cm）';
export const PRESET_USE_WIDTH_FIELD_LABEL = '平均使用サイズ 横（cm）';

/** ¥/㎡ の帯（§1.3）。面積方式の 1 枚目の計算結果 */
export const PRESET_AREA_UNIT_PRICE_LABEL = '1㎡あたり';

/** 1 回あたりの帯（§1.3）。面積・使用回数方式の計算結果 */
export const PRESET_USE_PRICE_LABEL = '1回あたり';

/**
 * 計算結果の帯の見出し（§1.3）。方式で数える単位が変わる:
 * 個数から = 1 個あたり / 面積・使用回数から = 1 回あたり。
 */
export function presetUnitPriceRowLabel(method: PresetCalcMethod): string {
  return method === 'individual' ? PRESET_UNIT_PRICE_LABEL : PRESET_USE_PRICE_LABEL;
}

/**
 * 平均使用サイズのカードの下の 1 行（§1.3）。**任意入力であることと、
 * 入れなかったときに何が登録されるか**を先に言う ── 空のまま保存できてしまう欄なので、
 * 保存したあとに「1 回いくらが出ていない」と気づく形にはしない。
 */
export const PRESET_USE_SIZE_NOTE =
  '任意です。入れると1回あたりの金額まで出ます。空のままなら1㎡あたりの金額が経費に入ります。';

/**
 * 一覧・選択シートの行で、右端の金額が**何あたりの額か**を言う 1 行（§1.5）。
 * 計算して登録した梱包材だけに出る（手で金額を入れた行は「1 回ぶんの額」そのものなので出さない）。
 *
 * 面積方式で平均使用サイズを入れていない行だけ単位が「1 ㎡」になる ──
 * ここを言わないと、同じ「◯◯円」の並びの中で 1 行だけ桁の違う額が理由なく混ざる。
 */
export function presetUnitNote(preset: {
  type: PresetType;
  calcMethod?: string;
  packQuantity: number;
  packHeight?: number;
  packWidth?: number;
  useHeight?: number;
  useWidth?: number;
}): string | null {
  if (preset.type !== 'packaging' || !isPackBuy(preset)) return null;

  switch (presetCalcMethod(preset)) {
    case 'area':
      return hasPresetUseSize(preset)
        ? `${PRESET_USE_PRICE_LABEL}（${formatPresetSize(preset.useHeight ?? 0)}×${formatPresetSize(preset.useWidth ?? 0)}cm）`
        : PRESET_AREA_UNIT_PRICE_LABEL;
    case 'usage':
      return PRESET_USE_PRICE_LABEL;
    default:
      return PRESET_UNIT_PRICE_LABEL;
  }
}

/** サイズの表示（cm）。末尾の `.0` は出さない（金額の formatUnitYen と同じ扱い） */
function formatPresetSize(size: number): string {
  return String(Number(size.toFixed(1)));
}

// ---- SPEC-V6 送料プリセットの専用資材 ----

/**
 * 専用資材そのものを指す語（SPEC-V6 §1）。「梱包材」（ENVELOPE_COST_LABEL）とは**別のもの** ──
 * あちらは自分で選んで買う箱・封筒で、こちらは**その配送方法でしか使えない指定の資材**。
 * 語を分けるのは、記録の経費の内訳でも別の行（送料 / 梱包材）に入るため。
 */
export const SHIPPING_MATERIAL_LABEL = '専用資材';

/** 送料プリセットの編集画面の欄（§2）。0 円のままでも保存できる（任意の欄） */
export const SHIPPING_MATERIAL_FIELD_LABEL = `${SHIPPING_MATERIAL_LABEL}の代金`;

/**
 * 内訳カードの合計行（§2）。**送料と資材費を足したものがこの行**で、
 * 記録に入るのもこの額（「専用資材を使わない」を選ばない限り）。
 */
export const SHIPPING_TOTAL_LABEL = '合計';

/** 内訳カードの下の 1 行（§2）。この合計がどこで使われるのかを言う */
export const SHIPPING_TOTAL_NOTE =
  '記録でこのプリセットを選ぶと、この合計が送料に入ります。';

/**
 * 選択シートの行に埋め込む 2 択（採用案 45b）。**並びは「送料のみ」→「＋資材」。**
 *
 * 記録フォーム側のトグル（旧「専用資材を使わない」）を置き換えたもの ── 選ぶ場所と
 * 資材を決める場所が 2 つに分かれていたのをやめ、選択と同時に決める形にした。
 *
 * 右側が**金額を持つ**（「＋資材 100円」）のは、押した結果いくら増えるのかを
 * 押す前に読めるようにするため。左は増えない側なので額を持たない。
 * 既定（行そのものを押したとき）は右 ＝ 資材を使う側。
 */
export const SHIPPING_ONLY_LABEL = '送料のみ';
export function withShippingMaterialLabel(amount: string): string {
  return `＋資材 ${amount}`;
}

export const PRESET_COLOR_FIELD_LABEL = 'バッジの色';

/**
 * 自由色（SPEC-V7 §3）。固定色の丸の最後に置く 12 個目の口。
 * 「その他」ではなく「自由色」なのは、**残りものではなく対等な選択肢**だから ──
 * 押すと色相と明るさを自分で決められる。
 */
export const CUSTOM_COLOR_LABEL = '自由色';
export const COLOR_PICKER_TITLE = '色を選ぶ';
/** 連続量を合わせる操作なので確定ボタンを置く（プリセットの選択シートとは逆。§3） */
export const COLOR_PICKER_DONE_LABEL = '決定';

// ---- 設計案 50c: 色を使用状況で 2 群に分ける ----

/**
 * 固定 11 色の表示名。**「使用中」の群と「この◯◯の色」に出す語**なので、
 * 色そのものと同じく logic 側が 1 か所で持つ（画面で英語キーを出さない）。
 * 読み上げ（accessibilityLabel）もこれを使う ── `red` と読まれても伝わらない。
 */
export const PRESET_COLOR_LABELS: Record<PresetColorKey, string> = {
  red: '赤',
  orange: 'オレンジ',
  yellow: '黄',
  green: '緑',
  teal: 'ティール',
  blue: '青',
  indigo: '藍',
  purple: '紫',
  pink: 'ピンク',
  brown: '茶',
  gray: 'グレー',
};

/** 保存値から色名。固定 11 色のどれでもなければ「自由色」 */
export function presetColorLabel(stored: string): string {
  const key = presetColorKeyOf(stored);
  return key == null ? CUSTOM_COLOR_LABEL : PRESET_COLOR_LABELS[key];
}

/** 上の群の見出し（追加のとき）。まだ誰も使っていない色だけが並ぶ */
export const COLOR_UNUSED_SECTION_LABEL = 'まだ使っていない色';

/**
 * 上の群の見出し（編集のとき）。**「使っていない」とは言えない** ──
 * 自分の色を先頭に残すので、1 つだけ使用中の色が混じっているため。
 */
export const COLOR_SELECTABLE_SECTION_LABEL = '選べる色';

// ---- 設計案 51b: 固定 11 色を使い切ったら、群の上下を入れ替える ----
//
// 50c は「上の群が自由色の丸 1 つだけになる」形だったが、4 列のうち 1 つだけが埋まった段は
// **空いた 3 枠のほうが目に入る**。51b は主役を入れ替えて、上を「新しい色を作る」の 1 行
// （幅いっぱい）に、下の「使用中の色から選ぶ」を 44pt の丸で普通に並べる ──
// 空の枠を見せるのをやめるので、寂しさが構造的に消える。

/**
 * その 1 行の主文言。**「まだ使っていない色」の見出しと残り数は出さない**
 * （旧 `COLOR_CUSTOM_ONLY_SECTION_LABEL` / `COLOR_ALL_USED_NOTE` は廃止した）──
 * 空であることを見出しで示すと、無いものを 1 行使って言うことになる。
 * 使い切ったことは副文言（下記）が 1 回だけ言う。
 */
export const CUSTOM_COLOR_CREATE_LABEL = '新しい色を作る';

/**
 * 同じ行の主文言（すでに自由色を選んでいるとき）。開くシートは同じだが、
 * 開いた先には**いま使っている色**が入っているので「作る」とは言えない。
 */
export const CUSTOM_COLOR_CHANGE_LABEL = `${CUSTOM_COLOR_LABEL}を変える`;

/** 同じ行の副文言。固定色の丸が 1 つも並んでいない理由を、その場で言う */
export const COLOR_ALL_USED_SUBTITLE = `固定の${PRESET_COLOR_KEYS.length}色は使い切りました`;

/**
 * 下の群の見出し（設計案 51b の状態）。**状態ではなく操作を言う** ──
 * この状態では固定色を選べる場所がここしかないので、「使用中」とだけ書くと
 * 眺めるだけの一覧に見え、押せることが読めない。
 */
export const COLOR_USED_PICK_SECTION_LABEL = '使用中の色から選ぶ';

/** 上の群の右（追加のとき）。残っている固定色の数 */
export function colorRemainingLabel(count: number): string {
  return `${count}色`;
}

/** 上の群の右（編集のとき）。「オレンジ（このタグの色）」 */
export function ownColorLabel(stored: string, entityLabel: string): string {
  return `${presetColorLabel(stored)}（この${entityLabel}の色）`;
}

/** 下の群の見出し（追加のとき） */
export const COLOR_USED_SECTION_LABEL = '使用中';

/** 下の群の見出し（編集のとき）。自分は含まれないことを言う */
export function otherUsedSectionLabel(entityLabel: string): string {
  return `ほかの${entityLabel}が使用中`;
}

/**
 * 下の群の 1 つに添える名前。**同じ色を複数が使っていることがある**ので、
 * 先頭 1 件 ＋ 残りの件数にする（横に並べる札なので、全部を書くと 1 行に収まらない）。
 */
export function colorUserLabel(names: readonly string[]): string {
  const [head, ...rest] = names;
  return rest.length === 0 ? head : `${head} ほか${rest.length}件`;
}

/**
 * 使用中の色を選んだときの注記（設計案 50c）。**選択は妨げない** ──
 * 同じ色を 2 つに付けるのが誤りだとは限らないので、Alert では止めず 1 行だけ出す。
 *
 * 複数が同じ色を使っているときも**名前は 1 件だけ**書き、残りは件数にする ──
 * 名前を「・」で連ねるとプリセット名（「A4・厚さ3cm以内」）と区切りが見分けられず、
 * 件数が増えるほど行が伸びて注記が読まれなくなる。誰が使っているかは
 * 下の群にそのまま並んでいるので、ここは「重なっている」ことだけを伝えれば足りる。
 */
export function sameColorNote(names: readonly string[]): string {
  const [head, ...rest] = names;
  const who =
    rest.length === 0 ? `「${head}」` : `「${head}」ほか${rest.length}件`;
  return `${who}と同じ色です`;
}
export const PRESET_INITIAL_FIELD_LABEL = 'バッジの文字';

/** 頭文字の欄の下の 1 行（§1.2）。空のままでも何が出るかを先に言う */
export const PRESET_INITIAL_NOTE = `名前の先頭が入ります。${PRESET_INITIAL_MAX_LENGTH}文字まで変えられます。`;

/**
 * プレビュー帯のバッジの下の 1 行（設計案 49c）。**打っていないときだけ「押せる」ことを言う** ──
 * 専用の入力欄を廃したので、バッジが押せること自体が画面から読めなくなるため。
 */
export const PRESET_INITIAL_HINT = `${PRESET_INITIAL_MAX_LENGTH}文字まで・押して直せます`;

/**
 * 同じ 1 行の、打っている最中の形（設計案 49c）。**制限だけを残す** ──
 * カーソルが立っている時点で押せることは済んだ話で、そこに要るのは上限だけ。
 */
export const PRESET_INITIAL_EDITING_HINT = `${PRESET_INITIAL_MAX_LENGTH}文字まで`;

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
export function presetDeleteConfirmMessage(
  type: PresetType,
  usageCount: number,
): string {
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

/**
 * タグボタンの「✕」（選択中のプリセットを外す）の読み上げ。文面は siteNameClearLabel と同じ形。
 */
export function presetTagClearLabel(name: string): string {
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
  return usageCount === 0
    ? head
    : `${head}（${presetCountLabel(usageCount)}の記録から外れました）`;
}

// ---- SPEC-V4 §2.3 追加・編集シート ----

/**
 * プレビューの左に置く 1 行（§2.3-2）。**プレビューが何の姿なのかを名指しする。**
 *
 * 以前はチップだけを 1 枚のカードに置いていたが、それだけでは
 * 「打った名前がそのまま出ているだけの帯」に見え、**どこに出るものなのか**が読めなかった。
 * 実際に出る先（一覧の行）は使用件数とシェブロンまで含んだ形なので、
 * プレビューもその形ごと見せて、左でそれを名指しする。
 */
export const TAG_PREVIEW_LABEL = `${TAG_LABEL}一覧での見え方`;

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
 * チップの「✕」の読み上げ（§3.1）。記号 1 つなので、外れるのが**このタグだけ**
 * （記録は消えない）ことは語の側でしか言えない。
 */
export function tagRemoveAccessibilityLabel(tagName: string): string {
  return `${tagName}を外す`;
}

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
export const TAG_PICKER_EMPTY_BODY =
  '上の欄に名前を入れると、その場で作れます。';

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
 * 解除バーの本文を押したときの読み上げ（§4.3）。文そのものは条件の一覧なので、
 * 押すと何が起きるかは**ヒントの側**でしか言えない（行き先は絞り込みページ）。
 */
export const FILTER_NOTICE_HINT = '絞り込みの条件を変えます';

/** 解除の読み上げ（§4.3）。「解除」だけでは名詞に読めるので、動詞まで足す */
export const FILTER_CLEAR_ACTION_LABEL = `${FILTER_CLEAR_LABEL}する`;

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
  return isSoldMode
    ? 'この条件に合う記録'
    : `この条件に合う${LISTING_COUNT_LABEL}の記録`;
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
export const FILTER_SITE_EMPTY_BODY =
  '記録に販売サイトを入れると、ここから選べます。';

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
  return totalCount === 0
    ? FILTER_TAG_SECTION_LABEL
    : `${FILTER_TAG_SECTION_LABEL}（${presetCountLabel(totalCount)}）`;
}

/**
 * 検索で絞った一覧の下（案 35f）。「32件のうち2件が該当」。
 * **絞り込みの条件ではなく一覧の見え方の話**なので、下部の件数とは別の語にする。
 */
export function filterTagSearchResultLabel(
  totalCount: number,
  matchedCount: number,
): string {
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
export function filterTagSearchEmptyBody(
  selectedNames: readonly string[],
): string | null {
  if (selectedNames.length === 0) return null;
  const head = selectedNames[0];
  const names =
    selectedNames.length === 1
      ? head
      : `${head}${presetOverflowLabel(selectedNames.length - 1)}`;
  return `選んでいるタグ（${names}）は、そのまま効いています。`;
}

// ---- UI-SPEC §1.6-1 使いかた / §1.6-2 記録群 ----

/** 設定の先頭の 1 行カードと、その下の注記（UI-SPEC §1.6-1） */
export const HELP_LINK_LABEL = '使いかた';
export const HELP_LINK_NOTE =
  '各画面の右上の「？」からも、その画面の説明だけを開けます。';

/**
 * 記録まわりの設定の群（UI-SPEC §1.6-2）。見出しはタブ名と同じ語 ──
 * どのタブに効く設定なのかを、見出しとタブバーで別の語にしない。
 */
export const RECORD_SETTINGS_SECTION_TITLE = RECORDS_TAB_LABEL;

/**
 * 新規作成時の種別（SPEC-V2 §3.4）。注記で**効く範囲**まで言う ──
 * 「既定の種別」だけだと、保存済みの記録の種別まで変わると読めてしまう。
 */
export const DEFAULT_RECORD_KIND_LABEL = '新規作成時の種別';
export const DEFAULT_RECORD_KIND_NOTE =
  '新しく記録を追加するときに最初に選ばれている種別です。保存済みの記録の種別は変わりません。';

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

/** 目標利益の列（SPEC-V9 §3）。決めていない記録は**空欄**（0 とは書かない） */
export const TARGET_PROFIT_COLUMN = '目標利益';

/**
 * データ保存用の 19 列（§5.3 ＋ SPEC-V4 §5.3 ＋ SPEC-V9 §3）。
 * 並びは **先頭 3 列（販売日 / 商品名 / 販売価格）→ 内訳 → 計算値 → 属性 → メモ → 記録ID**（§5.2）。
 * 先頭 3 列が固定なのは、会計ソフトの取込ウィザードで先頭数列だけ選べば済むようにするため。
 *
 * **目標利益は収支の直後**（SPEC-V9 §3）── 表計算で「目標に対して実際いくらだったか」を
 * 横に並べて読むための列なので、属性の側へ流すと 2 つが離れて比べられなくなる。
 * 確定申告用（11 列）には足さない ── 帳簿に「目標」の欄は無い。
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
  TARGET_PROFIT_COLUMN,
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
 * 日ごとにまとめた行の販売サイト（§5.2.2）:「フリマA ほか1件」。
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
export const EXPORT_KIND_OPTIONS: readonly {
  value: 'backup' | 'tax';
  label: string;
}[] = [
  { value: 'backup', label: 'データ保存用' },
  { value: 'tax', label: '確定申告用' },
];

/**
 * 種類の節の下の 1 行。選んでいる方が何のためのものかを言う（列の一覧までは出さない）。
 *
 * **「バックアップにも使えます」を外した**（SPEC-V8 §0.2）── SPEC-V3 §5.2 の時点では
 * 唯一の書き出しだったので正しかったが、**SPEC-V8 で本物の復元が入って嘘になった。**
 * この CSV は読み戻せない（計算値が入り、写真・資材費の 3 列が無く、時刻が落ちている）。
 * 下の EXPORT_NOT_RESTORABLE_NOTE と同じ画面に並ぶので、残すと真っ向から矛盾する。
 */
export const EXPORT_KIND_NOTES: Record<'backup' | 'tax', string> = {
  backup:
    'メモやタグも含めて、記録した内容をすべて書き出します。表計算で見るための形です。',
  tax: '帳簿に要る列だけを書き出します。メモとタグは出しません。',
};

/**
 * 書き出し画面に出す**復元との関係**（SPEC-V8 §0.2 / §5.1）。
 *
 * **書き出しとバックアップはどちらも CSV が出てくるので、画面の名前だけでは区別が付かない。**
 * この 1 行が無いと「データ保存用」を選んだ人が、戻せないファイルを持って機種変更する。
 * **どちらの種類を選んでいても出す** ── 確定申告用はなおさら戻せない。
 *
 * 行き先（「バックアップと復元」）を名指しするのは、否定だけで終わらせないため。
 */
export const EXPORT_NOT_RESTORABLE_NOTE =
  'このCSVは復元には使えません。機種変更などでデータを移すときは「バックアップと復元」をお使いください。';

/** まとめ方の 2 択（§5.2.2）。**確定申告用のときだけ出す** */
export const EXPORT_GROUPING_OPTIONS: readonly {
  value: 'record' | 'day';
  label: string;
}[] = [
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
export const EXPORT_TARGET_OPTIONS: readonly {
  value: boolean;
  label: string;
}[] = [
  { value: false, label: `${SOLD_RECORDS_LABEL}のみ` },
  { value: true, label: `${LISTING_STATUS_LABEL}も含める` },
];

/** 実行ボタン（§5.7）。**期間シートと違い確定ボタンを置く**（取り消せない操作なので） */
export const EXPORT_SUBMIT_LABEL = '書き出す';

/**
 * 下端の左（§5.7）:「2026年8月・売れた記録」。期間名は月バーと同じ書式（periodTitle）。
 * **押す前に何が出るかを読ませる行**なので、効いている条件をそのまま並べる。
 */
export function exportSummaryLabel(
  period: Period,
  includeListing: boolean,
): string {
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
export function exportCountLabel(
  recordCount: number,
  rowCount: number,
): string {
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
export function exportPreviewMetaLabel(
  shownRows: number,
  columnCount: number,
): string {
  return `先頭${shownRows}行・全${columnCount}列`;
}

/**
 * プレビューの表の下に出す注意書き（SPEC-V6 §4）。**ヘッダ行には入れない** ──
 * 列名は表計算ソフトがそのまま項目名として使うので、注記が混ざると邪魔になる。
 * 画面の側で 1 行言えば、CSV の中身を汚さずに済む。
 */
export const CSV_SHIPPING_MATERIAL_NOTE = `送料には${SHIPPING_MATERIAL_LABEL}の代金を含みます`;

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
export const EXPORT_SHARING_UNAVAILABLE =
  'この端末では共有シートを開けませんでした。';

/** 書き出しに失敗したとき（§5.6）。原因は端末側なので、言えるのは「できなかった」まで */
export const EXPORT_FAILED_MESSAGE =
  '書き出せませんでした。もう一度お試しください。';

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

/** 「✕」に読ませる文（§3.1）。消えるのが写真だけであることは、記号からは読み取れない */
export function photoRemoveAccessibilityLabel(): string {
  return `${PHOTO_FIELD_LABEL}を${PHOTO_REMOVE_LABEL}`;
}

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
export const PHOTO_PERMISSION_DENIED_MESSAGE =
  '写真へのアクセスが許可されていません。';

/** 上の文と対で出すリンク（§3.3）。iOS の設定アプリのこのアプリの画面を開く */
export const PHOTO_OPEN_SETTINGS_LABEL = '設定を開く';

/** 縮小・保存に失敗したとき（§3.3）。原因は端末側なので言えるのはここまで */
export const PHOTO_SAVE_FAILED_MESSAGE = '写真を保存できませんでした。';

// ---- 使いかたの図の中の語（HelpPartFigure / HelpDiagram。案 `19c` / `20a`） ----
//
// 図が出す文もここに集める。**図の中の「画面に出ている語」は定数を共有する**（部品を
// 実物にしてあるのと同じ理由。HelpPartFigure の冒頭参照）── 画面の語を直したときに、
// 図だけ古い語のまま残るのを構造で防ぐ。ここに置くのは図にしか無い文だけ。
//
// 金額・商品名・タグ名などの**作り物のデータ**（「洋服」「クッション」「800」）は
// 図の中に残す ── あれは語ではなく題材で、図ごとに読みやすい値を選ぶものだから。

/** 部品の下に 1 行付ける説明（HelpPartFigure の PartFrame の note） */
export const HELP_FIGURE_MODE_PROFIT_NOTE = 'この 2 つで切り替えます';
export const HELP_FIGURE_MODE_TARGET_NOTE =
  'こちらに切り替えると、ほしい利益から販売価格を出します';
export const HELP_FIGURE_CALCULATOR_NOTE = '青いボタンを押すと電卓が開きます';
/** 手数料の行だけ電卓ボタンが無いこと（金額の欄と並べて読む） */
export const HELP_FIGURE_COMMISSION_FIELD_NOTE =
  'ここだけ電卓が出ません。「−」「＋」で 1% ずつ動かします';
export const HELP_FIGURE_BREAKDOWN_NOTE =
  '「内訳」を押すと、この帯と項目ごとの金額が出ます';
export const HELP_FIGURE_PRESET_TAG_NOTE =
  'タグの印を押すと、登録した値から選べます';
/** 45b の 2 択（SPEC-V6 §3）。**押した側の額がそのまま欄に入る**ことを言う */
export const HELP_FIGURE_SHIPPING_MATERIAL_NOTE =
  '資材の代金を登録した送料だけ、この 2 つが出ます';
export const HELP_FIGURE_ADD_RECORD_NOTE =
  '記録タブの左下・タブバーの上にあります';
export const HELP_FIGURE_KIND_SELECTOR_NOTE = '記録の画面のここで選びます';
export const HELP_FIGURE_STATUS_TOGGLE_NOTE =
  '左が今の状態、右を押すともう一方に変わります';
export const HELP_FIGURE_PHOTO_NOTE =
  '空の枠を押すと写真を選べます。付いた写真は右上の「✕」で外せます';
export const HELP_FIGURE_TAG_ROW_NOTE =
  '「＋」を押すと選べます。まだ無いタグはその場で作れます';
export const HELP_FIGURE_MONTH_BAR_NOTE =
  '「◀」「▶」で前後の月へ。月の名前を押すと期間を選べます';
export const HELP_FIGURE_FILTER_ENTRY_NOTE =
  '右端の「▽」から開きます。効いている間は青くなります';
export const HELP_FIGURE_SEARCH_SORT_NOTE = '左が商品名でさがす、右が並び替え';
export const HELP_FIGURE_SOLD_LISTING_NOTE =
  '上の合計も、選んだほうの記録で計算されます';
export const HELP_FIGURE_PRESET_LIST_NOTE =
  '設定タブの「入力を減らす」に、この形で並びます';
/** 目標欄（SPEC-V9 §2）。**空欄が 0 ではない**ことだけを言う */
export const HELP_FIGURE_TARGET_FIELD_NOTE =
  '入れていないときは「決めていません」。「¥0」とは別のものです';
/** 価格ライン（§9.6）。**目盛りは目標の有無で 2 点にも 3 点にもなる**ことを言う */
export const HELP_FIGURE_PRICE_LINE_NOTE =
  '目標を決めていない記録では、真ん中の目盛りが出ません';
/** シミュレーター（§9.9）。図では動かせないことを断る */
export const HELP_FIGURE_SIMULATOR_NOTE =
  'つまみを動かすと、その価格での見込みが上に出ます（この図では動きません）';
/** データタブの 3 択（案 3c）。**押す場所**を言う */
export const HELP_FIGURE_DATA_MODES_NOTE = 'グラフのカードの上端にあります';
/** タグ別の 2 択（案 1b）。カードの右上という位置が見落とされやすい */
export const HELP_FIGURE_TAG_VIEW_NOTE = 'タグのカードの右上で切り替えます';
/** 写真を含めるか（SPEC-V8 §4）。**既定と、含めなかったときの結果**を言う */
export const HELP_FIGURE_PHOTO_INCLUDE_NOTE =
  '既定は「含める」。「含めない」で作ると、そのファイルから写真は戻せません';
/** バッジの文字（設計案 49c）。専用の入力欄が無いことを言う */
export const HELP_FIGURE_PRESET_BADGE_NOTE = 'バッジそのものを押すと文字を直せます';
/** 記録詳細の帯（§4）。凡例の代わりが下の丸であることを言う */
export const HELP_FIGURE_RECORD_BAR_NOTE =
  '帯の色は、下の行に付いた同じ色の丸が表します';
/** 色の 2 群（設計案 50c）。上下の意味だけを言う（使い切ったときの形は本文が持つ） */
export const HELP_FIGURE_COLOR_GROUPS_NOTE =
  '上がまだ使っていない色、下が使用中。どちらも押して選べます';
export const HELP_FIGURE_EXPORT_TARGET_NOTE = `既定は「${SOLD_RECORDS_LABEL}のみ」です`;
export const HELP_FIGURE_EXPORT_PREVIEW_NOTE = '押すと全部の行を見られます';

/** 図の中で 2 つを並べて見せるときの見出し（絞り込みの入口・⌕ と ⇅） */
export const HELP_FIGURE_FILTER_OFF_CAPTION = '絞り込みなし';
export const HELP_FIGURE_FILTER_ON_CAPTION = '絞り込み中';
export const HELP_FIGURE_SEARCH_CAPTION = 'さがす';

/** 抽象的な図（HelpDiagram）の見出し。図が何の場面を描いているかを言う */
export const HELP_FIGURE_KIND_SUBTITLE_SUFFIX = 'で売れたとき';
export const HELP_FIGURE_SITE_AMOUNT_SUBTITLE =
  '同じ 1 件を、どこまで引いた金額で見ているか';
export const HELP_FIGURE_TARGET_SUBTITLE = 'ほしい利益が先に決まっているとき';
/**
 * 書き出し（CSV）2 種の図の見出し。
 *
 * **`BACKUP` を名前に入れない**（旧 `HELP_FIGURE_BACKUP_SUBTITLE`）── CSV の種類の一方が
 * 「データ保存用」（内部の値は `backup`）なのでそう呼んでいたが、SPEC-V8 で
 * 本物の「バックアップと復元」が入ったあとは、定数名だけ読むとあちらの図に見える。
 * 表示文言は変えていない。
 */
export const HELP_FIGURE_CSV_KINDS_SUBTITLE = '減るのはメモとタグだけ';
export const HELP_FIGURE_COST_PARTS_SUBTITLE =
  'このアプリが販売価格から引くのは、この 5 つ';
export const HELP_FIGURE_DAY_GROUP_SUBTITLE = '同じ日に 3 件売れたとき';
/** 復元前のプレビュー（SPEC-V8 §5.4）。**置き換えであることを図の題で言う** */
export const HELP_FIGURE_BACKUP_PREVIEW_SUBTITLE =
  '古いファイルを選んでしまったとき';
export const HELP_FIGURE_BACKUP_REPLACE_NOTE =
  '赤い数字は減るもの。押すとこの中身に置き換わります';
/** 実績の 2 とおり（案 3c）。段を登るものと 1 回だけのもの */
export const HELP_FIGURE_ACHIEVEMENT_KINDS_SUBTITLE = '実績には 2 とおりある';
export const HELP_FIGURE_ACHIEVEMENT_LADDER_LABEL = '5 段階で登るもの（⚡一撃の例）';
export const HELP_FIGURE_ACHIEVEMENT_ONCE_LABEL = '条件を満たすと 1 回だけ付くもの';

/** 帯・行の中の語（図にしか無いもの。画面に出る語は定数を共有する） */
export const HELP_FIGURE_KEPT_LABEL = '残る分';
export const HELP_FIGURE_TARGET_PROFIT_LABEL = 'ほしい利益';
export const HELP_FIGURE_SALE_DATE_RANGE_LABEL = '販売日に選べる範囲';
export const HELP_FIGURE_TARGET_ROW_TITLE = 'ほしい利益から逆に足す';
export const HELP_FIGURE_HIT_LABEL = '出る';
export const HELP_FIGURE_MISS_LABEL = '出ない';
export const HELP_FIGURE_INCLUDED_LABEL = '入る';
export const HELP_FIGURE_EXCLUDED_LABEL = '入らない';
export const HELP_FIGURE_NONE_MARK = '－';
export const HELP_FIGURE_FILE_LABEL = 'ファイル';
export const HELP_FIGURE_SCREEN_LABEL = '画面';

/** CSV に何が入るかの表（§5.2 の列を 5 つの束にまとめたもの） */
export const HELP_FIGURE_CSV_BASIC_LABEL = '日付・商品名・金額';
export const HELP_FIGURE_CSV_SITE_LABEL = '販売サイト・種別';
export const HELP_FIGURE_CSV_BREAKDOWN_LABEL = '経費の内わけ';

/** 5 つの経費それぞれの説明（名前の側は画面と同じ定数を使う） */
export const HELP_FIGURE_PURCHASE_NOTE = `売るために買ったお金（${RECORD_KIND_LABELS.used}では出ません）`;
export const HELP_FIGURE_POSTAGE_NOTE = '発送にかかったお金';
export const HELP_FIGURE_COMMISSION_NOTE = '販売サイトに引かれるお金';
export const HELP_FIGURE_ENVELOPE_NOTE = '箱・封筒・テープなど';
export const HELP_FIGURE_OTHERS_NOTE = '交通費など、上に当てはまらないもの';

/** 図の見出しのうち、題材の金額や語をそのまま含むもの（値は図が持つ） */
export function helpFigureBothSoldSubtitle(price: string): string {
  return `どちらも${SALES_PRICE_LABEL} ${price}で売れたとき`;
}
/**
 * 目標と下げ幅の図の見出し（SPEC-V9 §1.2 / §4.3）。**同じ 1 件だと題で言う** ──
 * 3 行を別々の記録だと読まれると、「目標の決め方で変わる」という関係そのものが消える。
 *
 * 金額を引数で受けるのは、図が持つ題材（`PRICING_EXAMPLE`）と食い違わせないため ──
 * 見出しに「¥5,000」と書き込んでしまうと、題材を変えたときに題だけが古い額を主張する。
 */
export function helpFigureTargetRoomSubtitle(price: string): string {
  return `同じ記録（今の価格 ${price}）で、目標だけを変えたとき`;
}
export function helpFigureSourcedRowTitle(purchasePrice: string): string {
  return `${RECORD_KIND_LABELS.sourced}（${PURCHASE_PRICE_LABEL} ${purchasePrice}）`;
}
export function helpFigureSingleRecordLabel(kind: RecordKind): string {
  return `${RECORD_KIND_LABELS[kind]} 1 件`;
}
export function helpFigureSiteAmountMeasure(amount: string): string {
  return `サイトの表示 ${amount}（${COMMISSION_SHORT_LABEL}と${POSTAGE_LABEL}まで）`;
}
export function helpFigureAppAmountMeasure(amount: string): string {
  return `このアプリ ${amount}（${ENVELOPE_COST_LABEL}ほかも引く）`;
}
export function helpFigureTotalPriceMeasure(price: string): string {
  return `これが${SALES_PRICE_LABEL} ${price}`;
}
export function helpFigureTagOrSubtitle(first: string, second: string): string {
  return `「${first}」と「${second}」を選ぶと`;
}

/**
 * 図: 複製で写るもの・写らないもの（記録ページ）。
 * 欄の名前は画面の表示語をそのまま使い、ここでは**群の見出しと、値が変わる 2 つ**だけ持つ。
 */
export const HELP_FIGURE_DUPLICATE_SUBTITLE = '複製元から新しい記録へ';
export const HELP_FIGURE_DUPLICATE_COPIED_LABEL = '写る';
export const HELP_FIGURE_DUPLICATE_SKIPPED_LABEL = '写らない';
export const HELP_FIGURE_DUPLICATE_DATE_LABEL = '日付（今日から）';
export const HELP_FIGURE_DUPLICATE_STATUS_LABEL = `状態（${LISTING_STATUS_LABEL}から）`;

/**
 * 図: 機種変更の 1 往復（残すページ）。
 * **端末どうしが直接つながらない**ことを、間にファイルを挟んだ形で見せる。
 */
export const HELP_FIGURE_MIGRATE_SUBTITLE = 'ファイルを 1 往復させる';
export const HELP_FIGURE_MIGRATE_OLD_LABEL = '古い端末';
export const HELP_FIGURE_MIGRATE_NEW_LABEL = '新しい端末';

/** 図の中だけで使う短縮形・補助の語 */
export const HELP_FIGURE_TOTAL_CAPTION = '2 件以上をまとめた金額';
export const HELP_FIGURE_PURCHASE_SHORT_LABEL = '仕入';
export const HELP_FIGURE_PACK_QUANTITY_LABEL = '入数';
export const HELP_FIGURE_PACK_SUBTITLE = '購入価格を何で割るかだけが違う';
/** 面積方式の 2 段目（1㎡ あたり → 1 回あたり）。cm の 2 値は掛けたあとの ㎡ で見せる */
export const HELP_FIGURE_PACK_AREA_LABEL = '購入サイズ';
export const HELP_FIGURE_PACK_USE_LABEL = '平均使用サイズ';
export const HELP_FIGURE_PACK_USAGE_LABEL = '想定使用回数';
export const HELP_FIGURE_ONE_BY_ONE_LABEL = '1 件ずつ';
export const HELP_FIGURE_GROUPED_LABEL = '日ごとにまとめる';
export const HELP_FIGURE_ROUNDING_SUBTITLE = '10.4 円と 10.4 円の 2 件なら';
export const HELP_FIGURE_ROUND_FIRST_LABEL = '10 ＋ 10（先に丸める）';
export const HELP_FIGURE_ROUND_LAST_LABEL = '20.8（後で丸める）';

/**
 * 図 8（書き出しの 2 種類）の見出し（案 `20a`）。**列数は実際の列の並びから数える** ──
 * 図に「19 列」と書いておくと、列を 1 つ足したときに図だけが古くなる。
 */
/**
 * 図 12（梱包材の 3 方式）の 2 段目。面積方式だけは 1㎡ あたりのあとに **1 回あたり**が続くので、
 * 表の下に 1 行だけ添える。**語を組み立てるのはここ**（図の側で文を作らない）。
 */
export function helpFigurePackUseNote(size: string, price: string): string {
  return `${HELP_FIGURE_PACK_USE_LABEL} ${size} を入れると ${PRESET_USE_PRICE_LABEL} ${price}`;
}

export function helpFigureCsvKindLabel(kind: 'backup' | 'tax'): string {
  const columns = kind === 'backup' ? CSV_BACKUP_COLUMNS : CSV_TAX_COLUMNS;
  const label =
    EXPORT_KIND_OPTIONS.find((option) => option.value === kind)?.label ?? '';
  return `${label}\n${columns.length} 列`;
}

// ---- SPEC-V8 バックアップと復元 ----
//
// **既存の「書き出し（CSV）」の語とは分けて持つ**（§0.2）── あちらは「書き出し」、
// こちらは「バックアップ」。同じ語を使い回すと、設定の 2 行が同じものに見えて
// 「どちらを押せば機種変更で困らないか」が読めなくなる。

/** 設定タブ「データ」群の 3 行目（§5.1）。書き出し（CSV）の下に並ぶ */
export const BACKUP_LABEL = 'バックアップと復元';

/** バックアップ画面の見出し（§5.2） */
export const BACKUP_SCREEN_TITLE = BACKUP_LABEL;

/** backup-info.csv のファイル名（§1.2）。logic/backup.ts と画面の両方が使う */
export const BACKUP_INFO_FILE = 'backup-info.csv';

// ---- 画面 1: バックアップを作る（§5.3・設計案 53a / 53b） ----
//
// **1 枚に 2 つのカードと、下端に固定した 1 つのボタン。**
// カード 1 が「何ができるか」、カード 2 が「写真をどうするか」、
// 押す口は下端に 1 つだけ ── 親指の届く場所に、押せるものを 1 つに絞る。

export const BACKUP_CREATE_SECTION_TITLE = 'バックアップを作る';
export const BACKUP_CREATE_BUTTON_LABEL = 'バックアップを作る';

/**
 * 作る側の説明（案 53a）。**行き先（新しい端末）まで書く。**
 *
 * 「全件が入る」「期間の指定はない」は件数の帯（下の 3 つの数字）が見せるので、
 * 文では「何のために作るのか」だけを言う ── 機種変更で困らないためのものだ、と
 * 分かる位置に置かないと、隣の「書き出し（CSV）」との違いが読めない。
 */
export const BACKUP_CREATE_NOTE =
  '今あるデータをまとめて1つのファイルにします。機種を変えるときは、このファイルを新しい端末に渡してください。';

/** 件数の帯（案 53a）。「記録 53件」の形で 3 つ並べる */
export const BACKUP_COUNT_RECORDS_LABEL = '記録';
export const BACKUP_COUNT_TAGS_LABEL = 'タグ';
export const BACKUP_COUNT_PRESETS_LABEL = 'プリセット';
export const BACKUP_COUNT_PHOTOS_LABEL = '写真';

/** 「記録 53件」（帯の 1 つ）。ラベルと数の間は半角空き 1 つ */
export function backupCountChipLabel(label: string, count: number): string {
  return `${label} ${presetCountLabel(count)}`;
}

/** 写真の枚数（「31枚」）。件（記録・タグ・プリセット）とは単位を変える */
export function photoCountLabel(count: number): string {
  return `${count}枚`;
}

// ---- 写真を含めるか（SPEC-V8 §4 / 案 53a） ----
//
// **トグルではなく 2 択にする。** トグルは「いま入っているのか、切っているのか」を
// 色と位置だけで示すもので、50 代の利用者には読み取りに時間がかかる。
// 2 択なら選択肢の中に枚数とサイズを書けるので、「含めるとは何のことか」が
// 選ぶ瞬間に目に入る。既定は左の「含める」（バックアップは全部戻せるのが本来）。

export const BACKUP_PHOTO_SECTION_TITLE = '商品の写真';
export const BACKUP_PHOTO_INCLUDE_LABEL = '含める';
export const BACKUP_PHOTO_EXCLUDE_LABEL = '含めない';

/** 「含める」の下に出す実測（53枚・8.2MB）。**合計サイズは実体を読まずに出す**（§4.4） */
export function backupPhotoIncludeDetail(count: number, bytes: number): string {
  return `${photoCountLabel(count)}・${formatByteSize(bytes)}`;
}

/** 「含めない」の下に出す利点。否定の選択肢にも選ぶ理由を書く */
export const BACKUP_PHOTO_EXCLUDE_DETAIL = 'ファイルが軽い';

/**
 * バイト数を読める形に。MB は小数 1 桁、KB 未満は「1KB未満」に丸める。
 *
 * **割り切れるときは小数を落とす**（`50.0MB` ではなく `50MB`）── 上限のように
 * 定数として出す数字に `.0` が付くと、意味のない桁を読ませることになる。
 */
export function formatByteSize(bytes: number): string {
  const mb = bytes / 1024 / 1024;
  if (mb >= 1) return `${Number(mb.toFixed(1))}MB`;
  const kb = bytes / 1024;
  if (kb >= 1) return `${Math.round(kb)}KB`;
  return '1KB未満';
}

/**
 * **写真が入らないことの警告（案 53b）。** 選択カードの**直下**に出す。
 *
 * 「含めない」を選んだ**その瞬間**に、選んだ場所のすぐ下で言う ── 作ったあとに
 * 気付いても遅い。下端のボタン名（BACKUP_CREATE_WITHOUT_PHOTOS_LABEL）と合わせて
 * **2 か所**で言うのは、片方だけでは押す前の視線に入らないことがあるため。
 */
export const BACKUP_NO_PHOTO_WARNING =
  'このバックアップに写真は含まれません。新しい端末で写真は表示されなくなります。';

/** 上限に当たった人の逃げ道（§4.4）。**否定で終わらせない** */
export const BACKUP_CREATE_WITHOUT_PHOTOS_LABEL = '写真なしで作る';

/**
 * 中身が CSV であることの位置づけ（SPEC-V8 §0.3 / §10）。
 *
 * **開けてしまうことを隠さない。** ZIP を解凍すれば CSV が 5 枚出てくるので、
 * 黙っていると「CSV なら表計算で直せる」と読まれる ── 直したものを読み込ませる前提では
 * 設計していない（列も型も参照も厳しく見るので、少し触ると弾かれる）。
 *
 * **「編集できません」とは言わない**（§10）── 禁止する実装は入れておらず、
 * 検証を通れば読み込める。言えるのは「想定していない」まで。
 *
 * 写真の警告（BACKUP_NO_PHOTO_WARNING）とは重さが違うので**カードの外に小さく置く** ──
 * あちらは知らないと失う（写真が戻らない）が、こちらは知らなくても損はしない。
 */
export const BACKUP_CSV_INSIDE_NOTE =
  '中身はCSVですが、確認用です。編集して読み込むことは想定していません。';

// ---- 作っている間（案 53a 右） ----
//
// **ボタンをそのまま進捗バーに変える。** 別の場所に印を出すと、押した指の先から
// 反応が消えて「効いたのか」が読めない。進捗は写真の枚数で数える ──
// 止まって見える時間のほとんどが写真の読み出しなので、そこだけが動けば十分。

export const BACKUP_CREATING_LABEL = '作っています...';

/** 「写真 34枚目 / 53枚」。**何枚目まで進んだか**を出す（率は出さない） */
export function backupPhotoProgressLabel(done: number, total: number): string {
  return `写真 ${done}枚目 / ${photoCountLabel(total)}`;
}

/** 進捗の右に添える 1 語。**待てば終わる**ことだけを言う */
export const BACKUP_PROGRESS_WAIT_NOTE = 'このままお待ちください';

/**
 * 下端のボタンの下に出す 1 行（案 53a）。
 *
 * **「前回」を出すのは、間隔が空いたことに自分で気付けるようにするため。**
 * 通知も催促もしないので、思い出す手がかりはこの 1 行しかない。
 */
export function backupLastCreatedNote(createdAt: string | null): string {
  if (createdAt == null) return 'まだ一度も作っていません';
  return `前回作ったのは ${backupDayLabel(createdAt)}`;
}

/** 「2026年7月2日」。保存形式 "YYYY-MM-DDTHH:mm:ss.SSS" から日付だけを出す */
export function backupDayLabel(date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  if (match == null) return date;
  const [, year, month, day] = match;
  return `${year}年${Number(month)}月${Number(day)}日`;
}

export const BACKUP_SHARE_DIALOG_TITLE = 'バックアップを保存';
export const BACKUP_CREATE_FAILED_MESSAGE = 'バックアップを作れませんでした。';
export const BACKUP_SHARING_UNAVAILABLE = 'この端末では共有できません。';

// ---- 画面 2: 上限を超えたとき（§4.4 / 案 53e） ----
//
// **押す前には何も出さない。** 大半の利用者に無関係な数字で、先に見せると
// 「50MB とは何枚か」を考えさせることになる。超えた人にだけ、押した後に
// **下からのシート**で受け止める ── ダイアログより文を長く書けて、
// 棒グラフで「あと少しなのか、大幅に超えているのか」まで見せられる。

export const BACKUP_PHOTO_LIMIT_TITLE = '写真が多すぎます';

/** 何が起きるのかを、起きる順に 1 文で。「上限」の語より先に結果を言う */
export const BACKUP_PHOTO_LIMIT_MESSAGE =
  '写真を全部入れると、作っている途中でアプリが止まってしまいます。';

/** 棒グラフの左の見出し（「今の写真 53枚」） */
export function backupPhotoLimitBarLabel(count: number): string {
  return `今の写真 ${photoCountLabel(count)}`;
}

/** 棒グラフの下の目盛り（左端は 0、右端は上限） */
export const BACKUP_PHOTO_LIMIT_BAR_MIN = '0';

export function backupPhotoLimitBarMax(limit: number): string {
  return `上限 ${formatByteSize(limit)}`;
}

/**
 * シートの下の補足（案 53e）。**失うものと残るものを分けて言う。**
 *
 * 「写真なしで作る」を押させる前に、**それでも移せるもの**を件数で見せる ──
 * 数字が無いと「写真が入らないなら意味がない」と読まれて、
 * バックアップそのものを取らずに終わる。
 */
export function backupPhotoLimitFooter(counts: {
  records: number;
  tags: number;
  presets: number;
}): string {
  return (
    `写真なしでも、記録${counts.records}件・タグ${counts.tags}件・プリセット${counts.presets}件は` +
    `すべて新しい端末に移せます。写真だけは「写真」アプリなどに保存してください。`
  );
}

/**
 * シートを閉じる側（案 53e）。**「キャンセル」ではなく「やめる」。**
 *
 * 押すと写真の選択が「含めない」に切り替わる ── 閉じた先で
 * 「そのまま作る」か「写真を減らしてから戻る」かを選べるようにするため、
 * **同じ行き止まりに戻さない**。
 */
export const BACKUP_LIMIT_CANCEL_LABEL = 'やめる';

// ---- 復元するものを選ぶ（§5.4） ----

export const BACKUP_RESTORE_SECTION_TITLE = '復元する';
export const BACKUP_PICK_FILE_LABEL = 'バックアップのファイルを選ぶ';
export const BACKUP_PICK_FOLDER_LABEL = '解凍したフォルダを選ぶ';

/** 2 つの選び方がある理由を 1 行で（§3.1 / 決定 §8-2） */
export const BACKUP_RESTORE_NOTE =
  'バックアップの ZIP ファイルか、それを解凍したフォルダを選びます。中身を確認するために解凍したあとでも復元できます。';

// ---- 画面 3: プレビュー（§5.4 / 案 53f / 53g） ----
//
// **確認ダイアログは持たない。** ダイアログでは「今あるものがどうなるか」を
// 数字で並べられず、閉じると理由が残らない。この 1 枚が確認そのもので、
// **「今の端末 → ファイル」の差**を出すのが、間違ったファイルに気付く一番強い手がかり。

export const BACKUP_PREVIEW_SCREEN_TITLE = '読み込む中身';
export const BACKUP_PREVIEW_BACK_LABEL = '戻る';

/** 差の表の 2 つの列見出し */
export const BACKUP_DIFF_CURRENT_HEADER = '今の端末';
export const BACKUP_DIFF_FILE_HEADER = 'ファイル';

/** 差の表の行の名前（§4.4）。**写真の行は 0 枚でも出す** ── 差の表では 0 に意味がある */
export const BACKUP_PREVIEW_RECORDS_LABEL = BACKUP_COUNT_RECORDS_LABEL;
export const BACKUP_PREVIEW_TAGS_LABEL = BACKUP_COUNT_TAGS_LABEL;
export const BACKUP_PREVIEW_PRESETS_LABEL = BACKUP_COUNT_PRESETS_LABEL;
export const BACKUP_PREVIEW_PHOTOS_LABEL = BACKUP_COUNT_PHOTOS_LABEL;

/**
 * ファイルのカードの 2 行目（案 53f / 53g）。
 *
 * **相対の語（きょう・きのう）を添える。** 「2026年8月13日」だけでは、
 * それが直前に作ったものか半年前のものかを暗算することになる。
 * 写真の入っていないファイルは、ここでも `・写真なし` と言う（§4.6）。
 */
export function backupPreviewCreatedLine(
  createdAt: string,
  today: Date,
  hasPhotos: boolean,
): string {
  const relative = backupRelativeDayLabel(createdAt, today);
  const day =
    relative == null
      ? backupDayLabel(createdAt)
      : `${backupDayLabel(createdAt)}（${relative}）`;
  return hasPhotos ? `作成日 ${day}` : `作成日 ${day}・写真なし`;
}

/** きょう / きのう / それ以前は null（日付だけで足りる） */
export function backupRelativeDayLabel(
  createdAt: string,
  today: Date,
): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(createdAt);
  if (match == null) return null;
  const [, year, month, day] = match;
  const created = new Date(Number(year), Number(month) - 1, Number(day));
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const days = Math.round((base.getTime() - created.getTime()) / 86_400_000);
  if (days === 0) return 'きょう';
  if (days === 1) return 'きのう';
  return null;
}

/**
 * 表の下の 1 文（案 53f）。**中身を 1 件だけ名指しする。**
 *
 * 件数は合っていても「別の人のファイル」「別のアプリのファイル」であることはあり得る。
 * 商品名 1 つを出せば、見覚えがあるかどうかで一瞬で分かる ──
 * 件数の一致より強い手がかりで、しかも読むのに 1 秒もかからない。
 */
export function backupNewestRecordNote(date: string, itemName: string): string {
  const name = itemName.trim() === '' ? UNTITLED_LABEL : itemName;
  return `中で一番新しい記録は ${backupDayLabel(date)}「${name}」です。見覚えがなければ、別の人のファイルです。`;
}

/**
 * 大きく減るときだけ足す注意帯（案 53f）。
 *
 * 赤い数字は「減る」ことしか言わないので、**減り幅が大きいときだけ**
 * 言葉でも言う ── 古いバックアップを選んでいる典型がここに出る。
 */
export function backupLargeDecreaseNote(current: number, next: number): string {
  return (
    `記録が${presetCountLabel(current)}から${presetCountLabel(next)}に減ります。` +
    `古いバックアップを選んでいないか確かめてください。`
  );
}

/** 写真の入っていないファイルから戻すとき（案 53g）。**損失が二重なので 2 文に分ける** */
export const BACKUP_NO_PHOTO_IN_FILE_TITLE =
  'このファイルに写真は入っていません。';

export function backupNoPhotoInFileBody(devicePhotos: number): string {
  return (
    `写真は復元されません。今この端末にある写真${photoCountLabel(devicePhotos)}も、` +
    `いっしょに削除されます。`
  );
}

/** 赤いボタンの上に置く警告（案 53f）。**取り消せないことを最後に言う** */
export function backupReplaceWarning(records: number): string {
  return (
    `今あるデータ（記録${presetCountLabel(records)}）はすべて消えて、` +
    `ファイルの中身に置き換わります。元には戻せません。`
  );
}

export const BACKUP_REPLACE_ALL_LABEL = 'すべて置き換える';

/** 写真の入っていないファイルのとき（案 53g）。**ボタン名でも写真のことを言う** */
export const BACKUP_REPLACE_WITHOUT_PHOTOS_LABEL = '写真なしで置き換える';

export const BACKUP_PICK_ANOTHER_FILE_LABEL = '別のファイルを選ぶ';

/** 復元の最中（写真を書き戻している間）。作るときと同じ形で出す */
export const BACKUP_RESTORING_LABEL = '読み込んでいます...';

// ---- 画面 5: 復元できたとき（§5.6 / 案 53k） ----

export const BACKUP_RESULT_SCREEN_TITLE = '読み込みの結果';
export const BACKUP_RESTORED_TITLE = '復元しました。';

/** 写真の行（案 53k）。**欠けたぶんは括弧で添える**（行そのものは消さない） */
export function backupRestoredPhotoValue(
  restored: number,
  missing: number,
): string {
  if (missing === 0) return photoCountLabel(restored);
  return `${photoCountLabel(restored)}（${photoCountLabel(missing)}は復元できず）`;
}

/**
 * 欠けた写真の説明（案 53k）。**警告色は使わない。**
 *
 * これはエラーではなく起きたことの報告なので、赤い帯にはしない ──
 * 復元そのものは成功していて、金額も日付も入っている（§4.3）。
 * 言うのは「なぜ欠けたか」と「その記録はどうなったか」の 2 つ。
 */
export function backupMissingPhotoNote(missing: number): string {
  return (
    `写真${photoCountLabel(missing)}はファイルの中に無いか壊れていたため、` +
    `その${presetCountLabel(missing)}は写真なしの記録として入りました。金額や日付は入っています。`
  );
}

export const BACKUP_RESULT_OPEN_RECORDS_LABEL = '記録を見る';

/** 欠けた写真があるときだけ出す 2 つ目の口（案 53k） */
export function backupMissingPhotoRecordsLabel(missing: number): string {
  return `写真がなかった${presetCountLabel(missing)}を見る`;
}

/** 欠けた記録の一覧（上の口を押したときに開く）の見出し */
export const BACKUP_MISSING_PHOTO_LIST_TITLE = '写真がなかった記録';

// ---- 画面 4: エラー（§3.3 / 案 53h） ----
//
// **文言の型は 3 行で固定する**（§3.3）:
//   バックアップを読み込めませんでした。
//   〈どこが〉〈なぜ〉
//   現在のデータは変更されていません。
//
// 3 行目を必ず付けるのは、失敗したときに利用者が一番知りたいのが
// 「壊れていないか」だから ── 全置換の機能なので、途中まで入った可能性を疑わせない。
//
// **ダイアログでは出さない**（案 53h）。ダイアログは 3 行が同じ大きさの塊になり、
// 閉じると理由が残らない ── 行番号を家族に見せながら相談することもできない。
// 画面の中の赤枠のカードに出し、**3 行目だけは緑の帯に分ける**
// （赤の中に埋めると「無事だった」ことが読み飛ばされる）。

export const BACKUP_ERROR_TITLE = 'バックアップを読み込めませんでした。';
export const BACKUP_ERROR_UNCHANGED_NOTE = '現在のデータは変更されていません。';

/**
 * 理由の下に置く 1 文（案 53h）。**部分的に入っていないことと、次の一手**を言う。
 *
 * 「1か所でも」と言い切るのは §3.2 の約束（1 件でもエラーがあれば一切読み込まない）
 * そのもので、利用者から見れば「途中まで入った」を疑わなくていい根拠になる。
 */
export const BACKUP_ERROR_HINT =
  '1か所でも読めない値があると、途中まで入れることはしません。ファイルを作り直すか、別のファイルを選んでください。';

/**
 * 「この内容をコピーする」で持ち出す文（案 53h）。
 *
 * **画面に出ている 3 行をそのまま**渡す ── 家族や問い合わせ先に転記するときに、
 * 行番号と列名が落ちると調べようがない。**長押しではなく普通のボタン**にしてあるのは、
 * 長押しは金額の行（LongPressCopy）でだけ使う作法にしているため。
 */
export function backupErrorCopyText(reason: string): string {
  return [
    BACKUP_ERROR_TITLE,
    reason,
    BACKUP_ERROR_HINT,
    BACKUP_ERROR_UNCHANGED_NOTE,
  ].join('\n');
}

/** コピーできたときのトーストに出す語（copiedMessage に渡す） */
export const BACKUP_ERROR_COPY_LABEL = 'この内容をコピーする';
export const BACKUP_ERROR_COPY_TOAST_LABEL = 'エラーの内容';

/** 「records.csv 501行目：「仕入価格」が正しい数値ではありません。」（§3.3 の例） */
export function backupColumnErrorMessage(
  fileName: string,
  lineNumber: number,
  columnLabel: string,
  reason: string,
): string {
  return `${fileName} ${lineNumber}行目：「${columnLabel}」${reason}`;
}

export const BACKUP_NUMBER_ERROR = 'が正しい数値ではありません。';
export const BACKUP_DATE_ERROR = 'が正しい日付ではありません。';
export const BACKUP_BOOLEAN_ERROR = 'が 0 か 1 ではありません。';

export function BACKUP_ENUM_ERROR(values: readonly string[]): string {
  return `が ${values.join(' / ')} のどれでもありません。`;
}

export function backupEmptyColumnMessage(
  fileName: string,
  lineNumber: number,
  columnLabel: string,
): string {
  return `${fileName} ${lineNumber}行目：「${columnLabel}」が空です。`;
}

/**
 * 列そのものが違うとき（並べ替え・改名・過不足）。
 *
 * **列名を全部は並べない。** 19 列を 2 回並べると画面が文字で埋まり、
 * 肝心の「どこが違うか」が読めなくなる（実機で確認した）。
 * 出すのは**最初に食い違った 1 か所**だけ ── 直すべき場所はそこから辿れる。
 */
export function backupColumnMismatchMessage(
  fileName: string,
  expected: readonly string[],
  actual: readonly string[],
): string {
  if (expected.length !== actual.length) {
    return `${fileName} の列の数が違います。必要な列は ${expected.length} ですが、ファイルには ${actual.length} あります。`;
  }
  const index = expected.findIndex((name, i) => name !== actual[i]);
  return `${fileName} の列名が違います。${index + 1} 列目は「${expected[index]}」のはずですが「${actual[index]}」になっています。`;
}

export function backupFieldCountMessage(
  fileName: string,
  lineNumber: number,
  expected: number,
  actual: number,
): string {
  return `${fileName} ${lineNumber}行目：項目の数が ${expected} ではなく ${actual} です。`;
}

export function backupMissingFileMessage(fileName: string): string {
  return `${fileName} が見つかりません。`;
}

export function BACKUP_EMPTY_FILE_MESSAGE(fileName: string): string {
  return `${fileName} が空です。`;
}

export function backupUnsupportedVersionMessage(version: number): string {
  return `このバックアップの形式（バージョン ${version}）には対応していません。アプリを更新してください。`;
}

/** 参照先が無い中間行（§3.2）。**FK が効かないぶんの検査** */
export function backupUnknownRecordRefMessage(
  lineNumber: number,
  recordId: string,
): string {
  return `record_tags.csv ${lineNumber}行目：記録ID「${recordId}」が records.csv にありません。`;
}

export function backupUnknownTagRefMessage(
  lineNumber: number,
  tagId: string,
): string {
  return `record_tags.csv ${lineNumber}行目：タグID「${tagId}」が tags.csv にありません。`;
}

/** 選んだものがバックアップに見えないとき（§3.1） */
export const BACKUP_NO_CSV_MESSAGE =
  '選んだファイルはバックアップではないようです。バックアップの ZIP か、それを解凍したフォルダを選んでください。';

/** ZIP として開けなかったとき（壊れている・別形式） */
export const BACKUP_BROKEN_ZIP_MESSAGE =
  'ファイルを開けませんでした。壊れている可能性があります。';

/** フォルダ選択そのものが使えない端末（Directory.pickDirectoryAsync が無い経路） */
export const BACKUP_FOLDER_PICK_UNAVAILABLE =
  'この端末ではフォルダを選べません。ZIP ファイルのまま選んでください。';

// ─────────────────────────────────────────────────────────────────────────────
// 価格と利益の分析「いくらで売る？」（SPEC-V9 §9）の表示語。
//
// **サービス名は一切出さない**（§9.1）。出品先は「出品しているサイト」としか呼ばない ──
// 名前を書くと、そのサイトを使っていない人の画面に無関係な語が出る。
//
// **「¥0」を「決めていない」の意味で使わない**（§1.2）。目標に関わる語は必ず
// `targetProfitSummary` / `TARGET_PROFIT_UNSET_LABEL` を通る。
//
// **「手取り」は使わない**（SPEC-V2 §7-8）。販売サイトが表示する「手取り」は梱包材費や
// その他経費を含まず、このアプリの数字と食い違うため ── この画面でも例外にしない。
// 同じことを言う語は「手元に残る」。
// ─────────────────────────────────────────────────────────────────────────────

/** 画面のタイトル（§9.2）。「分析」とは言わない ── 見たいのは分析ではなく値段 */
export const PRICING_SCREEN_TITLE = 'いくらで売る？';

/**
 * 商品名の右のバッジ（§9.3）:「出品中 14日目」。日数は logic/listingDays の暦日差 + 1
 * （出品当日が 1 日目）。
 *
 * **出品日が未来の記録（日数が負）では日付を出さず、状態だけを出す** ──
 * 「0日目」「-1日目」は読み方が無い。日付の誤りそのものは記録詳細のメタ行が見せる。
 */
export function listingDayBadgeLabel(days: number): string {
  return days < 0
    ? LISTING_STATUS_LABEL
    : `${LISTING_STATUS_LABEL} ${days + 1}日目`;
}

/** 価格が未設定の記録のバッジ（§9.7）。**「未入力」ではない** ── 空欄も 0 円も同じ値で保存されるため */
export const PRICE_UNSET_BADGE_LABEL = '価格 未設定';

/** 主役の数字が負のときに添えるバッジ（§9.5） */
export const LOSS_BADGE_LABEL = '赤字';

/** 主役の数字が出せないとき（価格未設定）の置き字（§9.7）。「¥0」とは書かない */
export const AMOUNT_PLACEHOLDER = 'ーー';

/** 主役の数字の上（§9.4）:「今の価格 ¥5,000 で売れたら」 */
export function currentPriceLeadLabel(price: number): string {
  return `今の価格 ${formatYenSymbol(price)} で売れたら`;
}

/**
 * 主役の数字の下（§9.4）:「手元に残る見込み・利益率 34.0%」。
 * 利益率は小数第 1 位まで（§4.5 の profitRate）。価格 0 では出せないので語だけになる。
 */
export function netProfitEstimateNote(profitRate: number | null): string {
  const head = '手元に残る見込み';
  return profitRate == null
    ? head
    : `${head}・利益率 ${profitRate.toFixed(1)}%`;
}

/** 赤字のときの主役の数字の下（§9.5）:「売っても、手元のお金は ¥550 減ります」 */
export function lossAmountNote(loss: number): string {
  return `売っても、手元のお金は ${formatYenSymbol(Math.abs(loss))} 減ります`;
}

/**
 * 結論の帯の 2 行（§9.6）。**状態ごとに文がまるごと変わる**ので、
 * 「金額を差し替えるだけの 1 つの文」にはしない ── 黒字と赤字では言うべきことが違う。
 *
 * @param kind 目標の語を種別に合わせる（§5.2 の targetProfitLabel）
 */
export function pricingConclusionText(
  conclusion: PricingConclusion,
  analysis: PricingAnalysis,
  kind: RecordKind,
): { headline: string; detail: string } {
  const target = targetProfitLabel(kind);
  const targetAmount =
    analysis.targetProfit == null ? '' : formatYenSymbol(analysis.targetProfit);

  switch (conclusion) {
    case 'safe':
      return {
        headline: `${formatYenSymbol(analysis.breakEven)} までなら赤字になりません。`,
        detail: discountRoomText(analysis.room),
      };
    case 'safeWithTarget':
      return {
        headline: `${formatYenSymbol(analysis.floorPrice)} までなら、${target} ${targetAmount} を保てます。`,
        detail: discountRoomText(analysis.room),
      };
    case 'belowTarget':
      return {
        headline: `${target} ${targetAmount} まで、あと ${formatYenSymbol(analysis.targetShortfall ?? 0)} です。`,
        detail: `${formatYenSymbol(analysis.breakEven)} までなら赤字にはなりません。`,
      };
    case 'loss':
      return {
        headline: `あと ${formatYenSymbol(analysis.breakEvenShortfall)} の値上げで、赤字から抜けます。`,
        detail: `${formatYenSymbol(analysis.breakEven)} で利益ゼロ。それより上なら手元にお金が残ります。`,
      };
    case 'lossWithTarget':
      return {
        headline: `あと ${formatYenSymbol(analysis.breakEvenShortfall)} の値上げで、赤字から抜けます。`,
        detail: `${target} ${targetAmount} まで戻すなら ${formatYenSymbol(analysis.targetPrice ?? 0)}（今より ${formatYenSymbol(analysis.targetShortfall ?? 0)} 上）`,
      };
  }
}

/**
 * 帯の 2 行目「交渉されても、あと ¥1,888 は下げられます。」（§9.6）。
 *
 * **余裕がちょうど 0 のときは「あと ¥0 は下げられます」と言わない** ──
 * 今の価格が基準線ぴったり（分岐点＝価格）の記録では実際に起きる文で、
 * 「0 円ぶん下げられる」は下げられないことを回りくどく言っているだけになる。
 */
function discountRoomText(room: number): string {
  // 下限が分岐点か目標ラインかで「下げるとどうなるか」は変わるので、
  // ここでは行き先を言わずに「下限そのもの」だけを言う（行き先は 1 行目に出ている）
  return roundForDisplay(room) === 0
    ? '今の価格がその下限です。これ以上は下げられません。'
    : `交渉されても、あと ${formatYenSymbol(room)} は下げられます。`;
}

/**
 * 記録詳細の帯グラフに足す結論行（O3 案。SPEC-V9 未反映）の 1 行目（結論・太字）。
 *
 * 全画面（PricingScreen）の結論の帯（pricingConclusionText）と語を揃えていない ──
 * あちらは帯の下の 2 行に分けて「行き先の額」と「余裕」を別々に言えるが、
 * こちらは 1 行しかないので、額 1 つで用件が伝わる短い言い方を使う。
 */
export function recordDetailConclusionHeadline(
  conclusion: RecordDetailConclusion,
  analysis: PricingAnalysis,
  kind: RecordKind,
): string {
  const target = targetProfitLabel(kind);
  const targetAmount =
    analysis.targetProfit == null ? '' : formatYenSymbol(analysis.targetProfit);

  switch (conclusion) {
    case 'safe':
      return `あと ${formatYenSymbol(analysis.room)} 下げても赤字になりません`;
    case 'safeWithTarget':
      return `${formatYenSymbol(analysis.floorPrice)}までなら、${target}${targetAmount}を保てます`;
    case 'loss':
      return `あと${formatYenSymbol(analysis.breakEvenShortfall)}の値上げで、赤字から抜けます`;
    case 'lossWithTarget':
      return `${target}${targetAmount}まで戻すなら${formatYenSymbol(analysis.targetPrice ?? 0)}`;
    case 'unpriced':
      // 赤字/目標達成の判定には価格が必要なので結論文は出せない。G（価格がなくても
      // 分かっていること）への誘導文言に差し替える
      return '価格を入れると、どこまで下げられるか分かります';
  }
}

/** 結論行の 2 行目（小さいグレー・末尾に ›）。黒字/赤字・目標の有無で動詞と行き先が変わる */
const RECORD_DETAIL_CONCLUSION_DETAILS: Record<RecordDetailConclusion, string> =
  {
    safe: '値下げを試す・赤字にならない価格を見る',
    safeWithTarget: '値下げを試す・目標を保てる価格を見る',
    loss: '値上げを試す・赤字から抜ける価格を見る',
    lossWithTarget: '値上げを試す・目標を保てる価格を見る',
    unpriced: '売る価格を入力する',
  };

export function recordDetailConclusionDetail(
  conclusion: RecordDetailConclusion,
): string {
  return RECORD_DETAIL_CONCLUSION_DETAILS[conclusion];
}

/** 価格ラインの目盛りの説明（§9.8）。金額はその上に出るので、ここは「何の線か」だけを言う */
export function priceTickLabel(key: PriceTickKey): string {
  return PRICE_TICK_LABELS[key];
}

const PRICE_TICK_LABELS: Record<PriceTickKey, string> = {
  breakEven: 'ここで利益ゼロ',
  target: '目標利益ライン',
  current: '今の価格',
};

/**
 * 赤字のときだけ価格ラインの右端に添える向きの説明（§9.8）。
 * 黒字では出さない ── そちらは左へ動かす（値下げする）ことが読みたいことで、
 * 向きの意味が反転する赤字のときだけ、どちらへ動かすと良くなるかを語で言う。
 */
export const PRICE_LINE_RAISE_HINT = '上げるほど残る →';

/** 価格ラインの 2 点の間に渡す差額（§9.8）:「あと ¥612」 */
export function priceGapLabel(amount: number): string {
  return `あと ${formatYenSymbol(amount)}`;
}

/** 書き換える前の価格を示す灰色の点（§9.11）。画面を出るまでの表示で、保存はしない */
export const PREVIOUS_PRICE_LABEL = '前の価格';

/**
 * シミュレーターの見出し（§9.9）。**赤字では「値下げ」と言わない** ──
 * 赤字の記録でしたいのは値上げなので、見出しが操作と逆を向く。
 */
export function simulatorTitle(state: PricingState): string {
  return state === 'loss' ? '価格を動かしてみる' : '値下げしてみる';
}

/** シミュレーターの見出しの右（§9.9）。触っても記録は動かないことを先に言う */
export const SIMULATOR_NOTE = '動かしても記録は変わりません';

/** シミュレーターの右上の数字の下（§9.9）:「見込み利益・27.8%」 */
export function simulatorProfitNote(profitRate: number | null): string {
  const head = '見込み利益';
  return profitRate == null ? head : `${head}・${profitRate.toFixed(1)}%`;
}

/**
 * シミュレーターの判定（§9.9）。**「達成」は目標があるときだけ出す** ──
 * 決めていない人に「達成」と言うと、決めた覚えのない基準に受かったように読める。
 */
export function simulationVerdictText(
  verdict: SimulationVerdict,
  analysis: PricingAnalysis,
  kind: RecordKind,
): string {
  const target = targetProfitLabel(kind);
  const targetAmount =
    analysis.targetProfit == null ? '' : formatYenSymbol(analysis.targetProfit);
  const net = formatYenSymbol(Math.abs(verdict.simulation.netProfit));

  switch (verdict.key) {
    case 'loss':
      // もともと赤字の記録なら「まだ」── 新しく赤字になるわけではない
      return analysis.state === 'loss'
        ? `まだ赤字です（−${net}）`
        : `赤字になります（−${net}）`;
    case 'turnsProfit':
      return `黒字になります（手元に残る ${net}）`;
    case 'roomLeft':
      // 余裕 0（下限ぴったり）で「まだ ¥0 の余裕があります」とは言わない
      return roundForDisplay(verdict.room) === 0
        ? 'ここが下限です'
        : `まだ ${formatYenSymbol(verdict.room)} の余裕があります`;
    case 'belowTarget':
      return `${target} ${targetAmount} まで あと ${formatYenSymbol(verdict.shortfall ?? 0)}`;
    case 'targetMet':
      return `${target} ${targetAmount} を達成`;
  }
}

/**
 * シミュレーターのボタン（§9.10）。
 * 赤字では「記録する」ではなく**直すべき下限**を語にする ── この画面でしたいことがそれだから。
 */
export function applyPriceButtonLabel(analysis: PricingAnalysis): string {
  return analysis.state === 'loss'
    ? `価格を ${formatYenSymbol(analysis.breakEven)} 以上に直す`
    : 'この価格でこのアプリに記録する';
}

/** ボタンの下の注記（§9.10）。**サービス名は書かない** */
export const APPLY_PRICE_NOTE = '出品しているサイトの価格は変わりません。';

/** 書き換えの確認シート（§9.11） */
export const PRICE_APPLY_SHEET_TITLE = 'この価格に書き換えます';
export const PRICE_APPLY_CURRENT_LABEL = 'いまの記録';
export const PRICE_APPLY_NEXT_LABEL = '書き換えたあと';
export const PRICE_APPLY_PROFIT_LABEL = '見込みの利益';
export const PRICE_APPLY_CONFIRM_LABEL = '書き換える';

/**
 * 確認シートの注意文（§9.11）。**サービス名は書かない**（「あちら」で指す）。
 * このアプリの記録だけが変わることを、押す前に読める位置に置く。
 */
export const PRICE_APPLY_EXTERNAL_NOTE =
  '出品しているサイトの価格は変わりません。あちらはご自分で変更してください。';

/** 「¥1,700 → ¥1,250」（確認シートの見込み利益の行。§9.11） */
export function priceChangeArrow(before: string, after: string): string {
  return `${before} → ${after}`;
}

/** 書き換えたあとのバー（§9.12）。5 秒で消え、そのとき取り消しもできなくなる */
export function priceAppliedMessage(price: number): string {
  return `このアプリの記録を ${formatYenSymbol(price)} にしました`;
}

/** バーの取り消し（§9.12）。「元に戻す」（UNDO_LABEL）と役割は同じだが、語はモックに合わせる */
export const PRICE_UNDO_LABEL = '取り消す';

// ---- 価格が未設定のとき（E。§9.7） ----

/** 主役の数字の代わりに出す見出し */
export const PRICE_UNSET_LEAD_LABEL = '売る価格';

export const PRICE_UNSET_DESCRIPTION =
  '売る価格を入れると、手元に残る金額と、いくらまで下げられるかが出ます。';

/** 価格を入れに行くボタン（記録の編集フォームを開く） */
export const PRICE_INPUT_BUTTON_LABEL = '売る価格を入力する';

/** 価格が無くても出せる値の節（§9.7）。**空の主役を置いたまま終わらせないための面** */
export const KNOWN_WITHOUT_PRICE_TITLE = '価格がなくても分かっていること';
export const SPENT_COST_LABEL = 'すでにかかった費用';
export const NO_LOSS_PRICE_LABEL = '赤字にならない価格';
export const TARGET_REACHED_PRICE_LABEL = '目標が出る価格';

/** 「¥3,112 以上」（下限であることを金額そのものに書く） */
export function minPriceLabel(price: number): string {
  return `${formatYenSymbol(price)} 以上`;
}

/**
 * 上の 2〜3 行が何から出ているかの注記（§9.7）。
 * 内訳の金額を並べるのは、価格が無い記録でも**この下限だけは既に決まっている**ことを示すため。
 */
export function knownWithoutPriceNote(costs: {
  purchasePrice: number;
  postage: number;
  packing: number;
}): string {
  const parts = [
    `仕入 ${formatYenSymbol(costs.purchasePrice)}`,
    `送料 ${formatYenSymbol(costs.postage)}`,
    `梱包 ${formatYenSymbol(costs.packing)}`,
  ];
  return `${parts.join('・')} から計算しています。価格を入れる前でも、この下限は決まります。`;
}

/** 不活性なシミュレーターに重ねる語（§9.7） */
export const SIMULATOR_DISABLED_NOTE = '価格を入れると、ここで値下げを試せます';

// ---- 最下段の 2 行（§9.13） ----

/**
 * 費用の内訳への行（§9.13）。**行き先は記録詳細**（帯グラフ・レシートは既にあそこにある）──
 * この画面に複製すると、同じ 1 件の内訳が 2 か所で別々に育つ。
 */
export const COST_BREAKDOWN_ROW_LABEL = '費用の内訳';

/**
 * 目標利益の行の右の値（§9.13）。決めてあれば「この記録だけ」を添える ──
 * アプリ全体の既定値は無い（§1.3）ので、ここで見えている額が他の記録に及ばないことを言う。
 */
export function targetProfitRowValue(targetProfit: number | null): string {
  return targetProfit == null
    ? TARGET_PROFIT_UNSET_LABEL
    : `${formatYenSymbol(targetProfit)}（この記録だけ）`;
}

// ---- 目標利益を決めるシート（§9.14） ----

/** シートの見出し。語は記録フォームの欄と同じ（§5.2） */
export function targetProfitSheetTitle(kind: RecordKind): string {
  return `${targetProfitLabel(kind)}を決める`;
}

/**
 * 入れた額から**その場で**出る 2 つの数字（§9.14）。
 * 決めたあとに何が変わるのかを、決める前の画面で見せるための行。
 */
export const TARGET_PREVIEW_PRICE_LABEL = '目標が出る価格';
export const TARGET_PREVIEW_ROOM_LABEL = 'あと下げられる額';

/**
 * 目標を消す（§9.14）。**0 を入れて消す道は作らない** ──
 * 0 は「利益ゼロを目標にする」という有効な値で、消すこととは別（§1.2）。
 */
export const TARGET_PROFIT_CLEAR_LABEL = '目標を消す';

/**
 * 主役の数字そのもの（§9.4 / §9.5）。**赤字は「−¥550」**（マイナス記号は U+2212）。
 *
 * `formatSignedYenSymbol`（一覧の行）を使わないのは、あちらが黒字に「+」を付けるため ──
 * ここは 1 件の見込みを大きく 1 つだけ出す場所で、プラスの符号は要らない。
 */
export function pricingHeroAmount(netProfit: number): string {
  const rounded = roundForDisplay(netProfit);
  return rounded < 0
    ? `−${formatYenSymbol(-rounded)}`
    : formatYenSymbol(rounded);
}

// ─────────────────────────────────────────────────────────────────────────
// 売却済み分析「どうだった？」。§9 の「いくらで売る？」と対になる、売れたあとの画面。
// **「分析」とは言わない**のは §9 と同じ理由（見たいのは分析ではなく結果）。
// ─────────────────────────────────────────────────────────────────────────

/** 画面のタイトル。出品中の PRICING_SCREEN_TITLE（「いくらで売る？」）とは別の語 */
export const SOLD_ANALYSIS_SCREEN_TITLE = 'どうだった？';

/** 主役の数字の上（§9.4 と対）:「残った利益」。「見込み」ではない ── もう確定した額 */
export const REMAINING_PROFIT_LEAD_LABEL = '残った利益';

/** 商品名の右のバッジ:「8/14 に売れました」。一覧・詳細の「売れた」バッジと違い、日付まで言う */
export function soldOnBadgeLabel(saleDate: Date): string {
  return `${formatShortDate(saleDate)} に売れました`;
}

/** 主役の数字の下:「販売価格 ¥5,000・利益率 34.0%」。利益率は価格 0 では出さない語だけになる */
export function soldPriceRateNote(
  price: number,
  profitRate: number | null,
): string {
  const rate = profitRate == null ? '' : `・利益率 ${profitRate.toFixed(1)}%`;
  return `販売価格 ${formatYenSymbol(price)}${rate}`;
}

/** 達成バッジ「目標より +¥700」。赤字で目標を割っていても符号つきでそのまま言える */
export function targetAchievementBadgeLabel(diff: number): string {
  return `目標より ${formatSignedYenSymbol(diff)}`;
}

/** 未達成のときの帯「目標まであと¥323でした」。**過去形** ── もう売れたあとの結果を言う語なので */
export function targetShortfallPastLabel(shortfall: number): string {
  return `目標まであと${formatYenSymbol(shortfall)}でした`;
}

/** 達成バーの左端「目標 ¥1,000」 */
export function soldTargetBarLabel(target: number): string {
  return `目標 ${formatYenSymbol(target)}`;
}

/** 達成バーの右端「実際 ¥1,700」 */
export function soldActualBarLabel(actual: number): string {
  return `実際 ${formatYenSymbol(actual)}`;
}

/**
 * 見出しが状態で変わるセクション（目標なし / 目標あり）。
 * 目標の有無だけで分かれる ── 達成したかどうかは本文（soldSectionBody）側の語尾で言う。
 */
export function soldSectionTitle(conclusion: SoldConclusion): string {
  return conclusion === 'noTarget'
    ? 'どこまで下げられた取引だったか'
    : '値下げの余裕はどれだけあったか';
}

/**
 * 見出し下の本文。**A は「応じられた」、B は「保てました」、C は「保てませんでした」**で
 * 語尾だけが変わる（見出しは B/C で共通・A だけ別）。
 */
export function soldSectionBody(
  conclusion: SoldConclusion,
  analysis: PricingAnalysis,
): string {
  const price = formatYenSymbol(analysis.currentPrice);

  switch (conclusion) {
    case 'noTarget':
      return `${formatYenSymbol(analysis.breakEven)}で利益ゼロでした。${price}で売れたので、交渉されても${formatYenSymbol(analysis.room)}は応じられた計算です。`;
    case 'targetMet':
      return `${formatYenSymbol(analysis.floorPrice)}までなら目標を保てました。実際は${price}で売れたので、${formatYenSymbol(analysis.room)}は応じられた計算です。`;
    case 'belowTarget':
      return `${formatYenSymbol(analysis.floorPrice)}以上で売れていれば目標を保てましたが、実際は${price}で売れたため、${formatYenSymbol(analysis.targetShortfall ?? 0)}足りませんでした。`;
  }
}

/**
 * 記録詳細の帯グラフに足す結論行（O3 案）の 1 行目・売却済み版。
 *
 * 出品中版（recordDetailConclusionHeadline）と同じ場所に出すが、もう売れたあとなので
 * 「これから下げる／上げる」ではなく**過去形で結果を言う**。額は soldSectionBody と
 * 同じ数字（room / floorPrice / targetShortfall）を使うので、行を開いた先（pricing 画面の
 * SoldContent）と食い違わない。
 */
export function soldRecordDetailConclusionHeadline(
  conclusion: SoldConclusion,
  analysis: PricingAnalysis,
): string {
  switch (conclusion) {
    case 'noTarget':
      return `交渉されても、あと${formatYenSymbol(analysis.room)}は応じられた計算でした`;
    case 'targetMet':
      return `${formatYenSymbol(analysis.floorPrice)}まで、目標利益を保てました`;
    case 'belowTarget':
      return `目標まであと${formatYenSymbol(analysis.targetShortfall ?? 0)}でした`;
  }
}

/** 結論行の 2 行目・売却済み版。もう動かせる価格が無いので「試す」ではなく「見る」だけを言う */
const SOLD_RECORD_DETAIL_CONCLUSION_DETAILS: Record<SoldConclusion, string> = {
  noTarget: 'どこまで下げられたか見る',
  targetMet: 'どこまで下げられたか見る',
  belowTarget: '目標にどれだけ届かなかったか見る',
};

export function soldRecordDetailConclusionDetail(
  conclusion: SoldConclusion,
): string {
  return SOLD_RECORD_DETAIL_CONCLUSION_DETAILS[conclusion];
}

// ---- 経過日数（§4.7 の 3 分岐） ----

/** 通常「13日で売れました」 */
export function soldElapsedDaysLabel(days: number): string {
  return `${days}日で売れました`;
}

/** 0 日（記録日と同日に売れた）は割り算をしないので専用の語にする */
export const SOLD_SAME_DAY_LABEL = '記録した日に売れました';

/** 記録日 → 販売日「8/1 に記録 → 8/14 に販売」 */
export function soldDateRangeNote(saleStartDate: Date, saleDate: Date): string {
  return `${formatShortDate(saleStartDate)} に記録 → ${formatShortDate(saleDate)} に販売`;
}

/** 1 日あたり利益「1日 約¥131」。仕入品かつ売却済みのみ出す */
export function soldPerDayProfitLabel(perDay: number): string {
  return `1日 ${formatApproxYenSymbol(perDay)}`;
}

/** 1 日あたり利益の注記。不用品には出ないことをここで断る */
export const SOLD_PER_DAY_CAPTION = '仕入品のみ表示';

/** 日付が逆転している記録（販売日 < 記録日）に出す黄色い帯 */
export const SOLD_DATE_REVERSED_LABEL = '記録した日より前に売れています';

/** 逆転した日付を直す導線（記録編集フォームを開く） */
export const FIX_DATE_LABEL = '日付を直す';

// ---- 初回起動チュートリアル（オンボーディング） ----
//
// 4 ページ横スワイプ。文言は各ページの見出し・本文と、共通の操作（スキップ・はじめる）だけ。
// 図の中の題材（金額・実績のジャンル）は onboardingContent.ts が持つ。

export const ONBOARDING_SKIP_LABEL = 'スキップ';
export const ONBOARDING_START_LABEL = 'はじめる';

export const ONBOARDING_CALC_TITLE = '入れた分だけ、利益が見える';
export const ONBOARDING_CALC_BODY =
  '販売価格・送料・手数料を入れると、その場で手元に残る金額が計算されます。';

export const ONBOARDING_TARGET_TITLE = '目標から逆算もできる';
export const ONBOARDING_TARGET_BODY =
  '欲しい利益を入れれば、必要な販売価格がわかります。そのまま記録にも残せます。';
/** 逆算の図の末尾に出す、記録追加が成立したことを示す一言（記録フォームの保存とは別の、図の中だけの言葉） */
export const ONBOARDING_RECORD_ADDED_LABEL = '記録に追加されました';

export const ONBOARDING_SAVE_TITLE = '写真やタグも一緒に残せる';
export const ONBOARDING_SAVE_BODY =
  '商品名だけで保存できます。写真・タグ・種別もまとめて記録に残せます。';

export const ONBOARDING_PRESET_TITLE = 'よく使う値はプリセットに';
export const ONBOARDING_PRESET_BODY =
  '販売サイト・送料は欄の横の印から、梱包材は電卓の中から選べます。電卓からの入力もいつでも使えます。';

export const ONBOARDING_SIMULATOR_TITLE = '出品中でも、値下げを試せる';
export const ONBOARDING_SIMULATOR_BODY =
  '今の価格から動かして、見込みの利益をその場で確認できます。動かしても記録は変わりません。';
/**
 * 目標利益ライン（帯グラフの目盛り）が条件つきで出ることの注記（PriceLine.tsx の
 * priceLineTicks 参照。目標が無いときは目標の点を作らない仕様）。
 * 3 つに分けてあるのは、条件の核心（「目標の純利益を入力」しているかどうか）を
 * 強調して見せるため（構成の指定）── EMPHASIS だけ色・太さを変えて描く。
 * 3 つをこの順でつなぐと ONBOARDING_SIMULATOR_NOTE と同じ 1 文になる。
 */
export const ONBOARDING_SIMULATOR_NOTE_PREFIX = '目標のラインは、その記録に';
export const ONBOARDING_SIMULATOR_NOTE_EMPHASIS = '目標の純利益（仕入品では「目標利益」）を入力';
export const ONBOARDING_SIMULATOR_NOTE_SUFFIX = 'しているときだけ出ます。';
export const ONBOARDING_SIMULATOR_NOTE =
  ONBOARDING_SIMULATOR_NOTE_PREFIX + ONBOARDING_SIMULATOR_NOTE_EMPHASIS + ONBOARDING_SIMULATOR_NOTE_SUFFIX;

export const ONBOARDING_PACKAGING_PRESET_TITLE = '梱包材はまとめ買いも自動計算';
/**
 * 呼び出し場所（「電卓の中から」）を強調して見せる（構成の指定）ため 3 つに分けてある。
 * 3 つをこの順でつなぐと ONBOARDING_PACKAGING_PRESET_BODY と同じ 1 文になる。
 *
 * 登録場所（設定タブの「${PRESET_SECTION_TITLE}」）を明記してあるのは、それを書かないと
 * 「電卓の中から選んで呼び出せます」だけでは**登録自体も電卓から行う**と勘違いされかねない
 * ため（構成の指定「設定・入力することが書かれていないため勘違いしそう」）。文言は
 * presetPickerEmptyBodyWithoutLink と同じ「設定タブの「入力を減らす」」の言い回しに揃えてある。
 */
export const ONBOARDING_PACKAGING_PRESET_BODY_PREFIX = `設定タブの「${PRESET_SECTION_TITLE}」で入数と購入価格を登録しておくだけで、1個あたりの金額を自動で計算します。次からは`;
export const ONBOARDING_PACKAGING_PRESET_BODY_EMPHASIS = '電卓の中から';
export const ONBOARDING_PACKAGING_PRESET_BODY_SUFFIX = '選んで呼び出せます。';
export const ONBOARDING_PACKAGING_PRESET_BODY =
  ONBOARDING_PACKAGING_PRESET_BODY_PREFIX +
  ONBOARDING_PACKAGING_PRESET_BODY_EMPHASIS +
  ONBOARDING_PACKAGING_PRESET_BODY_SUFFIX;

export const ONBOARDING_DATA_TITLE = '3つの見かたで販売を振り返る';
export const ONBOARDING_DATA_BODY = '収支・タグ・実績。見たい角度でこれまでの販売がわかります。';

export const ONBOARDING_ACHIEVEMENTS_TITLE = '続けるほど実績が増えていく';
export const ONBOARDING_ACHIEVEMENTS_BODY =
  '販売を重ねるごとに、新しい実績が解除されていきます。';
export const ONBOARDING_ACHIEVEMENTS_NOTE =
  '困ったときは各画面の「？」、または設定の「使いかた」からいつでも確認できます。';

/** ページ右上の進み具合の読み上げ（achievementPageIndicatorText と同じ形） */
export function onboardingPageIndicatorText(index: number, total: number): string {
  return `${index + 1} / ${total}`;
}

/** 下端の戻る・次へ矢印の読み上げ語（ACHIEVEMENT_DETAIL_PREVIOUS/NEXT_LABEL と同じ形） */
export const ONBOARDING_PREVIOUS_PAGE_LABEL = '前のページへ';
export const ONBOARDING_NEXT_PAGE_LABEL = '次のページへ';

/** 設定タブ「チュートリアルをもう一度見る」の行 */
export const REPLAY_TUTORIAL_LABEL = 'チュートリアルをもう一度見る';
