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
   * 文字と電卓ボタンを薄くして無効を示す。行の形（高さ・余白）は他の行と変えない
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

  // 無効は文字色だけで示す（UI-SPEC §1.1「挙動」）。
  //
  // 地色を敷く形をやめたのは、カードの左右の余白まで届かず角丸にも沿わないため、
  // 行の上に灰色の板が乗っているように見えるから。背景を持つのはこの行だけなので、
  // 他の行（送料など）と並んだときにその行だけ浮いて見えていた。
  // ラベル・数値・電卓ボタンを薄くすれば、行の形を他と揃えたまま無効だと分かる。
  const valueColor = disabled ? colors.secondaryLabel : colors.label;

  return (
    <View>
      <View style={styles.row}>
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
    // 左右の余白はカード側が持つ
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
