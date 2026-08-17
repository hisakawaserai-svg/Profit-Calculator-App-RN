// 記録フォームのタグ選択シート（SPEC-V4 §3.2 / 設計案 30a）。タグ行の「＋」から下に出る。
//
// **PresetMultiPickerSheet は流用しない。** 形は似ている（複数選択・チェックボックス）が、
// 確定の仕方が逆だから ── あちらは選び終わってから金額を**積む**ので下端に「入れる」と
// 合計が要る（SPEC-V3 §4.5）。こちらは**集合の編集**で、チェックした瞬間にフォームの
// state へ入る。確定の瞬間を作る意味がないので、右上は「完了」＝閉じるだけ。
//
// 書き込みの境目（§3.2）:
// - **記録とタグの紐付けは書き込まない。** 保存されるのはフォームの「保存」を押したとき
//   （UI-SPEC §8.6 / repository.update が中間テーブルごと書き換える）。
// - **タグ本体の新規作成だけは即座に書き込む。** タグはフォームの下書きではなく
//   共有の資産で、フォームを捨てても残るものだから。色は自動割り当て（§1.2）。
//
// 表示語はすべて labels.ts 経由（SPEC-V2 §5.3。画面で文字列を組み立てない）。
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { EmptyState } from '@/components/EmptyState';
import { SearchBar } from '@/components/SearchBar';
import { SheetModal } from '@/components/SheetModal';
import { TagChip } from '@/components/TagChip';
import type { Tag } from '@/db/schema';
import { createTag, useTagList } from '@/db/useTags';
import {
  presetCountLabel,
  TAG_EMPTY_TITLE,
  TAG_LABEL,
  TAG_PICKER_DONE_LABEL,
  TAG_PICKER_EDIT_LINK,
  TAG_PICKER_EMPTY_BODY,
  TAG_PICKER_SEARCH_PLACEHOLDER,
  tagBlockedNote,
  tagCreateLabel,
} from '@/logic/labels';
import { nextTagColor, validateTag } from '@/logic/tag';
import { useThemeColors } from '@/theme';

type Props = {
  /** いまフォームが持っているタグの id（sortOrder 昇順） */
  selectedIds: readonly string[];
  /** チェックのたびに呼ばれる。渡すのは**並べ替え済みの全体**で、差分は渡さない（§1.5） */
  onChange: (tagIds: string[]) => void;
  /**
   * 末尾の「設定で編集する ▸」を出すか。**記録フォームからは false**
   * （PresetPickerSheet と同じ理由 ── RN の Modal の裏へ遷移してしまい、押しても
   * 何も起きないように見える）。絞り込みシートから開くときだけ true にする。
   */
  canOpenSettings?: boolean;
  /**
   * 検索欄からタグを作った直後（§3.2）。**呼び出し側もタグの一覧を持っている**とき
   * （記録フォームのチップ）に渡す ── このシートの中の一覧を引き直すだけでは、
   * 作ったばかりのタグがフォームのタグ行でチップとして描けない（名前も色も無い）。
   */
  onTagsChanged?: () => void;
  /** 閉じ切ってから呼ばれる（「完了」・幕のタップに共通） */
  onClose: () => void;
};

/** 開いている間だけマウントする前提（選択はフォーム側の state が持つ） */
export function TagPickerSheet({
  selectedIds,
  onChange,
  canOpenSettings = false,
  onTagsChanged,
  onClose,
}: Props) {
  const colors = useThemeColors();
  const router = useRouter();
  const { tags, counts, refresh } = useTagList();
  const [query, setQuery] = useState('');

  const keyword = query.trim();
  // 前方一致ではなく部分一致（§3.2）。数十件規模なので JS 側で絞る
  const visible = keyword === '' ? tags : tags.filter((tag) => tag.name.includes(keyword));

  /**
   * 新規作成行（§3.2-3）。**検索語に完全一致する既存タグが無いときだけ**出す。
   *
   * 出すかどうかは validateTag（§1.3）に決めさせる ── 完全一致は
   * `name-duplicated` として返ってくるので、重複の判定をここで書き直さずに済む。
   * 12 文字超・「・」入りのときは行を出さずに理由だけ出す（作れない名前で行を出すと、
   * 押しても何も起きないか、無効なタグができる）。
   */
  // 色はここでは決まらない（作る瞬間に nextTagColor が決める）ので、検証には空文字を渡す ──
  // validateTag が見るのは名前だけで、色は正規化して返すだけ（§1.3）
  const validation = keyword === '' ? null : validateTag({ name: keyword, colorKey: '' }, tags);
  const creatable = validation != null && validation.valid ? validation : null;
  const blockedNote =
    validation != null && !validation.valid && validation.reason !== 'name-duplicated'
      ? tagBlockedNote(validation.reason)
      : null;

  /** 並びは常に tags（sortOrder 昇順）のまま。チェックした順は持たない（§1.5） */
  const toggle = (tag: Tag) => {
    const next = new Set(selectedIds);
    if (next.has(tag.id)) next.delete(tag.id);
    else next.add(tag.id);
    onChange(tags.filter((candidate) => next.has(candidate.id)).map((candidate) => candidate.id));
  };

  /**
   * 検索欄からの新規作成（§3.2）。**色は選ばせない** ── ここには色を選ぶ画面が出せないし、
   * 作るたびに 2 段階になると検索欄から作れる意味がなくなる（§1.2 / 決定 §9-8）。
   *
   * 作った直後にチェック済みにする。末尾に採番される（§1.5）ので、並べ直さずに足せる。
   * 検索語は消す ── 作ったタグ 1 件だけが残った一覧を見せても、次に選ぶものが探せない。
   */
  const create = () => {
    if (creatable == null) return;
    const tag = createTag({ name: creatable.name, colorKey: nextTagColor(tags) });
    onChange([...selectedIds, tag.id]);
    setQuery('');
    refresh();
    onTagsChanged?.();
  };

  return (
    <SheetModal onClose={onClose}>
      {(close) => (
        // 検索欄がシートの上端にあり、触ると鍵盤がシートの下半分を覆う。
        // 画面いっぱいに広げて下端合わせにする理由は TagFormSheet のコメントと同じ
        // （maxHeight の % は親の高さに対して解決される）
        <KeyboardAvoidingView
          style={styles.avoider}
          pointerEvents="box-none"
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[styles.sheet, { backgroundColor: colors.background }]}>
            {/* §3.2-1: 左は空／中央「タグ」／右「完了」。0 件でも押せる ──
                「1 つも付けない」は保存できる状態なので、閉じ口を塞がない（§0） */}
            <View style={styles.header}>
              <View style={styles.headerSide} />
              <Text style={[styles.title, { color: colors.label }]} numberOfLines={1}>
                {TAG_LABEL}
              </Text>
              <View style={[styles.headerSide, styles.headerRight]}>
                <Pressable onPress={close} hitSlop={8} accessibilityRole="button">
                  <Text style={[styles.headerButton, { color: colors.blue }]}>
                    {TAG_PICKER_DONE_LABEL}
                  </Text>
                </Pressable>
              </View>
            </View>

            {/* §3.2-2: 検索欄。ここが新規作成の入口も兼ねる（下の作成行） */}
            <SearchBar
              value={query}
              onChangeValue={setQuery}
              placeholder={TAG_PICKER_SEARCH_PLACEHOLDER}
              style={styles.search}
            />

            <ScrollView
              bounces={false}
              contentContainerStyle={styles.listContent}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag">
              {/* 作れない名前のときは行の代わりに理由を 1 行（§1.3 の文言をそのまま使う） */}
              {blockedNote != null && (
                <Text style={[styles.blockedNote, { color: colors.red }]}>{blockedNote}</Text>
              )}

              {creatable != null && (
                <Pressable
                  onPress={create}
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.createRow,
                    { backgroundColor: colors.secondaryBackground, opacity: pressed ? 0.5 : 1 },
                  ]}>
                  <Text style={[styles.createLabel, { color: colors.blue }]} numberOfLines={1}>
                    {tagCreateLabel(creatable.name)}
                  </Text>
                </Pressable>
              )}

              {/* 空表示は「まだ 1 件も作っていない」ときだけ。**打ち始めたら引っ込める** ──
                  上に「＋『◯◯』を作る」が出ているのに「上の欄に名前を入れると…」と
                  案内し続けると、済んだ手順を読ませることになる */}
              {tags.length === 0 && keyword === '' ? (
                <EmptyState title={TAG_EMPTY_TITLE} body={TAG_PICKER_EMPTY_BODY} />
              ) : (
                visible.length > 0 && (
                  <View style={[styles.card, { backgroundColor: colors.secondaryBackground }]}>
                    {visible.map((tag, index) => (
                      <View key={tag.id}>
                        {index > 0 && (
                          <View style={[styles.separator, { backgroundColor: colors.separator }]} />
                        )}
                        <TagRow
                          tag={tag}
                          checked={selectedIds.includes(tag.id)}
                          usageCount={counts.get(tag.id) ?? 0}
                          onPress={() => toggle(tag)}
                        />
                      </View>
                    ))}
                  </View>
                )
              )}

              {/* §3.2-5: 末尾のリンク。記録フォームからは出ない（canOpenSettings） */}
              {canOpenSettings && (
                <Pressable
                  onPress={() => {
                    close();
                    router.push('/settings/tags');
                  }}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.editLink, { opacity: pressed ? 0.5 : 1 }]}>
                  <Text style={[styles.editLinkLabel, { color: colors.blue }]}>
                    {TAG_PICKER_EDIT_LINK}
                  </Text>
                </Pressable>
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      )}
    </SheetModal>
  );
}

/**
 * 一覧の 1 行（§3.2-4）: **チェックボックス ＋ 色の点 ＋ 名前 ＋ 右端に使用件数**。
 *
 * チェックボックスが左端なのは PresetMultiPickerSheet と同じ ── 押すたびに入れ替わるものを
 * 目で追う先を 1 か所に固定する。使用件数は設定タブの一覧（§2.2）と同じ数え方
 * （状態を問わない全記録。useTagList が 1 か所で持つ）。
 */
function TagRow({
  tag,
  checked,
  usageCount,
  onPress,
}: {
  tag: Tag;
  checked: boolean;
  usageCount: number;
  onPress: () => void;
}) {
  const colors = useThemeColors();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={tag.name}
      style={({ pressed }) => [styles.row, { opacity: pressed ? 0.5 : 1 }]}>
      <Ionicons
        name={checked ? 'checkmark-circle' : 'ellipse-outline'}
        size={22}
        color={checked ? colors.blue : colors.separator}
      />
      <View style={styles.rowName}>
        <TagChip tag={tag} />
      </View>
      {/* このシートはまだ多言語化していない（ステップ 2）ので、件数も日本語で出す */}
      <Text style={[styles.usageCount, { color: colors.secondaryLabel }]}>
        {presetCountLabel('ja', usageCount)}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  avoider: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '80%',
    paddingTop: 12,
    paddingBottom: 32,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    gap: 8,
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
    fontWeight: '600',
  },
  search: {
    marginTop: 0,
    marginBottom: 0,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
    gap: 8,
  },
  blockedNote: {
    fontSize: 12,
    marginLeft: 4,
  },
  createRow: {
    height: 48,
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  createLabel: {
    fontSize: 16,
  },
  card: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    // チップが自前で左右の余白を持つので、名前の左端が一覧画面と同じ位置に来るよう詰める
    paddingLeft: 16,
    paddingRight: 16,
    height: 48,
  },
  rowName: {
    flex: 1,
    flexDirection: 'row',
  },
  usageCount: {
    fontSize: 15,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 16,
  },
  editLink: {
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
  editLinkLabel: {
    fontSize: 15,
  },
});
