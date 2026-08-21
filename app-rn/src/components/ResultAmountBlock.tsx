// 結果カードの「見出し ＋ 大きな金額」（UI-SPEC §1.1-3a / §1.1-3b）。
//
// **計算タブの 2 つのモードと、記録フォームの逆算で同じ 1 つを使う。**
// 利益側（§1.1-3a）と逆算側（§1.1-3b）は同じカードの中でセグメントで切り替わるので、
// 字の大きさや余白が片方だけ変わると、押した瞬間に数字が飛び跳ねて見える。
// 色だけは呼び出し側が決める ── 利益は符号で緑／赤、逆算結果は青（§1.1「挙動」）で、
// これは「同じ形で違うもの」を表すための出し分けだから。
import { StyleSheet, Text, View } from 'react-native';

import { useThemeColors } from '@/theme';

type Props = {
  /** 金額の上に置く見出し（「純利益」「この値段で出せばよい」） */
  caption: string;
  /** 整形済みの金額。整形は呼び出し側（formatYen）が済ませる */
  amount: string;
  amountColor: string;
};

export function ResultAmountBlock({ caption, amount, amountColor }: Props) {
  const colors = useThemeColors();

  return (
    <View style={styles.block}>
      <Text style={[styles.caption, { color: colors.secondaryLabel }]}>{caption}</Text>
      {/* 桁が増えても 1 行に収める（¥1,234,567 まで）。折り返すと下の帯との間が開く */}
      <Text
        style={[styles.amount, { color: amountColor }]}
        numberOfLines={1}
        adjustsFontSizeToFit>
        {amount}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    alignItems: 'center',
    gap: 2,
    paddingTop: 8,
  },
  caption: {
    fontSize: 15,
  },
  amount: {
    fontSize: 46,
    fontWeight: '800',
  },
});
