// 実績バッジの段位モチーフ（★1〜★5）を react-native-svg で描く。
//
// **段位は「円の下に並ぶ星の数」で表す**（ブロンズ=1 … レジェンド=5）。
// 以前は ★1〜★3 が葉、★4 が宝石、★5 が王冠で、素材の系統が途中で変わっていた。
// さらに葉は円の下から生えて円に食い込むのに、宝石と王冠は円の外・上に乗っており、
// 「装飾がどう付くか」まで ★3 と ★4 の間で切り替わっていた ── 同じ 1 本の段位表の
// はずが、3 段目までと 4 段目からで別の記号体系に見える。星に統一して、
// 数だけが増えていく形にする。
//
// **円には重ねず、円の下端の外側に置く**（呼び出し側が縦に並べる。position: absolute で
// 浮かせない）。重ねないので、円の直径・縁の太さが段位ごとに変わっても位置合わせが要らない。
//
// 星の色は段位色（PALETTE）。バッジ本体・リングの色分け（実績の種類。categoryColor）とは
// 独立した軸で、「金属・宝石で作られた装飾品」に見せるため light/base/dark の 3 段で
// グラデーションにし、縁に濃い線を入れて地の色から浮かせる。
//
// **星の並びは段位色の角丸の枠で囲む。** 枠があると、離れて並ぶ星が「1 つのまとまり
// ＝ この実績の段位」として読める ── 囲まないと、下に続く段位チップ・達成日と
// 同じ「カードの中の要素」に見えて、円の付属物であることが伝わりにくい。
// 枠の色は星と同じ段位色（base）で、段位チップと同じ「端が半円」の形にして系統をそろえる。
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, G, LinearGradient, Path, Stop } from 'react-native-svg';

import type { AchievementDifficulty } from '@/logic/achievements';

/**
 * 段位色。base は AchievementsSection.TIER_COLORS と同じ基準色（縁取り・段位チップと統一）で、
 * light/dark はその上下に振った金属の光沢用。★1〜★3 は葉のころから変えていない。
 */
const PALETTE: Record<AchievementDifficulty, { light: string; base: string; dark: string }> = {
  1: { light: '#F4CB9B', base: '#B8752E', dark: '#5C3210' }, // ブロンズ
  2: { light: '#FFFFFF', base: '#9AA1A9', dark: '#454A50' }, // シルバー
  3: { light: '#FFF6D2', base: '#D4AF37', dark: '#7A5A10' }, // ゴールド
  4: { light: '#D6EAF7', base: '#6FA3C7', dark: '#33607E' }, // プラチナ
  5: { light: '#A34765', base: '#5A1B33', dark: '#2C0A18' }, // レジェンド
};

/**
 * 暗色の地に置くレジェンドだけの差し替え色。
 *
 * TIER_COLORS.legend（#5A1B33。黒みがかった深いボルドー）はカード背景（#1C1C1E）に対して
 * コントラストが 1.3 しかなく、星として塗ると輪郭ごと沈んで数が読めない。段位チップが
 * TIER_CHIP_DARK_COLORS で同じ差し替えをしているので、そちらに色を合わせる
 * （§実績詳細ダークモード可読性）。★1〜★4 は暗色地でも読めるので差し替えない。
 */
const LEGEND_DARK_PALETTE = { light: '#FBDCE7', base: '#F2A9C2', dark: '#B06682' };

/**
 * 星 1 つの輪郭。外接円の半径 50・内接円の半径 20 で、cell（100×100）の中心 (50,50) に置く。
 * 上を頂点にした標準的な五芒星（先端 (50,0) から時計回り）。
 */
const STAR_PATH =
  'M50 0 L61.76 33.82 L97.55 34.55 L69.02 56.18 L79.39 90.45 L50 70 ' +
  'L20.61 90.45 L30.98 56.18 L2.45 34.55 L38.24 33.82 Z';

/** 星 1 つぶんの箱の幅（= 中心から中心までの間隔）。100 の星に 8 の隙間を足した値 */
const STAR_CELL = 108;
/** 星の間隔（最後の星の右には付けない） */
const STAR_GAP = STAR_CELL - 100;
/** 縁の線がにじまないように viewBox の四方へ足す余白 */
const STAR_MARGIN = 3;
/** 星の下端（90.45）＋上下の余白。cell の 100 まで使うと星の下に見えない隙間が残る */
const STAR_BOX_HEIGHT = 90.45 + STAR_MARGIN * 2;

/**
 * 星を囲む枠。**左右の端が半円になる（＝高さの半分の角丸）まで丸める。**
 *
 * 段位チップ（AchievementDetailModal.tierChip）は高さ 24 に対して角丸 12 なので、
 * もともと端が半円の形をしている。星の枠だけ固定値の 12 にすると、枠のほうが背が高い
 * （星 24 ＋ 余白と線）ぶん角が残り、すぐ下のチップと形が揃わない。
 * 実際の高さに関係なく半円になるよう、十分大きい値を入れて丸め切る
 * （RN は borderRadius が高さの半分を超えると半分に丸める）。
 *
 * ★5 でも 星 5 つ（約 134px）＋ 左右の余白と線で約 157px にしかならないので、
 * いちばん大きい円（210px）の幅に収まる。
 */
const FRAME_BORDER_WIDTH = 1.5;
const FRAME_RADIUS = 999;
const FRAME_PADDING_H = 12;
const FRAME_PADDING_V = 5;

export function AchievementTierMotif({
  difficulty,
  starSize,
  isDark,
  style,
}: {
  difficulty: AchievementDifficulty;
  /** 星 1 つの高さ（px）。幅は星の数に応じて自動で決まる */
  starSize: number;
  /** 暗色モードか。レジェンドの色の差し替えにだけ使う（LEGEND_DARK_PALETTE） */
  isDark: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const palette = isDark && difficulty === 5 ? LEGEND_DARK_PALETTE : PALETTE[difficulty];

  // 星の数 = 段位。最後の星の右に隙間を残さないよう STAR_GAP を引く
  const boxWidth = difficulty * STAR_CELL - STAR_GAP + STAR_MARGIN * 2;
  // viewBox と同じ縦横比で px を決める（preserveAspectRatio の余白が出ないように）
  const width = (starSize * boxWidth) / STAR_BOX_HEIGHT;

  // グラデーション id は段位と明暗で分ける。同じ段位のバッジが同時に出ることはある
  // （詳細モーダルは前後のページも作る）が、その 2 つは同じ色なので衝突しても実害がない
  const gradientId = `tierStarGrad${difficulty}${isDark ? 'Dark' : 'Light'}`;

  return (
    // 枠は星の並びにぴったり沿わせる（幅を段位で揃えない）── ★1 の枠だけ中身が
    // すかすかになると、空きが「取り逃した段」に見えてしまう
    <View style={[styles.frame, { borderColor: palette.base }, style]}>
      <Svg
        width={width}
        height={starSize}
        viewBox={`${-STAR_MARGIN} ${-STAR_MARGIN} ${boxWidth} ${STAR_BOX_HEIGHT}`}>
        <Defs>
          <LinearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={palette.light} />
            <Stop offset="0.55" stopColor={palette.base} />
            <Stop offset="1" stopColor={palette.dark} />
          </LinearGradient>
        </Defs>

        {Array.from({ length: difficulty }, (_, index) => (
          <G key={index} transform={`translate(${index * STAR_CELL} 0)`}>
            <Path
              d={STAR_PATH}
              fill={`url(#${gradientId})`}
              stroke={palette.dark}
              strokeWidth={3}
              strokeLinejoin="round"
            />
          </G>
        ))}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    borderWidth: FRAME_BORDER_WIDTH,
    borderRadius: FRAME_RADIUS,
    paddingHorizontal: FRAME_PADDING_H,
    paddingVertical: FRAME_PADDING_V,
    // 中身の幅ぴったりに縮める（親の alignItems: 'center' で中央に来る）
    alignSelf: 'center',
  },
});
