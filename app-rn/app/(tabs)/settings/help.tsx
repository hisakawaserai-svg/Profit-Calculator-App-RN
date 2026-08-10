import { Stack } from 'expo-router';

import { HelpScreen } from '@/screens/HelpScreen';

// 使いかた（UI-SPEC §2）。ヘルプタブを廃止し、設定タブ配下への push に変えた（§5-9）。
export default function Screen() {
  return (
    <>
      <Stack.Screen options={{ title: '使いかたガイド' }} />
      <HelpScreen />
    </>
  );
}
