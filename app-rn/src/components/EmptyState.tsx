// 空表示（UI-SPEC §1.2-6）。見出し＋本文＋（絞り込み中のみ）解除リンク。
// 文言は状況ごとに違うので呼び出し側から渡す（この部品は並べ方だけを持つ）。
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useThemeColors } from '@/theme';

type Props = {
  title: string;
  /**
   * 見出しの下の説明。**省略すると出ない** ── 絞り込みの空表示（SPEC-V4 §4.8 / 決定 §9-13）は
   * 条件ごとの文言を作らないと決めたので、見出しと解除リンクだけになる。
   */
  body?: string;
  /** 絞り込み中だけ出すリンク。省略すると出ない */
  actionLabel?: string;
  onPressAction?: () => void;
  /**
   * 見出しの上に置く図（マスコットなど）。省略すると出ない。
   *
   * **読み上げからは外す** ── 図形なので読み上げても意味を成さない。
   * 意味は見出しと本文が持つ（HelpDiagram / OnboardingFigure と同じ扱い）。
   * 図があるときは上の余白を詰める：図のぶん背が伸びるので、64 のままだと
   * 下の広告枠に向かって全体が押し下がる。
   */
  figure?: ReactNode;
};

export function EmptyState({ title, body, actionLabel, onPressAction, figure }: Props) {
  const colors = useThemeColors();

  return (
    <View style={[styles.container, figure != null && styles.containerWithFigure]}>
      {figure != null && (
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants">
          {figure}
        </View>
      )}
      <Text style={[styles.title, { color: colors.label }]}>{title}</Text>
      {body != null && (
        <Text style={[styles.body, { color: colors.secondaryLabel }]}>{body}</Text>
      )}
      {actionLabel != null && onPressAction != null && (
        <Pressable onPress={onPressAction} hitSlop={8} accessibilityRole="button">
          <Text style={[styles.action, { color: colors.blue }]}>{actionLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 32,
    paddingTop: 64,
  },
  // 図があるぶん背が伸びるので、上の余白を詰めて全体の高さを元と近づける
  containerWithFigure: {
    paddingTop: 32,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  action: {
    fontSize: 15,
    fontWeight: '600',
    marginTop: 4,
  },
});
