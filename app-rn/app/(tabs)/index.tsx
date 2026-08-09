// CalcView.swift（計算タブ）の移植。SPEC §3.2「CalcView」/ §5.1。
// - 計算は src/logic/profit.ts の純粋関数のみを使用し、画面内で式を再実装しない。
// - 決定 §7-14 により iPad/Mac の 2 ペインレイアウトは移植せず、iPhone 縦 1 カラムのみ。
import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { NumericField } from '@/components/NumericField';
import { SegmentedControl } from '@/components/SegmentedControl';
import { Stepper } from '@/components/Stepper';
import { parseNumericInput, sanitizeNumericInput } from '@/logic/input';
import {
  commissionCost,
  netProfit,
  requiredSalesPrice,
  roundForDisplay,
  type CostInput,
} from '@/logic/profit';
import { useThemeColors, type ThemeColors } from '@/theme';

const DEFAULT_COMMISSION = 10;
const TAB_NET_PROFIT = 0;
const TAB_TARGET_PROFIT = 1;

export default function CalcScreen() {
  const colors = useThemeColors();

  const [salesPriceInput, setSalesPriceInput] = useState('');
  const [purchasePriceInput, setPurchasePriceInput] = useState('');
  const [postageInput, setPostageInput] = useState('');
  const [envelopeCostInput, setEnvelopeCostInput] = useState('');
  const [othersCostInput, setOthersCostInput] = useState('');
  const [commissionValue, setCommissionValue] = useState(DEFAULT_COMMISSION);
  const [selectedTab, setSelectedTab] = useState(TAB_NET_PROFIT);
  const [targetProfitInput, setTargetProfitInput] = useState('');

  // Swift 版の calculationData（MercariCalcData）相当。値の組み立てのみで計算はしない
  const calcInput: CostInput = {
    salesPrice: parseNumericInput(salesPriceInput),
    purchasePrice: parseNumericInput(purchasePriceInput),
    postage: parseNumericInput(postageInput),
    envelopeCost: parseNumericInput(envelopeCostInput),
    othersCost: parseNumericInput(othersCostInput),
    commission: commissionValue,
  };

  const resetAllFields = useCallback(() => {
    setSalesPriceInput('');
    setPurchasePriceInput('');
    setPostageInput('');
    setEnvelopeCostInput('');
    setOthersCostInput('');
    setCommissionValue(DEFAULT_COMMISSION);
    setTargetProfitInput('');
  }, []);

  const prepareNewRecord = useCallback(() => {
    // TODO: SPEC 決定 §7-7 — ＋ボタンは「保存時にのみレコードを作成する」方式にする。
    // 現在の入力値（calcInput・saleStartDate = 当日・isSold = false）をフォームの初期値として
    // メモリ上で RecordFormView へ渡し、保存ボタン押下時に初めて DB へ insert する。
    // RecordFormView が未実装のため、この段階ではボタンのみ配置してある。
  }, []);

  const screenOptions = useMemo(
    () => ({
      // タブのラベル（'計算'）は _layout.tsx の title のまま残したいので headerTitle だけ上書きする
      headerTitle: '利益計算',
      headerRight: () => (
        <View style={styles.headerButtons}>
          <Pressable onPress={resetAllFields} hitSlop={8} accessibilityLabel="入力をリセット">
            <Ionicons name="refresh" size={22} color={colors.blue} />
          </Pressable>
          <Pressable onPress={prepareNewRecord} hitSlop={8} accessibilityLabel="記録を追加">
            <Ionicons name="add" size={26} color={colors.blue} />
          </Pressable>
        </View>
      ),
    }),
    [colors.blue, prepareNewRecord, resetAllFields],
  );

  return (
    <>
      <Tabs.Screen options={screenOptions} />
      <ScrollView
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag">
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.label }]}>販売情報</Text>
          <View style={[styles.card, { backgroundColor: colors.secondaryBackground }]}>
            <NumericField
              label="販売価格"
              value={salesPriceInput}
              onChangeValue={setSalesPriceInput}
              // 目標利益逆算タブでは販売価格が計算結果になるため入力を無効化（SPEC §3.2）
              disabled={selectedTab === TAB_TARGET_PROFIT}
            />
            <NumericField
              label="仕入れ価格"
              value={purchasePriceInput}
              onChangeValue={setPurchasePriceInput}
            />
            <NumericField label="送料" value={postageInput} onChangeValue={setPostageInput} />
            <NumericField
              label="梱包材"
              value={envelopeCostInput}
              onChangeValue={setEnvelopeCostInput}
            />
            <NumericField label="その他" value={othersCostInput} onChangeValue={setOthersCostInput} />
            <Stepper
              label={`手数料: ${commissionValue}%`}
              value={commissionValue}
              minimumValue={0}
              maximumValue={50}
              onChangeValue={setCommissionValue}
            />
          </View>
        </View>

        <View style={styles.resultSection}>
          <SegmentedControl
            options={['純利益表示', '目標利益逆算']}
            selectedIndex={selectedTab}
            onChange={setSelectedTab}
          />

          {selectedTab === TAB_NET_PROFIT ? (
            <NetProfitResult input={calcInput} colors={colors} />
          ) : (
            <TargetProfitResult
              input={calcInput}
              colors={colors}
              targetProfitInput={targetProfitInput}
              onChangeTargetProfit={setTargetProfitInput}
            />
          )}
        </View>
      </ScrollView>
    </>
  );
}

/** Swift 版 ResultView。純利益の大表示＋収益内訳 */
function NetProfitResult({ input, colors }: { input: CostInput; colors: ThemeColors }) {
  const profit = netProfit(input);

  return (
    <View style={styles.resultSection}>
      <View style={[styles.card, styles.bigNumberCard, { backgroundColor: colors.secondaryBackground }]}>
        <Text style={[styles.bigNumberCaption, { color: colors.secondaryLabel }]}>純利益</Text>
        <Text style={[styles.bigNumber, { color: profit >= 0 ? colors.green : colors.red }]}>
          {roundForDisplay(profit)} 円
        </Text>
      </View>

      {/* Swift 版 CalculationDetailsView */}
      <View style={[styles.card, { backgroundColor: colors.secondaryBackground }]}>
        <Text style={[styles.detailsTitle, { color: colors.label }]}>収益内訳：</Text>
        <DetailRow title="売上総額" value={input.salesPrice} color={colors.label} colors={colors} />
        <View style={[styles.divider, { backgroundColor: colors.separator }]} />
        <DetailRow
          title="仕入れ価格"
          value={input.purchasePrice}
          color={colors.secondaryLabel}
          colors={colors}
        />
        <DetailRow title="送料" value={input.postage} color={colors.secondaryLabel} colors={colors} />
        <DetailRow
          title="梱包・その他"
          value={input.envelopeCost + input.othersCost}
          color={colors.secondaryLabel}
          colors={colors}
        />
        <DetailRow
          title="販売手数料"
          value={commissionCost(input)}
          color={colors.orange}
          colors={colors}
        />
      </View>
    </View>
  );
}

/** Swift 版 TargetProfitView。目標利益から必要販売価格を逆算 */
function TargetProfitResult({
  input,
  colors,
  targetProfitInput,
  onChangeTargetProfit,
}: {
  input: CostInput;
  colors: ThemeColors;
  targetProfitInput: string;
  onChangeTargetProfit: (value: string) => void;
}) {
  // requiredSalesPrice は §2.5 の Math.ceil 済みの値を返す
  const required = requiredSalesPrice(parseNumericInput(targetProfitInput), input);

  return (
    <View style={styles.targetSection}>
      <Text style={[styles.targetHeadline, { color: colors.label }]}>目標利益を入力してください</Text>
      <TextInput
        style={[
          styles.targetInput,
          {
            borderColor: colors.separator,
            color: colors.label,
            backgroundColor: colors.secondaryBackground,
          },
        ]}
        value={targetProfitInput}
        onChangeText={(text) => onChangeTargetProfit(sanitizeNumericInput(text))}
        placeholder="例：500"
        placeholderTextColor={colors.secondaryLabel}
        keyboardType="decimal-pad"
        accessibilityLabel="目標利益"
      />
      <View style={[styles.card, styles.bigNumberCard, { backgroundColor: colors.secondaryBackground }]}>
        <Text style={{ color: colors.label }}>必要な販売価格</Text>
        <Text style={[styles.bigNumber, styles.requiredPrice, { color: colors.green }]}>
          {required} 円
        </Text>
      </View>
    </View>
  );
}

function DetailRow({
  title,
  value,
  color,
  colors,
}: {
  title: string;
  value: number;
  color: string;
  colors: ThemeColors;
}) {
  return (
    <View style={styles.detailRow}>
      <Text style={{ color: colors.label }}>{title}</Text>
      <Text style={{ color }}>{roundForDisplay(value)} 円</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    paddingRight: 4,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
    gap: 20,
  },
  section: {
    gap: 18,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '700',
  },
  card: {
    padding: 16,
    borderRadius: 12,
    gap: 12,
  },
  resultSection: {
    gap: 18,
  },
  bigNumberCard: {
    alignItems: 'center',
    gap: 8,
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  bigNumberCaption: {
    fontSize: 15,
  },
  bigNumber: {
    fontSize: 44,
    fontWeight: '800',
  },
  requiredPrice: {
    fontSize: 40,
  },
  detailsTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
  },
  targetSection: {
    gap: 12,
  },
  targetHeadline: {
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
  },
  targetInput: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 16,
    marginHorizontal: 16,
  },
});
