// 価格ライン（SPEC-V9 §9.8）。「いくらで売る？」の 4 段目。
//
// 1 本の横線の上に、この記録にとって意味のある価格を 2〜3 点だけ置く:
//
//     ──────●━━━━━━━━━━━━━━━━━━━━━●──────
//     ¥3,112                        ¥5,000
//     ここで利益ゼロ                  今の価格
//
// **点の並びは値の昇順**（logic/pricing の priceLineTicks）。赤字の記録では
// 今の価格が分岐点の**左**に来るので、同じ規則のまま順序が入れ替わる ──
// 「赤字のときは逆に描く」という第 2 の規則を持たない。
//
// **目標が無いときは目標の点を作らない**（空の目盛りを残さない）。決めていない人の画面に
// 「目標ライン」という薄い線だけが残ると、押せない何かがあるように見える。
//
// 帯の色は左から 赤（利益ゼロ未満）→（目標があれば）薄い緑 → 緑。
// 区画の切れ目そのものが点の位置なので、凡例は置かない。
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { formatYenSymbol } from '@/logic/format';
import {
  PREVIOUS_PRICE_LABEL,
  PRICE_LINE_RAISE_HINT,
  priceGapLabel,
  priceTickLabel,
} from '@/logic/labels';
import { priceLineTicks, type PricingAnalysis, type PriceTickKey } from '@/logic/pricing';
import { useThemeColors, type ThemeColors } from '@/theme';

/** 線の太さ。金額の文字より細く、下地の帯より太い */
const TRACK_HEIGHT = 10;

/** 点の直径（今の価格）。他の 2 点は角丸の四角で同じ寸法 */
const MARKER_SIZE = 18;

/** 書き換える前の価格を示す灰色の点（§9.11）。今の価格の点より明確に小さくする */
const GHOST_SIZE = 8;

/**
 * 両端の余白（値域に対する割合）。いちばん外の点が線の端に張り付くと、
 * 「その先が無い」ようにも「切れている」ようにも見えるため、必ず外側を残す。
 */
const DOMAIN_PADDING_RATIO = 0.18;

/** 説明の列 1 つの幅。点の真下へ中央合わせで置く（隣と重ならない範囲で最大） */
const LABEL_WIDTH = 108;

type Props = {
  analysis: PricingAnalysis;
  /**
   * この画面で書き換える前の価格（§9.11）。**保存しない**ので、
   * 画面を出れば消える。複数回書き換えたときは古いものも残す。
   */
  previousPrices?: readonly number[];
};

export function PriceLine({ analysis, previousPrices = [] }: Props) {
  const colors = useThemeColors();
  const ticks = priceLineTicks(analysis);
  // 説明の列を点の真下へ置くために測る。0（初回描画）のときは全部左端に重なるが、
  // onLayout は同じフレームで返るので目には見えない
  const [width, setWidth] = useState(0);

  // 値域は「いちばん外の点＋外側の余白」で決まる。1 点しか無い（分岐点 = 今の価格）
  // 記録でも 0 除算にならないよう、幅が 0 のときは点の側に幅を作る。
  //
  // **書き換える前の価格も値域に入れる。** 入れないと、値下げして書き換えた直後に
  // 前の価格が右端の外に出て、灰色の点そのものが線の上から消える（それが残す目的なので）。
  const values = [...ticks.map((tick) => tick.value), ...previousPrices];
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo;
  const padding = span === 0 ? Math.max(1, hi * 0.1) : span * DOMAIN_PADDING_RATIO;
  const domainMin = lo - padding;
  const domainMax = hi + padding;
  const position = (value: number) => (value - domainMin) / (domainMax - domainMin);

  // 説明の列の位置。点の真下が基本で、近すぎる隣とは押し合って離す（labelLefts）
  const lefts = labelLefts(
    ticks.map((tick) => position(tick.value)),
    width,
  );

  // 赤字のときだけ、2 点の間に「あと ¥612」を渡す（§9.8）。
  // 動かす向きの意味が反転する場面なので、差額を線の上に置いて向きごと読ませる
  const showGap = analysis.state === 'loss';
  const gapCenter = showGap
    ? (position(analysis.currentPrice) + position(analysis.breakEven)) / 2
    : 0;

  return (
    <View style={styles.container}>
      {showGap && (
        <View style={styles.gapLayer}>
          <Text
            style={[styles.gapLabel, { color: colors.red, left: `${gapCenter * 100}%` }]}
            numberOfLines={1}>
            {priceGapLabel(analysis.breakEvenShortfall)}
          </Text>
        </View>
      )}

      <View style={styles.trackRow}>
        {/* 下地の 3 区画。左から 赤（利益ゼロ未満）→ 薄い緑（目標未満）→ 緑。
            主役はその上に乗る点と金額なので、帯そのものは薄い色に留める */}
        <View style={[styles.track, { backgroundColor: colors.red, opacity: 0.5 }]}>
          <View
            style={[
              styles.segment,
              {
                left: `${position(analysis.breakEven) * 100}%`,
                backgroundColor: analysis.targetPrice == null ? colors.green : colors.orange,
              },
            ]}
          />
          {analysis.targetPrice != null && (
            <View
              style={[
                styles.segment,
                {
                  left: `${position(analysis.targetPrice) * 100}%`,
                  backgroundColor: colors.green,
                },
              ]}
            />
          )}
        </View>

        {/* 書き換える前の価格。線の上に小さく残すだけで、下の金額の列には出さない ──
            列に出すと「読むべき値」が 1 つ増えてしまう（これは履歴であって基準ではない） */}
        {previousPrices.map((price) => (
          <View
            key={price}
            accessibilityLabel={`${PREVIOUS_PRICE_LABEL} ${formatYenSymbol(price)}`}
            style={[
              styles.ghost,
              {
                left: `${position(price) * 100}%`,
                backgroundColor: colors.gray,
                borderColor: colors.background,
              },
            ]}
          />
        ))}

        {ticks.map((tick) => (
          <Marker
            key={tick.key}
            tickKey={tick.key}
            left={position(tick.value)}
            colors={colors}
            inLoss={analysis.state === 'loss'}
          />
        ))}
      </View>

      {/* 金額と説明の列。**それぞれの点の真下**に置く（両端寄せにしない）──
          書き換えたあとは灰色の点が右端に来るので、端に寄せると
          「今の価格」の列がその点の下に来て、別の点の説明に読める。
          はみ出す側は端で止める（clamp）ので、いちばん外の点の下でも文字が切れない。 */}
      <View style={styles.labelRow} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
        {ticks.map((tick, index) => (
          <View key={tick.key} style={[styles.labelColumn, { left: lefts[index] }]}>
            <Text style={[styles.labelAmount, { color: markerColor(tick.key, colors) }]}>
              {formatYenSymbol(tick.value)}
            </Text>
            <Text style={[styles.labelCaption, { color: colors.secondaryLabel }]} numberOfLines={1}>
              {priceTickLabel(tick.key)}
            </Text>
          </View>
        ))}
      </View>

      {/* 赤字のときだけ添える向きの説明（§9.8）。黒字では出さない ──
          そちらは左へ動かす（値下げする）ことが読みたいこと。
          **金額の列とは別の行**に置く ── 目盛りが 3 点あるとその列と場所を取り合う */}
      {analysis.state === 'loss' && (
        <Text style={[styles.hint, { color: colors.secondaryLabel }]}>
          {PRICE_LINE_RAISE_HINT}
        </Text>
      )}
    </View>
  );
}

/**
 * 点 1 つ。**今の価格だけ塗りつぶした丸**で、他は角丸の四角の枠にする ──
 * 「今どこに居るか」と「どこに線があるか」は種類の違う情報なので、色だけで分けない。
 */
function Marker({
  tickKey,
  left,
  colors,
  inLoss,
}: {
  tickKey: PriceTickKey;
  left: number;
  colors: ThemeColors;
  inLoss: boolean;
}) {
  const color = tickKey === 'current' && inLoss ? colors.red : markerColor(tickKey, colors);

  return (
    <View
      style={[
        styles.marker,
        tickKey === 'current' ? styles.markerCurrent : styles.markerLine,
        {
          left: `${left * 100}%`,
          borderColor: color,
          backgroundColor: tickKey === 'current' ? color : colors.background,
        },
      ]}
    />
  );
}

/**
 * 説明の列の左端（左の点から順に）。点の真下（中央合わせ）に置き、
 * **近すぎる隣とは押し合って離す**。
 *
 * 押し合いが要るのは、点が寄る組み合わせが普通にあるため ── 赤字の記録では
 * 今の価格と分岐点が数百円しか離れないことがあり、そのまま真下に置くと
 * 「今の価格」と「ここで利益ゼロ」の文字が重なって 1 つの語に読める。
 *
 * 手順は 3 つ: 真下に置く → 左から順に最小間隔を空ける → 右端からはみ出したぶんを左へ戻す。
 * 幅がまだ測れていない（0）ときは全部 0（1 フレームだけ左端に重なる）。
 */
function labelLefts(ratios: readonly number[], width: number): number[] {
  if (width <= 0) return ratios.map(() => 0);

  const max = Math.max(0, width - LABEL_WIDTH);
  const lefts = ratios.map((ratio) =>
    Math.min(Math.max(0, ratio * width - LABEL_WIDTH / 2), max),
  );

  for (let i = 1; i < lefts.length; i += 1) {
    lefts[i] = Math.max(lefts[i], lefts[i - 1] + LABEL_WIDTH);
  }
  for (let i = lefts.length - 1; i >= 0; i -= 1) {
    const limit = i === lefts.length - 1 ? max : lefts[i + 1] - LABEL_WIDTH;
    lefts[i] = Math.max(0, Math.min(lefts[i], limit));
  }
  return lefts;
}

function markerColor(key: PriceTickKey, colors: ThemeColors): string {
  if (key === 'breakEven') return colors.red;
  if (key === 'target') return colors.orange;
  return colors.green;
}

const styles = StyleSheet.create({
  container: {
    gap: 6,
  },
  gapLayer: {
    height: 18,
    justifyContent: 'flex-end',
  },
  gapLabel: {
    position: 'absolute',
    // left は割合で当てるので、文字の中心をそこへ寄せる（幅は内容で決まる）
    transform: [{ translateX: -32 }],
    fontSize: 12,
    fontWeight: '700',
  },
  trackRow: {
    height: MARKER_SIZE,
    justifyContent: 'center',
  },
  track: {
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
    overflow: 'hidden',
  },
  segment: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
  },
  marker: {
    position: 'absolute',
    width: MARKER_SIZE,
    height: MARKER_SIZE,
    borderWidth: 3,
    marginLeft: -MARKER_SIZE / 2,
  },
  markerCurrent: {
    borderRadius: MARKER_SIZE / 2,
  },
  markerLine: {
    borderRadius: 5,
  },
  ghost: {
    position: 'absolute',
    width: GHOST_SIZE,
    height: GHOST_SIZE,
    borderRadius: GHOST_SIZE / 2,
    borderWidth: 1,
    marginLeft: -GHOST_SIZE / 2,
  },
  labelRow: {
    // 列は絶対配置なので、行の高さは自分で持つ（金額 18 ＋ 説明 14 ＋ 隙間）
    height: 36,
  },
  labelColumn: {
    position: 'absolute',
    top: 0,
    width: LABEL_WIDTH,
    alignItems: 'center',
    gap: 1,
  },
  labelAmount: {
    fontSize: 15,
    fontWeight: '700',
  },
  labelCaption: {
    fontSize: 11,
  },
  hint: {
    textAlign: 'right',
    fontSize: 11,
  },
});
