import { Stack } from 'expo-router';
import { useMemo } from 'react';

import { toMonthKey } from '@/db/dates';
import { RecordFilterProvider } from '@/screens/RecordFilterState';

// データタブの中の Stack。グラフ → レコード詳細 / 絞り込みページのプッシュ遷移を持つ（UI-SPEC §2）。
// タブ側のヘッダーは (tabs)/_layout.tsx で切ってあるので、ヘッダーはこの Stack が出す。
//
// **タブごとに Stack を持つのは「開いたタブに戻る」ため。** 記録タブの [id] ルートへ
// 直接 push すると、詳細から戻ったときに記録タブの一覧に着いてしまう（実機で確認）──
// データタブのグラフから開いたのに、戻ると別のタブにいる状態になる。
// 画面の実体（SaleRecordDetailScreen / RecordFilterScreen）は 1 つのままで、
// ルートだけをタブごとに置く。
export const unstable_settings = {
  anchor: 'index',
};

// 絞り込みの state（3 条件・期間）は**この Stack が持つ**（SPEC-V4 §6）。
// グラフと絞り込みページが別ルートなので、両方から同じ値を触れる位置がここになる。
//
// **記録タブとは別の Provider を置くことで、決定 §9-9（両タブで絞り込みを共有しない）を
// 構造として守る。** 同じ Context を使っていても、2 つの Provider は React の木の上で
// 兄弟なので値は混ざらない。タブ全体（(tabs)/_layout.tsx）へ上げると 1 つになってしまう。
export default function DataLayout() {
  /** 「今日」は Stack のマウント時に 1 回だけ決める（初期表示は今月。§5-14） */
  const currentMonthKey = useMemo(() => toMonthKey(new Date()), []);

  return (
    <RecordFilterProvider scope="data" currentMonthKey={currentMonthKey}>
      <Stack />
    </RecordFilterProvider>
  );
}
