// 2 択（設計案 53a）。**トグルでも SegmentedControl でもない。**
//
// この形にした理由:
//
// - **トグルにしない。** トグルは「いま入っているのか、切っているのか」を色と
//   つまみの位置だけで示すもので、選択肢そのものに説明を書けない。
//   写真を含めるかは「53枚・8.2MB が増える」という**量の判断**なので、
//   数字が選ぶ瞬間に目に入っていないと決められない。
// - **SegmentedControl（`components/SegmentedControl.tsx`）でもない。** あちらは
//   1 行の器に短い語を並べる iOS 標準の形で、**2 行目（枚数・サイズ）を置く場所がない**。
//   高さを倍にして 2 行を入れると、器の中で持ち上がる白い区画という作り自体が崩れる。
//   1 語で足りる 2 択（期間・種別）は今までどおりあちらを使う。
//
// 押せる面積は 1 つあたり半分の幅 × 60pt 前後。片手・親指で押し分けられる大きさにする。
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useThemeColors } from '@/theme';

export type ChoiceCardOption = {
  /** 選択肢そのもの（「含める」） */
  label: string;
  /** その下に小さく置く説明（「53枚・8.2MB」「ファイルが軽い」）。**両方に書く** */
  detail: string;
};

type Props = {
  options: readonly [ChoiceCardOption, ChoiceCardOption];
  selectedIndex: 0 | 1;
  onChange: (index: 0 | 1) => void;
  /** 実行中は触らせない（連打防止。案 53a 右） */
  disabled?: boolean;
};

export function ChoiceCardPair({ options, selectedIndex, onChange, disabled = false }: Props) {
  const colors = useThemeColors();

  return (
    <View style={styles.row}>
      {options.map((option, index) => {
        const selected = index === selectedIndex;
        return (
          <Pressable
            key={option.label}
            onPress={() => onChange(index === 0 ? 0 : 1)}
            disabled={disabled}
            accessibilityRole="radio"
            accessibilityState={{ selected, disabled }}
            accessibilityLabel={`${option.label}。${option.detail}`}
            style={({ pressed }) => [
              styles.card,
              {
                // 選択中は**枠と地色の 2 つ**で示す。枠だけだと明色では細く、
                // 地色だけだと暗色でカードに沈む（selectedSegmentBackground と同じ問題）
                borderColor: selected ? colors.blue : colors.separator,
                borderWidth: selected ? 2 : StyleSheet.hairlineWidth,
                backgroundColor: selected ? colors.highlightBackground : colors.secondaryBackground,
                opacity: pressed && !disabled ? 0.7 : 1,
              },
            ]}>
            <Text
              numberOfLines={1}
              style={[
                styles.label,
                { color: selected ? colors.blue : colors.label, fontWeight: selected ? '700' : '600' },
              ]}>
              {option.label}
            </Text>
            <Text numberOfLines={1} style={[styles.detail, { color: colors.secondaryLabel }]}>
              {option.detail}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  card: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    // 2 行入っても隣と高さが揃うように下限を置く（片方が 1 行に収まる語のとき）
    minHeight: 62,
  },
  label: {
    fontSize: 16,
  },
  detail: {
    fontSize: 12,
  },
});
