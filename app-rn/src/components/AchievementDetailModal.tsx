// 実績タップ時の全画面表示（データタブ「実績」）。
//
// 「一覧はシンプル、タップした全画面表示は装飾豊か」の方針どおり、AchievementsSection の
// 横スクロールカード（3.獲得した実績）は変えず、タップしたときだけここで装飾を出す。
// 難易度（logic/achievements.ts の achievementDifficulty、1〜5。★5＝レジェンド）
// に応じて、バッジに添えるモチーフ（葉 → 葉 → ギザ葉 → 宝石 → 王冠）が変わる。
// ★1〜★3 は AchievementTierMotif（react-native-svg の自作イラスト）、★4・★5 は
// FontAwesome5 のアイコン（gem / crown）を使う（自作イラストより従来のアイコンの
// 見た目が良いというフィードバックにより、この2つはアイコンのまま据え置き）。
//
// **難易度ごとのモチーフ**（★1〜★3 は AchievementTierMotif が描く。
// 「丸(バッジ本体)の下・両サイドから葉が伸び、真下で触れ合う」共通の構図で、
// 難易度が上がるほど大きく・葉の輪郭も派手にしていく。ユーザー指定）:
//   ★1 ブロンズ: 大きな葉を1枚ずつ（滑らかな輪郭）
//   ★2 シルバー: ★1 より一回り大きく、付け根を丸の高い位置まで回り込ませる
//     （滑らかな輪郭のまま）
//   ★3 ゴールド: ★2 よりさらに大きく、輪郭を鋸歯状のギザギザにして
//     ★1・★2（滑らかな輪郭）と一目で見分けられるようにする
//   ★4 プラチナ: 宝石（gem）を、傾けずバッジ上部に堂々と乗せる
//   ★5 レジェンド: 王冠（crown）を、傾けずバッジの正面中央に堂々と乗せる
//     縁取りも★4よりさらに太い（TIER_BORDER_WIDTHS）
// モチーフの色は難易度（段位）ごとに固定（★1〜★3 は AchievementTierMotif 内の
// ブロンズ〜ゴールドの配色、★4・★5 は tierColor＝TIER_COLORS）。バッジ本体・リングの
// 色分け（種類の色。categoryColor＝tint）とは完全に独立した軸 ── バッジ本体の
// 色分けルールはこれまで通り変更しない。
//
// **未達成（achievement.completed === false）も表示できる。** AchievementsSection の
// 「獲得した実績」カード内、未解除チップ列や、実績一覧画面（AchievementListScreen）の
// ジャンル別カードから開いたときは、バッジをグレーアウトしモチーフを出さない代わりに、
// 達成日・「達成した記録」行の位置に進捗バー（現在値 / 目標値）を出す。
import { FontAwesome5, Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  Modal,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useColorScheme,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  achievementIcon,
  categoryColor,
  legendRingOuterSize,
  LegendTierRing,
  TIER_CHIP_DARK_COLORS,
  TIER_COLORS,
  type TagLookup,
} from '@/components/AchievementsSection';
import { AchievementTierMotif } from '@/components/AchievementTierMotif';
import { TagChip } from '@/components/TagChip';
import {
  achievementBadgeTier,
  achievementCategory,
  achievementDifficulty,
  type Achievement,
  type AchievementCompletedRecord,
  type AchievementDifficulty,
} from '@/logic/achievements';
import { formatRecordDate } from '@/logic/format';
import {
  achievementCollapseRecordsLabel,
  achievementDetailNextLabel,
  achievementDetailPreviousLabel,
  achievementBadgeTierName,
  achievementCompletedRecordProfitText,
  achievementCompletedRecordsSectionTitle,
  achievementDescription,
  achievementName,
  achievementPageIndicatorText,
  achievementShowMoreRecordsText,
  closeLabel,
  nextAchievementProgressText,
  remainingToUnlockText,
} from '@/logic/labels';
import { useLocale } from '@/settings';
import { useThemeColors, type ThemeColors } from '@/theme';

/**
 * 記録詳細のルート。**データタブ側の入口**（app/(tabs)/data/record/[id].tsx）を使う ──
 * 実績はデータタブの中だけで開く（AchievementsSection・AchievementListScreen とも
 * データタブの Stack に積まれる）。記録タブ側のルート（/records/record/[id]）へ push すると、
 * 詳細から戻ったときに記録タブの一覧に着いてしまう（DataScreen.tsx の同名定数と同じ理由）
 */
const RECORD_DETAIL_PATHNAME = '/data/record/[id]' as const;

const BADGE_BASE_SIZE = 120;
const BADGE_SIZE_STEP = 18;

/** 縁取りの太さ。ブロンズは現状維持、難易度が上がるほど太くする。★5＝レジェンドは★4より一段太く */
const TIER_BORDER_WIDTHS: Record<AchievementDifficulty, number> = {
  1: 6,
  2: 8,
  3: 10,
  4: 13,
  5: 17,
};

/**
 * AchievementTierMotif（★1〜★3）の表示サイズ。難易度が上がるほど大きく・装飾的にする。
 * ★1 だけはバッジの縁から生えるのではなく丸の下・両サイドに大きな葉を添える構図なので、
 * バッジ本体（難易度 1 の直径 = BADGE_BASE_SIZE + BADGE_SIZE_STEP = 138）を覆えるサイズにする
 */
const TIER_MOTIF_SIZES: Record<1 | 2 | 3, number> = {
  1: 150,
  2: 175,
  // ★3 は viewBox を -18 -18 136 136 に拡張した分（136/100 倍）だけ size も拡大し、
  // 葉自体の実ピクセルサイズは前と変わらないようにしている（motifTier3.top も連動して調整）
  3: 147,
};

/**
 * ★5 レジェンドの全画面表示用リング寸法（AchievementsSection.LegendTierRing に渡す）。
 *
 * ★1〜★4 は TIER_COLORS の単色・一重の borderColor（TIER_BORDER_WIDTHS の太さ）のままだが、
 * ★5 は色（黒みがかった深いボルドー。TIER_COLORS.legend）だけに頼らず、リングを二重にして
 * 間に金のラインを挟み、バッジ本体との間に白い隙間を設ける ── 将来、継続系（赤系の
 * バッジ本体）が追加されて色調が近づいても、構造で見分けられるようにするため
 */
const LEGEND_RING_GEOMETRY = {
  insetGap: 3,
  ringWidth: 4,
  goldWidth: 2,
};

type Props = {
  /** 達成済み・未達成どちらも渡せる（未達成は進捗バー表示になる。上のコメント参照） */
  achievements: readonly Achievement[];
  /** 開いたときに表示するページの index（achievements 内の位置） */
  initialIndex: number;
  visible: boolean;
  onClose: () => void;
  /**
   * 「達成した記録」のタグ別グループ見出し（色の点 + タグ名）を出すためのタグ解決。
   * 🎯得意分野・🔍売れ筋・🏷️タグの総合力・タグの達人（completedRecords の各要素が
   * tagId を持つ実績）だけが使う。他の実績（一撃・累計利益・販売件数・はじめる系）は
   * tagId が常に null なので呼ばれない。
   */
  resolveTag: TagLookup;
};

export function AchievementDetailModal({
  achievements,
  initialIndex,
  visible,
  onClose,
  resolveTag,
}: Props) {
  // 表示語は locale を引数に取る（src/i18n/index.ts の冒頭）
  const locale = useLocale();

  const colors = useThemeColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const [index, setIndex] = useState(initialIndex);
  const [prevVisible, setPrevVisible] = useState(visible);
  // ScrollView に渡す key。「閉じている → 開いた」の瞬間だけ増やす（= その時だけ作り直す）
  const [openToken, setOpenToken] = useState(0);
  /**
   * ScrollView の contentOffset に渡す値は、開いた瞬間の index に**固定**する。
   *
   * 以前は `index * width` を毎レンダー計算して渡していたが、index は矢印タップ・スワイプの
   * たびに変わる state なので、その都度「新しい contentOffset オブジェクト」が
   * ScrollView に渡っていた。「contentOffset は初回描画にしか効かない」はずでも、矢印タップの
   * 直後（scrollTo のアニメーション中）に index が変わって新しい contentOffset が届くと、
   * アニメーション中の ScrollView に割り込む形になり、pagingEnabled のページ吸着が
   * 余分に 1 ページぶん先/前まで持っていかれる（矢印を押すたびに 2 ページ進む／戻る不具合の原因）。
   * open の瞬間だけ動かすこの state を使えば、index が変わっても contentOffset の値は
   * 動かないので、この割り込みが起きない（レンダー中に ref を読み書きしないよう state にする）。
   */
  const [openIndex, setOpenIndex] = useState(initialIndex);

  /**
   * モーダルを開くたびに、表示中ページの index とスクロール位置をタップした位置に合わせる。
   *
   * レンダー中に判定して即 setState する（React 公式の「props が変わったら state を
   * 直す」パターン）。useEffect で直すと 1 テンポ遅れて反映される。
   *
   * **openToken は「閉じている → 開いた」の遷移でだけ増やす。** 開いている間・閉じている間は
   * 増やさない ── 「閉じる」の瞬間にも key を変えて ScrollView を作り直すと、閉じるスライド
   * アニメーションの最中に真っ新な ScrollView が一瞬 1 枚目（index 0）で描画されてしまう
   * （open のときと同じ理屈の逆側）。閉じるときはそのまま今の位置を保って fade/slide させたい
   * ので、visible が false になっただけでは作り直さない。
   */
  if (visible !== prevVisible) {
    setPrevVisible(visible);
    if (visible) {
      setIndex(initialIndex);
      setOpenIndex(initialIndex);
      setOpenToken((token) => token + 1);
    }
  }

  // goToIndex（矢印タップ）が起こした scrollTo の onMomentumScrollEnd かどうかの目印。
  // pagingEnabled な ScrollView に scrollTo(animated: true) を投げると、着地位置が
  // ちょうど 1 ページぶんの位置からわずかにずれ、Math.round が 1 つ先/前のページに
  // 丸めてしまうことがある（矢印を押すたびに 2 ページ進む／戻る不具合の原因）。
  // 矢印側は行き先の index を scrollTo を呼ぶ時点で確定できているので、直後の
  // onMomentumScrollEnd はこのフラグで無視し、着地位置からの再計算に頼らない
  const isProgrammaticScroll = useRef(false);

  const handleScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (isProgrammaticScroll.current) {
        isProgrammaticScroll.current = false;
        return;
      }
      const next = Math.round(event.nativeEvent.contentOffset.x / width);
      setIndex(Math.min(achievements.length - 1, Math.max(0, next)));
    },
    [achievements.length, width],
  );

  // 左右の矢印（スワイプ以外にも移動できることを示す）から呼ぶ。アニメーションあり
  const goToIndex = useCallback(
    (target: number) => {
      const clamped = Math.min(achievements.length - 1, Math.max(0, target));
      isProgrammaticScroll.current = true;
      scrollRef.current?.scrollTo({ x: clamped * width, animated: true });
      setIndex(clamped);
    },
    [achievements.length, width],
  );

  const goToRecord = useCallback(
    (recordId: string) => {
      onClose();
      router.push({
        pathname: RECORD_DETAIL_PATHNAME,
        params: { id: recordId },
      });
    },
    [onClose, router],
  );

  if (achievements.length === 0) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      transparent={false}
    >
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <Pressable
            onPress={onClose}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={closeLabel(locale)}
          >
            <Ionicons name="close" size={24} color={colors.label} />
          </Pressable>

          {/*
            実績が 1 桁台のうちはドット 1 個 = 1 件が見比べやすかったが、実績数が増える
            （はじめる系・累計利益系などの追加で 9 → 28 種に）と、同じ太さのドットを並べる形は
            画面幅を超えて見切れてしまう。件数に関わらず幅が一定な帯（現在位置 / 総数の比率で
            塗る）に変える ── AchievementPage の未達成用 ProgressBar と同じ考え方
          */}
          <View
            style={[
              styles.headerProgressTrack,
              { backgroundColor: colors.separator },
            ]}
          >
            <View
              style={[
                styles.headerProgressFill,
                {
                  backgroundColor: colors.blue,
                  width: `${((index + 1) / achievements.length) * 100}%`,
                },
              ]}
            />
          </View>

          <Text
            style={[styles.pageIndicator, { color: colors.secondaryLabel }]}
          >
            {achievementPageIndicatorText(locale, index, achievements.length)}
          </Text>
        </View>

        <ScrollView
          ref={scrollRef}
          // 開くたびに key を変えて作り直す（閉じるときは変えない。上のコメント参照）。
          // contentOffset は初回描画にしか効かないので、同じ ScrollView インスタンスを
          // 使い回すと 2 回目以降に反映されない
          key={openToken}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          // openIndex を使う（initialIndex 直読みでも index 直読みでもない）。
          // 呼び出し側（AchievementsSection / AchievementListScreen）は onClose で選択中の
          // index を null に戻すため、閉じた瞬間に initialIndex が 0 にフォールバックする ──
          // その値をそのまま使うと、閉じるスライドの最中に 1 枚目へジャンプして見えてしまう。
          // 一方 index を直読みすると、矢印タップ・スワイプのたびに contentOffset の値が
          // 変わってしまい、pagingEnabled のページ吸着に割り込んで余分に進む不具合の元になる
          // （goToIndex のコメント参照）。openIndex は開いた瞬間にしか動かないので、
          // どちらの問題も起きない
          contentOffset={{ x: openIndex * width, y: 0 }}
          onMomentumScrollEnd={handleScrollEnd}
        >
          {achievements.map((achievement) => (
            <View key={achievement.id} style={{ width }}>
              <AchievementPage
                achievement={achievement}
                colors={colors}
                bottomInset={insets.bottom}
                screenHeight={height}
                onPressRecord={goToRecord}
                resolveTag={resolveTag}
              />
            </View>
          ))}
        </ScrollView>

        {/* 左右の矢印。スワイプでも動けるが、矢印を置くことで前後に移動できると分かるようにする
            （端では出さない ── 押しても動かないボタンを置かない） */}
        {index > 0 && (
          <Pressable
            onPress={() => goToIndex(index - 1)}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={achievementDetailPreviousLabel(locale)}
            style={({ pressed }) => [
              styles.navArrow,
              styles.navArrowLeft,
              {
                backgroundColor: colors.secondaryBackground,
                opacity: pressed ? 0.6 : 1,
              },
            ]}
          >
            <Ionicons name="chevron-back" size={20} color={colors.label} />
          </Pressable>
        )}
        {index < achievements.length - 1 && (
          <Pressable
            onPress={() => goToIndex(index + 1)}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={achievementDetailNextLabel(locale)}
            style={({ pressed }) => [
              styles.navArrow,
              styles.navArrowRight,
              {
                backgroundColor: colors.secondaryBackground,
                opacity: pressed ? 0.6 : 1,
              },
            ]}
          >
            <Ionicons name="chevron-forward" size={20} color={colors.label} />
          </Pressable>
        )}
      </View>
    </Modal>
  );
}

/**
 * 実績 1 件ぶんの全画面表示（縦スクロールの器つき）。AchievementDetailModal
 * （ページ送りのモーダル）の中身そのもの。
 */
export function AchievementPage({
  achievement,
  colors,
  bottomInset,
  screenHeight,
  onPressRecord,
  resolveTag,
}: {
  achievement: Achievement;
  colors: ThemeColors;
  bottomInset: number;
  /** 「達成した記録」/ 進捗バーを画面の半分より下に置くための基準値 */
  screenHeight: number;
  onPressRecord: (recordId: string) => void;
  resolveTag: TagLookup;
}) {
  return (
    <ScrollView
      style={styles.page}
      // 余白（styles.pageContent の paddingHorizontal/paddingTop・下端の bottomInset）は
      // AchievementPageContent 側が自分の根の View に持つ（このコンポーネントを ScrollView なしで
      // 埋め込む呼び出し元でも同じ余白になるようにするため。下のコメント参照）
      // 「達成した記録」がアコーディオンで展開されると画面の高さを超えることがあるので、
      // このページ自体を縦スクロールにする（外側はページ送りの横スクロール。向きが違うので競合しない）
      showsVerticalScrollIndicator={false}
      nestedScrollEnabled>
      <AchievementPageContent
        achievement={achievement}
        colors={colors}
        screenHeight={screenHeight}
        bottomInset={bottomInset}
        onPressRecord={onPressRecord}
        resolveTag={resolveTag}
      />
    </ScrollView>
  );
}

/**
 * AchievementPage の中身だけ（縦スクロールの器を持たない）。
 *
 * 初回起動チュートリアル（OnboardingFigure.OnboardingAchievementsFigure）が「実物の全画面表示を
 * ページの中に埋め込む」形で再利用するため export してある。**ScrollView 抜きにしてあるのは**、
 * 呼び出し側（オンボーディングのページ）自体がすでに縦スクロールの ScrollView で、
 * その中にこの ScrollView をそのまま入れ子にすると、内側が確保する高さが実寸ではなく
 * 潰れた値になり、外側で後に続く見出し・本文がその潰れた枠に重なって見切れる
 * （縦方向どうしの入れ子 ScrollView は RN では高さの自己申告が信用できない）。
 *
 * 余白（styles.pageContent）はこのコンポーネント自身の根の View に持たせてある ──
 * AchievementPage（ScrollView 越し）から使っても、ここから直接使っても同じ見た目になるように。
 */
export function AchievementPageContent({
  achievement,
  colors,
  screenHeight,
  bottomInset = 0,
  onPressRecord,
  resolveTag,
}: {
  achievement: Achievement;
  colors: ThemeColors;
  /** 「達成した記録」/ 進捗バーを画面の半分より下に置くための基準値 */
  screenHeight: number;
  /** 下端の余白の上乗せ分。ScrollView なしで埋め込む場合は省略でよい（既定 0） */
  bottomInset?: number;
  onPressRecord: (recordId: string) => void;
  resolveTag: TagLookup;
}) {
  // 表示語は locale を引数に取る（src/i18n/index.ts の冒頭）
  const locale = useLocale();

  const category = achievementCategory(achievement.id);
  const difficulty = achievementDifficulty(achievement.id);
  const tier = achievementBadgeTier(achievement.id);
  const tint = achievement.completed
    ? categoryColor(category, colors)
    : colors.gray;
  // 段位の色（縁取り・段位チップ）。未達成はバッジ本体と同じくグレーに落とす
  const tierColor = achievement.completed ? TIER_COLORS[tier] : colors.gray;
  // 段位チップ（縁取り・文字）の色。暗色モードでは、地の色に対してコントラストが
  // 足りない段位（legend）だけ、チップ専用の明るい色に差し替える
  // （バッジ本体の縁取り・リングは tierColor のまま。§実績詳細ダークモード可読性）
  const isDarkMode = useColorScheme() === 'dark';
  const tierChipColor =
    achievement.completed && isDarkMode
      ? (TIER_CHIP_DARK_COLORS[tier] ?? tierColor)
      : tierColor;
  // 未達成の進捗バーに使う。labels.ts の nextAchievementProgressText / remainingToUnlockText は
  // NextAchievement（{id, current, target, progress}）を受け取る形なので、Achievement から同じ形を作る
  const progress =
    achievement.target === 0 ? 0 : achievement.current / achievement.target;
  const progressLike = {
    id: achievement.id,
    current: achievement.current,
    target: achievement.target,
    progress,
  };

  return (
    <View style={[styles.pageContent, { paddingBottom: bottomInset + 24 }]}>
      {/*
        バッジ・実績名・説明・達成日を乗せる白背景のカード。minHeight で画面の半分を確保し、
        「達成した記録」/ 進捗バーは常にこの下（= 画面の半分以下の位置）から始まる。

        カードの中は 2 段構成:
        - badgeStage（flex: 1）にバッジをセンタリングして置く。バッジは難易度で大きさが変わるが、
          このステージが余白を吸収するので、下の textBlock の位置は動かない。
        - textBlock はカードの下側に固定（バッジの大きさで文字の位置を変えたくない、という指定）。
      */}
      <View
        style={[
          styles.card,
          {
            minHeight: screenHeight / 2,
            backgroundColor: colors.secondaryBackground,
          },
        ]}
      >
        <View style={styles.badgeStage}>
          <DecoratedBadge
            iconName={achievementIcon(achievement.id)}
            difficulty={difficulty}
            tint={tint}
            tierColor={tierColor}
            iconTierColor={tierChipColor}
            decorated={achievement.completed}
          />
        </View>

        <View style={styles.textBlock}>
          <Text style={[styles.name, { color: colors.label }]}>
            {achievementName(locale, achievement.id)}
          </Text>
          <Text style={[styles.description, { color: colors.secondaryLabel }]}>
            {achievementDescription(locale, achievement.id)}
          </Text>

          <View style={styles.tierRow}>
            <StarRating filled={difficulty} tint={tint} colors={colors} />
            <View style={[styles.tierChip, { borderColor: tierChipColor }]}>
              <Text style={[styles.tierChipText, { color: tierChipColor }]}>
                {achievementBadgeTierName(locale, tier)}
              </Text>
            </View>
          </View>

          {achievement.completed && achievement.completedAt != null && (
            <Text style={[styles.dateText, { color: colors.secondaryLabel }]}>
              {formatRecordDate(locale, achievement.completedAt)}
            </Text>
          )}
        </View>
      </View>

      {achievement.completed ? (
        achievement.completedRecords.length > 0 && (
          <CompletedRecordsSection
            records={achievement.completedRecords}
            colors={colors}
            onPressRecord={onPressRecord}
            resolveTag={resolveTag}
          />
        )
      ) : (
        <View style={styles.progressBlock}>
          <ProgressBar progress={progress} tint={tint} colors={colors} />
          <View style={styles.progressTextRow}>
            <Text style={[styles.progressValueText, { color: colors.label }]}>
              {nextAchievementProgressText(locale, progressLike)}
            </Text>
            <Text
              style={[
                styles.progressRemainingText,
                { color: colors.secondaryLabel },
              ]}
            >
              {remainingToUnlockText(locale, progressLike)}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

/** 「達成した記録」アコーディオンが最初に見せる件数。それ以上は「すべて見る」で展開する */
const INITIAL_VISIBLE_RECORD_COUNT = 3;

/** CompletedRecordsSection が並べる行。タグの切り替わり目にだけ header が挟まる */
type CompletedRecordRow =
  | { type: 'header'; tagId: string; tag: { name: string; colorKey: string } }
  | { type: 'record'; record: AchievementCompletedRecord };

/**
 * 表示する記録の並びに、タグが切り替わるたびに見出し（色の点 + タグ名。TagChip）を挟んだ
 * 行の並びを作る。🎯得意分野・🔍売れ筋・🏷️タグの総合力・タグの達人（completedRecords が
 * tagId 付き）だけがヘッダー付きで、他の実績（tagId が常に null）はレコード行だけの
 * 従来どおりの見た目になる（同じタグが連続して呼び出し側の contributing の並び順どおり
 * まとまっている前提。achievements.ts の flattenTaggedContributingRecords が
 * タグごとにグループ化して返すので、切り替わり検出だけで済む）。
 * タグが解決できない（削除済みなど）ときはヘッダーを出さない。
 */
function buildCompletedRecordRows(
  records: readonly AchievementCompletedRecord[],
  resolveTag: TagLookup,
): CompletedRecordRow[] {
  const rows: CompletedRecordRow[] = [];
  let lastTagId: string | null | undefined = undefined;
  for (const record of records) {
    if (record.tagId !== lastTagId) {
      lastTagId = record.tagId;
      if (record.tagId != null) {
        const tag = resolveTag(record.tagId);
        if (tag != null) {
          rows.push({ type: 'header', tagId: record.tagId, tag });
        }
      }
    }
    rows.push({ type: 'record', record });
  }
  return rows;
}

/**
 * 「達成した記録」セクション。複数の記録が積み重なって達成する実績（💰累計利益・📦販売件数・
 * 🎯得意分野・🔍売れ筋・タグ系など）は completedRecords に全件入っているので、最初は
 * 先頭 3 件だけを見せ、「すべて見る」を押すと残りをアコーディオンで開く（構成の指定）。
 * 「一撃」やはじめる系の単発実績は 1 件しか無いので、そのまま 1 行だけ表示される。
 *
 * タグに紐づく実績は、記録の前にタグの色 + 名前（TagChip）を見出しとして挟む
 * （ユーザー報告「達成した記録でタグの色だけでも確認できた方がいい」を受けての対応。
 * 色だけでなく名前も、記録名を圧迫しない別行にすることで両立させた）。
 */
function CompletedRecordsSection({
  records,
  colors,
  onPressRecord,
  resolveTag,
}: {
  records: readonly AchievementCompletedRecord[];
  colors: ThemeColors;
  onPressRecord: (recordId: string) => void;
  resolveTag: TagLookup;
}) {
  // 表示語は locale を引数に取る（src/i18n/index.ts の冒頭）
  const locale = useLocale();

  const [expanded, setExpanded] = useState(false);
  const visibleRecords = expanded
    ? records
    : records.slice(0, INITIAL_VISIBLE_RECORD_COUNT);
  const hiddenCount = records.length - visibleRecords.length;
  const rows = buildCompletedRecordRows(visibleRecords, resolveTag);

  return (
    <View style={styles.recordsSection}>
      <Text
        style={[styles.recordsSectionLabel, { color: colors.secondaryLabel }]}
      >
        {achievementCompletedRecordsSectionTitle(locale, records.length)}
      </Text>

      {rows.map((row) =>
        row.type === 'header' ? (
          <TagChip
            key={`tag-${row.tagId}`}
            tag={row.tag}
            variant="plain"
            style={styles.tagGroupHeader}
          />
        ) : (
          <Pressable
            key={row.record.id}
            onPress={() => onPressRecord(row.record.id)}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.recordRow,
              {
                backgroundColor: colors.secondaryBackground,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <Text
              style={[styles.recordRowName, { color: colors.label }]}
              numberOfLines={1}
            >
              {row.record.itemName}
            </Text>
            {row.record.netProfit != null && (
              <Text
                style={[
                  styles.recordRowProfit,
                  {
                    color:
                      row.record.netProfit >= 0 ? colors.green : colors.red,
                  },
                ]}
              >
                {achievementCompletedRecordProfitText(row.record.netProfit)}
              </Text>
            )}
            <Ionicons
              name="chevron-forward"
              size={18}
              color={colors.secondaryLabel}
            />
          </Pressable>
        ),
      )}

      {hiddenCount > 0 && (
        <Pressable
          onPress={() => setExpanded(true)}
          accessibilityRole="button"
          hitSlop={8}
          style={styles.showAllButton}
        >
          <Text style={[styles.showAllText, { color: colors.blue }]}>
            {achievementShowMoreRecordsText(locale, hiddenCount)}
          </Text>
        </Pressable>
      )}

      {expanded && records.length > INITIAL_VISIBLE_RECORD_COUNT && (
        <Pressable
          onPress={() => setExpanded(false)}
          accessibilityRole="button"
          hitSlop={8}
          style={styles.showAllButton}
        >
          <Text
            style={[styles.showAllText, { color: colors.secondaryLabel }]}
          >
            {achievementCollapseRecordsLabel(locale)}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

/** 未達成ページの進捗バー（現在値 / 目標値）。「達成度合い」を視覚的に見せる */
function ProgressBar({
  progress,
  tint,
  colors,
}: {
  /** 0〜1（クランプはこちらで行う） */
  progress: number;
  tint: string;
  colors: ThemeColors;
}) {
  const clamped = Math.min(1, Math.max(0, progress));
  return (
    <View style={[styles.progressTrack, { backgroundColor: colors.separator }]}>
      <View
        style={[
          styles.progressFill,
          { backgroundColor: tint, width: `${clamped * 100}%` },
        ]}
      />
    </View>
  );
}

function StarRating({
  filled,
  tint,
  colors,
}: {
  filled: AchievementDifficulty;
  tint: string;
  colors: ThemeColors;
}) {
  return (
    <View style={styles.starsRow}>
      {Array.from({ length: 5 }, (_, i) => (
        <Ionicons
          key={i}
          name={i < filled ? 'star' : 'star-outline'}
          size={14}
          color={i < filled ? tint : colors.separator}
        />
      ))}
    </View>
  );
}

/**
 * 難易度に応じて大きさ・リング・光の粒を変えるバッジ本体（構成の「装飾の実装方針」）。
 * `decorated=false`（未達成）はリング・光の粒・発光を出さない ── 装飾は「達成した」ことの
 * 演出なので、まだ達成していないものに付けると紛らわしい。大きさ（難易度の目安）だけは残す。
 */
function DecoratedBadge({
  iconName,
  difficulty,
  tint,
  tierColor,
  iconTierColor,
  decorated,
}: {
  iconName: keyof typeof Ionicons.glyphMap;
  difficulty: AchievementDifficulty;
  tint: string;
  /** 段位の縁取り色（TIER_COLORS。未達成は colors.gray） */
  tierColor: string;
  /**
   * ★4・★5 のアイコン（gem/crown）用の段位色。暗色モードでは地の色に対してコントラストが
   * 足りない段位（legend）だけ、tierChipColor（明るい差し替え色）に置き換わっている
   * （バッジ本体の縁取り・リングは tierColor のまま。§実績詳細ダークモード可読性）
   */
  iconTierColor: string;
  /** false = 未達成。モチーフ・縁取りを出さず、バッジも tint（呼び出し側で colors.gray）だけで見せる */
  decorated: boolean;
}) {
  const size = BADGE_BASE_SIZE + difficulty * BADGE_SIZE_STEP;

  return (
    <View style={styles.badgeOverlay}>
      {decorated && difficulty !== 4 && difficulty !== 5 && (
        // ★1〜★3 のモチーフは AchievementTierMotif が難易度ごとに描く（葉 → 葉 → ギザ葉）
        <AchievementTierMotif
          difficulty={difficulty}
          size={TIER_MOTIF_SIZES[difficulty]}
          style={TIER_MOTIF_STYLES[difficulty]}
        />
      )}
      {decorated && difficulty === 4 && (
        // ★4 プラチナ。指輪の宝石のように、傾けずバッジ上部に堂々と乗せる。
        // 色はバッジ本体の種類色（tint）ではなく段位色（iconTierColor）に合わせる
        <FontAwesome5
          name="gem"
          solid
          size={40}
          color={iconTierColor}
          style={styles.motifGemPlatinum}
        />
      )}
      {decorated && difficulty === 5 && (
        // ★5 レジェンド。★4 より大きな冠を、傾けずバッジの正面中央に堂々と乗せる。
        // 色はバッジ本体の種類色（tint）ではなく段位色（iconTierColor。暗色モードでは
        // legend だけ明るい色に差し替え）に合わせる
        <FontAwesome5
          name="crown"
          solid
          size={46}
          color={iconTierColor}
          style={styles.motifCrownLegend}
        />
      )}

      {(() => {
        const borderWidth = decorated ? TIER_BORDER_WIDTHS[difficulty] : 0;
        // ★5 は縁取りを LegendTierRing（二重リング + 金のライン + 白い隙間）で表現するので、
        // 円本体には borderWidth を持たせない
        const isLegendRing = decorated && difficulty === 5;
        const circle = (
          <View
            style={[
              styles.badgeCircle,
              {
                width: size,
                height: size,
                borderRadius: size / 2,
                backgroundColor: tint,
                borderWidth: isLegendRing ? 0 : borderWidth,
                borderColor: tierColor,
              },
            ]}
          >
            {decorated && (
              // 艶。上から左に寄せたハイライトで、球体っぽい光沢を足す（塗りつぶしすぎて
              // アイコンを隠さないよう、円の上半分だけに収める）
              <LinearGradient
                colors={['rgba(255,255,255,0.5)', 'rgba(255,255,255,0)']}
                start={{ x: 0.25, y: 0 }}
                end={{ x: 0.75, y: 0.7 }}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
              />
            )}
            <Ionicons
              name={iconName}
              size={26 + difficulty * 4}
              color="#FFFFFF"
            />
          </View>
        );

        if (!isLegendRing) return circle;

        const ringOuter = legendRingOuterSize(
          size,
          LEGEND_RING_GEOMETRY.insetGap,
          LEGEND_RING_GEOMETRY.ringWidth,
          LEGEND_RING_GEOMETRY.goldWidth,
        );
        return (
          <View
            style={{
              width: ringOuter,
              height: ringOuter,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <LegendTierRing
              size={size}
              insetGap={LEGEND_RING_GEOMETRY.insetGap}
              ringWidth={LEGEND_RING_GEOMETRY.ringWidth}
              goldWidth={LEGEND_RING_GEOMETRY.goldWidth}
              style={StyleSheet.absoluteFill}
            />
            {circle}
          </View>
        );
      })()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  // 実績数に関わらず幅が一定な帯（旧・ドット列）。flex: 1 で close ボタンと件数表示の間を埋める
  headerProgressTrack: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    marginHorizontal: 12,
    overflow: 'hidden',
  },
  headerProgressFill: {
    height: '100%',
    borderRadius: 2,
  },
  pageIndicator: {
    fontSize: 13,
    minWidth: 40,
    textAlign: 'right',
  },
  // 左右の矢印。container 基準の絶対配置で縦中央に置く（position: relative は View のデフォルト）
  navArrow: {
    position: 'absolute',
    top: '50%',
    marginTop: -22,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  navArrowLeft: {
    left: 12,
  },
  navArrowRight: {
    right: 12,
  },
  page: {
    flex: 1,
  },
  pageContent: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  // バッジ・実績名・説明・達成日を乗せる白背景のカード。
  // minHeight は AchievementPage が screenHeight / 2 で指定する
  card: {
    width: '100%',
    alignItems: 'center',
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
  },
  // カードの余白を吸収する側。バッジはここでセンタリングされるので、
  // 難易度でバッジの大きさが変わっても textBlock の位置は動かない
  badgeStage: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // paddingHorizontal は左右の矢印（navArrow。画面端から left/right: 12・幅 44 で
  // x=12〜56 に浮く）と被らないための余白。card の余白（pageContent 24 + card 20 = 44）
  // だけだと、実績名・説明が複数行に折り返したときに矢印の下へ潜り込んで読めなくなる
  // （ユーザー報告）。20px 足して合計 64px にし、矢印の外側まで確実に空ける
  textBlock: {
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  // 難易度モチーフ（AchievementTierMotif）はすべてバッジに重ねる
  // （position: relative は RN View のデフォルトなので、absolute な子はこの View 基準で置ける）
  badgeOverlay: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  // AchievementTierMotif は viewBox 下端中央を茎の根元として描いているので、
  // top はどの難易度も「サイズ分だけ引き上げて、少しだけバッジに埋め込む」という
  // 同じ考え方（TIER_MOTIF_SIZES[difficulty] - 埋め込み量）で決めている
  // ★1 は丸(バッジ、直径 138)の下・両サイドに大きな葉を添える構図。葉の付け根・
  // 先端の座標自体がバッジの下端ぎりぎりで触れ合うよう作ってあるので、モチーフの箱
  // （TIER_MOTIF_SIZES[1] = 150）はバッジ本体にほぼ中央揃え（(150-138)/2=6 だけ引き上げ）
  motifTier1: {
    position: 'absolute',
    top: -6,
    zIndex: 1,
  },
  // ★2 も★1 と同じ「丸の下・両サイドに葉」構図。バッジ本体（直径 156）に対して
  // モチーフの箱（TIER_MOTIF_SIZES[2] = 175）を中央揃え（(175-156)/2=9.5 だけ引き上げ）
  // 中央揃え（-10）からさらに下にずらし、葉がバッジの縁（リング）に重なるように見せる
  motifTier2: {
    position: 'absolute',
    top: 15,
    zIndex: 1,
  },
  // ★3 も★1・★2 と同じ「丸の下・両サイドに葉」構図。中央揃えからさらに下にずらし、
  // 葉がバッジの縁（リング）に重なるように見せる
  motifTier3: {
    position: 'absolute',
    top: 76,
    zIndex: 1,
  },
  // ★4 プラチナの宝石アイコン。★5 の冠と同じ考え方で、傾けずバッジ上部に乗せる
  motifGemPlatinum: {
    position: 'absolute',
    top: -36,
    zIndex: 1,
  },
  // ★5 レジェンドの冠。★4 と違い傾けず、バッジの正面中央に堂々と乗せる。
  // カード上端からはみ出さないよう size と合わせて控えめにする
  motifCrownLegend: {
    position: 'absolute',
    top: -26,
    zIndex: 1,
  },
  badgeCircle: {
    alignItems: 'center',
    justifyContent: 'center',
    // 艶のハイライト（LinearGradient）を円形に切り抜くため
    overflow: 'hidden',
  },
  name: {
    fontSize: 22,
    fontWeight: '700',
    marginTop: 8,
    textAlign: 'center',
  },
  description: {
    fontSize: 13,
    marginTop: 6,
    textAlign: 'center',
  },
  tierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 16,
  },
  starsRow: {
    flexDirection: 'row',
    gap: 2,
  },
  tierChip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  tierChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  dateText: {
    fontSize: 13,
    marginTop: 14,
  },
  recordsSection: {
    width: '100%',
    marginTop: 24,
    gap: 8,
  },
  // タグ別グループの見出し（TagChip variant="plain"）。stretch させると横幅いっぱいの
  // ピルになってしまうので、中身の幅に合わせて左寄せする
  tagGroupHeader: {
    alignSelf: 'flex-start',
  },
  recordsSectionLabel: {
    fontSize: 11,
  },
  recordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    width: '100%',
  },
  recordRowName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
  },
  recordRowProfit: {
    fontSize: 16,
    fontWeight: '700',
  },
  showAllButton: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  showAllText: {
    fontSize: 13,
    fontWeight: '600',
  },
  progressBlock: {
    width: '100%',
    marginTop: 24,
    gap: 8,
  },
  progressTrack: {
    width: '100%',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressTextRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  progressValueText: {
    fontSize: 14,
    fontWeight: '600',
  },
  progressRemainingText: {
    fontSize: 12,
  },
});

/** 難易度（★1〜★3）→ AchievementTierMotif の位置スタイル */
const TIER_MOTIF_STYLES: Record<1 | 2 | 3, (typeof styles)['motifTier1']> = {
  1: styles.motifTier1,
  2: styles.motifTier2,
  3: styles.motifTier3,
};
