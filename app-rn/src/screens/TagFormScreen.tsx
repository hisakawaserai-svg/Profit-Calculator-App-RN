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
import { Ionicons } from '@expo/vector-icons';
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

import { ColorSwatchGrid } from '@/components/ColorSwatchGrid';
import { HelpButton } from '@/components/HelpButton';
import { HelpSheet } from '@/components/HelpSheet';
import { TagChip } from '@/components/TagChip';
import { TextField } from '@/components/TextField';
import type { Tag } from '@/db/schema';
import { createTag, removeTag, updateTag, useTagList } from '@/db/useTags';
import {
  CANCEL_LABEL,
  DELETE_CONFIRM_TITLE,
  DELETE_LABEL,
  presetCountLabel,
  SAVE_LABEL,
  TAG_LABEL,
  TAG_DELETE_LABEL,
  TAG_NAME_FIELD_LABEL,
  TAG_NAME_PLACEHOLDER,
  TAG_PREVIEW_LABEL,
  tagBlockedNote,
  tagDeleteConfirmMessage,
  tagFormTitle,
} from '@/logic/labels';
import { presetColorValue } from '@/logic/preset';
import { nextTagColor, validateTag } from '@/logic/tag';
import { useThemeColors } from '@/theme';

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
  /** バッジの色（SPEC-V7 §2.1）。**保存値は hex**（固定色も自由色も同じ形） */
  const [colorKey, setColorKey] = useState<string>(() =>
    tag == null ? nextTagColor(tags) : presetColorValue(tag.colorKey),
  );
  /** ヘッダの「？」（UI-SPEC §5-9）。色の 2 群（設計案 50c）を開いた状態で出す */
  const [showHelp, setShowHelp] = useState(false);

  // 自分自身は重複の相手にしない（名前を変えずに色だけ変える編集が止まらないように。§1.3）
  const others = tags.filter((other) => other.id !== tag?.id);
  const validation = validateTag({ name, colorKey }, others);

  /**
   * 色を 2 群に分けるための「色 → タグ名」（設計案 50c）。**全タグの中で数える** ──
   * プリセットのように種類で分かれていないので、絞る軸がそもそも無い（§1.1）。
   * 自分自身は入らない（others は自分を除いた一覧）── 自分の色は上の群の先頭に残す。
   */
  const usedBy = others.map((other) => ({ colorKey: other.colorKey, name: other.name }));

  /**
   * この行が付いている記録の数（useTagList が 1 か所で数える）。**2 か所で読む** ──
   * プレビューの右（§2.3-2。一覧の行と同じ数を出す）と、削除に確認を挟むかどうか（下記）。
   * 追加のときはまだ 1 件も付いていないので 0 ── 「0件」を出すのは、
   * 件数が行の一部であることを追加の時点でも見せるため（保存した直後の姿と揃う）。
   */
  const usageCount = tag == null ? 0 : (counts.get(tag.id) ?? 0);

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

    if (usageCount === 0) {
      remove();
      return;
    }
    Alert.alert(DELETE_CONFIRM_TITLE, tagDeleteConfirmMessage(usageCount), [
      { text: CANCEL_LABEL, style: 'cancel' },
      { text: DELETE_LABEL, style: 'destructive', onPress: remove },
    ]);
  }, [router, tag, usageCount]);

  return (
    <>
      <Stack.Screen
        options={{
          title: tagFormTitle(isNew),
          // 「？」は保存の**左**（UI-SPEC §5-9）。右端は保存のまま残す ──
          // 位置を入れ替えると、他の画面で覚えた「右端が保存」が崩れる
          headerRight: () => (
            <View style={styles.headerActions}>
              <HelpButton onPress={() => setShowHelp(true)} />
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
            </View>
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
          {/* §2.3-2: **一覧の行をそのまま先に見せる。** 入力に追従する ──
              保存できない理由は名前の欄の下が言うので、プレビューまで止めない。

              チップだけを置いていたのを、**使用件数とシェブロンまで入れた一覧の行の形**に変えた。
              チップ 1 つでは打った名前が出ているだけの帯に見え、**どこに出るものなのか**が
              読めなかった ── 行の形ごと見せて、左の語（「タグ一覧での見え方」）で名指しする。

              **押せない。** 見えているのは行き先ではなく、いま作っているものの姿そのもので、
              押した先に開くものが無い（シェブロンは一覧の行の一部として写っているだけ）。
              読み上げも 1 つの塊にして、点・名前・件数を別々の要素として読ませない */}
          <View
            style={[styles.card, styles.previewCard, { backgroundColor: colors.secondaryBackground }]}
            accessible
            accessibilityLabel={`${TAG_PREVIEW_LABEL}: ${name.trim() || TAG_NAME_PLACEHOLDER} ${presetCountLabel('ja', usageCount)}`}>
            <Text style={[styles.previewLabel, { color: colors.secondaryLabel }]}>
              {TAG_PREVIEW_LABEL}
            </Text>
            {/* 並び・大きさは TagListScreen の TagRow と同じ（チップ → 件数 → シェブロン）。
                **名前が長いときに縮むのはチップの側**（`shrink`）── 左の語は説明なので、
                そちらが切れると何のプレビューなのかを言えなくなる。件数とシェブロンは
                行の形そのものなので、縮めずに右端に残す */}
            <View style={styles.previewRow}>
              <TagChip
                tag={{ name: name.trim(), colorKey }}
                namePlaceholder={TAG_NAME_PLACEHOLDER}
                style={styles.previewChip}
              />
              <Text style={[styles.previewCount, { color: colors.secondaryLabel }]}>
                {presetCountLabel('ja', usageCount)}
              </Text>
              <Ionicons name="chevron-forward" size={18} color={colors.secondaryLabel} />
            </View>
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

          {/* §2.3-4 / SPEC-V7 §3 / 設計案 50c: 色を「まだ使っていない色」と「使用中」の
              2 群に分ける。プリセットの編集画面と**同じ部品**（ColorSwatchGrid）──
              同じパレットを共有しているので、片方だけ自由色が選べる状態を作らない。
              見出しは部品の側が持つので、ここでカードのラベルを重ねない */}
          <View style={[styles.card, { backgroundColor: colors.secondaryBackground }]}>
            <ColorSwatchGrid
              value={colorKey}
              onChange={setColorKey}
              // **全タグの中で数える**（プリセットのように種類で分かれていない。§1.1）。
              // others は自分を除いた一覧で、重複の判定にも使っているものをそのまま渡す
              usedBy={usedBy}
              // 保存値を渡す（いま選んでいる色ではない）── 使用中の色を押した瞬間に
              // その色が上の群へ移ってしまわないように
              ownColor={tag?.colorKey}
              entityLabel={TAG_LABEL}
            />
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

      {/* この画面は設定タブの中なので、「最初から読む」で使いかた全体へ push できる */}
      {showHelp && (
        <HelpSheet
          entry="tagForm"
          onClose={() => setShowHelp(false)}
          onReadAll={() => router.push('/settings/help')}
        />
      )}
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
  // 左が説明の語、右が一覧の行の姿。行の高さ（48pt）に合わせて上下の余白を詰める
  previewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    minHeight: 56,
  },
  previewLabel: {
    fontSize: 13,
  },
  // 右端をカードの内側に合わせる。チップが自前で右の余白（12pt）を持つので gap は詰める
  previewRow: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  // 幅が足りないときに削られるのはここだけ（名前は 1 行で省略される）
  previewChip: {
    flexShrink: 1,
  },
  previewCount: {
    fontSize: 15,
  },
  fieldLabel: {
    fontSize: 12,
  },
  saveButton: {
    fontSize: 16,
    fontWeight: '600',
  },
  /** ヘッダ右の 2 つ（「？」と保存）。間隔はタップ域が重ならない最小に取る */
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  deleteRow: {
    alignItems: 'center',
  },
  deleteLabel: {
    fontSize: 16,
  },
});
