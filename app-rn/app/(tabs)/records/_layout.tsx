import { Stack } from 'expo-router';

// 記録タブの中の Stack。一覧 → レコード詳細のプッシュ遷移を持つ（UI-SPEC §2）。
// タブ側のヘッダーは (tabs)/_layout.tsx で切ってあるので、ヘッダーはこの Stack が出す。
//
// anchor（旧 initialRouteName）は「この Stack の起点は一覧である」ことの宣言。
// データタブの行タップは同じ [id] ルートへ push する（§2 / §6-9 の「1 系統に統一」）が、
// これがないと記録タブの Stack が詳細 1 枚だけに置き換わり、戻る導線が消える
// （実機で確認: 戻るボタンもスワイプバックも出ない）。anchor があると一覧の上に積まれる。
export const unstable_settings = {
  anchor: 'index',
};

export default function RecordsLayout() {
  return <Stack />;
}
