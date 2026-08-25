// 絞り込みの金額の範囲欄（SPEC-V11 §6）。「下限 〜 上限」の 2 欄だけを持つ薄い部品。
//
// **NumericField を流用しない。** あれは記録フォームの 1 欄で、行高 60px 固定・電卓ボタン・
// プリセットの選択シートへの入口（presetType）・警告の赤枠・まとめ買いの受け皿を持つ ──
// **使わない口のほうが多い**。絞り込みに要るのは「数字を 2 つ受け取る」だけで、
// 電卓もプリセットも警告も**この画面に意味がない**（絞り込みに正解の値はない）。
//
// 値の整形は input.ts の sanitizeNumericInput（数字と小数点だけ・小数点は 1 個）を通す ──
// アプリ中の金額入力と同じ規則で、絞り込みだけ別の受け方をしない。
// **負の数は入らない**（`-` が落ちる）ので、赤字は「赤字のみ」が受け持つ（SPEC-V11 §1.3）。
//
// **大小を直さない**（下限 > 上限でも入れ替えない）。入れ替えると打っている途中に値が飛ぶ。
// 結果は 0 件になるが、それは条件どおりの正しい結果で、下部の「0件」と 2 行目がそのまま説明になる。
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { sanitizeNumericInput } from '@/logic/input';
import {
  filterRangeMaxPlaceholder,
  filterRangeMinPlaceholder,
  filterRangeSeparator,
} from '@/logic/labels';
import { useLocale } from '@/settings';
import { useThemeColors } from '@/theme';

type Props = {
  /** 欄の名前（「純利益」）。青い行の条件名と同じ語を渡すこと（labels の filterAmountLabel） */
  label: string;
  min: string;
  max: string;
  onChangeMin: (value: string) => void;
  onChangeMax: (value: string) => void;
};

export function RangeField({ label, min, max, onChangeMin, onChangeMax }: Props) {
  const locale = useLocale();
  const colors = useThemeColors();

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: colors.secondaryLabel }]}>{label}</Text>
      <View style={styles.row}>
        <Bound
          value={min}
          onChangeValue={onChangeMin}
          placeholder={filterRangeMinPlaceholder(locale)}
          accessibilityLabel={`${label} ${filterRangeMinPlaceholder(locale)}`}
        />
        <Text style={[styles.separator, { color: colors.secondaryLabel }]}>
          {filterRangeSeparator(locale)}
        </Text>
        <Bound
          value={max}
          onChangeValue={onChangeMax}
          placeholder={filterRangeMaxPlaceholder(locale)}
          accessibilityLabel={`${label} ${filterRangeMaxPlaceholder(locale)}`}
        />
      </View>
    </View>
  );
}

/** 2 欄は同じ形。単位（円 / ¥）は欄の中に出さない ── 記録フォームの数値欄と同じ作法 */
function Bound({
  value,
  onChangeValue,
  placeholder,
  accessibilityLabel,
}: {
  value: string;
  onChangeValue: (value: string) => void;
  placeholder: string;
  accessibilityLabel: string;
}) {
  const colors = useThemeColors();

  return (
    <TextInput
      style={[
        styles.input,
        {
          color: colors.label,
          backgroundColor: colors.background,
          borderColor: colors.separator,
        },
      ]}
      value={value}
      onChangeText={(text) => onChangeValue(sanitizeNumericInput(text))}
      placeholder={placeholder}
      placeholderTextColor={colors.mutedLabel}
      keyboardType="decimal-pad"
      accessibilityLabel={accessibilityLabel}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  input: {
    flex: 1,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    textAlign: 'right',
  },
  separator: {
    fontSize: 15,
  },
});
