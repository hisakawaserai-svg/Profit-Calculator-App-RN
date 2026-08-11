import { Stack } from 'expo-router';

// データタブの中の Stack。グラフ → レコード詳細のプッシュ遷移を持つ（UI-SPEC §2）。
// タブ側のヘッダーは (tabs)/_layout.tsx で切ってあるので、ヘッダーはこの Stack が出す。
//
// **タブごとに Stack を持つのは「開いたタブに戻る」ため。** 記録タブの [id] ルートへ
// 直接 push すると、詳細から戻ったときに記録タブの一覧に着いてしまう（実機で確認）──
// データタブのグラフから開いたのに、戻ると別のタブにいる状態になる。
// 画面の実体（SaleRecordDetailScreen）は 1 つのままで、ルートだけをタブごとに置く。
export const unstable_settings = {
  anchor: 'index',
};

export default function DataLayout() {
  return <Stack />;
}
