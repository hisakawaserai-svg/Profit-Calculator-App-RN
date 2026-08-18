// データタブ「実績」（案 3c）。累計・自己ベスト・実績バッジを見るモード。
//
// 収支/タグの 2 モードと違い、月バー・絞り込みページの状態を一切見ない
// （useAchievementsData が常に全期間・絞り込みなしで集計する。db/useRecords.ts 参照）。
// このモードは記録を 1 件もループしない ── 集計は logic/achievements.ts が
// useAchievementsData の中で完結させ、この部品は結果を並べるだけ。
//
// 4 枚のカード（構成のモック 3c どおり）:
//   1. 次の実績（円形リング進捗 + 次点）
//   2. あなたの記録（累計）
//   3. 獲得した実績（横スクロールのカード列 + 未解除の一覧）
//   4. 自己ベスト（6 タイル）
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Circle, Svg } from 'react-native-svg';

import { AchievementDetailModal } from '@/components/AchievementDetailModal';
import { DataModeTabs } from '@/components/DataModeTabs';
import {
  achievementBadgeTier,
  achievementCategory,
  sortAchievementsByRecency,
  type Achievement,
  type AchievementBadgeTier,
  type AchievementCategory,
  type AchievementDifficulty,
  type AchievementId,
  type NextAchievement,
  type PersonalBests,
} from '@/logic/achievements';
import { formatShortDate, formatYearTitle, formatYenSymbol } from '@/logic/format';
import {
  achievementsCompleteMessage,
  achievementsCompleteTitle,
  bestMonthByCountLabel,
  bestMonthByProfitLabel,
  bestNetProfitLabel,
  bestSalesPriceLabel,
  bestTagLabel,
  careerNetProfitLabel,
  careerSalesLabel,
  dataModeAchievementsLabel,
  dataModeProfitLabel,
  dataModeTagLabel,
  earnedAchievementsLabel,
  fastestSaleLabel,
  nextAchievementLabel,
  personalBestsLabel,
  soldCountLabel,
  unclassifiedTagLabel,
  viewAllAchievementsLabel,
  yourRecordsLabel,
  achievementName,
  achievementProgressCountText,
  bestMonthByCountValueText,
  bestMonthProfitDateText,
  bestTagOfTotalText,
  bestTagValueText,
  fastestSaleValueText,
  lockedAchievementsSectionTitle,
  nextAchievementProgressText,
  nextAchievementRunnerUpText,
  recordCountValue,
  remainingToUnlockText,
} from '@/logic/labels';
import { useLocale, type Locale } from '@/settings';
import { useThemeColors, type ThemeColors } from '@/theme';

/** 実績一覧画面のルート（データタブの Stack に積む。app/(tabs)/data/achievements.tsx） */
const ACHIEVEMENT_LIST_PATHNAME = '/data/achievements' as const;

/**
 * カテゴリごとのアイコン。獲得済みバッジにだけ使う ──
 * 未解除（グレーアウト）はチップ表記のみで、アイコンは持たない（構成の指定）。
 *
 * 成長系の 5 ジャンルはそれぞれ別のアイコンにする（🎯得意分野・🔍売れ筋は色こそ同じオレンジだが、
 * アイコンで見分けられるようにする。categoryColor 参照）。
 */
export const CATEGORY_ICONS: Record<
  AchievementCategory,
  keyof typeof Ionicons.glyphMap
> = {
  start: 'flag', // 🚩 はじめる系
  tag: 'pricetag', // 🏷️ タグ系
  sales_technique: 'construct', // 🛠️ その他（個別アイコンを持たない実績が増えたときの既定値）
  strike: 'flash', // ⚡ 一撃
  career_profit: 'wallet', // 💰 累計利益
  sold_count: 'cube', // 📦 販売件数
  tag_specialty: 'locate', // 🎯 得意分野
  tag_bestseller: 'search', // 🔍 売れ筋
};

/**
 * 実績 id ごとのアイコン上書き。「その他」（sales_technique）の 5 種は、階段構造を持たない
 * 特殊実績どうしで性質がバラバラ（経過日数 / 目標達成 / 種別の使い分け）なので、
 * カテゴリ共通の 1 アイコンでは意味が伝わらない ── ここに登録した id はカテゴリのアイコンより
 * こちらを優先する（achievementIcon 参照）。他のカテゴリは今のところ登録しない
 * （成長系はジャンル内で同じ性質の実績が難易度違いで並ぶだけなので、共通アイコンのままでよい）。
 */
const ACHIEVEMENT_ICONS: Partial<
  Record<AchievementId, keyof typeof Ionicons.glyphMap>
> = {
  long_battle: 'hourglass', // ⏳ 経過日数の長さが主題
  instant_sale: 'rocket', // 🚀 即決の速さが主題
  goal_kept: 'checkmark-circle', // ✅ 目標達成
  goal_master: 'ribbon', // 🎗️ 目標達成の積み重ね
  all_rounder: 'construct', // 🛠️ 仕入品・不用品どちらもこなす万能さ
};

/** 実績 id → アイコン。ACHIEVEMENT_ICONS に個別登録があればそれを優先し、なければカテゴリの既定アイコン */
export function achievementIcon(
  id: AchievementId,
): keyof typeof Ionicons.glyphMap {
  return ACHIEVEMENT_ICONS[id] ?? CATEGORY_ICONS[achievementCategory(id)];
}

/**
 * カテゴリごとの色。theme.ts の既存のセマンティック色をそのまま使い、新しい色は増やさない。
 *
 * ⚡一撃と💰累計利益はどちらも「利益」の実績だが、同じ緑色だと一覧で見分けづらいため、
 * 累計利益だけ teal（既存のセマンティック色）に離してある。🎯得意分野・🔍売れ筋・
 * 🏷️タグ系（特殊実績）はどれもタグが対象という共通点があるので、そろって orange のまま。
 */
export function categoryColor(
  category: AchievementCategory,
  colors: ThemeColors,
): string {
  switch (category) {
    case 'start':
      return colors.purple;
    case 'tag':
    case 'tag_specialty':
    case 'tag_bestseller':
      return colors.orange;
    case 'sales_technique':
      return colors.indigo;
    case 'strike':
      return colors.green;
    case 'career_profit':
      return colors.teal;
    case 'sold_count':
      return colors.blue;
  }
}

/**
 * 段位（ブロンズ〜プラチナ）そのものの色。バッジの縁取り・段位チップに使う。
 * categoryColor（種類の色）とは別軸 ── 「銅・銀・金・プラチナ」の金属色は難易度で決まり、
 * 種類（緑・青・紫…）とは独立させる。AchievementDetailModal と共有する（重複させない）
 */
export const TIER_COLORS: Record<AchievementBadgeTier, string> = {
  bronze: '#B8752E',
  silver: '#9AA1A9',
  gold: '#D4AF37',
  platinum: '#6FA3C7',
  // ★5＝レジェンド。黒みがかった深い赤（ボルドー）。色だけに頼らず、リングの構造
  // （二重・金のライン・白い隙間）でも★1〜4と区別する ── LegendTierRing 参照。
  // 将来、継続系（赤系のバッジ本体）が追加されて色調が近づいても、構造で見分けられる
  legend: '#5A1B33',
};

/**
 * 段位チップ（AchievementDetailModal の「レジェンド」等のラベル。縁取り＋文字）の
 * 暗色モード専用の色。
 *
 * TIER_COLORS はバッジ本体の縁取り・リング（TIER_COLORS.legend）にも使うため変更できないが、
 * legend の #5A1B33（黒みがかった深いボルドー）は暗色の地（カード背景 #1C1C1E）に対して
 * コントラスト比 1.3 程度しかなく、チップの縁取り・文字としては読めない。チップにだけ、
 * ボルドー寄りの明るい色（コントラスト比 9 以上）を使う。バッジ本体の縁取り・リングは
 * TIER_COLORS.legend のまま（リング自体は視認性に問題がないため。§実績詳細ダークモード可読性）。
 * ブロンズ・シルバー・ゴールド・プラチナは暗色地でもコントラスト比 4.5 以上を確保できている
 * ため、上書きは不要。
 */
export const TIER_CHIP_DARK_COLORS: Partial<Record<AchievementBadgeTier, string>> =
  {
    legend: '#F2A9C2',
  };

/** ★5 レジェンドのリング二重化に挟む金のライン色（TIER_COLORS.gold と同じにして統一する） */
const LEGEND_RING_GOLD_COLOR = TIER_COLORS.gold;

/** ★5 レジェンドのリングとバッジ本体の間に設ける白い隙間の色。テーマに関わらず常に白固定
 * （ダークモードでカード背景が透けると「白い隙間」の構造的な意味がなくなるため） */
const LEGEND_RING_INSET_COLOR = '#FFFFFF';

/**
 * ★5 レジェンドのリング寸法。size（バッジ本体の直径）を受け取り、外側に広がる合計サイズを返す。
 * バッジ ← insetGap（白い隙間）→ ring（ボルドー）→ gold（金のライン）→ ring（ボルドー）
 */
export function legendRingOuterSize(
  size: number,
  insetGap: number,
  ringWidth: number,
  goldWidth: number,
): number {
  return size + 2 * (insetGap + ringWidth * 2 + goldWidth);
}

/**
 * ★5 レジェンドだけの装飾リング（react-native-svg）。★1〜4 の単色・一重リングとは違い、
 * 「バッジとの間に白い隙間 → ボルドーのリング → 金のライン → ボルドーのリング」という
 * 二重構造にする。色調（ボルドー）だけに頼らないための構造的な差別化（構成の指定）。
 * 呼び出し側は、この Svg のサイズぶん（legendRingOuterSize の戻り値）の領域を確保し、
 * バッジ本体をその中央に重ねて表示する。
 */
export function LegendTierRing({
  size,
  insetGap,
  ringWidth,
  goldWidth,
  style,
}: {
  /** リングを巻くバッジ本体の直径 */
  size: number;
  /** バッジ本体とリングの間の白い隙間の幅 */
  insetGap: number;
  /** ボルドーのリング 1 本ぶんの太さ（内側・外側とも同じ） */
  ringWidth: number;
  /** 二重リングの間に挟む金のラインの太さ */
  goldWidth: number;
  style?: StyleProp<ViewStyle>;
}) {
  const outer = legendRingOuterSize(size, insetGap, ringWidth, goldWidth);
  const center = outer / 2;
  const insetRadius = size / 2 + insetGap;
  const innerRingRadius = insetRadius + ringWidth / 2;
  const goldRadius = insetRadius + ringWidth + goldWidth / 2;
  const outerRingRadius = insetRadius + ringWidth * 1.5 + goldWidth;

  return (
    <Svg width={outer} height={outer} style={style}>
      {/* バッジ本体とリングの間の白い隙間。バッジ本体の裏に回る分も含めて塗るので、
          バッジ本体（size 直径の円）を上に重ねれば、はみ出た輪の部分だけが白く見える */}
      <Circle cx={center} cy={center} r={insetRadius} fill={LEGEND_RING_INSET_COLOR} />
      <Circle
        cx={center}
        cy={center}
        r={innerRingRadius}
        stroke={TIER_COLORS.legend}
        strokeWidth={ringWidth}
        fill="none"
      />
      <Circle
        cx={center}
        cy={center}
        r={goldRadius}
        stroke={LEGEND_RING_GOLD_COLOR}
        strokeWidth={goldWidth}
        fill="none"
      />
      <Circle
        cx={center}
        cy={center}
        r={outerRingRadius}
        stroke={TIER_COLORS.legend}
        strokeWidth={ringWidth}
        fill="none"
      />
    </Svg>
  );
}

export type CareerTotals = {
  recordCount: number;
  totalNetProfit: number;
  totalSales: number;
};

export type TagNameResolver = (tagId: string | null) => string;

/**
 * tagId → タグの表示情報（名前・色）。見つからなければ undefined（削除済みタグなど）。
 * AchievementDetailModal の「達成した記録」タグ別グループ見出し（TagChip）が使う。
 * TagNameResolver と違い、tagId は常に実在するタグの id（completedRecords.tagId は
 * 未分類 = null を持たない）なので、引数に null を許さない。
 */
export type TagLookup = (
  tagId: string,
) => { name: string; colorKey: string } | undefined;

/** tags 一覧から TagLookup を作る（resolveTagNameFrom の色つき版） */
export function resolveTagFrom(
  tags: readonly { id: string; name: string; colorKey: string }[],
): TagLookup {
  return (tagId) => tags.find((tag) => tag.id === tagId);
}

type Props = {
  totals: CareerTotals;
  achievements: Achievement[];
  nextAchievement: NextAchievement | null;
  personalBests: PersonalBests;
  /** 自己ベストの最多販売タグに出す名前解決(未分類含む。DataScreen が持つ tags 一覧から引く） */
  resolveTagName: TagNameResolver;
  /** 全画面詳細モーダルの「達成した記録」タグ別グループ見出しに使う色つき解決 */
  resolveTag: TagLookup;
  /** 「収支 / タグ / 実績」の 3 択（DataScreen 側の mode） */
  dataMode: number;
  onChangeDataMode: (index: number) => void;
};

export function AchievementsSection({
  totals,
  achievements,
  nextAchievement,
  personalBests,
  resolveTagName,
  resolveTag,
  dataMode,
  onChangeDataMode,
}: Props) {
  // 表示語は locale を引数に取る（src/i18n/index.ts の冒頭）
  const locale = useLocale();

  const colors = useThemeColors();
  const router = useRouter();
  // 「獲得した実績」の並びは達成日の新しい順（直近が先頭）に統一する。
  // 全画面詳細モーダルのスワイプ順もこの並びをそのまま渡す（下の detailIndex は
  // このソート後の配列内の位置）
  const earned = sortAchievementsByRecency(
    achievements.filter((achievement) => achievement.completed),
  );
  const locked = achievements.filter((achievement) => !achievement.completed);
  // 未解除も獲得済みと同じ丸バッジで並べる（AchievementListScreen と同じ見せ方）ので、
  // タップの行き先も両方を通しで持つ combined にする。並びは「獲得済み → 未解除」
  const combined = [...earned, ...locked];
  // タップしたバッジの全画面表示（構成の「タップすると全画面のモーダルで表示」）。
  // null = 非表示。combined 内の index を持つのは、モーダル側の左右スワイプも
  // combined をそのまま巡回するため
  const [detailIndex, setDetailIndex] = useState<number | null>(null);
  const runnerUp =
    nextAchievement == null
      ? null
      : locked
          .filter((achievement) => achievement.id !== nextAchievement.id)
          .reduce<Achievement | null>((best, achievement) => {
            const progress =
              achievement.target === 0
                ? 0
                : achievement.current / achievement.target;
            const bestProgress =
              best == null
                ? -1
                : best.target === 0
                  ? 0
                  : best.current / best.target;
            return best == null || progress > bestProgress ? achievement : best;
          }, null);

  return (
    <>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* 1. 次の実績 */}
        <View
          style={[styles.card, { backgroundColor: colors.secondaryBackground }]}
        >
          <DataModeTabs
            options={[
              dataModeProfitLabel(locale),
              dataModeTagLabel(locale),
              dataModeAchievementsLabel(locale),
            ]}
            selectedIndex={dataMode}
            onChange={onChangeDataMode}
          />

          {nextAchievement == null ? (
            <View style={styles.completeBlock}>
              <Ionicons name="trophy" size={32} color={colors.orange} />
              <Text style={[styles.completeTitle, { color: colors.label }]}>
                {achievementsCompleteTitle(locale)}
              </Text>
              <Text
                style={[
                  styles.completeMessage,
                  { color: colors.secondaryLabel },
                ]}
              >
                {achievementsCompleteMessage(locale)}
              </Text>
            </View>
          ) : (
            <View style={styles.nextRow}>
              <ProgressRing progress={nextAchievement.progress} colors={colors}>
                <Text style={[styles.ringValue, { color: colors.label }]}>
                  {nextAchievement.current}
                </Text>
                <Text
                  style={[styles.ringTarget, { color: colors.secondaryLabel }]}
                >
                  / {nextAchievement.target}
                </Text>
              </ProgressRing>

              <View style={styles.nextInfo}>
                <Text
                  style={[styles.nextLabel, { color: colors.secondaryLabel }]}
                >
                  {nextAchievementLabel(locale)}
                </Text>
                <Text style={[styles.nextName, { color: colors.label }]}>
                  {achievementName(locale, nextAchievement.id)}
                </Text>
                <Text style={[styles.nextRemaining, { color: colors.orange }]}>
                  {remainingToUnlockText(locale, nextAchievement)}
                </Text>
                <Text
                  style={[
                    styles.nextProgressText,
                    { color: colors.secondaryLabel },
                  ]}
                >
                  {nextAchievementProgressText(locale, nextAchievement)}
                </Text>
                {runnerUp != null && (
                  <Text
                    style={[styles.runnerUp, { color: colors.secondaryLabel }]}
                    numberOfLines={1}
                  >
                    {nextAchievementRunnerUpText(locale, runnerUp)}
                  </Text>
                )}
              </View>
            </View>
          )}
        </View>

        {/* 2. あなたの記録 */}
        <View
          style={[styles.card, { backgroundColor: colors.secondaryBackground }]}
        >
          <Text style={[styles.cardTitle, { color: colors.label }]}>
            {yourRecordsLabel(locale)}
          </Text>
          <View style={styles.totalsRow}>
            <TotalStat
              label={soldCountLabel(locale)}
              value={recordCountValue(locale, totals.recordCount)}
              colors={colors}
            />
            <TotalStat
              label={careerNetProfitLabel(locale)}
              value={formatYenSymbol(totals.totalNetProfit)}
              valueColor={
                totals.totalNetProfit >= 0 ? colors.green : colors.red
              }
              colors={colors}
            />
            <TotalStat
              label={careerSalesLabel(locale)}
              value={formatYenSymbol(totals.totalSales)}
              valueColor={colors.blue}
              colors={colors}
            />
          </View>
        </View>

        {/* 3. 獲得した実績 */}
        <View
          style={[styles.card, { backgroundColor: colors.secondaryBackground }]}
        >
          <View style={styles.headerRow}>
            <Text style={[styles.cardTitle, { color: colors.label }]}>
              {earnedAchievementsLabel(locale)}
            </Text>
            <View style={styles.headerRight}>
              <Text
                style={[styles.headerCount, { color: colors.secondaryLabel }]}
              >
                {achievementProgressCountText(locale, 
                  earned.length,
                  achievements.length,
                )}
              </Text>
              <Pressable
                onPress={() => router.push(ACHIEVEMENT_LIST_PATHNAME)}
                hitSlop={8}
                accessibilityRole="button"
              >
                <Text style={[styles.viewAllText, { color: colors.blue }]}>
                  {viewAllAchievementsLabel(locale)} ›
                </Text>
              </Pressable>
            </View>
          </View>

          {earned.length === 0 ? (
            <Text style={[styles.emptyText, { color: colors.secondaryLabel }]}>
              {nextAchievement == null
                ? achievementsCompleteTitle(locale)
                : `${achievementName(locale, nextAchievement.id)}${remainingToUnlockText(locale, nextAchievement)}`}
            </Text>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.earnedScroll}
            >
              <View style={styles.earnedRow}>
                {earned.map((achievement, earnedIndex) => (
                  <AchievementBadge
                    key={achievement.id}
                    achievement={achievement}
                    colors={colors}
                    onPress={() => setDetailIndex(earnedIndex)}
                  />
                ))}
              </View>
            </ScrollView>
          )}

          {locked.length > 0 && (
            <View style={styles.lockedBlock}>
              <Text
                style={[styles.lockedTitle, { color: colors.secondaryLabel }]}
              >
                {lockedAchievementsSectionTitle(locale, locked.length)}
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.earnedScroll}
              >
                <View style={styles.earnedRow}>
                  {locked.map((achievement, lockedIndex) => (
                    <AchievementBadge
                      key={achievement.id}
                      achievement={achievement}
                      colors={colors}
                      onPress={() =>
                        setDetailIndex(earned.length + lockedIndex)
                      }
                    />
                  ))}
                </View>
              </ScrollView>
            </View>
          )}
        </View>

        {/* 4. 自己ベスト */}
        <View
          style={[styles.card, { backgroundColor: colors.secondaryBackground }]}
        >
          <Text style={[styles.cardTitle, { color: colors.label }]}>
            {personalBestsLabel(locale)}
          </Text>
          <View style={styles.bestGrid}>
            <BestTile
              label={bestNetProfitLabel(locale)}
              value={
                personalBests.bestNetProfit == null
                  ? undefined
                  : formatYenSymbol(personalBests.bestNetProfit.value)
              }
              valueColor={colors.green}
              sub={
                personalBests.bestNetProfit == null
                  ? undefined
                  : formatShortDate(locale, personalBests.bestNetProfit.date)
              }
              colors={colors}
            />
            <BestTile
              label={bestSalesPriceLabel(locale)}
              value={
                personalBests.bestSalesPrice == null
                  ? undefined
                  : formatYenSymbol(personalBests.bestSalesPrice.value)
              }
              valueColor={colors.blue}
              sub={
                personalBests.bestSalesPrice == null
                  ? undefined
                  : formatShortDate(locale, personalBests.bestSalesPrice.date)
              }
              colors={colors}
            />
            <BestTile
              label={fastestSaleLabel(locale)}
              value={fastestSaleValueText(locale, personalBests)}
              sub={
                personalBests.fastestSale == null
                  ? undefined
                  : formatShortDate(locale, personalBests.fastestSale.date)
              }
              colors={colors}
            />
            <BestTile
              label={bestMonthByProfitLabel(locale)}
              value={
                personalBests.bestMonthByProfit == null
                  ? undefined
                  : formatYenSymbol(personalBests.bestMonthByProfit.amount)
              }
              valueColor={colors.green}
              sub={bestMonthProfitDateText(locale, personalBests) ?? undefined}
              colors={colors}
            />
            <BestTile
              label={bestMonthByCountLabel(locale)}
              value={bestMonthByCountValueText(locale, personalBests)}
              sub={
                personalBests.bestMonthByCount == null
                  ? undefined
                  : formatYearTitle(locale, Number(personalBests.bestMonthByCount.monthKey.split('-')[0]))
              }
              colors={colors}
            />
            <BestTile
              label={bestTagLabel(locale)}
              value={
                personalBests.bestTag == null
                  ? undefined
                  : bestTagValueText(locale, 
                      resolveTagName(personalBests.bestTag.tagId),
                      personalBests.bestTag.count,
                    )
              }
              sub={bestTagOfTotalText(locale, totals.recordCount)}
              colors={colors}
            />
          </View>
        </View>
      </ScrollView>

      <AchievementDetailModal
        achievements={combined}
        initialIndex={detailIndex ?? 0}
        visible={detailIndex != null}
        onClose={() => setDetailIndex(null)}
        resolveTag={resolveTag}
      />
    </>
  );
}

function TotalStat({
  label,
  value,
  valueColor,
  colors,
}: {
  label: string;
  value: string;
  valueColor?: string;
  colors: ThemeColors;
}) {
  return (
    <View style={styles.totalStat}>
      <Text style={[styles.totalLabel, { color: colors.secondaryLabel }]}>
        {label}
      </Text>
      <Text
        style={[styles.totalValue, { color: valueColor ?? colors.label }]}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

/**
 * 実績 1 件ぶんの丸いバッジ（色分けアイコン + 段位の縁取り + 名前 + 達成日）。
 *
 * 「獲得した実績」の横スクロール一覧（達成済み・未解除の両方。どちらも常に onPress あり）と、
 * 実績一覧画面のジャンル別カード（達成済み・未達成の両方。こちらも常に onPress あり）
 * が共有する。未達成は categoryColor の代わりに colors.gray でグレーアウトし、
 * 縁取りも出さない。onPress を渡さなければタップしても何も起きない。
 *
 * ★5 レジェンドも★1〜4 と同じ borderWidth の縁取り（TIER_COLORS.legend）だけで表す ──
 * 全画面詳細モーダル（AchievementDetailModal.DecoratedBadge）が使う二重リング
 * （LegendTierRing）はここでは使わない。以前はこの小さいバッジにもリングを足していたが、
 * リングぶんだけレジェンドだけ一回り大きく見えてしまい、横一列に並べたときに★1〜4と
 * サイズが揃わないという指摘（ユーザー報告）を受けて外した。
 *
 * **右下のコーナーバッジ（18px の丸に難易度モチーフ・冠・宝石を載せたもの）も外した**
 * （ユーザー報告）。段位の区別は**縁取りの色だけ**で付ける ── 56px の丸に 18px の丸を
 * 重ねると、横一列に並べたときに小さい丸のほうが先に目に入り、どれが何の実績かを
 * 読む前に段位を読ませることになっていた。段位を確かめる場所は、★と段位名が
 * 語で出る全画面詳細（AchievementDetailModal）に一本化する。
 */
export function AchievementBadge({
  achievement,
  colors,
  onPress,
}: {
  achievement: Achievement;
  colors: ThemeColors;
  /** 未指定 = タップ無効。AchievementsSection・実績一覧画面（AchievementListScreen）は
   * 達成済み・未達成の両方に onPress を渡し、全画面詳細モーダルを開ける
   * （未達成は進捗バー表示。モーダル側の分岐） */
  onPress?: () => void;
}) {
  // 表示語は locale を引数に取る（src/i18n/index.ts の冒頭）
  const locale = useLocale();

  const category = achievementCategory(achievement.id);
  const tier = achievementBadgeTier(achievement.id);
  const tint = achievement.completed
    ? categoryColor(category, colors)
    : colors.gray;
  const tierColor = achievement.completed ? TIER_COLORS[tier] : colors.gray;
  return (
    <Pressable
      onPress={onPress}
      disabled={onPress == null}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.earnedItem,
        {
          opacity:
            pressed && onPress != null ? 0.7 : achievement.completed ? 1 : 0.5,
        },
      ]}
    >
      <View style={styles.earnedCircleWrap}>
        {/* コーナーバッジを外したので、丸を包む中間の View も要らなくなった
            （あれは絶対配置の 18px の丸を丸の右下に留めるためのもの） */}
        <View
          style={[
            styles.earnedCircle,
            {
              backgroundColor: tint,
              borderWidth: achievement.completed ? 2 : 0,
              borderColor: tierColor,
            },
          ]}
        >
          <Ionicons
            name={achievementIcon(achievement.id)}
            size={22}
            color="#FFFFFF"
          />
        </View>
      </View>
      <Text
        style={[
          styles.earnedName,
          {
            color: achievement.completed ? colors.label : colors.secondaryLabel,
          },
        ]}
        numberOfLines={2}
      >
        {achievementName(locale, achievement.id)}
      </Text>
      {achievement.completed && achievement.completedAt != null && (
        <Text style={[styles.earnedDate, { color: colors.secondaryLabel }]}>
          {formatShortDate(locale, achievement.completedAt)}
        </Text>
      )}
    </Pressable>
  );
}

function BestTile({
  label,
  value,
  valueColor,
  sub,
  colors,
}: {
  label: string;
  /** undefined = 対象が 0 件（PERSONAL_BEST_EMPTY_VALUE を出す） */
  value?: string;
  valueColor?: string;
  sub?: string;
  colors: ThemeColors;
}) {
  return (
    <View style={styles.bestTile}>
      <Text
        style={[styles.bestLabel, { color: colors.secondaryLabel }]}
        numberOfLines={1}
      >
        {label}
      </Text>
      <Text
        style={[
          styles.bestValue,
          {
            color:
              value == null
                ? colors.secondaryLabel
                : (valueColor ?? colors.label),
          },
        ]}
        numberOfLines={1}
      >
        {value ?? 'ーー'}
      </Text>
      {sub != null && (
        <Text
          style={[styles.bestSub, { color: colors.secondaryLabel }]}
          numberOfLines={1}
        >
          {sub}
        </Text>
      )}
    </View>
  );
}

const RING_SIZE = 88;
const RING_STROKE = 8;

/** 「次の実績」カードのリング進捗（構成のモック 3c）。react-native-svg の Circle 2 枚（地色 + 進捗） */
function ProgressRing({
  progress,
  colors,
  children,
}: {
  /** 0〜1 */
  progress: number;
  colors: ThemeColors;
  children: React.ReactNode;
}) {
  const radius = (RING_SIZE - RING_STROKE) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(1, Math.max(0, progress));
  const dashoffset = circumference * (1 - clamped);

  return (
    <View style={styles.ringWrap}>
      <Svg width={RING_SIZE} height={RING_SIZE}>
        <Circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={radius}
          stroke={colors.separator}
          strokeWidth={RING_STROKE}
          fill="none"
        />
        <Circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={radius}
          stroke={colors.orange}
          strokeWidth={RING_STROKE}
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={dashoffset}
          strokeLinecap="round"
          rotation={-90}
          origin={`${RING_SIZE / 2}, ${RING_SIZE / 2}`}
        />
      </Svg>
      <View style={styles.ringCenter}>{children}</View>
    </View>
  );
}

/** タグ名の解決（未分類含む）。DataScreen の joinTagRanking と同じ考え方の簡易版 */
export function resolveTagNameFrom(
  locale: Locale,
  tags: readonly { id: string; name: string }[],
): TagNameResolver {
  return (tagId) => {
    if (tagId == null) return unclassifiedTagLabel(locale);
    return tags.find((tag) => tag.id === tagId)?.name ?? unclassifiedTagLabel(locale);
  };
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
  cardTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerCount: {
    fontSize: 13,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  viewAllText: {
    fontSize: 13,
    fontWeight: '600',
  },

  // 1. 次の実績
  nextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  ringWrap: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringCenter: {
    position: 'absolute',
    alignItems: 'center',
  },
  ringValue: {
    fontSize: 20,
    fontWeight: '700',
  },
  ringTarget: {
    fontSize: 12,
  },
  nextInfo: {
    flex: 1,
    gap: 2,
  },
  nextLabel: {
    fontSize: 12,
  },
  nextName: {
    fontSize: 17,
    fontWeight: '700',
  },
  nextRemaining: {
    fontSize: 14,
    fontWeight: '600',
  },
  nextProgressText: {
    fontSize: 12,
  },
  runnerUp: {
    fontSize: 12,
    marginTop: 4,
  },
  completeBlock: {
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
  },
  completeTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  completeMessage: {
    fontSize: 13,
    textAlign: 'center',
  },

  // 2. あなたの記録
  totalsRow: {
    flexDirection: 'row',
  },
  totalStat: {
    flex: 1,
    gap: 4,
  },
  totalLabel: {
    fontSize: 12,
  },
  totalValue: {
    fontSize: 18,
    fontWeight: '700',
  },

  // 3. 獲得した実績
  emptyText: {
    fontSize: 13,
  },
  earnedScroll: {
    marginHorizontal: -16,
  },
  earnedRow: {
    flexDirection: 'row',
    gap: 16,
    paddingHorizontal: 16,
  },
  earnedItem: {
    width: 76,
    alignItems: 'center',
    gap: 4,
  },
  // position: relative は RN View のデフォルト。earnedTierMotif（コーナーバッジ）はこれを基準に置く
  earnedCircleWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  earnedCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  earnedName: {
    fontSize: 11,
    textAlign: 'center',
  },
  earnedDate: {
    fontSize: 10,
  },
  lockedBlock: {
    gap: 8,
  },
  lockedTitle: {
    fontSize: 12,
  },

  // 4. 自己ベスト
  bestGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  bestTile: {
    width: '47%',
    gap: 2,
  },
  bestLabel: {
    fontSize: 12,
  },
  bestValue: {
    fontSize: 17,
    fontWeight: '700',
  },
  bestSub: {
    fontSize: 11,
  },
});
