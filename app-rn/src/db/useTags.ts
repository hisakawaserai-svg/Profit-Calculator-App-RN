// タグ（SPEC-V4 §1）を画面から触る入口。usePresets.ts と同じ形にしてある。
//
// - drizzle のクエリビルダは import せず、tagRepository の関数しか呼ばない
// - repository は同期 API なので、条件が変わったら useMemo で引き直すだけ
// - 書き込みの後は refresh()、他画面での変更は useFocusEffect（画面復帰時）で拾う

import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';

import type { FilterScope } from '@/logic/recordFilter';

import { repository, tagRepository } from './client';
import { toAnalyticsFilter, type RecordListFilter } from './repository';
import type { Tag } from './schema';
import type { TagInput } from './tags';

export type TagListData = {
  /** 全件（sortOrder 昇順。§1.5） */
  tags: Tag[];
  /**
   * tagId -> 使用件数（§3.3）。**0 件のタグはキーごと現れない**ので `?? 0` すること。
   * 一覧（§2.2）と選択シート（§3.2）で同じ数字を出すため、同じ 1 本から作る。
   */
  counts: Map<string, number>;
  /** 書き込み後に呼んで再取得する */
  refresh: () => void;
};

/**
 * refreshToken を引数に取る理由は useRecords.ts の query() のコメントを参照
 * （React Compiler が useMemo の依存を自前で推論するため、関数の引数にして依存を明示する）。
 */
function queryList(refreshToken: object): Omit<TagListData, 'refresh'> {
  void refreshToken;
  return { tags: tagRepository.listAll(), counts: tagRepository.countsByTag() };
}

/**
 * 一覧画面（§2.2）と選択シート（§3.2）・絞り込みシート（§4.2）が使うデータ取得。
 * 種類の引数がないのは、タグが 1 種類しかないため（プリセットの type に当たるものがない）。
 *
 * 件数も同時に返すのは、タグを出す画面が必ず件数も出すから（§2.2 / §3.2）。
 * 別のフックに分けると、同じ画面で 2 回 useFocusEffect が走る。
 */
export function useTagList(): TagListData {
  const [refreshToken, setRefreshToken] = useState<object>(() => ({}));
  const refresh = useCallback(() => setRefreshToken({}), []);

  // 設定画面で編集して戻ってきたときに反映する
  useFocusEffect(refresh);

  const { tags, counts } = useMemo(() => queryList(refreshToken), [refreshToken]);

  return { tags, counts, refresh };
}

/** 一覧の行に出すタグ（§2.3）。refreshToken の理由は queryList と同じ */
function queryRecordTags(recordIds: readonly string[], refreshToken: object): Map<string, Tag[]> {
  void refreshToken;
  return tagRepository.tagsByRecord(recordIds);
}

/**
 * 一覧に並んでいる記録ぶんのタグをまとめて引く（設計案 30b で行にタグを出したため）。
 *
 * **記録の一覧が変わったときだけ引き直す。** 依存に配列そのものを置くと毎描画で別物になるので、
 * id を連結した文字列を鍵にする ── 並べ替え・絞り込み・月送りはどれも id の並びを変えるので、
 * これで取りこぼしなく追随する。
 *
 * 戻り値は recordId -> タグ（sortOrder 昇順）。**1 件も付いていない記録はキーごと現れない**
 * ので、呼び出し側で `?? []` すること（tagsByRecord と同じ約束）。
 */
export function useRecordTags(recordIds: readonly string[]): Map<string, Tag[]> {
  const [refreshToken, setRefreshToken] = useState<object>(() => ({}));
  const refresh = useCallback(() => setRefreshToken({}), []);

  // 記録の編集でタグが付け替わっていることがあるので、画面復帰でも引き直す
  useFocusEffect(refresh);

  const key = recordIds.join(',');

  return useMemo(() => queryRecordTags(key === '' ? [] : key.split(','), refreshToken), [
    key,
    refreshToken,
  ]);
}

/** 設定タブのカードに出す登録件数（§2.1）。refreshToken の理由は queryList と同じ */
function queryCount(refreshToken: object): number {
  void refreshToken;
  return tagRepository.count();
}

/** 設定タブ「記録を分類する」の 1 枚ぶんの件数（§2.1） */
export function useTagCount(): number {
  const [refreshToken, setRefreshToken] = useState<object>(() => ({}));
  const refresh = useCallback(() => setRefreshToken({}), []);

  useFocusEffect(refresh);

  return useMemo(() => queryCount(refreshToken), [refreshToken]);
}

/**
 * 編集シートが開く 1 件（§2.3）。id が無ければ「追加」なので null。
 *
 * usePreset と同じく useFocusEffect で引き直さない ── 画面は開いた時点の値を
 * 入力欄の初期値に写すだけで、以降は入力中の state が正になるため。
 */
export function useTag(id: string | undefined): Tag | null {
  return useMemo(() => (id == null ? null : (tagRepository.getById(id) ?? null)), [id]);
}

/** refreshToken の理由は queryList と同じ */
function queryRecordTagIds(recordId: string | undefined, refreshToken: object): string[] {
  void refreshToken;
  return recordId == null ? [] : tagRepository.tagIdsByRecord(recordId);
}

/**
 * ある記録に付いているタグの id（sortOrder 昇順。id が無ければ空配列）。
 *
 * 2 か所から使う（§3.1 / §3.4）:
 * - 記録フォームの初期値 ── 開いた時点の値を state に写すだけなので refresh は使わない
 * - レコード詳細のタグの節 ── **フォームを保存した直後に呼び出し側が refresh する**。
 *   詳細画面の上にフォームがモーダルで乗るので画面の焦点は動かず、
 *   useFocusEffect（他画面から戻ったとき）だけでは書き換わったタグを拾えない。
 */
export function useRecordTagIds(recordId: string | undefined): {
  tagIds: string[];
  refresh: () => void;
} {
  const [refreshToken, setRefreshToken] = useState<object>(() => ({}));
  const refresh = useCallback(() => setRefreshToken({}), []);

  useFocusEffect(refresh);

  const tagIds = useMemo(
    () => queryRecordTagIds(recordId, refreshToken),
    [recordId, refreshToken],
  );

  return { tagIds, refresh };
}

/**
 * 編集シート・選択シートの検索欄からの追加（§2.3 / §3.2）。
 * 色は呼び出し側が nextTagColor（§1.2）で決めて渡す ── 色の規則は純粋関数の側にある。
 * sortOrder は末尾に採番される。呼び出し側で refresh すること。
 */
export function createTag(input: TagInput): Tag {
  return tagRepository.create(input);
}

/** 編集シートからの更新（§2.3）。呼び出し側で refresh すること */
export function updateTag(id: string, input: TagInput): void {
  tagRepository.update(id, input);
}

/**
 * 削除（§2.2 のスワイプ削除）。**中間行も一緒に消える**（§1.4）。
 *
 * 返り値は UndoBar がそのまま restoreTag に渡すためのもの ── 本体だけ戻すと、
 * 付いていた記録から静かに剥がれたままになる。既に消えていれば null。
 * 呼び出し側で refresh すること。
 */
export function removeTag(id: string): { tag: Tag; recordIds: string[] } | null {
  return tagRepository.remove(id);
}

/** 削除の取り消し（§2.2）。本体と中間行の両方を書き戻す。呼び出し側で refresh すること */
export function restoreTag(tag: Tag, recordIds: readonly string[]): void {
  tagRepository.restore(tag, recordIds);
}

/**
 * 絞り込みシートの販売サイトの候補（§4.2）。
 * プリセットの一覧ではなく、**記録に実在する名前**なので tagRepository 側にある。
 */
export function useSiteNames(): string[] {
  const [refreshToken, setRefreshToken] = useState<object>(() => ({}));
  const refresh = useCallback(() => setRefreshToken({}), []);

  useFocusEffect(refresh);

  return useMemo(() => querySiteNames(refreshToken), [refreshToken]);
}

/** refreshToken の理由は queryList と同じ */
function querySiteNames(refreshToken: object): string[] {
  void refreshToken;
  return tagRepository.siteNames();
}

/** refreshToken の理由は queryList と同じ */
function queryCountsForFilter(
  filter: RecordListFilter,
  scope: FilterScope,
  refreshToken: object,
): Map<string, number> {
  void refreshToken;
  // 数える集合は開いたタブの集計に合わせる（FilterScope / analyticsCountsByTagForFilter 参照）
  return scope === 'data'
    ? repository.analyticsCountsByTagForFilter(toAnalyticsFilter(filter))
    : repository.countsByTagForFilter(filter);
}

/**
 * 絞り込み画面のタグの使用件数（§4.2.1 / §2.2 の例外）。
 * **選択中のタグ以外のすべての条件で絞った件数**（状態・期間・種別・販売サイト）。
 *
 * `useTagList` の `counts`（全記録）と使い分ける ── あちらは設定画面と記録フォームの
 * 「どのタグが生きているか」用。ここの数字は**「押したら何件出るか」の予告**なので、
 * 下部の件数と同じ集合で数える（理由は repository.countsByTagForFilter を参照）。
 *
 * **tagIds を外すのは repository 側の責務**なので、呼び出し側は下部の件数に渡すのと
 * 同じ filter をそのまま渡してよい（2 か所で条件を組み立てないための分担）。
 *
 * `scope` は**どのタブから開いた絞り込みか**（§6）。データタブは isSold / saleDate 非 null が
 * 固定条件なので、数える集合そのものが変わる ── 下部の件数（useFilteredRecordCount）に
 * 渡す scope と必ず同じものを渡すこと。片方だけ違うと、行の数字と下部の数が食い違う。
 */
export function useTagCountsForFilter(
  filter: RecordListFilter,
  scope: FilterScope,
): Map<string, number> {
  const [refreshToken, setRefreshToken] = useState<object>(() => ({}));
  const refresh = useCallback(() => setRefreshToken({}), []);

  useFocusEffect(refresh);

  return useMemo(
    () => queryCountsForFilter(filter, scope, refreshToken),
    [filter, scope, refreshToken],
  );
}
