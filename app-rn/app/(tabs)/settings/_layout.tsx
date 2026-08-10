import { Stack } from 'expo-router';

// 設定タブの中の Stack。設定 → 使いかた のプッシュ遷移を持つ（UI-SPEC §2 / §5-9）。
// タブ側のヘッダーは (tabs)/_layout.tsx で切ってあるので、ヘッダーはこの Stack が出す。
export default function SettingsLayout() {
  return <Stack />;
}
