// SaleRecord.swift の RecordRowView の移植。一覧のプレビュー行・月別詳細の行の両方で使う。
import { StyleSheet, Text, View } from 'react-native';

import { fromDbDate } from '@/db/dates';
import type { SaleRecord } from '@/db/schema';
import { formatRecordDate, formatYen } from '@/logic/format';
import { netProfit, totalExpenses } from '@/logic/profit';
import { useThemeColors } from '@/theme';

type Props = {
  record: SaleRecord;
  /** true = 実績（売却済み） / false = 出品中 */
  isSoldMode: boolean;
};

export function RecordRow({ record, isSoldMode }: Props) {
  const colors = useThemeColors();
  const profit = netProfit(record);
  const expenses = totalExpenses(record);

  // 表示するのはグループ化の基準日（SPEC §6.1）。
  // Swift 版の RecordRowView は saleDate のみを出していたが、この行は出品中タブでも使われ、
  // 出品中は saleDate が常に null（SPEC §1）で日付が消えてしまうため、
  // 出品中では saleStartDate（出品日）を出す。
  const basisDate = isSoldMode ? record.saleDate : record.saleStartDate;

  return (
    <View style={styles.row}>
      <Text style={[styles.itemName, { color: colors.label }]} numberOfLines={1}>
        {record.itemName === '' ? '無題' : record.itemName}
      </Text>

      <View style={styles.amounts}>
        <Text
          style={[styles.amount, { color: profit >= 0 ? colors.green : colors.red }]}
          numberOfLines={1}>
          純利益: {formatYen(profit)}
        </Text>
        <Text
          style={[styles.amount, { color: expenses >= 0 ? colors.red : colors.label }]}
          numberOfLines={1}>
          経費: {formatYen(expenses)}
        </Text>
      </View>

      {basisDate != null && (
        <Text style={[styles.date, { color: colors.secondaryLabel }]} numberOfLines={1}>
          {formatRecordDate(fromDbDate(basisDate))}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: 4,
    paddingHorizontal: 5,
  },
  itemName: {
    fontSize: 17,
    fontWeight: '600',
  },
  amounts: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 15,
  },
  amount: {
    fontSize: 15,
    flexShrink: 1,
  },
  date: {
    fontSize: 12,
  },
});
