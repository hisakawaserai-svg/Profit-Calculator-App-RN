// 使いかた（UI-SPEC §3.2 / §5-9 / 採用案 `19c` `20b` `20c`）。
//
// **上部のチップで 4 ページを切り替える**（計算 / 記録 / データ / ことば）。
// アコーディオンだった旧実装（Swift 版 HelpView の移植）は全面的に置き換えた ──
// 中身が 4 タブ化前の文言（出品中タブ・実績タブ・分析タブ・売却済みスイッチ）のままで、
// 実物と食い違っていた。
//
// **この画面は 2 通りの出しかたで使い回す**（§5-9）:
//   - 設定タブの「使いかた」から push（全ページ・チップは既定の「計算」から）
//   - 各画面の「？」からシート（案 `20c`。困りそうな項目を先頭に持ち上げ、下端に
//     「使いかたを最初から読む ›」を置く）
//
// 本文と並びは `logic/helpContent.ts`、図は `components/HelpDiagram.tsx`。
// この画面が持つのは**並べ方だけ**で、文字列を組み立てない（SPEC-V2 §5.3）。
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  ChartReadingFigure,
  CsvKindsFigure,
  ExpenseItemsFigure,
  KindComparisonFigure,
  ReversePriceFigure,
  SaleDateRangeFigure,
  SiteAmountFigure,
  TagFilterOrFigure,
  TermsFigure,
} from '@/components/HelpDiagram';
import {
  HELP_PAGES,
  HELP_READ_ALL_LABEL,
  orderedBlocks,
  type HelpBlock,
  type HelpFigureId,
  type HelpPageId,
} from '@/logic/helpContent';
import { useThemeColors } from '@/theme';

const FIGURES: Record<HelpFigureId, () => React.JSX.Element> = {
  kind: KindComparisonFigure,
  terms: TermsFigure,
  siteAmount: SiteAmountFigure,
  saleDate: SaleDateRangeFigure,
  reversePrice: ReversePriceFigure,
  tagOr: TagFilterOrFigure,
  chart: ChartReadingFigure,
  csvKinds: CsvKindsFigure,
  expenseItems: ExpenseItemsFigure,
};

type Props = {
  /** 最初に開くページ。省略時は先頭（計算） */
  initialPage?: HelpPageId;
  /** このブロックをページの先頭へ持ち上げる（各画面の「？」から。案 `20c`） */
  leadBlockId?: string;
  /** シートから開いたときだけ渡す。下端の「最初から読む」を押したとき */
  onReadAll?: () => void;
  /**
   * ページの見出しを出すか（既定 true）。
   *
   * **シートでは出さない**（案 `20c`）── シートは見出し行にその場の語（「記録の書きかた」）を
   * 持っているので、中にページ名を重ねると 1 つの面に別名が 2 つ並ぶ。
   * どのページかはチップの選択で読める。設定タブから push したときは見出し行が
   * 「使いかた」なので、ページ名はこちらが出す（案 `20b`）。
   */
  showPageTitle?: boolean;
};

export function HelpScreen({
  initialPage,
  leadBlockId,
  onReadAll,
  showPageTitle = true,
}: Props) {
  const colors = useThemeColors();
  const [pageId, setPageId] = useState<HelpPageId>(initialPage ?? HELP_PAGES[0].id);
  const page = HELP_PAGES.find((candidate) => candidate.id === pageId) ?? HELP_PAGES[0];

  // 持ち上げが効くのは「？」で開いた最初のページだけ。チップで移ったら素の並びに戻す
  // ── 移った先は自分で選んだページなので、並べ替える理由がない
  const blocks = orderedBlocks(page, pageId === initialPage ? leadBlockId : undefined);

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

      <ScrollView contentContainerStyle={styles.content}>
        {showPageTitle && (
          <Text style={[styles.pageTitle, { color: colors.label }]}>{page.title}</Text>
        )}
        {blocks.map((block) => (
          <Block key={block.id} block={block} onOpenPage={setPageId} />
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

function Block({
  block,
  onOpenPage,
}: {
  block: HelpBlock;
  onOpenPage: (page: HelpPageId) => void;
}) {
  const colors = useThemeColors();

  if (block.kind === 'figure') {
    const Figure = FIGURES[block.figure];
    return <Figure />;
  }

  return (
    <View style={styles.textBlock}>
      {/* 図の直後の補足だけは見出しを持たない（図の見出しが兼ねる） */}
      {block.title !== '' && (
        <Text style={[styles.blockTitle, { color: colors.label }]}>{block.title}</Text>
      )}
      <Text style={[styles.blockBody, { color: colors.secondaryLabel }]}>{block.body}</Text>
      {block.link != null && (
        <Pressable
          onPress={() => onOpenPage(block.link!.to)}
          hitSlop={8}
          accessibilityRole="link"
          style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
          <Text style={[styles.blockLink, { color: colors.blue }]}>{block.link.label}</Text>
        </Pressable>
      )}
    </View>
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
    gap: 20,
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: '700',
  },
  textBlock: {
    gap: 6,
  },
  blockTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  blockBody: {
    fontSize: 15,
    lineHeight: 23,
  },
  blockLink: {
    fontSize: 15,
    fontWeight: '600',
    paddingTop: 2,
  },
  readAll: {
    alignItems: 'center',
    paddingTop: 12,
  },
  readAllLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
});
