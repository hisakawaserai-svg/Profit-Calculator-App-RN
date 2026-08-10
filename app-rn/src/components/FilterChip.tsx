// 合計行の右端に置く小さなチップ（UI-SPEC §1.2「チップ」）。
//
// - 状態チップ（tone = 'accent'）: 青地・青文字。「売れた記録 ▾」⇄「出品中 ▾」をトグル
// - 種別フィルタチップ（tone = 'neutral'）: グレー地・黒文字。「すべて → 不用品 → 仕入品」を巡回
//
// どちらも「押すと次の値に変わる」だけの部品なので、選択肢は持たず onPress を受け取る。
// ▾ は「押すと変わる」ことを示す記号として付ける（設計案 8a のとおり）。
import { Pressable, StyleSheet, Text } from 'react-native';

import { useThemeColors } from '@/theme';

export type ChipTone = 'accent' | 'neutral';

type Props = {
  label: string;
  tone?: ChipTone;
  onPress: () => void;
  accessibilityLabel?: string;
};

export function FilterChip({ label, tone = 'neutral', onPress, accessibilityLabel }: Props) {
  const colors = useThemeColors();
  const isAccent = tone === 'accent';

  return (
    <Pressable
      style={[
        styles.chip,
        {
          // 青地 rgba(0,122,255,.12) / グレー地は入力欄と同じ地色を流用（UI-SPEC §1.2）
          backgroundColor: isAccent ? 'rgba(0, 122, 255, 0.12)' : colors.disabledBackground,
        },
      ]}
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}>
      <Text style={[styles.label, { color: isAccent ? colors.blue : colors.label }]}>
        {label} ▾
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
  },
});
