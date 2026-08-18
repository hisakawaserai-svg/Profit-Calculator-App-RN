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
//
// ## 多言語化の途中経過（ステップ 1）
//
// 日英の二言語対応を段階的に入れている。**このファイルが画面から見た唯一の入口である点は
// 変わらない** ── 変わるのは中の実装だけで、リテラルの代わりに辞書（src/i18n/）を `t()` でひく。
//
// 移した語は `export const X = '...'` から `export function x(locale): string` になる。
// 定数は import 時に一度きり評価されるので、言語を切り替えても値が固まったままだから。
// 命名はこのファイルの既存の慣習どおり（SCREAMING_CASE = 定数、camelCase() = 関数）。
//
// **表示語の関数は locale を第 1 引数に取る。引数なしにしてはいけない。**
// このアプリは React Compiler を有効にしており（app.json の `experiments.reactCompiler`）、
// **引数を取らない呼び出しは「依存なし＝定数」と見なされ、初回の値で固定される**。
// 引数で渡せばコンパイラが依存として追ってくれるうえ、渡し忘れが型エラーになるので、
// 静かに古い言語の文字列が残ることがない。理由の詳細は src/i18n/index.ts の冒頭。
// 既に引数を持つ関数（`presetCountLabel` など）も locale を**先頭**に足して位置をそろえる。
//
// **まだ移していない画面が参照している定数は、定数のまま残してある。** それらは
// `t('...', 'ja')` で辞書から日本語を取るので、同じ文が 2 か所に書かれることはない
// （食い違いようがない）。呼び出し側を関数に移し終えた時点で定数ごと消える。
//
// ステップ 1 で移したのは**タブ名と設定タブの一覧画面**だけ。それ以外はリテラルのまま。

import type { PresetType, RecordKind } from '@/db/schema';
import { t, type TranslationKey } from '@/i18n';
import type { Locale } from '@/settings/language';

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
  formatMonthCell,
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
function recordKindKey(kind: RecordKind): 'record.kind.used' | 'record.kind.sourced' {
  return kind === 'used' ? 'record.kind.used' : 'record.kind.sourced';
}

/** レコード 1 件の netProfit に付ける語（§5.3）。不用品は「手取り」ではなく「純利益」（§7-8） */
function profitKey(kind: RecordKind): 'record.profit.used' | 'record.profit.sourced' {
  return kind === 'used' ? 'record.profit.used' : 'record.profit.sourced';
}

/** 計算タブの逆算入力に付ける語（§5.3） */
function targetProfitKey(
  kind: RecordKind,
): 'record.targetProfit.used' | 'record.targetProfit.sourced' {
  return kind === 'used' ? 'record.targetProfit.used' : 'record.targetProfit.sourced';
}

/**
 * 複数レコードの Σ netProfit（月次カード / 下部累計 / データタブのサマリー・グラフ・ソート名）。
 * 種別が混ざり得るので中立語。画面タイトル「全期間の収支」で既に使っている語（§5.2）。
 */
export function totalProfitLabel(locale: Locale): string {
  return t('amount.totalProfit', locale);
}

/** totalExpenses。1 件でも合計でも種別で変えない（§5.3） */
export function expensesLabel(locale: Locale): string {
  return t('amount.expenses', locale);
}

/** salesPrice。レコードを指すときは「販売価格」（§5.3） */
export function salesPriceLabel(locale: Locale): string {
  return t('amount.salesPrice', locale);
}

/** Σ salesPrice。データタブの集計だけ「売上」（§5.3） */
export function totalSalesLabel(locale: Locale): string {
  return t('amount.totalSales', locale);
}

/** 出品中レコード 1 件の salesPrice（UI-SPEC §6-3）。売れる前の値段なので「販売価格」とは呼ばない */
export const LISTING_PRICE_LABEL = '出品価格';

/** 出品中の Σ salesPrice（合計行。UI-SPEC §6-3） */
export function totalListingPriceLabel(locale: Locale): string {
  return t('list.totalListingPrice', locale);
}

/**
 * 状態そのものの名前（UI-SPEC §1.3-3 の見出し行 / §1.4-2 のバッジ）。
 * 売れている側は t('list.soldRecords', 'ja')（一覧の状態チップ）と t('detail.soldBadge', 'ja')（詳細のバッジ）で
 * 語が違うが、出品中側はどこでもこの 1 語なので分けない。
 */
export function listingStatusLabel(locale: Locale): string {
  return t('list.listingStatus', locale);
}

/** 出品中の件数（合計行の左の値 A。UI-SPEC §1.2）。状態名と同じ語 */
export function listingCountLabel(locale: Locale): string {
  return t('list.listingStatus', locale);
}

/**
 * 件数の値そのもの（UI-SPEC §1.2）。**単位が 2 つある** ──
 * 出品中は「まだ手元にある品物」を数えるので「点」、一覧の上に出すのは
 * 「いま並んでいる行」なので「件」。数えているものが違うので語も分ける。
 */
export function listedItemCountValue(locale: Locale, count: number): string {
  return t('list.listedItemCount', locale, { count });
}
export function recordCountValue(locale: Locale, count: number): string {
  return t('list.recordCount', locale, { count });
}

/** 一覧のメタ行に出す日付の意味づけ（UI-SPEC §1.2「{種別}　M/D 販売 / M/D 出品」） */
export function soldDateLabel(locale: Locale): string {
  return t('list.soldDate', locale);
}
export function listedDateLabel(locale: Locale): string {
  return t('list.listedDate', locale);
}

/**
 * 並び替えの**方向**（採用案 22b）。日付と金額で語を分ける ──
 * 同じ降順でも、日付なら「新しい」、金額なら「多い」でないと読み違える。
 * 旧メニューの「販売日 ↓」のような矢印は使わない（↓ がどちら向きの意味かを覚えさせない）。
 */
export function sortNewestLabel(locale: Locale): string {
  return t('sort.newest', locale);
}
export function sortOldestLabel(locale: Locale): string {
  return t('sort.oldest', locale);
}
export function sortLargestLabel(locale: Locale): string {
  return t('sort.largest', locale);
}
export function sortSmallestLabel(locale: Locale): string {
  return t('sort.smallest', locale);
}

/**
 * 出品中を見ているときの並び替え項目名（採用案 22b）。まだ売れていない記録の収支は
 * 行の「売れたら 約◯円」と同じ**見込みの値**なので、確定した収支と同じ語で並べない。
 */
export function expectedTotalProfitLabel(locale: Locale): string {
  return t('detail.expectedTotalProfit', locale, { total: totalProfitLabel(locale) });
}

// ---- 画面の名前とアイコンボタンの読み上げ語（UI-SPEC §1） ----

/**
 * タブバーと各タブのヘッダに出る画面の名前。**タブ名とヘッダの見出しは同じ語にする** ──
 * 押したタブと開いた画面で名前が違うと、どこに居るのかを 2 度読み直すことになる。
 *
 * 計算タブだけヘッダが別語（「計算」/「利益計算」）なのは、タブ名の幅では
 * **何の計算なのかを言えない**ため。ヘッダには幅があるので、そちらで補う。
 */
export function calcTabLabel(locale: Locale): string {
  return t('tabs.calc', locale);
}
export function calcScreenTitle(locale: Locale): string {
  return t('calc.title', locale);
}
export function recordsTabLabel(locale: Locale): string {
  return t('tabs.records', locale);
}
export function dataTabLabel(locale: Locale): string {
  return t('tabs.data', locale);
}
export function settingsTabLabel(locale: Locale): string {
  return t('tabs.settings', locale);
}

/**
 * **移行前の呼び出し用（日本語固定）。** タブバー以外からも参照されている 2 つだけ残す ──
 * 記録は記録一覧・使いかた・チュートリアル、データはデータタブとチュートリアル
 * （どれもステップ 1 の対象外）。
 * 詳しくはファイル冒頭の「多言語化の途中経過」を参照。
 */
export const RECORDS_TAB_LABEL = t('tabs.records', 'ja');
export const DATA_TAB_LABEL = t('tabs.data', 'ja');

/**
 * アイコンだけのボタンの読み上げ語（UI-SPEC §1.2-1）。
 * **見た目が記号 1 つのものは、ここでしか語を持てない。**
 *
 * 「＋ 記録」だけは語が画面にも出るが（RECORDS_TAB_LABEL）、それは名詞なので
 * 何が起きるかを言えていない ── 読み上げには動詞まで入れる。
 */
export function addRecordActionLabel(locale: Locale): string {
  return t('record.addAction', locale);
}
export function searchLabel(locale: Locale): string {
  return t('list.search', locale);
}
export function searchClearLabel(locale: Locale): string {
  return t('list.searchClear', locale);
}
export function sortSheetTitle(locale: Locale): string {
  return t('list.sortSheetTitle', locale);
}

/** 記録の検索欄（UI-SPEC §5-10）。読み上げ語も同じ文を使う（欄の中に出ている語がそのまま名前） */
export function recordSearchPlaceholder(locale: Locale): string {
  return t('list.searchPlaceholder', locale);
}

// ---- 「過去の記録から複製」（記録タブの＋のメニュー） ----
//
// **＋を押しても、すぐにフォームは開かない**（2 択のシートが出る）。1 タップ増えるが、
// 複製を「知っている人だけが辿り着く隠し操作」にしないための形 ── 同じ物を何度も出す人には
// こちらが本命で、入口が見えないと使われないまま終わる。

/** ＋のシートの見出し。何を選ぶ場面かを言う */
export function addRecordMenuTitle(locale: Locale): string {
  return t('record.menu.title', locale);
}

/** 2 択の左（従来どおりの新規作成）。**先に置く** ── 増えたほうを既定にしない */
export function newRecordActionLabel(locale: Locale): string {
  return t('record.menu.newLabel', locale);
}
export function newRecordActionNote(locale: Locale): string {
  return t('record.menu.newNote', locale);
}

/** 2 択の右（複製）。行き先が「選ぶ画面」であることまで言う */
export function duplicateRecordActionLabel(locale: Locale): string {
  return t('record.menu.duplicateLabel', locale);
}
export function duplicateRecordActionNote(locale: Locale): string {
  return t('record.menu.duplicateNote', locale);
}

/** 複製元を選ぶ画面（DuplicateSourceScreen） */
export function duplicateScreenTitle(locale: Locale): string {
  return t('duplicate.title', locale);
}

/**
 * 画面の先頭に置く 1 行。**写らないものを先に言う。**
 *
 * 「複製」の語からは全部が写ると読めるので、そのまま保存すると前の販売価格が
 * 入った記録ができると思われかねない ── 実際は空で始まる（logic/duplicateRecord.ts）。
 */
export function duplicateScreenNote(locale: Locale): string {
  return t('duplicate.note', locale);
}

/** 直近の記録の見出し（絞り込んでいないときだけ出る） */
export function duplicateRecentSectionLabel(locale: Locale): string {
  return t('duplicate.recentSection', locale);
}

/** その下の行。押すと全件に切り替わる */
export function duplicateShowAllLabel(locale: Locale): string {
  return t('duplicate.showAll', locale);
}

/** 全件に切り替えたあとの見出し */
export function duplicateAllSectionLabel(locale: Locale): string {
  return t('duplicate.allSection', locale);
}

/** 記録が 1 件も無いとき（複製元が作れない） */
export function duplicateEmptyTitle(locale: Locale): string {
  return t('duplicate.emptyTitle', locale);
}
export function duplicateEmptyBody(locale: Locale): string {
  return t('duplicate.emptyBody', locale);
}

/** 検索・タグで絞った結果が 0 件のとき。解除の口は絞り込みの行そのものなので出さない */
export function duplicateNoMatchTitle(locale: Locale): string {
  return t('duplicate.noMatchTitle', locale);
}

/** タグで絞る行の見出し（複製元を選ぶ画面） */
export function duplicateTagFilterLabel(locale: Locale): string {
  return t('duplicate.tagFilter', locale);
}

/** カレンダーの前後の月へ送るボタン（UI-SPEC §8.10）。矢印 1 つなので語は読み上げにしかない */
export function previousMonthLabel(locale: Locale): string {
  return t('calendar.previousMonth', locale);
}
export function nextMonthLabel(locale: Locale): string {
  return t('calendar.nextMonth', locale);
}

/** 月バーの期間ボタンの読み上げ（UI-SPEC §1.2）。押すと開くのが期間シートであることを言う */
export function periodButtonAccessibilityLabel(locale: Locale, title: string): string {
  return t('period.buttonAccessibility', locale, { title });
}

/**
 * 一覧の行の読み上げ（UI-SPEC §1.2）。行そのものは押すと詳細へ、
 * 左スワイプで出るのは削除。**どちらも商品名を頭に置く** ── 読み上げは 1 行ずつ流れるので、
 * 何に対する操作なのかが先に来ないと、聞いてから戻って確かめることになる。
 */
export function recordDetailAccessibilityLabel(locale: Locale, itemName: string): string {
  return t('list.recordDetailAccessibility', locale, { name: itemName });
}
export function deleteAccessibilityLabel(locale: Locale, name: string): string {
  return t('action.deleteNamed', locale, { name });
}

/** ± ボタンの読み上げ（UI-SPEC §1.3-9）。何を増減するのかは呼び出し側の欄名が入る */
export function decreaseAccessibilityLabel(locale: Locale, label: string): string {
  return t('action.decrease', locale, { label });
}
export function increaseAccessibilityLabel(locale: Locale, label: string): string {
  return t('action.increase', locale, { label });
}

/** 金額の欄の右の電卓ボタン（UI-SPEC §7.1）。どの欄の電卓かを言う */
export function calculatorAccessibilityLabel(locale: Locale, fieldLabel: string): string {
  return t('calculator.accessibility', locale, { field: fieldLabel });
}

/** カレンダーの日のマス（UI-SPEC §8.10）。印（今日・出品日）は呼び出し側が後ろに足す */
export function calendarDayAccessibilityLabel(locale: Locale, day: number): string {
  return t('calendar.dayAccessibility', locale, { day });
}

/**
 * 長押しコピー（LongPressCopy）のトースト。
 *
 * **成功のときだけ内容まで出す** ── 何が入ったのかは貼るまで分からないので、
 * 写した値をその場で見せる。失敗では入っていないので、出す値がない。
 */
export function copiedMessage(locale: Locale, label: string): string {
  return t('copy.done', locale, { label });
}
export function copiedContentMessage(locale: Locale, text: string): string {
  return t('copy.content', locale, { text });
}
export function copyFailedMessage(locale: Locale, label: string): string {
  return t('copy.failed', locale, { label });
}

/**
 * データベースの初期化に失敗したとき（app/_layout.tsx）。
 * ここだけは**アプリが起動しきる前**に出るので、他のどの画面の語にも寄りかかれない。
 */
export function dbInitFailedMessage(locale: Locale): string {
  return t('common.dbInitFailed', locale);
}

/** 未実装の画面の仮表示（PlaceholderScreen） */
export function unimplementedLabel(locale: Locale): string {
  return t('common.unimplemented', locale);
}

/** 月バー・期間シートで「月を選んでいない」状態を指す語（UI-SPEC §1.2） */
export function allPeriodLabel(locale: Locale): string {
  return t('period.all', locale);
}

/** 期間シートの見出し（UI-SPEC §1.2）。記録タブ・データタブで同じシートを開く */
export function periodSheetTitle(locale: Locale): string {
  return t('period.sheetTitle', locale);
}

/**
 * 期間シートの先頭に固定するクイック選択（UI-SPEC §1.2-2）。
 * 「全期間」は月バーと同じ語（t('period.all', 'ja')）を使う ── 選んだ結果が月バーに出るので、
 * ボタンとバーで語が違うと同じものを指していると読めない。
 */
export function thisMonthLabel(locale: Locale): string {
  return t('periodPicker.thisMonth', locale);
}
export function lastMonthLabel(locale: Locale): string {
  return t('periodPicker.lastMonth', locale);
}

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
export function yearTapHintLabel(locale: Locale): string {
  return t('periodPicker.yearTapHint', locale);
}
export function monthTapHintLabel(locale: Locale): string {
  return t('periodPicker.monthTapHint', locale);
}
export function yearSelectedHintLabel(locale: Locale): string {
  return t('periodPicker.yearSelectedHint', locale);
}

/**
 * 月グリッドの凡例（UI-SPEC §1.2-4）。
 * 濃淡の意味を名指しする ── 薄いマスを見た人に理由を自分で埋めさせないため（§8.10.5 と同じ方針）。
 * 未来の月も「記録なし」と同じ薄さで、違いは押せるかどうかだけなので、凡例は 2 項目で足りる。
 */
export function hasRecordsLegendLabel(locale: Locale): string {
  return t('periodPicker.hasRecords', locale);
}
export function noRecordsLegendLabel(locale: Locale): string {
  return t('periodPicker.noRecords', locale);
}

/** 記録タブの状態チップ（UI-SPEC §1.2）。「出品中」側は listingCountLabel('ja') と同じ語 */
export function soldRecordsLabel(locale: Locale): string {
  return t('list.soldRecords', locale);
}

/** commissionCost（§5.3） */
export function commissionLabel(locale: Locale): string {
  return t('amount.commissionFull', locale);
}

/**
 * 説明文・式の中で使う短い方（「手数料96円が引かれて」「手数料10%が引かれるので」）。
 * 1 文に金額が 3 つ入る場所では正式名だと文が読めなくなるので、入力欄の
 * commissionFieldLabel と同じ短縮形に合わせる。単独の行や一覧は t('amount.commissionFull', 'ja')。
 */
export function commissionShortLabel(locale: Locale): string {
  return t('amount.commissionShort', locale);
}

/** 計算タブの逆算結果。種別で変えない（§5.3） */
export function requiredSalesPriceLabel(locale: Locale): string {
  return t('calc.requiredSalesPrice', locale);
}

/** purchasePrice。種別で変えない（§5.3 の表にはないが、欄名は 1 か所に集める） */
export function purchasePriceLabel(locale: Locale): string {
  return t('amount.purchasePrice', locale);
}

/** postage / envelopeCost / othersCost の欄名 */
export function postageLabel(locale: Locale): string {
  return t('amount.postage', locale);
}
export function envelopeCostLabel(locale: Locale): string {
  return t('amount.envelopeCost', locale);
}
export function othersCostLabel(locale: Locale): string {
  return t('amount.othersCost', locale);
}

/** 内訳の 1 行目。入力欄の「販売価格」と区別して、計算に入った売上の総額を指す */
export function totalSalesAmountLabel(locale: Locale): string {
  return t('amount.totalSalesAmount', locale);
}

// 旧 ENVELOPE_AND_OTHERS_LABEL（「梱包・その他」）は削除した。
// 計算タブの内訳が帯グラフと同じ一覧（costBreakdown.parts）を使うようになり、
// 帯の区画と行が 1 対 1 になったため ── まとめた 1 行には対応する区画も色もない。
// 伝票・レシートのまとめ行は t('form.envelopeAndOthers', 'ja') のままで、こちらは残る。

/** 結果カード・固定バーの折りたたみ見出し（UI-SPEC §1.1-2 / §1.1-3a） */
export function breakdownLabel(locale: Locale): string {
  return t('amount.breakdown', locale);
}

/**
 * 逆算結果の折りたたみ見出し（採用案 12c）。
 * 結果側の「内訳」と違って金額の一覧だけでなく式も入るので、開く前にそれが分かる語にする。
 */
export function breakdownAndMethodLabel(locale: Locale): string {
  return t('amount.breakdownAndMethod', locale);
}

/** 逆算結果の一覧の 1 行目（緑の区画）。売れたあと売り手のものになる額 */
export function keptLabel(locale: Locale): string {
  return t('amount.keptLong', locale);
}

/** 帯の下の 2 値の左側。一覧の t('amount.keptLong', 'ja') と同じものを詰めて言う */
export function keptShortLabel(locale: Locale): string {
  return t('amount.kept', locale);
}

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
export function deductedLabel(locale: Locale): string {
  return t('amount.deducted', locale);
}

/**
 * 式の左辺に置く目標額の語（「目標100円 ＋ 経費765円」）。
 * 入力欄は targetProfitLabel（「目標の純利益」/「目標利益」）だが、式の中では
 * 項が長いほど式に見えなくなるので短くする。直上の入力欄に正式名が出ている。
 */
export function formulaTargetLabel(locale: Locale): string {
  return t('amount.formulaTarget', locale);
}

/** 計算タブの入力カードの折りたたみ見出し（UI-SPEC §1.1-6） */
export function optionalCostsBaseLabel(locale: Locale): string {
  return t('calc.optionalCosts', locale);
}

/** 結果カード右上のリセット（UI-SPEC §1.1-3a）。入力が空のときは無効（§5-8） */
export function clearLabel(locale: Locale): string {
  return t('action.clear', locale);
}

/** その「クリア」の読み上げ（§1.1-3a）。ボタンの語だけでは、何が消えるのかを言えていない */
export function clearInputActionLabel(locale: Locale): string {
  return t('calc.clearInputAction', locale);
}

/**
 * クリアの確認（UI-SPEC §1.1-3a）。**押した時点で全部消える**操作なのに、
 * 押した直後の「元に戻す」を置いていない（§5-8 は未実装）ので、確認を 1 枚挟む。
 *
 * 本文で「金額」と「種別」の両方を言うのは、種別まで既定値に戻ることが
 * ボタンの語（「クリア」）からは読めないため ── 消えるものを先に全部言う。
 * レコードの削除（t('detail.deleteConfirmTitle', 'ja')）と違って本文があるのはそのため。
 */
export function clearConfirmTitle(locale: Locale): string {
  return t('calc.clearConfirmTitle', locale);
}
export function clearConfirmMessage(locale: Locale): string {
  return t('calc.clearConfirmMessage', locale);
}

/**
 * 記録を作る FAB の語（UI-SPEC §1.1-7 / §1.2-7）。**計算タブと記録一覧で同じ語。**
 *
 * 記録タブ側はタブ名と同じ「記録」だったが、同じ形・同じ位置のボタンで語だけが
 * 違うと、タブを移った先で別の操作に見える。押した先ですることは両方とも同じ
 * （記録フォームが開く）なので、動作を表す「記録する」に揃えた。
 * ＋は AddRecordFab が描くので、ここには入れない。
 */
export function addRecordFabLabel(locale: Locale): string {
  return t('record.addFab', locale);
}

/** 逆算側の結果見出し（UI-SPEC §1.1-3b） */
export function requiredPriceHeadline(locale: Locale): string {
  return t('calc.requiredPriceHeadline', locale);
}

/**
 * 逆算モードのときの固定バーの売上側（UI-SPEC §1.1「挙動」）。
 * 通常モードは実績値なので t('amount.totalSales', 'ja')、逆算モードはこれから必要になる額なので別語。
 */
export function requiredSalesLabel(locale: Locale): string {
  return t('calc.requiredSales', locale);
}

/** 計算タブの逆算側セグメント名。種別で変えない（UI-SPEC §6-4） */
export function targetTabLabel(locale: Locale): string {
  return t('calc.targetTab', locale);
}

/** 入力カードの手数料行（UI-SPEC §1.1-5）: 「手数料 10%」 */
export function commissionFieldLabel(locale: Locale, rate: number): string {
  return t('amount.commissionField', locale, { rate });
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
export function optionalCostsLabel(locale: Locale, total: number): string {
  return total === 0
    ? t('calc.optionalCosts', locale)
    : t('calc.optionalCostsWithTotal', locale, { total: formatYenTight(locale, total) });
}

/** 逆算結果の一覧に出す手数料の行名（採用案 12c）:「販売手数料10%」 */
export function commissionItemLabel(locale: Locale, rate: number): string {
  return t('amount.commissionItem', locale, { rate });
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
export function requiredPriceSummary(
  locale: Locale,
  result: {
    requiredPrice: number;
    commissionAmount: number;
    expenses: number;
    kept: number;
  },
): string {
  const deductions: string[] = [];
  if (result.commissionAmount !== 0) {
    deductions.push(
      t('calc.deductionCommission', locale, { amount: formatYenTight(locale, result.commissionAmount) }),
    );
  }
  if (result.expenses !== 0) {
    deductions.push(t('calc.deductionExpenses', locale, { amount: formatYenTight(locale, result.expenses) }));
  }

  const price = formatYenTight(locale, result.requiredPrice);
  const kept = formatYenTight(locale, result.kept);
  // 引かれるものが無いときは別の文にする（「〜と〜が引かれて」の形が成り立たないため）
  return deductions.length === 0
    ? t('calc.summaryNoDeductions', locale, { price, kept })
    : t('calc.summaryWithDeductions', locale, {
        price,
        kept,
        deductions: deductions.join(t('calc.deductionSeparator', locale)),
      });
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
export function requiredPriceFormulaLines(
  locale: Locale,
  formula: {
    targetProfit: number;
    expenses: number;
    subtotal: number;
    commissionRate: number;
    divisor: number;
    exact: number;
    requiredPrice: number;
    roundedUp: boolean;
  },
): string[] {
  // 行ごとに 1 つのキーをひく。部品を連結すると、語順の違う言語で組み立て直せない
  const lines = [
    formula.expenses === 0
      ? t('calc.formulaTargetOnly', locale, { target: formatYenTight(locale, formula.targetProfit) })
      : t('calc.formulaTargetAndExpenses', locale, {
          target: formatYenTight(locale, formula.targetProfit),
          expenses: formatYenTight(locale, formula.expenses),
          subtotal: formatYenTight(locale, formula.subtotal),
        }),
  ];

  if (formula.commissionRate !== 0) {
    lines.push(
      t('calc.formulaCommission', locale, {
        rate: formula.commissionRate,
        divisor: formula.divisor,
      }),
    );
  }

  lines.push(
    formula.roundedUp
      ? t('calc.formulaResultRoundedUp', locale, {
          exact: formatExactPrice(formula.exact),
          price: formatYenTight(locale, formula.requiredPrice),
        })
      : t('calc.formulaResult', locale, { price: formatYenTight(locale, formula.requiredPrice) }),
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
export function lowerPriceWarning(
  locale: Locale,
  example: { price: number; profit: number },
): string {
  return t('calc.lowerPriceWarning', locale, {
    price: formatYenTight(locale, example.price),
    profit: formatYenTight(locale, example.profit),
  });
}

/**
 * 合計行の収支の見出し（UI-SPEC §1.2）:「この月の収支」/「**2025年の収支**」/「全期間の収支」。
 * 合計なので種別語ではなく中立語（§5.3）。
 *
 * 年だけ「この年」ではなく年そのものを出すのは、月バーの表示（「‹ 2025年 ⌄ ›」）と
 * 同じ語にするため ── 年を選ぶのは「去年 1 年でいくら儲かったか」を見る操作なので、
 * どの年の話かが見出しの側にも要る。月は月バーがすぐ上にあり、「この月」で迷わない。
 */
export function periodProfitLabel(locale: Locale, period: Period): string {
  const kind = periodKind(period);
  const subject =
    kind === 'all'
      ? t('period.allInline', locale)
      : kind === 'year'
        ? formatYearTitle(locale, periodYear(period) as number)
        : t('period.thisMonth', locale);
  return t('period.profitLabel', locale, { subject, total: totalProfitLabel(locale) });
}

/**
 * 月バーの ◀ ▶ の読み上げ語（UI-SPEC §8.10.3 と同じ考え方）。
 * 矢印の形は同じでも動く単位が期間の種類で変わるので、語のほうで何が動くかを言う。
 * 全期間では矢印が無効なので、月の語のままでよい。
 */
export function previousPeriodLabel(locale: Locale, period: Period): string {
  return t(periodKind(period) === 'year' ? 'period.previousYear' : 'period.previousMonth', locale);
}

export function nextPeriodLabel(locale: Locale, period: Period): string {
  return t(periodKind(period) === 'year' ? 'period.nextYear' : 'period.nextMonth', locale);
}

/**
 * 年を送る矢印の読み上げ語。月バーの ◀ ▶（年を選んでいるとき）と、
 * 期間シートのカード見出しの ‹ ›（案 39b）が**同じ語**を使う ──
 * どちらも「表示している年を 1 つ前後に動かす」で、操作の意味が同じ。
 */
export function previousYearLabel(locale: Locale): string {
  return t('period.previousYear', locale);
}
export function nextYearLabel(locale: Locale): string {
  return t('period.nextYear', locale);
}

/**
 * 期間そのものの表示語（月バーの中央・絞り込みの注記）:
 * 「全期間」/「2025年」/「2026年8月」。
 */
export function periodTitle(locale: Locale, period: Period): string {
  const kind = periodKind(period);
  if (kind === 'all') return t('period.all', locale);
  // 年・月の表記は日付の書式そのものなので、まだ日本語のまま（数値・日付の書式は別途）
  if (kind === 'year') return formatYearTitle(locale, periodYear(period) as number);
  return formatMonthKeyTitle(locale, period as string);
}

/**
 * 出品中レコードの見込み netProfit（UI-SPEC §6-3）。
 * 送料未入力かどうかの判定はしないので「約」は常に付く（§5-3）。金額側は formatApproxYenSymbol。
 */
export function expectedProfitText(locale: Locale, approxAmount: string): string {
  return t('list.expectedProfit', locale, { amount: approxAmount });
}

/** 種別の表示名（レコード詳細の「種別」行・種別セレクタ） */
export function recordKindLabel(locale: Locale, kind: RecordKind): string {
  return t(recordKindKey(kind), locale);
}

/** レコード 1 件の netProfit のラベル。**合計には使わない**（合計は t('amount.totalProfit', 'ja')） */
export function profitLabel(locale: Locale, kind: RecordKind): string {
  return t(profitKey(kind), locale);
}

/**
 * 計算タブの結果側セグメント名（UI-SPEC §6-4）: 「純利益を出す」/「利益を出す」。
 * 逆算側は種別で変えない定数 TARGET_TAB_LABEL（種別語は直下の入力行に出るため）。
 */
export function profitTabLabel(locale: Locale, kind: RecordKind): string {
  // 文中に埋め込むので profitInline を使う（英語は見出し用の語だと語中で大文字になる）
  const profit = t(
    kind === 'used' ? 'record.profitInline.used' : 'record.profitInline.sourced',
    locale,
  );
  return t('calc.profitTab', locale, { profit });
}

/**
 * 目標利益の入力欄のラベル（§5.3）: 「目標の純利益」/「目標利益」。
 * 計算タブの逆算（UI-SPEC §1.1-3b）と記録フォームの目標欄（SPEC-V9 §2）で**同じ語**を使う ──
 * 同じものを指す欄なので、画面ごとに呼び名が変わると別の値に見える。
 */
export function targetProfitLabel(locale: Locale, kind: RecordKind): string {
  return t(targetProfitKey(kind), locale);
}

/**
 * 目標を決めていない記録の表し方（SPEC-V9 §2）。**「¥0」とは書かない。**
 *
 * 0 は「目標は 0 円（赤字にならなければよい）」という目標そのもので、
 * 決めていない状態とは別のもの ── 金額として書くと、決めていない人の記録に
 * 「目標 0 円」という決めた覚えのない値が出ることになる（schema の targetProfit）。
 * 未入力の欄に出す `t('form.unsetInput', 'ja')`（「未入力」）とも分ける ── 目標は
 * 入れ忘れではなく「決めない」のが正しい選択でもあるため。
 */
export function targetProfitUnsetLabel(locale: Locale): string {
  return t('form.targetProfitUnset', locale);
}

/**
 * 目標欄の折りたたみ見出しの右端に出す値（SPEC-V9 §2）。
 * 決めていなければ語、決めていれば金額。**null と 0 がここで見分けられる。**
 */
export function targetProfitSummary(locale: Locale, targetProfit: number | null): string {
  return targetProfit == null ? t('form.targetProfitUnset', locale) : formatYen(locale, targetProfit);
}

// ─────────────────────────────────────────────────────────────────────────────
// データタブ（UI-SPEC §1.5 / 採用案 7b）の表示語。
//
// 指標セグメントの語（旧 metricLabel =「売上金額」/「収支」）は、指標切替そのものの廃止で
// 参照元がなくなったため削除した（§6-10）。グラフは収支だけになり、売上は合計行が持つ。
// ─────────────────────────────────────────────────────────────────────────────

/** グラフカードの見出し（UI-SPEC §1.5-4）。指標が 1 つになったので固定文言 */
export function profitTrendLabel(locale: Locale): string {
  return t('data.profitTrend', locale, { total: totalProfitLabel(locale) });
}

/**
 * 集計の対象が 1 件も無いとき（UI-SPEC §1.5）。この画面は**売れた記録だけ**を見るので、
 * 「記録がない」ではなく「売却済みが無い」と言う ── 出品中の記録は持っているのに
 * 「記録がありません」と出ると、消えたのかと読める。
 */
export function noSoldDataMessage(locale: Locale): string {
  return t('data.noSoldData', locale);
}

/**
 * 現在の刻み（UI-SPEC §1.5-4）。**表示のみで押せない** ──
 * 刻みは期間から自動で決まり、選ばせる操作ではないため（§5-5）。
 * 単独では出さず、凡例の棒の側の語に組み込む（chartBarLegendLabel）。
 */
const CHART_UNIT_KEYS = {
  day: 'data.unitDay',
  month: 'data.unitMonth',
  year: 'data.unitYear',
} as const satisfies Record<ChartUnit, TranslationKey>;

/** 文中に埋め込む刻みの語（英語だけ小文字。「Net total by month」） */
const CHART_UNIT_INLINE_KEYS = {
  day: 'data.unitDayInline',
  month: 'data.unitMonthInline',
  year: 'data.unitYearInline',
} as const satisfies Record<ChartUnit, TranslationKey>;

export function chartUnitLabel(locale: Locale, unit: ChartUnit): string {
  return t(CHART_UNIT_KEYS[unit], locale);
}

/**
 * 凡例の棒の側（UI-SPEC §1.5-4）:「日ごとの収支」/「月ごとの収支」。左軸が表すもの。
 *
 * 刻みの表示（旧・見出しの右）をこの語に畳んである ── 棒が何かを言えば刻みも言えるので、
 * 「日ごと」を 2 か所に出す必要がない。凡例と刻みで別々に場所を取ると、
 * グラフ 1 つに説明が 2 段付くことになる。
 */
export function chartBarLegendLabel(locale: Locale, unit: ChartUnit): string {
  // 凡例は 1 つの句なので、どちらも文中用の語を使う（英語で語中に大文字を立てない）
  return t('data.chartBarLegend', locale, {
    unit: t(CHART_UNIT_INLINE_KEYS[unit], locale),
    total: totalProfitLabel(locale),
  });
}

/**
 * 凡例の折れ線の側（UI-SPEC §1.5-4）。右軸が表すもの。
 * 起点は表示中の期間の先頭なので、最後の値は合計行の収支と一致する（logic/analytics 参照）。
 */
export function cumulativeProfitLabel(locale: Locale): string {
  return t('data.cumulativeProfit', locale, { total: t('amount.totalProfitInline', locale) });
}

/**
 * 選択中の点の累計（UI-SPEC §1.5-4。案 38b）:「累計 ¥8,720」。
 *
 * 凡例の行が選択中に化ける「値の行」の、藍の見本の隣に出る語。
 * 金額は**常に全桁**（軸の目盛りは千円・万円に丸めているが、こちらは実額）。
 *
 * **未選択のときに最終の累計は出さない** ── 同じ値が集計段の「この月の収支」に出ているため
 * （折れ線の終点＝期間の合計）。同じ数字を 1 画面に 2 回出さない。
 */
export function cumulativeValueLabel(locale: Locale, amountText: string): string {
  return t('data.cumulativeValue', locale, { amount: amountText });
}

/** 選択中の点を外すリンク（UI-SPEC §1.5-5）。点をもう一度押す経路は持たないので語で出す */
export function clearSelectionLabel(locale: Locale): string {
  return t('data.clearSelection', locale);
}

/**
 * 選択した点・タグの記録一覧（SelectedPointList 等）を 1 枚のカードにまとめたアコーディオン。
 * 「達成した記録」（labels.ts achievementShowMoreRecordsText）と同じ考え方 ──
 * 最初は先頭 3 件だけ見せ、「すべて見る」で残りを開く。件数が多い月・タグでもカードの高さが
 * 際限なく伸びないようにするため。
 */
export function selectedRecordsShowMoreText(locale: Locale, hiddenCount: number): string {
  return t('data.selectedRecordsShowMore', locale, { count: groupDigits(hiddenCount) });
}

/** 上記アコーディオンを畳むボタン */
export function selectedRecordsCollapseLabel(locale: Locale): string {
  return t('data.selectedRecordsCollapse', locale);
}

/** 選択した点の一覧の見出し（UI-SPEC §1.5-5）:「8月9日の記録　3件」 */
export function selectedPointTitle(locale: Locale, dateText: string, count: number): string {
  return t('data.selectedPointTitle', locale, { date: dateText, count });
}

/**
 * タグ別利益ランキングの行タップで開く内訳一覧の見出し。selectedPointTitle と同じ形
 * （日付の代わりにタグ名を主語にする）。
 */
export function selectedTagTitle(locale: Locale, tagName: string, count: number): string {
  return t('data.selectedTagTitle', locale, { tag: tagName, count });
}

/**
 * 「タグ別純利益の推移」グラフの日付内訳、その行をさらにタップして開く記録一覧の見出し。
 * selectedPointTitle・selectedTagTitle と同じ形で、日付とタグ名の両方を主語にする。
 */
export function selectedTagChartTitle(
  locale: Locale,
  dateText: string,
  tagName: string,
  count: number,
): string {
  return t('data.selectedTagChartTitle', locale, { date: dateText, tag: tagName, count });
}

/**
 * 「タグ別純利益の推移」グラフの点タップで開くタグ別内訳の見出し脇の 1 行（採用案 1a）:
 * 「3タグ・3件」。日付そのもの（太字）に添える語で、対象の広さ（何タグ・何件ぶんの合計か）を言う。
 */
export function tagChartDaySummaryMetaText(
  locale: Locale,
  tagCount: number,
  recordCount: number,
): string {
  return t('data.tagChartDaySummaryMeta', locale, {
    tagCount,
    records: recordCountValue(locale, recordCount),
  });
}

/**
 * 期間サマリー段（グラフ直下・新規）の項目名。売上・収支（t('amount.totalSales', 'ja') /
 * t('amount.totalProfit', 'ja')）に続く 2 項目 ── どちらもこの画面にしかない値なのでここで定義する。
 */
export function profitRateLabel(locale: Locale): string {
  return t('data.profitRate', locale);
}
/** 出品中を含まない「売れた」件数だけを数える（listingCountLabel('ja') とは対象が違う） */
export function soldCountLabel(locale: Locale): string {
  return t('data.soldCount', locale);
}

/**
 * 利益率の表示。売上合計が 0（= 対象 0 件）で算出できないときは t('detail.amountPlaceholder', 'ja')
 * （「ーー」）── 0% だと「収支ちょうど 0」に読めてしまうため（periodProfitRate 参照）。
 */
export function profitRateSummaryValue(locale: Locale, rate: number | null): string {
  return rate == null
    ? t('detail.amountPlaceholder', locale)
    : t('data.profitRateValue', locale, { rate: rate.toFixed(1) });
}

/** 展開行の 3 列目（案 1c）。1 件あたりの純利益（= 純利益合計 ÷ 販売件数） */
export function perRecordProfitLabel(locale: Locale): string {
  return t('data.perRecordProfit', locale);
}

/**
 * 1 件あたり純利益の表示。販売件数が 0（periodProfitPerRecord が null）のときは
 * t('detail.amountPlaceholder', 'ja')（「ーー」）── profitRateSummaryValue と同じ理由。
 *
 * 符号つきの金額は formatSignedYenSymbol を使う（`-¥3,500` の順。一覧の行の純利益・
 * グラフカードの選択値・帯グラフの不足額と同じ表記）── formatYenSymbol だけを通すと
 * `¥-3,500`（¥ の直後にマイナス）になり、アプリ内の他の符号つき金額と順序が食い違う。
 */
export function perRecordProfitValue(locale: Locale, value: number | null): string {
  return value == null ? t('detail.amountPlaceholder', locale) : formatSignedYenSymbol(value);
}

/** 展開行の 4 列目。記録日 → 販売日の経過日数の単純平均（periodAverageSaleDays） */
export function averageSaleDaysLabel(locale: Locale): string {
  return t('data.averageSaleDays', locale);
}

/**
 * 平均販売日数の表示。対象記録が 0 件（日付逆転を除いて。periodAverageSaleDays が null）の
 * ときは t('detail.amountPlaceholder', 'ja')（「ーー」）── profitRateSummaryValue と同じ理由。
 * 小数第 1 位までにする（1 件あたり純利益と違って端数が出やすい平均値のため）。
 */
export function averageSaleDaysValue(locale: Locale, days: number | null): string {
  return days == null
    ? t('detail.amountPlaceholder', locale)
    : t('data.averageSaleDaysValue', locale, { days: days.toFixed(1) });
}

/** 集計段直下の開閉行の文言（案 1c）。閉じているときにタップを促す語 / 開いているときに畳む語 */
export function detailsExpandLabel(locale: Locale): string {
  return t('data.detailsExpand', locale);
}
export function detailsCollapseLabel(locale: Locale): string {
  return t('data.detailsCollapse', locale);
}

export function detailsToggleLabel(locale: Locale, expanded: boolean): string {
  return t(expanded ? 'data.detailsCollapse' : 'data.detailsExpand', locale);
}

/**
 * データタブ「収支」セクションの新規カード（logic/periodComparison.ts）。
 * 見出しと、比較対象が 0 件のときの代替文言。
 */
export function periodComparisonTitle(locale: Locale): string {
  return t('data.periodComparisonTitle', locale);
}
export function periodComparisonEmptyText(locale: Locale): string {
  return t('data.periodComparisonEmpty', locale);
}

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
export function periodComparisonCountDiffText(locale: Locale, diff: number): string {
  return t('data.periodComparisonCountDiff', locale, {
    arrow: diff > 0 ? '▲' : diff < 0 ? '▼' : '',
    sign: diff > 0 ? '+' : '',
    count: diff,
  });
}

/**
 * 利益率差分の 1 行「▲+3.6pt」（前期間比較カード）。ポイント差なので % ではなく pt を付ける。
 * どちらかの期間の売上合計が 0 で比率が出せないときは t('detail.amountPlaceholder', 'ja')（「ーー」）。
 */
export function periodComparisonRateDiffText(locale: Locale, diffPt: number | null): string {
  if (diffPt == null) return t('detail.amountPlaceholder', locale);
  const rounded = Number(diffPt.toFixed(1));
  return t('data.periodComparisonRateDiff', locale, {
    arrow: rounded > 0 ? '▲' : rounded < 0 ? '▼' : '',
    sign: rounded > 0 ? '+' : '',
    value: rounded.toFixed(1),
  });
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
export function chartUnitNote(locale: Locale): string {
  return t('data.chartUnitNote', locale, {
    all: t('period.allInline', locale),
    month: chartUnitLabel(locale, 'month'),
    year: chartUnitLabel(locale, 'year'),
    years: YEAR_UNIT_MONTH_THRESHOLD / 12,
    total: totalProfitLabel(locale),
  });
}

/** タグが 1 つも付いていない売れた記録をまとめる集計名（タグ別利益ランキングの 1 行） */
export function unclassifiedTagLabel(locale: Locale): string {
  return t('data.unclassifiedTag', locale);
}

/**
 * タグ別利益ランキングの行の補足（「利益率 32.1%・8件」）。
 * 率だけだと何の%か初見で伝わらないため t('data.profitRate', 'ja') を頭に付ける。
 */
export function tagProfitMetaText(locale: Locale, rateText: string, countText: string): string {
  return t('data.tagProfitMeta', locale, {
    rateLabel: t('data.profitRate', locale),
    rate: rateText,
    count: countText,
  });
}

/**
 * 記録のないタグ（そのタグの売れた記録が 0 件）をまとめる開閉行の文言（案 2b）。
 * ランキング本体には出さず、下に畳んでおく ── 0 件のタグまで並ぶと純利益の高い順という
 * 主題が薄まるため。detailsToggleLabel と同じ「開閉状態で語を変える」形。
 */
export function zeroRecordTagsToggleLabel(
  locale: Locale,
  count: number,
  expanded: boolean,
): string {
  return t(expanded ? 'data.zeroRecordTagsHide' : 'data.zeroRecordTagsShow', locale, { count });
}

/**
 * タグ別利益ランキングのスパークライン（各タグ右端の小さな折れ線。案 2b）の説明文。
 * **全タグ共通の目盛り**であることを言う ── 個々に自動フィットさせると高さがタグごとに
 * 意味を持たなくなり、「背が高い＝良い」に見えてしまうため（実装は combinedAxisBounds）。
 */
/** 「重ねる」モードでタグを 1 つも選んでいないときの 1 行 */
export function tagOverlayEmptyNote(locale: Locale): string {
  return t('data.tagOverlayEmptyNote', locale);
}

export function tagSparklineNote(locale: Locale): string {
  return t('data.tagSparklineNote', locale);
}

/**
 * タグ別の純利益セクション（案 1b）の 2 択。既定は「一覧」（行ごとの純利益・ランキング順）、
 * 「グラフ」で選んだタグぶんの折れ線を 1 枚に重ねた表示へ切り替える。
 * ボタンは常にどちらか出ている方のカードの右上に置く（一覧なら一覧カード、グラフならグラフカード）。
 */
export function tagSectionListModeLabel(locale: Locale): string {
  return t('data.tagSectionList', locale);
}
export function tagSectionOverlayModeLabel(locale: Locale): string {
  return t('data.tagSectionOverlay', locale);
}

/**
 * タグ別の純利益セクションの見出し下・小さな 1 行（「2026年・22件」）。
 * 大きく出す金額（期間合計の純利益）に、いつ・何件の話かを添える。
 */
export function tagSectionMetaText(
  locale: Locale,
  periodText: string,
  countText: string,
): string {
  return t('data.tagSectionMeta', locale, { period: periodText, count: countText });
}

/**
 * 「重ねる」モードのグラフカードの見出し。「収支の推移」カード（t('data.profitTrend', 'ja')）と
 * 同じ位置・同じ見た目で出す ── カードの仕様を収支のグラフと揃えるため。
 */
export function tagProfitTrendLabel(locale: Locale): string {
  return t('data.tagProfitTrend', locale);
}

/**
 * 対象のタグが 1 つも無い（= その期間に売れた記録が無い）ときの空状態。
 * tagProfits が空になる条件はグラフ本体の EmptyChart（series.length === 0）と同じ
 * （売れた記録が 1 件でもあれば、タグ無しでも「未分類」の 1 行として必ず候補に残るため）
 * なので、同じ data.noSoldData を使う。
 */
export function tagProfitTrendEmptyMessage(locale: Locale): string {
  return t('data.noSoldData', locale);
}

/**
 * データタブのセグメント（「収支」/「タグ」）。計算タブの「利益を出す/目標から逆算」と
 * 同じ SegmentedControl の型（選んだ瞬間に中身が入れ替わる・状態はタブ内の一時的な useState）。
 *
 * 以前はタグ別利益ランキング・推移をサブ画面に追い出し、入口カード 1 枚から push する形に
 * していたが、押さないと中身が見えず、収支と見比べたいときに行き来が面倒だった。
 * 同じ画面の中で切り替える形に戻し、期間・絞り込みは両モードで共有する（切替でリセットしない）。
 */
export function dataModeProfitLabel(locale: Locale): string {
  return t('data.modeProfit', locale);
}
export function dataModeTagLabel(locale: Locale): string {
  return t('data.modeTag', locale);
}
/** 3 つ目のセグメント（案 3c）。累計・自己ベスト・実績バッジを見るモード（月バーとは無関係） */
export function dataModeAchievementsLabel(locale: Locale): string {
  return t('data.modeAchievements', locale);
}

// ─────────────────────────────────────────────────────────────────────────────
// データタブ「実績」（案 3c）の表示語。logic/achievements.ts の判定結果（Achievement /
// PersonalBests）を画面の文言に変換する関数をここに集約する。
// ─────────────────────────────────────────────────────────────────────────────

/** 「次の実績」カードの見出し */
export function nextAchievementLabel(locale: Locale): string {
  return t('achievement.next', locale);
}
/** 全実績を達成したときのコンプリート表示（構成の「判断はお任せ」を受けた決定） */
export function achievementsCompleteTitle(locale: Locale): string {
  return t('achievement.completeTitle', locale);
}
export function achievementsCompleteMessage(locale: Locale): string {
  return t('achievement.completeMessage', locale);
}

/**
 * 実績ごとの名前・目標の単位（獲得済みバッジ・次の実績カードの両方で使う）。
 *
 * 成長系（⚡💰📦🎯🔍）5 ジャンル × 5 段階の名前は「ジャンル名 + しきい値」で統一する ──
 * 段階が増えても命名規則を覚え直さずに済む（利益ハンターだけ、💰累計利益★5=¥1,000,000の
 * 元からの固有名を残した特別扱い）。
 */
/**
 * 実績の名前は辞書から引く（`achievement.name.<id>`）。
 * **Record<id, 文字列> をここに持たない** ── import 時に固まって言語の切り替えに追従しない。
 */
export function achievementName(locale: Locale, id: AchievementId): string {
  return t(`achievement.name.${id}` as TranslationKey, locale);
}


/**
 * 記録保存時の実績獲得トースト（text1）。
 * 1個だけ新規獲得なら実績名をそのまま、複数なら件数でまとめる。
 */
export function achievementToastText(
  locale: Locale,
  newlyCompletedIds: readonly AchievementId[],
): string {
  if (newlyCompletedIds.length === 1) {
    return t('achievement.toastOne', locale, { name: achievementName(locale, newlyCompletedIds[0]) });
  }
  return t('achievement.toastMany', locale, { count: newlyCompletedIds.length });
}

/** 実績ごとの説明文（全画面表示。獲得した実績の一覧はこれを出さない） */
export function achievementDescription(locale: Locale, id: AchievementId): string {
  // long_battle だけ日数を差し込む（閾値は achievements.ts が持つ）
  return t(`achievement.description.${id}` as TranslationKey, locale, {
    days: LONG_BATTLE_DAYS_THRESHOLD,
  });
}


/** 段位（ブロンズ〜レジェンド）の表示語 */
const BADGE_TIER_KEYS = {
  bronze: 'achievement.tierBronze',
  silver: 'achievement.tierSilver',
  gold: 'achievement.tierGold',
  platinum: 'achievement.tierPlatinum',
  legend: 'achievement.tierLegend',
} as const satisfies Record<AchievementBadgeTier, TranslationKey>;

export function achievementBadgeTierName(locale: Locale, tier: AchievementBadgeTier): string {
  return t(BADGE_TIER_KEYS[tier], locale);
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
export function nextAchievementProgressText(locale: Locale, next: NextAchievement): string {
  return t(
    isProfitAchievement(next.id) ? 'achievement.progressYen' : 'achievement.progressCount2',
    locale,
    { current: groupDigits(next.current), target: groupDigits(next.target) },
  );
}

/** 「あと18件で解除」（構成のモック文言どおり。利益系は「あと¥◯◯」） */
export function remainingToUnlockText(locale: Locale, next: NextAchievement): string {
  const remaining = Math.max(0, next.target - next.current);
  return isProfitAchievement(next.id)
    ? t('achievement.remainingYen', locale, { amount: formatYenSymbol(remaining) })
    : t('achievement.remainingCount', locale, { count: groupDigits(remaining) });
}

/**
 * 「次点」の 1 行（構成の「次点の実績名も小さく添える」）。次の実績の次に進捗率が高い
 * 未達成の実績を、その実績の達成条件つきで小さく示す。無ければ出さない（呼び出し側で判定）。
 */
export function nextAchievementRunnerUpText(locale: Locale, runnerUp: Achievement): string {
  const remaining = Math.max(0, runnerUp.target - runnerUp.current);
  const name = achievementName(locale, runnerUp.id);
  return isProfitAchievement(runnerUp.id)
    ? t('achievement.runnerUpYen', locale, { name, amount: formatYenSymbol(remaining) })
    : t('achievement.runnerUpCount', locale, { name, count: groupDigits(remaining) });
}

export function yourRecordsLabel(locale: Locale): string {
  return t('personalBest.yourRecords', locale);
}
export function careerNetProfitLabel(locale: Locale): string {
  return t('personalBest.careerNetProfit', locale);
}
export function careerSalesLabel(locale: Locale): string {
  return t('personalBest.careerSales', locale);
}

export function earnedAchievementsLabel(locale: Locale): string {
  return t('achievement.earned', locale);
}
/** 「獲得した実績」見出し横の「すべて見る ›」（実績一覧画面への導線） */
export function viewAllAchievementsLabel(locale: Locale): string {
  return t('achievement.viewAll', locale);
}
/** 実績一覧画面（AchievementListScreen）のヘッダタイトル */
export function achievementListTitle(locale: Locale): string {
  return t('achievement.listTitle', locale);
}

/** 獲得した実績カード見出し右の「4/8」 */
export function achievementProgressCountText(
  locale: Locale,
  earnedCount: number,
  totalCount: number,
): string {
  return t('achievement.progressCount', locale, { earned: earnedCount, total: totalCount });
}

/**
 * 「未解除」セクションの見出し「未解除（3）」。
 * 「獲得した実績」カードの未解除チップ列・実績一覧画面（AchievementListScreen）の
 * 未解除グリッドの両方で使う（同じ言い回しを 1 か所にまとめる）。
 */
export function lockedAchievementsSectionTitle(locale: Locale, count: number): string {
  return t('achievement.lockedSectionTitle', locale, { count });
}

/** 実績一覧画面（AchievementListScreen）のジャンル別カードの見出し（AchievementCategory → 表示名） */
const ACHIEVEMENT_GENRE_KEYS = {
  strike: 'achievement.genreStrike',
  career_profit: 'achievement.genreCareerProfit',
  sold_count: 'achievement.genreSoldCount',
  tag_specialty: 'achievement.genreTagSpecialty',
  tag_bestseller: 'achievement.genreTagBestseller',
  start: 'achievement.genreStart',
  tag: 'achievement.genreTag',
  sales_technique: 'achievement.genreOther',
} as const satisfies Record<AchievementCategory, TranslationKey>;

export function achievementGenreTitle(locale: Locale, category: AchievementCategory): string {
  return t(ACHIEVEMENT_GENRE_KEYS[category], locale);
}

/** 全画面表示（実績タップ時）の「達成した記録」行の見出し */
export function achievementCompletedRecordLabel(locale: Locale): string {
  return t('achievement.completedRecord', locale);
}

/**
 * 全画面表示「達成した記録」セクションの見出し。1 件なら件数を付けない（従来どおり）。
 * 累計利益・販売件数などの積み重ね系は複数件になるので「達成した記録（12件）」と件数を添える。
 */
export function achievementCompletedRecordsSectionTitle(locale: Locale, count: number): string {
  return count <= 1
    ? t('achievement.completedRecord', locale)
    : t('achievement.completedRecordWithCount', locale, { count });
}

/** 「達成した記録」アコーディオンの「もっと見る」（構成：最初の3件だけ表示し、残りは開いて見る） */
export function achievementShowMoreRecordsText(locale: Locale, hiddenCount: number): string {
  return t('achievement.showMoreRecords', locale, { count: groupDigits(hiddenCount) });
}

/** 「達成した記録」アコーディオンを閉じるボタン */
export function achievementCollapseRecordsLabel(locale: Locale): string {
  return t('achievement.collapseRecords', locale);
}

/** 全画面表示のページ番号「3 / 4」 */
export function achievementPageIndicatorText(
  locale: Locale,
  index: number,
  total: number,
): string {
  return t('achievement.pageIndicator', locale, { index: index + 1, total });
}

/** 全画面表示の左右の矢印。スワイプ以外にも移動できることを示す（読み上げ用） */
export function achievementDetailPreviousLabel(locale: Locale): string {
  return t('achievement.detailPrevious', locale);
}
export function achievementDetailNextLabel(locale: Locale): string {
  return t('achievement.detailNext', locale);
}

export function personalBestsLabel(locale: Locale): string {
  return t('personalBest.sectionTitle', locale);
}
export function bestNetProfitLabel(locale: Locale): string {
  return t('personalBest.bestNetProfit', locale);
}
export function bestSalesPriceLabel(locale: Locale): string {
  return t('personalBest.bestSalesPrice', locale);
}
export function fastestSaleLabel(locale: Locale): string {
  return t('personalBest.fastestSale', locale);
}
export function bestMonthByCountLabel(locale: Locale): string {
  return t('personalBest.bestMonthByCount', locale);
}
export function bestMonthByProfitLabel(locale: Locale): string {
  return t('personalBest.bestMonthByProfit', locale);
}
export function bestTagLabel(locale: Locale): string {
  return t('personalBest.bestTag', locale);
}

/**
 * 自己ベストのタイルに値が無い（0 件）ときのプレースホルダ。
 * t('detail.amountPlaceholder', 'ja') と同じ表記だが、定義がこの位置より後ろにあるため文字列を直書きする
 * （TDZ を避けるための重複。値は 1 か所で変えられるよう t('detail.amountPlaceholder', 'ja') 側が真実）。
 */
function personalBestEmptyValue(locale: Locale): string {
  return t('personalBest.emptyValue', locale);
}

/** 最速販売のタイルの値「2日」 */
export function fastestSaleValueText(locale: Locale, bests: PersonalBests): string {
  return bests.fastestSale == null
    ? personalBestEmptyValue(locale)
    : t('personalBest.fastestSaleValue', locale, { days: bests.fastestSale.days });
}

/** 最多販売月のタイルの値「8月・9件」 */
export function bestMonthByCountValueText(locale: Locale, bests: PersonalBests): string {
  if (bests.bestMonthByCount == null) return personalBestEmptyValue(locale);
  const [, month] = bests.bestMonthByCount.monthKey.split('-').map(Number);
  return t('personalBest.bestMonthByCountValue', locale, {
    month: formatMonthCell(locale, month),
    count: bests.bestMonthByCount.count,
  });
}

/** 最高月間利益のタイルのサブ見出し「2026年8月」 */
export function bestMonthProfitDateText(locale: Locale, bests: PersonalBests): string | null {
  return bests.bestMonthByProfit == null
    ? null
    : formatMonthKeyTitle(locale, bests.bestMonthByProfit.monthKey);
}

/**
 * 最多販売タグのタイルの値「未分類・7件」「全32件中」。タグ名は呼び出し側（tags 一覧を
 * 持つ画面）が解決する ── logic 層は tagId しか知らないため（DataScreen の joinTagRanking と同じ分担）。
 */
export function bestTagValueText(locale: Locale, tagName: string, count: number): string {
  return t('personalBest.bestTagValue', locale, { tag: tagName, count });
}

export function bestTagOfTotalText(locale: Locale, totalCount: number): string {
  return t('personalBest.bestTagOfTotal', locale, { count: totalCount });
}

// ─────────────────────────────────────────────────────────────────────────────
// 記録フォーム（UI-SPEC §1.3 / 採用案 3c）とレコード詳細（§1.4 / 採用案 3d）の表示語。
// どちらも「販売価格から控除を縦に引いて結果に至る」1 枚の伝票なので、行の語は共通にする。
// ─────────────────────────────────────────────────────────────────────────────

/** 記録フォームのシートヘッダ（UI-SPEC §1.3-2）。中央の見出しは新規と編集で出し分ける */
export function newRecordTitle(locale: Locale): string {
  return t('form.newTitle', locale);
}
export function editRecordTitle(locale: Locale): string {
  return t('form.editTitle', locale);
}
export function cancelLabel(locale: Locale): string {
  return t('action.cancel', locale);
}
export function saveLabel(locale: Locale): string {
  return t('form.save', locale);
}

/**
 * レコード詳細のメタ行の状態バッジ（UI-SPEC §1.4-2）。
 * 一覧の状態チップ（t('list.soldRecords', 'ja') =「売れた記録」）は絞り込みの対象を指すが、
 * こちらはこの 1 件の状態を指すので「記録」を付けない。
 */
export function soldBadgeLabel(locale: Locale): string {
  return t('detail.soldBadge', locale);
}

/**
 * レコード詳細の状態カードのボタン（UI-SPEC §8.1 / §8.4）。状態を変える唯一の手段（§5-13）。
 *
 * 案 15c でトグル（旧 MARK_AS_SOLD_LABEL =「売れた状態にする」）を廃止し、
 * 状態ごとに 1 個のボタンへ置き換えた。順方向の語がバッジ（t('detail.soldBadge', 'ja')）と同じ「売れた」
 * になるが、バッジは状態の表示・こちらは操作なので定数を分けておく（§8.8）。
 */
export function markAsSoldButtonLabel(locale: Locale): string {
  return t('detail.markAsSold', locale);
}
export function revertToListingButtonLabel(locale: Locale): string {
  return t('detail.revertToListing', locale);
}

/**
 * 売れた日の行のラベル（UI-SPEC §8.2）。売れた記録である限り常設する行の見出し。
 * 入力欄の t('form.soldDate', 'ja')（「販売日」）とは**あえて語を揃えない** ──
 * 行は「いつ売れたか」を読む場所、欄は日付を入れる場所で、役割が違う（§8.8）。
 */
export function soldDateRowLabel(locale: Locale): string {
  return t('detail.soldDateRow', locale);
}

/**
 * 「売れた」を押した直後に出すバーの本文と取り消し（UI-SPEC §8.3）。
 * バーは数秒で消えるので、本文は読み上げ（announceForAccessibility）にも使う。
 */
export function markedAsSoldMessage(locale: Locale): string {
  return t('detail.markedAsSoldMessage', locale);
}
export function undoLabel(locale: Locale): string {
  return t('detail.undo', locale);
}

/** 出品中に戻す確認の実行ボタン（UI-SPEC §8.4）。破壊的操作なので「はい」とは言わせない */
export function revertToListingConfirmLabel(locale: Locale): string {
  return t('detail.revertToListingConfirmLabel', locale);
}

/**
 * カレンダーの曜日見出し（UI-SPEC §8.10）。
 * **週の始まりは日曜固定**。言語を変えても動かさない ── 利用者は日本の出品者で、
 * 英語表示を選んでも見ている暦は日本のもの（§0）。
 */
export function weekdayLabels(locale: Locale): readonly string[] {
  return locale === 'en'
    ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    : ['日', '月', '火', '水', '木', '金', '土'];
}

/**
 * カレンダーの今日の印の読み上げ語（UI-SPEC §8.10）。
 * 印そのものは記号（今日 = 点、出品日 = 小さな旗）なので、読み上げにだけ語を出す。
 * 出品日の旗の語は t('form.listedDate', 'ja') をそのまま使う。
 */
export function todayMarkerLabel(locale: Locale): string {
  return t('calendar.todayMarker', locale);
}

/** カレンダーを閉じる（日付は押した時点で入るので「決定」ではない） */
export function closeLabel(locale: Locale): string {
  return t('action.close', locale);
}

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
export function relativeDayLabels(locale: Locale): readonly string[] {
  return [t('calendar.today', locale), t('calendar.yesterday', locale), t('calendar.dayBeforeYesterday', locale)];
}

/**
 * 年月見出しのボタンの読み上げ語（UI-SPEC §8.10.3）。
 * 見出しそのものは「2026年8月 ▾」だが、押すと何が起きるかは形からは読めない。
 */
export function chooseMonthLabel(locale: Locale): string {
  return t('calendar.chooseMonth', locale);
}

/** 商品名の欄（UI-SPEC §1.3-4）。必須であることは欄名ではなくキャプションで示す（SPEC §5.2） */
export function itemNameLabel(locale: Locale): string {
  return t('form.itemName', locale);
}
export function itemNameCaption(locale: Locale): string {
  return t('form.itemNameCaption', locale);
}
export function itemNamePlaceholder(locale: Locale): string {
  return t('form.itemNamePlaceholder', locale);
}

/** 商品名が空のレコードの表示（一覧・レコード詳細） */
export function untitledLabel(locale: Locale): string {
  return t('list.untitled', locale);
}

/**
 * 伝票・レシートで梱包材とその他をまとめた 1 行（UI-SPEC §1.3-10 / §1.4-4）。
 * 計算タブの内訳は帯グラフと同じ項目別の一覧（梱包材・その他は別の行）なので、
 * まとめた語を持つのは伝票・レシート側だけになった。
 */
export function envelopeAndOthersFieldLabel(locale: Locale): string {
  return t('form.envelopeAndOthers', locale);
}

/** 値の入っていない欄に出す語（UI-SPEC §1.3-10 / §1.4-4。40% グレーで出す） */
export function unsetInputLabel(locale: Locale): string {
  return t('form.unsetInput', locale);
}

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
export function shortfallSegmentLabel(locale: Locale): string {
  return t('list.shortfallSegment', locale);
}

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
 * 「いくらで売る?」画面の未設定時（E。t('pricing.priceUnsetDescription', 'ja')）と同じ考え方。
 */
export function breakdownBarUnpricedNote(locale: Locale): string {
  return t('conclusion.unpricedBreakdown', locale);
}

/** メモ（UI-SPEC §1.3-13 / §1.4-6） */
export function memoLabel(locale: Locale): string {
  return t('form.memo', locale);
}
export function memoEmptyLabel(locale: Locale): string {
  return t('detail.memoEmpty', locale);
}

/** 日付の欄名（UI-SPEC §1.3-12 / §1.4-2） */
export function listedDateFieldLabel(locale: Locale): string {
  return t('form.listedDate', locale);
}
export function soldDateFieldLabel(locale: Locale): string {
  return t('form.soldDate', locale);
}

/**
 * 売れた日のカレンダーで**選べない理由**を出す一行（UI-SPEC §8.10）。
 *
 * 淡いマスを見た人が理由を自分で埋めずに済むようにする ── 旧ホイールは選択肢ごと消したため、
 * 「過去に入力した内容しか出てこない」と誤解された。制約（§8.5）をそのまま語にした行。
 */
export function soldDatePickerNote(locale: Locale, listedDateText: string): string {
  return t('form.soldDatePickerNote', locale, { date: listedDateText });
}

/**
 * 出品日が未来の記録での一行（UI-SPEC §8.5 派生決定 3）。
 * 選べる範囲が出品日 1 日しかないので、上の言い方では何も説明していないことになる。
 */
export function soldDatePickerSingleDayNote(locale: Locale, listedDateText: string): string {
  return t('form.soldDateSingleDayNote', locale, { date: listedDateText });
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
export function soldDateChipsNote(locale: Locale, listedDateText: string): string {
  return t('form.soldDateChipsNote', locale, { date: listedDateText });
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
  locale: Locale,
  saleStartDate: Date,
  today: Date,
): { calendar: string; chips: string } {
  const listedDateText = formatShortDate('ja', saleStartDate);

  if (daysBetween(saleStartDate, today) < 0) {
    const singleDay = soldDatePickerSingleDayNote(locale, listedDateText);
    return { calendar: singleDay, chips: singleDay };
  }

  return {
    calendar: soldDatePickerNote(locale, listedDateText),
    chips: soldDateChipsNote(locale, listedDateText),
  };
}

/**
 * 出品日のカレンダーで選べない理由を出す一行（UI-SPEC §8.10.4）。
 *
 * 出品日には下限がなく、落ちるのは未来だけ（§8.10.1）。売れた日と同じ「一行で名指しする」
 * 扱いをここでも通す ── 欄によって淡いマスの説明が出たり出なかったりすると、
 * 説明のない画面では欠落を不具合と読む。
 */
export function listedDatePickerNote(locale: Locale): string {
  return t('form.listedDatePickerNote', locale);
}

/** レコード詳細の下端操作列（UI-SPEC §1.4-7）と削除の確認アラート（SPEC §5.4） */
export function editRecordLabel(locale: Locale): string {
  return t('detail.edit', locale);
}
export function deleteLabel(locale: Locale): string {
  return t('action.delete', locale);
}
export function deleteConfirmTitle(locale: Locale): string {
  return t('detail.deleteConfirmTitle', locale);
}

/** 伝票の控除行の行名（UI-SPEC §1.3-7〜9 / §1.4-4）:「− 送料」 */
export function deductionLabel(locale: Locale, name: string): string {
  return t('form.deduction', locale, { name });
}

/** 伝票の加算行の行名（UI-SPEC §1.3-10）:「＋ 梱包材・その他」 */
export function additionLabel(locale: Locale, name: string): string {
  return t('action.addition', locale, { name });
}

/** レコード詳細のレシートの手数料行（UI-SPEC §1.4-4）:「販売手数料 (10%)」 */
export function commissionRowLabel(locale: Locale, rate: number): string {
  return t('detail.commissionRow', locale, { rate });
}

/**
 * 記録フォームの状態切替リンク（UI-SPEC §1.3-3）:「出品中にする」/「売れた記録にする」。
 * 引数は**切り替えた先**の状態。見出し行には今の状態が出ているので、リンクは行き先を名乗る。
 */
export function switchStatusLabel(locale: Locale, toSold: boolean): string {
  return t(toSold ? 'form.switchToSold' : 'form.switchToListing', locale);
}

/**
 * 日付カードの折りたたみ見出し（UI-SPEC §1.3-12）:「販売日 今日（2026/08/09）」。
 *
 * 畳んだままでも操作対象の日付が読めるようにする（optionalCostsLabel と同じ考え方）。
 * 出す日付は状態によって変わる ── 出品中には販売日がない（SPEC.md §3.2）ため。
 */
export function dateSectionLabel(locale: Locale, isSold: boolean, dateText: string): string {
  return t('form.dateSection', locale, {
    label: t(isSold ? 'form.soldDate' : 'form.listedDate', locale),
    date: dateText,
  });
}

/** 当日の日付（UI-SPEC §1.3-12）:「今日（2026/08/09）」。判定は呼び出し側（暦日差 0） */
export function todayDateLabel(locale: Locale, dateText: string): string {
  return t('form.today', locale, { date: dateText });
}

/**
 * 出品中に戻すときの確認（UI-SPEC §8.4）:「販売日 8/10 が消えます。戻しますか？」。
 *
 * 逆方向（売れた → 出品中）だけ確認を挟むのは意図どおり ── 入力済みの日付が消える
 * 破壊的操作で、順方向（今日を入れるだけ・すぐ直せる）とは重さが違う。
 * 日付は M/d（メタ行と同じ形式。呼び出し側で formatShortDate する）。
 */
export function revertToListingConfirmTitle(locale: Locale, soldDateText: string): string {
  return t('detail.revertToListingConfirmTitle', locale, { date: soldDateText });
}

/**
 * メモの折りたたみ見出し（UI-SPEC §1.3-13）。
 * 入力済みなら畳んだままでもそれが分かるよう語を変える（optionalCostsLabel と同じ考え方）。
 */
export function memoSectionLabel(locale: Locale, memo: string): string {
  return t(memo === '' ? 'form.memoWrite' : 'form.memo', locale);
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
export function recordTimelineText(
  locale: Locale,
  timeline: {
    kind: RecordKind;
    /** 出品日「8/2」 */
    listedDate: string;
    /** 販売日「8/9」。出品中は null */
    soldDate: string | null;
    days: number;
  },
): string {
  // 出品中と売れた記録で 1 文まるごと分ける（矢印の前後を継ぎ足す形にしない）
  const kind = recordKindLabel(locale, timeline.kind);
  return timeline.soldDate == null
    ? t('detail.timelineListing', locale, {
        kind,
        listedDate: timeline.listedDate,
        elapsed: formatElapsedDays(locale, timeline.days),
      })
    : t('detail.timelineSold', locale, {
        kind,
        listedDate: timeline.listedDate,
        soldDate: timeline.soldDate,
        days: timeline.days,
      });
}

// ---- UI-SPEC §7 電卓 ----

/** 電卓シートの見出し（§7.1）。行き先の欄の名前をそのまま冠する */
export function calculatorTitle(locale: Locale, fieldLabel: string): string {
  return t('calculator.title', locale, { field: fieldLabel });
}

/** 合計を欄へ書き戻すボタン（§7.1）。「OK」ではなく行き先が読める語にする */
export function calcSubmitLabel(locale: Locale): string {
  return t('calculator.submit', locale);
}

/** 積み上げた行の合計（§7.1） */
export function calcTotalLabel(locale: Locale): string {
  return t('calculator.total', locale);
}

/**
 * 積み上げの末尾（§7.1-4）。記録フォームの「＋ 梱包材・その他」と同じ形にするため、
 * 「＋ 」は additionLabel が付ける（半角の `+` に振れないよう字を 1 か所に持つ）。
 */
export function calcAddRowLabel(locale: Locale): string {
  return t('calculator.addRow', locale);
}

/**
 * 積み上げの末尾の中央（SPEC-V3 §4.5 / 設計案 26c）。左「＋ 行を足す」と右「AC」の間。
 * 頭のタグ印はアイコンで出す（PresetTagButton と同じ `pricetag-outline`）ので、語だけを持つ。
 */
export function calcPickPackagingLabel(locale: Locale): string {
  return t('calculator.pickPackaging', locale);
}

/**
 * 複数選択シートのヘッダ左（§4.5 / 設計案 26c）。「キャンセル」ではなく**戻り先の名前**にする ──
 * このシートは電卓の上に重なって出るので、閉じると電卓に戻ることが語から読める方がよい。
 * 「‹」はアイコンで出す。
 */
export function calcPickerBackLabel(locale: Locale): string {
  return t('preset.pickerBack', locale);
}

/** 複数選択シートの合計行（§4.5-3）。選んだ数を「点」で数える（金額と混ざらない単位） */
export function presetPickedCountLabel(locale: Locale, count: number): string {
  return t('preset.pickedCount', locale, { count });
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
export function calcClearAllA11yLabel(locale: Locale): string {
  return t('calculator.clearAllAccessibility', locale);
}
export function calcBackspaceA11yLabel(locale: Locale): string {
  return t('calculator.backspaceAccessibility', locale);
}

/** 行頭の記号（§7.2）。1 行目にも `＋` を出す（列がそろう。派生決定） */
// 記号そのものなので訳さない（CALC_KEY_* は定数のまま）
export function calcRowSignLabel(sign: CalcRowSign): string {
  return sign === '-' ? CALC_KEY_MINUS : CALC_KEY_PLUS;
}

/**
 * 「入れる」が押せない理由を合計行の下に出す 1 行（§7.4）。
 * ボタンがグレーなだけでは理由が分からないため、無効の間だけ名指しする。
 */
export function calculatorBlockedNote(
  locale: Locale,
  reason: CalcSubmitBlockedReason,
): string {
  return t(reason === 'negative' ? 'calculator.blockedNegative' : 'calculator.blockedEmpty', locale);
}

// ---- SPEC-V3 §1 プリセット ----
//
// 3 種の表示名と、編集シートの保存が無効なときの理由（§3.3）。
// 判定そのものは logic/preset.ts が持ち、ここは理由コードを文言に写すだけ
// （calculatorBlockedNote と同じ分担）。

/** 種類そのものの表示名（§2.1 の見出し）。設定タブの行・一覧・選択シートで共通 */
/** 文中に埋め込む種類の語（英語だけ小文字・複数形。「Save the packaging you use often」） */
export function presetTypeInlineLabel(locale: Locale, type: PresetType): string {
  if (type === 'site') return t('preset.typeSiteInline', locale);
  return type === 'shipping'
    ? t('preset.typeShippingInline', locale)
    : t('preset.typePackagingInline', locale);
}

export function presetTypeLabel(locale: Locale, type: PresetType): string {
  if (type === 'site') return t('preset.typeSite', locale);
  return type === 'shipping' ? t('preset.typeShipping', locale) : t('preset.typePackaging', locale);
}

/**
 * 保存が押せない理由を値の欄の下に出す 1 行（§3.3）。
 * ボタンがグレーなだけでは理由が分からない（UI-SPEC §7.4 と同じ方針）。
 *
 * 名前の重複は弾かないので、それを咎める文言はここにない（§1.4）。
 */
export function presetBlockedNote(
  locale: Locale,
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
      return t('presetAdmin.errorNameRequired', locale);
    case 'name-too-long':
      return t('presetAdmin.errorNameTooLong', locale, { max: PRESET_NAME_MAX_LENGTH });
    case 'value-out-of-range':
      return isRatePreset(type)
        ? t('presetAdmin.errorRateRange', locale, { max: PRESET_RATE_MAX })
        : t('presetAdmin.errorAmountRange', locale);
    // まとめ買い（§2.6.6）。入数は空・0・上限超え・小数のどれも同じ 1 行で足りる ──
    // 直す先が 1 つの欄しかなく、どう間違えたかを言い分けても打ち直す手は変わらない
    case 'pack-quantity-required':
      return t(
        method === 'usage' ? 'presetAdmin.errorUsageCount' : 'presetAdmin.errorPackQuantity',
        locale,
      );
    case 'pack-price-out-of-range':
      return t('presetAdmin.errorPackPrice', locale);
    // 面積方式（SPEC-V10 §1.4）。購入サイズは必須、平均使用サイズは「両方か、両方空か」
    case 'pack-size-required':
      return t('presetAdmin.errorPackSize', locale);
    case 'use-size-invalid':
      return t('presetAdmin.errorUseSize', locale);
    // 専用資材の代金（SPEC-V6 §2）。0 円を許すので「入れてください」ではない ──
    // 咎めるのは範囲の外だけで、空欄はそのまま 0 円として保存できる
    case 'material-cost-out-of-range':
      return t('presetAdmin.errorMaterialCost', locale);
  }
}

/**
 * タグの保存が押せない理由（SPEC-V4 §1.3）。presetBlockedNote と同じ役割。
 *
 * プリセットと違って**重複を咎める文言がある** ── タグは絞り込みの意味そのもので、
 * 同名が 2 つあると解除バーがどちらのことか言えなくなる（§1.3）。
 */
export function tagBlockedNote(locale: Locale, reason: TagInvalidReason): string {
  switch (reason) {
    case 'name-required':
      return t('tag.errorNameRequired', locale);
    case 'name-too-long':
      return t('tag.errorNameTooLong', locale, { max: TAG_NAME_MAX_LENGTH });
    // 理由を「CSV の区切りに使うから」まで言わない ── 打ち直す手は変わらない
    case 'name-has-separator':
      return t('tag.errorNameHasSeparator', locale, { separator: TAG_NAME_SEPARATOR });
    case 'name-duplicated':
      return t('tag.errorNameDuplicated', locale);
  }
}

/**
 * バッジの右に出す値（§3.2 の一覧・§3.3 のプレビュー）:「210円」/「9.8円」/「10%」。
 *
 * 金額を roundForDisplay（整数）で丸めない ── まとめ買いの単価は小数第 1 位まで意味を持ち
 * （§2.6.3）、記録に入るのもその値なので、一覧だけ「10円」と出ると
 * **同じプリセットの金額が画面によって違って見える**。末尾の `.0` は出さない。
 */
export function presetValueText(locale: Locale, type: PresetType, value: number): string {
  return isRatePreset(type)
    ? t('presetAdmin.valueTextRate', locale, { value })
    : formatUnitYen(locale, value);
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
  locale: Locale,
  value: number,
  materialCost: number,
): string {
  return t('presetAdmin.shippingMaterialRow', locale, {
    postage: formatUnitYen(locale, value),
    material: formatUnitYen(locale, materialCost),
  });
}

// ---- SPEC-V3 §3.1 設定タブ「入力を減らす」 ----

/** 群の見出し（§3.1）。UI-SPEC §1.6-3 の「（今後）」を外した形 */
export function presetSectionTitle(locale: Locale): string {
  return t('settings.preset.title', locale);
}

/**
 * **移行前の呼び出し用（日本語固定）。** 一覧の空表示とチュートリアルの本文が、
 * この語を文の中に埋め込んで参照している（どちらもステップ 1 の対象外）。
 */
export const PRESET_SECTION_TITLE = t('settings.preset.title', 'ja');

/** 群の下の注記 1 行（§3.1） */
export function presetSectionNote(locale: Locale): string {
  return t('settings.preset.note', locale);
}

/**
 * 登録件数（§3.1）。カードの中に収まりきらないぶんの数でもある（presetOverflowLabel）。
 * 英語だけ 1 件と 2 件で語形が変わるので、辞書側で複数形を持たせている。
 */
export function presetCountLabel(locale: Locale, count: number): string {
  return t('common.count', locale, { count });
}

/**
 * カードに出しきれなかった残りの数（設計案 24a）。
 * 「＋3」ではなく件数として読める語にする ── カードの中の他の文字（金額）と並ぶため。
 */
export function presetOverflowLabel(count: number): string {
  return `ほか${presetCountLabel('ja', count)}`;
}

/**
 * 1 件も登録がない種類のカードに出す 1 行（設計案 24a）。一覧の空表示（§3.2）とは別の短い形。
 *
 * **移行前の呼び出し用（日本語固定）。** PresetSummaryCard がまだ参照している
 * （設定タブの一覧に載るカードだが、部品そのものの移行はステップ 2）。
 * 設定タブのタグのカードは同じ語を `tagCardEmptyLabel()` から取る。
 */
export const PRESET_CARD_EMPTY_LABEL = t('common.notRegistered', 'ja');

// ---- SPEC-V3 §3.2 一覧画面 ----

/** カード末尾の追加行（§3.2-3）:「＋ 送料を追加」。「＋ 」は additionLabel が付ける */
export function presetAddLabel(locale: Locale, type: PresetType): string {
  return t('presetAdmin.addLabel', locale, { type: presetTypeLabel(locale, type) });
}

/** 空表示（§3.2-4）。EmptyState の見出しと本文 */
export function presetEmptyTitle(locale: Locale): string {
  return t('presetAdmin.emptyTitle', locale);
}
export function presetEmptyBody(locale: Locale, type: PresetType): string {
  return t('presetAdmin.emptyBody', locale, { type: presetTypeInlineLabel(locale, type) });
}

/** 一覧の下の注記（§3.5）。「保存済みの記録は変わらない」は販売サイトの行で 1 度だけ明示する */
export function presetListNote(locale: Locale, type: PresetType): string {
  if (type === 'site') return t('presetAdmin.listNoteSite', locale);
  return type === 'shipping'
    ? t('presetAdmin.listNoteShipping', locale)
    : t('presetAdmin.listNotePackaging', locale);
}

/** ヘッダ右の編集モードの切り替え（設計案 25a）。押した先ではなく今の状態から見た行き先を出す */
export function presetEditModeLabel(locale: Locale): string {
  return t('presetAdmin.editMode', locale);
}
export function presetEditModeDoneLabel(locale: Locale): string {
  return t('presetAdmin.editModeDone', locale);
}

// ---- SPEC-V3 §3.3 追加・編集画面 ----

export function presetFormTitle(locale: Locale, type: PresetType, isNew: boolean): string {
  return t(isNew ? 'presetAdmin.formTitleNew' : 'presetAdmin.formTitleEdit', locale, {
    type: presetTypeLabel(locale, type),
  });
}

export function presetNameFieldLabel(locale: Locale): string {
  return t('presetAdmin.nameField', locale);
}

/** 値の欄の見出し（§2.1）。site だけ率で、他は金額 */
export function presetValueFieldLabel(locale: Locale, type: PresetType): string {
  return t(
    isRatePreset(type) ? 'presetAdmin.valueFieldRate' : 'presetAdmin.valueFieldAmount',
    locale,
  );
}

// ---- SPEC-V3 §2.6 梱包材のまとめ買い（金額の入れ方） ----

/** 2 択の見出し（§2.6.2）。梱包材の金額欄の**上**に出る */
export function presetPriceModeLabel(locale: Locale): string {
  return t('presetAdmin.priceModeLabel', locale);
}

/** 2 択の中身（§2.6.2）。既定は「1個ずつ」＝ 先頭 */
export function presetPriceModeOptions(locale: Locale): string[] {
  return [t('presetAdmin.priceModeSingle', locale), t('presetAdmin.priceModePack', locale)];
}

/** 入数の欄（§2.6.2）。単位を見出しに入れるのは、行の数値が単位を持たないため（金額と同じ形） */
export function presetPackQuantityLabel(locale: Locale): string {
  return t('presetAdmin.packQuantityField', locale);
}

/** 購入価格の欄（§2.6.2）。電卓を出すのはこの欄だけ */
export function presetPackPriceFieldLabel(locale: Locale): string {
  return t('presetAdmin.packPriceField', locale);
}

/** 計算結果の行（§2.6.2）。入力欄ではないので、電卓も付かない */
export function presetUnitPriceLabel(locale: Locale): string {
  return t('presetAdmin.unitPrice', locale);
}

/**
 * 1 個あたりの表示（§2.6.3）。入数が空・0 のあいだは「—」──
 * 行ごと消すと高さが動く（§2.6.6）。
 */
export function presetUnitPriceText(locale: Locale, unitPrice: number | null): string {
  return unitPrice == null ? t('presetAdmin.unitPriceEmpty', locale) : formatUnitYen(locale, unitPrice);
}

// ---- SPEC-V10 梱包材の単価計算方式（個数 / 面積 / 使用回数） ----

/** 3 択の見出し（§1.1）。「金額の入れ方」で**まとめ買い**を選んだときだけ出る */
export function presetCalcMethodLabel(locale: Locale): string {
  return t('presetAdmin.calcMethodLabel', locale);
}

/**
 * 3 択の中身（§1.1）。並びは PRESET_CALC_METHODS そのもの（既定の「個数から」が先頭）。
 * 「〜から」で揃えているのは、どれも**何を割るか**を選んでいるため。
 */
export function presetCalcMethodOptions(locale: Locale): string[] {
  return [
    t('presetAdmin.calcMethodCount', locale),
    t('presetAdmin.calcMethodArea', locale),
    t('presetAdmin.calcMethodUsage', locale),
  ];
}

/**
 * 割る数の欄の見出し（§1.2）。**個数方式と使用回数方式で同じ欄**の名前が変わる ──
 * 入れる数の意味が違うので、単位（個 / 回）まで含めて言い分ける。
 */
export function presetPackQuantityFieldLabel(locale: Locale, method: PresetCalcMethod): string {
  return t(
    method === 'usage' ? 'presetAdmin.usageCountField' : 'presetAdmin.packQuantityField',
    locale,
  );
}

/** 想定使用回数の欄（§1.2）。「何回ぶん使えるか」を人が見積もって入れる */
export function presetUsageCountLabel(locale: Locale): string {
  return t('presetAdmin.usageCountField', locale);
}

/** 購入サイズの欄（§1.2）。cm で入れる（㎡ への換算は presetAreaUnitPrice がする） */
export function presetPackHeightFieldLabel(locale: Locale): string {
  return t('presetAdmin.packHeightField', locale);
}
export function presetPackWidthFieldLabel(locale: Locale): string {
  return t('presetAdmin.packWidthField', locale);
}

/** 平均使用サイズの欄（§1.2）。**任意入力**で、入れると 1 回あたりまで出る */
export function presetUseHeightFieldLabel(locale: Locale): string {
  return t('presetAdmin.useHeightField', locale);
}
export function presetUseWidthFieldLabel(locale: Locale): string {
  return t('presetAdmin.useWidthField', locale);
}

/** ¥/㎡ の帯（§1.3）。面積方式の 1 枚目の計算結果 */
export function presetAreaUnitPriceLabel(locale: Locale): string {
  return t('presetAdmin.areaUnitPrice', locale);
}

/** 1 回あたりの帯（§1.3）。面積・使用回数方式の計算結果 */
export function presetUsePriceLabel(locale: Locale): string {
  return t('presetAdmin.usePrice', locale);
}

/**
 * 計算結果の帯の見出し（§1.3）。方式で数える単位が変わる:
 * 個数から = 1 個あたり / 面積・使用回数から = 1 回あたり。
 */
export function presetUnitPriceRowLabel(locale: Locale, method: PresetCalcMethod): string {
  return t(method === 'individual' ? 'presetAdmin.unitPrice' : 'presetAdmin.usePrice', locale);
}

/**
 * 平均使用サイズのカードの下の 1 行（§1.3）。**任意入力であることと、
 * 入れなかったときに何が登録されるか**を先に言う ── 空のまま保存できてしまう欄なので、
 * 保存したあとに「1 回いくらが出ていない」と気づく形にはしない。
 */
export function presetUseSizeNote(locale: Locale): string {
  return t('presetAdmin.useSizeNote', locale);
}

/**
 * 一覧・選択シートの行で、右端の金額が**何あたりの額か**を言う 1 行（§1.5）。
 * 計算して登録した梱包材だけに出る（手で金額を入れた行は「1 回ぶんの額」そのものなので出さない）。
 *
 * 面積方式で平均使用サイズを入れていない行だけ単位が「1 ㎡」になる ──
 * ここを言わないと、同じ「◯◯円」の並びの中で 1 行だけ桁の違う額が理由なく混ざる。
 */
export function presetUnitNote(
  locale: Locale,
  preset: {
    type: PresetType;
    calcMethod?: string;
    packQuantity: number;
    packHeight?: number;
    packWidth?: number;
    useHeight?: number;
    useWidth?: number;
  },
): string | null {
  if (preset.type !== 'packaging' || !isPackBuy(preset)) return null;

  switch (presetCalcMethod(preset)) {
    case 'area':
      return hasPresetUseSize(preset)
        ? t('presetAdmin.usePriceWithSize', locale, {
            height: formatPresetSize(preset.useHeight ?? 0),
            width: formatPresetSize(preset.useWidth ?? 0),
          })
        : t('presetAdmin.areaUnitPrice', locale);
    case 'usage':
      return t('presetAdmin.usePrice', locale);
    default:
      return t('presetAdmin.unitPrice', locale);
  }
}

/** サイズの表示（cm）。末尾の `.0` は出さない（金額の formatUnitYen と同じ扱い） */
function formatPresetSize(size: number): string {
  return String(Number(size.toFixed(1)));
}

// ---- SPEC-V6 送料プリセットの専用資材 ----

/**
 * 専用資材そのものを指す語（SPEC-V6 §1）。「梱包材」（t('amount.envelopeCost', 'ja')）とは**別のもの** ──
 * あちらは自分で選んで買う箱・封筒で、こちらは**その配送方法でしか使えない指定の資材**。
 * 語を分けるのは、記録の経費の内訳でも別の行（送料 / 梱包材）に入るため。
 */
export function shippingMaterialLabel(locale: Locale): string {
  return t('presetAdmin.shippingMaterial', locale);
}

/** 送料プリセットの編集画面の欄（§2）。0 円のままでも保存できる（任意の欄） */
export function shippingMaterialFieldLabel(locale: Locale): string {
  return t('presetAdmin.shippingMaterialField', locale);
}

/**
 * 内訳カードの合計行（§2）。**送料と資材費を足したものがこの行**で、
 * 記録に入るのもこの額（「専用資材を使わない」を選ばない限り）。
 */
export function shippingTotalLabel(locale: Locale): string {
  return t('presetAdmin.shippingTotal', locale);
}

/** 内訳カードの下の 1 行（§2）。この合計がどこで使われるのかを言う */
export function shippingTotalNote(locale: Locale): string {
  return t('presetAdmin.shippingTotalNote', locale);
}

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
export function shippingOnlyLabel(locale: Locale): string {
  return t('preset.shippingOnly', locale);
}
export function withShippingMaterialLabel(locale: Locale, amount: string): string {
  return t('preset.withShippingMaterial', locale, { amount });
}

export const PRESET_COLOR_FIELD_LABEL = 'バッジの色';

/**
 * 自由色（SPEC-V7 §3）。固定色の丸の最後に置く 12 個目の口。
 * 「その他」ではなく「自由色」なのは、**残りものではなく対等な選択肢**だから ──
 * 押すと色相と明るさを自分で決められる。
 */
export function customColorLabel(locale: Locale): string {
  return t('color.custom', locale);
}
export function colorPickerTitle(locale: Locale): string {
  return t('color.pickerTitle', locale);
}
/** 連続量を合わせる操作なので確定ボタンを置く（プリセットの選択シートとは逆。§3） */
export function colorPickerDoneLabel(locale: Locale): string {
  return t('color.pickerDone', locale);
}

// ---- 設計案 50c: 色を使用状況で 2 群に分ける ----

/**
 * 固定 11 色の表示名。**「使用中」の群と「この◯◯の色」に出す語**なので、
 * 色そのものと同じく logic 側が 1 か所で持つ（画面で英語キーを出さない）。
 * 読み上げ（accessibilityLabel）もこれを使う ── `red` と読まれても伝わらない。
 */
const PRESET_COLOR_KEYS_MAP = {
  red: 'color.red',
  orange: 'color.orange',
  yellow: 'color.yellow',
  green: 'color.green',
  teal: 'color.teal',
  blue: 'color.blue',
  indigo: 'color.indigo',
  purple: 'color.purple',
  pink: 'color.pink',
  brown: 'color.brown',
  gray: 'color.gray',
} as const satisfies Record<PresetColorKey, TranslationKey>;

/** 保存値から色名。固定 11 色のどれでもなければ「自由色」 */
export function presetColorLabel(locale: Locale, stored: string): string {
  const key = presetColorKeyOf(stored);
  return key == null ? t('color.custom', locale) : t(PRESET_COLOR_KEYS_MAP[key], locale);
}

/** 上の群の見出し（追加のとき）。まだ誰も使っていない色だけが並ぶ */
export function colorUnusedSectionLabel(locale: Locale): string {
  return t('color.unusedSection', locale);
}

/**
 * 上の群の見出し（編集のとき）。**「使っていない」とは言えない** ──
 * 自分の色を先頭に残すので、1 つだけ使用中の色が混じっているため。
 */
export function colorSelectableSectionLabel(locale: Locale): string {
  return t('color.selectableSection', locale);
}

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
export function customColorCreateLabel(locale: Locale): string {
  return t('color.customCreate', locale);
}

/**
 * 同じ行の主文言（すでに自由色を選んでいるとき）。開くシートは同じだが、
 * 開いた先には**いま使っている色**が入っているので「作る」とは言えない。
 */
export function customColorChangeLabel(locale: Locale): string {
  return t('color.customChange', locale);
}

/** 同じ行の副文言。固定色の丸が 1 つも並んでいない理由を、その場で言う */
export function colorAllUsedSubtitle(locale: Locale): string {
  return t('color.allUsedSubtitle', locale, { count: PRESET_COLOR_KEYS.length });
}

/**
 * 下の群の見出し（設計案 51b の状態）。**状態ではなく操作を言う** ──
 * この状態では固定色を選べる場所がここしかないので、「使用中」とだけ書くと
 * 眺めるだけの一覧に見え、押せることが読めない。
 */
export function colorUsedPickSectionLabel(locale: Locale): string {
  return t('color.usedPickSection', locale);
}

/** 上の群の右（追加のとき）。残っている固定色の数 */
export function colorRemainingLabel(locale: Locale, count: number): string {
  return t('color.remaining', locale, { count });
}

/** 上の群の右（編集のとき）。「オレンジ（このタグの色）」 */
export function ownColorLabel(locale: Locale, stored: string, entityLabel: string): string {
  return t('color.ownColor', locale, {
    color: presetColorLabel(locale, stored),
    entity: entityLabel,
  });
}

/** 下の群の見出し（追加のとき） */
export function colorUsedSectionLabel(locale: Locale): string {
  return t('color.usedSection', locale);
}

/** 下の群の見出し（編集のとき）。自分は含まれないことを言う */
export function otherUsedSectionLabel(locale: Locale, entityLabel: string): string {
  return t('color.otherUsedSection', locale, { entity: entityLabel });
}

/**
 * 下の群の 1 つに添える名前。**同じ色を複数が使っていることがある**ので、
 * 先頭 1 件 ＋ 残りの件数にする（横に並べる札なので、全部を書くと 1 行に収まらない）。
 */
export function colorUserLabel(locale: Locale, names: readonly string[]): string {
  const [head, ...rest] = names;
  return rest.length === 0
    ? t('color.userOne', locale, { name: head })
    : t('color.userMany', locale, { name: head, count: rest.length });
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
export function sameColorNote(locale: Locale, names: readonly string[]): string {
  const [head, ...rest] = names;
  return rest.length === 0
    ? t('color.sameColorOne', locale, { name: head })
    : t('color.sameColorMany', locale, { name: head, count: rest.length });
}
export function presetInitialFieldLabel(locale: Locale): string {
  return t('presetAdmin.initialField', locale);
}

/** 頭文字の欄の下の 1 行（§1.2）。空のままでも何が出るかを先に言う */
export const PRESET_INITIAL_NOTE = `名前の先頭が入ります。${PRESET_INITIAL_MAX_LENGTH}文字まで変えられます。`;

/**
 * プレビュー帯のバッジの下の 1 行（設計案 49c）。**打っていないときだけ「押せる」ことを言う** ──
 * 専用の入力欄を廃したので、バッジが押せること自体が画面から読めなくなるため。
 */
export function presetInitialHint(locale: Locale): string {
  return t('presetAdmin.initialHint', locale, { max: PRESET_INITIAL_MAX_LENGTH });
}

/**
 * 同じ 1 行の、打っている最中の形（設計案 49c）。**制限だけを残す** ──
 * カーソルが立っている時点で押せることは済んだ話で、そこに要るのは上限だけ。
 */
export function presetInitialEditingHint(locale: Locale): string {
  return t('presetAdmin.initialEditingHint', locale, { max: PRESET_INITIAL_MAX_LENGTH });
}

/**
 * 編集のときだけ出す注記（設計案 25b）。§1.5 の帰結を、値を書き換える場所で名指しする。
 * 追加のときは出さない（まだ「これまでの記録」がない）。
 */
export function presetEditValueNote(locale: Locale, type: PresetType): string {
  return t(
    isRatePreset(type) ? 'presetAdmin.editValueNoteRate' : 'presetAdmin.editValueNoteAmount',
    locale,
  );
}

/** 編集画面の下端（設計案 25b）:「この送料を削除」 */
export function presetDeleteLabel(locale: Locale, type: PresetType): string {
  return t('presetAdmin.deleteLabel', locale, { type: presetTypeInlineLabel(locale, type) });
}

/**
 * 削除の確認（設計案 25c）。**使った記録の件数が数えられて 1 件以上のときだけ出す。**
 *
 * 消えるのは今後の入力候補だけで、記録に写った金額は残る（§1.5）── そこが利用者の
 * いちばんの気がかりなので、件数と「残る」ことを 1 文に入れる。
 */
export function presetDeleteConfirmMessage(
  locale: Locale,
  type: PresetType,
  usageCount: number,
): string {
  return t('presetAdmin.deleteConfirm', locale, {
    type: presetTypeInlineLabel(locale, type),
    count: usageCount,
  });
}

/** 削除したあとの取り消しバー（§3.2）。プリセットは手で作った資産なので記録と同じ扱いにする */
export function presetDeletedMessage(locale: Locale, type: PresetType): string {
  return t('presetAdmin.deletedMessage', locale, { type: presetTypeInlineLabel(locale, type) });
}

// ---- SPEC-V3 §4 入力時の選択 ----

/**
 * 単一選択シートの見出し（§4.3-1）:「送料を選ぶ」。
 * 行の右端のタグボタン（§4.1）の読み上げ語にも同じ語を使う ── 押すと開くシートの
 * 見出しがそのままボタンの名前になるので、語を分ける理由がない。
 */
export function presetPickerTitle(locale: Locale, type: PresetType): string {
  return t('preset.pickerTitle', locale, { type: presetTypeLabel(locale, type) });
}

/**
 * タグボタンの読み上げに足す今の状態（§4.1 / §1.5.1）。
 *
 * 選択中かどうかは見た目（バッジ・薄いバッジ・タグアイコン）で分かるが、
 * 読み上げには色も濃さも乗らない。ボタンの名前（presetPickerTitle）は押すと起きることの語なので、
 * そちらは変えずに、今どうなっているかは値として別に読ませる。
 */
export function presetTagStateLabel(
  locale: Locale,
  state: 'unselected' | 'selected' | 'rate-changed',
  name: string,
): string | undefined {
  if (state === 'unselected') return undefined;
  return state === 'selected' ? name : t('preset.tagRateChanged', locale, { name });
}

/**
 * 選択シートの空表示（§4.3）。見出しは設定タブのカード（PRESET_CARD_EMPTY_LABEL）と同じ語、
 * 本文は一覧の空表示（presetEmptyBody）と同じ文。同じ「登録がない」状態を、
 * 出てくる場所ごとに違う言い方で説明しない。
 */
export function presetPickerEmptyTitle(locale: Locale): string {
  return t('common.notRegistered', locale);
}

/**
 * シート末尾のリンク（§4.3-3）。登録があるときは「編集する」、0 件のときは「追加する」。
 * 「▸」を字で持つのは presetAddLabel の「＋」と同じ扱い（記号も表示語のうち）。
 */
export function presetPickerEditLink(locale: Locale): string {
  return t('preset.pickerEditLink', locale);
}
export function presetPickerAddLink(locale: Locale): string {
  return t('preset.pickerAddLink', locale);
}

/**
 * リンクを出せない場所（記録フォーム。RN の Modal の裏に遷移してしまう）での空表示の本文。
 *
 * リンクを落とすだけだと、0 件の人にはどこへ行けば登録できるのかが画面から消える。
 * **押せないリンクの代わりに、行き先を文で名指しする** ── 押せる青字がないので、
 * 反応しないボタンを探させることにはならない。
 */
export function presetPickerEmptyBodyWithoutLink(locale: Locale, type: PresetType): string {
  return t('preset.pickerEmptyBodyWithoutLink', locale, {
    body: presetEmptyBody(locale, type),
    section: t('settings.preset.title', locale),
  });
}

/**
 * 伝票カードの販売サイト名の行の「✕」（§1.5.1）。
 * 消えるのは名前の写しだけで、率は残る ── 読み上げでもそれが分かるよう名前を主語にする。
 */
export function siteNameClearLabel(locale: Locale, name: string): string {
  return t('action.removeNamed', locale, { name });
}

/**
 * タグボタンの「✕」（選択中のプリセットを外す）の読み上げ。文面は siteNameClearLabel と同じ形。
 */
export function presetTagClearLabel(locale: Locale, name: string): string {
  return t('action.removeNamed', locale, { name });
}

// ---- SPEC-V4 §2 タグ（設定タブの管理画面） ----
//
// **プリセットの語を流用しない。** 群を分けたのと同じ理由（§2.1）で、
// 「入力を減らす」の語（登録・選ぶと入る）はタグには当てはまらない。
// 件数の「N件」だけは presetCountLabel をそのまま使う ── 数え方の表記まで分ける理由はない。

/** タグそのものの表示名（§2.1 のカード・§2.2 の見出し）。設定タブ・一覧・シートで共通 */
export function tagLabel(locale: Locale): string {
  return t('common.tag', locale);
}

/**
 * **移行前の呼び出し用（日本語固定）。** タグ一覧・タグ編集・記録フォーム・選択シート・
 * 使いかたの図・CSV など 9 ファイルがまだ参照している（どれもステップ 1 の対象外）。
 */
export const TAG_LABEL = t('common.tag', 'ja');

/** 群の見出し（§2.1）。「入力を減らす」とは別の群にする */
export function tagSectionTitle(locale: Locale): string {
  return t('settings.tag.title', locale);
}

/** 群の下の注記 1 行（§2.1）。プリセットの注記（選ぶと欄に入る）と混ざらないようにする */
export function tagSectionNote(locale: Locale): string {
  return t('settings.tag.note', locale);
}

/**
 * 1 件も登録がないときの設定タブのカードの 1 行（§2.1）。
 * プリセットのカード（PRESET_CARD_EMPTY_LABEL）と同じ語 ── 同じ「まだ無い」状態を、
 * 群ごとに違う言い方で説明しない（PRESET_PICKER_EMPTY_TITLE と同じ扱い）。
 * 辞書でも同じキー（common.notRegistered）を指すので、その関係は保たれている。
 */
export function tagCardEmptyLabel(locale: Locale): string {
  return t('common.notRegistered', locale);
}

/**
 * 一覧カード末尾の追加行（§2.2-3）と空表示のボタン（§2.2-4）:「＋ 追加」。
 * プリセット（「＋ 送料を追加」）と違って種類名を冠さないのは、タグが 1 種類しかなく、
 * 画面の見出しが既に「タグ」だから。
 */
export function tagAddLabel(locale: Locale): string {
  return t('tag.add', locale);
}

/** 空表示（§2.2-4）。EmptyState の見出しと本文 */
export function tagEmptyTitle(locale: Locale): string {
  return t('tag.emptyTitle', locale);
}
export function tagEmptyBody(locale: Locale): string {
  return t('tagAdmin.emptyBody', locale);
}

/**
 * 一覧の下の注記（§2.2-5）。**削除で消えるのはタグだけ**だと先に言う ──
 * 記録に紐付く（§0.1）ぶん、プリセットより「消したら記録も消えるのでは」と読まれやすい。
 */
export function tagListNote(locale: Locale): string {
  return t('tagAdmin.listNote', locale);
}

/** 一覧の行の削除の読み上げ語（§2.2）。スワイプで出る赤い「削除」に名前を添える */
export function tagDeleteA11yLabel(locale: Locale, name: string): string {
  return t('tagAdmin.deleteA11y', locale, { name });
}

/**
 * 削除したあとの取り消しバー（§2.2）。
 *
 * **使用件数が 1 件以上のときだけ「記録から外れた」ことを添える** ── 記録から剥がれたことが
 * 取り消しの猶予の間に読めないと、バーが消えてから気付くことになる。
 * 0 件のときに「0 件の記録から外れました」と出しても、外れた先が無いので情報にならない。
 */
export function tagDeletedMessage(locale: Locale, name: string, usageCount: number): string {
  return usageCount === 0
    ? t('tagAdmin.deletedMessage', locale, { name })
    : t('tagAdmin.deletedMessageWithCount', locale, { name, count: usageCount });
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
export function tagPreviewLabel(locale: Locale): string {
  return t('tagAdmin.previewLabel', locale);
}

export function tagFormTitle(locale: Locale, isNew: boolean): string {
  return t(isNew ? 'tagAdmin.formTitleNew' : 'tagAdmin.formTitleEdit', locale);
}

/**
 * 名前の欄のキャプション（§2.3-3）。**「（必須）」を付ける** ──
 * タグは名前だけが本体で、空のまま保存できる欄が 1 つも無いことを先に言う。
 */
export function tagNameFieldLabel(locale: Locale): string {
  return t('tagAdmin.nameField', locale);
}

/**
 * 名前が未入力のときにプレビューへ薄く出す語（§2.3-2）。
 * チップの形（色の点 ＋ 名前）を先に見せるためのもので、保存される値ではない。
 */
export function tagNamePlaceholder(locale: Locale): string {
  return t('tagAdmin.namePlaceholder', locale);
}

/**
 * 色の欄の見出し（§2.3-4）。プリセットの「バッジの色」と語を分けるのは、
 * タグの色が札の地色ではなく**名前の左の点**だから（§0.1）。
 */
export const TAG_COLOR_FIELD_LABEL = '色';

/**
 * 編集画面の下端の削除（§2.3。PresetFormScreen の presetDeleteLabel と同じ形）。
 * 追加のときは出さないので「この」で始めてよい ── 指しているのはいま開いている 1 件。
 */
export function tagDeleteLabel(locale: Locale): string {
  return t('tagAdmin.deleteLabel', locale);
}

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
export function tagDeleteConfirmMessage(locale: Locale, usageCount: number): string {
  return t('tagAdmin.deleteConfirm', locale, { count: usageCount });
}

// ---- SPEC-V4 §3 入力（記録フォームのタグの節・選択シート） ----

/**
 * 記録フォームのタグの節の「＋ 追加」の読み上げ語（§3.1）。
 * 見出しの右のリンクなので、押した先が**選ぶ面**であることは語だけでは読めない。
 */
export function tagPickerOpenLabel(locale: Locale): string {
  return t('tag.pickerOpen', locale);
}

/**
 * チップの「✕」の読み上げ（§3.1）。記号 1 つなので、外れるのが**このタグだけ**
 * （記録は消えない）ことは語の側でしか言えない。
 */
export function tagRemoveAccessibilityLabel(locale: Locale, tagName: string): string {
  return t('tag.removeAccessibility', locale, { name: tagName });
}

/**
 * タグの節に 1 件も付いていないとき（§3.1 の改訂）。
 * 設定タブの「まだ登録がありません」（TAG_CARD_EMPTY_LABEL）とは**別の語** ──
 * あちらは「タグそのものが 1 つも無い」、こちらは「この記録に付いていない」で、
 * 次にすることが違う（こちらは見出しの右の「＋ 追加」から選ぶ）。
 */
export function tagFieldEmptyLabel(locale: Locale): string {
  return t('tag.fieldEmpty', locale);
}

/**
 * 選択シートの検索欄（§3.2-2）。**「探す」だけでなく「作る」まで言う** ──
 * ここが新規作成の入口（§3.2-3）を兼ねていることは、打ち始めるまで画面に出ない。
 */
export function tagPickerSearchPlaceholder(locale: Locale): string {
  return t('tag.pickerSearchPlaceholder', locale);
}

/**
 * 検索語に完全一致する既存タグが無いときだけ先頭に出る行（§3.2-3）。
 * 「＋」を字で持つのは t('tag.add', 'ja')（additionLabel）と同じ扱い ── 記号も表示語のうち。
 */
export function tagCreateLabel(locale: Locale, name: string): string {
  return t('tag.create', locale, { name });
}

/**
 * シート右上の「完了」（§3.2-1）。選択はチェックした瞬間にフォームへ反映されるので、
 * これは確定ではなく**閉じる**ボタン。プリセットの編集モードの「完了」と同じ語でよい
 * （どちらも「この面での操作を終える」の意）。
 */
export function tagPickerDoneLabel(locale: Locale): string {
  return t('tag.pickerDone', locale);
}

/**
 * シート末尾のリンク（§3.2-5）。行き先はプリセットとは別（設定タブのタグ一覧）だが、
 * **語は同じ**にする ── 同じ「設定へ行って直す」動きを、シートごとに違う言い方で出さない。
 * 記録フォームから開いたときは出さない（RN の Modal の裏に遷移してしまうため）。
 */
export function tagPickerEditLink(locale: Locale): string {
  return t('tag.pickerEditLink', locale);
}

/**
 * 1 件も登録がないときの選択シートの本文（§3.2）。一覧の空表示（tagEmptyBody('ja')）と
 * 語を分けるのは、**ここには作る場所が既にある**から ── 「記録を追加するときにも作れます」は、
 * まさにその記録フォームの上で読むと行き先の分からない案内になる。
 */
export function tagPickerEmptyBody(locale: Locale): string {
  return t('tag.pickerEmptyBody', locale);
}

// ---- SPEC-V4 §3.4 レコード詳細のタグ ----

/**
 * 詳細画面のタグの節の見出し（設計案 32b）。メモと同じ「補足」の並びに置くので、
 * メモ（t('form.memo', 'ja')）と同じ形の見出しを付ける ── 見出しの無いカードが 1 枚だけ挟まると、
 * 何のカードなのかがチップの中身からしか読めない。
 */
export const TAG_SECTION_LABEL = TAG_LABEL;

// ---- SPEC-V4 §4 絞り込み（記録タブの合計行・シート・解除バー） ----
//
// 語は 1 つの動き（「絞り込む」）から派生させる。チップ・シートの見出し・空表示のリンクが
// 別々の言い方をすると、同じ 1 つの条件を指していることが画面から読めなくなる。

/** 合計行のチップ・シートの見出し（§4.1 / §4.2） */
export function filterLabel(locale: Locale): string {
  return t('list.filter', locale);
}

/**
 * 合計行のチップ（§4.1）。N は**効いている条件の本数**（決定 §9-2）。
 * 0 のときは「絞り込み」だけ ── 「絞り込み 0」は「0 件」と読み違えられる。
 */
export function filterChipLabel(count: number): string {
  return count === 0 ? t('list.filter', 'ja') : `${t('list.filter', 'ja')} ${count}`;
}

/** シート左上（§4.2-1）。効くのは 3 条件だけで、期間・検索・並び替えは動かない */
export function filterClearAllLabel(locale: Locale): string {
  return t('filter.clearAll', locale);
}

/** 解除バー右端（§4.3）。「すべて解除」と同じことをするが、1 行に収めるので短い語にする */
export function filterClearLabel(locale: Locale): string {
  return t('data.filterClear', locale);
}

/**
 * 解除バーの本文を押したときの読み上げ（§4.3）。文そのものは条件の一覧なので、
 * 押すと何が起きるかは**ヒントの側**でしか言えない（行き先は絞り込みページ）。
 */
export function filterNoticeHint(locale: Locale): string {
  return t('data.filterNoticeHint', locale);
}

/** 解除の読み上げ（§4.3）。「解除」だけでは名詞に読めるので、動詞まで足す */
export function filterClearActionLabel(locale: Locale): string {
  return t('data.filterClearAction', locale);
}

/**
 * シート右上（§4.2-1）。条件は選んだ瞬間から効くので、これは確定ではなく**閉じる**ボタン
 * （タグの選択シートの「完了」と同じ意味・同じ語）。
 */
export const FILTER_DONE_LABEL = t('tag.pickerDone', 'ja');

/** シートの節の見出し（§4.2-2〜4）。販売サイト・タグは既にある語をそのまま使う */
/** 「種別」の見出し（絞り込みの節。複製で写る欄の図もこれを使う） */
export function filterKindSectionLabel(locale: Locale): string {
  return t('filter.kindSection', locale);
}
export function filterSiteSectionLabel(locale: Locale): string {
  return t('filter.siteSection', locale);
}
export function filterTagSectionBaseLabel(locale: Locale): string {
  return t('filter.tagSection', locale);
}

/** 販売サイトを選んでいないときに節の右に出す語（§4.2-3）。種別の「すべて」と同じ語 */
export function filterAllLabel(locale: Locale): string {
  return t('filter.all', locale);
}

/** 解除バーの販売サイトの部分（§4.3）。名前だけでは何の名前か読めないので種類まで言う */
export function filterSitePartLabel(name: string): string {
  return `${t('filter.siteSection', 'ja')}「${name}」`;
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
  return `${parts.join('・')}の${presetCountLabel('ja', count)}だけ`;
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
export function matchingRecordLabel(locale: Locale, isSoldMode: boolean): string {
  return t(isSoldMode ? 'filter.matchingRecordSold' : 'filter.matchingRecordListing', locale);
}

export function matchingRecordCountValue(locale: Locale, count: number): string {
  return presetCountLabel(locale, count);
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
  locale: Locale,
  monthTitle: string | null,
  conditionCount: number,
): string | null {
  if (conditionCount === 0) return null;
  // 月を絞っているかで文を丸ごと分ける（前置きを継ぎ足す形だと英語で組み立て直せない）
  return monthTitle == null
    ? t('filter.noMatchConditions', locale, { count: conditionCount })
    : t('filter.noMatchWithMonth', locale, { month: monthTitle, count: conditionCount });
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
export function filterEmptyTitle(locale: Locale): string {
  return t('list.filterEmptyTitle', locale);
}
export function filterEmptyActionLabel(locale: Locale): string {
  return t('list.filterClear', locale);
}

/** 絞り込みが 0 件で、かつ記録も 0 件のとき（§4.8）。従来どおりの追加への導線 */
export function noRecordsEmptyTitle(locale: Locale): string {
  return t('list.noRecordsTitle', locale);
}
export function noRecordsEmptyBody(locale: Locale): string {
  return t('list.noRecordsBody', locale);
}

/**
 * 販売サイトの候補が 0 件のとき（§4.2）。候補は**記録に実在する名前**なので、
 * プリセットを登録しても増えない ── 行き先はプリセットではなく記録の側だと言う。
 */
export function filterSiteEmptyTitle(locale: Locale): string {
  return t('filter.siteEmptyTitle', locale);
}
export function filterSiteEmptyBody(locale: Locale): string {
  return t('filter.siteEmptyBody', locale);
}

/**
 * タグの登録が 0 件のとき（§4.2.3 / 案 35d）。カードの中に 2 行で出す。
 * 見出しは一覧の空表示と同じ語（t('tag.emptyTitle', 'ja')）── 同じ「1 件もない」を場所ごとに言い分けない。
 *
 * **設定への導線は置かない。** この画面に来た用は「今ある記録を絞ること」で、設定へ飛ぶと
 * 用が中断するうえ、戻り道が記録タブではなく設定になる。記録フォーム側の選択シート（§3.2）には
 * 「設定で編集する ▸」があるが、あちらは**タグを作る・直す場所**で用が違うので揃えない。
 * 代わりに**どこで作れるか**だけを言う（行き先を指さずに、次に開く画面で目に入る場所を教える）。
 */
export function filterTagEmptyTitle(locale: Locale): string {
  return t('tag.emptyTitle', locale);
}
export function filterTagEmptyBody(locale: Locale): string {
  return t('filter.tagEmptyBody', locale);
}

/** タグの節の見出しの右（案 35a）。§4.4 の OR を、選ぶ前に読んで分かる言い方で置く */
export function filterTagOrHint(locale: Locale): string {
  return t('filter.tagOrHint', locale);
}

/** タグの検索欄（案 35f）。記録フォーム側と違い**作れない**ので「探す」だけ */
export function filterTagSearchPlaceholder(locale: Locale): string {
  return t('filter.tagSearchPlaceholder', locale);
}
export function filterTagSearchCancelLabel(locale: Locale): string {
  return t('filter.tagSearchCancel', locale);
}

/**
 * タグの節の見出し「タグ（32件）」（案 35a）。**登録件数**であって選択数ではない。
 * 0 件のときは件数を書かない ── 「タグ（0件）」は、下のカードの「タグがありません」と
 * 同じことを 2 度言うだけになる。
 */
export function filterTagSectionLabel(locale: Locale, totalCount: number): string {
  return totalCount === 0
    ? t('filter.tagSection', locale)
    : t('filter.tagSectionWithCount', locale, { count: presetCountLabel(locale, totalCount) });
}

/**
 * 検索で絞った一覧の下（案 35f）。「32件のうち2件が該当」。
 * **絞り込みの条件ではなく一覧の見え方の話**なので、下部の件数とは別の語にする。
 */
export function filterTagSearchResultLabel(
  locale: Locale,
  totalCount: number,
  matchedCount: number,
): string {
  return t('filter.tagSearchResult', locale, {
    total: presetCountLabel(locale, totalCount),
    matched: presetCountLabel(locale, matchedCount),
  });
}

/**
 * 検索して 0 件のとき（案 35f）。カードの中に出す。
 *
 * 2 行目を出すのは、**検索で選択中のタグが画面から隠れる**ため ──
 * 見えていないものが効いている状態は、言わないと「外れた」と読まれる。
 * 選んでいるタグが無いときは 2 行目ごと出さない（言うことがない）。
 */
export function filterTagSearchEmptyTitle(locale: Locale, keyword: string): string {
  return t('filter.tagSearchEmptyTitle', locale, { keyword });
}

/**
 * 上の 2 行目。名前は**先頭の 1 つと残りの数**に畳む（解除バーの filterTagPartLabel と同じ作法）
 * ── 全部並べると、選び方によっては 1 行に収まらない。
 */
export function filterTagSearchEmptyBody(
  locale: Locale,
  selectedNames: readonly string[],
): string | null {
  if (selectedNames.length === 0) return null;
  const head = selectedNames[0];
  const names =
    selectedNames.length === 1
      ? head
      : `${head}${presetOverflowLabel(selectedNames.length - 1)}`;
  return t('filter.tagSearchEmptyBody', locale, { names });
}

// ---- UI-SPEC §1.6-1 使いかた / §1.6-2 記録群 ----

/** 設定の先頭の 1 行カードと、その下の注記（UI-SPEC §1.6-1） */
export function helpLinkLabel(locale: Locale): string {
  return t('settings.help.label', locale);
}
export function helpLinkNote(locale: Locale): string {
  return t('settings.help.note', locale);
}

/**
 * 記録まわりの設定の群（UI-SPEC §1.6-2）。見出しはタブ名と同じ語 ──
 * どのタブに効く設定なのかを、見出しとタブバーで別の語にしない。
 * 辞書でもタブ名と同じキー（tabs.records）をひくので、その関係は保たれている。
 */
export function recordSettingsSectionTitle(locale: Locale): string {
  return t('tabs.records', locale);
}

/**
 * 新規作成時の種別（SPEC-V2 §3.4）。注記で**効く範囲**まで言う ──
 * 「既定の種別」だけだと、保存済みの記録の種別まで変わると読めてしまう。
 */
export function defaultRecordKindLabel(locale: Locale): string {
  return t('settings.recordKind.label', locale);
}
export function defaultRecordKindNote(locale: Locale): string {
  return t('settings.recordKind.note', locale);
}

/**
 * 表示言語の群（3 択: システム / 日本語 / English）。
 *
 * **言語の名前そのものは訳さない。** 英語表示のときに「Japanese」と出してしまうと、
 * 日本語を読みたい人が母語で選択肢を探せなくなる ── 言語の一覧はその言語自身の表記で
 * 並べるのが通例なので、下の 2 つはどちらの言語でも同じ固定値にする。
 * 「システム」だけは決め方の説明なので、表示中の言語で出す。
 */
export function languageSectionTitle(locale: Locale): string {
  return t('settings.language.title', locale);
}
export function languageSectionNote(locale: Locale): string {
  return t('settings.language.note', locale);
}
export function languageSystemLabel(locale: Locale): string {
  return t('settings.language.system', locale);
}
export const LANGUAGE_JA_LABEL = '日本語';
export const LANGUAGE_EN_LABEL = 'English';

// ---- UI-SPEC §1.6-4 データ群 / §1.6-5 フッタ ----

export function dataSectionTitle(locale: Locale): string {
  return t('settings.data.title', locale);
}

/**
 * CSV 書き出し（SPEC-V3 §5.6）。**Step 6 で活性化した**ので「準備中」は付かない。
 * 定数そのものは残す ── 他に「準備中」で置いてある行が出たときに語が割れないようにする。
 */
export function csvExportLabel(locale: Locale): string {
  return t('settings.data.csvExport', locale);
}

/**
 * **移行前の呼び出し用（日本語固定）。**
 * 書き出しシートの見出しと共有ダイアログの題（どちらもステップ 1 の対象外）が参照している。
 */
export const CSV_EXPORT_LABEL = t('settings.data.csvExport', 'ja');
export const PREPARING_LABEL = '準備中';

/** 記録の件数（UI-SPEC §1.6-4）。値は presetCountLabel と同じ「N件」 */
export function recordCountLabel(locale: Locale): string {
  return t('settings.data.recordCount', locale);
}

/** 設定タブ最下部のバージョン表記（UI-SPEC §1.6-5） */
export function versionLabel(locale: Locale, version: string): string {
  return t('settings.version', locale, { version });
}

// ---- SPEC-V3 §5 CSV 書き出し ----
//
// **列名は画面の語をそのまま使う**（§5.3）── 会計ソフトの語（「利用日」「利用内容」）に
// 改めることはしない。取込側は列を選ぶだけなので一致している必要がなく、
// 画面と食い違うと書き出した CSV とアプリの対応が読めなくなる。
// だから下の 2 つの配列は**リテラルを並べず、上で定義済みの表示語を並べる**。

/** 経費合計の列（§5.3-9）。単独の「経費」と区別が要るのは CSV だけなのでここに置く */
export const TOTAL_EXPENSES_COLUMN = `${t('amount.expenses', 'ja')}合計`;

/** 手数料率の列（§5.3-11）。額の列（販売手数料）と紛れないよう単位を付ける */
export const COMMISSION_RATE_COLUMN = `${t('amount.commissionShort', 'ja')}率(%)`;

/** 種別の列（§5.3-13）。値は recordKindLabel */
export const RECORD_KIND_COLUMN = '種別';

/** 状態の列（§5.3-15）と、その 2 値 */
export const RECORD_STATUS_COLUMN = '状態';
export const CSV_SOLD_STATUS_VALUE = t('detail.soldBadge', 'ja');
export const CSV_LISTING_STATUS_VALUE = t('list.listingStatus', 'ja');

/** 記録 ID の列（§5.3-18）。再書き出し時の突き合わせ用 */
export function recordIdColumn(locale: Locale): string {
  return t('export.recordIdColumn', locale);
}

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
  t('form.soldDate', 'ja'),
  t('form.itemName', 'ja'),
  t('amount.salesPrice', 'ja'),
  t('amount.purchasePrice', 'ja'),
  t('amount.postage', 'ja'),
  t('amount.commissionFull', 'ja'),
  t('amount.envelopeCost', 'ja'),
  t('amount.othersCost', 'ja'),
  TOTAL_EXPENSES_COLUMN,
  t('amount.totalProfit', 'ja'),
  TARGET_PROFIT_COLUMN,
  COMMISSION_RATE_COLUMN,
  presetTypeLabel('ja', 'site'),
  RECORD_KIND_COLUMN,
  TAG_LABEL,
  RECORD_STATUS_COLUMN,
  t('form.listedDate', 'ja'),
  t('form.memo', 'ja'),
  t('export.recordIdColumn', 'ja'),
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
  t('form.soldDate', 'ja'),
  presetTypeLabel('ja', 'site'),
  t('form.itemName', 'ja'),
  RECORD_KIND_COLUMN,
  t('amount.salesPrice', 'ja'),
  t('amount.purchasePrice', 'ja'),
  t('amount.postage', 'ja'),
  t('amount.envelopeCost', 'ja'),
  t('amount.othersCost', 'ja'),
  t('amount.commissionFull', 'ja'),
  t('amount.totalProfit', 'ja'),
];

/** 日ごとにまとめた行の種別（§5.2.2）。同じ種別だけなら種別名が入る */
export function csvKindMixedLabel(locale: Locale): string {
  return t('export.kindMixed', locale);
}

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
export function csvDayItemNames(locale: Locale, itemNames: readonly string[]): string {
  if (itemNames.length === 0) return '';
  const head = itemNames[0] === '' ? t('list.untitled', locale) : itemNames[0];
  if (itemNames.length === 1) return head;
  return `${head} ${presetOverflowLabel(itemNames.length - 1)}`;
}

/** ファイル名の先頭（§5.4）。種類で変える ── 後から見て何の書き出しか読めるように */
const CSV_FILE_BASE_KEYS = {
  backup: 'export.fileBaseBackup',
  tax: 'export.fileBaseTax',
} as const satisfies Record<'backup' | 'tax', TranslationKey>;

export function csvFileBaseName(locale: Locale, kind: 'backup' | 'tax'): string {
  return t(CSV_FILE_BASE_KEYS[kind], locale);
}

/** ファイル名の期間の部分（全期間のときだけ期間キーが無い） */
export function csvAllPeriodFileLabel(locale: Locale): string {
  return t('export.allPeriodFile', locale);
}

// ---- SPEC-V3 §5.7 書き出しシート（ExportSheet） ----

/** シートの見出し。設定タブの行と同じ語（押した先が同じものだと読める） */
export function exportSheetTitle(locale: Locale): string {
  return t('export.sheetTitle', locale);
}

/** ヘッダ左。書き出さずに閉じる（§5.7） */
export function exportCancelLabel(locale: Locale): string {
  return t('export.cancel', locale);
}

/** 節の見出し（§5.7 の並び: 種類 → 期間 → まとめ方 → 対象） */
export function exportKindSectionLabel(locale: Locale): string {
  return t('export.kindSection', locale);
}
export function exportPeriodSectionLabel(locale: Locale): string {
  return t('export.periodSection', locale);
}
export function exportGroupingSectionLabel(locale: Locale): string {
  return t('export.groupingSection', locale);
}
export function exportTargetSectionLabel(locale: Locale): string {
  return t('export.targetSection', locale);
}

/** 種類の 2 択（§5.2 の改訂）。既定は先頭（データ保存用） */
export function exportKindOptions(
  locale: Locale,
): readonly { value: 'backup' | 'tax'; label: string }[] {
  return [
    { value: 'backup', label: t('export.kindBackup', locale) },
    { value: 'tax', label: t('export.kindTax', locale) },
  ];
}

/**
 * 種類の節の下の 1 行。選んでいる方が何のためのものかを言う（列の一覧までは出さない）。
 *
 * **「バックアップにも使えます」を外した**（SPEC-V8 §0.2）── SPEC-V3 §5.2 の時点では
 * 唯一の書き出しだったので正しかったが、**SPEC-V8 で本物の復元が入って嘘になった。**
 * この CSV は読み戻せない（計算値が入り、写真・資材費の 3 列が無く、時刻が落ちている）。
 * 下の exportNotRestorableNote('ja') と同じ画面に並ぶので、残すと真っ向から矛盾する。
 */
const EXPORT_KIND_NOTE_KEYS = {
  backup: 'export.kindBackupNote',
  tax: 'export.kindTaxNote',
} as const satisfies Record<'backup' | 'tax', TranslationKey>;

export function exportKindNote(locale: Locale, kind: 'backup' | 'tax'): string {
  return t(EXPORT_KIND_NOTE_KEYS[kind], locale);
}

/**
 * 書き出し画面に出す**復元との関係**（SPEC-V8 §0.2 / §5.1）。
 *
 * **書き出しとバックアップはどちらも CSV が出てくるので、画面の名前だけでは区別が付かない。**
 * この 1 行が無いと「データ保存用」を選んだ人が、戻せないファイルを持って機種変更する。
 * **どちらの種類を選んでいても出す** ── 確定申告用はなおさら戻せない。
 *
 * 行き先（「バックアップと復元」）を名指しするのは、否定だけで終わらせないため。
 */
export function exportNotRestorableNote(locale: Locale): string {
  return t('export.notRestorableNote', locale);
}

/** まとめ方の 2 択（§5.2.2）。**確定申告用のときだけ出す** */
export function exportGroupingOptions(
  locale: Locale,
): readonly { value: 'record' | 'day'; label: string }[] {
  return [
    { value: 'record', label: t('export.groupingRecord', locale) },
    { value: 'day', label: t('export.groupingDay', locale) },
  ];
}

/** まとめ方の節の下の 1 行 */
const EXPORT_GROUPING_NOTE_KEYS = {
  record: 'export.groupingRecordNote',
  day: 'export.groupingDayNote',
} as const satisfies Record<'record' | 'day', TranslationKey>;

export function exportGroupingNote(locale: Locale, grouping: 'record' | 'day'): string {
  return t(EXPORT_GROUPING_NOTE_KEYS[grouping], locale);
}

/**
 * 対象の 2 択（§5.5-3）。既定は「売れた記録のみ」（決定 §8-9）──
 * 申告も集計も確定した金額しか扱わないため。
 */
export function exportTargetOptions(
  locale: Locale,
): readonly { value: boolean; label: string }[] {
  return [
    { value: false, label: t('export.targetSoldOnly', locale) },
    { value: true, label: t('export.targetIncludeListing', locale) },
  ];
}

/** 実行ボタン（§5.7）。**期間シートと違い確定ボタンを置く**（取り消せない操作なので） */
export function exportSubmitLabel(locale: Locale): string {
  return t('export.submit', locale);
}

/**
 * 下端の左（§5.7）:「2026年8月・売れた記録」。期間名は月バーと同じ書式（periodTitle）。
 * **押す前に何が出るかを読ませる行**なので、効いている条件をそのまま並べる。
 */
export function exportSummaryLabel(
  locale: Locale,
  period: Period,
  includeListing: boolean,
): string {
  return t('export.summary', locale, {
    period: periodTitle(locale, period),
    target: t(includeListing ? 'export.summaryTargetBoth' : 'export.targetSoldOnly', locale),
  });
}

/**
 * 下端の右（§5.7）:「12件」/ 日ごとにまとめたときは「12件（5行）」。
 * **件数は記録の数**で、行数はファイルの行の数 ── まとめると行の方が少なくなるので、
 * 変わったことがその場で読めるように両方出す。同じ数のときは括弧を出さない。
 */
export function exportCountLabel(
  locale: Locale,
  recordCount: number,
  rowCount: number,
): string {
  const count = presetCountLabel(locale, recordCount);
  return rowCount === recordCount
    ? count
    : t('export.countLabelWithRows', locale, { count, rows: rowCount });
}

/**
 * 対象が 0 件のとき、ボタンの上に出す 1 行（§5.7）。
 *
 * **切り替えれば書き出せることを示す。** 「0件」とだけ出すと、期間の選び直しか
 * 対象の切り替えか、どちらで直るのかが読めない。出品中の記録が 1 件も無いときは
 * 2 文目を足さない（言うことがない）。
 */
export function exportEmptyNote(locale: Locale, listingCount: number): string {
  return listingCount === 0
    ? t('export.emptyNote', locale)
    : t('export.emptyNoteWithListing', locale, { count: listingCount });
}

/**
 * 確定申告用を選んだときにシートの中へ出す注意書き（§5.8）。**固定表示で、消す動きは持たない。**
 *
 * 「不用品なら非課税」と読み切られると、課税対象のものを申告から落とす事故になる。
 * **押すとヘルプの「確定申告に使うときの注意」が開く**（UI-SPEC Step 6 で繋いだ）。
 */
export function exportTaxNotice(locale: Locale): string {
  return t('export.taxNotice', locale);
}

/** 上のバナーが押せることを読み上げに足す語（見た目のシェブロンだけでは伝わらないため） */
export function exportTaxNoticeOpenLabel(locale: Locale): string {
  return t('export.taxNoticeOpen', locale);
}

// ---- SPEC-V3 §5.9 プレビュー（案 `40a` ＋ `40c`） ----

/** シートの中のカードの見出し（案 `40a`）。「プレビュー」ではなく**何の表かを言う** */
export function exportPreviewCardTitle(locale: Locale): string {
  return t('export.previewCardTitle', locale);
}

/** 全画面（案 `40c`）のヘッダ */
export function exportPreviewScreenTitle(locale: Locale): string {
  return t('export.previewScreenTitle', locale);
}

/**
 * カード見出しの右（案 `40a`）:「先頭3行・全18列」。
 * **行数が先、列数が後。** 見えているもの（3 行）を先に言い、見えていないもの（列）を後に置く。
 * 出す行が 3 行に満たないときは実際の数を出す（「先頭3行」と出て 2 行しか無いと数が食い違う）。
 */
export function exportPreviewMetaLabel(
  locale: Locale,
  shownRows: number,
  columnCount: number,
): string {
  return t('export.previewMeta', locale, { rows: shownRows, columns: columnCount });
}

/**
 * プレビューの表の下に出す注意書き（SPEC-V6 §4）。**ヘッダ行には入れない** ──
 * 列名は表計算ソフトがそのまま項目名として使うので、注記が混ざると邪魔になる。
 * 画面の側で 1 行言えば、CSV の中身を汚さずに済む。
 */
export const CSV_SHIPPING_MATERIAL_NOTE = `送料には${shippingMaterialLabel('ja')}の代金を含みます`;

/** 表の下の 1 行（案 `40a`）。横スクロールできることは形からは読めないので語で言う */
export function exportPreviewScrollHint(locale: Locale): string {
  return t('export.previewScrollHint', locale);
}

/** カードを押すと全画面が開くことの読み上げ語（見た目は右端の `›`） */
export function exportPreviewOpenLabel(locale: Locale): string {
  return t('export.previewOpen', locale);
}

/** 全画面の下端のボタン（案 `40c`）。行き先を名指しする（「閉じる」とは言わない） */
export function exportPreviewBackLabel(locale: Locale): string {
  return t('export.previewBack', locale);
}

/**
 * 全画面の上の行の右（案 `40c`）:「全11列・8件（4行）」。
 * 左は `exportSummaryLabel`（期間と対象）で、シートの下端と同じ語を使う ──
 * 同じ書き出しを指しているので、画面が変わっても読む値が変わらないようにする。
 */
export function exportPreviewScreenMetaLabel(
  locale: Locale,
  columnCount: number,
  recordCount: number,
  rowCount: number,
): string {
  return t('export.previewScreenMeta', locale, {
    columns: columnCount,
    count: exportCountLabel(locale, recordCount, rowCount),
  });
}

/** 共有シートが使えない端末（§5.6）。書き出しの経路が共有シートしかないので、押した後に出る */
export function exportSharingUnavailable(locale: Locale): string {
  return t('export.sharingUnavailable', locale);
}

/** 書き出しに失敗したとき（§5.6）。原因は端末側なので、言えるのは「できなかった」まで */
export function exportFailedMessage(locale: Locale): string {
  return t('export.failed', locale);
}

/** 共有シートの見出し（Android / Web のみ表示される。expo-sharing の dialogTitle） */
export function exportShareDialogTitle(locale: Locale): string {
  return t('export.sheetTitle', locale);
}

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
export function photoFieldLabel(locale: Locale): string {
  return t('photo.field', locale);
}

/** 写真が無いときに枠の中へ小さく出す語（§3.1）。破線の枠と対で「押せる場所」を示す */
export function photoSquareLabel(locale: Locale): string {
  return t('photo.field', locale);
}

/** 写真が無いときにフォームの欄へ出す誘い（§3.1）。押すとカメラロールが開く */
export function photoAddLabel(locale: Locale): string {
  return t('photo.add', locale);
}

/** 枠を押したときの動き（§3.1）。見た目の語ではなく読み上げ語として使う */
export function photoReplaceLabel(locale: Locale): string {
  return t('photo.replace', locale);
}

/** 枠の右上の「✕」の読み上げ語（§3.1）。消えるのは記録ではなく写真 */
export function photoRemoveLabel(locale: Locale): string {
  return t('photo.remove', locale);
}

/** 「✕」に読ませる文（§3.1）。消えるのが写真だけであることは、記号からは読み取れない */
export function photoRemoveAccessibilityLabel(locale: Locale): string {
  return t('photo.removeAccessibility', locale);
}

/**
 * 詳細画面で商品名の行の下に出す 1 行（§2.1）。**押せることを語で言う** ──
 * 画像そのものには押せる印が付かないので、形からは読み取れない。
 * 写真が無いときは出さない（押す対象がない）。
 */
export function photoTapHint(locale: Locale): string {
  return t('detail.photoTapHint', locale);
}

/**
 * 詳細画面に写真が無いときの 1 行（§2.2 / 決定 §6-4）。**リンクだけを小さく出す。**
 * 枠付きの大きな置き場所にすると、写真の無い記録（多数派）で毎回追加を促すことになる。
 */
export function photoAddFromDetailLabel(locale: Locale): string {
  return t('detail.photoAddFromDetail', locale);
}

/** 全画面表示の閉じる（§2.1）。読み上げ用で、見た目は「✕」 */
export function photoViewerCloseLabel(locale: Locale): string {
  return t('detail.photoViewerClose', locale);
}

/** 一覧のサムネイル・詳細の写真の読み上げ語（§2.3）。商品名は呼び出し側が前に付ける */
export function photoImageLabel(locale: Locale): string {
  return t('photo.image', locale);
}

/** 写真の無い行のサムネイル枠の読み上げ語（§2.3）。枠が「押せる何か」に見えないようにする */
export function photoEmptyLabel(locale: Locale): string {
  return t('photo.empty', locale);
}

/**
 * 写真へのアクセスを拒否されたとき（§3.3）。**「設定を開く」の口と対で出す** ──
 * アプリの中では直せないので、どこへ行けば直せるかまで言わないと詰む。
 */
export function photoPermissionDeniedMessage(locale: Locale): string {
  return t('photo.permissionDenied', locale);
}

/** 上の文と対で出すリンク（§3.3）。iOS の設定アプリのこのアプリの画面を開く */
export function photoOpenSettingsLabel(locale: Locale): string {
  return t('photo.openSettings', locale);
}

/** 縮小・保存に失敗したとき（§3.3）。原因は端末側なので言えるのはここまで */
export function photoSaveFailedMessage(locale: Locale): string {
  return t('photo.saveFailed', locale);
}

// ---- 使いかたの図の中の語（HelpPartFigure / HelpDiagram。案 `19c` / `20a`） ----
//
// 図が出す文もここに集める。**図の中の「画面に出ている語」は定数を共有する**（部品を
// 実物にしてあるのと同じ理由。HelpPartFigure の冒頭参照）── 画面の語を直したときに、
// 図だけ古い語のまま残るのを構造で防ぐ。ここに置くのは図にしか無い文だけ。
//
// 金額・商品名・タグ名などの**作り物のデータ**（「洋服」「クッション」「800」）は
// 図の中に残す ── あれは語ではなく題材で、図ごとに読みやすい値を選ぶものだから。

/**
 * 図の中の合成（「梱包材ほか 50」）。envelopeCostLabel を図の側で連結すると
 * 英語で語順が崩れるので、1 文としてここで組む。
 */
export function helpFigureEnvelopeOthersPart(locale: Locale, amount: string): string {
  return t('helpFigure.envelopeOthersPart', locale, {
    envelope: t('amount.envelopeCostInline', locale),
    amount,
  });
}

/**
 * 図の題材（作り物の商品名・タグ名・プリセット名）。**金額や件数は図が持つ**が、
 * 語は辞書から引く ── 英語表示のときに図の中だけ日本語が残らないようにする。
 */
export function helpFigureSample(locale: Locale) {
  return {
    parcel: t('helpFigure.sampleParcel', locale),
    flatRate: t('helpFigure.sampleFlatRate', locale),
    tagClothes: t('helpFigure.sampleTagClothes', locale),
    tagTableware: t('helpFigure.sampleTagTableware', locale),
    tagBooks: t('helpFigure.sampleTagBooks', locale),
    itemCushion: t('helpFigure.sampleItemCushion', locale),
    itemMug: t('helpFigure.sampleItemMug', locale),
    itemPictureBook: t('helpFigure.sampleItemPictureBook', locale),
  };
}

/** 部品の下に 1 行付ける説明（HelpPartFigure の PartFrame の note） */
export function helpFigureModeProfitNote(locale: Locale): string {
  return t('helpFigure.modeProfitNote', locale);
}
export function helpFigureModeTargetNote(locale: Locale): string {
  return t('helpFigure.modeTargetNote', locale);
}
export function helpFigureCalculatorNote(locale: Locale): string {
  return t('helpFigure.calculatorNote', locale);
}
/** 手数料の行だけ電卓ボタンが無いこと（金額の欄と並べて読む） */
export function helpFigureCommissionFieldNote(locale: Locale): string {
  return t('helpFigure.commissionFieldNote', locale);
}
export function helpFigureBreakdownNote(locale: Locale): string {
  return t('helpFigure.breakdownNote', locale);
}
export function helpFigurePresetTagNote(locale: Locale): string {
  return t('helpFigure.presetTagNote', locale);
}
/** 45b の 2 択（SPEC-V6 §3）。**押した側の額がそのまま欄に入る**ことを言う */
export function helpFigureShippingMaterialNote(locale: Locale): string {
  return t('helpFigure.shippingMaterialNote', locale);
}
export function helpFigureAddRecordNote(locale: Locale): string {
  return t('helpFigure.addRecordNote', locale);
}
export function helpFigureKindSelectorNote(locale: Locale): string {
  return t('helpFigure.kindSelectorNote', locale);
}
export function helpFigureStatusToggleNote(locale: Locale): string {
  return t('helpFigure.statusToggleNote', locale);
}
export function helpFigurePhotoNote(locale: Locale): string {
  return t('helpFigure.photoNote', locale);
}
export function helpFigureTagRowNote(locale: Locale): string {
  return t('helpFigure.tagRowNote', locale);
}
export function helpFigureMonthBarNote(locale: Locale): string {
  return t('helpFigure.monthBarNote', locale);
}
export function helpFigureFilterEntryNote(locale: Locale): string {
  return t('helpFigure.filterEntryNote', locale);
}
export function helpFigureSearchSortNote(locale: Locale): string {
  return t('helpFigure.searchSortNote', locale);
}
export function helpFigureSoldListingNote(locale: Locale): string {
  return t('helpFigure.soldListingNote', locale);
}
export function helpFigurePresetListNote(locale: Locale): string {
  return t('helpFigure.presetListNote', locale);
}
/** 目標欄（SPEC-V9 §2）。**空欄が 0 ではない**ことだけを言う */
export function helpFigureTargetFieldNote(locale: Locale): string {
  return t('helpFigure.targetFieldNote', locale);
}
/** 価格ライン（§9.6）。**目盛りは目標の有無で 2 点にも 3 点にもなる**ことを言う */
export function helpFigurePriceLineNote(locale: Locale): string {
  return t('helpFigure.priceLineNote', locale);
}
/** シミュレーター（§9.9）。図では動かせないことを断る */
export function helpFigureSimulatorNote(locale: Locale): string {
  return t('helpFigure.simulatorNote', locale);
}
/** データタブの 3 択（案 3c）。**押す場所**を言う */
export function helpFigureDataModesNote(locale: Locale): string {
  return t('helpFigure.dataModesNote', locale);
}
/** タグ別の 2 択（案 1b）。カードの右上という位置が見落とされやすい */
export function helpFigureTagViewNote(locale: Locale): string {
  return t('helpFigure.tagViewNote', locale);
}
/** 写真を含めるか（SPEC-V8 §4）。**既定と、含めなかったときの結果**を言う */
export function helpFigurePhotoIncludeNote(locale: Locale): string {
  return t('helpFigure.photoIncludeNote', locale);
}
/** バッジの文字（設計案 49c）。専用の入力欄が無いことを言う */
export function helpFigurePresetBadgeNote(locale: Locale): string {
  return t('helpFigure.presetBadgeNote', locale);
}
/** 記録詳細の帯（§4）。凡例の代わりが下の丸であることを言う */
export function helpFigureRecordBarNote(locale: Locale): string {
  return t('helpFigure.recordBarNote', locale);
}
/** 色の 2 群（設計案 50c）。上下の意味だけを言う（使い切ったときの形は本文が持つ） */
export function helpFigureColorGroupsNote(locale: Locale): string {
  return t('helpFigure.colorGroupsNote', locale);
}
export function helpFigureExportTargetNote(locale: Locale): string {
  return t('helpFigure.exportTargetNote', locale, { soldRecords: t('list.soldRecords', locale) });
}
export function helpFigureExportPreviewNote(locale: Locale): string {
  return t('helpFigure.exportPreviewNote', locale);
}

/** 図の中で 2 つを並べて見せるときの見出し（絞り込みの入口・⌕ と ⇅） */
export function helpFigureFilterOffCaption(locale: Locale): string {
  return t('helpFigure.filterOffCaption', locale);
}
export function helpFigureFilterOnCaption(locale: Locale): string {
  return t('helpFigure.filterOnCaption', locale);
}
export function helpFigureSearchCaption(locale: Locale): string {
  return t('helpFigure.searchCaption', locale);
}

/** 抽象的な図（HelpDiagram）の見出し。図が何の場面を描いているかを言う */
export function helpFigureKindSubtitle(locale: Locale, kind: RecordKind): string {
  return t('helpFigure.kindSubtitle', locale, { kind: recordKindLabel(locale, kind) });
}
export function helpFigureSiteAmountSubtitle(locale: Locale): string {
  return t('helpFigure.siteAmountSubtitle', locale);
}
export function helpFigureTargetSubtitle(locale: Locale): string {
  return t('helpFigure.targetSubtitle', locale);
}
/**
 * 書き出し（CSV）2 種の図の見出し。
 *
 * **`BACKUP` を名前に入れない**（旧 `HELP_FIGURE_BACKUP_SUBTITLE`）── CSV の種類の一方が
 * 「データ保存用」（内部の値は `backup`）なのでそう呼んでいたが、SPEC-V8 で
 * 本物の「バックアップと復元」が入ったあとは、定数名だけ読むとあちらの図に見える。
 * 表示文言は変えていない。
 */
export function helpFigureCsvKindsSubtitle(locale: Locale): string {
  return t('helpFigure.csvKindsSubtitle', locale);
}
export function helpFigureCostPartsSubtitle(locale: Locale): string {
  return t('helpFigure.costPartsSubtitle', locale);
}
export function helpFigureDayGroupSubtitle(locale: Locale): string {
  return t('helpFigure.dayGroupSubtitle', locale);
}
/** 復元前のプレビュー（SPEC-V8 §5.4）。**置き換えであることを図の題で言う** */
export function helpFigureBackupPreviewSubtitle(locale: Locale): string {
  return t('helpFigure.backupPreviewSubtitle', locale);
}
export function helpFigureBackupReplaceNote(locale: Locale): string {
  return t('helpFigure.backupReplaceNote', locale);
}
/** 実績の 2 とおり（案 3c）。段を登るものと 1 回だけのもの */
export function helpFigureAchievementKindsSubtitle(locale: Locale): string {
  return t('helpFigure.achievementKindsSubtitle', locale);
}
export function helpFigureAchievementLadderLabel(locale: Locale): string {
  return t('helpFigure.achievementLadderLabel', locale);
}
export function helpFigureAchievementOnceLabel(locale: Locale): string {
  return t('helpFigure.achievementOnceLabel', locale);
}

/** 帯・行の中の語（図にしか無いもの。画面に出る語は定数を共有する） */
export function helpFigureKeptLabel(locale: Locale): string {
  return t('helpFigure.keptLabel', locale);
}
export function helpFigureTargetProfitLabel(locale: Locale): string {
  return t('helpFigure.targetProfitLabel', locale);
}
export function helpFigureSaleDateRangeLabel(locale: Locale): string {
  return t('helpFigure.saleDateRangeLabel', locale);
}
export function helpFigureTargetRowTitle(locale: Locale): string {
  return t('helpFigure.targetRowTitle', locale);
}
export function helpFigureHitLabel(locale: Locale): string {
  return t('helpFigure.hitLabel', locale);
}
export function helpFigureMissLabel(locale: Locale): string {
  return t('helpFigure.missLabel', locale);
}
export function helpFigureIncludedLabel(locale: Locale): string {
  return t('helpFigure.includedLabel', locale);
}
export function helpFigureExcludedLabel(locale: Locale): string {
  return t('helpFigure.excludedLabel', locale);
}
export function helpFigureNoneMark(locale: Locale): string {
  return t('helpFigure.noneMark', locale);
}
export function helpFigureFileLabel(locale: Locale): string {
  return t('helpFigure.fileLabel', locale);
}
export function helpFigureScreenLabel(locale: Locale): string {
  return t('helpFigure.screenLabel', locale);
}

/** CSV に何が入るかの表（§5.2 の列を 5 つの束にまとめたもの） */
export function helpFigureCsvBasicLabel(locale: Locale): string {
  return t('helpFigure.csvBasicLabel', locale);
}
export function helpFigureCsvSiteLabel(locale: Locale): string {
  return t('helpFigure.csvSiteLabel', locale);
}
export function helpFigureCsvBreakdownLabel(locale: Locale): string {
  return t('helpFigure.csvBreakdownLabel', locale);
}

/** 5 つの経費それぞれの説明（名前の側は画面と同じ定数を使う） */
export function helpFigurePurchaseNote(locale: Locale): string {
  return t('helpFigure.purchaseNote', locale, { kind: recordKindLabel(locale, 'used') });
}
export function helpFigurePostageNote(locale: Locale): string {
  return t('helpFigure.postageNote', locale);
}
export function helpFigureCommissionNote(locale: Locale): string {
  return t('helpFigure.commissionNote', locale);
}
export function helpFigureEnvelopeNote(locale: Locale): string {
  return t('helpFigure.envelopeNote', locale);
}
export function helpFigureOthersNote(locale: Locale): string {
  return t('helpFigure.othersNote', locale);
}

/** 図の見出しのうち、題材の金額や語をそのまま含むもの（値は図が持つ） */
export function helpFigureBothSoldSubtitle(locale: Locale, price: string): string {
  return t('helpFigure.bothSoldSubtitle', locale, {
    salesPrice: t('amount.salesPriceInline', locale),
    price,
  });
}
/**
 * 目標と下げ幅の図の見出し（SPEC-V9 §1.2 / §4.3）。**同じ 1 件だと題で言う** ──
 * 3 行を別々の記録だと読まれると、「目標の決め方で変わる」という関係そのものが消える。
 *
 * 金額を引数で受けるのは、図が持つ題材（`PRICING_EXAMPLE`）と食い違わせないため ──
 * 見出しに「¥5,000」と書き込んでしまうと、題材を変えたときに題だけが古い額を主張する。
 */
export function helpFigureTargetRoomSubtitle(locale: Locale, price: string): string {
  return t('helpFigure.targetRoomSubtitle', locale, { price });
}
export function helpFigureSourcedRowTitle(locale: Locale, purchasePrice: string): string {
  return t('helpFigure.sourcedRowTitle', locale, {
    kind: recordKindLabel(locale, 'sourced'),
    purchasePrice: t('amount.purchasePrice', locale),
    price: purchasePrice,
  });
}
export function helpFigureSingleRecordLabel(locale: Locale, kind: RecordKind): string {
  return t('helpFigure.singleRecordLabel', locale, { kind: recordKindLabel(locale, kind) });
}
export function helpFigureSiteAmountMeasure(locale: Locale, amount: string): string {
  return t('helpFigure.siteAmountMeasure', locale, {
    amount,
    commission: t('amount.commissionShort', locale),
    postage: t('amount.postageInline', locale),
  });
}
export function helpFigureAppAmountMeasure(locale: Locale, amount: string): string {
  return t('helpFigure.appAmountMeasure', locale, {
    amount,
    envelope: t('amount.envelopeCostInline', locale),
  });
}
export function helpFigureTotalPriceMeasure(locale: Locale, price: string): string {
  return t('helpFigure.totalPriceMeasure', locale, {
    salesPrice: t('amount.salesPriceInline', locale),
    price,
  });
}
export function helpFigureTagOrSubtitle(locale: Locale, first: string, second: string): string {
  return t('helpFigure.tagOrSubtitle', locale, { first, second });
}

/**
 * 図: 複製で写るもの・写らないもの（記録ページ）。
 * 欄の名前は画面の表示語をそのまま使い、ここでは**群の見出しと、値が変わる 2 つ**だけ持つ。
 */
export function helpFigureDuplicateSubtitle(locale: Locale): string {
  return t('helpFigure.duplicateSubtitle', locale);
}
export function helpFigureDuplicateCopiedLabel(locale: Locale): string {
  return t('helpFigure.duplicateCopiedLabel', locale);
}
export function helpFigureDuplicateSkippedLabel(locale: Locale): string {
  return t('helpFigure.duplicateSkippedLabel', locale);
}
export function helpFigureDuplicateDateLabel(locale: Locale): string {
  return t('helpFigure.duplicateDateLabel', locale);
}
export function helpFigureDuplicateStatusLabel(locale: Locale): string {
  return t('helpFigure.duplicateStatusLabel', locale, { status: t('list.listingStatus', locale) });
}

/**
 * 図: 機種変更の 1 往復（残すページ）。
 * **端末どうしが直接つながらない**ことを、間にファイルを挟んだ形で見せる。
 */
export function helpFigureMigrateSubtitle(locale: Locale): string {
  return t('helpFigure.migrateSubtitle', locale);
}
export function helpFigureMigrateOldLabel(locale: Locale): string {
  return t('helpFigure.migrateOldLabel', locale);
}
export function helpFigureMigrateNewLabel(locale: Locale): string {
  return t('helpFigure.migrateNewLabel', locale);
}

/** 図の中だけで使う短縮形・補助の語 */
export function helpFigureTotalCaption(locale: Locale): string {
  return t('helpFigure.totalCaption', locale);
}
export function helpFigurePurchaseShortLabel(locale: Locale): string {
  return t('helpFigure.purchaseShortLabel', locale);
}
export function helpFigurePackQuantityLabel(locale: Locale): string {
  return t('helpFigure.packQuantityLabel', locale);
}
export function helpFigurePackSubtitle(locale: Locale): string {
  return t('helpFigure.packSubtitle', locale);
}
/** 面積方式の 2 段目（1㎡ あたり → 1 回あたり）。cm の 2 値は掛けたあとの ㎡ で見せる */
export function helpFigurePackAreaLabel(locale: Locale): string {
  return t('helpFigure.packAreaLabel', locale);
}
export function helpFigurePackUseLabel(locale: Locale): string {
  return t('helpFigure.packUseLabel', locale);
}
export function helpFigurePackUsageLabel(locale: Locale): string {
  return t('helpFigure.packUsageLabel', locale);
}
export function helpFigureOneByOneLabel(locale: Locale): string {
  return t('helpFigure.oneByOneLabel', locale);
}
export function helpFigureGroupedLabel(locale: Locale): string {
  return t('helpFigure.groupedLabel', locale);
}
export function helpFigureRoundingSubtitle(locale: Locale): string {
  return t('helpFigure.roundingSubtitle', locale);
}
export function helpFigureRoundFirstLabel(locale: Locale): string {
  return t('helpFigure.roundFirstLabel', locale);
}
export function helpFigureRoundLastLabel(locale: Locale): string {
  return t('helpFigure.roundLastLabel', locale);
}

/**
 * 図 8（書き出しの 2 種類）の見出し（案 `20a`）。**列数は実際の列の並びから数える** ──
 * 図に「19 列」と書いておくと、列を 1 つ足したときに図だけが古くなる。
 */
/**
 * 図 12（梱包材の 3 方式）の 2 段目。面積方式だけは 1㎡ あたりのあとに **1 回あたり**が続くので、
 * 表の下に 1 行だけ添える。**語を組み立てるのはここ**（図の側で文を作らない）。
 */
export function helpFigurePackUseNote(locale: Locale, size: string, price: string): string {
  return t('helpFigure.packUseNote', locale, {
    useLabel: helpFigurePackUseLabel(locale),
    size,
    usePrice: presetUsePriceLabel(locale),
    price,
  });
}

export function helpFigureCsvKindLabel(locale: Locale, kind: 'backup' | 'tax'): string {
  const columns = kind === 'backup' ? CSV_BACKUP_COLUMNS : CSV_TAX_COLUMNS;
  const label =
    exportKindOptions(locale).find((option) => option.value === kind)?.label ?? '';
  return t('helpFigure.csvKindLabel', locale, { label, count: columns.length });
}

// ---- SPEC-V8 バックアップと復元 ----
//
// **既存の「書き出し（CSV）」の語とは分けて持つ**（§0.2）── あちらは「書き出し」、
// こちらは「バックアップ」。同じ語を使い回すと、設定の 2 行が同じものに見えて
// 「どちらを押せば機種変更で困らないか」が読めなくなる。

/** 設定タブ「データ」群の 3 行目（§5.1）。書き出し（CSV）の下に並ぶ */
export function backupLabel(locale: Locale): string {
  return t('settings.data.backup', locale);
}

/**
 * **移行前の呼び出し用（日本語固定）。**
 * バックアップ画面の見出し（backupScreenTitle('ja')）が参照している（ステップ 1 の対象外）。
 */
export const BACKUP_LABEL = t('settings.data.backup', 'ja');

/** バックアップ画面の見出し（§5.2） */
export function backupScreenTitle(locale: Locale): string {
  return t('backup.screenTitle', locale);
}

/** backup-info.csv のファイル名（§1.2）。logic/backup.ts と画面の両方が使う */
export const BACKUP_INFO_FILE = 'backup-info.csv';

// ---- 画面 1: バックアップを作る（§5.3・設計案 53a / 53b） ----
//
// **1 枚に 2 つのカードと、下端に固定した 1 つのボタン。**
// カード 1 が「何ができるか」、カード 2 が「写真をどうするか」、
// 押す口は下端に 1 つだけ ── 親指の届く場所に、押せるものを 1 つに絞る。

export function backupCreateSectionTitle(locale: Locale): string {
  return t('backup.createSection', locale);
}
export function backupCreateButtonLabel(locale: Locale): string {
  return t('backup.createButton', locale);
}

/**
 * 作る側の説明（案 53a）。**行き先（新しい端末）まで書く。**
 *
 * 「全件が入る」「期間の指定はない」は件数の帯（下の 3 つの数字）が見せるので、
 * 文では「何のために作るのか」だけを言う ── 機種変更で困らないためのものだ、と
 * 分かる位置に置かないと、隣の「書き出し（CSV）」との違いが読めない。
 */
export function backupCreateNote(locale: Locale): string {
  return t('backup.createNote', locale);
}

/** 件数の帯（案 53a）。「記録 53件」の形で 3 つ並べる */
export function backupCountRecordsLabel(locale: Locale): string {
  return t('backup.countRecords', locale);
}
export function backupCountTagsLabel(locale: Locale): string {
  return t('backup.countTags', locale);
}
export function backupCountPresetsLabel(locale: Locale): string {
  return t('backup.countPresets', locale);
}
export function backupCountPhotosLabel(locale: Locale): string {
  return t('backup.countPhotos', locale);
}

/** 「記録 53件」（帯の 1 つ）。ラベルと数の間は半角空き 1 つ */
export function backupCountChipLabel(locale: Locale, label: string, count: number): string {
  return t('backup.countChip', locale, { label, count: presetCountLabel(locale, count) });
}

/** 写真の枚数（「31枚」）。件（記録・タグ・プリセット）とは単位を変える */
export function photoCountLabel(locale: Locale, count: number): string {
  return t('backup.photoCount', locale, { count });
}

// ---- 写真を含めるか（SPEC-V8 §4 / 案 53a） ----
//
// **トグルではなく 2 択にする。** トグルは「いま入っているのか、切っているのか」を
// 色と位置だけで示すもので、50 代の利用者には読み取りに時間がかかる。
// 2 択なら選択肢の中に枚数とサイズを書けるので、「含めるとは何のことか」が
// 選ぶ瞬間に目に入る。既定は左の「含める」（バックアップは全部戻せるのが本来）。

export function backupPhotoSectionTitle(locale: Locale): string {
  return t('backup.photoSection', locale);
}
export function backupPhotoIncludeLabel(locale: Locale): string {
  return t('backup.photoInclude', locale);
}
export function backupPhotoExcludeLabel(locale: Locale): string {
  return t('backup.photoExclude', locale);
}

/** 「含める」の下に出す実測（53枚・8.2MB）。**合計サイズは実体を読まずに出す**（§4.4） */
export function backupPhotoIncludeDetail(locale: Locale, count: number, bytes: number): string {
  return t('backup.photoIncludeDetail', locale, {
    photos: photoCountLabel(locale, count),
    size: formatByteSize(locale, bytes),
  });
}

/** 「含めない」の下に出す利点。否定の選択肢にも選ぶ理由を書く */
export function backupPhotoExcludeDetail(locale: Locale): string {
  return t('backup.photoExcludeDetail', locale);
}

/**
 * バイト数を読める形に。MB は小数 1 桁、KB 未満は「1KB未満」に丸める。
 *
 * **割り切れるときは小数を落とす**（`50.0MB` ではなく `50MB`）── 上限のように
 * 定数として出す数字に `.0` が付くと、意味のない桁を読ませることになる。
 */
export function formatByteSize(locale: Locale, bytes: number): string {
  const mb = bytes / 1024 / 1024;
  if (mb >= 1) return t('backup.sizeMb', locale, { value: Number(mb.toFixed(1)) });
  const kb = bytes / 1024;
  if (kb >= 1) return t('backup.sizeKb', locale, { value: Math.round(kb) });
  return t('backup.sizeUnderKb', locale);
}

/**
 * **写真が入らないことの警告（案 53b）。** 選択カードの**直下**に出す。
 *
 * 「含めない」を選んだ**その瞬間**に、選んだ場所のすぐ下で言う ── 作ったあとに
 * 気付いても遅い。下端のボタン名（backupCreateWithoutPhotosLabel('ja')）と合わせて
 * **2 か所**で言うのは、片方だけでは押す前の視線に入らないことがあるため。
 */
export function backupNoPhotoWarning(locale: Locale): string {
  return t('backup.noPhotoWarning', locale);
}

/** 上限に当たった人の逃げ道（§4.4）。**否定で終わらせない** */
export function backupCreateWithoutPhotosLabel(locale: Locale): string {
  return t('backup.createWithoutPhotos', locale);
}

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
 * 写真の警告（backupNoPhotoWarning('ja')）とは重さが違うので**カードの外に小さく置く** ──
 * あちらは知らないと失う（写真が戻らない）が、こちらは知らなくても損はしない。
 */
export function backupCsvInsideNote(locale: Locale): string {
  return t('backup.csvInsideNote', locale);
}

// ---- 作っている間（案 53a 右） ----
//
// **ボタンをそのまま進捗バーに変える。** 別の場所に印を出すと、押した指の先から
// 反応が消えて「効いたのか」が読めない。進捗は写真の枚数で数える ──
// 止まって見える時間のほとんどが写真の読み出しなので、そこだけが動けば十分。

export function backupCreatingLabel(locale: Locale): string {
  return t('backup.creating', locale);
}

/** 「写真 34枚目 / 53枚」。**何枚目まで進んだか**を出す（率は出さない） */
export function backupPhotoProgressLabel(locale: Locale, done: number, total: number): string {
  return t('backup.photoProgress', locale, { done, total: photoCountLabel(locale, total) });
}

/** 進捗の右に添える 1 語。**待てば終わる**ことだけを言う */
export function backupProgressWaitNote(locale: Locale): string {
  return t('backup.progressWaitNote', locale);
}

/**
 * 下端のボタンの下に出す 1 行（案 53a）。
 *
 * **「前回」を出すのは、間隔が空いたことに自分で気付けるようにするため。**
 * 通知も催促もしないので、思い出す手がかりはこの 1 行しかない。
 */
export function backupLastCreatedNote(locale: Locale, createdAt: string | null): string {
  if (createdAt == null) return t('backup.lastCreatedNever', locale);
  return t('backup.lastCreated', locale, { date: backupDayLabel(locale, createdAt) });
}

/** 「2026年7月2日」。保存形式 "YYYY-MM-DDTHH:mm:ss.SSS" から日付だけを出す */
export function backupDayLabel(locale: Locale, date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  if (match == null) return date;
  const [, year, month, day] = match;
  return t('backup.dayLabel', locale, {
    year,
    month: locale === 'en' ? formatMonthCell(locale, Number(month)) : Number(month),
    day: Number(day),
  });
}

export function backupShareDialogTitle(locale: Locale): string {
  return t('backup.shareDialogTitle', locale);
}
export function backupCreateFailedMessage(locale: Locale): string {
  return t('backup.createFailed', locale);
}
export function backupSharingUnavailable(locale: Locale): string {
  return t('backup.sharingUnavailable', locale);
}

// ---- 画面 2: 上限を超えたとき（§4.4 / 案 53e） ----
//
// **押す前には何も出さない。** 大半の利用者に無関係な数字で、先に見せると
// 「50MB とは何枚か」を考えさせることになる。超えた人にだけ、押した後に
// **下からのシート**で受け止める ── ダイアログより文を長く書けて、
// 棒グラフで「あと少しなのか、大幅に超えているのか」まで見せられる。

export function backupPhotoLimitTitle(locale: Locale): string {
  return t('backup.photoLimitTitle', locale);
}

/** 何が起きるのかを、起きる順に 1 文で。「上限」の語より先に結果を言う */
export function backupPhotoLimitMessage(locale: Locale): string {
  return t('backup.photoLimitMessage', locale);
}

/** 棒グラフの左の見出し（「今の写真 53枚」） */
export function backupPhotoLimitBarLabel(locale: Locale, count: number): string {
  return t('backup.photoLimitBarLabel', locale, { photos: photoCountLabel(locale, count) });
}

/** 棒グラフの下の目盛り（左端は 0、右端は上限） */
export function backupPhotoLimitBarMin(locale: Locale): string {
  return t('backup.photoLimitBarMin', locale);
}

export function backupPhotoLimitBarMax(locale: Locale, limit: number): string {
  return t('backup.photoLimitBarMax', locale, { size: formatByteSize(locale, limit) });
}

/**
 * シートの下の補足（案 53e）。**失うものと残るものを分けて言う。**
 *
 * 「写真なしで作る」を押させる前に、**それでも移せるもの**を件数で見せる ──
 * 数字が無いと「写真が入らないなら意味がない」と読まれて、
 * バックアップそのものを取らずに終わる。
 */
export function backupPhotoLimitFooter(
  locale: Locale,
  counts: { records: number; tags: number; presets: number },
): string {
  return t('backup.photoLimitFooter', locale, counts);
}

/**
 * シートを閉じる側（案 53e）。**「キャンセル」ではなく「やめる」。**
 *
 * 押すと写真の選択が「含めない」に切り替わる ── 閉じた先で
 * 「そのまま作る」か「写真を減らしてから戻る」かを選べるようにするため、
 * **同じ行き止まりに戻さない**。
 */
export function backupLimitCancelLabel(locale: Locale): string {
  return t('backup.limitCancel', locale);
}

// ---- 復元するものを選ぶ（§5.4） ----

export function backupRestoreSectionTitle(locale: Locale): string {
  return t('backup.restoreSection', locale);
}
export function backupPickFileLabel(locale: Locale): string {
  return t('backup.pickFile', locale);
}
export function backupPickFolderLabel(locale: Locale): string {
  return t('backup.pickFolder', locale);
}

/** 2 つの選び方がある理由を 1 行で（§3.1 / 決定 §8-2） */
export function backupRestoreNote(locale: Locale): string {
  return t('backup.restoreNote', locale);
}

// ---- 画面 3: プレビュー（§5.4 / 案 53f / 53g） ----
//
// **確認ダイアログは持たない。** ダイアログでは「今あるものがどうなるか」を
// 数字で並べられず、閉じると理由が残らない。この 1 枚が確認そのもので、
// **「今の端末 → ファイル」の差**を出すのが、間違ったファイルに気付く一番強い手がかり。

export function backupPreviewScreenTitle(locale: Locale): string {
  return t('backup.previewScreenTitle', locale);
}
export function backupPreviewBackLabel(locale: Locale): string {
  return t('backup.previewBack', locale);
}

/** 差の表の 2 つの列見出し */
export function backupDiffCurrentHeader(locale: Locale): string {
  return t('backup.diffCurrentHeader', locale);
}
export function backupDiffFileHeader(locale: Locale): string {
  return t('backup.diffFileHeader', locale);
}

/** 差の表の行の名前（§4.4）。**写真の行は 0 枚でも出す** ── 差の表では 0 に意味がある */
export const BACKUP_PREVIEW_RECORDS_LABEL = t('backup.countRecords', 'ja');
export const BACKUP_PREVIEW_TAGS_LABEL = t('backup.countTags', 'ja');
export const BACKUP_PREVIEW_PRESETS_LABEL = t('backup.countPresets', 'ja');
export const BACKUP_PREVIEW_PHOTOS_LABEL = t('backup.countPhotos', 'ja');

/**
 * ファイルのカードの 2 行目（案 53f / 53g）。
 *
 * **相対の語（きょう・きのう）を添える。** 「2026年8月13日」だけでは、
 * それが直前に作ったものか半年前のものかを暗算することになる。
 * 写真の入っていないファイルは、ここでも `・写真なし` と言う（§4.6）。
 */
export function backupPreviewCreatedLine(
  locale: Locale,
  createdAt: string,
  today: Date,
  hasPhotos: boolean,
): string {
  const relative = backupRelativeDayLabel(locale, createdAt, today);
  const plain = backupDayLabel(locale, createdAt);
  const day =
    relative == null ? plain : t('backup.dayWithRelative', locale, { day: plain, relative });
  return t(hasPhotos ? 'backup.createdLine' : 'backup.createdLineNoPhoto', locale, { day });
}

/** きょう / きのう / それ以前は null（日付だけで足りる） */
export function backupRelativeDayLabel(
  locale: Locale,
  createdAt: string,
  today: Date,
): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(createdAt);
  if (match == null) return null;
  const [, year, month, day] = match;
  const created = new Date(Number(year), Number(month) - 1, Number(day));
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const days = Math.round((base.getTime() - created.getTime()) / 86_400_000);
  if (days === 0) return t('backup.relativeToday', locale);
  if (days === 1) return t('backup.relativeYesterday', locale);
  return null;
}

/**
 * 表の下の 1 文（案 53f）。**中身を 1 件だけ名指しする。**
 *
 * 件数は合っていても「別の人のファイル」「別のアプリのファイル」であることはあり得る。
 * 商品名 1 つを出せば、見覚えがあるかどうかで一瞬で分かる ──
 * 件数の一致より強い手がかりで、しかも読むのに 1 秒もかからない。
 */
export function backupNewestRecordNote(
  locale: Locale,
  date: string,
  itemName: string,
): string {
  const name = itemName.trim() === '' ? t('list.untitled', locale) : itemName;
  return t('backup.newestRecordNote', locale, { day: backupDayLabel(locale, date), name });
}

/**
 * 大きく減るときだけ足す注意帯（案 53f）。
 *
 * 赤い数字は「減る」ことしか言わないので、**減り幅が大きいときだけ**
 * 言葉でも言う ── 古いバックアップを選んでいる典型がここに出る。
 */
export function backupLargeDecreaseNote(
  locale: Locale,
  current: number,
  next: number,
): string {
  return t('backup.largeDecreaseNote', locale, {
    current,
    next,
  });
}

/** 写真の入っていないファイルから戻すとき（案 53g）。**損失が二重なので 2 文に分ける** */
export function backupNoPhotoInFileTitle(locale: Locale): string {
  return t('backup.noPhotoInFileTitle', locale);
}

export function backupNoPhotoInFileBody(locale: Locale, devicePhotos: number): string {
  return t('backup.noPhotoInFileBody', locale, { photos: photoCountLabel(locale, devicePhotos) });
}

/** 赤いボタンの上に置く警告（案 53f）。**取り消せないことを最後に言う** */
export function backupReplaceWarning(locale: Locale, records: number): string {
  // 記録の数なので recordCountValue（英語は records）。汎用の items にしない
  return t('backup.replaceWarning', locale, { count: records });
}

export function backupReplaceAllLabel(locale: Locale): string {
  return t('backup.replaceAll', locale);
}

/** 写真の入っていないファイルのとき（案 53g）。**ボタン名でも写真のことを言う** */
export function backupReplaceWithoutPhotosLabel(locale: Locale): string {
  return t('backup.replaceWithoutPhotos', locale);
}

export function backupPickAnotherFileLabel(locale: Locale): string {
  return t('backup.pickAnotherFile', locale);
}

/** 復元の最中（写真を書き戻している間）。作るときと同じ形で出す */
export function backupRestoringLabel(locale: Locale): string {
  return t('backup.restoring', locale);
}

// ---- 画面 5: 復元できたとき（§5.6 / 案 53k） ----

export function backupResultScreenTitle(locale: Locale): string {
  return t('backup.resultScreenTitle', locale);
}
export function backupRestoredTitle(locale: Locale): string {
  return t('backup.restoredTitle', locale);
}

/** 写真の行（案 53k）。**欠けたぶんは括弧で添える**（行そのものは消さない） */
export function backupRestoredPhotoValue(
  locale: Locale,
  restored: number,
  missing: number,
): string {
  const shown = photoCountLabel(locale, restored);
  return missing === 0
    ? shown
    : t('backup.restoredPhotoValueWithMissing', locale, {
        restored: shown,
        missing: photoCountLabel(locale, missing),
      });
}

/**
 * 欠けた写真の説明（案 53k）。**警告色は使わない。**
 *
 * これはエラーではなく起きたことの報告なので、赤い帯にはしない ──
 * 復元そのものは成功していて、金額も日付も入っている（§4.3）。
 * 言うのは「なぜ欠けたか」と「その記録はどうなったか」の 2 つ。
 */
export function backupMissingPhotoNote(locale: Locale, missing: number): string {
  return t('backup.missingPhotoNote', locale, {
    photos: photoCountLabel(locale, missing),
    count: missing,
  });
}

export function backupResultOpenRecordsLabel(locale: Locale): string {
  return t('backup.resultOpenRecords', locale);
}

/** 欠けた写真があるときだけ出す 2 つ目の口（案 53k） */
export function backupMissingPhotoRecordsLabel(locale: Locale, missing: number): string {
  return t('backup.missingPhotoRecords', locale, { count: missing });
}

/** 欠けた記録の一覧（上の口を押したときに開く）の見出し */
export function backupMissingPhotoListTitle(locale: Locale): string {
  return t('backup.missingPhotoListTitle', locale);
}

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

export function backupErrorTitle(locale: Locale): string {
  return t('backup.errorTitle', locale);
}
export function backupErrorUnchangedNote(locale: Locale): string {
  return t('backup.errorUnchangedNote', locale);
}

/**
 * 理由の下に置く 1 文（案 53h）。**部分的に入っていないことと、次の一手**を言う。
 *
 * 「1か所でも」と言い切るのは §3.2 の約束（1 件でもエラーがあれば一切読み込まない）
 * そのもので、利用者から見れば「途中まで入った」を疑わなくていい根拠になる。
 */
export function backupErrorHint(locale: Locale): string {
  return t('backup.errorHint', locale);
}

/**
 * 「この内容をコピーする」で持ち出す文（案 53h）。
 *
 * **画面に出ている 3 行をそのまま**渡す ── 家族や問い合わせ先に転記するときに、
 * 行番号と列名が落ちると調べようがない。**長押しではなく普通のボタン**にしてあるのは、
 * 長押しは金額の行（LongPressCopy）でだけ使う作法にしているため。
 */
export function backupErrorCopyText(locale: Locale, reason: string): string {
  return [
    backupErrorTitle(locale),
    reason,
    backupErrorHint(locale),
    backupErrorUnchangedNote(locale),
  ].join('\n');
}

/** コピーできたときのトーストに出す語（copiedMessage に渡す） */
export function backupErrorCopyLabel(locale: Locale): string {
  return t('backup.errorCopy', locale);
}
export function backupErrorCopyToastLabel(locale: Locale): string {
  return t('backup.errorCopyToast', locale);
}

/** 「records.csv 501行目：「仕入価格」が正しい数値ではありません。」（§3.3 の例） */
export function backupColumnErrorMessage(
  locale: Locale,
  fileName: string,
  lineNumber: number,
  columnLabel: string,
  reason: string,
): string {
  return t('backup.columnError', locale, {
    file: fileName,
    line: lineNumber,
    column: columnLabel,
    reason,
  });
}

export function backupNumberError(locale: Locale): string {
  return t('backup.numberError', locale);
}
export function backupDateError(locale: Locale): string {
  return t('backup.dateError', locale);
}
export function backupBooleanError(locale: Locale): string {
  return t('backup.booleanError', locale);
}

export function BACKUP_ENUM_ERROR(values: readonly string[]): string {
  return `が ${values.join(' / ')} のどれでもありません。`;
}

export function backupEmptyColumnMessage(
  locale: Locale,
  fileName: string,
  lineNumber: number,
  columnLabel: string,
): string {
  return t('backup.emptyColumn', locale, {
    file: fileName,
    line: lineNumber,
    column: columnLabel,
  });
}

/**
 * 列そのものが違うとき（並べ替え・改名・過不足）。
 *
 * **列名を全部は並べない。** 19 列を 2 回並べると画面が文字で埋まり、
 * 肝心の「どこが違うか」が読めなくなる（実機で確認した）。
 * 出すのは**最初に食い違った 1 か所**だけ ── 直すべき場所はそこから辿れる。
 */
export function backupColumnMismatchMessage(
  locale: Locale,
  fileName: string,
  expected: readonly string[],
  actual: readonly string[],
): string {
  if (expected.length !== actual.length) {
    return t('backup.columnCountMismatch', locale, {
      file: fileName,
      expected: expected.length,
      actual: actual.length,
    });
  }
  const index = expected.findIndex((name, i) => name !== actual[i]);
  return t('backup.columnNameMismatch', locale, {
    file: fileName,
    index: index + 1,
    expected: expected[index],
    actual: actual[index],
  });
}

export function backupFieldCountMessage(
  locale: Locale,
  fileName: string,
  lineNumber: number,
  expected: number,
  actual: number,
): string {
  return t('backup.fieldCount', locale, {
    file: fileName,
    line: lineNumber,
    expected,
    actual,
  });
}

export function backupMissingFileMessage(locale: Locale, fileName: string): string {
  return t('backup.missingFile', locale, { file: fileName });
}

export function BACKUP_EMPTY_FILE_MESSAGE(fileName: string): string {
  return `${fileName} が空です。`;
}

export function backupUnsupportedVersionMessage(locale: Locale, version: number): string {
  return t('backup.unsupportedVersion', locale, { version });
}

/** 参照先が無い中間行（§3.2）。**FK が効かないぶんの検査** */
export function backupUnknownRecordRefMessage(
  locale: Locale,
  lineNumber: number,
  recordId: string,
): string {
  return t('backup.unknownRecordRef', locale, { line: lineNumber, id: recordId });
}

export function backupUnknownTagRefMessage(
  locale: Locale,
  lineNumber: number,
  tagId: string,
): string {
  return t('backup.unknownTagRef', locale, { line: lineNumber, id: tagId });
}

/** 選んだものがバックアップに見えないとき（§3.1） */
export function backupNoCsvMessage(locale: Locale): string {
  return t('backup.noCsvMessage', locale);
}

/** ZIP として開けなかったとき（壊れている・別形式） */
export const BACKUP_BROKEN_ZIP_MESSAGE =
  'ファイルを開けませんでした。壊れている可能性があります。';

/** フォルダ選択そのものが使えない端末（Directory.pickDirectoryAsync が無い経路） */
export function backupFolderPickUnavailable(locale: Locale): string {
  return t('backup.folderPickUnavailable', locale);
}

// ─────────────────────────────────────────────────────────────────────────────
// 価格と利益の分析「いくらで売る？」（SPEC-V9 §9）の表示語。
//
// **サービス名は一切出さない**（§9.1）。出品先は「出品しているサイト」としか呼ばない ──
// 名前を書くと、そのサイトを使っていない人の画面に無関係な語が出る。
//
// **「¥0」を「決めていない」の意味で使わない**（§1.2）。目標に関わる語は必ず
// `targetProfitSummary` / `t('form.targetProfitUnset', 'ja')` を通る。
//
// **「手取り」は使わない**（SPEC-V2 §7-8）。販売サイトが表示する「手取り」は梱包材費や
// その他経費を含まず、このアプリの数字と食い違うため ── この画面でも例外にしない。
// 同じことを言う語は「手元に残る」。
// ─────────────────────────────────────────────────────────────────────────────

/** 画面のタイトル（§9.2）。「分析」とは言わない ── 見たいのは分析ではなく値段 */
export function pricingScreenTitle(locale: Locale): string {
  return t('pricing.title', locale);
}

/**
 * 商品名の右のバッジ（§9.3）:「出品中 14日目」。日数は logic/listingDays の暦日差 + 1
 * （出品当日が 1 日目）。
 *
 * **出品日が未来の記録（日数が負）では日付を出さず、状態だけを出す** ──
 * 「0日目」「-1日目」は読み方が無い。日付の誤りそのものは記録詳細のメタ行が見せる。
 */
export function listingDayBadgeLabel(locale: Locale, days: number): string {
  return days < 0
    ? t('list.listingStatus', locale)
    : t('pricing.listingDayBadge', locale, { day: days + 1 });
}

/** 価格が未設定の記録のバッジ（§9.7）。**「未入力」ではない** ── 空欄も 0 円も同じ値で保存されるため */
export function priceUnsetBadgeLabel(locale: Locale): string {
  return t('pricing.priceUnsetBadge', locale);
}

/** 主役の数字が負のときに添えるバッジ（§9.5） */
export function lossBadgeLabel(locale: Locale): string {
  return t('pricing.lossBadge', locale);
}

/** 主役の数字が出せないとき（価格未設定）の置き字（§9.7）。「¥0」とは書かない */
export function amountPlaceholder(locale: Locale): string {
  return t('detail.amountPlaceholder', locale);
}

/** 主役の数字の上（§9.4）:「今の価格 ¥5,000 で売れたら」 */
export function currentPriceLeadLabel(locale: Locale, price: number): string {
  return t('pricing.currentPriceLead', locale, { price: formatYenSymbol(price) });
}

/**
 * 主役の数字の下（§9.4）:「手元に残る見込み・利益率 34.0%」。
 * 利益率は小数第 1 位まで（§4.5 の profitRate）。価格 0 では出せないので語だけになる。
 */
export function netProfitEstimateNote(locale: Locale, profitRate: number | null): string {
  return profitRate == null
    ? t('pricing.netProfitEstimate', locale)
    : t('pricing.netProfitEstimateWithRate', locale, { rate: profitRate.toFixed(1) });
}

/** 赤字のときの主役の数字の下（§9.5）:「売っても、手元のお金は ¥550 減ります」 */
export function lossAmountNote(locale: Locale, loss: number): string {
  return t('pricing.lossAmountNote', locale, { amount: formatYenSymbol(Math.abs(loss)) });
}

/**
 * 結論の帯の 2 行（§9.6）。**状態ごとに文がまるごと変わる**ので、
 * 「金額を差し替えるだけの 1 つの文」にはしない ── 黒字と赤字では言うべきことが違う。
 *
 * @param kind 目標の語を種別に合わせる（§5.2 の targetProfitLabel）
 */
export function pricingConclusionText(
  locale: Locale,
  conclusion: PricingConclusion,
  analysis: PricingAnalysis,
  kind: RecordKind,
): { headline: string; detail: string } {
  // 文中に埋め込むので targetProfitInline（英語だけ小文字）を使う
  const target = t(
    kind === 'used' ? 'record.targetProfitInline.used' : 'record.targetProfitInline.sourced',
    locale,
  );
  const amount =
    analysis.targetProfit == null ? '' : formatYenSymbol(analysis.targetProfit);
  const breakEven = formatYenSymbol(analysis.breakEven);

  switch (conclusion) {
    case 'safe':
      return {
        headline: t('pricing.conclusionSafe', locale, { breakEven }),
        detail: discountRoomText(locale, analysis.room),
      };
    case 'safeWithTarget':
      return {
        headline: t('pricing.conclusionSafeWithTarget', locale, {
          floor: formatYenSymbol(analysis.floorPrice),
          target,
          amount,
        }),
        detail: discountRoomText(locale, analysis.room),
      };
    case 'belowTarget':
      return {
        headline: t('pricing.conclusionBelowTarget', locale, {
          target,
          amount,
          shortfall: formatYenSymbol(analysis.targetShortfall ?? 0),
        }),
        detail: t('pricing.conclusionBelowTargetDetail', locale, { breakEven }),
      };
    case 'loss':
      return {
        headline: t('pricing.conclusionLoss', locale, {
          shortfall: formatYenSymbol(analysis.breakEvenShortfall),
        }),
        detail: t('pricing.conclusionLossDetail', locale, { breakEven }),
      };
    case 'lossWithTarget':
      return {
        headline: t('pricing.conclusionLoss', locale, {
          shortfall: formatYenSymbol(analysis.breakEvenShortfall),
        }),
        detail: t('pricing.conclusionLossWithTargetDetail', locale, {
          target,
          amount,
          price: formatYenSymbol(analysis.targetPrice ?? 0),
          gap: formatYenSymbol(analysis.targetShortfall ?? 0),
        }),
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
function discountRoomText(locale: Locale, room: number): string {
  // 下限が分岐点か目標ラインかで「下げるとどうなるか」は変わるので、
  // ここでは行き先を言わずに「下限そのもの」だけを言う（行き先は 1 行目に出ている）
  return roundForDisplay(room) === 0
    ? t('pricing.discountRoomNone', locale)
    : t('pricing.discountRoom', locale, { room: formatYenSymbol(room) });
}

/**
 * 記録詳細の帯グラフに足す結論行（O3 案。SPEC-V9 未反映）の 1 行目（結論・太字）。
 *
 * 全画面（PricingScreen）の結論の帯（pricingConclusionText）と語を揃えていない ──
 * あちらは帯の下の 2 行に分けて「行き先の額」と「余裕」を別々に言えるが、
 * こちらは 1 行しかないので、額 1 つで用件が伝わる短い言い方を使う。
 */
export function recordDetailConclusionHeadline(
  locale: Locale,
  conclusion: RecordDetailConclusion,
  analysis: PricingAnalysis,
  kind: RecordKind,
): string {
  // 文中に埋め込むので targetProfitInline（英語だけ小文字）を使う
  const target = t(
    kind === 'used' ? 'record.targetProfitInline.used' : 'record.targetProfitInline.sourced',
    locale,
  );
  const targetAmount =
    analysis.targetProfit == null ? '' : formatYenSymbol(analysis.targetProfit);

  switch (conclusion) {
    case 'safe':
      return t('conclusion.safe', locale, { room: formatYenSymbol(analysis.room) });
    case 'safeWithTarget':
      return t('conclusion.safeWithTarget', locale, {
        floor: formatYenSymbol(analysis.floorPrice),
        target,
        amount: targetAmount,
      });
    case 'loss':
      return t('conclusion.loss', locale, {
        shortfall: formatYenSymbol(analysis.breakEvenShortfall),
      });
    case 'lossWithTarget':
      return t('conclusion.lossWithTarget', locale, {
        target,
        amount: targetAmount,
        price: formatYenSymbol(analysis.targetPrice ?? 0),
      });
    case 'unpriced':
      // 赤字/目標達成の判定には価格が必要なので結論文は出せない。G（価格がなくても
      // 分かっていること）への誘導文言に差し替える
      return t('conclusion.unpriced', locale);
  }
}

/** 結論行の 2 行目（小さいグレー・末尾に ›）。黒字/赤字・目標の有無で動詞と行き先が変わる */
const RECORD_DETAIL_CONCLUSION_KEYS = {
  safe: 'conclusion.detailSafe',
  safeWithTarget: 'conclusion.detailSafeWithTarget',
  loss: 'conclusion.detailLoss',
  lossWithTarget: 'conclusion.detailLossWithTarget',
  unpriced: 'conclusion.detailUnpriced',
} as const satisfies Record<RecordDetailConclusion, TranslationKey>;

export function recordDetailConclusionDetail(
  locale: Locale,
  conclusion: RecordDetailConclusion,
): string {
  return t(RECORD_DETAIL_CONCLUSION_KEYS[conclusion], locale);
}

/** 価格ラインの目盛りの説明（§9.8）。金額はその上に出るので、ここは「何の線か」だけを言う */
export function priceTickLabel(locale: Locale, key: PriceTickKey): string {
  return t(PRICE_TICK_KEYS[key], locale);
}

const PRICE_TICK_KEYS = {
  breakEven: 'pricing.tickBreakEven',
  target: 'pricing.tickTarget',
  current: 'pricing.tickCurrent',
} as const satisfies Record<PriceTickKey, TranslationKey>;

/**
 * 赤字のときだけ価格ラインの右端に添える向きの説明（§9.8）。
 * 黒字では出さない ── そちらは左へ動かす（値下げする）ことが読みたいことで、
 * 向きの意味が反転する赤字のときだけ、どちらへ動かすと良くなるかを語で言う。
 */
export function priceLineRaiseHint(locale: Locale): string {
  return t('pricing.priceLineRaiseHint', locale);
}

/** 価格ラインの 2 点の間に渡す差額（§9.8）:「あと ¥612」 */
export function priceGapLabel(locale: Locale, amount: number): string {
  return t('pricing.priceGap', locale, { amount: formatYenSymbol(amount) });
}

/** 書き換える前の価格を示す灰色の点（§9.11）。画面を出るまでの表示で、保存はしない */
export function previousPriceLabel(locale: Locale): string {
  return t('pricing.previousPrice', locale);
}

/**
 * シミュレーターの見出し（§9.9）。**赤字では「値下げ」と言わない** ──
 * 赤字の記録でしたいのは値上げなので、見出しが操作と逆を向く。
 */
export function simulatorTitle(locale: Locale, state: PricingState): string {
  return t(state === 'loss' ? 'pricing.simulatorTitleLoss' : 'pricing.simulatorTitleSafe', locale);
}

/** シミュレーターの見出しの右（§9.9）。触っても記録は動かないことを先に言う */
export function simulatorNote(locale: Locale): string {
  return t('pricing.simulatorNote', locale);
}

/** シミュレーターの右上の数字の下（§9.9）:「見込み利益・27.8%」 */
export function simulatorProfitNote(locale: Locale, profitRate: number | null): string {
  return profitRate == null
    ? t('pricing.simulatorProfit', locale)
    : t('pricing.simulatorProfitWithRate', locale, { rate: profitRate.toFixed(1) });
}

/**
 * シミュレーターの判定（§9.9）。**「達成」は目標があるときだけ出す** ──
 * 決めていない人に「達成」と言うと、決めた覚えのない基準に受かったように読める。
 */
export function simulationVerdictText(
  locale: Locale,
  verdict: SimulationVerdict,
  analysis: PricingAnalysis,
  kind: RecordKind,
): string {
  const target = t(
    kind === 'used' ? 'record.targetProfitInline.used' : 'record.targetProfitInline.sourced',
    locale,
  );
  const amount =
    analysis.targetProfit == null ? '' : formatYenSymbol(analysis.targetProfit);
  const net = formatYenSymbol(Math.abs(verdict.simulation.netProfit));

  switch (verdict.key) {
    case 'loss':
      // もともと赤字の記録なら「まだ」── 新しく赤字になるわけではない
      return t(
        analysis.state === 'loss' ? 'pricing.verdictLossStill' : 'pricing.verdictLossNew',
        locale,
        { amount: net },
      );
    case 'turnsProfit':
      return t('pricing.verdictTurnsProfit', locale, { amount: net });
    case 'roomLeft':
      // 余裕 0（下限ぴったり）で「まだ ¥0 の余裕があります」とは言わない
      return roundForDisplay(verdict.room) === 0
        ? t('pricing.verdictAtFloor', locale)
        : t('pricing.verdictRoomLeft', locale, { room: formatYenSymbol(verdict.room) });
    case 'belowTarget':
      return t('pricing.verdictBelowTarget', locale, {
        target,
        amount,
        shortfall: formatYenSymbol(verdict.shortfall ?? 0),
      });
    case 'targetMet':
      return t('pricing.verdictTargetMet', locale, { target, amount });
  }
}

/**
 * シミュレーターのボタン（§9.10）。
 * 赤字では「記録する」ではなく**直すべき下限**を語にする ── この画面でしたいことがそれだから。
 */
export function applyPriceButtonLabel(locale: Locale, analysis: PricingAnalysis): string {
  return analysis.state === 'loss'
    ? t('pricing.applyPriceLoss', locale, { breakEven: formatYenSymbol(analysis.breakEven) })
    : t('pricing.applyPriceSafe', locale);
}

/** ボタンの下の注記（§9.10）。**サービス名は書かない** */
export function applyPriceNote(locale: Locale): string {
  return t('pricing.applyPriceNote', locale);
}

/** 書き換えの確認シート（§9.11） */
export function priceApplySheetTitle(locale: Locale): string {
  return t('pricing.applySheetTitle', locale);
}
export function priceApplyCurrentLabel(locale: Locale): string {
  return t('pricing.applyCurrent', locale);
}
export function priceApplyNextLabel(locale: Locale): string {
  return t('pricing.applyNext', locale);
}
export function priceApplyProfitLabel(locale: Locale): string {
  return t('pricing.applyProfit', locale);
}
export function priceApplyConfirmLabel(locale: Locale): string {
  return t('pricing.applyConfirm', locale);
}

/**
 * 確認シートの注意文（§9.11）。**サービス名は書かない**（「あちら」で指す）。
 * このアプリの記録だけが変わることを、押す前に読める位置に置く。
 */
export function priceApplyExternalNote(locale: Locale): string {
  return t('pricing.applyExternalNote', locale);
}

/** 「¥1,700 → ¥1,250」（確認シートの見込み利益の行。§9.11） */
export function priceChangeArrow(locale: Locale, before: string, after: string): string {
  return t('pricing.priceChangeArrow', locale, { before, after });
}

/** 書き換えたあとのバー（§9.12）。5 秒で消え、そのとき取り消しもできなくなる */
export function priceAppliedMessage(locale: Locale, price: number): string {
  return t('pricing.appliedMessage', locale, { price: formatYenSymbol(price) });
}

/** バーの取り消し（§9.12）。「元に戻す」（t('detail.undo', 'ja')）と役割は同じだが、語はモックに合わせる */
export function priceUndoLabel(locale: Locale): string {
  return t('pricing.priceUndo', locale);
}

// ---- 価格が未設定のとき（E。§9.7） ----

/** 主役の数字の代わりに出す見出し */
export function priceUnsetLeadLabel(locale: Locale): string {
  return t('pricing.priceUnsetLead', locale);
}

export function priceUnsetDescription(locale: Locale): string {
  return t('pricing.priceUnsetDescription', locale);
}

/** 価格を入れに行くボタン（記録の編集フォームを開く） */
export function priceInputButtonLabel(locale: Locale): string {
  return t('pricing.priceInputButton', locale);
}

/** 価格が無くても出せる値の節（§9.7）。**空の主役を置いたまま終わらせないための面** */
export function knownWithoutPriceTitle(locale: Locale): string {
  return t('pricing.knownWithoutPriceTitle', locale);
}
export function spentCostLabel(locale: Locale): string {
  return t('pricing.spentCost', locale);
}
export function noLossPriceLabel(locale: Locale): string {
  return t('pricing.noLossPrice', locale);
}
export function targetReachedPriceLabel(locale: Locale): string {
  return t('pricing.targetReachedPrice', locale);
}

/** 「¥3,112 以上」（下限であることを金額そのものに書く） */
export function minPriceLabel(locale: Locale, price: number): string {
  return t('pricing.minPrice', locale, { price: formatYenSymbol(price) });
}

/**
 * 上の 2〜3 行が何から出ているかの注記（§9.7）。
 * 内訳の金額を並べるのは、価格が無い記録でも**この下限だけは既に決まっている**ことを示すため。
 */
export function knownWithoutPriceNote(
  locale: Locale,
  costs: { purchasePrice: number; postage: number; packing: number },
): string {
  return t('pricing.knownWithoutPriceNote', locale, {
    purchase: formatYenSymbol(costs.purchasePrice),
    postage: formatYenSymbol(costs.postage),
    packing: formatYenSymbol(costs.packing),
  });
}

/** 不活性なシミュレーターに重ねる語（§9.7） */
export function simulatorDisabledNote(locale: Locale): string {
  return t('pricing.simulatorDisabledNote', locale);
}

// ---- 最下段の 2 行（§9.13） ----

/**
 * 費用の内訳への行（§9.13）。**行き先は記録詳細**（帯グラフ・レシートは既にあそこにある）──
 * この画面に複製すると、同じ 1 件の内訳が 2 か所で別々に育つ。
 */
export function costBreakdownRowLabel(locale: Locale): string {
  return t('pricing.costBreakdownRow', locale);
}

/**
 * 目標利益の行の右の値（§9.13）。決めてあれば「この記録だけ」を添える ──
 * アプリ全体の既定値は無い（§1.3）ので、ここで見えている額が他の記録に及ばないことを言う。
 */
export function targetProfitRowValue(locale: Locale, targetProfit: number | null): string {
  return targetProfit == null
    ? t('form.targetProfitUnset', locale)
    : t('pricing.targetRowValue', locale, { amount: formatYenSymbol(targetProfit) });
}

// ---- 目標利益を決めるシート（§9.14） ----

/** シートの見出し。語は記録フォームの欄と同じ（§5.2） */
export function targetProfitSheetTitle(locale: Locale, kind: RecordKind): string {
  // 文中に埋め込むので targetProfitInline（英語だけ小文字）を使う
  return t('pricing.targetSheetTitle', locale, {
    target: t(
      kind === 'used' ? 'record.targetProfitInline.used' : 'record.targetProfitInline.sourced',
      locale,
    ),
  });
}

/**
 * 入れた額から**その場で**出る 2 つの数字（§9.14）。
 * 決めたあとに何が変わるのかを、決める前の画面で見せるための行。
 */
export function targetPreviewPriceLabel(locale: Locale): string {
  return t('pricing.targetPreviewPrice', locale);
}
export function targetPreviewRoomLabel(locale: Locale): string {
  return t('pricing.targetPreviewRoom', locale);
}

/**
 * 目標を消す（§9.14）。**0 を入れて消す道は作らない** ──
 * 0 は「利益ゼロを目標にする」という有効な値で、消すこととは別（§1.2）。
 */
export function targetProfitClearLabel(locale: Locale): string {
  return t('pricing.targetClear', locale);
}

/**
 * 主役の数字そのもの（§9.4 / §9.5）。**赤字は「−¥550」**（マイナス記号は U+2212）。
 *
 * `formatSignedYenSymbol`（一覧の行）を使わないのは、あちらが黒字に「+」を付けるため ──
 * ここは 1 件の見込みを大きく 1 つだけ出す場所で、プラスの符号は要らない。
 */
export function pricingHeroAmount(netProfit: number): string {
  const rounded = roundForDisplay(netProfit);
  return rounded < 0 ? `−${formatYenSymbol(-rounded)}` : formatYenSymbol(rounded);
}

// ─────────────────────────────────────────────────────────────────────────
// 売却済み分析「どうだった？」。§9 の「いくらで売る？」と対になる、売れたあとの画面。
// **「分析」とは言わない**のは §9 と同じ理由（見たいのは分析ではなく結果）。
// ─────────────────────────────────────────────────────────────────────────

/** 画面のタイトル。出品中の t('pricing.title', 'ja')（「いくらで売る？」）とは別の語 */
export function soldAnalysisScreenTitle(locale: Locale): string {
  return t('pricing.soldTitle', locale);
}

/** 主役の数字の上（§9.4 と対）:「残った利益」。「見込み」ではない ── もう確定した額 */
export function remainingProfitLeadLabel(locale: Locale): string {
  return t('pricing.remainingProfitLead', locale);
}

/** 商品名の右のバッジ:「8/14 に売れました」。一覧・詳細の「売れた」バッジと違い、日付まで言う */
export function soldOnBadgeLabel(locale: Locale, saleDate: Date): string {
  return t('pricing.soldOnBadge', locale, { date: formatShortDate(locale, saleDate) });
}

/** 主役の数字の下:「販売価格 ¥5,000・利益率 34.0%」。利益率は価格 0 では出さない語だけになる */
export function soldPriceRateNote(
  locale: Locale,
  price: number,
  profitRate: number | null,
): string {
  const amount = formatYenSymbol(price);
  return profitRate == null
    ? t('pricing.soldPriceRate', locale, { price: amount })
    : t('pricing.soldPriceRateWithRate', locale, { price: amount, rate: profitRate.toFixed(1) });
}

/** 達成バッジ「目標より +¥700」。赤字で目標を割っていても符号つきでそのまま言える */
export function targetAchievementBadgeLabel(locale: Locale, diff: number): string {
  return t('pricing.targetAchievementBadge', locale, { diff: formatSignedYenSymbol(diff) });
}

/** 未達成のときの帯「目標まであと¥323でした」。**過去形** ── もう売れたあとの結果を言う語なので */
export function targetShortfallPastLabel(locale: Locale, shortfall: number): string {
  return t('pricing.targetShortfallPast', locale, { amount: formatYenSymbol(shortfall) });
}

/** 達成バーの左端「目標 ¥1,000」 */
export function soldTargetBarLabel(locale: Locale, target: number): string {
  return t('pricing.soldTargetBar', locale, { amount: formatYenSymbol(target) });
}

/** 達成バーの右端「実際 ¥1,700」 */
export function soldActualBarLabel(locale: Locale, actual: number): string {
  return t('pricing.soldActualBar', locale, { amount: formatYenSymbol(actual) });
}

/**
 * 見出しが状態で変わるセクション（目標なし / 目標あり）。
 * 目標の有無だけで分かれる ── 達成したかどうかは本文（soldSectionBody）側の語尾で言う。
 */
export function soldSectionTitle(locale: Locale, conclusion: SoldConclusion): string {
  return t(
    conclusion === 'noTarget'
      ? 'pricing.soldSectionTitleNoTarget'
      : 'pricing.soldSectionTitleTarget',
    locale,
  );
}

/**
 * 見出し下の本文。**A は「応じられた」、B は「保てました」、C は「保てませんでした」**で
 * 語尾だけが変わる（見出しは B/C で共通・A だけ別）。
 */
export function soldSectionBody(
  locale: Locale,
  conclusion: SoldConclusion,
  analysis: PricingAnalysis,
): string {
  const price = formatYenSymbol(analysis.currentPrice);
  const room = formatYenSymbol(analysis.room);

  switch (conclusion) {
    case 'noTarget':
      return t('pricing.soldBodyNoTarget', locale, {
        breakEven: formatYenSymbol(analysis.breakEven),
        price,
        room,
      });
    case 'targetMet':
      return t('pricing.soldBodyTargetMet', locale, {
        floor: formatYenSymbol(analysis.floorPrice),
        price,
        room,
      });
    case 'belowTarget':
      return t('pricing.soldBodyBelowTarget', locale, {
        floor: formatYenSymbol(analysis.floorPrice),
        price,
        shortfall: formatYenSymbol(analysis.targetShortfall ?? 0),
      });
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
  locale: Locale,
  conclusion: SoldConclusion,
  analysis: PricingAnalysis,
): string {
  switch (conclusion) {
    case 'noTarget':
      return t('conclusion.soldNoTarget', locale, { room: formatYenSymbol(analysis.room) });
    case 'targetMet':
      return t('conclusion.soldTargetMet', locale, {
        floor: formatYenSymbol(analysis.floorPrice),
      });
    case 'belowTarget':
      return t('conclusion.soldBelowTarget', locale, {
        shortfall: formatYenSymbol(analysis.targetShortfall ?? 0),
      });
  }
}

/** 結論行の 2 行目・売却済み版。もう動かせる価格が無いので「試す」ではなく「見る」だけを言う */
const SOLD_RECORD_DETAIL_CONCLUSION_KEYS = {
  noTarget: 'conclusion.soldDetailRoom',
  targetMet: 'conclusion.soldDetailRoom',
  belowTarget: 'conclusion.soldDetailShortfall',
} as const satisfies Record<SoldConclusion, TranslationKey>;

export function soldRecordDetailConclusionDetail(
  locale: Locale,
  conclusion: SoldConclusion,
): string {
  return t(SOLD_RECORD_DETAIL_CONCLUSION_KEYS[conclusion], locale);
}

// ---- 経過日数（§4.7 の 3 分岐） ----

/** 通常「13日で売れました」 */
export function soldElapsedDaysLabel(locale: Locale, days: number): string {
  return t('elapsed.soldInDays', locale, { count: days });
}

/** 0 日（記録日と同日に売れた）は割り算をしないので専用の語にする */
export function soldSameDayLabel(locale: Locale): string {
  return t('elapsed.soldSameDay', locale);
}

/** 記録日 → 販売日「8/1 に記録 → 8/14 に販売」 */
export function soldDateRangeNote(locale: Locale, saleStartDate: Date, saleDate: Date): string {
  return t('elapsed.soldDateRange', locale, {
    listed: formatShortDate(locale, saleStartDate),
    sold: formatShortDate(locale, saleDate),
  });
}

/** 1 日あたり利益「1日 約¥131」。仕入品かつ売却済みのみ出す */
export function soldPerDayProfitLabel(locale: Locale, perDay: number): string {
  return t('elapsed.perDayProfit', locale, { amount: formatApproxYenSymbol(locale, perDay) });
}

/** 1 日あたり利益の注記。不用品には出ないことをここで断る */
export function soldPerDayCaption(locale: Locale): string {
  return t('pricing.soldPerDayCaption', locale);
}

/** 日付が逆転している記録（販売日 < 記録日）に出す黄色い帯 */
export function soldDateReversedLabel(locale: Locale): string {
  return t('pricing.soldDateReversed', locale);
}

/** 逆転した日付を直す導線（記録編集フォームを開く） */
export function fixDateLabel(locale: Locale): string {
  return t('pricing.fixDate', locale);
}

// ---- 初回起動チュートリアル（オンボーディング） ----
//
// 4 ページ横スワイプ。文言は各ページの見出し・本文と、共通の操作（スキップ・はじめる）だけ。
// 図の中の題材（金額・実績のジャンル）は onboardingContent.ts が持つ。

export function onboardingSkipLabel(locale: Locale): string {
  return t('onboarding.skip', locale);
}
export function onboardingStartLabel(locale: Locale): string {
  return t('onboarding.start', locale);
}
export function onboardingPreviousPageLabel(locale: Locale): string {
  return t('onboarding.previousPage', locale);
}
export function onboardingNextPageLabel(locale: Locale): string {
  return t('onboarding.nextPage', locale);
}
export function onboardingPageIndicatorText(
  locale: Locale,
  index: number,
  total: number,
): string {
  return t('onboarding.pageIndicator', locale, { index: index + 1, total });
}

/**
 * チュートリアルの 7 枚。**3 つに割ってある注記は、核心だけ色と太さを変えて描くため**
 * （つなぐと 1 文になる）。画面側でつなぐのではなく、割ったまま渡す。
 */
export function onboardingText(locale: Locale) {
  const section = t('settings.preset.title', locale);
  return {
    calcTitle: t('onboarding.calcTitle', locale),
    calcBody: t('onboarding.calcBody', locale),
    targetTitle: t('onboarding.targetTitle', locale),
    targetBody: t('onboarding.targetBody', locale),
    recordAdded: t('onboarding.recordAdded', locale),
    saveTitle: t('onboarding.saveTitle', locale),
    saveBody: t('onboarding.saveBody', locale),
    presetTitle: t('onboarding.presetTitle', locale),
    presetBody: t('onboarding.presetBody', locale),
    simulatorTitle: t('onboarding.simulatorTitle', locale),
    simulatorBody: t('onboarding.simulatorBody', locale),
    simulatorNotePrefix: t('onboarding.simulatorNotePrefix', locale),
    simulatorNoteEmphasis: t('onboarding.simulatorNoteEmphasis', locale),
    simulatorNoteSuffix: t('onboarding.simulatorNoteSuffix', locale),
    packagingPresetTitle: t('onboarding.packagingPresetTitle', locale),
    packagingPresetPrefix: t('onboarding.packagingPresetPrefix', locale, { section }),
    packagingPresetEmphasis: t('onboarding.packagingPresetEmphasis', locale),
    packagingPresetSuffix: t('onboarding.packagingPresetSuffix', locale),
    // 3 つをつないだ 1 文（強調の描き分けが要らない場所で使う）
    packagingPresetBody:
      t('onboarding.packagingPresetPrefix', locale, { section }) +
      t('onboarding.packagingPresetEmphasis', locale) +
      t('onboarding.packagingPresetSuffix', locale),
    simulatorNote:
      t('onboarding.simulatorNotePrefix', locale) +
      t('onboarding.simulatorNoteEmphasis', locale) +
      t('onboarding.simulatorNoteSuffix', locale),
    dataTitle: t('onboarding.dataTitle', locale),
    dataBody: t('onboarding.dataBody', locale),
    achievementsTitle: t('onboarding.achievementsTitle', locale),
    achievementsBody: t('onboarding.achievementsBody', locale),
    achievementsNote: t('onboarding.achievementsNote', locale),
  };
}

/** 設定タブ「チュートリアルをもう一度見る」の行 */
export function replayTutorialLabel(locale: Locale): string {
  return t('settings.replayTutorial.label', locale);
}

// ---- 移行前の画面が参照する日本語固定の写し（多言語化ステップ 2 の途中経過） ----
//
// 計算タブの節は locale を取る関数に移したが、**まだ移していない画面が同じ語を
// 定数として参照している**。値は辞書から日本語で取るので、文が 2 か所に割れることはない。
// その画面を移した時点で、対応する行はここから消える。
export const ADD_RECORD_ACTION_LABEL = t('record.addAction', 'ja');
export const ADD_RECORD_FAB_LABEL = t('record.addFab', 'ja');
export const KEPT_SHORT_LABEL = t('amount.kept', 'ja');
export const ENVELOPE_COST_LABEL = t('amount.envelopeCost', 'ja');
export const EXPENSES_LABEL = t('amount.expenses', 'ja');
export const OTHERS_COST_LABEL = t('amount.othersCost', 'ja');
export const POSTAGE_LABEL = t('amount.postage', 'ja');
export const PURCHASE_PRICE_LABEL = t('amount.purchasePrice', 'ja');
export const SALES_PRICE_LABEL = t('amount.salesPrice', 'ja');
export const TOTAL_SALES_LABEL = t('amount.totalSales', 'ja');
export const COMMISSION_SHORT_LABEL = t('amount.commissionShort', 'ja');
export const FORMULA_TARGET_LABEL = t('amount.formulaTarget', 'ja');
export const CALC_SCREEN_TITLE = t('calc.title', 'ja');
export const TARGET_TAB_LABEL = t('calc.targetTab', 'ja');
export const REQUIRED_SALES_PRICE_LABEL = t('calc.requiredSalesPrice', 'ja');
export const CANCEL_LABEL = t('action.cancel', 'ja');
export const CLOSE_LABEL = t('action.close', 'ja');
export const DELETE_LABEL = t('action.delete', 'ja');
export const CALC_ADD_ROW_LABEL = t('calculator.addRow', 'ja');
export const CALC_PICK_PACKAGING_LABEL = t('calculator.pickPackaging', 'ja');
export const CALC_SUBMIT_LABEL = t('calculator.submit', 'ja');
export const CALC_TOTAL_LABEL = t('calculator.total', 'ja');

// ---- 記録一覧の節を移したぶんの日本語固定の写し（多言語化ステップ 2-2） ----
export const LISTING_STATUS_LABEL = t('list.listingStatus', 'ja');
export const SOLD_RECORDS_LABEL = t('list.soldRecords', 'ja');
export const UNTITLED_LABEL = t('list.untitled', 'ja');
export const SORT_SHEET_TITLE = t('list.sortSheetTitle', 'ja');
export const FILTER_LABEL = t('list.filter', 'ja');
export const ALL_PERIOD_LABEL = t('period.all', 'ja');
export const PREVIOUS_YEAR_LABEL = t('period.previousYear', 'ja');
export const NEXT_YEAR_LABEL = t('period.nextYear', 'ja');
export const TOTAL_PROFIT_LABEL = t('amount.totalProfit', 'ja');
export const LISTING_COUNT_LABEL = t('list.listingStatus', 'ja');
// 帯グラフの節を移したぶんの日本語固定の写し（多言語化ステップ 2-1 の追補）
export const KEPT_LABEL = t('amount.keptLong', 'ja');
export const COMMISSION_LABEL = t('amount.commissionFull', 'ja');

// ---- 記録フォームの節を移したぶんの日本語固定の写し（多言語化ステップ 2-3） ----
export const SAVE_LABEL = t('form.save', 'ja');
export const ITEM_NAME_LABEL = t('form.itemName', 'ja');
export const ITEM_NAME_CAPTION = t('form.itemNameCaption', 'ja');
export const ITEM_NAME_PLACEHOLDER = t('form.itemNamePlaceholder', 'ja');
export const ENVELOPE_AND_OTHERS_FIELD_LABEL = t('form.envelopeAndOthers', 'ja');
export const MEMO_LABEL = t('form.memo', 'ja');
export const UNSET_INPUT_LABEL = t('form.unsetInput', 'ja');
export const TARGET_PROFIT_UNSET_LABEL = t('form.targetProfitUnset', 'ja');
export const LISTED_DATE_FIELD_LABEL = t('form.listedDate', 'ja');
export const SOLD_DATE_FIELD_LABEL = t('form.soldDate', 'ja');
export const PHOTO_FIELD_LABEL = t('photo.field', 'ja');
export const PHOTO_IMAGE_LABEL = t('photo.image', 'ja');
export const TAG_EMPTY_TITLE = t('tag.emptyTitle', 'ja');
export const TAG_ADD_LABEL = t('tag.add', 'ja');
export const PHOTO_SQUARE_LABEL = t('photo.field', 'ja');

// ---- 詳細・絞り込みの節を移したぶんの日本語固定の写し（多言語化ステップ 2-4） ----
export const AMOUNT_PLACEHOLDER = t('detail.amountPlaceholder', 'ja');
export const DELETE_CONFIRM_TITLE = t('detail.deleteConfirmTitle', 'ja');
export const UNDO_LABEL = t('detail.undo', 'ja');
export const SOLD_BADGE_LABEL = t('detail.soldBadge', 'ja');
export const SOLD_DATE_ROW_LABEL = t('detail.soldDateRow', 'ja');
export const MARK_AS_SOLD_BUTTON_LABEL = t('detail.markAsSold', 'ja');
export const MARKED_AS_SOLD_MESSAGE = t('detail.markedAsSoldMessage', 'ja');
export const REVERT_TO_LISTING_BUTTON_LABEL = t('detail.revertToListing', 'ja');
export const REVERT_TO_LISTING_CONFIRM_LABEL = t('detail.revertToListingConfirmLabel', 'ja');
// 詳細の結論行を移したぶんの日本語固定の写し（多言語化ステップ 2-5）。
// PricingScreen（区切り 4）がまだ参照している
export const SOLD_SAME_DAY_LABEL = t('elapsed.soldSameDay', 'ja');

// ---- 値付けの節を移したぶんの日本語固定の写し（多言語化ステップ 4） ----
export const SIMULATOR_NOTE = t('pricing.simulatorNote', 'ja');
export const SIMULATOR_DISABLED_NOTE = t('pricing.simulatorDisabledNote', 'ja');
export const PRICE_APPLY_EXTERNAL_NOTE = t('pricing.applyExternalNote', 'ja');
export const TARGET_PREVIEW_ROOM_LABEL = t('pricing.targetPreviewRoom', 'ja');

// ---- データタブの節を移したぶんの日本語固定の写し（多言語化ステップ 5） ----
export const DATA_MODE_PROFIT_LABEL = t('data.modeProfit', 'ja');
export const DATA_MODE_TAG_LABEL = t('data.modeTag', 'ja');
export const DATA_MODE_ACHIEVEMENTS_LABEL = t('data.modeAchievements', 'ja');
export const DETAILS_EXPAND_LABEL = t('data.detailsExpand', 'ja');
export const DETAILS_COLLAPSE_LABEL = t('data.detailsCollapse', 'ja');
export const PROFIT_RATE_LABEL = t('data.profitRate', 'ja');
export const SOLD_COUNT_LABEL = t('data.soldCount', 'ja');
export const TAG_SECTION_LIST_MODE_LABEL = t('data.tagSectionList', 'ja');
export const TAG_SECTION_OVERLAY_MODE_LABEL = t('data.tagSectionOverlay', 'ja');
export const UNCLASSIFIED_TAG_LABEL = t('data.unclassifiedTag', 'ja');
export const CHART_UNIT_NOTE = chartUnitNote('ja');
export const CUMULATIVE_PROFIT_LABEL = cumulativeProfitLabel('ja');
export const PROFIT_TREND_LABEL = profitTrendLabel('ja');
