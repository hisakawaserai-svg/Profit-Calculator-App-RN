import { RecordFilterScreen } from '@/screens/RecordFilterScreen';

// 絞り込みページ（SPEC-V4 §4.2 / 採用案 33c）。
// 下から出るシートをやめて、記録タブの Stack に積む 1 枚のページにした ──
// シートでは販売サイトだけが 2 枚目に分かれ、3 条件のうち 1 つだけ操作の深さが違っていた。
export default function RecordFilterRoute() {
  return <RecordFilterScreen />;
}
