// 販売価格の内訳を表す帯グラフと、その下の「手元 ◯円 ／ 引かれる分 ◯円」（UI-SPEC §1.1-3）。
//
// 計算タブの結果側と逆算側の両方で同じものを出す。同じ画面の 2 つのモードで結果の見え方が
// 変わらないようにするのがねらいなので、配色も構成もここ 1 か所に置いて出し分けをしない。
// 数字は logic/calcForm.ts の costBreakdown が作る（画面では計算しない）。
import { StyleSheet, Text, View } from 'react-native';

import type { BreakdownPart, BreakdownPartKey } from '@/logic/calcForm';
import { formatYenTight } from '@/logic/format';
import { deductedLabel, keptShortLabel } from '@/logic/labels';
import { useThemeColors, type ThemeColors } from '@/theme';
import { useLocale } from '@/settings';

/**
 * 帯の区画と一覧の色見本に共通の色。
 * 経費は入力済みの項目だけを詰めて塗るのではなく、項目ごとに固定の色を割り当てる
 * （theme.expenseTones）。項目を 1 つ足したときに他の区画の色が動かないようにするため。
 */
const EXPENSE_TONE_INDEX: Record<string, number> = {
  purchasePrice: 0,
  postage: 1,
  envelopeCost: 2,
  othersCost: 3,
};

export function partColor(key: BreakdownPartKey, colors: ThemeColors): string {
  if (key === 'kept') return colors.green;
  if (key === 'commission') return colors.orange;
  return colors.expenseTones[EXPENSE_TONE_INDEX[key]];
}

/**
 * 一覧の金額側の色。
 *
 * 帯の色をそのまま数字に使わないのは、経費の 4 色が明度で振ってあるぶん、薄い側
 * （梱包材・その他）が地色に対して読めなくなるため。項目の見分けは左の色見本が担い、
 * 数字は読める色にする。手元と販売手数料を色つきのままにしてあるのは、
 * 結果側の内訳（§1.1-3a）が同じ 2 色を使っているのに合わせるため。
 */
export function partValueColor(key: BreakdownPartKey, colors: ThemeColors): string {
  if (key === 'kept') return colors.green;
  if (key === 'commission') return colors.orange;
  return colors.label;
}

type Props = {
  parts: BreakdownPart[];
  kept: number;
  deducted: number;
};

export function CostProportionBar({ parts, kept, deducted }: Props) {
  // 表示語は locale を引数に取る（渡さないと React Compiler が初回の文字列で固定する。
  // src/i18n/index.ts の冒頭）。この購読で言語を変えたときに引き直される
  const locale = useLocale();

  const colors = useThemeColors();
  // 0 円以下の区画は描かない。結果側では経費が販売価格を超えて手元がマイナスになりうるが、
  // 負の幅は帯にできないので、その場合は「引かれる分」だけが並ぶ帯になる（実額は下の 2 値）
  const visible = parts.filter((part) => part.amount > 0);

  return (
    <View style={styles.container}>
      <View
        style={[styles.bar, { backgroundColor: colors.disabledBackground }]}
        // 帯が持つ情報は直下の 2 値が文字で言い直しているので、読み上げからは外す
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants">
        {visible.map((part) => (
          <View
            key={part.key}
            style={[
              styles.segment,
              { flex: part.amount, backgroundColor: partColor(part.key, colors) },
            ]}
          />
        ))}
      </View>

      {/* 帯だけでは割合しか読めないので、両側の実額を単位つきで置く */}
      <View style={styles.valueRow}>
        <Text style={[styles.value, { color: kept >= 0 ? colors.green : colors.red }]}>
          {keptShortLabel(locale)} {formatYenTight(kept)}
        </Text>
        <Text style={[styles.value, { color: colors.secondaryLabel }]}>／</Text>
        <Text style={[styles.value, { color: colors.label }]}>
          {deductedLabel(locale)} {formatYenTight(deducted)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
    paddingTop: 4,
  },
  bar: {
    flexDirection: 'row',
    height: 14,
    borderRadius: 7,
    // 区画の角が帯の丸みからはみ出さないように切る
    overflow: 'hidden',
    gap: 2,
  },
  segment: {
    // 金額の小さい項目でも色が見える幅は残す（flex だけだと 1 px 未満に潰れる）
    minWidth: 4,
  },
  valueRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    columnGap: 8,
  },
  value: {
    fontSize: 14,
    fontWeight: '600',
  },
});
