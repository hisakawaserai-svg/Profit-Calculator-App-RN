// 目標利益を決めるシート（SPEC-V9 §9.14）。「いくらで売る？」の最下段から開く。
//
// **書き先は記録フォームの目標欄と同じ 1 列**（`sale_records.target_profit`）。
// この画面が別の値を別の場所に持つことはしない ── 2 か所に持つと、
// どちらで直したかで表示が食い違う。
//
// 3 つだけ守ること:
// - placeholder は「決めていません」。**薄い 0 を置かない**（§2.2）── 消し忘れの 0 円に見える
// - 入れた額から出る 2 つの数字を**その場で**見せる（決めた後に何が変わるかを決める前に読める）
// - 消す道は「目標を消す」ボタンだけ。**0 を入れて消す道は作らない**（§1.2）──
//   0 は「利益ゼロを目標にする」という有効な目標で、消した状態とは別のもの
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { NumericField } from '@/components/NumericField';
import { SheetModal } from '@/components/SheetModal';
import type { RecordKind } from '@/db/schema';
import { formatYenSymbol } from '@/logic/format';
import {
  CANCEL_LABEL,
  SAVE_LABEL,
  TARGET_PREVIEW_PRICE_LABEL,
  TARGET_PREVIEW_ROOM_LABEL,
  TARGET_PROFIT_CLEAR_LABEL,
  TARGET_PROFIT_UNSET_LABEL,
  targetProfitLabel,
  targetProfitSheetTitle,
} from '@/logic/labels';
import { parseTargetProfitInput, targetProfitToInput } from '@/logic/recordForm';
import { targetSalesPrice, type TargetCostInput } from '@/logic/profit';
import { useThemeColors } from '@/theme';

type Props = {
  visible: boolean;
  kind: RecordKind;
  /** 今の記録の目標（null = 決めていない）。開くたびにこの値から始まる */
  targetProfit: number | null;
  /** 目標達成価格を出すための経費一式（式は logic/profit.ts のものだけを通す） */
  costs: TargetCostInput;
  /** 今の販売価格。「あと下げられる額」の元になる */
  currentPrice: number;
  onSave: (targetProfit: number | null) => void;
  onClose: () => void;
};

export function TargetProfitSheet({
  visible,
  kind,
  targetProfit,
  costs,
  currentPrice,
  onSave,
  onClose,
}: Props) {
  const colors = useThemeColors();
  // 入力中は文字列で持つ（記録フォームと同じ作法。§2.3）。**空欄 = null** の変換も同じ 1 本を通す
  const [input, setInput] = useState(() => targetProfitToInput(targetProfit));

  const parsed = parseTargetProfitInput(input);
  // 決めた場合に出る 2 つの数字。**null のときは出さない**（0 で代用しない。§7-3）
  const previewPrice = targetSalesPrice(parsed, costs);
  const previewRoom = previewPrice == null ? null : Math.max(0, currentPrice - previewPrice);

  return (
    <SheetModal visible={visible} onClose={onClose}>
      {(close) => (
        <View style={[styles.sheet, { backgroundColor: colors.background }]}>
          <Text style={[styles.title, { color: colors.label }]}>
            {targetProfitSheetTitle(kind)}
          </Text>

          <View style={[styles.card, { backgroundColor: colors.secondaryBackground }]}>
            <NumericField
              label={targetProfitLabel(kind)}
              value={input}
              onChangeValue={setInput}
              // 他の金額欄の placeholder は "0"（未入力＝0 円）だが、この欄の空欄は 0 ではない
              placeholder={TARGET_PROFIT_UNSET_LABEL}
              valueStyle={[styles.inputValue, { color: colors.green }]}
              canOpenSettings={false}
            />
          </View>

          {/* 決めると足される 2 つの数字（§9.14）。**決める前に見せる**のがこの節の役目 */}
          <View style={[styles.card, { backgroundColor: colors.secondaryBackground }]}>
            <PreviewRow
              label={TARGET_PREVIEW_PRICE_LABEL}
              value={previewPrice == null ? null : formatYenSymbol(previewPrice)}
            />
            <View style={[styles.separator, { backgroundColor: colors.separator }]} />
            <PreviewRow
              label={TARGET_PREVIEW_ROOM_LABEL}
              value={previewRoom == null ? null : formatYenSymbol(previewRoom)}
            />
          </View>

          <Pressable
            onPress={() => {
              onSave(parsed);
              close();
            }}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: colors.blue, opacity: pressed ? 0.7 : 1 },
            ]}>
            <Text style={styles.saveLabel}>{SAVE_LABEL}</Text>
          </Pressable>

          {/* 既に決めてある記録にだけ出す（§9.14）。空欄にして保存でも消せるが、
              「消す」がしたい人に空欄化を発見させる形にはしない */}
          {targetProfit != null && (
            <Pressable
              onPress={() => {
                onSave(null);
                close();
              }}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.button,
                { backgroundColor: colors.secondaryBackground, opacity: pressed ? 0.7 : 1 },
              ]}>
              <Text style={[styles.clearLabel, { color: colors.red }]}>
                {TARGET_PROFIT_CLEAR_LABEL}
              </Text>
            </Pressable>
          )}

          <Pressable
            onPress={close}
            accessibilityRole="button"
            style={({ pressed }) => [styles.textButton, { opacity: pressed ? 0.5 : 1 }]}>
            <Text style={[styles.cancelLabel, { color: colors.blue }]}>{CANCEL_LABEL}</Text>
          </Pressable>
        </View>
      )}
    </SheetModal>
  );
}

/** 値が出せないとき（目標を決めていない）は語で埋める。**「¥0」とは書かない**（§1.2） */
function PreviewRow({ label, value }: { label: string; value: string | null }) {
  const colors = useThemeColors();

  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, { color: colors.secondaryLabel }]}>{label}</Text>
      <Text
        style={[
          styles.rowValue,
          { color: value == null ? colors.mutedLabel : colors.label },
        ]}>
        {value ?? TARGET_PROFIT_UNSET_LABEL}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 28,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    gap: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
  },
  card: {
    borderRadius: 12,
    paddingHorizontal: 16,
  },
  inputValue: {
    fontSize: 20,
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    minHeight: 46,
  },
  rowLabel: {
    fontSize: 15,
  },
  rowValue: {
    fontSize: 17,
    fontWeight: '600',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
  },
  button: {
    height: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveLabel: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  clearLabel: {
    fontSize: 17,
    fontWeight: '600',
  },
  textButton: {
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelLabel: {
    fontSize: 17,
  },
});
