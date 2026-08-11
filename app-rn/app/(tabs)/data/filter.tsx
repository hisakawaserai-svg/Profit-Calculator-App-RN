import { RecordFilterScreen } from '@/screens/RecordFilterScreen';

// 絞り込みページ（SPEC-V4 §4.2 / §6）の**データタブ側のルート**。
// 画面の実体は記録タブと同じ 1 つ（RecordFilterScreen）で、ルートだけをタブごとに置く ──
// レコード詳細を両タブに置いたのと同じ形（UI-SPEC §6-9「入口だけを増やして、
// 開いたタブの Stack に積む」）。記録タブのルートへ push すると、戻ったときに
// グラフではなく記録の一覧に着いてしまう。
//
// 記録タブとの違いは、この Stack が持つ state（データタブ用の RecordFilterProvider）から
// 画面が読む ── 状態は売れた記録に固定、件数はデータタブの集合で数える（§6）。
export default function DataFilterRoute() {
  return <RecordFilterScreen />;
}
