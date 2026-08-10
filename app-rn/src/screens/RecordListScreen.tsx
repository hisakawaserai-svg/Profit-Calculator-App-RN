// 記録タブ（UI-SPEC §1.2 / 採用案 8a）。
// 出品中タブ・実績タブ・月別詳細の 3 画面を 1 画面に統合したもの
// （MonthlyRecordListScreen + SaleRecordScreen の後継）。
//
// 上部の固定段は 3 段に収める（8a のねらい）:
//   ヘッダ（記録 / ⌕ ⇅）＋ 月バー ＋ 合計行
// 月グループとプレビュー 3 件の構造は廃止し、その期間のレコードをフラットに並べる。
//
// - データ取得は repository（useRecordList 経由）のみ。画面ではクエリも並べ替えも書かない。
// - 状態（売れた記録 / 出品中）と種別は合計行のチップで切り替える（§1.2「チップ」）。
// - 期間は月バー。選べるのは全期間か 1 か月のいずれかだけ（§5-5）。初期表示は今月（§5-14）。
// - 検索は ⌕ を押した間だけヘッダ行に出す。常時表示の検索バーは置かない（§5-10）。
// - 並び替えは ⇅ のシート。種別はチップへ移したのでシートには並び替えだけを置く（§1.2）。
// - スワイプ削除は確認なしで即削除（SPEC §5.4。旧 SaleRecordScreen から移植）。
import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';

import { EmptyState } from '@/components/EmptyState';
import { FilterChip } from '@/components/FilterChip';
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
import { formatYenSymbol } from '@/logic/format';
import {
  DEFAULT_KIND_FILTER,
  kindFilterLabel,
  toKindCondition,
  type KindFilter,
} from '@/logic/kindFilter';
import {
  EXPENSES_LABEL,
  LISTING_COUNT_LABEL,
  SOLD_RECORDS_LABEL,
  TOTAL_LISTING_PRICE_LABEL,
  TOTAL_PROFIT_LABEL,
  periodProfitLabel,
} from '@/logic/labels';
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

/** 種別チップの巡回順（「すべて → 不用品 → 仕入品 → すべて」。UI-SPEC §1.2） */
const KIND_CYCLE: KindFilter[] = ['all', 'used', 'sourced'];

/** レコード詳細のルート。月別詳細を廃止して 1 系統に統一した（UI-SPEC §2 / §6-9） */
const RECORD_DETAIL_PATHNAME = '/records/record/[id]' as const;

export function RecordListScreen() {
  const colors = useThemeColors();
  const router = useRouter();

  /** 「今日」はマウント時に 1 回だけ決める（月バーの ▶ の基準・行の経過日数の基準） */
  const today = useMemo(() => new Date(), []);
  const currentMonthKey = useMemo(() => toMonthKey(today), [today]);

  /** true = 売れた記録 / false = 出品中。状態チップでトグルする */
  const [isSoldMode, setIsSoldMode] = useState(true);
  /** 表示中の月キー "YYYY-MM"。null = 全期間。初期表示は今月（§5-14） */
  const [monthKey, setMonthKey] = useState<string | null>(currentMonthKey);
  const [kindFilter, setKindFilter] = useState<KindFilter>(DEFAULT_KIND_FILTER);
  const [sortType, setSortType] = useState<RecordSortType>(DEFAULT_SORT);
  /** ⌕ でヘッダ行を検索フィールドに差し替えている間だけ true（§5-10） */
  const [searching, setSearching] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [showPeriodSheet, setShowPeriodSheet] = useState(false);
  const [showSortSheet, setShowSortSheet] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const kind = toKindCondition(kindFilter);
  const filter = useMemo(
    () => ({ isSoldMode, monthKey, kind, searchText }),
    [isSoldMode, monthKey, kind, searchText],
  );
  // 合計行は検索を含めない。検索は「探す操作」で、見る対象そのものの限定ではないため
  // （旧月別詳細の summaryFilter と同じ考え方。SPEC-V2 §4.2）
  const summaryFilter = useMemo(
    () => ({ isSoldMode, monthKey, kind }),
    [isSoldMode, monthKey, kind],
  );
  const { records, summary, earliestMonthKey, refresh } = useRecordList(
    filter,
    sortType,
    summaryFilter,
  );

  const cycleKindFilter = useCallback(() => {
    setKindFilter((current) => KIND_CYCLE[(KIND_CYCLE.indexOf(current) + 1) % KIND_CYCLE.length]);
  }, []);

  const clearKindFilter = useCallback(() => setKindFilter(DEFAULT_KIND_FILTER), []);

  const closeSearch = useCallback(() => {
    setSearching(false);
    setSearchText('');
  }, []);

  /**
   * 並び替えシートの先頭に置く「絞り込みをすべて解除」（設計案 2e）。
   * 解除するのは絞り込み 3 つ（種別・検索・期間）だけで、並び替えはそのまま。
   * 期間は初期状態と同じ今月に戻す。
   */
  const clearAllFilters = useCallback(() => {
    setKindFilter(DEFAULT_KIND_FILTER);
    setMonthKey(currentMonthKey);
    setSearching(false);
    setSearchText('');
  }, [currentMonthKey]);

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

        <SummaryBar
          items={summaryItems}
          trailing={
            <>
              <FilterChip
                label={isSoldMode ? SOLD_RECORDS_LABEL : LISTING_COUNT_LABEL}
                tone="accent"
                onPress={() => setIsSoldMode((current) => !current)}
                accessibilityLabel={`表示中: ${isSoldMode ? SOLD_RECORDS_LABEL : LISTING_COUNT_LABEL}。押すと切り替える`}
              />
              <FilterChip
                label={kindFilterLabel(kindFilter)}
                onPress={cycleKindFilter}
                accessibilityLabel={`種別の絞り込み: ${kindFilterLabel(kindFilter)}。押すと切り替える`}
              />
            </>
          }
        />

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
              kindFilter={kindFilter}
              searchText={searchText}
              onClearKindFilter={clearKindFilter}
              onClearSearch={closeSearch}
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
        earliestMonthKey={earliestMonthKey}
        currentMonthKey={currentMonthKey}
        onSelect={setMonthKey}
        onClose={() => setShowPeriodSheet(false)}
      />
      {/* 並び替えシート（⇅）。種別は合計行のチップへ移したので並び替えだけを置く（§1.2） */}
      <OptionSheet
        visible={showSortSheet}
        title="並び替え"
        action={{ label: '絞り込みをすべて解除', onPress: clearAllFilters }}
        groups={SORT_OPTIONS}
        selectedValue={sortType}
        onSelect={setSortType}
        onClose={() => setShowSortSheet(false)}
      />
      <RecordFormSheet visible={showForm} onClose={() => setShowForm(false)} onSaved={refresh} />
    </>
  );
}

/** 空表示（UI-SPEC §1.2「空表示の文言」）。絞り込み中だけ解除リンクを出す */
function ListEmpty({
  kindFilter,
  searchText,
  onClearKindFilter,
  onClearSearch,
}: {
  kindFilter: KindFilter;
  searchText: string;
  onClearKindFilter: () => void;
  onClearSearch: () => void;
}) {
  // 検索中は「絞り込み」より検索が理由として近いので、そちらを先に出す
  if (searchText !== '') {
    return (
      <EmptyState
        title="条件に合う記録がありません"
        body={`「${searchText}」に一致する記録はこの期間にありません`}
        actionLabel="検索を解除"
        onPressAction={onClearSearch}
      />
    );
  }

  if (kindFilter === DEFAULT_KIND_FILTER) {
    return (
      <EmptyState title="この期間の記録はありません" body="左下の ＋ を押すと記録できます" />
    );
  }

  return (
    <EmptyState
      title="条件に合う記録がありません"
      body={`「${kindFilterLabel(kindFilter)}」で絞り込んでいます。ほかの月にはあるかもしれません`}
      actionLabel="絞り込みを解除"
      onPressAction={onClearKindFilter}
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
