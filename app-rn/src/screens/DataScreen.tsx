// DataView.swift の移植。データタブ＝売却済みレコードのグラフ分析（SPEC §3.2 / §6.2）。
//
// - 対象は isSold = true かつ saleDate 非 null のみ。出品中は一切含まれない。
// - 期間は startDate その日の 00:00:00 〜 endDate その日の 23:59:59.999 の閉区間（決定 §7-10）。
//   境界の正規化は repository が SQL を組む直前に行うので、この画面は日付をそのまま渡す。
// - 集計（Σ salesPrice / Σ netProfit / 単位ごとのグループ化）はすべて repository の
//   SQL 側で完結している。この画面はレコードを 1 件もループしない。読むレコード実体は
//   「タップされた集計点の内訳」だけ。
// - 丸めは合算後の表示の瞬間のみ（決定 §7-2 / §2.6）。金額表示は formatYen を通す。
// - グラフは react-native-gifted-charts。明細＝折れ線 / 日別・月別・年別＝棒グラフ（SPEC §6.2）。
//
// Swift 版はチャート上のタップ位置から最寄りの点を求めてツールチップを重ねていたが、
// RN 版は各点の onPress で選択し、内訳をグラフの下に出す。ツールチップの中身
// （日付・売上・利益）は内訳の見出しに統合した。SPEC §6.2 が求める情報は同じで、
// 指の下に隠れない・スクロール中の座標計算に依存しない、という利点がある。
import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { BarChart, LineChart } from 'react-native-gifted-charts';

import { Accordion } from '@/components/Accordion';
import { DateField } from '@/components/DateField';
import {
  ExpenseDetailSection,
  ProductInfoSection,
} from '@/components/RecordDetailSections';
import { SegmentedControl } from '@/components/SegmentedControl';
import type { AggregatedPoint } from '@/db/repository';
import type { SaleRecord } from '@/db/schema';
import { useAnalyticsData } from '@/db/useRecords';
import {
  CHART_UNITS,
  CHART_UNIT_LABELS,
  METRIC_LABELS,
  METRIC_TYPES,
  defaultPeriod,
  formatChartLabel,
  formatPointDate,
  shiftPeriod,
  yAxisLowerBound,
  yAxisUpperBound,
  type ChartUnit,
  type MetricType,
  type Period,
} from '@/logic/analytics';
import { formatYen } from '@/logic/format';
import { netProfit } from '@/logic/profit';
import { useThemeColors } from '@/theme';

/** SPEC §4.3 DataView の初期状態: 表示単位 = 日別、指標 = 売上金額、期間 = 過去 7 日 */
const INITIAL_UNIT: ChartUnit = 'day';

const CHART_HEIGHT = 220;
/** Y 軸ラベルの幅。グラフ本体の幅を画面幅から引くのに使う */
const Y_AXIS_WIDTH = 52;
/** X 軸ラベルを出す点の目安の数（Swift 版 AxisMarks(desiredCount: 5)） */
const LABEL_COUNT = 5;

export function DataScreen() {
  const colors = useThemeColors();

  const [unit, setUnit] = useState<ChartUnit>(INITIAL_UNIT);
  const [metric, setMetric] = useState<MetricType>('sales');
  const [isAllPeriod, setIsAllPeriod] = useState(false);
  const [period, setPeriod] = useState<Period>(() => defaultPeriod(INITIAL_UNIT));
  /** タップされた集計点のキー。null = 未選択 */
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  // 「全期間を表示」ON なら期間条件なし（SPEC §6.2）
  const range = useMemo(() => (isAllPeriod ? null : period), [isAllPeriod, period]);
  const { summary, series, details } = useAnalyticsData(range, unit, metric, selectedKey);

  /** SPEC §6.2: 表示単位を切り替えたら期間もその単位の既定幅にリセットする */
  const changeUnit = useCallback((index: number) => {
    const nextUnit = CHART_UNITS[index];
    setUnit(nextUnit);
    setPeriod(defaultPeriod(nextUnit));
    setSelectedKey(null);
  }, []);

  /** ◀▶: 開始・終了を単位ぶん平行移動（SPEC §6.2） */
  const shift = useCallback(
    (step: -1 | 1) => {
      setPeriod((current) => shiftPeriod(current, unit, step));
      setSelectedKey(null);
    },
    [unit],
  );

  const setStartDate = useCallback(
    (startDate: Date) => setPeriod((current) => ({ ...current, startDate })),
    [],
  );
  const setEndDate = useCallback(
    (endDate: Date) => setPeriod((current) => ({ ...current, endDate })),
    [],
  );

  // 期間を動かした結果、選択中の点が範囲外に出ていることがある
  const selectedPoint = series.find((point) => point.key === selectedKey);

  const screenOptions = useMemo(
    // タブのラベル（'データ'）は _layout.tsx の title のまま残し、ヘッダーだけ上書きする
    () => ({ headerTitle: '分析データ' }),
    [],
  );

  return (
    <>
      <Tabs.Screen options={screenOptions} />
      <ScrollView
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={styles.scrollContent}>
        <PeriodSettingsSection
          period={period}
          isAllPeriod={isAllPeriod}
          onChangeAllPeriod={setIsAllPeriod}
          onChangeStartDate={setStartDate}
          onChangeEndDate={setEndDate}
        />

        {/* サマリーカード（期間内合計。SPEC §6.2） */}
        <View style={styles.summaryRow}>
          <SummaryMiniBox title="純利益" value={summary.totalNetProfit} color={colors.green} />
          <SummaryMiniBox title="経費" value={summary.totalExpenses} color={colors.red} />
          <SummaryMiniBox title="売上" value={summary.totalSales} color={colors.blue} />
        </View>

        <View style={[styles.chartCard, { backgroundColor: colors.secondaryBackground }]}>
          {/* Swift 版は ◀ / 単位 / 指標 / ▶ を 1 行に並べていたが、
              iPhone の幅ではセグメント 2 つが潰れるので 2 行に分ける */}
          <View style={styles.chartHeader}>
            <MoveButton icon="chevron-back" label="前の期間へ" onPress={() => shift(-1)} />
            <View style={styles.unitPicker}>
              <SegmentedControl
                options={CHART_UNITS.map((value) => CHART_UNIT_LABELS[value])}
                selectedIndex={CHART_UNITS.indexOf(unit)}
                onChange={changeUnit}
              />
            </View>
            <MoveButton icon="chevron-forward" label="次の期間へ" onPress={() => shift(1)} />
          </View>

          <SegmentedControl
            options={METRIC_TYPES.map((value) => METRIC_LABELS[value])}
            selectedIndex={METRIC_TYPES.indexOf(metric)}
            onChange={(index) => setMetric(METRIC_TYPES[index])}
          />

          {series.length === 0 ? (
            <EmptyChart />
          ) : (
            <ChartView
              series={series}
              unit={unit}
              metric={metric}
              selectedKey={selectedKey}
              onSelect={setSelectedKey}
            />
          )}

          {selectedPoint && (
            <DetailList
              point={selectedPoint}
              unit={unit}
              metric={metric}
              details={details}
              onClear={() => setSelectedKey(null)}
            />
          )}
        </View>
      </ScrollView>
    </>
  );
}

/** 期間設定カード（Swift 版 periodSettingsSection） */
function PeriodSettingsSection({
  period,
  isAllPeriod,
  onChangeAllPeriod,
  onChangeStartDate,
  onChangeEndDate,
}: {
  period: Period;
  isAllPeriod: boolean;
  onChangeAllPeriod: (value: boolean) => void;
  onChangeStartDate: (value: Date) => void;
  onChangeEndDate: (value: Date) => void;
}) {
  const colors = useThemeColors();

  return (
    <View style={[styles.card, { backgroundColor: colors.secondaryBackground }]}>
      <View style={styles.toggleRow}>
        <Text style={[styles.toggleLabel, { color: colors.label }]}>全期間を表示</Text>
        <Switch
          value={isAllPeriod}
          onValueChange={onChangeAllPeriod}
          accessibilityLabel="全期間を表示"
        />
      </View>

      {!isAllPeriod && (
        <>
          <View style={[styles.divider, { backgroundColor: colors.separator }]} />
          <DateField label="開始" value={period.startDate} onChangeValue={onChangeStartDate} />
          <DateField label="終了" value={period.endDate} onChangeValue={onChangeEndDate} />
        </>
      )}
    </View>
  );
}

/** サマリーの小箱（Swift 版 summaryMiniBox）。合算済みの値を表示時に丸めるだけ */
function SummaryMiniBox({
  title,
  value,
  color,
}: {
  title: string;
  value: number;
  color: string;
}) {
  const colors = useThemeColors();

  return (
    <View style={[styles.summaryBox, { backgroundColor: colors.secondaryBackground }]}>
      <Text style={[styles.summaryTitle, { color: colors.secondaryLabel }]}>{title}</Text>
      <Text style={[styles.summaryValue, { color }]} numberOfLines={1} adjustsFontSizeToFit>
        {formatYen(value)}
      </Text>
    </View>
  );
}

function MoveButton({
  icon,
  label,
  onPress,
}: {
  icon: 'chevron-back' | 'chevron-forward';
  label: string;
  onPress: () => void;
}) {
  const colors = useThemeColors();

  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.moveButton,
        { backgroundColor: colors.disabledBackground, opacity: pressed ? 0.5 : 1 },
      ]}>
      <Ionicons name={icon} size={18} color={colors.label} />
    </Pressable>
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
 * グラフ本体。明細は折れ線、日別・月別・年別は棒グラフ（SPEC §6.2）。
 * 指標の色は売上 = 青 / 純利益 = 緑。
 */
function ChartView({
  series,
  unit,
  metric,
  selectedKey,
  onSelect,
}: {
  series: AggregatedPoint[];
  unit: ChartUnit;
  metric: MetricType;
  selectedKey: string | null;
  onSelect: (key: string) => void;
}) {
  const colors = useThemeColors();
  const { width: windowWidth } = useWindowDimensions();

  const metricColor = metric === 'sales' ? colors.blue : colors.green;
  const values = series.map((point) => (metric === 'sales' ? point.sales : point.profit));
  const maxValue = yAxisUpperBound(values);
  const minValue = yAxisLowerBound(values);

  // 画面の padding (16×2) ＋ カードの padding (16×2) ＋ Y 軸ラベル幅を引いた残り
  const chartWidth = Math.max(windowWidth - 64 - Y_AXIS_WIDTH, 160);
  // ラベルは全点に付けると潰れるので間引く（Swift 版の desiredCount: 5 相当）
  const labelStep = Math.max(1, Math.ceil(series.length / LABEL_COUNT));

  const data = series.map((point, index) => ({
    value: metric === 'sales' ? point.sales : point.profit,
    label: index % labelStep === 0 ? formatChartLabel(point.date, unit) : '',
    // 選択中の点だけ濃く（未選択のときは全点そのままの色）
    frontColor:
      selectedKey == null || selectedKey === point.key ? metricColor : dim(metricColor),
    dataPointColor:
      selectedKey == null || selectedKey === point.key ? metricColor : dim(metricColor),
    onPress: () => onSelect(point.key),
  }));

  const axisProps = {
    height: CHART_HEIGHT,
    width: chartWidth,
    maxValue,
    noOfSections: 4,
    // 純利益がマイナスの点を軸下に隠さないための下方向の目盛り（logic/analytics 参照）
    ...(minValue < 0 ? { mostNegativeValue: minValue, noOfSectionsBelowXAxis: 2 } : null),
    yAxisColor: colors.separator,
    xAxisColor: colors.separator,
    rulesColor: colors.separator,
    yAxisTextStyle: { color: colors.secondaryLabel, fontSize: 10 },
    xAxisLabelTextStyle: { color: colors.secondaryLabel, fontSize: 10 },
    yAxisLabelWidth: Y_AXIS_WIDTH,
    initialSpacing: 16,
    endSpacing: 16,
    // 常に最新（終了日側）が見えるようにする（Swift 版 chartScrollPosition(initialX: endDate)）
    scrollToEnd: true,
    // アニメーション中は各点の onPress が取りこぼされることがあるため切る
    isAnimated: false,
  };

  return unit === 'record' ? (
    <LineChart
      {...axisProps}
      data={data}
      color={metricColor}
      thickness={2}
      curved
      spacing={44}
      dataPointsRadius={4}
    />
  ) : (
    <BarChart
      {...axisProps}
      data={data}
      barWidth={12}
      barBorderRadius={4}
      spacing={36}
      frontColor={metricColor}
    />
  );
}

/**
 * 選択された集計点の内訳（Swift 版 DetailList）。
 * 見出しには Swift 版がツールチップに出していた日付・売上・利益をそのまま出す。
 * 並び順（指標ごとの降順）は repository が SQL 側で付けている。
 */
function DetailList({
  point,
  unit,
  metric,
  details,
  onClear,
}: {
  point: AggregatedPoint;
  unit: ChartUnit;
  metric: MetricType;
  details: SaleRecord[];
  onClear: () => void;
}) {
  const colors = useThemeColors();

  return (
    <View style={styles.detailList}>
      <View style={styles.detailHeader}>
        <Text style={[styles.detailTitle, { color: colors.label }]}>
          {formatPointDate(point.date, unit)} の内訳
        </Text>
        <Pressable onPress={onClear} hitSlop={8} accessibilityLabel="内訳を閉じる">
          <Ionicons name="close-circle" size={22} color={colors.gray} />
        </Pressable>
      </View>

      <View style={styles.tooltipRow}>
        <Text style={[styles.tooltipValue, { color: colors.blue }]}>
          売上: {formatYen(point.sales)}
        </Text>
        <Text style={[styles.tooltipValue, { color: colors.green }]}>
          利益: {formatYen(point.profit)}
        </Text>
      </View>

      {details.map((record) => (
        <RecordDisclosure key={record.id} record={record} metric={metric} />
      ))}
    </View>
  );
}

/** 内訳 1 件（Swift 版 RecordDisclosure）。開くと商品情報＋費用内訳が出る */
function RecordDisclosure({ record, metric }: { record: SaleRecord; metric: MetricType }) {
  const colors = useThemeColors();
  const isSalesMode = metric === 'sales';
  const accentColor = isSalesMode ? colors.blue : colors.green;
  const amount = isSalesMode ? record.salesPrice : netProfit(record);
  const itemName = record.itemName === '' ? '明細' : record.itemName;

  return (
    <Accordion
      accessibilityLabel={`${itemName} の詳細`}
      containerStyle={{ backgroundColor: colors.background }}
      label={
        <View style={styles.disclosureLabel}>
          <Ionicons name="pricetag" size={20} color={accentColor} />
          <Text style={[styles.disclosureName, { color: accentColor }]} numberOfLines={1}>
            {itemName}
          </Text>
          <Text style={[styles.disclosureCaption, { color: accentColor }]}>
            {isSalesMode ? '売上額：' : '純利益：'}
          </Text>
          <Text style={[styles.disclosureAmount, { color: colors.secondaryLabel }]}>
            {formatYen(amount)}
          </Text>
        </View>
      }>
      <View style={styles.disclosureContent}>
        <ProductInfoSection record={record} />
        <ExpenseDetailSection record={record} />
      </View>
    </Accordion>
  );
}

/** 未選択の点を薄く見せる。テーマのグラフ色（blue / green）は常に #RRGGBB の 7 桁 hex */
function dim(color: string): string {
  return `${color}59`;
}

const styles = StyleSheet.create({
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
    gap: 16,
  },
  card: {
    padding: 16,
    borderRadius: 12,
    gap: 12,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggleLabel: {
    fontSize: 15,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 12,
  },
  summaryBox: {
    flex: 1,
    padding: 10,
    borderRadius: 8,
    gap: 4,
  },
  summaryTitle: {
    fontSize: 12,
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: '700',
  },
  chartCard: {
    padding: 16,
    borderRadius: 12,
    gap: 12,
  },
  chartHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  unitPicker: {
    flex: 1,
  },
  moveButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyChart: {
    height: CHART_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  detailList: {
    gap: 10,
    paddingTop: 4,
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  detailTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  tooltipRow: {
    flexDirection: 'row',
    gap: 16,
  },
  tooltipValue: {
    fontSize: 13,
    fontWeight: '600',
  },
  disclosureLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  disclosureName: {
    fontSize: 15,
    fontWeight: '700',
    flexShrink: 1,
  },
  disclosureCaption: {
    fontSize: 13,
    marginLeft: 'auto',
  },
  disclosureAmount: {
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
  disclosureContent: {
    gap: 16,
    paddingTop: 8,
  },
});
