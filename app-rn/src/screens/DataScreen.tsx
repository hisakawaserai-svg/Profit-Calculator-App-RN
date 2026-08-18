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
import Svg, { Circle, Line, Polyline } from 'react-native-svg';

import { BANNER_UNIT_ID } from '@/ads/adUnits';
import { AchievementsSection, resolveTagFrom, resolveTagNameFrom } from '@/components/AchievementsSection';
import { AdBanner } from '@/components/AdBanner';
import { DataDetailsToggle, type DataDetailItem } from '@/components/DataDetailsToggle';
import { DataModeTabs } from '@/components/DataModeTabs';
import { DataSummaryBar, type DataSummaryValue } from '@/components/DataSummaryBar';
import { FilterNoticeRow } from '@/components/FilterNoticeRow';
import { HelpButton } from '@/components/HelpButton';
import { HelpSheet } from '@/components/HelpSheet';
import type { HelpEntryId } from '@/logic/helpContent';
import { MonthNavBar } from '@/components/MonthNavBar';
import { PeriodComparisonCard } from '@/components/PeriodComparisonCard';
import { PeriodSheet } from '@/components/PeriodSheet';
import { RecordRow } from '@/components/RecordRow';
import {
  TAG_VIEW_MODE_LIST,
  TAG_VIEW_MODE_OVERLAY,
  TagProfitSection,
  TagProfitTrendCard,
  type TagChartBreakdownItem,
  type TagProfitSectionItem,
} from '@/components/TagProfitSection';
import { toMonthKey } from '@/db/dates';
import type { AggregatedPoint } from '@/db/repository';
import type { SaleRecord } from '@/db/schema';
import { useAchievementsData, useAnalyticsData, useTagChartTagDetails } from '@/db/useRecords';
import { useTagList } from '@/db/useTags';
import { strikeAchievementsByRecordId, type Achievement } from '@/logic/achievements';
import {
  chartSpan,
  combinedAxisBounds,
  cumulativeProfits,
  densifySeries,
  dualAxisBounds,
  hasSeparateCumulativeAxis,
  formatChartLabel,
  formatPointDate,
  labelSlotIndices,
  nearestRecordedIndex,
  tagTrendSeries,
  type ChartPoint,
  type ChartUnit,
  type DualAxisBounds,
  type TagSeriesRow,
} from '@/logic/analytics';
import { formatCompactYen, formatSignedYenSymbol, formatYenSymbol } from '@/logic/format';
import type { Period } from '@/logic/period';
import {
  allTagProfits,
  periodProfitPerRecord,
  periodProfitRate,
  tagsWithoutRecords,
  type RankedTagProfit,
} from '@/logic/profit';
import {
  averageSaleDaysLabel,
  chartUnitNote,
  clearSelectionLabel,
  cumulativeProfitLabel,
  dataModeAchievementsLabel,
  dataModeProfitLabel,
  dataModeTagLabel,
  dataTabLabel,
  expensesLabel,
  filterLabel,
  noSoldDataMessage,
  perRecordProfitLabel,
  profitRateLabel,
  profitTrendLabel,
  soldCountLabel,
  totalSalesLabel,
  unclassifiedTagLabel,
  averageSaleDaysValue,
  chartBarLegendLabel,
  cumulativeValueLabel,
  detailsToggleLabel,
  periodProfitLabel,
  perRecordProfitValue,
  profitRateSummaryValue,
  recordCountValue,
  recordDetailAccessibilityLabel,
  selectedRecordsCollapseLabel,
  selectedPointTitle,
  selectedRecordsShowMoreText,
  selectedTagChartTitle,
  selectedTagTitle,
} from '@/logic/labels';
import {
  activeFilterCount,
  filterSummaryText,
  pruneMissingTags,
  toFilterConditions,
  type RecordFilterDraft,
} from '@/logic/recordFilter';
import { useRecordFilterState } from '@/screens/RecordFilterState';
import { useLocale } from '@/settings';
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
 * X 軸ラベルの枠幅。**刻みで変える**（枠の中央を棒の中央に合わせて置く。XAxisLabels）。
 *
 * 日ごと（"08/01"）と年ごと（"2025"）は 36pt に収まるが、**月ごと（"2025/09"）は入らず、
 * 「2025…」と切り詰められていた**（実機で確認。年・全期間はどちらも月ごとの刻みなので、
 * この 2 つの表示だけが壊れて見えていた）。文字を削らずに枠を広げる ──
 * 月ごとのラベルは打つ数がもともと少なく（LABEL_COUNT）、広げても隣と当たらない。
 */
const X_LABEL_WIDTH: Record<ChartUnit, number> = { day: 36, month: 50, year: 36 };
/**
 * 末尾のラベルと直前のラベルの間に最低限空ける距離（中心どうし）。
 * 枠（36pt）に余白を足した 60pt を要求し、足りなければ直前のラベルを落として場所を空ける
 * （logic/analytics の labelSlotIndices）。
 */
const X_LABEL_MIN_GAP = 60;

/** X 軸ラベルを 0 の線からどれだけ下げるか（XAxisLabels）。線に文字が乗らない最小限 */
const X_LABEL_TOP_GAP = 6;
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

/**
 * データタブのセグメント（「収支」/「タグ」/「実績」）。計算タブの mode と同じ、画面内だけの
 * 一時的な状態。実績は月バー・絞り込みを見ない別の母集団（useAchievementsData 参照）なので、
 * 3 つ目の値としてだけ追加し、収支・タグの分岐には一切手を入れない。
 */
const DATA_MODE_PROFIT = 0;
const DATA_MODE_TAG = 1;
const DATA_MODE_ACHIEVEMENTS = 2;

/**
 * ヘッダの「？」で開く項目（UI-SPEC §5-9）。**モードごとに変える。**
 *
 * 3 つのモードは 1 つの画面に見えるが、読む対象も母集団も違う ── 実績は月バーも
 * 絞り込みも見ない。どのモードでも「グラフの見かた」を先頭に出すと、
 * いま画面に出ていないものの説明から読ませることになる。
 *
 * **セクションの中に「？」を増やさない**（AchievementsSection / TagProfitSection に
 * ボタンを足さない）── ヘッダに 1 つある画面の中にもう 1 つ置くと、
 * 同じ役目の口が 2 か所になり、どちらが何を開くのかを覚える羽目になる。
 */
function helpEntryForMode(mode: number): HelpEntryId {
  if (mode === DATA_MODE_TAG) return 'dataTag';
  if (mode === DATA_MODE_ACHIEVEMENTS) return 'dataAchievements';
  return 'data';
}

export function DataScreen() {
  // 表示語は locale を引数に取る（渡さないと React Compiler が初回の文字列で固定する。
  // src/i18n/index.ts の冒頭）。この購読で言語を変えたときに引き直される
  const locale = useLocale();

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
  /**
   * タップされたタグ別利益ランキングの行（selection と同じ考え方。§1.5-5 のタグ版）。
   * tagId 自体が null を取り得る（未分類）ので、「未選択」は tagSelection が null かどうかで持つ ──
   * selection.key を undefined にはできない（selectedTagId の型と揃えるため tagSelection ごと持つ）。
   */
  const [tagSelection, setTagSelection] = useState<{
    tagId: string | null;
    filter: RecordFilterDraft;
  } | null>(null);
  const selectedTagId =
    tagSelection != null && tagSelection.filter === recordFilter ? tagSelection.tagId : undefined;
  /**
   * タップされた「タグ別純利益の推移」グラフの点（selection と同じ考え方）。
   * 対象タグ（重ねるでチェック中のタグ）は tagTrendSelected（後述）から都度渡すので、
   * ここは日付キーだけ持てば足りる。
   */
  const [tagChartSelection, setTagChartSelection] = useState<{
    key: string;
    filter: RecordFilterDraft;
  } | null>(null);
  const tagChartSelectedKey =
    tagChartSelection != null && tagChartSelection.filter === recordFilter
      ? tagChartSelection.key
      : null;
  /**
   * タグ別純利益の推移グラフの日付内訳、その行をさらにタップして選んだタグ（tagSelection と
   * 同じ考え方）。**選んでいる日付（key）まで一致するときだけ**有効にする ── 日付を選び直したら
   * 別の日の話になるので、前の日で選んでいたタグは自動的に外れる（filter が変わったら selection
   * を捨てるのと同じ理由）。
   */
  const [tagChartTagSelection, setTagChartTagSelection] = useState<{
    key: string;
    tagId: string | null;
    filter: RecordFilterDraft;
  } | null>(null);
  const tagChartSelectedBreakdownTagId =
    tagChartTagSelection != null &&
    tagChartTagSelection.filter === recordFilter &&
    tagChartTagSelection.key === tagChartSelectedKey
      ? tagChartTagSelection.tagId
      : undefined;
  const [showPeriodSheet, setShowPeriodSheet] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  /**
   * 集計段直下の開閉行（案 1c）。「開閉状態は画面遷移や期間切り替えでリセットされてもよい」
   * （保持は不要）ので、期間・絞り込みの変更時に明示的にリセットする処理は持たない。
   */
  const [detailsExpanded, setDetailsExpanded] = useState(false);

  // 青い行の文言に要るタグ名（§4.3）。候補の一覧そのものは絞り込みページ側が引く
  const { tags } = useTagList();
  // タグ名の解決を毎回作り直さない（自己ベストの最多販売タグが 1 回だけ引くコールバック）
  const resolveTagName = useMemo(() => resolveTagNameFrom(locale, tags), [tags, locale]);
  const resolveTag = useMemo(() => resolveTagFrom(tags), [tags]);

  /**
   * 「実績」モード（案 3c）のデータ。**月バー・絞り込みを一切見ない**（useAchievementsData の
   * コメント参照）── 収支/タグの filter とは無関係な、常に全期間・全件の累計・自己ベスト。
   */
  const achievementsData = useAchievementsData();
  // 内訳一覧（SelectedPointList 等）の⚡一撃バッジ用。実績タブと同じ achievementsData から
  // recordId → Achievement の対応表を作るだけ（判定をここで作り直さない。§6-11 の考え方どおり
  // 内訳一覧も記録タブと同じ RecordRow を使うので、バッジも同じ仕組みで揃える）
  const strikeBadges = useMemo(
    () => strikeAchievementsByRecordId(achievementsData.achievements),
    [achievementsData.achievements],
  );

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
  const {
    summary,
    comparison,
    averageSaleDays,
    series,
    details,
    tagDetails,
    tagProfits,
    tagSeries,
    earliestMonthKey,
    monthsWithRecords,
    unit,
  } = useAnalyticsData(filter, selectedKey, today, selectedTagId);

  /** 「収支」/「タグ」の 2 択（計算タブの mode と同じ仕組み）。初期状態は「収支」 */
  const [mode, setMode] = useState(DATA_MODE_PROFIT);
  /** 「タグ」モードの中の「一覧」/「重ねる」の 2 択（TagProfitSection 側）。初期状態は「一覧」 */
  const [tagViewMode, setTagViewMode] = useState(TAG_VIEW_MODE_LIST);

  /**
   * タグ別利益ランキング（「タグ」モード）。純利益の上位 3 件を描画側の形へ組む ──
   * 名前と色は絞り込みシートと同じ tags 一覧（§4.3 で既に引いている）から引く。
   * 消えたタグの id が残っていて名前が引けない行は落とす（表示できないため）。
   */
  const joinTagRanking = useCallback(
    (ranked: RankedTagProfit[]): TagProfitSectionItem[] =>
      ranked.flatMap((item): TagProfitSectionItem[] => {
        if (item.tagId == null) {
          return [{ ...item, name: unclassifiedTagLabel(locale), colorKey: null }];
        }
        const tag = tags.find((candidate) => candidate.id === item.tagId);
        return tag == null ? [] : [{ ...item, name: tag.name, colorKey: tag.colorKey }];
      }),
    [tags, locale],
  );
  const allTagRanking: TagProfitSectionItem[] = useMemo(
    () => joinTagRanking(allTagProfits(tagProfits)),
    [tagProfits, joinTagRanking],
  );
  /**
   * 記録が 1 件も無いタグ（案 2b の下部「記録のない◯タグを見る」）。
   * tagProfits（analyticsProfitByTag の結果）には記録が 1 件以上あるタグしか出てこないので、
   * DB の全タグ一覧（tags）からその集合を引き算するだけで求まる。
   */
  const zeroRecordTags = useMemo(() => tagsWithoutRecords(tags, tagProfits), [tags, tagProfits]);

  // 収支グラフ・タグ別純利益推移グラフが共有する期間の範囲（§1.5-4）。
  // 両方とも同じ span/unit で densifySeries に通すことで、時間軸を必ず揃える
  const span = useMemo(
    () => chartSpan({ period, earliestMonthKey, today }),
    [period, earliestMonthKey, today],
  );
  // X 軸は日付の軸にする（§1.5-4）。repository が返すのは記録のある点だけなので、
  // 期間の全スロットを作って空きを 0 で埋める ── 7/1 と 7/31 が隣り合わないように
  const densePoints = useMemo(
    () => (span == null ? [] : densifySeries(series, unit, span)),
    [series, unit, span],
  );

  /**
   * タグ別純利益の推移（「グラフ」モード）。チェックボックスの候補・初期チェックともランキングの
   * 「すべて見る」と同じ全件（allTagRanking）── 最初から全タグの折れ線を重ねて出す。
   *
   * 期間・絞り込みが変わると対象タグの集合ごと変わるので、選択は毎回そこから作り直す
   * （resetKey が変わったら初期値に戻す。changePeriod で selectedKey をリセットするのと同じ考え方）。
   * モードの切替そのものではリセットしない（allTagRanking の中身が変わらない限り、
   * 「一覧」に切り替えてから戻ってもチェックは保持される）。
   */
  const initialTagTrendSelected = useMemo(
    () => new Set(allTagRanking.map((item) => item.tagId)),
    [allTagRanking],
  );
  const [tagTrendSelected, setTagTrendSelected] = useState(initialTagTrendSelected);
  const tagTrendResetKey = useMemo(
    () => allTagRanking.map((item) => item.tagId ?? unclassifiedTagLabel(locale)).join('|'),
    [allTagRanking, locale],
  );
  const [lastTagTrendResetKey, setLastTagTrendResetKey] = useState(tagTrendResetKey);
  if (tagTrendResetKey !== lastTagTrendResetKey) {
    setLastTagTrendResetKey(tagTrendResetKey);
    setTagTrendSelected(initialTagTrendSelected);
  }
  const toggleTagTrendSelected = useCallback((tagId: string | null) => {
    setTagTrendSelected((current) => {
      const next = new Set(current);
      if (next.has(tagId)) next.delete(tagId);
      else next.add(tagId);
      return next;
    });
  }, []);
  const tagTrendSeriesByTag = useMemo(() => {
    if (span == null) return new Map<string | null, ChartPoint[]>();
    const rows: TagSeriesRow[] = tagSeries;
    return tagTrendSeries(rows, tagTrendSelected, unit, span);
  }, [tagSeries, tagTrendSelected, unit, span]);

  /**
   * 「タグ別純利益の推移」グラフの点タップの内訳（採用案。グラフの下に「◯月のタグ別利益」を出す）。
   * **チェック中のタグに限らず、その月に売れた記録がある全タグ**を対象にする ──
   * 「その月はどのタグが儲かったか」という問いへの答えなので、グラフに重ねて出しているかどうかは
   * 関係が無い（重ねる選択は「いつ儲かっているか比べたいタグ」を選ぶもので、別の軸）。
   *
   * 個々の記録は読まない。tagSeries（analyticsSeriesByTag の結果。useAnalyticsData で既に
   * 引いてある）を選んだ点のキーで絞り込むだけで求まるので、新しい DB クエリは要らない。
   */
  const tagChartBreakdown: TagChartBreakdownItem[] = useMemo(() => {
    if (tagChartSelectedKey == null) return [];
    return tagSeries
      .filter((row) => row.key === tagChartSelectedKey)
      .flatMap((row): TagChartBreakdownItem[] => {
        if (row.tagId == null) {
          return [{ tagId: null, name: unclassifiedTagLabel(locale), colorKey: null, profit: row.profit }];
        }
        const tag = tags.find((candidate) => candidate.id === row.tagId);
        return tag == null
          ? []
          : [{ tagId: row.tagId, name: tag.name, colorKey: tag.colorKey, profit: row.profit }];
      })
      .sort((a, b) => b.profit - a.profit);
  }, [tagSeries, tagChartSelectedKey, tags, locale]);

  /**
   * タグ別内訳（tagChartBreakdown）の行をさらにタップしたときの記録一覧。こちらは集計済みの
   * tagSeries では引けない（記録の実体が要る）ので、SQL に投げる（useAnalyticsData とは別の
   * hook。理由は useTagChartTagDetails のコメントを参照）。
   */
  const tagChartTagDetails = useTagChartTagDetails(
    filter,
    unit,
    tagChartSelectedKey,
    tagChartSelectedBreakdownTagId,
  );

  /**
   * タグ別利益ランキングのスパークライン（案 2b）。ランキングに出る**全タグ**ぶん
   * （チェックボックスの選択状態とは無関係）を、重ねるモードのグラフと同じ span/unit で引く ──
   * 時間軸のルールを 2 か所に分けて持たない。
   */
  const rankedTagIds = useMemo(
    () => new Set(allTagRanking.map((item) => item.tagId)),
    [allTagRanking],
  );
  const sparklineSeriesByTag = useMemo(() => {
    if (span == null) return new Map<string | null, ChartPoint[]>();
    return tagTrendSeries(tagSeries, rankedTagIds, unit, span);
  }, [tagSeries, rankedTagIds, unit, span]);
  /**
   * スパークラインの共通 Y 軸範囲（combinedAxisBounds）。**個々のタグでフィットし直さない** ──
   * 表示中の全タグの値をまとめて 1 回だけ範囲に通し、高さが「そのタグの純利益の多さ」として
   * タグ間で比べられるようにする（TAG_SPARKLINE_NOTE の説明文と対）。
   */
  const sparklineBounds = useMemo(
    () =>
      combinedAxisBounds(
        [...sparklineSeriesByTag.values()].map((points) => points.map((point) => point.profit)),
      ),
    [sparklineSeriesByTag],
  );

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

  /**
   * 凡例の「累計収支」を行の右端へ寄せるか（案 39b の続き）。
   * **右に累計の目盛りが出ているときだけ**寄せる ── 2 軸の上限が一致する期間は
   * 右に数字が出ない（hasSeparateCumulativeAxis）ので、寄せると何も無いところを指してしまう。
   *
   * dualAxisBounds をグラフ本体と 2 回通ることになるが、純粋な算術で入力もここで持っている
   * 配列そのものなので、条件を 2 か所に書き写すより安い。
   */
  const cumulativeOnRight = useMemo(
    () =>
      hasSeparateCumulativeAxis(
        dualAxisBounds(densePoints.map((point) => point.profit), cumulative),
      ),
    [densePoints, cumulative],
  );

  /** 期間を変えると刻みも集計対象も変わるので、選択中の棒は外す */
  const changePeriod = useCallback(
    (next: Period) => {
      setPeriod(next);
      setSelection(null);
      setTagSelection(null);
      setTagChartSelection(null);
    },
    [setPeriod],
  );

  /**
   * タグ別利益ランキングの行タップ → その下に内訳を出す（selectNearest のタグ版）。
   * **選択中の行をもう一度タップすると外れる**（selectNearest と同じトグル。記録一覧を出す
   * 選択はどれも「もう一押しで閉じる」に揃える）── 現在の選択は setState の関数形（current）で
   * 見る。tagId は「未分類」で null を取り得るので、選択なし（tagSelection = null）とは
   * filter を挟んだオブジェクトかどうかで区別する。
   */
  const selectTag = useCallback(
    (tagId: string | null) => {
      setTagSelection((current) =>
        current != null && current.filter === recordFilter && current.tagId === tagId
          ? null
          : { tagId, filter: recordFilter },
      );
    },
    [recordFilter],
  );

  /**
   * 「タグ別純利益の推移」グラフの点タップ → その下に内訳を出す（selectTag と同じ考え方）。
   * **選択中の点をもう一度タップすると外れる**（selectNearest と同じトグル。収支グラフの棒タップと
   * 挙動を揃える。key == null は「×」で明示的に閉じたときの経路で、これは常にそのまま外す）。
   */
  const selectTagChartDate = useCallback(
    (key: string | null) => {
      if (key == null) {
        setTagChartSelection(null);
        return;
      }
      setTagChartSelection((current) =>
        current != null && current.filter === recordFilter && current.key === key
          ? null
          : { key, filter: recordFilter },
      );
    },
    [recordFilter],
  );

  /**
   * その日付内訳の行タップ → その日付・そのタグの記録一覧を出す。selectTagChartDate と違い、
   * 「選んでいる日付」に紐づけて保存する（tagChartSelectedBreakdownTagId の説明を参照）。
   * **選択中の行をもう一度タップすると外れる**（selectTag と同じトグル）。
   */
  const selectTagChartBreakdownTag = useCallback(
    (tagId: string | null) => {
      if (tagChartSelectedKey == null) return;
      setTagChartTagSelection((current) =>
        current != null &&
        current.filter === recordFilter &&
        current.key === tagChartSelectedKey &&
        current.tagId === tagId
          ? null
          : { key: tagChartSelectedKey, tagId, filter: recordFilter },
      );
    },
    [tagChartSelectedKey, recordFilter],
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

  /**
   * タップされたスロット → 最も近い「記録のある」スロットを選ぶ（§1.5-4）。
   * **選択中の棒をもう一度タップすると外れる**（selectTag と同じトグル。記録一覧を出す選択は
   * どれも「もう一押しで閉じる」に揃える）。
   */
  const selectNearest = useCallback(
    (index: number) => {
      const nearest = nearestRecordedIndex(densePoints, index);
      if (nearest == null) return;
      const key = densePoints[nearest].key;
      setSelection((current) =>
        current != null && current.filter === recordFilter && current.key === key
          ? null
          : { key, filter: recordFilter },
      );
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
  const summaryText = filterSummaryText(locale, recordFilter, tags, summary.recordCount);

  // 集計段は収支が主役（案 36b）。収支だけ期間を冠するのは §1.5-6 の注記どおり、
  // 全期間を選んだときに「全期間の収支」へ変わることを見出しで示すため（記録タブと同じ語）
  const profitValue: DataSummaryValue = {
    label: periodProfitLabel(locale, period),
    value: formatYenSymbol(summary.totalNetProfit),
    // 収支は赤字になり得るので、符号で色を変える（一覧の行・計算タブと同じ規則）
    color: summary.totalNetProfit >= 0 ? colors.green : colors.red,
  };
  const contextValues: [DataSummaryValue, DataSummaryValue] = [
    { label: totalSalesLabel(locale), value: formatYenSymbol(summary.totalSales), color: colors.blue },
    { label: expensesLabel(locale), value: formatYenSymbol(summary.totalExpenses), color: colors.red },
  ];

  /**
   * 集計段直下の開閉行の 4 列（案 1c）。**選んだ期間全体**が対象で、棒タップでは変わらない
   * ── summary は月バー直下の集計段（DataSummaryBar）と同じ、絞り込み後の期間合計そのもの。
   * 利益率・1 件あたりはこの画面用の集計（periodProfitRate / periodProfitPerRecord）を通す
   * （合計同士の比率・合計 ÷ 件数。単純平均ではない）。平均販売日数だけは例外で、
   * 1 件ずつの経過日数（elapsedDays）を単純平均する（periodAverageSaleDays）
   * ── 合計同士の比率で出せる値が無いため（日数は記録ごとにしか無い）。
   */
  const detailItems: [DataDetailItem, DataDetailItem, DataDetailItem, DataDetailItem] = [
    {
      label: profitRateLabel(locale),
      value: profitRateSummaryValue(locale, periodProfitRate(summary.totalSales, summary.totalNetProfit)),
      color: colors.label,
    },
    { label: soldCountLabel(locale), value: recordCountValue(locale, summary.recordCount), color: colors.label },
    {
      label: perRecordProfitLabel(locale),
      value: perRecordProfitValue(locale, periodProfitPerRecord(summary.totalNetProfit, summary.recordCount)),
      color: colors.label,
    },
    {
      label: averageSaleDaysLabel(locale),
      value: averageSaleDaysValue(locale, averageSaleDays),
      color: colors.label,
    },
  ];

  // UI-SPEC §1.5-1: ヘッダの右は「？」だけ
  const screenOptions = useMemo(
    () => ({
      title: dataTabLabel(locale),
      headerRight: () => <HelpButton onPress={() => setShowHelp(true)} />,
    }),
    [locale],
  );

  return (
    <>
      <Stack.Screen options={screenOptions} />
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {/* 2 段目。**右端に絞り込みの入口（▽）**（案 34a-B / 36b）。記録タブと同じ扱いで、
            効いている間は青ベタ。数は出さない ── 条件は下の青い行に文で並ぶ */}
        {mode !== DATA_MODE_ACHIEVEMENTS && (
            <MonthNavBar
            period={period}
            earliestMonthKey={earliestMonthKey}
            currentMonthKey={currentMonthKey}
            onChangePeriod={changePeriod}
            onPressTitle={() => setShowPeriodSheet(true)}
            filter={{
              active: filterCount > 0,
              onPress: openFilterPage,
              accessibilityLabel: filterLabel(locale),
            }}
          />
        )}

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

        {/* グラフ・実績と広告をひとまとめにする（記録一覧と同じ形）。この View が flex: 1 なので、
            広告が出るとスクロールできる高さが自動で縮む ── 末尾のカードが広告の裏に回り込まない */}
        <View style={styles.contentArea}>
          {mode === DATA_MODE_PROFIT ? (
            <>
              {/* 集計段（案 36b）。**収支が主役**で、売上と経費は右に小さく積む。
                  種別セグメントは廃止し、種別は絞り込みページの 1 節に一本化した（§6） */}
              <DataSummaryBar profit={profitValue} context={contextValues} />

              {/* 集計段の直下・独立した開閉行（案 1c）。ヘッダー自体には手を入れない */}
              <DataDetailsToggle
                expanded={detailsExpanded}
                onToggle={() => setDetailsExpanded((expanded) => !expanded)}
                toggleLabel={detailsToggleLabel(locale, detailsExpanded)}
                items={detailItems}
              />

              <ScrollView contentContainerStyle={styles.scrollContent}>
                <View style={[styles.chartCard, { backgroundColor: colors.secondaryBackground }]}>
                  {/* 「収支」「タグ」「実績」の 3 択（計算タブの「利益を出す/目標から逆算」と同じ考え方）。
                      カードの上端に置く ── 独立した行として挟むと、その分だけ縦に伸びる */}
                  <DataModeTabs
                    options={[dataModeProfitLabel(locale), dataModeTagLabel(locale), dataModeAchievementsLabel(locale)]}
                    selectedIndex={mode}
                    onChange={setMode}
                  />

                  <Text style={[styles.chartTitle, { color: colors.label }]}>
                    {profitTrendLabel(locale)}
                  </Text>
                  {/* 見出しの下の 1 行。**未選択なら凡例・選択中は押した点の値**（案 38b）。
                      高さは選択の有無で変えない（伸び縮みするとカードの下が動く） */}
                  <ChartHeadRow
                    unit={unit}
                    showCumulative={showsCumulative(densePoints)}
                    cumulativeOnRight={cumulativeOnRight}
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
                    strikeBadges={strikeBadges}
                    onClear={() => setSelection(null)}
                    onPressRecord={openDetail}
                  />
                )}

                <Text style={[styles.note, { color: colors.secondaryLabel }]}>{chartUnitNote(locale)}</Text>

                {/* 前期間比較（新規セクション）。全期間選択中は基準となる前期間が無いので comparison が
                    null になり、そのままセクションごと出ない（logic/periodComparison.ts） */}
                {comparison != null && (
                  <PeriodComparisonCard
                    range={comparison.range}
                    metrics={comparison.metrics}
                  />
                )}
              </ScrollView>
            </>
          ) : mode === DATA_MODE_TAG ? (
            <>
              <DataSummaryBar profit={profitValue} context={contextValues} />

              <DataDetailsToggle
                expanded={detailsExpanded}
                onToggle={() => setDetailsExpanded((expanded) => !expanded)}
                toggleLabel={detailsToggleLabel(locale, detailsExpanded)}
                items={detailItems}
              />

              {mode === DATA_MODE_TAG && (
                <ScrollView contentContainerStyle={styles.scrollContent}>
                  {/* 「グラフ」のときだけ、「収支の推移」カードと同じ位置・同じ仕様で出す。
                      点タップの内訳（タグ別内訳）はこのカードの中に出る（採用案 1a） */}
                  {tagViewMode === TAG_VIEW_MODE_OVERLAY && (
                    <TagProfitTrendCard
                      candidates={allTagRanking}
                      seriesByTag={tagTrendSeriesByTag}
                      overlaySelected={tagTrendSelected}
                      axisPoints={densePoints}
                      unit={unit}
                      selectedKey={tagChartSelectedKey}
                      onSelectKey={selectTagChartDate}
                      viewMode={tagViewMode}
                      onChangeViewMode={setTagViewMode}
                      breakdownItems={tagChartBreakdown}
                      dataMode={mode}
                      onChangeDataMode={setMode}
                      selectedBreakdownTagId={tagChartSelectedBreakdownTagId}
                      onSelectBreakdownTag={selectTagChartBreakdownTag}
                    />
                  )}

                  {tagChartSelectedBreakdownTagId !== undefined && (
                    <SelectedTagChartTagList
                      dateText={formatPointDate(
                        locale,
                        densePoints.find((point) => point.key === tagChartSelectedKey)?.date ?? today,
                        unit,
                      )}
                      tagName={
                        tagChartBreakdown.find((item) => item.tagId === tagChartSelectedBreakdownTagId)
                          ?.name ?? unclassifiedTagLabel(locale)
                      }
                      details={tagChartTagDetails}
                      strikeBadges={strikeBadges}
                      onClear={() => setTagChartTagSelection(null)}
                      onPressRecord={openDetail}
                    />
                  )}

                  <TagProfitSection
                    items={allTagRanking}
                    zeroRecordTags={zeroRecordTags}
                    summary={summary}
                    period={period}
                    sparklineSeriesByTag={sparklineSeriesByTag}
                    sparklineBounds={sparklineBounds}
                    overlaySelected={tagTrendSelected}
                    onToggleOverlay={toggleTagTrendSelected}
                    viewMode={tagViewMode}
                    onChangeViewMode={setTagViewMode}
                    // 「収支 / タグ」タブはタグモードの最初のカードにだけ出す ──
                    // 「グラフ」なら TagProfitTrendCard が先に出ているので、ここには渡さない
                    dataMode={tagViewMode === TAG_VIEW_MODE_LIST ? mode : undefined}
                    onChangeDataMode={tagViewMode === TAG_VIEW_MODE_LIST ? setMode : undefined}
                    selectedTagId={selectedTagId}
                    onSelectTag={selectTag}
                  />

                  {selectedTagId !== undefined && (
                    <SelectedTagList
                      tagName={
                        allTagRanking.find((item) => item.tagId === selectedTagId)?.name ??
                        unclassifiedTagLabel(locale)
                      }
                      details={tagDetails}
                      strikeBadges={strikeBadges}
                      onClear={() => setTagSelection(null)}
                      onPressRecord={openDetail}
                    />
                  )}
                </ScrollView>
              )}
            </>
          ) : mode === DATA_MODE_ACHIEVEMENTS ? (
            // 「実績」モード（案 3c）。月バー・絞り込みを一切見ない別の母集団なので、
            // DataSummaryBar / DataDetailsToggle（収支/タグと共有の期間集計）はここに出さない
            <AchievementsSection
              totals={achievementsData.totals}
              achievements={achievementsData.achievements}
              nextAchievement={achievementsData.nextAchievement}
              personalBests={achievementsData.personalBests}
              resolveTagName={resolveTagName}
              resolveTag={resolveTag}
              dataMode={mode}
              onChangeDataMode={setMode}
            />
          ) : null}
        </View>

        {/* バナー広告。contentArea の兄弟なので、出るとスクロール領域が縮む。
            同意前・初期化前・読み込み失敗のときは何も描画しない（AdBanner が畳む） */}
        <AdBanner unitId={BANNER_UNIT_ID} />
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

      {/* ヘッダの「？」（UI-SPEC §5-9）。データタブも設定タブとは別スタックなので push しない。
          **開く項目は見ているモードで変える** ── 3 つのモードは同じ画面に見えて、
          読む対象も母集団も違う（実績は月バーも絞り込みも見ない）。どのモードでも
          「グラフの見かた」を開くと、いま画面に出ていないものの説明が先頭に来る。
          出す先はどれも同じ「データ」ページなので、チップを 1 つ横へずらせば他の 2 つも読める */}
      {showHelp && (
        <HelpSheet
          entry={helpEntryForMode(mode)}
          onClose={() => setShowHelp(false)}
          onReadAll={() => router.push('/settings/help')}
        />
      )}
    </>
  );
}

/** データが 1 点もないときの表示（Swift 版の chart.bar.xaxis プレースホルダ） */
function EmptyChart() {
  // 表示語は locale を引数に取る（渡さないと React Compiler が初回の文字列で固定する。
  // src/i18n/index.ts の冒頭）。この購読で言語を変えたときに引き直される
  const locale = useLocale();

  const colors = useThemeColors();

  return (
    <View style={styles.emptyChart}>
      <Ionicons name="bar-chart-outline" size={40} color={colors.secondaryLabel} />
      <Text style={{ color: colors.secondaryLabel }}>{noSoldDataMessage(locale)}</Text>
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
  cumulativeOnRight,
  selected,
}: {
  unit: ChartUnit;
  showCumulative: boolean;
  /**
   * 凡例の「累計収支」を右端へ寄せるか。右に累計の目盛りが出ている期間だけ true
   * （呼び出し側の cumulativeOnRight を参照）。選択中の行には効かない。
   */
  cumulativeOnRight: boolean;
  /** 選択中の点と、その点までの累計。null = 未選択（凡例を出す） */
  selected: { point: ChartPoint; cumulative: number } | null;
}) {
  // 表示語は locale を引数に取る（渡さないと React Compiler が初回の文字列で固定する。
  // src/i18n/index.ts の冒頭）。この購読で言語を変えたときに引き直される
  const locale = useLocale();

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
            {chartBarLegendLabel(locale, unit)}
          </Text>
        </View>
        {showCumulative && (
          // **凡例だけ右端へ寄せる**（legendItemTrailing）。累計の目盛りは本体の右端に
          // 藍で重なっている（YAxisTicks の showCumulativeTicks）ので、同じ色の凡例を
          // その真上に置いて「右の数字が何の軸か」を位置でも示す。
          // 左端から順に並べていた頃（案 37b）は右軸そのものが無く、寄せる先が無かった。
          // 右に数字が出ない期間（2 軸の上限が一致）では寄せない ── cumulativeOnRight
          <View style={[styles.legendItem, cumulativeOnRight && styles.legendItemTrailing]}>
            {lineSwatch}
            <Text style={[styles.legendLabel, { color: colors.secondaryLabel }]}>
              {cumulativeProfitLabel(locale)}
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
        {formatPointDate(locale, selected.point.date, unit)}
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
            {cumulativeValueLabel(locale, formatYenSymbol(selected.cumulative))}
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
      // label は渡さない。X 軸ラベルは自前で重ねる（XAxisLabels の冒頭を参照）
      // 選択中の棒だけ濃く（未選択のときは全点そのままの色）
      frontColor: selectedIndex < 0 || selectedIndex === index ? base : dim(base),
      // 押す判定は上に重ねた列（TapColumns）が持つ
      disablePress: true,
    };
  });


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

      <XAxisLabels
        points={points}
        labeledIndices={labeledIndices}
        unit={unit}
        heights={heights}
        pitch={pitch}
        barWidth={barWidth}
      />

      {/* 選択中のスロットを貫く縦の点線（タグ別の折れ線グラフと同じ目印）。
          **累計の折れ線より先に置く** ── 折れ線とその丸印が線の上に来るように */}
      <SelectionLine
        selectedIndex={selectedIndex}
        heights={heights}
        pitch={pitch}
        barWidth={barWidth}
      />

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
  // 表示語は locale を引数に取る（渡さないと React Compiler が初回の文字列で固定する。
  // src/i18n/index.ts の冒頭）。目盛りは単位を字で持つ（「9千円」/「¥9K」）ので、
  // この component は表示語を出さなくても locale を購読する必要がある
  const locale = useLocale();

  const colors = useThemeColors();

  const barStepValue = bounds.barMax / bounds.sections;
  const cumulativeStepValue = bounds.cumulativeMax / bounds.sections;
  const stepHeight = heights.above / bounds.sections;

  /**
   * **累計の目盛りは、棒と目盛りが違うときだけ右に出す。**
   * 同じなら左の数字がそのまま両方に当てはまるので、同じ数字を 2 列並べない。
   */
  const showCumulativeTicks = showCumulative && hasSeparateCumulativeAxis(bounds);

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
          {formatCompactYen(locale, level * barStepValue)}
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
              {formatCompactYen(locale, level * cumulativeStepValue)}
            </Text>
          ))}
    </View>
  );
}

/**
 * X 軸の日付ラベル（UI-SPEC §1.5-4）。**ライブラリに描かせず、自前で重ねる。**
 *
 * ライブラリの X 軸ラベルは**負の棒のとき位置が 1 スロットぶんずれる** ──
 * `RenderBars` が `value < 0` のラベルの入れ物に `rotate: '180deg'` を掛けるため、
 * 枠の中でのラベルの寄り方が左右反転する。枠を日付 1 つぶんに広げてある（X_LABEL_WIDTH）
 * ので、その反転がそのまま横のずれになって出る（実測: 24pt ＝ 赤字の棒が出た月で
 * 「08/13」が 8/12 の棒の真下に来た）。ライブラリ側にこの回転を切る口は無い。
 *
 * 棒・折れ線・目盛り・タップ列はすべて自前で `EDGE_SPACING + i × pitch` に並べており、
 * ラベルだけがライブラリの座標系に乗っていた。同じ式に載せ替えることで、
 * **符号に関わらずラベルの中央が棒の中央に一致する**（ずれを補正する定数も要らなくなる）。
 *
 * 縦の位置は 0 の線のすぐ下。負の棒はこの下へ伸びるので、ラベルの上を横切る
 * （ライブラリに描かせていたときと同じ見え方）。
 */
function XAxisLabels({
  points,
  labeledIndices,
  unit,
  heights,
  pitch,
  barWidth,
}: {
  points: ChartPoint[];
  /** ラベルを出すスロットの位置（logic/analytics の labelSlotIndices が間引いた結果） */
  labeledIndices: Set<number>;
  unit: ChartUnit;
  heights: ChartHeights;
  pitch: number;
  barWidth: number;
}) {
  const colors = useThemeColors();
  /** 枠の左端。枠の中央（= 文字の中央）が棒の中央に来るように置く（枠の幅は刻みで違う） */
  const labelWidth = X_LABEL_WIDTH[unit];
  const leftOf = (index: number) =>
    EDGE_SPACING + index * pitch + barWidth / 2 - labelWidth / 2;

  return (
    <View style={styles.tickOverlay} pointerEvents="none">
      {points.map((point, index) =>
        labeledIndices.has(index) ? (
          <Text
            key={point.key}
            numberOfLines={1}
            style={[
              styles.xAxisLabel,
              {
                color: colors.secondaryLabel,
                width: labelWidth,
                left: leftOf(index),
                top: heights.top + heights.above + X_LABEL_TOP_GAP,
              },
            ]}>
            {formatChartLabel(point.date, unit)}
          </Text>
        ) : null,
      )}
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
/**
 * 選択中のスロットを上から下まで貫く縦の点線（タグ別の折れ線グラフの目印線と同じもの。
 * TagProfitSection の「選択中の点を貫く縦の目印線」）。
 *
 * 棒の濃さ（barData の frontColor）だけでも選択は分かるが、**空きスロット・0 に近い日**では
 * 濃くする棒そのものが無く、どこを触っているのかが本体の中に残らない。線なら値によらず必ず出る。
 *
 * x は棒・タップ列・累計の折れ線と**同じ式**（EDGE_SPACING + i × pitch + barWidth / 2）で出す ──
 * 別に計算すると 1px ずれて、棒の中心から外れた線になる。
 * 高さは 0 より下の段も含めた合計（heights.total）── 赤字の日は棒が下へ伸びるので、
 * 上半分だけの線だとその棒を指せない。
 */
function SelectionLine({
  selectedIndex,
  heights,
  pitch,
  barWidth,
}: {
  /** 選択中のスロットの位置。-1 = 未選択（線ごと出さない） */
  selectedIndex: number;
  heights: ChartHeights;
  pitch: number;
  barWidth: number;
}) {
  const colors = useThemeColors();

  if (selectedIndex < 0) return null;

  const x = EDGE_SPACING + selectedIndex * pitch + barWidth / 2;

  return (
    <Svg
      style={[styles.lineOverlay, { top: heights.top, height: heights.total }]}
      pointerEvents="none">
      <Line
        x1={x}
        x2={x}
        y1={0}
        y2={heights.total}
        stroke={colors.secondaryLabel}
        strokeWidth={StyleSheet.hairlineWidth}
        strokeDasharray="4,4"
      />
    </Svg>
  );
}

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

/** 選択した記録一覧アコーディオンの初期表示件数（labels.selectedRecordsShowMoreText と同じ考え方） */
const SELECTED_RECORDS_INITIAL_COUNT = 3;

/**
 * 選択した点・タグの記録一覧を 1 枚のカードにまとめたアコーディオン。
 * 棒タップ（SelectedPointList）・タグ別内訳（SelectedTagList）・タグ別純利益推移の内訳
 * （SelectedTagChartTagList）の 3 経路が共有する（見出しの語だけが違うため title で渡す）。
 *
 * 行は記録タブと同じ RecordRow を使う（§6-11）── 同じレコードが画面によって違う形で出ると、
 * どれが同じものか読み直すことになるため。対象は売却済みだけなので isSoldMode は常に true。
 *
 * **最初は先頭 3 件だけ見せる。** 件数の多い月・タグを選ぶとカードが際限なく伸びてグラフ本体が
 * 遠くなるため、「達成した記録」アコーディオン（AchievementDetailModal）と同じ考え方で畳んでおく。
 * カードの中の行は白（secondaryBackground）だと外側のカードと同化するので、`colors.background`
 * （画面の地色）を敷いて 1 段沈める ── 記録タブ側の「白いカードが灰色の地に乗る」関係を
 * カードの中でも保つため。
 */
function SelectedRecordsCard({
  title,
  details,
  strikeBadges,
  onClear,
  onPressRecord,
}: {
  title: string;
  details: SaleRecord[];
  strikeBadges: ReadonlyMap<string, Achievement>;
  onClear: () => void;
  onPressRecord: (record: SaleRecord) => void;
}) {
  // 表示語は locale を引数に取る（渡さないと React Compiler が初回の文字列で固定する。
  // src/i18n/index.ts の冒頭）。この購読で言語を変えたときに引き直される
  const locale = useLocale();

  const colors = useThemeColors();
  const [expanded, setExpanded] = useState(false);

  const visibleRecords = expanded ? details : details.slice(0, SELECTED_RECORDS_INITIAL_COUNT);
  const hiddenCount = details.length - visibleRecords.length;

  return (
    <View style={[styles.selectedCard, { backgroundColor: colors.secondaryBackground }]}>
      <View style={styles.selectedHeader}>
        <Text style={[styles.selectedTitle, { color: colors.label }]} numberOfLines={1}>
          {title}
        </Text>
        <Pressable
          onPress={onClear}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={clearSelectionLabel(locale)}
          style={[styles.clearButton, { backgroundColor: colors.disabledBackground }]}>
          <Ionicons name="close" size={14} color={colors.secondaryLabel} />
        </Pressable>
      </View>

      {visibleRecords.map((record) => (
        <Pressable
          key={record.id}
          style={[styles.rowCard, { backgroundColor: colors.background }]}
          onPress={() => onPressRecord(record)}
          accessibilityRole="button"
          accessibilityLabel={recordDetailAccessibilityLabel(locale, record.itemName)}>
          <RecordRow
            record={record}
            isSoldMode
            strikeAchievement={strikeBadges.get(record.id) ?? null}
          />
        </Pressable>
      ))}

      {hiddenCount > 0 && (
        <Pressable
          onPress={() => setExpanded(true)}
          accessibilityRole="button"
          hitSlop={8}
          style={styles.showAllButton}>
          <Text style={[styles.showAllText, { color: colors.blue }]}>
            {selectedRecordsShowMoreText(locale, hiddenCount)}
          </Text>
        </Pressable>
      )}

      {expanded && details.length > SELECTED_RECORDS_INITIAL_COUNT && (
        <Pressable
          onPress={() => setExpanded(false)}
          accessibilityRole="button"
          hitSlop={8}
          style={styles.showAllButton}>
          <Text style={[styles.showAllText, { color: colors.secondaryLabel }]}>
            {selectedRecordsCollapseLabel(locale)}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

/** 選択した点の記録一覧（UI-SPEC §1.5-5）。見出しの語を組んで SelectedRecordsCard に渡すだけ */
function SelectedPointList({
  point,
  unit,
  details,
  strikeBadges,
  onClear,
  onPressRecord,
}: {
  point: AggregatedPoint;
  unit: ChartUnit;
  details: SaleRecord[];
  strikeBadges: ReadonlyMap<string, Achievement>;
  onClear: () => void;
  onPressRecord: (record: SaleRecord) => void;
}) {
  // 表示語は locale を引数に取る（渡さないと React Compiler が初回の文字列で固定する。
  // src/i18n/index.ts の冒頭）。この購読で言語を変えたときに引き直される
  const locale = useLocale();

  const title = selectedPointTitle(locale, formatPointDate(locale, point.date, unit), point.recordCount);
  return (
    // key で選択のたびに作り直す ── 前の点で開いた「すべて見る」が次の点にも残らないようにするため
    <SelectedRecordsCard
      key={title}
      title={title}
      details={details}
      strikeBadges={strikeBadges}
      onClear={onClear}
      onPressRecord={onPressRecord}
    />
  );
}

/**
 * タグ別利益ランキングの行タップで開く内訳一覧（SelectedPointList のタグ版）。
 * 棒タップの内訳とまったく同じ見た目・同じ SelectedRecordsCard を使う（§6-11 と同じ考え方をタグにも適用）。
 */
function SelectedTagList({
  tagName,
  details,
  strikeBadges,
  onClear,
  onPressRecord,
}: {
  tagName: string;
  details: SaleRecord[];
  strikeBadges: ReadonlyMap<string, Achievement>;
  onClear: () => void;
  onPressRecord: (record: SaleRecord) => void;
}) {
  // 表示語は locale を引数に取る（渡さないと React Compiler が初回の文字列で固定する。
  // src/i18n/index.ts の冒頭）。この購読で言語を変えたときに引き直される
  const locale = useLocale();

  const title = selectedTagTitle(locale, tagName, details.length);
  return (
    <SelectedRecordsCard
      key={title}
      title={title}
      details={details}
      strikeBadges={strikeBadges}
      onClear={onClear}
      onPressRecord={onPressRecord}
    />
  );
}

/**
 * 「タグ別純利益の推移」グラフの日付内訳、その行タップで開く記録一覧（SelectedTagList のタグ別
 * 純利益推移版）。日付とタグ名の両方を主語にする（selectedTagChartTitle）。
 */
function SelectedTagChartTagList({
  dateText,
  tagName,
  details,
  strikeBadges,
  onClear,
  onPressRecord,
}: {
  dateText: string;
  tagName: string;
  details: SaleRecord[];
  strikeBadges: ReadonlyMap<string, Achievement>;
  onClear: () => void;
  onPressRecord: (record: SaleRecord) => void;
}) {
  // 表示語は locale を引数に取る（渡さないと React Compiler が初回の文字列で固定する。
  // src/i18n/index.ts の冒頭）。この購読で言語を変えたときに引き直される
  const locale = useLocale();

  const title = selectedTagChartTitle(locale, dateText, tagName, details.length);
  return (
    <SelectedRecordsCard
      key={title}
      title={title}
      details={details}
      strikeBadges={strikeBadges}
      onClear={onClear}
      onPressRecord={onPressRecord}
    />
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
  contentArea: {
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
    // 選択中は「押した 1 点についての 2 つの値」なので左端から順に詰める（ChartHeadRow の表）。
    // 凡例のときだけ 2 つ目を右端へ送る（legendItemTrailing）
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
  /**
   * 凡例の 2 つ目（累計収支）を行の右端へ送る。**凡例のときだけ**当てる ──
   * 累計の目盛りは本体の右端に藍で重なっている（YAxisTicks）ので、同じ色の凡例を
   * その真上に置くと「右の数字が何の軸か」が位置でも読める。
   * 選択中の行は 1 点についての 2 つの値なので、こちらは離さない。
   */
  legendItemTrailing: {
    marginLeft: 'auto',
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
  // X 軸の日付。枠の中央を棒の中央に合わせて置く（XAxisLabels）
  xAxisLabel: {
    position: 'absolute',
    fontSize: 10,
    textAlign: 'center',
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
  // 選択した記録一覧アコーディオン（SelectedRecordsCard）。chartCard / PeriodComparisonCard と
  // 同じ「白いカードが灰色の地に乗る」見た目に揃える
  selectedCard: {
    padding: 16,
    borderRadius: 12,
    gap: 10,
  },
  selectedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  selectedTitle: {
    flexShrink: 1,
    fontSize: 17,
    fontWeight: '700',
  },
  // タグ別純利益推移グラフの日付内訳（TagChartDaySummary.daySummaryClear）と同じ丸い「×」ボタン。
  // 「選択を解除」の見た目をグラフ側の閉じ方と揃える
  clearButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // 記録タブのリストの行と同じ形（UI-SPEC §6-11）。カードの中で 1 段沈める（selectedCard のコメント）
  rowCard: {
    paddingHorizontal: 14,
    // 記録タブと同じ行の高さにする（写真の枠 56pt ＋ 上下 13pt。SPEC-V5 §2.3）
    paddingVertical: 13,
    borderRadius: 12,
  },
  // 「すべて見る」/「閉じる」（達成した記録アコーディオンと同じ考え方）
  showAllButton: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  showAllText: {
    fontSize: 13,
    fontWeight: '600',
  },
  note: {
    fontSize: 12,
    lineHeight: 18,
  },
});
