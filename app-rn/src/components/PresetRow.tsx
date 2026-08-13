// プリセット 1 件の行（SPEC-V3 §3.2 / §6.1）。バッジ ＋ 名前 ＋ 右端に値の 3 列。
//
// 一覧（PresetListScreen）・編集画面のプレビュー（§3.3-2）・選択シート（§4.3。Step 3）で
// **同じ部品**を使う。プレビューが「選択シートに出るのと同じ形」であることが §3.3-2 の要件なので、
// 見た目を共有する以上に、形が食い違わないことがこの部品の役目。
//
// 行そのものは押せない（押せる形は呼び出し側が Pressable で包む）。
// 一覧では行タップ = 編集、選択シートでは行タップ = 選択と、意味が画面ごとに違うため。
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { PresetType } from '@/db/schema';
import { presetValueText, shippingMaterialRowNote } from '@/logic/labels';
import { useThemeColors } from '@/theme';

import { PresetBadge } from './PresetBadge';

/**
 * UI-SPEC §1.1-5 の行高 60px より詰める。1 行に文字が 1 段しかないため。
 * **最低の高さ**にしてあるのは、資材費のある送料プリセット（SPEC-V6 §1）だけ 2 段になるため。
 */
const ROW_HEIGHT = 48;

/**
 * 保存前の入力（編集画面のプレビュー）も渡せるよう、Preset そのものではなく
 * 描くのに要る 5 つだけを受ける。id と sortOrder はこの行に出ない。
 */
export type PresetRowValues = {
  type: PresetType;
  name: string;
  initial: string;
  colorKey: string;
  value: number;
  /**
   * 専用資材の代金（SPEC-V6 §1）。送料プリセットだけが持ち、0 なら無いのと同じ。
   * 省略できるのは、この行を保存前の入力（プレビュー）からも描くため。
   */
  materialCost?: number;
};

type Props = {
  preset: PresetRowValues;
  /** 名前が空のとき（プレビューの入力途中）に薄く出す代わりの文字 */
  namePlaceholder?: string;
  /** 行の右端（値のさらに右）に置くもの。一覧の「›」、編集モードの削除ボタン等 */
  accessory?: ReactNode;
};

export function PresetRow({ preset, namePlaceholder, accessory }: Props) {
  const colors = useThemeColors();
  const isPlaceholder = preset.name.length === 0 && namePlaceholder != null;
  const materialCost = preset.materialCost ?? 0;
  // 資材費のある送料プリセットだけ、名前の下に「選ぶと入る額」を小さく足す（SPEC-V6 §1）──
  // 右端の金額（送料）だけを見て選ぶと、記録に入る額と食い違う
  const materialNote =
    preset.type === 'shipping' && materialCost > 0
      ? shippingMaterialRowNote(materialCost, preset.value + materialCost)
      : null;

  return (
    <View style={styles.row}>
      <PresetBadge preset={preset} />
      <View style={styles.body}>
        <Text
          style={[styles.name, { color: isPlaceholder ? colors.mutedLabel : colors.label }]}
          numberOfLines={1}>
          {isPlaceholder ? namePlaceholder : preset.name}
        </Text>
        {materialNote != null && (
          <Text style={[styles.materialNote, { color: colors.secondaryLabel }]} numberOfLines={1}>
            {materialNote}
          </Text>
        )}
      </View>
      <Text style={[styles.value, { color: colors.secondaryLabel }]} numberOfLines={1}>
        {presetValueText(preset.type, preset.value)}
      </Text>
      {accessory}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: ROW_HEIGHT,
    paddingVertical: 4,
  },
  // 名前と（あれば）資材費の 1 行を積む列。行の高さは資材費のある行だけ伸びる
  body: {
    flex: 1,
    gap: 2,
  },
  name: {
    fontSize: 16,
  },
  materialNote: {
    fontSize: 12,
  },
  value: {
    fontSize: 16,
  },
});
