import { Stack } from 'expo-router';

import { helpScreenTitle } from '@/logic/helpContent';
import { HelpScreen } from '@/screens/HelpScreen';
import { useLocale } from '@/settings';

// 使いかた（UI-SPEC §2）。ヘルプタブを廃止し、設定タブ配下への push に変えた（§5-9）。
// **push で開くのはここだけ。** 他の画面の「？」はシート（HelpSheet）で出す ──
// 記録タブ・データタブは別スタックなので、タブをまたぐ push を書かずに済ませるため。
//
// 全ページを素の並びで出す（先頭に持ち上げる項目も、下端の「最初から読む」も無い。
// ここが既に「最初から」なので）。
export default function Screen() {
  // 表示語は locale を引数に取る（src/i18n/index.ts の冒頭）
  const locale = useLocale();

  return (
    <>
      <Stack.Screen options={{ title: helpScreenTitle(locale) }} />
      <HelpScreen />
    </>
  );
}
