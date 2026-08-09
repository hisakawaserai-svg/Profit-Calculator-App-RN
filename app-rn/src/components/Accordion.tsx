// SwiftUI の DisclosureGroup 相当。
// HelpView の 3 セクション（SPEC §3.2）と、DataView の内訳リスト（SPEC §6.2）で使う。
//
// 開閉状態はこのコンポーネントが自分で持つ（Swift 版の DisclosureGroup も同様に
// 各グループが独立して開閉する）。呼び出し側でリストの key が変われば再マウントされ、
// 開閉状態も初期値に戻る。
import { Ionicons } from '@expo/vector-icons';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { useThemeColors } from '@/theme';

type Props = {
  /** 見出し行の中身。開閉シェブロンはこのコンポーネントが右端に足す */
  label: ReactNode;
  /** アクセシビリティ用の見出しテキスト（label が要素なので別に受け取る） */
  accessibilityLabel: string;
  initiallyExpanded?: boolean;
  containerStyle?: ViewStyle;
  children: ReactNode;
};

export function Accordion({
  label,
  accessibilityLabel,
  initiallyExpanded = false,
  containerStyle,
  children,
}: Props) {
  const colors = useThemeColors();
  const [expanded, setExpanded] = useState(initiallyExpanded);

  return (
    <View style={[styles.container, { backgroundColor: colors.secondaryBackground }, containerStyle]}>
      <Pressable
        onPress={() => setExpanded((value) => !value)}
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

      {expanded && <View style={styles.content}>{children}</View>}
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
