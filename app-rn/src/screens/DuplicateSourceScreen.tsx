// 「過去の記録から複製」の複製元を選ぶ画面。記録タブの＋のメニューから push で開く。
//
// **この画面は選ぶだけで、何も書き込まない。** 行を押すと、その記録の内容を写した状態で
// 新規作成のフォーム（RecordFormSheet）がこの上にモーダルで開く ── 保存を押すまで
// レコードは作られない（決定 §7-7）。写す／写さないの規則は logic/duplicateRecord.ts。
//
// ## 1 枚で「最近」と「すべて」を切り替える
//
// 全件の一覧を別のルートにしなかった。並べるものも、検索も、タグの絞り込みも同じで、
// 違うのは**上限があるかどうか 1 つだけ**（`limit`）── 2 枚に分けると、行の描き方も
// 空表示も 2 か所に増える。「すべての記録を見る」は遷移ではなく、この画面の中で
// 見出しが「最近の記録」→「すべての記録」に変わり、上限が外れる。
//
// **検索するか、タグで絞った時点で自動的に全件になる。** 絞り込んだ結果の「最近の 8 件」は
// 意味の取りにくい集合で、探している物が上限の外にあっても気付けない。
//
// ## 売却済みと出品中を混ぜて出す
//
// 記録タブの一覧（useRecordList）は「売れた記録」「出品中」のどちらかしか返せない
// （RecordListFilter.isSoldMode が必須。repository.duplicateSources のコメント参照）。
// 複製元にその区別は要らないので、混ぜて返す専用のクエリを使う。
// 行そのものは記録タブと同じ `RecordRow` で、状態は行ごとに record.isSold を渡す。
import { Stack, useRouter } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { EmptyState } from '@/components/EmptyState';
import { RecordRow } from '@/components/RecordRow';
import { SearchBar } from '@/components/SearchBar';
import { TagChip } from '@/components/TagChip';
import type { SaleRecord } from '@/db/schema';
import { useDuplicateSources, useRecordCount } from '@/db/useRecords';
import { useRecordTagIds, useRecordTags, useTagList } from '@/db/useTags';
import { duplicateFormValues } from '@/logic/duplicateRecord';
import {
  DUPLICATE_ALL_SECTION_LABEL,
  DUPLICATE_EMPTY_BODY,
  DUPLICATE_EMPTY_TITLE,
  DUPLICATE_NO_MATCH_TITLE,
  DUPLICATE_RECENT_SECTION_LABEL,
  DUPLICATE_SCREEN_NOTE,
  DUPLICATE_SCREEN_TITLE,
  DUPLICATE_SHOW_ALL_LABEL,
  DUPLICATE_TAG_FILTER_LABEL,
  recordDetailAccessibilityLabel,
} from '@/logic/labels';
import { RecordFormSheet } from '@/screens/RecordFormSheet';
import { useThemeColors } from '@/theme';

/**
 * 「最近の記録」に出す件数。
 *
 * 8 件なのは、iPhone の 1 画面に検索欄・タグの行・見出しと一緒に収まり、
 * 「すべての記録を見る」まで指を動かさずに届く範囲だから（指定の 5〜10 件の中）。
 */
const RECENT_LIMIT = 8;

export function DuplicateSourceScreen() {
  const colors = useThemeColors();
  const router = useRouter();

  const [searchText, setSearchText] = useState('');
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [showAll, setShowAll] = useState(false);
  /** 押された複製元。フォームを開くための一時状態で、DB には何も書かない */
  const [picked, setPicked] = useState<SaleRecord | null>(null);
  /** フォームで保存されたか（閉じたあとに一覧へ戻すかの判断。下の RecordFormSheet 参照） */
  const savedRef = useRef(false);

  const { tags } = useTagList();
  const totalCount = useRecordCount().count;

  // 絞っている間は上限を外す（このファイルの冒頭）
  const filtering = searchText.trim() !== '' || selectedTagIds.length > 0;
  const limit = showAll || filtering ? undefined : RECENT_LIMIT;
  const records = useDuplicateSources(searchText, selectedTagIds, limit);

  // 行に出すタグ。並んでいる記録ぶんを 1 本のクエリで引く（記録タブの一覧と同じ形）
  const recordIds = useMemo(() => records.map((record) => record.id), [records]);
  const tagsByRecord = useRecordTags(recordIds);

  // 複製元に付いているタグ。押されるまでは undefined で、空配列が返る
  const { tagIds: pickedTagIds } = useRecordTagIds(picked?.id);

  /**
   * フォームに渡す初期値。**押した瞬間ではなく描画中に組み立てる** ──
   * タグは押した直後の描画で引けるので、押す側で作ると 1 コマ古い（空の）タグで開く。
   */
  const initialValues = useMemo(
    () => (picked == null ? undefined : duplicateFormValues(picked, pickedTagIds)),
    [picked, pickedTagIds],
  );

  const toggleTag = (tagId: string) => {
    setSelectedTagIds((current) =>
      current.includes(tagId) ? current.filter((id) => id !== tagId) : [...current, tagId],
    );
  };

  /** 上限に当たっているときだけ「すべての記録を見る」を出す（押しても増えない行を置かない） */
  const showsAllLink = !showAll && !filtering && totalCount > records.length;

  return (
    <>
      <Stack.Screen options={{ title: DUPLICATE_SCREEN_TITLE }} />
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        {/* 写らないものを先に言う 1 行（DUPLICATE_SCREEN_NOTE の理由） */}
        <Text style={[styles.note, { color: colors.secondaryLabel }]}>{DUPLICATE_SCREEN_NOTE}</Text>

        <SearchBar value={searchText} onChangeValue={setSearchText} style={styles.search} />

        {/* タグの絞り込み。登録が 0 件のときは行ごと出さない（押せるものが無い見出しを作らない） */}
        {tags.length > 0 && (
          <View style={styles.tagSection}>
            <Text style={[styles.tagLabel, { color: colors.secondaryLabel }]}>
              {DUPLICATE_TAG_FILTER_LABEL}
            </Text>
            <FlatList
              horizontal
              data={tags}
              keyExtractor={(tag) => tag.id}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.tagRow}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => toggleTag(item.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: selectedTagIds.includes(item.id) }}>
                  <TagChip
                    tag={item}
                    variant={selectedTagIds.includes(item.id) ? 'active' : 'unselected'}
                  />
                </Pressable>
              )}
            />
          </View>
        )}

        <FlatList
          data={records}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            records.length === 0 ? null : (
              <Text style={[styles.sectionTitle, { color: colors.secondaryLabel }]}>
                {limit == null ? DUPLICATE_ALL_SECTION_LABEL : DUPLICATE_RECENT_SECTION_LABEL}
              </Text>
            )
          }
          ListEmptyComponent={
            <EmptyState
              title={totalCount === 0 ? DUPLICATE_EMPTY_TITLE : DUPLICATE_NO_MATCH_TITLE}
              body={totalCount === 0 ? DUPLICATE_EMPTY_BODY : undefined}
            />
          }
          ListFooterComponent={
            showsAllLink ? (
              <Pressable
                onPress={() => setShowAll(true)}
                accessibilityRole="button"
                style={({ pressed }) => [styles.showAll, { opacity: pressed ? 0.5 : 1 }]}>
                <Text style={[styles.showAllLabel, { color: colors.blue }]}>
                  {DUPLICATE_SHOW_ALL_LABEL}
                </Text>
              </Pressable>
            ) : null
          }
          // 行の切れ目は線が示す（記録タブと同じ作り）。左を 16pt 空けて商品名の頭に合わせる
          ItemSeparatorComponent={() => (
            <View style={[styles.rowSeparator, { backgroundColor: colors.separator }]} />
          )}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => setPicked(item)}
              accessibilityRole="button"
              accessibilityLabel={recordDetailAccessibilityLabel('ja', item.itemName)}
              style={({ pressed }) => [
                styles.rowCard,
                {
                  backgroundColor: pressed ? colors.disabledBackground : colors.secondaryBackground,
                },
              ]}>
              {/* 状態は行ごとに決まる（この一覧は売却済みと出品中が混ざる）。
                  間隔を広げるのはこの画面だけ（RecordRow の density のコメント参照） */}
              <RecordRow
                record={item}
                isSoldMode={item.isSold}
                tags={tagsByRecord.get(item.id) ?? []}
                density="comfortable"
              />
            </Pressable>
          )}
        />
      </View>

      {/* 複製元を写した状態の新規フォーム。**保存されたらこの画面ごと閉じて一覧へ戻る** ──
          用が済んだ選択画面を戻る先に残すと、「戻る」で選び直しの画面に着く。

          戻るのは `onSaved` ではなく `onClose` の中（`handleSave` は onSaved → onClose の順に
          呼ぶ）── onSaved で先に pop すると、モーダルが載ったままこの画面が外れる。
          先に visible を false にしてから戻す。 */}
      <RecordFormSheet
        visible={picked != null}
        initialValues={initialValues}
        onSaved={() => {
          savedRef.current = true;
        }}
        onClose={() => {
          setPicked(null);
          if (!savedRef.current) return;
          savedRef.current = false;
          router.back();
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  note: {
    fontSize: 13,
    lineHeight: 19,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  search: {
    marginHorizontal: 16,
    marginTop: 12,
  },
  tagSection: {
    paddingTop: 12,
    gap: 6,
  },
  tagLabel: {
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: 16,
  },
  tagRow: {
    gap: 8,
    paddingHorizontal: 16,
  },
  /**
   * 下端の余白。**「すべての記録を見る」がタブバーの縁に触れないだけ取る。**
   * 8 件でちょうど画面が埋まると、この行が最下端に来てタブバーと隣り合う。
   */
  listContent: {
    paddingBottom: 56,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  /**
   * 1 行の器。**記録タブ（13pt）より縦に広い** ── あちらは眺める一覧で 1 画面に入る
   * 件数が要るが、ここは 1 件を読んで押す面なので、行どうしが触れない距離を優先する。
   */
  rowCard: {
    paddingHorizontal: 16,
    paddingVertical: 18,
  },
  rowSeparator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 16,
  },
  showAll: {
    alignItems: 'center',
    // 最後の行と離す（線のすぐ下に置くと一覧の続きに見える）
    marginTop: 12,
    paddingVertical: 16,
  },
  showAllLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
});
