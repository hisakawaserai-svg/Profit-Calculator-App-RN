// タグの追加・編集のルート（SPEC-V4 §2.3）。プリセットの `presets/edit` と同じ形で、
// id が無ければ追加、あれば編集。
//
// 一覧が `tags/index` を占めているので、編集はその隣に置く（プリセットが
// `presets/edit?type=…&id=…` にしたのと同じ理由）。type に当たるパラメータは無い ──
// タグは 1 種類しかない（§1.1）。
import { Redirect, useLocalSearchParams } from 'expo-router';

import { useTag } from '@/db/useTags';
import { TagFormScreen } from '@/screens/TagFormScreen';

export default function TagFormRoute() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const tag = useTag(id);

  // 編集で開いたのに行が無い（別経路で消えた直後など）ときは一覧へ引き返す。
  // 追加として開き直すと、消したはずのものが復活したように見える
  if (id != null && tag == null) return <Redirect href="/settings/tags" />;

  return <TagFormScreen tag={tag} />;
}
