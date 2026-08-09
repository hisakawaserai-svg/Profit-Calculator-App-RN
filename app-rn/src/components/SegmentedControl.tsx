// SwiftUI の Picker(.segmented) 相当。
// @expo/ui の segmented Picker は SwiftUI 専用で Android に載らないため、
// 将来の Android 対応（SPEC §7-14）を見据えて RN プリミティブで実装する。
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useThemeColors } from '@/theme';

type Props = {
  options: string[];
  selectedIndex: number;
  onChange: (index: number) => void;
};

export function SegmentedControl({ options, selectedIndex, onChange }: Props) {
  const colors = useThemeColors();

  return (
    <View style={[styles.container, { backgroundColor: colors.disabledBackground }]}>
      {options.map((option, index) => {
        const selected = index === selectedIndex;
        return (
          <Pressable
            key={option}
            onPress={() => onChange(index)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            style={[
              styles.segment,
              selected && { backgroundColor: colors.secondaryBackground },
            ]}>
            <Text
              style={[
                styles.label,
                { color: colors.label, fontWeight: selected ? '600' : '400' },
              ]}>
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
  label: {
    fontSize: 14,
  },
});
