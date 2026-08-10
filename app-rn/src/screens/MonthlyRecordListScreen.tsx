// MonthlyRecordList.swift の移植。出品中タブ / 実績タブの月別一覧（SPEC §3.2 / §6.1）。
// 2 つのタブは isSoldMode だけが違うので、この 1 コンポーネントを両方から使う。
//
// - データ取得は src/db/repository.ts（useRecordListData 経由）のみ。画面ではクエリを書かない。
// - 月カード・下部累計の丸めは「Double で合算 → 表示時に roundForDisplay」（決定 §7-2）。
//   合算は repository の SUM が済ませているので、この画面は丸めた値を出すだけ。
// - 検索・ソート・月フィルタの状態は画面ローカル。決定 §7-1 のとおり
//   月別詳細画面（SaleRecordScreen）とは共有しない。
import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { AddRecordButton } from '@/components/AddRecordButton';
import { MonthPickerSheet } from '@/components/MonthPickerSheet';
import { MonthlySummaryCard } from '@/components/MonthlySummaryCard';
import { OptionSheet, type SheetOption } from '@/components/OptionSheet';
import { RecordRow } from '@/components/RecordRow';
import { SearchBar } from '@/components/SearchBar';
import { CareerSummarySection } from '@/components/SummarySection';
import { monthKeyToDate } from '@/db/dates';
import type { MonthGroup, SortTypeMonthly } from '@/db/repository';
import { useRecordListData } from '@/db/useRecords';
import { formatMonthHeader, formatMonthTitle } from '@/logic/format';
import {
  DEFAULT_KIND_FILTER,
  KIND_FILTER_OPTIONS,
  toKindCondition,
  type KindFilter,
} from '@/logic/kindFilter';
import { EXPENSES_LABEL, TOTAL_PROFIT_LABEL } from '@/logic/labels';
import { RecordFormSheet } from '@/screens/RecordFormSheet';
import { useThemeColors } from '@/theme';

/** 月セクションに出すプレビュー件数（Swift 版 values.prefix(3)） */
const PREVIEW_COUNT = 3;

/** SPEC §4.1 SortTypeMonthly の 8 種。Swift 版 Menu の Divider に合わせてグループ分けする */
const SORT_OPTIONS: SheetOption<SortTypeMonthly>[][] = [
  [
    { label: '販売日 ↓', value: 'saleDateDesc' },
    { label: '販売日 ↑', value: 'saleDateAsc' },
  ],
  [
    { label: '出品日 ↓', value: 'saleStartDateDesc' },
    { label: '出品日 ↑', value: 'saleStartDateAsc' },
  ],
  // 並べ替えの対象は月グループの合計（種別が混ざり得る）なので中立語（SPEC-V2 §1.3）。
  // 値（profitDesc 等）は内部の識別子なので改名しない（§5.3）
  [
    { label: `${TOTAL_PROFIT_LABEL} ↓`, value: 'profitDesc' },
    { label: `${TOTAL_PROFIT_LABEL} ↑`, value: 'profitAsc' },
  ],
  [
    { label: `${EXPENSES_LABEL} ↓`, value: 'expensesDesc' },
    { label: `${EXPENSES_LABEL} ↑`, value: 'expensesAsc' },
  ],
];

/** リセット時に戻すソート（Swift 版 resetFilter と同じく販売日降順） */
const DEFAULT_SORT: SortTypeMonthly = 'saleDateDesc';

/** 月別詳細のルート。出品中 / 実績でルートが分かれているので呼び出し側から渡す */
export type MonthDetailPathname = '/records/listings/[monthKey]' | '/records/sold/[monthKey]';

type Props = {
  /** true = 実績タブ（売却済み） / false = 出品中タブ */
  isSoldMode: boolean;
  monthDetailPathname: MonthDetailPathname;
};

export function MonthlyRecordListScreen({ isSoldMode, monthDetailPathname }: Props) {
  const colors = useThemeColors();
  const router = useRouter();

  const [searchText, setSearchText] = useState('');
  const [sortType, setSortType] = useState<SortTypeMonthly>(DEFAULT_SORT);
  /** 月フィルタ "YYYY-MM"。null = 全期間（SPEC §6.1: 年月の完全一致） */
  const [monthKey, setMonthKey] = useState<string | null>(null);
  /** 種別フィルタ（SPEC-V2 §4.2）。ソートと同じシートから選ぶ（§7-10） */
  const [kindFilter, setKindFilter] = useState<KindFilter>(DEFAULT_KIND_FILTER);
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [showForm, setShowForm] = useState(false);

  // 下部累計（summaryFilter）は省略時 filter と同じものが使われるので、
  // 種別フィルタは月カードにも累計にも同じように効く（SPEC-V2 §4.2「適用範囲」）。
  const filter = useMemo(
    () => ({ isSoldMode, searchText, monthKey, kind: toKindCondition(kindFilter) }),
    [isSoldMode, searchText, monthKey, kindFilter],
  );
  const { groups, summary, refresh } = useRecordListData(filter, sortType);

  // SPEC §3.2: 実績タブは「全期間の収支」/ 月選択時「YYYY年M月の収支」、出品中タブは「出品中」
  const title = isSoldMode
    ? monthKey == null
      ? `全期間の${TOTAL_PROFIT_LABEL}`
      : `${formatMonthTitle(monthKeyToDate(monthKey))}の${TOTAL_PROFIT_LABEL}`
    : '出品中';

  /**
   * ツールバーのリセット: 月フィルタ解除 ＋ ソートを販売日降順へ（Swift 版 resetFilter）。
   * 種別フィルタも絞り込みの 1 つなので「すべて」に戻す（SPEC-V2 §4.2）。
   */
  const resetFilter = useCallback(() => {
    setMonthKey(null);
    setSortType(DEFAULT_SORT);
    setKindFilter(DEFAULT_KIND_FILTER);
  }, []);

  // 決定 §7-7 のとおりここではレコードを作らず、保存ボタン押下時に初めて作成される。
  // 実績タブから開いた場合も新規レコードは isSold = false・saleStartDate = 当日（決定 §7-8 / §7-11）。
  const openNewRecordForm = useCallback(() => setShowForm(true), []);

  const openMonthDetail = useCallback(
    (group: MonthGroup) => {
      router.push({ pathname: monthDetailPathname, params: { monthKey: group.monthKey } });
    },
    [router, monthDetailPathname],
  );

  const screenOptions = useMemo(
    () => ({
      title,
      headerRight: () => (
        <View style={styles.headerButtons}>
          <Pressable
            onPress={() => setShowMonthPicker(true)}
            hitSlop={8}
            accessibilityLabel="表示月を選択">
            <Ionicons name="calendar-outline" size={22} color={colors.blue} />
          </Pressable>
          <Pressable
            onPress={() => setShowSortMenu(true)}
            hitSlop={8}
            accessibilityLabel="並び替えと絞り込み">
            <Ionicons name="swap-vertical" size={22} color={colors.blue} />
          </Pressable>
          <AddRecordButton onPress={openNewRecordForm} />
          <Pressable onPress={resetFilter} hitSlop={8} accessibilityLabel="フィルタをリセット">
            <Ionicons name="refresh" size={22} color={colors.blue} />
          </Pressable>
        </View>
      ),
    }),
    [title, colors.blue, openNewRecordForm, resetFilter],
  );

  return (
    <>
      <Stack.Screen options={screenOptions} />
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <SearchBar value={searchText} onChangeValue={setSearchText} />

        <FlatList
          data={groups}
          keyExtractor={(group) => group.monthKey}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          ListEmptyComponent={
            <Text style={[styles.empty, { color: colors.secondaryLabel }]}>
              記録がありません
            </Text>
          }
          renderItem={({ item }) => (
            <MonthSection
              group={item}
              isSoldMode={isSoldMode}
              onPress={() => openMonthDetail(item)}
            />
          )}
        />

        <View style={[styles.divider, { backgroundColor: colors.separator }]} />
        {/* 画面下部に固定する累計（SPEC §6.1 CareerSummarySection） */}
        <CareerSummarySection
          totalNetProfit={summary.totalNetProfit}
          totalExpenses={summary.totalExpenses}
        />
      </View>

      <MonthPickerSheet
        visible={showMonthPicker}
        monthKey={monthKey}
        onChangeMonth={setMonthKey}
        onReset={resetFilter}
        onClose={() => setShowMonthPicker(false)}
      />
      {/* ソートと種別フィルタは同じシートに同居させる（SPEC-V2 §7-10） */}
      <OptionSheet
        visible={showSortMenu}
        title="並び替えと絞り込み"
        heading="並び替え"
        groups={SORT_OPTIONS}
        selectedValue={sortType}
        onSelect={setSortType}
        section={{
          heading: '種別',
          options: KIND_FILTER_OPTIONS,
          selectedValue: kindFilter,
          onSelect: setKindFilter,
        }}
        onClose={() => setShowSortMenu(false)}
      />
      <RecordFormSheet
        visible={showForm}
        onClose={() => setShowForm(false)}
        onSaved={refresh}
      />
    </>
  );
}

/**
 * 月グループ 1 つ分（Swift 版 GroupSectionView）。
 * 月カード ＋ 先頭 3 件のプレビュー ＋「ほか N 件を表示...」。
 * プレビュー部分全体が月別詳細へのリンク（Swift 版の NavigationLink と同じ範囲）。
 */
function MonthSection({
  group,
  isSoldMode,
  onPress,
}: {
  group: MonthGroup;
  isSoldMode: boolean;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  const previewRecords = group.records.slice(0, PREVIEW_COUNT);
  const remainingCount = Math.max(group.recordCount - PREVIEW_COUNT, 0);

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionHeader, { color: colors.secondaryLabel }]}>
        {formatMonthHeader(group.monthDate)}
      </Text>

      <MonthlySummaryCard
        totalNetProfit={group.totalNetProfit}
        totalExpenses={group.totalExpenses}
      />

      <Pressable
        style={[styles.previewCard, { backgroundColor: colors.secondaryBackground }]}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${formatMonthHeader(group.monthDate)}の記録を表示`}>
        {previewRecords.map((record) => (
          <View key={record.id}>
            <View style={styles.previewRow}>
              <RecordRow record={record} isSoldMode={isSoldMode} />
            </View>
            <View style={[styles.previewSeparator, { backgroundColor: colors.separator }]} />
          </View>
        ))}
        {remainingCount > 0 && (
          <Text style={[styles.moreLabel, { color: colors.blue }]}>
            ほか {remainingCount} 件を表示...
          </Text>
        )}
      </Pressable>
    </View>
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
  listContent: {
    padding: 16,
    paddingBottom: 24,
    gap: 24,
  },
  empty: {
    textAlign: 'center',
    marginTop: 40,
    fontSize: 15,
  },
  section: {
    gap: 8,
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 4,
  },
  previewCard: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  previewRow: {
    padding: 16,
  },
  previewSeparator: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 16,
  },
  moreLabel: {
    fontSize: 12,
    textAlign: 'right',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
  },
});
