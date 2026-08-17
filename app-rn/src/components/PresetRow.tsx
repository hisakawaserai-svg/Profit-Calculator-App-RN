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
import { presetUnitNote, presetValueText, shippingMaterialRowNote } from '@/logic/labels';
import { presetRowAmount } from '@/logic/shippingMaterial';
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
  /**
   * 単価の計算方式とその材料（SPEC-V10 §1.5）。**梱包材だけが持つ。**
   * 右端の額が「1 回あたり」なのか「1 ㎡あたり」なのかは、この材料からしか分からない。
   */
  calcMethod?: string;
  packQuantity?: number;
  packHeight?: number;
  packWidth?: number;
  useHeight?: number;
  useWidth?: number;
};

type Props = {
  preset: PresetRowValues;
  /** 名前が空のとき（プレビューの入力途中）に薄く出す代わりの文字 */
  namePlaceholder?: string;
  /** 行の右端（値のさらに右）に置くもの。一覧の「›」、編集モードの削除ボタン等 */
  accessory?: ReactNode;
  /**
   * 名前の下に積むもの（採用案 45b の 2 択）。**行の他の列は動かさない** ──
   * バッジ・名前・右端の額の位置は、これがあってもなくても同じ場所に来る。
   */
  belowName?: ReactNode;
};

export function PresetRow({ preset, namePlaceholder, accessory, belowName }: Props) {
  const colors = useThemeColors();
  const isPlaceholder = preset.name.length === 0 && namePlaceholder != null;
  const materialCost = preset.materialCost ?? 0;
  const hasMaterial = preset.type === 'shipping' && materialCost > 0;
  /**
   * 右端に出す額。**資材費のある送料プリセットは合計**（SPEC-V6 §1）──
   * 選ぶと記録に入るのがこの額で、一覧・選択シート・欄の 3 つで主役の数字を揃える。
   * 登録した送料そのものは、下の 1 行に内訳として残る。
   */
  const shownValue = presetRowAmount(preset);
  // 資材費のある送料プリセットだけ、名前の下に内訳を小さく足す（SPEC-V6 §1）──
  // 合計だけを出すと「何と何を足した額なのか」が行から読めない
  const materialNote = hasMaterial
    ? shippingMaterialRowNote(preset.value, materialCost)
    : // 計算して登録した梱包材は、右端の額が「何あたり」かをここで言う（SPEC-V10 §1.5）。
      // 送料と同じ行に置くのは、どちらも「右端の額の読み方」を補う 1 行だから ──
      // 種類が違っても役割が同じものを、行の別の場所に散らさない
      presetUnitNote({ ...preset, packQuantity: preset.packQuantity ?? 0 });

  return (
    <View style={styles.row}>
      <PresetBadge preset={preset} />
      {/* バッジの右は 1 つの列。**額と ✓ は「名前 ＋ 資材費の 1 行」に対して縦中央**で、
          45b の 2 択だけがその下に来る。
          2 つの「下に積むもの」で扱いを分けているのは、**現れ方が違うから**:
          - 資材費の 1 行は行の持ち物（materialCost > 0 なら常にある）。出たり消えたりしないので、
            額をその 2 段の中央に置いても位置が動くことがない ── 上に貼り付いていると、
            2 段の行だけ額が浮いて見える
          - 45b の 2 択は**押すと現れる**（PresetPickerSheet）。額と ✓ をその高さまで含めて
            中央に取ると、選んだ瞬間に額が下へずれる。だから 2 択は line の外に出す */}
      <View style={styles.body}>
        <View style={styles.line}>
          <View style={styles.nameBlock}>
            <Text
              style={[styles.name, { color: isPlaceholder ? colors.mutedLabel : colors.label }]}
              numberOfLines={1}>
              {isPlaceholder ? namePlaceholder : preset.name}
            </Text>
            {materialNote != null && (
              <Text
                style={[styles.materialNote, { color: colors.secondaryLabel }]}
                numberOfLines={1}>
                {materialNote}
              </Text>
            )}
          </View>
          <Text style={[styles.value, { color: colors.secondaryLabel }]} numberOfLines={1}>
            {presetValueText(preset.type, shownValue)}
          </Text>
          {accessory}
        </View>
        {belowName}
      </View>
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
  // 名前・額の行と、その下に積む 45b の 2 択の列。行の高さは 2 択がある行だけ伸びる
  body: {
    flex: 1,
    gap: 8,
  },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  // 名前と資材費の 1 行。**額はこの塊に対して中央**に来る（line の alignItems）
  nameBlock: {
    flex: 1,
    gap: 8,
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
