// 色の選択（SPEC-V7 §3）。固定 11 色の丸 ＋ 自由色の丸を **6 × 2** に並べる。
//
// **プリセットの編集画面とタグの編集画面が同じものを使う。** 2 つは同じパレットを共有していて
// （SPEC-V4 §2.3）、片方だけ自由色が選べる・片方だけ丸の並びが違う、という状態を作らないため。
//
// 12 個目（自由色）だけが「押すと決める」口で、他の 11 個は押した時点で決まる ──
// 連続量を合わせる操作はシートの中でやる（ColorPickerSheet）。
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ColorPickerSheet } from '@/components/ColorPickerSheet';
import { CUSTOM_COLOR_LABEL } from '@/logic/labels';
import { PRESET_COLOR_HEXES, PRESET_COLOR_KEYS, presetColorKeyOf } from '@/logic/preset';
import { useThemeColors } from '@/theme';

/** 丸の直径（§3.3-6）。11 ＋ 1 を 6 個ずつ 2 段に折り返す大きさ */
export const SWATCH_SIZE = 36;

type Props = {
  /** いま選ばれている色（hex）。固定色かどうかは値そのもので決まる */
  value: string;
  onChange: (hex: string) => void;
};

export function ColorSwatchGrid({ value, onChange }: Props) {
  const colors = useThemeColors();
  const [pickerOpen, setPickerOpen] = useState(false);
  /** 固定 11 色のどれでもない ＝ 自由色 */
  const isCustom = presetColorKeyOf(value) == null;

  return (
    <>
      <View style={styles.swatches}>
        {PRESET_COLOR_KEYS.map((key) => {
          const selected = presetColorKeyOf(value) === key;
          return (
            <Pressable
              key={key}
              onPress={() => onChange(PRESET_COLOR_HEXES[key])}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={key}
              style={({ pressed }) => [
                styles.slot,
                {
                  // 選択中は外周にリング（§3.3-6）。丸の外側に間を空けて二重丸にするので、
                  // 枠は丸そのものではなくこの器が持つ（丸の中に線が食い込まない）
                  borderColor: selected ? colors.label : 'transparent',
                  opacity: pressed ? 0.5 : 1,
                },
              ]}>
              <View
                style={[styles.swatch, { backgroundColor: colors.presetTones[key].background }]}
              />
            </Pressable>
          );
        })}

        {/* 12 個目 ＝ 自由色（§3）。**選んでいる間はその色そのものを映す** ──
            「押すと開く」ことはパレットのアイコンで示し、選択中は他の丸と同じリングが付く */}
        <Pressable
          onPress={() => setPickerOpen(true)}
          accessibilityRole="button"
          accessibilityState={{ selected: isCustom }}
          accessibilityLabel={CUSTOM_COLOR_LABEL}
          style={({ pressed }) => [
            styles.slot,
            {
              borderColor: isCustom ? colors.label : 'transparent',
              opacity: pressed ? 0.5 : 1,
            },
          ]}>
          <View
            style={[
              styles.swatch,
              styles.customSwatch,
              {
                backgroundColor: isCustom ? value : colors.secondaryBackground,
                borderColor: colors.separator,
              },
            ]}>
            {!isCustom && <Ionicons name="color-palette-outline" size={20} color={colors.blue} />}
          </View>
        </Pressable>
      </View>

      {pickerOpen && (
        <ColorPickerSheet
          visible={pickerOpen}
          value={value}
          onSelect={onChange}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  swatches: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  slot: {
    padding: 3,
    borderWidth: 2,
    borderRadius: SWATCH_SIZE / 2 + 5,
  },
  swatch: {
    width: SWATCH_SIZE,
    height: SWATCH_SIZE,
    borderRadius: SWATCH_SIZE / 2,
  },
  // 自由色の丸。まだ選んでいないときは空の器に見せる（中のアイコンが「開く」を言う）
  customSwatch: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
});
