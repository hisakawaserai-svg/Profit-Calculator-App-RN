import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import Toast from 'react-native-toast-message';

import { initDatabase } from '@/db/client';

export default function RootLayout() {
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
        <Text>データベースの初期化に失敗しました</Text>
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
      <Stack>
        {/* 設定はモーダルからタブへ昇格したので（UI-SPEC §6-8）、ルート直下は (tabs) だけ */}
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
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
