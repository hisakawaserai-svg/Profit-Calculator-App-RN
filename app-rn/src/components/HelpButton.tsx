// 各画面のヘッダに置く「？」（UI-SPEC §1.1-1 / §1.2-1 / §1.4-1 / §1.5-1）。
//
// 押すと `HelpSheet` を出す。開閉の state は画面側が持つ ── ヘッダのボタンは
// ナビゲータの `options` の中で描かれるので、この部品の中に state を置いても
// シートを画面の木に生やせない。
import { Ionicons } from '@expo/vector-icons';
import { Pressable } from 'react-native';

import { helpButtonLabel } from '@/logic/helpContent';
import { useLocale } from '@/settings';
import { useThemeColors } from '@/theme';

/** ヘッダの他のアイコン（⌕ / ⇅）と同じ大きさ。並べたときに 1 つだけ大きく見えないため */
const ICON_SIZE = 22;

export function HelpButton({ onPress }: { onPress: () => void }) {
  // 表示語は locale を引数に取る（src/i18n/index.ts の冒頭）
  const locale = useLocale();

  const colors = useThemeColors();

  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={helpButtonLabel(locale)}
      style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
      <Ionicons name="help-circle-outline" size={ICON_SIZE} color={colors.blue} />
    </Pressable>
  );
}
