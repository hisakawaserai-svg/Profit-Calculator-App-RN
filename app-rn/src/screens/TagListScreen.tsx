// タグの一覧（SPEC-V4 §2.2）。設定タブ「記録を分類する」のカードからの push。
//
// **PresetListScreen は流用しない**（§2.2）。あちらは type パラメータ・値の列
// （「210円」/「10%」）・頭文字を前提に組まれていて、4 つ目の種類として足すと
// 「値の列を出すか」の分岐が一覧・編集・プレビューの全部に入る。
// **部品は流用する** ── スワイプ削除は記録一覧（SPEC §5.4）と同じ ReanimatedSwipeable、
// 取り消しは UndoBar、色の丸は TagFormScreen。
//
// **追加・編集の開き方はプリセットと揃える**（§2.3）── 一覧が設定タブからの push なので、
// その上にシートを重ねると「戻る」と「キャンセル」が同じ画面に 2 つ並ぶ（SPEC-V3 §3.3 /
// 設計案 25b と同じ理由）。よって行タップも「＋ 追加」も `tags/edit` への push。
//
// 削除の作法もプリセットと違う（§2.2）:
// - **確認アラートを挟まない。** 左スワイプ →「削除」で即座に消え、UndoBar で取り消せる。
//   プリセットが確認を出したのは「使った記録の件数」が消える直前にしか分からなかったから
//   （設計案 25c）で、タグは使用件数が**一覧の行に常時出ている**（§2.2-2）。
// - **消えたことの重さは UndoBar の文言で言う**（§2.2 / tagDeletedMessage）。
import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';

import { EmptyState } from '@/components/EmptyState';
import { TagChip } from '@/components/TagChip';
import { UndoBar } from '@/components/UndoBar';
import type { Tag } from '@/db/schema';
import { removeTag, restoreTag, useTagList } from '@/db/useTags';
import {
  DELETE_LABEL,
  presetCountLabel,
  TAG_ADD_LABEL,
  TAG_EMPTY_BODY,
  TAG_EMPTY_TITLE,
  TAG_LABEL,
  TAG_LIST_NOTE,
  tagDeleteA11yLabel,
  tagDeletedMessage,
  UNDO_LABEL,
} from '@/logic/labels';
import { useThemeColors } from '@/theme';

/** 削除したタグと、剥がれた記録の id（§1.4）。取り消しは**両方**を書き戻す */
type DeletedTag = { tag: Tag; recordIds: string[] };

export function TagListScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const { tags, counts, refresh } = useTagList();
  const [deleted, setDeleted] = useState<DeletedTag | null>(null);

  /**
   * 追加・編集は隣の画面への push（§2.3。PresetListScreen.openForm と同じ形）。
   * 一覧の state は渡さない ── 開いた先は自分で引き直す。
   * 戻ってきたときの反映は useTagList の useFocusEffect が行う。
   */
  const openForm = useCallback(
    (tag: Tag | null) => {
      router.push({
        pathname: '/settings/tags/edit',
        params: tag == null ? undefined : { id: tag.id },
      });
    },
    [router],
  );

  /**
   * 削除（§2.2）。確認は挟まない。**中間行も一緒に消える**（§1.4）ので、
   * 何件の記録から外れたかは戻り値の recordIds から数える ── 一覧の使用件数を読み直すと、
   * 消した後の値（0）になっていて意味がない。
   */
  const deleteNow = useCallback(
    (tag: Tag) => {
      const removed = removeTag(tag.id);
      // 別経路で先に消えていれば戻す本体が無いので、UndoBar も出さない
      if (removed != null) setDeleted(removed);
      refresh();
    },
    [refresh],
  );

  const undoDelete = useCallback(() => {
    if (deleted == null) return;
    restoreTag(deleted.tag, deleted.recordIds);
    setDeleted(null);
    refresh();
  }, [deleted, refresh]);

  return (
    <>
      <Stack.Screen options={{ title: TAG_LABEL }} />
      <ScrollView
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={styles.content}>
        {tags.length === 0 ? (
          // §2.2-4: 「記録を追加するときにも作れます」まで言う ── ここでしか作れないと
          // 読まれると、記録フォームの検索欄から作る経路（§3.2）に気付けない
          <EmptyState
            title={TAG_EMPTY_TITLE}
            body={TAG_EMPTY_BODY}
            actionLabel={TAG_ADD_LABEL}
            onPressAction={() => openForm(null)}
          />
        ) : (
          // 赤い削除ボタンが角からはみ出さないよう、カードの側で切る
          <View
            style={[styles.card, { backgroundColor: colors.secondaryBackground }]}>
            {tags.map((tag, index) => (
              <View key={tag.id}>
                {index > 0 && (
                  <View style={[styles.separator, { backgroundColor: colors.separator }]} />
                )}
                <TagRow
                  tag={tag}
                  usageCount={counts.get(tag.id) ?? 0}
                  onPress={() => openForm(tag)}
                  onDelete={() => deleteNow(tag)}
                />
              </View>
            ))}

            <View style={[styles.separator, { backgroundColor: colors.separator }]} />
            {/* §2.2-3: カード末尾の「＋ 追加」。プリセット一覧と同じ形 */}
            <Pressable
              onPress={() => openForm(null)}
              accessibilityRole="button"
              style={({ pressed }) => [styles.addRow, { opacity: pressed ? 0.5 : 1 }]}>
              <Text style={[styles.addLabel, { color: colors.blue }]}>{TAG_ADD_LABEL}</Text>
            </Pressable>
          </View>
        )}

        {/* §2.2-5: 注記 1 行。タグは記録に紐付く（§0.1）ぶん、消したときに何が起きるかを名指しする。
            **1 件も無いときは出さない** ── 言っているのは「消したときに何が起きるか」で、
            消せるものが 1 つも無い画面では読む用がない。見た目の上でも、中央寄せの空表示に
            左寄せ・左余白 4pt の 1 行が 8pt 下へ貼り付いて、揃っていない塊になる */}
        {tags.length > 0 && (
          <Text style={[styles.note, { color: colors.secondaryLabel }]}>{TAG_LIST_NOTE}</Text>
        )}
      </ScrollView>

      {deleted != null && (
        <UndoBar
          // 使用件数が 1 件以上のときだけ「記録から外れました」が付く（§2.2）
          message={tagDeletedMessage(deleted.tag.name, deleted.recordIds.length)}
          actionLabel={UNDO_LABEL}
          onAction={undoDelete}
          onHide={() => setDeleted(null)}
        />
      )}
    </>
  );
}

/**
 * 一覧の 1 行（§2.2-2）: **色の点 ＋ 名前 ＋ 右端に使用件数**。行タップで編集シート。
 * 左スワイプで「削除」が出て、押すと確認なしで消える（記録一覧の SwipeToDeleteRow と同じ形）。
 *
 * 使用件数は**状態（売れた / 出品中）を問わない全記録**で数えたもの（§2.2）──
 * タグは記録の属性であって状態の属性ではない。数え方は useTagList が 1 か所で持つ。
 */
function TagRow({
  tag,
  usageCount,
  onPress,
  onDelete,
}: {
  tag: Tag;
  usageCount: number;
  onPress: () => void;
  onDelete: () => void;
}) {
  const colors = useThemeColors();

  return (
    <ReanimatedSwipeable
      friction={2}
      rightThreshold={40}
      renderRightActions={() => (
        <Pressable
          style={[styles.deleteAction, { backgroundColor: colors.red }]}
          onPress={onDelete}
          accessibilityRole="button"
          accessibilityLabel={tagDeleteA11yLabel(tag.name)}>
          <Text style={styles.deleteActionLabel}>{DELETE_LABEL}</Text>
        </Pressable>
      )}>
      {/* スワイプで下から出る赤が透けないよう、行そのものが地色を持つ */}
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.row,
          { backgroundColor: colors.secondaryBackground, opacity: pressed ? 0.5 : 1 },
        ]}>
        <View style={styles.rowName}>
          <TagChip tag={tag} />
        </View>
        <Text style={[styles.usageCount, { color: colors.secondaryLabel }]}>
          {presetCountLabel(usageCount)}
        </Text>
        <Ionicons name="chevron-forward" size={18} color={colors.secondaryLabel} />
      </Pressable>
    </ReanimatedSwipeable>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
    paddingBottom: 40,
    gap: 8,
  },
  card: {
    borderRadius: 12,
    // スワイプで出る赤い面をカードの角で切る
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    // チップが自前で左右の余白を持つので、行の左だけ詰めて名前の左端をそろえる
    paddingLeft: 8,
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
  deleteAction: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    height: '100%',
  },
  deleteActionLabel: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 16,
  },
  addRow: {
    height: 48,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  addLabel: {
    fontSize: 16,
  },
  note: {
    fontSize: 12,
    lineHeight: 18,
    marginLeft: 4,
  },
});
