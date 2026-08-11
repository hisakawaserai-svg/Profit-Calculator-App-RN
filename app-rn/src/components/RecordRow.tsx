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
// - 純利益は符号つき（「+¥1,240」）。正負を緑／赤だけに預けない（§0.1。設計案 30b）。
// - タグはメタ行の左端、日付の後ろに**点 ＋ 名前**で続ける（§2.3。設計案 30b）。
import { StyleSheet, Text, View } from 'react-native';

import { TagDot } from '@/components/TagChip';
import { fromDbDate } from '@/db/dates';
import type { SaleRecord, Tag } from '@/db/schema';
import {
  formatApproxYenSymbol,
  formatElapsedDays,
  formatShortDate,
  formatSignedYenSymbol,
  formatYenSymbol,
} from '@/logic/format';
import {
  EXPENSES_LABEL,
  LISTED_DATE_LABEL,
  SOLD_DATE_LABEL,
  expectedProfitText,
  UNTITLED_LABEL,
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
  /**
   * この記録に付いたタグ（sortOrder 昇順。§1.5）。省略・空なら何も出さない ──
   * 付いていない記録の方が多いので、空欄や「なし」の語で行を太らせない。
   */
  tags?: readonly Tag[];
};

export function RecordRow({ record, isSoldMode, today, tags = [] }: Props) {
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
          {record.itemName === '' ? UNTITLED_LABEL : record.itemName}
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
          {/* 売れた記録は損益なので符号つき。出品中の主金額（出品価格）は損益ではないので素のまま */}
          {isSoldMode ? formatSignedYenSymbol(profit) : formatYenSymbol(record.salesPrice)}
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

      {/* タグは**メタ行と同じ列の下に独立して置く**（§2.3）。設計案 30b は日付の後ろに
          続けていたが、実際の行にはメタ行の右（「経費 ¥…」「売れたら 約¥…・N 日経過」）が
          あり、同じ行に入れると日付もタグ名も両方省略されて読めなくなる。
          **チップにはしない** ── 点 ＋ 名前だけの方がメタ行の他の語と同じ重さで読める
          （チップにすると行の中で最も目立つ要素になる）。 */}
      {tags.length > 0 && (
        <View style={styles.tagLine}>
          {tags.map((tag) => (
            <View key={tag.id} style={styles.tagItem}>
              <TagDot colorKey={tag.colorKey} />
              <Text style={[styles.meta, { color: colors.secondaryLabel }]} numberOfLines={1}>
                {tag.name}
              </Text>
            </View>
          ))}
        </View>
      )}
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
  // タグが多い記録でも行の高さが伸び続けないよう、折り返さず 1 行に収める
  tagLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    overflow: 'hidden',
  },
  tagItem: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  meta: {
    flexShrink: 1,
    fontSize: 12,
  },
});
