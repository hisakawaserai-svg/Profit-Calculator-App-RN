// プリセットの追加・編集（SPEC-V3 §3.3 / 設計案 25b）。追加と編集で**同じ画面**を使い、
// 違うのは見出しと初期値、それに下端の「削除」と注記の有無だけ。
//
// §3.3 は下から出るシート（SheetModal）で書いていたが、設計案 25b は一覧からの push にした。
// 一覧じたいが設定タブからの push で、そこからさらにシートを重ねると、
// 「戻る」と「キャンセル」が同じ画面に 2 つ並ぶため。キャンセルはヘッダの戻るが担う。
//
// - **保存を押すまで書き込まない**（§3.3。記録フォームと同じ。UI-SPEC §8.6）
// - 保存ボタンの活性は validatePreset（§1.4）が決め、無効の理由は値の欄の下に 1 行出す（§3.3）
// - 表示語はすべて labels.ts 経由（画面で文字列を組み立てない）
import { Stack, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { CALCULATOR_GUTTER_WIDTH, NumericField } from '@/components/NumericField';
import { PresetRow } from '@/components/PresetRow';
import { SegmentedControl } from '@/components/SegmentedControl';
import { TextField } from '@/components/TextField';
import type { Preset, PresetType } from '@/db/schema';
import {
  countPresetUsage,
  createPreset,
  removePreset,
  updatePreset,
} from '@/db/usePresets';
import {
  CANCEL_LABEL,
  DELETE_CONFIRM_TITLE,
  DELETE_LABEL,
  PRESET_COLOR_FIELD_LABEL,
  PRESET_INITIAL_FIELD_LABEL,
  PRESET_INITIAL_NOTE,
  PRESET_NAME_FIELD_LABEL,
  PRESET_PACK_PRICE_FIELD_LABEL,
  PRESET_PACK_QUANTITY_FIELD_LABEL,
  PRESET_PRICE_MODE_LABEL,
  PRESET_PRICE_MODE_OPTIONS,
  PRESET_UNIT_PRICE_LABEL,
  presetBlockedNote,
  presetDeleteConfirmMessage,
  presetDeleteLabel,
  presetEditValueNote,
  presetFormTitle,
  presetUnitPriceText,
  presetValueFieldLabel,
  SAVE_LABEL,
} from '@/logic/labels';
import {
  clampPresetInitial,
  isPackBuy,
  normalizePresetColor,
  PRESET_COLOR_KEYS,
  presetDraftUnitPrice,
  presetInitial,
  validatePreset,
  type PresetColorKey,
} from '@/logic/preset';
import { useThemeColors } from '@/theme';

/** 色の丸（§3.3-6）。10 色を折り返して 2 段に並べる（PRESET_COLOR_KEYS のコメント参照） */
const SWATCH_SIZE = 36;

type Props = {
  type: PresetType;
  /** 編集する行。追加のときは null */
  preset: Preset | null;
};

export function PresetFormScreen({ type, preset }: Props) {
  const colors = useThemeColors();
  const router = useRouter();
  const isNew = preset == null;

  const [name, setName] = useState(preset?.name ?? '');
  // 数値は文字列で持つ（NumericField / validatePreset がどちらも文字列で扱う）。
  // 0 を「0」と出すのは、既定値 0 のプリセットを開いたときに欄が空に見えないようにするため
  const [value, setValue] = useState(preset == null ? '' : String(preset.value));
  const [initial, setInitial] = useState(preset?.initial ?? '');
  // 「金額の入れ方」（§2.6.2）。列は持たず、開くときは packQuantity > 0 から復元する（§2.6.4）
  const [packBuy, setPackBuy] = useState(preset != null && isPackBuy(preset));
  // 空 = 未入力。0 を「0」と出さないのは、入数の 0 が「1 個ずつ」の意味を兼ねているため
  const [packQuantity, setPackQuantity] = useState(
    preset != null && isPackBuy(preset) ? String(preset.packQuantity) : '',
  );
  const [packPrice, setPackPrice] = useState(
    preset != null && isPackBuy(preset) ? String(preset.packPrice) : '',
  );
  const [colorKey, setColorKey] = useState<PresetColorKey>(
    normalizePresetColor(preset?.colorKey ?? ''),
  );

  const draft = { type, name, initial, value, packBuy, packQuantity, packPrice };
  const validation = validatePreset(draft);
  // 入力に追従する計算結果（§2.6.2）。入数が空・0 のあいだは null ＝「—」（§2.6.6）
  const unitPrice = presetDraftUnitPrice(draft);

  /**
   * 2 択の切り替え（§2.6.2）。**「1 個ずつ」に戻すときだけ金額欄を書き換える** ──
   * そのときの 1 個あたりが金額欄に残る（値は変わらない。§2.6.6）。
   * 入数・購入価格は保存時に 0 に戻る（決定 §2.6.8-3）ので、ここでは消さない
   * （押し間違えて戻ってきたときに打ち直しにならないようにする）。
   */
  const changePriceMode = useCallback(
    (index: number) => {
      const next = index === 1;
      if (!next && unitPrice != null) setValue(String(unitPrice));
      setPackBuy(next);
    },
    [unitPrice],
  );

  // プレビュー（§3.3-2）は入力に追従する。不正な値でも「今の指定」をそのまま映す ──
  // 保存できない理由は下の 1 行が言うので、プレビューまで止めると何を直したのか分からなくなる
  const previewValue = Number.parseFloat(value);
  const preview = {
    type,
    name,
    initial,
    colorKey,
    // まとめ買いのときは 1 個あたりを映す（保存されるのもこの値。§2.6.4）
    value: packBuy ? (unitPrice ?? 0) : Number.isNaN(previewValue) ? 0 : previewValue,
  };

  const save = useCallback(() => {
    if (!validation.valid) return;
    const input = {
      type,
      name: validation.name,
      colorKey,
      initial: validation.initial,
      value: validation.value,
      packQuantity: validation.packQuantity,
      packPrice: validation.packPrice,
    };
    if (preset == null) createPreset(input);
    else updatePreset(preset.id, input);
    // 一覧は useFocusEffect で引き直すので、ここでは戻るだけでよい
    router.back();
  }, [colorKey, preset, router, type, validation]);

  /** まとめ買いの欄を出すか（§2.6.2。2 択を出すのは梱包材だけ） */
  const isPackBuyMode = type === 'packaging' && packBuy;

  /**
   * 値の欄の下の 1 行。**同時に 2 行出さない**（設計案 28c への指摘）──
   * 直すべきことがあるときは、それだけを読ませる。
   * 保存が無効な理由（§3.3）は赤、そうでなければ編集のときの注記（§1.5 の帰結）。
   */
  const note = !validation.valid ? (
    <Text style={[styles.blockedNote, { color: colors.red }]} accessibilityRole="alert">
      {presetBlockedNote(validation.reason, type)}
    </Text>
  ) : !isNew ? (
    <Text style={[styles.note, { color: colors.secondaryLabel }]}>{presetEditValueNote(type)}</Text>
  ) : null;

  /** 下端の削除（設計案 25b）。確認の条件は一覧の削除（25c）と同じ */
  const requestDelete = useCallback(() => {
    if (preset == null) return;
    const remove = () => {
      removePreset(preset.id);
      router.back();
    };

    const usage = countPresetUsage(preset);
    if (usage == null || usage === 0) {
      remove();
      return;
    }
    Alert.alert(DELETE_CONFIRM_TITLE, presetDeleteConfirmMessage(type, usage), [
      { text: CANCEL_LABEL, style: 'cancel' },
      { text: DELETE_LABEL, style: 'destructive', onPress: remove },
    ]);
  }, [preset, router, type]);

  return (
    <>
      <Stack.Screen
        options={{
          title: presetFormTitle(type, isNew),
          headerRight: () => (
            <Pressable
              onPress={save}
              disabled={!validation.valid}
              hitSlop={8}
              accessibilityRole="button">
              <Text
                style={[
                  styles.saveButton,
                  { color: validation.valid ? colors.blue : colors.disabledContent },
                ]}>
                {SAVE_LABEL}
              </Text>
            </Pressable>
          ),
        }}
      />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          style={{ backgroundColor: colors.background }}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled">
          {/* §3.3-2: 選択シートに出るのと同じ形のプレビュー。指定を常に反映する */}
          <View style={[styles.card, { backgroundColor: colors.secondaryBackground }]}>
            <PresetRow preset={preview} namePlaceholder={PRESET_NAME_FIELD_LABEL} />
          </View>

          <View style={[styles.card, styles.fieldCard, { backgroundColor: colors.secondaryBackground }]}>
            <TextField
              label={PRESET_NAME_FIELD_LABEL}
              value={name}
              onChangeValue={setName}
            />
            {/* §2.6.2: 2 択は金額欄の**上**。下に置くと、欄の形が変わる原因が欄の後ろに来る。
                出すのは梱包材だけ ── 送料は「1 回いくら」で箱買いの概念がなく、
                販売サイトは率（%）で個数の単位がない */}
            {type === 'packaging' && (
              <View style={styles.modeRow}>
                <Text style={[styles.fieldLabel, { color: colors.secondaryLabel }]}>
                  {PRESET_PRICE_MODE_LABEL}
                </Text>
                <SegmentedControl
                  options={PRESET_PRICE_MODE_OPTIONS}
                  selectedIndex={packBuy ? 1 : 0}
                  onChange={changePriceMode}
                />
              </View>
            )}
            {!isPackBuyMode && (
              <>
                <NumericField
                  label={presetValueFieldLabel(type)}
                  value={value}
                  onChangeValue={setValue}
                  // 電卓は残す（「1000 ÷ 30」の単価計算に使う。§3.3）が、その中の
                  // 「梱包材から選ぶ」は出さない ── プリセットからプリセットを選ぶ経路は作らない（§4.2）。
                  // 梱包材を登録する画面で既存の梱包材を呼べると、「封筒」を登録するのに「封筒」を選べてしまう
                  canPickPackaging={false}
                />
                {note}
              </>
            )}
          </View>

          {/* まとめ買いの 3 行は**別のカード**にする（設計案 28c）── 2 択で欄の形が変わったことが、
              カードが 1 枚増えることで見て取れる。名前と同じカードに続けると、どこから先が
              「金額の入れ方」で変わった部分なのか読めない */}
          {isPackBuyMode && (
            <>
              <View style={[styles.card, styles.packCard, { backgroundColor: colors.secondaryBackground }]}>
                <View style={styles.packRow}>
                  <NumericField
                    label={PRESET_PACK_QUANTITY_FIELD_LABEL}
                    value={packQuantity}
                    onChangeValue={setPackQuantity}
                    // 入数は数えた個数で、式にならない（§2.6.2）
                    showCalculator={false}
                  />
                </View>
                <View
                  style={[
                    styles.packRow,
                    styles.packRowDivided,
                    { borderTopColor: colors.separator },
                  ]}>
                  <NumericField
                    label={PRESET_PACK_PRICE_FIELD_LABEL}
                    value={packPrice}
                    onChangeValue={setPackPrice}
                    // まとめ買いでいちばん割り算が要る欄なので、電卓はここにだけ置く（§2.6.2）
                    canPickPackaging={false}
                  />
                </View>
                {/* 計算結果の行（§2.6.2）。入力欄に見せない ── 直せる口は入数と購入価格の 2 つでよい。
                    帯を敷くのは、上 2 行が「入れる欄」でこの行だけが「出る値」だと形で言うため */}
                <View
                  style={[styles.unitPriceRow, { backgroundColor: colors.highlightBackground }]}>
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
              </View>
              {note}
            </>
          )}

          <View style={[styles.card, { backgroundColor: colors.secondaryBackground }]}>
            <Text style={[styles.fieldLabel, { color: colors.secondaryLabel }]}>
              {PRESET_COLOR_FIELD_LABEL}
            </Text>
            <View style={styles.swatches}>
              {PRESET_COLOR_KEYS.map((key) => {
                const selected = key === colorKey;
                return (
                  <Pressable
                    key={key}
                    onPress={() => setColorKey(key)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    accessibilityLabel={key}
                    style={({ pressed }) => [
                      styles.swatchSlot,
                      {
                        // 選択中は外周にリング（§3.3-6）。丸の外側に間を空けて二重丸にするので、
                        // 枠は丸そのものではなくこの器が持つ（丸の中に線が食い込まない）
                        borderColor: selected ? colors.label : 'transparent',
                        opacity: pressed ? 0.5 : 1,
                      },
                    ]}>
                    <View
                      style={[
                        styles.swatch,
                        { backgroundColor: colors.presetTones[key].background },
                      ]}
                    />
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={[styles.card, { backgroundColor: colors.secondaryBackground }]}>
            <Text style={[styles.fieldLabel, { color: colors.secondaryLabel }]}>
              {PRESET_INITIAL_FIELD_LABEL}
            </Text>
            <TextInput
              style={[
                styles.initialInput,
                { color: colors.label, borderColor: colors.separator },
              ]}
              value={initial}
              // 打っている最中は数えない（§1.2）。日本語入力は「ふうとう」と打ってから
              // 「封筒」に変換するので、onChangeText で 2 文字に切ると 3 文字目が入らず
              // 変換に辿り着けない（maxLength を使っても同じ ── 変換中の文字も数えられる）。
              //
              // React Native は変換中かどうかを JS に出さない（iOS の markedTextRange も
              // Android の composing span もネイティブ内部で完結していて、対応するイベントがない）。
              // 変換が確定していることを確実に言えるのは欄を離れたときなので、そこで数える。
              onChangeText={setInitial}
              // 確定後の文字数で打ち止める（§1.2）。書記素で数える純粋関数を通す
              onBlur={() => setInitial(clampPresetInitial)}
              // 未入力でも何が出るか分かるよう、名前から導出した文字を薄く出す（§3.3-5）
              placeholder={presetInitial({ name, initial: '' })}
              placeholderTextColor={colors.mutedLabel}
              accessibilityLabel={PRESET_INITIAL_FIELD_LABEL}
            />
            <Text style={[styles.note, { color: colors.secondaryLabel }]}>
              {PRESET_INITIAL_NOTE}
            </Text>
          </View>

          {!isNew && (
            <Pressable
              onPress={requestDelete}
              accessibilityRole="button"
              style={({ pressed }) =>
                StyleSheet.flatten([
                  styles.card,
                  styles.deleteRow,
                  { backgroundColor: colors.secondaryBackground, opacity: pressed ? 0.6 : 1 },
                ])
              }>
              <Text style={[styles.deleteLabel, { color: colors.red }]}>
                {presetDeleteLabel(type)}
              </Text>
            </Pressable>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
    gap: 16,
  },
  card: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
  },
  // 入力行（NumericField）は自前で行高を持つので、上下の余白を詰める
  fieldCard: {
    paddingVertical: 8,
  },
  fieldLabel: {
    fontSize: 12,
  },
  // 2 択（§2.6.2）。行の左右の余白は NumericField の行に合わせる
  modeRow: {
    paddingTop: 8,
    paddingBottom: 4,
    gap: 6,
  },
  // まとめ買いの 3 行のカード。左右の余白は行ごとに持たせる（1 個あたりの帯を端まで敷くため）
  packCard: {
    paddingHorizontal: 0,
    paddingVertical: 0,
    gap: 0,
    overflow: 'hidden',
  },
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
  swatches: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  swatchSlot: {
    padding: 3,
    borderWidth: 2,
    borderRadius: SWATCH_SIZE / 2 + 5,
  },
  swatch: {
    width: SWATCH_SIZE,
    height: SWATCH_SIZE,
    borderRadius: SWATCH_SIZE / 2,
  },
  initialInput: {
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 16,
    // 2 文字しか入らない欄なので、幅も 2 文字ぶんに留める（横いっぱいだと長文を誘う）
    width: 96,
  },
  blockedNote: {
    fontSize: 12,
  },
  note: {
    fontSize: 12,
    lineHeight: 18,
  },
  saveButton: {
    fontSize: 16,
    fontWeight: '600',
  },
  deleteRow: {
    alignItems: 'center',
  },
  deleteLabel: {
    fontSize: 16,
  },
});
