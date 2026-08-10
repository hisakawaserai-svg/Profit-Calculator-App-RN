import { RecordListScreen } from '@/screens/RecordListScreen';

// 記録タブ本体（UI-SPEC §1.2 / 採用案 8a）。
// 出品中・実績・月別詳細の 3 画面を 1 画面に統合したので、ここは 1 コンポーネントを出すだけ。
export default function RecordsScreen() {
  return <RecordListScreen />;
}
