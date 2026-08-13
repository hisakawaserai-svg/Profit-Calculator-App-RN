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
import Svg, { Polyline } from 'react-native-svg';

import { TagChip } from '@/components/TagChip';
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

/**
 * 図 1 枚の器。**見出しと本文は持たない** ── アコーディオンの見出しが題を、
 * 開いた中の地の文が説明を担うので、図の中に重ねると同じ語が 2 回出る。
 * ここが持つのは、絵と（要るときだけ）その場の副題まで。
 */
function FigureFrame({
  subtitle,
  children,
}: {
  subtitle?: string;
  children: React.ReactNode;
}) {
  const colors = useThemeColors();

  return (
    <View style={[styles.figure, { backgroundColor: colors.secondaryBackground }]}>
      {subtitle != null && (
        <Text style={[styles.figureSubtitle, { color: colors.secondaryLabel }]}>{subtitle}</Text>
      )}
      <View style={styles.figureBody}>{children}</View>
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
    <FigureFrame subtitle={`どちらも販売価格 ${yen(SALES_PRICE)}で売れたとき`}>
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
    </FigureFrame>
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
    <FigureFrame>
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
    </FigureFrame>
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
    <FigureFrame subtitle="同じ 1 件を、どこまで引いた金額で見ているか">
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
    </FigureFrame>
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
    <FigureFrame>
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
    </FigureFrame>
  );
}

/**
 * 図 5: 逆算の出し方（計算ページ）。
 *
 * **図 1 の不用品と同じ帯をそのまま使う。** 逆算は別の計算ではなく、
 * **同じ 1 本の帯をどちら側から見るか**の違いでしかない ── 全体（販売価格）を知って
 * 緑を求めるのが「純利益を出す」、緑（ほしい利益）を知って全体を求めるのが「目標から逆算」。
 * 別の絵にすると「2 つの計算がある」と読まれる。
 */
export function ReversePriceFigure() {
  const colors = useThemeColors();

  return (
    <FigureFrame subtitle="ほしい利益が先に決まっているとき">
      <Text style={[styles.rowTitle, { color: colors.label }]}>ほしい利益から逆に足す</Text>
      <HelpBar
        segments={[
          { key: 'commission', amount: COMMISSION, tone: 'commission' },
          { key: 'postage', amount: POSTAGE, tone: 'light' },
          { key: 'others', amount: OTHERS, tone: 'mid' },
          {
            key: 'kept',
            amount: APP_AMOUNT,
            tone: 'kept',
            label: `ほしい利益 ${yen(APP_AMOUNT)}`,
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
      {/* 帯の全体が販売価格であることを、幅いっぱいの線で名指しする */}
      <View style={styles.totalMeasure}>
        <View style={[styles.totalLine, { backgroundColor: colors.blue }]} />
        <Text style={[styles.totalText, { color: colors.label }]}>
          {`これが販売価格 ${yen(SALES_PRICE)}`}
        </Text>
      </View>
    </FigureFrame>
  );
}

/**
 * 図 6: タグを 2 つ選んだとき（記録ページ）。
 *
 * **OR であることは文だけでは伝わらない。** 「どちらか」と書いても、
 * 「両方付いていないと出ない」と読む人がいる。**出る / 出ない**を 1 行ずつ並べて、
 * 両方付いた記録も出ることを列として見せる。
 *
 * チップは実物（`TagChip`）を使う ── 図の中だけの見た目を作ると、
 * 画面で探すときに手がかりにならない。
 */
export function TagFilterOrFigure() {
  const colors = useThemeColors();
  const rows: { key: string; tags: { name: string; colorKey: string }[]; hit: boolean }[] = [
    { key: 'a', tags: [{ name: '洋服', colorKey: 'red' }], hit: true },
    { key: 'b', tags: [{ name: '食器', colorKey: 'blue' }], hit: true },
    {
      key: 'ab',
      tags: [
        { name: '洋服', colorKey: 'red' },
        { name: '食器', colorKey: 'blue' },
      ],
      hit: true,
    },
    { key: 'none', tags: [{ name: '本', colorKey: 'green' }], hit: false },
  ];

  return (
    <FigureFrame subtitle="「洋服」と「食器」を選ぶと">
      {rows.map((row) => (
        <View key={row.key} style={[styles.orRow, { borderColor: colors.separator }]}>
          <View style={styles.orTags}>
            {row.tags.map((tag) => (
              <TagChip key={tag.name} tag={tag} />
            ))}
          </View>
          <Text
            style={[styles.orMark, { color: row.hit ? colors.green : colors.disabledContent }]}>
            {row.hit ? '出る' : '出ない'}
          </Text>
        </View>
      ))}
    </FigureFrame>
  );
}

/** 図 7 の棒（説明用の固定値）。日ごとの収支 */
const CHART_DAYS = [450, 0, 1085, 320, 0, 780];

/**
 * 図 7: グラフの読みかた（データページ）。
 *
 * **棒と線が別のものを指していることが、文では伝わりにくい。**
 * 棒は「その日だけ」、線は「その日までの合計」で、線が下がらないのはそのため。
 * 線の色はデータタブの実物と同じ indigo にする（図で覚えた色がそのまま使える）。
 */
export function ChartReadingFigure() {
  const colors = useThemeColors();
  const max = Math.max(...CHART_DAYS);
  // 累計は棒を左から足したもの。折れ線の頂点はその高さに置く
  const cumulative = CHART_DAYS.reduce<number[]>(
    (acc, value) => [...acc, (acc[acc.length - 1] ?? 0) + value],
    [],
  );
  const total = cumulative[cumulative.length - 1];
  const points = cumulative
    .map((value, index) => {
      const x = ((index + 0.5) / CHART_DAYS.length) * 100;
      const y = 100 - (value / total) * 100;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <FigureFrame>
      <View style={styles.chart}>
        {/* 折れ線は棒の上に重ねる。棒と同じ枠を使うので、頂点の位置が棒とずれない */}
        <Svg style={StyleSheet.absoluteFill} viewBox="0 0 100 100" preserveAspectRatio="none">
          <Polyline
            points={points}
            fill="none"
            stroke={colors.indigo}
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
          />
        </Svg>
        <View style={styles.chartBars}>
          {CHART_DAYS.map((value, index) => (
            <View key={index} style={styles.chartSlot}>
              <View
                style={[
                  styles.chartBar,
                  { height: `${(value / max) * 100}%`, backgroundColor: colors.green },
                ]}
              />
            </View>
          ))}
        </View>
      </View>
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.green }]} />
          <Text style={[styles.legendText, { color: colors.secondaryLabel }]}>日ごとの収支</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendLine, { backgroundColor: colors.indigo }]} />
          <Text style={[styles.legendText, { color: colors.secondaryLabel }]}>累計の収支</Text>
        </View>
      </View>
    </FigureFrame>
  );
}

/** 図 8 の比較（実際の列数。SPEC-V3 §5.3） */
const CSV_ROWS: { key: string; label: string; backup: boolean; tax: boolean }[] = [
  { key: 'basic', label: '日付・商品名・金額', backup: true, tax: true },
  { key: 'site', label: '販売サイト・種別', backup: true, tax: true },
  { key: 'breakdown', label: '経費の内わけ', backup: true, tax: true },
  { key: 'memo', label: 'メモ', backup: true, tax: false },
  { key: 'tag', label: 'タグ', backup: true, tax: false },
];

/**
 * 図 8: 書き出しの 2 種類（データページ）。
 *
 * **「18 列 / 11 列」という数字だけでは、何が減るのかが分からない。**
 * 減るのはメモとタグで、金額の列は減らないことを行ごとに見せる ──
 * 「確定申告用は情報が足りない版」ではなく「帳簿に関係のない記述を持ち込まない版」だと読める。
 */
export function CsvKindsFigure() {
  const colors = useThemeColors();

  return (
    <FigureFrame subtitle="減るのはメモとタグだけ">
      <View style={styles.csvHead}>
        <View style={styles.csvLabelCol} />
        <Text style={[styles.csvKind, { color: colors.label }]}>データ保存用{'\n'}18 列</Text>
        <Text style={[styles.csvKind, { color: colors.label }]}>確定申告用{'\n'}11 列</Text>
      </View>
      {CSV_ROWS.map((row) => (
        <View key={row.key} style={[styles.csvRow, { borderTopColor: colors.separator }]}>
          <Text style={[styles.csvLabel, styles.csvLabelCol, { color: colors.label }]}>
            {row.label}
          </Text>
          <Text style={[styles.csvMark, { color: row.backup ? colors.green : colors.disabledContent }]}>
            {row.backup ? '入る' : '－'}
          </Text>
          <Text style={[styles.csvMark, { color: row.tax ? colors.green : colors.disabledContent }]}>
            {row.tax ? '入る' : '入らない'}
          </Text>
        </View>
      ))}
    </FigureFrame>
  );
}

/** 図 9 の 5 項目。色は帯の語彙のまま（オレンジは手数料だけ・他はグレー） */
const EXPENSE_ITEMS: { key: string; tone: ToneKey; name: string; note: string }[] = [
  { key: 'purchase', tone: 'dark', name: '仕入価格', note: '売るために買ったお金（不用品では出ません）' },
  { key: 'postage', tone: 'light', name: '送料', note: '発送にかかったお金' },
  { key: 'commission', tone: 'commission', name: '販売手数料', note: '販売サイトに引かれるお金' },
  { key: 'envelope', tone: 'mid', name: '梱包材', note: '箱・封筒・テープなど' },
  { key: 'others', tone: 'mid', name: 'その他', note: '交通費など、上に当てはまらないもの' },
];

/**
 * 図 9: 経費にふくまれるもの（ことばページ）。
 *
 * **帯にしない。** 同じページに帯が既に 2 つあり、3 つ目を出すと
 * 「また同じ絵」に見えて読み飛ばされる。ここで要るのは割合ではなく**顔ぶれ**なので、
 * 5 つを 1 行ずつ並べて、それぞれが何を指すかを添える。
 * 色は帯の語彙のまま置く（オレンジは手数料だけ・他はグレー）ので、帯と突き合わせて読める。
 */
export function ExpenseItemsFigure() {
  const colors = useThemeColors();

  return (
    <FigureFrame subtitle="このアプリが販売価格から引くのは、この 5 つ">
      {EXPENSE_ITEMS.map((item) => (
        <View key={item.key} style={styles.expenseRow}>
          <View style={[styles.expenseDot, { backgroundColor: toneColor(item.tone, colors) }]} />
          <View style={styles.expenseText}>
            <Text style={[styles.expenseName, { color: colors.label }]}>{item.name}</Text>
            <Text style={[styles.expenseNote, { color: colors.secondaryLabel }]}>{item.note}</Text>
          </View>
        </View>
      ))}
    </FigureFrame>
  );
}

/**
 * 図 10: まとめ買いの 1 個あたり（記録ページ）。
 *
 * **割り算そのものを見せる。** 「入数と購入価格を入れると 1 個あたりが計算されます」は、
 * 何がどこに入るのかが文だけでは掴みにくい ── 3 つの箱と ÷ と = で並べれば、
 * 打つのは左の 2 つで、右は自動で出るものだと読める。
 */
export function PackBuyFigure() {
  const colors = useThemeColors();

  return (
    <FigureFrame subtitle="100 枚で 800 円の封筒を登録すると">
      <View style={styles.formulaRow}>
        <FormulaBox label="購入価格" value="800" colors={colors} />
        <Text style={[styles.formulaOp, { color: colors.secondaryLabel }]}>÷</Text>
        <FormulaBox label="入数" value="100" colors={colors} />
        <Text style={[styles.formulaOp, { color: colors.secondaryLabel }]}>=</Text>
        <FormulaBox label="1 個あたり" value="8" colors={colors} highlight />
      </View>
    </FigureFrame>
  );
}

function FormulaBox({
  label,
  value,
  colors,
  highlight = false,
}: {
  label: string;
  value: string;
  colors: ThemeColors;
  highlight?: boolean;
}) {
  return (
    <View
      style={[
        styles.formulaBox,
        {
          borderColor: highlight ? colors.blue : colors.separator,
          backgroundColor: highlight ? colors.highlightBackground : 'transparent',
        },
      ]}>
      <Text style={[styles.formulaValue, { color: highlight ? colors.blue : colors.label }]}>
        {value}
      </Text>
      <Text style={[styles.formulaLabel, { color: colors.secondaryLabel }]}>{label}</Text>
    </View>
  );
}

/**
 * 図 11: 日ごとにまとめる（データページ）。
 *
 * **何が残って何が消えるかを、行の形で見せる。** 「まとめられるのは金額だけ」は
 * 文だと読み飛ばされるが、まとめた後の行から商品名が消えているのを見れば分かる。
 */
export function GroupingFigure() {
  const colors = useThemeColors();
  const before = [
    { key: 'a', name: 'クッション', amount: 450 },
    { key: 'b', name: 'マグカップ', amount: 320 },
    { key: 'c', name: '絵本', amount: 180 },
  ];

  return (
    <FigureFrame subtitle="同じ日に 3 件売れたとき">
      <Text style={[styles.rowTitle, { color: colors.label }]}>1 件ずつ</Text>
      {before.map((row) => (
        <View key={row.key} style={[styles.groupRow, { borderColor: colors.separator }]}>
          <Text style={[styles.groupDate, { color: colors.secondaryLabel }]}>8/12</Text>
          <Text style={[styles.groupName, { color: colors.label }]}>{row.name}</Text>
          <Text style={[styles.groupAmount, { color: colors.label }]}>{row.amount}</Text>
        </View>
      ))}

      <Text style={[styles.rowTitle, styles.rowTitleSpaced, { color: colors.label }]}>
        日ごとにまとめる
      </Text>
      <View style={[styles.groupRow, { borderColor: colors.blue }]}>
        <Text style={[styles.groupDate, { color: colors.secondaryLabel }]}>8/12</Text>
        <Text style={[styles.groupName, { color: colors.mutedLabel }]}>（商品名は入りません）</Text>
        <Text style={[styles.groupAmount, { color: colors.blue }]}>950</Text>
      </View>
    </FigureFrame>
  );
}

/**
 * 図 12: 1 円のずれ（データページ）。
 *
 * **順番が違うだけだと見せる。** どちらかが間違っているのではなく、
 * 「丸めてから足す」と「足してから丸める」の差でしかないことは、
 * 2 本の道を並べたときにいちばん短く伝わる。
 */
export function RoundingFigure() {
  const colors = useThemeColors();

  return (
    <FigureFrame subtitle="10.4 円と 10.4 円の 2 件なら">
      <View style={[styles.roundRow, { borderColor: colors.separator }]}>
        <Text style={[styles.roundWho, { color: colors.label }]}>ファイル</Text>
        <Text style={[styles.roundHow, { color: colors.secondaryLabel }]}>
          10 ＋ 10（先に丸める）
        </Text>
        <Text style={[styles.roundValue, { color: colors.label }]}>20</Text>
      </View>
      <View style={[styles.roundRow, { borderColor: colors.separator }]}>
        <Text style={[styles.roundWho, { color: colors.label }]}>画面</Text>
        <Text style={[styles.roundHow, { color: colors.secondaryLabel }]}>
          20.8（後で丸める）
        </Text>
        <Text style={[styles.roundValue, { color: colors.label }]}>21</Text>
      </View>
    </FigureFrame>
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
  totalMeasure: {
    paddingTop: 8,
    gap: 5,
  },
  totalLine: {
    height: 2,
    borderRadius: 1,
  },
  totalText: {
    fontSize: 14,
    fontWeight: '600',
  },
  orRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingLeft: 6,
    paddingRight: 14,
    paddingVertical: 8,
  },
  orTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 4,
    flexShrink: 1,
  },
  orMark: {
    fontSize: 14,
    fontWeight: '700',
  },
  chart: {
    height: 110,
    justifyContent: 'flex-end',
  },
  chartBars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: '100%',
  },
  chartSlot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    height: '100%',
  },
  chartBar: {
    width: 14,
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
  },
  legendLine: {
    width: 14,
    height: 2,
    borderRadius: 1,
  },
  csvHead: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingBottom: 6,
  },
  csvLabelCol: {
    flex: 1.4,
  },
  csvKind: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  csvRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: 9,
  },
  csvLabel: {
    fontSize: 14,
  },
  csvMark: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  expenseRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 5,
  },
  expenseDot: {
    width: 10,
    height: 10,
    borderRadius: 2,
    marginTop: 5,
  },
  expenseText: {
    flex: 1,
    gap: 1,
  },
  expenseName: {
    fontSize: 15,
    fontWeight: '600',
  },
  expenseNote: {
    fontSize: 13,
    lineHeight: 19,
  },
  formulaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  formulaOp: {
    fontSize: 16,
  },
  formulaBox: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  formulaValue: {
    fontSize: 18,
    fontWeight: '700',
  },
  formulaLabel: {
    fontSize: 11,
    textAlign: 'center',
  },
  groupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  groupDate: {
    fontSize: 13,
  },
  groupName: {
    flex: 1,
    fontSize: 14,
  },
  groupAmount: {
    fontSize: 15,
    fontWeight: '600',
  },
  roundRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  roundWho: {
    fontSize: 14,
    fontWeight: '600',
    width: 72,
  },
  roundHow: {
    flex: 1,
    fontSize: 13,
  },
  roundValue: {
    fontSize: 16,
    fontWeight: '700',
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
