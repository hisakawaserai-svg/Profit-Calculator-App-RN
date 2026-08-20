// 使いかたの図（採用案 `19c` / 原寸は `20a`）。**画面写真は使わない。**
//
// 画面写真を貼ると UI を直すたびに図が古くなり、「絵と実物が違う」状態が静かに残る。
// 代わりに**逆算の帯（CostProportionBar）と同じ語彙**で描く:
//
//   オレンジ = 手数料 / グレー = 引かれるもの / 緑 = 手元に残る分
//
// この 3 色は計算タブで毎日見ているものなので、図の中で覚え直すことがない。
// グレーの中の区別（送料・経費・仕入）は明度だけで付ける（theme.helpDiagramTones）。
//
// **金額は説明用の固定値で、実際の記録とは連動しない**（案 `20a`）。
// 連動させると「自分の数字」として読まれ、0 件のときに図が壊れる。
// 計算タブの帯が赤系（expenseTones）なのに対して図がグレーなのは、その取り違えを防ぐため。
//
// **図の中の語と数字はこのファイルに置く**（labels.ts / helpContent.ts へ出さない）。
// 4 つの図は 1,500 円の 1 件を共通の題材にしていて、区画の幅・凡例・下の 2 本線の金額が
// 互いに一致していないと意味が壊れる（1,500 − 150 − 215 − 50 = 1,085）。
// 描画と離すと片方だけ直る事故が起きるので、数字と語を並びの隣に置く。
//
// **例外は「売る」ページの題材（`logic/helpFigureExample.ts`）だけ。** あちらは
// このファイルの図（目標と下げ幅）と `HelpPartFigure` の図（価格ライン・シミュレーター）の
// **両方**が読む ── 片方に置くと図どうしに上下関係ができるので、数字だけの置き場を分けた。
// 分けた理由と、そこで固定している条件（目盛りが 3 点そろう・つまみが範囲の内側にある）は
// そのファイルの冒頭と `helpFigureExample.test.ts` にある。
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, useColorScheme, View } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';

import { TIER_CHIP_DARK_COLORS, TIER_COLORS } from '@/components/AchievementsSection';
import { TagChip } from '@/components/TagChip';
import {
  achievementBadgeTier,
  achievementDifficulty,
  type AchievementId,
} from '@/logic/achievements';
import { formatUnitYen, formatYenSymbol, groupDigits } from '@/logic/format';
import {
  ACHIEVEMENT_LADDER_IDS,
  ACHIEVEMENT_ONCE_ID,
  PRICING_EXAMPLE,
} from '@/logic/helpFigureExample';
import {
  presetAreaUnitPrice,
  presetAreaUsePrice,
  presetUnitPrice,
} from '@/logic/preset';
import { analyzePricing } from '@/logic/pricing';
import {
  achievementBadgeTierName,
  achievementName,
  backupCreateButtonLabel,
  backupDiffCurrentHeader,
  backupDiffFileHeader,
  backupCountPhotosLabel,
  backupCountPresetsLabel,
  backupCountRecordsLabel,
  backupCountTagsLabel,
  backupRestoreSectionTitle,
  commissionLabel,
  commissionShortLabel,
  cumulativeProfitLabel,
  envelopeCostLabel,
  expensesLabel,
  formulaTargetLabel,
  helpFigureAchievementKindsSubtitle,
  helpFigureAchievementLadderLabel,
  helpFigureAchievementOnceLabel,
  helpFigureBackupPreviewSubtitle,
  helpFigureBackupReplaceNote,
  helpFigureCostPartsSubtitle,
  helpFigureCsvBasicLabel,
  helpFigureCsvBreakdownLabel,
  helpFigureCsvKindsSubtitle,
  helpFigureCsvSiteLabel,
  helpFigureDayGroupSubtitle,
  helpFigureExcludedLabel,
  helpFigureSample,
  helpFigureFileLabel,
  helpFigureGroupedLabel,
  helpFigureHitLabel,
  helpFigureIncludedLabel,
  helpFigureKeptLabel,
  helpFigureMissLabel,
  helpFigureDuplicateCopiedLabel,
  helpFigureDuplicateDateLabel,
  helpFigureDuplicateSkippedLabel,
  helpFigureDuplicateStatusLabel,
  helpFigureDuplicateSubtitle,
  helpFigureMigrateNewLabel,
  helpFigureMigrateOldLabel,
  helpFigureMigrateSubtitle,
  helpFigureNoneMark,
  helpFigureOneByOneLabel,
  helpFigurePackAreaLabel,
  helpFigurePackQuantityLabel,
  helpFigurePackSubtitle,
  helpFigurePackUsageLabel,
  helpFigurePurchaseNote,
  helpFigurePurchaseShortLabel,
  helpFigurePostageNote,
  helpFigureCommissionNote,
  helpFigureEnvelopeNote,
  helpFigureEnvelopeOthersPart,
  helpFigureOthersNote,
  helpFigureRoundingSubtitle,
  helpFigureRoundFirstLabel,
  helpFigureRoundLastLabel,
  helpFigureSaleDateRangeLabel,
  helpFigureScreenLabel,
  helpFigureSiteAmountSubtitle,
  helpFigureTargetProfitLabel,
  helpFigureTargetRowTitle,
  helpFigureTargetSubtitle,
  helpFigureTotalCaption,
  itemNameLabel,
  memoLabel,
  othersCostLabel,
  photoFieldLabel,
  postageLabel,
  presetAreaUnitPriceLabel,
  presetCalcMethodOptions,
  presetPackPriceFieldLabel,
  presetUnitPriceLabel,
  presetUsePriceLabel,
  purchasePriceLabel,
  filterKindSectionLabel,
  salesPriceLabel,
  tagLabel,
  targetPreviewRoomLabel,
  targetProfitLabel,
  targetProfitUnsetLabel,
  totalProfitLabel,
  chartBarLegendLabel,
  csvDayItemNames,
  helpFigureAppAmountMeasure,
  helpFigureBothSoldSubtitle,
  helpFigureCsvKindLabel,
  helpFigurePackUseNote,
  helpFigureSingleRecordLabel,
  helpFigureSiteAmountMeasure,
  helpFigureSourcedRowTitle,
  helpFigureTagOrSubtitle,
  helpFigureTargetRoomSubtitle,
  helpFigureTotalPriceMeasure,
  profitLabel,
  recordKindLabel,
} from '@/logic/labels';
import type { Locale } from '@/settings/language';
import { useLocale } from '@/settings';
import { useThemeColors, type ThemeColors } from '@/theme';

/** 題材にする 1 件（説明用の固定値）。4 つの図で共通 */
const SALES_PRICE = 1500;
const COMMISSION = 150;
const POSTAGE = 215;
const OTHERS = 50;
const PURCHASE = 500;

/**
 * 図 12（梱包材の 3 方式）の題材。**個数は封筒、面積と使用回数は同じロール 1 本**にしてある ──
 * 同じ買い物を「面積で割るか、回数で割るか」で見比べられるようにするため。
 */
const PACK_PRICE = 800;
const PACK_QUANTITY = 100;
const ROLL_PRICE = 1200;
const PACK_HEIGHT_CM = 30;
const PACK_WIDTH_CM = 200;
const USE_HEIGHT_CM = 30;
const USE_WIDTH_CM = 20;
const USAGE_COUNT = 40;
/** cm² → ㎡（preset.ts の換算と同じ。図では ㎡ の値だけを見せる） */
const SQUARE_CM_PER_M2 = 10_000;

/** 手数料と送料まで引いた額（販売サイトが「手取り」として出すことが多い範囲） */
const SITE_AMOUNT = SALES_PRICE - COMMISSION - POSTAGE;
/** 梱包材ほかも引いた額（このアプリの純利益） */
const APP_AMOUNT = SITE_AMOUNT - OTHERS;
/** 仕入もある場合 */
const PURCHASED_AMOUNT = APP_AMOUNT - PURCHASE;

/** 図の金額表記。**3 桁区切りを入れる**（案 `20a` の原寸が「1,500円」で描かれている） */
const yen = (locale: Locale, value: number) =>
  locale === 'en' ? `¥${groupDigits(value)}` : `${groupDigits(value)}円`;

const BAR_HEIGHT = 38;
const BAR_RADIUS = 6;

/** 実績の★（実物の実績詳細と同じく **5 つ並べて `filled` まで塗る**。空も出す） */
const ACHIEVEMENT_STAR_COUNT = 5;
const ACHIEVEMENT_STAR_SIZE = 14;

type ToneKey = 'commission' | 'light' | 'mid' | 'dark' | 'kept';

function toneColor(tone: ToneKey, colors: ThemeColors): string {
  switch (tone) {
    case 'commission':
      return colors.orange;
    case 'kept':
      return colors.green;
    case 'light':
      return colors.helpDiagramTones[0];
    case 'mid':
      return colors.helpDiagramTones[1];
    case 'dark':
      return colors.helpDiagramTones[2];
  }
}

type Segment = {
  key: string;
  amount: number;
  tone: ToneKey;
  /** 区画の中に載せる語。狭い区画には載せない（読めないので凡例に回す） */
  label?: string;
};

/**
 * 帯 1 本。区画の幅は金額の比でとる。
 *
 * 帯そのものは読み上げから外し、意味は図の見出し・凡例・本文が持つ ──
 * 割合は目で読むものなので、読み上げに「区画」を並べても情報にならない。
 */
function HelpBar({ segments }: { segments: Segment[] }) {
  const colors = useThemeColors();

  return (
    <View
      style={styles.bar}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      {segments.map((segment) => (
        <View
          key={segment.key}
          style={[
            styles.segment,
            { flex: segment.amount, backgroundColor: toneColor(segment.tone, colors) },
          ]}>
          {segment.label != null && (
            <Text style={styles.segmentLabel} numberOfLines={1}>
              {segment.label}
            </Text>
          )}
        </View>
      ))}
    </View>
  );
}

/** 帯の下の色見本。狭くて語を載せられない区画の名前と金額はここが引き受ける */
function HelpLegend({ items }: { items: { key: string; tone: ToneKey; text: string }[] }) {
  const colors = useThemeColors();

  return (
    <View style={styles.legend}>
      {items.map((item) => (
        <View key={item.key} style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: toneColor(item.tone, colors) }]} />
          <Text style={[styles.legendText, { color: colors.secondaryLabel }]}>{item.text}</Text>
        </View>
      ))}
    </View>
  );
}

/**
 * 図 1 枚の器。**見出しと本文は持たない** ── アコーディオンの見出しが題を、
 * 開いた中の地の文が説明を担うので、図の中に重ねると同じ語が 2 回出る。
 * ここが持つのは、絵と（要るときだけ）その場の副題まで。
 */
function FigureFrame({
  subtitle,
  children,
}: {
  subtitle?: string;
  children: React.ReactNode;
}) {
  const colors = useThemeColors();

  return (
    <View style={[styles.figure, { backgroundColor: colors.secondaryBackground }]}>
      {subtitle != null && (
        <Text style={[styles.figureSubtitle, { color: colors.secondaryLabel }]}>{subtitle}</Text>
      )}
      <View style={styles.figureBody}>{children}</View>
    </View>
  );
}

/**
 * 図 1: 不用品と仕入品のちがい（案 `20a`）。
 *
 * **同じ販売価格の帯を 2 本並べる。** 「仕入が挟まって緑が短くなる」ことだけが違いで、
 * 引き算の順番も色の意味も変わらないことが、並べた形そのものから読める。
 */
export function KindComparisonFigure() {
  // 表示語は locale を引数に取る（src/i18n/index.ts の冒頭）
  const locale = useLocale();

  const colors = useThemeColors();
  const deductions: Segment[] = [
    { key: 'commission', amount: COMMISSION, tone: 'commission' },
    { key: 'postage', amount: POSTAGE, tone: 'light' },
    { key: 'others', amount: OTHERS, tone: 'mid' },
  ];

  return (
    <FigureFrame subtitle={helpFigureBothSoldSubtitle(locale, yen(locale, SALES_PRICE))}>
      <Text style={[styles.rowTitle, { color: colors.label }]}>{recordKindLabel(locale, 'used')}</Text>
      <HelpBar
        segments={[
          ...deductions,
          {
            key: 'kept',
            amount: APP_AMOUNT,
            tone: 'kept',
            label: `${profitLabel(locale, 'used')} ${yen(locale, APP_AMOUNT)}`,
          },
        ]}
      />
      <HelpLegend
        items={[
          { key: 'commission', tone: 'commission', text: `${commissionShortLabel(locale)} ${COMMISSION}` },
          { key: 'postage', tone: 'light', text: `${postageLabel(locale)} ${POSTAGE}` },
          { key: 'others', tone: 'mid', text: `${expensesLabel(locale)} ${OTHERS}` },
        ]}
      />

      <Text style={[styles.rowTitle, styles.rowTitleSpaced, { color: colors.label }]}>
        {helpFigureSourcedRowTitle(locale, yen(locale, PURCHASE))}
      </Text>
      <HelpBar
        segments={[
          ...deductions,
          {
            key: 'purchase',
            amount: PURCHASE,
            tone: 'dark',
            label: `${helpFigurePurchaseShortLabel(locale)} ${PURCHASE}`,
          },
          {
            key: 'kept',
            amount: PURCHASED_AMOUNT,
            tone: 'kept',
            label: `${profitLabel(locale, 'sourced')} ${yen(locale, PURCHASED_AMOUNT)}`,
          },
        ]}
      />
    </FigureFrame>
  );
}

/**
 * 図 2: 純利益・利益・収支の使い分け（案 `20a`）。
 *
 * **1 件の 2 枚 → まとめた 1 枚**、という形にする。語の違いが「種別」ではなく
 * **「1 件か、まとめたか」**で決まることが、矢印の向きで読める
 * （SPEC-V2 §5.3: 1 件は種別語、2 件以上は中立語）。
 */
export function TermsFigure() {
  // 表示語は locale を引数に取る（src/i18n/index.ts の冒頭）
  const locale = useLocale();

  const colors = useThemeColors();

  return (
    <FigureFrame>
      <View style={styles.termsRow}>
        <View style={styles.termsSingles}>
          <TermBox
            label={helpFigureSingleRecordLabel(locale, 'used')}
            value={profitLabel(locale, 'used')}
            valueColor={colors.green}
          />
          <TermBox
            label={helpFigureSingleRecordLabel(locale, 'sourced')}
            value={profitLabel(locale, 'sourced')}
            valueColor={colors.green}
          />
        </View>
        <Text style={[styles.termsArrow, { color: colors.secondaryLabel }]}>→</Text>
        <View
          style={[
            styles.termsTotal,
            { borderColor: colors.blue, backgroundColor: colors.highlightBackground },
          ]}>
          <Text style={[styles.termsTotalCaption, { color: colors.secondaryLabel }]}>
            {helpFigureTotalCaption(locale)}
          </Text>
          <Text style={[styles.termsTotalValue, { color: colors.blue }]}>
            {totalProfitLabel(locale)}
          </Text>
        </View>
      </View>
    </FigureFrame>
  );
}

function TermBox({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor: string;
}) {
  const colors = useThemeColors();

  return (
    <View style={[styles.termBox, { borderColor: colors.separator }]}>
      <Text style={[styles.termBoxLabel, { color: colors.label }]}>{label}</Text>
      <Text style={[styles.termBoxValue, { color: valueColor }]}>{value}</Text>
    </View>
  );
}

/**
 * 図 3: 販売サイトの表示額との違い（案 `20a`）。
 *
 * **同じ 1 本の帯に、2 本の線でどこまで引いたかを示す。** 「どちらが正しいか」ではなく
 * **「どこまで引いた金額を見ているか」**の違いだと読ませるための形で、
 * 帯を 2 本並べると「別々の計算」に見えてしまう。
 */
export function SiteAmountFigure() {
  // 表示語は locale を引数に取る（src/i18n/index.ts の冒頭）
  const locale = useLocale();

  const colors = useThemeColors();

  return (
    <FigureFrame subtitle={helpFigureSiteAmountSubtitle(locale)}>
      <HelpBar
        segments={[
          { key: 'commission', amount: COMMISSION, tone: 'commission' },
          { key: 'postage', amount: POSTAGE, tone: 'light' },
          { key: 'others', amount: OTHERS, tone: 'mid' },
          { key: 'kept', amount: APP_AMOUNT, tone: 'kept', label: helpFigureKeptLabel(locale) },
        ]}
      />
      <HelpLegend
        items={[
          { key: 'commission', tone: 'commission', text: `${commissionShortLabel(locale)} ${COMMISSION}` },
          { key: 'postage', tone: 'light', text: `${postageLabel(locale)} ${POSTAGE}` },
          { key: 'others', tone: 'mid', text: helpFigureEnvelopeOthersPart(locale, String(OTHERS)) },
        ]}
      />

      <View style={styles.measures}>
        <Measure
          color={colors.secondaryLabel}
          text={helpFigureSiteAmountMeasure(locale, yen(locale, SITE_AMOUNT))}
        />
        <Measure
          color={colors.blue}
          text={helpFigureAppAmountMeasure(locale, yen(locale, APP_AMOUNT))}
        />
      </View>
    </FigureFrame>
  );
}

function Measure({ color, text }: { color: string; text: string }) {
  const colors = useThemeColors();

  return (
    <View style={styles.measureRow}>
      <View style={[styles.measureLine, { backgroundColor: color }]} />
      <Text style={[styles.measureText, { color: colors.label }]}>{text}</Text>
    </View>
  );
}

/**
 * 図 4: 日付のきまり（案 `20a`）。
 *
 * 選べない側を**斜線**にするのは、色だけで「押せない」を言うと、
 * 薄いグレーが「まだ読み込んでいない」に見えるため。
 * 出品日は説明用の固定値（8/1）で、実際の記録とは連動しない。
 */
export function SaleDateRangeFigure() {
  // 表示語は locale を引数に取る（src/i18n/index.ts の冒頭）
  const locale = useLocale();

  const colors = useThemeColors();

  return (
    <FigureFrame>
      <View style={styles.rangeBar}>
        <View style={[styles.rangeBlocked, { backgroundColor: colors.disabledBackground }]}>
          <Hatching color={colors.separator} />
          <Text style={[styles.rangeBlockedText, { color: colors.secondaryLabel }]}>
            選べません
          </Text>
        </View>
        <View style={[styles.rangeAllowed, { backgroundColor: colors.highlightBackground }]}>
          <Text style={[styles.rangeAllowedText, { color: colors.blue }]}>
            {helpFigureSaleDateRangeLabel(locale)}
          </Text>
        </View>
      </View>
      <View style={styles.rangeCaptions}>
        <Text style={[styles.rangeCaption, { color: colors.secondaryLabel }]}>← 出品より前</Text>
        <Text style={[styles.rangeCaption, { color: colors.secondaryLabel }]}>
          出品日 8/1 から今日まで →
        </Text>
      </View>
    </FigureFrame>
  );
}

/**
 * 図 5: 逆算の出し方（計算ページ）。
 *
 * **図 1 の不用品と同じ帯をそのまま使う。** 逆算は別の計算ではなく、
 * **同じ 1 本の帯をどちら側から見るか**の違いでしかない ── 全体（販売価格）を知って
 * 緑を求めるのが「純利益を出す」、緑（ほしい利益）を知って全体を求めるのが「目標から逆算」。
 * 別の絵にすると「2 つの計算がある」と読まれる。
 */
export function ReversePriceFigure() {
  // 表示語は locale を引数に取る（src/i18n/index.ts の冒頭）
  const locale = useLocale();

  const colors = useThemeColors();

  return (
    <FigureFrame subtitle={helpFigureTargetSubtitle(locale)}>
      <Text style={[styles.rowTitle, { color: colors.label }]}>
        {helpFigureTargetRowTitle(locale)}
      </Text>
      <HelpBar
        segments={[
          { key: 'commission', amount: COMMISSION, tone: 'commission' },
          { key: 'postage', amount: POSTAGE, tone: 'light' },
          { key: 'others', amount: OTHERS, tone: 'mid' },
          {
            key: 'kept',
            amount: APP_AMOUNT,
            tone: 'kept',
            label: `${helpFigureTargetProfitLabel(locale)} ${yen(locale, APP_AMOUNT)}`,
          },
        ]}
      />
      <HelpLegend
        items={[
          { key: 'commission', tone: 'commission', text: `${commissionShortLabel(locale)} ${COMMISSION}` },
          { key: 'postage', tone: 'light', text: `${postageLabel(locale)} ${POSTAGE}` },
          { key: 'others', tone: 'mid', text: `${expensesLabel(locale)} ${OTHERS}` },
        ]}
      />
      {/* 帯の全体が販売価格であることを、幅いっぱいの線で名指しする */}
      <View style={styles.totalMeasure}>
        <View style={[styles.totalLine, { backgroundColor: colors.blue }]} />
        <Text style={[styles.totalText, { color: colors.label }]}>
          {helpFigureTotalPriceMeasure(locale, yen(locale, SALES_PRICE))}
        </Text>
      </View>
    </FigureFrame>
  );
}

/**
 * 図 6: タグを 2 つ選んだとき（記録ページ）。
 *
 * **OR であることは文だけでは伝わらない。** 「どちらか」と書いても、
 * 「両方付いていないと出ない」と読む人がいる。**出る / 出ない**を 1 行ずつ並べて、
 * 両方付いた記録も出ることを列として見せる。
 *
 * チップは実物（`TagChip`）を使う ── 図の中だけの見た目を作ると、
 * 画面で探すときに手がかりにならない。
 */
/**
 * 図 6 の題材（作り物のタグ）。見出しが「「洋服」と「食器」を選ぶと」と名指すので、
 * 名前は 1 か所に置いて図と見出しで食い違わないようにする。
 * **関数にしてある** ── 名前は locale で決まるので、配列のまま持つと言語を切り替えても残る。
 */
function orTags(locale: Locale) {
  const sample = helpFigureSample(locale);
  return {
    first: { name: sample.tagClothes, colorKey: 'red' },
    second: { name: sample.tagTableware, colorKey: 'blue' },
    other: { name: sample.tagBooks, colorKey: 'green' },
  };
}

export function TagFilterOrFigure() {
  // 表示語は locale を引数に取る（src/i18n/index.ts の冒頭）
  const locale = useLocale();

  const colors = useThemeColors();
  const tags = orTags(locale);
  const rows: { key: string; tags: { name: string; colorKey: string }[]; hit: boolean }[] = [
    { key: 'a', tags: [tags.first], hit: true },
    { key: 'b', tags: [tags.second], hit: true },
    { key: 'ab', tags: [tags.first, tags.second], hit: true },
    { key: 'none', tags: [tags.other], hit: false },
  ];

  return (
    <FigureFrame subtitle={helpFigureTagOrSubtitle(locale, tags.first.name, tags.second.name)}>
      {rows.map((row) => (
        <View key={row.key} style={[styles.orRow, { borderColor: colors.separator }]}>
          <View style={styles.orTags}>
            {row.tags.map((tag) => (
              <TagChip key={tag.name} tag={tag} />
            ))}
          </View>
          <Text
            style={[styles.orMark, { color: row.hit ? colors.green : colors.disabledContent }]}>
            {row.hit ? helpFigureHitLabel(locale) : helpFigureMissLabel(locale)}
          </Text>
        </View>
      ))}
    </FigureFrame>
  );
}

/** 図 7 の棒（説明用の固定値）。日ごとの収支 */
const CHART_DAYS = [450, 0, 1085, 320, 0, 780];

/**
 * 図 7: グラフの読みかた（データページ）。
 *
 * **棒と線が別のものを指していることが、文では伝わりにくい。**
 * 棒は「その日だけ」、線は「その日までの合計」で、線が下がらないのはそのため。
 * 線の色はデータタブの実物と同じ indigo にする（図で覚えた色がそのまま使える）。
 */
export function ChartReadingFigure() {
  // 表示語は locale を引数に取る（src/i18n/index.ts の冒頭）
  const locale = useLocale();

  const colors = useThemeColors();
  const max = Math.max(...CHART_DAYS);
  // 累計は棒を左から足したもの。折れ線の頂点はその高さに置く
  const cumulative = CHART_DAYS.reduce<number[]>(
    (acc, value) => [...acc, (acc[acc.length - 1] ?? 0) + value],
    [],
  );
  const total = cumulative[cumulative.length - 1];
  const points = cumulative
    .map((value, index) => {
      const x = ((index + 0.5) / CHART_DAYS.length) * 100;
      const y = 100 - (value / total) * 100;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <FigureFrame>
      <View style={styles.chart}>
        {/* 折れ線は棒の上に重ねる。棒と同じ枠を使うので、頂点の位置が棒とずれない */}
        <Svg style={StyleSheet.absoluteFill} viewBox="0 0 100 100" preserveAspectRatio="none">
          <Polyline
            points={points}
            fill="none"
            stroke={colors.indigo}
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
          />
        </Svg>
        <View style={styles.chartBars}>
          {CHART_DAYS.map((value, index) => (
            <View key={index} style={styles.chartSlot}>
              <View
                style={[
                  styles.chartBar,
                  { height: `${(value / max) * 100}%`, backgroundColor: colors.green },
                ]}
              />
            </View>
          ))}
        </View>
      </View>
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.green }]} />
          <Text style={[styles.legendText, { color: colors.secondaryLabel }]}>
            {chartBarLegendLabel(locale, 'day')}
          </Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendLine, { backgroundColor: colors.indigo }]} />
          <Text style={[styles.legendText, { color: colors.secondaryLabel }]}>
            {cumulativeProfitLabel(locale)}
          </Text>
        </View>
      </View>
    </FigureFrame>
  );
}

/** 図 8 の比較（実際の列数。SPEC-V3 §5.3） */
// 関数にしてある ── 配列のまま持つと import 時に畳まれ、言語を切り替えても文字列が残る
function csvRows(
  locale: Locale,
): { key: string; label: string; backup: boolean; tax: boolean }[] {
  return [
    { key: 'basic', label: helpFigureCsvBasicLabel(locale), backup: true, tax: true },
    { key: 'site', label: helpFigureCsvSiteLabel(locale), backup: true, tax: true },
    { key: 'breakdown', label: helpFigureCsvBreakdownLabel(locale), backup: true, tax: true },
    { key: 'memo', label: memoLabel(locale), backup: true, tax: false },
    { key: 'tag', label: tagLabel(locale), backup: true, tax: false },
  ];
}

/**
 * 図 8: 書き出しの 2 種類（データページ）。
 *
 * **「19 列 / 11 列」という数字だけでは、何が減るのかが分からない。**
 * 減るのはメモとタグで、金額の列は減らないことを行ごとに見せる ──
 * 「確定申告用は情報が足りない版」ではなく「帳簿に関係のない記述を持ち込まない版」だと読める。
 */
export function CsvKindsFigure() {
  // 表示語は locale を引数に取る（src/i18n/index.ts の冒頭）
  const locale = useLocale();

  const colors = useThemeColors();

  return (
    <FigureFrame subtitle={helpFigureCsvKindsSubtitle(locale)}>
      <View style={styles.csvHead}>
        <View style={styles.csvLabelCol} />
        <Text style={[styles.csvKind, { color: colors.label }]}>
          {helpFigureCsvKindLabel(locale, 'backup')}
        </Text>
        <Text style={[styles.csvKind, { color: colors.label }]}>
          {helpFigureCsvKindLabel(locale, 'tax')}
        </Text>
      </View>
      {csvRows(locale).map((row) => (
        <View key={row.key} style={[styles.csvRow, { borderTopColor: colors.separator }]}>
          <Text style={[styles.csvLabel, styles.csvLabelCol, { color: colors.label }]}>
            {row.label}
          </Text>
          <Text style={[styles.csvMark, { color: row.backup ? colors.green : colors.disabledContent }]}>
            {row.backup ? helpFigureIncludedLabel(locale) : helpFigureNoneMark(locale)}
          </Text>
          <Text style={[styles.csvMark, { color: row.tax ? colors.green : colors.disabledContent }]}>
            {row.tax ? helpFigureIncludedLabel(locale) : helpFigureExcludedLabel(locale)}
          </Text>
        </View>
      ))}
    </FigureFrame>
  );
}

/**
 * 図 8b の 4 行（SPEC-V8 §5.4 の差の表）。**題材は「古いファイルを選んでしまった」場面。**
 *
 * 増える側の例にすると、置き換えでも足し算でも同じ結果に見えてしまう ──
 * 減る行があってはじめて「今あるものに足されるのではない」が図から読める。
 */
function backupDiffRows(
  locale: Locale,
): { key: string; label: string; current: number; file: number }[] {
  return [
    { key: 'records', label: backupCountRecordsLabel(locale), current: 53, file: 21 },
    { key: 'tags', label: backupCountTagsLabel(locale), current: 8, file: 5 },
    { key: 'presets', label: backupCountPresetsLabel(locale), current: 6, file: 6 },
    { key: 'photos', label: backupCountPhotosLabel(locale), current: 31, file: 12 },
  ];
}

/**
 * 図 8b: 復元する前のプレビュー（残すページ）。
 *
 * **「すべて置き換える」が何をするのかは、数字を 2 列並べないと言えない。**
 * 文だけだと「今あるものに足される」と読む余地が残り、それは元に戻せない誤解になる。
 * 実物と同じく**減る側だけを赤くする**（SPEC-V8 §5.4）── 全部に色を付けると、
 * どちらへ動くのかが色から読めなくなる。
 */
export function BackupPreviewFigure() {
  // 表示語は locale を引数に取る（src/i18n/index.ts の冒頭）
  const locale = useLocale();

  const colors = useThemeColors();

  return (
    <FigureFrame subtitle={helpFigureBackupPreviewSubtitle(locale)}>
      <View style={styles.csvHead}>
        <View style={styles.csvLabelCol} />
        <Text style={[styles.csvKind, { color: colors.label }]}>
          {backupDiffCurrentHeader(locale)}
        </Text>
        <Text style={[styles.csvKind, { color: colors.label }]}>{backupDiffFileHeader(locale)}</Text>
      </View>
      {backupDiffRows(locale).map((row) => (
        <View key={row.key} style={[styles.csvRow, { borderTopColor: colors.separator }]}>
          <Text style={[styles.csvLabel, styles.csvLabelCol, { color: colors.label }]}>
            {row.label}
          </Text>
          <Text style={[styles.csvMark, { color: colors.secondaryLabel }]}>
            {groupDigits(row.current)}
          </Text>
          {/* 減る行だけ赤。同じ数の行は色を変えない（動かないものに注意を向けない） */}
          <Text
            style={[
              styles.csvMark,
              { color: row.file < row.current ? colors.red : colors.label },
            ]}>
            {groupDigits(row.file)}
          </Text>
        </View>
      ))}
      <Text style={[styles.figureNote, { color: colors.secondaryLabel }]}>
        {helpFigureBackupReplaceNote(locale)}
      </Text>
    </FigureFrame>
  );
}

/** 図 9 の 5 項目。色は帯の語彙のまま（オレンジは手数料だけ・他はグレー） */
function expenseItems(
  locale: Locale,
): { key: string; tone: ToneKey; name: string; note: string }[] {
  return [
    {
      key: 'purchase',
      tone: 'dark',
      name: purchasePriceLabel(locale),
      note: helpFigurePurchaseNote(locale),
    },
    { key: 'postage', tone: 'light', name: postageLabel(locale), note: helpFigurePostageNote(locale) },
    {
      key: 'commission',
      tone: 'commission',
      name: commissionLabel(locale),
      note: helpFigureCommissionNote(locale),
    },
    { key: 'envelope', tone: 'mid', name: envelopeCostLabel(locale), note: helpFigureEnvelopeNote(locale) },
    { key: 'others', tone: 'mid', name: othersCostLabel(locale), note: helpFigureOthersNote(locale) },
  ];
}

/**
 * 図 9: 経費にふくまれるもの（ことばページ）。
 *
 * **帯にしない。** 同じページに帯が既に 2 つあり、3 つ目を出すと
 * 「また同じ絵」に見えて読み飛ばされる。ここで要るのは割合ではなく**顔ぶれ**なので、
 * 5 つを 1 行ずつ並べて、それぞれが何を指すかを添える。
 * 色は帯の語彙のまま置く（オレンジは手数料だけ・他はグレー）ので、帯と突き合わせて読める。
 */
export function ExpenseItemsFigure() {
  // 表示語は locale を引数に取る（src/i18n/index.ts の冒頭）
  const locale = useLocale();

  const colors = useThemeColors();

  return (
    <FigureFrame subtitle={helpFigureCostPartsSubtitle(locale)}>
      {expenseItems(locale).map((item) => (
        <View key={item.key} style={styles.expenseRow}>
          <View style={[styles.expenseDot, { backgroundColor: toneColor(item.tone, colors) }]} />
          <View style={styles.expenseText}>
            <Text style={[styles.expenseName, { color: colors.label }]}>{item.name}</Text>
            <Text style={[styles.expenseNote, { color: colors.secondaryLabel }]}>{item.note}</Text>
          </View>
        </View>
      ))}
    </FigureFrame>
  );
}

/**
 * 図 10: まとめ買いの 1 個あたり（記録ページ）。
 *
 * **割り算そのものを見せる。** 「入数と購入価格を入れると 1 個あたりが計算されます」は、
 * 何がどこに入るのかが文だけでは掴みにくい ── 3 つの箱と ÷ と = で並べれば、
 * 打つのは左の 2 つで、右は自動で出るものだと読める。
 */
export function PackBuyFigure() {
  // 表示語は locale を引数に取る（src/i18n/index.ts の冒頭）
  const locale = useLocale();

  const colors = useThemeColors();
  const [individualMethod, areaMethod, usageMethod] = presetCalcMethodOptions(locale);
  const packArea = (PACK_HEIGHT_CM * PACK_WIDTH_CM) / SQUARE_CM_PER_M2;
  const useArea = (USE_HEIGHT_CM * USE_WIDTH_CM) / SQUARE_CM_PER_M2;

  // 単価は**実際の関数に出させる**（TargetRoomFigure が analyzePricing を呼ぶのと同じ）──
  // 図に数字を書き写すと、丸めの規則を直したときにここだけ古い数字が残る
  const rows = [
    {
      key: 'individual',
      method: individualMethod,
      price: PACK_PRICE,
      divisorLabel: helpFigurePackQuantityLabel(locale),
      divisor: `${PACK_QUANTITY}`,
      resultLabel: presetUnitPriceLabel(locale),
      result: presetUnitPrice(PACK_PRICE, PACK_QUANTITY),
    },
    {
      key: 'area',
      method: areaMethod,
      price: ROLL_PRICE,
      divisorLabel: helpFigurePackAreaLabel(locale),
      divisor: `${packArea}㎡`,
      resultLabel: presetAreaUnitPriceLabel(locale),
      result: presetAreaUnitPrice(ROLL_PRICE, PACK_HEIGHT_CM, PACK_WIDTH_CM),
    },
    {
      key: 'usage',
      method: usageMethod,
      price: ROLL_PRICE,
      divisorLabel: helpFigurePackUsageLabel(locale),
      divisor: `${USAGE_COUNT}`,
      resultLabel: presetUsePriceLabel(locale),
      result: presetUnitPrice(ROLL_PRICE, USAGE_COUNT),
    },
  ];
  const usePrice = presetAreaUsePrice(
    ROLL_PRICE,
    PACK_HEIGHT_CM,
    PACK_WIDTH_CM,
    USE_HEIGHT_CM,
    USE_WIDTH_CM,
  );

  return (
    <FigureFrame subtitle={helpFigurePackSubtitle(locale)}>
      {rows.map((row, index) => (
        <View key={row.key}>
          <Text
            style={[
              styles.rowTitle,
              index > 0 && styles.rowTitleSpaced,
              { color: colors.label },
            ]}>
            {row.method}
          </Text>
          <View style={styles.formulaRow}>
            <FormulaBox
              label={presetPackPriceFieldLabel(locale)}
              value={groupDigits(row.price)}
              colors={colors}
            />
            <Text style={[styles.formulaOp, { color: colors.secondaryLabel }]}>÷</Text>
            <FormulaBox label={row.divisorLabel} value={row.divisor} colors={colors} />
            <Text style={[styles.formulaOp, { color: colors.secondaryLabel }]}>=</Text>
            <FormulaBox
              label={row.resultLabel}
              value={row.result == null ? helpFigureNoneMark(locale) : formatUnitYen(locale, row.result)}
              colors={colors}
              highlight
            />
          </View>
        </View>
      ))}

      {/* 面積方式だけ 2 段目がある。表の中に 4 つ目の箱を足すと 1 行が読めない幅になるので、
          下に 1 行で添える（1㎡ あたりのままでも経費には入る、は本文が言う） */}
      {usePrice != null && (
        <Text style={[styles.figureNote, styles.rowTitleSpaced, { color: colors.secondaryLabel }]}>
          {helpFigurePackUseNote(locale, `${useArea}㎡`, formatUnitYen(locale, usePrice))}
        </Text>
      )}
    </FigureFrame>
  );
}

/**
 * 図: 複製で写るもの・写らないもの（記録ページ）。
 *
 * **文で列挙すると 10 個の読点になる。** 写る欄がそれだけ多いことこそが複製の値打ちなので、
 * 数を減らして書くわけにもいかない ── 2 列に分けて、左を読めば「打ち直さずに済むもの」、
 * 右を読めば「自分で入れるもの」が塊として見える形にする。
 *
 * **欄の名前は画面の表示語をそのまま使う**（itemNameLabel(locale) など）。図の中で言い換えると、
 * 記録の画面と見比べたときに対応が取れない。
 */
function duplicateCopiedLabels(locale: Locale): string[] {
  return [
    itemNameLabel(locale),
    filterKindSectionLabel(locale),
    purchasePriceLabel(locale),
    postageLabel(locale),
    commissionLabel(locale),
    envelopeCostLabel(locale),
    othersCostLabel(locale),
    tagLabel(locale),
    targetProfitLabel(locale, 'sourced'),
  ];
}

function duplicateSkippedLabels(locale: Locale): string[] {
  return [
    salesPriceLabel(locale),
    photoFieldLabel(locale),
    memoLabel(locale),
    helpFigureDuplicateDateLabel(locale),
    helpFigureDuplicateStatusLabel(locale),
  ];
}

export function DuplicateFieldsFigure() {
  // 表示語は locale を引数に取る（src/i18n/index.ts の冒頭）
  const locale = useLocale();

  const colors = useThemeColors();

  return (
    <FigureFrame subtitle={helpFigureDuplicateSubtitle(locale)}>
      <View style={styles.duplicateRow}>
        <View style={styles.duplicateCol}>
          <Text style={[styles.duplicateHead, { color: colors.green }]}>
            {helpFigureDuplicateCopiedLabel(locale)}
          </Text>
          {duplicateCopiedLabels(locale).map((label) => (
            <Text key={label} style={[styles.duplicateItem, { color: colors.label }]}>
              {label}
            </Text>
          ))}
        </View>

        <View style={[styles.duplicateDivider, { backgroundColor: colors.separator }]} />

        <View style={styles.duplicateCol}>
          <Text style={[styles.duplicateHead, { color: colors.secondaryLabel }]}>
            {helpFigureDuplicateSkippedLabel(locale)}
          </Text>
          {duplicateSkippedLabels(locale).map((label) => (
            <Text key={label} style={[styles.duplicateItem, { color: colors.mutedLabel }]}>
              {label}
            </Text>
          ))}
        </View>
      </View>
    </FigureFrame>
  );
}

/**
 * 図: 機種を変えるときの 1 往復（残すページ）。
 *
 * **端末どうしが直接つながらない**ことが、この項目でいちばん誤解される点 ──
 * 間にファイルを 1 つ挟んだ縦の並びにして、「作る」と「復元する」が別の端末での操作だと
 * 形から読めるようにする。横に並べると 3 つの箱と 2 本の矢印で 1 行が詰まる。
 */
export function BackupMigrateFigure() {
  // 表示語は locale を引数に取る（src/i18n/index.ts の冒頭）
  const locale = useLocale();

  const colors = useThemeColors();
  const steps = [
    { key: 'old', label: helpFigureMigrateOldLabel(locale), icon: 'phone-portrait-outline' as const },
    { key: 'file', label: helpFigureFileLabel(locale), icon: 'document-outline' as const },
    { key: 'new', label: helpFigureMigrateNewLabel(locale), icon: 'phone-portrait-outline' as const },
  ];
  const actions = [backupCreateButtonLabel(locale), backupRestoreSectionTitle(locale)];

  return (
    <FigureFrame subtitle={helpFigureMigrateSubtitle(locale)}>
      {steps.map((step, index) => (
        <View key={step.key}>
          <View
            style={[
              styles.migrateBox,
              { borderColor: index === 1 ? colors.blue : colors.separator },
            ]}>
            <Ionicons
              name={step.icon}
              size={18}
              color={index === 1 ? colors.blue : colors.secondaryLabel}
            />
            <Text style={[styles.migrateLabel, { color: colors.label }]}>{step.label}</Text>
          </View>

          {index < actions.length && (
            <View style={styles.migrateStep}>
              <Ionicons name="arrow-down" size={16} color={colors.secondaryLabel} />
              <Text style={[styles.migrateAction, { color: colors.secondaryLabel }]}>
                {actions[index]}
              </Text>
            </View>
          )}
        </View>
      ))}
    </FigureFrame>
  );
}

function FormulaBox({
  label,
  value,
  colors,
  highlight = false,
}: {
  label: string;
  value: string;
  colors: ThemeColors;
  highlight?: boolean;
}) {
  return (
    <View
      style={[
        styles.formulaBox,
        {
          borderColor: highlight ? colors.blue : colors.separator,
          backgroundColor: highlight ? colors.highlightBackground : 'transparent',
        },
      ]}>
      <Text style={[styles.formulaValue, { color: highlight ? colors.blue : colors.label }]}>
        {value}
      </Text>
      <Text style={[styles.formulaLabel, { color: colors.secondaryLabel }]}>{label}</Text>
    </View>
  );
}

/**
 * 図 11: 日ごとにまとめる（データページ）。
 *
 * **何が残って何が消えるかを、行の形で見せる。** 「まとめられるのは金額だけ」は
 * 文だと読み飛ばされるが、まとめた後の行から商品名が消えているのを見れば分かる。
 */
export function GroupingFigure() {
  // 表示語は locale を引数に取る（src/i18n/index.ts の冒頭）
  const locale = useLocale();

  const colors = useThemeColors();
  const sample = helpFigureSample(locale);
  const before = [
    { key: 'a', name: sample.itemCushion, amount: 450 },
    { key: 'b', name: sample.itemMug, amount: 320 },
    { key: 'c', name: sample.itemPictureBook, amount: 180 },
  ];

  return (
    <FigureFrame subtitle={helpFigureDayGroupSubtitle(locale)}>
      <Text style={[styles.rowTitle, { color: colors.label }]}>
        {helpFigureOneByOneLabel(locale)}
      </Text>
      {before.map((row) => (
        <View key={row.key} style={[styles.groupRow, { borderColor: colors.separator }]}>
          <Text style={[styles.groupDate, { color: colors.secondaryLabel }]}>8/12</Text>
          <Text style={[styles.groupName, { color: colors.label }]}>{row.name}</Text>
          <Text style={[styles.groupAmount, { color: colors.label }]}>{row.amount}</Text>
        </View>
      ))}

      <Text style={[styles.rowTitle, styles.rowTitleSpaced, { color: colors.label }]}>
        {helpFigureGroupedLabel(locale)}
      </Text>
      <View style={[styles.groupRow, { borderColor: colors.blue }]}>
        <Text style={[styles.groupDate, { color: colors.secondaryLabel }]}>8/12</Text>
        {/* 商品名は消えない。**実際の関数に作らせる** ── 図に「クッション ほか2件」と
            書き写すと、まとめ方の書式を直したときにここだけ古い形が残る */}
        <Text style={[styles.groupName, { color: colors.label }]}>
          {csvDayItemNames(locale, before.map((row) => row.name))}
        </Text>
        <Text style={[styles.groupAmount, { color: colors.blue }]}>950</Text>
      </View>
    </FigureFrame>
  );
}

/**
 * 図 12: 1 円のずれ（データページ）。
 *
 * **順番が違うだけだと見せる。** どちらかが間違っているのではなく、
 * 「丸めてから足す」と「足してから丸める」の差でしかないことは、
 * 2 本の道を並べたときにいちばん短く伝わる。
 */
export function RoundingFigure() {
  // 表示語は locale を引数に取る（src/i18n/index.ts の冒頭）
  const locale = useLocale();

  const colors = useThemeColors();

  return (
    <FigureFrame subtitle={helpFigureRoundingSubtitle(locale)}>
      <View style={[styles.roundRow, { borderColor: colors.separator }]}>
        <Text style={[styles.roundWho, { color: colors.label }]}>
          {helpFigureFileLabel(locale)}
        </Text>
        <Text style={[styles.roundHow, { color: colors.secondaryLabel }]}>
          {helpFigureRoundFirstLabel(locale)}
        </Text>
        <Text style={[styles.roundValue, { color: colors.label }]}>20</Text>
      </View>
      <View style={[styles.roundRow, { borderColor: colors.separator }]}>
        <Text style={[styles.roundWho, { color: colors.label }]}>
          {helpFigureScreenLabel(locale)}
        </Text>
        <Text style={[styles.roundHow, { color: colors.secondaryLabel }]}>
          {helpFigureRoundLastLabel(locale)}
        </Text>
        <Text style={[styles.roundValue, { color: colors.label }]}>21</Text>
      </View>
    </FigureFrame>
  );
}

/** 図 13 の 3 行。**目標の持ち方だけを変えて、同じ 1 件を 3 回通す**（SPEC-V9 §1.2） */
const TARGET_ROOM_CASES: { key: string; targetProfit: number | null }[] = [
  { key: 'unset', targetProfit: null },
  { key: 'zero', targetProfit: 0 },
  { key: 'set', targetProfit: PRICING_EXAMPLE.targetProfit },
];

/**
 * 図 13: 目標の決め方と「あと下げられる額」（売るページ）。
 *
 * **「決めていません」と「¥0」が別のものだ、というのは表でしか言えない。**
 * 文章で「0 は有効な目標です」と書いても、読んだ人は同じ欄の同じ空白に見える。
 * 3 行を縦に並べて**右の列が 1 行だけ空く**形にすると、区別が結果の側から読める。
 *
 * 下げ幅を出さない行に `－` を置くのは、0 と書けないため（§1.2）──
 * 「¥0」と出すと「もう下げられない」と読め、決めていない人に根拠のない下げ止まりを見せる。
 */
export function TargetRoomFigure() {
  // 表示語は locale を引数に取る（src/i18n/index.ts の冒頭）
  const locale = useLocale();

  const colors = useThemeColors();

  return (
    <FigureFrame
      subtitle={helpFigureTargetRoomSubtitle(locale, formatYenSymbol(PRICING_EXAMPLE.salesPrice))}>
      <View style={styles.roomHead}>
        <Text style={[styles.roomHeadLabel, styles.roomTargetCol, { color: colors.secondaryLabel }]}>
          {formulaTargetLabel(locale)}
        </Text>
        <Text style={[styles.roomHeadLabel, styles.roomValueCol, { color: colors.secondaryLabel }]}>
          {targetPreviewRoomLabel(locale)}
        </Text>
      </View>
      {TARGET_ROOM_CASES.map((item) => {
        const analysis = analyzePricing({ ...PRICING_EXAMPLE, targetProfit: item.targetProfit });
        // 目標が無い行だけ下げ幅を言わない。room は 3,000 を返すが、それは
        // 「分岐点まで」であって、決めていない人に見せてよい下げ止まりではない（§4.3）
        const shows = analysis.hasTarget;

        return (
          <View key={item.key} style={[styles.roomRow, { borderTopColor: colors.separator }]}>
            <Text style={[styles.roomTarget, styles.roomTargetCol, { color: colors.label }]}>
              {item.targetProfit == null
                ? targetProfitUnsetLabel(locale)
                : formatYenSymbol(item.targetProfit)}
            </Text>
            <Text
              style={[
                styles.roomValue,
                styles.roomValueCol,
                { color: shows ? colors.label : colors.disabledContent },
              ]}>
              {shows ? formatYenSymbol(analysis.room) : helpFigureNoneMark(locale)}
            </Text>
          </View>
        );
      })}
    </FigureFrame>
  );
}

/**
 * 図 14: 実績の 2 とおり（データページ）。
 *
 * **段を縦に積む。** 「5 段階で登る」は横に並べると 5 個の別々の実績に見えるが、
 * 縦に積んで★が 1 つずつ増える形にすると、同じジャンルの続きだと読める。
 *
 * **★と段位名は実物と同じものを出す**（実績詳細モーダルの、バッジの下に並ぶ段位の星
 * ＝ `AchievementTierMotif` ＋ 段位チップ）── バッジを押した人が最初に目にするのが
 * その 2 つなので、図がそこを省くと、図で覚えた「段」と実物で見る「★4・プラチナ」が
 * 別の話に見える。色（`TIER_COLORS`）も段位の語（`achievementBadgeTierName`）も実物から引く。
 *
 * **ここだけは 5 つ固定で `filled` まで塗る**（実物のバッジは段位の数だけ星を出し、
 * 余りの枠を描かない）── 図の主題は「5 段階で登る」ことなので、あと何段あるかを
 * 空の星で見せる必要がある。実物は 1 つのバッジが自分の段位を名乗るだけなので枠が要らない。
 *
 * **暗色モードでの段位名の色だけは実物の分岐にそろえる**（`TIER_CHIP_DARK_COLORS`）──
 * レジェンドの `#5A1B33` は暗色の地に対してコントラストが 1.3 しかなく、
 * そのまま文字色にすると読めない。実物のチップが同じ差し替えをしている。
 *
 * 並べる実績は `logic/helpFigureExample.ts`（段位が飛んでいないことを試験してある）。
 */
export function AchievementKindsFigure() {
  // 表示語は locale を引数に取る（src/i18n/index.ts の冒頭）
  const locale = useLocale();

  const colors = useThemeColors();
  const isDark = useColorScheme() === 'dark';

  return (
    <FigureFrame subtitle={helpFigureAchievementKindsSubtitle(locale)}>
      <Text style={[styles.achievementGroupLabel, { color: colors.secondaryLabel }]}>
        {helpFigureAchievementLadderLabel(locale)}
      </Text>
      {ACHIEVEMENT_LADDER_IDS.map((id) => (
        <AchievementTierRow key={id} id={id} isDark={isDark} />
      ))}

      <Text
        style={[
          styles.achievementGroupLabel,
          styles.achievementOnceLabel,
          { color: colors.secondaryLabel },
        ]}>
        {helpFigureAchievementOnceLabel(locale)}
      </Text>
      {/* 単発にも★と段位はある。違うのは「5 つ並んで登るか、1 つで終わるか」だけ */}
      <AchievementTierRow id={ACHIEVEMENT_ONCE_ID} isDark={isDark} />
    </FigureFrame>
  );
}

/** 1 段ぶん。上に実績名、下に★と段位名（実物の実績詳細と同じ並び） */
function AchievementTierRow({ id, isDark }: { id: AchievementId; isDark: boolean }) {
  // 表示語は locale を引数に取る（src/i18n/index.ts の冒頭）
  const locale = useLocale();

  const colors = useThemeColors();
  const difficulty = achievementDifficulty(id);
  const tier = achievementBadgeTier(id);
  const tierColor = TIER_COLORS[tier];
  // 暗色モードで地に沈む段位（legend）だけ、文字用の明るい色に差し替える（実物と同じ規則）
  const tierTextColor = isDark ? (TIER_CHIP_DARK_COLORS[tier] ?? tierColor) : tierColor;

  return (
    <View style={styles.achievementRow}>
      <Text style={[styles.achievementName, { color: colors.label }]}>{achievementName(locale, id)}</Text>
      <View style={styles.achievementTierLine}>
        <View style={styles.achievementStars}>
          {Array.from({ length: ACHIEVEMENT_STAR_COUNT }, (_, index) => (
            <Ionicons
              key={index}
              name={index < difficulty ? 'star' : 'star-outline'}
              size={ACHIEVEMENT_STAR_SIZE}
              color={index < difficulty ? tierColor : colors.separator}
            />
          ))}
        </View>
        <Text style={[styles.achievementTierName, { color: tierTextColor }]}>
          {achievementBadgeTierName(locale, tier)}
        </Text>
      </View>
    </View>
  );
}

/**
 * 斜線。RN には繰り返しパターンが無いので、細い View を回して等間隔に並べ、
 * 親の `overflow: 'hidden'` で切る。SVG を持ち込むほどの絵ではない。
 */
function Hatching({ color }: { color: string }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {Array.from({ length: 10 }, (_, index) => (
        <View
          key={index}
          style={[styles.hatchLine, { backgroundColor: color, left: index * 14 - 20 }]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  figure: {
    borderRadius: 14,
    padding: 20,
    gap: 6,
  },
  figureTitle: {
    fontSize: 19,
    fontWeight: '700',
  },
  figureSubtitle: {
    fontSize: 14,
  },
  /** 表の下に 1 行だけ添える注記（PartFrame の note と同じ大きさに揃える） */
  figureNote: {
    fontSize: 13,
    lineHeight: 19,
    paddingTop: 2,
  },
  /** 目標と下げ幅の表（TargetRoomFigure）。列の比は CSV の表と揃える */
  roomHead: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingBottom: 6,
  },
  roomHeadLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  roomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: 9,
  },
  roomTargetCol: {
    flex: 1.2,
  },
  roomValueCol: {
    flex: 1,
    textAlign: 'right',
  },
  roomTarget: {
    fontSize: 14,
  },
  roomValue: {
    fontSize: 15,
    fontWeight: '600',
  },
  /** 実績の 2 とおり（AchievementKindsFigure） */
  achievementGroupLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  achievementOnceLabel: {
    paddingTop: 8,
  },
  /** 1 段ぶん。上に名前、下に★と段位名（実物の実績詳細と同じ縦の並び） */
  achievementRow: {
    gap: 2,
  },
  achievementName: {
    fontSize: 14,
  },
  achievementTierLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  /** ★は詰めて並べる（実物の starsRow と同じく、間隔を空けると数が読みにくい） */
  achievementStars: {
    flexDirection: 'row',
  },
  achievementTierName: {
    fontSize: 12,
    fontWeight: '700',
  },
  figureBody: {
    paddingTop: 10,
    gap: 8,
  },
  caption: {
    fontSize: 15,
    lineHeight: 23,
    paddingTop: 8,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  rowTitleSpaced: {
    paddingTop: 10,
  },
  bar: {
    flexDirection: 'row',
    height: BAR_HEIGHT,
    borderRadius: BAR_RADIUS,
    overflow: 'hidden',
  },
  segment: {
    alignItems: 'center',
    justifyContent: 'center',
    // 狭い区画で文字が押し出されないよう、区画側は縮まない
    paddingHorizontal: 2,
  },
  segmentLabel: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendDot: {
    width: 9,
    height: 9,
    borderRadius: 2,
  },
  legendText: {
    fontSize: 13,
  },
  termsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  termsSingles: {
    flex: 1,
    gap: 10,
  },
  termsArrow: {
    fontSize: 18,
  },
  termBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  termBoxLabel: {
    fontSize: 15,
  },
  termBoxValue: {
    fontSize: 15,
    fontWeight: '700',
  },
  termsTotal: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 16,
  },
  termsTotalCaption: {
    fontSize: 12,
    textAlign: 'center',
  },
  termsTotalValue: {
    fontSize: 20,
    fontWeight: '700',
  },
  measures: {
    paddingTop: 6,
    gap: 8,
  },
  measureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  measureLine: {
    width: 56,
    height: 2,
    borderRadius: 1,
  },
  measureText: {
    flex: 1,
    fontSize: 14,
  },
  rangeBar: {
    flexDirection: 'row',
    height: BAR_HEIGHT,
    borderRadius: BAR_RADIUS,
    overflow: 'hidden',
  },
  rangeBlocked: {
    flex: 4,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  rangeBlockedText: {
    fontSize: 13,
    fontWeight: '600',
  },
  rangeAllowed: {
    flex: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rangeAllowedText: {
    fontSize: 13,
    fontWeight: '700',
  },
  hatchLine: {
    position: 'absolute',
    top: -20,
    width: 1,
    height: 80,
    transform: [{ rotate: '-45deg' }],
  },
  totalMeasure: {
    paddingTop: 8,
    gap: 5,
  },
  totalLine: {
    height: 2,
    borderRadius: 1,
  },
  totalText: {
    fontSize: 14,
    fontWeight: '600',
  },
  orRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingLeft: 6,
    paddingRight: 14,
    paddingVertical: 8,
  },
  orTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 4,
    flexShrink: 1,
  },
  orMark: {
    fontSize: 14,
    fontWeight: '700',
  },
  chart: {
    height: 110,
    justifyContent: 'flex-end',
  },
  chartBars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: '100%',
  },
  chartSlot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    height: '100%',
  },
  chartBar: {
    width: 14,
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
  },
  legendLine: {
    width: 14,
    height: 2,
    borderRadius: 1,
  },
  csvHead: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingBottom: 6,
  },
  csvLabelCol: {
    flex: 1.4,
  },
  csvKind: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  csvRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: 9,
  },
  csvLabel: {
    fontSize: 14,
  },
  csvMark: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  expenseRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 5,
  },
  expenseDot: {
    width: 10,
    height: 10,
    borderRadius: 2,
    marginTop: 5,
  },
  expenseText: {
    flex: 1,
    gap: 1,
  },
  expenseName: {
    fontSize: 15,
    fontWeight: '600',
  },
  expenseNote: {
    fontSize: 13,
    lineHeight: 19,
  },
  formulaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  formulaOp: {
    fontSize: 16,
  },
  formulaBox: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  formulaValue: {
    fontSize: 18,
    fontWeight: '700',
  },
  formulaLabel: {
    fontSize: 11,
    textAlign: 'center',
  },
  /** 複製の 2 列（写る／写らない）。真ん中の細い線が「越えない」ことを示す */
  duplicateRow: {
    flexDirection: 'row',
    gap: 14,
  },
  duplicateCol: {
    flex: 1,
    gap: 6,
  },
  duplicateDivider: {
    width: StyleSheet.hairlineWidth,
  },
  duplicateHead: {
    fontSize: 12,
    fontWeight: '700',
  },
  duplicateItem: {
    fontSize: 14,
  },
  /** 機種変更の 3 段。箱と箱の間に矢印と操作名を挟む */
  migrateBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  migrateLabel: {
    fontSize: 14,
  },
  migrateStep: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 5,
    paddingLeft: 12,
  },
  migrateAction: {
    fontSize: 12,
  },
  groupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  groupDate: {
    fontSize: 13,
  },
  groupName: {
    flex: 1,
    fontSize: 14,
  },
  groupAmount: {
    fontSize: 15,
    fontWeight: '600',
  },
  roundRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  roundWho: {
    fontSize: 14,
    fontWeight: '600',
    width: 72,
  },
  roundHow: {
    flex: 1,
    fontSize: 13,
  },
  roundValue: {
    fontSize: 16,
    fontWeight: '700',
  },
  rangeCaptions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  rangeCaption: {
    fontSize: 12,
  },
});
