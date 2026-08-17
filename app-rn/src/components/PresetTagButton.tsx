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
// 3 つの見た目を同じ幅で入れ替える（設計案 26a-2 ／ 判定は logic/preset の resolvePresetTag）:
//
// - 選択中のプリセットがあるとき: **そのバッジ自体がボタン**（右に ▾）
// - 名前は残っているが率を手で変えたとき: **薄いバッジ・▾ なし**（§1.5.1）
// - 未選択のとき: タグアイコン（右に ▾）
//
// 薄いバッジで ▾ を外すのは、▾ が「今ここに入っている値の出どころ」を指す印だから ──
// 率が既にプリセットのものではない以上、同じ印を出しておくと
// 「プリセットの率がそのまま入っている」と読めてしまう。
// 押したときの挙動は 3 つとも同じ（選択シートが開く）。
//
// アイコンを `pricetag-outline` にしてあるのは、隣の電卓ボタンが `calculator-outline`
// （線画）だから ── 塗りの `pricetag` を並べると、同じ行の 2 つのボタンで線の太さが揃わない。
//
// 登録が 0 件でもボタンは出す（§4.1）。出したり消したりすると、機能があること自体に気付けない。
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Keyboard, Pressable, StyleSheet, View } from 'react-native';

import { PresetBadge } from '@/components/PresetBadge';
import { PresetPickerSheet } from '@/components/PresetPickerSheet';
import type { Preset, PresetType } from '@/db/schema';
import { usePresetList } from '@/db/usePresets';
import { presetPickerTitle, presetTagClearLabel, presetTagStateLabel } from '@/logic/labels';
import { resolvePresetTag } from '@/logic/preset';
import type { ShippingMaterialChoice } from '@/logic/shippingMaterial';
import { useThemeColors } from '@/theme';
import { useLocale } from '@/settings';

/** 行の中に収める大きさ。一覧の 28px より小さくして、数値と同じ行に並べても重くしない */
const BADGE_SIZE = 24;

/** アイコンの大きさは電卓ボタン（NumericField）と同じ */
const ICON_SIZE = 22;

/** ✕（選択解除）の大きさ。SiteNameRow の「✕」と同じ */
const CLEAR_ICON_SIZE = 16;

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
  /**
   * 選んだ行と、送料の 2 択（採用案 45b）。`choice` は送料以外・資材費 0 円の行では
   * 常に `'with-material'` ── 呼び出し側は送料のときだけ見ればよい。
   */
  onSelect: (preset: Preset, choice: ShippingMaterialChoice) => void;
  /**
   * バッジの右に出す「✕」（選択解除）の処理。渡したときだけ、選択中（`selected` /
   * `rate-changed`）の間だけ出す ── 未選択のときは外すものがないので出さない。
   *
   * SiteNameRow の「✕」と同じ役目を、シートを開かずに済む場所（バッジの真横）にも置く。
   * 呼び出し側の責務は欄の値を消す（または元の状態に戻す）ことだけで、
   * この部品自身は消えたあとの状態を判定しない（シートを開くたびに tag を作り直すだけ）。
   */
  onClear?: () => void;
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
  onClear,
  disabled = false,
  canOpenSettings = true,
}: Props) {
  // 表示語は locale を引数に取る（渡さないと React Compiler が初回の文字列で固定する。
  // src/i18n/index.ts の冒頭）。この購読で言語を変えたときに引き直される
  const locale = useLocale();

  const colors = useThemeColors();
  const [showPicker, setShowPicker] = useState(false);
  const { presets } = usePresetList(type);

  const tag = resolvePresetTag(presets, value, selectedName);
  const showClear = onClear != null && tag.kind !== 'unselected' && !disabled;

  return (
    <>
      <View style={styles.wrapper}>
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
          accessibilityLabel={presetPickerTitle(locale, type)}
          // 見た目（バッジの濃さ・▾ の有無）で示している状態を読み上げにも乗せる
          accessibilityValue={{
            text: presetTagStateLabel(locale, 
              tag.kind,
              tag.kind === 'unselected' ? '' : tag.preset.name,
            ),
          }}
          style={({ pressed }) => [
            styles.button,
            { opacity: disabled ? 0.3 : pressed ? 0.5 : 1 },
          ]}>
          {tag.kind === 'unselected' ? (
            <Ionicons name="pricetag-outline" size={ICON_SIZE} color={colors.blue} />
          ) : (
            <PresetBadge
              preset={tag.preset}
              size={BADGE_SIZE}
              muted={tag.kind === 'rate-changed'}
            />
          )}
          {/* ▾ は「今の値がプリセットのもの」の印。率を手で変えた行では外す（§1.5.1）。
              未選択のときは出す ── 押すと選べることが形から読めるように */}
          {tag.kind !== 'rate-changed' && (
            <Ionicons name="chevron-down" size={12} color={colors.blue} />
          )}
        </Pressable>

        {/* シートを開かずにその場で外せる「✕」。選択中のときだけ（SiteNameRow と同じ役目） */}
        {showClear && (
          <Pressable
            onPress={onClear}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={presetTagClearLabel(locale, tag.preset.name)}
            style={({ pressed }) => [styles.clearButton, { opacity: pressed ? 0.5 : 1 }]}>
            <Ionicons name="close" size={CLEAR_ICON_SIZE} color={colors.secondaryLabel} />
          </Pressable>
        )}
      </View>

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
  wrapper: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    // 2 つの見た目（バッジ・アイコン）で幅を変えない（設計案 26a-2）。
    // バッジ 24 / アイコン 22 のどちらが入っても、右隣の数値欄の始まりは動かない
    width: BADGE_SIZE + 2 + 12,
    justifyContent: 'flex-start',
  },
  // 「✕」は選択中だけ足される分なので、button の固定幅には含めない
  clearButton: {
    paddingLeft: 4,
  },
});
