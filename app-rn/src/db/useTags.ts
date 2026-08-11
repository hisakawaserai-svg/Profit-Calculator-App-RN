// タグ（SPEC-V4 §1）を画面から触る入口。usePresets.ts と同じ形にしてある。
//
// - drizzle のクエリビルダは import せず、tagRepository の関数しか呼ばない
// - repository は同期 API なので、条件が変わったら useMemo で引き直すだけ
// - 書き込みの後は refresh()、他画面での変更は useFocusEffect（画面復帰時）で拾う

import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';

import { tagRepository } from './client';
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
