// SwiftUI の Stepper 相当。CalcView の「手数料: N%」（SPEC §3.2、0〜50・初期値 10）で使う。
//
// 記録フォームの伝票カード（UI-SPEC §1.3-9）では行の形が違う
// （左が行名・右が手数料「額」で、− ＋ はその間に入る）ため、
// ボタンだけを StepperButtons として切り出して共用する。
import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useThemeColors } from '@/theme';

type ButtonsProps = {
  value: number;
  minimumValue: number;
  maximumValue: number;
  step?: number;
  onChangeValue: (value: number) => void;
  /** 「〜を増やす / 減らす」の主語。行名（「手数料 10%」）を渡す */
  accessibilityLabel: string;
};

type Props = Omit<ButtonsProps, 'accessibilityLabel'> & {
  label: string;
  /**
   * 率の値（ラベル）と ± の間に置くもの（SPEC-V3 §4.4 のタグボタン）。
   * ± の右や外側ではなくここなのは、行の右端が「率を 1 目盛り動かす」操作で閉じているため ──
   * 選ぶ操作を挟むと、± を続けて押すときに指の位置が毎回変わる。
   */
  accessory?: ReactNode;
};

export function Stepper({
  label,
  value,
  minimumValue,
  maximumValue,
  step = 1,
  onChangeValue,
  accessory,
}: Props) {
  const colors = useThemeColors();

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: colors.label }]}>{label}</Text>
      {accessory}
      <StepperButtons
        value={value}
        minimumValue={minimumValue}
        maximumValue={maximumValue}
        step={step}
        onChangeValue={onChangeValue}
        accessibilityLabel={label}
      />
    </View>
  );
}

/** − ＋ の 2 連ボタンだけ。行の組み立ては呼び出し側が決める */
export function StepperButtons({
  value,
  minimumValue,
  maximumValue,
  step = 1,
  onChangeValue,
  accessibilityLabel,
}: ButtonsProps) {
  const colors = useThemeColors();
  const canDecrement = value > minimumValue;
  const canIncrement = value < maximumValue;

  const clampedChange = (delta: number) => {
    const next = Math.min(maximumValue, Math.max(minimumValue, value + delta));
    if (next !== value) onChangeValue(next);
  };

  return (
    <View style={[styles.buttons, { backgroundColor: colors.disabledBackground }]}>
      <Pressable
        onPress={() => clampedChange(-step)}
        disabled={!canDecrement}
        accessibilityLabel={`${accessibilityLabel}を減らす`}
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
        accessibilityLabel={`${accessibilityLabel}を増やす`}
        style={({ pressed }) => [
          styles.button,
          { opacity: !canIncrement ? 0.3 : pressed ? 0.5 : 1 },
        ]}>
        <Ionicons name="add" size={20} color={colors.label} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  label: {
    // タグボタン（accessory）が入っても ± が右端に残るよう、余りはラベルが吸う
    flex: 1,
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
