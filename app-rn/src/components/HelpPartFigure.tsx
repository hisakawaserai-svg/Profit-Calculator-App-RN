// 使いかたの図のうち、**実物の部品を使って描く**もの（案 `19c` の拡張）。
//
// ## なぜ実物の部品なのか
//
// 「どこを押すか」を説明する項目は、以前は文だけにしていた ── 図にすると
// 押す場所の絵になり、**画面写真と同じ理由で古くなる**と考えたため。
// これは**部品を使えば起きない**。画面に出ているのと同じコンポーネントを描けば、
// UI を直したときに図も一緒に変わる（タグの図で `TagChip` を使ったのと同じ手）。
//
// ## 描くのは部品だけで、画面全体は描かない
//
// その項目で押すものだけを出す。周りの枠やヘッダまで描くと、結局それは画面写真で、
// 隣の要素が動いただけで嘘になる。
//
// 部品には本物の props を渡すが、**操作は受け取らない**（`onChange` は空関数）──
// 図は読むものなので、押せてしまうと「ここで設定できる」と誤解される。
// 読み上げからも外す（意味は見出しと地の文が持つ）。
//
// 概念の説明（不用品と仕入品のちがい・収支の使い分けなど）は部品を描いても伝わらないので、
// これまでどおり抽象的な図にする（`HelpDiagram.tsx`）。
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { CostProportionBar } from '@/components/CostProportionBar';
import { PhotoThumbnail } from '@/components/PhotoThumbnail';
import { PresetRow } from '@/components/PresetRow';
import { RecordKindSelector } from '@/components/RecordKindSelector';
import { SegmentedControl } from '@/components/SegmentedControl';
import { TagChip } from '@/components/TagChip';
import { formatMonthKeyTitle } from '@/logic/format';
import {
  COMMISSION_LABEL,
  ENVELOPE_COST_LABEL,
  EXPORT_PREVIEW_CARD_TITLE,
  EXPORT_TARGET_OPTIONS,
  HELP_FIGURE_ADD_RECORD_NOTE,
  HELP_FIGURE_BREAKDOWN_NOTE,
  HELP_FIGURE_CALCULATOR_NOTE,
  HELP_FIGURE_EXPORT_PREVIEW_NOTE,
  HELP_FIGURE_EXPORT_TARGET_NOTE,
  HELP_FIGURE_FILTER_ENTRY_NOTE,
  HELP_FIGURE_FILTER_OFF_CAPTION,
  HELP_FIGURE_FILTER_ON_CAPTION,
  HELP_FIGURE_KIND_SELECTOR_NOTE,
  HELP_FIGURE_MODE_PROFIT_NOTE,
  HELP_FIGURE_MODE_TARGET_NOTE,
  HELP_FIGURE_MONTH_BAR_NOTE,
  HELP_FIGURE_PHOTO_NOTE,
  HELP_FIGURE_PRESET_LIST_NOTE,
  HELP_FIGURE_PRESET_TAG_NOTE,
  HELP_FIGURE_SEARCH_CAPTION,
  HELP_FIGURE_SEARCH_SORT_NOTE,
  HELP_FIGURE_SOLD_LISTING_NOTE,
  HELP_FIGURE_STATUS_TOGGLE_NOTE,
  HELP_FIGURE_TAG_ROW_NOTE,
  ITEM_NAME_CAPTION,
  ITEM_NAME_PLACEHOLDER,
  KEPT_SHORT_LABEL,
  LISTING_COUNT_LABEL,
  LISTING_STATUS_LABEL,
  POSTAGE_LABEL,
  RECORDS_TAB_LABEL,
  SOLD_RECORDS_LABEL,
  SORT_SHEET_TITLE,
  TAG_LABEL,
  TARGET_TAB_LABEL,
  exportPreviewMetaLabel,
  profitTabLabel,
  switchStatusLabel,
} from '@/logic/labels';
import { useThemeColors } from '@/theme';

/** 図の中の部品は触れない。押せると「ここで設定できる」と読まれる */
const noop = () => {};

/** 部品を 1 つ置く器。読み上げからは外す（意味は見出しと地の文が持つ） */
function PartFrame({ children, note }: { children: React.ReactNode; note?: string }) {
  const colors = useThemeColors();

  return (
    <View style={[styles.frame, { backgroundColor: colors.secondaryBackground }]}>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {children}
      </View>
      {note != null && (
        <Text style={[styles.note, { color: colors.secondaryLabel }]}>{note}</Text>
      )}
    </View>
  );
}

/** 結果カード先頭の 2 択（実物の SegmentedControl） */
export function ModeProfitFigure() {
  return (
    <PartFrame note={HELP_FIGURE_MODE_PROFIT_NOTE}>
      <SegmentedControl
        options={[profitTabLabel('used'), TARGET_TAB_LABEL]}
        selectedIndex={0}
        onChange={noop}
      />
    </PartFrame>
  );
}

export function ModeTargetFigure() {
  return (
    <PartFrame note={HELP_FIGURE_MODE_TARGET_NOTE}>
      <SegmentedControl
        options={[profitTabLabel('used'), TARGET_TAB_LABEL]}
        selectedIndex={1}
        onChange={noop}
      />
    </PartFrame>
  );
}

/** 金額の欄の右の電卓ボタン。行の形ごと出す（ボタンだけでは場所が分からない） */
export function CalculatorButtonFigure() {
  const colors = useThemeColors();

  return (
    <PartFrame note={HELP_FIGURE_CALCULATOR_NOTE}>
      <View style={styles.fieldRow}>
        <Text style={[styles.fieldLabel, { color: colors.label }]}>{POSTAGE_LABEL}</Text>
        <Text style={[styles.fieldValue, { color: colors.label }]}>215</Text>
        <Ionicons name="calculator" size={22} color={colors.blue} />
      </View>
    </PartFrame>
  );
}

/** 内訳の帯（実物の CostProportionBar）。図の題材と同じ 1,500 円の 1 件 */
export function BreakdownFigure() {
  return (
    <PartFrame note={HELP_FIGURE_BREAKDOWN_NOTE}>
      <CostProportionBar
        parts={[
          { key: 'commission', label: COMMISSION_LABEL, amount: 150 },
          { key: 'postage', label: POSTAGE_LABEL, amount: 215 },
          { key: 'envelopeCost', label: ENVELOPE_COST_LABEL, amount: 50 },
          { key: 'kept', label: KEPT_SHORT_LABEL, amount: 1085 },
        ]}
        kept={1085}
        deducted={415}
      />
    </PartFrame>
  );
}

/** 金額の欄の横のタグの印（プリセットの入口） */
export function PresetTagFigure() {
  const colors = useThemeColors();

  return (
    <PartFrame note={HELP_FIGURE_PRESET_TAG_NOTE}>
      <View style={styles.fieldRow}>
        <Text style={[styles.fieldLabel, { color: colors.label }]}>{POSTAGE_LABEL}</Text>
        <Ionicons name="pricetag-outline" size={18} color={colors.blue} />
        <Ionicons name="chevron-down" size={14} color={colors.blue} />
        <View style={styles.grow} />
        <Text style={[styles.fieldValue, { color: colors.label }]}>0</Text>
      </View>
    </PartFrame>
  );
}

/** 記録タブの左下のボタン（UI-SPEC §1.2-7） */
export function AddRecordFigure() {
  const colors = useThemeColors();

  return (
    <PartFrame note={HELP_FIGURE_ADD_RECORD_NOTE}>
      <View style={[styles.fab, { backgroundColor: colors.blue }]}>
        <Ionicons name="add" size={20} color="#FFFFFF" />
        <Text style={styles.fabLabel}>{RECORDS_TAB_LABEL}</Text>
      </View>
    </PartFrame>
  );
}

/** 種別の 2 択（実物の RecordKindSelector） */
export function KindSelectorFigure() {
  return (
    <PartFrame note={HELP_FIGURE_KIND_SELECTOR_NOTE}>
      <RecordKindSelector kind="sourced" onChange={noop} />
    </PartFrame>
  );
}

/** 伝票カードの見出し行。状態バッジと切り替えのリンク */
export function StatusToggleFigure() {
  const colors = useThemeColors();

  return (
    <PartFrame note={HELP_FIGURE_STATUS_TOGGLE_NOTE}>
      <View style={styles.statusRow}>
        <View style={styles.statusLeft}>
          <View style={[styles.statusDot, { backgroundColor: colors.orange }]} />
          <Text style={[styles.statusLabel, { color: colors.orange }]}>
            {LISTING_STATUS_LABEL}
          </Text>
        </View>
        <Text style={[styles.statusLink, { color: colors.blue }]}>{switchStatusLabel(true)}</Text>
      </View>
    </PartFrame>
  );
}

/** 商品名の左の写真の枠（実物の PhotoThumbnail の空枠と同じ見た目） */
export function PhotoFieldFigure() {
  const colors = useThemeColors();

  return (
    <PartFrame note={HELP_FIGURE_PHOTO_NOTE}>
      <View style={styles.photoRow}>
        <PhotoThumbnail fileName={null} />
        <View style={styles.grow}>
          <Text style={[styles.fieldLabel, { color: colors.mutedLabel }]}>
            {ITEM_NAME_PLACEHOLDER}
          </Text>
          <View style={[styles.underline, { backgroundColor: colors.blue }]} />
          <Text style={[styles.caption, { color: colors.secondaryLabel }]}>
            {ITEM_NAME_CAPTION}
          </Text>
        </View>
      </View>
    </PartFrame>
  );
}

/** 商品名の下のタグ行（実物の TagChip ＋「＋」） */
export function TagRowFigure() {
  const colors = useThemeColors();

  return (
    <PartFrame note={HELP_FIGURE_TAG_ROW_NOTE}>
      <View style={styles.tagRow}>
        <Text style={[styles.fieldLabel, { color: colors.label }]}>{TAG_LABEL}</Text>
        <TagChip tag={{ name: '洋服', colorKey: 'red' }} variant="selected" />
        <View style={[styles.plusBox, { borderColor: colors.separator }]}>
          <Ionicons name="add" size={16} color={colors.blue} />
        </View>
      </View>
    </PartFrame>
  );
}

/** 記録タブ・データタブの月の行（前後の月と、右端の絞り込みの入口） */
export function MonthBarFigure() {
  const colors = useThemeColors();

  return (
    <PartFrame note={HELP_FIGURE_MONTH_BAR_NOTE}>
      <View style={[styles.monthBar, { backgroundColor: colors.background }]}>
        <Ionicons name="chevron-back" size={20} color={colors.disabledContent} />
        <View style={styles.monthTitle}>
          <Text style={[styles.monthText, { color: colors.label }]}>
            {formatMonthKeyTitle('2026-08')}
          </Text>
          <Ionicons name="chevron-down" size={14} color={colors.secondaryLabel} />
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.disabledContent} />
      </View>
    </PartFrame>
  );
}

/** 月の行の右端の「▽」。絞り込みが効いている間は青ベタになる */
export function FilterEntryFigure() {
  const colors = useThemeColors();

  return (
    <PartFrame note={HELP_FIGURE_FILTER_ENTRY_NOTE}>
      <View style={styles.filterPair}>
        <View style={[styles.filterCell, { borderColor: colors.separator }]}>
          <Ionicons name="funnel-outline" size={20} color={colors.blue} />
          <Text style={[styles.caption, { color: colors.secondaryLabel }]}>
            {HELP_FIGURE_FILTER_OFF_CAPTION}
          </Text>
        </View>
        <View style={[styles.filterCell, { borderColor: colors.separator }]}>
          <View style={[styles.filterActive, { backgroundColor: colors.blue }]}>
            <Ionicons name="funnel" size={16} color="#FFFFFF" />
          </View>
          <Text style={[styles.caption, { color: colors.secondaryLabel }]}>
            {HELP_FIGURE_FILTER_ON_CAPTION}
          </Text>
        </View>
      </View>
    </PartFrame>
  );
}

/** 記録タブのヘッダの ⌕ と ⇅ */
export function SearchSortFigure() {
  const colors = useThemeColors();

  return (
    <PartFrame note={HELP_FIGURE_SEARCH_SORT_NOTE}>
      <View style={styles.iconPair}>
        <View style={styles.iconCell}>
          <Ionicons name="search" size={24} color={colors.blue} />
          <Text style={[styles.caption, { color: colors.secondaryLabel }]}>
            {HELP_FIGURE_SEARCH_CAPTION}
          </Text>
        </View>
        <View style={styles.iconCell}>
          <Ionicons name="swap-vertical" size={24} color={colors.blue} />
          <Text style={[styles.caption, { color: colors.secondaryLabel }]}>
            {SORT_SHEET_TITLE}
          </Text>
        </View>
      </View>
    </PartFrame>
  );
}

/** 集計段の右の 2 択（実物の SegmentedControl） */
export function SoldListingFigure() {
  return (
    <PartFrame note={HELP_FIGURE_SOLD_LISTING_NOTE}>
      <SegmentedControl
        options={[SOLD_RECORDS_LABEL, LISTING_COUNT_LABEL]}
        selectedIndex={0}
        onChange={noop}
      />
    </PartFrame>
  );
}

/** 登録したプリセットの行（実物の PresetRow） */
export function PresetListFigure() {
  const colors = useThemeColors();

  return (
    <PartFrame note={HELP_FIGURE_PRESET_LIST_NOTE}>
      <View style={[styles.card, { backgroundColor: colors.background }]}>
        <PresetRow
          preset={{ type: 'shipping', name: 'A4・厚さ3cm以内', initial: 'A4', colorKey: 'blue', value: 210 }}
        />
        <View style={[styles.separator, { backgroundColor: colors.separator }]} />
        <PresetRow
          preset={{ type: 'shipping', name: '宅配 60サイズ', initial: '60', colorKey: 'green', value: 750 }}
        />
      </View>
    </PartFrame>
  );
}

/** 書き出しの「対象」の 2 択 */
export function ExportTargetFigure() {
  return (
    <PartFrame note={HELP_FIGURE_EXPORT_TARGET_NOTE}>
      <SegmentedControl
        options={EXPORT_TARGET_OPTIONS.map((option) => option.label)}
        selectedIndex={0}
        onChange={noop}
      />
    </PartFrame>
  );
}

/** 書き出しシートの中のプレビューの入口 */
export function ExportPreviewFigure() {
  const colors = useThemeColors();

  return (
    <PartFrame note={HELP_FIGURE_EXPORT_PREVIEW_NOTE}>
      <View style={styles.previewHead}>
        <Text style={[styles.fieldLabel, { color: colors.label }]}>
          {EXPORT_PREVIEW_CARD_TITLE}
        </Text>
        <View style={styles.grow} />
        <Text style={[styles.caption, { color: colors.secondaryLabel }]}>
          {exportPreviewMetaLabel(3, 18)}
        </Text>
        <Ionicons name="chevron-forward" size={16} color={colors.secondaryLabel} />
      </View>
    </PartFrame>
  );
}

const styles = StyleSheet.create({
  frame: {
    borderRadius: 14,
    padding: 16,
    gap: 10,
  },
  note: {
    fontSize: 13,
    lineHeight: 19,
  },
  grow: {
    flex: 1,
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 44,
  },
  fieldLabel: {
    fontSize: 16,
  },
  fieldValue: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'right',
  },
  caption: {
    fontSize: 12,
  },
  fab: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 999,
  },
  fabLabel: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  statusLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusLabel: {
    fontSize: 16,
    fontWeight: '700',
  },
  statusLink: {
    fontSize: 15,
  },
  photoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  underline: {
    height: 2,
    marginTop: 6,
    marginBottom: 4,
  },
  tagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  plusBox: {
    width: 34,
    height: 34,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  monthTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  monthText: {
    fontSize: 17,
    fontWeight: '700',
  },
  filterPair: {
    flexDirection: 'row',
    gap: 10,
  },
  filterCell: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingVertical: 12,
  },
  filterActive: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconPair: {
    flexDirection: 'row',
    gap: 10,
  },
  iconCell: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
  },
  card: {
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
  },
  previewHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
});
