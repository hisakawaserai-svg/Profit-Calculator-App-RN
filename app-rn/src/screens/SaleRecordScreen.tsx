// SaleRecord.swift の SaleRecordView の移植。月別詳細リスト（SPEC §3.2）。
// MonthlyRecordListScreen の月セクションからプッシュ遷移してくる。
//
// - 表示対象は「対象月 × isSoldMode」。取得は repository（useRecordListData）のみ。
// - 検索・ソートはこの画面ローカル。親一覧とは共有しない（決定 §7-1）。
//   ソートは repository の SortTypeMonthly（月グループ間の並び）とは別物なので、
//   取得済みレコード配列に対してこの画面で並べ替える（Swift 版 sortedRecords と同じ）。
// - スワイプ削除は確認なしで即削除（SPEC §5.4）。
// - 対象月のレコードが 0 件になったら前画面へ戻る（Swift 版 currentMonthCount の onChange）。
//
// Swift 版にあった graphical DatePicker のオーバーレイは移植していない。
// selectedDate をセットするだけで絞り込みには一切使われておらず（SaleRecord.swift の
// sortedRecords は selectedDate を参照しない）、決定 §7-6「未使用コードは移植対象から除外」に当たるため。
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';

import { AddRecordButton } from '@/components/AddRecordButton';
import { OptionSheet, type SheetOption } from '@/components/OptionSheet';
import { RecordRow } from '@/components/RecordRow';
import { SearchBar } from '@/components/SearchBar';
import { CareerSummarySection } from '@/components/SummarySection';
import { monthKeyToDate } from '@/db/dates';
import type { SaleRecord } from '@/db/schema';
import { deleteRecord, useRecordListData } from '@/db/useRecords';
import { formatMonthHeader } from '@/logic/format';
import { netProfit } from '@/logic/profit';
import { RecordFormSheet } from '@/screens/RecordFormSheet';
import { useThemeColors } from '@/theme';

/** Swift 版 SaleRecordView.SortType（6 種）。この画面専用でレコード単位の並び順 */
type SortType =
  | 'saleDateDesc'
  | 'saleDateAsc'
  | 'saleStartDateDesc'
  | 'saleStartDateAsc'
  | 'itemName'
  | 'netProfitDesc';

/** レコード詳細のルート。タブごとに Stack が分かれているので呼び出し側から渡す */
export type RecordDetailPathname = '/listings/record/[id]' | '/sold/record/[id]';

type Props = {
  /** true = 実績タブ（売却済み） / false = 出品中タブ */
  isSoldMode: boolean;
  recordDetailPathname: RecordDetailPathname;
};

export function SaleRecordScreen({ isSoldMode, recordDetailPathname }: Props) {
  const colors = useThemeColors();
  const router = useRouter();
  const params = useLocalSearchParams<{ monthKey: string }>();
  const monthKey = Array.isArray(params.monthKey) ? params.monthKey[0] : params.monthKey;

  const [searchText, setSearchText] = useState('');
  // Swift 版の初期値は常に .saleDateDesc だが、出品中は saleDate が必ず null（SPEC §1）で
  // 並び替えが効かないため、モードに応じた基準日の降順を初期値にする（表示順は Swift 版と同じ）。
  const [sortType, setSortType] = useState<SortType>(
    isSoldMode ? 'saleDateDesc' : 'saleStartDateDesc',
  );
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const filter = useMemo(
    () => ({ isSoldMode, searchText, monthKey }),
    [isSoldMode, searchText, monthKey],
  );
  // 下部累計は「対象月のみ」で集計する。検索は含めない
  // （Swift 版 CareerSummarySection(records:isSoldMode:targetMonth:) と同じ範囲）
  const summaryFilter = useMemo(() => ({ isSoldMode, monthKey }), [isSoldMode, monthKey]);
  const { groups, summary, refresh } = useRecordListData(filter, 'saleDateDesc', summaryFilter);

  // monthKey で絞っているのでグループは高々 1 つ
  const records = useMemo(() => groups[0]?.records ?? [], [groups]);
  const sortedRecords = useMemo(() => sortRecords(records, sortType), [records, sortType]);

  // 対象月の記録が 0 件になったら前画面へ戻る。
  // 判定に使うのは検索を含まない summary の件数（Swift 版と同じく、検索で 0 件になっても戻らない）。
  useEffect(() => {
    if (summary.recordCount === 0 && router.canGoBack()) {
      router.back();
    }
  }, [summary.recordCount, router]);

  const handleDelete = useCallback(
    (id: string) => {
      // SPEC §5.4: 月別詳細のスワイプ削除は確認なしで即削除
      deleteRecord(id);
      refresh();
    },
    [refresh],
  );

  // 行タップ → レコード詳細へプッシュ遷移（SPEC §3.3）。
  // 詳細側での売却トグル・編集・削除は、戻ってきたときに useFocusEffect で拾われる。
  const openDetail = useCallback(
    (record: SaleRecord) => {
      router.push({ pathname: recordDetailPathname, params: { id: record.id } });
    },
    [router, recordDetailPathname],
  );

  // 決定 §7-7 のとおり、レコードが作られるのは保存ボタン押下時だけ。
  // この画面は月別詳細だが、新規レコードの出品日は当日のまま（決定 §7-11）で対象月には合わせない。
  const openNewRecordForm = useCallback(() => setShowForm(true), []);

  const sortOptions = useMemo<SheetOption<SortType>[][]>(
    () => [
      isSoldMode
        ? [
            { label: '販売日 ↓', value: 'saleDateDesc' },
            { label: '販売日 ↑', value: 'saleDateAsc' },
          ]
        : [
            { label: '出品日 ↓', value: 'saleStartDateDesc' },
            { label: '出品日 ↑', value: 'saleStartDateAsc' },
          ],
      [
        { label: '商品名', value: 'itemName' },
        { label: '純利益 ↓', value: 'netProfitDesc' },
      ],
    ],
    [isSoldMode],
  );

  const screenOptions = useMemo(
    () => ({
      title: '販売記録',
      headerRight: () => (
        <View style={styles.headerButtons}>
          <Pressable
            onPress={() => setShowSortMenu(true)}
            hitSlop={8}
            accessibilityLabel="並び替え">
            <Ionicons name="swap-vertical" size={22} color={colors.blue} />
          </Pressable>
          <AddRecordButton onPress={openNewRecordForm} />
        </View>
      ),
    }),
    [colors.blue, openNewRecordForm],
  );

  return (
    <>
      <Stack.Screen options={screenOptions} />
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <SearchBar value={searchText} onChangeValue={setSearchText} />

        <FlatList
          data={sortedRecords}
          keyExtractor={(record) => record.id}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          ListHeaderComponent={
            <Text style={[styles.sectionHeader, { color: colors.secondaryLabel }]}>
              {formatMonthHeader(monthKeyToDate(monthKey))}
            </Text>
          }
          ListEmptyComponent={
            <Text style={[styles.empty, { color: colors.secondaryLabel }]}>
              記録がありません
            </Text>
          }
          renderItem={({ item }) => (
            <SwipeToDeleteRow
              record={item}
              isSoldMode={isSoldMode}
              onPress={() => openDetail(item)}
              onDelete={() => handleDelete(item.id)}
            />
          )}
        />

        <View style={[styles.divider, { backgroundColor: colors.separator }]} />
        {/* 画面下部に固定する累計（対象月ぶん。SPEC §6.1） */}
        <CareerSummarySection
          totalNetProfit={summary.totalNetProfit}
          totalExpenses={summary.totalExpenses}
        />
      </View>

      <OptionSheet
        visible={showSortMenu}
        title="並び替え"
        groups={sortOptions}
        selectedValue={sortType}
        onSelect={setSortType}
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

/** SwiftUI List の .onDelete 相当。左スワイプで「削除」が出て、押すと確認なしで消える（SPEC §5.4） */
function SwipeToDeleteRow({
  record,
  isSoldMode,
  onPress,
  onDelete,
}: {
  record: SaleRecord;
  isSoldMode: boolean;
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
        accessibilityRole="button">
        <RecordRow record={record} isSoldMode={isSoldMode} />
      </Pressable>
    </ReanimatedSwipeable>
  );
}

/**
 * この画面専用の並べ替え（Swift 版 sortedRecords）。
 * 日付は DB 保存形式（ローカル時刻の ISO 文字列）なので、辞書順比較 = 時系列比較になる。
 * null（出品中の saleDate）は Swift 版の .distantPast と同じく最小として扱う。
 */
function sortRecords(records: SaleRecord[], sortType: SortType): SaleRecord[] {
  const byDate = (a: string | null, b: string | null) => (a ?? '').localeCompare(b ?? '');

  return [...records].sort((a, b) => {
    switch (sortType) {
      case 'saleDateDesc':
        return byDate(b.saleDate, a.saleDate);
      case 'saleDateAsc':
        return byDate(a.saleDate, b.saleDate);
      case 'saleStartDateDesc':
        return byDate(b.saleStartDate, a.saleStartDate);
      case 'saleStartDateAsc':
        return byDate(a.saleStartDate, b.saleStartDate);
      case 'itemName':
        return a.itemName.localeCompare(b.itemName, 'ja');
      case 'netProfitDesc':
        return netProfit(b) - netProfit(a);
    }
  });
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
    gap: 12,
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 4,
    marginBottom: 4,
  },
  empty: {
    textAlign: 'center',
    marginTop: 40,
    fontSize: 15,
  },
  swipeContainer: {
    borderRadius: 12,
  },
  rowCard: {
    padding: 16,
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
  divider: {
    height: StyleSheet.hairlineWidth,
  },
});
