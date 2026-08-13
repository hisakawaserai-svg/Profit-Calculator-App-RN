// 使いかたの図（採用案 `19c` / 原寸は `20a`）。**画面写真は使わない。**
//
// 画面写真を貼ると UI を直すたびに図が古くなり、「絵と実物が違う」状態が静かに残る。
// 代わりに**逆算の帯（CostProportionBar）と同じ語彙**で描く:
//
//   オレンジ = 手数料 / グレー = 引かれるもの / 緑 = 手元に残る分
//
// この 3 色は計算タブで毎日見ているものなので、図の中で覚え直すことがない。
// グレーの中の区別（送料・経費・仕入）は明度だけで付ける（theme.helpDiagramTones）。
//
// **金額は説明用の固定値で、実際の記録とは連動しない**（案 `20a`）。
// 連動させると「自分の数字」として読まれ、0 件のときに図が壊れる。
// 計算タブの帯が赤系（expenseTones）なのに対して図がグレーなのは、その取り違えを防ぐため。
//
// **図の中の語と数字はこのファイルに置く**（labels.ts / helpContent.ts へ出さない）。
// 4 つの図は 1,500 円の 1 件を共通の題材にしていて、区画の幅・凡例・下の 2 本線の金額が
// 互いに一致していないと意味が壊れる（1,500 − 150 − 215 − 50 = 1,085）。
// 描画と離すと片方だけ直る事故が起きるので、数字と語を並びの隣に置く。
import { StyleSheet, Text, View } from 'react-native';

import { groupDigits } from '@/logic/format';
import { useThemeColors, type ThemeColors } from '@/theme';

/** 題材にする 1 件（説明用の固定値）。4 つの図で共通 */
const SALES_PRICE = 1500;
const COMMISSION = 150;
const POSTAGE = 215;
const OTHERS = 50;
const PURCHASE = 500;

/** 手数料と送料まで引いた額（販売サイトが「手取り」として出すことが多い範囲） */
const SITE_AMOUNT = SALES_PRICE - COMMISSION - POSTAGE;
/** 梱包材ほかも引いた額（このアプリの純利益） */
const APP_AMOUNT = SITE_AMOUNT - OTHERS;
/** 仕入もある場合 */
const PURCHASED_AMOUNT = APP_AMOUNT - PURCHASE;

/** 図の金額表記。**3 桁区切りを入れる**（案 `20a` の原寸が「1,500円」で描かれている） */
const yen = (value: number) => `${groupDigits(value)}円`;

const BAR_HEIGHT = 38;
const BAR_RADIUS = 6;

type ToneKey = 'commission' | 'light' | 'mid' | 'dark' | 'kept';

function toneColor(tone: ToneKey, colors: ThemeColors): string {
  switch (tone) {
    case 'commission':
      return colors.orange;
    case 'kept':
      return colors.green;
    case 'light':
      return colors.helpDiagramTones[0];
    case 'mid':
      return colors.helpDiagramTones[1];
    case 'dark':
      return colors.helpDiagramTones[2];
  }
}

type Segment = {
  key: string;
  amount: number;
  tone: ToneKey;
  /** 区画の中に載せる語。狭い区画には載せない（読めないので凡例に回す） */
  label?: string;
};

/**
 * 帯 1 本。区画の幅は金額の比でとる。
 *
 * 帯そのものは読み上げから外し、意味は図の見出し・凡例・本文が持つ ──
 * 割合は目で読むものなので、読み上げに「区画」を並べても情報にならない。
 */
function HelpBar({ segments }: { segments: Segment[] }) {
  const colors = useThemeColors();

  return (
    <View
      style={styles.bar}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      {segments.map((segment) => (
        <View
          key={segment.key}
          style={[
            styles.segment,
            { flex: segment.amount, backgroundColor: toneColor(segment.tone, colors) },
          ]}>
          {segment.label != null && (
            <Text style={styles.segmentLabel} numberOfLines={1}>
              {segment.label}
            </Text>
          )}
        </View>
      ))}
    </View>
  );
}

/** 帯の下の色見本。狭くて語を載せられない区画の名前と金額はここが引き受ける */
function HelpLegend({ items }: { items: { key: string; tone: ToneKey; text: string }[] }) {
  const colors = useThemeColors();

  return (
    <View style={styles.legend}>
      {items.map((item) => (
        <View key={item.key} style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: toneColor(item.tone, colors) }]} />
          <Text style={[styles.legendText, { color: colors.secondaryLabel }]}>{item.text}</Text>
        </View>
      ))}
    </View>
  );
}

/** 図 1 枚の器。見出し ＋（副題）＋ 図 ＋ 本文 */
function Figure({
  title,
  subtitle,
  children,
  caption,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  caption: string;
}) {
  const colors = useThemeColors();

  return (
    <View style={[styles.figure, { backgroundColor: colors.secondaryBackground }]}>
      <Text style={[styles.figureTitle, { color: colors.label }]}>{title}</Text>
      {subtitle != null && (
        <Text style={[styles.figureSubtitle, { color: colors.secondaryLabel }]}>{subtitle}</Text>
      )}
      <View style={styles.figureBody}>{children}</View>
      <Text style={[styles.caption, { color: colors.label }]}>{caption}</Text>
    </View>
  );
}

/**
 * 図 1: 不用品と仕入品のちがい（案 `20a`）。
 *
 * **同じ販売価格の帯を 2 本並べる。** 「仕入が挟まって緑が短くなる」ことだけが違いで、
 * 引き算の順番も色の意味も変わらないことが、並べた形そのものから読める。
 */
export function KindComparisonFigure() {
  const colors = useThemeColors();
  const deductions: Segment[] = [
    { key: 'commission', amount: COMMISSION, tone: 'commission' },
    { key: 'postage', amount: POSTAGE, tone: 'light' },
    { key: 'others', amount: OTHERS, tone: 'mid' },
  ];

  return (
    <Figure
      title="不用品と仕入品のちがい"
      subtitle={`どちらも販売価格 ${yen(SALES_PRICE)}で売れたとき`}
      caption="引くものが 1 つ増えるだけで、計算のしかたは同じです。仕入品を選ぶと仕入価格の欄が出ます。">
      <Text style={[styles.rowTitle, { color: colors.label }]}>不用品</Text>
      <HelpBar
        segments={[
          ...deductions,
          {
            key: 'kept',
            amount: APP_AMOUNT,
            tone: 'kept',
            label: `純利益 ${yen(APP_AMOUNT)}`,
          },
        ]}
      />
      <HelpLegend
        items={[
          { key: 'commission', tone: 'commission', text: `手数料 ${COMMISSION}` },
          { key: 'postage', tone: 'light', text: `送料 ${POSTAGE}` },
          { key: 'others', tone: 'mid', text: `経費 ${OTHERS}` },
        ]}
      />

      <Text style={[styles.rowTitle, styles.rowTitleSpaced, { color: colors.label }]}>
        {`仕入品（仕入価格 ${yen(PURCHASE)}）`}
      </Text>
      <HelpBar
        segments={[
          ...deductions,
          { key: 'purchase', amount: PURCHASE, tone: 'dark', label: `仕入 ${PURCHASE}` },
          {
            key: 'kept',
            amount: PURCHASED_AMOUNT,
            tone: 'kept',
            label: `利益 ${yen(PURCHASED_AMOUNT)}`,
          },
        ]}
      />
    </Figure>
  );
}

/**
 * 図 2: 純利益・利益・収支の使い分け（案 `20a`）。
 *
 * **1 件の 2 枚 → まとめた 1 枚**、という形にする。語の違いが「種別」ではなく
 * **「1 件か、まとめたか」**で決まることが、矢印の向きで読める
 * （SPEC-V2 §5.3: 1 件は種別語、2 件以上は中立語）。
 */
export function TermsFigure() {
  const colors = useThemeColors();

  return (
    <Figure
      title="純利益・利益・収支の使い分け"
      caption="記録タブの合計行とデータタブの数字は、すべて収支です。">
      <View style={styles.termsRow}>
        <View style={styles.termsSingles}>
          <TermBox label="不用品 1 件" value="純利益" valueColor={colors.green} />
          <TermBox label="仕入品 1 件" value="利益" valueColor={colors.green} />
        </View>
        <Text style={[styles.termsArrow, { color: colors.secondaryLabel }]}>→</Text>
        <View
          style={[
            styles.termsTotal,
            { borderColor: colors.blue, backgroundColor: colors.highlightBackground },
          ]}>
          <Text style={[styles.termsTotalCaption, { color: colors.secondaryLabel }]}>
            2 件以上をまとめた金額
          </Text>
          <Text style={[styles.termsTotalValue, { color: colors.blue }]}>収支</Text>
        </View>
      </View>
    </Figure>
  );
}

function TermBox({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor: string;
}) {
  const colors = useThemeColors();

  return (
    <View style={[styles.termBox, { borderColor: colors.separator }]}>
      <Text style={[styles.termBoxLabel, { color: colors.label }]}>{label}</Text>
      <Text style={[styles.termBoxValue, { color: valueColor }]}>{value}</Text>
    </View>
  );
}

/**
 * 図 3: 販売サイトの表示額との違い（案 `20a`）。
 *
 * **同じ 1 本の帯に、2 本の線でどこまで引いたかを示す。** 「どちらが正しいか」ではなく
 * **「どこまで引いた金額を見ているか」**の違いだと読ませるための形で、
 * 帯を 2 本並べると「別々の計算」に見えてしまう。
 */
export function SiteAmountFigure() {
  const colors = useThemeColors();

  return (
    <Figure
      title="販売サイトの表示額との違い"
      subtitle="同じ 1 件を、どこまで引いた金額で見ているか"
      caption="経費を入れているぶん、このアプリの数字のほうが少なくなります。差はそのまま、実際に出ていったお金です。">
      <HelpBar
        segments={[
          { key: 'commission', amount: COMMISSION, tone: 'commission' },
          { key: 'postage', amount: POSTAGE, tone: 'light' },
          { key: 'others', amount: OTHERS, tone: 'mid' },
          { key: 'kept', amount: APP_AMOUNT, tone: 'kept', label: '残る分' },
        ]}
      />
      <HelpLegend
        items={[
          { key: 'commission', tone: 'commission', text: `手数料 ${COMMISSION}` },
          { key: 'postage', tone: 'light', text: `送料 ${POSTAGE}` },
          { key: 'others', tone: 'mid', text: `梱包材ほか ${OTHERS}` },
        ]}
      />

      <View style={styles.measures}>
        <Measure
          color={colors.secondaryLabel}
          text={`サイトの表示 ${yen(SITE_AMOUNT)}（手数料と送料まで）`}
        />
        <Measure
          color={colors.blue}
          text={`このアプリ ${yen(APP_AMOUNT)}（梱包材ほかも引く）`}
        />
      </View>
    </Figure>
  );
}

function Measure({ color, text }: { color: string; text: string }) {
  const colors = useThemeColors();

  return (
    <View style={styles.measureRow}>
      <View style={[styles.measureLine, { backgroundColor: color }]} />
      <Text style={[styles.measureText, { color: colors.label }]}>{text}</Text>
    </View>
  );
}

/**
 * 図 4: 日付のきまり（案 `20a`）。
 *
 * 選べない側を**斜線**にするのは、色だけで「押せない」を言うと、
 * 薄いグレーが「まだ読み込んでいない」に見えるため。
 * 出品日は説明用の固定値（8/1）で、実際の記録とは連動しない。
 */
export function SaleDateRangeFigure() {
  const colors = useThemeColors();

  return (
    <Figure
      title="日付のきまり"
      caption="出品する前に売れることはないため、販売日は出品日より前にできません。前の日付にしたいときは、先に出品日を直してください。">
      <View style={styles.rangeBar}>
        <View style={[styles.rangeBlocked, { backgroundColor: colors.disabledBackground }]}>
          <Hatching color={colors.separator} />
          <Text style={[styles.rangeBlockedText, { color: colors.secondaryLabel }]}>
            選べません
          </Text>
        </View>
        <View style={[styles.rangeAllowed, { backgroundColor: colors.highlightBackground }]}>
          <Text style={[styles.rangeAllowedText, { color: colors.blue }]}>販売日に選べる範囲</Text>
        </View>
      </View>
      <View style={styles.rangeCaptions}>
        <Text style={[styles.rangeCaption, { color: colors.secondaryLabel }]}>← 出品より前</Text>
        <Text style={[styles.rangeCaption, { color: colors.secondaryLabel }]}>
          出品日 8/1 から今日まで →
        </Text>
      </View>
    </Figure>
  );
}

/**
 * 斜線。RN には繰り返しパターンが無いので、細い View を回して等間隔に並べ、
 * 親の `overflow: 'hidden'` で切る。SVG を持ち込むほどの絵ではない。
 */
function Hatching({ color }: { color: string }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {Array.from({ length: 10 }, (_, index) => (
        <View
          key={index}
          style={[styles.hatchLine, { backgroundColor: color, left: index * 14 - 20 }]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  figure: {
    borderRadius: 14,
    padding: 20,
    gap: 6,
  },
  figureTitle: {
    fontSize: 19,
    fontWeight: '700',
  },
  figureSubtitle: {
    fontSize: 14,
  },
  figureBody: {
    paddingTop: 10,
    gap: 8,
  },
  caption: {
    fontSize: 15,
    lineHeight: 23,
    paddingTop: 8,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  rowTitleSpaced: {
    paddingTop: 10,
  },
  bar: {
    flexDirection: 'row',
    height: BAR_HEIGHT,
    borderRadius: BAR_RADIUS,
    overflow: 'hidden',
  },
  segment: {
    alignItems: 'center',
    justifyContent: 'center',
    // 狭い区画で文字が押し出されないよう、区画側は縮まない
    paddingHorizontal: 2,
  },
  segmentLabel: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendDot: {
    width: 9,
    height: 9,
    borderRadius: 2,
  },
  legendText: {
    fontSize: 13,
  },
  termsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  termsSingles: {
    flex: 1,
    gap: 10,
  },
  termsArrow: {
    fontSize: 18,
  },
  termBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  termBoxLabel: {
    fontSize: 15,
  },
  termBoxValue: {
    fontSize: 15,
    fontWeight: '700',
  },
  termsTotal: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 16,
  },
  termsTotalCaption: {
    fontSize: 12,
    textAlign: 'center',
  },
  termsTotalValue: {
    fontSize: 20,
    fontWeight: '700',
  },
  measures: {
    paddingTop: 6,
    gap: 8,
  },
  measureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  measureLine: {
    width: 56,
    height: 2,
    borderRadius: 1,
  },
  measureText: {
    flex: 1,
    fontSize: 14,
  },
  rangeBar: {
    flexDirection: 'row',
    height: BAR_HEIGHT,
    borderRadius: BAR_RADIUS,
    overflow: 'hidden',
  },
  rangeBlocked: {
    flex: 4,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  rangeBlockedText: {
    fontSize: 13,
    fontWeight: '600',
  },
  rangeAllowed: {
    flex: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rangeAllowedText: {
    fontSize: 13,
    fontWeight: '700',
  },
  hatchLine: {
    position: 'absolute',
    top: -20,
    width: 1,
    height: 80,
    transform: [{ rotate: '-45deg' }],
  },
  rangeCaptions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  rangeCaption: {
    fontSize: 12,
  },
});
