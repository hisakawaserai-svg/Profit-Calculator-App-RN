import { SaleRecordScreen } from '@/screens/SaleRecordScreen';

// 実績タブの月別詳細（SPEC §3.2 SaleRecordView）。monthKey は "YYYY-MM"
export default function SoldMonthScreen() {
  return <SaleRecordScreen isSoldMode recordDetailPathname="/sold/record/[id]" />;
}
