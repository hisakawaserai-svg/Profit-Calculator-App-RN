import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

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
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>
  );
}
