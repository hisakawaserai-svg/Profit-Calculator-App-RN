// レコード詳細のレシートの先頭に置く積み上げ帯グラフ。
//
// レシート（RecordDetailSections.ReceiptCard）は縦に引き算していく流れ、こちらは
// 同じ 1 件を横の割合で見せる。**同じカードの中に上下に並べる。**
//
// **凡例は持たない。** 独立した凡例（色ドット・項目名・割合の一覧）を置くと、
// 同じ項目名がレシートと 2 列に分かれて並び、どちらを読む列なのかが決まらなかった。
// 色と項目名の対応は**レシートの各行に付けた同じ色のドット**が引き受ける
// （RecordDetailSections の ReceiptCard）ので、ここは帯だけを描く。
//
// 配色は計算タブの逆算（UI-SPEC §1.1-3b）の帯と同じものを使う。色の対応づけは
// CostProportionBar.partColor をそのまま呼ぶ ── 同じ意味（緑＝手元に残る / オレンジ＝販売手数料 /
// 赤系＝経費）に別の色を割り当てると、画面をまたいだ瞬間に色の語彙を覚え直すことになる。
// 新しい色はここでは定義しない。
//
// 数字は logic/recordBreakdown.ts が作る（ここでは計算しない）。
//
// **結論行（O3 案）もこのカードの中で描く。** 出品中だけ、帯の直下に
// 「いくらまで動かせるか」の 1 行 ＋ pricing 画面への導線を足す（SPEC-V9 未反映）。
// 売却済みではこの行を出さず、元の帯グラフ＋レシートに戻る ── 売れたあとは
// 動かせる価格という概念自体が無い。判定・数字は logic/pricing.ts（analyzePricing）が持ち、
// ここでは並べるだけ。
//
// **価格未設定の出品中でも入口だけは出す。** pricing 画面には価格が無くても見られる
// 状態（G）があるので、行き先はあるのに記録詳細に入口が無いと到達不能になる。
// ただし結論文は出せない（赤字/目標達成の判定には価格が必要）ので、専用の誘導文言に
// 差し替える（RecordDetailConclusion の 'unpriced'）。
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { partColor } from '@/components/CostProportionBar';
import type { SaleRecord } from '@/db/schema';
import {
  BREAKDOWN_BAR_UNPRICED_NOTE,
  SHORTFALL_SEGMENT_LABEL,
  percentLabel,
  recordDetailConclusionDetail,
  recordDetailConclusionHeadline,
  shortfallAmountLabel,
  soldRecordDetailConclusionDetail,
  soldRecordDetailConclusionHeadline,
} from '@/logic/labels';
import {
  analyzePricing,
  recordDetailConclusion,
  soldConclusion,
  type PricingAnalysis,
  type RecordDetailConclusion,
  type SoldConclusion,
} from '@/logic/pricing';
import {
  leaderLines,
  recordBreakdown,
  showsBarLabel,
  showsPricedAmounts,
  showsShortfallAmount,
  type DeficitBreakdown,
  type RecordBarPart,
  type SurplusBreakdown,
} from '@/logic/recordBreakdown';
import { useThemeColors, type ThemeColors } from '@/theme';

/**
 * 区画の中に置く文字の色。
 *
 * 経費の赤系は明度で振ってあるので、薄い側（梱包材・その他）に白を乗せると読めない。
 * **色は増やさず、乗せる文字の白黒だけを区画ごとに選ぶ**（theme.presetTones が
 * バッジごとに前景色を持っているのと同じ考え方）。薄い赤は明色・暗色のどちらでも
 * 明るいままなので、黒は両方のテーマで読める。
 */
function barLabelColor(part: RecordBarPart): string {
  return part.key === 'envelopeCost' || part.key === 'othersCost' ? '#000000' : '#FFFFFF';
}

/**
 * レコード 1 件の帯グラフ。**黒字も赤字も内訳の積み上げ 1 本で、右端の区画だけが違う。**
 *
 * 黒字で緑の「手元に残る」が伸びる位置に、赤字では斜線の「足りない」が入る ──
 * 帯の本数も費用側の色・並びも変わらないので、記録をまたいでも視線の動きが変わらない。
 * 出し分けを component ごと分けてあるのは、右端の区画の作り方（幅の分母・中の文字・模様）が
 * 違うだけで、どちらも同じ Bar が積み上げ本体と引き出し線を描く。
 */
export function RecordBreakdownBar({ record }: { record: SaleRecord }) {
  const colors = useThemeColors();

  // 販売価格が未設定（0 円）だと、費用だけを分母にした割合や「足りない」が
  // 確定した赤字のように見えてしまう（まだ価格を入れていないだけ）。帯は出さず、
  // 不活性な文に差し替える ──「いくらで売る?」画面の未設定時（E）と同じ考え方
  //
  // それでも pricing 画面には価格未設定でも見られる状態（G）があるので、入口だけは出す。
  // 結論文は出せない（赤字/目標達成の判定には価格が必要）ので、専用の誘導文言にする ──
  // これが無いと G は記録詳細から実際には到達不能になっていた
  if (!showsPricedAmounts(record)) {
    const analysis = analyzePricing(record);
    const conclusion = recordDetailConclusion(analysis);
    return (
      <View>
        <UnpricedBar colors={colors} />
        {!record.isSold && (
          <PricingEntryRow
            record={record}
            analysis={analysis}
            isSold={false}
            conclusion={conclusion}
            colors={colors}
          />
        )}
      </View>
    );
  }

  const breakdown = recordBreakdown(record);

  // 結論行は出品中・売却済みのどちらでも出す（pricing 画面への入口。§9）。
  // record は PricingInput の形をそのまま満たすので analyzePricing にそのまま渡せる。
  // 出品中は「これから動かせる価格」（recordDetailConclusion）、売却済みは
  // 「どう終わったか」（soldConclusion）で、見る先の状態（PricingContent / SoldContent）に揃える
  const analysis = analyzePricing(record);
  const conclusion = record.isSold ? soldConclusion(analysis) : recordDetailConclusion(analysis);

  // カード（面）は持たない。レシートと同じカードの中に入り、間はレシート側の余白だけ ──
  // 帯と、その下の行に付いたドットの色を目で結べる距離に保つ
  return (
    <View>
      {breakdown.deficit ? (
        <DeficitBar breakdown={breakdown} colors={colors} />
      ) : (
        <SurplusBar breakdown={breakdown} colors={colors} />
      )}

      {conclusion != null && (
        <PricingEntryRow
          record={record}
          analysis={analysis}
          isSold={record.isSold}
          conclusion={conclusion}
          colors={colors}
        />
      )}
    </View>
  );
}

/**
 * 販売価格が未設定のときの帯（§価格未設定）。区画を持たない灰色のバーだけを描き、
 * その下に不活性文を添える。割合も金額も出さない ── 出せる数字が無い状態そのものを示す。
 */
function UnpricedBar({ colors }: { colors: ThemeColors }) {
  return (
    <View>
      <View
        style={[styles.bar, styles.unpricedBar, { backgroundColor: colors.disabledBackground }]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
      <Text style={[styles.unpricedNote, { color: colors.mutedLabel }]}>
        {BREAKDOWN_BAR_UNPRICED_NOTE}
      </Text>
    </View>
  );
}

/**
 * 帯の直下の結論行（O3 案）。太字・青の結論 ＋ 小さいグレーの補足（末尾に ›）で、
 * 行全体を押すと pricing 画面（`/records/record/[id]/pricing`）へ push する。
 *
 * 薄い青（`colors.highlightBackground`）の角丸の面に乗せる ── レシートの他の行と
 * 同じ地の色に置くと、結論行だけが持つ「押せる・pricing 画面への入口」という役割が
 * 埋もれてしまうため。
 *
 * **帯の区画から引く括弧は廃止した**（2026-08-14）。括弧は特定の区画（帯の一部）だけを
 * 指すのに対し、この面は帯の全幅に広がる箱で、対応関係よりノイズのほうが目立っていた。
 * この面自体が「押せる結論」として十分目立つので、区画との対応づけは無くても迷わず読める。
 */
function PricingEntryRow({
  record,
  analysis,
  isSold,
  conclusion,
  colors,
}: {
  record: SaleRecord;
  analysis: PricingAnalysis;
  isSold: boolean;
  conclusion: RecordDetailConclusion | SoldConclusion;
  colors: ThemeColors;
}) {
  const router = useRouter();
  const headline = isSold
    ? soldRecordDetailConclusionHeadline(conclusion as SoldConclusion, analysis)
    : recordDetailConclusionHeadline(conclusion as RecordDetailConclusion, analysis, record.kind);
  const detail = isSold
    ? soldRecordDetailConclusionDetail(conclusion as SoldConclusion)
    : recordDetailConclusionDetail(conclusion as RecordDetailConclusion);

  const handlePress = () => {
    router.push({ pathname: '/records/record/[id]/pricing', params: { id: record.id } });
  };

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.pricingEntryWrap,
        styles.pricingEntryRow,
        { backgroundColor: colors.highlightBackground, opacity: pressed ? 0.6 : 1 },
      ]}>
      <View style={styles.pricingEntryText}>
        <Text style={[styles.pricingEntryHeadline, { color: colors.blue }]} numberOfLines={2}>
          {headline}
        </Text>
        <Text
          style={[styles.pricingEntryDetail, { color: colors.secondaryLabel }]}
          numberOfLines={1}>
          {detail}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.secondaryLabel} />
    </Pressable>
  );
}

/** 黒字の 1 本。全長 ＝ 販売価格で、利益（緑）まで含めて内訳がそのまま収まる */
function SurplusBar({ breakdown, colors }: { breakdown: SurplusBreakdown; colors: ThemeColors }) {
  const segments: BarSegment[] = breakdown.parts
    .filter((part) => part.inBar)
    .map((part) => ({
      key: part.key,
      amount: part.amount,
      backgroundColor: partColor(part.key, colors),
      content: showsBarLabel(part) ? <CostSegmentLabel part={part} /> : null,
    }));

  const leaders: BarLeader[] = leaderLines(breakdown.parts).map((leader) => ({
    key: leader.key,
    tier: leader.tier,
    text: percentLabel(leader.ratio),
    color: partColor(leader.key, colors),
  }));

  return <Bar segments={segments} leaders={leaders} colors={colors} />;
}

/**
 * 赤字の 1 本。**黒字と同じ費用の積み上げ ＋ 右端に斜線の「足りない」区画。**
 *
 *     ██仕入██│送料│手数料│▨▨足りない -¥550▨▨
 *
 * 費用側（仕入・送料・手数料・梱包）は黒字の帯とまったく同じ色・並びで積み上げる。
 * 黒字で緑の「手元に残る」が入る位置に、ここでは shortfall（logic の DeficitBreakdown）の
 * 幅ぶんだけ斜線の区画が入る ── 全長の分母も「費用 ＋ 不足額」に変わる（販売価格ではない）。
 *
 * **1 項目が全体の 9 割を超えたら費用側を 1 色にまとめる**（collapsedCosts）。
 * 残りの費用が合わせて 1 割未満に潰れると、区画も引き出し線も互いに重なって読めなくなる
 * ── 正確な内訳はすぐ下のレシートの行に任せて、帯は「費用が大半」とだけ言う。
 * まとめた区画の右端はギザギザにして、内訳を打ち切ったことを形でも示す（TornEdge）。
 *
 * **「売った / かかった」の 2 本立てと、それを改めた単色 1 本はどちらも廃止した**
 * （2026-08-14）。2 本立ては桁違いの記録で片方の塗りが 1% 未満になり空の器に見えた。
 * 単色 1 本はそれを避けたが、今度は赤字の記録だけ内訳が読めなくなった。
 */
function DeficitBar({ breakdown, colors }: { breakdown: DeficitBreakdown; colors: ThemeColors }) {
  const costParts = breakdown.parts.filter((part) => part.inBar);
  const costTotal = breakdown.total - breakdown.shortfall;

  const shortfallSegment: BarSegment = {
    key: 'shortfall',
    amount: breakdown.shortfall,
    backgroundColor: colors.red,
    hatched: true,
    // 語（「足りない」）は色以外の手がかり（§0.1「色は識別の補助」）── 模様だけで
    // 「足りていない」と伝えない。額は spec の下限（showsShortfallAmount）を満たすときだけ、
    // 語に続けて必ず添える（「足りない」だけで額を出さないと、いくら足りないのかが分からない）
    content: showsShortfallAmount(breakdown) ? (
      <View style={styles.segmentLabelRow}>
        <Text style={[styles.segmentLabel, styles.shortfallSegmentText]} numberOfLines={1}>
          {SHORTFALL_SEGMENT_LABEL}
        </Text>
        <Text style={[styles.segmentLabel, styles.shortfallSegmentText]} numberOfLines={1}>
          {shortfallAmountLabel(breakdown.shortfall)}
        </Text>
      </View>
    ) : null,
  };

  const costSegments: BarSegment[] = breakdown.collapsedCosts
    ? [
        {
          key: 'costs',
          amount: costTotal,
          // まとめた区画は項目ごとの色を持たない。仕入の色（expenseTones の先頭）で代表させる
          backgroundColor: colors.expenseTones[0],
          content: null,
          torn: true,
        },
      ]
    : costParts.map((part) => ({
        key: part.key,
        amount: part.amount,
        backgroundColor: partColor(part.key, colors),
        content: showsBarLabel(part) ? <CostSegmentLabel part={part} /> : null,
      }));

  const costLeaders: BarLeader[] = breakdown.collapsedCosts
    ? []
    : leaderLines(breakdown.parts).map((leader) => ({
        key: leader.key,
        tier: leader.tier,
        text: percentLabel(leader.ratio),
        color: partColor(leader.key, colors),
      }));

  // 斜線の区画に額が入らなかったときは、帯の外の引き出し線に回す ──
  // 段は最後の費用側の引き出し線と揃わないようにする（隣り合うと重なる）
  const shortfallLeader: BarLeader[] = showsShortfallAmount(breakdown)
    ? []
    : [
        {
          key: 'shortfall',
          tier: costLeaders.length > 0 ? (costLeaders[costLeaders.length - 1].tier + 1) % 2 : 0,
          text: shortfallAmountLabel(breakdown.shortfall),
          color: colors.red,
        },
      ];

  return (
    <Bar
      segments={[...costSegments, shortfallSegment]}
      leaders={[...costLeaders, ...shortfallLeader]}
      colors={colors}
    />
  );
}

/** 区画の中の項目名 ＋ 割合（黒字・赤字の費用側で共通） */
function CostSegmentLabel({ part }: { part: RecordBarPart }) {
  return (
    // 項目名と割合は**別の Text に分ける**。1 つの文にすると、名前の長い項目
    //（「仕入価格」「販売手数料 (10%)」）で末尾から切れて**割合のほうが消える** ──
    // 割合はこの帯の主語なので、縮むのは名前側だけにする（名前は下のレシートにもある）
    <View style={styles.segmentLabelRow}>
      <Text
        style={[styles.segmentLabel, styles.segmentName, { color: barLabelColor(part) }]}
        numberOfLines={1}>
        {part.label}
      </Text>
      <Text style={[styles.segmentLabel, { color: barLabelColor(part) }]}>
        {percentLabel(part.ratio ?? 0)}
      </Text>
    </View>
  );
}

/** 帯 1 区画の材料。黒字・赤字のどちらの帯もこの形に揃えてから Bar に渡す */
type BarSegment = {
  key: string;
  /** flex の重み。単位は円で、同じ帯の中の他区画と揃っていればよい */
  amount: number;
  backgroundColor: string;
  /** 区画の中に置く中身。文字が入らない・入れない区画は null */
  content: React.ReactNode | null;
  /** 斜線の模様で塗るか（赤字の「足りない」区画だけ） */
  hatched?: boolean;
  /** 右端をギザギザにするか（費用の内訳をまとめて打ち切った区画） */
  torn?: boolean;
};

/** 帯の外へ引き出す 1 本（黒字の割合・赤字の割合・赤字の不足額のどれもこの形） */
type BarLeader = {
  key: string;
  tier: number;
  text: string;
  color: string;
};

/**
 * 積み上げ本体と、その上に出る引き出し線。
 *
 * 区画の幅は金額そのもの（flex）。**黒字の費用・利益も、赤字の費用・不足額も
 * 同じ Bar が描く** ── 呼び出し側（SurplusBar / DeficitBar）が区画の中身・色・模様を
 * 決めてから渡すので、ここは並べるだけで済む。
 */
function Bar({
  segments,
  leaders,
  colors,
}: {
  segments: BarSegment[];
  leaders: BarLeader[];
  colors: ThemeColors;
}) {
  return (
    <View>
      {/* 引き出し線が無くても、帯の真上に最低限の隙間（BASE_TOP_GAP）は残す。
          引き出し線があるときはその段の高さぶんだけ隙間が伸びる（LeaderLines 側で計算） */}
      <LeaderLines segments={segments} leaders={leaders} />

      <View
        style={[styles.bar, { backgroundColor: colors.disabledBackground }]}
        // 帯が持つ情報は下のレシートの行が項目名・金額で言い直しているので、読み上げからは外す
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants">
        {segments.map((segment) => (
          <View
            key={segment.key}
            style={[
              styles.segment,
              { flex: segment.amount, backgroundColor: segment.backgroundColor },
            ]}>
            {segment.hatched && <DiagonalStripes />}
            {segment.torn && <TornEdge color={colors.secondaryBackground} />}
            {segment.content}
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * 細い区画の割合・不足額を帯の外へ引き出す線。
 *
 *          5%
 *      3%   │
 *       │   │
 *     ██▌███▌████████████
 *
 * **帯と同じ列の組み方（同じ flex・同じ隙間・同じ最小幅）で 1 段上に重ねる。**
 * 位置を px で計算せず区画と同じ規則で並べるので、幅が変わっても線が区画からずれない。
 * ラベルは区画の幅に収まらないので**絶対配置**で中央に置く（列の幅を広げない）。
 *
 * 隣り合う細い区画は線の長さを交互に変えて（呼び出し側が渡す tier）ラベルの高さをずらす ──
 * 同じ高さに並べると、2% と 3% の区画のように隣り合ったとき必ず重なる。
 */
function LeaderLines({ segments, leaders }: { segments: BarSegment[]; leaders: BarLeader[] }) {
  const leaderOf = new Map(leaders.map((leader) => [leader.key, leader]));

  return (
    <View
      style={[styles.leaderRow, { height: leaderRowHeight(leaders) }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      {segments.map((segment) => {
        const leader = leaderOf.get(segment.key);
        return (
          <View key={segment.key} style={[styles.leaderCell, { flex: segment.amount }]}>
            {leader != null && (
              <>
                <Text
                  style={[
                    styles.leaderLabel,
                    { color: leader.color, bottom: LEADER_LINE_HEIGHTS[leader.tier] },
                  ]}
                  numberOfLines={1}>
                  {leader.text}
                </Text>
                {/* 線は区画と同じ色。どの区画から出ているかは色で読む */}
                <View
                  style={[
                    styles.leaderLine,
                    { height: LEADER_LINE_HEIGHTS[leader.tier], backgroundColor: leader.color },
                  ]}
                />
              </>
            )}
          </View>
        );
      })}
    </View>
  );
}

/**
 * 赤字の「足りない」区画に敷く斜線。**RN には繰り返しパターンが無いので、
 * 細い View を回して等間隔に並べ、親の `overflow: 'hidden'` で切る**
 * （components/HelpDiagram.Hatching と同じ考え方）。
 *
 * 区画そのものの色（赤）の上に、半透明の白い線を重ねて模様を作る ──
 * 色を増やさず、赤字の区画だけが「他と手触りが違う」と分かるようにする。
 * 線の本数は帯の想定される最大幅より確実に多く敷く（区画がどれだけ広くても足りなくならない）。
 */
export function DiagonalStripes() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {Array.from({ length: STRIPE_COUNT }, (_, index) => (
        <View key={index} style={[styles.stripeLine, { left: index * STRIPE_GAP - 40 }]} />
      ))}
    </View>
  );
}

/** 斜線の本数・間隔。帯は画面幅いっぱいまで伸びうるので、余裕を持って多めに敷く */
const STRIPE_COUNT = 40;
const STRIPE_GAP = 10;

/**
 * 費用の内訳をまとめて打ち切った区画の右端に置く、ギザギザの切れ目。
 *
 * 「1 色にまとめた」だけでは、区画そのものは他の区画と変わらない四角に見え、
 * 内訳を途中で打ち切ったことが伝わらない。**右端を三角形の並びで欠けさせて**、
 * 「この先も本当は続いている」ことを形で示す（DeficitBreakdown.collapsedCosts）。
 *
 * 区画の実際の幅（px）は flex 任せで分からないので、**帯の高さだけを基準に固定サイズの
 * 三角形を並べる**（区画の色の背景の上に、カードの地色の三角形を右端から食い込ませる）。
 */
function TornEdge({ color }: { color: string }) {
  return (
    <View style={styles.tornEdge} pointerEvents="none">
      {Array.from({ length: TORN_TOOTH_COUNT }, (_, index) => (
        <View key={index} style={[styles.tornTooth, { borderRightColor: color }]} />
      ))}
    </View>
  );
}

/** ギザギザの歯の数・大きさ（帯の高さ 26pt に収まる数） */
const TORN_TOOTH_COUNT = 4;
const TORN_TOOTH_SIZE = 7;

/** 引き出し線の長さ（呼び出し側が渡す tier に対応。段が変わるとラベルの高さも変わる） */
const LEADER_LINE_HEIGHTS = [8, 22];

/** 帯の真上に最低限あける隙間（pt）。引き出し線が 1 本も無い記録でも、この分だけは空ける */
const BASE_TOP_GAP = 15;

/**
 * 引き出し線の行（LeaderLines）が確保する高さ。**動的** ── 実際に出ている引き出し線の
 * 中で一番長い段（tier）に合わせて伸び縮みする。細かい帯で長い段の線が出るときは
 * その分だけ高く、引き出し線が無い（または短い段だけの）記録では BASE_TOP_GAP まで縮む。
 * 未設定バー（UnpricedBar）は引き出し線を持たないので、常に BASE_TOP_GAP を足して
 * 色の帯が置かれる縦位置の基準を揃える。
 */
function leaderRowHeight(leaders: BarLeader[]): number {
  if (leaders.length === 0) return BASE_TOP_GAP;
  const maxTier = Math.max(...leaders.map((leader) => leader.tier));
  return LEADER_LINE_HEIGHTS[maxTier] + BASE_TOP_GAP;
}

/**
 * 潰れた区画にも残す最低幅（pt）。**帯の区画と引き出し線の列で同じ値を使う。**
 *
 * 2 か所でずれると、区画だけが左右の余白のぶん太くなり、
 * 引き出し線がその中心を指さなくなる（実際にそうなっていた）。
 * 極端な赤字（費用が売上の 300 倍など）でもこの下限は守る ── 0 幅にはしない。
 */
const MIN_SEGMENT_WIDTH = 4;

const styles = StyleSheet.create({
  pricingEntryWrap: {
    marginTop: 8,
    // カード（ReceiptCard）の左右パディング(16)ぶんはみ出させて、背景がカードの
    // 端まで届くようにする。分だけ内側の paddingHorizontal を足して文字の位置は保つ
    marginHorizontal: -16,
  },
  pricingEntryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16 + 12,
    paddingVertical: 10,
  },
  pricingEntryText: {
    flex: 1,
    gap: 2,
  },
  pricingEntryHeadline: {
    fontSize: 15,
    fontWeight: '700',
  },
  pricingEntryDetail: {
    fontSize: 12,
  },
  leaderRow: {
    flexDirection: 'row',
    // 帯と同じ隙間で並べる。ここがずれると線が区画の中心を指さなくなる
    gap: 2,
    // 高さは leaderRowHeight() で動的に決めてインラインで渡す（ここでは指定しない）
    alignItems: 'flex-end',
  },
  leaderCell: {
    // 帯の区画と同じ最小幅。1% 未満の区画にも線を出せるようにする
    minWidth: MIN_SEGMENT_WIDTH,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  leaderLabel: {
    position: 'absolute',
    // 区画より広い ── 数 px の区画の上でも数字が読めるように、左右へはみ出して中央に置く
    left: -28,
    right: -28,
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
  leaderLine: {
    width: 1,
  },
  bar: {
    flexDirection: 'row',
    // 区画の中に文字を置くぶん、計算タブの帯（14）より高くする
    height: 26,
    borderRadius: 8,
    // 区画の角が帯の丸みからはみ出さないように切る
    overflow: 'hidden',
    gap: 2,
  },
  unpricedBar: {
    // 区画を持たない 1 色のバー。引き出し線を持たないので、価格設定済みの帯が最低限
    // 空ける隙間（BASE_TOP_GAP）とだけ縦位置を揃える
    marginTop: BASE_TOP_GAP,
  },
  unpricedNote: {
    fontSize: 12,
    marginTop: 6,
  },
  segment: {
    // 1% 未満の項目でも色は見える幅を残す（消えると合計が合わないように見える）
    minWidth: MIN_SEGMENT_WIDTH,
    justifyContent: 'center',
    // **左右の余白をここに置かない。** 置くと最低幅が「4pt」ではなく「4pt ＋ 余白 12pt」になり、
    // 潰れた区画だけが実際の 3 倍以上の幅で出る ── 手数料 100 円の区画が
    // 売った額 1,000 円のバーより太く見えた（同じカードの中で 10 倍小さい額が太い）。
    // 余白は文字が入る区画にだけ要るので、文字の側（segmentLabelRow）が持つ
    overflow: 'hidden',
  },
  segmentLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
  },
  segmentName: {
    // 幅が足りないときに縮む（＝末尾が「…」になる）のはこちらだけ。割合は縮ませない
    flexShrink: 1,
  },
  segmentLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  shortfallSegmentText: {
    color: '#FFFFFF',
    paddingHorizontal: 6,
  },
  stripeLine: {
    position: 'absolute',
    top: -20,
    width: 2,
    height: 70,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
    transform: [{ rotate: '-45deg' }],
  },
  tornEdge: {
    position: 'absolute',
    right: -1,
    top: 0,
    bottom: 0,
    justifyContent: 'space-evenly',
  },
  tornTooth: {
    width: 0,
    height: 0,
    borderTopWidth: TORN_TOOTH_SIZE / 2,
    borderBottomWidth: TORN_TOOTH_SIZE / 2,
    borderRightWidth: TORN_TOOTH_SIZE,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
  },
});
