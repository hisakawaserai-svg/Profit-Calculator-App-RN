// 計算タブ（UI-SPEC §1.1 / 採用案 3a）。CalcView.swift の後継。
//
// 3a のねらいは 2 つ:
//   1. 結果を常に画面上部に置く（スクロールで流れたら固定バーに小さく出し続ける）
//   2. 逆算を「おまけ」から対等な 2 択へ格上げする（結果カード先頭のセグメント）
//
// - 計算は src/logic/profit.ts の純粋関数のみを使用し、画面内で式を再実装しない。
// - 入力値の組み立て・クリア判定・CostInput への変換は src/logic/calcForm.ts。
// - 表示語はすべて src/logic/labels.ts 経由（SPEC-V2 §5.3。画面で文字列を組み立てない）。
// - 決定 §7-14 により iPad/Mac の 2 ペインレイアウトは移植せず、iPhone 縦 1 カラムのみ。
import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { CollapsibleSection } from '@/components/CollapsibleSection';
import { HelpButton } from '@/components/HelpButton';
import { HelpSheet } from '@/components/HelpSheet';
import {
  CostProportionBar,
  partColor,
  partValueColor,
} from '@/components/CostProportionBar';
import { NumericField } from '@/components/NumericField';
import { PresetTagButton } from '@/components/PresetTagButton';
import { RecordKindSelector } from '@/components/RecordKindSelector';
import { SegmentedControl } from '@/components/SegmentedControl';
import { SiteNameRow } from '@/components/SiteNameRow';
import { Stepper } from '@/components/Stepper';
import type { Preset, RecordKind } from '@/db/schema';
import {
  costBreakdown,
  hasAnyInput,
  newCalcValues,
  profitBreakdown,
  requiredPriceResult,
  toCostInput,
  toInitialAmounts,
  toRequiredCostInput,
  type CalcFormValues,
  type CostBreakdown,
  type RequiredPriceResult,
} from '@/logic/calcForm';
import { formatYen, formatYenSymbol } from '@/logic/format';
import { sanitizeNumericInput } from '@/logic/input';
import {
  BREAKDOWN_AND_METHOD_LABEL,
  BREAKDOWN_LABEL,
  CALC_SCREEN_TITLE,
  CANCEL_LABEL,
  CLEAR_CONFIRM_MESSAGE,
  CLEAR_CONFIRM_TITLE,
  CLEAR_INPUT_ACTION_LABEL,
  CLEAR_LABEL,
  DEDUCTED_LABEL,
  ENVELOPE_COST_LABEL,
  EXPENSES_LABEL,
  OTHERS_COST_LABEL,
  POSTAGE_LABEL,
  PURCHASE_PRICE_LABEL,
  REQUIRED_PRICE_HEADLINE,
  REQUIRED_SALES_LABEL,
  REQUIRED_SALES_PRICE_LABEL,
  SALES_PRICE_LABEL,
  SAVE_AS_RECORD_LABEL,
  TARGET_TAB_LABEL,
  TOTAL_SALES_AMOUNT_LABEL,
  TOTAL_SALES_LABEL,
  commissionFieldLabel,
  lowerPriceWarning,
  optionalCostsLabel,
  profitLabel,
  profitTabLabel,
  requiredPriceFormulaLines,
  requiredPriceSummary,
  targetProfitLabel,
} from '@/logic/labels';
import { netProfit, roundForDisplay, totalExpenses, type CostInput } from '@/logic/profit';
import { MAX_COMMISSION, MIN_COMMISSION } from '@/logic/recordForm';
import { RecordFormSheet } from '@/screens/RecordFormSheet';
import { useSettings } from '@/settings';
import { useThemeColors, type ThemeColors } from '@/theme';

/** 結果カード先頭の 2 択（UI-SPEC §1.1-3）。左が結果、右が逆算 */
const MODE_PROFIT = 0;
const MODE_TARGET = 1;

/** 固定バーが出るスクロール量（UI-SPEC §1.1-2「スクロール量 40px 超」） */
const STICKY_THRESHOLD = 40;

/** 固定バーのスライドイン時間（ミリ秒） */
const STICKY_DURATION = 180;

/** 固定バーの高さの初期値。onLayout で実測するまでの間だけ使う */
const FALLBACK_STICKY_HEIGHT = 88;

export default function CalcScreen() {
  const colors = useThemeColors();
  const { defaultRecordKind } = useSettings();

  const [values, setValues] = useState<CalcFormValues>(() => newCalcValues(defaultRecordKind));
  // 設定タブで既定種別を変えたときは、このタブに戻ったとき新しい既定種別に合わせる。
  // レンダー中に直す形にしているのは React 公式の「props が変わったら state を調整する」手順
  // （効果で setState すると 1 度古い値で描画してから再レンダーになる）。
  const [syncedDefaultKind, setSyncedDefaultKind] = useState<RecordKind>(defaultRecordKind);
  if (syncedDefaultKind !== defaultRecordKind) {
    setSyncedDefaultKind(defaultRecordKind);
    setValues((current) => ({ ...current, kind: defaultRecordKind }));
  }

  const [mode, setMode] = useState(MODE_PROFIT);
  const [showForm, setShowForm] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const router = useRouter();
  // 内訳の開閉は結果カードと固定バーで独立させる（UI-SPEC §1.1「挙動」）。
  // 逆算側は中身が別もの（項目別の金額と計算のしかた）なので、結果側とも別に持つ
  const [cardBreakdownOpen, setCardBreakdownOpen] = useState(false);
  const [targetBreakdownOpen, setTargetBreakdownOpen] = useState(false);
  const [stickyBreakdownOpen, setStickyBreakdownOpen] = useState(false);
  const [optionalCostsOpen, setOptionalCostsOpen] = useState(false);
  /** 結果カードが画面外に流れたか（UI-SPEC §1.1-2） */
  const [stickyVisible, setStickyVisible] = useState(false);

  // しきい値をまたいだときだけ state を動かす。同じ値を返せば React が再レンダーを省く
  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const crossed = event.nativeEvent.contentOffset.y > STICKY_THRESHOLD;
    setStickyVisible((current) => (current === crossed ? current : crossed));
  }, []);

  const update = useCallback(
    <K extends keyof CalcFormValues>(key: K, value: CalcFormValues[K]) => {
      setValues((current) => ({ ...current, [key]: value }));
    },
    [],
  );

  // 金額をクリアし、種別も設定の既定値に戻す（SPEC-V2 §1.3）。
  // 押した直後の「元に戻す」表示は実装していない（UI-SPEC §5-8）ので、
  // 消える前に確認を 1 枚挟む（レコード詳細の削除と同じ作法。SPEC §5.4）
  const clearAll = useCallback(() => {
    Alert.alert(CLEAR_CONFIRM_TITLE, CLEAR_CONFIRM_MESSAGE, [
      { text: CANCEL_LABEL, style: 'cancel' },
      {
        text: CLEAR_LABEL,
        style: 'destructive',
        onPress: () => setValues(newCalcValues(defaultRecordKind)),
      },
    ]);
  }, [defaultRecordKind]);

  /**
   * 販売サイトのプリセットを選んだとき（SPEC-V3 §4.3 / §1.5.1）。
   * **率と名前を同時に入れる**のがこの機能の要で、率だけを update すると
   * 「どこで売ったか」が画面のどこにも残らない。上書きの確認は挟まない（§4.3）。
   */
  const selectSite = useCallback((preset: Preset) => {
    setValues((current) => ({ ...current, commission: preset.value, siteName: preset.name }));
  }, []);

  const isTargetMode = mode === MODE_TARGET;
  const { kind } = values;

  // 逆算モードの数字は「必要な販売価格で売れた場合」で通す（calcForm.toRequiredCostInput）。
  // これで固定バーの経費・内訳が逆算結果と食い違わない
  const costs = isTargetMode ? toRequiredCostInput(values) : toCostInput(values);
  const profit = netProfit(costs);

  // 固定バー・結果カードに出す 1 行（UI-SPEC §1.1-2「逆算モードでは見出しと色が変わる」）
  const resultLabel = isTargetMode ? REQUIRED_SALES_PRICE_LABEL : profitLabel(kind);
  const resultAmount = formatYen(isTargetMode ? costs.salesPrice : profit);
  const resultColor = isTargetMode ? colors.blue : profit >= 0 ? colors.green : colors.red;

  // 逆算モードの販売価格欄は入力ではなく計算結果を映す（UI-SPEC §1.1「挙動」）。
  // 欄が 0 のままだと、結果カードが「439 円で出せばよい」と言っているのに
  // 販売価格が 0 という食い違った画面になる。丸めは結果カードの見出しと同じ関数を通す
  const displayedSalesPrice = isTargetMode
    ? String(roundForDisplay(costs.salesPrice))
    : values.salesPrice;

  const canClear = hasAnyInput(values, defaultRecordKind);

  // ヘッダは「？」のみで歯車は置かない（UI-SPEC §6-7 / §1.1-1）
  const screenOptions = useMemo(
    () => ({
      headerTitle: CALC_SCREEN_TITLE,
      headerRight: () => <HelpButton onPress={() => setShowHelp(true)} />,
    }),
    [],
  );

  return (
    <>
      <Stack.Screen options={screenOptions} />

      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          onScroll={handleScroll}
          scrollEventThrottle={16}>
          {/* 3. 結果カード。先頭に 2 択セグメント（UI-SPEC §1.1-3） */}
          <View style={[styles.card, { backgroundColor: colors.secondaryBackground }]}>
            {/* 「クリア」はカード右上に常設。入力が空のときだけ無効（UI-SPEC §5-8）。
                セグメントの上に置いているのは、逆算モードの入力行と重ならない位置がここだけのため */}
            <View style={styles.clearRow}>
              <Pressable
                onPress={clearAll}
                disabled={!canClear}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityState={{ disabled: !canClear }}
                accessibilityLabel={CLEAR_INPUT_ACTION_LABEL}
                style={({ pressed }) => ({ opacity: !canClear ? 0.3 : pressed ? 0.5 : 1 })}>
                <Text style={[styles.clearLabel, { color: colors.blue }]}>{CLEAR_LABEL}</Text>
              </Pressable>
            </View>

            <SegmentedControl
              options={[profitTabLabel(kind), TARGET_TAB_LABEL]}
              selectedIndex={mode}
              onChange={setMode}
            />

            {isTargetMode ? (
              <TargetPanel
                values={values}
                colors={colors}
                onChangeTargetProfit={(value) => update('targetProfit', value)}
                expanded={targetBreakdownOpen}
                onToggleBreakdown={() => setTargetBreakdownOpen((open) => !open)}
              />
            ) : (
              <ProfitPanel
                values={values}
                kind={kind}
                colors={colors}
                profit={profit}
                expanded={cardBreakdownOpen}
                onToggleBreakdown={() => setCardBreakdownOpen((open) => !open)}
              />
            )}
          </View>

          {/* 4. 種別セレクタ。結果カードの下・入力カードの直上（UI-SPEC §5-1）。
              仕入価格欄の直上なので、切替で欄が消えるのがその場で見える（SPEC-V2 §1.5） */}
          <View style={styles.inputGroup}>
            <RecordKindSelector kind={kind} onChange={(next) => update('kind', next)} />

            {/* 5. 入力カード。行型の数値欄（UI-SPEC §1.1-5 / §3.2） */}
            <View style={[styles.card, styles.inputCard, { backgroundColor: colors.secondaryBackground }]}>
              <NumericField
                label={SALES_PRICE_LABEL}
                value={displayedSalesPrice}
                onChangeValue={(value) => update('salesPrice', value)}
                // 逆算モードでは販売価格が計算結果になるため無効化（UI-SPEC §1.1「挙動」）
                disabled={isTargetMode}
              />
              <Divider colors={colors} />
              {/* 不用品では仕入価格を出さない（値は 0 扱い。SPEC-V2 §1.3） */}
              {kind === 'sourced' && (
                <>
                  <NumericField
                    label={PURCHASE_PRICE_LABEL}
                    value={values.purchasePrice}
                    onChangeValue={(value) => update('purchasePrice', value)}
                  />
                  <Divider colors={colors} />
                </>
              )}
              <NumericField
                label={POSTAGE_LABEL}
                value={values.postage}
                onChangeValue={(value) => update('postage', value)}
                // 送料はプリセットから選べる（SPEC-V3 §4.2）
                presetType="shipping"
              />
              <Divider colors={colors} />
              {/* 手数料はタグボタンをラベル（率を含む）の直後に置く（SPEC-V3 §4.4 / 設計案 29b）。
                  ± は残す ── プリセットにない率（8.8% 等）を作りたくないときに 1 回だけ動かす用 */}
              <View style={styles.stepperRow}>
                <Stepper
                  label={commissionFieldLabel(values.commission)}
                  value={values.commission}
                  minimumValue={MIN_COMMISSION}
                  maximumValue={MAX_COMMISSION}
                  onChangeValue={(value) => update('commission', value)}
                  accessory={
                    <PresetTagButton
                      type="site"
                      value={values.commission}
                      // バッジは率ではなく選んだ名前で決まる（§1.5.1）。手で率を変えても札は残る
                      selectedName={values.siteName}
                      onSelect={selectSite}
                      // SiteNameRow の「✕」と同じ処理。消えるのは名前だけで率は残る
                      onClear={() => update('siteName', '')}
                    />
                  }
                />
              </View>
              {/* 選んだ販売サイトの名前（§1.5.1）。未設定なら行ごと出ない。
                  この画面では記録しないので、値は state に持つだけで「この内容で記録する」で引き継ぐ */}
              <SiteNameRow
                siteName={values.siteName}
                onClear={() => update('siteName', '')}
              />
              <Divider colors={colors} />

              {/* 6. 梱包材・その他は畳んでおく（UI-SPEC §1.1-6） */}
              <CollapsibleSection
                // 畳んだままでも中身が結果に効いていることが分かるよう、見出しに合計を添える。
                // costs はモードで salesPrice だけが変わるので、この 2 項目はどちらでも同じ値
                label={optionalCostsLabel(costs.envelopeCost + costs.othersCost)}
                tone="link"
                expanded={optionalCostsOpen}
                onToggle={() => setOptionalCostsOpen((open) => !open)}>
                <NumericField
                  label={ENVELOPE_COST_LABEL}
                  value={values.envelopeCost}
                  onChangeValue={(value) => update('envelopeCost', value)}
                  // 梱包材プリセットを積める先はこの欄だけ（§4.5。MiniCalculator 参照）
                  canPickPackaging
                />
                <NumericField
                  label={OTHERS_COST_LABEL}
                  value={values.othersCost}
                  onChangeValue={(value) => update('othersCost', value)}
                />
              </CollapsibleSection>
            </View>
          </View>
        </ScrollView>

        {/* 2. 固定バー。結果が画面外に流れている間だけ上端に出す（UI-SPEC §1.1-2） */}
        <StickyResultBar
          visible={stickyVisible}
          colors={colors}
          label={resultLabel}
          amount={resultAmount}
          amountColor={resultColor}
          salesLabel={isTargetMode ? REQUIRED_SALES_LABEL : TOTAL_SALES_LABEL}
          // 逆算モードでは「経費」と呼ばない。逆算パネルの説明文・式が経費を手数料抜きの額
          // （765 円）で使っているので、手数料込みの totalExpenses（861 円）を同じ語で呼ぶと、
          // スクロールでバーが出た瞬間に数字が食い違って見える。パネル側と同じ「引かれる分」に揃える
          expensesLabel={isTargetMode ? DEDUCTED_LABEL : EXPENSES_LABEL}
          costs={costs}
          kind={kind}
          expanded={stickyBreakdownOpen}
          onToggleBreakdown={() => setStickyBreakdownOpen((open) => !open)}
        />

        {/* 7. 下端固定ボタン（UI-SPEC §1.1-7）。地色＋上境界線で入力カードから浮かせる
            （設計案の「半透明地」を不透明にした理由は theme.ts の barBackground を参照） */}
        <View
          style={[
            styles.bottomBar,
            { backgroundColor: colors.barBackground, borderTopColor: colors.separator },
          ]}>
          <Pressable
            onPress={() => setShowForm(true)}
            accessibilityRole="button"
            accessibilityLabel={SAVE_AS_RECORD_LABEL}
            style={({ pressed }) => [
              styles.saveButton,
              { backgroundColor: colors.blue, opacity: pressed ? 0.7 : 1 },
            ]}>
            <Text style={styles.saveLabel}>{SAVE_AS_RECORD_LABEL}</Text>
          </Pressable>
        </View>
      </View>

      {/* 記録フォームには入力中の金額と種別を引き継ぐ（SPEC §3.2 / SPEC-V2 §1.4）。
          決定 §7-7 のとおり、DB への insert は保存ボタンを押したときだけ。
          目標額は逆算モードのときだけ渡す（SPEC-V9 §5.3）── values.targetProfit は
          モードを戻しても残るので、そのまま渡すと画面に出ていない目標が付く */}
      <RecordFormSheet
        visible={showForm}
        initialAmounts={toInitialAmounts(
          values,
          displayedSalesPrice,
          isTargetMode ? values.targetProfit : '',
        )}
        onClose={() => setShowForm(false)}
      />

      {/* ヘッダの「？」（UI-SPEC §5-9）。設定タブ配下の使いかたへ push はしない */}
      {showHelp && (
        <HelpSheet
          entry="calc"
          onClose={() => setShowHelp(false)}
          onReadAll={() => router.push('/settings/help')}
        />
      )}
    </>
  );
}

/**
 * 上端の固定バー（UI-SPEC §1.1-2）。
 * 結果カードが流れていく間も結果を見続けられるようにするのがねらいなので、
 * 出る条件はスクロール量だけで、モードや種別では変えない。
 * 内訳の開閉は結果カードとは別 state（呼び出し側が持つ）。
 */
function StickyResultBar({
  visible,
  colors,
  label,
  amount,
  amountColor,
  salesLabel,
  expensesLabel,
  costs,
  kind,
  expanded,
  onToggleBreakdown,
}: {
  visible: boolean;
  colors: ThemeColors;
  label: string;
  amount: string;
  amountColor: string;
  salesLabel: string;
  expensesLabel: string;
  costs: CostInput;
  kind: RecordKind;
  expanded: boolean;
  onToggleBreakdown: () => void;
}) {
  // Animated.Value はマウント中ずっと同じインスタンスを使う。
  // useRef ではなく useState の初期化関数なのは、描画に使う値を ref から読まないため
  const [progress] = useState(() => new Animated.Value(0));
  // スライドの距離は実測値を使う（内訳を開くとバーの高さが変わるため）
  const [barHeight, setBarHeight] = useState(FALLBACK_STICKY_HEIGHT);

  useEffect(() => {
    Animated.timing(progress, {
      toValue: visible ? 1 : 0,
      duration: STICKY_DURATION,
      useNativeDriver: true,
    }).start();
  }, [visible, progress]);

  return (
    <Animated.View
      // 隠れている間は下のカードを触れるようにする
      pointerEvents={visible ? 'auto' : 'none'}
      onLayout={(event) => setBarHeight(event.nativeEvent.layout.height)}
      style={[
        styles.stickyBar,
        {
          backgroundColor: colors.barBackground,
          borderBottomColor: colors.separator,
          opacity: progress,
          transform: [
            {
              translateY: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [-barHeight, 0],
              }),
            },
          ],
        },
      ]}>
      <View style={styles.stickyTopRow}>
        <Text style={[styles.stickyLabel, { color: colors.secondaryLabel }]} numberOfLines={1}>
          {label}
        </Text>
        <Text style={[styles.stickyAmount, { color: amountColor }]} numberOfLines={1}>
          {amount}
        </Text>
      </View>

      {/* 2 段目は売上・経費と内訳の開閉。行のどこを押しても開閉する */}
      <Pressable
        onPress={onToggleBreakdown}
        style={({ pressed }) => [styles.stickyMetaRow, { opacity: pressed ? 0.6 : 1 }]}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={BREAKDOWN_LABEL}>
        <Text style={[styles.stickyMeta, { color: colors.secondaryLabel }]} numberOfLines={1}>
          {salesLabel} {formatYenSymbol(costs.salesPrice)} ／ {expensesLabel}{' '}
          {formatYenSymbol(totalExpenses(costs))}
        </Text>
        <View style={styles.stickyBreakdownToggle}>
          <Text style={[styles.stickyMeta, { color: colors.blue }]}>{BREAKDOWN_LABEL}</Text>
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={12}
            color={colors.blue}
          />
        </View>
      </Pressable>

      {expanded && (
        <View style={styles.stickyBreakdown}>
          {/* 売上は 2 段目に出ているので、内訳では繰り返さない（UI-SPEC §1.1-2 の 3 行）。
              色と並びは結果カード・逆算パネルと同じ 1 つの部品が持つ */}
          <BreakdownPartList breakdown={costBreakdown(costs, kind)} colors={colors} />
        </View>
      )}
    </Animated.View>
  );
}

/** 入力カードの行区切り */
function Divider({ colors }: { colors: ThemeColors }) {
  return <View style={[styles.divider, { backgroundColor: colors.separator }]} />;
}

/**
 * 結果側（UI-SPEC §1.1-3a）。結果額のタップでも内訳を開閉する。
 *
 * 帯グラフと 2 値は逆算側と同じものを同じ位置に出す（同じ画面の 2 つのモードで結果の
 * 見え方が変わらないようにするため）。項目ごとの金額を色つきで見る一覧は逆算側にしかないので、
 * 従来からの内訳（結果額のタップで開く）はそのまま残してある。
 */
function ProfitPanel({
  values,
  kind,
  colors,
  profit,
  expanded,
  onToggleBreakdown,
}: {
  values: CalcFormValues;
  kind: RecordKind;
  colors: ThemeColors;
  profit: number;
  expanded: boolean;
  onToggleBreakdown: () => void;
}) {
  const breakdown = profitBreakdown(values);

  return (
    <View>
      <Pressable
        onPress={onToggleBreakdown}
        style={({ pressed }) => [styles.resultBlock, { opacity: pressed ? 0.6 : 1 }]}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${profitLabel(kind)} ${formatYen(profit)}。押すと${BREAKDOWN_LABEL}を開く`}>
        <Text style={[styles.resultCaption, { color: colors.secondaryLabel }]}>
          {profitLabel(kind)}
        </Text>
        <Text
          style={[styles.resultAmount, { color: profit >= 0 ? colors.green : colors.red }]}
          numberOfLines={1}
          adjustsFontSizeToFit>
          {formatYen(profit)}
        </Text>
      </Pressable>

      <CostProportionBar
        parts={breakdown.parts}
        kept={breakdown.kept}
        deducted={breakdown.deducted}
      />

      <CollapsibleSection
        label={BREAKDOWN_LABEL}
        expanded={expanded}
        onToggle={onToggleBreakdown}
        align="center">
        <BreakdownPartList breakdown={breakdown} colors={colors} showSalesRow />
      </CollapsibleSection>
    </View>
  );
}

/**
 * 逆算側（UI-SPEC §1.1-3b / 採用案 12c）。目標額を入れると必要な販売価格が出る。
 *
 * 12c のねらいは「内訳を開かないと根拠が見えない」状態をなくすこと。
 * 目標 100 円・手数料 10% で 112 円になるのが分からない、という指摘への対応で、
 * 閉じたままでも 帯グラフ → 2 値 → 説明文 の 3 段で根拠が読めるようにし、
 * 折りたたみの中には「項目ごとの金額」と「なぜ割り算なのか」だけを残す。
 *
 * 数字はすべて calcForm.requiredPriceResult の 1 つの戻り値から取る（画面では計算しない）。
 */
function TargetPanel({
  values,
  colors,
  onChangeTargetProfit,
  expanded,
  onToggleBreakdown,
}: {
  values: CalcFormValues;
  colors: ThemeColors;
  onChangeTargetProfit: (value: string) => void;
  expanded: boolean;
  onToggleBreakdown: () => void;
}) {
  const label = targetProfitLabel(values.kind);
  const result = requiredPriceResult(values);

  return (
    <View style={styles.targetPanel}>
      <View style={[styles.targetRow, { backgroundColor: colors.disabledBackground }]}>
        <Text style={[styles.targetLabel, { color: colors.label }]}>{label}</Text>
        <TextInput
          style={[styles.targetInput, { color: colors.label }]}
          value={values.targetProfit}
          onChangeText={(text) => onChangeTargetProfit(sanitizeNumericInput(text))}
          placeholder="0"
          placeholderTextColor={colors.secondaryLabel}
          keyboardType="decimal-pad"
          accessibilityLabel={label}
        />
      </View>

      <View style={styles.resultBlock}>
        <Text style={[styles.resultCaption, { color: colors.secondaryLabel }]}>
          {REQUIRED_PRICE_HEADLINE}
        </Text>
        <Text
          style={[styles.resultAmount, { color: colors.blue }]}
          numberOfLines={1}
          adjustsFontSizeToFit>
          {formatYen(result.requiredPrice)}
        </Text>
      </View>

      <CostProportionBar parts={result.parts} kept={result.kept} deducted={result.deducted} />

      <Text style={[styles.summary, { color: colors.label }]}>
        {requiredPriceSummary(result)}
      </Text>

      <CollapsibleSection
        label={BREAKDOWN_AND_METHOD_LABEL}
        tone="link"
        align="center"
        expanded={expanded}
        onToggle={onToggleBreakdown}>
        <BreakdownPartList breakdown={result} colors={colors} />

        <View style={[styles.methodDivider, { backgroundColor: colors.separator }]} />

        <FormulaBlock result={result} colors={colors} />
      </CollapsibleSection>
    </View>
  );
}

/** 「計算のしかた」の式と、その直下の注意文（採用案 12c） */
function FormulaBlock({
  result,
  colors,
}: {
  result: RequiredPriceResult;
  colors: ThemeColors;
}) {
  return (
    <View style={styles.formula}>
      {requiredPriceFormulaLines(result.formula).map((line) => (
        <Text key={line} style={[styles.formulaLine, { color: colors.label }]}>
          {line}
        </Text>
      ))}

      {/* 1 つ下の値段では届かないことを添える。数字が成り立たないとき（0 円以下になる、
          丸めのせいで届いてしまう）だけ落ちる。回数を数えて引っ込める仕掛けは持たない */}
      {result.lowerPrice != null && (
        <Text style={[styles.lowerPriceWarning, { color: colors.red }]}>
          {lowerPriceWarning(result.lowerPrice)}
        </Text>
      )}
    </View>
  );
}

/**
 * 内訳の一覧（UI-SPEC §1.1-3a / §1.1-3b）。**結果側・逆算側・固定バーで同じ 1 つの部品**。
 *
 * 帯グラフと同じ順・同じ色（左の色見本 = 区画の色）にして、どの区画がどの行かを色で追える
 * ようにする。以前は結果側だけが色のない行の並びで、同じ画面の 2 つのモードで内訳の読み方が
 * 変わっていた ── 帯は共通（CostProportionBar）なのに、その凡例にあたる一覧が
 * 片方だけ灰色では、色の対応を確かめる手段が逆算側にしかないことになる。
 *
 * 行の材料は logic/calcForm の costBreakdown が作る（画面では計算も並べ替えもしない）。
 * 0 円の項目と、不用品の仕入価格が落ちるのもその中の決定（§1.1-3a）。
 */
function BreakdownPartList({
  breakdown,
  colors,
  showSalesRow = false,
}: {
  breakdown: CostBreakdown;
  colors: ThemeColors;
  /** 固定バーは 2 段目に売上を出しているので、内訳では繰り返さない（UI-SPEC §1.1-2） */
  showSalesRow?: boolean;
}) {
  return (
    <View style={styles.partList}>
      {showSalesRow && (
        <View style={styles.partRow}>
          {/* 売上総額は帯の全体（区画の合計）で、対応する区画がないので色見本を持たない。
              下の行と語頭を揃えるために幅だけ空ける */}
          <View style={styles.swatch} />
          <Text style={[styles.partLabel, { color: colors.secondaryLabel }]}>
            {TOTAL_SALES_AMOUNT_LABEL}
          </Text>
          <Text style={[styles.partValue, { color: colors.label }]}>
            {formatYen(breakdown.salesPrice)}
          </Text>
        </View>
      )}
      {breakdown.parts.map((part) => (
        <View key={part.key} style={styles.partRow}>
          <View style={[styles.swatch, { backgroundColor: partColor(part.key, colors) }]} />
          <Text style={[styles.partLabel, { color: colors.secondaryLabel }]}>{part.label}</Text>
          <Text style={[styles.partValue, { color: partValueColor(part.key, colors) }]}>
            {formatYen(part.amount)}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    // 下端固定ボタンのぶんだけ余白を足して、最後の行が隠れないようにする
    paddingBottom: 110,
    gap: 16,
  },
  card: {
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  clearRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  clearLabel: {
    fontSize: 14,
  },
  resultBlock: {
    alignItems: 'center',
    gap: 2,
    paddingTop: 8,
  },
  resultCaption: {
    fontSize: 15,
  },
  resultAmount: {
    fontSize: 46,
    fontWeight: '800',
  },
  summary: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  partList: {
    gap: 8,
    paddingBottom: 4,
  },
  partRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  swatch: {
    width: 10,
    height: 10,
    borderRadius: 3,
  },
  partLabel: {
    fontSize: 14,
    // 行名が長くても（「販売手数料10%」）金額を右端に押し出す
    flex: 1,
  },
  partValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  methodDivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 4,
  },
  formula: {
    gap: 3,
  },
  formulaLine: {
    fontSize: 13,
    lineHeight: 20,
  },
  lowerPriceWarning: {
    fontSize: 12,
    lineHeight: 18,
    paddingTop: 4,
  },
  targetPanel: {
    gap: 8,
  },
  targetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    height: 60,
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  targetLabel: {
    fontSize: 16,
  },
  targetInput: {
    flex: 1,
    textAlign: 'right',
    fontSize: 22,
    fontWeight: '600',
  },
  inputGroup: {
    gap: 10,
  },
  inputCard: {
    // 行（高さ 60px）が余白を持つので、カード側の上下余白は最小限にする
    paddingVertical: 2,
    gap: 0,
  },
  stepperRow: {
    height: 60,
    justifyContent: 'center',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
  },
  stickyBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  stickyTopRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
  },
  stickyLabel: {
    fontSize: 14,
    flexShrink: 1,
  },
  stickyAmount: {
    fontSize: 30,
    fontWeight: '700',
  },
  stickyMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingTop: 2,
  },
  stickyMeta: {
    fontSize: 13,
    flexShrink: 1,
  },
  stickyBreakdownToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  stickyBreakdown: {
    gap: 6,
    paddingTop: 8,
  },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  saveButton: {
    height: 54,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveLabel: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },
});
