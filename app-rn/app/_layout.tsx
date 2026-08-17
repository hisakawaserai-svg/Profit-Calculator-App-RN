import { Ionicons } from '@expo/vector-icons';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, type Theme } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, useColorScheme, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import Toast, { BaseToast, type ToastConfig, type ToastConfigParams } from 'react-native-toast-message';

import { AchievementToastHost } from '@/components/AchievementToastHost';
import { ACHIEVEMENT_TOAST_TYPE, type AchievementToastProps } from '@/components/achievementToastBus';
import { initDatabase } from '@/db/client';
import { DB_INIT_FAILED_MESSAGE } from '@/logic/labels';
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
 * （方法A。BaseToast のレイアウト・色・文字サイズは変えない）。achievement は記録保存で
 * 新規に実績を獲得したときのトースト（RecordFormSheet → achievementToastBus →
 * AchievementToastHost）で、タップすると該当の実績を AchievementDetailModal で開ける
 * （params.onPress が呼び出し側の Toast.show({ onPress }) をそのまま運んでくる）。
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
  [ACHIEVEMENT_TOAST_TYPE]: (params: ToastConfigParams<AchievementToastProps>) => {
    // 新規獲得が 1 件のときだけ AchievementToastHost が実績固有のアイコン・色を props に積む。
    // 複数件同時獲得（種類が混在）や props 未指定時は既定の金色トロフィーにフォールバックする
    const icon = params.props?.icon;
    const color = icon?.color ?? TOAST_COLORS.achievement;
    return (
      <BaseToast
        {...params}
        style={{ borderLeftColor: color }}
        renderLeadingIcon={toastLeadingIcon(icon?.name ?? 'trophy', color)}
      />
    );
  },
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
  const colors = useThemeColors();
  const isDark = useColorScheme() === 'dark';
  const [dbReady, setDbReady] = useState(false);
  const [dbError, setDbError] = useState<Error | null>(null);

  useEffect(() => {
    initDatabase().then(
      () => setDbReady(true),
      (error: Error) => setDbError(error),
    );
  }, []);

  if (dbError) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text>{DB_INIT_FAILED_MESSAGE}</Text>
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
      <ThemeProvider value={navigationTheme(colors, isDark)}>
        <Stack>
        {/* 設定はモーダルからタブへ昇格したので（UI-SPEC §6-8）、ルート直下は (tabs) だけ */}
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
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
