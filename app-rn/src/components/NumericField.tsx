// CalcView.swift の LabeledField（iPhone 分岐）の移植。
// SPEC §3.2「各数値欄の右に電卓ボタン → MiniCalculatorView を popover 表示」。
// 入力のフィルタは src/logic/input.ts（SPEC §5.1 / 決定 §7-9）に委譲する。
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { MiniCalculator } from '@/components/MiniCalculator';
import { sanitizeNumericInput } from '@/logic/input';
import { useThemeColors } from '@/theme';

type Props = {
  label: string;
  value: string;
  onChangeValue: (value: string) => void;
  placeholder?: string;
  /** Swift 版の .disabled(selectedTab == 1) 相当。電卓ボタンも同時に無効化する */
  disabled?: boolean;
  /** 数値欄のみ電卓ボタンを出す（Swift 版の isNumeric） */
  showCalculator?: boolean;
};

export function NumericField({
  label,
  value,
  onChangeValue,
  placeholder = '0',
  disabled = false,
  showCalculator = true,
}: Props) {
  const colors = useThemeColors();
  const [showCalc, setShowCalc] = useState(false);

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: colors.secondaryLabel }]}>{label}</Text>
      <View style={styles.row}>
        <TextInput
          style={[
            styles.input,
            {
              borderColor: colors.separator,
              color: disabled ? colors.secondaryLabel : colors.label,
              backgroundColor: disabled ? colors.disabledBackground : colors.secondaryBackground,
            },
          ]}
          value={value}
          onChangeText={(text) => onChangeValue(sanitizeNumericInput(text))}
          placeholder={placeholder}
          placeholderTextColor={colors.secondaryLabel}
          keyboardType="decimal-pad"
          editable={!disabled}
          accessibilityLabel={label}
        />
        {showCalculator ? (
          <Pressable
            onPress={() => setShowCalc(true)}
            disabled={disabled}
            hitSlop={8}
            accessibilityLabel={`${label}の電卓`}
            style={({ pressed }) => [styles.calcButton, { opacity: disabled ? 0.3 : pressed ? 0.5 : 1 }]}>
            <Ionicons name="calculator-outline" size={22} color={colors.blue} />
          </Pressable>
        ) : null}
      </View>

      {/* 開いている間だけマウントして、表示欄を現在の入力値で初期化する */}
      {showCalculator && showCalc ? (
        <MiniCalculator
          targetText={value}
          // Swift 版は書き戻し後に onChange のフィルタが走るため、こちらも同じフィルタを通す
          onSubmit={(result) => onChangeValue(sanitizeNumericInput(result))}
          onClose={() => setShowCalc(false)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 4,
  },
  label: {
    fontSize: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  input: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 16,
  },
  calcButton: {
    padding: 4,
  },
});
