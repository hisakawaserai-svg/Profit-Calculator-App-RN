// 色そのものの計算（SPEC-V7 §1）。**テーマもパレットも知らない純粋関数だけを置く。**
//
// ここが答えるのは 3 つだけ:
//   1. その文字列は色として読めるか（normalizeHex）
//   2. その色の上に置く文字は白と黒のどちらが読めるか（readableForeground）
//   3. その色は下地に埋もれるか（isIndistinguishable）
//
// 輝度は **WCAG 2.x の相対輝度**（sRGB を線形化してから係数で重み付け）で出す。
// RGB の単純平均は使わない ── 人の目は緑に敏感で赤青に鈍いので、平均だと
// 純緑（明るく見える）と純青（暗く見える）が同じ明るさとして扱われてしまう。

/** 既定の落とし先。空文字・壊れた値が来たときにここへ倒す（呼び出し側が渡す） */
export type Rgb = { r: number; g: number; b: number };

/**
 * `#RGB` / `#RRGGBB` を `#RRGGBB`（大文字）に正規化する。読めなければ null。
 *
 * `#` 無しも受ける ── カラーピッカーやコピペから来る値は付いていないことがある。
 * アルファ付き（8 桁）は受けない: バッジの地色に半透明が入ると、下地の色によって
 * 文字色の判定が変わってしまい、「この色ならこの文字色」と決められなくなる。
 */
export function normalizeHex(value: string): string | null {
  const body = value.trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]+$/.test(body)) return null;

  if (body.length === 3) {
    const [r, g, b] = body;
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  if (body.length === 6) return `#${body.toUpperCase()}`;
  return null;
}

/** `#RRGGBB` → 0〜255 の 3 つ。正規化済みの値だけを渡すこと */
export function hexToRgb(hex: string): Rgb | null {
  const normalized = normalizeHex(hex);
  if (normalized == null) return null;
  return {
    r: Number.parseInt(normalized.slice(1, 3), 16),
    g: Number.parseInt(normalized.slice(3, 5), 16),
    b: Number.parseInt(normalized.slice(5, 7), 16),
  };
}

/** sRGB の 1 チャンネル（0〜1）を線形化する（WCAG 2.x の定義そのまま） */
function linearize(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

/**
 * 相対輝度（WCAG 2.x）。0（黒）〜1（白）。読めない値は null。
 *
 * 係数（0.2126 / 0.7152 / 0.0722）は人の目の感度そのもので、
 * **緑が最も明るく・青が最も暗く**効く。
 */
export function relativeLuminance(hex: string): number | null {
  const rgb = hexToRgb(hex);
  if (rgb == null) return null;
  return (
    0.2126 * linearize(rgb.r / 255) +
    0.7152 * linearize(rgb.g / 255) +
    0.0722 * linearize(rgb.b / 255)
  );
}

/** 2 色のコントラスト比（WCAG 2.x）。1（同じ色）〜21（白と黒） */
export function contrastRatio(a: string, b: string): number | null {
  const first = relativeLuminance(a);
  const second = relativeLuminance(b);
  if (first == null || second == null) return null;
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

export const WHITE = '#FFFFFF';
export const BLACK = '#000000';

/**
 * その地色の上で読める文字色（白か黒）。**コントラスト比が高い方**を返す。
 *
 * 自由色（カラーピッカーで選んだ色）の文字色はこれで決める。
 * **固定パレットの 11 色はこれを通さない** ── 比率だけで決めると
 * `#007AFF`（iOS の青）のような彩度の高い色が黒文字になり、慣習から外れて見える。
 * 既存の見た目を 1 ドットも変えない決定（SPEC-V7 §2.2）に従い、あちらは表で持つ。
 */
export function readableForeground(hex: string): string {
  const luminance = relativeLuminance(hex);
  // 読めない値はここでは倒せない（呼び出し側が既定色へ倒す）。白を返しておく
  if (luminance == null) return WHITE;
  return contrastRatio(hex, WHITE)! >= contrastRatio(hex, BLACK)! ? WHITE : BLACK;
}

/**
 * バッジに輪郭が要るか（SPEC-V7 §4）。**下地との差がこれ未満なら埋もれる。**
 *
 * 1.45 なのは、**既存の 11 色に輪郭を出さない**ための上限がここだから ──
 * 明暗どちらでも下地といちばん近いのは黄（ライトの `#FFCC00` が白いカードの上で 1.51）で、
 * これを超える値にすると既存の見た目が変わる。下限側は、白いカードの上の
 * `#DDDDDD`（1.40）が輪郭を得る程度には高い。
 */
export const BADGE_BORDER_CONTRAST = 1.45;

export function isIndistinguishable(
  hex: string,
  surface: string,
  threshold: number = BADGE_BORDER_CONTRAST,
): boolean {
  const ratio = contrastRatio(hex, surface);
  // 読めない値は既定色に倒ってから来るので、ここへは来ない。来たら輪郭は出さない
  if (ratio == null) return false;
  return ratio < threshold;
}
