// 初回起動チュートリアル(5 ページ・横スワイプ)。
//
// AchievementDetailModal.tsx と同じ「pagingEnabled な ScrollView + onMomentumScrollEnd で
// 現在ページを追う」形を使う。矢印タップからの scrollTo・isProgrammaticScroll による
// 二重ジャンプ避けも同じ理由であちらに揃えてある(コメントは goToIndex 参照)。
//
// 表示制御は呼び出し側(app/_layout.tsx)が持つ ── ここは「開いている間だけ描く」だけで、
// 初回判定・既読の保存・設定タブからの再表示要求は一切知らない。
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HelpButton } from '@/components/HelpButton';
import {
  OnboardingAchievementsFigure,
  OnboardingCalcFigure,
  OnboardingDataFigure,
  OnboardingPackagingPresetFigure,
  OnboardingPresetFigure,
  OnboardingSaveFigure,
  OnboardingSimulatorFigure,
  OnboardingTargetFigure,
} from '@/components/OnboardingFigure';
import {
  calcScreenTitle,
  dataTabLabel,
  onboardingNextPageLabel,
  onboardingPageIndicatorText,
  onboardingPreviousPageLabel,
  onboardingSkipLabel,
  onboardingStartLabel,
  onboardingText,
  recordsTabLabel,
} from '@/logic/labels';
import {
  ONBOARDING_PAGE_IDS,
  onboardingPages,
  type OnboardingPage,
} from '@/logic/onboardingContent';
import type { Locale } from '@/settings/language';
import { useLocale } from '@/settings';
import { useThemeColors, type ThemeColors } from '@/theme';

type Props = {
  visible: boolean;
  /** スキップ・「はじめる」のどちらでも呼ばれる。呼び出し側は既読の保存と非表示化を行う */
  onDone: () => void;
};

const FIGURES: Record<OnboardingPage['id'], () => React.JSX.Element> = {
  calc: OnboardingCalcFigure,
  target: OnboardingTargetFigure,
  preset: OnboardingPresetFigure,
  save: OnboardingSaveFigure,
  simulator: OnboardingSimulatorFigure,
  data: OnboardingDataFigure,
  packagingPreset: OnboardingPackagingPresetFigure,
  achievements: OnboardingAchievementsFigure,
};

const LAST_PAGE_INDEX = ONBOARDING_PAGE_IDS.length - 1;

/** ヘッダ見本の「？」は押せない（読むだけの図。OnboardingFigure.tsx の noop と同じ理由） */
const noop = () => {};

/**
 * 最後のページのミニ見本に並べる画面名（構成の指定「？は個別で出した方がいい」）。
 * 実際にヘッダへヘルプボタンを持つ画面から 3 つ選んである
 * （app/(tabs)/(calc)/index.tsx・RecordListScreen.tsx・DataScreen.tsx）。
 */
function onboardingHelpScreenTitles(locale: Locale): readonly string[] {
  return [calcScreenTitle(locale), recordsTabLabel(locale), dataTabLabel(locale)];
}

/**
 * 図の枠の高さ。全ページ共通の固定値にすることで、直下の見出し・本文の開始位置が
 * ページを送っても動かないようにする(構成の指定「固定で位置はどのページに行っても
 * 始まる場所を一緒にして」)。ヘッダー・フッターを除いた実高さ(iPhone 17 Pro で
 * 約 680pt)から、見出し・本文・注記ぶん(約 190pt)を引いた余裕を持たせた値。
 */
const FIGURE_AREA_HEIGHT = 360;

export function OnboardingOverlay({ visible, onDone }: Props) {
  return (
    <Modal visible={visible} animationType="fade" presentationStyle="fullScreen" onRequestClose={onDone}>
      {/* 開いている間だけマウントして、ページ位置を毎回 1 枚目から始める(RecordFormSheet と同じ作り) */}
      {visible && <OnboardingContent onDone={onDone} />}
    </Modal>
  );
}

function OnboardingContent({ onDone }: { onDone: () => void }) {
  // 表示語は locale を引数に取る（src/i18n/index.ts の冒頭）
  const locale = useLocale();
  const pages = onboardingPages(locale);

  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);
  const isLastPage = index === LAST_PAGE_INDEX;

  // 矢印タップが起こした scrollTo の onMomentumScrollEnd かどうかの目印
  // (AchievementDetailModal.goToIndex と同じ理由。pagingEnabled な ScrollView へ
  // animated: true で scrollTo すると、着地位置のわずかなずれを Math.round が
  // 1 つ先/前のページに丸めてしまうことがあるため)
  const isProgrammaticScroll = useRef(false);

  const handleScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (isProgrammaticScroll.current) {
        isProgrammaticScroll.current = false;
        return;
      }
      const next = Math.round(event.nativeEvent.contentOffset.x / width);
      setIndex(Math.min(LAST_PAGE_INDEX, Math.max(0, next)));
    },
    [width],
  );

  const goToIndex = useCallback(
    (target: number) => {
      const clamped = Math.min(LAST_PAGE_INDEX, Math.max(0, target));
      isProgrammaticScroll.current = true;
      scrollRef.current?.scrollTo({ x: clamped * width, animated: true });
      setIndex(clamped);
    },
    [width],
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Text
          style={[styles.pageIndicator, { color: colors.secondaryLabel }]}
          accessibilityElementsHidden>
          {onboardingPageIndicatorText(locale, index, pages.length)}
        </Text>
        <Pressable onPress={onDone} hitSlop={8} accessibilityRole="button">
          <Text style={[styles.skipLabel, { color: colors.blue }]}>{onboardingSkipLabel(locale)}</Text>
        </Pressable>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.pager}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScrollEnd}>
        {pages.map((page) => {
          const Figure = FIGURES[page.id];
          return (
            <View key={page.id} style={{ width }}>
              <OnboardingPageView page={page} colors={colors} locale={locale}>
                <Figure />
              </OnboardingPageView>
            </View>
          );
        })}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        {/* 進みインジケータの左右に戻る・次への矢印(構成の指定)。左右は position: absolute で
            浮かせてあるので、右側が矢印(44pt)から「はじめる」ボタン(もっと幅が要る)に
            変わってもドットの中央位置は動かない。最後のページだけ、次へ矢印の場所を
            そのまま「はじめる」に差し替える ── 別枠の全幅ボタンをやめて、
            ページを送るたびに沈んでいた見た目(せり上がり)を解消する */}
        <View style={styles.navRow}>
          <View style={styles.navSideLeft}>
            <NavArrow
              direction="back"
              enabled={index > 0}
              onPress={() => goToIndex(index - 1)}
              colors={colors}
              locale={locale}
            />
          </View>

          <View style={styles.dots}>
            {pages.map((page, dotIndex) => (
              <View
                key={page.id}
                style={[
                  styles.dot,
                  { backgroundColor: dotIndex === index ? colors.blue : colors.separator },
                ]}
              />
            ))}
          </View>

          <View style={styles.navSideRight}>
            {isLastPage ? (
              <Pressable
                onPress={onDone}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.startButton,
                  { backgroundColor: colors.blue, opacity: pressed ? 0.7 : 1 },
                ]}>
                <Text style={styles.startButtonLabel}>{onboardingStartLabel(locale)}</Text>
              </Pressable>
            ) : (
              <NavArrow
                direction="forward"
                enabled
                onPress={() => goToIndex(index + 1)}
                colors={colors}
                locale={locale}
              />
            )}
          </View>
        </View>
      </View>
    </View>
  );
}

function NavArrow({
  direction,
  enabled,
  onPress,
  colors,
  locale,
}: {
  direction: 'back' | 'forward';
  enabled: boolean;
  onPress: () => void;
  colors: ThemeColors;
  locale: Locale;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!enabled}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityState={{ disabled: !enabled }}
      accessibilityLabel={direction === 'back' ? onboardingPreviousPageLabel(locale) : onboardingNextPageLabel(locale)}
      style={({ pressed }) => [
        styles.navArrow,
        { opacity: !enabled ? 0 : pressed ? 0.5 : 1 },
      ]}>
      <Ionicons
        name={direction === 'back' ? 'chevron-back' : 'chevron-forward'}
        size={22}
        color={colors.blue}
      />
    </Pressable>
  );
}

function OnboardingPageView({
  page,
  colors,
  locale,
  children,
}: {
  page: OnboardingPage;
  colors: ThemeColors;
  locale: Locale;
  children: React.ReactNode;
}) {
  const text = onboardingText(locale);
  const isLastPage = page.id === 'achievements';
  const isSimulatorPage = page.id === 'simulator';
  const isPackagingPresetPage = page.id === 'packagingPreset';

  return (
    <View style={styles.pageContent}>
      {/* 図の場所を全ページ共通の固定サイズにする ── 図の実寸はページごとにばらばら
          （1・2 ページ目はカード + 帯グラフ、5 ページ目は実績の全画面表示で背が高い）だが、
          この枠を固定にしておけば、直下の見出し・本文の開始位置がページを送っても動かない。
          枠より図が高いページ（5 ページ目）は枠の中だけで縦スクロールする（外の横スクロールとは
          軸が違うので競合しない。AchievementDetailModal の入れ子スクロールと同じ考え方だが、
          今度は枠の高さを固定で渡しているので、内側のスクロールが「潰れて 0 になる」問題は起きない） */}
      <ScrollView
        style={styles.figureArea}
        contentContainerStyle={styles.figureAreaContent}
        showsVerticalScrollIndicator={false}>
        {children}
      </ScrollView>
      <View style={styles.pageText}>
        <Text style={[styles.title, { color: colors.label }]}>{page.title}</Text>
        {/* 梱包材のまとめ買いページだけ、本文中の「呼び出し場所」を強調する
            （構成の指定「電卓を強調して」）。他のページは page.body をそのまま出す */}
        {isPackagingPresetPage ? (
          <Text style={[styles.body, { color: colors.secondaryLabel }]}>
            {text.packagingPresetPrefix}
            <Text style={[styles.bodyEmphasis, { color: colors.blue }]}>
              {text.packagingPresetEmphasis}
            </Text>
            {text.packagingPresetSuffix}
          </Text>
        ) : (
          <Text style={[styles.body, { color: colors.secondaryLabel }]}>{page.body}</Text>
        )}
        {isLastPage && (
          <>
            {/* 「各画面の？」は 1 画面の例だけだと「その画面だけの機能」に見えかねないので、
                タブごとに個別のミニ見本を並べる（構成の指定「？は個別で出した方がいい・
                計算タブとかを再現して」）。3 つとも実物にヘルプボタンを持つ画面
                （app/(tabs)/(calc)/index.tsx・RecordListScreen.tsx・DataScreen.tsx） */}
            <View style={styles.headerPreviewRow}>
              {onboardingHelpScreenTitles(locale).map((title) => (
                <View
                  key={title}
                  style={[styles.headerPreviewChip, { backgroundColor: colors.barBackground }]}
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants">
                  <Text
                    style={[styles.headerPreviewChipTitle, { color: colors.label }]}
                    numberOfLines={1}>
                    {title}
                  </Text>
                  <HelpButton onPress={noop} />
                </View>
              ))}
            </View>
            <Text style={[styles.note, { color: colors.secondaryLabel }]}>
              {text.achievementsNote}
            </Text>
          </>
        )}
        {/* 値下げシミュレーションページだけ、注記中の「表示される条件」を強調する
            （構成の指定「目標の純利益を入力を強調して」） */}
        {isSimulatorPage && (
          <Text style={[styles.note, { color: colors.secondaryLabel }]}>
            {text.simulatorNotePrefix}
            <Text style={[styles.noteEmphasis, { color: colors.blue }]}>
              {text.simulatorNoteEmphasis}
            </Text>
            {text.simulatorNoteSuffix}
          </Text>
        )}
      </View>
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
    paddingBottom: 8,
  },
  pageIndicator: {
    fontSize: 13,
  },
  skipLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  pager: {
    flex: 1,
  },
  pageContent: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 40,
    paddingBottom: 24,
    gap: 24,
  },
  // 図の枠。全ページ共通の固定サイズ(図の上端も、直下の見出しの開始位置も動かない)。
  // 枠より小さい図は中央に、大きい図(5 ページ目)は枠の中だけスクロールする
  figureArea: {
    height: FIGURE_AREA_HEIGHT,
  },
  figureAreaContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  pageText: {
    gap: 10,
    alignItems: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  // 強調区間だけ太字にする（構成の指定「電卓を強調して」）。色は colors.blue を都度渡す
  bodyEmphasis: {
    fontWeight: '700',
  },
  note: {
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: 8,
  },
  // 強調区間だけ太字にする（構成の指定「目標の純利益を入力を強調して」）
  noteEmphasis: {
    fontWeight: '700',
  },
  // 「各画面の？」のミニ見本。画面ごとに個別のチップで並べる（1 つの例だけだと
  // 「その画面だけの機能」に見えるため。構成の指定）
  headerPreviewRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginTop: 4,
  },
  headerPreviewChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  headerPreviewChipTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  footer: {
    alignItems: 'center',
    gap: 16,
    paddingTop: 8,
    paddingHorizontal: 8,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
    // 左右のボタン(navSideLeft/Right)を position: absolute で浮かせるための基準
    position: 'relative',
    minHeight: 44,
  },
  navSideLeft: {
    position: 'absolute',
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navSideRight: {
    position: 'absolute',
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navArrow: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dots: {
    flexDirection: 'row',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  // 最後のページだけ、次へ矢印(navSideRight)の場所に出す「はじめる」ボタン。
  // 矢印より一回り大きい程度に留め、全幅ボタンだった頃の高さ(52pt)ぶんの
  // せり上がりを無くす
  startButton: {
    height: 44,
    paddingHorizontal: 18,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  startButtonLabel: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
});
