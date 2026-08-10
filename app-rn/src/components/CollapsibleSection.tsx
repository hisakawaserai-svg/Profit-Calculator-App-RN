// カードの中に置く折りたたみ（UI-SPEC §3.1「内訳・梱包材・メモ」）。
//
// Accordion（HelpScreen / DataScreen）との違いは見た目と状態の持ち方の 2 点:
//   - カードの地色・角丸・余白を持たない。すでにカードの中にある要素を畳むためのもの
//   - 開閉状態を呼び出し側が持つ（controlled）。計算タブは結果カードと固定バーで
//     内訳の開閉を独立させる必要があり（UI-SPEC §1.1「挙動」）、
//     さらに見出し行以外（結果額のタップ）からも開閉するため、状態は画面側に置く。
import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useThemeColors } from '@/theme';

type Props = {
  label: string;
  expanded: boolean;
  onToggle: () => void;
  /** 見出し行の寄せ。内訳（中央・右）と入力カードの折りたたみ（左）で使い分ける */
  align?: 'flex-start' | 'center' | 'flex-end';
  /** link = 青リンク（操作を促す行）/ muted = 補助テキスト色 */
  tone?: 'link' | 'muted';
  children: ReactNode;
};

export function CollapsibleSection({
  label,
  expanded,
  onToggle,
  align = 'flex-start',
  tone = 'muted',
  children,
}: Props) {
  const colors = useThemeColors();
  const color = tone === 'link' ? colors.blue : colors.secondaryLabel;

  return (
    <View>
      <Pressable
        onPress={onToggle}
        hitSlop={8}
        style={({ pressed }) => [
          styles.header,
          { justifyContent: align, opacity: pressed ? 0.6 : 1 },
        ]}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ expanded }}>
        <Text style={[styles.label, { color }]}>{label}</Text>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color={color} />
      </Pressable>

      {expanded && <View style={styles.content}>{children}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
  },
  label: {
    fontSize: 14,
  },
  content: {
    gap: 8,
    paddingTop: 4,
  },
});
