// 使いかた（UI-SPEC §3.2 / §5-9 / 採用案 `19c` `20b` `20c`）。
//
// **上部のチップで 4 ページを切り替え、ページの中は 1 項目 1 段のアコーディオン。**
// ほとんどの項目に図が付いて縦に長くなったので、畳めるようにした ──
// 開いたままだと 1 ページが十数画面ぶんになり、目当ての項目まで指で送ることになる。
// 畳んだ見出しが並べば、ページ全体が**目次として読める**。
//
// **各段は独立して開閉する**（`Accordion` の既定の作り）。同時に 1 つだけに絞る形も考えたが、
// 読み比べたい組み合わせ（種別と、ことばの説明など）があるので閉じさせない。
//
// **この画面は 2 通りの出しかたで使い回す**（§5-9）:
//   - 設定タブの「使いかた」から push（全ページ・**全部畳んだ状態**から）
//   - 各画面の「？」からシート（案 `20c`。その画面の項目を**開いた状態**で出し、
//     下端に「使いかたを最初から読む ›」を置く）
//
// 本文と並びは `logic/helpContent.ts`、図は `components/HelpDiagram.tsx`（概念）と
// `components/HelpPartFigure.tsx`（実物の部品）。この画面が持つのは並べ方だけ。
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Accordion } from '@/components/Accordion';
import {
  ChartReadingFigure,
  CsvKindsFigure,
  ExpenseItemsFigure,
  GroupingFigure,
  KindComparisonFigure,
  PackBuyFigure,
  ReversePriceFigure,
  RoundingFigure,
  SaleDateRangeFigure,
  SiteAmountFigure,
  TagFilterOrFigure,
  TermsFigure,
} from '@/components/HelpDiagram';
import {
  AddRecordFigure,
  BreakdownFigure,
  CalculatorButtonFigure,
  ExportPreviewFigure,
  ExportTargetFigure,
  FilterEntryFigure,
  KindSelectorFigure,
  ModeProfitFigure,
  MonthBarFigure,
  PhotoFieldFigure,
  PresetListFigure,
  PresetTagFigure,
  SearchSortFigure,
  SoldListingFigure,
  StatusToggleFigure,
  TagRowFigure,
} from '@/components/HelpPartFigure';
import {
  HELP_PAGES,
  HELP_READ_ALL_LABEL,
  type HelpFigureId,
  type HelpItem,
  type HelpPageId,
} from '@/logic/helpContent';
import { useThemeColors } from '@/theme';

const FIGURES: Record<HelpFigureId, () => React.JSX.Element> = {
  // 概念の図（部品を描いても伝わらないもの）
  kind: KindComparisonFigure,
  terms: TermsFigure,
  siteAmount: SiteAmountFigure,
  saleDate: SaleDateRangeFigure,
  reversePrice: ReversePriceFigure,
  tagOr: TagFilterOrFigure,
  chart: ChartReadingFigure,
  csvKinds: CsvKindsFigure,
  expenseItems: ExpenseItemsFigure,
  packBuy: PackBuyFigure,
  grouping: GroupingFigure,
  rounding: RoundingFigure,
  // 実物の部品を使う図（UI を直すと図も一緒に変わる）
  modeProfit: ModeProfitFigure,
  calculatorButton: CalculatorButtonFigure,
  breakdown: BreakdownFigure,
  presetTag: PresetTagFigure,
  addRecord: AddRecordFigure,
  kindSelector: KindSelectorFigure,
  statusToggle: StatusToggleFigure,
  photoField: PhotoFieldFigure,
  tagRow: TagRowFigure,
  monthBar: MonthBarFigure,
  soldListing: SoldListingFigure,
  filterEntry: FilterEntryFigure,
  searchSort: SearchSortFigure,
  presetList: PresetListFigure,
  exportTarget: ExportTargetFigure,
  exportPreview: ExportPreviewFigure,
};

type Props = {
  /** 最初に開くページ。省略時は先頭（計算） */
  initialPage?: HelpPageId;
  /** この項目を開いた状態で出す（各画面の「？」から。案 `20c`） */
  leadItemId?: string;
  /** シートから開いたときだけ渡す。下端の「最初から読む」を押したとき */
  onReadAll?: () => void;
  /**
   * ページの見出しを出すか（既定 true）。
   *
   * **シートでは出さない**（案 `20c`）── シートは見出し行にその場の語（「記録の書きかた」）を
   * 持っているので、中にページ名を重ねると 1 つの面に別名が 2 つ並ぶ。
   * どのページかはチップの選択で読める。
   */
  showPageTitle?: boolean;
};

export function HelpScreen({
  initialPage,
  leadItemId,
  onReadAll,
  showPageTitle = true,
}: Props) {
  const colors = useThemeColors();
  const [pageId, setPageId] = useState<HelpPageId>(initialPage ?? HELP_PAGES[0].id);
  const page = HELP_PAGES.find((candidate) => candidate.id === pageId) ?? HELP_PAGES[0];

  /**
   * 開いた状態で出す項目は、「？」で開いた**最初のページだけ**（案 `20c`）。
   *
   * **設定タブから push したときは全部畳んだまま出す**（案 `20b` の姿）── そこは
   * 「最初から読む」面なので、どれか 1 つだけ開いて出す理由がない。目次が先に見えるほうが、
   * 探している項目に手が届く。チップで移った先も同じ理由で畳んだまま。
   */
  const leadId = pageId === initialPage ? leadItemId : undefined;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      {/* チップ（案 `20b`）。横に並べるだけで収まる 4 枚なので、横スクロールは持たない */}
      <View style={styles.chipRow}>
        {HELP_PAGES.map((candidate) => {
          const selected = candidate.id === pageId;
          return (
            <Pressable
              key={candidate.id}
              onPress={() => setPageId(candidate.id)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              style={({ pressed }) => [
                styles.chip,
                {
                  backgroundColor: selected ? colors.blue : colors.secondaryBackground,
                  opacity: pressed ? 0.6 : 1,
                },
              ]}>
              <Text
                style={[
                  styles.chipLabel,
                  { color: selected ? '#FFFFFF' : colors.label },
                  selected && styles.chipLabelSelected,
                ]}>
                {candidate.chip}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* ページを変えたら中身ごと作り直す（開いていた段を持ち越さない） */}
      <ScrollView key={pageId} contentContainerStyle={styles.content}>
        {showPageTitle && (
          <Text style={[styles.pageTitle, { color: colors.label }]}>{page.title}</Text>
        )}

        {page.items.map((item) => (
          <Item key={item.id} item={item} expanded={item.id === leadId} onOpenPage={setPageId} />
        ))}

        {/* 案 `20c`: シートから開いたときだけ、全体へ行ける口を下端に置く */}
        {onReadAll != null && (
          <Pressable
            onPress={onReadAll}
            accessibilityRole="link"
            style={({ pressed }) => [styles.readAll, { opacity: pressed ? 0.5 : 1 }]}>
            <Text style={[styles.readAllLabel, { color: colors.blue }]}>{HELP_READ_ALL_LABEL}</Text>
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}

function Item({
  item,
  expanded,
  onOpenPage,
}: {
  item: HelpItem;
  expanded: boolean;
  onOpenPage: (page: HelpPageId) => void;
}) {
  const colors = useThemeColors();
  const Figure = item.figure == null ? null : FIGURES[item.figure];

  return (
    <Accordion
      initiallyExpanded={expanded}
      accessibilityLabel={item.title}
      label={<Text style={[styles.itemTitle, { color: colors.label }]}>{item.title}</Text>}>
      <View style={styles.itemBody}>
        <Text style={[styles.body, { color: colors.secondaryLabel }]}>{item.body}</Text>
        {Figure != null && <Figure />}
        {item.link != null && (
          <Pressable
            onPress={() => onOpenPage(item.link!.to)}
            hitSlop={8}
            accessibilityRole="link"
            style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
            <Text style={[styles.link, { color: colors.blue }]}>{item.link.label}</Text>
          </Pressable>
        )}
      </View>
    </Accordion>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
  },
  chip: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 999,
  },
  chipLabel: {
    fontSize: 15,
  },
  chipLabelSelected: {
    fontWeight: '700',
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 40,
    gap: 8,
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: '700',
    paddingBottom: 4,
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: '600',
    flexShrink: 1,
  },
  itemBody: {
    gap: 12,
    paddingTop: 2,
  },
  body: {
    fontSize: 15,
    lineHeight: 23,
  },
  link: {
    fontSize: 15,
    fontWeight: '600',
  },
  readAll: {
    alignItems: 'center',
    paddingTop: 20,
  },
  readAllLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
});
