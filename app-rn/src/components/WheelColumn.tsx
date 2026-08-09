// ホイールピッカー 1 列ぶん。年月ピッカー（MonthPickerSheet）と日付ピッカー（DateField）で共有する。
//
// @expo/ui の wheel Picker は SwiftUI 専用で Android に載らないため、
// SegmentedControl と同じ方針（将来の Android 対応・SPEC §7-14）で RN プリミティブで組む。
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { useThemeColors } from '@/theme';

type Props = {
  values: number[];
  selectedValue: number;
  format: (value: number) => string;
  onSelect: (value: number) => void;
  accessibilityLabel?: string;
};

export function WheelColumn({
  values,
  selectedValue,
  format,
  onSelect,
  accessibilityLabel,
}: Props) {
  const colors = useThemeColors();

  return (
    <ScrollView
      style={[styles.column, { backgroundColor: colors.secondaryBackground }]}
      contentContainerStyle={styles.columnContent}
      accessibilityLabel={accessibilityLabel}>
      {values.map((value) => {
        const selected = value === selectedValue;
        return (
          <Pressable
            key={value}
            style={[styles.item, selected && { backgroundColor: colors.disabledBackground }]}
            onPress={() => onSelect(value)}
            accessibilityRole="button"
            accessibilityState={{ selected }}>
            <Text
              style={[
                styles.itemLabel,
                { color: selected ? colors.blue : colors.label },
                selected && styles.itemLabelSelected,
              ]}>
              {format(value)}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** 連続した整数の配列（ホイールの選択肢）。from・to は両端を含む */
export function rangeOfNumbers(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, index) => from + index);
}

const styles = StyleSheet.create({
  column: {
    flex: 1,
    borderRadius: 10,
  },
  columnContent: {
    paddingVertical: 4,
  },
  item: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  itemLabel: {
    fontSize: 17,
  },
  itemLabelSelected: {
    fontWeight: '700',
  },
});
