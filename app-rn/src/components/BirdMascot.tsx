/**
 * BirdMascot.tsx — マスコット（シマエナガ）のイラスト
 *
 * 前作（bg-remover）から移植。向こうは描画に @shopify/react-native-skia を使って
 * いたが、本プロジェクトは Skia を入れておらず、図形イラストは react-native-svg で
 * 描く（AchievementTierMotif / HelpDiagram と同じ）。そのため Skia の API を
 * react-native-svg に置き換えてある ── 座標・形・色は元のまま。
 *
 * **色はベタ書きのまま残してある。** theme.ts が持つのは「収支プラス＝green /
 * 販売手数料＝orange」といった**意味に紐づいた UI 色**で、空・くちばし・羽といった
 * **イラストの色**に対応する定数が無い。加えて theme の色は明色/暗色で入れ替わるため、
 * 当てはめると暗色でだけ絵の配色が変わってしまう（例：くちばしの #FF9500 は明色の
 * orange と同じ値だが、暗色では #FF9F0A になる）。同じ理由で AchievementTierMotif も
 * 自前の PALETTE を持っている。
 *
 *   variant='day'   : 背景に水色丸＋太陽
 *   variant='night' : 背景に紺色丸＋月＋星
 *   variant='sleep' : 背景に藤色丸＋淡い月＋Z
 *   キャラ本体（白い体・目・くちばし・翼/尾）は共通。
 */
import Animated, {
  useAnimatedProps,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, Ellipse, G, Path } from 'react-native-svg';

/** 翼の回転軸（肩の位置）。100×100 基準。 */
const WING_ORIGIN = { x: 64, y: 46 };

/** Z 1 つぶんの折れ線。左上 (x, y) から一辺 size の Z 字（高さは 1.2 倍） */
function zPath(x: number, y: number, size: number): string {
  const bottom = y + size * 1.2;
  return `M${x} ${y} L${x + size} ${y} L${x} ${bottom} L${x + size} ${bottom}`;
}

/**
 * 寝息の Z（体の左側を、右下から左上へ斜めに立ちのぼる 3 つ）。100×100 基準。
 *
 * **1 つだけだと「7」に読めた**ので、大小を付けて 3 つにする。
 * 頭に近いほど小さく細く、離れるほど大きく太い ── 息が昇るにつれて広がる形。
 *
 * **並びだけを斜めにする。字は反転させない**（反転した Z は逆さ文字に見える）。
 *
 * **左はここが限界。** 一番大きい Z の左端が x=2.5（線幅の半分を足すと 1.45）で、
 * これ以上寄せると viewBox（0〜100）で切れる。さらに左へ出したいときは、
 * 絵の箱そのものを広げる（viewBox を変える）か、体を右へ寄せる必要がある。
 *
 * **showScene=true のときは、上の 2 つがシーンの丸（cx50 cy50 r48）から出る。**
 * 丸は上へ行くほど内側へ入ってくるので、「左へ寄せながら上る」線とは向きが逆で、
 * 左側で斜めにすると必ずどこかで外れる（丸の内側に収めたいなら、左下から右上へ
 * 上る向きにするしかない）。**記録タブの使い方（showScene=false）では丸を描かない**
 * ので、そちらを優先している。シーン付きで使うことになったらここを見直すこと。
 */
const SLEEP_ZS = [
  { d: zPath(24, 28, 4.5), strokeWidth: 1.4 },
  { d: zPath(13, 17, 6.5), strokeWidth: 1.7 },
  { d: zPath(2.5, 5, 8.5), strokeWidth: 2.1 },
] as const;

const AnimatedG = Animated.createAnimatedComponent(G);

interface Props {
  variant: 'day' | 'night' | 'sleep';
  /** 描画ボックスの一辺（px）。内部は 100×100 基準を viewBox で size に拡縮 */
  size?: number;
  /**
   * 翼の角度（ラジアン）。渡すと羽ばたく。省略時は静止。
   * Reanimated の SharedValue を渡して使う。
   */
  wingAngle?: SharedValue<number>;
  /**
   * 背景の丸・太陽・月・星・Z を描くか。既定 true。
   * false にするとキャラ単体になる。スプラッシュのように背景を呼び出し側が
   * 持つ場合、シーン円が色の付いた円盤として残ってしまうため。
   */
  showScene?: boolean;
  /**
   * 目を閉じるか。既定は variant==='sleep' のとき閉じる。
   * 配色（variant）を変えずに「起きる」だけを表現したい時に明示指定する。
   */
  eyesClosed?: boolean;
  /**
   * 寝息の Z を描くか。既定は variant==='sleep' のとき描く。
   *
   * **showScene とは独立させてある。** 背景の丸は「昼/夜/眠りのシーン」を表す飾りで、
   * Z は「寝ている」というキャラの状態そのもの ── 背景を消したいだけのときに
   * Z まで一緒に消えると、背景なしで寝顔を出せない（記録タブの空表示がこれ）。
   * 既定値を variant から取るのは eyesClosed と同じ作法。
   */
  showZ?: boolean;
  /**
   * Z の色。既定は白（眠りシーンの濃い地色に乗せる前提の色）。
   *
   * **背景の丸を出さないときは呼び出し側が指定すること。** 白のままだと
   * 明色の地（#F2F2F7 など）に融けて見えなくなる。地の色を知っているのは
   * 呼び出し側なので、ここでは theme を参照せず受け取るだけにする
   * （この部品が theme 非依存である理由は冒頭コメント）。
   */
  zColor?: string;
}

export function BirdMascot({
  variant,
  size = 120,
  wingAngle,
  showScene = true,
  eyesClosed,
  showZ,
  zColor = '#FFFFFF',
}: Props) {
  const isDay = variant === 'day';
  const isNight = variant === 'night';
  const isSleep = variant === 'sleep';
  const closed = eyesClosed ?? isSleep;
  const drawZ = showZ ?? isSleep;
  // wingAngle 未指定なら常に 0＝無回転。Hook は条件分岐せず常に呼ぶ。
  // 受け取る角度は移植元に合わせてラジアン。react-native-svg の rotation は度なので変換する。
  const wingProps = useAnimatedProps(() => ({
    rotation: ((wingAngle?.value ?? 0) * 180) / Math.PI,
  }));

  return (
    // viewBox で 100×100 基準を size へ拡縮する（移植元は Group の scale で行っていた）
    <Svg width={size} height={size} viewBox="0 0 100 100">
      {/* ─ 背景の丸（シーン） ─ */}
      {showScene && (
        <Circle
          cx={50}
          cy={50}
          r={48}
          fill={isDay ? '#BFE6FF' : isNight ? '#1E2A55' : '#B8B5E8'}
        />
      )}

      {!showScene ? null : isDay ? (
        <Circle cx={78} cy={24} r={11} fill="#FFD23F" />
      ) : isNight ? (
        <>
          <Circle cx={76} cy={24} r={11} fill="#F3ECC4" />
          <Circle cx={71} cy={21} r={10} fill="#1E2A55" />
          <Circle cx={26} cy={22} r={2} fill="#FFFFFF" />
          <Circle cx={40} cy={14} r={1.5} fill="#FFFFFF" />
          <Circle cx={22} cy={40} r={1.5} fill="#FFFFFF" />
        </>
      ) : (
        /* 眠り背景 */
        <Circle cx={75} cy={25} r={13} fill="#FFF1A8" />
      )}

      {/* 寝息の Z（線で描いた図形。文字ではないので翻訳の対象にならない）。
          描く順はシーンの直後・体の手前のまま ── 体に一部が隠れる重なりが元の見た目 */}
      {drawZ &&
        SLEEP_ZS.map((z) => (
          <Path
            key={z.d}
            d={z.d}
            fill="none"
            stroke={zColor}
            strokeWidth={z.strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}

      {/* ─ キャラ本体（共通） ─ */}
      {/* 尾: 体の右下から斜め後方へ長く伸びる（シマエナガの長い尾） */}
      <Path d="M55 72 L84 86 L82 93 L52 81 Z" fill="#3A3A3C" />
      {/* 足: 体の下にちょこんと2本（左右対称・オレンジ） */}
      <Path
        d="M45 82 L45 90 M42 91 L45 90 L48 91"
        fill="none"
        stroke="#FF9500"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M55 82 L55 90 M52 91 L55 90 L58 91"
        fill="none"
        stroke="#FF9500"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* ふわふわの白い体（＝頭一体型の丸） */}
      <Ellipse cx={50} cy={54} rx={29} ry={31} fill="#FFFFFF" />
      {/* 翼: 体の右側にうっすら黒。肩（WING_ORIGIN）を軸に回せるよう G で包む */}
      <AnimatedG
        animatedProps={wingProps}
        originX={WING_ORIGIN.x}
        originY={WING_ORIGIN.y}
      >
        <Ellipse cx={70} cy={60} rx={9} ry={16} fill="#D8D8DC" />
      </AnimatedG>
      {/* 目 */}
      {closed ? (
        <>
          {/* 閉じた目 */}
          <Path
            d="M39 48 Q42 51 45 48"
            fill="none"
            stroke="#1C1C1E"
            strokeWidth={2}
            strokeLinecap="round"
          />
          <Path
            d="M55 48 Q58 51 61 48"
            fill="none"
            stroke="#1C1C1E"
            strokeWidth={2}
            strokeLinecap="round"
          />
        </>
      ) : (
        <>
          <Circle cx={42} cy={48} r={3} fill="#1C1C1E" />
          <Circle cx={58} cy={48} r={3} fill="#1C1C1E" />
        </>
      )}
      {/* 三角くちばし（オレンジ） */}
      <Path
        d={closed ? 'M47 55 L53 55 L50 58 Z' : 'M47 54 L53 54 L50 60 Z'}
        fill="#FF9500"
      />
      {/* ほっぺ（うっすらピンク） */}
      <Circle cx={36} cy={56} r={3.5} fill="rgba(255,150,170,0.45)" />
      <Circle cx={64} cy={56} r={3.5} fill="rgba(255,150,170,0.45)" />
    </Svg>
  );
}
