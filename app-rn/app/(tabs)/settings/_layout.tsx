import { Stack } from 'expo-router';

// 設定タブの中の Stack。設定 → 使いかた のプッシュ遷移を持つ（UI-SPEC §2 / §5-9）。
// タブ側のヘッダーは (tabs)/_layout.tsx で切ってあるので、ヘッダーはこの Stack が出す。
//
// **書き出し（CSV）だけはモーダル**（SPEC-V3 §5.7）── 押した後にすることが 1 つ（書き出す）で、
// 途中で他の設定へ寄り道する経路がない。閉じる口も「キャンセル」1 つに絞れる。
// presentation は Stack の側で持たせる（画面の中で切り替えられる指定ではない）。
export default function SettingsLayout() {
  return (
    <Stack>
      <Stack.Screen name="export" options={{ presentation: 'modal' }} />
    </Stack>
  );
}
