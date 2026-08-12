import { ExportSheet } from '@/screens/ExportSheet';

// 書き出しシート（SPEC-V3 §5.6 / §5.7）。設定タブ「データ」群の「書き出し（CSV）」から開く。
// モーダルで出す指定は設定タブの _layout.tsx（この画面だけヘッダ左が「キャンセル」になるため）。
export default function ExportRoute() {
  return <ExportSheet />;
}
