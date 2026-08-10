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
import { Tabs } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
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
import { NumericField } from '@/components/NumericField';
import { RecordKindSelector } from '@/components/RecordKindSelector';
import { SegmentedControl } from '@/components/SegmentedControl';
import { Stepper } from '@/components/Stepper';
import type { RecordKind } from '@/db/schema';
import {
  hasAnyInput,
  newCalcValues,
  requiredPriceEquation,
  toCostInput,
  toInitialAmounts,
  toRequiredCostInput,
  type CalcFormValues,
} from '@/logic/calcForm';
import { formatYen, formatYenSymbol } from '@/logic/format';
import { sanitizeNumericInput } from '@/logic/input';
import {
  BREAKDOWN_LABEL,
  CLEAR_LABEL,
  COMMISSION_LABEL,
  ENVELOPE_AND_OTHERS_LABEL,
  ENVELOPE_COST_LABEL,
  EXPENSES_LABEL,
  OPTIONAL_COSTS_LABEL,
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
  profitLabel,
  profitTabLabel,
  requiredPriceEquationParts,
  requiredPriceEquationText,
  requiredPriceNote,
  targetProfitLabel,
} from '@/logic/labels';
import { commissionCost, netProfit, totalExpenses, type CostInput } from '@/logic/profit';
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
  // 内訳の開閉は結果カードと固定バーで独立させる（UI-SPEC §1.1「挙動」）
  const [cardBreakdownOpen, setCardBreakdownOpen] = useState(false);
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
  // 押した直後の「元に戻す」表示は今回は実装しない（UI-SPEC §5-8）
  const clearAll = useCallback(
    () => setValues(newCalcValues(defaultRecordKind)),
    [defaultRecordKind],
  );

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

  const canClear = hasAnyInput(values, defaultRecordKind);

  // ヘッダは「？」のみで歯車は置かない（UI-SPEC §6-7）。
  // 「？」の配線はステップ 6（各画面のヘルプ）でまとめて行う
  const screenOptions = useMemo(() => ({ headerTitle: '利益計算' }), []);

  return (
    <>
      <Tabs.Screen options={screenOptions} />

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
                accessibilityLabel={`入力を${CLEAR_LABEL}`}
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
                requiredPrice={costs.salesPrice}
                onChangeTargetProfit={(value) => update('targetProfit', value)}
              />
            ) : (
              <ProfitPanel
                costs={costs}
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
                value={values.salesPrice}
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
              />
              <Divider colors={colors} />
              <View style={styles.stepperRow}>
                <Stepper
                  label={commissionFieldLabel(values.commission)}
                  value={values.commission}
                  minimumValue={MIN_COMMISSION}
                  maximumValue={MAX_COMMISSION}
                  onChangeValue={(value) => update('commission', value)}
                />
              </View>
              <Divider colors={colors} />

              {/* 6. 梱包材・その他は畳んでおく（UI-SPEC §1.1-6） */}
              <CollapsibleSection
                label={OPTIONAL_COSTS_LABEL}
                tone="link"
                expanded={optionalCostsOpen}
                onToggle={() => setOptionalCostsOpen((open) => !open)}>
                <NumericField
                  label={ENVELOPE_COST_LABEL}
                  value={values.envelopeCost}
                  onChangeValue={(value) => update('envelopeCost', value)}
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
          決定 §7-7 のとおり、DB への insert は保存ボタンを押したときだけ */}
      <RecordFormSheet
        visible={showForm}
        initialAmounts={toInitialAmounts(values)}
        onClose={() => setShowForm(false)}
      />
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
          {salesLabel} {formatYenSymbol(costs.salesPrice)} ／ {EXPENSES_LABEL}{' '}
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
          {/* 売上は 2 段目に出ているので、内訳では繰り返さない（UI-SPEC §1.1-2 の 3 行） */}
          <BreakdownRows costs={costs} kind={kind} colors={colors} />
        </View>
      )}
    </Animated.View>
  );
}

/** 入力カードの行区切り */
function Divider({ colors }: { colors: ThemeColors }) {
  return <View style={[styles.divider, { backgroundColor: colors.separator }]} />;
}

/** 結果側（UI-SPEC §1.1-3a）。結果額のタップでも内訳を開閉する */
function ProfitPanel({
  costs,
  kind,
  colors,
  profit,
  expanded,
  onToggleBreakdown,
}: {
  costs: CostInput;
  kind: RecordKind;
  colors: ThemeColors;
  profit: number;
  expanded: boolean;
  onToggleBreakdown: () => void;
}) {
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

      <CollapsibleSection
        label={BREAKDOWN_LABEL}
        expanded={expanded}
        onToggle={onToggleBreakdown}
        align="center">
        <BreakdownRows costs={costs} kind={kind} colors={colors} showSalesRow />
      </CollapsibleSection>
    </View>
  );
}

/** 逆算側（UI-SPEC §1.1-3b）。目標額を入れると必要な販売価格が出る */
function TargetPanel({
  values,
  colors,
  requiredPrice,
  onChangeTargetProfit,
}: {
  values: CalcFormValues;
  colors: ThemeColors;
  requiredPrice: number;
  onChangeTargetProfit: (value: string) => void;
}) {
  const label = targetProfitLabel(values.kind);
  const equation = requiredPriceEquation(values);

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
          {formatYen(requiredPrice)}
        </Text>

        {/* 検算行。逆算の結果が「目標額 ＋ 手数料率」の暗算と食い違って見えるという指摘への対応で、
            内訳を開かなくても根拠が読めるように結果のすぐ下へ常時出す。
            項ごとに Text を分けているのは、折り返しが項の切れ目でだけ起きるようにするため
            （1 本の文字列だと「= 利益 100」と「円」が別の行に割れる） */}
        <View
          style={styles.equation}
          accessible
          accessibilityLabel={requiredPriceEquationText(equation, profitLabel(values.kind))}>
          {requiredPriceEquationParts(equation, profitLabel(values.kind)).map((part) => (
            <Text key={part} style={[styles.equationPart, { color: colors.label }]}>
              {part}
            </Text>
          ))}
        </View>

        <Text style={[styles.note, { color: colors.secondaryLabel }]}>
          {requiredPriceNote(values.commission)}
        </Text>
      </View>
    </View>
  );
}

/**
 * 内訳の行（UI-SPEC §1.1-3a）。
 * 固定バーは 2 段目に売上を出しているので、売上総額の行は結果カード側だけに出す（§1.1-2）。
 * 仕入価格の行は仕入品のときだけ（SPEC-V2 §1.3）。
 */
function BreakdownRows({
  costs,
  kind,
  colors,
  showSalesRow = false,
}: {
  costs: CostInput;
  kind: RecordKind;
  colors: ThemeColors;
  showSalesRow?: boolean;
}) {
  return (
    <>
      {showSalesRow && (
        <BreakdownRow
          label={TOTAL_SALES_AMOUNT_LABEL}
          value={costs.salesPrice}
          color={colors.label}
          colors={colors}
        />
      )}
      {kind === 'sourced' && (
        <BreakdownRow
          label={PURCHASE_PRICE_LABEL}
          value={costs.purchasePrice}
          color={colors.secondaryLabel}
          colors={colors}
        />
      )}
      <BreakdownRow
        label={POSTAGE_LABEL}
        value={costs.postage}
        color={colors.secondaryLabel}
        colors={colors}
      />
      <BreakdownRow
        label={ENVELOPE_AND_OTHERS_LABEL}
        value={costs.envelopeCost + costs.othersCost}
        color={colors.secondaryLabel}
        colors={colors}
      />
      <BreakdownRow
        label={COMMISSION_LABEL}
        value={commissionCost(costs)}
        color={colors.orange}
        colors={colors}
      />
    </>
  );
}

function BreakdownRow({
  label,
  value,
  color,
  colors,
}: {
  label: string;
  value: number;
  color: string;
  colors: ThemeColors;
}) {
  return (
    <View style={styles.breakdownRow}>
      <Text style={[styles.breakdownLabel, { color: colors.secondaryLabel }]}>{label}</Text>
      <Text style={[styles.breakdownValue, { color }]}>{formatYen(value)}</Text>
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
  equation: {
    // 項が増えると 1 行に収まらないので、項単位で折り返す
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    columnGap: 5,
    paddingTop: 6,
  },
  equationPart: {
    fontSize: 13,
    lineHeight: 19,
  },
  note: {
    fontSize: 12,
    textAlign: 'center',
    paddingTop: 4,
  },
  targetPanel: {
    gap: 4,
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
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  breakdownLabel: {
    fontSize: 14,
  },
  breakdownValue: {
    fontSize: 14,
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
