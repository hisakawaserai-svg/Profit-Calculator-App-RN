import { SaleRecordDetailScreen } from '@/screens/SaleRecordDetailScreen';

// データタブから開くレコード詳細。**画面は記録タブと同じ SaleRecordDetailScreen**（UI-SPEC §6-9 の
// 「1 系統に統一」は画面の実体の話で、ここで増えるのはルートの入口だけ）。
//
// タブごとに入口を置くのは、詳細から戻ったときに**開いたタブへ戻す**ため。
// 記録タブのルートへ直接 push すると、戻り先が記録タブの一覧になってしまう（_layout.tsx 参照）。
export default function DataRecordDetailScreen() {
  return <SaleRecordDetailScreen />;
}
