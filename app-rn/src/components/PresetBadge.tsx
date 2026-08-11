// プリセットのバッジ（SPEC-V3 §1.2 / §1.3 / §6.1）。色 ＋ 1〜2 文字の角丸の札。
//
// 出るのは**設定画面と選択シート、電卓の品名列だけ**（§1.3）。金額の行（伝票カード・
// レシートカード）には出さないので、販売手数料のオレンジ等と隣り合わない。
//
// 色と文字はここでは決めない ── 色キーの正規化（normalizePresetColor）も
// 頭文字の導出（presetInitial）も logic/preset.ts の純粋関数で、この部品は結果を描くだけ。
import { StyleSheet, Text, View } from 'react-native';

import { normalizePresetColor, presetInitial } from '@/logic/preset';
import { useThemeColors } from '@/theme';

/** §6.1 の「28px 角」。編集画面のプレビューだけ大きくするので size で受ける */
const BADGE_SIZE = 28;

type Props = {
  /** 保存値そのまま。空の initial から名前を使う導出はこの中で行う（§1.2） */
  preset: { name: string; initial: string; colorKey: string };
  size?: number;
};

export function PresetBadge({ preset, size = BADGE_SIZE }: Props) {
  const colors = useThemeColors();
  const tone = colors.presetTones[normalizePresetColor(preset.colorKey)];
  const text = presetInitial(preset);

  return (
    <View
      style={[
        styles.badge,
        {
          width: size,
          height: size,
          // 角丸は大きさに追従させる（§6.1 の「28px 角に角丸 8px」と同じ比）
          borderRadius: size * (8 / BADGE_SIZE),
          backgroundColor: tone.background,
        },
      ]}
      // 読み上げは名前が担う（PresetRow が名前を読む）。2 文字の略号を読ませても意味が伝わらない
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <Text
        style={[
          styles.text,
          // 文字は 2 文字入ってもはみ出さないところまで小さくする
          { color: tone.foreground, fontSize: size * (13 / BADGE_SIZE) },
        ]}
        numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontWeight: '700',
  },
});
