// 画面から DB を触る唯一の入口。
// SPEC の「データ取得は repository のみ」を守るため、ここでも repository の関数しか呼ばない
// （drizzle のクエリビルダは import しない）。
//
// repository は同期 API（expo-sqlite の sync ドライバ）なので、
// フィルタが変わったら useMemo で引き直すだけでよい。
// 追加・削除など書き込みの後は refresh() を呼び、
// 他画面での変更は useFocusEffect（画面復帰時）で拾う。

import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';

import { repository } from './client';
import type {
  CareerSummary,
  MonthGroup,
  RecordListFilter,
  SaveRecordInput,
  SortTypeMonthly,
} from './repository';
import type { SaleRecord } from './schema';

export type RecordListData = {
  /** 月グループ（sortType 順）。SPEC §6.1 の集計値は丸めなしで入っている */
  groups: MonthGroup[];
  /** 画面下部の累計（SPEC §6.1 CareerSummarySection）。丸めなし */
  summary: CareerSummary;
  /** 書き込み後に呼んで再取得する */
  refresh: () => void;
};

/**
 * repository から一画面ぶんのデータを引く。
 *
 * `refreshToken` は値としては使わないが、これを引数に取ることで
 * 「トークンが変わったら引き直す」ことを useMemo にも React Compiler にも明示する。
 *
 * ここを関数に切り出すのは必須。React Compiler は useMemo の依存配列を無視して
 * 自前で依存を推論するため、useMemo のコールバック内に `void refreshToken` と
 * 書くだけでは「結果に影響しない」と判断されて依存から外され、
 * refresh() を呼んでも再取得されなくなる（実際にそのバグを踏んだ）。
 * 関数の引数にしておけば呼び出しの入力として必ず依存に含まれる。
 */
function query(
  filter: RecordListFilter,
  sortType: SortTypeMonthly,
  summaryFilter: RecordListFilter,
  refreshToken: object,
): Omit<RecordListData, 'refresh'> {
  void refreshToken;
  return {
    groups: repository.filteredAndGrouped(filter, sortType),
    summary: repository.careerSummary(summaryFilter),
  };
}

/**
 * 一覧画面（MonthlyRecordList）と月別詳細（SaleRecordView）が共通で使うデータ取得。
 *
 * @param filter        リスト本体の絞り込み（isSold / 検索 / 月）
 * @param sortType      月グループ同士の並び順（SPEC §4.1 SortTypeMonthly）
 * @param summaryFilter 下部累計の絞り込み。省略時は filter と同じ。
 *                      月別詳細では「検索を除いた月のみ」で集計するため別に渡す
 *                      （Swift 版 CareerSummarySection(targetMonth:) と同じ範囲）
 */
export function useRecordListData(
  filter: RecordListFilter,
  sortType: SortTypeMonthly,
  summaryFilter: RecordListFilter = filter,
): RecordListData {
  const [refreshToken, setRefreshToken] = useState<object>(() => ({}));
  const refresh = useCallback(() => setRefreshToken({}), []);

  // 他画面（＋ボタン・詳細画面）での変更を、戻ってきたタイミングで反映する
  useFocusEffect(refresh);

  const data = useMemo(
    () => query(filter, sortType, summaryFilter, refreshToken),
    [filter, sortType, summaryFilter, refreshToken],
  );

  return { ...data, refresh };
}

export type RecordData = {
  /** 対象のレコード。削除済み・不正な id のときは undefined */
  record: SaleRecord | undefined;
  /** 書き込み後に呼んで再取得する */
  refresh: () => void;
};

/** レコード 1 件を引く。refreshToken を引数に取る理由は query() のコメントを参照 */
function queryRecord(id: string, refreshToken: object): SaleRecord | undefined {
  void refreshToken;
  return repository.getById(id);
}

/**
 * レコード 1 件の取得（詳細画面 SaleRecordDetailScreen 用）。
 *
 * 売却トグル・編集フォームでの書き込みの直後は refresh() で引き直す。
 * 削除されていれば undefined を返すので、呼び出し側はそれを見て画面を閉じる。
 */
export function useRecord(id: string): RecordData {
  const [refreshToken, setRefreshToken] = useState<object>(() => ({}));
  const refresh = useCallback(() => setRefreshToken({}), []);

  // 他画面での変更を、戻ってきたタイミングで反映する
  useFocusEffect(refresh);

  const record = useMemo(() => queryRecord(id, refreshToken), [id, refreshToken]);

  return { record, refresh };
}

/**
 * 出品中⇔売却済みの切り替え（SPEC §3.2 SaleStatusToggleCard）。呼び出し側で refresh すること。
 * ON なら saleDate = 今日、OFF なら null にして即保存する（正規化は repository の責務）。
 */
export function setSoldStatus(id: string, isSold: boolean): void {
  repository.setSoldStatus(id, isSold);
}

/**
 * フォーム（RecordFormSheet）からの保存。呼び出し側で refresh すること。
 *
 * 決定 §7-7 のとおり、レコードが作られるのはこの保存の瞬間だけ（フォームを開いた時点では書き込まない）。
 * id が null なら新規作成、あれば更新。saleDate の正規化は repository が行う（SPEC §5.2）。
 */
export function saveRecord(id: string | null, input: SaveRecordInput): void {
  if (id == null) repository.create(input);
  else repository.update(id, input);
}

/** レコード 1 件の削除（SPEC §5.4: 確認なしで即削除）。呼び出し側で refresh すること */
export function deleteRecord(id: string): void {
  repository.remove(id);
}
