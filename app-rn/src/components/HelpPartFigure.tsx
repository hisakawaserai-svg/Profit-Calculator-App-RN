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

import { ChoiceCardPair } from '@/components/ChoiceCardPair';
import { CostProportionBar, partColor } from '@/components/CostProportionBar';
import { DataModeTabs } from '@/components/DataModeTabs';
import { PhotoThumbnail } from '@/components/PhotoThumbnail';
import { EDITABLE_BADGE_SIZE, PresetBadge } from '@/components/PresetBadge';
import { PresetRow } from '@/components/PresetRow';
import { PriceLine } from '@/components/PriceLine';
import { PriceSlider } from '@/components/PriceSlider';
import { RecordKindSelector } from '@/components/RecordKindSelector';
import { SegmentedControl } from '@/components/SegmentedControl';
import { Stepper } from '@/components/Stepper';
import { TagChip } from '@/components/TagChip';
import type { BreakdownPartKey } from '@/logic/calcForm';
import { DEFAULT_COMMISSION, MAX_COMMISSION, MIN_COMMISSION } from '@/logic/recordForm';
import { formatMonthKeyTitle, formatUnitYen, formatYenSymbol } from '@/logic/format';
import {
  PRICING_EXAMPLE,
  PRICING_EXAMPLE_SIMULATED_PRICE,
} from '@/logic/helpFigureExample';
import {
  addRecordFabLabel,
  backupPhotoExcludeDetail,
  backupPhotoExcludeLabel,
  backupPhotoIncludeLabel,
  colorUnusedSectionLabel,
  colorUsedSectionLabel,
  commissionLabel,
  customColorLabel,
  dataModeAchievementsLabel,
  dataModeProfitLabel,
  dataModeTagLabel,
  envelopeCostLabel,
  exportPreviewCardTitle,
  exportTargetOptions,
  helpFigureAddRecordNote,
  helpFigureBreakdownNote,
  helpFigureCalculatorNote,
  helpFigureCommissionFieldNote,
  helpFigureColorGroupsNote,
  helpFigureDataModesNote,
  helpFigureExportPreviewNote,
  helpFigureExportTargetNote,
  helpFigureFilterEntryNote,
  helpFigureFilterOffCaption,
  helpFigureSample,
  helpFigureFilterOnCaption,
  helpFigureKindSelectorNote,
  helpFigureModeProfitNote,
  helpFigureModeTargetNote,
  helpFigureMonthBarNote,
  helpFigurePhotoIncludeNote,
  helpFigurePhotoNote,
  helpFigurePresetBadgeNote,
  helpFigurePresetListNote,
  helpFigurePresetTagNote,
  helpFigurePriceLineNote,
  helpFigureRecordBarNote,
  helpFigureSearchCaption,
  helpFigureSearchSortNote,
  helpFigureShippingMaterialNote,
  helpFigureSimulatorNote,
  helpFigureSoldListingNote,
  helpFigureStatusToggleNote,
  helpFigureTagRowNote,
  helpFigureTagViewNote,
  helpFigureTargetFieldNote,
  itemNameCaption,
  itemNamePlaceholder,
  keptShortLabel,
  listingCountLabel,
  listingStatusLabel,
  postageLabel,
  presetInitialHint,
  shippingOnlyLabel,
  simulatorNote,
  soldRecordsLabel,
  sortSheetTitle,
  tagLabel,
  tagSectionListModeLabel,
  tagSectionOverlayModeLabel,
  targetProfitUnsetLabel,
  targetTabLabel,
  backupPhotoIncludeDetail,
  colorUserLabel,
  commissionFieldLabel,
  exportPreviewMetaLabel,
  pricingHeroAmount,
  profitTabLabel,
  simulatorProfitNote,
  switchStatusLabel,
  targetProfitLabel,
  withShippingMaterialLabel,
} from '@/logic/labels';
import { PRESET_COLOR_HEXES, PRESET_COLOR_KEYS } from '@/logic/preset';
import { analyzePricing } from '@/logic/pricing';
import { useLocale } from '@/settings';
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
  // 表示語は locale を引数に取る（src/i18n/index.ts の冒頭）
  const locale = useLocale();

  return (
    <PartFrame note={helpFigureModeProfitNote(locale)}>
      <SegmentedControl
        options={[profitTabLabel(locale, 'used'), targetTabLabel(locale)]}
        selectedIndex={0}
        onChange={noop}
      />
    </PartFrame>
  );
}

export function ModeTargetFigure() {
  // 表示語は locale を引数に取る（src/i18n/index.ts の冒頭）
  const locale = useLocale();

  return (
    <PartFrame note={helpFigureModeTargetNote(locale)}>
      <SegmentedControl
        options={[profitTabLabel(locale, 'used'), targetTabLabel(locale)]}
        selectedIndex={1}
        onChange={noop}
      />
    </PartFrame>
  );
}

/** 金額の欄の右の電卓ボタン。行の形ごと出す（ボタンだけでは場所が分からない） */
export function CalculatorButtonFigure() {
  // 表示語は locale を引数に取る（src/i18n/index.ts の冒頭）
  const locale = useLocale();

  const colors = useThemeColors();

  return (
    <PartFrame note={helpFigureCalculatorNote(locale)}>
      <View style={styles.fieldRow}>
        <Text style={[styles.fieldLabel, { color: colors.label }]}>{postageLabel(locale)}</Text>
        <Text style={[styles.fieldValue, { color: colors.label }]}>215</Text>
        <Ionicons name="calculator" size={22} color={colors.blue} />
      </View>
    </PartFrame>
  );
}

/**
 * 手数料の行（実物の Stepper）。
 *
 * **金額の欄（CalculatorButtonFigure）と同じ形で並べる**のが要点 ── この項目で詰まるのは
 * 「ほかの欄には青い電卓があるのに、ここには無い」ことなので、行そのものを見せれば
 * 説明する前に読める。± は実物と同じ 1% 刻みで、押しても動かない（noop）。
 */
export function CommissionFieldFigure() {
  // 表示語は locale を引数に取る（src/i18n/index.ts の冒頭）
  const locale = useLocale();

  return (
    <PartFrame note={helpFigureCommissionFieldNote(locale)}>
      <Stepper
        label={commissionFieldLabel(locale, DEFAULT_COMMISSION)}
        value={DEFAULT_COMMISSION}
        minimumValue={MIN_COMMISSION}
        maximumValue={MAX_COMMISSION}
        onChangeValue={noop}
      />
    </PartFrame>
  );
}

/** 内訳の帯（実物の CostProportionBar）。図の題材と同じ 1,500 円の 1 件 */
export function BreakdownFigure() {
  // 表示語は locale を引数に取る（src/i18n/index.ts の冒頭）
  const locale = useLocale();

  return (
    <PartFrame note={helpFigureBreakdownNote(locale)}>
      <CostProportionBar
        parts={[
          { key: 'commission', label: commissionLabel(locale), amount: 150 },
          { key: 'postage', label: postageLabel(locale), amount: 215 },
          { key: 'envelopeCost', label: envelopeCostLabel(locale), amount: 50 },
          { key: 'kept', label: keptShortLabel(locale), amount: 1085 },
        ]}
        kept={1085}
        deducted={415}
      />
    </PartFrame>
  );
}

/** 金額の欄の横のタグの印（プリセットの入口） */
export function PresetTagFigure() {
  // 表示語は locale を引数に取る（src/i18n/index.ts の冒頭）
  const locale = useLocale();

  const colors = useThemeColors();

  return (
    <PartFrame note={helpFigurePresetTagNote(locale)}>
      <View style={styles.fieldRow}>
        <Text style={[styles.fieldLabel, { color: colors.label }]}>{postageLabel(locale)}</Text>
        <Ionicons name="pricetag-outline" size={18} color={colors.blue} />
        <Ionicons name="chevron-down" size={14} color={colors.blue} />
        <View style={styles.grow} />
        <Text style={[styles.fieldValue, { color: colors.label }]}>0</Text>
      </View>
    </PartFrame>
  );
}

/**
 * 送料プリセットの行に埋め込まれた 2 択（採用案 45b / SPEC-V6 §3）。
 *
 * **選択シートの 1 行をそのまま描く。** `PresetRow` の `belowName` に本物の
 * `SegmentedControl` を差す作りまで含めて実物と同じなので、行の形が変われば図も変わる。
 * 右端の額を「＋資材」側（310）にしてあるのは、選ばれていない行が既定の側で描かれる
 * 実物の挙動（PresetPickerSheet）に合わせるため ── 図だけ送料のみの額を出すと、
 * 「押す前に見えていた数字と、あとで欄に入る数字を食い違わせない」という 45b の要点が消える。
 */
export function ShippingMaterialFigure() {
  // 表示語は locale を引数に取る（src/i18n/index.ts の冒頭）
  const locale = useLocale();

  const materialCost = 100;

  return (
    <PartFrame note={helpFigureShippingMaterialNote(locale)}>
      <PresetRow
        preset={{
          type: 'shipping',
          name: helpFigureSample(locale).parcel,
          initial: '60',
          colorKey: 'green',
          // 「＋資材」を選んだ側の額（210 ＋ 100）。副題は 2 択が言うので materialCost は伏せる
          value: 310,
          materialCost: 0,
        }}
        belowName={
          <SegmentedControl
            options={[shippingOnlyLabel(locale), withShippingMaterialLabel(locale, formatUnitYen(locale, materialCost))]}
            selectedIndex={1}
            onChange={noop}
          />
        }
      />
    </PartFrame>
  );
}

/**
 * 記録フォームの目標欄（SPEC-V9 §2）。
 *
 * **空欄の見え方そのものが図の中身**なので、金額の入った状態は描かない ──
 * この項目でつまずくのは「入れていないのに 0 円と書かれていないか」であって、
 * 入れたあとの見え方ではない。`targetProfitUnsetLabel(locale)` を共有しているので、
 * 「決めていません」の語を変えれば図も変わる。
 */
export function TargetFieldFigure() {
  // 表示語は locale を引数に取る（src/i18n/index.ts の冒頭）
  const locale = useLocale();

  const colors = useThemeColors();

  return (
    <PartFrame note={helpFigureTargetFieldNote(locale)}>
      <View style={styles.fieldRow}>
        <Text style={[styles.fieldLabel, { color: colors.label }]}>
          {targetProfitLabel(locale, 'used')}
        </Text>
        <Text style={[styles.fieldValue, { color: colors.mutedLabel }]}>
          {targetProfitUnsetLabel(locale)}
        </Text>
      </View>
    </PartFrame>
  );
}

/**
 * 記録詳細の帯 ＋ その下の行（§4）。
 *
 * **帯は実物の `CostProportionBar`、色の対応は `partColor` から引く。** 図の中で色を
 * 決め打ちにすると、テーマの経費色を振り直したときにここだけ古い色で残る。
 * 行を 3 つに絞ったのは、この図が言うのが「丸と区画が同じ色」ということだけだから ──
 * 全項目を並べるとレシートの再現になり、金額の読み方の図に変わってしまう。
 */
export function RecordBarFigure() {
  // 表示語は locale を引数に取る（src/i18n/index.ts の冒頭）
  const locale = useLocale();

  const colors = useThemeColors();
  const rows: { key: BreakdownPartKey; label: string; amount: number }[] = [
    { key: 'kept', label: keptShortLabel(locale), amount: 1085 },
    { key: 'commission', label: commissionLabel(locale), amount: 150 },
    { key: 'postage', label: postageLabel(locale), amount: 215 },
  ];

  return (
    <PartFrame note={helpFigureRecordBarNote(locale)}>
      <CostProportionBar
        parts={[
          { key: 'commission', label: commissionLabel(locale), amount: 150 },
          { key: 'postage', label: postageLabel(locale), amount: 215 },
          { key: 'envelopeCost', label: envelopeCostLabel(locale), amount: 50 },
          { key: 'kept', label: keptShortLabel(locale), amount: 1085 },
        ]}
        kept={1085}
        deducted={415}
      />
      <View style={styles.receipt}>
        {rows.map((row) => (
          <View key={row.key} style={styles.receiptRow}>
            <View style={[styles.receiptDot, { backgroundColor: partColor(row.key, colors) }]} />
            <Text style={[styles.fieldLabel, { color: colors.label }]}>{row.label}</Text>
            <Text style={[styles.fieldValue, { color: colors.label }]}>
              {formatUnitYen(locale, row.amount)}
            </Text>
          </View>
        ))}
      </View>
    </PartFrame>
  );
}

/**
 * 色の 2 群（設計案 50c / SPEC-V7 §3）。
 *
 * **実物の `ColorSwatchGrid` は使わない。** あの部品は自由色の丸を押すと
 * `ColorPickerSheet` を開く（`onChange` を空にしても止まらない）ので、図の中に置くと
 * 「読むだけ」のはずの面からシートが出てしまう。代わりに**色と見出しの語は実物と同じ定数**
 * （`PRESET_COLOR_HEXES` / `colorUnusedSectionLabel(locale)` など）から引き、
 * 並びだけをここで描く ── パレットを差し替えれば図の色も変わる。
 *
 * 4 列なのも実物と同じ（設計案 49c で `flexWrap` をやめた理由と同じで、
 * 端末幅で段組みが変わると図と実物が食い違う）。
 */
export function ColorGroupsFigure() {
  // 表示語は locale を引数に取る（src/i18n/index.ts の冒頭）
  const locale = useLocale();

  const colors = useThemeColors();
  // 上の群は「まだ使っていない色」4 つ ＋ 自由色の口。下の群は使用中の 2 つ
  const unused = PRESET_COLOR_KEYS.slice(0, 4);
  const used = [
    { key: PRESET_COLOR_KEYS[4], names: [helpFigureSample(locale).tagClothes] },
    { key: PRESET_COLOR_KEYS[5], names: [helpFigureSample(locale).tagTableware] },
  ];

  return (
    <PartFrame note={helpFigureColorGroupsNote(locale)}>
      <Text style={[styles.caption, { color: colors.secondaryLabel }]}>
        {colorUnusedSectionLabel(locale)}
      </Text>
      <View style={styles.swatchRow}>
        {unused.map((key) => (
          <View
            key={key}
            style={[styles.swatch, { backgroundColor: PRESET_COLOR_HEXES[key] }]}
          />
        ))}
        {/* 12 個目の口（自由色）。実物と同じく虹色は描かず、枠だけの丸に語を添える */}
        <View style={styles.customSwatch}>
          <View style={[styles.swatchRing, { borderColor: colors.separator }]} />
          <Text style={[styles.swatchCaption, { color: colors.secondaryLabel }]}>
            {customColorLabel(locale)}
          </Text>
        </View>
      </View>

      <Text style={[styles.caption, { color: colors.secondaryLabel }]}>
        {colorUsedSectionLabel(locale)}
      </Text>
      <View style={styles.usedRow}>
        {used.map((entry) => (
          <View key={entry.key} style={styles.usedCell}>
            <View
              style={[styles.usedSwatch, { backgroundColor: PRESET_COLOR_HEXES[entry.key] }]}
            />
            <Text style={[styles.swatchCaption, { color: colors.secondaryLabel }]}>
              {colorUserLabel(locale, entry.names)}
            </Text>
          </View>
        ))}
      </View>
    </PartFrame>
  );
}

/**
 * 「いくらで売る？」の価格ライン（SPEC-V9 §9.6）。
 *
 * **実物の `PriceLine` をそのまま置く。** 目盛りの数（2 点か 3 点か）も、
 * 説明の列が近すぎるときに押し合って離れる挙動も、この部品の中にしかない ──
 * 描き直すと、実物では重なりを避けて動く列が図では動かない、という食い違いが出る。
 *
 * 題材は `HelpDiagram` の `PRICING_EXAMPLE`（シミュレーターの図と同じ 1 件）。
 */
export function PriceLineFigure() {
  // 表示語は locale を引数に取る（src/i18n/index.ts の冒頭）
  const locale = useLocale();

  const analysis = analyzePricing(PRICING_EXAMPLE);

  return (
    <PartFrame note={helpFigurePriceLineNote(locale)}>
      <PriceLine analysis={analysis} />
    </PartFrame>
  );
}

/**
 * シミュレーター（SPEC-V9 §9.9）。上の 3 つの数字 ＋ つまみ ＋ 下の範囲。
 *
 * **つまみだけは `pointerEvents="none"` で包む。** 他の図の部品は `onChange` を
 * 空にすれば「押しても何も起きない」で済むが、スライダーは controlled なので
 * **掴めるのに動かない**という状態になる（指に付いてこないつまみは故障に見える）。
 * `disabled` を渡す手もあるが、それは実物では「価格が未設定のとき」の見た目
 * （`SIMULATOR_DISABLED_NOTE` が出る状態）なので、別の場面の図になってしまう。
 *
 * 数字は 3 つとも実物の関数から出す ── 見込み利益と利益率を手で書くと、
 * 手数料の扱いを直したときに図だけが古い額を主張する。
 */
export function SimulatorFigure() {
  // 表示語は locale を引数に取る（src/i18n/index.ts の冒頭）
  const locale = useLocale();

  const colors = useThemeColors();
  const analysis = analyzePricing(PRICING_EXAMPLE);
  // 「値下げを試している」最中を描くので、今の価格ではなく下げた側で計算し直す。
  // 範囲（つまみの左右端）は記録の価格から決まるので、こちらは元の analysis のまま
  const simulated = analyzePricing({
    ...PRICING_EXAMPLE,
    salesPrice: PRICING_EXAMPLE_SIMULATED_PRICE,
  });

  return (
    <PartFrame note={helpFigureSimulatorNote(locale)}>
      <Text style={[styles.caption, { color: colors.secondaryLabel }]}>{simulatorNote(locale)}</Text>

      <View style={styles.simulatorRow}>
        <Text style={[styles.simulatorPrice, { color: colors.label }]}>
          {formatYenSymbol(PRICING_EXAMPLE_SIMULATED_PRICE)}
        </Text>
        <View style={styles.simulatorProfit}>
          <Text style={[styles.simulatorAmount, { color: colors.green }]}>
            {pricingHeroAmount(simulated.current?.netProfit ?? 0)}
          </Text>
          <Text style={[styles.caption, { color: colors.secondaryLabel }]}>
            {simulatorProfitNote(locale, simulated.current?.profitRate ?? null)}
          </Text>
        </View>
      </View>

      {/* 図の中で指に反応させない（上のコメント）。読み上げも PartFrame 側で外れている */}
      <View pointerEvents="none">
        <PriceSlider
          min={analysis.range.min}
          max={analysis.range.max}
          value={PRICING_EXAMPLE_SIMULATED_PRICE}
          onChange={noop}
          snapPoints={[analysis.breakEven, ...(analysis.targetPrice == null ? [] : [analysis.targetPrice])]}
        />
      </View>

      <View style={styles.simulatorRange}>
        <Text style={[styles.caption, { color: colors.secondaryLabel }]}>
          {formatYenSymbol(analysis.range.min)}
        </Text>
        <Text style={[styles.caption, { color: colors.secondaryLabel }]}>
          {formatYenSymbol(analysis.range.max)}
        </Text>
      </View>
    </PartFrame>
  );
}

/** データタブのグラフカード上端の 3 択（実物の DataModeTabs） */
export function DataModesFigure() {
  // 表示語は locale を引数に取る（src/i18n/index.ts の冒頭）
  const locale = useLocale();

  return (
    <PartFrame note={helpFigureDataModesNote(locale)}>
      {/* この部品は呼び出し側のカードの余白（16pt）を打ち消す負の余白を持っている。
          PartFrame の余白も同じ 16pt なので、実物と同じく区切り線が縁まで届く */}
      <DataModeTabs
        options={[dataModeProfitLabel(locale), dataModeTagLabel(locale), dataModeAchievementsLabel(locale)]}
        selectedIndex={0}
        onChange={noop}
      />
    </PartFrame>
  );
}

/** タグ別のカードの右上の 2 択（実物の SegmentedControl。「一覧」/「グラフ」） */
export function TagViewModeFigure() {
  // 表示語は locale を引数に取る（src/i18n/index.ts の冒頭）
  const locale = useLocale();

  return (
    <PartFrame note={helpFigureTagViewNote(locale)}>
      <SegmentedControl
        options={[tagSectionListModeLabel(locale), tagSectionOverlayModeLabel(locale)]}
        selectedIndex={0}
        onChange={noop}
      />
    </PartFrame>
  );
}

/**
 * バックアップの「写真を含めるか」（SPEC-V8 §4 / 案 53a）。
 *
 * **実物の `ChoiceCardPair` を使う。** トグルではなく 2 枚のカードにしてあるのは
 * 「選択肢の中に枚数とサイズを書ける」ためなので、その形ごと出さないと
 * 何を見て決めるのかが伝わらない。枚数とサイズは図の題材（実測ではない）。
 */
export function PhotoIncludeFigure() {
  // 表示語は locale を引数に取る（src/i18n/index.ts の冒頭）
  const locale = useLocale();

  return (
    <PartFrame note={helpFigurePhotoIncludeNote(locale)}>
      <ChoiceCardPair
        options={[
          {
            label: backupPhotoIncludeLabel(locale),
            detail: backupPhotoIncludeDetail(locale, 53, 8.2 * 1024 * 1024),
          },
          { label: backupPhotoExcludeLabel(locale), detail: backupPhotoExcludeDetail(locale) },
        ]}
        selectedIndex={0}
        onChange={noop}
      />
    </PartFrame>
  );
}

/**
 * プリセット編集のプレビュー帯のバッジ（設計案 49c）。
 *
 * **バッジそのものが入力欄**だという一点だけを出す図なので、下の 1 行
 * （`presetInitialHint(locale)` =「2文字まで・押して直せます」）まで含めて実物と同じにする ──
 * 「押せる」ことを言っているのはこの 1 行で、バッジの絵だけでは伝わらない。
 *
 * 入力中の `PresetBadgeInput` ではなく表示用の `PresetBadge` を使うのは、
 * 図にカーソルを立てないため（打っている最中は下の 1 行の文言も変わる）。
 */
export function PresetBadgeFigure() {
  // 表示語は locale を引数に取る（src/i18n/index.ts の冒頭）
  const locale = useLocale();

  const colors = useThemeColors();

  return (
    <PartFrame note={helpFigurePresetBadgeNote(locale)}>
      <View style={styles.badgeRow}>
        <PresetBadge
          preset={{ name: helpFigureSample(locale).flatRate, initial: 'A4', colorKey: 'blue' }}
          // 実物のプレビュー帯と同じ大きさ（設計案 49c）。図だけ小さくすると
          // 「指で狙える札」だという 49c の要点が絵から落ちる
          size={EDITABLE_BADGE_SIZE}
        />
        <Text style={[styles.caption, { color: colors.secondaryLabel }]}>
          {presetInitialHint(locale)}
        </Text>
      </View>
    </PartFrame>
  );
}

/** 記録タブの左下のボタン（UI-SPEC §1.2-7） */
export function AddRecordFigure() {
  // 表示語は locale を引数に取る（src/i18n/index.ts の冒頭）
  const locale = useLocale();

  const colors = useThemeColors();

  return (
    <PartFrame note={helpFigureAddRecordNote(locale)}>
      <View style={[styles.fab, { backgroundColor: colors.blue }]}>
        <Ionicons name="add" size={20} color="#FFFFFF" />
        {/* **タブの名前ではなくボタンの語**（addRecordFabLabel）。recordsTabLabel を引いていた頃は、
            図だけが「＋ 記録」「＋ Records」で、実物の「＋ 記録する」「＋ Record」とずれていた */}
        <Text style={styles.fabLabel}>{addRecordFabLabel(locale)}</Text>
      </View>
    </PartFrame>
  );
}

/** 種別の 2 択（実物の RecordKindSelector） */
export function KindSelectorFigure() {
  // 表示語は locale を引数に取る（src/i18n/index.ts の冒頭）
  const locale = useLocale();

  return (
    <PartFrame note={helpFigureKindSelectorNote(locale)}>
      <RecordKindSelector kind="sourced" onChange={noop} />
    </PartFrame>
  );
}

/** 伝票カードの見出し行。状態バッジと切り替えのリンク */
export function StatusToggleFigure() {
  // 表示語は locale を引数に取る（src/i18n/index.ts の冒頭）
  const locale = useLocale();

  const colors = useThemeColors();

  return (
    <PartFrame note={helpFigureStatusToggleNote(locale)}>
      <View style={styles.statusRow}>
        <View style={styles.statusLeft}>
          <View style={[styles.statusDot, { backgroundColor: colors.orange }]} />
          <Text style={[styles.statusLabel, { color: colors.orange }]}>
            {listingStatusLabel(locale)}
          </Text>
        </View>
        <Text style={[styles.statusLink, { color: colors.blue }]}>{switchStatusLabel(locale, true)}</Text>
      </View>
    </PartFrame>
  );
}

/** 商品名の左の写真の枠（実物の PhotoThumbnail の空枠と同じ見た目） */
export function PhotoFieldFigure() {
  // 表示語は locale を引数に取る（src/i18n/index.ts の冒頭）
  const locale = useLocale();

  const colors = useThemeColors();

  return (
    <PartFrame note={helpFigurePhotoNote(locale)}>
      <View style={styles.photoRow}>
        <PhotoThumbnail fileName={null} />
        <View style={styles.grow}>
          <Text style={[styles.fieldLabel, { color: colors.mutedLabel }]}>
            {itemNamePlaceholder(locale)}
          </Text>
          <View style={[styles.underline, { backgroundColor: colors.blue }]} />
          <Text style={[styles.caption, { color: colors.secondaryLabel }]}>
            {itemNameCaption(locale)}
          </Text>
        </View>
      </View>
    </PartFrame>
  );
}

/** 商品名の下のタグ行（実物の TagChip ＋「＋」） */
export function TagRowFigure() {
  // 表示語は locale を引数に取る（src/i18n/index.ts の冒頭）
  const locale = useLocale();

  const colors = useThemeColors();

  return (
    <PartFrame note={helpFigureTagRowNote(locale)}>
      <View style={styles.tagRow}>
        <Text style={[styles.fieldLabel, { color: colors.label }]}>{tagLabel(locale)}</Text>
        <TagChip tag={{ name: helpFigureSample(locale).tagClothes, colorKey: 'red' }} variant="selected" />
        <View style={[styles.plusBox, { borderColor: colors.separator }]}>
          <Ionicons name="add" size={16} color={colors.blue} />
        </View>
      </View>
    </PartFrame>
  );
}

/** 記録タブ・データタブの月の行（前後の月と、右端の絞り込みの入口） */
export function MonthBarFigure() {
  // 表示語は locale を引数に取る（src/i18n/index.ts の冒頭）
  const locale = useLocale();

  const colors = useThemeColors();

  return (
    <PartFrame note={helpFigureMonthBarNote(locale)}>
      <View style={[styles.monthBar, { backgroundColor: colors.background }]}>
        <Ionicons name="chevron-back" size={20} color={colors.disabledContent} />
        <View style={styles.monthTitle}>
          <Text style={[styles.monthText, { color: colors.label }]}>
            {formatMonthKeyTitle(locale, '2026-08')}
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
  // 表示語は locale を引数に取る（src/i18n/index.ts の冒頭）
  const locale = useLocale();

  const colors = useThemeColors();

  return (
    <PartFrame note={helpFigureFilterEntryNote(locale)}>
      <View style={styles.filterPair}>
        <View style={[styles.filterCell, { borderColor: colors.separator }]}>
          <Ionicons name="funnel-outline" size={20} color={colors.blue} />
          <Text style={[styles.caption, { color: colors.secondaryLabel }]}>
            {helpFigureFilterOffCaption(locale)}
          </Text>
        </View>
        <View style={[styles.filterCell, { borderColor: colors.separator }]}>
          <View style={[styles.filterActive, { backgroundColor: colors.blue }]}>
            <Ionicons name="funnel" size={16} color="#FFFFFF" />
          </View>
          <Text style={[styles.caption, { color: colors.secondaryLabel }]}>
            {helpFigureFilterOnCaption(locale)}
          </Text>
        </View>
      </View>
    </PartFrame>
  );
}

/** 記録タブのヘッダの ⌕ と ⇅ */
export function SearchSortFigure() {
  // 表示語は locale を引数に取る（src/i18n/index.ts の冒頭）
  const locale = useLocale();

  const colors = useThemeColors();

  return (
    <PartFrame note={helpFigureSearchSortNote(locale)}>
      <View style={styles.iconPair}>
        <View style={styles.iconCell}>
          <Ionicons name="search" size={24} color={colors.blue} />
          <Text style={[styles.caption, { color: colors.secondaryLabel }]}>
            {helpFigureSearchCaption(locale)}
          </Text>
        </View>
        <View style={styles.iconCell}>
          <Ionicons name="swap-vertical" size={24} color={colors.blue} />
          <Text style={[styles.caption, { color: colors.secondaryLabel }]}>
            {sortSheetTitle(locale)}
          </Text>
        </View>
      </View>
    </PartFrame>
  );
}

/** 集計段の右の 2 択（実物の SegmentedControl） */
export function SoldListingFigure() {
  // 表示語は locale を引数に取る（src/i18n/index.ts の冒頭）
  const locale = useLocale();

  return (
    <PartFrame note={helpFigureSoldListingNote(locale)}>
      <SegmentedControl
        options={[soldRecordsLabel(locale), listingCountLabel(locale)]}
        selectedIndex={0}
        onChange={noop}
      />
    </PartFrame>
  );
}

/**
 * 登録したプリセットの行（実物の PresetRow）。
 *
 * **2 行目に資材費を持たせてある**（SPEC-V6 §1）── 一覧に並ぶ行は資材費の有無で
 * 形が変わる（右端が合計になり、名前の下に「送料 ◯円 ＋ 専用資材 ◯円」が出る）ので、
 * どちらも出さないと「登録するとこう並ぶ」の図として片側しか見せられない。
 */
export function PresetListFigure() {
  // 表示語は locale を引数に取る（src/i18n/index.ts の冒頭）
  const locale = useLocale();

  const colors = useThemeColors();

  return (
    <PartFrame note={helpFigurePresetListNote(locale)}>
      <View style={[styles.card, { backgroundColor: colors.background }]}>
        <PresetRow
          preset={{
            type: 'shipping',
            name: helpFigureSample(locale).flatRate,
            initial: 'A4',
            colorKey: 'blue',
            value: 210,
          }}
        />
        <View style={[styles.separator, { backgroundColor: colors.separator }]} />
        <PresetRow
          preset={{
            type: 'shipping',
            name: helpFigureSample(locale).parcel,
            initial: '60',
            colorKey: 'green',
            value: 750,
            materialCost: 100,
          }}
        />
      </View>
    </PartFrame>
  );
}

/** 書き出しの「対象」の 2 択 */
export function ExportTargetFigure() {
  // 表示語は locale を引数に取る（src/i18n/index.ts の冒頭）
  const locale = useLocale();

  return (
    <PartFrame note={helpFigureExportTargetNote(locale)}>
      <SegmentedControl
        options={exportTargetOptions(locale).map((option) => option.label)}
        selectedIndex={0}
        onChange={noop}
      />
    </PartFrame>
  );
}

/** 書き出しシートの中のプレビューの入口 */
export function ExportPreviewFigure() {
  // 表示語は locale を引数に取る（src/i18n/index.ts の冒頭）
  const locale = useLocale();

  const colors = useThemeColors();

  return (
    <PartFrame note={helpFigureExportPreviewNote(locale)}>
      <View style={styles.previewHead}>
        <Text style={[styles.fieldLabel, { color: colors.label }]}>
          {exportPreviewCardTitle(locale)}
        </Text>
        <View style={styles.grow} />
        <Text style={[styles.caption, { color: colors.secondaryLabel }]}>
          {exportPreviewMetaLabel(locale, 3, 18)}
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
  /** シミュレーター（SimulatorFigure）。実物と同じ「左に価格・右に見込み」の並び */
  simulatorRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
  },
  simulatorPrice: {
    fontSize: 24,
    fontWeight: '700',
  },
  simulatorProfit: {
    alignItems: 'flex-end',
  },
  simulatorAmount: {
    fontSize: 17,
    fontWeight: '700',
  },
  simulatorRange: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  /** バッジと説明の 1 行（PresetBadgeFigure） */
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  /** 帯の下に続くレシートの行（RecordBarFigure） */
  receipt: {
    gap: 6,
  },
  receiptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  receiptDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  /** 色の 2 群（ColorGroupsFigure）。列は実物と同じ 4 列 */
  swatchRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  swatch: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  customSwatch: {
    alignItems: 'center',
    gap: 4,
  },
  swatchRing: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
  },
  swatchCaption: {
    fontSize: 11,
  },
  usedRow: {
    flexDirection: 'row',
    gap: 16,
  },
  usedCell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  usedSwatch: {
    width: 22,
    height: 22,
    borderRadius: 11,
  },
});
