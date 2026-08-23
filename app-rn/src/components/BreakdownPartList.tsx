// 内訳の一覧（UI-SPEC §1.1-3a / §1.1-3b）。
// **計算タブの結果側・逆算側・固定バーと、記録フォームの逆算で同じ 1 つの部品。**
//
// 帯グラフと同じ順・同じ色（左の色見本 = 区画の色）にして、どの区画がどの行かを色で追える
// ようにする。以前は結果側だけが色のない行の並びで、同じ画面の 2 つのモードで内訳の読み方が
// 変わっていた ── 帯は共通（CostProportionBar）なのに、その凡例にあたる一覧が
// 片方だけ灰色では、色の対応を確かめる手段が逆算側にしかないことになる。
//
// 行の材料は logic/calcForm の costBreakdown が作る（画面では計算も並べ替えもしない）。
// 0 円の項目と、不用品の仕入価格が落ちるのもその中の決定（§1.1-3a）。
import { StyleSheet, Text, View } from 'react-native';

import { partColor, partValueColor } from '@/components/CostProportionBar';
import { formatYen } from '@/logic/format';
import type { CostBreakdown } from '@/logic/calcForm';
import { totalSalesAmountLabel } from '@/logic/labels';
import { useLocale } from '@/settings';
import { useThemeColors } from '@/theme';

type Props = {
  breakdown: CostBreakdown;
  /** 固定バーは 2 段目に売上を出しているので、内訳では繰り返さない（UI-SPEC §1.1-2） */
  showSalesRow?: boolean;
};

export function BreakdownPartList({ breakdown, showSalesRow = false }: Props) {
  // 表示語は locale を引数に取る（渡さないと React Compiler が初回の文字列で固定する。
  // src/i18n/index.ts の冒頭）。この購読で言語を変えたときに引き直される
  const locale = useLocale();

  const colors = useThemeColors();

  return (
    <View style={styles.partList}>
      {showSalesRow && (
        <View style={styles.partRow}>
          {/* 売上総額は帯の全体（区画の合計）で、対応する区画がないので色見本を持たない。
              下の行と語頭を揃えるために幅だけ空ける */}
          <View style={styles.swatch} />
          <Text style={[styles.partLabel, { color: colors.secondaryLabel }]} numberOfLines={1}>
            {totalSalesAmountLabel(locale)}
          </Text>
          <Text style={[styles.partValue, { color: colors.label }]} numberOfLines={1}>
            {formatYen(locale, breakdown.salesPrice)}
          </Text>
        </View>
      )}
      {breakdown.parts.map((part) => (
        <View key={part.key} style={styles.partRow}>
          <View style={[styles.swatch, { backgroundColor: partColor(part.key, colors) }]} />
          <Text
            style={[styles.partLabel, { color: colors.secondaryLabel }]}
            numberOfLines={1}>
            {part.label}
          </Text>
          {/* 率は label とは別の Text に分ける（桁数が変わっても折り返さない。
              logic/calcForm.ts の BreakdownPart.rateLabel コメント参照） */}
          {part.rateLabel != null && (
            <Text style={[styles.partRate, { color: colors.secondaryLabel }]}>{part.rateLabel}</Text>
          )}
          <Text style={[styles.partValue, { color: partValueColor(part.key, colors) }]}>
            {formatYen(locale, part.amount)}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  partList: {
    gap: 8,
    paddingBottom: 4,
  },
  partRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  swatch: {
    width: 10,
    height: 10,
    borderRadius: 3,
  },
  partLabel: {
    fontSize: 14,
    // 行名が長くても金額を右端に押し出す
    flex: 1,
  },
  partRate: {
    fontSize: 14,
  },
  partValue: {
    fontSize: 14,
    fontWeight: '600',
  },
});
