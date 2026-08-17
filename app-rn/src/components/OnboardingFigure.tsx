// 初回起動チュートリアルの図。HelpPartFigure.tsx と同じ考え方（冒頭コメント参照）──
// **実物の部品・実物の計算関数・実物の定数を使って描く**ので、UI や計算式を直したときに
// 図も一緒に変わる。操作は受け取らない（onChange は空関数）。読み上げからも外す
// （意味は各ページの見出し・本文が持つ。OnboardingOverlay 側で図を囲う）。
//
// 1・2 ページ目は「行を積んだ入力欄」までは実物の NumericField を使わず、HelpPartFigure の
// CalculatorButtonFigure / TargetFieldFigure と同じ簡易行（ラベル + 値の Text）で描く ──
// NumericField は電卓ボタン・MiniCalculator シートまで持つ入力専用の部品で、
// 「読むだけ」の図に置くと外側の噛み合わせ（キーボード・シート）だけが余る。
// 一方、2 択（SegmentedControl）・帯グラフ（CostProportionBar）・データタブの月バー
// （MonthNavBar）・集計段（DataSummaryBar）・3 択（DataModeTabs）・実物の折れ線グラフの棒
// （BarChart）・実績の色とアイコン（categoryColor / CATEGORY_ICONS）・実績の全画面表示
// （AchievementDetailModal.AchievementPageContent）は表示専用の部品なのでそのまま使う。
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { BarChart } from 'react-native-gifted-charts';
import { Circle, Polyline, Svg } from 'react-native-svg';

import { AchievementPageContent } from '@/components/AchievementDetailModal';
import { CATEGORY_ICONS, categoryColor, type TagLookup } from '@/components/AchievementsSection';
import { CostProportionBar } from '@/components/CostProportionBar';
import { DataModeTabs } from '@/components/DataModeTabs';
import { DataSummaryBar, type DataSummaryValue } from '@/components/DataSummaryBar';
import { MonthNavBar } from '@/components/MonthNavBar';
import { PackBuyFields, packBuyCardStyle } from '@/components/PackBuyFields';
import { PhotoThumbnail } from '@/components/PhotoThumbnail';
import { PresetRow } from '@/components/PresetRow';
import { PriceLine } from '@/components/PriceLine';
import { PriceSlider } from '@/components/PriceSlider';
import { RecordKindSelector } from '@/components/RecordKindSelector';
import { SegmentedControl } from '@/components/SegmentedControl';
import { TagChip } from '@/components/TagChip';
import type { Achievement } from '@/logic/achievements';
import { costBreakdown, requiredPriceResult, type CalcFormValues } from '@/logic/calcForm';
import { formatCalcTotal, formatUnitYen, formatYenSymbol } from '@/logic/format';
import { PRICING_EXAMPLE, PRICING_EXAMPLE_SIMULATED_PRICE } from '@/logic/helpFigureExample';
import {
  CALC_PICK_PACKAGING_LABEL,
  CALC_PICKER_BACK_LABEL,
  CALC_SUBMIT_LABEL,
  CUMULATIVE_PROFIT_LABEL,
  DATA_MODE_ACHIEVEMENTS_LABEL,
  DATA_MODE_PROFIT_LABEL,
  DATA_MODE_TAG_LABEL,
  ENVELOPE_COST_LABEL,
  EXPENSES_LABEL,
  ITEM_NAME_CAPTION,
  LISTING_STATUS_LABEL,
  ONBOARDING_RECORD_ADDED_LABEL,
  periodProfitLabel,
  POSTAGE_LABEL,
  presetPickedCountLabel,
  presetPickerTitle,
  pricingHeroAmount,
  PROFIT_TREND_LABEL,
  profitLabel,
  profitTabLabel,
  REQUIRED_SALES_PRICE_LABEL,
  SALES_PRICE_LABEL,
  ADD_RECORD_FAB_LABEL,
  SAVE_LABEL,
  SHIPPING_ONLY_LABEL,
  simulatorProfitNote,
  SIMULATOR_NOTE,
  TAG_LABEL,
  TARGET_TAB_LABEL,
  TOTAL_PROFIT_LABEL,
  TOTAL_SALES_LABEL,
  commissionFieldLabel,
  switchStatusLabel,
  targetProfitLabel,
  withShippingMaterialLabel,
} from '@/logic/labels';
import {
  ONBOARDING_ACHIEVEMENT_CATEGORIES,
  ONBOARDING_ACHIEVEMENT_FEATURED_ID,
  ONBOARDING_CALC_EXAMPLE,
  ONBOARDING_CHART_PROFITS,
  ONBOARDING_DATA_EXAMPLE,
  ONBOARDING_ITEM_NAME_EXAMPLE,
  ONBOARDING_PACKAGING_PRESET_EXAMPLE,
  ONBOARDING_SHIPPING_PRESET_EXAMPLE,
  ONBOARDING_SITE_PRESET_EXAMPLE,
  ONBOARDING_TAG_EXAMPLE,
  ONBOARDING_TARGET_PROFIT_EXAMPLE,
} from '@/logic/onboardingContent';
import { presetUnitPrice } from '@/logic/preset';
import { commissionCost, netProfit } from '@/logic/profit';
import { analyzePricing } from '@/logic/pricing';
import { useThemeColors, type ThemeColors } from '@/theme';

/** 図の中の部品は触れない。押せると「ここで設定できる」と読まれる（HelpPartFigure と同じ） */
const noop = () => {};

/** 図の中の実績・記録詳細へのリンク先はない。タップしても何も起きない（noop と同じ理由） */
const NO_TAG_LOOKUP: TagLookup = () => undefined;

function FieldRow({
  label,
  value,
  colors,
  valueColor,
}: {
  label: string;
  value: string;
  colors: ThemeColors;
  /** 記録フォームの「決めていません」のような未入力の値だけを薄くする（TargetFieldFigure と同じ） */
  valueColor?: string;
}) {
  return (
    <View style={styles.fieldRow}>
      <Text style={[styles.fieldLabel, { color: colors.label }]} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[styles.fieldValue, { color: valueColor ?? colors.label }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function ArrowDown({ colors }: { colors: ThemeColors }) {
  return (
    <View style={styles.arrowRow}>
      <Ionicons name="arrow-down" size={16} color={colors.secondaryLabel} />
    </View>
  );
}

function ResultBlock({
  label,
  amount,
  amountColor,
  colors,
}: {
  label: string;
  amount: string;
  amountColor: string;
  colors: ThemeColors;
}) {
  return (
    <View style={[styles.resultBlock, { backgroundColor: colors.disabledBackground }]}>
      <Text style={[styles.resultLabel, { color: colors.secondaryLabel }]}>{label}</Text>
      <Text style={[styles.resultAmount, { color: amountColor }]} numberOfLines={1}>
        {amount}
      </Text>
    </View>
  );
}

/**
 * 1 ページ目「入れた分だけ、利益が見える」。実物の netProfit で結果を、実物の costBreakdown で
 * 内訳の帯グラフを出す。送料だけでなく梱包材（envelopeCost）も入れてあるのは、経費が
 * 1 項目だけだと帯グラフの区画が 1 色に潰れ、「内訳」の絵として意味を持たないため。
 */
export function OnboardingCalcFigure() {
  const colors = useThemeColors();
  const { salesPrice, postage, envelopeCost, commission } = ONBOARDING_CALC_EXAMPLE;
  const costs = {
    salesPrice,
    purchasePrice: 0,
    postage,
    envelopeCost,
    othersCost: 0,
    commission,
  };
  const profit = netProfit(costs);
  const breakdown = costBreakdown(costs, 'used');

  return (
    <View style={styles.figureStack}>
      {/* カード 1: 入力欄。矢印の前後を別カードにして「入力 → 結果」の変換だと読ませる
          （構成の指定） */}
      <View style={[styles.card, { backgroundColor: colors.secondaryBackground }]}>
        <SegmentedControl
          options={[profitTabLabel('ja', 'used'), TARGET_TAB_LABEL]}
          selectedIndex={0}
          onChange={noop}
        />
        <View style={styles.rows}>
          <FieldRow label={SALES_PRICE_LABEL} value={formatYenSymbol(salesPrice)} colors={colors} />
          <FieldRow label={POSTAGE_LABEL} value={formatYenSymbol(postage)} colors={colors} />
          <FieldRow label={ENVELOPE_COST_LABEL} value={formatYenSymbol(envelopeCost)} colors={colors} />
          <FieldRow
            label={commissionFieldLabel('ja', commission)}
            value={formatYenSymbol(commissionCost(costs))}
            colors={colors}
          />
        </View>
      </View>

      <ArrowDown colors={colors} />

      {/* カード 2: 結果 */}
      <View style={[styles.card, { backgroundColor: colors.secondaryBackground }]}>
        <ResultBlock
          label={profitLabel('ja', 'used')}
          amount={formatYenSymbol(profit)}
          amountColor={profit >= 0 ? colors.green : colors.red}
          colors={colors}
        />
        <CostProportionBar parts={breakdown.parts} kept={breakdown.kept} deducted={breakdown.deducted} />
      </View>
    </View>
  );
}

/**
 * 2 ページ目「目標から逆算もできる」。実物の requiredPriceResult は送料・梱包材・手数料を
 * まとめて引いた上で必要な販売価格を出すので、1 ページ目と同じ題材（送料・梱包材・手数料）を
 * そのまま渡す。結果の下に実物の帯グラフ（CostProportionBar）も出し、「必要な販売価格の中身」
 * が読めるようにする。
 */
export function OnboardingTargetFigure() {
  const colors = useThemeColors();
  const { postage, envelopeCost, commission } = ONBOARDING_CALC_EXAMPLE;
  const values: CalcFormValues = {
    kind: 'used',
    salesPrice: '',
    purchasePrice: '',
    postage: String(postage),
    envelopeCost: String(envelopeCost),
    othersCost: '',
    targetProfit: String(ONBOARDING_TARGET_PROFIT_EXAMPLE),
    commission,
    siteName: '',
  };
  const result = requiredPriceResult(values);

  return (
    <View style={styles.figureStack}>
      {/* カード 1: 入力欄。矢印の前後を別カードにして「入力 → 結果 → 記録」の変換だと
          読ませる（構成の指定） */}
      <View style={[styles.card, { backgroundColor: colors.secondaryBackground }]}>
        <SegmentedControl
          options={[profitTabLabel('ja', 'used'), TARGET_TAB_LABEL]}
          selectedIndex={1}
          onChange={noop}
        />
        <View style={styles.rows}>
          <FieldRow
            label={targetProfitLabel('ja', 'used')}
            value={formatYenSymbol(ONBOARDING_TARGET_PROFIT_EXAMPLE)}
            colors={colors}
          />
        </View>
      </View>

      <ArrowDown colors={colors} />

      {/* カード 2: 結果 + 記録する操作 */}
      <View style={[styles.card, { backgroundColor: colors.secondaryBackground }]}>
        <ResultBlock
          label={REQUIRED_SALES_PRICE_LABEL}
          amount={formatYenSymbol(result.requiredPrice)}
          amountColor={colors.blue}
          colors={colors}
        />
        <CostProportionBar parts={result.parts} kept={result.kept} deducted={result.deducted} />

        <View style={[styles.saveButton, { backgroundColor: colors.blue }]}>
          <Text style={styles.saveButtonLabel}>{ADD_RECORD_FAB_LABEL}</Text>
        </View>
      </View>

      <ArrowDown colors={colors} />

      {/* カード 3: 記録した結果 */}
      <View style={[styles.card, { backgroundColor: colors.secondaryBackground }]}>
        <View style={styles.successRow}>
          <Ionicons name="checkmark-circle" size={18} color={colors.green} />
          <Text style={[styles.successLabel, { color: colors.label }]} numberOfLines={1}>
            {ONBOARDING_RECORD_ADDED_LABEL}
          </Text>
          <Text style={[styles.successAmount, { color: colors.green }]} numberOfLines={1}>
            +{formatYenSymbol(ONBOARDING_TARGET_PROFIT_EXAMPLE)}
          </Text>
        </View>
      </View>
    </View>
  );
}

/**
 * 3 ページ目「よく使う値はプリセットに」。3 種類のプリセット（販売サイトの手数料・送料・
 * 梱包材）を並べる ── 3 種類ともプリセットから選べることを見せる（構成の指定「梱包材以外も
 * 入れて、手数料と送料もあるでしょ」）。並びは販売サイト → 送料 → 梱包材（構成の指定「送料
 * 部分と手数料部分を逆に」で、本文（ONBOARDING_PRESET_BODY）の説明順もこれに揃えてある）。
 * カード 1 は販売サイト（手数料）プリセットの行（実物の PresetRow。type が 'site' だと
 * 右端の額が自動で「%」表記になる）。カード 2 は送料プリセットの選択行（同じ PresetRow。
 * 送料のみ／＋資材の 2 択は実物の SegmentedControl）。カード 3 は梱包材の入力欄 ──
 * **行そのものにはタグの入口が無い**（送料・手数料と違い、NumericField の envelopeCost 欄は
 * presetType を渡していないため）。プリセットの入口は電卓を開いた先（実物の MiniCalculator の
 * 「🏷 梱包材から選ぶ」ボタン）にしかないので、行の電卓ボタンの下にその入口の見本を添える形に
 * した（実際の見た目の食い違いを指摘されて修正）。
 */
export function OnboardingPresetFigure() {
  const colors = useThemeColors();
  const { materialCost } = ONBOARDING_SHIPPING_PRESET_EXAMPLE;
  const { envelopeCost } = ONBOARDING_CALC_EXAMPLE;

  return (
    <View style={styles.presetStack}>
      <View style={[styles.card, { backgroundColor: colors.secondaryBackground }]}>
        <PresetRow preset={ONBOARDING_SITE_PRESET_EXAMPLE} />
      </View>

      <View style={[styles.card, { backgroundColor: colors.secondaryBackground }]}>
        <PresetRow
          preset={ONBOARDING_SHIPPING_PRESET_EXAMPLE}
          belowName={
            <SegmentedControl
              options={[SHIPPING_ONLY_LABEL, withShippingMaterialLabel(formatUnitYen(materialCost))]}
              selectedIndex={1}
              onChange={noop}
            />
          }
        />
      </View>

      <View style={[styles.card, { backgroundColor: colors.secondaryBackground }]}>
        {/* 梱包材の行そのものにはタグの入口は無い（送料・手数料と違い、行の外＝電卓の中に
            しかプリセットへの入口を持たない。ファイル冒頭コメント参照）。電卓ボタンだけを
            実物の NumericField（envelopeCost 欄は presetType を渡していない）と同じ形で出す */}
        <View style={styles.presetFieldRow}>
          <Text style={[styles.fieldLabel, { color: colors.label }]} numberOfLines={1}>
            {ENVELOPE_COST_LABEL}
          </Text>
          <View style={styles.grow} />
          <Text style={[styles.fieldValue, { color: colors.label }]} numberOfLines={1}>
            {formatYenSymbol(envelopeCost)}
          </Text>
          <Ionicons name="calculator-outline" size={22} color={colors.blue} />
        </View>

        {/* プリセットの入口は電卓を開いた先にある（実物の MiniCalculator の
            「🏷 梱包材から選ぶ」ボタン。canPickPackaging）。行の下に、その入口の見本を添える */}
        <View style={[styles.pickPackagingRow, { borderTopColor: colors.separator }]}>
          <Ionicons name="pricetag-outline" size={16} color={colors.blue} />
          <Text style={[styles.pickPackagingLabel, { color: colors.blue }]}>
            {CALC_PICK_PACKAGING_LABEL}
          </Text>
        </View>
      </View>
    </View>
  );
}

/**
 * 3 ページ目「写真やタグも一緒に残せる」。記録フォームの入力欄を実物の部品で組む
 * （HelpPartFigure の StatusToggleFigure / PhotoFieldFigure / KindSelectorFigure /
 * TagRowFigure を 1 枚にまとめた形。並びも実物の記録フォームと同じ
 * 「状態 → 商品名・写真 → 種別 → 伝票（販売価格・送料・手数料）→ タグ → 保存」）。
 * 目標欄ではなく伝票の金額行を出すのは、記録フォームが実際に持つ入力の中身が
 * より伝わるため（計算タブの入力を引き継いだ額がそのまま乗る欄）。
 * 商品名は「実際に入れた状態」が伝わるよう、記入済みの例（ONBOARDING_ITEM_NAME_EXAMPLE）を出す。
 */
export function OnboardingSaveFigure() {
  const colors = useThemeColors();
  const { salesPrice, postage, commission } = ONBOARDING_CALC_EXAMPLE;
  const commissionAmount = commissionCost({
    salesPrice,
    purchasePrice: 0,
    postage,
    envelopeCost: 0,
    othersCost: 0,
    commission,
  });

  return (
    <View style={[styles.card, { backgroundColor: colors.secondaryBackground }]}>
      <View style={styles.statusRow}>
        <View style={styles.statusLeft}>
          <View style={[styles.statusDot, { backgroundColor: colors.orange }]} />
          <Text style={[styles.statusLabel, { color: colors.orange }]}>{LISTING_STATUS_LABEL}</Text>
        </View>
        <Text style={[styles.statusLink, { color: colors.blue }]}>{switchStatusLabel(true)}</Text>
      </View>

      <View style={styles.photoRow}>
        <PhotoThumbnail fileName={null} />
        <View style={styles.grow}>
          <Text style={[styles.fieldLabel, { color: colors.label }]}>
            {ONBOARDING_ITEM_NAME_EXAMPLE}
          </Text>
          <View style={[styles.underline, { backgroundColor: colors.blue }]} />
          <Text style={[styles.caption, { color: colors.secondaryLabel }]}>
            {ITEM_NAME_CAPTION}
          </Text>
        </View>
      </View>

      <RecordKindSelector kind="used" onChange={noop} />

      <View style={styles.rows}>
        <FieldRow label={SALES_PRICE_LABEL} value={formatYenSymbol(salesPrice)} colors={colors} />
        <FieldRow label={POSTAGE_LABEL} value={formatYenSymbol(postage)} colors={colors} />
        <FieldRow
          label={commissionFieldLabel('ja', commission)}
          value={formatYenSymbol(commissionAmount)}
          colors={colors}
        />
      </View>

      <View style={styles.tagRow}>
        <Text style={[styles.fieldLabel, { color: colors.label }]}>{TAG_LABEL}</Text>
        <TagChip tag={{ name: ONBOARDING_TAG_EXAMPLE, colorKey: 'blue' }} variant="selected" />
      </View>

      <View style={[styles.saveButton, { backgroundColor: colors.blue }]}>
        <Text style={styles.saveButtonLabel}>{SAVE_LABEL}</Text>
      </View>
    </View>
  );
}

/**
 * 5 ページ目「出品中でも、値下げを試せる」。使いかたの PriceLineFigure / SimulatorFigure
 * （HelpPartFigure.tsx）と同じ実物の部品（PriceLine / PriceSlider）・同じ題材
 * （helpFigureExample.PRICING_EXAMPLE）を使う。つまみは pointerEvents="none" で包む ──
 * disabled を使わないのは、それが実物では「価格が未設定」の見た目になり、
 * 別の場面の図になってしまうため（HelpPartFigure.SimulatorFigure のコメントと同じ理由）。
 */
export function OnboardingSimulatorFigure() {
  const colors = useThemeColors();
  const analysis = analyzePricing(PRICING_EXAMPLE);
  const simulated = analyzePricing({
    ...PRICING_EXAMPLE,
    salesPrice: PRICING_EXAMPLE_SIMULATED_PRICE,
  });

  return (
    <View style={[styles.card, { backgroundColor: colors.secondaryBackground }]}>
      <PriceLine analysis={analysis} />

      <Text style={[styles.caption, { color: colors.secondaryLabel }]}>{SIMULATOR_NOTE}</Text>

      <View style={styles.simulatorRow}>
        <Text style={[styles.simulatorPrice, { color: colors.label }]}>
          {formatYenSymbol(PRICING_EXAMPLE_SIMULATED_PRICE)}
        </Text>
        <View style={styles.simulatorProfit}>
          <Text style={[styles.simulatorAmount, { color: colors.green }]}>
            {pricingHeroAmount(simulated.current?.netProfit ?? 0)}
          </Text>
          <Text style={[styles.caption, { color: colors.secondaryLabel }]}>
            {simulatorProfitNote(simulated.current?.profitRate ?? null)}
          </Text>
        </View>
      </View>

      <View pointerEvents="none">
        <PriceSlider
          min={analysis.range.min}
          max={analysis.range.max}
          value={PRICING_EXAMPLE_SIMULATED_PRICE}
          onChange={noop}
          snapPoints={[analysis.breakEven, ...(analysis.targetPrice == null ? [] : [analysis.targetPrice])]}
        />
      </View>

      <View style={styles.simulatorRange}>
        <Text style={[styles.caption, { color: colors.secondaryLabel }]}>
          {formatYenSymbol(analysis.range.min)}
        </Text>
        <Text style={[styles.caption, { color: colors.secondaryLabel }]}>
          {formatYenSymbol(analysis.range.max)}
        </Text>
      </View>
    </View>
  );
}

/** react-native-gifted-charts の BarChart に渡す横幅。ページの左右余白(24×2)・カードの
 * 左右余白(16×2)ぶんを引く。DataScreen.tsx のように画面幅いっぱいまでは使わない
 * （こちらはカードの中に収める図なので、カードの外までは伸ばさない） */
const CHART_MARGIN = 24 * 2 + 16 * 2;
const CHART_HEIGHT = 90;
/** BarChart 側の目盛り列の幅（yAxisLabelWidth）。棒の描画域はこの右から始まるので、
 * 重ねる折れ線もここぶんだけ右へずらす */
const CHART_Y_AXIS_LABEL_WIDTH = 40;
/** 棒 1 本の幅・間隔・先頭の余白。BarChart の props とここ 1 か所にしか書かない ──
 * 重ねる折れ線の x 座標（棒の中心）をこの値から直接計算するので、
 * 2 か所に別々の数字を書くと棒と線がずれる（実際にずれた不具合の原因） */
const CHART_BAR_WIDTH = 16;
const CHART_BAR_SPACING = 18;
const CHART_INITIAL_SPACING = 12;
const CHART_END_SPACING = 12;
/** 棒の軸（日別収支）の上限。ONBOARDING_CHART_PROFITS の最大値（¥4,000）に収まる、
 * 4 等分で割り切れるキリのいい額 */
const CHART_MAX_VALUE = 4000;
/**
 * 折れ線（累計収支）専用の軸の上限。累計の最終値（¥12,685）ぎりぎりまで詰めた額 ──
 * 余白を大きく取ると（例: ¥15,000）、いちばん高い棒の日でも折れ線の上がり方が小さく見えて
 * 「棒が高いのに線があまり上がっていない」と食い違って見える。上限を実際の最終値に近づけるほど、
 * 同じ 1 日の伸びが縦方向により大きく反映される。
 */
const CHART_CUMULATIVE_MAX_VALUE = 12700;
/** 折れ線の上下の余白（棒の頂点・x 軸の線に線・点がぴったり重ならないようにする） */
const CHART_LINE_PADDING = 8;

/**
 * 4 ページ目「3つの見方で販売を振り返る」。データタブの上から並ぶ実物の部品をそのまま積む
 * （月バー → 集計段 → 3 択 → グラフ、という DataScreen.tsx と同じ順）。
 * グラフも実物と同じ react-native-gifted-charts の BarChart を使い、赤字の日は赤い棒にする
 * （DataScreen.ChartView と同じ規則）。累計収支は棒グラフに**重ねて**折れ線で出す（構成の指定
 * 「棒グラフと被せて」）── react-native-svg の Polyline + Circle を BarChart の上に
 * position: absolute で重ね、座標はこちらで計算する。BarChart 自身の 2 軸機能
 * （showLine + secondaryYAxis）は、この組み合わせで線が描画領域の外まで伸びて途中で切れる
 * 問題があったため使わない。目盛り（Y 軸の数字）は棒グラフ側に実物と同じく出す。
 * 凡例は見出しの右に添える。
 * 額は DataSummaryBar.tsx 冒頭コメントの例と同じ（収支 ¥12,685 / 売上 ¥15,145 / 経費 ¥2,460）。
 */
export function OnboardingDataFigure() {
  const colors = useThemeColors();
  const { width: windowWidth } = useWindowDimensions();
  const { period, earliestMonthKey, currentMonthKey, totalNetProfit, totalSales, totalExpenses } =
    ONBOARDING_DATA_EXAMPLE;

  const profitValue: DataSummaryValue = {
    label: periodProfitLabel(period),
    value: formatYenSymbol(totalNetProfit),
    color: totalNetProfit >= 0 ? colors.green : colors.red,
  };
  const contextValues: [DataSummaryValue, DataSummaryValue] = [
    { label: TOTAL_SALES_LABEL, value: formatYenSymbol(totalSales), color: colors.blue },
    { label: EXPENSES_LABEL, value: formatYenSymbol(totalExpenses), color: colors.red },
  ];
  const chartData = ONBOARDING_CHART_PROFITS.map((value) => ({
    value,
    frontColor: value < 0 ? colors.red : colors.green,
  }));
  // 累計収支。ONBOARDING_CHART_PROFITS の先頭からの累積和で、最後の値が
  // ONBOARDING_DATA_EXAMPLE.totalNetProfit（¥12,685）とぴったり一致する
  const cumulativeValues = ONBOARDING_CHART_PROFITS.reduce<number[]>((acc, profit) => {
    const previous = acc.length > 0 ? acc[acc.length - 1] : 0;
    return [...acc, previous + profit];
  }, []);
  const chartWidth = Math.max(160, windowWidth - CHART_MARGIN);

  return (
    <View style={[styles.card, styles.dataCard, { backgroundColor: colors.secondaryBackground }]}>
      <MonthNavBar
        period={period}
        earliestMonthKey={earliestMonthKey}
        currentMonthKey={currentMonthKey}
        onChangePeriod={noop}
        onPressTitle={noop}
      />
      <View style={[styles.dataDivider, { backgroundColor: colors.separator }]} />
      <DataSummaryBar profit={profitValue} context={contextValues} />

      <View style={styles.dataChartBlock}>
        <DataModeTabs
          options={[DATA_MODE_PROFIT_LABEL, DATA_MODE_TAG_LABEL, DATA_MODE_ACHIEVEMENTS_LABEL]}
          selectedIndex={0}
          onChange={noop}
        />

        {/* 見出しの右に凡例（構成の指定「収支の推移の横に置いて」）。緑=日別の棒・青=重ねた
            累計収支の折れ線 */}
        <View style={styles.chartHeaderRow}>
          <Text style={[styles.chartTitle, { color: colors.label }]}>{PROFIT_TREND_LABEL}</Text>
          <View style={styles.chartLegend}>
            <LegendDot color={colors.green} label={TOTAL_PROFIT_LABEL} colors={colors} />
            <LegendDot color={colors.blue} label={CUMULATIVE_PROFIT_LABEL} colors={colors} />
          </View>
        </View>

        <View style={styles.chartStack}>
          <BarChart
            data={chartData}
            height={CHART_HEIGHT}
            width={chartWidth}
            maxValue={CHART_MAX_VALUE}
            noOfSections={4}
            mostNegativeValue={-1000}
            noOfSectionsBelowXAxis={1}
            yAxisLabelWidth={CHART_Y_AXIS_LABEL_WIDTH}
            yAxisLabelPrefix="¥"
            yAxisTextStyle={{ color: colors.secondaryLabel, fontSize: 9 }}
            yAxisThickness={0}
            xAxisColor={colors.secondaryLabel}
            rulesColor={colors.separator}
            isAnimated={false}
            barWidth={CHART_BAR_WIDTH}
            spacing={CHART_BAR_SPACING}
            barBorderRadius={4}
            initialSpacing={CHART_INITIAL_SPACING}
            endSpacing={CHART_END_SPACING}
            frontColor={colors.green}
          />
          <CumulativeLineOverlay values={cumulativeValues} width={chartWidth} colors={colors} />
        </View>
      </View>
    </View>
  );
}

function LegendDot({ color, label, colors }: { color: string; label: string; colors: ThemeColors }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={[styles.legendLabel, { color: colors.secondaryLabel }]}>{label}</Text>
    </View>
  );
}

/**
 * 累計収支の折れ線（react-native-svg の Polyline + Circle。AchievementsSection.ProgressRing
 * と同じ描き方）。BarChart の上に position: absolute で重ねる ── 棒とは軸（縮尺）が違う
 * （0〜CHART_CUMULATIVE_MAX_VALUE）ので、座標はここで自分で計算する（ファイル冒頭コメント参照）。
 * 左端は yAxisLabelWidth ぶん右へずらして、棒の描画域と揃える。
 */
function CumulativeLineOverlay({
  values,
  width,
  colors,
}: {
  values: readonly number[];
  width: number;
  colors: ThemeColors;
}) {
  const plotHeight = CHART_HEIGHT - CHART_LINE_PADDING * 2;
  // 棒の中心の x 座標と同じ式（BarChart に渡している initialSpacing/barWidth/spacing から）。
  // 「幅いっぱいに均等割り」だと棒の実際の間隔（spacing）と揃わずズレる
  const points = values.map((value, index) => {
    const ratio = Math.min(1, Math.max(0, value / CHART_CUMULATIVE_MAX_VALUE));
    return {
      x:
        CHART_INITIAL_SPACING +
        index * (CHART_BAR_WIDTH + CHART_BAR_SPACING) +
        CHART_BAR_WIDTH / 2,
      y: CHART_LINE_PADDING + plotHeight * (1 - ratio),
    };
  });
  const polylinePoints = points.map((point) => `${point.x},${point.y}`).join(' ');

  return (
    <View
      style={[styles.chartOverlay, { left: CHART_Y_AXIS_LABEL_WIDTH, width, height: CHART_HEIGHT }]}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <Svg width={width} height={CHART_HEIGHT}>
        <Polyline
          points={polylinePoints}
          fill="none"
          stroke={colors.blue}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {points.map((point, index) => (
          <Circle key={index} cx={point.x} cy={point.y} r={3} fill={colors.blue} />
        ))}
      </Svg>
    </View>
  );
}

/** 図の中の実績は固定で「達成済み」にする。target/current/completedRecord* は表示に使われないので
 * ダミーの日付だけ揃える（AchievementBadge・AchievementPage は id・completed・completedAt しか読まない） */
const ONBOARDING_ACHIEVEMENT_COMPLETED_AT = new Date('2026-08-01T00:00:00.000');

function exampleAchievement(id: Achievement['id']): Achievement {
  return {
    id,
    target: 1,
    current: 1,
    completed: true,
    completedAt: ONBOARDING_ACHIEVEMENT_COMPLETED_AT,
    completedRecord: null,
    completedRecords: [],
  };
}

/**
 * 7 ページ目「梱包材はまとめ買いも自動計算」。矢印の前後を別カードにして
 * 「登録する（プリセット編集）→ 呼び出す（電卓の中）」の 2 段だと読ませる
 * （構成の指定「設定した梱包材のプリセットは電卓から呼び出すことを矢印で表して」）。
 *
 * カード 1 は実物の PackBuyFields（プリセット編集画面のまとめ買い 3 行と全く同じ部品）に、
 * 実物の presetUnitPrice（購入価格 ÷ 入数）で計算した値をそのまま渡す。電卓を含む
 * NumericField をそのまま使っているので pointerEvents="none" で包む
 * （OnboardingTargetFigure の PriceSlider と同じ理由。ファイル冒頭コメント参照）。
 *
 * カード 2 は実物の PresetMultiPickerSheet（電卓の「🏷 梱包材から選ぶ」の先。
 * MiniCalculator.tsx 参照）の簡易再現。実物は usePresetList でユーザーの DB を読む
 * シートなので図にはそのまま使えず、同じヘッダ（‹ 電卓／見出し）・チェック行（実物の
 * PresetRow）・下端の合計行という構成だけをカード 1 と同じ 1 件のプリセットで組み直した。
 */
export function OnboardingPackagingPresetFigure() {
  const colors = useThemeColors();
  const { name, initial, colorKey, packPrice, packQuantity } = ONBOARDING_PACKAGING_PRESET_EXAMPLE;
  const unitPrice = presetUnitPrice(packPrice, packQuantity) ?? 0;
  const pickerPreset = {
    type: 'packaging' as const,
    name,
    initial,
    colorKey,
    value: unitPrice,
    packQuantity,
  };

  return (
    <View style={styles.figureStack}>
      <View style={[styles.card, packBuyCardStyle, { backgroundColor: colors.secondaryBackground }]}>
        <View pointerEvents="none">
          <PackBuyFields
            packQuantity={String(packQuantity)}
            packPrice={String(packPrice)}
            onChangePackQuantity={noop}
            onChangePackPrice={noop}
            unitPrice={unitPrice}
          />
        </View>
      </View>

      <ArrowDown colors={colors} />

      <View style={[styles.card, styles.pickerCard, { backgroundColor: colors.secondaryBackground }]}>
        <View style={styles.pickerHeader}>
          <View style={styles.pickerHeaderSide}>
            <Ionicons name="chevron-back" size={18} color={colors.blue} />
            <Text style={[styles.pickerBackLabel, { color: colors.blue }]}>
              {CALC_PICKER_BACK_LABEL}
            </Text>
          </View>
          <Text style={[styles.pickerTitle, { color: colors.label }]} numberOfLines={1}>
            {presetPickerTitle('ja', 'packaging')}
          </Text>
          <View style={styles.pickerHeaderSide} />
        </View>

        <View style={styles.pickerRow}>
          <Ionicons name="checkmark-circle" size={22} color={colors.blue} />
          <View style={styles.grow}>
            <PresetRow preset={pickerPreset} />
          </View>
        </View>

        <View style={[styles.pickerFooter, { borderTopColor: colors.separator }]}>
          <View style={styles.grow}>
            <Text style={[styles.caption, { color: colors.secondaryLabel }]}>
              {presetPickedCountLabel(1)}
            </Text>
            <Text style={[styles.pickerTotal, { color: colors.label }]}>
              {formatCalcTotal(unitPrice)}
            </Text>
          </View>
          <View style={[styles.pickerSubmit, { backgroundColor: colors.blue }]}>
            <Text style={styles.pickerSubmitLabel}>{CALC_SUBMIT_LABEL}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const ACHIEVEMENT_ICON_SIZE = 40;

/**
 * AchievementPageContent はバッジのカードに `minHeight: screenHeight / 2` を敷く
 * （実物のモーダルは画面の半分を確保する仕様のため）。オンボーディングの図の枠
 * （OnboardingOverlay.FIGURE_AREA_HEIGHT）はそこまで大きくないので、実際の端末の高さの
 * 代わりにこの小さい値を渡して、バッジのカードを図の枠に収まりやすい高さに縮める
 * （構成の指定「実績の全画面表示をもう少し潰そう」）。
 */
const ONBOARDING_FEATURED_ACHIEVEMENT_HEIGHT_BASIS = 480;

/**
 * 5 ページ目「続けるほど実績が増えていく」。上段は色とアイコンだけの丸（5 ジャンルぶん。
 * categoryColor / CATEGORY_ICONS という実物の定数から色とアイコンを引く）。
 * 下段には「はじめる系」の実例（first_sale =「初めての一歩」）を、実物の全画面表示の中身
 * （AchievementDetailModal.AchievementPageContent。ScrollView を持たない版。ファイル冒頭の
 * import コメント参照）のままページの中に埋め込む。
 */
export function OnboardingAchievementsFigure() {
  const colors = useThemeColors();
  const featured = exampleAchievement(ONBOARDING_ACHIEVEMENT_FEATURED_ID);

  return (
    <View style={styles.achievementsBlock}>
      <View style={styles.achievementRow}>
        {ONBOARDING_ACHIEVEMENT_CATEGORIES.map((category) => (
          <View
            key={category}
            style={[styles.achievementCircle, { backgroundColor: categoryColor(category, colors) }]}>
            <Ionicons name={CATEGORY_ICONS[category]} size={18} color="#FFFFFF" />
          </View>
        ))}
      </View>

      <View
        style={[styles.featuredFrame, { backgroundColor: colors.background }]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants">
        <AchievementPageContent
          achievement={featured}
          colors={colors}
          screenHeight={ONBOARDING_FEATURED_ACHIEVEMENT_HEIGHT_BASIS}
          onPressRecord={noop}
          resolveTag={NO_TAG_LOOKUP}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // 矢印でつないだ複数カードの縦積み（OnboardingCalcFigure / OnboardingTargetFigure）
  figureStack: {
    gap: 4,
  },
  // OnboardingPresetFigure（矢印を挟まない 3 枚のカードの縦積み。figureStack より余白を広く取る）
  presetStack: {
    gap: 10,
  },
  card: {
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  rows: {
    gap: 2,
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 40,
  },
  fieldLabel: {
    fontSize: 15,
  },
  fieldValue: {
    fontSize: 16,
    fontWeight: '600',
  },
  // プリセットの入口(タグアイコン)と電卓ボタンを同じ行に持つ欄(OnboardingPresetFigure)。
  // 実物の NumericField と同じ並び(ラベル → タグ入口 → 値 → 電卓)
  presetFieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 44,
  },
  // 実物の MiniCalculator「🏷 梱包材から選ぶ」ボタンの見本（OnboardingPresetFigure）
  pickPackagingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  pickPackagingLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  // OnboardingPackagingPresetFigure カード 2（電卓の「梱包材を選ぶ」シートの簡易再現）
  pickerCard: {
    gap: 10,
  },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pickerHeaderSide: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  pickerBackLabel: {
    fontSize: 14,
  },
  pickerTitle: {
    flex: 2,
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '700',
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  pickerFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  pickerTotal: {
    fontSize: 18,
    fontWeight: '700',
  },
  pickerSubmit: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  pickerSubmitLabel: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  arrowRow: {
    alignItems: 'center',
  },
  resultBlock: {
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    gap: 2,
  },
  resultLabel: {
    fontSize: 13,
  },
  resultAmount: {
    fontSize: 28,
    fontWeight: '800',
  },
  saveButton: {
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonLabel: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  successRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  successLabel: {
    flex: 1,
    fontSize: 14,
  },
  successAmount: {
    fontSize: 14,
    fontWeight: '700',
  },
  // OnboardingSimulatorFigure（HelpPartFigure.SimulatorFigure と同じ「左に価格・右に見込み」の並び）
  simulatorRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
  },
  simulatorPrice: {
    fontSize: 24,
    fontWeight: '700',
  },
  simulatorProfit: {
    alignItems: 'flex-end',
  },
  simulatorAmount: {
    fontSize: 17,
    fontWeight: '700',
  },
  simulatorRange: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  statusLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusLabel: {
    fontSize: 16,
    fontWeight: '700',
  },
  statusLink: {
    fontSize: 14,
  },
  photoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  grow: {
    flex: 1,
  },
  underline: {
    height: 2,
    marginTop: 6,
    marginBottom: 4,
  },
  caption: {
    fontSize: 12,
  },
  tagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dataCard: {
    // MonthNavBar / DataSummaryBar は自前で左右パディングを持つので、カード側は詰める
    paddingHorizontal: 0,
  },
  dataDivider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 16,
  },
  dataChartBlock: {
    paddingHorizontal: 16,
    gap: 8,
  },
  chartHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  chartTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  chartLegend: {
    flexDirection: 'row',
    gap: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendLabel: {
    fontSize: 11,
  },
  chartStack: {
    position: 'relative',
  },
  chartOverlay: {
    position: 'absolute',
    top: 0,
  },
  achievementsBlock: {
    gap: 20,
  },
  achievementRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
  },
  achievementCircle: {
    width: ACHIEVEMENT_ICON_SIZE,
    height: ACHIEVEMENT_ICON_SIZE,
    borderRadius: ACHIEVEMENT_ICON_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featuredFrame: {
    borderRadius: 16,
    overflow: 'hidden',
  },
});
