// プリセット一覧のルート（SPEC-V3 §3.2）。3 種を 1 画面で賄うので、
// ここは `type` を検証して画面へ渡すだけ。画面の中身は src/screens/PresetListScreen.tsx。
import { Redirect, useLocalSearchParams } from 'expo-router';

import { toPresetType } from '@/logic/preset';
import { PresetListScreen } from '@/screens/PresetListScreen';

export default function PresetListRoute() {
  const { type } = useLocalSearchParams<{ type: string }>();
  const presetType = toPresetType(type);

  // URL は手で叩けるので、知らない種類なら設定タブへ引き返す（空の一覧を出さない）
  if (presetType == null) return <Redirect href="/settings" />;

  return <PresetListScreen type={presetType} />;
}
