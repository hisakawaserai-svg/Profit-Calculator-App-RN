import { Stack } from 'expo-router';

import { HELP_SCREEN_TITLE } from '@/logic/helpContent';
import { HelpScreen } from '@/screens/HelpScreen';

// 使いかた（UI-SPEC §2）。ヘルプタブを廃止し、設定タブ配下への push に変えた（§5-9）。
// **push で開くのはここだけ。** 他の画面の「？」はシート（HelpSheet）で出す ──
// 記録タブ・データタブは別スタックなので、タブをまたぐ push を書かずに済ませるため。
//
// 全ページを素の並びで出す（先頭に持ち上げる項目も、下端の「最初から読む」も無い。
// ここが既に「最初から」なので）。
export default function Screen() {
  return (
    <>
      <Stack.Screen options={{ title: HELP_SCREEN_TITLE }} />
      <HelpScreen />
    </>
  );
}
