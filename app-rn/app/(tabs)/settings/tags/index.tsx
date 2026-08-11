// タグ一覧のルート（SPEC-V4 §2.2）。設定タブ「記録を分類する」のカードからの push。
//
// プリセット（`presets/[type]`）と違ってパラメータが無いのは、タグが 1 種類しかないため
// （§1.1 で presets に同居させなかった帰結で、type に当たるものが無い）。
// 追加・編集は隣の `tags/edit` への push（§2.3。プリセットと同じ形）。
import { TagListScreen } from '@/screens/TagListScreen';

export default function TagListRoute() {
  return <TagListScreen />;
}
