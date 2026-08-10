// データタブ（UI-SPEC §1.5 / 採用案 7b）。売却済みレコードの収支をグラフで見る画面。
//
// ねらいは「切替を減らし、記録タブと同じ月バー＋固定合計行に揃える」こと。
// 設計案ターン 6 の決定（§6-10）で、旧 DataView が持っていた切替を 3 つとも廃止した:
//   - 指標（売上金額 / 収支）  → 合計行に売上・収支・経費の 3 値を常時出す。グラフは収支のみ
//   - 表示単位（明細/日別/月別/年別） → 期間から自動（月を選択 = 日ごと / 全期間 = 月ごと。§5-5）
//   - 期間指定（開始・終了日と ◀▶ の平行移動） → 月バー＋期間シート（記録タブと同じ部品）
//
// - 対象は isSold = true かつ saleDate 非 null のみ。出品中は一切含まれない（SPEC §6.2）。
// - 集計（Σ salesPrice / Σ netProfit / 刻みごとのグループ化）はすべて repository の SQL 側で完結する。
//   この画面はレコードを 1 件もループしない。読むレコード実体は「タップされた棒の内訳」だけ。
// - 丸めは合算後の表示の瞬間のみ（決定 §7-2 / §2.6）。金額表示は format を通す。
// - 内訳の行は記録タブと同じ RecordRow を共用する（§6-11）。
import { Ionicons } from '@expo/vector-icons';
import { Tabs, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { BarChart } from 'react-native-gifted-charts';

import { FilterChip } from '@/components/FilterChip';
import { MonthNavBar } from '@/components/MonthNavBar';
import { PeriodSheet } from '@/components/PeriodSheet';
import { RecordRow } from '@/components/RecordRow';
import { SummaryBar, type SummaryItem } from '@/components/SummaryBar';
import { toMonthKey } from '@/db/dates';
import type { AggregatedPoint } from '@/db/repository';
import type { SaleRecord } from '@/db/schema';
import { useAnalyticsData } from '@/db/useRecords';
import {
  chartUnitFor,
  formatChartLabel,
  formatPointDate,
  yAxisLowerBound,
  yAxisUpperBound,
  type ChartUnit,
} from '@/logic/analytics';
import { formatYenSymbol } from '@/logic/format';
import {
  DEFAULT_KIND_FILTER,
  kindFilterLabel,
  toKindCondition,
  type KindFilter,
} from '@/logic/kindFilter';
import {
  CHART_UNIT_NOTE,
  CLEAR_SELECTION_LABEL,
  EXPENSES_LABEL,
  PROFIT_TREND_LABEL,
  TOTAL_SALES_LABEL,
  chartUnitLabel,
  periodProfitLabel,
  selectedPointTitle,
} from '@/logic/labels';
import { useThemeColors } from '@/theme';

const CHART_HEIGHT = 220;
/** Y 軸ラベルの幅。グラフ本体の幅を画面幅から引くのに使う */
const Y_AXIS_WIDTH = 52;
/** X 軸ラベルを出す点の目安の数（Swift 版 AxisMarks(desiredCount: 5)） */
const LABEL_COUNT = 5;

/** 種別チップの巡回順（記録タブと同じ「すべて → 不用品 → 仕入品 → すべて」。UI-SPEC §1.2） */
const KIND_CYCLE: KindFilter[] = ['all', 'used', 'sourced'];

/** レコード詳細のルート。記録タブと同じ 1 系統（UI-SPEC §2 / §6-9） */
const RECORD_DETAIL_PATHNAME = '/records/record/[id]' as const;

export function DataScreen() {
  const colors = useThemeColors();
  const router = useRouter();

  /** 「今日」はマウント時に 1 回だけ決める（月バーの ▶ の基準） */
  const today = useMemo(() => new Date(), []);
  const currentMonthKey = useMemo(() => toMonthKey(today), [today]);

  /** 表示中の月キー "YYYY-MM"。null = 全期間。初期表示は今月（§5-14） */
  const [monthKey, setMonthKey] = useState<string | null>(currentMonthKey);
  /** 種別フィルタ（SPEC-V2 §4.2）。絞ると合計・グラフ・内訳のすべてがその種別だけになる */
  const [kindFilter, setKindFilter] = useState<KindFilter>(DEFAULT_KIND_FILTER);
  /** タップされた棒のキー。null = 未選択 */
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [showPeriodSheet, setShowPeriodSheet] = useState(false);

  const filter = useMemo(
    () => ({ monthKey, kind: toKindCondition(kindFilter) }),
    [monthKey, kindFilter],
  );
  // 刻みは期間から自動で決まる（§5-5）。画面に切替は出さず、見出しの右に現在の刻みを表示するだけ
  const unit = chartUnitFor(monthKey);
  const { summary, series, details, earliestMonthKey } = useAnalyticsData(
    filter,
    unit,
    selectedKey,
  );

  /** 期間を変えると刻みも集計対象も変わるので、選択中の棒は外す */
  const changeMonth = useCallback((next: string | null) => {
    setMonthKey(next);
    setSelectedKey(null);
  }, []);

  /** 種別を切り替えると集計対象が変わるので、選択中の棒も外す（期間の変更と同じ扱い） */
  const cycleKindFilter = useCallback(() => {
    setKindFilter((current) => KIND_CYCLE[(KIND_CYCLE.indexOf(current) + 1) % KIND_CYCLE.length]);
    setSelectedKey(null);
  }, []);

  // 行タップ → レコード詳細へプッシュ遷移（記録タブと同じ [id] ルート。UI-SPEC §2）。
  //
  // withAnchor は「別のタブの Stack へ入るときに、その Stack の起点（anchor = 記録の一覧）も
  // 一緒に積む」指定。これがないと記録タブの Stack が詳細 1 枚に置き換わり、
  // 戻るボタンもスワイプバックも出ないまま詰む（実機で確認した）。
  // 起点そのものの宣言は app/(tabs)/records/_layout.tsx の unstable_settings 側にある。
  const openDetail = useCallback(
    (record: SaleRecord) => {
      router.push(
        { pathname: RECORD_DETAIL_PATHNAME, params: { id: record.id } },
        { withAnchor: true },
      );
    },
    [router],
  );

  // 期間を動かした結果、選択中の棒が範囲外に出ていることがある
  const selectedPoint = series.find((point) => point.key === selectedKey);

  // 合計行は 3 値（UI-SPEC §1.5-3）。収支だけ期間を冠するのは §1.5-6 の注記どおり、
  // 全期間を選んだときに「全期間の収支」へ変わることを見出しで示すため（記録タブと同じ語）
  const summaryItems: SummaryItem[] = [
    { label: TOTAL_SALES_LABEL, value: formatYenSymbol(summary.totalSales), color: colors.blue },
    {
      label: periodProfitLabel(monthKey),
      value: formatYenSymbol(summary.totalNetProfit),
      color: colors.green,
    },
    { label: EXPENSES_LABEL, value: formatYenSymbol(summary.totalExpenses), color: colors.red },
  ];

  const screenOptions = useMemo(() => ({ title: 'データ' }), []);

  return (
    <>
      <Tabs.Screen options={screenOptions} />
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <MonthNavBar
          monthKey={monthKey}
          earliestMonthKey={earliestMonthKey}
          currentMonthKey={currentMonthKey}
          onChangeMonth={changeMonth}
          onPressTitle={() => setShowPeriodSheet(true)}
        />

        <SummaryBar
          items={summaryItems}
          trailing={
            <FilterChip
              label={kindFilterLabel(kindFilter)}
              onPress={cycleKindFilter}
              accessibilityLabel={`種別の絞り込み: ${kindFilterLabel(kindFilter)}。押すと切り替える`}
            />
          }
        />

        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={[styles.chartCard, { backgroundColor: colors.secondaryBackground }]}>
            <View style={styles.chartHeader}>
              <Text style={[styles.chartTitle, { color: colors.label }]}>
                {PROFIT_TREND_LABEL}
              </Text>
              {/* 刻みは表示のみ。押しても切り替わらない（§5-5） */}
              <Text style={[styles.chartUnit, { color: colors.secondaryLabel }]}>
                {chartUnitLabel(unit)}
              </Text>
            </View>

            {series.length === 0 ? (
              <EmptyChart />
            ) : (
              <ChartView
                series={series}
                unit={unit}
                selectedKey={selectedKey}
                onSelect={setSelectedKey}
              />
            )}
          </View>

          {selectedPoint && (
            <SelectedPointList
              point={selectedPoint}
              unit={unit}
              details={details}
              onClear={() => setSelectedKey(null)}
              onPressRecord={openDetail}
            />
          )}

          <Text style={[styles.note, { color: colors.secondaryLabel }]}>{CHART_UNIT_NOTE}</Text>
        </ScrollView>
      </View>

      {/* 期間シート（月バー中央タップ）。記録タブと同じ部品（UI-SPEC §1.2） */}
      <PeriodSheet
        visible={showPeriodSheet}
        monthKey={monthKey}
        earliestMonthKey={earliestMonthKey}
        currentMonthKey={currentMonthKey}
        onSelect={changeMonth}
        onClose={() => setShowPeriodSheet(false)}
      />
    </>
  );
}

/** データが 1 点もないときの表示（Swift 版の chart.bar.xaxis プレースホルダ） */
function EmptyChart() {
  const colors = useThemeColors();

  return (
    <View style={styles.emptyChart}>
      <Ionicons name="bar-chart-outline" size={40} color={colors.secondaryLabel} />
      <Text style={{ color: colors.secondaryLabel }}>売却済みのデータがありません</Text>
    </View>
  );
}

/**
 * 収支の棒グラフ（UI-SPEC §1.5-4）。指標が収支だけになったので折れ線の分岐はない。
 * 選択中の棒だけ濃色（緑）、他は 30% 不透明。
 */
function ChartView({
  series,
  unit,
  selectedKey,
  onSelect,
}: {
  series: AggregatedPoint[];
  unit: ChartUnit;
  selectedKey: string | null;
  onSelect: (key: string) => void;
}) {
  const colors = useThemeColors();
  const { width: windowWidth } = useWindowDimensions();

  const values = series.map((point) => point.profit);
  const maxValue = yAxisUpperBound(values);
  const minValue = yAxisLowerBound(values);

  // 画面の padding (16×2) ＋ カードの padding (16×2) ＋ Y 軸ラベル幅を引いた残り
  const chartWidth = Math.max(windowWidth - 64 - Y_AXIS_WIDTH, 160);
  // ラベルは全点に付けると潰れるので間引く（Swift 版の desiredCount: 5 相当）
  const labelStep = Math.max(1, Math.ceil(series.length / LABEL_COUNT));

  const data = series.map((point, index) => ({
    value: point.profit,
    label: index % labelStep === 0 ? formatChartLabel(point.date, unit) : '',
    // 選択中の棒だけ濃く（未選択のときは全点そのままの色）
    frontColor:
      selectedKey == null || selectedKey === point.key ? colors.green : dim(colors.green),
    onPress: () => onSelect(point.key),
  }));

  return (
    <BarChart
      height={CHART_HEIGHT}
      width={chartWidth}
      maxValue={maxValue}
      noOfSections={4}
      // 収支がマイナスの点を軸下に隠さないための下方向の目盛り（logic/analytics 参照）
      {...(minValue < 0 ? { mostNegativeValue: minValue, noOfSectionsBelowXAxis: 2 } : null)}
      yAxisColor={colors.separator}
      xAxisColor={colors.separator}
      rulesColor={colors.separator}
      yAxisTextStyle={{ color: colors.secondaryLabel, fontSize: 10 }}
      xAxisLabelTextStyle={{ color: colors.secondaryLabel, fontSize: 10 }}
      yAxisLabelWidth={Y_AXIS_WIDTH}
      initialSpacing={16}
      endSpacing={16}
      // 常に最新（期間の終わり側）が見えるようにする（Swift 版 chartScrollPosition(initialX: endDate)）
      scrollToEnd
      // アニメーション中は各点の onPress が取りこぼされることがあるため切る
      isAnimated={false}
      data={data}
      barWidth={12}
      barBorderRadius={4}
      spacing={36}
      frontColor={colors.green}
    />
  );
}

/**
 * 選択した棒の記録一覧（UI-SPEC §1.5-5）。
 * 行は記録タブと同じ RecordRow・同じカードの見た目にする（§6-11）── 同じレコードが
 * 画面によって違う形で出ると、どれが同じものか読み直すことになるため。
 * 対象は売却済みだけなので isSoldMode は常に true。
 */
function SelectedPointList({
  point,
  unit,
  details,
  onClear,
  onPressRecord,
}: {
  point: AggregatedPoint;
  unit: ChartUnit;
  details: SaleRecord[];
  onClear: () => void;
  onPressRecord: (record: SaleRecord) => void;
}) {
  const colors = useThemeColors();

  return (
    <View style={styles.selectedList}>
      <View style={styles.selectedHeader}>
        <Text style={[styles.selectedTitle, { color: colors.label }]} numberOfLines={1}>
          {selectedPointTitle(formatPointDate(point.date, unit), point.recordCount)}
        </Text>
        <Pressable onPress={onClear} hitSlop={8} accessibilityRole="button">
          <Text style={[styles.clearSelection, { color: colors.blue }]}>
            {CLEAR_SELECTION_LABEL}
          </Text>
        </Pressable>
      </View>

      {details.map((record) => (
        <Pressable
          key={record.id}
          style={[styles.rowCard, { backgroundColor: colors.secondaryBackground }]}
          onPress={() => onPressRecord(record)}
          accessibilityRole="button"
          accessibilityLabel={`${record.itemName} の詳細`}>
          <RecordRow record={record} isSoldMode />
        </Pressable>
      ))}
    </View>
  );
}

/** 未選択の棒を薄く見せる（UI-SPEC §1.5-4 の「30% 不透明」）。テーマの green は常に 7 桁 hex */
function dim(color: string): string {
  return `${color}4D`;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
    gap: 16,
  },
  chartCard: {
    padding: 16,
    borderRadius: 12,
    gap: 12,
  },
  chartHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  chartTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  chartUnit: {
    fontSize: 13,
  },
  emptyChart: {
    height: CHART_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  selectedList: {
    gap: 10,
  },
  selectedHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
  },
  selectedTitle: {
    flexShrink: 1,
    fontSize: 17,
    fontWeight: '700',
  },
  clearSelection: {
    fontSize: 14,
  },
  // 記録タブのリストの行と同じ形（UI-SPEC §6-11）
  rowCard: {
    padding: 14,
    borderRadius: 12,
  },
  note: {
    fontSize: 12,
    lineHeight: 18,
  },
});
