// SwiftUI の DisclosureGroup 相当。
// HelpView の 3 セクション（SPEC §3.2）と、DataView の内訳リスト（SPEC §6.2）で使う。
//
// **開閉状態は 2 通りの持ち方ができる**:
//   - 既定は自分で持つ（Swift 版の DisclosureGroup と同じ、各段が独立して開閉する形）。
//     呼び出し側でリストの key が変われば再マウントされ、開閉状態も初期値に戻る
//   - `expanded` と `onToggle` を渡すと呼び出し側が持つ（controlled）。**同時に 1 つだけ
//     開く列**を作るには、どの段が開いているかを列そのものが知っている必要がある
//     （使いかたの画面。HelpScreen.tsx 冒頭）。CollapsibleSection と同じ props の名前にしてある
import { Ionicons } from '@expo/vector-icons';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { useThemeColors } from '@/theme';

type Props = {
  /** 見出し行の中身。開閉シェブロンはこのコンポーネントが右端に足す */
  label: ReactNode;
  /** アクセシビリティ用の見出しテキスト（label が要素なので別に受け取る） */
  accessibilityLabel: string;
  /** 渡すと開閉は呼び出し側のもの（controlled）。`onToggle` と対で使う */
  expanded?: boolean;
  /** controlled のときの見出し行の押下。開く／閉じるの判断は呼び出し側 */
  onToggle?: () => void;
  /** 自分で持つときの初期値（controlled では使わない） */
  initiallyExpanded?: boolean;
  containerStyle?: ViewStyle;
  /**
   * 開いた中身の余白の上書き（絞り込みの群。SPEC-V11 §2.3）。
   * 既定は左右・下に 16 の余白だが、**カードの端まで届く行の一覧**を入れるときは
   * `{ paddingHorizontal: 0, paddingBottom: 0 }` を渡して余白ごと外す ──
   * 選択中の行の青い地が途中で切れると、行ではなく帯が浮いて見える。
   * その場合の余白は中身の側（行や欄）が持つ。
   */
  contentStyle?: ViewStyle;
  children: ReactNode;
};

export function Accordion({
  label,
  accessibilityLabel,
  expanded: controlledExpanded,
  onToggle,
  initiallyExpanded = false,
  containerStyle,
  contentStyle,
  children,
}: Props) {
  const colors = useThemeColors();
  const [selfExpanded, setSelfExpanded] = useState(initiallyExpanded);
  const expanded = controlledExpanded ?? selfExpanded;

  const toggle = () => {
    if (controlledExpanded == null) setSelfExpanded((value) => !value);
    else onToggle?.();
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.secondaryBackground }, containerStyle]}>
      <Pressable
        onPress={toggle}
        style={({ pressed }) => [styles.header, { opacity: pressed ? 0.6 : 1 }]}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ expanded }}>
        <View style={styles.labelSlot}>{label}</View>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={colors.secondaryLabel}
        />
      </Pressable>

      {expanded && <View style={[styles.content, contentStyle]}>{children}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
  },
  labelSlot: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
});
