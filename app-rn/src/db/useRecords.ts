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

import {
  computePersonalBests,
  evaluateAchievements,
  newlyCompletedAchievements,
  selectNextAchievement,
  type Achievement,
  type AchievementListingRecord,
  type AchievementSaleRecord,
  type NextAchievement,
  type PersonalBests,
} from '@/logic/achievements';
import { chartUnitFor, type ChartUnit } from '@/logic/analytics';
import {
  periodComparisonMetrics,
  periodComparisonQuery,
  type PeriodComparisonMetrics,
} from '@/logic/periodComparison';
import { periodAverageSaleDays } from '@/logic/profit';
import type { FilterScope } from '@/logic/recordFilter';

import { repository, tagRepository } from './client';
import { fromDbDate } from './dates';
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
  TagProfitStat,
  TagSeriesPoint,
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
      period: null,
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

/** refreshToken を引数に取る理由は query() のコメントを参照 */
function queryMonthsWithRecords(refreshToken: object): string[] {
  void refreshToken;
  return repository.monthsWithRecords();
}

/**
 * 記録が 1 件以上ある月キー（古い順）だけを引く（期間シートの月グリッドの濃淡。UI-SPEC §1.2）。
 *
 * 一覧やグラフを持たない画面（書き出しシート。SPEC-V3 §5.7）が期間の盤面を出すために使う。
 * 記録タブ・データタブは自分のデータ取得（useRecordList / useAnalyticsData）に含めて引くので、
 * こちらは呼ばない ── 同じ画面で 2 回引かないため。
 */
export function useMonthsWithRecords(): string[] {
  const [refreshToken, setRefreshToken] = useState<object>(() => ({}));
  const refresh = useCallback(() => setRefreshToken({}), []);

  useFocusEffect(refresh);

  return useMemo(() => queryMonthsWithRecords(refreshToken), [refreshToken]);
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

/** 複製元の候補。refreshToken を引数に取る理由は query() のコメントを参照 */
function queryDuplicateSources(
  searchText: string,
  tagIds: readonly string[],
  limit: number | undefined,
  refreshToken: object,
): SaleRecord[] {
  void refreshToken;
  return repository.duplicateSources({ searchText, tagIds }, limit);
}

/**
 * 「過去の記録から複製」の複製元の候補（DuplicateSourceScreen）。
 *
 * 売却済み・出品中の両方が出品日の新しい順で返る（repository.duplicateSources）。
 * 検索語とタグは呼び出し側の state で、打つたびに引き直す ── 同期クエリなので
 * 記録タブの検索（useRecordList）と同じ扱いでよい。
 *
 * @param limit 「最近の記録」の上限。undefined = 全件（「すべての記録を見る」）
 */
export function useDuplicateSources(
  searchText: string,
  tagIds: readonly string[],
  limit: number | undefined,
): SaleRecord[] {
  const [refreshToken, setRefreshToken] = useState<object>(() => ({}));
  const refresh = useCallback(() => setRefreshToken({}), []);

  // 複製元を選ぶ間に記録が増減する経路は無いが、フォームで保存して戻ったときのために
  // 画面復帰では引き直す（他のフックと同じ扱い）
  useFocusEffect(refresh);

  // 配列をそのまま依存に置くと毎描画で作り直されるので、キーは文字列にして比べる
  const tagKey = tagIds.join(',');

  return useMemo(
    () => queryDuplicateSources(searchText, tagKey === '' ? [] : tagKey.split(','), limit, refreshToken),
    [searchText, tagKey, limit, refreshToken],
  );
}

/** 記録の総件数。refreshToken を引数に取る理由は query() のコメントを参照 */
function queryTotalCount(refreshToken: object): number {
  void refreshToken;
  return repository.totalCount();
}

/**
 * 設定タブ「データ」群の「記録の件数」（UI-SPEC §1.6-4）。
 * 設定画面は記録を書き換えないので、拾うのは画面復帰（useFocusEffect）だけでよい。
 *
 * **`refresh` も返す**のは usePresets / useTags と同じ形に揃えるため ── 画面に居たまま
 * 記録が増減する経路（開発用のテストデータ投入）から明示的に引き直せるようにしてある。
 */
export function useRecordCount(): { count: number; refresh: () => void } {
  const [refreshToken, setRefreshToken] = useState<object>(() => ({}));
  const refresh = useCallback(() => setRefreshToken({}), []);

  useFocusEffect(refresh);

  const count = useMemo(() => queryTotalCount(refreshToken), [refreshToken]);

  return { count, refresh };
}

/**
 * 出品中⇔売却済みの切り替え（UI-SPEC §8.1 / §8.4）。呼び出し側で refresh すること。
 * 売れた側は saleDate（省略時は今日）、出品中に戻す側は null にして即保存する。
 * どの日を入れるかは logic/saleDate.initialSaleDate が決める（§8.5 派生決定 3）。
 *
 * **saveRecord と同じく、保存前後で実績判定を挟み新規に完了した実績を返す。**
 * 実績は「売却済み記録」を対象にした判定が大半（saveRecord のコメント参照）なので、
 * 出品中 → 売れたへの切り替え（SaleRecordDetailScreen.handleMarkSold）はフォーム保存を
 * 経由せずに実績を達成しうる唯一の経路 ── ここで検出しないと実績獲得トーストが
 * 一切出ない記録の作り方ができてしまう（ユーザー報告により追加）。
 * 逆方向（売れた → 出品中）は達成が減ることはあっても増えることはないので、
 * newlyCompletedAchievements は自然に空配列を返す（呼び出し側は無視してよい）。
 */
export function setSoldStatus(id: string, isSold: boolean, saleDate?: Date): Achievement[] {
  const before = fetchAchievements();
  repository.setSoldStatus(id, isSold, saleDate);
  const after = fetchAchievements();
  return newlyCompletedAchievements(before, after);
}

/**
 * 売れた日だけの差し替え（UI-SPEC §8.2 の常設行）。呼び出し側で refresh すること。
 * 状態は変えないので、出品中のレコードには使わない。
 */
export function setSaleDate(id: string, saleDate: Date): void {
  repository.setSaleDate(id, saleDate);
}

/**
 * 販売価格だけの差し替え（SPEC-V9 §9.11）。呼び出し側で refresh すること。
 * 「いくらで売る？」のシミュレーターから記録に書き戻す経路で、取り消し（元の価格に戻す）も
 * 同じ関数を通る ── 戻す先の価格は画面が覚えている。
 */
export function setSalesPrice(id: string, salesPrice: number): void {
  repository.setSalesPrice(id, salesPrice);
}

/**
 * 目標利益だけの差し替え（SPEC-V9 §9.14）。呼び出し側で refresh すること。
 * **null = 目標を消す**（0 とは別。§1.2）。書き先は記録フォームの目標欄と同じ列。
 */
export function setTargetProfit(id: string, targetProfit: number | null): void {
  repository.setTargetProfit(id, targetProfit);
}

/**
 * フォーム（RecordFormSheet）からの保存。呼び出し側で refresh すること。
 *
 * 決定 §7-7 のとおり、レコードが作られるのはこの保存の瞬間だけ（フォームを開いた時点では書き込まない）。
 * id が null なら新規作成、あれば更新。saleDate の正規化は repository が行う（SPEC §5.2）。
 *
 * **保存の前後で実績判定（fetchAchievements）を挟み、新規に完了した実績を返す**
 * （実績獲得トースト。呼び出し側の RecordFormSheet が achievementToastBus 経由でトーストを出す）。
 * 判定ロジック自体は logic 層（newlyCompletedAchievements）のまま、ここは前後で呼んで
 * 比べるだけ ── repository（DB 操作）には実績判定を混ぜ込まない。
 *
 * パフォーマンス上の注意: fetchAchievements は「データタブ・実績」を開いたときと同じ
 * SQL 読み出し（売却済み全件 + 全記録 + タグ）を伴い、保存 1 回につきこれを前後で 2 回走らせる。
 * 記録数が数千件規模でもクエリ自体は同期 SQLite の集計 SELECT で軽いはずだが、
 * 実績が増えて評価コストが上がった場合は保存のたびに体感できる遅延が出る可能性がある
 * （ユーザー確認事項として報告）。
 */
export function saveRecord(id: string | null, input: SaveRecordInput): Achievement[] {
  const before = fetchAchievements();
  if (id == null) repository.create(input);
  else repository.update(id, input);
  const after = fetchAchievements();
  return newlyCompletedAchievements(before, after);
}

/** レコード 1 件の削除（SPEC §5.4: 確認なしで即削除）。呼び出し側で refresh すること */
export function deleteRecord(id: string): void {
  repository.remove(id);
}

/**
 * データタブ「収支」セクションの前期間比較カード（logic/periodComparison.ts）の元データ。
 * 全期間を選択中は null（比較の基準がないので呼び出し側はセクションごと隠す）。
 */
export type PeriodComparisonSection = {
  /** 見出しに出す期間ラベル「7月 → 8月」 */
  label: string;
  /** 各行の比較対象側に添える短いラベル「7月」 */
  previousLabel: string;
  /** 比較対象（前月・前年同期間）に売却済み記録が 1 件も無ければ null */
  metrics: PeriodComparisonMetrics | null;
};

export type AnalyticsData = {
  /** 期間内合計（UI-SPEC §1.5-3 の合計行）。丸めなし */
  summary: AnalyticsSummary;
  /** 前期間比較（新規セクション）。全期間選択中は null */
  comparison: PeriodComparisonSection | null;
  /**
   * 期間合計の平均販売日数（案 1c の展開行・4 列目）。記録日 → 販売日の経過日数の単純平均
   * （periodAverageSaleDays。日付逆転の記録は除外・0 日は含める）。対象が 1 件も無ければ null
   */
  averageSaleDays: number | null;
  /** チャートの集計点。日付キーの昇順・丸めなし */
  series: AggregatedPoint[];
  /** 選択中の点の内訳。未選択なら空配列 */
  details: SaleRecord[];
  /** タグ別利益ランキングでタップされたタグの内訳。未選択なら空配列 */
  tagDetails: SaleRecord[];
  /** タグ別純利益ランキング（UI-SPEC 未採番・新規セクション）の元データ。丸めなし */
  tagProfits: TagProfitStat[];
  /** タグ別純利益推移（UI-SPEC 未採番・新規セクション）の元データ。丸めなし・密な点列への埋めは画面側 */
  tagSeries: TagSeriesPoint[];
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
): Omit<AnalyticsData, 'details' | 'tagDetails'> {
  void refreshToken;
  // 刻みは最古の月に依存するので、集計点より先に引く（AnalyticsData.unit のコメント参照）
  const earliestMonthKey = repository.analyticsEarliestMonthKey(filter);
  const unit = chartUnitFor({ period: filter.period, earliestMonthKey, today });

  // 平均販売日数（§4.7 と同じ elapsedDays を通す）。SQL は sum/count しか持たないので、
  // 対象記録を生のまま引いて日付だけここで logic/profit.ts に渡す（analyticsSoldRecords のコメント参照）
  const averageSaleDays = periodAverageSaleDays(
    repository.analyticsSoldRecords(filter).map((record) => ({
      saleStartDate: fromDbDate(record.saleStartDate),
      saleDate: record.saleDate == null ? null : fromDbDate(record.saleDate),
    })),
    today,
  );

  const summary = repository.analyticsSummary(filter);
  const comparisonQuery = periodComparisonQuery(filter.period, today);
  const comparison: PeriodComparisonSection | null =
    comparisonQuery == null
      ? null
      : {
          label: comparisonQuery.label,
          previousLabel: comparisonQuery.previousLabel,
          metrics: periodComparisonMetrics(
            summary,
            repository.analyticsSummary({ ...filter, period: null, monthKeyRange: comparisonQuery.monthKeyRange }),
          ),
        };

  return {
    summary,
    comparison,
    averageSaleDays,
    series: repository.analyticsSeries(filter, unit),
    // 棒タップ（selectedKey）とは無関係に、選んだ期間・絞り込み全体で引く
    tagProfits: repository.analyticsProfitByTag(filter),
    // 収支推移グラフと同じ unit（刻み）で引く ── 時間軸を揃えるため
    tagSeries: repository.analyticsSeriesByTag(filter, unit),
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
 * タグ別利益ランキングの行タップの内訳（queryAnalyticsDetails のタグ版）。
 * `selectedTagId` は「未選択」（undefined）と「未分類タグを選んだ」（null）を区別する必要があるため、
 * selectedKey（string | null）とは違う形になる。
 */
function queryAnalyticsTagDetails(
  filter: AnalyticsFilter,
  selectedTagId: string | null | undefined,
  refreshToken: object,
): SaleRecord[] {
  void refreshToken;
  if (selectedTagId === undefined) return NO_DETAILS;
  return repository.analyticsDetailsByTag(filter, selectedTagId);
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
 * @param filter        集計対象（期間キー + 種別）。period = null で全期間、kind = null で全種別
 * @param selectedKey   タップされた点のキー。null なら内訳は引かない
 * @param today         「今日」。全期間の範囲の右端で、刻みの判定にも使う
 * @param selectedTagId タップされたタグ別利益ランキングの行の tagId。undefined なら内訳は引かない
 *                      （null は「未分類」を選んだ状態なので、未選択の undefined とは区別する）
 */
export function useAnalyticsData(
  filter: AnalyticsFilter,
  selectedKey: string | null,
  today: Date,
  selectedTagId?: string | null,
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
  const tagDetails = useMemo(
    () => queryAnalyticsTagDetails(filter, selectedTagId, refreshToken),
    [filter, selectedTagId, refreshToken],
  );

  return { ...data, details, tagDetails };
}

/**
 * タグ別純利益の推移（「グラフ」）の日付タップで開くタグ別内訳、その 1 行をさらにタップした
 * ときの内訳。**useAnalyticsData とは別の hook**にする ── 日付タップ（selectedKey）・行タップ
 * （selectedTagId）はどちらもグラフを見ている最中にだけ生まれる状態で、画面本体の集計とは
 * 引き直すタイミングが違う（点を選び直したときに details だけ引き直すのと同じ考え方）。
 *
 * @param selectedKey 選んでいる日付のキー。null なら内訳は引かない
 * @param selectedTagId その日付でさらにタップしたタグの tagId。undefined なら内訳は引かない
 *                      （null は「未分類」を選んだ状態なので、未選択の undefined とは区別する）
 */
export function useTagChartTagDetails(
  filter: AnalyticsFilter,
  unit: ChartUnit,
  selectedKey: string | null,
  selectedTagId: string | null | undefined,
): SaleRecord[] {
  const [refreshToken, setRefreshToken] = useState<object>(() => ({}));
  const refresh = useCallback(() => setRefreshToken({}), []);

  useFocusEffect(refresh);

  return useMemo(() => {
    void refreshToken;
    if (selectedKey == null || selectedTagId === undefined) return NO_DETAILS;
    return repository.analyticsDetailsByDateAndTag(filter, unit, selectedKey, selectedTagId);
  }, [filter, unit, selectedKey, selectedTagId, refreshToken]);
}

/**
 * データタブ「実績」（案 3c）の集計対象（AnalyticsFilter）。**常に全期間・絞り込みなし。**
 *
 * 累計・自己ベスト・実績バッジは「これまで積み上げてきた記録」を見るもので、
 * 月バーや絞り込みページの状態（収支/タグの 2 モードが見ている filter）とは無関係
 * （構成に月バーとの連動が書かれていない。他の 2 モードと違う母集団を見る、独立したモード）。
 */
const ACHIEVEMENTS_FILTER: AnalyticsFilter = {
  period: null,
  kind: null,
  siteName: null,
  tagIds: undefined,
};

export type AchievementsData = {
  /** あなたの記録（累計）。丸めなし */
  totals: CareerSummary;
  /** 獲得した実績 9 種の判定結果 */
  achievements: Achievement[];
  /** 次の実績（未達成のうち進捗率が最も高いもの）。全達成済みなら null */
  nextAchievement: NextAchievement | null;
  /** 自己ベスト 6 種 */
  personalBests: PersonalBests;
  /** 書き込み後に呼んで再取得する */
  refresh: () => void;
};

/**
 * 「獲得した実績」判定の下準備（queryAchievements と saveRecord の共通部分）。
 *
 * 全期間・絞り込みなしの売れた記録 + 状態を問わない全記録を読み、タグを付けて
 * evaluateAchievements（logic 層。純粋関数）に渡すだけ。DB 操作はここまでで、
 * 判定ロジック自体は logic 層に置いたまま混ぜ込まない。
 * achievementRecords も返すのは、queryAchievements が computePersonalBests に
 * 同じ母集団を渡すため（売却済み記録の DB 読み出しを 2 回に増やさない）。
 */
function computeAchievementsData(): {
  achievements: Achievement[];
  achievementRecords: AchievementSaleRecord[];
} {
  // 全期間・絞り込みなしの売れた記録（isSold = true かつ saleDate 非 null。§6.2 と同じ対象条件）
  const records = repository.analyticsSoldRecords(ACHIEVEMENTS_FILTER);
  // 「はじめる系」の一部（販売デビュー・タグデビュー・記録を続けよう）が要る、状態を問わない全記録
  const allRecords = repository.allRecordsForAchievements();
  // タグは記録ごとに 1 本のクエリでまとめて引く（N+1 回避。tagsByRecord のコメント参照）。
  // allRecords は records（売れた記録）を包含するので、1 回のクエリで両方ぶんまかなう
  const tagsByRecord = tagRepository.tagsByRecord(allRecords.map((record) => record.id));

  const achievementRecords: AchievementSaleRecord[] = records.map((record) => ({
    id: record.id,
    itemName: record.itemName,
    saleStartDate: fromDbDate(record.saleStartDate),
    // ACHIEVEMENTS_FILTER の対象条件により saleDate は非 null が保証される
    saleDate: fromDbDate(record.saleDate as string),
    salesPrice: record.salesPrice,
    purchasePrice: record.purchasePrice,
    postage: record.postage,
    envelopeCost: record.envelopeCost,
    othersCost: record.othersCost,
    commission: record.commission,
    tagIds: (tagsByRecord.get(record.id) ?? []).map((tag) => tag.id),
    targetProfit: record.targetProfit,
  }));

  const listingRecords: AchievementListingRecord[] = allRecords.map((record) => ({
    id: record.id,
    itemName: record.itemName,
    saleStartDate: fromDbDate(record.saleStartDate),
    tagIds: (tagsByRecord.get(record.id) ?? []).map((tag) => tag.id),
  }));

  return {
    achievements: evaluateAchievements(achievementRecords, { listingRecords }),
    achievementRecords,
  };
}

/**
 * 保存トースト（RecordFormSheet → achievementToastBus）が使う、実績判定だけの軽量版。
 * queryAchievements と違い totals・personalBests は要らないので、そのぶんの集計は省く。
 */
function fetchAchievements(): Achievement[] {
  return computeAchievementsData().achievements;
}

/** refreshToken を引数に取る理由は query() のコメントを参照 */
function queryAchievements(refreshToken: object): Omit<AchievementsData, 'refresh'> {
  void refreshToken;

  const { achievements, achievementRecords } = computeAchievementsData();

  return {
    // 「あなたの記録」の累計は既存の careerSummary をそのまま使う（SQL の SUM。集計式を 2 本に増やさない）
    totals: repository.careerSummary({ isSoldMode: true }),
    achievements,
    nextAchievement: selectNextAchievement(achievements),
    personalBests: computePersonalBests(achievementRecords),
  };
}

/**
 * データタブ「実績」（案 3c）のデータ取得。
 *
 * 集計対象は常に全期間・絞り込みなし（ACHIEVEMENTS_FILTER）なので、他の 2 モードと違い
 * filter を引数に取らない ── 呼び出し側（DataScreen）が持つ月バー・絞り込みの状態は
 * このモードには一切効かない。
 */
export function useAchievementsData(): AchievementsData {
  const [refreshToken, setRefreshToken] = useState<object>(() => ({}));
  const refresh = useCallback(() => setRefreshToken({}), []);

  useFocusEffect(refresh);

  const data = useMemo(() => queryAchievements(refreshToken), [refreshToken]);

  return { ...data, refresh };
}
