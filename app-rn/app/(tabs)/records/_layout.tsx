import { Stack } from 'expo-router';

// 記録タブの中の Stack。一覧 → レコード詳細のプッシュ遷移を持つ（UI-SPEC §2）。
// タブ側のヘッダーは (tabs)/_layout.tsx で切ってあるので、ヘッダーはこの Stack が出す。
//
// anchor（旧 initialRouteName）は「この Stack の起点は一覧である」ことの宣言。
// [id] ルートへ外から直接入ったとき（ディープリンク・リロード）に一覧を下に積み、
// 戻る導線が消えないようにする。
//
// データタブからの遷移は**データタブ自身の Stack**（app/(tabs)/data/record/[id].tsx）を使う。
// ここへ push すると、詳細から戻ったときに開いたタブ（データ）ではなく記録の一覧に着いてしまう。
export const unstable_settings = {
  anchor: 'index',
};

export default function RecordsLayout() {
  return <Stack />;
}
