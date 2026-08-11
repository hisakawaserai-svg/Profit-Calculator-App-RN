// タグ一覧のルート（SPEC-V4 §2.2）。設定タブ「記録を分類する」のカードからの push。
//
// プリセット（`presets/[type]`）と違ってパラメータが無いのは、タグが 1 種類しかないため
// （§1.1 で presets に同居させなかった帰結で、type に当たるものが無い）。
// 追加・編集は画面ではなくシート（§2.3）なので、ここに置くルートも 1 本だけ。
import { TagListScreen } from '@/screens/TagListScreen';

export default function TagListRoute() {
  return <TagListScreen />;
}
