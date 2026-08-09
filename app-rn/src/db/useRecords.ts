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
  SortTypeMonthly,
} from './repository';

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

/** レコード 1 件の削除（SPEC §5.4: 確認なしで即削除）。呼び出し側で refresh すること */
export function deleteRecord(id: string): void {
  repository.remove(id);
}
