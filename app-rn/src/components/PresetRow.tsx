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
import { presetValueText } from '@/logic/labels';
import { useThemeColors } from '@/theme';

import { PresetBadge } from './PresetBadge';

/** UI-SPEC §1.1-5 の行高 60px より詰める。1 行に文字が 1 段しかないため */
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

  return (
    <View style={styles.row}>
      <PresetBadge preset={preset} />
      <Text
        style={[styles.name, { color: isPlaceholder ? colors.mutedLabel : colors.label }]}
        numberOfLines={1}>
        {isPlaceholder ? namePlaceholder : preset.name}
      </Text>
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
    height: ROW_HEIGHT,
  },
  name: {
    flex: 1,
    fontSize: 16,
  },
  value: {
    fontSize: 16,
  },
});
