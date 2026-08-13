// SwiftUI の Picker(.segmented) 相当。
// @expo/ui の segmented Picker は SwiftUI 専用で Android に載らないため、
// 将来の Android 対応（SPEC §7-14）を見据えて RN プリミティブで実装する。
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useThemeColors } from '@/theme';

type Props = {
  options: string[];
  /**
   * 選択中の位置。**null = どれも選ばれていない**（並び替えシートで、いま並べ替えに
   * 使っていない項目の行。採用案 22b）。既定の使い方では常に番号が入る。
   */
  selectedIndex: number | null;
  onChange: (index: number) => void;
  /**
   * 見た目の系統。既定（`'default'`）は iOS 標準どおり、選択中を白地で持ち上げる。
   *
   * `'accent'` は選択中を**青地＋白文字**にする（並び替えシート。採用案 22b）──
   * 1 枚のシートに 3〜4 本並ぶので、白地で持ち上げるだけでは
   * 「どの行のどちらが効いているか」が一目で 1 か所に定まらない。
   */
  tone?: 'default' | 'accent';
};

export function SegmentedControl({ options, selectedIndex, onChange, tone = 'default' }: Props) {
  const colors = useThemeColors();
  const accent = tone === 'accent';

  return (
    <View style={[styles.container, { backgroundColor: colors.disabledBackground }]}>
      {options.map((option, index) => {
        const selected = index === selectedIndex;
        // 青地の上だけ白。それ以外は、非アクティブを一段落として「効いている 1 つ」を立てる
        const labelColor = accent
          ? selected
            ? '#FFFFFF'
            : colors.secondaryLabel
          : colors.label;
        return (
          <Pressable
            key={option}
            onPress={() => onChange(index)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            style={[
              styles.segment,
              accent && styles.accentSegment,
              selected && {
                backgroundColor: accent ? colors.blue : colors.secondaryBackground,
              },
            ]}>
            <Text
              numberOfLines={1}
              style={[styles.label, { color: labelColor, fontWeight: selected ? '600' : '400' }]}>
              {option}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderRadius: 9,
    padding: 2,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    borderRadius: 7,
  },
  // 並び替えシートでは**セグメントそのものが唯一のタップ対象**（項目名は押せない）なので、
  // 器の余白と合わせて 44pt を確保する（片手・親指で押す高さ）
  accentSegment: {
    minHeight: 40,
  },
  label: {
    fontSize: 14,
  },
});
