// 逆算の結果ぜんぶ（UI-SPEC §1.1-3b / 採用案 12c）。
// **計算タブの逆算モードと、記録フォームの目標の節で同じ 1 つを使う。**
//
// 12c のねらいは「内訳を開かないと根拠が見えない」状態をなくすこと。
// 目標 100 円・手数料 10% で 112 円になるのが分からない、という指摘への対応で、
// 閉じたままでも 結果 → 帯グラフ → 説明文 の 3 段で根拠が読めるようにし、
// 折りたたみの中には「項目ごとの金額」と「なぜ割り算なのか」だけを残す。
//
// **目標額を入れる欄はここに含めない。** 計算タブは専用の行（地色付き）、記録フォームは
// 伝票と同じ NumericField と、欄の形が画面ごとに違うため ── 共通なのは
// 「目標が決まったあとに出るもの」で、そこから下だけをこの部品が持つ。
//
// 数字はすべて calcForm.requiredPriceResult の 1 つの戻り値から取る（画面では計算しない）。
import { StyleSheet, Text, View } from 'react-native';

import { BreakdownPartList } from '@/components/BreakdownPartList';
import { CollapsibleSection } from '@/components/CollapsibleSection';
import { CostProportionBar } from '@/components/CostProportionBar';
import { ResultAmountBlock } from '@/components/ResultAmountBlock';
import { formatYen } from '@/logic/format';
import type { RequiredPriceResult } from '@/logic/calcForm';
import {
  breakdownAndMethodLabel,
  lowerPriceWarning,
  requiredPriceFormulaLines,
  requiredPriceHeadline,
  requiredPriceSummary,
} from '@/logic/labels';
import { useLocale } from '@/settings';
import { useThemeColors, type ThemeColors } from '@/theme';

type Props = {
  result: RequiredPriceResult;
  /** 「内訳と計算のしかた」の開閉。**呼び出し側が持つ**（CollapsibleSection と同じ作法） */
  expanded: boolean;
  onToggleBreakdown: () => void;
};

export function RequiredPriceBlock({ result, expanded, onToggleBreakdown }: Props) {
  // 表示語は locale を引数に取る（渡さないと React Compiler が初回の文字列で固定する。
  // src/i18n/index.ts の冒頭）。この購読で言語を変えたときに引き直される
  const locale = useLocale();

  const colors = useThemeColors();

  return (
    <View style={styles.block}>
      <ResultAmountBlock
        caption={requiredPriceHeadline(locale)}
        amount={formatYen(locale, result.requiredPrice)}
        amountColor={colors.blue}
      />

      <CostProportionBar parts={result.parts} kept={result.kept} deducted={result.deducted} />

      <Text style={[styles.summary, { color: colors.label }]}>
        {requiredPriceSummary(locale, result)}
      </Text>

      <CollapsibleSection
        label={breakdownAndMethodLabel(locale)}
        tone="link"
        align="center"
        expanded={expanded}
        onToggle={onToggleBreakdown}>
        <BreakdownPartList breakdown={result} />

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
  // 表示語は locale を引数に取る（渡さないと React Compiler が初回の文字列で固定する。
  // src/i18n/index.ts の冒頭）。この購読で言語を変えたときに引き直される
  const locale = useLocale();

  return (
    <View style={styles.formula}>
      {requiredPriceFormulaLines(locale, result.formula).map((line) => (
        <Text key={line} style={[styles.formulaLine, { color: colors.label }]}>
          {line}
        </Text>
      ))}

      {/* 1 つ下の値段では届かないことを添える。数字が成り立たないとき（0 円以下になる、
          丸めのせいで届いてしまう）だけ落ちる。回数を数えて引っ込める仕掛けは持たない */}
      {result.lowerPrice != null && (
        <Text style={[styles.lowerPriceWarning, { color: colors.red }]}>
          {lowerPriceWarning(locale, result.lowerPrice)}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: 8,
  },
  summary: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
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
});
