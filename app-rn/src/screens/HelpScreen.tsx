// 使いかた（UI-SPEC §3.2 / §5-9 / 採用案 `19c` `20b` `20c`）。
//
// **上部のチップで 5 ページを切り替え、ページの中は 1 項目 1 段のアコーディオン。**
// ほとんどの項目に図が付いて縦に長くなったので、畳めるようにした ──
// 開いたままだと 1 ページが十数画面ぶんになり、目当ての項目まで指で送ることになる。
// 畳んだ見出しが並べば、ページ全体が**目次として読める**。
//
// **項目が増えたページには群の小見出しを挟む**（`HelpGroup`）。記録ページは 27 項目あり、
// 畳んだ見出しが 27 本続くと目次としても長い ── 先に「作る / 見る / 探す / 直す /
// 設定タブで登録しておく」を読み、その中から探す形にする。群が 1 つだけのページ（ことば）では
// 見出しを出さない（helpContent.ts の `HelpGroup` 参照）。
//
// **開くのは同時に 1 つだけ。** 別の段を開くと、それまで開いていた段は閉じる。
// 当初は各段を独立して開閉させていた（`Accordion` の既定の作り）── 読み比べたい組み合わせ
// （種別と、ことばの説明など）があると考えたためだが、実際には**読む人は 1 つずつしか開かない**。
// 開きっぱなしの段が積み上がると、ページが十数画面ぶんに伸びて目次として読めなくなる
// ── アコーディオンにした理由そのものが消える。読み比べは `link` の行が引き受ける。
//
// 1 つだけにすると**押した行が上へ飛ぶ**問題が出る（上にあった段が閉じたぶん、
// 下の内容がまとめてせり上がる）。押した段の位置へこちらから送り直す（scrollToOpened 参照）。
//
// **「ことば」はチップに出さない。** 5 枚のチップは横に並べるだけで収まる上限で、
// 6 枚目を足すと折り返すか横スクロールになる。ことばは他のページから `link` で渡されることが
// 多いので、常設のチップ 1 枠より**画面先頭の 1 行**のほうが割に合う。
// ことばのページを開いている間は、チップはどれも選ばれていない状態になる ──
// そこがどこかは**必ず出すページ見出し**（下記 showsTitle）が言う。
//
// **この画面は 2 通りの出しかたで使い回す**（§5-9）:
//   - 設定タブの「使いかた」から push（全ページ・**全部畳んだ状態**から）
//   - 各画面の「？」からシート（案 `20c`。その画面の項目を**開いた状態**で出し、
//     下端に「使いかたを最初から読む ›」を置く）
//
// 本文と並びは `logic/helpContent.ts`、図は `components/HelpDiagram.tsx`（概念）と
// `components/HelpPartFigure.tsx`（実物の部品）。この画面が持つのは並べ方だけ。
import { Ionicons } from '@expo/vector-icons';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Accordion } from '@/components/Accordion';
import {
  AchievementKindsFigure,
  BackupMigrateFigure,
  BackupPreviewFigure,
  DuplicateFieldsFigure,
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
  TargetRoomFigure,
  TermsFigure,
} from '@/components/HelpDiagram';
import {
  AddRecordFigure,
  BreakdownFigure,
  CalculatorButtonFigure,
  CommissionFieldFigure,
  ColorGroupsFigure,
  DataModesFigure,
  ExportPreviewFigure,
  ExportTargetFigure,
  FilterEntryFigure,
  KindSelectorFigure,
  ModeProfitFigure,
  MonthBarFigure,
  PhotoFieldFigure,
  PhotoIncludeFigure,
  PresetBadgeFigure,
  PresetListFigure,
  PresetTagFigure,
  PriceLineFigure,
  RecordBarFigure,
  SearchSortFigure,
  ShippingMaterialFigure,
  SimulatorFigure,
  SoldListingFigure,
  StatusToggleFigure,
  TagRowFigure,
  TagViewModeFigure,
  TargetFieldFigure,
} from '@/components/HelpPartFigure';
import { helpItemIcon } from '@/components/helpItemIcons';
import {
  helpPages,
  helpReadAllLabel,
  helpTermsEntryLabel,
  helpPageOf,
  type HelpFigureId,
  type HelpItem,
  type HelpPageId,
} from '@/logic/helpContent';
import { useLocale } from '@/settings';
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
  backupPreview: BackupPreviewFigure,
  targetRoom: TargetRoomFigure,
  achievementKinds: AchievementKindsFigure,
  duplicateFields: DuplicateFieldsFigure,
  backupMigrate: BackupMigrateFigure,
  // 実物の部品を使う図（UI を直すと図も一緒に変わる）
  modeProfit: ModeProfitFigure,
  calculatorButton: CalculatorButtonFigure,
  commissionField: CommissionFieldFigure,
  breakdown: BreakdownFigure,
  presetTag: PresetTagFigure,
  shippingMaterial: ShippingMaterialFigure,
  addRecord: AddRecordFigure,
  kindSelector: KindSelectorFigure,
  statusToggle: StatusToggleFigure,
  photoField: PhotoFieldFigure,
  tagRow: TagRowFigure,
  targetField: TargetFieldFigure,
  recordBar: RecordBarFigure,
  priceLine: PriceLineFigure,
  simulator: SimulatorFigure,
  monthBar: MonthBarFigure,
  soldListing: SoldListingFigure,
  filterEntry: FilterEntryFigure,
  searchSort: SearchSortFigure,
  dataModes: DataModesFigure,
  tagViewMode: TagViewModeFigure,
  presetList: PresetListFigure,
  presetBadge: PresetBadgeFigure,
  colorGroups: ColorGroupsFigure,
  photoInclude: PhotoIncludeFigure,
  exportTarget: ExportTargetFigure,
  exportPreview: ExportPreviewFigure,
};

/** 開いた段へ送るときに、その段の上に残す隙間。真上に貼り付けず、前の段の裾を少し見せる */
const OPENED_TOP_MARGIN = 12;

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
   *
   * ただし**ことばのページだけは必ず出す** ── チップに出ないページなので、
   * 見出しを消すとどこを読んでいるのかを言うものが画面から無くなる。
   */
  showPageTitle?: boolean;
};

export function HelpScreen({
  initialPage,
  leadItemId,
  onReadAll,
  showPageTitle = true,
}: Props) {
  // 表示語は locale を引数に取る（src/i18n/index.ts の冒頭）
  const locale = useLocale();
  const pages = helpPages(locale);

  const colors = useThemeColors();
  // 既定は先頭のチップ（計算）。id は語ではないので locale では変わらない
  const [pageId, setPageId] = useState<HelpPageId>(initialPage ?? 'calc');

  /**
   * いま開いている段（**ページに 1 つだけ**。null は全部畳んだ状態）。
   *
   * 開閉を段ではなくこの画面が持つのは、1 つに絞るには**列が誰を開いているかを知っている**
   * 必要があるため（Accordion.tsx の controlled）。
   *
   * 初期値は「？」から渡された項目（案 `20c`）── ただし**開いた最初のページだけ**。
   * 設定タブから push したときは全部畳んだまま出す（案 `20b` の姿）。そこは「最初から読む」面で、
   * どれか 1 つだけ開いて出す理由がない。チップで移った先も同じ理由で畳んだまま（openPage 参照）。
   */
  const [openId, setOpenId] = useState<string | null>(
    initialPage == null ? null : leadItemId ?? null,
  );

  const page = helpPageOf(locale, pageId);
  const isTerms = pageId === 'terms';
  const showsTitle = showPageTitle || isTerms;

  const scrollRef = useRef<ScrollView>(null);
  /** 群の上端（中身の中での y）と、段の上端（群の中での y）。**開いた段へ送るためだけ**に持つ */
  const groupTops = useRef(new Map<number, number>()).current;
  const itemTops = useRef(new Map<string, { group: number; y: number }>()).current;
  /** 押した段。せり上がりが済んだら、この段の位置へ送る（scrollToOpened） */
  const pendingScrollId = useRef<string | null>(null);

  const topOf = (id: string): number | null => {
    const item = itemTops.get(id);
    const groupTop = item == null ? undefined : groupTops.get(item.group);
    return item == null || groupTop == null ? null : groupTop + item.y;
  };

  /**
   * 押した段の上端へ送る。**測り直したあとに呼ぶ**（下の onLayout の 2 か所）──
   * 閉じる段の高さは画面側から分からないので、せり上がったあとの位置を実測してから動かす。
   *
   * 動くのは 2 つのうち片方だけ:
   *   - 同じ群の上の段が閉じた → 群の y はそのまま、段の y が動く
   *   - 前の群の段が閉じた → 段の y はそのまま、群の y が動く
   * どちらの onLayout から来ても、もう片方は測り済みの値がそのまま使える。
   */
  const scrollToOpened = () => {
    const id = pendingScrollId.current;
    if (id == null) return;
    const top = topOf(id);
    if (top == null) return;
    pendingScrollId.current = null;
    scrollRef.current?.scrollTo({ y: Math.max(0, top - OPENED_TOP_MARGIN), animated: true });
  };

  /** 段を押したとき。開いているものがあれば閉じる（同時に 1 つだけ） */
  const toggleItem = (id: string) => {
    const next = openId === id ? null : id;
    // 送り直すのは**上の段が閉じるとき**だけ。下の段が閉じても押した行は動かない
    const closingTop = openId == null || openId === id ? null : topOf(openId);
    const openingTop = topOf(id);
    pendingScrollId.current =
      next != null && closingTop != null && openingTop != null && closingTop < openingTop
        ? id
        : null;
    setOpenId(next);
  };

  /**
   * チップ・リンクでページを移る。測った位置は前のページのものなので捨てる。
   *
   * `itemId` は `link` から渡る指し先（helpContent.ts の `HelpItem.link`）── その段を開いて、
   * **そこまで送る**。ページを移ると中身は作り直されて上端から始まるので、
   * 送らないと「開いてはいるが画面の外」になり、リンクが何も起きていないように見える。
   */
  const openPage = (next: HelpPageId, itemId?: string) => {
    groupTops.clear();
    itemTops.clear();
    const opened = itemId ?? (next === initialPage ? leadItemId ?? null : null);
    // 測り直しは作り直しのあと。並んだ順に onLayout が来るので、揃った時点で送られる
    pendingScrollId.current = itemId ?? null;
    setPageId(next);
    setOpenId(opened);
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      {/* チップ（案 `20b`）。横に並べるだけで収まる 5 枚なので、横スクロールは持たない */}
      <View style={styles.chipRow}>
        {pages.map((candidate) => {
          const selected = candidate.id === pageId;
          return (
            <Pressable
              key={candidate.id}
              onPress={() => openPage(candidate.id)}
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

      {/* ページを変えたら中身ごと作り直す（前のページの段の高さを持ち越さない） */}
      <ScrollView ref={scrollRef} key={pageId} contentContainerStyle={styles.content}>
        {showsTitle && (
          <Text style={[styles.pageTitle, { color: colors.label }]}>{page.title}</Text>
        )}

        {/* チップから外した「ことば」への入口。**ページの先頭に置く** ──
            どのページを読んでいても同じ場所にあるので、語で詰まった時点で戻ってこられる。
            ことばのページ自体では出さない（いま居る場所への入口になる） */}
        {!isTerms && (
          <Pressable
            onPress={() => openPage('terms')}
            accessibilityRole="link"
            style={({ pressed }) => [styles.termsEntry, { opacity: pressed ? 0.5 : 1 }]}>
            <Text style={[styles.termsEntryLabel, { color: colors.blue }]}>
              {helpTermsEntryLabel(locale)}
            </Text>
          </Pressable>
        )}

        {page.groups.map((group, index) => (
          <View
            key={group.title ?? index}
            style={styles.group}
            onLayout={(event) => {
              groupTops.set(index, event.nativeEvent.layout.y);
              // 前の群の段が閉じて、この群ごとせり上がったとき
              if (itemTops.get(pendingScrollId.current ?? '')?.group === index) scrollToOpened();
            }}>
            {group.title != null && (
              <Text style={[styles.groupTitle, { color: colors.secondaryLabel }]}>
                {group.title}
              </Text>
            )}
            {group.items.map((item) => (
              <Item
                key={item.id}
                item={item}
                expanded={item.id === openId}
                onToggle={() => toggleItem(item.id)}
                onMeasure={(y) => {
                  itemTops.set(item.id, { group: index, y });
                  // 同じ群の上の段が閉じて、この段だけがせり上がったとき
                  if (pendingScrollId.current === item.id) scrollToOpened();
                }}
                onOpenPage={openPage}
              />
            ))}
          </View>
        ))}

        {/* 案 `20c`: シートから開いたときだけ、全体へ行ける口を下端に置く */}
        {onReadAll != null && (
          <Pressable
            onPress={onReadAll}
            accessibilityRole="link"
            style={({ pressed }) => [styles.readAll, { opacity: pressed ? 0.5 : 1 }]}>
            <Text style={[styles.readAllLabel, { color: colors.blue }]}>{helpReadAllLabel(locale)}</Text>
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}

function Item({
  item,
  expanded,
  onToggle,
  onMeasure,
  onOpenPage,
}: {
  item: HelpItem;
  expanded: boolean;
  onToggle: () => void;
  /** 群の中でのこの段の上端。開いた段へ送るために画面側が持つ（HelpScreen の itemTops） */
  onMeasure: (y: number) => void;
  onOpenPage: (page: HelpPageId, itemId?: string) => void;
}) {
  const colors = useThemeColors();
  const Figure = item.figure == null ? null : FIGURES[item.figure];

  return (
    <View onLayout={(event) => onMeasure(event.nativeEvent.layout.y)}>
      <Accordion
        expanded={expanded}
        onToggle={onToggle}
        accessibilityLabel={item.title}
        label={
          /* アイコンは見出しの左（`helpItemIcons.ts`）。開閉のシェブロンは Accordion が右端に置くので、
             左＝何の話か / 右＝開いているか、と読む向きが分かれる。
             読み上げには載せない（accessibilityLabel は見出しの文だけ）── 絵は文の言い換えで、
             読み上げると同じことを 2 回言う */
          <View style={styles.itemHeader}>
            <Ionicons
              name={helpItemIcon(item.id)}
              size={19}
              color={colors.blue}
              style={styles.itemIcon}
            />
            <Text style={[styles.itemTitle, { color: colors.label }]}>{item.title}</Text>
          </View>
        }>
        <View style={styles.itemBody}>
          <Text style={[styles.body, { color: colors.secondaryLabel }]}>{item.body}</Text>
          {Figure != null && <Figure />}
          {item.link != null && (
            <Pressable
              onPress={() => onOpenPage(item.link!.to, item.link!.itemId)}
              hitSlop={8}
              accessibilityRole="link"
              style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
              <Text style={[styles.link, { color: colors.blue }]}>{item.link.label}</Text>
            </Pressable>
          )}
        </View>
      </Accordion>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 6,
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
  termsEntry: {
    paddingBottom: 4,
  },
  termsEntryLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  /** 群の塊。段どうしの間（8）より群の間を広く取って、小見出しを塊の頭に付ける */
  group: {
    gap: 8,
    paddingTop: 8,
  },
  groupTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginLeft: 4,
  },
  /** 見出し行。アイコンの幅を固定して、見出しの字の頭を段どうしで揃える */
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  itemIcon: {
    width: 22,
    textAlign: 'center',
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
