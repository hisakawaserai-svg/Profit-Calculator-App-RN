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

import { chartUnitFor, type ChartUnit } from '@/logic/analytics';
import type { FilterScope } from '@/logic/recordFilter';

import { repository } from './client';
import { toAnalyticsFilter } from './repository';
import type {
  AggregatedPoint,
  AnalyticsFilter,
  AnalyticsSummary,
  CareerSummary,
  MonthGroup,
  RecordListFilter,
  RecordSortType,
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

export type RecordListPage = {
  /** 絞り込み後のレコード（sortType 順のフラットな 1 本のリスト。UI-SPEC §1.2） */
  records: SaleRecord[];
  /** 固定の合計行の元になる集計。丸めなし */
  summary: CareerSummary;
  /** 条件に合う最古の月キー。null = 0 件。月バーの ◀ の無効化に使う（UI-SPEC §5-14） */
  earliestMonthKey: string | null;
  /** 記録が 1 件以上ある月キー（古い順）。期間シートの月グリッドの濃淡に使う（UI-SPEC §1.2） */
  monthsWithRecords: string[];
  /** 書き込み後に呼んで再取得する */
  refresh: () => void;
};

/** refreshToken を引数に取る理由は query() のコメントを参照 */
function queryList(
  filter: RecordListFilter,
  sortType: RecordSortType,
  summaryFilter: RecordListFilter,
  refreshToken: object,
): Omit<RecordListPage, 'refresh'> {
  void refreshToken;
  return {
    records: repository.filteredRecords(filter, sortType),
    summary: repository.careerSummary(summaryFilter),
    // 月バーが動かせる範囲は「期間を外した集合」で決まるので、月・検索を落として引く
    earliestMonthKey: repository.earliestMonthKey({
      ...summaryFilter,
      monthKey: null,
      searchText: '',
    }),
    // 月グリッドの濃淡は絞り込みを一切見ない（UI-SPEC §1.2 の派生決定）。
    // filter を渡す口を作らないことで、あとから絞り込みが混ざるのを防ぐ
    monthsWithRecords: repository.monthsWithRecords(),
  };
}

/**
 * 記録タブ（RecordListScreen）のデータ取得。UI-SPEC §1.2 / SPEC-V4 §4.5。
 *
 * @param filter        リスト本体の絞り込み（状態 / 検索 / 期間 / 種別 / 販売サイト / タグ）
 * @param sortType      レコード 1 件ずつの並び順（8 種）
 * @param summaryFilter 合計行の絞り込み。省略時は filter と同じ。
 *                      検索は「探す操作」であって「見る対象の限定」ではないので、
 *                      呼び出し側は検索を除いたものを渡す（SPEC-V2 §4.2 と同じ考え方）。
 *                      **販売サイトとタグは種別と同じ「限定」なので、こちらにも入れる**
 *                      （SPEC-V4 §4.5 の表）── 「タグ『洋服』で絞ったときの収支合計」が
 *                      タグ機能の目的そのものなので、合計行から外すと機能が成立しない。
 *                      この summaryFilter の recordCount は、絞り込みシート下部の
 *                      「この条件に合う記録 N 件」（§4.6）にもそのまま使える
 *                      （検索を除いた同じ条件なので、一覧の件数と必ず一致する）。
 */
export function useRecordList(
  filter: RecordListFilter,
  sortType: RecordSortType,
  summaryFilter: RecordListFilter = filter,
): RecordListPage {
  const [refreshToken, setRefreshToken] = useState<object>(() => ({}));
  const refresh = useCallback(() => setRefreshToken({}), []);

  // 他画面（フォーム・詳細画面）での変更を、戻ってきたタイミングで反映する
  useFocusEffect(refresh);

  const data = useMemo(
    () => queryList(filter, sortType, summaryFilter, refreshToken),
    [filter, sortType, summaryFilter, refreshToken],
  );

  return { ...data, refresh };
}

/** refreshToken を引数に取る理由は query() のコメントを参照 */
function queryCount(filter: RecordListFilter, scope: FilterScope, refreshToken: object): number {
  void refreshToken;
  // データタブは合計行と同じ 1 本から数を取る（FilterScope のコメント参照）
  return scope === 'data'
    ? repository.analyticsSummary(toAnalyticsFilter(filter)).recordCount
    : repository.countRecords(filter);
}

/**
 * 条件に合う件数だけを引く（絞り込みページの下部。§4.6）。
 *
 * 一覧そのものは引かない ── この画面が要るのは数だけで、条件を触るたびに
 * 数百件を読み直す理由がない。同期クエリで数千件規模（SPEC-V2 §8-6）なので、
 * タップごとに引いても問題にならない。
 *
 * **検索語は渡さない**（呼び出し側の責務）。下部の件数に検索を含めないのは §4.6 の決定で、
 * タグの検索欄（§4.2.2）も一覧の見え方を変えるだけでここには効かない。
 */
export function useFilteredRecordCount(filter: RecordListFilter, scope: FilterScope): number {
  const [refreshToken, setRefreshToken] = useState<object>(() => ({}));
  const refresh = useCallback(() => setRefreshToken({}), []);

  useFocusEffect(refresh);

  return useMemo(() => queryCount(filter, scope, refreshToken), [filter, scope, refreshToken]);
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

/** 記録の総件数。refreshToken を引数に取る理由は query() のコメントを参照 */
function queryTotalCount(refreshToken: object): number {
  void refreshToken;
  return repository.totalCount();
}

/**
 * 設定タブ「データ」群の「記録の件数」（UI-SPEC §1.6-4）。
 * 設定画面は記録を書き換えないので、拾うのは画面復帰（useFocusEffect）だけでよい。
 */
export function useRecordCount(): number {
  const [refreshToken, setRefreshToken] = useState<object>(() => ({}));
  const refresh = useCallback(() => setRefreshToken({}), []);

  useFocusEffect(refresh);

  return useMemo(() => queryTotalCount(refreshToken), [refreshToken]);
}

/**
 * 出品中⇔売却済みの切り替え（UI-SPEC §8.1 / §8.4）。呼び出し側で refresh すること。
 * 売れた側は saleDate（省略時は今日）、出品中に戻す側は null にして即保存する。
 * どの日を入れるかは logic/saleDate.initialSaleDate が決める（§8.5 派生決定 3）。
 */
export function setSoldStatus(id: string, isSold: boolean, saleDate?: Date): void {
  repository.setSoldStatus(id, isSold, saleDate);
}

/**
 * 売れた日だけの差し替え（UI-SPEC §8.2 の常設行）。呼び出し側で refresh すること。
 * 状態は変えないので、出品中のレコードには使わない。
 */
export function setSaleDate(id: string, saleDate: Date): void {
  repository.setSaleDate(id, saleDate);
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

export type AnalyticsData = {
  /** 期間内合計（UI-SPEC §1.5-3 の合計行）。丸めなし */
  summary: AnalyticsSummary;
  /** チャートの集計点。日付キーの昇順・丸めなし */
  series: AggregatedPoint[];
  /** 選択中の点の内訳。未選択なら空配列 */
  details: SaleRecord[];
  /** データのある最古の月キー。null = 0 件。月バーの ◀ の無効化に使う（UI-SPEC §5-14） */
  earliestMonthKey: string | null;
  /** 記録が 1 件以上ある月キー（古い順）。期間シートの月グリッドの濃淡に使う（UI-SPEC §1.2） */
  monthsWithRecords: string[];
  /**
   * 集計に使った刻み（UI-SPEC §5-5）。**画面ではなくここで決まる。**
   *
   * 全期間の刻みは対象の月数（= 最古の月から今月まで）で変わるが、その最古の月を知っているのは
   * この問い合わせ自身なので、画面が先に刻みを決めて渡すことができない（決めるには
   * earliestMonthKey が要り、earliestMonthKey を得るには問い合わせが要る）。
   * そこで earliestMonthKey を引いてから chartUnitFor に決めさせ、結果を画面へ返す。
   * 判定そのものは純粋関数（logic/analytics）に閉じたままで、ここは呼ぶだけ。
   */
  unit: ChartUnit;
};

const NO_DETAILS: SaleRecord[] = [];

/** refreshToken を引数に取る理由は query() のコメントを参照 */
function queryAnalytics(
  filter: AnalyticsFilter,
  today: Date,
  refreshToken: object,
): Omit<AnalyticsData, 'details'> {
  void refreshToken;
  // 刻みは最古の月に依存するので、集計点より先に引く（AnalyticsData.unit のコメント参照）
  const earliestMonthKey = repository.analyticsEarliestMonthKey(filter);
  const unit = chartUnitFor({ monthKey: filter.monthKey, earliestMonthKey, today });

  return {
    summary: repository.analyticsSummary(filter),
    series: repository.analyticsSeries(filter, unit),
    earliestMonthKey,
    // 記録タブと同じ盤面を出すため、こちらも絞り込みを見ない全記録で引く（UI-SPEC §1.2）
    monthsWithRecords: repository.monthsWithRecords(),
    unit,
  };
}

function queryAnalyticsDetails(
  filter: AnalyticsFilter,
  unit: ChartUnit,
  selectedKey: string | null,
  refreshToken: object,
): SaleRecord[] {
  void refreshToken;
  if (selectedKey == null) return NO_DETAILS;
  return repository.analyticsDetails(filter, unit, selectedKey);
}

/**
 * データタブ（DataScreen）のデータ取得（UI-SPEC §1.5）。
 *
 * 集計は repository の SQL 側で完結しているので、画面が受け取るのは
 * 集計済みの点と合計値だけ。レコード実体は「タップされた 1 点の内訳」しか読まない。
 *
 * 刻み（日ごと / 月ごと / 年ごと）は期間から自動で決まる（§5-5）。決めるのに最古の月が要るので
 * 引数では受け取らず、ここで決めて `unit` として返す（AnalyticsData.unit のコメント参照）。
 *
 * @param filter      集計対象（月キー + 種別）。monthKey = null で全期間、kind = null で全種別
 * @param selectedKey タップされた点のキー。null なら内訳は引かない
 * @param today       「今日」。全期間の範囲の右端で、刻みの判定にも使う
 */
export function useAnalyticsData(
  filter: AnalyticsFilter,
  selectedKey: string | null,
  today: Date,
): AnalyticsData {
  const [refreshToken, setRefreshToken] = useState<object>(() => ({}));
  const refresh = useCallback(() => setRefreshToken({}), []);

  // 他タブでの追加・編集・削除を、このタブに戻ってきたタイミングで反映する
  useFocusEffect(refresh);

  const data = useMemo(
    () => queryAnalytics(filter, today, refreshToken),
    [filter, today, refreshToken],
  );
  // 点を選び直したときに引き直すのは内訳だけなので、集計本体とはメモを分ける
  const details = useMemo(
    () => queryAnalyticsDetails(filter, data.unit, selectedKey, refreshToken),
    [filter, data.unit, selectedKey, refreshToken],
  );

  return { ...data, details };
}
