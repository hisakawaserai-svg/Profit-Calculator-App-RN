// 一覧の 1 行（UI-SPEC §1.2「行の出し分け」）。記録タブとデータタブの内訳リストで共用する（§6-11）。
//
// 2 段構成:
//   1 段目 = 商品名（左）＋ 主金額（右）
//   2 段目 = メタ行。左に「{種別}　M/D 販売 / 出品」、右に補足
//
// | 状態     | 主金額                        | メタ行の右                        |
// |----------|-------------------------------|-----------------------------------|
// | 売れた   | 純利益（ラベルなし・正緑/負赤） | 「経費 ¥…」                       |
// | 出品中   | 出品価格（黒）                 | 「売れたら 約¥…・N 日経過」        |
//
// - 金額ラベル（純利益: / 利益:）は廃止し金額だけを出す（§6-2）。
//   代わりに種別をメタ行に常時表示する（§6-1）。
// - 見込み額には常に「約」を付ける。送料未入力かどうかの判定はしない（§5-3）。
// - 「N 日経過」は出品日起算・当日 0 日（§5-2。算出は logic/listingDays.ts）。
import { StyleSheet, Text, View } from 'react-native';

import { fromDbDate } from '@/db/dates';
import type { SaleRecord } from '@/db/schema';
import {
  formatApproxYenSymbol,
  formatElapsedDays,
  formatShortDate,
  formatYenSymbol,
} from '@/logic/format';
import {
  EXPENSES_LABEL,
  LISTED_DATE_LABEL,
  SOLD_DATE_LABEL,
  expectedProfitText,
  recordKindLabel,
} from '@/logic/labels';
import { listingDays } from '@/logic/listingDays';
import { netProfit, totalExpenses } from '@/logic/profit';
import { useThemeColors } from '@/theme';

type Props = {
  record: SaleRecord;
  /** true = 売れた記録（売却済み） / false = 出品中 */
  isSoldMode: boolean;
  /** 「N 日経過」の基準日。省略時は今日（テスト・プレビューから固定日を渡せるように） */
  today?: Date;
};

export function RecordRow({ record, isSoldMode, today }: Props) {
  const colors = useThemeColors();
  const profit = netProfit(record);

  // 表示するのはグループ化と同じ基準日（SPEC §6.1）。出品中は saleDate が常に null なので出品日を出す
  const basisDate = isSoldMode ? record.saleDate : record.saleStartDate;
  const dateText =
    basisDate == null
      ? ''
      : `${formatShortDate(fromDbDate(basisDate))} ${isSoldMode ? SOLD_DATE_LABEL : LISTED_DATE_LABEL}`;

  return (
    <View style={styles.row}>
      <View style={styles.mainLine}>
        <Text style={[styles.itemName, { color: colors.label }]} numberOfLines={1}>
          {record.itemName === '' ? '無題' : record.itemName}
        </Text>
        <Text
          style={[
            styles.amount,
            // 売れた記録は正負で色を変える。出品中の主金額（出品価格）は損益ではないので黒
            {
              color: isSoldMode ? (profit >= 0 ? colors.green : colors.red) : colors.label,
            },
          ]}
          numberOfLines={1}>
          {formatYenSymbol(isSoldMode ? profit : record.salesPrice)}
        </Text>
      </View>

      <View style={styles.metaLine}>
        <Text style={[styles.meta, { color: colors.secondaryLabel }]} numberOfLines={1}>
          {/* 金額ラベルを廃止したぶん、種別はここで常時読めるようにする（§6-1） */}
          {recordKindLabel(record.kind)}
          {dateText === '' ? '' : `　${dateText}`}
        </Text>
        <Text style={[styles.meta, { color: colors.secondaryLabel }]} numberOfLines={1}>
          {isSoldMode
            ? `${EXPENSES_LABEL} ${formatYenSymbol(totalExpenses(record))}`
            : listingMetaText(record, profit, today ?? new Date())}
        </Text>
      </View>
    </View>
  );
}

/** 出品中のメタ行の右「売れたら 約¥…・N 日経過」（UI-SPEC §1.2 / §5-2 / §5-3） */
function listingMetaText(record: SaleRecord, profit: number, today: Date): string {
  const days = listingDays(
    {
      saleStartDate: fromDbDate(record.saleStartDate),
      saleDate: record.saleDate == null ? null : fromDbDate(record.saleDate),
    },
    today,
  );

  return `${expectedProfitText(formatApproxYenSymbol(profit))}・${formatElapsedDays(days)}`;
}

const styles = StyleSheet.create({
  row: {
    gap: 4,
  },
  mainLine: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
  },
  itemName: {
    flexShrink: 1,
    fontSize: 16,
    fontWeight: '600',
  },
  amount: {
    fontSize: 17,
    fontWeight: '700',
  },
  metaLine: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
  },
  meta: {
    flexShrink: 1,
    fontSize: 12,
  },
});
