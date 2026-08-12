// 絞り込みページ（SPEC-V4 §4.2 / §6 / 案 33c・35a〜35f）。
// **記録タブとデータタブの Stack に、同じ画面を 1 枚ずつ積む。**
//
// **下から出るシートをやめて push するページにした**（案 33c）── シートでは販売サイトだけが
// 2 枚目に分かれ、3 条件のうち 1 つだけ操作の深さが違っていた。1 枚のページなら 3 条件が
// 同じ深さで縦に並び、タグが数十件になっても縦に伸ばせる。
//
// **タブごとに画面をコピーしない**（§7.1）。3 条件も操作も同じで、分けると片方だけ直る事故が起きる。
// 違いは Stack が持つ state（RecordFilterState）から読む 2 点だけで、画面には分岐を書かない:
//   - `isSoldMode` … データタブは常に true（§6）。**販売サイトの節が常に出る**のはその帰結で、
//     「出品中では節を消す」分岐（§4.2）は記録タブ側だけの話。下部の見出しも
//     matchingRecordLabel(true) = 「この条件に合う記録」で自然に決まる
//   - `scope` … 件数を数える集合（§6 / FilterScope）。データタブは isSold / saleDate 非 null が
//     固定条件なので、記録タブの数え方をそのまま使うと下部の数もタグの行の数字も食い違う
//
// この画面が持たない判断:
// - **条件は選んだ瞬間から効く。** 「完了」は置かない（戻れば結果が見える。下部の件数も常に動く）
// - **絞り込みの state を持たない。** 開いたタブの Stack が持つ（RecordFilterState）
// - **一覧は引かない。** 下部に出すのは件数だけ（useFilteredRecordCount）
//
// 表示語はすべて labels.ts 経由（SPEC-V2 §5.3。画面で文字列を組み立てない）。
import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { SearchBar } from '@/components/SearchBar';
import { SegmentedControl } from '@/components/SegmentedControl';
import { TagDot } from '@/components/TagChip';
import { useFilteredRecordCount } from '@/db/useRecords';
import { useSiteNames, useTagCountsForFilter, useTagList } from '@/db/useTags';
import { KIND_FILTER_OPTIONS } from '@/logic/kindFilter';
import {
  FILTER_ALL_LABEL,
  FILTER_CLEAR_ALL_LABEL,
  FILTER_KIND_SECTION_LABEL,
  FILTER_LABEL,
  FILTER_SITE_EMPTY_BODY,
  FILTER_SITE_EMPTY_TITLE,
  FILTER_SITE_SECTION_LABEL,
  FILTER_TAG_EMPTY_BODY,
  FILTER_TAG_EMPTY_TITLE,
  FILTER_TAG_OR_HINT,
  FILTER_TAG_SEARCH_CANCEL_LABEL,
  FILTER_TAG_SEARCH_PLACEHOLDER,
  filterNoMatchNote,
  filterTagSearchEmptyBody,
  filterTagSearchEmptyTitle,
  filterTagSearchResultLabel,
  filterTagSectionLabel,
  matchingRecordCountValue,
  matchingRecordLabel,
  periodTitle,
} from '@/logic/labels';
import { isAllPeriod } from '@/logic/period';
import { activeFilterCount, hasActiveFilter, toFilterConditions } from '@/logic/recordFilter';
import { searchTags, selectedTags } from '@/logic/tag';
import { useRecordFilterState } from '@/screens/RecordFilterState';
import { useThemeColors } from '@/theme';

export function RecordFilterScreen() {
  const colors = useThemeColors();
  const { scope, filter, setFilter, isSoldMode, period, clearFilter } = useRecordFilterState();

  const { tags } = useTagList();
  const siteNames = useSiteNames();

  /** 検索欄の入力（案 35f）。**一覧の見え方だけを変える**ので filter には入れない */
  const [keyword, setKeyword] = useState('');

  // 下部の件数（§4.6）。検索語は含めない ── ここに入れると「条件は 3 つ」という
  // 決めごとが崩れ、下部の数の意味も変わる
  const { kind, siteName, tagIds } = useMemo(
    () => toFilterConditions(filter, isSoldMode),
    [filter, isSoldMode],
  );
  const countFilter = useMemo(
    () => ({ isSoldMode, period, kind, siteName, tagIds }),
    [isSoldMode, period, kind, siteName, tagIds],
  );
  const matchCount = useFilteredRecordCount(countFilter, scope);
  /**
   * タグの行に出す使用件数（§4.2.1 / §2.2 の例外）。**下部の件数と同じ filter と scope を
   * そのまま渡す** ── `tagIds` を外すのも集合を選ぶのも repository の側の責務で、
   * 2 か所で条件を組み立てない。こうしておくと「1 と出ている行を押して 0 件になる」が
   * 構造として起きない（タブが変わっても同じ理由で守られる）。
   */
  const counts = useTagCountsForFilter(countFilter, scope);

  const visibleTags = useMemo(() => searchTags(tags, keyword), [tags, keyword]);
  const selectedNames = useMemo(
    () => selectedTags(tags, filter.tagIds).map((tag) => tag.name),
    [tags, filter.tagIds],
  );
  const searching = keyword.trim() !== '';

  /** タグは複数選択（2 つ以上で OR。§4.4）。並びは常に tags のまま持つ（§1.5） */
  const toggleTag = (tagId: string) => {
    const next = new Set(filter.tagIds);
    if (next.has(tagId)) next.delete(tagId);
    else next.add(tagId);
    setFilter({
      ...filter,
      tagIds: tags.filter((candidate) => next.has(candidate.id)).map((candidate) => candidate.id),
    });
  };

  // §4.2.3 / 案 35e: 0 件のときだけ下部を 2 行にする。期間名は月バーと同じ書式で
  // （年を選んでいれば「2025年」）、全期間なら出さない（入れる語が無いので）。
  // **条件が 0 本なら 2 行目ごと出ない**（filterNoMatchNote が null を返す）──
  // 原因が期間しかなく、ここで言えることが無い
  const noMatchNote =
    matchCount === 0
      ? filterNoMatchNote(
          isAllPeriod(period) ? null : periodTitle(period),
          activeFilterCount(filter),
        )
      : null;

  const screenOptions = useMemo(
    () => ({
      title: FILTER_LABEL,
      // §4.2-1 の「完了」は置かない ── 条件は選んだ瞬間から効くので、閉じるだけのボタンになる。
      // 戻る導線はヘッダ左の「‹ 記録」1 つ（案 33c）
      headerRight: () => (
        <Pressable
          onPress={clearFilter}
          disabled={!hasActiveFilter(filter)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityState={{ disabled: !hasActiveFilter(filter) }}>
          <Text
            style={[
              styles.headerButton,
              { color: hasActiveFilter(filter) ? colors.blue : colors.mutedLabel },
            ]}>
            {FILTER_CLEAR_ALL_LABEL}
          </Text>
        </Pressable>
      ),
    }),
    [filter, clearFilter, colors.blue, colors.mutedLabel],
  );

  return (
    <>
      <Stack.Screen options={screenOptions} />
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag">
          {/* §4.2-2: 種別。選択肢は KIND_FILTER_OPTIONS をそのまま使う（SPEC-V2 §4.2） */}
          <Section label={FILTER_KIND_SECTION_LABEL}>
            <SegmentedControl
              options={KIND_FILTER_OPTIONS.map((option) => option.label)}
              selectedIndex={KIND_FILTER_OPTIONS.findIndex(
                (option) => option.value === filter.kind,
              )}
              onChange={(index) => setFilter({ ...filter, kind: KIND_FILTER_OPTIONS[index].value })}
            />
          </Section>

          {/* §4.2-3: 販売サイト（単一選択）。**出品中では節ごと出さない**（§4.2）──
              出品中の記録は site_name が空なので、残すと「選ぶと必ず 0 件になる欄」になる。
              無い理由の説明文は置かない（案 35c）。下部の見出しが対象を言うので足りる */}
          {isSoldMode && (
            <Section label={FILTER_SITE_SECTION_LABEL}>
              {siteNames.length === 0 ? (
                <Card>
                  <View style={styles.notice}>
                    <Text style={[styles.noticeTitle, { color: colors.label }]}>
                      {FILTER_SITE_EMPTY_TITLE}
                    </Text>
                    <Text style={[styles.noticeBody, { color: colors.secondaryLabel }]}>
                      {FILTER_SITE_EMPTY_BODY}
                    </Text>
                  </View>
                </Card>
              ) : (
                <Card>
                  {/* 先頭は「すべて」＝ 条件を外す行。**単一選択なので「選ばない状態」を
                      表す行が要る**（複数選択のタグに同じ行を置かない理由がこれ。案 35a） */}
                  {[null, ...siteNames].map((name, index) => (
                    <Row
                      key={name ?? ''}
                      showSeparator={index > 0}
                      onPress={() => setFilter({ ...filter, siteName: name })}
                      selected={name === filter.siteName}
                      accessibilityRole="button">
                      {/* 選択中の表し方はタグの節と揃える（同じ画面で 2 通りにしない） */}
                      <Text
                        style={[
                          styles.rowLabel,
                          styles.siteName,
                          {
                            color: name === filter.siteName ? colors.blue : colors.label,
                            fontWeight: name === filter.siteName ? '700' : '400',
                          },
                        ]}
                        numberOfLines={1}>
                        {name ?? FILTER_ALL_LABEL}
                      </Text>
                      <CheckSlot visible={name === filter.siteName} />
                    </Row>
                  ))}
                </Card>
              )}
            </Section>
          )}

          {/* §4.2-4 / §4.2.1: タグ（複数選択）。**「すべて」の行は置かない**（案 35a）──
              チェック 0 個が「絞らない」を意味するので、置くとヘッダの「すべて解除」と
              同じことをする口が 2 つになる。「N 件選択中」のような要約も出さない
              （読む値が増えるだけで、チェックを見れば分かる） */}
          <Section
            label={filterTagSectionLabel(tags.length)}
            hint={tags.length === 0 ? undefined : FILTER_TAG_OR_HINT}>
            {tags.length === 0 ? (
              // 案 35d: 検索欄も出さない。**設定への導線も置かない**（用が中断し、
              // 戻り道が記録タブではなく設定になる）。どこで作れるかだけを言う
              <Card>
                <View style={styles.notice}>
                  <Text style={[styles.noticeTitle, { color: colors.label }]}>
                    {FILTER_TAG_EMPTY_TITLE}
                  </Text>
                  <Text style={[styles.noticeBody, { color: colors.secondaryLabel }]}>
                    {FILTER_TAG_EMPTY_BODY}
                  </Text>
                </View>
              </Card>
            ) : (
              <>
                <View style={styles.searchRow}>
                  <SearchBar
                    value={keyword}
                    onChangeValue={setKeyword}
                    placeholder={FILTER_TAG_SEARCH_PLACEHOLDER}
                    style={styles.search}
                  />
                  {searching && (
                    <Pressable
                      onPress={() => setKeyword('')}
                      hitSlop={8}
                      accessibilityRole="button"
                      style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
                      <Text style={[styles.searchCancel, { color: colors.blue }]}>
                        {FILTER_TAG_SEARCH_CANCEL_LABEL}
                      </Text>
                    </Pressable>
                  )}
                </View>

                {visibleTags.length === 0 ? (
                  <Card>
                    <View style={styles.notice}>
                      <Text style={[styles.noticeTitle, { color: colors.label }]}>
                        {filterTagSearchEmptyTitle(keyword.trim())}
                      </Text>
                      {/* 検索で選択中のタグが画面から隠れるので、効いていることを言う（案 35f） */}
                      {filterTagSearchEmptyBody(selectedNames) != null && (
                        <Text style={[styles.noticeBody, { color: colors.secondaryLabel }]}>
                          {filterTagSearchEmptyBody(selectedNames)}
                        </Text>
                      )}
                    </View>
                  </Card>
                ) : (
                  <Card>
                    {visibleTags.map((tag, index) => {
                      const checked = filter.tagIds.includes(tag.id);
                      return (
                        <Row
                          key={tag.id}
                          showSeparator={index > 0}
                          onPress={() => toggleTag(tag.id)}
                          selected={checked}
                          accessibilityRole="checkbox">
                          {/* 色の点は青地の上でも**そのまま** ── タグの識別色なので、
                              選択状態で変えない（選択を示すのは地の色の役目） */}
                          <TagDot colorKey={tag.colorKey} />
                          {/* 選択中は青地 ＋ 青文字（下記 Row）＋ 太字。**位置は動かさない**（案 35b）──
                              押した行が上へ飛ぶと、次に押したい行の位置が変わる */}
                          <Text
                            style={[
                              styles.rowLabel,
                              styles.tagName,
                              {
                                color: checked ? colors.blue : colors.label,
                                fontWeight: checked ? '700' : '400',
                              },
                            ]}
                            numberOfLines={1}>
                            {tag.name}
                          </Text>
                          {/* 使用件数は**表示中の状態で絞った数**（§4.2 / §2.2 の例外）。
                              他の条件では動かないので、選んでもこの数字は変わらない */}
                          <Text
                            style={[
                              styles.rowCount,
                              { color: checked ? colors.blue : colors.secondaryLabel },
                            ]}>
                            {counts.get(tag.id) ?? 0}
                          </Text>
                          <CheckSlot visible={checked} />
                        </Row>
                      );
                    })}
                  </Card>
                )}

                {searching && (
                  <Text style={[styles.searchResult, { color: colors.secondaryLabel }]}>
                    {filterTagSearchResultLabel(tags.length, visibleTags.length)}
                  </Text>
                )}
              </>
            )}
          </Section>
        </ScrollView>

        {/* §4.2-5 / §4.6: 下部。条件を触るたびにその場で動く。**検索では動かない** */}
        <View
          style={[
            styles.footer,
            { backgroundColor: colors.secondaryBackground, borderTopColor: colors.separator },
          ]}>
          <View style={styles.footerLine}>
            <Text style={[styles.footerLabel, { color: colors.secondaryLabel }]} numberOfLines={1}>
              {matchingRecordLabel(isSoldMode)}
            </Text>
            <Text style={[styles.footerCount, { color: colors.label }]}>
              {matchingRecordCountValue(matchCount)}
            </Text>
          </View>
          {/* 案 35e: 0 件のときだけ 2 行目。解除ボタンは足さず（解除の口はヘッダの 1 つ）、
              警告色も使わない（間違いではなく事実なので） */}
          {noMatchNote != null && (
            <Text style={[styles.footerNote, { color: colors.secondaryLabel }]}>{noMatchNote}</Text>
          )}
        </View>
      </View>
    </>
  );
}

/** 節（見出し ＋ 右の補足 ＋ 中身）。3 つの節が同じ間隔・同じ見出しの大きさで並ぶようにする */
function Section({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  const colors = useThemeColors();

  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={[styles.sectionLabel, { color: colors.secondaryLabel }]} numberOfLines={1}>
          {label}
        </Text>
        {hint != null && (
          <Text style={[styles.sectionHint, { color: colors.secondaryLabel }]} numberOfLines={1}>
            {hint}
          </Text>
        )}
      </View>
      {children}
    </View>
  );
}

function Card({ children }: { children: ReactNode }) {
  const colors = useThemeColors();
  return (
    <View style={[styles.card, { backgroundColor: colors.secondaryBackground }]}>{children}</View>
  );
}

function Row({
  showSeparator,
  onPress,
  selected,
  accessibilityRole,
  children,
}: {
  showSeparator: boolean;
  onPress: () => void;
  selected: boolean;
  accessibilityRole: 'button' | 'checkbox';
  children: ReactNode;
}) {
  const colors = useThemeColors();

  return (
    <View>
      {showSeparator && <View style={[styles.separator, { backgroundColor: colors.separator }]} />}
      <Pressable
        onPress={onPress}
        accessibilityRole={accessibilityRole}
        accessibilityState={accessibilityRole === 'checkbox' ? { checked: selected } : { selected }}
        style={({ pressed }) => [
          styles.row,
          // 選択中は薄い青の地（UI-SPEC §1.2。期間シートの選択中と同じ表し方）。
          // **地が主で、青文字と太字は補助**
          selected && { backgroundColor: SELECTED_BACKGROUND },
          { opacity: pressed ? 0.5 : 1 },
        ]}>
        {children}
      </Pressable>
    </View>
  );
}

/**
 * 右端のチェック。**選択していなくても枠だけ確保する** ── 出し入れで幅が変わると、
 * 隣の使用件数が押すたびに横へ動く（案 35b の「位置を動かさない」は縦だけの話ではない）。
 */
function CheckSlot({ visible }: { visible: boolean }) {
  const colors = useThemeColors();

  return (
    <View style={styles.checkSlot}>
      {visible && <Ionicons name="checkmark" size={18} color={colors.blue} />}
    </View>
  );
}

/** 選択中の行の地（UI-SPEC §1.2）。期間シート・旧チップと同じ値で、明暗どちらでも薄く乗る */
const SELECTED_BACKGROUND = 'rgba(0, 122, 255, 0.12)';

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerButton: {
    fontSize: 16,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 24,
    gap: 20,
  },
  section: {
    gap: 8,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 8,
    marginLeft: 4,
  },
  sectionLabel: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '600',
  },
  sectionHint: {
    fontSize: 12,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  search: {
    flex: 1,
    marginHorizontal: 0,
    marginTop: 0,
    marginBottom: 0,
  },
  searchCancel: {
    fontSize: 15,
  },
  searchResult: {
    fontSize: 12,
    marginLeft: 4,
  },
  card: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  rowLabel: {
    flexShrink: 1,
    fontSize: 16,
  },
  tagName: {
    flex: 1,
  },
  siteName: {
    flex: 1,
  },
  checkSlot: {
    width: 18,
    alignItems: 'center',
  },
  rowCount: {
    fontSize: 14,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 16,
  },
  notice: {
    gap: 4,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  noticeTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  noticeBody: {
    fontSize: 13,
    lineHeight: 19,
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 28,
    gap: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  footerLabel: {
    flexShrink: 1,
    fontSize: 14,
  },
  footerCount: {
    fontSize: 15,
    fontWeight: '700',
  },
  footerNote: {
    fontSize: 12,
    lineHeight: 17,
  },
});
