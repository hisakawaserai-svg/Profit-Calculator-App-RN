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

import { NumericField } from '@/components/NumericField';
import { PresetRow } from '@/components/PresetRow';
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
  presetBlockedNote,
  presetDeleteConfirmMessage,
  presetDeleteLabel,
  presetEditValueNote,
  presetFormTitle,
  presetValueFieldLabel,
  SAVE_LABEL,
} from '@/logic/labels';
import {
  clampPresetInitial,
  normalizePresetColor,
  PRESET_COLOR_KEYS,
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
  const [colorKey, setColorKey] = useState<PresetColorKey>(
    normalizePresetColor(preset?.colorKey ?? ''),
  );

  const draft = { type, name, initial, value };
  const validation = validatePreset(draft);

  // プレビュー（§3.3-2）は入力に追従する。不正な値でも「今の指定」をそのまま映す ──
  // 保存できない理由は下の 1 行が言うので、プレビューまで止めると何を直したのか分からなくなる
  const previewValue = Number.parseFloat(value);
  const preview = {
    type,
    name,
    initial,
    colorKey,
    value: Number.isNaN(previewValue) ? 0 : previewValue,
  };

  const save = useCallback(() => {
    if (!validation.valid) return;
    const input = {
      type,
      name: validation.name,
      colorKey,
      initial: validation.initial,
      value: validation.value,
    };
    if (preset == null) createPreset(input);
    else updatePreset(preset.id, input);
    // 一覧は useFocusEffect で引き直すので、ここでは戻るだけでよい
    router.back();
  }, [colorKey, preset, router, type, validation]);

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
            <NumericField
              label={presetValueFieldLabel(type)}
              value={value}
              onChangeValue={setValue}
              // 電卓は残す（「1000 ÷ 30」の単価計算に使う。§3.3）が、その中の
              // 「梱包材から選ぶ」は出さない ── プリセットからプリセットを選ぶ経路は作らない（§4.2）。
              // 梱包材を登録する画面で既存の梱包材を呼べると、「封筒」を登録するのに「封筒」を選べてしまう
              canPickPackaging={false}
            />
            {/* §3.3: 無効の理由は値の欄の下に 1 行（ボタンがグレーなだけでは理由が分からない） */}
            {!validation.valid && (
              <Text style={[styles.blockedNote, { color: colors.red }]} accessibilityRole="alert">
                {presetBlockedNote(validation.reason, type)}
              </Text>
            )}
            {/* 編集のときだけ（追加には「これまでの記録」がない） */}
            {!isNew && (
              <Text style={[styles.note, { color: colors.secondaryLabel }]}>
                {presetEditValueNote(type)}
              </Text>
            )}
          </View>

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
