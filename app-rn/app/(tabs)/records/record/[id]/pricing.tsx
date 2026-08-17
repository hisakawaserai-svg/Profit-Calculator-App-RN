import { PricingScreen } from '@/screens/PricingScreen';

// 価格と利益の分析「いくらで売る？」（SPEC-V9 §9）。**記録詳細の子**。
//
// `record/[id].tsx` を `record/[id]/index.tsx` へ移してこの 1 本を隣に置いた ──
// URL（`/records/record/<id>`）は変わらず、この画面が
// `/records/record/<id>/pricing` として詳細の下に並ぶ。入れ子にしたのは
// 「1 件の記録の中の 1 面」だからで、`/records/pricing/<id>` のような
// 兄弟のルートにすると、親子関係が URL から読めなくなる。
//
// 記録詳細の帯グラフの結論行（RecordBreakdownBar。O3 案）から push で入る。
// 記録タブの Stack の anchor が index なので、直接入っても戻る導線は消えない。
export default function PricingRoute() {
  return <PricingScreen />;
}
