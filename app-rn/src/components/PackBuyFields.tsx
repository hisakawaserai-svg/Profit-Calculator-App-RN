// まとめ買いの入力（SPEC-V3 §2.6.2 / SPEC-V10 §1.3）。
//
// **梱包材と送料プリセットの両方が使う。** 出す欄も、電卓の出し分けも、計算結果の帯の見た目も
// 同じで、違うのは**単価が何になるか**だけ（梱包材 = 登録額そのもの、送料 = 専用資材の代金。
// logic/preset.ts の packBuyTarget）。その違いは呼び出し側が単価をどこへ渡すかで表れるので、
// この部品は「入力を受け取って、1 個（1 回）あたりを見せる」ところまでを持つ。
//
// 画面から切り出したのは、同じ 3 行を 2 か所に置くことになったため ── 帯の色の規則
// （入力途中の「—」は青くしない）・電卓の出し分け（入数には出さない）・右端の揃え
// （帯はカードの端まで、値は電卓ボタンのぶん内側）まで含めて揃っていないと、
// 同じ操作が場所によって違って見える。
//
// **計算方式（SPEC-V10 §1.1）で変わるのは「割る数の欄」だけ**で、行の形も帯の規則も 3 方式で同じ:
//
//   - 個数から / 使用回数から … 割る数（入数 / 想定使用回数）→ 購入価格 → 帯
//   - 面積から               … 購入サイズ 縦・横 → 購入価格 → ¥/㎡ の帯 →
//                              平均使用サイズ 縦・横 → 1 回あたりの帯
//
// 方式ごとに別の部品を作らないのは、3 つとも「買った額を割って 1 回ぶんを出す」同じ画面だから ──
// 分けると帯の規則が方式ごとに枝分かれし、同じ「—」が場所によって違う色になる。
//
// **カードの器は呼び出し側が持つ**（`packCard` 相当の余白 0 のカード）── 送料では
// このカードに 2 択の行が乗り、梱包材では計算方式の 3 択が乗るため。
import { StyleSheet, Text, View } from 'react-native';

import { CALCULATOR_GUTTER_WIDTH, NumericField } from '@/components/NumericField';
import {
  PRESET_AREA_UNIT_PRICE_LABEL,
  PRESET_PACK_HEIGHT_FIELD_LABEL,
  PRESET_PACK_PRICE_FIELD_LABEL,
  PRESET_PACK_WIDTH_FIELD_LABEL,
  PRESET_USE_HEIGHT_FIELD_LABEL,
  PRESET_USE_SIZE_NOTE,
  PRESET_USE_WIDTH_FIELD_LABEL,
  presetPackQuantityFieldLabel,
  presetUnitPriceRowLabel,
  presetUnitPriceText,
} from '@/logic/labels';
import { DEFAULT_PRESET_CALC_METHOD, type PresetCalcMethod } from '@/logic/preset';
import { useThemeColors } from '@/theme';

type Props = {
  /** 計算方式（SPEC-V10 §1.1）。省略 = 既存方式（送料はこれしか使わない） */
  method?: PresetCalcMethod;
  /** 割る数。個数方式では入数、使用回数方式では想定使用回数（面積方式では使わない） */
  packQuantity: string;
  packPrice: string;
  onChangePackQuantity: (value: string) => void;
  onChangePackPrice: (value: string) => void;
  /** 面積方式の購入サイズ（cm）。他の方式では渡らない */
  packHeight?: string;
  packWidth?: string;
  onChangePackHeight?: (value: string) => void;
  onChangePackWidth?: (value: string) => void;
  /** 面積方式の平均使用サイズ（cm。任意入力） */
  useHeight?: string;
  useWidth?: string;
  onChangeUseHeight?: (value: string) => void;
  onChangeUseWidth?: (value: string) => void;
  /**
   * 入力に追従する計算結果（logic/preset.presetDraftUsePrice）。
   * null = 材料が揃っていないので「—」（面積方式では平均使用サイズが未入力のとき）
   */
  unitPrice: number | null;
  /** 面積方式の ¥/㎡（logic/preset.presetDraftAreaUnitPrice）。他の方式では渡らない */
  areaUnitPrice?: number | null;
};

export function PackBuyFields({
  method = DEFAULT_PRESET_CALC_METHOD,
  packQuantity,
  packPrice,
  onChangePackQuantity,
  onChangePackPrice,
  packHeight = '',
  packWidth = '',
  onChangePackHeight,
  onChangePackWidth,
  useHeight = '',
  useWidth = '',
  onChangeUseHeight,
  onChangeUseWidth,
  unitPrice,
  areaUnitPrice,
}: Props) {
  const colors = useThemeColors();
  const isArea = method === 'area';

  return (
    <>
      {isArea ? (
        <>
          {/* 購入サイズ（§1.2）。縦・横を別の行にするのは、他の入力行と同じ
              「見出し左・数値右」の形を崩さないため ── 1 行に 2 つ並べると、
              数値の右端がこの 2 行だけ他と揃わなくなる */}
          <SizeField
            label={PRESET_PACK_HEIGHT_FIELD_LABEL}
            value={packHeight}
            onChangeValue={onChangePackHeight}
          />
          <SizeField
            label={PRESET_PACK_WIDTH_FIELD_LABEL}
            value={packWidth}
            onChangeValue={onChangePackWidth}
            divided
          />
        </>
      ) : (
        <View style={styles.packRow}>
          <NumericField
            // 個数方式は入数、使用回数方式は想定使用回数（§1.2。同じ欄が名前を変える）
            label={presetPackQuantityFieldLabel(method)}
            value={packQuantity}
            onChangeValue={onChangePackQuantity}
            // 数えた個数・見積もった回数で、式にならない（§2.6.2）
            showCalculator={false}
          />
        </View>
      )}
      <View style={[styles.packRow, styles.packRowDivided, { borderTopColor: colors.separator }]}>
        <NumericField
          label={PRESET_PACK_PRICE_FIELD_LABEL}
          value={packPrice}
          onChangeValue={onChangePackPrice}
          // まとめ買いでいちばん割り算が要る欄なので、電卓はここにだけ置く（§2.6.2）。
          // 電卓の中の「梱包材から選ぶ」は既定で出ない ── プリセットからプリセットを
          // 選ぶ経路は作らない（§4.2）ので、ここでも渡さない
        />
      </View>
      {/* 面積方式は帯が 2 枚（§1.3）。1 枚目の ¥/㎡ は購入サイズと購入価格だけで出るので、
          平均使用サイズを入れる前からここに値が入る ── 何が確定していて、
          あと何を入れると 1 回あたりが出るのかが、上から順に読める */}
      {isArea && (
        <UnitPriceRow label={PRESET_AREA_UNIT_PRICE_LABEL} value={areaUnitPrice ?? null} />
      )}
      {isArea && (
        <>
          <SizeField
            label={PRESET_USE_HEIGHT_FIELD_LABEL}
            value={useHeight}
            onChangeValue={onChangeUseHeight}
            divided
          />
          <SizeField
            label={PRESET_USE_WIDTH_FIELD_LABEL}
            value={useWidth}
            onChangeValue={onChangeUseWidth}
            divided
          />
        </>
      )}
      {/* 計算結果の行（§2.6.2）。入力欄に見せない ── 直せる口は上の欄だけでよい。
          帯を敷くのは、上の行が「入れる欄」でこの行だけが「出る値」だと形で言うため */}
      <UnitPriceRow label={presetUnitPriceRowLabel(method)} value={unitPrice} />
      {/* 平均使用サイズが任意であることは、空欄のままでも保存できてしまうこの位置で言う（§1.3） */}
      {isArea && (
        <Text style={[styles.note, { color: colors.secondaryLabel }]}>{PRESET_USE_SIZE_NOTE}</Text>
      )}
    </>
  );
}

/** サイズの 1 行（cm）。式にならない実寸なので、入数と同じく電卓は出さない（§1.2） */
function SizeField({
  label,
  value,
  onChangeValue,
  divided = false,
}: {
  label: string;
  value: string;
  onChangeValue?: (value: string) => void;
  divided?: boolean;
}) {
  const colors = useThemeColors();

  return (
    <View
      style={[
        styles.packRow,
        divided && styles.packRowDivided,
        divided && { borderTopColor: colors.separator },
      ]}>
      <NumericField
        label={label}
        value={value}
        onChangeValue={onChangeValue ?? (() => {})}
        showCalculator={false}
      />
    </View>
  );
}

/** 計算結果の帯（§2.6.2 / §1.3）。面積方式では 2 枚出るので、行そのものを部品にしてある */
function UnitPriceRow({ label, value }: { label: string; value: number | null }) {
  const colors = useThemeColors();

  return (
    <View style={[styles.unitPriceRow, { backgroundColor: colors.highlightBackground }]}>
      <Text style={[styles.unitPriceLabel, { color: colors.blue }]}>{label}</Text>
      <Text
        style={[
          styles.unitPriceValue,
          // 入力途中（材料が揃っていない）の「—」は結果ではないので青くしない ──
          // 青い横棒は値が入っているように見える
          { color: value == null ? colors.secondaryLabel : colors.blue },
        ]}>
        {presetUnitPriceText(value)}
      </Text>
    </View>
  );
}

/** 呼び出し側のカードに当てる余白（この行は行ごとに自前の余白を持つ） */
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
    // 上の行の数値と右端を揃える（電卓ボタンのぶんだけ内側に寄せる）。
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
  // 平均使用サイズの注記（§1.3）。カードの中に入るので、左右は行の余白に合わせる
  note: {
    fontSize: 12,
    lineHeight: 18,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
  },
});
