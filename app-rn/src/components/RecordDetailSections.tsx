// SaleRecordDetailView.swift の ProductInfoSection / ExpenseDetailSection と、
// それらが使う行部品。Swift 版でも DataView.swift の内訳（RecordDisclosure）が
// 同じ 2 つを import して使い回していたので、RN 版でも共通部品として切り出す。
//
// 金額の表示は必ず formatYen（= roundForDisplay）を通す（SPEC §2.6）。
// レコードの値は Double のまま渡し、丸めるのはここが最後。
import type { ReactNode } from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { fromDbDate } from '@/db/dates';
import type { SaleRecord } from '@/db/schema';
import { formatRecordDate, formatYen } from '@/logic/format';
import { commissionCost, netProfit, roundForDisplay, totalExpenses } from '@/logic/profit';
import { useThemeColors } from '@/theme';

/** 日付が未設定のときの表示（Swift 版 ?? "未設定"） */
const UNSET_DATE = '未設定';

/** 商品情報カード（Swift 版 ProductInfoSection） */
export function ProductInfoSection({ record }: { record: SaleRecord }) {
  const colors = useThemeColors();
  const profit = netProfit(record);

  return (
    <DetailCard title="📦 商品情報">
      <DetailTextLine label="商品名" value={record.itemName === '' ? '無題' : record.itemName} />
      <DetailTextLine label="出品日" value={formatRecordDate(fromDbDate(record.saleStartDate))} />
      {record.isSold ? (
        <DetailTextLine
          label="販売日"
          value={
            record.saleDate == null ? UNSET_DATE : formatRecordDate(fromDbDate(record.saleDate))
          }
        />
      ) : (
        <DetailTextLine label="状態" value="出品中" />
      )}

      <DetailAmountLine label="販売価格" amount={record.salesPrice} color={colors.green} />
      <DetailAmountLine label="経費合計" amount={totalExpenses(record)} color={colors.red} />

      <View style={[styles.separator, { backgroundColor: colors.separator }]} />

      <View style={styles.totalRow}>
        <Text style={[styles.totalLabel, { color: colors.label }]}>純利益</Text>
        <Text style={[styles.profitValue, { color: profit >= 0 ? colors.green : colors.red }]}>
          {formatYen(profit)}
        </Text>
      </View>
    </DetailCard>
  );
}

/** 費用内訳カード（Swift 版 ExpenseDetailSection） */
export function ExpenseDetailSection({ record }: { record: SaleRecord }) {
  const colors = useThemeColors();

  return (
    <DetailCard title="💰 費用内訳">
      <DetailAmountLine label="仕入価格" amount={record.purchasePrice} color={colors.red} />
      <DetailAmountLine label="送料" amount={record.postage} color={colors.red} />
      <DetailAmountLine label="梱包材" amount={record.envelopeCost} color={colors.red} />
      <DetailAmountLine label="その他" amount={record.othersCost} color={colors.red} />

      <View style={styles.line}>
        {/* 手数料「率」も表示時に丸める（決定 §7-5: Int キャストではなく Math.round） */}
        <Text style={[styles.lineLabel, { color: colors.secondaryLabel }]}>
          手数料 ({roundForDisplay(record.commission)}%)
        </Text>
        <Text style={[styles.lineValue, { color: colors.orange }]}>
          {formatYen(commissionCost(record))}
        </Text>
      </View>

      <View style={[styles.separator, { backgroundColor: colors.separator }]} />

      <View style={styles.totalRow}>
        <Text style={[styles.totalLabel, { color: colors.label }]}>経費合計</Text>
        <Text style={[styles.totalValue, { color: colors.red }]}>
          {formatYen(totalExpenses(record))}
        </Text>
      </View>
    </DetailCard>
  );
}

/** 見出し付きのカード（Swift 版の各 Section に共通する装飾） */
export function DetailCard({
  title,
  style,
  children,
}: {
  title: string;
  /** 入れ子で使うときに地色などを上書きする（DataView の内訳は既にカードの中にいる） */
  style?: ViewStyle;
  children: ReactNode;
}) {
  const colors = useThemeColors();

  return (
    <View style={[styles.card, { backgroundColor: colors.secondaryBackground }, style]}>
      <Text style={[styles.cardTitle, { color: colors.label }]}>{title}</Text>
      {children}
    </View>
  );
}

/** ラベルと文字列の 1 行（Swift 版 DetailTextLine） */
export function DetailTextLine({ label, value }: { label: string; value: string }) {
  const colors = useThemeColors();

  return (
    <View style={styles.line}>
      <Text style={[styles.lineLabel, { color: colors.secondaryLabel }]}>{label}：</Text>
      <Text style={[styles.lineValue, { color: colors.label }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

/** ラベルと金額の 1 行（Swift 版 DetailAmountLine）。0 円のときだけ色を付けない */
export function DetailAmountLine({
  label,
  amount,
  color,
}: {
  label: string;
  amount: number;
  color: string;
}) {
  const colors = useThemeColors();

  return (
    <View style={styles.line}>
      <Text style={[styles.lineLabel, { color: colors.secondaryLabel }]}>{label}：</Text>
      <Text style={[styles.lineValue, { color: amount === 0 ? colors.label : color }]}>
        {formatYen(amount)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
    borderRadius: 12,
    gap: 12,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  lineLabel: {
    fontSize: 15,
  },
  lineValue: {
    fontSize: 15,
    flexShrink: 1,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  totalLabel: {
    fontSize: 15,
    fontWeight: '700',
  },
  totalValue: {
    fontSize: 15,
    fontWeight: '700',
  },
  profitValue: {
    fontSize: 20,
    fontWeight: '700',
  },
});
