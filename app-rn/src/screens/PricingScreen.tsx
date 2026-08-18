// 「いくらで売る？」（SPEC-V9 §9）。記録詳細の子として push される 1 商品の分析画面。
//
// **データタブとの違いは対象の数。** あちらは販売全体の傾向（何が売れているか）を扱い、
// この画面は「この 1 つをいくらで売るか」だけを扱う。だから合計も推移も出さない。
//
// 画面の骨格は 6 段（§9.2）。**目標の有無で段の数は変わらない**:
//   1. 商品名 ＋ バッジ（「出品中 14日目」）
//   2. 「今の価格 ¥5,000 で売れたら」＋ 主役の数字 ＋ 利益率
//   3. 結論の帯（色は状態による）
//   4. 価格ライン（横。目盛りは 2〜3 点）
//   5. シミュレーターのカード
//   6. 最下段 2 行（費用の内訳 / 目標利益）
//
// **目標なしが標準ケース**（§1.3。大半の記録は目標を持たない）。目標ありを基本形にして
// そこから引き算する作りにはしない ── 目標が無いときに空の目盛りや「¥0」が残る。
//
// **計算式はこの画面に無い。** 状態の判定も金額も logic/pricing.ts（→ logic/profit.ts）が返し、
// 文字列は logic/labels.ts が組み立てる。ここがするのは並べることと、押されたときの保存だけ。
//
// **帯グラフは複製しない**（§9.13）。費用の内訳は記録詳細のレシートが既に持っているので、
// 最下段の行はそこへ戻す。同じ 1 件の内訳が 2 か所で別々に育つのを避ける。
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AccessibilityInfo,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';

import { HelpButton } from '@/components/HelpButton';
import { HelpSheet } from '@/components/HelpSheet';
import { MiniBreakdownBar } from '@/components/MiniBreakdownBar';
import { PriceLine } from '@/components/PriceLine';
import { PriceSlider } from '@/components/PriceSlider';
import { UndoBar } from '@/components/UndoBar';
import { fromDbDate } from '@/db/dates';
import type { SaleRecord } from '@/db/schema';
import { setSalesPrice, setTargetProfit, useRecord } from '@/db/useRecords';
import { formatYenSymbol } from '@/logic/format';
import {
  amountPlaceholder,
  applyPriceNote,
  costBreakdownRowLabel,
  fixDateLabel,
  knownWithoutPriceTitle,
  lossBadgeLabel,
  noLossPriceLabel,
  priceInputButtonLabel,
  priceUndoLabel,
  priceUnsetBadgeLabel,
  priceUnsetDescription,
  priceUnsetLeadLabel,
  pricingScreenTitle,
  remainingProfitLeadLabel,
  simulatorDisabledNote,
  simulatorNote,
  soldAnalysisScreenTitle,
  soldBadgeLabel,
  soldDateReversedLabel,
  soldPerDayCaption,
  soldSameDayLabel,
  spentCostLabel,
  targetReachedPriceLabel,
  untitledLabel,
  applyPriceButtonLabel,
  currentPriceLeadLabel,
  knownWithoutPriceNote,
  listingDayBadgeLabel,
  lossAmountNote,
  minPriceLabel,
  netProfitEstimateNote,
  priceAppliedMessage,
  pricingConclusionText,
  pricingHeroAmount,
  simulationVerdictText,
  simulatorProfitNote,
  simulatorTitle,
  soldActualBarLabel,
  soldDateRangeNote,
  soldElapsedDaysLabel,
  soldOnBadgeLabel,
  soldPerDayProfitLabel,
  soldPriceRateNote,
  soldSectionBody,
  soldSectionTitle,
  soldTargetBarLabel,
  targetAchievementBadgeLabel,
  targetProfitLabel,
  targetProfitRowValue,
  targetShortfallPastLabel,
} from '@/logic/labels';
import {
  CONCLUSION_TONES,
  analyzePricing,
  canApplyPrice,
  initialSimulationPrice,
  pricingConclusion,
  simulationVerdict,
  soldConclusion,
  soldElapsed,
  soldPerDayProfit,
  targetAchievementRatio,
  type PricingAnalysis,
  type PricingTone,
  type SoldConclusion,
  type SoldElapsed,
} from '@/logic/pricing';
import { elapsedDays, type TargetCostInput } from '@/logic/profit';
import { PriceApplySheet } from '@/screens/PriceApplySheet';
import { RecordFormSheet } from '@/screens/RecordFormSheet';
import { TargetProfitSheet } from '@/screens/TargetProfitSheet';
import { useLocale } from '@/settings';
import { useThemeColors, type ThemeColors } from '@/theme';

/** 記録詳細へ戻る先（§9.13）。**push ではなく dismissTo** ── 積み増さずに元の 1 枚へ返す */
const RECORD_DETAIL_PATHNAME = '/records/record/[id]' as const;

/**
 * 書き換えたあとのバーが出ている時間（§9.12）。**5 秒で消え、そのとき取り消しもできなくなる。**
 * 「売れた」の合図（4 秒。UndoBar の既定）より長いのは、こちらが金額の書き換えで、
 * 読んで確かめるものが 1 つ多いため。
 */
const PRICE_UNDO_MS = 5000;

export function PricingScreen() {
  // 表示語は locale を引数に取る（渡さないと React Compiler が初回の文字列で固定する。
  // src/i18n/index.ts の冒頭）。この購読で言語を変えたときに引き直される
  const locale = useLocale();

  const colors = useThemeColors();
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;

  const { record, refresh } = useRecord(id);
  /** 「今日」はマウント時に 1 回だけ決める（バッジの経過日数の基準） */
  const today = useMemo(() => new Date(), []);

  const [showApply, setShowApply] = useState(false);
  const [showTarget, setShowTarget] = useState(false);
  const [showForm, setShowForm] = useState(false);
  /** ヘッダの「？」（UI-SPEC §5-9）。この画面は「売る」ページの先頭を開いた状態で出す */
  const [showHelp, setShowHelp] = useState(false);

  /**
   * 書き換えの取り消し（§9.12）。**バーが消えると同時に取り消しもできなくなる**ので、
   * 戻す先の価格はバーと同じ寿命で持つ（消えたら null に戻る）。
   */
  const [undoPrice, setUndoPrice] = useState<number | null>(null);

  /**
   * この画面で書き換える前の価格（§9.11）。価格ラインに灰色の点として残す。
   * **保存しない** ── 画面を出れば消える、その場の履歴。
   */
  const [previousPrices, setPreviousPrices] = useState<readonly number[]>([]);

  // レコードが無くなったら出し続ける意味がないので前画面へ戻る（記録詳細と同じ）
  useEffect(() => {
    if (record == null && router.canGoBack()) router.back();
  }, [record, router]);

  // タイトルは売却済みかどうかで変わる（「いくらで売る？」/「どうだった？」）。
  // record が読めるまでは出品中側の語を仮に出す（読めたコマ目でタイトルだけ差し替わる）
  //
  // **画面端からのスワイプ戻りを常時切る（gestureEnabled: false）。** この画面はシミュレーターの
  // つまみが画面幅いっぱいの横スライドを取る（PriceSlider）。iOS のネイティブなスワイプで戻る
  // ジェスチャーは RN の responder 系（PriceSlider が使っている）とは別物で、
  // `onResponderTerminationRequest` では止められない ── 指を右へ引くと、つまみの代わりに
  // 画面そのものが戻ってしまう。
  //
  // **掴んだ瞬間だけ動的に切る案（state 経由で gestureEnabled を操作）は実機で不採用と確認済み。**
  // タッチダウンからその state 変化がネイティブ側の prop に反映されるまでの一往復（JS→ネイティブ）
  // の間に、iOS 側のジェスチャー認識機がすでに動き始めてしまい、通常の速さの操作でも
  // 間に合わなかった（2026-08-15）。だから「常時オフ・戻る手段はヘッダーの『‹ 記録』のみ」を選ぶ。
  //
  // **`gestureEnabled: false` だけでは iOS 26 で止まらない不具合を確認した（2026-08-16）。**
  // node_modules/react-native-screens@4.26.2 の ios/RNSScreenStack.mm を実際に読んだ結果:
  // iOS 26 は `RNSPanGestureRecognizer`（旧来の自前実装）の代わりにネイティブの
  // `interactiveContentPopGestureRecognizer` を使う。これを認めるかどうかを最終的に決める
  // `-gestureRecognizerShouldBegin:` の iOS 26 分岐（RNSScreenStack.mm 836-853 行）は、
  // `RNSScreenEdgeGestureRecognizer` かどうか・`isInGestureResponseDistance` かどうかしか見ておらず、
  // **`topScreen.gestureEnabled` を確認せずに `return YES` する**。`gestureEnabled` を見ている
  // `-gestureRecognizer:shouldReceivePressOrTouchEvent:`（同ファイル 1094 行）はより古い経路
  // （コード中のコメントに「iOS < 13.4 との互換のためのカスタムメソッド」とあり、対応する
  // recognizer が 3 種と明記されている＝ iOS 26 のこの recognizer は含まれていない）で、
  // 先に効くとは限らない。`fullScreenSwipeEnabled` は `isFullScreenSwipeEffectivelyEnabled` として
  // 同じ `shouldReceivePressOrTouchEvent:` の中でしか参照されないため、単独では効果が保証できない。
  // ライブラリ側の未解決範囲（software-mansion/react-native-screens の
  // interactiveContentPopGestureRecognizer 関連 PR #3141/#3142/#3173/#3093/#3989 が
  // 段階的に手を入れている領域）とみられるが、念のため両方明示しておく。
  const screenOptions = useMemo(
    () => ({
      title: record?.isSold ? soldAnalysisScreenTitle(locale) : pricingScreenTitle(locale),
      headerBackTitle: '記録',
      gestureEnabled: false,
      fullScreenSwipeEnabled: false,
      headerRight: () => <HelpButton onPress={() => setShowHelp(true)} />,
    }),
    [record?.isSold, locale],
  );

  if (record == null) {
    return (
      <>
        <Stack.Screen options={screenOptions} />
        <View style={[styles.container, { backgroundColor: colors.secondaryBackground }]} />
      </>
    );
  }

  const onOpenBreakdown = () =>
    router.dismissTo({ pathname: RECORD_DETAIL_PATHNAME, params: { id } });

  return (
    <>
      <Stack.Screen options={screenOptions} />
      {record.isSold ? (
        <SoldContent
          record={record}
          today={today}
          refresh={refresh}
          colors={colors}
          showTarget={showTarget}
          setShowTarget={setShowTarget}
          showForm={showForm}
          setShowForm={setShowForm}
          onOpenBreakdown={onOpenBreakdown}
        />
      ) : (
        <PricingContent
          record={record}
          today={today}
          refresh={refresh}
          colors={colors}
          previousPrices={previousPrices}
          setPreviousPrices={setPreviousPrices}
          undoPrice={undoPrice}
          setUndoPrice={setUndoPrice}
          showApply={showApply}
          setShowApply={setShowApply}
          showTarget={showTarget}
          setShowTarget={setShowTarget}
          showForm={showForm}
          setShowForm={setShowForm}
          onOpenBreakdown={onOpenBreakdown}
        />
      )}

      {/* ヘッダの「？」（UI-SPEC §5-9）。設定タブとは別のスタックなので push はしない。
          「最初から読む」を渡さないのは、この画面が記録タブの奥（記録 → 詳細 → ここ）に
          あり、そこから設定タブへ移すと戻り先が分からなくなるため（記録詳細と同じ扱い） */}
      {showHelp && <HelpSheet entry="pricing" onClose={() => setShowHelp(false)} />}
    </>
  );
}

type ContentProps = {
  record: SaleRecord;
  today: Date;
  refresh: () => void;
  colors: ThemeColors;
  previousPrices: readonly number[];
  setPreviousPrices: (update: (prices: readonly number[]) => readonly number[]) => void;
  undoPrice: number | null;
  setUndoPrice: (price: number | null) => void;
  showApply: boolean;
  setShowApply: (visible: boolean) => void;
  showTarget: boolean;
  setShowTarget: (visible: boolean) => void;
  showForm: boolean;
  setShowForm: (visible: boolean) => void;
  onOpenBreakdown: () => void;
};

/**
 * レコードが取れてからの本体。**record を非 null で受ける**ために切ってある
 * （フックの数を分岐で変えないため。詳細画面が早期 return で済ませているのと同じ理由だが、
 * こちらはシミュレーターの state が record に依存するので、内側に置く必要がある）。
 */
function PricingContent({
  record,
  today,
  refresh,
  colors,
  previousPrices,
  setPreviousPrices,
  undoPrice,
  setUndoPrice,
  showApply,
  setShowApply,
  showTarget,
  setShowTarget,
  showForm,
  setShowForm,
  onOpenBreakdown,
}: ContentProps) {
  // 表示語は locale を引数に取る（渡さないと React Compiler が初回の文字列で固定する。
  // src/i18n/index.ts の冒頭）。この購読で言語を変えたときに引き直される
  const locale = useLocale();

  const analysis = analyzePricing(record);
  // 経費一式。SaleRecord をそのまま渡せる形（余分な列は使われない）
  const costs: TargetCostInput = record;

  /**
   * シミュレーターの値。**記録の価格が変わったら引き直す**（書き換えの直後・取り消しの直後）──
   * 前の価格のまま残ると、上の数字と手元のつまみが別の記録の話をすることになる。
   * effect ではなく描画中に取り込むのは、1 描画ぶん古い値が出るのを避けるため（SheetModal と同じ）。
   */
  const [simPrice, setSimPrice] = useState(() => initialSimulationPrice(analysis));
  const [basisPrice, setBasisPrice] = useState(record.salesPrice);
  /** つまみを掴んでいる間だけ ScrollView の縦スクロールを切る（下の ScrollView 参照） */
  const [sliderDragging, setSliderDragging] = useState(false);
  if (basisPrice !== record.salesPrice) {
    setBasisPrice(record.salesPrice);
    setSimPrice(initialSimulationPrice(analysis));
  }

  const verdict = simulationVerdict(analysis, simPrice, costs);
  const conclusion = pricingConclusion(analysis);
  const canApply = canApplyPrice(analysis, simPrice);

  const handleApply = useCallback(() => {
    const before = record.salesPrice;
    setSalesPrice(record.id, simPrice);
    setPreviousPrices((prices) => [...prices, before]);
    setUndoPrice(before);
    refresh();
    // バーは数秒で消えるので、バーだけに情報を載せない（UI-SPEC §8.3 と同じ作法）
    AccessibilityInfo.announceForAccessibility(priceAppliedMessage(locale, simPrice));
  }, [record.id, record.salesPrice, refresh, setPreviousPrices, setUndoPrice, simPrice, locale]);

  const handleUndo = useCallback(() => {
    if (undoPrice == null) return;
    setSalesPrice(record.id, undoPrice);
    // 戻したのだから「前の価格」でもなくなる。灰色の点も一緒に引き上げる
    setPreviousPrices((prices) => prices.slice(0, -1));
    setUndoPrice(null);
    refresh();
  }, [record.id, refresh, setPreviousPrices, setUndoPrice, undoPrice]);

  const handleSaveTarget = useCallback(
    (targetProfit: number | null) => {
      setTargetProfit(record.id, targetProfit);
      refresh();
    },
    [record.id, refresh],
  );

  const unpriced = analysis.state === 'unpriced';

  return (
    <View style={[styles.container, { backgroundColor: colors.secondaryBackground }]}>
      <ScrollView contentContainerStyle={styles.content} scrollEnabled={!sliderDragging}>
        {/* 1. 商品名 ＋ バッジ（§9.3） */}
        <View style={styles.titleRow}>
          <Text style={[styles.itemName, { color: colors.label }]} numberOfLines={2}>
            {record.itemName === '' ? untitledLabel(locale) : record.itemName}
          </Text>
          <StatusBadge record={record} today={today} unpriced={unpriced} colors={colors} />
        </View>

        {unpriced ? (
          <UnpricedBlock
            analysis={analysis}
            record={record}
            colors={colors}
            onInputPrice={() => setShowForm(true)}
          />
        ) : (
          <>
            {/* 2. 主役の数字（§9.4 / §9.5） */}
            <View style={styles.heroBlock}>
              <Text style={[styles.heroLead, { color: colors.secondaryLabel }]}>
                {currentPriceLeadLabel(locale, analysis.currentPrice)}
              </Text>
              <View style={styles.heroRow}>
                <Text
                  style={[
                    styles.heroAmount,
                    { color: analysis.state === 'loss' ? colors.red : colors.label },
                  ]}>
                  {pricingHeroAmount(analysis.current?.netProfit ?? 0)}
                </Text>
                {analysis.state === 'loss' && (
                  <View style={[styles.lossBadge, { backgroundColor: colors.red }]}>
                    <Text style={styles.badgeText}>{lossBadgeLabel(locale)}</Text>
                  </View>
                )}
              </View>
              <Text style={[styles.heroNote, { color: colors.secondaryLabel }]}>
                {analysis.state === 'loss'
                  ? lossAmountNote(locale, analysis.current?.netProfit ?? 0)
                  : netProfitEstimateNote(locale, analysis.current?.profitRate ?? null)}
              </Text>
            </View>

            {/* 3. 結論の帯（§9.6）。色は状態が決める（CONCLUSION_TONES） */}
            {conclusion != null && (
              <ConclusionBand
                tone={CONCLUSION_TONES[conclusion]}
                text={pricingConclusionText(locale, conclusion, analysis, record.kind)}
                colors={colors}
              />
            )}

            {/* 4. 価格ライン（§9.8） */}
            <PriceLine analysis={analysis} previousPrices={previousPrices} />
          </>
        )}

        {/* 5. シミュレーター（§9.9）。価格未設定では薄く出して不活性（§9.7） */}
        <View
          style={[
            styles.simulatorCard,
            {
              backgroundColor: colors.cardBackground,
              borderColor: colors.separator,
              opacity: unpriced ? 0.5 : 1,
            },
          ]}>
          <View style={styles.simulatorHead}>
            <Text style={[styles.simulatorTitle, { color: unpriced ? colors.mutedLabel : colors.label }]}>
              {simulatorTitle(locale, analysis.state)}
            </Text>
            {!unpriced && (
              <Text style={[styles.simulatorNote, { color: colors.secondaryLabel }]}>
                {simulatorNote(locale)}
              </Text>
            )}
          </View>

          <View style={styles.simulatorValueRow}>
            <Text style={[styles.simulatorPrice, { color: unpriced ? colors.mutedLabel : colors.label }]}>
              {unpriced ? amountPlaceholder(locale) : formatYenSymbol(simPrice)}
            </Text>
            {!unpriced && (
              <View style={styles.simulatorProfit}>
                <Text
                  style={[
                    styles.simulatorProfitAmount,
                    { color: verdict.simulation.netProfit < 0 ? colors.red : colors.green },
                  ]}>
                  {pricingHeroAmount(verdict.simulation.netProfit)}
                </Text>
                <Text style={[styles.simulatorNote, { color: colors.secondaryLabel }]}>
                  {simulatorProfitNote(locale, verdict.simulation.profitRate)}
                </Text>
              </View>
            )}
          </View>

          <PriceSlider
            min={analysis.range.min}
            max={analysis.range.max}
            value={simPrice}
            onChange={setSimPrice}
            // 分岐点・目標ラインは「ちょうど」を指で出したい点なので吸い付かせる
            snapPoints={[analysis.breakEven, ...(analysis.targetPrice == null ? [] : [analysis.targetPrice])]}
            disabled={unpriced}
            accessibilityLabel={simulatorTitle(locale, analysis.state)}
            onDragStart={() => setSliderDragging(true)}
            onDragEnd={() => setSliderDragging(false)}
          />

          <View style={styles.rangeRow}>
            <Text style={[styles.rangeLabel, { color: colors.secondaryLabel }]}>
              {formatYenSymbol(analysis.range.min)}
            </Text>
            <Text style={[styles.rangeLabel, { color: colors.secondaryLabel }]}>
              {formatYenSymbol(analysis.range.max)}
            </Text>
          </View>

          {/* ミニ帯グラフ（常時表示）。区画・凡例の並びは仕入→送料→手数料→梱包→利益で固定
              （記録詳細の帯とは並びが違う）。計算は logic/recordBreakdown.miniBarItems が
              recordBreakdown をそのまま呼ぶ ── 価格だけシミュレーター値に差し替える */}
          <MiniBreakdownBar record={record} price={simPrice} />

          {unpriced ? (
            <Text style={[styles.disabledNote, { color: colors.secondaryLabel }]}>
              {simulatorDisabledNote(locale)}
            </Text>
          ) : (
            <>
              <VerdictRow
                tone={verdict.tone}
                text={simulationVerdictText(locale, verdict, analysis, record.kind)}
                colors={colors}
              />

              <Pressable
                onPress={() => setShowApply(true)}
                disabled={!canApply}
                accessibilityRole="button"
                accessibilityState={{ disabled: !canApply }}
                style={({ pressed }) => [
                  styles.applyButton,
                  {
                    backgroundColor: canApply ? colors.blue : colors.disabledBackground,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}>
                <Text
                  style={[
                    styles.applyLabel,
                    { color: canApply ? '#FFFFFF' : colors.disabledContent },
                  ]}>
                  {applyPriceButtonLabel(locale, analysis)}
                </Text>
              </Pressable>

              <Text style={[styles.applyNote, { color: colors.secondaryLabel }]}>
                {applyPriceNote(locale)}
              </Text>
            </>
          )}
        </View>

      </ScrollView>

      {/* 6. 最下段（§9.13）。**目標の有無で行数を変えない**（常に 2 行）。
          スクロールに追随させず、画面下端に固定する */}
      <View
        style={[
          styles.footerRows,
          { backgroundColor: colors.secondaryBackground, borderTopColor: colors.separator },
        ]}>
        <FooterRow
          label={costBreakdownRowLabel(locale)}
          value={formatYenSymbol(totalCost(record))}
          onPress={onOpenBreakdown}
          colors={colors}
        />
        <View style={[styles.separator, { backgroundColor: colors.separator }]} />
        <FooterRow
          label={targetProfitLabel(locale, record.kind)}
          value={targetProfitRowValue(locale, record.targetProfit)}
          muted={record.targetProfit == null}
          onPress={() => setShowTarget(true)}
          colors={colors}
        />
      </View>

      {/* 書き換えたあとの合図（§9.12）。5 秒で消え、そのとき取り消しもできなくなる */}
      {undoPrice != null && (
        <UndoBar
          message={priceAppliedMessage(locale, record.salesPrice)}
          actionLabel={priceUndoLabel(locale)}
          onAction={handleUndo}
          onHide={() => setUndoPrice(null)}
          durationMs={PRICE_UNDO_MS}
        />
      )}

      {showApply && (
        <PriceApplySheet
          visible={showApply}
          currentPrice={analysis.currentPrice}
          nextPrice={simPrice}
          currentProfit={analysis.current?.netProfit ?? 0}
          nextProfit={verdict.simulation.netProfit}
          onConfirm={handleApply}
          onClose={() => setShowApply(false)}
        />
      )}

      {showTarget && (
        <TargetProfitSheet
          visible={showTarget}
          kind={record.kind}
          targetProfit={record.targetProfit}
          costs={costs}
          currentPrice={analysis.currentPrice}
          onSave={handleSaveTarget}
          onClose={() => setShowTarget(false)}
        />
      )}

      {/* 価格を入れに行く先（§9.7）。この画面に価格の入力欄は作らない ──
          記録を直す面は記録フォーム 1 つだけにする */}
      <RecordFormSheet
        visible={showForm}
        record={record}
        onClose={() => setShowForm(false)}
        onSaved={refresh}
      />
    </View>
  );
}

type SoldContentProps = {
  record: SaleRecord;
  today: Date;
  refresh: () => void;
  colors: ThemeColors;
  showTarget: boolean;
  setShowTarget: (visible: boolean) => void;
  showForm: boolean;
  setShowForm: (visible: boolean) => void;
  onOpenBreakdown: () => void;
};

/**
 * 売却済み「どうだった？」の本体。**シミュレーターは無い**（§9 と違い、もう売れたあとの
 * 記録は動かす価格が無い）── PriceSlider・PriceApplySheet・UndoBar はどれもここでは使わない。
 * 目標利益シート（TargetProfitSheet）と記録フォーム（RecordFormSheet・日付の訂正に使う）だけ
 * 出品中側と共有する。
 */
function SoldContent({
  record,
  today,
  refresh,
  colors,
  showTarget,
  setShowTarget,
  showForm,
  setShowForm,
  onOpenBreakdown,
}: SoldContentProps) {
  // 表示語は locale を引数に取る（渡さないと React Compiler が初回の文字列で固定する。
  // src/i18n/index.ts の冒頭）。この購読で言語を変えたときに引き直される
  const locale = useLocale();

  const analysis = analyzePricing(record);
  const costs: TargetCostInput = record;
  const conclusion = soldConclusion(analysis);

  const saleDate = record.saleDate == null ? null : fromDbDate(record.saleDate);
  const saleStartDate = fromDbDate(record.saleStartDate);
  const days = saleDate == null ? null : elapsedDays({ saleStartDate, saleDate }, today);
  const elapsed = days == null ? null : soldElapsed(days);

  const perDayProfit =
    elapsed == null || analysis.current == null
      ? null
      : soldPerDayProfit(record.kind, elapsed, analysis.current.netProfit);

  const handleSaveTarget = useCallback(
    (targetProfit: number | null) => {
      setTargetProfit(record.id, targetProfit);
      refresh();
    },
    [record.id, refresh],
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.secondaryBackground }]}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* 1. 商品名 ＋ バッジ */}
        <View style={styles.titleRow}>
          <Text style={[styles.itemName, { color: colors.label }]} numberOfLines={2}>
            {record.itemName === '' ? untitledLabel(locale) : record.itemName}
          </Text>
          <View style={[styles.badge, { backgroundColor: colors.green }]}>
            <Text style={styles.badgeText}>
              {saleDate == null ? soldBadgeLabel(locale) : soldOnBadgeLabel(locale, saleDate)}
            </Text>
          </View>
        </View>

        {/* 2. 「残った利益」＋ 主役の数字（確定純利益）＋ 達成バッジ ＋ 販売価格・利益率 */}
        <View style={styles.heroBlock}>
          <Text style={[styles.heroLead, { color: colors.secondaryLabel }]}>
            {remainingProfitLeadLabel(locale)}
          </Text>
          <View style={styles.heroRow}>
            <Text
              style={[
                styles.heroAmount,
                { color: analysis.state === 'loss' ? colors.red : colors.label },
              ]}>
              {analysis.state === 'unpriced'
                ? `¥ ${amountPlaceholder(locale)}`
                : pricingHeroAmount(analysis.current?.netProfit ?? 0)}
            </Text>
            {/* 達成バッジ（§3）。目標があるときだけ、主役の数字と同じ行に置く */}
            {analysis.hasTarget && analysis.targetProfit != null && analysis.current != null && (
              <AchievementBadge
                met={conclusion === 'targetMet'}
                targetProfit={analysis.targetProfit}
                actual={analysis.current.netProfit}
                colors={colors}
              />
            )}
          </View>
          <Text style={[styles.heroNote, { color: colors.secondaryLabel }]}>
            {soldPriceRateNote(locale, analysis.currentPrice, analysis.current?.profitRate ?? null)}
          </Text>
        </View>

        {/* 3. 達成バー（目標があるときだけ）。主役の数字のすぐ下 ── 目標に対する量を面積で見せる */}
        {analysis.hasTarget && analysis.targetProfit != null && analysis.current != null && (
          <AchievementBar analysis={analysis} colors={colors} />
        )}

        {/* 4・5. 見出し ＋ 本文 ＋ 価格ライン。色は付けない ── 帯グラフ的な強調は出品中側の
            「結論の帯」だけの語彙で、売却済みは既に確定した結果を淡々と言う */}
        {conclusion != null && (
          <>
            <View style={[styles.sectionDivider, { backgroundColor: colors.separator }]} />

            <View style={styles.soldSection}>
              <Text style={[styles.soldHeadline, { color: colors.label }]}>
                {soldSectionTitle(locale, conclusion)}
              </Text>
              <Text style={[styles.soldBody, { color: colors.secondaryLabel }]}>
                {soldSectionBody(locale, conclusion, analysis)}
              </Text>
            </View>

            {analysis.state !== 'unpriced' && <PriceLine analysis={analysis} />}
          </>
        )}

        {/* 6. 経過日数 ＋ 1 日あたり利益（仕入品のみ）。価格ラインより後ろ ── 結果の主題は
            「どこまで下げられたか」で、経過日数は付随情報 */}
        {elapsed != null &&
          (elapsed.kind === 'reversed' ? (
            <View style={[styles.warningBand, { backgroundColor: colors.warningBackground }]}>
              <Text style={[styles.warningText, { color: colors.orange }]}>
                {soldDateReversedLabel(locale)}
              </Text>
              <Pressable
                onPress={() => setShowForm(true)}
                accessibilityRole="button"
                style={({ pressed }) => [styles.fixDateButton, { opacity: pressed ? 0.6 : 1 }]}>
                <Text style={[styles.fixDateLabel, { color: colors.orange }]}>
                  {fixDateLabel(locale)}
                </Text>
              </Pressable>
            </View>
          ) : (
            <ElapsedBand
              elapsed={elapsed}
              saleDate={saleDate}
              saleStartDate={saleStartDate}
              perDayProfit={perDayProfit}
              colors={colors}
            />
          ))}
      </ScrollView>

      {/* 6. 最下段（常に 2 行）。スクロールに追随させず、画面下端に固定する */}
      <View
        style={[
          styles.footerRows,
          { backgroundColor: colors.secondaryBackground, borderTopColor: colors.separator },
        ]}>
        <FooterRow
          label={costBreakdownRowLabel(locale)}
          value={formatYenSymbol(totalCost(record))}
          onPress={onOpenBreakdown}
          colors={colors}
        />
        <View style={[styles.separator, { backgroundColor: colors.separator }]} />
        <FooterRow
          label={targetProfitLabel(locale, record.kind)}
          value={targetProfitRowValue(locale, record.targetProfit)}
          muted={record.targetProfit == null}
          onPress={() => setShowTarget(true)}
          colors={colors}
        />
      </View>

      {showTarget && (
        <TargetProfitSheet
          visible={showTarget}
          kind={record.kind}
          targetProfit={record.targetProfit}
          costs={costs}
          currentPrice={analysis.currentPrice}
          onSave={handleSaveTarget}
          onClose={() => setShowTarget(false)}
        />
      )}

      {/* 日付の訂正もこのシート 1 つ（記録を直す面を増やさない） */}
      <RecordFormSheet
        visible={showForm}
        record={record}
        onClose={() => setShowForm(false)}
        onSaved={refresh}
      />
    </View>
  );
}

/** 達成バッジ（§3。目標があるときだけ）。主役の数字と同じ行に置く小さなピル */
function AchievementBadge({
  met,
  targetProfit,
  actual,
  colors,
}: {
  met: boolean;
  targetProfit: number;
  actual: number;
  colors: ThemeColors;
}) {
  // 表示語は locale を引数に取る（渡さないと React Compiler が初回の文字列で固定する。
  // src/i18n/index.ts の冒頭）。この購読で言語を変えたときに引き直される
  const locale = useLocale();

  const background = met ? colors.successBackground : colors.warningBackground;
  const foreground = met ? colors.green : colors.orange;

  return (
    <View style={[styles.achieveBadge, { backgroundColor: background }]}>
      <Text style={[styles.achieveBadgeText, { color: foreground }]}>
        {met
          ? targetAchievementBadgeLabel(locale, actual - targetProfit)
          : targetShortfallPastLabel(locale, Math.max(0, targetProfit - actual))}
      </Text>
    </View>
  );
}

/**
 * 経過日数の帯（§9.13）。**強調した帯として出す** ── もう動かせる価格が無い売却済みの
 * 画面では、いつ売れたかが読みたい結果の 1 つになるため。
 */
function ElapsedBand({
  elapsed,
  saleDate,
  saleStartDate,
  perDayProfit,
  colors,
}: {
  elapsed: Extract<SoldElapsed, { kind: 'sameDay' | 'normal' }>;
  saleDate: Date | null;
  saleStartDate: Date;
  perDayProfit: number | null;
  colors: ThemeColors;
}) {
  // 表示語は locale を引数に取る（渡さないと React Compiler が初回の文字列で固定する。
  // src/i18n/index.ts の冒頭）。この購読で言語を変えたときに引き直される
  const locale = useLocale();

  const headline =
    elapsed.kind === 'sameDay' ? soldSameDayLabel(locale) : soldElapsedDaysLabel(locale, elapsed.days);

  return (
    <View
      style={[
        styles.elapsedBand,
        { backgroundColor: colors.cardBackground, borderColor: colors.separator },
      ]}>
      <View style={styles.elapsedBandMain}>
        <Text style={[styles.elapsedBandHeadline, { color: colors.label }]}>{headline}</Text>
        {saleDate != null && (
          <Text style={[styles.elapsedBandDetail, { color: colors.secondaryLabel }]}>
            {soldDateRangeNote(locale, saleStartDate, saleDate)}
          </Text>
        )}
      </View>
      {perDayProfit != null && (
        <View style={styles.elapsedBandPerDay}>
          <Text style={[styles.elapsedBandHeadline, { color: colors.label }]}>
            {soldPerDayProfitLabel(locale, perDayProfit)}
          </Text>
          <Text style={[styles.elapsedBandDetail, { color: colors.secondaryLabel }]}>
            {soldPerDayCaption(locale)}
          </Text>
        </View>
      )}
    </View>
  );
}

/**
 * 達成バー（D。目標があるときだけ）。目標に対してどれだけ届いたかを面積で見せる ──
 * 隣の達成バッジ（数字）と役割を分ける。バーは `targetAchievementRatio` で 100% に丸め止め
 * （超過分の量はバッジが言う）。
 */
function AchievementBar({ analysis, colors }: { analysis: PricingAnalysis; colors: ThemeColors }) {
  // 表示語は locale を引数に取る（渡さないと React Compiler が初回の文字列で固定する。
  // src/i18n/index.ts の冒頭）。この購読で言語を変えたときに引き直される
  const locale = useLocale();

  const ratio = targetAchievementRatio(analysis);
  if (ratio == null || analysis.targetProfit == null || analysis.current == null) return null;

  return (
    <View style={styles.achievementBar}>
      <View style={[styles.achievementTrack, { backgroundColor: colors.successBackground }]}>
        <View
          style={[styles.achievementFill, { backgroundColor: colors.green, width: `${ratio * 100}%` }]}
        />
      </View>
      <View style={styles.achievementLabels}>
        <Text style={[styles.achievementLabel, { color: colors.secondaryLabel }]}>
          {soldTargetBarLabel(locale, analysis.targetProfit)}
        </Text>
        <Text style={[styles.achievementLabel, styles.achievementLabelActual, { color: colors.green }]}>
          {soldActualBarLabel(locale, analysis.current.netProfit)}
        </Text>
      </View>
    </View>
  );
}

/** 最下段の「費用の内訳」に出す額 ＝ 経費合計（手数料込み。SPEC §2.4） */
function totalCost(record: SaleRecord): number {
  return (
    record.purchasePrice +
    record.postage +
    record.envelopeCost +
    record.othersCost +
    record.salesPrice * (record.commission / 100)
  );
}

/** 商品名の右のバッジ（§9.3）。価格未設定はそれを先に言う（日数より先に困る） */
function StatusBadge({
  record,
  today,
  unpriced,
  colors,
}: {
  record: SaleRecord;
  today: Date;
  unpriced: boolean;
  colors: ThemeColors;
}) {
  // 表示語は locale を引数に取る（渡さないと React Compiler が初回の文字列で固定する。
  // src/i18n/index.ts の冒頭）。この購読で言語を変えたときに引き直される
  const locale = useLocale();

  if (unpriced) {
    return (
      <View style={[styles.badge, { backgroundColor: colors.disabledBackground }]}>
        <Text style={[styles.badgeText, { color: colors.secondaryLabel }]}>
          {priceUnsetBadgeLabel(locale)}
        </Text>
      </View>
    );
  }

  if (record.isSold) {
    return (
      <View style={[styles.badge, { backgroundColor: colors.green }]}>
        <Text style={styles.badgeText}>{soldBadgeLabel(locale)}</Text>
      </View>
    );
  }

  const days = elapsedDays(
    {
      saleStartDate: fromDbDate(record.saleStartDate),
      saleDate: record.saleDate == null ? null : fromDbDate(record.saleDate),
    },
    today,
  );

  return (
    <View style={[styles.badge, { backgroundColor: colors.highlightBackground }]}>
      <Text style={[styles.badgeText, { color: colors.blue }]}>{listingDayBadgeLabel(locale, days)}</Text>
    </View>
  );
}

/** 結論の帯（§9.6）。地色と文字色を対にして「別の種類の情報」として切り出す（theme の *Background） */
function ConclusionBand({
  tone,
  text,
  colors,
}: {
  tone: PricingTone;
  text: { headline: string; detail: string };
  colors: ThemeColors;
}) {
  const background =
    tone === 'bad'
      ? colors.dangerBackground
      : tone === 'warn'
        ? colors.warningBackground
        : colors.highlightBackground;
  const foreground = tone === 'bad' ? colors.red : tone === 'warn' ? colors.orange : colors.blue;

  return (
    <View style={[styles.band, { backgroundColor: background }]}>
      <Text style={[styles.bandHeadline, { color: foreground }]}>{text.headline}</Text>
      <Text style={[styles.bandDetail, { color: foreground }]}>{text.detail}</Text>
    </View>
  );
}

/** シミュレーターの判定の 1 行（§9.9）。丸のアイコンで良し悪しを色以外でも示す */
function VerdictRow({
  tone,
  text,
  colors,
}: {
  tone: PricingTone;
  text: string;
  colors: ThemeColors;
}) {
  const background =
    tone === 'bad'
      ? colors.dangerBackground
      : tone === 'warn'
        ? colors.warningBackground
        : colors.successBackground;
  const foreground = tone === 'bad' ? colors.red : tone === 'warn' ? colors.orange : colors.green;
  const icon = tone === 'good' ? 'checkmark-circle' : 'alert-circle';

  return (
    <View style={[styles.verdict, { backgroundColor: background }]}>
      <Ionicons name={icon} size={20} color={foreground} />
      <Text style={[styles.verdictText, { color: foreground }]}>{text}</Text>
    </View>
  );
}

/**
 * 価格が未設定のとき（E。§9.7）。**空の主役だけを置いて終わらせない** ──
 * 価格が無くても決まっている値（すでにかかった費用・赤字にならない価格）はあるので、
 * それを出したうえで、価格を入れに行く口を 1 つ置く。
 */
function UnpricedBlock({
  analysis,
  record,
  colors,
  onInputPrice,
}: {
  analysis: PricingAnalysis;
  record: SaleRecord;
  colors: ThemeColors;
  onInputPrice: () => void;
}) {
  // 表示語は locale を引数に取る（渡さないと React Compiler が初回の文字列で固定する。
  // src/i18n/index.ts の冒頭）。この購読で言語を変えたときに引き直される
  const locale = useLocale();

  return (
    <>
      <View style={styles.heroBlock}>
        <Text style={[styles.heroLead, { color: colors.secondaryLabel }]}>
          {priceUnsetLeadLabel(locale)}
        </Text>
        <Text style={[styles.heroAmount, { color: colors.mutedLabel }]}>
          {`¥ ${amountPlaceholder(locale)}`}
        </Text>
      </View>

      <Text style={[styles.unpricedDescription, { color: colors.label }]}>
        {priceUnsetDescription(locale)}
      </Text>

      <Pressable
        onPress={onInputPrice}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.applyButton,
          { backgroundColor: colors.blue, opacity: pressed ? 0.7 : 1 },
        ]}>
        <Text style={[styles.applyLabel, { color: '#FFFFFF' }]}>{priceInputButtonLabel(locale)}</Text>
      </Pressable>

      <Text style={[styles.sectionTitle, { color: colors.secondaryLabel }]}>
        {knownWithoutPriceTitle(locale)}
      </Text>

      <View
        style={[
          styles.knownCard,
          { backgroundColor: colors.cardBackground, borderColor: colors.separator },
        ]}>
        <View style={styles.row}>
          <Text style={[styles.rowLabel, { color: colors.label }]}>{spentCostLabel(locale)}</Text>
          <Text style={[styles.rowValue, { color: colors.label }]}>
            {formatYenSymbol(analysis.spent)}
          </Text>
        </View>
        <View style={[styles.separator, { backgroundColor: colors.separator }]} />
        <View style={styles.row}>
          <Text style={[styles.rowLabel, { color: colors.label }]}>{noLossPriceLabel(locale)}</Text>
          <Text style={[styles.rowValue, { color: colors.red }]}>
            {minPriceLabel(locale, analysis.breakEven)}
          </Text>
        </View>
        {/* 目標があるときだけ 3 行目（§9.7）。**無いときに空の行を残さない** */}
        {analysis.targetPrice != null && (
          <>
            <View style={[styles.separator, { backgroundColor: colors.separator }]} />
            <View style={styles.row}>
              <Text style={[styles.rowLabel, { color: colors.label }]}>
                {targetReachedPriceLabel(locale)}
              </Text>
              <Text style={[styles.rowValue, { color: colors.orange }]}>
                {minPriceLabel(locale, analysis.targetPrice)}
              </Text>
            </View>
          </>
        )}
      </View>

      <Text style={[styles.knownNote, { color: colors.secondaryLabel }]}>
        {knownWithoutPriceNote(locale, {
          purchasePrice: record.purchasePrice,
          postage: record.postage,
          packing: record.envelopeCost + record.othersCost,
        })}
      </Text>
    </>
  );
}

/** 最下段の 1 行（§9.13）。右端の「›」で押せることを示す */
function FooterRow({
  label,
  value,
  muted = false,
  onPress,
  colors,
}: {
  label: string;
  value: string;
  muted?: boolean;
  onPress: () => void;
  colors: ThemeColors;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.footerRow, { opacity: pressed ? 0.5 : 1 }]}>
      <Text style={[styles.rowLabel, { color: colors.label }]}>{label}</Text>
      <View style={styles.footerValue}>
        <Text style={[styles.rowValue, { color: muted ? colors.mutedLabel : colors.label }]}>
          {value}
        </Text>
        <Ionicons name="chevron-forward" size={16} color={colors.mutedLabel} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    padding: 16,
    paddingBottom: 48,
    gap: 16,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  itemName: {
    flexShrink: 1,
    fontSize: 20,
    fontWeight: '700',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  heroBlock: {
    gap: 2,
  },
  heroLead: {
    fontSize: 14,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  heroAmount: {
    fontSize: 44,
    fontWeight: '700',
  },
  lossBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  heroNote: {
    fontSize: 13,
  },
  band: {
    padding: 14,
    borderRadius: 12,
    gap: 4,
  },
  bandHeadline: {
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 23,
  },
  bandDetail: {
    fontSize: 14,
    lineHeight: 20,
  },
  simulatorCard: {
    padding: 16,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  simulatorHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  simulatorTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  simulatorNote: {
    fontSize: 12,
  },
  simulatorValueRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
  },
  simulatorPrice: {
    fontSize: 34,
    fontWeight: '700',
  },
  simulatorProfit: {
    alignItems: 'flex-end',
  },
  simulatorProfitAmount: {
    fontSize: 20,
    fontWeight: '700',
  },
  rangeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  rangeLabel: {
    fontSize: 12,
  },
  verdict: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 10,
  },
  verdictText: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  applyButton: {
    height: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyLabel: {
    fontSize: 17,
    fontWeight: '700',
  },
  applyNote: {
    fontSize: 12,
    textAlign: 'center',
  },
  disabledNote: {
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 4,
  },
  unpricedDescription: {
    fontSize: 15,
    lineHeight: 22,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 4,
    marginBottom: -8,
  },
  knownCard: {
    borderRadius: 12,
    paddingHorizontal: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  knownNote: {
    fontSize: 12,
    lineHeight: 18,
    marginTop: -8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    minHeight: 48,
  },
  rowLabel: {
    fontSize: 15,
  },
  rowValue: {
    fontSize: 16,
    fontWeight: '600',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
  },
  footerRows: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    minHeight: 52,
  },
  footerValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  achieveBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  achieveBadgeText: {
    fontSize: 13,
    fontWeight: '700',
  },
  warningBand: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: 14,
    borderRadius: 12,
  },
  warningText: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  fixDateButton: {
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  fixDateLabel: {
    fontSize: 14,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  elapsedBand: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  elapsedBandMain: {
    gap: 4,
  },
  elapsedBandHeadline: {
    fontSize: 15,
    fontWeight: '700',
  },
  elapsedBandDetail: {
    fontSize: 12,
  },
  elapsedBandPerDay: {
    alignItems: 'flex-end',
    gap: 2,
  },
  sectionDivider: {
    height: StyleSheet.hairlineWidth,
  },
  soldSection: {
    gap: 4,
  },
  soldHeadline: {
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 23,
  },
  soldBody: {
    fontSize: 14,
    lineHeight: 20,
  },
  achievementBar: {
    gap: 6,
  },
  achievementTrack: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  achievementFill: {
    height: '100%',
    borderRadius: 4,
  },
  achievementLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  achievementLabel: {
    fontSize: 12,
  },
  achievementLabelActual: {
    fontWeight: '700',
  },
});
