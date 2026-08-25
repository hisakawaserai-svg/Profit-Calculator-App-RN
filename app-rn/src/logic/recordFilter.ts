// 絞り込みの下書きと、そこから出る 2 つの表示（SPEC-V4 §4.1 / §4.3。SPEC-V11 で 9 条件へ）。
// 純粋関数だけを置く。
//
// **下書きに入れてよいのは、画面の外に専用の UI を持たない条件だけ**（SPEC-V11 §0.2）。
// 期間・検索・並び替えはここに入れない ── どれもシートの外に専用の UI があり、効いていることが
// 画面から直接読める（§4.1）。入れると「絞り込みを解除」がそれらまで巻き戻す口になる。
// **これが歯止めで、条件の本数ではない** ── SPEC-V4 の「3 条件ちょうどで、これ以上増やさない」は
// SPEC-V11 §9.4 で差し替えた。増える 6 本（金額 3・目標・赤字・メモ）はどれも記録そのものの値で、
// 下書き以外に置き場所がない。読む量は本数ではなく**群の数（5）**で抑える（§2）。
//
// **「絞り込み N」の N と解除バーの文言は同じ下書きから作る**（§4.3）。
// 数と語がずれないよう、数える関数と文を組む関数を 1 か所に並べて置く。
// **N は群ごとの本数の合計**として数える（SPEC-V11 §1.4）── 群の見出しに出る数と
// 青い行に並ぶ条件の数を 2 か所で別々に数えると、必ずどこかでずれる。
//
// 表示語は labels.ts 経由（SPEC-V2 §5.3）。ここでは語を持たず、並べ方だけを持つ。

import type { RecordKind, Tag } from '@/db/schema';
import type { Locale } from '@/settings/language';

import { parseNumericInput } from './input';
import { DEFAULT_KIND_FILTER, kindFilterLabel, toKindCondition, type KindFilter } from './kindFilter';
import {
  filterConditionOverflowLabel,
  filterLossPartLabel,
  filterMemoPartLabel,
  filterRangePartLabel,
  filterSitePartLabel,
  filterSiteUnsetPartLabel,
  filterSummaryLabel,
  filterTagPartLabel,
  filterTargetPartLabel,
} from './labels';

/**
 * どのタブから開いた絞り込みか（SPEC-V4 §6）。**画面は 1 つで、数える集合だけが違う。**
 *
 * 絞り込みページ（RecordFilterScreen）は記録タブ・データタブで共用する ── 条件も操作も
 * 同じなので、画面を 2 つに分けてコピーすると片方だけ直る事故が起きる。
 * 一方で**件数の数え方は必ず違う**: データタブは `isSold = true` かつ `saleDate` 非 null が
 * 固定条件（SPEC §6.2）で、記録タブの数え方には後者が入っていない。
 * 下部の件数とタグ・販売サイトの行の数字は、開いたタブの集計と同じ集合で数えないと嘘になる。
 *
 * 条件そのもの（RecordFilterDraft）はこの値で変わらない。変わるのは**数える対象**だけ。
 */
export type FilterScope = 'records' | 'data';

/** 金額の範囲を持つ 3 つ（SPEC-V11 §1.1）。並びはそのまま画面の並びになる */
export type AmountRangeKey = 'netProfit' | 'salesPrice' | 'expenses';

export const AMOUNT_RANGE_KEYS: readonly AmountRangeKey[] = ['netProfit', 'salesPrice', 'expenses'];

/** 目標の達成／未達（SPEC-V11 §1.2）。null = 問わない */
export type TargetFilter = 'met' | 'missed';

/** メモの有無（SPEC-V11 §1.2）。null = 問わない */
export type MemoFilter = 'with' | 'without';

/**
 * 金額の範囲 1 本ぶん。**数値ではなく入力欄の文字列をそのまま持つ**（SPEC-V11 §1.1）。
 *
 * 打っている途中の `"1000."` を数値に畳むと下書きが入力中の状態を表せず、
 * `0`（0 円以上）と `""`（下限なし）の区別も付かない。数値化は repository へ渡す直前で 1 回だけ
 * 行う（toFilterConditions）。**下書きと入力欄が別の state を持たない**のが要点で、
 * 「すべて解除」も群ごとの解除も、この文字列を空に戻すだけで欄まで戻る。
 */
export type AmountRange = {
  min: string;
  max: string;
};

/**
 * 絞り込みページが編集する下書き（§4.2 / SPEC-V11 §1.1）。**条件は 9 本。**
 *
 * 範囲は min / max の 2 欄を持つが、**条件としては 1 本**（タグを何個選んでも 1 本なのと同じ）。
 */
export type RecordFilterDraft = {
  /** 種別（SPEC-V2 §4.2）。'all' = 絞り込みなし */
  kind: KindFilter;
  /** 販売サイト。null = すべて / '' = 未設定（SPEC-V11 §4.2）/ その他 = その名前の完全一致 */
  siteName: string | null;
  /** タグ（2 つ以上は OR。§4.4）。空配列 = すべて */
  tagIds: string[];
  /** 純利益・販売価格・経費の範囲（SPEC-V11 §1.1）。両端とも空文字 = その条件なし */
  amounts: Record<AmountRangeKey, AmountRange>;
  /** 目標の達成／未達（SPEC-V11 §1.2）。**出品中では効かない**（§7.1） */
  targetStatus: TargetFilter | null;
  /** 赤字のみ（netProfit < 0）。**出品中でも効く**（SPEC-V11 §7.2） */
  lossOnly: boolean;
  /** メモの有無（trim 後の空判定。SPEC-V11 §1.2） */
  memoState: MemoFilter | null;
};

const EMPTY_AMOUNT_RANGE: AmountRange = { min: '', max: '' };

const EMPTY_AMOUNTS: Record<AmountRangeKey, AmountRange> = {
  netProfit: EMPTY_AMOUNT_RANGE,
  salesPrice: EMPTY_AMOUNT_RANGE,
  expenses: EMPTY_AMOUNT_RANGE,
};

/** 何も絞り込んでいない状態。「すべて解除」「解除」「絞り込みを解除」はすべてここへ戻す */
export const EMPTY_RECORD_FILTER: RecordFilterDraft = {
  kind: DEFAULT_KIND_FILTER,
  siteName: null,
  tagIds: [],
  amounts: EMPTY_AMOUNTS,
  targetStatus: null,
  lossOnly: false,
  memoState: null,
};

/**
 * 折りたたみの群（SPEC-V11 §2）。**9 本の条件を 5 つに畳む。**
 * 並びはそのまま画面の上から下の並びになる。
 */
export type FilterSectionKey = 'kind' | 'site' | 'tag' | 'amount' | 'other';

export const FILTER_SECTIONS: readonly FilterSectionKey[] = ['kind', 'site', 'tag', 'amount', 'other'];

/**
 * 「すべて解除」（§4.2-1 / §4.3 / §4.8）。**下書きの全 9 条件を初期値に戻す。**
 *
 * 期間・検索・並び替えを動かさないのは、それらがこの下書きの外にあるから ──
 * 関数がこの型しか受け取らないことで、あとから巻き込むこともできない。
 */
export function clearAll(): RecordFilterDraft {
  return EMPTY_RECORD_FILTER;
}

/**
 * その群だけを初期値へ戻す（SPEC-V11 §3）。**行き先は EMPTY_RECORD_FILTER の同じ欄**なので、
 * 群ごとの解除を全部押した状態と「すべて解除」は必ず同じ下書きになる。
 */
export function clearSection(filter: RecordFilterDraft, section: FilterSectionKey): RecordFilterDraft {
  switch (section) {
    case 'kind':
      return { ...filter, kind: EMPTY_RECORD_FILTER.kind };
    case 'site':
      return { ...filter, siteName: EMPTY_RECORD_FILTER.siteName };
    case 'tag':
      return { ...filter, tagIds: EMPTY_RECORD_FILTER.tagIds };
    case 'amount':
      return { ...filter, amounts: EMPTY_RECORD_FILTER.amounts };
    case 'other':
      return {
        ...filter,
        targetStatus: EMPTY_RECORD_FILTER.targetStatus,
        lossOnly: EMPTY_RECORD_FILTER.lossOnly,
        memoState: EMPTY_RECORD_FILTER.memoState,
      };
  }
}

/** 範囲の 1 欄を差し替える（画面から 1 文字ごとに呼ばれる） */
export function setAmountRange(
  filter: RecordFilterDraft,
  key: AmountRangeKey,
  range: AmountRange,
): RecordFilterDraft {
  return { ...filter, amounts: { ...filter.amounts, [key]: range } };
}

/** 片側でも入っていれば効いている（両端を入れても条件は 1 本。SPEC-V11 §1.4） */
function hasRange(range: AmountRange): boolean {
  return range.min.trim() !== '' || range.max.trim() !== '';
}

/**
 * 入力欄の文字列 → 境界値（SPEC-V11 §6）。**空欄はその側の境界なし**（`0` ではない）。
 *
 * `parseNumericInput('')` は 0 を返すので、空の判定を先に済ませてから渡すこと ──
 * 「0 円以上」と「下限なし」は別の条件で、取り違えると赤字の記録が黙って落ちる。
 */
function rangeBound(text: string): number | null {
  return text.trim() === '' ? null : parseNumericInput(text);
}

/**
 * 状態（売れた記録 / 出品中）を織り込んだ実際に効く条件（§4.2 / SPEC-V11 §7）。
 *
 * 出品中では**販売サイトと目標の節が画面から消える**ので、条件の側も落とす ──
 * **画面の見た目だけで落とすと、売れた記録に戻した瞬間に「見えないのに効いている」状態を作り得る。**
 * N の数え方（activeFilterCount）と解除バーの文言も、必ずこれを通した後の値で作る。
 *
 * **赤字のみは落とさない**（SPEC-V11 §7.2）── 比べる相手が利用者の決めた値ではなく 0 なので、
 * 見込み額のままでも「この価格で売れても赤字」は今日言える事実になる。
 */
export function effectiveFilter(filter: RecordFilterDraft, isSoldMode: boolean): RecordFilterDraft {
  if (isSoldMode) return filter;
  if (filter.siteName == null && filter.targetStatus == null) return filter;
  return { ...filter, siteName: null, targetStatus: null };
}

/**
 * その群で効いている条件の本数（SPEC-V11 §3。群の見出しの右に出す数でもある）。
 *
 * 金額は範囲 3 本ぶんを数えるが、**1 本の範囲は min / max を両方入れても 1**（§1.4）。
 * 状態を織り込むのは呼び出し側（effectiveFilter を通してから渡す）。
 */
export function sectionActiveCount(filter: RecordFilterDraft, section: FilterSectionKey): number {
  switch (section) {
    case 'kind':
      return filter.kind !== DEFAULT_KIND_FILTER ? 1 : 0;
    case 'site':
      return filter.siteName != null ? 1 : 0;
    case 'tag':
      return filter.tagIds.length > 0 ? 1 : 0;
    case 'amount':
      return AMOUNT_RANGE_KEYS.filter((key) => hasRange(filter.amounts[key])).length;
    case 'other':
      return (
        (filter.targetStatus != null ? 1 : 0) +
        (filter.lossOnly ? 1 : 0) +
        (filter.memoState != null ? 1 : 0)
      );
  }
}

/**
 * 「絞り込み N」の N（§4.1 / 決定 §9-2。SPEC-V11 §1.4 で最大 3 → 9）。**条件の本数**を数える。
 *
 * タグを 3 つ選んでも OR なので条件としては 1 本。金額の範囲も min / max の両方を入れて 1 本。
 * 期間と検索は含めない（この型が持っていないので、数え間違えようがない）。
 *
 * **群ごとの本数の合計として出す** ── 群の見出しの数と別々に数えると、
 * 「群の数を全部足しても青い行の条件数にならない」がいつか起きる。
 */
export function activeFilterCount(filter: RecordFilterDraft): number {
  return FILTER_SECTIONS.reduce((total, section) => total + sectionActiveCount(filter, section), 0);
}

/** 1 つでも効いているか（解除バー・空表示の出し分け。§4.3 / §4.8） */
export function hasActiveFilter(filter: RecordFilterDraft): boolean {
  return activeFilterCount(filter) > 0;
}

/**
 * 折りたたみの初期状態（SPEC-V11 §2.2）。**マウント時に一度だけ評価すること。**
 *
 * 描画のたびに評価すると、**その群の最後の 1 つを外した瞬間に節が閉じ、いま押した行が消える**
 * ── 押した結果として自分が消えるのは、取り消し方が分からなくなる最悪の形
 * （案 35b「押した行の位置を動かさない」の延長。動かすどころか消える）。
 * 画面側は `useState` の初期化関数でこれを 1 回だけ呼び、以降は開閉操作だけで動かす。
 *
 * **種別は常に開く** ── 何も効いていないときに畳まれた見出しが 5 つ並ぶだけだと、
 * ここで何ができるのかが読めない。1 つ開いていれば群の中身の形が例で分かる。
 */
export function initialSectionExpansion(
  filter: RecordFilterDraft,
  isSoldMode: boolean,
): Record<FilterSectionKey, boolean> {
  const effective = effectiveFilter(filter, isSoldMode);
  return {
    kind: true,
    site: sectionActiveCount(effective, 'site') > 0,
    tag: sectionActiveCount(effective, 'tag') > 0,
    amount: sectionActiveCount(effective, 'amount') > 0,
    other: sectionActiveCount(effective, 'other') > 0,
  };
}

/** 青い行に並べる条件の上限（SPEC-V11 §5）。これを超えたぶんは「ほか N 条件」に畳む */
const SUMMARY_PART_LIMIT = 2;

/**
 * 絞り込み中の青い行の文言（§4.3。案 34a → SPEC-V11 §5 で改訂）。効いている条件を
 * 「仕入品・タグ「洋服」の14件だけ」のように連ねる。0 件なら null（行ごと出さない）。
 *
 * **画面では文字列を連結しない**ので、語の組み立ても末尾の「の N件だけ」まで含めてここで終える。
 *
 * **9 本は 1 行に入らないので、先頭 2 つ ＋「ほか N 条件」に畳む**（SPEC-V11 §5）。
 * タグが既にやっている「先頭 ＋ 残りの数」（filterTagPartLabel / presetOverflowLabel）を
 * 条件全体にもう一段かけた形で、読み手が覚える畳み方は 1 つのまま。
 * 数える単位を「条件」にするのは、末尾の「の N件だけ」が記録の件数だから ──
 * 同じ「件」だと 2 つの数が同じものを数えているように読める。
 * **畳むのは表示の直前だけ**で、並びそのものは全部作る（数と語がずれないため。§4.3）。
 *
 * `matchCount` は**いま一覧に出ている件数**を渡す ── この文のすぐ下に並ぶのがその一覧だから。
 * シート下部の「この条件に合う記録 N 件」（§4.6）は検索語を含めない数なので、
 * 検索中は両者が食い違うが、それぞれの数がそれぞれの真下にあるものを説明している。
 *
 * 消えたタグ（§4.7）は名前が引けないので、ここに来る前に落としておくこと（pruneMissingTags）。
 */
export function filterSummaryText(
  locale: Locale,
  filter: RecordFilterDraft,
  tags: Tag[],
  matchCount: number,
): string | null {
  const parts = summaryParts(locale, filter, tags);
  if (parts.length === 0) return null;

  const shown =
    parts.length <= SUMMARY_PART_LIMIT
      ? parts
      : [
          ...parts.slice(0, SUMMARY_PART_LIMIT),
          filterConditionOverflowLabel(locale, parts.length - SUMMARY_PART_LIMIT),
        ];

  return filterSummaryLabel(locale, shown, matchCount);
}

/**
 * 青い行に並ぶ条件の語（畳む前）。**並びは絞り込みページの群の並びと同じ**にする ──
 * 画面で上から順に触ったものが、そのままの順で文になる。
 */
function summaryParts(locale: Locale, filter: RecordFilterDraft, tags: Tag[]): string[] {
  const parts: string[] = [];

  if (filter.kind !== DEFAULT_KIND_FILTER) parts.push(kindFilterLabel(locale, filter.kind));
  if (filter.siteName === '') parts.push(filterSiteUnsetPartLabel(locale));
  else if (filter.siteName != null) parts.push(filterSitePartLabel(locale, filter.siteName));

  const names = filter.tagIds
    .map((id) => tags.find((tag) => tag.id === id)?.name)
    .filter((name): name is string => name != null);
  if (names.length > 0) parts.push(filterTagPartLabel(locale, names[0], names.length - 1));

  for (const key of AMOUNT_RANGE_KEYS) {
    const range = filter.amounts[key];
    if (!hasRange(range)) continue;
    parts.push(filterRangePartLabel(locale, key, rangeBound(range.min), rangeBound(range.max)));
  }

  if (filter.targetStatus != null) parts.push(filterTargetPartLabel(locale, filter.targetStatus));
  if (filter.lossOnly) parts.push(filterLossPartLabel(locale));
  if (filter.memoState != null) parts.push(filterMemoPartLabel(locale, filter.memoState));

  return parts;
}

/**
 * 生きているタグの id だけに絞り直す（§4.7）。
 *
 * 別画面（設定タブ）でタグを消すと、tagIds に存在しない id が残り得る。EXISTS は
 * 存在しない id を単に無視するので SQL は壊れないが、**解除バーの文言と N が実体と合わなくなる**
 * （消えたタグの名前が引けない）。画面復帰時にこれを通して state から落とす。
 *
 * すべて落ちて 0 件になれば、その条件は解除された扱いになる（バーも消える）。
 * 変化がなければ**同じ参照を返す** ── 画面が毎回 setState して引き直すのを防ぐため。
 *
 * **販売サイトには同じ手当てをしない**（SPEC-V11 §4.3）── 条件が名前そのものなので、
 * プリセットや記録から消えても文言は組める。候補の側に選択中の名前を足して解く。
 */
export function pruneMissingTags(filter: RecordFilterDraft, tags: Tag[]): RecordFilterDraft {
  const alive = filter.tagIds.filter((id) => tags.some((tag) => tag.id === id));
  return alive.length === filter.tagIds.length ? filter : { ...filter, tagIds: alive };
}

/**
 * 販売サイトの候補（SPEC-V11 §4.3）。**記録に実在する名前とプリセットの名前を合併する。**
 *
 * 記録の側だけだと、登録したばかりのプリセットが候補に出ない ── 利用者にとっては既に
 * 存在する名前なので、まだ 1 件も売れていないことは候補から消す理由にならない（件数 0 と出せばよい）。
 *
 * **選択中の名前は必ず含める。** プリセットを消しても記録から名前が消えても条件は残るので、
 * 候補から落ちると**効いているのに画面から選択が消え、外す口もなくなる**。
 *
 * '' （未設定。§4.2）は名前ではないので**ここには入れない** ── 画面が並びの末尾に置く。
 */
export function siteNameOptions(
  recordNames: readonly string[],
  presetNames: readonly string[],
  selected: string | null,
): string[] {
  const names = new Set<string>();
  for (const name of [...recordNames, ...presetNames]) {
    if (name !== '') names.add(name);
  }
  if (selected != null && selected !== '') names.add(selected);
  return [...names].sort();
}

/**
 * repository の RecordListFilter / AnalyticsFilter へ渡す形（§4.5 / SPEC-V11 §8）。
 *
 * 'all' → null の読み替えは kindFilter.ts が持つ（種別の選択値の作法はあちらの責務）。
 * 販売サイトと目標は isSoldMode を織り込んだ後の値を渡す（effectiveFilter）。
 *
 * **1 つのオブジェクトにまとめて返す。** 呼び出し側は `{ isSoldMode, period, searchText,
 * ...conditions }` と展開するだけにする ── 9 本を 1 つずつ分解して組み直す形にすると、
 * 条件を足すたびに 3 つの画面を直すことになり、1 つ忘れるとその画面だけ条件が効かない。
 */
export type RecordFilterConditions = {
  kind: RecordKind | null;
  siteName: string | null;
  tagIds: string[];
  netProfitMin: number | null;
  netProfitMax: number | null;
  salesPriceMin: number | null;
  salesPriceMax: number | null;
  expensesMin: number | null;
  expensesMax: number | null;
  targetStatus: TargetFilter | null;
  lossOnly: boolean;
  memoState: MemoFilter | null;
};

export function toFilterConditions(
  filter: RecordFilterDraft,
  isSoldMode: boolean,
): RecordFilterConditions {
  const effective = effectiveFilter(filter, isSoldMode);
  return {
    kind: toKindCondition(effective.kind),
    siteName: effective.siteName,
    tagIds: effective.tagIds,
    netProfitMin: rangeBound(effective.amounts.netProfit.min),
    netProfitMax: rangeBound(effective.amounts.netProfit.max),
    salesPriceMin: rangeBound(effective.amounts.salesPrice.min),
    salesPriceMax: rangeBound(effective.amounts.salesPrice.max),
    expensesMin: rangeBound(effective.amounts.expenses.min),
    expensesMax: rangeBound(effective.amounts.expenses.max),
    targetStatus: effective.targetStatus,
    lossOnly: effective.lossOnly,
    memoState: effective.memoState,
  };
}
