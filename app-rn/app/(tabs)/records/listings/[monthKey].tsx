import { SaleRecordScreen } from '@/screens/SaleRecordScreen';

// 記録タブ（出品中）の月別詳細（SPEC §3.2 SaleRecordView）。monthKey は "YYYY-MM"
export default function ListingsMonthScreen() {
  return <SaleRecordScreen isSoldMode={false} recordDetailPathname="/records/record/[id]" />;
}
