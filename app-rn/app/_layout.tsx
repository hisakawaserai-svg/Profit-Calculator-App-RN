import { DarkTheme, DefaultTheme, Stack, ThemeProvider, type Theme } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, useColorScheme, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import Toast from 'react-native-toast-message';

import { initDatabase } from '@/db/client';
import { DB_INIT_FAILED_MESSAGE } from '@/logic/labels';
import { useThemeColors, type ThemeColors } from '@/theme';

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
      <Toast position="bottom" bottomOffset={100} />
    </GestureHandlerRootView>
  );
}
