// データタブの「収支 / タグ」切替（案）。下線タブ ── ピルのセグメントコントロールより軽く、
// カードの一部として溶け込ませられる。**カードの上端にそのまま置く前提**（呼び出し側の
// カードが左右 16pt のパディングを持つことを想定し、この部品自身は左右にはみ出して
// 縁まで届く区切り線を引く）。
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useThemeColors } from '@/theme';

type Props = {
  options: string[];
  selectedIndex: number;
  onChange: (index: number) => void;
};

export function DataModeTabs({ options, selectedIndex, onChange }: Props) {
  const colors = useThemeColors();

  return (
    <View style={styles.bleed}>
      <View style={styles.tabRow}>
        {options.map((option, index) => {
          const selected = index === selectedIndex;
          // 最後のタブ（実績）だけ右端へ寄せる ── 収支・タグは通常どおり左詰めのペアのまま、
          // 性質の違う 3 つ目だけを行の右端に離して置く（marginLeft: 'auto' が手前の gap を無視して
          // 残りの余白をすべて引き受ける）
          const isLast = index === options.length - 1;
          return (
            <Pressable
              key={option}
              onPress={() => onChange(index)}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              style={[styles.tab, isLast && options.length > 1 && styles.tabPushRight]}>
              <Text
                style={[
                  styles.label,
                  { color: selected ? colors.label : colors.secondaryLabel, fontWeight: selected ? '700' : '400' },
                ]}>
                {option}
              </Text>
              <View style={[styles.underline, selected && { backgroundColor: colors.blue }]} />
            </Pressable>
          );
        })}
      </View>
      <View style={[styles.separator, { backgroundColor: colors.separator }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  // 呼び出し側のカードの左右パディング（16pt）を打ち消し、区切り線をカードの縁まで届かせる
  bleed: {
    marginHorizontal: -16,
    marginBottom: 12,
  },
  tabRow: {
    flexDirection: 'row',
    gap: 24,
    paddingHorizontal: 16,
  },
  tab: {
    alignItems: 'stretch',
    paddingBottom: 10,
  },
  tabPushRight: {
    marginLeft: 'auto',
  },
  label: {
    fontSize: 15,
  },
  // タブの文字幅にそのまま追従する（tab 自身が中身の幅に縮むので、幅指定は要らない）
  underline: {
    height: 2,
    borderRadius: 1,
    marginTop: 8,
    backgroundColor: 'transparent',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
  },
});
