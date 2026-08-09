import { MonthlyRecordListScreen } from '@/screens/MonthlyRecordListScreen';

// SPEC §3.1 タブ 2「出品中」= MonthlyRecordList(isSoldMode: false)
export default function ListingsScreen() {
  return (
    <MonthlyRecordListScreen isSoldMode={false} monthDetailPathname="/listings/[monthKey]" />
  );
}
