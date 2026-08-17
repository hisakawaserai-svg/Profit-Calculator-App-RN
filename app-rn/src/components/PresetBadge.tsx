// プリセットのバッジ（SPEC-V3 §1.2 / §1.3 / §6.1）。色 ＋ 1〜2 文字の角丸の札。
//
// 出るのは**設定画面と選択シート、電卓の品名列だけ**（§1.3）。金額の行（伝票カード・
// レシートカード）には出さないので、販売手数料のオレンジ等と隣り合わない。
//
// 色と文字はここでは決めない ── 色の解決（resolvePresetTone。固定色はテーマの表、
// 自由色は輝度から文字色を出す。SPEC-V7 §2）も頭文字の導出（presetInitial）も
// logic の純粋関数で、この部品は結果を描くだけ。
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { BLACK, isIndistinguishable } from '@/logic/color';
import { PRESET_INITIAL_FIELD_LABEL } from '@/logic/labels';
import { presetInitial, resolvePresetTone } from '@/logic/preset';
import { useThemeColors } from '@/theme';

/** §6.1 の「28px 角」。編集画面のプレビューだけ大きくするので size で受ける */
const BADGE_SIZE = 28;

/**
 * 編集画面で直に打つバッジの大きさ（設計案 49c）。
 * 28pt のままでは指で狙えず、カーソルも文字も見えない。
 */
export const EDITABLE_BADGE_SIZE = 64;

type Props = {
  /** 保存値そのまま。空の initial から名前を使う導出はこの中で行う（§1.2） */
  preset: { name: string; initial: string; colorKey: string };
  size?: number;
  /**
   * このバッジが乗っている面の色（SPEC-V7 §4）。**自由色が下地に埋もれるときだけ**
   * 細い輪郭を出すための比較対象で、省略するとカードの地色（secondaryBackground）を見る。
   * 固定色は下地といちばん近い黄でも比が 1.51 あるので、ここで輪郭が付くことはない。
   */
  surface?: string;
  /**
   * 薄く出す（SPEC-V3 §1.5.1 の「名前は残っているが率は手で変えた」状態）。
   *
   * 色を別に持たせず不透明度で落とすのは、10 色ぶんの薄い版を明暗 2 テーマで
   * 定義し直さずに、どの色でも同じだけ引っ込ませるため。地色に沈めるのが目的なので、
   * 前景（文字）も一緒に薄くなってよい。
   */
  muted?: boolean;
};

export function PresetBadge({ preset, size = BADGE_SIZE, muted = false, surface }: Props) {
  const colors = useThemeColors();
  const tone = resolvePresetTone(preset.colorKey, colors.presetTones);
  const text = presetInitial(preset);
  // 輪郭は**埋もれるときだけ**（§4）。常時出すと固定色の見た目が変わる
  const needsOutline = isIndistinguishable(tone.background, surface ?? colors.secondaryBackground);

  return (
    <View
      style={[
        styles.badge,
        {
          width: size,
          height: size,
          // 角丸は大きさに追従させる（§6.1 の「28px 角に角丸 8px」と同じ比）
          borderRadius: size * (8 / BADGE_SIZE),
          backgroundColor: tone.background,
        },
        needsOutline && { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.separator },
        muted && styles.muted,
      ]}
      // 読み上げは名前が担う（PresetRow が名前を読む）。2 文字の略号を読ませても意味が伝わらない
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <Text
        style={[
          styles.text,
          // 文字は 2 文字入ってもはみ出さないところまで小さくする
          { color: tone.foreground, fontSize: size * (13 / BADGE_SIZE) },
        ]}
        numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

/**
 * バッジそのものを入力欄にする（設計案 49c）。**専用の入力欄は作らない。**
 *
 * 文字と色が同じ場所で決まるようにするための部品 ── 別の欄で打つと、
 * 打っている文字がどう出るのかを目で追うのに視線が 2 か所を往復する。
 *
 * **押して編集（タップ）。長押しではない** ── 長押しは記録詳細のコピー（LongPressCopy）が
 * 使っており、同じ操作に 2 つの意味を持たせない。
 *
 * 入力の規則は従来の欄（§1.2）から一切変えていない:
 * - `maxLength` を付けない・`onChangeText` で切らない（日本語入力の変換前を数えると、
 *   上限の近くで漢字に変換できなくなる）
 * - 切るのは**欄を離れたとき**（onBlur → clampPresetInitial）と保存の直前（validatePreset）だけ
 * - 空のときは名前の先頭 1 文字を `placeholder` として出す（presetInitial の導出と同じ結果）
 */
export function PresetBadgeInput({
  preset,
  size = EDITABLE_BADGE_SIZE,
  surface,
  onChangeText,
  onBlur,
  onFocus,
}: {
  preset: { name: string; initial: string; colorKey: string };
  size?: number;
  surface?: string;
  onChangeText: (text: string) => void;
  onBlur: () => void;
  onFocus?: () => void;
}) {
  const colors = useThemeColors();
  const tone = resolvePresetTone(preset.colorKey, colors.presetTones);
  const needsOutline = isIndistinguishable(tone.background, surface ?? colors.secondaryBackground);
  /**
   * 未入力のときに薄く出す文字。**表示される結果そのもの**（presetInitial が
   * initial 空のときに返すもの）なので、この帯は常に「保存したらこう出る」を映している。
   */
  const derived = presetInitial({ name: preset.name, initial: '' });

  return (
    <TextInput
      value={preset.initial}
      onChangeText={onChangeText}
      onBlur={onBlur}
      onFocus={onFocus}
      placeholder={derived}
      // 導出の結果は「入っていない」が「こう出る」ものなので、本文より薄く、
      // それでも地色に負けない濃さにする（前景が黒の面と白の面で 1 つずつ持つ）
      placeholderTextColor={tone.foreground === BLACK ? PLACEHOLDER_ON_LIGHT : PLACEHOLDER_ON_DARK}
      selectionColor={tone.foreground}
      textAlign="center"
      // 2 文字しか入らないので、変換候補を出す鍵盤の学習に任せる（自動大文字化だけ切る）
      autoCapitalize="none"
      autoCorrect={false}
      accessibilityLabel={PRESET_INITIAL_FIELD_LABEL}
      style={[
        styles.badge,
        styles.badgeInput,
        {
          width: size,
          height: size,
          borderRadius: size * (8 / BADGE_SIZE),
          backgroundColor: tone.background,
          color: tone.foreground,
          fontSize: size * (13 / BADGE_SIZE),
        },
        needsOutline && { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.separator },
      ]}
    />
  );
}

/** 導出文字（placeholder）の濃さ。地が明るい＝黒文字の面と、暗い＝白文字の面で 1 つずつ */
const PLACEHOLDER_ON_LIGHT = 'rgba(0, 0, 0, 0.45)';
const PLACEHOLDER_ON_DARK = 'rgba(255, 255, 255, 0.6)';

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  // TextInput は既定の内側余白を持つので落とす（落とさないと 2 文字目が縦にずれる）。
  // 縦の中央寄せは iOS の 1 行 TextInput が自前で行うが、Android は指定が要る
  badgeInput: {
    padding: 0,
    fontWeight: '700',
    textAlignVertical: 'center',
  },
  // 明暗どちらの地色でも「引っ込んだが読める」ところ。これ以上落とすと頭文字が読めない
  muted: {
    opacity: 0.4,
  },
  text: {
    fontWeight: '700',
  },
});
