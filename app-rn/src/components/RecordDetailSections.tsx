// レコード 1 件を金額の流れとして見せるカード。
//
// - ReceiptCard: レコード詳細のレシート（UI-SPEC §1.4-4 / 採用案 3d）。
//   販売価格から控除を縦に引いて結果行に至る 1 枚。詳細画面の主役はこれ 1 つで、
//   商品情報・費用内訳の 2 枚に分かれていた旧構成を畳んだもの。
//   種別・日付はカードの外（メタ行）へ、下部の 1 件サマリーは廃止（§5-12）。
//   **先頭に帯グラフ（RecordBreakdownBar）が入り、各行の頭に帯と同じ色のドットが付く。**
//   帯の下に独立した凡例（色・項目名・割合の一覧）は置かない ── 同じ項目名が
//   レシートと 2 列に分かれて並び、どちらを読む列なのかが決まらなかったため。
// - SaleStatusCard: 状態カード（§1.4-5 / §8）。状態ごとに 1 個のボタンと、
//   売れた記録である限り常設する「売れた日」の行。
//
// 旧構成の 2 枚（ProductInfoSection / ExpenseDetailSection。Swift 版からの移植）は
// **削除した** ── データタブの内訳が RecordRow に替わった時点（§6-11）で、
// どこからも呼ばれなくなっていた。
//
// 金額の表示は必ず formatYen（= roundForDisplay）を通す（SPEC §2.6）。
// レコードの値は Double のまま渡し、丸めるのはここが最後。
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CalendarPicker } from '@/components/CalendarPicker';
import { partColor } from '@/components/CostProportionBar';
import { DateChips } from '@/components/DateChips';
import { RecordBreakdownBar } from '@/components/RecordBreakdownBar';
import { fromDbDate } from '@/db/dates';
import { dayChips } from '@/logic/calendar';
import type { SaleRecord } from '@/db/schema';
import { formatRecordDate, formatYen } from '@/logic/format';
import {
  AMOUNT_PLACEHOLDER,
  ENVELOPE_AND_OTHERS_FIELD_LABEL,
  LISTING_STATUS_LABEL,
  MARK_AS_SOLD_BUTTON_LABEL,
  POSTAGE_LABEL,
  PURCHASE_PRICE_LABEL,
  REVERT_TO_LISTING_BUTTON_LABEL,
  SALES_PRICE_LABEL,
  SOLD_DATE_ROW_LABEL,
  SOLD_RECORDS_LABEL,
  UNSET_INPUT_LABEL,
  commissionRowLabel,
  deductionLabel,
  profitLabel,
  soldDateNotes,
  todayDateLabel,
} from '@/logic/labels';
import { daysBetween } from '@/logic/listingDays';
import { commissionCost, netProfit, roundForDisplay } from '@/logic/profit';
import { findBarPart, recordBreakdown, showsPricedAmounts } from '@/logic/recordBreakdown';
import type { BreakdownPartKey } from '@/logic/calcForm';
import { saleDateRange } from '@/logic/saleDate';
import { useThemeColors } from '@/theme';
import { LongPressCopy } from '@/components/LongPressCopy';

/**
 * レコード詳細のレシートカード（UI-SPEC §1.4-4 / 採用案 3d）。
 *
 *     ████████████░░░░░░░░░░░░░░░  ← 帯グラフ（RecordBreakdownBar）
 *     ○ 販売価格          1,800 円
 *     ────────────────────────────
 *     ● − 仕入価格（仕入品のみ）  赤
 *     ● − 送料                    赤
 *     ● − 販売手数料 (10%)    オレンジ
 *     ● − 梱包材・その他（未入力なら 40% グレー）
 *     ════════════════════════════
 *     ● 純利益 / 利益       1,405 円
 *
 * 控除は大きい順（仕入 → 送料 → 手数料 → 梱包材）。記録フォームの伝票（§1.3）と同じ並びで、
 * 入力した順に読み返せるようにしてある。結果行の語が種別語（純利益 / 利益）なので、
 * 廃止した下部 1 件サマリーの役割もここが引き取る（§5-12）。
 *
 * **行の並びは帯の区画の並びと違う**（帯は計算タブと同じ 利益 → 手数料 → 仕入 → 送料 → 梱包材）。
 * レシートは「上から引いていく」流れが読み方そのものなので、帯に合わせて並べ替えない ──
 * どの行がどの区画かはドットの色が示すので、並びまで揃える必要がない。
 *
 * 割合（%）はレシートには出さない。帯の長さがすでに割合で、幅のある区画には
 * 帯の中に % が入っている ── 行にも数字で置くと、同じことを 2 通りで言うことになる。
 */
export function ReceiptCard({ record }: { record: SaleRecord }) {
  const colors = useThemeColors();
  const profit = netProfit(record);
  // 梱包材とその他は伝票では 1 行にまとめる（UI-SPEC §1.4-4）
  const packingCost = record.envelopeCost + record.othersCost;
  // 価格未設定では販売価格に依存する額（販売価格そのもの・利益）を確定した数字として出さない
  // （帯グラフと同じ判定。logic/recordBreakdown.ts の showsPricedAmounts）
  const priced = showsPricedAmounts(record);

  // 帯グラフ（カード先頭）と行を色で結ぶためのドット。独立した凡例は置かない ──
  // 同じ項目名が 2 つの列に分かれて並び、どちらを読む列なのかが決まらなかったため。
  const breakdown = recordBreakdown(record);
  const dotColor = (key: BreakdownPartKey): string => {
    const part = findBarPart(breakdown, key);
    // 金額が出ていない項目（0 円・赤字の利益）はグレー。**`inBar` では判定しない** ──
    // 赤字の帯は単色 1 本で区画を持たないので、そちらで決めると
    // 赤字の記録だけレシートのドットが全部グレーになる（findBarPart のコメント参照）
    return part != null && part.amount > 0 ? partColor(key, colors) : colors.gray;
  };

  return (
    <View style={[styles.card, styles.receiptCard, { backgroundColor: colors.secondaryBackground, paddingTop: 0 }]}>
      {/* 同じ 1 件を横の割合で見せる帯（出品中・売却済み共通）。下の行のドットと同じ配色で、
          間はこのカードの行間だけ ── 色の対応を目で結べる距離に置く */}
      <RecordBreakdownBar record={record} />

      <View style={styles.receiptRow}>
        {/* 販売価格は帯そのもの（＝全長）なので、対応するドットは無い。
            それでも行名の左端は他の行と揃える（列がずれると別の表に見える） */}
        <View style={styles.receiptLabelGroup}>
          <View style={styles.dotPlaceholder} />
          <Text style={[styles.receiptLabel, { color: colors.label }]}>{SALES_PRICE_LABEL}</Text>
        </View>
        <LongPressCopy label={SALES_PRICE_LABEL} text={record.salesPrice.toString()}>
          <Text
            style={[styles.salesPrice, { color: priced ? colors.label : colors.mutedLabel }]}>
            {priced ? formatYen(record.salesPrice) : UNSET_INPUT_LABEL}
          </Text>
        </LongPressCopy>
      </View>

      <View style={[styles.separator, { backgroundColor: colors.separator }]} />

      {/* 不用品は仕入価格の概念がない（常に 0）ので行ごと出さない（SPEC-V2 §1.3 / UI-SPEC §5-11） */}
      {record.kind === 'sourced' && (
        <ReceiptDeductionRow
          label={PURCHASE_PRICE_LABEL}
          amount={record.purchasePrice}
          color={colors.red}
          dotColor={dotColor('purchasePrice')}
        />
      )}
      <ReceiptDeductionRow
        label={POSTAGE_LABEL}
        amount={record.postage}
        color={colors.red}
        dotColor={dotColor('postage')}
      />
      {/* 手数料「率」も表示時に丸める（決定 §7-5: Int キャストではなく Math.round） */}
      <ReceiptDeductionRow
        label={commissionRowLabel(roundForDisplay(record.commission))}
        amount={commissionCost(record)}
        color={colors.orange}
        dotColor={dotColor('commission')}
      />
      {/* 販売サイト名の写し（SPEC-V3 §1.5.1）。手数料行の下に薄く 1 行。
          「✕」は置かない ── 詳細は表示専用の画面で、直すのはフォーム経由（§4.2）。
          未設定（空文字）の記録では行ごと出ないので、既存の記録の見た目は変わらない */}
      {record.siteName !== '' && (
        <Text style={[styles.siteName, { color: colors.secondaryLabel }]} numberOfLines={1}>
          {record.siteName}
        </Text>
      )}
      <ReceiptDeductionRow
        label={ENVELOPE_AND_OTHERS_FIELD_LABEL}
        amount={packingCost}
        color={colors.red}
        dotColor={dotColor('envelopeCost')}
        // 0 のときは金額ではなく「未入力」（UI-SPEC §1.4-4）。「0 円かけた」ではなく
        // 「まだ入れていない」ことを言う欄なので、金額と同じ濃さでは出さない
        unsetText={packingCost === 0 ? UNSET_INPUT_LABEL : undefined}
      />

      <View style={[styles.totalSeparator, { backgroundColor: colors.separator }]} />

      <View style={styles.receiptRow}>
        {/* カード 1 枚 = レコード 1 件なので種別語（SPEC-V2 §1.3 / §5.3） */}
        <View style={styles.receiptLabelGroup}>
          {/* 結果行にも同じドットを付ける。帯の緑の区画がこの額であることを示す
              （赤字のときは帯に緑の区画が無いのでグレーになる） */}
          <View style={[styles.dot, { backgroundColor: dotColor('kept') }]} />
          <Text style={[styles.resultLabel, { color: colors.label }]}>
            {profitLabel('ja', record.kind)}
          </Text>
        </View>
        <LongPressCopy label={profitLabel('ja', record.kind)} text={profit.toString()}>
          <Text
            style={[
              styles.resultAmount,
              {
                // 価格未設定では利益も未確定（帯グラフと同じ扱い。showsPricedAmounts）。
                // 0 円で売れた体の赤字額をそのまま出すと、確定した損失に見えてしまう
                color: !priced ? colors.mutedLabel : profit >= 0 ? colors.green : colors.red,
              },
            ]}>
            {priced ? formatYen(profit) : AMOUNT_PLACEHOLDER}
          </Text>
        </LongPressCopy>
      </View>
    </View>
  );
}

/** レシートの控除行「● − 送料　　300 円」（UI-SPEC §1.4-4） */
function ReceiptDeductionRow({
  label,
  amount,
  color,
  dotColor,
  unsetText,
}: {
  label: string;
  amount: number;
  color: string;
  /** 行名の前に置く、帯の区画と同じ色のドット。帯に区画が無い項目はグレー */
  dotColor: string;
  /** 渡すと金額の代わりにこの文字を 40% グレーで出す */
  unsetText?: string;
}) {
  const colors = useThemeColors();

  return (
    <View style={styles.receiptRow}>
      <View style={styles.receiptLabelGroup}>
        <View style={[styles.dot, { backgroundColor: dotColor }]} />
        <Text style={[styles.receiptLabel, { color: colors.label }]}>{deductionLabel('ja', label)}</Text>
      </View>
      <LongPressCopy label={label} text={amount.toString()}>
        <Text
          style={[
            styles.deductionAmount,
            { color: unsetText != null ? colors.mutedLabel : color },
          ]}>
          {unsetText ?? formatYen(amount)}
        </Text>
      </LongPressCopy>
    </View>
  );
}

/**
 * 状態カード（UI-SPEC §1.4-5 / §8.7 / §8.9）。旧・売却トグル（SaleStatusToggleCard）の後継。
 *
 *     出品中: [出品中]                    ┌──────────┐
 *                                         │ ✓ 売れた │
 *                                         └──────────┘
 *
 *     売れた: [売れた記録]                ┌────────────────┐
 *                                         │ 出品中に戻す   │
 *                                         └────────────────┘
 *             売れた日   今日（2026/08/10）  ▸
 *             [ 今日 ] [ 昨日 ] [ 一昨日 ]
 *
 * トグルをやめて状態ごとに 1 個のボタンにしたのは、「押した時点で今日として確定し
 * （追加タップ 0）、直せる場所を画面に残し続ける」ため（§8 の方針）。
 * 訂正を先払いさせない代わりに、売れた日の行は**売れた記録である限り常設**する（§8.2）。
 *
 * 案 16a（§8.9）で幅いっぱいの塗りボタンをやめ、状態バッジと対で横に並べた ──
 * 幅いっぱいのボタンは「何の状態に対する操作なのか」を押す前に示せなかったため。
 * **実行側は塗り・戻す側は枠線**。確認ダイアログの有無（順方向はなし・逆方向はあり。§8.4）と
 * 同じ非対称を見た目に写したもので、主たる操作がどちらかを色の重さで示す。
 *
 * §8.9 が実装時送りにしていた**重複の整理**は、実機で見て**補足行を落とす**ことに決めた。
 * 補足行（「8/9 に出品・1日経過」）はメタ行から種別を抜いただけの同じ事実で、
 * 短いレコードでは同時に画面へ入って 2 度読ませていた。バッジのほうを残すのは、
 * **ボタンの主語**だから ── 左のバッジと右のボタンが対になっているのが 16a の要点で、
 * これを落とすと 16a が直そうとした「語だけのボタン」に戻る。
 * メタ行のバッジと語が重なる（出品中／売れた）が、あちらは記録そのものの見出し、
 * こちらは操作の対象で、役割が違う（§5-13 の判断を維持）。
 *
 * 書き込むのは呼び出し側（詳細画面は押した時点で即保存。§8.6）。ここは押されたことと
 * 選ばれた日付を伝えるだけで、確認ダイアログ・undo バーの出し分けも持たない。
 */
export function SaleStatusCard({
  record,
  today,
  highlighted,
  onMarkSold,
  onRevertToListing,
  onChangeSaleDate,
  onPressSoldDate,
}: {
  record: SaleRecord;
  /** 「今日」の基準（画面のマウント時に 1 回だけ決めたもの） */
  today: Date;
  /** 売れた日の行に薄い青の下地を敷く（§8.3。押した直後の数秒だけ） */
  highlighted: boolean;
  onMarkSold: () => void;
  onRevertToListing: () => void;
  onChangeSaleDate: (value: Date) => void;
  /** 売れた日の行を押したとき。ハイライトは役目を終えるので呼び出し側で解除する（§8.3） */
  onPressSoldDate: () => void;
}) {
  const colors = useThemeColors();
  const saleStartDate = fromDbDate(record.saleStartDate);
  const saleDate = record.saleDate == null ? null : fromDbDate(record.saleDate);

  return (
    <View style={styles.statusSection}>
      <View style={[styles.card, styles.statusCard, { backgroundColor: colors.secondaryBackground }]}>
        {/* 左: ボタンの主語。右のボタンが何に対する操作かをその場で読めるようにする */}
        <View
          style={[
            styles.statusBadge,
            { backgroundColor: record.isSold ? colors.green : colors.orange },
          ]}>
          <Text style={styles.statusBadgeText}>
            {record.isSold ? SOLD_RECORDS_LABEL : LISTING_STATUS_LABEL}
          </Text>
        </View>

        {/* 右: 操作 */}
        {record.isSold ? (
          <StatusButton
            label={REVERT_TO_LISTING_BUTTON_LABEL}
            onPress={onRevertToListing}
            // 戻す側は「入力済みの日付が消える」操作なので、押しやすい塗りにはしない（§8.4 / §8.9）
            textColor={colors.orange}
            borderColor={colors.orange}
          />
        ) : (
          <StatusButton
            label={MARK_AS_SOLD_BUTTON_LABEL}
            onPress={onMarkSold}
            backgroundColor={colors.green}
            textColor="#FFFFFF"
            icon="checkmark"
          />
        )}
      </View>

      {/* 出品中に販売日はない（SPEC.md §3.2）ので、売れた記録のときだけ出す（§8.2） */}
      {record.isSold && saleDate != null && (
        <SoldDateRow
          value={saleDate}
          saleStartDate={saleStartDate}
          today={today}
          highlighted={highlighted}
          onChangeValue={onChangeSaleDate}
          onPress={onPressSoldDate}
        />
      )}
    </View>
  );
}

/**
 * 状態カードのボタン（UI-SPEC §8.1 / §8.4 / §8.9）。
 * 塗り（backgroundColor）と枠線（borderColor）のどちらで出すかは呼び出し側が決める ──
 * 実行側は塗り、戻す側は枠線。
 */
function StatusButton({
  label,
  onPress,
  backgroundColor,
  textColor,
  borderColor,
  icon,
}: {
  label: string;
  onPress: () => void;
  backgroundColor?: string;
  textColor: string;
  borderColor?: string;
  /** 主たる操作にだけ付ける（「✓ 売れた」。§8.9） */
  icon?: 'checkmark';
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.statusButton,
        backgroundColor != null && { backgroundColor },
        borderColor != null && { borderColor, borderWidth: 1 },
        { opacity: pressed ? 0.7 : 1 },
      ]}>
      {icon != null && <Ionicons name={icon} size={17} color={textColor} />}
      <Text style={[styles.statusButtonLabel, { color: textColor }]}>{label}</Text>
    </Pressable>
  );
}

/**
 * 売れた日の行（UI-SPEC §8.2）:
 *
 *     売れた日            今日（2026/08/10） ▸
 *     [ 今日 ] [ 昨日 ] [ 一昨日 ]
 *
 * **売れた記録である限り常設**する恒久的な訂正口。undo バー（§8.3）と違って消えない。
 *
 * 多数派の日付は行のチップで 1 タップで直せる（§8.10.1）。それ以外は値を押して
 * カレンダー（§8.10.2）を開く。選べるのは [出品日, 今日]（§8.5）で、チップの淡色と
 * 盤面が同じ範囲を見る ── 記録フォームの日付行（DateField）とまったく同じ規則。
 *
 * 保存済みの値がその範囲を外れている場合（出品日を後から未来に動かした等）は
 * **そのまま表示する**（表示を偽らない）。範囲へ寄せるのはピッカーを開いたとき。
 */
function SoldDateRow({
  value,
  saleStartDate,
  today,
  highlighted,
  onChangeValue,
  onPress,
}: {
  value: Date;
  saleStartDate: Date;
  today: Date;
  highlighted: boolean;
  onChangeValue: (value: Date) => void;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  const [showPicker, setShowPicker] = useState(false);

  // 当日は「今日（2026/08/10）」、それ以外は日付そのもの（§8.2。§1.3-12 と同じ規則）
  const isToday = daysBetween(value, today) === 0;
  const text = isToday ? todayDateLabel('ja', formatRecordDate(value)) : formatRecordDate(value);
  const range = saleDateRange(saleStartDate, today);
  const chips = dayChips({ today, range: { min: range.min, max: range.max }, selected: value });
  // 淡色のチップと理由の一行は 1 組（§8.10.5）。語は記録フォームの販売日の行と同じ
  const notes = soldDateNotes('ja', saleStartDate, today);

  /** 行に触れた時点でハイライトは役目を終える（§8.3）。チップで直した場合も同じ */
  const changeValue = (next: Date) => {
    onPress();
    onChangeValue(next);
  };

  return (
    <>
      <View
        style={[
          styles.card,
          styles.soldDateRow,
          {
            backgroundColor: highlighted ? colors.highlightBackground : colors.secondaryBackground,
          },
        ]}>
        <View style={styles.soldDateValueRow}>
          <Text style={[styles.soldDateLabel, { color: colors.label }]}>{SOLD_DATE_ROW_LABEL}</Text>
          <Pressable
            onPress={() => {
              onPress();
              setShowPicker(true);
            }}
            accessibilityRole="button"
            accessibilityLabel={`${SOLD_DATE_ROW_LABEL}: ${text}`}
            style={({ pressed }) => [styles.soldDateValue, { opacity: pressed ? 0.5 : 1 }]}>
            <Text style={[styles.soldDateText, { color: isToday ? colors.blue : colors.label }]}>
              {text}
            </Text>
            <Text style={[styles.chevron, { color: colors.mutedLabel }]}>▸</Text>
          </Pressable>
        </View>

        <DateChips chips={chips} onSelect={changeValue} note={notes.chips} />
      </View>

      {showPicker && (
        <CalendarPicker
          title={SOLD_DATE_ROW_LABEL}
          value={value}
          onChangeValue={onChangeValue}
          onClose={() => setShowPicker(false)}
          minDate={range.min}
          maxDate={range.max}
          today={today}
          // 範囲の下端がどこかを盤面の上でも示す（§8.10 の「出品日に小さな旗」）
          flagDate={saleStartDate}
          note={notes.calendar}
        />
      )}
    </>
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
  receiptLabelGroup: {
    // ドットと行名で 1 つの塊。行名の左端が全行で揃うように、置かない行にも同じ幅を空ける
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
    gap: 8,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  dotPlaceholder: {
    // ドットの無い行（販売価格）の字下げ。dot と同じ幅
    width: 10,
  },
  receiptLabel: {
    flexShrink: 1,
    fontSize: 15,
  },
  salesPrice: {
    fontSize: 24,
    fontWeight: '700',
  },
  siteName: {
    // 手数料行に付く補足なので、行名（15px）より小さく・上に詰めて出す（SPEC-V3 §1.5.1）
    fontSize: 13,
    marginTop: -6,
    // 行名の左端に合わせる（ドット 10 ＋ 間隔 8）。揃っていないと手数料行の補足に見えない
    marginLeft: 18,
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
  statusSection: {
    // ボタンと売れた日の行は別のカード。「消えるもの（バー）と残るもの（行）」を
    // 混同させないのと同じ理由で、操作と訂正口は面を分けておく（UI-SPEC §8.3）
    gap: 8,
  },
  statusCard: {
    // 左（状態の説明）と右（操作）を横に並べる（UI-SPEC §8.9）
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    gap: 12,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  statusBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  statusButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 44,
    // 幅いっぱいをやめたぶん、押せる面は左右の余白で確保する（§8.9）
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  statusButtonLabel: {
    fontSize: 16,
    fontWeight: '700',
  },
  soldDateRow: {
    gap: 10,
    paddingVertical: 12,
  },
  soldDateValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  soldDateLabel: {
    fontSize: 16,
  },
  soldDateValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  soldDateText: {
    fontSize: 16,
  },
  chevron: {
    fontSize: 14,
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
