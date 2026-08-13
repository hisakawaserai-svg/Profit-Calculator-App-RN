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
    <PartFrame note="この 2 つで切り替えます">
      <SegmentedControl options={['純利益を出す', '目標から逆算']} selectedIndex={0} onChange={noop} />
    </PartFrame>
  );
}

export function ModeTargetFigure() {
  return (
    <PartFrame note="こちらに切り替えると、ほしい利益から販売価格を出します">
      <SegmentedControl options={['純利益を出す', '目標から逆算']} selectedIndex={1} onChange={noop} />
    </PartFrame>
  );
}

/** 金額の欄の右の電卓ボタン。行の形ごと出す（ボタンだけでは場所が分からない） */
export function CalculatorButtonFigure() {
  const colors = useThemeColors();

  return (
    <PartFrame note="青いボタンを押すと電卓が開きます">
      <View style={styles.fieldRow}>
        <Text style={[styles.fieldLabel, { color: colors.label }]}>送料</Text>
        <Text style={[styles.fieldValue, { color: colors.label }]}>215</Text>
        <Ionicons name="calculator" size={22} color={colors.blue} />
      </View>
    </PartFrame>
  );
}

/** 内訳の帯（実物の CostProportionBar）。図の題材と同じ 1,500 円の 1 件 */
export function BreakdownFigure() {
  return (
    <PartFrame note="「内訳」を押すと、この帯と項目ごとの金額が出ます">
      <CostProportionBar
        parts={[
          { key: 'commission', label: '販売手数料', amount: 150 },
          { key: 'postage', label: '送料', amount: 215 },
          { key: 'envelopeCost', label: '梱包材', amount: 50 },
          { key: 'kept', label: '手元', amount: 1085 },
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
    <PartFrame note="タグの印を押すと、登録した値から選べます">
      <View style={styles.fieldRow}>
        <Text style={[styles.fieldLabel, { color: colors.label }]}>送料</Text>
        <Ionicons name="pricetag-outline" size={18} color={colors.blue} />
        <Ionicons name="chevron-down" size={14} color={colors.blue} />
        <View style={styles.grow} />
        <Text style={[styles.fieldValue, { color: colors.label }]}>0</Text>
      </View>
    </PartFrame>
  );
}

/** 記録タブの右下のボタン */
export function AddRecordFigure() {
  const colors = useThemeColors();

  return (
    <PartFrame note="記録タブの右下にあります">
      <View style={[styles.fab, { backgroundColor: colors.blue }]}>
        <Ionicons name="add" size={20} color="#FFFFFF" />
        <Text style={styles.fabLabel}>記録</Text>
      </View>
    </PartFrame>
  );
}

/** 種別の 2 択（実物の RecordKindSelector） */
export function KindSelectorFigure() {
  return (
    <PartFrame note="記録の画面のここで選びます">
      <RecordKindSelector kind="sourced" onChange={noop} />
    </PartFrame>
  );
}

/** 伝票カードの見出し行。状態バッジと切り替えのリンク */
export function StatusToggleFigure() {
  const colors = useThemeColors();

  return (
    <PartFrame note="左が今の状態、右を押すともう一方に変わります">
      <View style={styles.statusRow}>
        <View style={styles.statusLeft}>
          <View style={[styles.statusDot, { backgroundColor: colors.orange }]} />
          <Text style={[styles.statusLabel, { color: colors.orange }]}>出品中</Text>
        </View>
        <Text style={[styles.statusLink, { color: colors.blue }]}>売れた記録にする</Text>
      </View>
    </PartFrame>
  );
}

/** 商品名の左の写真の枠（実物の PhotoThumbnail の空枠と同じ見た目） */
export function PhotoFieldFigure() {
  const colors = useThemeColors();

  return (
    <PartFrame note="空の枠を押すと写真を選べます。付いた写真は右上の「✕」で外せます">
      <View style={styles.photoRow}>
        <PhotoThumbnail fileName={null} />
        <View style={styles.grow}>
          <Text style={[styles.fieldLabel, { color: colors.mutedLabel }]}>例：えんぴつ</Text>
          <View style={[styles.underline, { backgroundColor: colors.blue }]} />
          <Text style={[styles.caption, { color: colors.secondaryLabel }]}>商品名（必須）</Text>
        </View>
      </View>
    </PartFrame>
  );
}

/** 商品名の下のタグ行（実物の TagChip ＋「＋」） */
export function TagRowFigure() {
  const colors = useThemeColors();

  return (
    <PartFrame note="「＋」を押すと選べます。まだ無いタグはその場で作れます">
      <View style={styles.tagRow}>
        <Text style={[styles.fieldLabel, { color: colors.label }]}>タグ</Text>
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
    <PartFrame note="「◀」「▶」で前後の月へ。月の名前を押すと期間を選べます">
      <View style={[styles.monthBar, { backgroundColor: colors.background }]}>
        <Ionicons name="chevron-back" size={20} color={colors.disabledContent} />
        <View style={styles.monthTitle}>
          <Text style={[styles.monthText, { color: colors.label }]}>2026年8月</Text>
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
    <PartFrame note="右端の「▽」から開きます。効いている間は青くなります">
      <View style={styles.filterPair}>
        <View style={[styles.filterCell, { borderColor: colors.separator }]}>
          <Ionicons name="funnel-outline" size={20} color={colors.blue} />
          <Text style={[styles.caption, { color: colors.secondaryLabel }]}>絞り込みなし</Text>
        </View>
        <View style={[styles.filterCell, { borderColor: colors.separator }]}>
          <View style={[styles.filterActive, { backgroundColor: colors.blue }]}>
            <Ionicons name="funnel" size={16} color="#FFFFFF" />
          </View>
          <Text style={[styles.caption, { color: colors.secondaryLabel }]}>絞り込み中</Text>
        </View>
      </View>
    </PartFrame>
  );
}

/** 記録タブのヘッダの ⌕ と ⇅ */
export function SearchSortFigure() {
  const colors = useThemeColors();

  return (
    <PartFrame note="左が商品名でさがす、右が並び替え">
      <View style={styles.iconPair}>
        <View style={styles.iconCell}>
          <Ionicons name="search" size={24} color={colors.blue} />
          <Text style={[styles.caption, { color: colors.secondaryLabel }]}>さがす</Text>
        </View>
        <View style={styles.iconCell}>
          <Ionicons name="swap-vertical" size={24} color={colors.blue} />
          <Text style={[styles.caption, { color: colors.secondaryLabel }]}>並び替え</Text>
        </View>
      </View>
    </PartFrame>
  );
}

/** 集計段の右の 2 択（実物の SegmentedControl） */
export function SoldListingFigure() {
  return (
    <PartFrame note="上の合計も、選んだほうの記録で計算されます">
      <SegmentedControl options={['売れた記録', '出品中']} selectedIndex={0} onChange={noop} />
    </PartFrame>
  );
}

/** 登録したプリセットの行（実物の PresetRow） */
export function PresetListFigure() {
  const colors = useThemeColors();

  return (
    <PartFrame note="設定タブの「入力を減らす」に、この形で並びます">
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
    <PartFrame note="既定は「売れた記録のみ」です">
      <SegmentedControl options={['売れた記録のみ', '出品中も含める']} selectedIndex={0} onChange={noop} />
    </PartFrame>
  );
}

/** 書き出しシートの中のプレビューの入口 */
export function ExportPreviewFigure() {
  const colors = useThemeColors();

  return (
    <PartFrame note="押すと全部の行を見られます">
      <View style={styles.previewHead}>
        <Text style={[styles.fieldLabel, { color: colors.label }]}>書き出す表</Text>
        <View style={styles.grow} />
        <Text style={[styles.caption, { color: colors.secondaryLabel }]}>先頭3行・全18列</Text>
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
