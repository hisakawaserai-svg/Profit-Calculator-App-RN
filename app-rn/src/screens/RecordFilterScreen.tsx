// 絞り込みページ（SPEC-V4 §4.2 / §6 / 案 33c・35a〜35f。SPEC-V11 で 9 条件・5 群へ）。
// **記録タブとデータタブの Stack に、同じ画面を 1 枚ずつ積む。**
//
// **下から出るシートをやめて push するページにした**（案 33c）── シートでは販売サイトだけが
// 2 枚目に分かれ、条件のうち 1 つだけ操作の深さが違っていた。1 枚のページなら条件が
// 同じ深さで縦に並び、タグが数十件になっても縦に伸ばせる。
//
// **9 本を平らに並べない**（SPEC-V11 §2）。折りたたみの 5 群（種別・販売サイト・タグ・
// 金額・その他）に畳み、**効いている群だけを開いた状態で始める**。開いた瞬間に読む量が
// 条件の本数ではなく群の数（5）で決まるのが要点で、条件が増えてもここは増えない。
// 初期の開閉は **マウント時に一度だけ**評価する（initialSectionExpansion のコメント）。
//
// **タブごとに画面をコピーしない**（§7.1）。条件も操作も同じで、分けると片方だけ直る事故が起きる。
// 違いは Stack が持つ state（RecordFilterState）から読む 2 点だけで、画面には分岐を書かない:
//   - `isSoldMode` … データタブは常に true（§6）。**販売サイトと目標の節が常に出る**のはその帰結で、
//     「出品中では節を消す」分岐（§4.2 / SPEC-V11 §7）は記録タブ側だけの話。下部の見出しも
//     matchingRecordLabel(locale, true) = 「この条件に合う記録」で自然に決まる
//   - `scope` … 件数を数える集合（§6 / FilterScope）。データタブは isSold / saleDate 非 null が
//     固定条件なので、記録タブの数え方をそのまま使うと下部の数も行の数字も食い違う
//
// この画面が持たない判断:
// - **条件は選んだ瞬間から効く。** 「完了」は置かない（戻れば結果が見える。下部の件数も常に動く）
// - **絞り込みの state を持たない。** 開いたタブの Stack が持つ（RecordFilterState）
// - **一覧は引かない。** 下部に出すのは件数だけ（useFilteredRecordCount）
//
// 表示語はすべて labels.ts 経由（SPEC-V2 §5.3。画面で文字列を組み立てない）。
import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Accordion } from '@/components/Accordion';
import { HelpButton } from '@/components/HelpButton';
import { HelpSheet } from '@/components/HelpSheet';
import { RangeField } from '@/components/RangeField';
import { SearchBar } from '@/components/SearchBar';
import { SegmentedControl } from '@/components/SegmentedControl';
import { TagDot } from '@/components/TagChip';
import { usePresetList } from '@/db/usePresets';
import { useFilteredRecordCount } from '@/db/useRecords';
import { useSiteCountsForFilter, useSiteNames, useTagCountsForFilter, useTagList } from '@/db/useTags';
import { kindFilterOptions } from '@/logic/kindFilter';
import {
  filterAllLabel,
  filterAmountLabel,
  filterAmountSectionLabel,
  filterClearAllLabel,
  filterKindSectionLabel,
  filterLabel,
  filterLossOnlyLabel,
  filterMemoLabel,
  filterOtherSectionLabel,
  filterSectionClearAccessibility,
  filterSectionClearLabel,
  filterSectionCountLabel,
  filterSiteEmptyBody,
  filterSiteEmptyTitle,
  filterSiteSectionLabel,
  filterSiteUnsetLabel,
  filterTagEmptyBody,
  filterTagEmptyTitle,
  filterTagOrHint,
  filterTagSearchCancelLabel,
  filterTagSearchPlaceholder,
  filterNoMatchNote,
  filterTagSearchEmptyBody,
  filterTagSearchEmptyTitle,
  filterTagSearchResultLabel,
  filterTagSectionLabel,
  filterTargetLabel,
  matchingRecordCountValue,
  matchingRecordLabel,
  periodTitle,
} from '@/logic/labels';
import { isAllPeriod } from '@/logic/period';
import {
  activeFilterCount,
  AMOUNT_RANGE_KEYS,
  clearSection,
  effectiveFilter,
  hasActiveFilter,
  initialSectionExpansion,
  sectionActiveCount,
  setAmountRange,
  siteNameOptions,
  toFilterConditions,
  type FilterSectionKey,
} from '@/logic/recordFilter';
import { searchTags, selectedTags } from '@/logic/tag';
import { useRecordFilterState } from '@/screens/RecordFilterState';
import { useLocale } from '@/settings';
import { useThemeColors } from '@/theme';

/** 販売サイトの行の値。null = すべて（条件を外す）/ '' = 未設定（SPEC-V11 §4.2） */
const SITE_ALL = null;
const SITE_UNSET = '';

/**
 * 群の見出しのアイコン（SPEC-V11 §2.3）。**使いかたの画面と同じ絵を使う**
 * （`components/helpItemIcons.ts`）── 同じ話に別の絵を当てると、使いかたで見た絵が
 * ここで通じない。選び方の作法もあちらに従う（中身がそのまま思い浮かぶ絵・outline で揃える）。
 *
 * | 群 | 絵 | 使いかたのどれと同じか |
 * |---|---|---|
 * | 種別 | `bag-handle-outline` | `record-kind`（不用品と仕入品） |
 * | 販売サイト | `globe-outline` | `terms-site`（販売サイトの表示額） |
 * | タグ | `pricetags-outline` | `record-tag` / `data-tag` |
 * | 金額 | `wallet-outline` | `calc-net`（手元に残るお金） |
 * | その他 | `ellipsis-horizontal-circle-outline` | **同じ絵は無い** |
 *
 * 「その他」だけ使いかたに相手がいない ── 目標・赤字・メモの寄せ集めで、
 * 中身を 1 つの絵にできない。**「その他」であること自体を絵にする**（同じ outline の族）。
 */
const SECTION_ICONS: Record<FilterSectionKey, keyof typeof Ionicons.glyphMap> = {
  kind: 'bag-handle-outline',
  site: 'globe-outline',
  tag: 'pricetags-outline',
  amount: 'wallet-outline',
  other: 'ellipsis-horizontal-circle-outline',
};

export function RecordFilterScreen() {
  // 表示語は locale を引数に取る（渡さないと React Compiler が初回の文字列で固定する。
  // src/i18n/index.ts の冒頭）。この購読で言語を変えたときに引き直される
  const locale = useLocale();

  const colors = useThemeColors();
  const router = useRouter();
  const { scope, filter, setFilter, isSoldMode, period, clearFilter } = useRecordFilterState();
  const kindOptions = kindFilterOptions(locale);

  const { tags } = useTagList();
  const recordSiteNames = useSiteNames();
  // 未使用の販売サイトも候補に出す（SPEC-V11 §4.3）。登録した名前は利用者にとって既に
  // 存在するもので、まだ 1 件も売れていないことは候補から消す理由にならない
  const { presets: sitePresets } = usePresetList('site');

  /** 検索欄の入力（案 35f）。**一覧の見え方だけを変える**ので filter には入れない */
  const [keyword, setKeyword] = useState('');
  /** ヘッダの「？」（UI-SPEC §5-9）。開閉は画面が持つ（ボタンはヘッダの options の中） */
  const [showHelp, setShowHelp] = useState(false);

  /**
   * 折りたたみの開閉（SPEC-V11 §2.2）。**初期値はマウント時に一度だけ**評価する ──
   * 毎描画で「効いていれば開く」を計算すると、その群の最後の 1 つを外した瞬間に節が閉じ、
   * いま押した行が画面から消える。以降は利用者の開閉操作だけで動かす。
   */
  const [expanded, setExpanded] = useState<Record<FilterSectionKey, boolean>>(() =>
    initialSectionExpansion(filter, isSoldMode),
  );
  const toggleSection = useCallback((key: FilterSectionKey) => {
    setExpanded((current) => ({ ...current, [key]: !current[key] }));
  }, []);

  // 効いている条件は必ず**状態を織り込んだ後**の下書きから数える（§4.2 / SPEC-V11 §7）──
  // 出品中で消えている節（販売サイト・目標）を数に残すと、群の見出しの数字と画面が食い違う
  const applied = effectiveFilter(filter, isSoldMode);

  // 下部の件数（§4.6）。検索語は含めない ── ここに入れると条件の本数の決めごとが崩れ、
  // 下部の数の意味も変わる。**条件はまとめて展開する**（SPEC-V11 §8）── 1 つずつ
  // 書き出すと、条件を足すたびにこの画面と一覧とグラフの 3 か所を直すことになる
  const conditions = useMemo(() => toFilterConditions(filter, isSoldMode), [filter, isSoldMode]);
  const countFilter = useMemo(
    () => ({ isSoldMode, period, ...conditions }),
    [isSoldMode, period, conditions],
  );
  const matchCount = useFilteredRecordCount(countFilter, scope);
  /**
   * タグ・販売サイトの行に出す使用件数（§4.2.1 / SPEC-V11 §4.1）。**下部の件数と同じ filter と
   * scope をそのまま渡す** ── 自分の条件を外すのも集合を選ぶのも repository の側の責務で、
   * 2 か所で条件を組み立てない。こうしておくと「1 と出ている行を押して 0 件になる」が
   * 構造として起きない（タブが変わっても同じ理由で守られる）。
   */
  const tagCounts = useTagCountsForFilter(countFilter, scope);
  const siteCounts = useSiteCountsForFilter(countFilter, scope);

  const presetSiteNames = useMemo(() => sitePresets.map((preset) => preset.name), [sitePresets]);
  const siteNames = useMemo(
    () => siteNameOptions(recordSiteNames, presetSiteNames, filter.siteName),
    [recordSiteNames, presetSiteNames, filter.siteName],
  );

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
  // 原因が期間しかなく、ここで言えることが無い。
  // **条件が 9 本になっても文言は増えない**（SPEC-V11 §9.3）── 出すのは月名と本数だけ
  const noMatchNote =
    matchCount === 0
      ? filterNoMatchNote(locale,
          isAllPeriod(period) ? null : periodTitle(locale, period),
          activeFilterCount(applied),
        )
      : null;

  const screenOptions = useMemo(
    () => ({
      title: filterLabel(locale),
      // §4.2-1 の「完了」は置かない ── 条件は選んだ瞬間から効くので、閉じるだけのボタンになる。
      // 戻る導線はヘッダ左の「‹ 記録」1 つ（案 33c）
      // 「？」は**「すべて解除」の左**（SPEC-V11 §2.4）── 条件が 9 本になり、
      // 「その他」に何が入るのかは開くまで分からない。右端は解除のままにして、
      // 押し間違えたときの被害が小さいほう（読むだけ）を内側に置く
      headerRight: () => (
        <View style={styles.headerRight}>
          <HelpButton onPress={() => setShowHelp(true)} />
          <Pressable
            onPress={clearFilter}
            disabled={!hasActiveFilter(applied)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityState={{ disabled: !hasActiveFilter(applied) }}>
            <Text
              style={[
                styles.headerButton,
                { color: hasActiveFilter(applied) ? colors.blue : colors.mutedLabel },
              ]}>
              {filterClearAllLabel(locale)}
            </Text>
          </Pressable>
        </View>
      ),
    }),
    // locale を入れないと、ヘッダの「すべて解除」だけ前の言語で残る
    // setShowHelp は不変だが、**書かないと React Compiler が最適化ごと諦める**
    // （手書きの依存と推論した依存が食い違う、という報告になる）
    [applied, clearFilter, colors.blue, colors.mutedLabel, locale, setShowHelp],
  );

  return (
    <>
      <Stack.Screen options={screenOptions} />
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag">
          {/* §4.2-2: 種別。選択肢は kindFilterOptions をそのまま使う（SPEC-V2 §4.2）。
              **描画のたびに引き直す** ── 表示名は locale で決まる（定数に畳むと言語が固定される）。
              **この群だけは常に開いた状態で始まる**（SPEC-V11 §2.2） */}
          <Section
            label={filterKindSectionLabel(locale)}
            icon={SECTION_ICONS.kind}
            count={sectionActiveCount(applied, 'kind')}
            expanded={expanded.kind}
            onToggle={() => toggleSection('kind')}
            onClear={() => setFilter(clearSection(filter, 'kind'))}>
            <Inset>
              <SegmentedControl
                options={kindOptions.map((option) => option.label)}
                selectedIndex={kindOptions.findIndex((option) => option.value === filter.kind)}
                onChange={(index) => setFilter({ ...filter, kind: kindOptions[index].value })}
              />
            </Inset>
          </Section>

          {/* §4.2-3: 販売サイト（単一選択）。**出品中では節ごと出さない**（§4.2）──
              出品中の記録は site_name が空なので、残すと「選ぶと必ず 0 件になる欄」になる。
              無い理由の説明文は置かない（案 35c）。下部の見出しが対象を言うので足りる */}
          {isSoldMode && (
            <Section
              label={filterSiteSectionLabel(locale)}
              icon={SECTION_ICONS.site}
              count={sectionActiveCount(applied, 'site')}
              expanded={expanded.site}
              onToggle={() => toggleSection('site')}
              onClear={() => setFilter(clearSection(filter, 'site'))}>
              {siteNames.length === 0 ? (
                <View style={styles.notice}>
                  <Text style={[styles.noticeTitle, { color: colors.label }]}>
                    {filterSiteEmptyTitle(locale)}
                  </Text>
                  <Text style={[styles.noticeBody, { color: colors.secondaryLabel }]}>
                    {filterSiteEmptyBody(locale)}
                  </Text>
                </View>
              ) : (
                <>
                  {/* 先頭は「すべて」＝ 条件を外す行。**単一選択なので「選ばない状態」を
                      表す行が要る**（複数選択のタグに同じ行を置かない理由がこれ。案 35a）。
                      末尾は「未設定」＝ 名前が入っていない記録（SPEC-V11 §4.2）──
                      名前を持たないので、昇順に並んだ候補の中に居場所がない */}
                  {[SITE_ALL, ...siteNames, SITE_UNSET].map((name, index) => (
                    <Row
                      key={name == null ? 'all' : name === SITE_UNSET ? 'unset' : `name:${name}`}
                      showSeparator
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
                        {name == null
                          ? filterAllLabel(locale)
                          : name === SITE_UNSET
                            ? filterSiteUnsetLabel(locale)
                            : name}
                      </Text>
                      {/* 使用件数はタグの行と同じ「押したら何件出るか」の予告（SPEC-V11 §4.1）。
                          「すべて」は条件を外す行なので数を出さない（下部の件数と同じ数になる） */}
                      {name != null && (
                        <Text
                          style={[
                            styles.rowCount,
                            {
                              color:
                                name === filter.siteName ? colors.blue : colors.secondaryLabel,
                            },
                          ]}>
                          {siteCounts.get(name) ?? 0}
                        </Text>
                      )}
                      <CheckSlot visible={name === filter.siteName} />
                    </Row>
                  ))}
                </>
              )}
            </Section>
          )}

          {/* §4.2-4 / §4.2.1: タグ（複数選択）。**「すべて」の行は置かない**（案 35a）──
              チェック 0 個が「絞らない」を意味するので、置くとヘッダの「すべて解除」と
              同じことをする口が 2 つになる。「N 件選択中」のような要約も出さない
              （読む値が増えるだけで、チェックを見れば分かる） */}
          <Section
            label={filterTagSectionLabel(locale, tags.length)}
            icon={SECTION_ICONS.tag}
            count={sectionActiveCount(applied, 'tag')}
            expanded={expanded.tag}
            onToggle={() => toggleSection('tag')}
            onClear={() => setFilter(clearSection(filter, 'tag'))}>
            {tags.length === 0 ? (
              // 案 35d: 検索欄も出さない。**設定への導線も置かない**（用が中断し、
              // 戻り道が記録タブではなく設定になる）。どこで作れるかだけを言う
              <View style={styles.notice}>
                <Text style={[styles.noticeTitle, { color: colors.label }]}>
                  {filterTagEmptyTitle(locale)}
                </Text>
                <Text style={[styles.noticeBody, { color: colors.secondaryLabel }]}>
                  {filterTagEmptyBody(locale)}
                </Text>
              </View>
            ) : (
              <>
                {/* §4.4 の OR を、選ぶ前に読んで分かる言い方で置く（案 35a）。
                    見出しの右にあったものを**カードの上へ降ろした**（SPEC-V11 §2.3）──
                    右端は群ごとの解除に取られる */}
                <Inset>
                  <Text style={[styles.sectionHint, { color: colors.secondaryLabel }]}>
                    {filterTagOrHint(locale)}
                  </Text>

                  <View style={styles.searchRow}>
                    <SearchBar
                      value={keyword}
                      onChangeValue={setKeyword}
                      placeholder={filterTagSearchPlaceholder(locale)}
                      style={styles.search}
                    />
                    {searching && (
                      <Pressable
                        onPress={() => setKeyword('')}
                        hitSlop={8}
                        accessibilityRole="button"
                        style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
                        <Text style={[styles.searchCancel, { color: colors.blue }]}>
                          {filterTagSearchCancelLabel(locale)}
                        </Text>
                      </Pressable>
                    )}
                  </View>
                </Inset>

                {visibleTags.length === 0 ? (
                  <View style={styles.notice}>
                    <Text style={[styles.noticeTitle, { color: colors.label }]}>
                      {filterTagSearchEmptyTitle(locale, keyword.trim())}
                    </Text>
                    {/* 検索で選択中のタグが画面から隠れるので、効いていることを言う（案 35f） */}
                    {filterTagSearchEmptyBody(locale, selectedNames) != null && (
                      <Text style={[styles.noticeBody, { color: colors.secondaryLabel }]}>
                        {filterTagSearchEmptyBody(locale, selectedNames)}
                      </Text>
                    )}
                  </View>
                ) : (
                  <>
                    {visibleTags.map((tag, index) => {
                      const checked = filter.tagIds.includes(tag.id);
                      return (
                        <Row
                          key={tag.id}
                          showSeparator
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
                            {tagCounts.get(tag.id) ?? 0}
                          </Text>
                          <CheckSlot visible={checked} />
                        </Row>
                      );
                    })}
                  </>
                )}

                {searching && (
                  <Inset>
                    <Text style={[styles.searchResult, { color: colors.secondaryLabel }]}>
                      {filterTagSearchResultLabel(locale, tags.length, visibleTags.length)}
                    </Text>
                  </Inset>
                )}
              </>
            )}
          </Section>

          {/* SPEC-V11 §6: 金額の範囲 3 本。**同じ形の欄を 3 つ並べるだけ**なので、
              AMOUNT_RANGE_KEYS をそのまま map する（欄ごとに書き分けない） */}
          <Section
            label={filterAmountSectionLabel(locale)}
            icon={SECTION_ICONS.amount}
            count={sectionActiveCount(applied, 'amount')}
            expanded={expanded.amount}
            onToggle={() => toggleSection('amount')}
            onClear={() => setFilter(clearSection(filter, 'amount'))}>
            <>
              {AMOUNT_RANGE_KEYS.map((key) => (
                <View key={key}>
                  <Divider />
                  <RangeField
                    label={filterAmountLabel(locale, key)}
                    min={filter.amounts[key].min}
                    max={filter.amounts[key].max}
                    onChangeMin={(value) =>
                      setFilter(setAmountRange(filter, key, { ...filter.amounts[key], min: value }))
                    }
                    onChangeMax={(value) =>
                      setFilter(setAmountRange(filter, key, { ...filter.amounts[key], max: value }))
                    }
                  />
                </View>
              ))}
            </>
          </Section>

          {/* SPEC-V11 §2 / §7: 目標・赤字・メモ。どれも 2 択か入切なので、タグと同じ行で出す。
              **出品中では目標の 2 行だけ消える**（§7.1）── 見込み額に「達成」は言えない。
              赤字のみは出品中でも出す（§7.2。値下げする前に見たい情報） */}
          <Section
            label={filterOtherSectionLabel(locale)}
            icon={SECTION_ICONS.other}
            count={sectionActiveCount(applied, 'other')}
            expanded={expanded.other}
            onToggle={() => toggleSection('other')}
            onClear={() => setFilter(clearSection(filter, 'other'))}>
            <>
              {[
                ...(isSoldMode
                  ? ([
                      {
                        key: 'targetMet',
                        label: filterTargetLabel(locale, 'met'),
                        checked: filter.targetStatus === 'met',
                        onPress: () =>
                          setFilter({
                            ...filter,
                            targetStatus: filter.targetStatus === 'met' ? null : 'met',
                          }),
                      },
                      {
                        key: 'targetMissed',
                        label: filterTargetLabel(locale, 'missed'),
                        checked: filter.targetStatus === 'missed',
                        onPress: () =>
                          setFilter({
                            ...filter,
                            targetStatus: filter.targetStatus === 'missed' ? null : 'missed',
                          }),
                      },
                    ] as const)
                  : []),
                {
                  key: 'lossOnly',
                  label: filterLossOnlyLabel(locale),
                  checked: filter.lossOnly,
                  onPress: () => setFilter({ ...filter, lossOnly: !filter.lossOnly }),
                },
                {
                  key: 'memoWith',
                  label: filterMemoLabel(locale, 'with'),
                  checked: filter.memoState === 'with',
                  onPress: () =>
                    setFilter({
                      ...filter,
                      memoState: filter.memoState === 'with' ? null : 'with',
                    }),
                },
                {
                  key: 'memoWithout',
                  label: filterMemoLabel(locale, 'without'),
                  checked: filter.memoState === 'without',
                  onPress: () =>
                    setFilter({
                      ...filter,
                      memoState: filter.memoState === 'without' ? null : 'without',
                    }),
                },
              ].map((option) => (
                <Row
                  key={option.key}
                  showSeparator
                  onPress={option.onPress}
                  selected={option.checked}
                  accessibilityRole="checkbox">
                  <Text
                    style={[
                      styles.rowLabel,
                      styles.tagName,
                      {
                        color: option.checked ? colors.blue : colors.label,
                        fontWeight: option.checked ? '700' : '400',
                      },
                    ]}
                    numberOfLines={1}>
                    {option.label}
                  </Text>
                  <CheckSlot visible={option.checked} />
                </Row>
              ))}
            </>
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
              {matchingRecordLabel(locale, isSoldMode)}
            </Text>
            <Text style={[styles.footerCount, { color: colors.label }]}>
              {matchingRecordCountValue(locale, matchCount)}
            </Text>
          </View>
          {/* 案 35e: 0 件のときだけ 2 行目。解除ボタンは足さず（解除の口はヘッダと群の見出し）、
              警告色も使わない（間違いではなく事実なので） */}
          {noMatchNote != null && (
            <Text style={[styles.footerNote, { color: colors.secondaryLabel }]}>{noMatchNote}</Text>
          )}
        </View>
      </View>

      {/* ヘッダの「？」（UI-SPEC §5-9）。記録タブ・データタブは設定タブとは別スタックなので
          push しない。開くのは一覧の「？」と同じ項目（record-find-filter）で、
          見出しだけこの画面の語になる（helpEntries の recordFilter） */}
      {showHelp && (
        <HelpSheet
          entry="recordFilter"
          onClose={() => setShowHelp(false)}
          onReadAll={() => router.push('/settings/help')}
        />
      )}
    </>
  );
}

/**
 * 群（折りたたみのカード）。**見出しの時点からカードの中にある**（使いかたの画面と同じ
 * `Accordion`）── 見出しだけカードの外に置くと、閉じている群が「押せる行」に見えず、
 * 5 つ並んだときに面が読めない。開いても閉じても、群 1 つ = カード 1 枚。
 *
 * **中身の余白は外す**（`contentStyle`）。この画面の中身は行の一覧が主で、
 * 行は自分で左右 16 の余白を持ち、**選択中の青い地はカードの端まで届く**必要がある
 * （途中で切れると、行ではなく帯が浮いて見える）。余白の要る中身
 * （セグメント・検索欄・注記）は、その中身の側が `sectionInset` を巻く。
 *
 * 見出しの右に**効いている数とその群だけの解除**を置く（SPEC-V11 §3）。
 * 0 本のときは出さない ── 押せない「解除」が並ぶと、どの群が効いているのかを
 * 数字ではなく色で読む話になる。数と解除を 1 つの押せる領域にまとめるのは、
 * 別々に置くと見出し行に押せるものが 3 つ（開閉・数・解除）並ぶため。
 */
function Section({
  label,
  icon,
  count,
  expanded,
  onToggle,
  onClear,
  children,
}: {
  label: string;
  /** 見出しの左に添える印（SECTION_ICONS）。使いかたの各項目と同じ形の行にする */
  icon: keyof typeof Ionicons.glyphMap;
  count: number;
  expanded: boolean;
  onToggle: () => void;
  onClear: () => void;
  children: ReactNode;
}) {
  const locale = useLocale();
  const colors = useThemeColors();

  return (
    <Accordion
      accessibilityLabel={label}
      expanded={expanded}
      onToggle={onToggle}
      contentStyle={styles.sectionContent}
      label={
        <View style={styles.sectionHead}>
          {/* 絵は読み上げに載せない（accessibilityLabel は見出しの語だけ）──
              絵は語の言い換えで、読み上げると同じことを 2 回言う（HelpScreen と同じ扱い） */}
          <Ionicons name={icon} size={19} color={colors.blue} style={styles.sectionIcon} />
          <Text style={[styles.sectionLabel, { color: colors.label }]} numberOfLines={1}>
            {label}
          </Text>
          {count > 0 && (
            <Pressable
              onPress={onClear}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={filterSectionClearAccessibility(locale, label)}
              style={({ pressed }) => [styles.sectionClear, { opacity: pressed ? 0.5 : 1 }]}>
              <Text style={[styles.sectionCount, { color: colors.secondaryLabel }]}>
                {filterSectionCountLabel(locale, count)}
              </Text>
              <Text style={[styles.sectionClearLabel, { color: colors.blue }]}>
                {filterSectionClearLabel(locale)}
              </Text>
            </Pressable>
          )}
        </View>
      }>
      {children}
    </Accordion>
  );
}

/** 行の一覧ではない中身（セグメント・検索欄・注記）に余白を戻すための巻き物 */
function Inset({ children }: { children: ReactNode }) {
  return <View style={styles.sectionInset}>{children}</View>;
}

/** 見出しと中身の間・行と行の間の区切り。カードの中なので左は 16 空ける */
function Divider() {
  const colors = useThemeColors();
  return <View style={[styles.separator, { backgroundColor: colors.separator }]} />;
}

/**
 * 行 1 つ。**上に区切りを敷く**（見出しと 1 行目の間にも 1 本入る）── 群がカードそのものに
 * なった（SPEC-V11 §2.3）ので、見出しと一覧の境目を線で示さないと 1 行目が見出しに続いて見える。
 */
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
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  headerButton: {
    fontSize: 16,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
    gap: 12,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  /** 使いかたの各項目と同じ幅（helpItemIcons の行と頭を揃える） */
  sectionIcon: {
    width: 22,
    textAlign: 'center',
  },
  sectionLabel: {
    // 見出しが伸びて、解除を右端へ押し出す（数と解除は常に右）
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
  },
  /** 群の中身はカードの端まで届かせる（余白は中身の側が持つ。§2.3） */
  sectionContent: {
    paddingHorizontal: 0,
    paddingBottom: 0,
  },
  /** 行の一覧ではない中身に余白を戻す。上は見出しの padding があるので空けない */
  sectionInset: {
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  sectionHint: {
    fontSize: 12,
    marginLeft: 4,
  },
  sectionClear: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionCount: {
    fontSize: 12,
  },
  sectionClearLabel: {
    fontSize: 14,
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
