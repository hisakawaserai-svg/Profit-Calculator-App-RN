// タグの追加・編集（SPEC-V4 §2.3）。追加と編集で**同じ画面**を使い、
// 違うのは見出しと初期値、それに下端の「削除」の有無だけ。
//
// §2.3 は下から出るシート（SheetModal）で書いていたが、**PresetFormScreen と同じ push にした**
// （SPEC-V3 §3.3 が設計案 25b で同じ判断をしている）。一覧じたいが設定タブからの push で、
// そこからさらにシートを重ねると「戻る」と「キャンセル」が同じ画面に 2 つ並ぶため。
// キャンセルはヘッダの戻る（「‹ タグ」）が担う。
//
// - **保存を押すまで書き込まない**（UI-SPEC §8.6。記録フォーム・プリセットと同じ）
// - 保存ボタンの活性は validateTag（§1.3）が決め、無効の理由は名前の欄の下に 1 行出す
// - **文字数の上限で入力を切らない**（§1.3 / SPEC-V3 §1.2）。理由は下の TextField のコメント
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
  View,
} from 'react-native';

import { TagChip } from '@/components/TagChip';
import { TextField } from '@/components/TextField';
import type { Tag } from '@/db/schema';
import { createTag, removeTag, updateTag, useTagList } from '@/db/useTags';
import {
  CANCEL_LABEL,
  DELETE_CONFIRM_TITLE,
  DELETE_LABEL,
  SAVE_LABEL,
  TAG_COLOR_FIELD_LABEL,
  TAG_DELETE_LABEL,
  TAG_NAME_FIELD_LABEL,
  TAG_NAME_PLACEHOLDER,
  tagBlockedNote,
  tagDeleteConfirmMessage,
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
};

export function TagFormScreen({ tag }: Props) {
  const colors = useThemeColors();
  const router = useRouter();
  const isNew = tag == null;

  /**
   * 全タグ（sortOrder 昇順）と使用件数。**重複の判定（§1.3）・色の自動割り当て（§1.2）・
   * 削除の確認（§2.3）の 3 つに要る。** 一覧から props で受け取らないのは、
   * push で開く画面が前の画面の state に依らないようにするため（PresetFormScreen と同じ）。
   */
  const { tags, counts } = useTagList();

  const [name, setName] = useState(tag?.name ?? '');
  // 追加は使用済みを避けた自動割り当て（§1.2）、編集は保存値。どちらも以降は
  // 色の丸で変えられる ── 自動で決まった色を直せないと、色分けの意図を持てない
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

  const save = useCallback(() => {
    if (!validation.valid) return;
    const input = { name: validation.name, colorKey: validation.colorKey };
    if (tag == null) createTag(input);
    else updateTag(tag.id, input);
    // 一覧は useFocusEffect で引き直すので、ここでは戻るだけでよい
    router.back();
  }, [router, tag, validation]);

  /**
   * 下端の削除（§2.3）。**使用件数が 1 件以上のときだけ確認を 1 枚挟む。**
   *
   * 一覧のスワイプ削除（§2.2）が確認なしで済むのは UndoBar が出るからで、ここは
   * 押した先で前の画面へ戻るため取り消しの口をその場に置けない。条件と形は
   * PresetFormScreen の requestDelete と同じにしてある。
   */
  const requestDelete = useCallback(() => {
    if (tag == null) return;
    const remove = () => {
      removeTag(tag.id);
      router.back();
    };

    const usage = counts.get(tag.id) ?? 0;
    if (usage === 0) {
      remove();
      return;
    }
    Alert.alert(DELETE_CONFIRM_TITLE, tagDeleteConfirmMessage(usage), [
      { text: CANCEL_LABEL, style: 'cancel' },
      { text: DELETE_LABEL, style: 'destructive', onPress: remove },
    ]);
  }, [counts, router, tag]);

  return (
    <>
      <Stack.Screen
        options={{
          title: tagFormTitle(isNew),
          headerRight: () => (
            <Pressable
              onPress={save}
              disabled={!validation.valid}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityState={{ disabled: !validation.valid }}>
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
          {/* §2.3-2: 実物と同じ形のチップを 1 つ。入力に追従する ──
              保存できない理由は名前の欄の下が言うので、プレビューまで止めない。
              カードに載せるのは PresetFormScreen のプレビュー（§3.3-2）と同じ形にするため。
              チップは地色を持たない見た目（plain）なので、カードの地と競合しない */}
          <View style={[styles.card, styles.previewCard, { backgroundColor: colors.secondaryBackground }]}>
            <TagChip tag={{ name: name.trim(), colorKey }} namePlaceholder={TAG_NAME_PLACEHOLDER} />
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
                        // 丸の外側に間を空けて二重丸にするので、枠は丸そのものではなく
                        // この器が持つ（丸の中に線が食い込まない）
                        borderColor: selected ? colors.label : 'transparent',
                        opacity: pressed ? 0.5 : 1,
                      },
                    ]}>
                    <View
                      style={[styles.swatch, { backgroundColor: colors.presetTones[key].background }]}
                    />
                  </Pressable>
                );
              })}
            </View>
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
              <Text style={[styles.deleteLabel, { color: colors.red }]}>{TAG_DELETE_LABEL}</Text>
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
  // チップは名前の長さぶんしか幅を取らない（カードいっぱいに伸ばさない）
  previewCard: {
    alignItems: 'flex-start',
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
