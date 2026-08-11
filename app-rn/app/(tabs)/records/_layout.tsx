import { Stack } from 'expo-router';
import { useMemo } from 'react';

import { toMonthKey } from '@/db/dates';
import { RecordFilterProvider } from '@/screens/RecordFilterState';

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

// 絞り込みの state（3 条件・状態・期間）は**この Stack が持つ**（RecordFilterState）。
// 一覧と絞り込みページが別ルートになったので、両方から同じ値を触れる位置がここになる。
// データタブも自分の Stack に**もう 1 つ**同じ Provider を置く（SPEC-V4 §6）── 2 つは
// React の木の上で兄弟なので値は混ざらない。タブ全体（(tabs)/_layout.tsx）へ上げると
// 1 つになり、両タブで共有されてしまう（決定 §9-9）。
export default function RecordsLayout() {
  /** 「今日」は Stack のマウント時に 1 回だけ決める（初期表示は今月。§5-14） */
  const currentMonthKey = useMemo(() => toMonthKey(new Date()), []);

  return (
    <RecordFilterProvider scope="records" currentMonthKey={currentMonthKey}>
      <Stack />
    </RecordFilterProvider>
  );
}
