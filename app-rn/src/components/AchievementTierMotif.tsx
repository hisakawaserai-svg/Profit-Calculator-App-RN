// 実績バッジの難易度モチーフ（★1〜★3）を react-native-svg の自作イラストで描く。
// ★4（プラチナ）は FontAwesome5 の gem アイコン、★5（レジェンド）は同じく crown
// アイコンを使う（どちらも AchievementDetailModal / AchievementsSection 側で個別に
// 描画。このコンポーネントは ★1〜★3 だけを担当する）。
//
// ★1〜★3 は「丸(バッジ本体)の下・両サイドから大きな葉が伸び、真下（またはその
// 付近）で触れ合う」構図（ユーザー指定）。難易度が上がるほど葉自体も大きく・
// 派手になっていく（★1 滑らかな葉 → ★2 細長い葉 → ★3 鋸歯状の葉）。viewBox は
// バッジ本体とほぼ同じ大きさの箱として使い、呼び出し側でバッジ本体の中心に
// 重ねる（TIER_MOTIF_SIZES 参照）。
//
// モチーフの色は難易度（段位）ごとに固定 ── バッジ本体・リングの色分け
// （実績の種類。categoryColor）とは完全に独立した軸。「本物の植物」ではなく
// 「金属・宝石で作られた、植物の形をした装飾品」に見せるため、茎や葉も自然な緑では
// なく段位色で塗る。基準色は AchievementsSection の TIER_COLORS と揃え、リング色と
// モチーフ色に統一感を持たせている。
//
// ★1 葉（ブロンズ） → ★2 葉（シルバー、★1 より大きい） → ★3 鋸歯状の葉（ゴールド）。
import type { StyleProp, ViewStyle } from 'react-native';
import Svg, { Defs, G, LinearGradient, Path, Stop } from 'react-native-svg';

/**
 * ★1〜3 の段位色。AchievementsSection.TIER_COLORS と同じ基準色（ring と統一）だが、
 * モチーフ本体は「本物の植物」ではなく「金属・宝石で作られた装飾品」に見せたいので、
 * light/dark のコントラストを強め、金属の光沢が出るようにしている
 */
const PALETTE = {
  1: { light: '#F4CB9B', base: '#B8752E', dark: '#5C3210' }, // ブロンズ
  2: { light: '#FFFFFF', base: '#9AA1A9', dark: '#454A50' }, // シルバー
  3: { light: '#FFF6D2', base: '#D4AF37', dark: '#7A5A10' }, // ゴールド
} as const;

/**
 * ★3 の葉の輪郭（ローカル座標。付け根 (0,0) → 先端 (0,60)、幅 ±24）。
 * 参考にした葉写真に近い、幅の広い楕円に縁全体の細かい鋸歯を入れた形。
 */
const GOLD_LEAF_OUTLINE =
  'M0 0 L6.6 9.3 L8.9 18.6 L14.9 27.9 L14.9 37.2 L18 46.5 L14.9 55.8 L14.9 65.1 L8.9 74.4 L6.6 83.7 L0 93 ' +
  'L-6.6 83.7 L-8.9 74.4 L-14.9 65.1 L-14.9 55.8 L-18 46.5 L-14.9 37.2 L-14.9 27.9 L-8.9 18.6 L-6.6 9.3 Z';

/** ★3 の葉脈。中央の葉脈から左右に側脈が伸びる、本物の葉らしい葉脈パターン */
const GOLD_LEAF_VEINS =
  'M0 7.7 L0 89.9 M0 27.9 L10.5 49.6 M0 27.9 L-10.5 49.6 M0 52.7 L11.3 71.3 M0 52.7 L-11.3 71.3';

type TierMotifDifficulty = 1 | 2 | 3;

/**
 * 実績一覧の小さいコーナーバッジ（18px 円）用の切り抜き viewBox。
 * 茎の長い付け根部分を省き、モチーフの「頭」（種・蕾・花・花冠）が
 * 正方形いっぱいに収まるように寄る。縦横比は正方形のまま（円のバッジに歪みなく収まるように）
 */
const COMPACT_VIEW_BOX: Record<TierMotifDifficulty, string> = {
  // ★1・★2・★3 は丸の両サイドから伸びて真下で触れ合う 2 枚の葉。中央下に寄って切り抜く
  1: '15 72 70 70',
  2: '5 45 90 90',
  3: '-13 5 116 116',
};

/**
 * 'full' 表示用の viewBox。★3 は葉の付け根をバッジの外側（x=-16〜116）まで広げたので、
 * 標準の 0 0 100 100 だと付け根側が切れる。左右対称に余白を足して収める
 * （正方形のまま拡大 = 縦横の縮尺は変えず、呼び出し側の size / top で見た目の位置を合わせる）
 */
const FULL_VIEW_BOX: Record<TierMotifDifficulty, string> = {
  1: '0 0 100 100',
  2: '0 0 100 100',
  3: '-18 -18 136 136',
};

export function AchievementTierMotif({
  difficulty,
  size,
  variant = 'full',
  style,
}: {
  difficulty: TierMotifDifficulty;
  size: number;
  /** 'compact' = 実績一覧の小さいコーナーバッジ用。茎の頭だけを寄って切り抜く */
  variant?: 'full' | 'compact';
  style?: StyleProp<ViewStyle>;
}) {
  const viewBox = variant === 'compact' ? COMPACT_VIEW_BOX[difficulty] : FULL_VIEW_BOX[difficulty];
  return (
    <Svg width={size} height={size} viewBox={viewBox} style={style}>
      <Defs>
        <LinearGradient id="bronzeGrad" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={PALETTE[1].light} />
          <Stop offset="0.55" stopColor={PALETTE[1].base} />
          <Stop offset="1" stopColor={PALETTE[1].dark} />
        </LinearGradient>
        <LinearGradient id="silverGrad" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={PALETTE[2].light} />
          <Stop offset="0.55" stopColor={PALETTE[2].base} />
          <Stop offset="1" stopColor={PALETTE[2].dark} />
        </LinearGradient>
        <LinearGradient id="goldGrad" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={PALETTE[3].light} />
          <Stop offset="0.55" stopColor={PALETTE[3].base} />
          <Stop offset="1" stopColor={PALETTE[3].dark} />
        </LinearGradient>
      </Defs>

      {difficulty === 1 && (
        // ★1 だけは「茎から芽が伸びる」構図ではなく、丸(バッジ)の下・両サイドに
        // 大きな葉を1枚ずつ添える構図にする（ユーザー指定）。付け根は丸の両サイド
        // （前回位置のまま）、先端はバッジ真下の中央でちょうど触れ合う角度にする
        <>
          {/* 元の形（先端がバッジ真下中央 50,99 で触れ合う）はそのまま、先端を固定して
              1.6 倍に拡大した輪郭 */}
          <Path
            d="M28.4 79.2 Q10.4 104.4 50 99 Q39.2 72 28.4 79.2 Z"
            fill="url(#bronzeGrad)"
            stroke={PALETTE[1].dark}
            strokeWidth={0.6}
          />
          <Path
            d="M32 82.8 Q39.2 91.8 50 97.2"
            stroke={PALETTE[1].dark}
            strokeWidth={1}
            fill="none"
            opacity={0.4}
          />

          <Path
            d="M71.6 79.2 Q89.6 104.4 50 99 Q60.8 72 71.6 79.2 Z"
            fill="url(#bronzeGrad)"
            stroke={PALETTE[1].dark}
            strokeWidth={0.6}
          />
          <Path
            d="M68 82.8 Q60.8 91.8 50 97.2"
            stroke={PALETTE[1].dark}
            strokeWidth={1}
            fill="none"
            opacity={0.4}
          />
        </>
      )}

      {difficulty === 2 && (
        // ★2 も★1 と同じ「丸の下・両サイドに葉を添える」構図（ユーザー指定で★1 から
        // 踏襲）。★1 より一回り大きく・付け根が丸の高い位置まで回り込むようにして、
        // 難易度が上がるほど大きく・派手になっていく流れを作る
        <>
          {/* 葉の両端（付け根・先端）が尖り、腹が左右対称に膨らむ「木の葉」らしい細長い
              輪郭（アーモンド形）にする。付け根を丸の高い位置まで回り込ませて、幅を
              絞ることで丸みのある塊ではなく細長い葉に見せる。付け根を軸に外側へ
              回転させ、真下で尖って合わさる窮屈な形にならないようにする */}
          <G transform="rotate(-16 10 60)">
            <Path
              d="M10 60 Q21.5 93.5 50 100 Q38.5 76.5 10 60 Z"
              fill="url(#silverGrad)"
              stroke={PALETTE[2].dark}
              strokeWidth={0.6}
            />
            <Path
              d="M14 65 Q30 90 48 99"
              stroke={PALETTE[2].dark}
              strokeWidth={1.2}
              fill="none"
              opacity={0.4}
            />
          </G>

          <G transform="rotate(16 90 60)">
            <Path
              d="M90 60 Q78.5 93.5 50 100 Q61.5 76.5 90 60 Z"
              fill="url(#silverGrad)"
              stroke={PALETTE[2].dark}
              strokeWidth={0.6}
            />
            <Path
              d="M86 65 Q70 90 52 99"
              stroke={PALETTE[2].dark}
              strokeWidth={1}
              fill="none"
              opacity={0.4}
            />
          </G>
        </>
      )}

      {difficulty === 3 && (
        // ★3 も★1・★2 と同じ「丸の下・両サイドに葉」構図。参考画像（紫陽花の葉）に
        // 合わせて、細長い刃物型ではなく幅の広い楕円形の葉にし、縁全体に細かい鋸歯を
        // 均等に入れる（前回の粗く大きいジグザグから変更）。中央の葉脈から左右に
        // 側脈が伸びる本物の葉らしい葉脈パターンも追加する。
        // GOLD_LEAF は葉の付け根 (0,0) → 先端 (0,60) のローカル座標。呼び出し側で
        // translate+rotate して、付け根をバッジの縁に、先端をバッジ下端の中央に合わせる
        <>
          <G transform="translate(-16 42) rotate(-61)">
            <Path
              d={GOLD_LEAF_OUTLINE}
              fill="url(#goldGrad)"
              stroke={PALETTE[3].dark}
              strokeWidth={0.6}
            />
            <Path d={GOLD_LEAF_VEINS} stroke={PALETTE[3].dark} strokeWidth={1} fill="none" opacity={0.4} />
          </G>

          <G transform="translate(116 42) rotate(61)">
            <Path
              d={GOLD_LEAF_OUTLINE}
              fill="url(#goldGrad)"
              stroke={PALETTE[3].dark}
              strokeWidth={0.6}
            />
            <Path d={GOLD_LEAF_VEINS} stroke={PALETTE[3].dark} strokeWidth={1} fill="none" opacity={0.4} />
          </G>
        </>
      )}

    </Svg>
  );
}
