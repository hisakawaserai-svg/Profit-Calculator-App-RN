// CalcView.swift（計算タブ）の移植。SPEC §3.2「CalcView」/ §5.1。
// - 計算は src/logic/profit.ts の純粋関数のみを使用し、画面内で式を再実装しない。
// - 決定 §7-14 により iPad/Mac の 2 ペインレイアウトは移植せず、iPhone 縦 1 カラムのみ。
import { Ionicons } from '@expo/vector-icons';
import { Tabs, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { NumericField } from '@/components/NumericField';
import { RecordKindSelector } from '@/components/RecordKindSelector';
import { SegmentedControl } from '@/components/SegmentedControl';
import { Stepper } from '@/components/Stepper';
import type { RecordKind } from '@/db/schema';
import { parseNumericInput, sanitizeNumericInput } from '@/logic/input';
import {
  commissionCost,
  netProfit,
  requiredSalesPrice,
  roundForDisplay,
  type CostInput,
} from '@/logic/profit';
import { DEFAULT_COMMISSION, type InitialAmounts } from '@/logic/recordForm';
import { RecordFormSheet } from '@/screens/RecordFormSheet';
import { useSettings } from '@/settings';
import { useThemeColors, type ThemeColors } from '@/theme';

const TAB_NET_PROFIT = 0;
const TAB_TARGET_PROFIT = 1;

export default function CalcScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const { defaultRecordKind } = useSettings();

  // 種別は画面ローカルの state（レコードではない。SPEC-V2 §1.3）。初期値は設定値（§1.4）
  const [kind, setKind] = useState<RecordKind>(defaultRecordKind);
  // このタブの歯車から設定を変えたときは、背後のこの画面も新しい既定種別に合わせる。
  // レンダー中に直す形にしているのは React 公式の「props が変わったら state を調整する」手順
  // （効果で setState すると 1 度古い値で描画してから再レンダーになる）。
  const [syncedDefaultKind, setSyncedDefaultKind] = useState<RecordKind>(defaultRecordKind);
  if (syncedDefaultKind !== defaultRecordKind) {
    setSyncedDefaultKind(defaultRecordKind);
    setKind(defaultRecordKind);
  }

  const [salesPriceInput, setSalesPriceInput] = useState('');
  const [purchasePriceInput, setPurchasePriceInput] = useState('');
  const [postageInput, setPostageInput] = useState('');
  const [envelopeCostInput, setEnvelopeCostInput] = useState('');
  const [othersCostInput, setOthersCostInput] = useState('');
  const [commissionValue, setCommissionValue] = useState(DEFAULT_COMMISSION);
  const [selectedTab, setSelectedTab] = useState(TAB_NET_PROFIT);
  const [targetProfitInput, setTargetProfitInput] = useState('');
  const [showForm, setShowForm] = useState(false);

  // Swift 版の calculationData（MercariCalcData）相当。値の組み立てのみで計算はしない
  const calcInput: CostInput = {
    salesPrice: parseNumericInput(salesPriceInput),
    // 不用品は仕入価格の概念がないので 0 扱い（SPEC-V2 §1.3）。計算式自体は種別で変えない（§1.2）
    purchasePrice: kind === 'used' ? 0 : parseNumericInput(purchasePriceInput),
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
    // 金額だけでなく種別も設定値に戻す（SPEC-V2 §1.3 リセットボタン）
    setKind(defaultRecordKind);
  }, [defaultRecordKind]);

  // Swift 版 prepareNewRecord 相当（SPEC §3.2）。ただし決定 §7-7 によりレコードは作らず、
  // 入力中の金額をフォームの初期値としてメモリ上で渡すだけ。DB への insert は保存ボタン押下時。
  // 引き継ぐのは 5 つの金額と手数料で、出品日 = 当日 / isSold = false はフォーム側の既定値。
  const initialAmounts: InitialAmounts = {
    // 種別もフォームへ引き継ぐ（SPEC-V2 §1.4）。設定値ではなく画面の見た目に合わせる
    kind,
    salesPrice: salesPriceInput,
    // 不用品では欄を出していないので、入力が残っていてもフォームには渡さない
    purchasePrice: kind === 'used' ? '' : purchasePriceInput,
    postage: postageInput,
    envelopeCost: envelopeCostInput,
    othersCost: othersCostInput,
    commission: commissionValue,
  };

  const prepareNewRecord = useCallback(() => setShowForm(true), []);
  const openSettings = useCallback(() => router.push('/settings'), [router]);

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
          {/* 設定モーダルの入口（SPEC-V2 §3.3）。ヘッダのボタンはリセット・＋・歯車の 3 つ */}
          <Pressable onPress={openSettings} hitSlop={8} accessibilityLabel="設定">
            <Ionicons name="settings-outline" size={22} color={colors.blue} />
          </Pressable>
        </View>
      ),
    }),
    [colors.blue, openSettings, prepareNewRecord, resetAllFields],
  );

  return (
    <>
      <Tabs.Screen options={screenOptions} />
      <ScrollView
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag">
        {/* 種別セレクタは画面上部（SPEC-V2 §1.3）。以下の入力欄・内訳の出し分けに効く */}
        <RecordKindSelector kind={kind} onChange={setKind} />

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
            {/* 不用品では仕入れ価格を出さない（値は 0 扱い。SPEC-V2 §1.3） */}
            {kind === 'sourced' && (
              <NumericField
                label="仕入れ価格"
                value={purchasePriceInput}
                onChangeValue={setPurchasePriceInput}
              />
            )}
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
            <NetProfitResult input={calcInput} kind={kind} colors={colors} />
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

      <RecordFormSheet
        visible={showForm}
        initialAmounts={initialAmounts}
        onClose={() => setShowForm(false)}
      />
    </>
  );
}

/** Swift 版 ResultView。純利益の大表示＋収益内訳 */
function NetProfitResult({
  input,
  kind,
  colors,
}: {
  input: CostInput;
  kind: RecordKind;
  colors: ThemeColors;
}) {
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
        {/* 不用品では仕入れ価格の行を出さない（SPEC-V2 §1.3）。他の行は共通 */}
        {kind === 'sourced' && (
          <DetailRow
            title="仕入れ価格"
            value={input.purchasePrice}
            color={colors.secondaryLabel}
            colors={colors}
          />
        )}
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
