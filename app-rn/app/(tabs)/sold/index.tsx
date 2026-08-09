import { MonthlyRecordListScreen } from '@/screens/MonthlyRecordListScreen';

// SPEC §3.1 タブ 3「実績」= MonthlyRecordList(isSoldMode: true)
export default function SoldScreen() {
  return <MonthlyRecordListScreen isSoldMode monthDetailPathname="/sold/[monthKey]" />;
}
