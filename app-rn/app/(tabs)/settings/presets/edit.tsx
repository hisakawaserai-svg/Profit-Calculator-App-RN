// プリセットの追加・編集のルート（SPEC-V3 §3.3 / 設計案 25b）。
//
// 一覧が `presets/[type]` を占めているので、編集は `presets/edit?type=…&id=…` に置いた
// （`[type]/edit` にすると一覧のパスが `[type]/index` に変わり、§3.2 が名指ししている
// ファイル名から外れる）。id が無ければ追加、あれば編集。
import { Redirect, useLocalSearchParams } from 'expo-router';

import { usePreset } from '@/db/usePresets';
import { toPresetType } from '@/logic/preset';
import { PresetFormScreen } from '@/screens/PresetFormScreen';

export default function PresetFormRoute() {
  const { type, id } = useLocalSearchParams<{ type: string; id?: string }>();
  const presetType = toPresetType(type);
  const preset = usePreset(id);

  if (presetType == null) return <Redirect href="/settings" />;
  // 編集で開いたのに行が無い（別経路で消えた直後など）ときも引き返す。
  // 追加として開き直すと、消したはずのものが復活したように見える
  if (id != null && preset == null) return <Redirect href={`/settings/presets/${presetType}`} />;

  return <PresetFormScreen type={presetType} preset={preset} />;
}
