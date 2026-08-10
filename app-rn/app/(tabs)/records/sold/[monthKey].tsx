import { SaleRecordScreen } from '@/screens/SaleRecordScreen';

// 記録タブ（実績）の月別詳細（SPEC §3.2 SaleRecordView）。monthKey は "YYYY-MM"
export default function SoldMonthScreen() {
  return <SaleRecordScreen isSoldMode recordDetailPathname="/records/record/[id]" />;
}
