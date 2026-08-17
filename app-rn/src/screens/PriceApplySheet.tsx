// 記録の価格を書き換える前の確認（SPEC-V9 §9.11）。
//
// **確認を挟むのは、これがこの画面で唯一「記録が変わる」操作だから。**
// 上のシミュレーターは何度動かしても記録に触らない（そう書いてある）ので、
// その延長で押されたときに、押した先だけが違うことを一度止めて見せる。
//
// 並べるのは 3 行だけ ── いまの記録 / 書き換えたあと / 見込みの利益（前 → 後）。
// **注意文はサービス名を出さない**（§9.1）。出品先の価格は変わらないことだけを言う。
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { SheetModal } from '@/components/SheetModal';
import { formatYenSymbol } from '@/logic/format';
import {
  CANCEL_LABEL,
  PRICE_APPLY_CONFIRM_LABEL,
  PRICE_APPLY_CURRENT_LABEL,
  PRICE_APPLY_EXTERNAL_NOTE,
  PRICE_APPLY_NEXT_LABEL,
  PRICE_APPLY_PROFIT_LABEL,
  PRICE_APPLY_SHEET_TITLE,
  priceChangeArrow,
} from '@/logic/labels';
import { useThemeColors } from '@/theme';

type Props = {
  visible: boolean;
  currentPrice: number;
  nextPrice: number;
  /** 今の価格での見込み利益。価格未設定の記録からは開かないので必ず数値 */
  currentProfit: number;
  nextProfit: number;
  onConfirm: () => void;
  onClose: () => void;
};

export function PriceApplySheet({
  visible,
  currentPrice,
  nextPrice,
  currentProfit,
  nextProfit,
  onConfirm,
  onClose,
}: Props) {
  const colors = useThemeColors();

  return (
    <SheetModal visible={visible} onClose={onClose}>
      {(close) => (
        <View style={[styles.sheet, { backgroundColor: colors.background }]}>
          <Text style={[styles.title, { color: colors.label }]}>{PRICE_APPLY_SHEET_TITLE}</Text>

          <View style={[styles.card, { backgroundColor: colors.secondaryBackground }]}>
            <Row label={PRICE_APPLY_CURRENT_LABEL} value={formatYenSymbol(currentPrice)} />
            <View style={[styles.separator, { backgroundColor: colors.separator }]} />
            {/* 書き換えたあとの価格だけ大きく出す ── 押すと決まるのはこの数字 */}
            <Row label={PRICE_APPLY_NEXT_LABEL} value={formatYenSymbol(nextPrice)} emphasized />
            <View style={[styles.separator, { backgroundColor: colors.separator }]} />
            <Row
              label={PRICE_APPLY_PROFIT_LABEL}
              value={priceChangeArrow(
                formatYenSymbol(currentProfit),
                formatYenSymbol(nextProfit),
              )}
              // 利益が減る書き換え（値下げ）が普通なので、増減で色は振らない ──
              // 赤くすると「してはいけない操作」に見える
            />
          </View>

          <Text style={[styles.note, { color: colors.secondaryLabel }]}>
            {PRICE_APPLY_EXTERNAL_NOTE}
          </Text>

          <Pressable
            onPress={() => {
              onConfirm();
              close();
            }}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: colors.blue, opacity: pressed ? 0.7 : 1 },
            ]}>
            <Text style={styles.confirmLabel}>{PRICE_APPLY_CONFIRM_LABEL}</Text>
          </Pressable>

          <Pressable
            onPress={close}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: colors.secondaryBackground, opacity: pressed ? 0.7 : 1 },
            ]}>
            <Text style={[styles.cancelLabel, { color: colors.blue }]}>{CANCEL_LABEL}</Text>
          </Pressable>
        </View>
      )}
    </SheetModal>
  );
}

function Row({
  label,
  value,
  emphasized = false,
}: {
  label: string;
  value: string;
  emphasized?: boolean;
}) {
  const colors = useThemeColors();

  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, { color: colors.secondaryLabel }]}>{label}</Text>
      <Text
        style={[
          emphasized ? styles.rowValueLarge : styles.rowValue,
          { color: colors.label },
        ]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 32,
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    minHeight: 48,
  },
  rowLabel: {
    fontSize: 15,
  },
  rowValue: {
    fontSize: 17,
    fontWeight: '600',
  },
  rowValueLarge: {
    fontSize: 24,
    fontWeight: '700',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
  },
  note: {
    fontSize: 13,
    lineHeight: 19,
  },
  button: {
    height: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmLabel: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  cancelLabel: {
    fontSize: 17,
    fontWeight: '600',
  },
});
