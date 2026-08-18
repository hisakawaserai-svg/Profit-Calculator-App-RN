// データタブの「タグ」モード（採用案 1a）。
//
// 旧 TagProfitRankingCard（タグ別利益ランキング）と旧 TagProfitTrendCard（タグ別純利益の推移）を
// 一覧／グラフの 2 モードに統合し、さらに「グラフ」の折れ線カード（TagProfitTrendCard）は
// 「収支の推移」カード（DataScreen の chartCard・XAxisLabels・YAxisTicks・TapColumns・
// CumulativeLine）と**同じ仕様**で描く ── カードの見た目、X 軸の日付ラベル、目盛り線・
// 目盛り数字のスタイルを、収支のグラフとタグのグラフとで揃えるため。
//
// - TagProfitSection（一覧／グラフの行の一覧）: 行ごとに純利益・利益率・件数と、
//   全タグ共通の Y 軸を持つ小さな推移（スパークライン）。「グラフ」では行にチェックボックスが出る。
//   行タップは既存の「その場に内訳を展開する」機能（SelectedTagList・DataScreen 側）に委ねる。
// - TagProfitTrendCard（「グラフ」のときだけ・収支の推移カードと同じ位置に出す）:
//   チェックしたタグぶんの折れ線を 1 枚に重ねる。X 軸は収支の推移グラフと同じ日付軸
//   （呼び出し側の densePoints をそのまま渡す。タグの点列も同じ span/unit で densifySeries 済み
//   なので軸が必ず揃う）。凡例（チェック中のタグ）はグラフの下に常に出す。タップで最も近い
//   記録のあるスロットを選ぶと、その日のタグ別内訳（breakdownItems）を**同じカードの中**に出す
//   ── 日別の内訳はグラフを触った結果なので、独立セクションにしてタグランキングを押し下げない
//   （採用案 1a）。解除はその内訳の中の ✕ だけ。
//
// 集計・時間軸の計算はすべて呼び出し側が logic/profit・logic/analytics を通した結果を渡す。
// この部品はレコードを 1 件もループしない。
import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { Circle, Line, Polyline, Svg } from 'react-native-svg';

import { DataModeTabs } from '@/components/DataModeTabs';
import { SegmentedControl } from '@/components/SegmentedControl';
import { TagDot } from '@/components/TagChip';
import {
  formatChartLabel,
  formatPointDate,
  labelSlotIndices,
  nearestRecordedIndex,
  singleAxisBounds,
  type ChartPoint,
  type ChartUnit,
  type CombinedAxisBounds,
} from '@/logic/analytics';
import { formatCompactYen, formatSignedYenSymbol } from '@/logic/format';
import {
  clearSelectionLabel,
  dataModeAchievementsLabel,
  dataModeProfitLabel,
  dataModeTagLabel,
  tagProfitTrendLabel,
  tagSectionListModeLabel,
  tagSectionOverlayModeLabel,
  tagOverlayEmptyNote,
  tagSparklineNote,
  unclassifiedTagLabel,
  periodTitle,
  profitRateSummaryValue,
  recordCountValue,
  tagChartDaySummaryMetaText,
  tagProfitMetaText,
  tagSectionMetaText,
  zeroRecordTagsToggleLabel,
} from '@/logic/labels';
import type { Period } from '@/logic/period';
import { resolvePresetTone } from '@/logic/preset';
import type { RankedTagProfit } from '@/logic/profit';
import { useLocale } from '@/settings';
import { useThemeColors, type ThemeColors } from '@/theme';

export type TagProfitSectionItem = RankedTagProfit & {
  /** タグ名。tagId が null（未分類）なら呼び出し側は unclassifiedTagLabel(locale) を渡す */
  name: string;
  /** バッジ・線の色。未分類（tagId: null）は色を持たないので null */
  colorKey: string | null;
};

/** 記録が 1 件も無いタグ（下部の開閉行）。色ドットのため colorKey を持つ */
export type ZeroRecordTag = {
  id: string;
  name: string;
  colorKey: string;
};

/** タグの色。未分類は色を持たないので、線・点はグレー固定にする */
function tagColor(colorKey: string | null, colors: ThemeColors): string {
  return colorKey == null ? colors.gray : resolvePresetTone(colorKey, colors.presetTones).background;
}

/** 「一覧」「重ねる」の 2 択（DataScreen 側で状態を持つ。収支/タグの mode と同じ仕組み） */
export const TAG_VIEW_MODE_LIST = 0;
export const TAG_VIEW_MODE_OVERLAY = 1;

/** 純利益の上位 3 タグを一目で分かるようにする印。4 位以降は付けない（items は降順で並んでいる） */
const RANK_MEDALS = ['🥇', '🥈', '🥉'] as const;

type Props = {
  /** 記録が 1 件以上あるタグ、純利益の降順（呼び出し側で allTagProfits 済み）。空なら何も描かない */
  items: TagProfitSectionItem[];
  /** 記録が 1 件も無いタグ。下部の開閉行「記録のない◯タグを見る」にまとめる */
  zeroRecordTags: ZeroRecordTag[];
  /** 見出しに出す期間全体の合計（絞り込み後・行タップ等に左右されない期間丸ごとの値） */
  summary: { recordCount: number; totalNetProfit: number };
  /** 見出し下の「◯年・◯件」に出す期間（periodTitle に通す） */
  period: Period;
  /**
   * 「一覧」モードの行ごとのスパークライン点列（呼び出し側で tagTrendSeries 済み・全タグぶん）。
   * 対応する点列が無いタグ（データが引けていない一瞬）は何も描かない。
   */
  sparklineSeriesByTag: Map<string | null, ChartPoint[]>;
  /**
   * スパークラインの共通 Y 軸範囲（combinedAxisBounds）。**全タグで 1 組を共有する** ──
   * 個々のタグで自動フィットさせると高さが比較できなくなるため（tagSparklineNote(locale) 参照）。
   */
  sparklineBounds: CombinedAxisBounds;
  /** 「重ねる」モードのチェック状態。モードを切り替えても呼び出し側で保持される */
  overlaySelected: ReadonlySet<string | null>;
  onToggleOverlay: (tagId: string | null) => void;
  /** 「一覧」「重ねる」の選択（呼び出し側 state。TAG_VIEW_MODE_LIST / TAG_VIEW_MODE_OVERLAY） */
  viewMode: number;
  onChangeViewMode: (index: number) => void;
  /**
   * 「収支 / タグ / 実績」の 3 択（DataScreen 側の mode）。**このカードが「タグ」モードで最初に出る
   * カードのときだけ渡す**（「重ねる」なら TagProfitTrendCard が先に出るので、こちらは undefined
   * にする）── カードの上端に 3 択タブを 1 つだけ出すため。
   */
  dataMode?: number;
  onChangeDataMode?: (index: number) => void;
  /** タップされたタグの行を薄い青で示す（「一覧」モードのみ・DataScreen 側の selectedTagId） */
  selectedTagId?: string | null;
  onSelectTag?: (tagId: string | null) => void;
};

export function TagProfitSection({
  items,
  zeroRecordTags,
  summary,
  period,
  sparklineSeriesByTag,
  sparklineBounds,
  overlaySelected,
  onToggleOverlay,
  viewMode,
  onChangeViewMode,
  dataMode,
  onChangeDataMode,
  selectedTagId,
  onSelectTag,
}: Props) {
  // 表示語は locale を引数に取る（渡さないと React Compiler が初回の文字列で固定する。
  // src/i18n/index.ts の冒頭）。この購読で言語を変えたときに引き直される
  const locale = useLocale();

  const colors = useThemeColors();
  const [zeroExpanded, setZeroExpanded] = useState(false);
  const isOverlay = viewMode === TAG_VIEW_MODE_OVERLAY;

  if (items.length === 0) return null;

  return (
    <View style={[styles.card, { backgroundColor: colors.secondaryBackground }]}>
      {dataMode != null && onChangeDataMode != null && (
        <DataModeTabs
          options={[dataModeProfitLabel(locale), dataModeTagLabel(locale), dataModeAchievementsLabel(locale)]}
          selectedIndex={dataMode}
          onChange={onChangeDataMode}
        />
      )}

      <View style={styles.headerTop}>
        <Text style={[styles.meta, { color: colors.secondaryLabel }]} numberOfLines={1}>
          {tagSectionMetaText(locale, periodTitle(locale, period), recordCountValue(locale, summary.recordCount))}
        </Text>

        {/* 「一覧 / グラフ」切替は、今出ているカードの右上にだけ置く ── 「グラフ」のときは
            折れ線カード（TagProfitTrendCard）の見出しに移るので、ここには出さない */}
        {!isOverlay && (
          <SegmentedControl
            options={[tagSectionListModeLabel(locale), tagSectionOverlayModeLabel(locale)]}
            selectedIndex={viewMode}
            onChange={onChangeViewMode}
            containerStyle={styles.modeToggle}
          />
        )}
      </View>

      {items.map((item, index) => {
        const checked = overlaySelected.has(item.tagId);
        const medal = RANK_MEDALS[index];
        return (
          <Pressable
            key={item.tagId ?? unclassifiedTagLabel(locale)}
            onPress={() => onSelectTag?.(item.tagId)}
            accessibilityRole="button"
            style={[
              styles.rankingRow,
              index > 0 && { borderTopColor: colors.separator, borderTopWidth: StyleSheet.hairlineWidth },
              selectedTagId !== undefined &&
                selectedTagId === item.tagId && { backgroundColor: colors.highlightBackground },
            ]}>
            {/* 「重ねる」のチェックは行タップ（内訳を開く）とは別の当たり判定にする ──
                左端のチェックだけ選択の増減、それ以外は内訳（既存の SelectedTagList）を開く */}
            {isOverlay && (
              <Pressable
                onPress={() => onToggleOverlay(item.tagId)}
                hitSlop={8}
                accessibilityRole="checkbox"
                accessibilityState={{ checked }}
                style={styles.checkbox}>
                <View
                  style={[
                    styles.checkboxBox,
                    { borderColor: colors.separator },
                    checked && { backgroundColor: colors.blue, borderColor: colors.blue },
                  ]}>
                  {checked && <Ionicons name="checkmark" size={14} color="#FFFFFF" />}
                </View>
              </Pressable>
            )}

            <View style={styles.nameColumn}>
              <View style={styles.nameLine}>
                {medal != null && <Text style={styles.medal}>{medal}</Text>}
                {item.colorKey != null && <TagDot colorKey={item.colorKey} />}
                <Text style={[styles.name, { color: colors.label }]} numberOfLines={1}>
                  {item.name}
                </Text>
              </View>
              <Text style={[styles.meta2, { color: colors.secondaryLabel }]} numberOfLines={1}>
                {tagProfitMetaText(locale, 
                  profitRateSummaryValue(locale, item.profitRate),
                  recordCountValue(locale, item.recordCount),
                )}
              </Text>
            </View>

            <Text
              style={[
                styles.amount,
                { color: item.totalNetProfit >= 0 ? colors.green : colors.red },
              ]}
              numberOfLines={1}>
              {formatSignedYenSymbol(item.totalNetProfit)}
            </Text>

            {!isOverlay && (
              <TagSparkline
                points={sparklineSeriesByTag.get(item.tagId) ?? []}
                bounds={sparklineBounds}
                color={tagColor(item.colorKey, colors)}
              />
            )}
          </Pressable>
        );
      })}

      {zeroRecordTags.length > 0 && (
        <>
          <Pressable
            onPress={() => setZeroExpanded((current) => !current)}
            style={[styles.zeroToggleRow, { borderTopColor: colors.separator, borderTopWidth: StyleSheet.hairlineWidth }]}>
            <Text style={[styles.zeroToggleLabel, { color: colors.blue }]}>
              {zeroRecordTagsToggleLabel(locale, zeroRecordTags.length, zeroExpanded)}
            </Text>
          </Pressable>

          {zeroExpanded &&
            zeroRecordTags.map((tag) => (
              <View key={tag.id} style={styles.zeroTagRow}>
                <TagDot colorKey={tag.colorKey} />
                <Text style={[styles.zeroTagName, { color: colors.secondaryLabel }]} numberOfLines={1}>
                  {tag.name}
                </Text>
              </View>
            ))}
        </>
      )}

      {!isOverlay && (
        <Text style={[styles.note, { color: colors.secondaryLabel }]}>{tagSparklineNote(locale)}</Text>
      )}
    </View>
  );
}

const SPARKLINE_WIDTH = 56;
const SPARKLINE_HEIGHT = 28;

/**
 * タグ 1 行ぶんの小さな折れ線（「一覧」モード）。線の描画スタイル（太さ・線端・継ぎ目）は
 * 「収支の推移」グラフの折れ線（DataScreen の CumulativeLine）と揃える。
 *
 * Y 軸は呼び出し側が全タグぶんまとめて出した bounds をそのまま使う（このタグの値だけで
 * フィットし直さない）。目盛りの数字は持たない ── 高さの比較だけが役目の飾りなので、
 * 数字を出すと本体のグラフと二重に読ませることになる。
 */
function TagSparkline({
  points,
  bounds,
  color,
}: {
  points: ChartPoint[];
  bounds: CombinedAxisBounds;
  color: string;
}) {
  if (points.length === 0) return <View style={styles.sparkline} />;

  const range = bounds.upper - bounds.lower || 1;
  const pitch = points.length > 1 ? SPARKLINE_WIDTH / (points.length - 1) : 0;
  const x = (index: number) => (points.length <= 1 ? SPARKLINE_WIDTH / 2 : index * pitch);
  const y = (value: number) => (SPARKLINE_HEIGHT * (bounds.upper - value)) / range;
  const polyline = points.map((point, index) => `${x(index)},${y(point.profit)}`).join(' ');

  return (
    <Svg width={SPARKLINE_WIDTH} height={SPARKLINE_HEIGHT} style={styles.sparkline}>
      <Polyline
        points={polyline}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </Svg>
  );
}

/** 本体の高さ。「収支の推移」グラフの 0 より上の高さ（DataScreen の CHART_HEIGHT）と同じ */
const CHART_HEIGHT = 220;
/** 軸の内側の余白（左右）。収支の推移グラフの EDGE_SPACING と同じ */
const EDGE_SPACING = 12;
/** X 軸ラベルを出すスロットの目安の数。収支の推移グラフの LABEL_COUNT と同じ */
const LABEL_COUNT = 5;
/** X 軸ラベルの枠幅（刻みで変える）。収支の推移グラフの X_LABEL_WIDTH と同じ */
const X_LABEL_WIDTH: Record<ChartUnit, number> = { day: 36, month: 50, year: 36 };
/** 末尾のラベルと直前のラベルの間に最低限空ける距離。収支の推移グラフの X_LABEL_MIN_GAP と同じ */
const X_LABEL_MIN_GAP = 60;
/** X 軸ラベルを本体の下端からどれだけ下げるか。収支の推移グラフの X_LABEL_TOP_GAP と同じ */
const X_LABEL_TOP_GAP = 6;
/** X 軸ラベルの行の高さぶん、カードの下に確保する余白 */
const X_LABEL_ROW_HEIGHT = 18;
/** 目盛りの数字を罫線のすぐ上に浮かせる量。収支の推移グラフの TICK_LABEL_LIFT と同じ */
const TICK_LABEL_LIFT = 13;
/** 選択中の点に置く丸印の半径。収支の推移グラフの SELECTED_DOT_RADIUS と同じ */
const SELECTED_DOT_RADIUS = 4;

type TagTrendCardProps = {
  /** 色・名前を引くための全タグ（純利益の降順）。表示するのは overlaySelected に入っているぶんだけ */
  candidates: TagProfitSectionItem[];
  /** チェックされているタグぶんだけの点列（呼び出し側で tagTrendSeries 済み） */
  seriesByTag: Map<string | null, ChartPoint[]>;
  overlaySelected: ReadonlySet<string | null>;
  /**
   * X 軸（日付）。**収支の推移グラフと同じ densePoints をそのまま渡す** ── タグの点列も
   * 同じ span/unit で densifySeries 済みなので、日付の並びが必ず 1:1 で揃う。
   */
  axisPoints: ChartPoint[];
  unit: ChartUnit;
  /**
   * タップされた点のキー（DataScreen 側の selection と同じ考え方。null = 未選択）。
   * その日のタグ別内訳（breakdownItems）は呼び出し側がこのキーから別途組んで渡す。
   */
  selectedKey: string | null;
  onSelectKey: (key: string | null) => void;
  /** 「一覧 / グラフ」の選択（呼び出し側 state）。切替そのものはこのカードの見出しに出す */
  viewMode: number;
  onChangeViewMode: (index: number) => void;
  /**
   * タップした点のタグ別内訳（呼び出し側が selectedKey から別途組む）。**このカードの中に出す**
   * ── 「触った結果」なので独立セクションにしない。下のタグランキングカードが選択の有無で
   * 押し下がらないようにするため（採用案 1a）。
   */
  breakdownItems: TagChartBreakdownItem[];
  /**
   * タグ別内訳の行をさらにタップして選んだタグ（DataScreen 側の selection と同じ考え方。
   * undefined = 未選択）。その日付・そのタグの記録一覧は呼び出し側がカードの外に出す。
   */
  selectedBreakdownTagId?: string | null;
  onSelectBreakdownTag?: (tagId: string | null) => void;
  /**
   * 「収支 / タグ / 実績」の 3 択（DataScreen 側の mode）。このカードは「グラフ」のときにしか
   * 描かれない ＝ 描かれたときは常にタグモードの最初のカードなので、必ず渡す。
   */
  dataMode: number;
  onChangeDataMode: (index: number) => void;
};

/** 「タグ別純利益の推移」グラフの点タップで開くタグ別内訳の 1 行 */
export type TagChartBreakdownItem = {
  tagId: string | null;
  name: string;
  colorKey: string | null;
  profit: number;
};

/**
 * 「タグ別純利益の推移」カード（「収支の推移」カードと同じ仕様・同じ位置）。
 * **呼び出し側（DataScreen）が「グラフ」のときだけ描く** ── 「一覧 / グラフ」の切替は
 * 今出ている方のカードの見出しに置く（TagProfitSection のコメントと対）。
 *
 * 点をタップすると、その日のタグ別内訳を**このカードの中**に出す（採用案 1a）。
 * 凡例（チェック中のタグの色 ＋ 名前）は選択の有無にかかわらず常に出す ── その日の値は
 * 内訳の一覧が持つので、見出し下の 1 行で二重に出す必要が無い。
 */
export function TagProfitTrendCard({
  candidates,
  seriesByTag,
  overlaySelected,
  axisPoints,
  unit,
  selectedKey,
  onSelectKey,
  viewMode,
  onChangeViewMode,
  breakdownItems,
  selectedBreakdownTagId,
  onSelectBreakdownTag,
  dataMode,
  onChangeDataMode,
}: TagTrendCardProps) {
  // 表示語は locale を引数に取る（渡さないと React Compiler が初回の文字列で固定する。
  // src/i18n/index.ts の冒頭）。この購読で言語を変えたときに引き直される
  const locale = useLocale();

  const colors = useThemeColors();
  const selectedIndex = axisPoints.findIndex((point) => point.key === selectedKey);
  const selectedPoint = selectedIndex < 0 ? null : axisPoints[selectedIndex];

  const legendItems = candidates.filter((item) => overlaySelected.has(item.tagId));

  return (
    <View style={[styles.card, { backgroundColor: colors.secondaryBackground }]}>
      <DataModeTabs
        options={[dataModeProfitLabel(locale), dataModeTagLabel(locale), dataModeAchievementsLabel(locale)]}
        selectedIndex={dataMode}
        onChange={onChangeDataMode}
      />

      <View style={styles.headerTop}>
        <Text style={[styles.chartTitle, { color: colors.label }]}>{tagProfitTrendLabel(locale)}</Text>

        <SegmentedControl
          options={[tagSectionListModeLabel(locale), tagSectionOverlayModeLabel(locale)]}
          selectedIndex={viewMode}
          onChange={onChangeViewMode}
          containerStyle={styles.modeToggle}
        />
      </View>

      {legendItems.length === 0 ? (
        <Text style={[styles.emptyChartText, { color: colors.secondaryLabel }]}>
          {tagOverlayEmptyNote(locale)}
        </Text>
      ) : (
        <>
          <TagTrendChartBody
            candidates={candidates}
            seriesByTag={seriesByTag}
            axisPoints={axisPoints}
            unit={unit}
            selectedIndex={selectedIndex}
            onSelectIndex={(index) => onSelectKey(axisPoints[index]?.key ?? null)}
          />

          <TagTrendLegendRow legendItems={legendItems} />

          {selectedPoint != null && (
            <TagChartDaySummary
              point={selectedPoint}
              unit={unit}
              items={breakdownItems}
              onClear={() => onSelectKey(null)}
              selectedTagId={selectedBreakdownTagId}
              onSelectTag={onSelectBreakdownTag}
            />
          )}
        </>
      )}
    </View>
  );
}

/** グラフの下に常に出す凡例（チェック中のタグの色 ＋ 名前。ピル形にして見出しの帯と分ける） */
function TagTrendLegendRow({ legendItems }: { legendItems: TagProfitSectionItem[] }) {
  // 表示語は locale を引数に取る（渡さないと React Compiler が初回の文字列で固定する。
  // src/i18n/index.ts の冒頭）。この購読で言語を変えたときに引き直される
  const locale = useLocale();

  const colors = useThemeColors();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.legendRowScroll}
      contentContainerStyle={styles.legendRow}>
      {legendItems.map((item) => (
        <View
          key={item.tagId ?? unclassifiedTagLabel(locale)}
          style={[styles.legendChip, { backgroundColor: colors.disabledBackground }]}>
          <View style={[styles.legendDot, { backgroundColor: tagColor(item.colorKey, colors) }]} />
          <Text style={[styles.legendLabel, { color: colors.label }]} numberOfLines={1}>
            {item.name}
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}

/**
 * グラフの点タップで開くタグ別内訳（採用案 1a）。**独立したセクションにせず、
 * TagProfitTrendCard の中にそのまま出す** ── 日別はグラフを触った結果なので、
 * 同じカードの中に置くほうが「触ったら中身が増える」という 1 つの動きに見える。
 * 「その月は、どのタグが儲かったか」を見るための一覧なので、タグランキングと違って
 * 順位の印（🥇🥈🥉）は付けない（3 件前後の短い一覧に付けると煩雑）。
 *
 * 行をタップすると、その日付・そのタグの記録一覧が開く（呼び出し側の onSelectTag。
 * DataScreen 側で選んだタグの内訳を別途カードの外に出す）── 「横軸の日付を選ぶ」に加えて、
 * 「その日のどのタグの記録か」まで一段掘れるようにする。
 */
function TagChartDaySummary({
  point,
  unit,
  items,
  onClear,
  selectedTagId,
  onSelectTag,
}: {
  point: ChartPoint;
  unit: ChartUnit;
  items: TagChartBreakdownItem[];
  onClear: () => void;
  selectedTagId?: string | null;
  onSelectTag?: (tagId: string | null) => void;
}) {
  // 表示語は locale を引数に取る（渡さないと React Compiler が初回の文字列で固定する。
  // src/i18n/index.ts の冒頭）。この購読で言語を変えたときに引き直される
  const locale = useLocale();

  const colors = useThemeColors();

  return (
    <View style={[styles.daySummary, { borderTopColor: colors.separator }]}>
      <View style={styles.daySummaryHeader}>
        <View style={styles.daySummaryHeaderText}>
          <Text style={[styles.daySummaryDate, { color: colors.label }]} numberOfLines={1}>
            {formatPointDate(point.date, unit)}
          </Text>
          <Text style={[styles.daySummaryMeta, { color: colors.secondaryLabel }]} numberOfLines={1}>
            {tagChartDaySummaryMetaText(locale, items.length, point.recordCount)}
          </Text>
        </View>
        <Text
          style={[styles.daySummaryAmount, { color: point.profit >= 0 ? colors.green : colors.red }]}
          numberOfLines={1}>
          {formatSignedYenSymbol(point.profit)}
        </Text>
        <Pressable
          onPress={onClear}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={clearSelectionLabel(locale)}
          style={[styles.daySummaryClear, { backgroundColor: colors.disabledBackground }]}>
          <Ionicons name="close" size={14} color={colors.secondaryLabel} />
        </Pressable>
      </View>

      {items.map((item, index) => (
        <Pressable
          key={item.tagId ?? unclassifiedTagLabel(locale)}
          onPress={() => onSelectTag?.(item.tagId)}
          accessibilityRole="button"
          style={[
            styles.breakdownRow,
            index > 0 && { borderTopColor: colors.separator, borderTopWidth: StyleSheet.hairlineWidth },
            selectedTagId !== undefined &&
              selectedTagId === item.tagId && { backgroundColor: colors.highlightBackground },
          ]}>
          {item.colorKey != null && <TagDot colorKey={item.colorKey} />}
          <Text style={[styles.breakdownName, { color: colors.label }]} numberOfLines={1}>
            {item.name}
          </Text>
          <Text
            style={[styles.amount, { color: item.profit >= 0 ? colors.green : colors.red }]}
            numberOfLines={1}>
            {formatSignedYenSymbol(item.profit)}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

/**
 * 「重ねる」モードのグラフ本体。チェックしたタグぶんの折れ線を重ねる ── 収支の推移グラフと
 * 同じ要素（0 の段を濃くした罫線、本体に重ねる目盛り、X 軸の日付ラベル、タップで選ぶ列、
 * 選択中の点の丸印）を持つ。バーは無い（複数タグを 1 枚に重ねるのが目的の折れ線グラフのため）。
 */
function TagTrendChartBody({
  candidates,
  seriesByTag,
  axisPoints,
  unit,
  selectedIndex,
  onSelectIndex,
}: {
  candidates: TagProfitSectionItem[];
  seriesByTag: Map<string | null, ChartPoint[]>;
  axisPoints: ChartPoint[];
  unit: ChartUnit;
  selectedIndex: number;
  onSelectIndex: (index: number) => void;
}) {
  // 表示語は locale を引数に取る（渡さないと React Compiler が初回の文字列で固定する。
  // src/i18n/index.ts の冒頭）。この購読で言語を変えたときに引き直される
  const locale = useLocale();

  const colors = useThemeColors();
  const [width, setWidth] = useState(0);

  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);

  const bounds = useMemo(
    () => singleAxisBounds([...seriesByTag.values()].flatMap((points) => points.map((point) => point.profit))),
    [seriesByTag],
  );
  const slotCount = axisPoints.length;
  const { max: upper, min: lower, step, sections, sectionsBelow } = bounds;
  const range = upper - lower || 1;
  const plotWidth = Math.max(width - EDGE_SPACING * 2, 0);
  const pitch = slotCount > 1 ? plotWidth / (slotCount - 1) : 0;
  const x = (index: number) => (slotCount <= 1 ? plotWidth / 2 : index * pitch) + EDGE_SPACING;
  const y = (value: number) => (CHART_HEIGHT * (upper - value)) / range;

  // 0 より上（sections 段）〜 0 より下（sectionsBelow 段）まで。0 の段も含む（収支の推移グラフと同じ規則）
  const levels = Array.from({ length: sections + sectionsBelow + 1 }, (_, index) => index - sectionsBelow);

  const labeledIndices = useMemo(
    () => new Set(labelSlotIndices(slotCount, LABEL_COUNT, pitch > 0 ? X_LABEL_MIN_GAP / pitch : 0)),
    [slotCount, pitch],
  );
  const labelWidth = X_LABEL_WIDTH[unit];

  return (
    <View style={styles.chart} onLayout={onLayout}>
      {width > 0 && seriesByTag.size > 0 && (
        <>
          <Svg width={width} height={CHART_HEIGHT}>
            {levels.map((level) => (
              <Line
                key={level}
                x1={0}
                x2={width}
                y1={y(level * step)}
                y2={y(level * step)}
                stroke={level === 0 ? colors.secondaryLabel : colors.separator}
                strokeWidth={StyleSheet.hairlineWidth}
              />
            ))}
            {[...seriesByTag.entries()].map(([tagId, points]) => {
              const item = candidates.find((candidate) => candidate.tagId === tagId);
              const stroke = tagColor(item?.colorKey ?? null, colors);
              const polyline = points.map((point, index) => `${x(index)},${y(point.profit)}`).join(' ');
              return (
                <Polyline
                  key={tagId ?? unclassifiedTagLabel(locale)}
                  points={polyline}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              );
            })}
            {/* 選択中の点を貫く縦の目印線（採用案 1a）。どの日を触っているかを線の中でも示す */}
            {selectedIndex >= 0 && (
              <Line
                x1={x(selectedIndex)}
                x2={x(selectedIndex)}
                y1={y(upper)}
                y2={y(lower)}
                stroke={colors.secondaryLabel}
                strokeWidth={StyleSheet.hairlineWidth}
                strokeDasharray="4,4"
              />
            )}
            {/* 選択中の点の丸印（収支の推移グラフの CumulativeLine と同じ形） */}
            {selectedIndex >= 0 &&
              [...seriesByTag.entries()].map(([tagId, points]) => {
                const point = points[selectedIndex];
                if (point == null) return null;
                const item = candidates.find((candidate) => candidate.tagId === tagId);
                const color = tagColor(item?.colorKey ?? null, colors);
                return (
                  <Circle
                    key={tagId ?? unclassifiedTagLabel(locale)}
                    cx={x(selectedIndex)}
                    cy={y(point.profit)}
                    r={SELECTED_DOT_RADIUS}
                    fill={color}
                    stroke={colors.secondaryBackground}
                    strokeWidth={2}
                  />
                );
              })}
          </Svg>

          {/* 目盛りの数字は本体の内側に重ねる（収支の推移グラフの YAxisTicks と同じ形） */}
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
                    top: Math.max(0, y(level * step) - TICK_LABEL_LIFT),
                  },
                ]}>
                {formatCompactYen(locale, level * step)}
              </Text>
            ))}
          </View>

          {/* X 軸の日付ラベル（収支の推移グラフの XAxisLabels と同じ形） */}
          <View style={styles.tickOverlay} pointerEvents="none">
            {axisPoints.map((point, index) =>
              labeledIndices.has(index) ? (
                <Text
                  key={point.key}
                  numberOfLines={1}
                  style={[
                    styles.xAxisLabel,
                    {
                      color: colors.secondaryLabel,
                      width: labelWidth,
                      left: x(index) - labelWidth / 2,
                      top: CHART_HEIGHT + X_LABEL_TOP_GAP,
                    },
                  ]}>
                  {formatChartLabel(point.date, unit)}
                </Text>
              ) : null,
            )}
          </View>

          {/* タップで最も近い記録のあるスロットを選ぶ（収支の推移グラフの TapColumns と同じ考え方） */}
          <View style={styles.tapColumns} pointerEvents="box-none">
            {axisPoints.map((_, index) => (
              <Pressable
                key={index}
                style={[styles.tapColumn, { left: (index * width) / slotCount, width: width / slotCount }]}
                onPress={() => {
                  const nearest = nearestRecordedIndex(axisPoints, index);
                  if (nearest != null) onSelectIndex(nearest);
                }}
                accessibilityRole="button"
              />
            ))}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
    borderRadius: 12,
    gap: 4,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 8,
  },
  modeToggle: {
    width: 148,
  },
  meta: {
    fontSize: 13,
    flexShrink: 1,
  },
  chartTitle: {
    fontSize: 17,
    fontWeight: '700',
    flexShrink: 1,
  },
  emptyChartText: {
    fontSize: 14,
    paddingVertical: 12,
    textAlign: 'center',
  },
  // グラフの下に常に出す凡例（TagTrendLegendRow）。ピル形にして見出しの帯（headerTop）と分ける
  legendRowScroll: {
    marginTop: 8,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  legendChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendLabel: {
    fontSize: 12,
  },
  // 点タップで開くタグ別内訳（TagChartDaySummary）。独立セクションにせず、カードの中に置く
  // （採用案 1a）。上に罫線を 1 本引いて、グラフ・凡例と一続きに見えないよう軽く区切るだけ
  daySummary: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  daySummaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingBottom: 4,
  },
  daySummaryHeaderText: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  daySummaryDate: {
    fontSize: 15,
    fontWeight: '700',
    flexShrink: 1,
  },
  daySummaryMeta: {
    fontSize: 12,
  },
  daySummaryAmount: {
    fontSize: 15,
    fontWeight: '700',
  },
  daySummaryClear: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chart: {
    height: CHART_HEIGHT + X_LABEL_ROW_HEIGHT,
    marginTop: 4,
  },
  tickOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  tickLabel: {
    position: 'absolute',
    fontSize: 11,
    fontWeight: '600',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 3,
  },
  tickLabelLeft: {
    left: 4,
  },
  xAxisLabel: {
    position: 'absolute',
    fontSize: 10,
    textAlign: 'center',
  },
  tapColumns: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: CHART_HEIGHT,
  },
  tapColumn: {
    position: 'absolute',
    top: 0,
    bottom: 0,
  },
  // 日別のタグ内訳（TagChartDaySummary）の行。タップ中の背景に少し角丸を付ける ──
  // daySummary 自体がカードの内側にインデントされた小さな一覧なので、rankingRow と違って
  // カードの端まで広げる負のマージンは使わない
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 8,
    marginHorizontal: -8,
    borderRadius: 8,
  },
  // タグランキングの行。タップ中の背景（highlightBackground）をカードの端まで（角丸つきで）
  // 広げるため、カードの左右余白（16pt）ぶんを負のマージンで打ち消してから同じ幅をパディングで
  // 埋め戻す ── 中身の位置は変わらないまま、行自体の箱だけがカードの縁まで伸びる
  rankingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginHorizontal: -16,
    borderRadius: 10,
  },
  nameColumn: {
    flex: 1,
    gap: 2,
  },
  nameLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  // 上位 3 タグの印。付かない行でも幅を揃え、名前の開始位置が行ごとにずれないようにする
  medal: {
    width: 20,
    fontSize: 15,
    textAlign: 'center',
  },
  name: {
    fontSize: 15,
    fontWeight: '600',
    flexShrink: 1,
  },
  // タグ別内訳（TagChartBreakdownList）の行の名前。この行には nameColumn（flex:1）が無いので、
  // ここ自身に flex:1 を持たせて金額を右端に押し出す
  breakdownName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
  },
  meta2: {
    fontSize: 12,
  },
  amount: {
    fontSize: 15,
    fontWeight: '700',
  },
  sparkline: {
    width: SPARKLINE_WIDTH,
    height: SPARKLINE_HEIGHT,
  },
  // 「重ねる」の行タップ（内訳を開く）とは別の当たり判定にする左端のチェック
  checkbox: {
    padding: 4,
  },
  checkboxBox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zeroToggleRow: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  zeroToggleLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  zeroTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingLeft: 4,
  },
  zeroTagName: {
    fontSize: 14,
    flexShrink: 1,
  },
  note: {
    fontSize: 12,
    marginTop: 8,
  },
});
