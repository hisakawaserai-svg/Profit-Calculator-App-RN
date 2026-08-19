// 選択シートの上端に置く「その場で登録」（SPEC-V3 §4.3 の拡張）。
//
//     ┌──────────────────────────────┐
//     │ [名前を入れて登録          ] │
//     │ 金額                 [800] 登録│
//     └──────────────────────────────┘
//
// **記録の途中で「この送料を登録しておきたい」と思った瞬間に登録できるようにするための口。**
// 記録フォームは RN の `Modal` なので設定タブへ遷移できず（`canOpenSettings={false}`）、
// これまでは「設定タブの『よく使う値』から追加できます」と読ませて、記録を中断させていた。
// 実際の利用者から「めんどくせえ」と言われたのはこの経路のこと。
//
// **作りはタグの選択シート（TagPickerSheet）の新規作成と同じ。** 書き込みの境目も同じで、
// **プリセット本体の作成だけは即座に書き込む** ── プリセットはフォームの下書きではなく
// 共有の資産で、記録を保存せずに閉じても残るものだから。
//
// この部品が持たない判断:
// - **色を選ばせない**（§1.2 のタグと同じ。nextPresetColor が使用済みを避けて 1 色決める）。
//   色の丸を出すとこの高さに収まらないし、選ばせるたびに 2 段階になる
// - **バッジの文字・専用資材・まとめ買いを出さない。** 登録するのは名前と金額だけで、
//   残りは既定に倒す（logic/preset.quickPresetDraft）。足りない指定は設定タブの本フォームに残す
// - **登録したあとの行き先を決めない。** 単一選択のシートは選んで閉じ、複数選択のシートは
//   選択に足して開いたまま ── 確定の仕方がシートごとに違うので、`onCreated` で呼び出し側へ返す
// - **重複を弾かない**（§1.4）。同じ名前の登録があってもそのまま作れる
//
// 表示語はすべて labels.ts 経由（SPEC-V2 §5.3。画面で文字列を組み立てない）。
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { createPreset } from '@/db/usePresets';
import type { Preset, PresetType } from '@/db/schema';
import { sanitizeNumericInput } from '@/logic/input';
import {
  presetBlockedNote,
  presetQuickAddNamePlaceholder,
  presetQuickAddSubmitAccessibilityLabel,
  presetQuickAddSubmitLabel,
  presetValueFieldLabel,
} from '@/logic/labels';
import { nextPresetColor, quickPresetDraft, validatePreset } from '@/logic/preset';
import { useLocale } from '@/settings';
import { useThemeColors } from '@/theme';

type Props = {
  type: PresetType;
  /**
   * 今の欄の値（シートの `value` と同じもの）。**金額欄の初期値になる。**
   *
   * 空欄（null）でも登録はできる ── 0 円のプリセットに意味がある場面は少ないが、
   * 「先に名前だけ決めて、あとで設定タブで金額を入れる」を塞ぐ理由もない。
   */
  initialValue: number | null;
  /** 色の自動割り当てに使う同じ種類の登録（使用済みの色を避ける） */
  presets: readonly Preset[];
  /** 登録できたとき。呼び出し側が一覧を引き直し、選択済みにする（シートごとに違う） */
  onCreated: (preset: Preset) => void;
};

export function PresetQuickAddRow({ type, initialValue, presets, onCreated }: Props) {
  // 表示語は locale を引数に取る（渡さないと React Compiler が初回の文字列で固定する。
  // src/i18n/index.ts の冒頭）。この購読で言語を変えたときに引き直される
  const locale = useLocale();

  const colors = useThemeColors();
  const [name, setName] = useState('');
  // 欄の値をそのまま初期値にする（開いている間だけマウントされるので、開くたびに入り直す）。
  // 数値は文字列で持つ ── validatePreset も NumericField も文字列で扱う
  const [value, setValue] = useState(() => (initialValue == null ? '' : String(initialValue)));

  const validation = validatePreset(quickPresetDraft(type, name, value));

  /**
   * 登録できない理由の 1 行。**名前を打ち始めるまでは出さない** ── 開いた直後は
   * 名前が空なので `name-required` が立つが、まだ何もしていない人を咎めることになる
   * （TagPickerSheet が検索語を打つまで作成行を出さないのと同じ扱い）。
   */
  const blockedNote =
    name.trim() !== '' && !validation.valid
      ? presetBlockedNote(locale, validation.reason, type)
      : null;

  const submit = () => {
    if (!validation.valid) return;
    const preset = createPreset({
      type,
      name: validation.name,
      // 色は選ばせず、使用済みを避けて 1 色決める（§1.2 のタグと同じ）
      colorKey: nextPresetColor(presets),
      // 空のまま保存する ── バッジの文字は表示時に name の先頭 1 文字から導出される（§1.2）
      initial: validation.initial,
      value: validation.value,
      packQuantity: validation.packQuantity,
      packPrice: validation.packPrice,
      materialCost: validation.materialCost,
    });
    // 名前だけ空に戻す（金額は欄の値のまま）── 複数選択のシートは開いたままなので、
    // 続けてもう 1 つ登録するときに打ち直すのは名前だけでよい
    setName('');
    onCreated(preset);
  };

  return (
    <View style={[styles.card, { backgroundColor: colors.secondaryBackground }]}>
      <TextInput
        style={[styles.nameInput, { color: colors.label }]}
        value={name}
        onChangeText={setName}
        placeholder={presetQuickAddNamePlaceholder(locale)}
        placeholderTextColor={colors.secondaryLabel}
        accessibilityLabel={presetQuickAddNamePlaceholder(locale)}
        // 名前を打ち終えたら「登録」へ手が伸びる。鍵盤の確定でもそのまま登録できるようにする
        returnKeyType="done"
        onSubmitEditing={submit}
      />
      <View style={[styles.separator, { backgroundColor: colors.separator }]} />
      <View style={styles.valueRow}>
        {/* 単位（円 / %）は表示語が持つ ── 数字の隣に記号を足すと、
            ¥ が前に付く英語では位置が合わない（logic/format の formatYen 参照） */}
        <Text style={[styles.valueLabel, { color: colors.secondaryLabel }]} numberOfLines={1}>
          {presetValueFieldLabel(locale, type)}
        </Text>
        <TextInput
          style={[styles.valueInput, { color: colors.label }]}
          value={value}
          onChangeText={(text) => setValue(sanitizeNumericInput(text))}
          placeholder="0"
          placeholderTextColor={colors.secondaryLabel}
          keyboardType="decimal-pad"
          accessibilityLabel={presetValueFieldLabel(locale, type)}
        />
        <Pressable
          onPress={submit}
          disabled={!validation.valid}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={presetQuickAddSubmitAccessibilityLabel(locale, name.trim())}
          accessibilityState={{ disabled: !validation.valid }}
          style={({ pressed }) => [styles.submit, { opacity: pressed ? 0.5 : 1 }]}>
          <Text
            style={[
              styles.submitLabel,
              // 押せないときは薄く。理由は下の 1 行が言う（グレーだけで終わらせない）
              { color: validation.valid ? colors.blue : colors.secondaryLabel },
            ]}>
            {presetQuickAddSubmitLabel(locale)}
          </Text>
        </Pressable>
      </View>
      {blockedNote != null && (
        <Text style={[styles.blockedNote, { color: colors.red }]} accessibilityRole="alert">
          {blockedNote}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  nameInput: {
    height: 44,
    fontSize: 16,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    height: 44,
  },
  valueLabel: {
    fontSize: 14,
  },
  valueInput: {
    // ラベルの右から「登録」の手前まで。数値は右寄せ（金額欄と同じ読み方にする）
    flex: 1,
    textAlign: 'right',
    fontSize: 17,
  },
  submit: {
    paddingVertical: 4,
  },
  submitLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  blockedNote: {
    fontSize: 12,
    paddingBottom: 8,
  },
});
