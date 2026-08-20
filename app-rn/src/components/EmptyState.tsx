// 空表示（UI-SPEC §1.2-6）。（絵）＋見出し＋本文＋（絞り込み中のみ）解除リンク。
// 文言は状況ごとに違うので呼び出し側から渡す（この部品は並べ方だけを持つ）。
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useThemeColors } from '@/theme';

type Props = {
  /**
   * 見出しの上に置く絵（省略すると出ない）。
   *
   * **中身には触らない。** 読み上げから外すかどうかも含めて、呼び出し側が包んだものを
   * そのまま置く ── この部品が持つのは並べ方だけという作りを崩さないため。
   * 位置決めも container の gap 任せで、絵があるときだけ余白を変えることはしない。
   */
  illustration?: ReactNode;
  title: string;
  /**
   * 見出しの下の説明。**省略すると出ない** ── 絞り込みの空表示（SPEC-V4 §4.8 / 決定 §9-13）は
   * 条件ごとの文言を作らないと決めたので、見出しと解除リンクだけになる。
   */
  body?: string;
  /** 絞り込み中だけ出すリンク。省略すると出ない */
  actionLabel?: string;
  onPressAction?: () => void;
};

export function EmptyState({ illustration, title, body, actionLabel, onPressAction }: Props) {
  const colors = useThemeColors();

  return (
    <View style={styles.container}>
      {illustration}
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
