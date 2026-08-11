// 記録タブ（UI-SPEC §1.2 / 採用案 8a）。
// 出品中タブ・実績タブ・月別詳細の 3 画面を 1 画面に統合したもの
// （MonthlyRecordListScreen + SaleRecordScreen の後継）。
//
// 上部の固定段は通常 4 段・絞り込み中は 5 段（SPEC-V4 §4.1 / 決定 §9-1。UI-SPEC §1.2 を改訂）:
//   ヘッダ（記録 / ⌕ ⇅）＋ 月バー ＋ 集計 2 値 ＋ セグメント ＋（絞り込み中のみ）解除バー
// 月グループとプレビュー 3 件の構造は廃止し、その期間のレコードをフラットに並べる。
//
// - データ取得は repository（useRecordList 経由）のみ。画面ではクエリも並べ替えも書かない。
// - 状態（売れた記録 / 出品中）は合計行 2 段目のセグメント。押した先が見える形にした（§4.1）。
// - 種別・販売サイト・タグの 3 条件は「絞り込み N」チップ → 絞り込みシート（§4.2）。
//   巡回チップは廃止 ── 選択肢が 3 つ（種別）で済んでいたから成立していた形で、
//   販売サイトとタグが加わると巡回では表現できない。
// - 絞り込みは**画面ローカルの state**。永続化せず、データタブとも共有しない（決定 §9-9）。
// - 期間は月バー。選べるのは全期間か 1 か月のいずれかだけ（§5-5）。初期表示は今月（§5-14）。
// - 検索は ⌕ を押した間だけヘッダ行に出す。常時表示の検索バーは置かない（§5-10）。
// - 並び替えは ⇅ のシート。絞り込みの解除は絞り込みシートに一本化したので、
//   並び替えシートの先頭にあった「絞り込みをすべて解除」は外した（SPEC-V4 §8-6）。
// - スワイプ削除は確認なしで即削除（SPEC §5.4。旧 SaleRecordScreen から移植）。
import { Ionicons } from '@expo/vector-icons';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';

import { EmptyState } from '@/components/EmptyState';
import { FilterClearBar } from '@/components/FilterClearBar';
import { FilterSheet } from '@/components/FilterSheet';
import { MonthNavBar } from '@/components/MonthNavBar';
import { OptionSheet, type SheetOption } from '@/components/OptionSheet';
import { PeriodSheet } from '@/components/PeriodSheet';
import { RecordRow } from '@/components/RecordRow';
import { SearchBar } from '@/components/SearchBar';
import { SummaryBar, type SummaryItem } from '@/components/SummaryBar';
import { toMonthKey } from '@/db/dates';
import type { RecordSortType } from '@/db/repository';
import type { SaleRecord } from '@/db/schema';
import { deleteRecord, useRecordList } from '@/db/useRecords';
import { useSiteNames, useTagList } from '@/db/useTags';
import { formatYenSymbol } from '@/logic/format';
import {
  EXPENSES_LABEL,
  FILTER_EMPTY_ACTION_LABEL,
  FILTER_EMPTY_TITLE,
  LISTING_COUNT_LABEL,
  NO_RECORDS_EMPTY_BODY,
  NO_RECORDS_EMPTY_TITLE,
  SOLD_RECORDS_LABEL,
  TOTAL_LISTING_PRICE_LABEL,
  TOTAL_PROFIT_LABEL,
  filterChipLabel,
  periodProfitLabel,
} from '@/logic/labels';
import {
  EMPTY_RECORD_FILTER,
  activeFilterCount,
  clearAll,
  effectiveFilter,
  filterSummaryText,
  pruneMissingTags,
  toFilterConditions,
  type RecordFilterDraft,
} from '@/logic/recordFilter';
import { RecordFormSheet } from '@/screens/RecordFormSheet';
import { useThemeColors } from '@/theme';

/** リセット時に戻すソート（旧一覧の resetFilter と同じく販売日降順） */
const DEFAULT_SORT: RecordSortType = 'saleDateDesc';

/**
 * SPEC §4.1 の 8 種（旧 SortTypeMonthly）をレコード 1 件ずつに適用する。
 * グループの区切りは旧一覧のメニューと同じ。並べ替えの対象は種別が混ざり得るので
 * 収支・経費は中立語（SPEC-V2 §1.3）。値は内部の識別子なので改名しない（§5.3）。
 */
const SORT_OPTIONS: SheetOption<RecordSortType>[][] = [
  [
    { label: '販売日 ↓', value: 'saleDateDesc' },
    { label: '販売日 ↑', value: 'saleDateAsc' },
  ],
  [
    { label: '出品日 ↓', value: 'saleStartDateDesc' },
    { label: '出品日 ↑', value: 'saleStartDateAsc' },
  ],
  [
    { label: `${TOTAL_PROFIT_LABEL} ↓`, value: 'profitDesc' },
    { label: `${TOTAL_PROFIT_LABEL} ↑`, value: 'profitAsc' },
  ],
  [
    { label: `${EXPENSES_LABEL} ↓`, value: 'expensesDesc' },
    { label: `${EXPENSES_LABEL} ↑`, value: 'expensesAsc' },
  ],
];

/** 合計行 2 段目のセグメント（§4.1）。並びは「売れた記録 / 出品中」で固定 */
const STATUS_SEGMENTS = [SOLD_RECORDS_LABEL, LISTING_COUNT_LABEL];

/** レコード詳細のルート。月別詳細を廃止して 1 系統に統一した（UI-SPEC §2 / §6-9） */
const RECORD_DETAIL_PATHNAME = '/records/record/[id]' as const;

export function RecordListScreen() {
  const colors = useThemeColors();
  const router = useRouter();

  /** 「今日」はマウント時に 1 回だけ決める（月バーの ▶ の基準・行の経過日数の基準） */
  const today = useMemo(() => new Date(), []);
  const currentMonthKey = useMemo(() => toMonthKey(today), [today]);

  /** true = 売れた記録 / false = 出品中。合計行 2 段目のセグメントで切り替える（§4.1） */
  const [isSoldMode, setIsSoldMode] = useState(true);
  /** 表示中の月キー "YYYY-MM"。null = 全期間。初期表示は今月（§5-14） */
  const [monthKey, setMonthKey] = useState<string | null>(currentMonthKey);
  /** 絞り込みシートの 3 条件（§4.2）。画面ローカルで持ち、永続化しない（決定 §9-9） */
  const [recordFilter, setRecordFilter] = useState<RecordFilterDraft>(EMPTY_RECORD_FILTER);
  /**
   * 出品中に切り替える直前の販売サイトの指定（§4.2）。
   * 売れた記録に戻したときに復元する。**マウントされている間だけ**保つ ──
   * タブを離れて戻れば絞り込みごと消える（決定 §9-9）。
   */
  const [lastSiteName, setLastSiteName] = useState<string | null>(null);
  const [sortType, setSortType] = useState<RecordSortType>(DEFAULT_SORT);
  /** ⌕ でヘッダ行を検索フィールドに差し替えている間だけ true（§5-10） */
  const [searching, setSearching] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [showPeriodSheet, setShowPeriodSheet] = useState(false);
  const [showSortSheet, setShowSortSheet] = useState(false);
  const [showFilterSheet, setShowFilterSheet] = useState(false);
  const [showForm, setShowForm] = useState(false);

  // 絞り込みシートの候補（§4.2）。販売サイトは**記録に実在する名前**で、プリセットではない
  const { tags } = useTagList();
  const siteNames = useSiteNames();

  const { kind, siteName, tagIds } = useMemo(
    () => toFilterConditions(recordFilter, isSoldMode),
    [recordFilter, isSoldMode],
  );
  const filter = useMemo(
    () => ({ isSoldMode, monthKey, kind, siteName, tagIds, searchText }),
    [isSoldMode, monthKey, kind, siteName, tagIds, searchText],
  );
  // 合計行は検索を含めない。検索は「探す操作」で、見る対象そのものの限定ではないため
  // （旧月別詳細の summaryFilter と同じ考え方。SPEC-V2 §4.2）。
  // 販売サイトとタグは種別と同じ「限定」なので、こちらには入る（§4.5 の表）
  const summaryFilter = useMemo(
    () => ({ isSoldMode, monthKey, kind, siteName, tagIds }),
    [isSoldMode, monthKey, kind, siteName, tagIds],
  );
  const { records, summary, earliestMonthKey, monthsWithRecords, refresh } = useRecordList(
    filter,
    sortType,
    summaryFilter,
  );

  /**
   * 消えたタグを絞り込みから落とす（§4.7）。
   *
   * 設定タブでタグを消すと tagIds に存在しない id が残り得る。EXISTS は存在しない id を
   * 単に無視するので SQL は壊れないが、**解除バーの文言と N が実体と合わなくなる**
   * （消えたタグの名前が引けない）ので、画面復帰のたびに state 側で落とす。
   * 変化がなければ pruneMissingTags が同じ参照を返すので、setState は空振りしない。
   */
  useFocusEffect(
    useCallback(() => {
      setRecordFilter((current) => pruneMissingTags(current, tags));
    }, [tags]),
  );

  /**
   * 状態の切り替え（§4.2）。出品中では販売サイトの指定を退避して外し、戻すときに復元する。
   *
   * 条件そのものは effectiveFilter / buildWhere の側でも落ちる（二重にする）が、
   * ここで state からも外すのは、シートの節が消えている間に「すべて解除」の活性や
   * N の数が販売サイトを数えたままにならないようにするため。
   */
  const changeSoldMode = useCallback(
    (nextIsSold: boolean) => {
      setIsSoldMode(nextIsSold);
      if (nextIsSold) {
        // 退避した指定は 1 回だけ書き戻す。残しておくと、あとで自分で外した指定が
        // 状態を往復しただけで復活する
        if (lastSiteName != null) {
          setRecordFilter((current) => ({ ...current, siteName: lastSiteName }));
          setLastSiteName(null);
        }
        return;
      }
      setLastSiteName(recordFilter.siteName);
      setRecordFilter((current) => ({ ...current, siteName: null }));
    },
    [lastSiteName, recordFilter.siteName],
  );

  const closeSearch = useCallback(() => {
    setSearching(false);
    setSearchText('');
  }, []);

  /** 「すべて解除」「解除」「絞り込みを解除」の 3 か所から呼ぶ（§4.2 / §4.3 / §4.8）。
   *  戻すのは 3 条件だけで、期間・検索・並び替えは動かさない */
  const clearRecordFilter = useCallback(() => {
    setRecordFilter(clearAll());
    setLastSiteName(null);
  }, []);

  // 効いている条件の数と解除バーの文言は、必ず同じ下書き（状態を織り込んだ後）から作る（§4.3）
  const appliedFilter = effectiveFilter(recordFilter, isSoldMode);
  const filterCount = activeFilterCount(appliedFilter);
  const summaryText = filterSummaryText(appliedFilter, tags);

  const handleDelete = useCallback(
    (id: string) => {
      // SPEC §5.4: スワイプ削除は確認なしで即削除
      deleteRecord(id);
      refresh();
    },
    [refresh],
  );

  // 行タップ → レコード詳細へプッシュ遷移（UI-SPEC §2「一覧から詳細へ 1 タップ」）。
  // 詳細側での売却トグル・編集・削除は、戻ってきたときに useFocusEffect で拾われる。
  const openDetail = useCallback(
    (record: SaleRecord) => {
      router.push({ pathname: RECORD_DETAIL_PATHNAME, params: { id: record.id } });
    },
    [router],
  );

  const openNewRecordForm = useCallback(() => setShowForm(true), []);

  // 合計行の出し分け（UI-SPEC §1.2「合計行の出し分け」）
  const summaryItems: SummaryItem[] = isSoldMode
    ? [
        {
          label: periodProfitLabel(monthKey),
          value: formatYenSymbol(summary.totalNetProfit),
          color: colors.green,
        },
        { label: EXPENSES_LABEL, value: formatYenSymbol(summary.totalExpenses), color: colors.red },
      ]
    : [
        {
          label: LISTING_COUNT_LABEL,
          value: `${summary.recordCount} 点`,
          color: colors.orange,
        },
        {
          label: TOTAL_LISTING_PRICE_LABEL,
          value: formatYenSymbol(summary.totalSales),
          color: colors.blue,
        },
      ];

  // ⌕ を押すとヘッダ行そのものが検索フィールドに変わる（§5-10）。
  // 「キャンセル」で元のヘッダ行（記録 / ⌕ ⇅）に戻り、検索語もクリアする。
  const screenOptions = useMemo(
    () =>
      searching
        ? {
            title: '',
            headerTitle: () => (
              <SearchBar
                value={searchText}
                onChangeValue={setSearchText}
                style={styles.headerSearch}
                autoFocus
              />
            ),
            headerRight: () => (
              <Pressable onPress={closeSearch} hitSlop={8} accessibilityRole="button">
                <Text style={[styles.headerAction, { color: colors.blue }]}>キャンセル</Text>
              </Pressable>
            ),
          }
        : {
            title: '記録',
            headerTitle: undefined,
            headerRight: () => (
              <View style={styles.headerButtons}>
                <Pressable
                  onPress={() => setSearching(true)}
                  hitSlop={8}
                  accessibilityLabel="検索">
                  <Ionicons name="search" size={22} color={colors.blue} />
                </Pressable>
                <Pressable
                  onPress={() => setShowSortSheet(true)}
                  hitSlop={8}
                  accessibilityLabel="並び替え">
                  <Ionicons name="swap-vertical" size={22} color={colors.blue} />
                </Pressable>
              </View>
            ),
          },
    [searching, searchText, closeSearch, colors.blue],
  );

  return (
    <>
      <Stack.Screen options={screenOptions} />
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <MonthNavBar
          monthKey={monthKey}
          earliestMonthKey={earliestMonthKey}
          currentMonthKey={currentMonthKey}
          onChangeMonth={setMonthKey}
          onPressTitle={() => setShowPeriodSheet(true)}
        />

        {/* 1 段目 = 集計 2 値、2 段目 = セグメント ＋「絞り込み N」チップ（決定 §9-1） */}
        <SummaryBar
          items={summaryItems}
          segment={{
            options: STATUS_SEGMENTS,
            selectedIndex: isSoldMode ? 0 : 1,
            onChange: (index) => changeSoldMode(index === 0),
          }}
          chip={{
            label: filterChipLabel(filterCount),
            onPress: () => setShowFilterSheet(true),
          }}
        />

        {/* 5 段目。絞り込みが 0 件のときは行ごと出ない（§4.1 / §4.3） */}
        {summaryText != null && (
          <FilterClearBar text={summaryText} onClear={clearRecordFilter} />
        )}

        <FlatList
          data={records}
          keyExtractor={(record) => record.id}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          ListHeaderComponent={
            records.length === 0 ? null : (
              <Text style={[styles.count, { color: colors.secondaryLabel }]}>
                {records.length} 件
              </Text>
            )
          }
          ListEmptyComponent={
            <ListEmpty
              filtering={filterCount > 0 || searchText !== ''}
              canClearFilter={filterCount > 0}
              onClearFilter={clearRecordFilter}
            />
          }
          renderItem={({ item }) => (
            <SwipeToDeleteRow
              record={item}
              isSoldMode={isSoldMode}
              today={today}
              onPress={() => openDetail(item)}
              onDelete={() => handleDelete(item.id)}
            />
          )}
        />

        {/* 追加ボタンは画面左下・タブバーの上（UI-SPEC §1.2-7） */}
        <Pressable
          style={[styles.addButton, { backgroundColor: colors.blue }]}
          onPress={openNewRecordForm}
          accessibilityRole="button"
          accessibilityLabel="記録を追加">
          <Ionicons name="add" size={18} color="#FFFFFF" />
          <Text style={styles.addLabel}>記録</Text>
        </Pressable>
      </View>

      {/* 期間シート（月バー中央タップ）。全期間か 1 か月のいずれかを選ぶ（§5-5）。
          データタブと同じ部品を共用する（UI-SPEC §1.2） */}
      <PeriodSheet
        visible={showPeriodSheet}
        monthKey={monthKey}
        monthsWithRecords={monthsWithRecords}
        currentMonthKey={currentMonthKey}
        onSelect={setMonthKey}
        onClose={() => setShowPeriodSheet(false)}
      />
      {/* 並び替えシート（⇅）。**先頭の「絞り込みをすべて解除」は外した**（SPEC-V4 §8-6）──
          絞り込みの解除は絞り込みシート（と解除バー）に一本化し、同じことをする経路を 2 つ作らない */}
      <OptionSheet
        visible={showSortSheet}
        title="並び替え"
        groups={SORT_OPTIONS}
        selectedValue={sortType}
        onSelect={setSortType}
        onClose={() => setShowSortSheet(false)}
      />
      {/* 絞り込みシート（§4.2）。条件は選んだ瞬間から効く（下部の N 件がその場で動く）。
          N 件は合計行と同じ集計から取る ── summaryFilter は検索を除いた同じ条件なので、
          「N 件と出たのに一覧の件数が違う」がそもそも起き得ない（§4.6） */}
      <FilterSheet
        visible={showFilterSheet}
        filter={recordFilter}
        onChange={setRecordFilter}
        showSite={isSoldMode}
        siteNames={siteNames}
        tags={tags}
        matchCount={summary.recordCount}
        onClose={() => setShowFilterSheet(false)}
      />
      <RecordFormSheet visible={showForm} onClose={() => setShowForm(false)} onSaved={refresh} />
    </>
  );
}

/**
 * 空表示（SPEC-V4 §4.8 / 決定 §9-13）。**2 通りだけ**に統合した。
 *
 * | 絞り込みあり（検索中を含む） | 「条件に合う記録がありません」＋「絞り込みを解除」 |
 * | 記録なし                     | 従来どおりの追加への導線                          |
 *
 * **条件ごとの文言は作らない。** 効き得る条件が 6 つ（状態・期間・検索・種別・販売サイト・タグ）に
 * 増え、組み合わせごとに書くと爆発する。旧・検索中／種別で絞り込み中の 2 通りの出し分けも、
 * 「ほかの月にはあるかもしれません」のような推測の文もここで落とした ──
 * 期間も条件の 1 つになった以上、特定の条件だけを名指しして示唆する根拠がない。
 *
 * 検索中に解除リンクを出さないのは、検索欄がヘッダに出たままで、何で絞れているかが
 * 画面から読めるため（消すのはそこでできる）。
 */
function ListEmpty({
  filtering,
  canClearFilter,
  onClearFilter,
}: {
  filtering: boolean;
  canClearFilter: boolean;
  onClearFilter: () => void;
}) {
  if (!filtering) {
    return <EmptyState title={NO_RECORDS_EMPTY_TITLE} body={NO_RECORDS_EMPTY_BODY} />;
  }

  return (
    <EmptyState
      title={FILTER_EMPTY_TITLE}
      actionLabel={canClearFilter ? FILTER_EMPTY_ACTION_LABEL : undefined}
      onPressAction={canClearFilter ? onClearFilter : undefined}
    />
  );
}

/**
 * リストの 1 行。左スワイプで「削除」が出て、押すと確認なしで消える（SPEC §5.4）。
 * 旧 SaleRecordScreen の SwipeToDeleteRow の移植。
 */
function SwipeToDeleteRow({
  record,
  isSoldMode,
  today,
  onPress,
  onDelete,
}: {
  record: SaleRecord;
  isSoldMode: boolean;
  today: Date;
  onPress: () => void;
  onDelete: () => void;
}) {
  const colors = useThemeColors();

  return (
    <ReanimatedSwipeable
      friction={2}
      rightThreshold={40}
      containerStyle={styles.swipeContainer}
      renderRightActions={() => (
        <Pressable
          style={[styles.deleteAction, { backgroundColor: colors.red }]}
          onPress={onDelete}
          accessibilityRole="button"
          accessibilityLabel={`${record.itemName} を削除`}>
          <Text style={styles.deleteLabel}>削除</Text>
        </Pressable>
      )}>
      <Pressable
        style={[styles.rowCard, { backgroundColor: colors.secondaryBackground }]}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${record.itemName} の詳細`}>
        <RecordRow record={record} isSoldMode={isSoldMode} today={today} />
      </Pressable>
    </ReanimatedSwipeable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingRight: 4,
  },
  headerSearch: {
    // ヘッダのタイトル領域いっぱいに広げる（既定の外余白を打ち消す）
    minWidth: 220,
    marginHorizontal: 0,
    marginTop: 0,
    marginBottom: 0,
    paddingVertical: 6,
  },
  headerAction: {
    fontSize: 16,
  },
  listContent: {
    padding: 16,
    paddingBottom: 96,
    gap: 10,
  },
  count: {
    fontSize: 13,
    marginLeft: 4,
    marginBottom: 2,
  },
  swipeContainer: {
    borderRadius: 12,
  },
  rowCard: {
    padding: 14,
    borderRadius: 12,
  },
  deleteAction: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    borderTopRightRadius: 12,
    borderBottomRightRadius: 12,
  },
  deleteLabel: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  addButton: {
    position: 'absolute',
    left: 20,
    bottom: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 22,
    shadowColor: '#000000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  addLabel: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
});
