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

import { tagRemoveAccessibilityLabel } from '@/logic/labels';
import { normalizePresetColor } from '@/logic/preset';
import { useThemeColors } from '@/theme';

/** 色の点の直径（§2.3）。名前の左に置く ── 金額の行に出ることはないので色が隣と競合しない */
const DOT_SIZE = 6;

/** active（青ベタ）の文字と点の色。地が常に blue なので、明暗どちらでも白で読める */
const ACTIVE_FOREGROUND = '#FFFFFF';

/**
 * §2.3 の見た目。
 *
 * | plain      | 表示のみ（記録詳細・解除バー）。枠線も地色も持たない |
 * | selected   | 選択中・外せる（フォームのタグ行）。薄い地 ＋ 右端に「✕」 |
 * | unselected | 未選択（絞り込みシートの候補）。白地 ＋ 枠線 |
 * | active     | 選択中（絞り込みシート）。**青ベタ ＋ 白文字 ＋ 白い点。「✕」は出さない** |
 *
 * active を selected と分けるのは、外し方が違うから（設計案 30b）── フォームのタグ行は
 * チップ 1 つずつに「✕」が付くが、絞り込みシートは**もう一度押して外す**面なので、
 * 押せる印より「いま効いている / 効いていない」の対比の方が要る。
 * 塗り分けにしたのはそのため（薄い地では、白地の未選択との差が離れて並ぶと読み取れない）。
 */
export type TagChipVariant = 'plain' | 'selected' | 'unselected' | 'active';

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
  const isActive = variant === 'active';
  // 青ベタの上では色の点が地に負けるので白に落とす。**色は識別の補助**（§0.1）なので、
  // 選択中は「青く塗られていること」の方が強い手がかりになり、点の色は要らなくなる
  const dotColor = isActive
    ? ACTIVE_FOREGROUND
    : colors.presetTones[normalizePresetColor(tag.colorKey)].background;
  const isPlaceholder = tag.name === '' && namePlaceholder != null;
  const removable = variant === 'selected' && onRemove != null;

  return (
    <View
      style={[
        styles.chip,
        variant === 'selected' && { backgroundColor: colors.disabledBackground },
        isActive && { backgroundColor: colors.blue },
        variant === 'unselected' && {
          backgroundColor: colors.secondaryBackground,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.separator,
        },
        // 枠線のぶんだけ中身がずれないよう、枠を持たない側にも同じ幅の透明な枠を敷く
        variant !== 'unselected' && styles.borderless,
      ]}>
      <View style={[styles.dot, { backgroundColor: dotColor }]} />
      <Text
        style={[
          styles.name,
          {
            color: isActive
              ? ACTIVE_FOREGROUND
              : isPlaceholder
                ? colors.mutedLabel
                : colors.label,
          },
        ]}
        numberOfLines={1}>
        {isPlaceholder ? namePlaceholder : tag.name}
      </Text>
      {removable && (
        <Pressable
          onPress={onRemove}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={tagRemoveAccessibilityLabel(tag.name)}
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
    paddingHorizontal: 12,
    paddingVertical: 6,
    // 完全な丸（ピル）。角丸の矩形だと、シートの中で入力欄・カードと同じ形に見えて
    // 「押して選ぶもの」に読めない（設計案 30b）
    borderRadius: 999,
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
