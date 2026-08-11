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
  /**
   * 薄く出す（SPEC-V3 §1.5.1 の「名前は残っているが率は手で変えた」状態）。
   *
   * 色を別に持たせず不透明度で落とすのは、10 色ぶんの薄い版を明暗 2 テーマで
   * 定義し直さずに、どの色でも同じだけ引っ込ませるため。地色に沈めるのが目的なので、
   * 前景（文字）も一緒に薄くなってよい。
   */
  muted?: boolean;
};

export function PresetBadge({ preset, size = BADGE_SIZE, muted = false }: Props) {
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
        muted && styles.muted,
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
  // 明暗どちらの地色でも「引っ込んだが読める」ところ。これ以上落とすと頭文字が読めない
  muted: {
    opacity: 0.4,
  },
  text: {
    fontWeight: '700',
  },
});
