// レコード 1 件を金額の流れとして見せるカード。
//
// - ReceiptCard: レコード詳細のレシート（UI-SPEC §1.4-4 / 採用案 3d）。
//   販売価格から控除を縦に引いて結果行に至る 1 枚。詳細画面の主役はこれ 1 つで、
//   商品情報・費用内訳の 2 枚に分かれていた旧構成を畳んだもの。
//   種別・日付はカードの外（メタ行）へ、下部の 1 件サマリーは廃止（§5-12）。
// - ProductInfoSection / ExpenseDetailSection: 旧構成の 2 枚（Swift 版からの移植）。
//   データタブの内訳（DataScreen）がまだ使っている。記録タブと同じ RecordRow に
//   差し替えるのはステップ 5（§6-11）なので、それまで残す。
//
// 金額の表示は必ず formatYen（= roundForDisplay）を通す（SPEC §2.6）。
// レコードの値は Double のまま渡し、丸めるのはここが最後。
import type { ReactNode } from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { fromDbDate } from '@/db/dates';
import type { SaleRecord } from '@/db/schema';
import { formatRecordDate, formatYen } from '@/logic/format';
import {
  ENVELOPE_AND_OTHERS_FIELD_LABEL,
  EXPENSES_LABEL,
  POSTAGE_LABEL,
  PURCHASE_PRICE_LABEL,
  SALES_PRICE_LABEL,
  UNSET_INPUT_LABEL,
  UNTITLED_LABEL,
  commissionRowLabel,
  deductionLabel,
  profitLabel,
  recordKindLabel,
} from '@/logic/labels';
import { commissionCost, netProfit, roundForDisplay, totalExpenses } from '@/logic/profit';
import { useThemeColors } from '@/theme';

/** 日付が未設定のときの表示（Swift 版 ?? "未設定"） */
const UNSET_DATE = '未設定';

/**
 * レコード詳細のレシートカード（UI-SPEC §1.4-4 / 採用案 3d）。
 *
 *     販売価格            1,800 円
 *     ────────────────────────────
 *     − 仕入価格（仕入品のみ）  赤
 *     − 送料                    赤
 *     − 販売手数料 (10%)    オレンジ
 *     − 梱包材・その他（未入力なら 40% グレー）
 *     ════════════════════════════
 *     純利益 / 利益         1,405 円
 *
 * 控除は大きい順（仕入 → 送料 → 手数料 → 梱包材）。記録フォームの伝票（§1.3）と同じ並びで、
 * 入力した順に読み返せるようにしてある。結果行の語が種別語（純利益 / 利益）なので、
 * 廃止した下部 1 件サマリーの役割もここが引き取る（§5-12）。
 */
export function ReceiptCard({ record }: { record: SaleRecord }) {
  const colors = useThemeColors();
  const profit = netProfit(record);
  // 梱包材とその他は伝票では 1 行にまとめる（UI-SPEC §1.4-4）
  const packingCost = record.envelopeCost + record.othersCost;

  return (
    <View style={[styles.card, styles.receiptCard, { backgroundColor: colors.secondaryBackground }]}>
      <View style={styles.receiptRow}>
        <Text style={[styles.receiptLabel, { color: colors.label }]}>{SALES_PRICE_LABEL}</Text>
        <Text style={[styles.salesPrice, { color: colors.label }]}>
          {formatYen(record.salesPrice)}
        </Text>
      </View>

      <View style={[styles.separator, { backgroundColor: colors.separator }]} />

      {/* 不用品は仕入価格の概念がない（常に 0）ので行ごと出さない（SPEC-V2 §1.3 / UI-SPEC §5-11） */}
      {record.kind === 'sourced' && (
        <ReceiptDeductionRow
          label={PURCHASE_PRICE_LABEL}
          amount={record.purchasePrice}
          color={colors.red}
        />
      )}
      <ReceiptDeductionRow label={POSTAGE_LABEL} amount={record.postage} color={colors.red} />
      {/* 手数料「率」も表示時に丸める（決定 §7-5: Int キャストではなく Math.round） */}
      <ReceiptDeductionRow
        label={commissionRowLabel(roundForDisplay(record.commission))}
        amount={commissionCost(record)}
        color={colors.orange}
      />
      <ReceiptDeductionRow
        label={ENVELOPE_AND_OTHERS_FIELD_LABEL}
        amount={packingCost}
        color={colors.red}
        // 0 のときは金額ではなく「未入力」（UI-SPEC §1.4-4）。「0 円かけた」ではなく
        // 「まだ入れていない」ことを言う欄なので、金額と同じ濃さでは出さない
        unsetText={packingCost === 0 ? UNSET_INPUT_LABEL : undefined}
      />

      <View style={[styles.totalSeparator, { backgroundColor: colors.separator }]} />

      <View style={styles.receiptRow}>
        {/* カード 1 枚 = レコード 1 件なので種別語（SPEC-V2 §1.3 / §5.3） */}
        <Text style={[styles.resultLabel, { color: colors.label }]}>{profitLabel(record.kind)}</Text>
        <Text style={[styles.resultAmount, { color: profit >= 0 ? colors.green : colors.red }]}>
          {formatYen(profit)}
        </Text>
      </View>
    </View>
  );
}

/** レシートの控除行「− 送料　　300 円」（UI-SPEC §1.4-4） */
function ReceiptDeductionRow({
  label,
  amount,
  color,
  unsetText,
}: {
  label: string;
  amount: number;
  color: string;
  /** 渡すと金額の代わりにこの文字を 40% グレーで出す */
  unsetText?: string;
}) {
  const colors = useThemeColors();

  return (
    <View style={styles.receiptRow}>
      <Text style={[styles.receiptLabel, { color: colors.label }]}>{deductionLabel(label)}</Text>
      <Text
        style={[
          styles.deductionAmount,
          { color: unsetText != null ? colors.mutedLabel : color },
        ]}>
        {unsetText ?? formatYen(amount)}
      </Text>
    </View>
  );
}

/** 商品情報カード（Swift 版 ProductInfoSection） */
export function ProductInfoSection({ record }: { record: SaleRecord }) {
  const colors = useThemeColors();
  const profit = netProfit(record);

  return (
    <DetailCard title="📦 商品情報">
      {/* 一覧にはバッジを置かないので、種別が読めるのはこの 1 行だけ（SPEC-V2 §1.3 / §5.4） */}
      <DetailTextLine label="種別" value={recordKindLabel(record.kind)} />
      <DetailTextLine label="商品名" value={record.itemName === '' ? UNTITLED_LABEL : record.itemName} />
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

      <DetailAmountLine label={SALES_PRICE_LABEL} amount={record.salesPrice} color={colors.green} />
      <DetailAmountLine
        label={`${EXPENSES_LABEL}合計`}
        amount={totalExpenses(record)}
        color={colors.red}
      />

      <View style={[styles.separator, { backgroundColor: colors.separator }]} />

      <View style={styles.totalRow}>
        {/* カード 1 枚 = レコード 1 件なので種別語（SPEC-V2 §1.3 / §5.3） */}
        <Text style={[styles.totalLabel, { color: colors.label }]}>{profitLabel(record.kind)}</Text>
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
      {/* 不用品は仕入価格の概念がない（常に 0）ので行ごと出さない（SPEC-V2 §1.3）。他の行は共通 */}
      {record.kind === 'sourced' && (
        <DetailAmountLine label="仕入価格" amount={record.purchasePrice} color={colors.red} />
      )}
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
        <Text style={[styles.totalLabel, { color: colors.label }]}>{EXPENSES_LABEL}合計</Text>
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
  receiptCard: {
    // 行の間隔は狭め。数字の縦の並びが 1 本の流れに見えるようにする
    gap: 10,
  },
  receiptRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
  },
  receiptLabel: {
    flexShrink: 1,
    fontSize: 15,
  },
  salesPrice: {
    fontSize: 24,
    fontWeight: '700',
  },
  deductionAmount: {
    fontSize: 17,
  },
  totalSeparator: {
    // 結果行の手前だけ太い線（UI-SPEC §1.4-4）。ここから下が「引き終わったあと」
    height: 1.5,
  },
  resultLabel: {
    fontSize: 15,
    fontWeight: '700',
  },
  resultAmount: {
    fontSize: 34,
    fontWeight: '700',
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
