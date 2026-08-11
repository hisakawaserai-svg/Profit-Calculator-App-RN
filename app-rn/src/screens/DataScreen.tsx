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
//   この画面はレコードを 1 件もループしない。読むレコード実体は「タップされた点の内訳」だけ。
// - 丸めは合算後の表示の瞬間のみ（決定 §7-2 / §2.6）。金額表示は format を通す。
// - 内訳の行は記録タブと同じ RecordRow を共用する（§6-11）。
// - グラフは棒（刻みごとの収支・左軸）と折れ線（累計収支・右軸）の組み合わせ（§1.5-4）。
//   棒タップでその日の記録が下に並ぶ。
import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { BarChart } from 'react-native-gifted-charts';
import Svg, { Polyline } from 'react-native-svg';

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
  chartSpan,
  chartUnitFor,
  cumulativeProfits,
  densifySeries,
  dualAxisBounds,
  formatChartLabel,
  formatPointDate,
  nearestRecordedIndex,
  type ChartPoint,
  type ChartUnit,
  type DualAxisBounds,
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
  CUMULATIVE_PROFIT_LABEL,
  EXPENSES_LABEL,
  PROFIT_TREND_LABEL,
  TOTAL_SALES_LABEL,
  chartBarLegendLabel,
  periodProfitLabel,
  selectedPointTitle,
} from '@/logic/labels';
import { useThemeColors } from '@/theme';

const CHART_HEIGHT = 220;
/** Y 軸ラベルの幅。グラフ本体の幅を画面幅から引くのに使う */
const Y_AXIS_WIDTH = 52;
/** X 軸ラベルを出す点の目安の数（Swift 版 AxisMarks(desiredCount: 5)） */
const LABEL_COUNT = 5;
/** 軸の内側の余白（左右）。1 本目・最後の棒が軸に張り付かないようにする */
const EDGE_SPACING = 12;
/** 棒の太さの上限と、スロット幅に対する比率（日付の軸ではスロットが細くなるため） */
const MAX_BAR_WIDTH = 12;
const BAR_WIDTH_RATIO = 0.6;
/**
 * X 軸ラベルの枠幅。既定では**棒の幅**が枠になるので、日付の軸では棒が細くなったぶん
 * ラベルが「0…」に潰れる。日付 1 つぶん（"08/01"）が入る幅を明示する。
 *
 * ただし枠を広げると**ラベルが棒の右へずれる**。ライブラリは枠を
 * 「左端 = 棒の左端 − spacing/2、幅 = labelWidth + spacing」に置くので、
 * 枠の中央（＝文字の中央）は棒の左端 + labelWidth/2 に来る ── labelWidth が棒の幅と等しい
 * 既定でだけ棒の中央と一致する。広げたぶんは X_LABEL_SHIFT で左へ戻す。
 */
const X_LABEL_WIDTH = 36;

/** ラベルの中央を棒の中央に戻す量（上記）。棒の幅ぶんだけ戻し過ぎないよう半分ずつで打ち消す */
const xLabelShift = (barWidth: number) => (barWidth - X_LABEL_WIDTH) / 2;
/**
 * ライブラリが本体の上に足す余白。gifted-charts-core の
 * `getExtendedContainerHeightWithPadding`（containerHeight + 10）に由来する固定値で、
 * 本体の上端はカードの上端ではなくここから始まる。自前で重ねる折れ線も同じだけ下げる。
 */
const CHART_TOP_PADDING = 10;

/** 種別チップの巡回順（記録タブと同じ「すべて → 不用品 → 仕入品 → すべて」。UI-SPEC §1.2） */
const KIND_CYCLE: KindFilter[] = ['all', 'used', 'sourced'];

/**
 * レコード詳細のルート。**データタブ自身の Stack の中**にある入口（UI-SPEC §2）。
 * 画面の実体は記録タブと同じ SaleRecordDetailScreen で、入口だけタブごとに分けてある ──
 * 記録タブのルートへ push すると、詳細から戻ったときに記録タブの一覧に着いてしまうため。
 */
const RECORD_DETAIL_PATHNAME = '/data/record/[id]' as const;

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
  // 刻みは期間から自動で決まる（§5-5）。画面に切替は出さず、凡例の語で示すだけ
  const unit = chartUnitFor(monthKey);
  const { summary, series, details, earliestMonthKey, monthsWithRecords } = useAnalyticsData(
    filter,
    unit,
    selectedKey,
  );

  // X 軸は日付の軸にする（§1.5-4）。repository が返すのは記録のある点だけなので、
  // 期間の全スロットを作って空きを 0 で埋める ── 7/1 と 7/31 が隣り合わないように
  const densePoints = useMemo(() => {
    const span = chartSpan({ monthKey, earliestMonthKey, today });
    return span == null ? [] : densifySeries(series, unit, span);
  }, [series, unit, monthKey, earliestMonthKey, today]);

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

  // 行タップ → レコード詳細へプッシュ遷移（UI-SPEC §2）。
  // データタブ自身の Stack に積むので、戻ればこのグラフに帰ってくる（選択したままの状態で）。
  const openDetail = useCallback(
    (record: SaleRecord) => {
      router.push({ pathname: RECORD_DETAIL_PATHNAME, params: { id: record.id } });
    },
    [router],
  );

  // 期間を動かした結果、選択中の棒が範囲外に出ていることがある
  const selectedPoint = series.find((point) => point.key === selectedKey);

  /** タップされたスロット → 最も近い「記録のある」スロットを選ぶ（§1.5-4） */
  const selectNearest = useCallback(
    (index: number) => {
      const nearest = nearestRecordedIndex(densePoints, index);
      if (nearest != null) setSelectedKey(densePoints[nearest].key);
    },
    [densePoints],
  );

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
      <Stack.Screen options={screenOptions} />
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
            <Text style={[styles.chartTitle, { color: colors.label }]}>
              {PROFIT_TREND_LABEL}
            </Text>
            {/* 凡例。棒の側の語が刻み（日ごと / 月ごと）も兼ねる（§1.5-4） */}
            <ChartLegend unit={unit} showCumulative={showsCumulative(densePoints)} />

            {series.length === 0 ? (
              <EmptyChart />
            ) : (
              <ChartView
                points={densePoints}
                unit={unit}
                selectedKey={selectedKey}
                onSelectIndex={selectNearest}
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
        monthsWithRecords={monthsWithRecords}
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
 * 累計の折れ線（と右軸）を出すか。**記録のあるスロットが 2 つ以上あるときだけ**（UI-SPEC §1.5-4）。
 * 1 つしかない期間では累計＝その点自身で、線が引けず軸も左と同じ数字になる。
 * 空きスロットは数に入れない ── 日付の軸にすると空きは常に大量にあるため。
 */
function showsCumulative(points: ChartPoint[]): boolean {
  return points.filter((point) => point.recordCount > 0).length > 1;
}

/**
 * 凡例（UI-SPEC §1.5-4）。棒と折れ線が別々のものを指すので、色見本と語を対で出す。
 * 棒の側の語（「日ごとの収支」）が刻みの表示も兼ねる ── グラフ 1 つに説明を 2 段付けないため。
 *
 * **累計は右端に寄せる。** 累計の軸が右にあるので、凡例も同じ側に置かないと
 * どちらの軸の話なのかを目で往復して探すことになる（左＝左軸、右＝右軸で揃える）。
 */
function ChartLegend({
  unit,
  showCumulative,
}: {
  unit: ChartUnit;
  showCumulative: boolean;
}) {
  const colors = useThemeColors();

  return (
    <View style={styles.legend}>
      <View style={styles.legendItem}>
        {/* 見本はグラフの棒そのものの形と色にする（縦長・緑） */}
        <View style={[styles.legendBar, { backgroundColor: colors.green }]} />
        <Text style={[styles.legendLabel, { color: colors.secondaryLabel }]}>
          {chartBarLegendLabel(unit)}
        </Text>
      </View>
      {showCumulative && (
        <View style={styles.legendItem}>
          <Text style={[styles.legendLabel, { color: colors.secondaryLabel }]}>
            {CUMULATIVE_PROFIT_LABEL}
          </Text>
          <View style={[styles.legendLine, { backgroundColor: colors.indigo }]} />
        </View>
      )}
    </View>
  );
}

/**
 * 収支のグラフ（UI-SPEC §1.5-4）。**棒と折れ線の組み合わせ**:
 *   - 棒（緑・左軸）  = その日／その月の収支
 *   - 折れ線（藍・右軸）= 期間の初めからの累計収支
 *
 * X 軸は**日付の軸**で、記録のない日も同じ幅のスロットを持つ（空きは棒なし・累計は横ばい）。
 * 詰めて並べると 7/1 と 7/31 の 2 件が隣り合ってしまい、間隔が読めなくなるため。
 *
 * 累計は棒より 1 桁以上大きくなるので軸を分ける。分けたうえで **0 の高さと段数は揃える**
 * （範囲の決め方は logic/analytics の dualAxisBounds）── 桁を合わせるために
 * 0 の位置までずらすと、「棒は黒字なのに線は赤字」に見えるような読み違いが起きる。
 *
 * **押す対象は棒ではなくスロットの列**（下記 TapColumns）。日付の軸にしたことで棒は細くなり、
 * 空きスロットには押す実体すらないので、ライブラリの「棒の矩形だけが反応する」判定では
 * 押せないマスが大量にできる。列を押して最も近い棒を選ぶ形にしてある。
 */
function ChartView({
  points,
  unit,
  selectedKey,
  onSelectIndex,
}: {
  points: ChartPoint[];
  unit: ChartUnit;
  selectedKey: string | null;
  onSelectIndex: (index: number) => void;
}) {
  const colors = useThemeColors();
  const { width: windowWidth } = useWindowDimensions();

  const profits = points.map((point) => point.profit);
  const cumulative = cumulativeProfits(profits);
  const bounds = dualAxisBounds(profits, cumulative);
  const withCumulative = showsCumulative(points);

  // 画面の padding (16×2) ＋ カードの padding (16×2) ＋ Y 軸ラベル幅を引いた残り。
  // 右軸を出さないときはそのぶん本体が広く使える
  const plotWidth = Math.max(
    windowWidth - 64 - Y_AXIS_WIDTH * (withCumulative ? 2 : 1),
    160,
  );
  // 1 スロットの幅。**期間の全スロットを横スクロールなしで収める** ──
  // 月内の分布を一目で読むのがこのグラフの主題で、スクロールするとその一目が失われる
  const pitch = (plotWidth - EDGE_SPACING * 2) / points.length;
  const barWidth = Math.max(2, Math.min(MAX_BAR_WIDTH, pitch * BAR_WIDTH_RATIO));

  // ラベルは全スロットに付けると潰れるので間引く（Swift 版の desiredCount: 5 相当）
  const labelStep = Math.max(1, Math.ceil(points.length / LABEL_COUNT));

  const barData = points.map((point, index) => ({
    // 空きスロットも同じ幅の枠として並べる（値 0 なので棒は描かれない）
    value: point.profit,
    label: index % labelStep === 0 ? formatChartLabel(point.date, unit) : '',
    // 選択中の棒だけ濃く（未選択のときは全点そのままの色）
    frontColor:
      selectedKey == null || selectedKey === point.key ? colors.green : dim(colors.green),
    // 押す判定は上に重ねた列（TapColumns）が持つ
    disablePress: true,
  }));

  const axisLabelStyle = { color: colors.secondaryLabel, fontSize: 10 };
  // 棒・折れ線・タップ列は同じ式（EDGE_SPACING + i × pitch）で並ぶが、X 軸ラベルだけは
  // ライブラリが枠の中央に置くので、枠を広げたぶん右へずれる。ここで棒の中央へ戻す
  const xAxisLabelStyle = {
    ...axisLabelStyle,
    transform: [{ translateX: xLabelShift(barWidth) }],
  };
  // 目盛りはキリのいい数（dualAxisBounds）だが、割り算の誤差で末尾に小数が出ることがあるので丸める。
  // 丸めるのは軸ラベルの表示だけで、集計値そのものは丸めない（決定 §7-2）
  const formatYLabel = (label: string) => String(Math.round(Number(label)));

  return (
    <View>
      <BarChart
        height={CHART_HEIGHT}
        width={plotWidth}
        maxValue={bounds.barMax}
        noOfSections={bounds.sections}
        // 収支がマイナスの点を軸下に隠さないための下方向の目盛り（logic/analytics 参照）
        {...(bounds.sectionsBelow > 0
          ? {
              mostNegativeValue: bounds.barMin,
              noOfSectionsBelowXAxis: bounds.sectionsBelow,
            }
          : null)}
        yAxisColor={colors.separator}
        xAxisColor={colors.separator}
        rulesColor={colors.separator}
        yAxisTextStyle={axisLabelStyle}
        xAxisLabelTextStyle={xAxisLabelStyle}
        labelWidth={X_LABEL_WIDTH}
        yAxisLabelWidth={Y_AXIS_WIDTH}
        formatYLabel={formatYLabel}
        {...(withCumulative
          ? {
              // 右軸（累計）。上限・段数は dualAxisBounds が左軸と 0 の高さを揃えて決めている
              secondaryYAxis: {
                maxValue: bounds.cumulativeMax,
                noOfSections: bounds.sections,
                yAxisColor: colors.separator,
                yAxisTextStyle: axisLabelStyle,
                yAxisLabelWidth: Y_AXIS_WIDTH,
                formatYLabel,
                ...(bounds.sectionsBelow > 0
                  ? {
                      mostNegativeValue: bounds.cumulativeMin,
                      noOfSectionsBelowXAxis: bounds.sectionsBelow,
                    }
                  : null),
              },
            }
          : null)}
        initialSpacing={EDGE_SPACING}
        endSpacing={EDGE_SPACING}
        // アニメーション中は描画が追いつかないことがあるため切る
        isAnimated={false}
        data={barData}
        barWidth={barWidth}
        barBorderRadius={Math.min(4, barWidth / 2)}
        spacing={pitch - barWidth}
        frontColor={colors.green}
      />

      {withCumulative && (
        <CumulativeLine
          values={cumulative}
          bounds={bounds}
          pitch={pitch}
          barWidth={barWidth}
        />
      )}

      <TapColumns
        count={points.length}
        pitch={pitch}
        onSelectIndex={onSelectIndex}
      />
    </View>
  );
}

/**
 * 累計収支の折れ線（UI-SPEC §1.5-4）。**自前で描く。**
 *
 * ライブラリにも棒グラフへ線を重ねる機能（showLine / lineConfig）はあるが、線を描く SVG の
 * 幅が「Y 軸ラベルぶんだけ足りない」ため、**右端が必ず切れる**（実機で確認: 31 日の月では
 * 26 日目あたりから線が消えた）。線の x 座標には Y 軸ラベル幅が足されるのに、
 * 器の幅にはそれが入っていないため。日付の軸にしてスロットが増えるほど切れ方が目立つ。
 *
 * 自前で描けば、**タップ列（TapColumns）と同じ式で x を出せる**ので棒との位置も必ず揃う。
 * y は「0 が下端・上限が上端」の線形写像で、棒と同じ描画高さ（CHART_HEIGHT）を共有する。
 * 右軸の目盛りは引き続きライブラリの secondaryYAxis が描く（数字だけの担当）。
 */
function CumulativeLine({
  values,
  bounds,
  pitch,
  barWidth,
}: {
  values: number[];
  bounds: DualAxisBounds;
  pitch: number;
  barWidth: number;
}) {
  const colors = useThemeColors();

  // 0 より下の段ぶんだけ描画域が下に伸びる（段の高さは上下で同じ）
  const stepHeight = CHART_HEIGHT / bounds.sections;
  const height = CHART_HEIGHT + stepHeight * bounds.sectionsBelow;
  const y = (value: number) => CHART_HEIGHT * (1 - value / bounds.cumulativeMax);

  const polyline = values
    .map((value, index) => `${EDGE_SPACING + index * pitch + barWidth / 2},${y(value)}`)
    .join(' ');

  return (
    <Svg
      style={[styles.lineOverlay, { left: Y_AXIS_WIDTH, top: CHART_TOP_PADDING, height }]}
      pointerEvents="none">
      <Polyline
        points={polyline}
        fill="none"
        stroke={colors.indigo}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </Svg>
  );
}

/**
 * グラフに重ねる透明な「列」（UI-SPEC §1.5-4）。1 スロット 1 列で、押すと
 * **最も近い記録のある棒**が選ばれる（判定は logic/analytics の nearestRecordedIndex）。
 *
 * ライブラリの押下判定は棒の矩形そのものなので、細い棒・低い棒・空きスロットが押せない。
 * 列は**高さいっぱい**なので、縦方向は狙わなくてよく、横方向だけ合わせればよくなる。
 *
 * 位置は自前で計算する: 本体の左端は Y 軸ラベルぶん内側にあり、そこから
 * `initialSpacing + i × pitch` がスロット i の左端。ライブラリと同じ値を使って並べている。
 */
function TapColumns({
  count,
  pitch,
  onSelectIndex,
}: {
  count: number;
  pitch: number;
  onSelectIndex: (index: number) => void;
}) {
  return (
    <View style={[styles.tapColumns, { left: Y_AXIS_WIDTH + EDGE_SPACING }]} pointerEvents="box-none">
      {Array.from({ length: count }, (_, index) => (
        <Pressable
          key={index}
          style={[styles.tapColumn, { left: index * pitch, width: pitch }]}
          onPress={() => onSelectIndex(index)}
          accessibilityRole="button"
        />
      ))}
    </View>
  );
}

/**
 * 選択した点の記録一覧（UI-SPEC §1.5-5）。
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
  chartTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    // 左＝左軸（棒）／右＝右軸（累計）。凡例の位置と軸の位置を揃える（§1.5-4）
    justifyContent: 'space-between',
    gap: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  // 見本は本体と同じ形にする（棒は縦長・折れ線は横線）
  legendBar: {
    width: 8,
    height: 12,
    borderRadius: 2,
  },
  legendLine: {
    width: 14,
    height: 3,
    borderRadius: 1.5,
  },
  legendLabel: {
    fontSize: 12,
  },
  // 累計の折れ線。棒と同じ座標系（左端は Y 軸ラベルのぶん内側）に重ねる
  lineOverlay: {
    position: 'absolute',
    right: 0,
  },
  // グラフに重ねる透明な列。高さいっぱいなので縦方向は狙わなくてよい
  tapColumns: {
    position: 'absolute',
    top: CHART_TOP_PADDING,
    height: CHART_HEIGHT,
  },
  tapColumn: {
    position: 'absolute',
    top: 0,
    bottom: 0,
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
