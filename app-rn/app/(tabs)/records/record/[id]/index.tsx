import { SaleRecordDetailScreen } from '@/screens/SaleRecordDetailScreen';

// レコード詳細（SPEC §3.2 SaleRecordDetailView）。id はレコードの UUID。
// 出品中・実績で Stack が分かれていた頃は同じ内容の 2 ルートがあったが、
// 記録タブの Stack 1 本になったのでこの 1 ルートが両方から使われる（UI-SPEC §3.1）。
export default function RecordDetailScreen() {
  return <SaleRecordDetailScreen />;
}
