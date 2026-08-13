// まとめ買いの 3 行（入数 → 購入価格 → 1 個あたり。SPEC-V3 §2.6.2）。
//
// **梱包材と送料プリセットの両方が使う。** 出す欄も、電卓の出し分けも、計算結果の帯の見た目も
// 同じで、違うのは**単価が何になるか**だけ（梱包材 = 登録額そのもの、送料 = 専用資材の代金。
// logic/preset.ts の packBuyTarget）。その違いは呼び出し側が単価をどこへ渡すかで表れるので、
// この部品は「入数と購入価格を受け取って、1 個あたりを見せる」ところまでを持つ。
//
// 画面から切り出したのは、同じ 3 行を 2 か所に置くことになったため ── 帯の色の規則
// （入力途中の「—」は青くしない）・電卓の出し分け（入数には出さない）・右端の揃え
// （帯はカードの端まで、値は電卓ボタンのぶん内側）まで含めて揃っていないと、
// 同じ操作が場所によって違って見える。
//
// **カードの器は呼び出し側が持つ**（`packCard` 相当の余白 0 のカード）── 送料では
// このカードに 2 択の行が乗り、梱包材では乗らないため。
import { StyleSheet, Text, View } from 'react-native';

import { CALCULATOR_GUTTER_WIDTH, NumericField } from '@/components/NumericField';
import {
  PRESET_PACK_PRICE_FIELD_LABEL,
  PRESET_PACK_QUANTITY_FIELD_LABEL,
  PRESET_UNIT_PRICE_LABEL,
  presetUnitPriceText,
} from '@/logic/labels';
import { useThemeColors } from '@/theme';

type Props = {
  packQuantity: string;
  packPrice: string;
  onChangePackQuantity: (value: string) => void;
  onChangePackPrice: (value: string) => void;
  /** 入力に追従する計算結果（logic/preset.presetDraftUnitPrice）。null = 入数が空・0 で「—」 */
  unitPrice: number | null;
};

export function PackBuyFields({
  packQuantity,
  packPrice,
  onChangePackQuantity,
  onChangePackPrice,
  unitPrice,
}: Props) {
  const colors = useThemeColors();

  return (
    <>
      <View style={styles.packRow}>
        <NumericField
          label={PRESET_PACK_QUANTITY_FIELD_LABEL}
          value={packQuantity}
          onChangeValue={onChangePackQuantity}
          // 入数は数えた個数で、式にならない（§2.6.2）
          showCalculator={false}
        />
      </View>
      <View style={[styles.packRow, styles.packRowDivided, { borderTopColor: colors.separator }]}>
        <NumericField
          label={PRESET_PACK_PRICE_FIELD_LABEL}
          value={packPrice}
          onChangeValue={onChangePackPrice}
          // まとめ買いでいちばん割り算が要る欄なので、電卓はここにだけ置く（§2.6.2）。
          // プリセットからプリセットを選ぶ経路は作らない（§4.2）ので梱包材は出さない
          canPickPackaging={false}
        />
      </View>
      {/* 計算結果の行（§2.6.2）。入力欄に見せない ── 直せる口は入数と購入価格の 2 つでよい。
          帯を敷くのは、上 2 行が「入れる欄」でこの行だけが「出る値」だと形で言うため */}
      <View style={[styles.unitPriceRow, { backgroundColor: colors.highlightBackground }]}>
        <Text style={[styles.unitPriceLabel, { color: colors.blue }]}>
          {PRESET_UNIT_PRICE_LABEL}
        </Text>
        <Text
          style={[
            styles.unitPriceValue,
            // 入力途中（入数が空・0）の「—」は結果ではないので青くしない ──
            // 青い横棒は値が入っているように見える
            { color: unitPrice == null ? colors.secondaryLabel : colors.blue },
          ]}>
          {presetUnitPriceText(unitPrice)}
        </Text>
      </View>
    </>
  );
}

/** 呼び出し側のカードに当てる余白（この 3 行は行ごとに自前の余白を持つ） */
export const packBuyCardStyle = {
  paddingHorizontal: 0,
  paddingVertical: 0,
  gap: 0,
  overflow: 'hidden',
} as const;

const styles = StyleSheet.create({
  packRow: {
    paddingHorizontal: 16,
  },
  // 行と行のあいだは髪の毛線 1 本（一覧の行と同じ区切り方）。余白では離さない
  packRowDivided: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  // 1 個あたりの行（§2.6.2）。薄い青の帯を敷いて、入れる欄ではなく出る値だと見せる
  unitPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 16,
    // 上 2 行の数値と右端を揃える（電卓ボタンのぶんだけ内側に寄せる）。
    // 帯そのものはカードの端まで敷いたまま、中の値だけが揃う
    paddingRight: 16 + CALCULATOR_GUTTER_WIDTH,
    paddingVertical: 14,
  },
  unitPriceLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  unitPriceValue: {
    fontSize: 17,
    fontWeight: '600',
  },
});
