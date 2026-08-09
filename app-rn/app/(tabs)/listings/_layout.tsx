import { Stack } from 'expo-router';

// 出品中タブの中に Stack を置き、月別詳細（[monthKey]）へプッシュ遷移できるようにする
// （SPEC §3.3 の遷移図: MonthlyRecordList ─(月セクションタップ)→ SaleRecordView）。
// タブ側のヘッダーは (tabs)/_layout.tsx で切ってあるので、ヘッダーはこの Stack が出す。
export default function ListingsLayout() {
  return <Stack />;
}
