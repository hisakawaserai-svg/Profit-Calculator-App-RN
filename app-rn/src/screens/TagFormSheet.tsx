// タグの追加・編集（SPEC-V4 §2.3）。追加と編集で**同じシート**を使い、
// 違うのは見出しと初期値だけ。
//
// プリセットの編集（PresetFormScreen）が push の画面なのに対してこちらがシートなのは、
// 入る欄が 2 つ（名前・色）しかないため ── 一覧の行を押した先で画面が切り替わるより、
// 一覧の上に薄く重なって出る方が「1 行を直している」ことが読める。
// 一覧じたいは設定タブからの push なので、「戻る」と「キャンセル」が並ぶこともない。
//
// - **保存を押すまで書き込まない**（UI-SPEC §8.6。プリセットと同じ）
// - 保存ボタンの活性は validateTag（§1.3）が決め、無効の理由は名前の欄の下に 1 行出す
// - **文字数の上限で入力を切らない**（§1.3 / SPEC-V3 §1.2）。理由は下の TextField のコメント
// - 表示語はすべて labels.ts 経由（画面で文字列を組み立てない）
import { useCallback, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { SheetModal } from '@/components/SheetModal';
import { TagChip } from '@/components/TagChip';
import { TextField } from '@/components/TextField';
import type { Tag } from '@/db/schema';
import { createTag, updateTag } from '@/db/useTags';
import {
  CANCEL_LABEL,
  SAVE_LABEL,
  TAG_COLOR_FIELD_LABEL,
  TAG_NAME_FIELD_LABEL,
  TAG_NAME_PLACEHOLDER,
  tagBlockedNote,
  tagFormTitle,
} from '@/logic/labels';
import { normalizePresetColor, PRESET_COLOR_KEYS, type PresetColorKey } from '@/logic/preset';
import { nextTagColor, validateTag } from '@/logic/tag';
import { useThemeColors } from '@/theme';

/** 色の丸（§2.3-4）。PresetFormScreen と同じ大きさ ── 押し所の大きさを画面ごとに変えない */
const SWATCH_SIZE = 36;

type Props = {
  /** 編集する行。追加のときは null */
  tag: Tag | null;
  /**
   * 現在の全タグ（sortOrder 昇順）。**重複の判定（§1.3）と色の自動割り当て（§1.2）の
   * 両方に要る。** シートの中で引き直さないのは、一覧が既に持っているものを
   * 同じ画面で 2 度引かないため。
   */
  tags: readonly Tag[];
  /** 書き込んだ直後。呼び出し側は一覧を引き直す */
  onSaved: () => void;
  /** 閉じ切ってから呼ばれる（キャンセル・保存・幕のタップに共通） */
  onClose: () => void;
};

export function TagFormSheet({ tag, tags, onSaved, onClose }: Props) {
  const colors = useThemeColors();
  const isNew = tag == null;

  const [name, setName] = useState(tag?.name ?? '');
  // 追加は使用済みを避けた自動割り当て（§1.2）、編集は保存値。どちらも以降は
  // 8 色の丸で変えられる ── 自動で決まった色を直せないと、色分けの意図を持てない
  const [colorKey, setColorKey] = useState<PresetColorKey>(() =>
    tag == null ? nextTagColor(tags) : normalizePresetColor(tag.colorKey),
  );

  // 自分自身は重複の相手にしない（名前を変えずに色だけ変える編集が止まらないように。§1.3）
  const others = tags.filter((other) => other.id !== tag?.id);
  const validation = validateTag({ name, colorKey }, others);

  /**
   * 名前の欄の下に出す 1 行（§1.3）。**まだ 1 文字も打っていない追加のときだけ出さない** ──
   * 開いた瞬間に「名前を入れてください」と赤枠が出るのは、間違いの指摘ではなく順序の説明で、
   * 打ち始めれば消えるものを咎めとして見せることになる。空白だけを打った場合は出す
   * （それは保存できない入力そのもの）。
   */
  const blockedNote =
    validation.valid || (validation.reason === 'name-required' && name === '')
      ? null
      : tagBlockedNote(validation.reason);

  const save = useCallback(
    (close: () => void) => {
      if (!validation.valid) return;
      const input = { name: validation.name, colorKey: validation.colorKey };
      if (tag == null) createTag(input);
      else updateTag(tag.id, input);
      onSaved();
      close();
    },
    [onSaved, tag, validation],
  );

  return (
    <SheetModal onClose={onClose}>
      {(close) => (
        // シートは画面の下端にいるので、名前の欄を触ると鍵盤の下に隠れる。
        //
        // 画面いっぱいに広げて下端合わせにするのは、シートの maxHeight（%）が
        // **親の高さに対して**解決されるため ── 高さを持たないラッパの中に置くと
        // 割合が効かず、中身が下にはみ出したまま切れる。
        // box-none にしてあるので、シートの外を触れば幕に届いて閉じる（SheetModal と同じ）。
        <KeyboardAvoidingView
          style={styles.avoider}
          pointerEvents="box-none"
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[styles.sheet, { backgroundColor: colors.background }]}>
            {/* §2.3-1: 左「キャンセル」／中央「タグを追加」or「タグを編集」／右「保存」 */}
            <View style={styles.header}>
              <View style={styles.headerSide}>
                <Pressable onPress={close} hitSlop={8} accessibilityRole="button">
                  <Text style={[styles.headerButton, { color: colors.blue }]}>{CANCEL_LABEL}</Text>
                </Pressable>
              </View>
              <Text style={[styles.title, { color: colors.label }]} numberOfLines={1}>
                {tagFormTitle(isNew)}
              </Text>
              <View style={[styles.headerSide, styles.headerRight]}>
                <Pressable
                  onPress={() => save(close)}
                  disabled={!validation.valid}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !validation.valid }}>
                  <Text
                    style={[
                      styles.headerButton,
                      styles.saveButton,
                      { color: validation.valid ? colors.blue : colors.disabledContent },
                    ]}>
                    {SAVE_LABEL}
                  </Text>
                </Pressable>
              </View>
            </View>

            <ScrollView
              bounces={false}
              contentContainerStyle={styles.content}
              keyboardShouldPersistTaps="handled">
              {/* §2.3-2: 実物と同じ形のチップを 1 つ。入力に追従する ──
                  保存できない理由は名前の欄の下が言うので、プレビューまで止めない */}
              <View style={[styles.card, styles.previewCard]}>
                <TagChip
                  tag={{ name: name.trim(), colorKey }}
                  namePlaceholder={TAG_NAME_PLACEHOLDER}
                />
              </View>

              <View style={[styles.card, { backgroundColor: colors.secondaryBackground }]}>
                <TextField
                  label={TAG_NAME_FIELD_LABEL}
                  value={name}
                  // **打っている最中に切らない**（§1.3 / SPEC-V3 §1.2）。maxLength も
                  // onChangeText での切り詰めも使わない ── 日本語入力は「ようふく」と打ってから
                  // 「洋服」に変換するので、変換前のひらがなまで数えて打ち止めると、
                  // 上限の近くで変換に辿り着けなくなる（React Native は変換中かどうかを JS に出さない）。
                  // 12 文字を超えたら保存を止めて下に理由を出すだけにする ──
                  // 変換して縮めば、そのまま有効に戻る
                  onChangeValue={setName}
                  errorMessage={blockedNote}
                />
              </View>

              {/* §2.3-4: 色の丸を横並び。選択中は外周にリング（PresetFormScreen と同じ形）。
                  §2.3 は「8 色を 1 行」と書いていたが、パレットは 10 色ある（logic/preset.ts の
                  PRESET_COLOR_KEYS）ので、丸の大きさを変えずに折り返す */}
              <View style={[styles.card, { backgroundColor: colors.secondaryBackground }]}>
                <Text style={[styles.fieldLabel, { color: colors.secondaryLabel }]}>
                  {TAG_COLOR_FIELD_LABEL}
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
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      )}
    </SheetModal>
  );
}

const styles = StyleSheet.create({
  avoider: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '90%',
    paddingTop: 12,
    paddingBottom: 32,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
  },
  // 左右で同じ幅を取り、見出しを画面の中央から動かさない（他のシートと同じ）
  headerSide: {
    flex: 1,
  },
  headerRight: {
    alignItems: 'flex-end',
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
  },
  headerButton: {
    fontSize: 16,
  },
  saveButton: {
    fontWeight: '600',
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 16,
  },
  card: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
  },
  // プレビューは地色を敷かない ── チップの「薄い地」（selected）と紛れないように、
  // 出るときと同じ地（シートの背景）の上に置く
  previewCard: {
    alignItems: 'flex-start',
    paddingHorizontal: 0,
    paddingVertical: 0,
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
});
