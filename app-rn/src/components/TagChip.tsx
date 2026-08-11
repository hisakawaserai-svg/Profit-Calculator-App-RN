// タグのチップ（SPEC-V4 §2.3）。**色の点 ＋ 名前**。
//
// **PresetBadge は流用しない**（§0.1）。プリセットは金額の行と 1 対 1 で位置が決まるので
// 2 文字のバッジで足りる（どの行にあるかで意味が読める）が、タグは**名前そのものを読む**
// 必要があり、長さも可変。色は識別の補助（点）に落とし、名前を本体にする。
//
// 色はここでは決めない ── 正規化（normalizePresetColor）は logic/preset.ts の純粋関数で、
// この部品は結果を描くだけ（PresetBadge と同じ分担）。
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { normalizePresetColor } from '@/logic/preset';
import { useThemeColors } from '@/theme';

/** 色の点の直径（§2.3）。名前の左に置く ── 金額の行に出ることはないので色が隣と競合しない */
const DOT_SIZE = 6;

/**
 * §2.3 の 3 つの見た目。
 *
 * | plain      | 表示のみ（記録詳細・解除バー）。枠線も地色も持たない |
 * | selected   | 選択中・外せる（フォームのタグ行・絞り込みシート）。薄い地 ＋ 右端に「✕」 |
 * | unselected | 未選択（絞り込みシートの候補）。地なし・枠線あり |
 */
export type TagChipVariant = 'plain' | 'selected' | 'unselected';

type Props = {
  /** 保存値そのまま。色キーの正規化はこの中で行う */
  tag: { name: string; colorKey: string };
  variant?: TagChipVariant;
  /**
   * 「✕」を押したとき（§3.1）。`selected` のときだけ「✕」が出る ──
   * 外せない場所（記録詳細）で押せる印を出さないため、渡されなければ名前だけになる。
   */
  onRemove?: () => void;
  /** 名前が空のときに薄く出す語（編集シートのプレビュー。§2.3-2） */
  namePlaceholder?: string;
};

export function TagChip({ tag, variant = 'plain', onRemove, namePlaceholder }: Props) {
  const colors = useThemeColors();
  const dotColor = colors.presetTones[normalizePresetColor(tag.colorKey)].background;
  const isPlaceholder = tag.name === '' && namePlaceholder != null;
  const removable = variant === 'selected' && onRemove != null;

  return (
    <View
      style={[
        styles.chip,
        variant === 'selected' && { backgroundColor: colors.disabledBackground },
        variant === 'unselected' && {
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.separator,
        },
        // 枠線のぶんだけ中身がずれないよう、枠を持たない側にも同じ幅の透明な枠を敷く
        variant !== 'unselected' && styles.borderless,
      ]}>
      <View style={[styles.dot, { backgroundColor: dotColor }]} />
      <Text
        style={[styles.name, { color: isPlaceholder ? colors.mutedLabel : colors.label }]}
        numberOfLines={1}>
        {isPlaceholder ? namePlaceholder : tag.name}
      </Text>
      {removable && (
        <Pressable
          onPress={onRemove}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`${tag.name}を外す`}
          style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
          <Ionicons name="close" size={14} color={colors.secondaryLabel} />
        </Pressable>
      )}
    </View>
  );
}

/**
 * 色の点だけ（設定タブのカードのプレビュー。§2.1）。
 *
 * チップを並べるには狭い場所で「何色のタグが何件あるか」だけを見せるためのもの。
 * 点の大きさと形をチップと 1 か所で持つために、この部品もここに置く。
 */
export function TagDot({ colorKey, size = DOT_SIZE }: { colorKey: string; size?: number }) {
  const colors = useThemeColors();

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: colors.presetTones[normalizePresetColor(colorKey)].background,
      }}
    />
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  borderless: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
  },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
  },
  name: {
    flexShrink: 1,
    fontSize: 15,
  },
});
