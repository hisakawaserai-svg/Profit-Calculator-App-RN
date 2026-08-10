// 金額の入力行（UI-SPEC §1.1-5 / §3.2）。CalcView.swift の LabeledField（iPhone 分岐）の後継。
//
// 行型（ラベル左・数値右・行高 60px）にしたのは UI-SPEC §3.2 の決定。
// 枠付きの入力欄を縦に積む形をやめ、カードの中に行として並べる。
// 各金額行の右端に電卓ボタンを置く（SPEC §3.2「→ MiniCalculatorView を popover 表示」）。
// 入力のフィルタは src/logic/input.ts（SPEC §5.1 / 決定 §7-9）に委譲する。
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { MiniCalculator } from '@/components/MiniCalculator';
import { sanitizeNumericInput } from '@/logic/input';
import { useThemeColors } from '@/theme';

/** UI-SPEC §1.1-5「行高 60px」 */
const ROW_HEIGHT = 60;

type Props = {
  label: string;
  value: string;
  onChangeValue: (value: string) => void;
  placeholder?: string;
  /**
   * 逆算モードの販売価格欄（UI-SPEC §1.1「挙動」）。
   * 行ごとグレーアウトし、電卓ボタンも同時に無効化する
   */
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

  // 無効時は文字を 60% 不透明・地色をグレーに（UI-SPEC §1.1「挙動」）
  const valueColor = disabled ? colors.secondaryLabel : colors.label;

  return (
    <View>
      <View
        style={[
          styles.row,
          disabled && { backgroundColor: colors.disabledBackground },
        ]}>
        <Text style={[styles.label, { color: valueColor }]} numberOfLines={1}>
          {label}
        </Text>
        <TextInput
          style={[styles.input, { color: valueColor }]}
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
            style={({ pressed }) => [
              styles.calcButton,
              { opacity: disabled ? 0.3 : pressed ? 0.5 : 1 },
            ]}>
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    height: ROW_HEIGHT,
    // 左右の余白はカード側が持つ（無効時の地色もカードの内側に収まる）
  },
  label: {
    fontSize: 16,
  },
  input: {
    // ラベルの右から電卓ボタンの手前まで。数値は右寄せ（伝票と同じ読み方にする）
    flex: 1,
    textAlign: 'right',
    fontSize: 17,
  },
  calcButton: {
    padding: 4,
  },
});
