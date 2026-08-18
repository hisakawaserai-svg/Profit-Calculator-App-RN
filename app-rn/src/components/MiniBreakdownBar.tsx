// シミュレーターカード（PricingScreen）に常時出すミニ帯グラフ。
//
// **計算は記録詳細の帯（RecordBreakdownBar）と同じ logic/recordBreakdown.ts を使う**
// （logic/recordBreakdown.miniBarItems が価格だけシミュレーター値に差し替えて呼ぶ）。
// ここではその材料を並べるだけ ── 新しい計算式は持たない。
//
// **並びは記録詳細の帯と違う**（仕入 → 送料 → 手数料 → 梱包 → 利益に固定。2a 案）。
// 引き出し線は持たない ── 帯が小さいぶん、下の凡例に全項目を金額つきで必ず出すことで
// カバーする（15% 未満の区画も凡例では読める）。
import { StyleSheet, Text, View } from 'react-native';

import { DiagonalStripes } from '@/components/RecordBreakdownBar';
import { partColor } from '@/components/CostProportionBar';
import type { SaleRecord } from '@/db/schema';
import { formatYenSymbol } from '@/logic/format';
import { miniBarItems } from '@/logic/recordBreakdown';
import { useLocale } from '@/settings';
import { useThemeColors } from '@/theme';

export function MiniBreakdownBar({ record, price }: { record: SaleRecord; price: number }) {
  // 表示語は locale を引数に取る（src/i18n/index.ts の冒頭）
  const locale = useLocale();
  const colors = useThemeColors();
  const items = miniBarItems(locale, record, price);
  const segments = items.filter((item) => item.inBar);

  return (
    <View style={styles.container}>
      <View
        style={[styles.bar, { backgroundColor: colors.disabledBackground }]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants">
        {segments.map((item) => (
          <View
            key={item.key}
            style={[
              styles.segment,
              { flex: item.amount, backgroundColor: item.shortfall ? colors.red : partColor(item.key, colors) },
            ]}>
            {item.shortfall && <DiagonalStripes />}
          </View>
        ))}
      </View>

      <View style={styles.legend}>
        {items.map((item) => (
          <View key={item.key} style={styles.legendItem}>
            <View
              style={[
                styles.legendDot,
                { backgroundColor: item.shortfall ? colors.red : partColor(item.key, colors) },
              ]}
            />
            <Text style={[styles.legendText, { color: colors.secondaryLabel }]} numberOfLines={1}>
              {item.label} {formatYenSymbol(item.amount)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  bar: {
    flexDirection: 'row',
    height: 14,
    borderRadius: 7,
    // 区画の角が帯の丸みからはみ出さないように切る（斜線の模様も一緒に切れる）
    overflow: 'hidden',
    gap: 2,
  },
  segment: {
    // 金額の小さい項目でも色が見える幅は残す
    minWidth: 4,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: 12,
    rowGap: 4,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 12,
  },
});
