// SummaryViewComponents.swift の移植（CareerSummarySection / SummaryMiniCard）。
// SPEC §6.1「画面下部の累計」:
//   - 値は Double のまま合算されたものを受け取り、表示の瞬間だけ丸める（決定 §7-2）
//   - 収支は正なら緑・負なら赤 / 経費は正なら赤
// Swift 版の init は「レコード配列を受け取って自分で合計する」形だったが、
// RN 版の合算は repository の SQL 側で済ませるため、ここは合計値を受け取るだけにする。
import { StyleSheet, Text, View } from 'react-native';

import { formatYen } from '@/logic/format';
import { EXPENSES_LABEL, TOTAL_PROFIT_LABEL } from '@/logic/labels';
import { useThemeColors } from '@/theme';

type Props = {
  /** Σ netProfit（丸めなし） */
  totalNetProfit: number;
  /** Σ totalExpenses（丸めなし） */
  totalExpenses: number;
  /**
   * 純利益側の見出し（SPEC-V2 §5.3）。
   * 既定は合計に使う中立語「収支」。レコード詳細のように **1 件だけ** を出す画面は、
   * 種別語（純利益 / 利益）を profitLabel(kind) から渡す（§1.3 レコード詳細）。
   */
  profitLabel?: string;
};

export function CareerSummarySection({
  totalNetProfit,
  totalExpenses,
  profitLabel = TOTAL_PROFIT_LABEL,
}: Props) {
  const colors = useThemeColors();

  return (
    <View style={[styles.section, { backgroundColor: colors.background }]}>
      <SummaryMiniCard
        title={profitLabel}
        value={totalNetProfit}
        color={totalNetProfit >= 0 ? colors.green : colors.red}
      />
      <SummaryMiniCard
        title={EXPENSES_LABEL}
        value={totalExpenses}
        color={totalExpenses >= 0 ? colors.red : colors.green}
      />
    </View>
  );
}

function SummaryMiniCard({
  title,
  value,
  color,
}: {
  title: string;
  value: number;
  color: string;
}) {
  const colors = useThemeColors();

  return (
    <View style={[styles.card, { backgroundColor: colors.secondaryBackground }]}>
      <Text style={[styles.cardTitle, { color: colors.secondaryLabel }]}>{title}</Text>
      <Text style={[styles.cardValue, { color }]}>{formatYen(value)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    flexDirection: 'row',
    gap: 16,
    padding: 16,
  },
  card: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: 12,
    borderRadius: 10,
    shadowColor: '#000000',
    shadowOpacity: 0.1,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardTitle: {
    fontSize: 12,
  },
  cardValue: {
    fontSize: 17,
    fontWeight: '700',
  },
});
