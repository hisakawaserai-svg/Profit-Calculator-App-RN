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
//
// 上部の割り付けは案 36b（SPEC-V4 §6 / UI-SPEC §1.5。Step 5）:
//   ヘッダ ＋ 月バー（右端に ▽）＋ 青い行（絞り込み中だけ）＋ 集計段（収支が主役）
//   - **種別セグメントは廃止**。種別・販売サイト・タグの 3 条件は ▽ から開く絞り込みページに一本化
//     （記録タブと同じ画面。§4.2 / §6）
//   - **青い行は月バーの直下**。集計段の中に入れると、絞り込みの有無で集計とグラフの距離が変わる
//   - 絞り込みの state はデータタブの Stack が持つ（RecordFilterState）。
//     記録タブとは**別の Provider** なので共有されない（決定 §9-9）
import { Ionicons } from '@expo/vector-icons';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { BarChart } from 'react-native-gifted-charts';
import Svg, { Circle, Polyline } from 'react-native-svg';

import { DataSummaryBar, type DataSummaryValue } from '@/components/DataSummaryBar';
import { FilterNoticeRow } from '@/components/FilterNoticeRow';
import { MonthNavBar } from '@/components/MonthNavBar';
import { PeriodSheet } from '@/components/PeriodSheet';
import { RecordRow } from '@/components/RecordRow';
import { toMonthKey } from '@/db/dates';
import type { AggregatedPoint } from '@/db/repository';
import type { SaleRecord } from '@/db/schema';
import { useAnalyticsData } from '@/db/useRecords';
import { useTagList } from '@/db/useTags';
import {
  chartSpan,
  cumulativeProfits,
  densifySeries,
  dualAxisBounds,
  formatChartLabel,
  formatPointDate,
  labelSlotIndices,
  nearestRecordedIndex,
  type ChartPoint,
  type ChartUnit,
  type DualAxisBounds,
} from '@/logic/analytics';
import { formatCompactYen, formatSignedYenSymbol, formatYenSymbol } from '@/logic/format';
import type { Period } from '@/logic/period';
import {
  CHART_UNIT_NOTE,
  CLEAR_SELECTION_LABEL,
  CUMULATIVE_PROFIT_LABEL,
  EXPENSES_LABEL,
  FILTER_LABEL,
  PROFIT_TREND_LABEL,
  TOTAL_SALES_LABEL,
  chartBarLegendLabel,
  cumulativeValueLabel,
  periodProfitLabel,
  selectedPointTitle,
} from '@/logic/labels';
import {
  activeFilterCount,
  filterSummaryText,
  pruneMissingTags,
  toFilterConditions,
  type RecordFilterDraft,
} from '@/logic/recordFilter';
import { useRecordFilterState } from '@/screens/RecordFilterState';
import { useThemeColors } from '@/theme';

/** 0 より上の描画高さ（負の段がないときの本体の高さ） */
const CHART_HEIGHT = 220;
/**
 * 本体の高さの**上限**（0 より下の段を含めた合計）。
 *
 * 描画域は「0 より上（CHART_HEIGHT）＋ 0 より下（段の高さ × sectionsBelow）」で伸びるので、
 * 大きな赤字が 1 日でもあると下の段が一気に増える ── 収支 +7,475 の月に −19,910 の日が入ると
 * 下が 8 段（586pt）付き、合計 806pt でカードが画面からはみ出した（実機で確認）。
 *
 * そこで**合計がこの値を超えたら、上下を同じ倍率で縮める。** 段の高さは上下で等しいままなので、
 * **0 の高さが両者で揃う決定（§1.5）も、目盛りと罫線の対応もそのまま保たれる** ──
 * 変わるのは 1 段あたりの pt だけ。段を間引いたり軸を切ったりはしない（棒が軸から飛び出す）。
 */
const CHART_MAX_HEIGHT = 300;

/**
 * 実際に使う高さ（0 より上 / 合計）。負の段のぶんだけ下に伸び、上限を超えたら一様に縮める。
 * 棒・折れ線・目盛り・タップ列がすべてこの値を共有する（別々に持つと位置がずれる）。
 */
function chartHeights(bounds: DualAxisBounds): ChartHeights {
  const steps = bounds.sections + bounds.sectionsBelow;
  const rawTotal = (CHART_HEIGHT / bounds.sections) * steps;
  const scale = rawTotal > CHART_MAX_HEIGHT ? CHART_MAX_HEIGHT / rawTotal : 1;
  const above = CHART_HEIGHT * scale;
  return { above, total: rawTotal * scale, top: above * CHART_TOP_PADDING_RATIO };
}

/** 本体の高さと、上端の余白。**重ねる 4 つ（棒・折れ線・目盛り・タップ列）が全部これを見る** */
type ChartHeights = {
  /** 0 より上の高さ（BarChart の height） */
  above: number;
  /** 0 より下の段を含めた合計 */
  total: number;
  /** 本体の上端がカードの上端から下がる量（ライブラリの yAxisExtraHeight） */
  top: number;
};
/**
 * 画面とカードの左右の余白（16 × 2 + 16 × 2）。本体の幅はここを引いた残り全部になる。
 *
 * **Y 軸のラベル列は左右とも持たない**（UI-SPEC §1.5。案 37b）。旧構成は左 52pt ＋ 右 52pt の
 * 計 104pt をラベルの列に使っており、402pt 幅の画面で本体が 234pt しか残らず、
 * 左右から圧迫されて見えていた。目盛りの数字を**本体の内側に薄く重ねる**（YAxisTicks）ことで
 * 104pt がまるごと空き、本体は 338pt になる（約 1.44 倍）。
 *
 * ライブラリは `yAxisLabelWidth` ＋ `yAxisThickness` ぶん本体を右へずらすので、どちらも 0 にして
 * 本体の左端をカードの左端に合わせる ── 自前で重ねる折れ線・タップ列・目盛り・吹き出しが
 * すべて同じ原点（0）から並べられる。
 */
const CHART_HORIZONTAL_INSET = 64;
/** X 軸ラベルを出すスロットの目安の数（Swift 版 AxisMarks(desiredCount: 5)）。両端は必ず打つ */
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
/**
 * 末尾のラベルと直前のラベルの間に最低限空ける距離（中心どうし）。
 *
 * 枠は 36pt だが、**枠ぶんだけでは足りない** ── 負の棒ではライブラリがラベルの置き方を
 * 変えるので、枠の中で文字が寄る。実測では 52pt（2 スロット）で隣と地続きに見えた。
 * 枠 ＋ 余白で 60pt を要求し、足りなければ直前のラベルを落として場所を空ける
 * （logic/analytics の labelSlotIndices）。
 */
const X_LABEL_MIN_GAP = 60;

/** ラベルの中央を棒の中央に戻す量（上記）。棒の幅ぶんだけ戻し過ぎないよう半分ずつで打ち消す */
const xLabelShift = (barWidth: number) => (barWidth - X_LABEL_WIDTH) / 2;
/**
 * ライブラリが本体の**上**に足す余白の割合（`yAxisExtraHeight = containerHeight / 20`）。
 *
 * 本体の上端はカードの上端ではなくここから始まるので、自前で重ねる折れ線・目盛り・タップ列も
 * 同じだけ下げる。**高さに比例する**のがポイントで、定数（10pt）で持っていた頃は
 * 通常の高さ（220pt → 11pt）でたまたま合っていただけだった ── 赤字の段が増えて
 * 0 より上が 60pt に縮むと正解は 3pt になり、**7pt 下にずれて +5,210 円の累計が
 * 0 の線より下に描かれた**（実機で確認）。
 */
const CHART_TOP_PADDING_RATIO = 1 / 20;
/** 目盛りの数字を罫線から浮かせる量（線に文字が乗ると数字も線も読みにくい） */
const TICK_LABEL_LIFT = 13;
/**
 * 選択中の点に置く丸印の半径（UI-SPEC §1.5-4）。線の太さ（2pt）に対して見つけやすく、
 * かつ線の形を隠さない大きさ。地の色の輪（2pt）が外側に付く。
 */
const SELECTED_DOT_RADIUS = 4;
/**
 * 見出しの下の 1 行の高さ（案 38b）。**選択の有無で変えない** ──
 * 凡例（語）と値（金額）で文字の大きさが違うので、成り行きにするとカードの下が動く。
 */
const HEAD_ROW_HEIGHT = 30;

/**
 * レコード詳細のルート。**データタブ自身の Stack の中**にある入口（UI-SPEC §2）。
 * 画面の実体は記録タブと同じ SaleRecordDetailScreen で、入口だけタブごとに分けてある ──
 * 記録タブのルートへ push すると、詳細から戻ったときに記録タブの一覧に着いてしまうため。
 */
const RECORD_DETAIL_PATHNAME = '/data/record/[id]' as const;

/**
 * 絞り込みページのルート（SPEC-V4 §4.2 / §6）。**データタブ自身の Stack に積む。**
 * 画面の実体は記録タブと同じ RecordFilterScreen で、詳細と同じく入口だけを分けてある。
 */
const DATA_FILTER_PATHNAME = '/data/filter' as const;

export function DataScreen() {
  const colors = useThemeColors();
  const router = useRouter();

  /** 「今日」はマウント時に 1 回だけ決める（月バーの ▶ の基準） */
  const today = useMemo(() => new Date(), []);
  const currentMonthKey = useMemo(() => toMonthKey(today), [today]);

  /**
   * 期間と 3 条件は**データタブの Stack が持つ**（RecordFilterState / SPEC-V4 §6）。
   * 絞り込みが push するページになったので、グラフとページの両方が同じ値を読むため。
   * **記録タブとは別の Provider** なので共有されない（決定 §9-9）。
   */
  const {
    filter: recordFilter,
    setFilter: setRecordFilter,
    period,
    setPeriod,
    clearFilter,
  } = useRecordFilterState();
  /**
   * タップされた棒。**どの絞り込みの下で選んだか**まで持つ（null = 未選択）。
   *
   * 絞り込みを変えると集計対象が変わり、選んでいた棒はもう同じ集合を指していないので外す ──
   * 期間を変えたとき（changePeriod）と同じ扱い。条件は絞り込みページで選んだ瞬間から効く（§4.2）ので、
   * **選んだときの下書きと今の下書きが同じものかを描画時に見て決める**
   * （効果の中で setState すると描画が 2 周する）。
   */
  const [selection, setSelection] = useState<{ key: string; filter: RecordFilterDraft } | null>(
    null,
  );
  const selectedKey = selection != null && selection.filter === recordFilter ? selection.key : null;
  const [showPeriodSheet, setShowPeriodSheet] = useState(false);

  // 青い行の文言に要るタグ名（§4.3）。候補の一覧そのものは絞り込みページ側が引く
  const { tags } = useTagList();

  // データタブは状態を持たない（isSold = true 固定。SPEC §6.2）ので、
  // toFilterConditions には常に true を渡す ── 販売サイトの条件が落ちる分岐は起きない（§6）
  const { kind, siteName, tagIds } = useMemo(
    () => toFilterConditions(recordFilter, true),
    [recordFilter],
  );
  const filter = useMemo(
    () => ({ period, kind, siteName, tagIds }),
    [period, kind, siteName, tagIds],
  );
  // 刻みは期間から自動で決まる（§5-5）。画面に切替は出さず、凡例の語で示すだけ。
  // 全期間の刻みは対象の月数で決まり（36 か月超なら年ごと）、判定に最古の月が要るので
  // 取得側が chartUnitFor に決めさせて返す ── 画面はここで分岐しない
  const { summary, series, details, earliestMonthKey, monthsWithRecords, unit } = useAnalyticsData(
    filter,
    selectedKey,
    today,
  );

  // X 軸は日付の軸にする（§1.5-4）。repository が返すのは記録のある点だけなので、
  // 期間の全スロットを作って空きを 0 で埋める ── 7/1 と 7/31 が隣り合わないように
  const densePoints = useMemo(() => {
    const span = chartSpan({ period, earliestMonthKey, today });
    return span == null ? [] : densifySeries(series, unit, span);
  }, [series, unit, period, earliestMonthKey, today]);

  /**
   * 期間の初めからの累計（折れ線）。**画面で 1 回だけ出してグラフと値の行が同じ配列を見る** ──
   * 2 か所で作ると、同じ点の累計が別の計算を通ることになる。
   * 最後の値は集計段の「この月の収支」と必ず一致する（同じ集合の合計。§1.5-4）。
   */
  const cumulative = useMemo(
    () => cumulativeProfits(densePoints.map((point) => point.profit)),
    [densePoints],
  );
  /** 選択中の点の位置。見出しの下の行に出す値を引くのに使う。未選択・範囲外は -1 */
  const selectedIndex = densePoints.findIndex((point) => point.key === selectedKey);

  /** 期間を変えると刻みも集計対象も変わるので、選択中の棒は外す */
  const changePeriod = useCallback(
    (next: Period) => {
      setPeriod(next);
      setSelection(null);
    },
    [setPeriod],
  );

  /**
   * 消えたタグを絞り込みから落とす（§4.7）。記録タブと同じ理由・同じ形 ──
   * 設定タブでタグを消すと tagIds に存在しない id が残り、青い行の文言と条件の数が実体と合わなくなる。
   */
  useFocusEffect(
    useCallback(() => {
      setRecordFilter(pruneMissingTags(recordFilter, tags));
    }, [recordFilter, setRecordFilter, tags]),
  );

  // 行タップ → レコード詳細へプッシュ遷移（UI-SPEC §2）。
  // データタブ自身の Stack に積むので、戻ればこのグラフに帰ってくる（選択したままの状態で）。
  const openDetail = useCallback(
    (record: SaleRecord) => {
      router.push({ pathname: RECORD_DETAIL_PATHNAME, params: { id: record.id } });
    },
    [router],
  );

  /** 絞り込みは push する 1 枚のページ（案 33c）。戻れば結果が見えるので「完了」は要らない */
  const openFilterPage = useCallback(() => router.push(DATA_FILTER_PATHNAME), [router]);

  // 期間を動かした結果、選択中の棒が範囲外に出ていることがある
  const selectedPoint = series.find((point) => point.key === selectedKey);

  /** タップされたスロット → 最も近い「記録のある」スロットを選ぶ（§1.5-4） */
  const selectNearest = useCallback(
    (index: number) => {
      const nearest = nearestRecordedIndex(densePoints, index);
      if (nearest != null) setSelection({ key: densePoints[nearest].key, filter: recordFilter });
    },
    [densePoints, recordFilter],
  );

  const filterCount = activeFilterCount(recordFilter);
  /**
   * 青い行の文言（§4.3）。件数に渡すのは**この条件に合う記録の数**（summary.recordCount）──
   * 記録タブでは「いま一覧に出ている件数」だったが、データタブに一覧はなく、
   * 行の下にあるのはグラフ。**グラフが何件を集計した結果か**を言うのが、
   * 「文のすぐ下にあるものを説明する」という §4.3 の趣旨に合う。
   * 検索欄がないので、記録タブのような「下部の件数との食い違い」も起きない。
   */
  const summaryText = filterSummaryText(recordFilter, tags, summary.recordCount);

  // 集計段は収支が主役（案 36b）。収支だけ期間を冠するのは §1.5-6 の注記どおり、
  // 全期間を選んだときに「全期間の収支」へ変わることを見出しで示すため（記録タブと同じ語）
  const profitValue: DataSummaryValue = {
    label: periodProfitLabel(period),
    value: formatYenSymbol(summary.totalNetProfit),
    // 収支は赤字になり得るので、符号で色を変える（一覧の行・計算タブと同じ規則）
    color: summary.totalNetProfit >= 0 ? colors.green : colors.red,
  };
  const contextValues: [DataSummaryValue, DataSummaryValue] = [
    { label: TOTAL_SALES_LABEL, value: formatYenSymbol(summary.totalSales), color: colors.blue },
    { label: EXPENSES_LABEL, value: formatYenSymbol(summary.totalExpenses), color: colors.red },
  ];

  const screenOptions = useMemo(() => ({ title: 'データ' }), []);

  return (
    <>
      <Stack.Screen options={screenOptions} />
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {/* 2 段目。**右端に絞り込みの入口（▽）**（案 34a-B / 36b）。記録タブと同じ扱いで、
            効いている間は青ベタ。数は出さない ── 条件は下の青い行に文で並ぶ */}
        <MonthNavBar
          period={period}
          earliestMonthKey={earliestMonthKey}
          currentMonthKey={currentMonthKey}
          onChangePeriod={changePeriod}
          onPressTitle={() => setShowPeriodSheet(true)}
          filter={{
            active: filterCount > 0,
            onPress: openFilterPage,
            accessibilityLabel: FILTER_LABEL,
          }}
        />

        {/* 青い行は**月バーの直下**（案 36b）── 集計段とグラフカードの間に挟むと、
            絞り込みの有無で集計とグラフの距離が変わる。ここなら
            「期間 → 絞り込み → その結果」の順に読め、集計とグラフは常に隣り合ったまま */}
        {summaryText != null && (
          <FilterNoticeRow
            text={summaryText}
            onPressFilter={openFilterPage}
            onClear={clearFilter}
          />
        )}

        {/* 集計段（案 36b）。**収支が主役**で、売上と経費は右に小さく積む。
            種別セグメントは廃止し、種別は絞り込みページの 1 節に一本化した（§6） */}
        <DataSummaryBar profit={profitValue} context={contextValues} />

        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={[styles.chartCard, { backgroundColor: colors.secondaryBackground }]}>
            <Text style={[styles.chartTitle, { color: colors.label }]}>
              {PROFIT_TREND_LABEL}
            </Text>
            {/* 見出しの下の 1 行。**未選択なら凡例・選択中は押した点の値**（案 38b）。
                高さは選択の有無で変えない（伸び縮みするとカードの下が動く） */}
            <ChartHeadRow
              unit={unit}
              showCumulative={showsCumulative(densePoints)}
              selected={
                selectedIndex < 0
                  ? null
                  : { point: densePoints[selectedIndex], cumulative: cumulative[selectedIndex] }
              }
            />

            {series.length === 0 ? (
              <EmptyChart />
            ) : (
              <ChartView
                points={densePoints}
                cumulative={cumulative}
                unit={unit}
                selectedIndex={selectedIndex}
                onSelectIndex={selectNearest}
              />
            )}
          </View>

          {selectedPoint && (
            <SelectedPointList
              point={selectedPoint}
              unit={unit}
              details={details}
              onClear={() => setSelection(null)}
              onPressRecord={openDetail}
            />
          )}

          <Text style={[styles.note, { color: colors.secondaryLabel }]}>{CHART_UNIT_NOTE}</Text>
        </ScrollView>
      </View>

      {/* 期間シート（月バー中央タップ）。記録タブと同じ部品（UI-SPEC §1.2） */}
      <PeriodSheet
        visible={showPeriodSheet}
        period={period}
        monthsWithRecords={monthsWithRecords}
        currentMonthKey={currentMonthKey}
        onSelect={changePeriod}
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
 * グラフカードの見出しの下の 1 行（UI-SPEC §1.5-4。案 38b）。**選択の有無で中身が入れ替わる。**
 *
 * | 状態 | 中身 |
 * |---|---|
 * | 未選択 | 凡例 ── ■「日ごとの収支」／ ▬「累計収支」 |
 * | 選択中 | **押した点の値** ── 「8月9日　■ +¥5,210　▬ 累計 ¥5,210」 |
 *
 * **その日の収支と累計は「押した 1 点についての 2 つの値」**なので、同じ行に隣り合わせる ──
 * 離して置くと目が 2 か所を往復する。見本（緑の四角 / 藍の線）を値の隣に置くことで、
 * どちらが棒でどちらが線かが語なしで分かる。
 *
 * **凡例の行を値に貸す**のは、選択中は説明より値のほうが要るため。凡例が消える損は小さい ──
 * 色の対応（緑＝棒 / 藍＝線）は絵の中にそのまま残っている。
 * カードの最上部なので**指で隠れない**（グラフの中に出す形の弱点がここで消える）。
 * 位置が固定なので、点の位置に応じた調整（右端でずらす・上端で寄せる）も要らない。
 *
 * **高さは選択の有無で変えない**（ROW_HEIGHT）── 伸び縮みするとカードの下（グラフ・一覧）が動く。
 *
 * 目盛りを千円・万円に丸めた（案 37b）ので、**その日の実額を読める場所はこの行だけ**になる。
 * 下に出る一覧は 1 件ずつの値で、その日の合計ではない。
 */
function ChartHeadRow({
  unit,
  showCumulative,
  selected,
}: {
  unit: ChartUnit;
  showCumulative: boolean;
  /** 選択中の点と、その点までの累計。null = 未選択（凡例を出す） */
  selected: { point: ChartPoint; cumulative: number } | null;
}) {
  const colors = useThemeColors();

  /** 棒の見本。**選択中はその日の棒と同じ色**にする（赤字の日は赤い棒なので見本も赤） */
  const barSwatchColor =
    selected == null || selected.point.profit >= 0 ? colors.green : colors.red;
  const barSwatch = <View style={[styles.legendBar, { backgroundColor: barSwatchColor }]} />;
  const lineSwatch = <View style={[styles.legendLine, { backgroundColor: colors.indigo }]} />;

  if (selected == null) {
    return (
      <View style={styles.headRow}>
        <View style={styles.legendItem}>
          {/* 見本はグラフの棒そのものの形と色にする（縦長・緑） */}
          {barSwatch}
          <Text style={[styles.legendLabel, { color: colors.secondaryLabel }]}>
            {chartBarLegendLabel(unit)}
          </Text>
        </View>
        {showCumulative && (
          <View style={styles.legendItem}>
            {lineSwatch}
            <Text style={[styles.legendLabel, { color: colors.secondaryLabel }]}>
              {CUMULATIVE_PROFIT_LABEL}
            </Text>
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={styles.headRow}>
      {/* 日付は下の一覧の見出しと同じ粒度で出す（刻みが月なら「2026年8月」。formatPointDate） */}
      <Text style={[styles.valueDate, { color: colors.secondaryLabel }]} numberOfLines={1}>
        {formatPointDate(selected.point.date, unit)}
      </Text>
      <View style={styles.legendItem}>
        {/* 見本も金額も、その日の棒と同じ色（赤字なら赤）。
            画面の棒・見本・金額の 3 つが同じ色で 1 点を指す */}
        {barSwatch}
        <Text
          style={[
            styles.valueAmount,
            { color: selected.point.profit >= 0 ? colors.green : colors.red },
          ]}
          numberOfLines={1}>
          {formatSignedYenSymbol(selected.point.profit)}
        </Text>
      </View>
      {showCumulative && (
        <View style={styles.legendItem}>
          {lineSwatch}
          {/* 累計は折れ線の色（藍）のまま ── 「どの系列か」を色で示しており、
              符号は数字の頭の「-」で読める（緑／赤は棒の側で使っている） */}
          <Text style={[styles.valueAmount, { color: colors.indigo }]} numberOfLines={1}>
            {cumulativeValueLabel(formatYenSymbol(selected.cumulative))}
          </Text>
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
  cumulative,
  unit,
  selectedIndex,
  onSelectIndex,
}: {
  points: ChartPoint[];
  /** 期間の初めからの累計。**画面が作ったものをそのまま受け取る**（見出しの下の行と同じ配列） */
  cumulative: number[];
  unit: ChartUnit;
  /** 選択中のスロットの位置。-1 = 未選択。棒の濃さと折れ線の丸印が同じ値を見る */
  selectedIndex: number;
  onSelectIndex: (index: number) => void;
}) {
  const colors = useThemeColors();
  const { width: windowWidth } = useWindowDimensions();

  const profits = points.map((point) => point.profit);
  const bounds = dualAxisBounds(profits, cumulative);
  // 赤字の段が増えても画面からはみ出さないよう、合計の高さに上限を掛ける（CHART_MAX_HEIGHT）
  const heights = chartHeights(bounds);
  const withCumulative = showsCumulative(points);

  // 軸のラベル列を持たないので、余白を引いた残り**全部**が本体になる
  // （累計の有無で幅が変わらなくなった。CHART_HORIZONTAL_INSET のコメント参照）
  const plotWidth = Math.max(windowWidth - CHART_HORIZONTAL_INSET, 160);
  // 1 スロットの幅。**期間の全スロットを横スクロールなしで収める** ──
  // 月内の分布を一目で読むのがこのグラフの主題で、スクロールするとその一目が失われる
  const pitch = (plotWidth - EDGE_SPACING * 2) / points.length;
  const barWidth = Math.max(2, Math.min(MAX_BAR_WIDTH, pitch * BAR_WIDTH_RATIO));

  // ラベルは全スロットに付けると潰れるので間引く（Swift 版の desiredCount: 5 相当）。
  // **両端を必ず含める** ── 先頭から一定間隔だけで打つと、31 日の月は 29 日で止まって
  // 月末がラベルに現れず、軸の右端が何日なのか読めなくなる（logic/analytics 参照）
  // 「近すぎる」の判定はラベルの幅で行う（X_LABEL_MIN_GAP）。スロット数だけで見ると、
  // 月の日数や端末の幅が変わったときに同じ間隔でも詰まったり空いたりする
  const labeledIndices = new Set(
    labelSlotIndices(points.length, LABEL_COUNT, X_LABEL_MIN_GAP / pitch),
  );

  const barData = points.map((point, index) => {
    // 赤字の日は赤い棒にする（一覧の行・集計段と同じ「符号で色を変える」規則）。
    // 0 より下へ伸びる向きと色の両方で赤字が読める
    const base = point.profit < 0 ? colors.red : colors.green;
    return {
      // 空きスロットも同じ幅の枠として並べる（値 0 なので棒は描かれない）
      value: point.profit,
      label: labeledIndices.has(index) ? formatChartLabel(point.date, unit) : '',
      // 選択中の棒だけ濃く（未選択のときは全点そのままの色）
      frontColor: selectedIndex < 0 || selectedIndex === index ? base : dim(base),
      // 押す判定は上に重ねた列（TapColumns）が持つ
      disablePress: true,
    };
  });

  // 棒・折れ線・タップ列は同じ式（EDGE_SPACING + i × pitch）で並ぶが、X 軸ラベルだけは
  // ライブラリが枠の中央に置くので、枠を広げたぶん右へずれる。ここで棒の中央へ戻す
  const xAxisLabelStyle = {
    color: colors.secondaryLabel,
    fontSize: 10,
    transform: [{ translateX: xLabelShift(barWidth) }],
  };


  return (
    <View>
      <BarChart
        height={heights.above}
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
        // **軸のラベル列は左右とも出さない**（案 37b）。数字は本体の内側に重ねる（YAxisTicks）。
        // 縦線も持たない（yAxisThickness = 0）ので、本体の左端はカードの左端に揃う
        hideYAxisText
        yAxisLabelWidth={0}
        yAxisThickness={0}
        // 0 の線だけ他の罫線より濃くする ── 赤字の棒がどちら向きに伸びているかを
        // 線の位置で読むため。ほかの段は破線の薄い罫線のまま
        xAxisColor={colors.secondaryLabel}
        rulesColor={colors.separator}
        xAxisLabelTextStyle={xAxisLabelStyle}
        labelWidth={X_LABEL_WIDTH}
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

      {/* 目盛りの数字を本体の内側に重ねる（案 37b）。軸のラベル列を外した代わり */}
      <YAxisTicks bounds={bounds} heights={heights} showCumulative={withCumulative} />

      {withCumulative && (
        <CumulativeLine
          values={cumulative}
          bounds={bounds}
          heights={heights}
          pitch={pitch}
          barWidth={barWidth}
          selectedIndex={selectedIndex}
        />
      )}

      <TapColumns
        count={points.length}
        pitch={pitch}
        top={heights.top}
        height={heights.total}
        onSelectIndex={onSelectIndex}
      />
    </View>
  );
}

/**
 * Y 軸の目盛りを**本体の内側に重ねる**（UI-SPEC §1.5「目盛りはキリのいい数」。案 37b）。
 *
 * 左右のラベル列（52pt × 2）を外して空けた 104pt を本体に回すための形。数字は罫線の
 * **すぐ上に左寄せ**で置き、本体に薄く重ねる ── 月初に大きい棒が立つと左上の数字と
 * 重なり得るので、**カードの地の色で縁取り**（textShadow）して棒の上でも読めるようにする。
 * RN の Text に本物の縁取りはないので、地の色の影を半径付きで置いて背後を白く抜く。
 *
 * 値の書式は formatCompactYen（「9千円」「30万円」）── **単位はラベル 1 つずつに書き切る。**
 * 軸の上にバッジで 1 回だけ出す形は、見落としたときに 10 倍・100 倍を読み違える。
 * 0 だけは単位を付けない（0 の線は濃さで位置を読ませる。BarChart の xAxisColor）。
 *
 * 段の位置はライブラリの罫線とまったく同じ式で出す（段の高さ = 0 より上の高さ ÷ sections）ので、
 * 数字と罫線がずれない。0 より下の段（赤字）も同じ間隔で下へ続く。
 */
function YAxisTicks({
  bounds,
  heights,
  showCumulative,
}: {
  bounds: DualAxisBounds;
  heights: ChartHeights;
  /** 折れ線を出しているか。出していないなら累計の目盛りも要らない */
  showCumulative: boolean;
}) {
  const colors = useThemeColors();

  const barStepValue = bounds.barMax / bounds.sections;
  const cumulativeStepValue = bounds.cumulativeMax / bounds.sections;
  const stepHeight = heights.above / bounds.sections;

  /**
   * **累計の目盛りは、棒と目盛りが違うときだけ右に出す。**
   * 同じなら左の数字がそのまま両方に当てはまるので、同じ数字を 2 列並べない。
   */
  const showCumulativeTicks = showCumulative && bounds.cumulativeMax !== bounds.barMax;

  // 下端（-sectionsBelow 段）から上端（sections 段）まで。0 の段も含む
  const levels = Array.from(
    { length: bounds.sections + bounds.sectionsBelow + 1 },
    (_, index) => index - bounds.sectionsBelow,
  );
  /** 罫線の「すぐ上」に浮かせる（線に文字が乗ると数字も線も読みにくい） */
  const topOf = (level: number) =>
    heights.top + heights.above - level * stepHeight - TICK_LABEL_LIFT;

  return (
    <View style={styles.tickOverlay} pointerEvents="none">
      {levels.map((level) => (
        <Text
          key={level}
          style={[
            styles.tickLabel,
            styles.tickLabelLeft,
            {
              color: colors.secondaryLabel,
              textShadowColor: colors.secondaryBackground,
              top: topOf(level),
            },
          ]}>
          {formatCompactYen(level * barStepValue)}
        </Text>
      ))}

      {/* 累計の目盛り（案 39b）。**線と同じ藍で右端に**出して、どちらの数字かを色と位置で分ける。
          0 の段は出さない ── 0 はどちらの軸でも 0 で、左の「0」が線の位置を示している */}
      {showCumulativeTicks &&
        levels
          .filter((level) => level !== 0)
          .map((level) => (
            <Text
              key={level}
              style={[
                styles.tickLabel,
                styles.tickLabelRight,
                {
                  color: colors.indigo,
                  textShadowColor: colors.secondaryBackground,
                  top: topOf(level),
                },
              ]}>
              {formatCompactYen(level * cumulativeStepValue)}
            </Text>
          ))}
    </View>
  );
}

/** 累計の値 → 本体の中の y（0 が下端・cumulativeMax が上端の線形写像。線・丸印が共有する） */
function cumulativeY(value: number, bounds: DualAxisBounds, above: number): number {
  return above * (1 - value / bounds.cumulativeMax);
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
 * y は「0 が下端・上限が上端」の線形写像で、棒と同じ描画高さ（chartHeights）を共有する。
 *
 * **案 37b で右軸の目盛りを外したあとも、この座標系（dualAxisBounds の cumulativeMax）は要る。**
 * 消えたのはラベルの列だけで、線を描く写像も「0 の高さを棒と揃える」決定もそのまま
 * （§1.5「目盛りはキリのいい数」）。最後の値は右端のピル（CumulativePill）が数字で言う。
 */
function CumulativeLine({
  values,
  bounds,
  heights,
  pitch,
  barWidth,
  selectedIndex,
}: {
  values: number[];
  bounds: DualAxisBounds;
  /** 本体の高さと上端の余白。棒と同じものを使うので線がずれない */
  heights: ChartHeights;
  pitch: number;
  barWidth: number;
  /** 選択中のスロットの位置。-1 = 未選択（丸印を出さない） */
  selectedIndex: number;
}) {
  const colors = useThemeColors();

  // 0 より下の段ぶんだけ描画域が下に伸びる（段の高さは上下で同じ）
  const height = heights.total;

  /** スロット i の中心。棒・タップ列と同じ式（同じ式を使うので位置が必ず揃う） */
  const x = (index: number) => EDGE_SPACING + index * pitch + barWidth / 2;

  const polyline = values
    .map((value, index) => `${x(index)},${cumulativeY(value, bounds, heights.above)}`)
    .join(' ');

  return (
    <Svg
      style={[styles.lineOverlay, { top: heights.top, height }]}
      pointerEvents="none">
      <Polyline
        points={polyline}
        fill="none"
        stroke={colors.indigo}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* 選択中の点の丸印（UI-SPEC §1.5-4）。**線と同じ式で置く**ので、棒の中心の真上・
          その点の累計の高さに必ず来る。地の色の輪で線から浮かせ、線の上でも点として見える。
          押す必要はない（判定は TapColumns が持つ）ので、当たり判定は与えない */}
      {selectedIndex >= 0 && (
        <Circle
          cx={x(selectedIndex)}
          cy={cumulativeY(values[selectedIndex], bounds, heights.above)}
          r={SELECTED_DOT_RADIUS}
          fill={colors.indigo}
          stroke={colors.secondaryBackground}
          strokeWidth={2}
        />
      )}
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
  top,
  height,
  onSelectIndex,
}: {
  count: number;
  pitch: number;
  /** 本体の上端（ライブラリの上の余白ぶん下がる） */
  top: number;
  /** 本体の合計の高さ（0 より下の段を含む）。棒と同じ値でないと押せない帯ができる */
  height: number;
  onSelectIndex: (index: number) => void;
}) {
  return (
    <View style={[styles.tapColumns, { left: EDGE_SPACING, top, height }]} pointerEvents="box-none">
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
  // 見出しの下の 1 行（凡例 ⇄ 押した点の値）。**高さを固定**して、
  // 入れ替わってもカードの下（グラフ・一覧）が動かないようにする（案 38b）
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: HEAD_ROW_HEIGHT,
    // 2 つで 1 組。左端から順に並べる（右軸が無くなり、右へ寄せる理由も消えた。案 37b）
    gap: 14,
  },
  // 押した点の日付。値より一段落として、金額のほうへ目が行くようにする
  valueDate: {
    flexShrink: 1,
    fontSize: 12,
  },
  // 押した点の金額。見本（緑の四角 / 藍の線）の隣に置いて、どちらの値かを語なしで示す
  valueAmount: {
    fontSize: 13,
    fontWeight: '700',
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
  // 累計の折れ線。棒と同じ座標系に重ねる（軸の列がないので原点は本体の左端そのもの）
  lineOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  // 目盛りの数字。本体に重ねるだけなので当たり判定は持たない（pointerEvents="none"）
  tickOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  tickLabel: {
    position: 'absolute',
    fontSize: 10,
    // 地の色の影で背後を抜き、棒に重なっても数字が読めるようにする（縁取りの代用）
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 3,
  },
  // 左＝棒の目盛り（グレー）／右＝累計の目盛り（藍）。どちらの数字かを色と位置で分ける
  tickLabelLeft: {
    left: 0,
  },
  tickLabelRight: {
    right: 0,
    textAlign: 'right',
  },
  // グラフに重ねる透明な列。高さいっぱいなので縦方向は狙わなくてよい
  tapColumns: {
    position: 'absolute',
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
