// MonthlySummaryCurd.swift（MonthlySummaryCard）の移植。月グループの収支・経費を出すカード。
//
// SPEC 決定 §7-2: Swift 版は「レコードごとに Int() 切り捨て → 合算」だったが、
// RN 版は「Double のまま合算 → 表示時に roundForDisplay」。
// 合算は repository の SUM で済んでいるので、ここは受け取った値を丸めて出すだけ。
//
// 文字色は Swift 版どおり収支＝緑・経費＝赤の固定（SPEC は月カードの配色を規定していない）。
// 符号で色を変えるのは下部累計 CareerSummarySection のみ（SPEC §6.1）。
import { StyleSheet, Text, View } from 'react-native';

import { formatYenSymbol } from '@/logic/format';
import { EXPENSES_LABEL, TOTAL_PROFIT_LABEL } from '@/logic/labels';
import { useThemeColors } from '@/theme';

type Props = {
  /** Σ netProfit（丸めなし） */
  totalNetProfit: number;
  /** Σ totalExpenses（丸めなし） */
  totalExpenses: number;
};

export function MonthlySummaryCard({ totalNetProfit, totalExpenses }: Props) {
  const colors = useThemeColors();

  return (
    <View style={[styles.card, { backgroundColor: colors.disabledBackground }]}>
      <View>
        {/* 月グループの合計は種別が混ざり得るので中立語（SPEC-V2 §4.3 / §5.3） */}
        <Text style={[styles.caption, { color: colors.secondaryLabel }]}>{TOTAL_PROFIT_LABEL}</Text>
        <Text style={[styles.value, { color: colors.green }]}>
          {formatYenSymbol(totalNetProfit)}
        </Text>
      </View>
      <View style={styles.trailing}>
        <Text style={[styles.caption, { color: colors.secondaryLabel }]}>{EXPENSES_LABEL}</Text>
        <Text style={[styles.value, { color: colors.red }]}>
          {formatYenSymbol(totalExpenses)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 10,
    gap: 8,
  },
  trailing: {
    alignItems: 'flex-end',
  },
  caption: {
    fontSize: 12,
  },
  value: {
    fontSize: 17,
    fontWeight: '600',
  },
});
