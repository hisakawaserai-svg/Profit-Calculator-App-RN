import { Stack, useLocalSearchParams } from 'expo-router';
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
  /**
   * 通知一覧の「月次振り返り」タップで `/data?month=YYYY-MM` から開いたときは、
   * その月を初期表示にする。無ければ今月（§5-14 のまま）。
   *
   * **初回マウントの初期値は currentMonthKey（useMemo、下記コメント）、
   * 開いたまま再訪したときの切り替えは jumpToMonthKey（RecordFilterProvider 側で処理）
   * の 2 段構え。** データタブの Stack はタブを切り替えても閉じずに保持されるので、
   * 一度開いたあとに通知から別の月を指定して再訪しても、この _layout.tsx 自体は
   * 再マウントされず currentMonthKey の useMemo は再評価されない（実機で確認: 月が変わらない
   * 不具合になっていた）。monthParam をそのまま jumpToMonthKey として渡し、
   * 「変わったときだけ period に反映する」判断は Provider 側に任せる。
   */
  const { month: monthParam } = useLocalSearchParams<{ month?: string }>();
  // monthParam をわざと依存に入れない（Stack の初回マウント時に 1 回だけ決める値）。
  // 依存に入れると、タブを開いたままパラメータなしで再訪したときに今月へ巻き戻ってしまう
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const currentMonthKey = useMemo(() => monthParam ?? toMonthKey(new Date()), []);

  return (
    <RecordFilterProvider scope="data" currentMonthKey={currentMonthKey} jumpToMonthKey={monthParam}>
      <Stack />
    </RecordFilterProvider>
  );
}
