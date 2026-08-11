// 絞り込みの下書きと、そこから出る 2 つの表示（SPEC-V4 §4.1 / §4.3）。純粋関数だけを置く。
//
// 画面が持つのは「種別・販売サイト・タグ」の 3 条件だけ（決定 §9-9: 画面ローカルの state。
// 永続化せず、記録タブとデータタブでも共有しない）。期間・検索・並び替えはここに入れない ──
// どれもシートの外に専用の UI があり、効いていることが画面から直接読める（§4.1）。
//
// **「絞り込み N」の N と解除バーの文言は同じ下書きから作る**（§4.3）。
// 数と語がずれないよう、数える関数と文を組む関数を 1 か所に並べて置く。
//
// 表示語は labels.ts 経由（SPEC-V2 §5.3）。ここでは語を持たず、並べ方だけを持つ。

import type { Tag } from '@/db/schema';

import { DEFAULT_KIND_FILTER, kindFilterLabel, toKindCondition, type KindFilter } from './kindFilter';
import { filterSitePartLabel, filterSummaryLabel, filterTagPartLabel } from './labels';

/** 絞り込みシートが編集する下書き（§4.2）。3 条件ちょうどで、これ以上増やさない */
export type RecordFilterDraft = {
  /** 種別（SPEC-V2 §4.2）。'all' = 絞り込みなし */
  kind: KindFilter;
  /** 販売サイト名の完全一致。null = すべて */
  siteName: string | null;
  /** タグ（2 つ以上は OR。§4.4）。空配列 = すべて */
  tagIds: string[];
};

/** 何も絞り込んでいない状態。「すべて解除」「解除」「絞り込みを解除」はすべてここへ戻す */
export const EMPTY_RECORD_FILTER: RecordFilterDraft = {
  kind: DEFAULT_KIND_FILTER,
  siteName: null,
  tagIds: [],
};

/**
 * 「すべて解除」（§4.2-1 / §4.3 / §4.8）。**種別・販売サイト・タグの 3 つだけを初期値に戻す。**
 *
 * 期間・検索・並び替えを動かさないのは、それらがこの下書きの外にあるから ──
 * 関数がこの型しか受け取らないことで、あとから巻き込むこともできない。
 */
export function clearAll(): RecordFilterDraft {
  return EMPTY_RECORD_FILTER;
}

/**
 * 状態（売れた記録 / 出品中）を織り込んだ実際に効く条件（§4.2）。
 *
 * 出品中では販売サイトの節が画面から消えるので、条件の側も落とす ──
 * **画面の見た目だけで落とすと、売れた記録に戻した瞬間に「見えないのに効いている」状態を作り得る。**
 * N の数え方（activeFilterCount）と解除バーの文言も、必ずこれを通した後の値で作る。
 */
export function effectiveFilter(filter: RecordFilterDraft, isSoldMode: boolean): RecordFilterDraft {
  if (isSoldMode || filter.siteName == null) return filter;
  return { ...filter, siteName: null };
}

/**
 * 「絞り込み N」の N（§4.1 / 決定 §9-2）。**条件の本数**を数える（最大 3）。
 *
 * タグを 3 つ選んでも OR なので条件としては 1 本。
 * 期間と検索は含めない（この型が持っていないので、数え間違えようがない）。
 */
export function activeFilterCount(filter: RecordFilterDraft): number {
  let count = 0;
  if (filter.kind !== DEFAULT_KIND_FILTER) count += 1;
  if (filter.siteName != null) count += 1;
  if (filter.tagIds.length > 0) count += 1;
  return count;
}

/** 1 つでも効いているか（解除バー・空表示の出し分け。§4.3 / §4.8） */
export function hasActiveFilter(filter: RecordFilterDraft): boolean {
  return activeFilterCount(filter) > 0;
}

/**
 * 解除バーの文言（§4.3）。効いている条件を「仕入品・タグ「洋服」で絞り込み中」のように連ねる。
 * 0 件なら null（バーごと出さない）。
 *
 * **画面では文字列を連結しない**ので、語の組み立ても「で絞り込み中」まで含めてここで終える。
 * 並ぶ数は activeFilterCount と必ず一致する（同じ 3 条件を同じ順に見るため）。
 *
 * タグが 2 つ以上のときは「タグ「洋服」ほか1件」と畳む ── 全部並べると 1 行に収まらない。
 * 消えたタグ（§4.7）は名前が引けないので、ここに来る前に落としておくこと（pruneMissingTags）。
 */
export function filterSummaryText(filter: RecordFilterDraft, tags: Tag[]): string | null {
  const parts: string[] = [];
  if (filter.kind !== DEFAULT_KIND_FILTER) parts.push(kindFilterLabel(filter.kind));
  if (filter.siteName != null) parts.push(filterSitePartLabel(filter.siteName));

  const names = filter.tagIds
    .map((id) => tags.find((tag) => tag.id === id)?.name)
    .filter((name): name is string => name != null);
  if (names.length > 0) parts.push(filterTagPartLabel(names[0], names.length - 1));

  return parts.length === 0 ? null : filterSummaryLabel(parts);
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
 */
export function pruneMissingTags(filter: RecordFilterDraft, tags: Tag[]): RecordFilterDraft {
  const alive = filter.tagIds.filter((id) => tags.some((tag) => tag.id === id));
  return alive.length === filter.tagIds.length ? filter : { ...filter, tagIds: alive };
}

/**
 * repository の RecordListFilter へ渡す形（§4.5）。
 *
 * 'all' → null の読み替えは kindFilter.ts が持つ（種別の選択値の作法はあちらの責務）。
 * 販売サイトは isSoldMode を織り込んだ後の値を渡す（effectiveFilter）。
 */
export function toFilterConditions(
  filter: RecordFilterDraft,
  isSoldMode: boolean,
): { kind: ReturnType<typeof toKindCondition>; siteName: string | null; tagIds: string[] } {
  const effective = effectiveFilter(filter, isSoldMode);
  return {
    kind: toKindCondition(effective.kind),
    siteName: effective.siteName,
    tagIds: effective.tagIds,
  };
}
