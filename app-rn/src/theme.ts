// Color+Extensions.swift の移植。
// Swift 版の platformBackground / platformSecondaryBackground は
// macOS・Mac Catalyst で固定色に分岐していたが、決定 §7-14 で macOS はスコープ外のため
// iOS 側（systemGroupedBackground / secondarySystemGroupedBackground）のみを移植する。
// 併せて、各 View が .green / .red / .orange / .blue / .secondary で参照していた
// システム標準色もここに集約する。
import { useColorScheme } from 'react-native';

import type { PresetColorKey } from '@/logic/preset';

export type ThemeColors = {
  /** UIColor.systemGroupedBackground 相当。画面の地色 */
  background: string;
  /** UIColor.secondarySystemGroupedBackground 相当。カード・入力欄の地色 */
  secondaryBackground: string;
  /** Color.primary 相当 */
  label: string;
  /** Color.secondary 相当 */
  secondaryLabel: string;
  /**
   * 未入力の欄に出す「未入力」の色（UI-SPEC §1.3-10 / §1.4-4 の「40% グレー」）。
   * secondaryLabel（60%）より薄いのは、伝票の中で**値が無い行**だけを一段落とすため。
   */
  mutedLabel: string;
  /** Divider 相当 */
  separator: string;
  /**
   * 「選べない／中身がない」ことを示す最も薄い前景色（UI-SPEC §1.2）。
   * 月バーの無効な矢印、期間シートの記録のない月・未来の月に使う。
   * 設計案の指定は明色の `rgba(60,60,67,.25)`。暗色は同じ薄さに見えるところまで反転させる
   * （黒地にそのまま置くと消えてしまい、「薄い」ではなく「無い」に見える）。
   */
  disabledContent: string;
  /** 純利益プラス・必要販売価格 */
  green: string;
  /** 純利益マイナス */
  red: string;
  /**
   * 販売手数料の行（UI-SPEC §1.1 / §1.3 / §1.4）。
   * 電卓の演算子キーは青に変えたので、電卓の中にオレンジは出ない（§7.1）。
   */
  orange: string;
  /** 電卓ボタン・電卓の演算子キー・決定ボタン */
  blue: string;
  gray: string;
  /** タグ・プリセットのパレット（logic/preset.ts の PresetColorKey） */
  teal: string;
  /** 同上 */
  yellow: string;
  /** データタブの累計収支の折れ線（UI-SPEC §1.5-4） */
  indigo: string;
  /** 同上（パレット） */
  purple: string;
  /** disabled 時に入力欄へかぶせる地色 */
  disabledBackground: string;
  /**
   * 選択中・注目させたい行に敷く薄い青の下地（UI-SPEC §1.2 のチップ / §8.3 のハイライト）。
   * 「売れた」を押した直後に売れた日の行へ数秒だけ敷き、どこを直せばいいかを指す。
   */
  highlightBackground: string;
  /**
   * 逆算結果の帯グラフで経費に使う赤系 4 色（計算タブ §1.1-3b）。
   *
   * 並びは仕入価格・送料・梱包材・その他で固定する。入力済みの項目だけを詰めて塗ると、
   * 項目を 1 つ足しただけで既存の区画の色が入れ替わり、帯と一覧の対応を覚え直すことになる。
   * 手元（green）・販売手数料（orange）と混ざらないよう、赤の 1 色相を明度だけで振る。
   */
  expenseTones: readonly [string, string, string, string];
  /**
   * 使いかたの図の帯で「引かれるもの」に使うグレー 3 段（案 `20a`）。
   *
   * **計算タブの帯（expenseTones の赤系）とは別に持つ。** 図は説明用の固定値で、
   * 実際の記録とは連動しない（案 `20a`）── 同じ赤を使うと「自分の数字が出ている」と
   * 読まれる。図の語彙はオレンジ＝手数料 / グレー＝引かれるもの / 緑＝手元に残る分の 3 つで、
   * グレーの中の区別（送料・経費・仕入）だけを明度で付ける。
   * 並びは薄い順。仕入は帯の中で最も広く、文字を載せるので最も濃い側を使う。
   */
  helpDiagramTones: readonly [string, string, string];
  /**
   * 内容の上に重ねる固定バーの地色（UI-SPEC §1.1-2 / §1.1-7）。
   *
   * 設計案は「半透明地＋境界線でリストから浮かせる」だが、素の半透明色では下の
   * 結果額がバーの数字に重なって二重に見えるため、地色は不透明にして境界線で浮かせる。
   * iOS 純正バーの半透明はブラー（背景をぼかす処理）であって単純な α 合成ではない。
   */
  barBackground: string;
  /**
   * 2 択（SegmentedControl）の**選択中の側の地色**。
   *
   * カードの地色（secondaryBackground）を流用していたが、**ダークでは両者が同じ色**
   * （#1C1C1E）で、持ち上がった側がカードに溶けて「どちらが選ばれているか」が読めなかった。
   * 明色では白のまま（iOS 標準の見た目）、暗色では**器（disabledBackground）より明るい灰**にして、
   * 器・選択中・カードの 3 つが別の明度で並ぶようにする。
   */
  selectedSegmentBackground: string;
  /**
   * プリセットのバッジの色（SPEC-V3 §1.3）。キーは logic/preset.ts の PresetColorKey。
   *
   * **既存のセマンティック色（green = 収支プラス / red = 経費 / orange = 販売手数料）とは
   * 別の定義にしてある**（§1.3）。同じ色相を使っていても、セマンティック色を直したときに
   * バッジの色まで動かないようにするため。
   *
   * 値が `{ background, foreground }` の対なのは、白文字が乗らない色（yellow など）が
   * あるため（§1.3）。**前景色は色ごとに読める方を選んである**ので、
   * 明色と暗色で白黒が入れ替わる色がある（暗色側は地色が明るくなるぶん黒が読める）。
   */
  presetTones: Record<PresetColorKey, PresetTone>;
};

/** バッジ 1 色ぶん。文字色を色ごとに持つ理由は ThemeColors.presetTones を参照 */
export type PresetTone = {
  background: string;
  foreground: string;
};

const light: ThemeColors = {
  background: '#F2F2F7',
  secondaryBackground: '#FFFFFF',
  label: '#000000',
  secondaryLabel: 'rgba(60, 60, 67, 0.6)',
  mutedLabel: 'rgba(60, 60, 67, 0.4)',
  separator: 'rgba(60, 60, 67, 0.29)',
  disabledContent: 'rgba(60, 60, 67, 0.25)',
  green: '#34C759',
  red: '#FF3B30',
  orange: '#FF9500',
  blue: '#007AFF',
  gray: '#8E8E93',
  teal: '#30B0C7',
  yellow: '#FFCC00',
  indigo: '#5856D6',
  purple: '#AF52DE',
  disabledBackground: 'rgba(120, 120, 128, 0.12)',
  highlightBackground: 'rgba(0, 122, 255, 0.12)',
  barBackground: '#F2F2F7',
  selectedSegmentBackground: '#FFFFFF',
  expenseTones: ['#FF3B30', '#FF6F61', '#FF9E93', '#FFC4BC'],
  helpDiagramTones: ['#D1D1D6', '#AEAEB2', '#8E8E93'],
  presetTones: {
    red: { background: '#FF3B30', foreground: '#FFFFFF' },
    orange: { background: '#F07800', foreground: '#FFFFFF' },
    yellow: { background: '#FFCC00', foreground: '#000000' },
    green: { background: '#2E9E4F', foreground: '#FFFFFF' },
    teal: { background: '#1E93AE', foreground: '#FFFFFF' },
    blue: { background: '#007AFF', foreground: '#FFFFFF' },
    indigo: { background: '#5856D6', foreground: '#FFFFFF' },
    purple: { background: '#9A3FCB', foreground: '#FFFFFF' },
    pink: { background: '#FF2D55', foreground: '#FFFFFF' },
    brown: { background: '#8E6B4A', foreground: '#FFFFFF' },
    // 11 色目（SPEC-V7 §2.1）。色相を持たない 1 色 ── 残っている色相はどれも
    // 既存の 10 色と隣り合うので、色味でではなく「無彩色」で見分けさせる
    gray: { background: '#6E6E73', foreground: '#FFFFFF' },
  },
};

const dark: ThemeColors = {
  background: '#000000',
  secondaryBackground: '#1C1C1E',
  label: '#FFFFFF',
  secondaryLabel: 'rgba(235, 235, 245, 0.6)',
  mutedLabel: 'rgba(235, 235, 245, 0.4)',
  separator: 'rgba(84, 84, 88, 0.6)',
  disabledContent: 'rgba(235, 235, 245, 0.25)',
  green: '#30D158',
  red: '#FF453A',
  orange: '#FF9F0A',
  blue: '#0A84FF',
  gray: '#8E8E93',
  teal: '#40C8E0',
  yellow: '#FFD60A',
  indigo: '#5E5CE6',
  purple: '#BF5AF2',
  disabledBackground: 'rgba(120, 120, 128, 0.24)',
  // 暗い地色の上では 12% だと下地に沈むので、明度差が同じくらいに見えるまで上げる
  highlightBackground: 'rgba(10, 132, 255, 0.24)',
  barBackground: '#000000',
  // 器（rgba(120,120,128,0.24) ≒ #3A3A3C 相当）より明るい灰。白文字が乗る明度に留める
  selectedSegmentBackground: '#636366',
  expenseTones: ['#FF453A', '#FF6F63', '#FF9A90', '#FFC0B8'],
  // 暗い地の上では明度の向きを反転させる（薄い順は保つ）。白文字が載る側を最も明るくしない
  helpDiagramTones: ['#48484A', '#5E5E63', '#7C7C80'],
  presetTones: {
    red: { background: '#FF453A', foreground: '#FFFFFF' },
    orange: { background: '#FF9F0A', foreground: '#000000' },
    yellow: { background: '#FFD60A', foreground: '#000000' },
    green: { background: '#30D158', foreground: '#000000' },
    teal: { background: '#40C8E0', foreground: '#000000' },
    blue: { background: '#0A84FF', foreground: '#FFFFFF' },
    indigo: { background: '#7D7BEA', foreground: '#FFFFFF' },
    purple: { background: '#BF5AF2', foreground: '#FFFFFF' },
    pink: { background: '#FF375F', foreground: '#FFFFFF' },
    brown: { background: '#AC8E68', foreground: '#000000' },
    // 暗い地の上では明るい側へ振る（他の色と同じ作法）。黒文字が読める明度
    gray: { background: '#A1A1A6', foreground: '#000000' },
  },
};

export const themes = { light, dark };

/** 端末の外観設定（app.json の userInterfaceStyle: automatic）に追従した配色を返す。 */
export function useThemeColors(): ThemeColors {
  return useColorScheme() === 'dark' ? dark : light;
}
