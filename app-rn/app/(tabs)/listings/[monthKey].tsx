import { SaleRecordScreen } from '@/screens/SaleRecordScreen';

// 出品中タブの月別詳細（SPEC §3.2 SaleRecordView）。monthKey は "YYYY-MM"
export default function ListingsMonthScreen() {
  return <SaleRecordScreen isSoldMode={false} recordDetailPathname="/listings/record/[id]" />;
}
