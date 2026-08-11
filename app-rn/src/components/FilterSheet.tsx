// 絞り込みシート（SPEC-V4 §4.2 / 設計案 30b）。合計行の「絞り込み N」チップから下に出る。
//
// **3 つの条件を 1 枚にまとめる**のがこのシートの役目 ── 種別（SPEC-V2 §4.2）・
// 販売サイト（SPEC-V3 §1.5.1 で先送りしていた）・タグ（本書）。合計行のチップを増やすと
// 窮屈になる、という IMPROVEMENTS の懸念は「チップを増やさない」ことで解消する（§0）。
//
// この部品が持たない判断:
// - **条件は選んだ瞬間から効く。** 右上の「完了」は確定ではなく閉じるだけ
//   （下部の「N 件」がその場で動くので、確定の瞬間を作ると数字と一覧がずれて見える）
// - **絞り込みの state を持たない。** 下書きは呼び出し側（画面ローカルの state。決定 §9-9）
// - **件数を引かない。** repository を触るのは画面側（matchCount を受け取るだけ）
//
// 記録タブとデータタブで共用する（§6）。違いは販売サイトの節を出すかどうか（showSite）だけ。
//
// 表示語はすべて labels.ts 経由（SPEC-V2 §5.3。画面で文字列を組み立てない）。
import { Ionicons } from '@expo/vector-icons';
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { EmptyState } from '@/components/EmptyState';
import { SegmentedControl } from '@/components/SegmentedControl';
import { SheetModal } from '@/components/SheetModal';
import { TagChip } from '@/components/TagChip';
import type { Tag } from '@/db/schema';
import { KIND_FILTER_OPTIONS } from '@/logic/kindFilter';
import {
  FILTER_ALL_LABEL,
  FILTER_CLEAR_ALL_LABEL,
  FILTER_DONE_LABEL,
  FILTER_KIND_SECTION_LABEL,
  FILTER_LABEL,
  FILTER_SITE_EMPTY_BODY,
  FILTER_SITE_EMPTY_TITLE,
  FILTER_SITE_SECTION_LABEL,
  FILTER_TAG_EMPTY_NOTE,
  FILTER_TAG_SECTION_LABEL,
  matchingRecordCountLabel,
} from '@/logic/labels';
import { clearAll, hasActiveFilter, type RecordFilterDraft } from '@/logic/recordFilter';
import { useThemeColors } from '@/theme';

type Props = {
  visible: boolean;
  /** いま効いている条件（＝下書き。選んだ瞬間に呼び出し側へ返す） */
  filter: RecordFilterDraft;
  onChange: (next: RecordFilterDraft) => void;
  /**
   * 販売サイトの節を出すか（既定 true）。
   *
   * **記録タブで「出品中」を選んでいる間だけ false**（§4.2）── 出品中の記録は
   * site_name が空なので、節を残すと「選ぶと必ず 0 件になる欄」になる。
   * データタブは元から売れた記録だけを見る面なので常に true（§6）。
   */
  showSite?: boolean;
  /** 販売サイトの候補。**プリセットではなく記録に実在する名前**（§4.2） */
  siteNames: string[];
  /** タグの候補（sortOrder 昇順。§1.5） */
  tags: Tag[];
  /** 下部の「この条件に合う記録 N 件」（§4.6）。検索語は含めない条件で数えた値 */
  matchCount: number;
  onClose: () => void;
};

/** シートの中の 2 枚目（販売サイトの一覧）。push の代わりに面を差し替える（§4.2-3） */
type Page = 'main' | 'site';

export function FilterSheet({
  visible,
  filter,
  onChange,
  showSite = true,
  siteNames,
  tags,
  matchCount,
  onClose,
}: Props) {
  const colors = useThemeColors();
  const [page, setPage] = useState<Page>('main');

  const kindIndex = KIND_FILTER_OPTIONS.findIndex((option) => option.value === filter.kind);

  /** タグは複数選択（2 つ以上で OR。§4.4）。並びは常に tags のまま持つ（§1.5） */
  const toggleTag = (tag: Tag) => {
    const next = new Set(filter.tagIds);
    if (next.has(tag.id)) next.delete(tag.id);
    else next.add(tag.id);
    onChange({
      ...filter,
      tagIds: tags.filter((candidate) => next.has(candidate.id)).map((candidate) => candidate.id),
    });
  };

  return (
    <SheetModal
      visible={visible}
      onClose={() => {
        // 次に開くときは必ず 1 枚目から。閉じ切ってから戻すので、下がる途中で面が入れ替わらない
        setPage('main');
        onClose();
      }}>
      {(close) => (
        <View style={[styles.sheet, { backgroundColor: colors.background }]}>
          {page === 'site' ? (
            <SitePage
              siteNames={siteNames}
              selected={filter.siteName}
              onSelect={(siteName) => {
                onChange({ ...filter, siteName });
                setPage('main');
              }}
              onBack={() => setPage('main')}
            />
          ) : (
            <>
              {/* §4.2-1: 左「すべて解除」／中央「絞り込み」／右「完了」。
                  「すべて解除」が戻すのは 3 条件だけで、期間・検索・並び替えは動かない */}
              <View style={styles.header}>
                <View style={styles.headerSide}>
                  <Pressable
                    onPress={() => onChange(clearAll())}
                    disabled={!hasActiveFilter(filter)}
                    hitSlop={8}
                    accessibilityRole="button">
                    <Text
                      style={[
                        styles.headerButton,
                        { color: hasActiveFilter(filter) ? colors.blue : colors.mutedLabel },
                      ]}>
                      {FILTER_CLEAR_ALL_LABEL}
                    </Text>
                  </Pressable>
                </View>
                <Text style={[styles.title, { color: colors.label }]} numberOfLines={1}>
                  {FILTER_LABEL}
                </Text>
                <View style={[styles.headerSide, styles.headerRight]}>
                  <Pressable onPress={close} hitSlop={8} accessibilityRole="button">
                    <Text style={[styles.headerButton, styles.done, { color: colors.blue }]}>
                      {FILTER_DONE_LABEL}
                    </Text>
                  </Pressable>
                </View>
              </View>

              <ScrollView bounces={false} contentContainerStyle={styles.content}>
                {/* §4.2-2: 種別。選択肢は KIND_FILTER_OPTIONS をそのまま使う（SPEC-V2 §4.2） */}
                <Section label={FILTER_KIND_SECTION_LABEL}>
                  <SegmentedControl
                    options={KIND_FILTER_OPTIONS.map((option) => option.label)}
                    selectedIndex={kindIndex}
                    onChange={(index) =>
                      onChange({ ...filter, kind: KIND_FILTER_OPTIONS[index].value })
                    }
                  />
                </Section>

                {/* §4.2-3: 販売サイト（単一選択）。現在値を右に出し、押すと一覧へ */}
                {showSite && (
                  <Section label={FILTER_SITE_SECTION_LABEL}>
                    <Pressable
                      onPress={() => setPage('site')}
                      accessibilityRole="button"
                      accessibilityValue={{ text: filter.siteName ?? FILTER_ALL_LABEL }}
                      style={({ pressed }) => [
                        styles.valueRow,
                        { backgroundColor: colors.secondaryBackground, opacity: pressed ? 0.5 : 1 },
                      ]}>
                      <Text
                        style={[
                          styles.valueText,
                          { color: filter.siteName == null ? colors.secondaryLabel : colors.label },
                        ]}
                        numberOfLines={1}>
                        {filter.siteName ?? FILTER_ALL_LABEL}
                      </Text>
                      <Ionicons name="chevron-forward" size={16} color={colors.secondaryLabel} />
                    </Pressable>
                  </Section>
                )}

                {/* §4.2-4: タグ（複数選択のチップ）。2 つ以上選ぶと OR（§4.4） */}
                <Section label={FILTER_TAG_SECTION_LABEL}>
                  {tags.length === 0 ? (
                    <Text style={[styles.note, { color: colors.secondaryLabel }]}>
                      {FILTER_TAG_EMPTY_NOTE}
                    </Text>
                  ) : (
                    <View style={styles.chips}>
                      {tags.map((tag) => {
                        const selected = filter.tagIds.includes(tag.id);
                        return (
                          <Pressable
                            key={tag.id}
                            onPress={() => toggleTag(tag)}
                            accessibilityRole="checkbox"
                            accessibilityState={{ checked: selected }}
                            accessibilityLabel={tag.name}
                            style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
                            <TagChip tag={tag} variant={selected ? 'selected' : 'unselected'} />
                          </Pressable>
                        );
                      })}
                    </View>
                  )}
                </Section>
              </ScrollView>

              {/* §4.2-5 / §4.6: 下部。条件を触るたびにその場で動く */}
              <Text style={[styles.matchCount, { color: colors.secondaryLabel }]}>
                {matchingRecordCountLabel(matchCount)}
              </Text>
            </>
          )}
        </View>
      )}
    </SheetModal>
  );
}

/**
 * 2 枚目: 販売サイトの一覧（§4.2-3）。**単一選択で、選ぶと 1 枚目へ戻る。**
 * 件数の上限も検索欄も持たない（決定 §9-10）── 候補として並ぶのは
 * 「実際に使ったサイトの数」だけで、プリセットを何件登録しても増えない。
 */
function SitePage({
  siteNames,
  selected,
  onSelect,
  onBack,
}: {
  siteNames: string[];
  selected: string | null;
  onSelect: (siteName: string | null) => void;
  onBack: () => void;
}) {
  const colors = useThemeColors();

  return (
    <>
      <View style={styles.header}>
        <View style={styles.headerSide}>
          <Pressable
            onPress={onBack}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={FILTER_LABEL}
            style={styles.back}>
            <Ionicons name="chevron-back" size={20} color={colors.blue} />
            <Text style={[styles.headerButton, { color: colors.blue }]}>{FILTER_LABEL}</Text>
          </Pressable>
        </View>
        <Text style={[styles.title, { color: colors.label }]} numberOfLines={1}>
          {FILTER_SITE_SECTION_LABEL}
        </Text>
        <View style={styles.headerSide} />
      </View>

      <ScrollView bounces={false} contentContainerStyle={styles.content}>
        {siteNames.length === 0 ? (
          <EmptyState title={FILTER_SITE_EMPTY_TITLE} body={FILTER_SITE_EMPTY_BODY} />
        ) : (
          <View style={[styles.card, { backgroundColor: colors.secondaryBackground }]}>
            {/* 先頭は「すべて」＝ 条件を外す行。解除だけのために 1 枚目へ戻らせない */}
            {[null, ...siteNames].map((siteName, index) => (
              <View key={siteName ?? ''}>
                {index > 0 && (
                  <View style={[styles.separator, { backgroundColor: colors.separator }]} />
                )}
                <Pressable
                  onPress={() => onSelect(siteName)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: siteName === selected }}
                  style={({ pressed }) => [styles.row, { opacity: pressed ? 0.5 : 1 }]}>
                  <Text style={[styles.rowLabel, { color: colors.label }]} numberOfLines={1}>
                    {siteName ?? FILTER_ALL_LABEL}
                  </Text>
                  {siteName === selected && (
                    <Ionicons name="checkmark" size={18} color={colors.blue} />
                  )}
                </Pressable>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </>
  );
}

/** 節（見出し ＋ 中身）。3 つの節が同じ間隔・同じ見出しの大きさで並ぶようにする */
function Section({ label, children }: { label: string; children: ReactNode }) {
  const colors = useThemeColors();

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionLabel, { color: colors.secondaryLabel }]}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    maxHeight: '80%',
    paddingTop: 12,
    paddingBottom: 24,
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
  back: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
  },
  headerButton: {
    fontSize: 16,
  },
  done: {
    fontWeight: '600',
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
    gap: 20,
  },
  section: {
    gap: 8,
  },
  sectionLabel: {
    fontSize: 13,
    marginLeft: 4,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    height: 44,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  valueText: {
    flexShrink: 1,
    fontSize: 16,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  note: {
    fontSize: 14,
    marginLeft: 4,
  },
  card: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    height: 48,
    paddingHorizontal: 16,
  },
  rowLabel: {
    flexShrink: 1,
    fontSize: 16,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 16,
  },
  matchCount: {
    fontSize: 13,
    textAlign: 'center',
    paddingTop: 4,
  },
});
