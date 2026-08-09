// RecordFormView.swift の LabeledField（isNumeric = false の側）の移植。
// 数値欄は電卓ボタン付きの NumericField が担当するので、こちらは商品名・メモ用のテキスト欄。
//
// SPEC §5.2 の保存バリデーション表示に対応するため errorMessage を受け取り、
// 渡されたときだけ赤枠 ＋ 欄の下に赤字キャプションを出す。
// 「どの欄に何のメッセージを出すか」は呼び出し側（RecordFormSheet）が決める。
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { useThemeColors } from '@/theme';

type Props = {
  label: string;
  value: string;
  onChangeValue: (value: string) => void;
  placeholder?: string;
  /** メモ欄のような複数行入力にする（Swift 版 isMultiline = 2 相当） */
  multiline?: boolean;
  /** null / undefined なら警告なし。文字列を渡すと赤枠＋その文言を表示する（SPEC §5.2） */
  errorMessage?: string | null;
};

export function TextField({
  label,
  value,
  onChangeValue,
  placeholder = '',
  multiline = false,
  errorMessage = null,
}: Props) {
  const colors = useThemeColors();
  const hasError = errorMessage != null;

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: colors.secondaryLabel }]}>{label}</Text>
      <TextInput
        style={[
          styles.input,
          multiline && styles.multilineInput,
          {
            // 警告時のみ赤枠（Swift 版: 赤 stroke・線幅 1）
            borderColor: hasError ? colors.red : colors.separator,
            borderWidth: hasError ? 1 : StyleSheet.hairlineWidth,
            color: colors.label,
            backgroundColor: colors.secondaryBackground,
          },
        ]}
        value={value}
        onChangeText={onChangeValue}
        placeholder={placeholder}
        placeholderTextColor={colors.secondaryLabel}
        multiline={multiline}
        accessibilityLabel={label}
      />
      {hasError && (
        <Text style={[styles.errorMessage, { color: colors.red }]} accessibilityRole="alert">
          {errorMessage}
        </Text>
      )}
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
  input: {
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 16,
  },
  multilineInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  errorMessage: {
    fontSize: 12,
  },
});
