import { Ionicons } from '@expo/vector-icons';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, type Theme } from 'expo-router';
import { useEffect, useState } from 'react';
import { AppState, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';

import Toast, { BaseToast, type ToastConfig, type ToastConfigParams } from 'react-native-toast-message';

import { initializeAds } from '@/ads/consent';
import { AchievementToast } from '@/components/AchievementToast';
import { AchievementToastHost } from '@/components/AchievementToastHost';
import { ACHIEVEMENT_TOAST_TYPE, type AchievementToastProps } from '@/components/achievementToastBus';
import { OnboardingOverlay } from '@/components/OnboardingOverlay';
import { registerOnboardingRequestListener } from '@/components/onboardingBus';
import {
  SaveConfirmationToast,
  SAVE_CONFIRMATION_TOAST_TYPE,
  type SaveConfirmationToastProps,
} from '@/components/SaveConfirmationToast';
import { initDatabase } from '@/db/client';
import { dbInitFailedMessage } from '@/logic/labels';
import { refreshBell } from '@/notifications/bellStore';
import { rescheduleNotification, setupNotificationHandling } from '@/notifications/scheduler';
import { countLaunch, useDeviceLanguageSync, useLocale, useSettings } from '@/settings';
import { useThemeColors, type ThemeColors } from '@/theme';

/**
 * トーストの種類ごとの色。既存の success/error/info はライブラリ既定の
 * SuccessToast/ErrorToast/InfoToast（borderLeftColor のみ）と同じ値をそのまま使う ──
 * アイコンを足す以外の見た目・挙動は変えないため。achievement（実績獲得。新規）だけ、
 * バッジの段位色と同じ金色（AchievementsSection.TIER_COLORS.gold）に合わせる。
 */
const TOAST_COLORS = {
  success: '#69C779',
  error: '#FE6301',
  info: '#87CEFA',
  achievement: '#D4AF37',
} as const;

const TOAST_ICON_SIZE = 22;

/**
 * BaseToast の renderLeadingIcon（左端にアイコンを差し込むためのフック）へ渡す関数を作る。
 * BaseToast 自体は左端に何も余白を持たないので、ここで paddingLeft を足して
 * カラーボーダー・アイコン・本文の間隔を空ける。
 */
function toastLeadingIcon(name: keyof typeof Ionicons.glyphMap, color: string) {
  function ToastLeadingIcon() {
    return (
      <View style={styles.toastIcon}>
        <Ionicons name={name} size={TOAST_ICON_SIZE} color={color} />
      </View>
    );
  }
  return ToastLeadingIcon;
}

/**
 * トーストの種類ごとの見た目（UI-SPEC 未採番。トーストへのアイコン追加）。
 *
 * success/error/info は BaseToast をそのまま再利用し、renderLeadingIcon でアイコンだけ足す
 * （方法A。BaseToast のレイアウト・色・文字サイズは変えない）。
 *
 * saveConfirmation（記録保存の確認カード）と achievement（実績獲得）は BaseToast を使わず、
 * デザイン確定仕様版（3a/3b/3c）に合わせた完全に自前のカードを描く。どちらも
 * RecordFormSheet.handleSave からの一方通行（実績を新規獲得したときは achievement に譲り、
 * それ以外は saveConfirmation を出す）。
 */
const toastConfig: ToastConfig = {
  success: (params: ToastConfigParams<unknown>) => (
    <BaseToast
      {...params}
      style={{ borderLeftColor: TOAST_COLORS.success }}
      renderLeadingIcon={toastLeadingIcon('checkmark-circle', TOAST_COLORS.success)}
    />
  ),
  error: (params: ToastConfigParams<unknown>) => (
    <BaseToast
      {...params}
      style={{ borderLeftColor: TOAST_COLORS.error }}
      renderLeadingIcon={toastLeadingIcon('warning', TOAST_COLORS.error)}
    />
  ),
  info: (params: ToastConfigParams<unknown>) => (
    <BaseToast
      {...params}
      style={{ borderLeftColor: TOAST_COLORS.info }}
      renderLeadingIcon={toastLeadingIcon('information-circle', TOAST_COLORS.info)}
    />
  ),
  // **コンポーネント関数をそのまま渡さない。** react-native-toast-message の ToastUI は
  // config[type] を `ToastComponent({ ...params })` と素の関数呼び出しで実行する（JSX にしない）
  // ので、そのままだと中の useThemeColors 等のフックが ToastUI 自身に属してしまい、
  // トーストの種類が切り替わるたびにフックの数・順序が食い違って落ちる（実機で確認済み）。
  // success/error/info と同じく、JSX 要素を返す関数でラップして初めて別のコンポーネント
  // （別の fiber）として扱われる
  [SAVE_CONFIRMATION_TOAST_TYPE]: (params: ToastConfigParams<SaveConfirmationToastProps>) => (
    <SaveConfirmationToast {...params} />
  ),
  [ACHIEVEMENT_TOAST_TYPE]: (params: ToastConfigParams<AchievementToastProps>) => (
    <AchievementToast {...params} />
  ),
};

/**
 * ナビゲーションの外側（ヘッダとタブバー）の配色。
 *
 * **画面の中身は `useThemeColors` に追従していたが、ヘッダとタブバーは
 * React Navigation の既定テーマ（明色固定）のままだった** ── 端末をダークにすると、
 * 中身だけが黒くなり上下の帯だけが白く残る。ここで同じ配色から作った 1 枚を渡して揃える。
 *
 * 値は `theme.ts` の対応するものをそのまま流す（色の定義を 2 か所に置かない）。
 * `card` にバーの地色（barBackground）を渡すのは、これがヘッダ・タブバーの地色になるため。
 */
function navigationTheme(colors: ThemeColors, dark: boolean): Theme {
  const base = dark ? DarkTheme : DefaultTheme;
  return {
    ...base,
    dark,
    colors: {
      ...base.colors,
      primary: colors.blue,
      background: colors.background,
      card: colors.barBackground,
      text: colors.label,
      border: colors.separator,
    },
  };
}

export default function RootLayout() {
  // 端末の言語変更をストアへ流し込む。**アプリ全体でここだけ**（src/settings/index.ts）。
  // useLocale() より先に呼ぶ必要はないが、表示語の出どころなので並べて置く
  useDeviceLanguageSync();
  // 表示語は locale を引数に取る（src/i18n/index.ts の冒頭）
  const locale = useLocale();

  const colors = useThemeColors();
  const isDark = useColorScheme() === 'dark';
  const [dbReady, setDbReady] = useState(false);
  const [dbError, setDbError] = useState<Error | null>(null);
  const { tutorialSeen, markTutorialSeen } = useSettings();
  // 初回起動時にのみ自動表示。tutorialSeen は kv-store から同期に読めるので、
  // ちらつき（一瞬出てすぐ消える／出ないのに一瞬揺れる）は起きない
  const [onboardingVisible, setOnboardingVisible] = useState(() => !tutorialSeen);

  useEffect(() => {
    initDatabase().then(
      () => setDbReady(true),
      (error: Error) => setDbError(error),
    );
  }, []);

  /**
   * この起動を 1 回として数える（アプリ内レビュー依頼のゲート。docs/DESIGN-REVIEW-PROMPT.md）。
   * **アプリ全体でここだけ**（useDeviceLanguageSync と同じ規約）。
   *
   * DB の準備を待たない ── 数えるのは kv-store（設定 DB）で、記録の DB とは別ファイル。
   * 待つと、初期化に失敗した起動だけが数から漏れることになる。
   */
  useEffect(() => {
    countLaunch();
  }, []);

  // 設定タブ「チュートリアルをもう一度見る」からの要求（achievementToastBus と同じ配線）。
  // 既読（tutorialSeen）を巻き戻さず、一時的に開くだけ
  useEffect(() => {
    registerOnboardingRequestListener(() => setOnboardingVisible(true));
    return () => registerOnboardingRequestListener(null);
  }, []);

  // ローカル通知の表示挙動・タップ時の遷移を登録する。**アプリ全体でここだけ**
  // （useDeviceLanguageSync と同じ規約）。DB を読まないので dbReady を待たない
  useEffect(() => {
    setupNotificationHandling();
  }, []);

  /**
   * 通知の内容を計算し、次の 9:00 へ予約し直す（src/notifications/scheduler.ts）。
   * DB（未売却の記録）を読むので dbReady を待つ。起動直後の 1 回と、以後は
   * バックグラウンドに回るたびに再予約する ── フォアグラウンドに戻ったときの
   * データの変化（記録の追加・値下げ）を、次にアプリを閉じたときの内容へ反映するため。
   */
  useEffect(() => {
    if (!dbReady) return;
    rescheduleNotification();
    refreshBell();

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'background') rescheduleNotification();
      // ベル（全タブ共通）は前面に戻ったときにも引き直す。バックグラウンド中に
      // 日をまたいだ・OS通知をタップして開いた、といったケースでも中身が古いままにならないよう
      if (nextState === 'active') refreshBell();
    });
    return () => subscription.remove();
  }, [dbReady]);

  /**
   * 広告の初期化（同意フローを含む）。**チュートリアルが出ている間は始めない** ──
   * 同意ダイアログはチュートリアルの上に重なって出るので、初回起動がいきなり
   * 「何を聞かれているか分からないダイアログ」から始まってしまう。
   *
   * initializeAds() 側が二重呼び出しを弾くので、設定タブからチュートリアルを開き直して
   * 閉じたときにもう一度ここへ来ても、初期化が走り直すことはない。
   */
  useEffect(() => {
    if (onboardingVisible) return;
    initializeAds();
  }, [onboardingVisible]);

  const closeOnboarding = () => {
    markTutorialSeen();
    setOnboardingVisible(false);
  };

  if (dbError) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text>{dbInitFailedMessage(locale)}</Text>
        <Text style={{ marginTop: 8, color: 'red' }}>{dbError.message}</Text>
      </View>
    );
  }

  if (!dbReady) {
    // マイグレーションは一瞬で終わるため、スプラッシュ表示のまま待つ
    return null;
  }

  return (
    // 月別詳細のスワイプ削除（SPEC §5.4）で react-native-gesture-handler を使うため、
    // アプリ全体を GestureHandlerRootView で包む
    <GestureHandlerRootView style={{ flex: 1 }}>
      {/* 鍵盤の高さ・フォーカス中の欄の位置を配るのはこの 1 つだけ（react-native-keyboard-controller）。
          **アプリ全体を包む必要がある**が、RN の Modal（記録フォーム・各シート）の中にもう 1 つ置く
          必要はない ── ライブラリの Android 側が Modal のウィンドウにも自分で listener を挿す
          （ModalAttachedWatcher）ので、この 1 つでモーダルの中まで届く。
          置き場所が GestureHandlerRootView の直下なのは、Stack の外に常駐している
          Toast・OnboardingOverlay も鍵盤の値を読める側に入れておくため。 */}
      <KeyboardProvider>
        <ThemeProvider value={navigationTheme(colors, isDark)}>
          <Stack>
          {/* 設定はモーダルからタブへ昇格したので（UI-SPEC §6-8）、ルート直下は (tabs) と
                お知らせモーダルだけ */}
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            {/* お知らせ（ベルから開く）。(tabs) の兄弟に置くことで、どのタブのヘッダーからでも
                同じ画面を開ける（各タブが独立した Stack を持つ構成には無い、全タブ共通の入口） */}
            <Stack.Screen name="notifications" options={{ presentation: 'modal' }} />
          </Stack>
        </ThemeProvider>
        {/* コピーの合図は**下端**に出す。上端はヘッダの戻る・「？」があり、押す口を
            数秒ふさいでしまうため。下端の一過性のメッセージは UndoBar（UI-SPEC §8.3）と
            同じ場所・同じ役割になる。
            100pt はこのアプリでいちばん高い下端の家具を越える値 ── 詳細画面の操作列が
            88pt、タブバーがホームインジケータ込みで約 83pt。トーストは Stack の外
            （全画面の上）に 1 つだけ置くので、画面ごとに変えず最大値で揃える */}
        <Toast config={toastConfig} position="bottom" bottomOffset={100} />
        {/* 実績獲得トーストのタップ受け（AchievementDetailModal をモーダルだけで完結させる）。
            Toast 本体と同じ理由で Stack の外に常駐させる（achievementToastBus のコメント参照） */}
        <AchievementToastHost />
        {/* 初回起動チュートリアル。Toast・AchievementToastHost と同じ理由で Stack の外に置く ──
            どのタブが前面でも（設定タブからの再表示も）全画面で覆えるようにするため */}
        <OnboardingOverlay visible={onboardingVisible} onDone={closeOnboarding} />
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  toastIcon: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingLeft: 14,
  },
});
