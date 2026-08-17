// 記録タブ（UI-SPEC §1.2 / 採用案 8a）。
// 出品中タブ・実績タブ・月別詳細の 3 画面を 1 画面に統合したもの
// （MonthlyRecordListScreen + SaleRecordScreen の後継）。
//
// 上部の固定段は 3 段（SPEC-V4 §4.1 / 決定 §9-1 の改訂欄。案 34a）:
//   ヘッダ（記録 / ⌕ ⇅）＋ 月バー（右端に ▽）＋ 集計段（集計 ＋ 状態セグメント）
// 絞り込み中の青い行は集計段の中に生えるので、段数は増えない（§4.3）。
// 月グループとプレビュー 3 件の構造は廃止し、その期間のレコードをフラットに並べる。
//
// - データ取得は repository（useRecordList 経由）のみ。画面ではクエリも並べ替えも書かない。
// - 状態（売れた記録 / 出品中）は集計段の右のセグメント。押した先が見える形にした（§4.1）。
// - 種別・販売サイト・タグの 3 条件は、月バー右端の ▽ から**push する絞り込みページ**（§4.2 / 案 33c）。
//   巡回チップは廃止 ── 選択肢が 3 つ（種別）で済んでいたから成立していた形で、
//   販売サイトとタグが加わると巡回では表現できない。
// - 絞り込みの state は**記録タブの Stack**（RecordFilterState）。一覧とページの両方が読むため。
//   永続化せず、データタブとも共有しない（決定 §9-9）。
// - 期間は月バー。選べるのは全期間か 1 か月のいずれかだけ（§5-5）。初期表示は今月（§5-14）。
// - 検索は ⌕ を押した間だけヘッダ行に出す。常時表示の検索バーは置かない（§5-10）。
// - 並び替えは ⇅ のシート（採用案 22b）。「項目の行 ＋ 方向の 2 択」で 8 通りを一度に見せる。
//   出品中では販売日の行が消えて 3 行になる（logic/recordSort.ts）。絞り込みの解除は
//   絞り込みシートに一本化したので、シート先頭にあった「絞り込みをすべて解除」は外した（SPEC-V4 §8-6）。
// - スワイプ削除は確認なしで即削除（SPEC §5.4。旧 SaleRecordScreen から移植）。
import { Ionicons } from '@expo/vector-icons';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';

import { EmptyState } from '@/components/EmptyState';
import { HelpButton } from '@/components/HelpButton';
import { HelpSheet } from '@/components/HelpSheet';
import { MonthNavBar } from '@/components/MonthNavBar';
import { PeriodSheet } from '@/components/PeriodSheet';
import { RecordRow } from '@/components/RecordRow';
import { SearchBar } from '@/components/SearchBar';
import { SortSheet } from '@/components/SortSheet';
import { SummaryBar, type SummaryItem } from '@/components/SummaryBar';
import { toMonthKey } from '@/db/dates';
import type { RecordSortType } from '@/db/repository';
import type { SaleRecord, Tag } from '@/db/schema';
import { deleteRecord, useAchievementsData, useRecordList } from '@/db/useRecords';
import { useRecordTags, useTagList } from '@/db/useTags';
import { strikeAchievementsByRecordId, type Achievement } from '@/logic/achievements';
import { formatYenSymbol } from '@/logic/format';
import {
  ADD_RECORD_ACTION_LABEL,
  CANCEL_LABEL,
  DELETE_LABEL,
  EXPENSES_LABEL,
  FILTER_EMPTY_ACTION_LABEL,
  FILTER_EMPTY_TITLE,
  FILTER_LABEL,
  LISTING_COUNT_LABEL,
  NO_RECORDS_EMPTY_BODY,
  NO_RECORDS_EMPTY_TITLE,
  RECORDS_TAB_LABEL,
  SEARCH_LABEL,
  SOLD_RECORDS_LABEL,
  SORT_SHEET_TITLE,
  TOTAL_LISTING_PRICE_LABEL,
  deleteAccessibilityLabel,
  listedItemCountValue,
  periodProfitLabel,
  recordCountValue,
  recordDetailAccessibilityLabel,
} from '@/logic/labels';
import {
  activeFilterCount,
  effectiveFilter,
  filterSummaryText,
  pruneMissingTags,
  toFilterConditions,
} from '@/logic/recordFilter';
import { fallbackSortType, sortRows } from '@/logic/recordSort';
import { useRecordFilterState } from '@/screens/RecordFilterState';
import { RecordFormSheet } from '@/screens/RecordFormSheet';
import { useThemeColors } from '@/theme';

/** リセット時に戻すソート（旧一覧の resetFilter と同じく販売日降順） */
const DEFAULT_SORT: RecordSortType = 'saleDateDesc';

/** 合計行 2 段目のセグメント（§4.1）。並びは「売れた記録 / 出品中」で固定 */
const STATUS_SEGMENTS = [SOLD_RECORDS_LABEL, LISTING_COUNT_LABEL];

/** レコード詳細のルート。月別詳細を廃止して 1 系統に統一した（UI-SPEC §2 / §6-9） */
const RECORD_DETAIL_PATHNAME = '/records/record/[id]' as const;

/** 絞り込みページのルート（SPEC-V4 §4.2 / 採用案 33c）。記録タブの Stack に積む */
const RECORD_FILTER_PATHNAME = '/records/filter' as const;

export function RecordListScreen() {
  const colors = useThemeColors();
  const router = useRouter();

  /** 「今日」はマウント時に 1 回だけ決める（月バーの ▶ の基準・行の経過日数の基準） */
  const today = useMemo(() => new Date(), []);
  const currentMonthKey = useMemo(() => toMonthKey(today), [today]);

  /**
   * 状態・期間・3 条件は**記録タブの Stack が持つ**（RecordFilterState）。
   * 絞り込みが push するページになり（案 33c）、一覧とページの両方が同じ値を読むため。
   * 永続化しない・データタブと共有しないのは元のまま（決定 §9-9）。
   */
  const {
    filter: recordFilter,
    setFilter: setRecordFilter,
    isSoldMode,
    changeSoldMode,
    period,
    setPeriod,
    clearFilter: clearRecordFilter,
  } = useRecordFilterState();
  const [sortType, setSortType] = useState<RecordSortType>(DEFAULT_SORT);
  /** ⌕ でヘッダ行を検索フィールドに差し替えている間だけ true（§5-10） */
  const [searching, setSearching] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [showPeriodSheet, setShowPeriodSheet] = useState(false);
  const [showSortSheet, setShowSortSheet] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showForm, setShowForm] = useState(false);

  // 青い行の文言に要るタグ名（§4.3）。候補の一覧そのものは絞り込みページ側が引く
  const { tags } = useTagList();

  const { kind, siteName, tagIds } = useMemo(
    () => toFilterConditions(recordFilter, isSoldMode),
    [recordFilter, isSoldMode],
  );
  const filter = useMemo(
    () => ({ isSoldMode, period, kind, siteName, tagIds, searchText }),
    [isSoldMode, period, kind, siteName, tagIds, searchText],
  );
  // 合計行は検索を含めない。検索は「探す操作」で、見る対象そのものの限定ではないため
  // （旧月別詳細の summaryFilter と同じ考え方。SPEC-V2 §4.2）。
  // 販売サイトとタグは種別と同じ「限定」なので、こちらには入る（§4.5 の表）
  const summaryFilter = useMemo(
    () => ({ isSoldMode, period, kind, siteName, tagIds }),
    [isSoldMode, period, kind, siteName, tagIds],
  );
  const { records, summary, earliestMonthKey, monthsWithRecords, refresh } = useRecordList(
    filter,
    sortType,
    summaryFilter,
  );

  // 行に出すタグ（§2.3）。並んでいる記録ぶんを 1 本のクエリでまとめて引く（記録ごとに引かない）
  const recordIds = useMemo(() => records.map((record) => record.id), [records]);
  const tagsByRecord = useRecordTags(recordIds);

  // 行に出す⚡一撃バッジ。全記録ぶんの実績評価を 1 回だけ行い（tagsByRecord と同じ「まとめて
  // 引いて Map から読む」形）、行ごとに strikeAchievementForRecord を呼び直したりしない
  // （strikeAchievementsByRecordId のコメント参照。判定の重複・重複表示のどちらも避ける）
  const { achievements: allAchievements } = useAchievementsData();
  const strikeBadges = useMemo(
    () => strikeAchievementsByRecordId(allAchievements),
    [allAchievements],
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
      setRecordFilter(pruneMissingTags(recordFilter, tags));
    }, [recordFilter, setRecordFilter, tags]),
  );

  const closeSearch = useCallback(() => {
    setSearching(false);
    setSearchText('');
  }, []);

  // 効いている条件の数と解除バーの文言は、必ず同じ下書き（状態を織り込んだ後）から作る（§4.3）
  const appliedFilter = effectiveFilter(recordFilter, isSoldMode);
  const filterCount = activeFilterCount(appliedFilter);
  // 青い行の件数は**いま一覧に出ている数**（＝検索も効いた後）。文のすぐ下に並ぶのが
  // その一覧だから。シート下部の「この条件に合う記録 N 件」は検索を含めない数で、別物（§4.6）
  const summaryText = filterSummaryText(appliedFilter, tags, records.length);

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

  /**
   * 状態（売れた記録 / 出品中）の切り替え（採用案 22b）。
   *
   * **isSoldMode が動くのはここだけ**（絞り込みページは読むだけ）なので、
   * 販売日 → 出品日のフォールバックもここで一緒に確定させる。出品中では販売日の行が
   * シートから消えるため、そのままだと「選択中がどこにも無いシート」になる。
   */
  const changeStatus = useCallback(
    (nextIsSold: boolean) => {
      changeSoldMode(nextIsSold);
      setSortType((current) => fallbackSortType(current, nextIsSold));
    },
    [changeSoldMode],
  );

  /** 出品中では販売日の行が消えて 3 行になる（logic/recordSort.ts） */
  const visibleSortRows = useMemo(() => sortRows(isSoldMode), [isSoldMode]);

  /** 絞り込みは push する 1 枚のページ（案 33c）。戻れば結果が見えるので「完了」は要らない */
  const openFilterPage = useCallback(() => router.push(RECORD_FILTER_PATHNAME), [router]);

  // 合計行の出し分け（UI-SPEC §1.2「合計行の出し分け」）
  const summaryItems: SummaryItem[] = isSoldMode
    ? [
        {
          label: periodProfitLabel(period),
          value: formatYenSymbol(summary.totalNetProfit),
          // 収支は赤字になり得るので、符号で色を変える（行の純利益と同じ規則）
          color: summary.totalNetProfit >= 0 ? colors.green : colors.red,
        },
        { label: EXPENSES_LABEL, value: formatYenSymbol(summary.totalExpenses), color: colors.red },
      ]
    : [
        {
          label: LISTING_COUNT_LABEL,
          value: listedItemCountValue(summary.recordCount),
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
                <Text style={[styles.headerAction, { color: colors.blue }]}>{CANCEL_LABEL}</Text>
              </Pressable>
            ),
          }
        : {
            title: RECORDS_TAB_LABEL,
            headerTitle: undefined,
            headerRight: () => (
              <View style={styles.headerButtons}>
                <Pressable
                  onPress={() => setSearching(true)}
                  hitSlop={8}
                  accessibilityLabel={SEARCH_LABEL}>
                  <Ionicons name="search" size={22} color={colors.blue} />
                </Pressable>
                <Pressable
                  onPress={() => setShowSortSheet(true)}
                  hitSlop={8}
                  accessibilityLabel={SORT_SHEET_TITLE}>
                  <Ionicons name="swap-vertical" size={22} color={colors.blue} />
                </Pressable>
                {/* UI-SPEC §1.2-1: ⌕ ・ ⇅ ・ ？ の 3 つ。検索中は行ごと入れ替わるので出ない */}
                <HelpButton onPress={() => setShowHelp(true)} />
              </View>
            ),
          },
    [searching, searchText, closeSearch, colors.blue],
  );

  return (
    <>
      <Stack.Screen options={screenOptions} />
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {/* 2 段目。**右端に絞り込みの入口（▽）**を持つ（案 34a-A / 34a-B）。
            数は出さない ── 効いている条件は下の青い行に文で並ぶ */}
        <MonthNavBar
          period={period}
          earliestMonthKey={earliestMonthKey}
          currentMonthKey={currentMonthKey}
          onChangePeriod={setPeriod}
          onPressTitle={() => setShowPeriodSheet(true)}
          filter={{
            active: filterCount > 0,
            onPress: openFilterPage,
            accessibilityLabel: FILTER_LABEL,
          }}
        />

        {/* 3 段目 = 集計段（左に集計・右に状態セグメント）。絞り込み中はこの中に
            青い行が生えるが、固定段の中なので段数は増えない（案 34a-A / 34a-C） */}
        <SummaryBar
          items={summaryItems}
          segment={{
            options: STATUS_SEGMENTS,
            selectedIndex: isSoldMode ? 0 : 1,
            onChange: (index) => changeStatus(index === 0),
          }}
          filterRow={{
            text: summaryText,
            onPressFilter: openFilterPage,
            onClear: clearRecordFilter,
          }}
        />

        <FlatList
          data={records}
          keyExtractor={(record) => record.id}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          // 件数は**交代制**（案 34a-D）。絞り込み中は青い行の「N件だけ」が担うので、
          // ここには出さない ── 同じ数を 2 か所に出さない
          ListHeaderComponent={
            records.length === 0 || summaryText != null ? null : (
              <Text style={[styles.count, { color: colors.secondaryLabel }]}>
                {recordCountValue(records.length)}
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
          ItemSeparatorComponent={() => (
            <View style={[styles.rowSeparator, { backgroundColor: colors.separator }]} />
          )}
          renderItem={({ item }) => (
            <SwipeToDeleteRow
              record={item}
              isSoldMode={isSoldMode}
              today={today}
              tags={tagsByRecord.get(item.id) ?? []}
              strikeAchievement={strikeBadges.get(item.id) ?? null}
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
          accessibilityLabel={ADD_RECORD_ACTION_LABEL}>
          <Ionicons name="add" size={18} color="#FFFFFF" />
          <Text style={styles.addLabel}>{RECORDS_TAB_LABEL}</Text>
        </Pressable>
      </View>

      {/* 期間シート（月バー中央タップ）。全期間か 1 か月のいずれかを選ぶ（§5-5）。
          データタブと同じ部品を共用する（UI-SPEC §1.2） */}
      <PeriodSheet
        visible={showPeriodSheet}
        period={period}
        monthsWithRecords={monthsWithRecords}
        currentMonthKey={currentMonthKey}
        onSelect={setPeriod}
        onClose={() => setShowPeriodSheet(false)}
      />
      {/* 並び替えシート（⇅。採用案 22b）。項目の行に方向の 2 択を常時出し、8 通りを一度に見せる。
          **先頭の「絞り込みをすべて解除」は外した**（SPEC-V4 §8-6）── 絞り込みの解除は
          絞り込みシート（と解除バー）に一本化し、同じことをする経路を 2 つ作らない */}
      <SortSheet
        visible={showSortSheet}
        title={SORT_SHEET_TITLE}
        rows={visibleSortRows}
        selectedValue={sortType}
        onSelect={setSortType}
        onClose={() => setShowSortSheet(false)}
      />
      <RecordFormSheet visible={showForm} onClose={() => setShowForm(false)} onSaved={refresh} />

      {/* ヘッダの「？」（UI-SPEC §5-9）。記録タブは設定タブとは別スタックなので push しない */}
      {showHelp && (
        <HelpSheet
          entry="recordList"
          onClose={() => setShowHelp(false)}
          onReadAll={() => router.push('/settings/help')}
        />
      )}
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
  tags,
  strikeAchievement,
  onPress,
  onDelete,
}: {
  record: SaleRecord;
  isSoldMode: boolean;
  today: Date;
  tags: readonly Tag[];
  strikeAchievement: Achievement | null;
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
          accessibilityLabel={deleteAccessibilityLabel(record.itemName)}>
          <Text style={styles.deleteLabel}>{DELETE_LABEL}</Text>
        </Pressable>
      )}>
      <Pressable
        style={({ pressed }) => [
          styles.rowCard,
          {
            backgroundColor: pressed ? colors.disabledBackground : colors.secondaryBackground,
          },
        ]}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={recordDetailAccessibilityLabel(record.itemName)}>
        <RecordRow
          record={record}
          isSoldMode={isSoldMode}
          today={today}
          tags={tags}
          strikeAchievement={strikeAchievement}
        />
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
  // カードをやめて**地に貼った行 ＋ 区切り線**にする（設計案 30b）── 1 行あたりの
  // 余白が減り、同じ高さに入る件数が増える。行の切れ目はカードの角ではなく線が示す
  listContent: {
    paddingBottom: 96,
  },
  count: {
    fontSize: 13,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 6,
  },
  swipeContainer: {},
  rowCard: {
    paddingHorizontal: 16,
    // 写真の枠（56pt）と合わせて行の高さを 82pt にする（SPEC-V5 §2.3 / 採用案 41a）
    paddingVertical: 13,
  },
  // 区切り線は行の左端から少し内側に入れる（先頭の商品名の頭に合わせる）
  rowSeparator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 16,
  },
  deleteAction: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
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
