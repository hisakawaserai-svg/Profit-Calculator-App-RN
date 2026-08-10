// 「今日・昨日・一昨日」のチップ（UI-SPEC §8.10.1）。
//
// **多数派の日付は行の中で 1 タップで決める。** 大半の日付は今日・昨日に偏るのに、
// 旧ホイールはその多数派にまで回す操作を強いていた（§8.10）。押した時点で値が決まり、
// 確定操作は挟まない。
//
// 日付行（DateField / 売れた日の行）とカレンダーシートの上部で同じ部品を使う ──
// **同じ並び・同じ淡色規則**（§8.10.2）。行で押せなかったチップがシートでは押せる、
// のような食い違いが起きないようにするため。
//
// 範囲外のチップは**消さずに淡色で残す**（§8.10 の方針 3）。落とすと並びが日によって変わり、
// 「昨日」を押したつもりで「一昨日」を押す事故が起きる。
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import type { DayChip } from '@/logic/calendar';
import { useThemeColors } from '@/theme';

export function DateChips({
  chips,
  onSelect,
  style,
}: {
  chips: DayChip[];
  onSelect: (value: Date) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const colors = useThemeColors();

  return (
    <View style={[styles.row, style]}>
      {chips.map((chip) => (
        <Pressable
          key={chip.offset}
          onPress={() => onSelect(chip.date)}
          disabled={!chip.selectable}
          accessibilityRole="button"
          accessibilityState={{ disabled: !chip.selectable, selected: chip.isSelected }}
          style={({ pressed }) => [
            styles.chip,
            {
              backgroundColor: chip.isSelected ? colors.blue : colors.disabledBackground,
              opacity: pressed && chip.selectable ? 0.5 : 1,
            },
          ]}>
          <Text
            style={[
              styles.label,
              {
                color: chip.isSelected
                  ? '#FFFFFF'
                  : chip.selectable
                    ? colors.label
                    : colors.mutedLabel,
              },
            ]}>
            {chip.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 6,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
  },
});
