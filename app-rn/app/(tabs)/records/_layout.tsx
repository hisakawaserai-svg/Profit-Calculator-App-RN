import { Stack } from 'expo-router';

// 記録タブの中の Stack。一覧 → 月別詳細 → レコード詳細のプッシュ遷移を持つ（UI-SPEC §2）。
// タブ側のヘッダーは (tabs)/_layout.tsx で切ってあるので、ヘッダーはこの Stack が出す。
export default function RecordsLayout() {
  return <Stack />;
}
