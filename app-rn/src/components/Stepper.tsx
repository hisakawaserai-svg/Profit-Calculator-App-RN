// SwiftUI の Stepper 相当。CalcView の「手数料: N%」（SPEC §3.2、0〜50・初期値 10）で使う。
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useThemeColors } from '@/theme';

type Props = {
  label: string;
  value: number;
  minimumValue: number;
  maximumValue: number;
  step?: number;
  onChangeValue: (value: number) => void;
};

export function Stepper({
  label,
  value,
  minimumValue,
  maximumValue,
  step = 1,
  onChangeValue,
}: Props) {
  const colors = useThemeColors();
  const canDecrement = value > minimumValue;
  const canIncrement = value < maximumValue;

  const clampedChange = (delta: number) => {
    const next = Math.min(maximumValue, Math.max(minimumValue, value + delta));
    if (next !== value) onChangeValue(next);
  };

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: colors.label }]}>{label}</Text>
      <View style={[styles.buttons, { backgroundColor: colors.disabledBackground }]}>
        <Pressable
          onPress={() => clampedChange(-step)}
          disabled={!canDecrement}
          accessibilityLabel={`${label}を減らす`}
          style={({ pressed }) => [
            styles.button,
            { opacity: !canDecrement ? 0.3 : pressed ? 0.5 : 1 },
          ]}>
          <Ionicons name="remove" size={20} color={colors.label} />
        </Pressable>
        <View style={[styles.divider, { backgroundColor: colors.separator }]} />
        <Pressable
          onPress={() => clampedChange(step)}
          disabled={!canIncrement}
          accessibilityLabel={`${label}を増やす`}
          style={({ pressed }) => [
            styles.button,
            { opacity: !canIncrement ? 0.3 : pressed ? 0.5 : 1 },
          ]}>
          <Ionicons name="add" size={20} color={colors.label} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {
    fontSize: 16,
  },
  buttons: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    overflow: 'hidden',
  },
  button: {
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
  },
});
