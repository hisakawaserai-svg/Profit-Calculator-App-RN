// 行のラベルの右隣に置く「タグ」ボタン（SPEC-V3 §4.1 / 設計案 29b）。押すと選択シートが下から出る。
//
//     [ 送料 🏷▾              210  🖩 ]
//
// 置き場所をラベルの直後にしたのは、同じ列にバッジのある行とない行が混じるのをやめるため
// （設計案 29b）。以前は数値の右・電卓ボタンの左に置き、ボタンのない行には同じ幅の
// 詰め物（PresetTagSlot）を入れて金額の右端を揃えていたが、その列は行ごとに
// 「バッジがある / 何もない」が入れ替わって落ち着かなかった。
// ラベル側へ寄せれば、詰め物なしで金額の右端は数値欄の flex が、
// 行の右端は電卓ボタンが揃える。行の高さ（60px / 伝票カードは詰めた値）は変わらない。
//
// 2 つの見た目を同じ幅で入れ替える（設計案 26a-2）:
//
// - 選択中のプリセットがあるとき: **そのバッジ自体がボタン**（右に ▾）
// - 未選択のとき: タグアイコン（右に ▾）
//
// アイコンを `pricetag-outline` にしてあるのは、隣の電卓ボタンが `calculator-outline`
// （線画）だから ── 塗りの `pricetag` を並べると、同じ行の 2 つのボタンで線の太さが揃わない。
//
// 登録が 0 件でもボタンは出す（§4.1）。出したり消したりすると、機能があること自体に気付けない。
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Keyboard, Pressable, StyleSheet } from 'react-native';

import { PresetBadge } from '@/components/PresetBadge';
import { PresetPickerSheet } from '@/components/PresetPickerSheet';
import type { Preset, PresetType } from '@/db/schema';
import { usePresetList } from '@/db/usePresets';
import { presetPickerTitle } from '@/logic/labels';
import { findPresetByName, findPresetByValue } from '@/logic/preset';
import { useThemeColors } from '@/theme';

/** 行の中に収める大きさ。一覧の 28px より小さくして、数値と同じ行に並べても重くしない */
const BADGE_SIZE = 24;

/** アイコンの大きさは電卓ボタン（NumericField）と同じ */
const ICON_SIZE = 22;

type Props = {
  type: PresetType;
  /** 今の欄の値。シートのチェックに使う（§4.3-2）。空欄は null */
  value: number | null;
  /**
   * 販売サイトだけ渡す名前の写し（§1.5.1）。**渡したときはバッジを名前だけで決める** ──
   * 率で決めると、既定の 10% がたまたま一致するプリセットのバッジを、
   * 選んでもいないのに出してしまう。手で率を変えても札が残るのも同じ理由（§1.5.1）。
   */
  selectedName?: string;
  onSelect: (preset: Preset) => void;
  disabled?: boolean;
  /**
   * シート末尾の「設定で編集する ▸」を出すか（既定 true）。
   *
   * **記録フォームからは false**。フォームは RN の `Modal` なので、押しても設定画面が
   * モーダルの裏に積まれるだけで、画面上は何も起きないように見える（壊れていると読まれる）。
   * 0 件のときの「設定で追加する ▸」も同じ理由で文に置き換わる（PresetPickerSheet 参照）。
   */
  canOpenSettings?: boolean;
};

export function PresetTagButton({
  type,
  value,
  selectedName,
  onSelect,
  disabled = false,
  canOpenSettings = true,
}: Props) {
  const colors = useThemeColors();
  const [showPicker, setShowPicker] = useState(false);
  const { presets } = usePresetList(type);

  const selected =
    selectedName == null
      ? findPresetByValue(presets, value)
      : findPresetByName(presets, selectedName);

  return (
    <>
      <Pressable
        onPress={() => {
          // シートはキーボードと同じ側から出るので、欄を編集中に押されたときは引っ込めてから開く
          // （電卓ボタンと同じ扱い。NumericField 参照）
          Keyboard.dismiss();
          setShowPicker(true);
        }}
        disabled={disabled}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={presetPickerTitle(type)}
        style={({ pressed }) => [
          styles.button,
          { opacity: disabled ? 0.3 : pressed ? 0.5 : 1 },
        ]}>
        {selected == null ? (
          <Ionicons name="pricetag-outline" size={ICON_SIZE} color={colors.blue} />
        ) : (
          <PresetBadge preset={selected} size={BADGE_SIZE} />
        )}
        {/* ▾ は選択中でも未選択でも出す。押すと選び直せることが形から読めるように */}
        <Ionicons name="chevron-down" size={12} color={colors.blue} />
      </Pressable>

      {/* 開いている間だけマウントする（電卓シートと同じ扱い） */}
      {showPicker && (
        <PresetPickerSheet
          visible
          type={type}
          presets={presets}
          value={value}
          onSelect={onSelect}
          canOpenSettings={canOpenSettings}
          onClose={() => setShowPicker(false)}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    // 2 つの見た目（バッジ・アイコン）で幅を変えない（設計案 26a-2）。
    // バッジ 24 / アイコン 22 のどちらが入っても、右隣の数値欄の始まりは動かない
    width: BADGE_SIZE + 2 + 12,
    justifyContent: 'flex-start',
  },
});
