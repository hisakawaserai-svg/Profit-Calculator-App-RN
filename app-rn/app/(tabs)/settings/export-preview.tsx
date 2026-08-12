import { ExportPreviewScreen } from '@/screens/ExportPreviewScreen';

// 全画面プレビューのルート（SPEC-V3 §5.9 / 案 `40c`）。書き出しシートの表を押すと push される。
//
// 書き出しシート（`export`）の隣に置く（`export/preview` にしない）── あちらがモーダルなので、
// 配下にネストすると「モーダルの中の push」になり、戻り先の見え方が端末で割れる。
// 条件はクエリで受け取り、画面が自分で DB を引く（`logic/exportPeriod.ts` の理由を参照）。
export default function ExportPreviewRoute() {
  return <ExportPreviewScreen />;
}
