// 金額の入力行（UI-SPEC §1.1-5 / §3.2）。CalcView.swift の LabeledField（iPhone 分岐）の後継。
//
// 行型（ラベル左・数値右・行高 60px）にしたのは UI-SPEC §3.2 の決定。
// 枠付きの入力欄を縦に積む形をやめ、カードの中に行として並べる。
// 各金額行の右端に電卓ボタンを置く。押すと下から電卓のシートが出る（UI-SPEC §7.1）。
// 欄ごとに変わるのは見出しの語（calculatorLabel）だけで、行の形もボタンの位置も変えない（§7.6）。
// 入力のフィルタは src/logic/input.ts（SPEC §5.1 / 決定 §7-9）に委譲する。
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextStyle,
} from 'react-native';

import { MiniCalculator } from '@/components/MiniCalculator';
import { PresetTagButton } from '@/components/PresetTagButton';
import type { Preset, PresetType } from '@/db/schema';
import { parseNumericInput, sanitizeNumericInput } from '@/logic/input';
import {
  calculatorAccessibilityLabel,
} from '@/logic/labels';
import { useThemeColors } from '@/theme';

/** UI-SPEC §1.1-5「行高 60px」 */
const ROW_HEIGHT = 60;

/** 電卓ボタンの幅（アイコン 22 ＋ padding 4 × 2） */
const CALC_BUTTON_SIZE = 30;

/**
 * 数値の右端から行の右端までの幅（電卓ボタン ＋ その左の間隔）。
 *
 * **電卓ボタンを出さない行は、同じ幅の空きを右に置いて数値の右端を揃える**
 * （SPEC-V3 §2.6.2 の入数の行）。金額を縦に読む画面なので、ボタンの有無で桁の位置が
 * ずれると読み比べられない。計算タブはタグボタンをラベル側に移してこれを避けた（設計案 29b）が、
 * 電卓ボタンは行き先が数値そのものなので左には移せない。
 *
 * NumericField を使わない行（1 個あたりの帯）も、この幅を右の余白に足せば揃う。
 */
export const CALCULATOR_GUTTER_WIDTH = CALC_BUTTON_SIZE + 12; // 12 = styles.row の gap

type Props = {
  label: string;
  value: string;
  onChangeValue: (value: string) => void;
  placeholder?: string;
  /**
   * 逆算モードの販売価格欄（UI-SPEC §1.1「挙動」）。
   * 文字と電卓ボタンを薄くして無効を示す。行の形（高さ・余白）は他の行と変えない
   */
  disabled?: boolean;
  /** 数値欄のみ電卓ボタンを出す（Swift 版の isNumeric） */
  showCalculator?: boolean;
  /**
   * 電卓の見出し「{行き先}の計算」に使う語（UI-SPEC §7.1）。
   * 既定は行のラベルだが、伝票カードのように行名に記号が付く欄（「− 送料」）では
   * 欄そのものの名前（「送料」）を渡す ── 見出しは行き先を指す語であって、行の見た目ではない。
   */
  calculatorLabel?: string;
  /** 行の高さ。伝票カード（UI-SPEC §1.3）は行数が多いので詰める */
  rowHeight?: number;
  /**
   * 数値の見た目の上書き（伝票カードの「販売価格 24px 太字」「控除 20px 赤」。UI-SPEC §1.3-6〜9）。
   * 無効時の色だけはこれより後に当てる（無効かどうかが行の色より優先して読めるように）。
   */
  valueStyle?: StyleProp<TextStyle>;
  /**
   * プリセットの選択ボタンを出す行（SPEC-V3 §4.1 / §4.2）。**渡された行にだけ**タグボタンが
   * ラベルの右隣に出る（設計案 29b）。行の形も電卓の位置も変えない
   * （UI-SPEC §7.6 の「NumericField は行き先を渡すだけ」と同じ拡張の仕方）。
   *
   * ボタンが増える分は数値欄（flex）が吸うので、金額の右端は他の行とずれない。
   * 詰め物（旧 PresetTagSlot）を他の行に配る必要はない。
   */
  presetType?: PresetType;
  /**
   * プリセットを選んだときの処理の差し替え（SPEC-V6 §3）。
   *
   * 既定は「value を欄に書く」だけ。**送料の行だけは合計（送料 ＋ 専用資材）を入れ、
   * 資材費の控えも一緒に記録へ持つ**必要があるので、選んだ行そのものを呼び出し側へ渡す。
   * 欄への書き戻しは受け取った側の責任になる。
   */
  onSelectPreset?: (preset: Preset) => void;
  /** シート末尾の「設定で編集する ▸」を出すか。記録フォームからは false（PresetTagButton 参照） */
  canOpenSettings?: boolean;
  /**
   * 電卓の中に「🏷 梱包材から選ぶ」を出すか（SPEC-V3 §4.5）。
   * **プリセット編集画面の値の欄からは false**（§4.2。MiniCalculator 参照）。
   */
  canPickPackaging?: boolean;
};

export function NumericField({
  label,
  value,
  onChangeValue,
  placeholder = '0',
  disabled = false,
  showCalculator = true,
  calculatorLabel,
  rowHeight = ROW_HEIGHT,
  valueStyle,
  presetType,
  onSelectPreset,
  canOpenSettings = true,
  canPickPackaging = true,
}: Props) {
  const colors = useThemeColors();
  const [showCalc, setShowCalc] = useState(false);
  const calcLabel = calculatorLabel ?? label;

  // 無効は文字色だけで示す（UI-SPEC §1.1「挙動」）。
  //
  // 地色を敷く形をやめたのは、カードの左右の余白まで届かず角丸にも沿わないため、
  // 行の上に灰色の板が乗っているように見えるから。背景を持つのはこの行だけなので、
  // 他の行（送料など）と並んだときにその行だけ浮いて見えていた。
  // ラベル・数値・電卓ボタンを薄くすれば、行の形を他と揃えたまま無効だと分かる。
  const valueColor = disabled ? colors.secondaryLabel : colors.label;

  return (
    <View>
      <View style={[styles.row, { height: rowHeight }]}>
        <Text style={[styles.label, { color: valueColor }]} numberOfLines={1}>
          {label}
        </Text>
        {/* タグボタンはラベルの直後（設計案 29b）。行の右端は全行とも電卓ボタンで揃う */}
        {presetType != null && (
          <PresetTagButton
            type={presetType}
            // 空欄は「選んでいない」。0 円のプリセットのバッジが未入力の欄に出ないようにする
            value={value === '' ? null : parseNumericInput(value)}
            // 書き戻しは電卓と同じ経路を通す（§4.3）。プリセットの値が範囲外でも必ず正規化される
            onSelect={(preset) =>
              onSelectPreset != null
                ? onSelectPreset(preset)
                : onChangeValue(sanitizeNumericInput(String(preset.value)))
            }
            disabled={disabled}
            canOpenSettings={canOpenSettings}
          />
        )}
        <TextInput
          style={[styles.input, { color: colors.label }, valueStyle, disabled && { color: valueColor }]}
          value={value}
          onChangeText={(text) => onChangeValue(sanitizeNumericInput(text))}
          placeholder={placeholder}
          placeholderTextColor={colors.secondaryLabel}
          keyboardType="decimal-pad"
          editable={!disabled}
          accessibilityLabel={label}
        />
        {showCalculator ? (
          <Pressable
            onPress={() => {
              // 下から出るシート（UI-SPEC §7.1）はキーボードと同じ側から出るので、
              // 欄を編集中に押されたときはキーボードを引っ込めてから開く
              Keyboard.dismiss();
              setShowCalc(true);
            }}
            disabled={disabled}
            hitSlop={8}
            accessibilityLabel={calculatorAccessibilityLabel(calcLabel)}
            style={({ pressed }) => [
              styles.calcButton,
              { opacity: disabled ? 0.3 : pressed ? 0.5 : 1 },
            ]}>
            <Ionicons name="calculator-outline" size={22} color={colors.blue} />
          </Pressable>
        ) : (
          // ボタンのぶんの空き。行から抜くと数値が右に寄って、上下の行と桁が揃わない
          <View style={styles.calcButtonSpacer} />
        )}
      </View>

      {/* 開いている間だけマウントして、編集中の行を現在の入力値で初期化する（UI-SPEC §7.2） */}
      {showCalculator && showCalc ? (
        <MiniCalculator
          fieldLabel={calcLabel}
          targetText={value}
          // Swift 版は書き戻し後に onChange のフィルタが走るため、こちらも同じフィルタを通す
          onSubmit={(result) => onChangeValue(sanitizeNumericInput(result))}
          // 電卓の中の梱包材シートも設定タブへ遷移できるかは同じ条件（SPEC-V3 §4.5）
          canOpenSettings={canOpenSettings}
          canPickPackaging={canPickPackaging}
          onClose={() => setShowCalc(false)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    // 高さは rowHeight（既定 ROW_HEIGHT）。左右の余白はカード側が持つ
  },
  label: {
    fontSize: 16,
  },
  input: {
    // ラベルの右から電卓ボタンの手前まで。数値は右寄せ（伝票と同じ読み方にする）
    flex: 1,
    textAlign: 'right',
    fontSize: 17,
  },
  calcButton: {
    padding: 4,
  },
  calcButtonSpacer: {
    width: CALC_BUTTON_SIZE,
  },
});
