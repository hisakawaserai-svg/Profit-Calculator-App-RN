import { describe, expect, it } from 'vitest';

import {
  BADGE_BORDER_CONTRAST,
  contrastRatio,
  hexToRgb,
  isIndistinguishable,
  normalizeHex,
  readableForeground,
  relativeLuminance,
} from './color';

describe('normalizeHex', () => {
  it('6 桁は大文字の #RRGGBB にする', () => {
    expect(normalizeHex('#4a6cf7')).toBe('#4A6CF7');
    expect(normalizeHex('4A6CF7')).toBe('#4A6CF7');
    expect(normalizeHex('  #4a6cf7  ')).toBe('#4A6CF7');
  });

  it('3 桁は展開する', () => {
    expect(normalizeHex('#f00')).toBe('#FF0000');
    expect(normalizeHex('abc')).toBe('#AABBCC');
  });

  it('読めない値は null（空文字・桁数違い・16 進以外・アルファ付き）', () => {
    expect(normalizeHex('')).toBeNull();
    expect(normalizeHex('#')).toBeNull();
    expect(normalizeHex('#12345')).toBeNull();
    expect(normalizeHex('#GGGGGG')).toBeNull();
    expect(normalizeHex('rgb(0,0,0)')).toBeNull();
    // 8 桁（アルファ付き）は受けない（バッジの地色に半透明を入れない）
    expect(normalizeHex('#FF000080')).toBeNull();
    // 色キー（旧形式）も色としては読めない
    expect(normalizeHex('blue')).toBeNull();
  });
});

describe('hexToRgb', () => {
  it('3 チャンネルに割る', () => {
    expect(hexToRgb('#FF8000')).toEqual({ r: 255, g: 128, b: 0 });
    expect(hexToRgb('#000')).toEqual({ r: 0, g: 0, b: 0 });
  });

  it('読めない値は null', () => {
    expect(hexToRgb('nope')).toBeNull();
  });
});

describe('relativeLuminance', () => {
  it('白は 1・黒は 0', () => {
    expect(relativeLuminance('#FFFFFF')).toBeCloseTo(1, 5);
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 5);
  });

  it('WCAG の係数どおり緑が最も明るく・青が最も暗い（RGB 平均ではない）', () => {
    const red = relativeLuminance('#FF0000')!;
    const green = relativeLuminance('#00FF00')!;
    const blue = relativeLuminance('#0000FF')!;

    expect(green).toBeCloseTo(0.7152, 4);
    expect(red).toBeCloseTo(0.2126, 4);
    expect(blue).toBeCloseTo(0.0722, 4);
    // 平均なら 3 つとも同じになる。ここが違うことが「平均を使っていない」証拠
    expect(green).toBeGreaterThan(red);
    expect(red).toBeGreaterThan(blue);
  });

  it('中間グレーは線形化のぶん 0.5 より暗い（ガンマを掛けていない証拠）', () => {
    expect(relativeLuminance('#808080')).toBeCloseTo(0.2159, 3);
  });

  it('読めない値は null', () => {
    expect(relativeLuminance('')).toBeNull();
  });
});

describe('contrastRatio', () => {
  it('白と黒は 21、同じ色どうしは 1', () => {
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 5);
    expect(contrastRatio('#4A6CF7', '#4A6CF7')).toBeCloseTo(1, 5);
  });

  it('順番を入れ替えても同じ', () => {
    expect(contrastRatio('#FFCC00', '#FFFFFF')).toBeCloseTo(
      contrastRatio('#FFFFFF', '#FFCC00')!,
      5,
    );
  });
});

describe('readableForeground', () => {
  it('明るい色には黒', () => {
    expect(readableForeground('#FFFFFF')).toBe('#000000');
    expect(readableForeground('#FFCC00')).toBe('#000000');
    expect(readableForeground('#FFE0B2')).toBe('#000000');
  });

  it('暗い色には白', () => {
    expect(readableForeground('#000000')).toBe('#FFFFFF');
    expect(readableForeground('#1B1464')).toBe('#FFFFFF');
    expect(readableForeground('#5856D6')).toBe('#FFFFFF');
  });

  it('選んだ側のコントラストが必ず高い', () => {
    for (const hex of ['#FF3B30', '#00FF00', '#0000FF', '#7F7F7F', '#123456', '#ABCDEF']) {
      const chosen = readableForeground(hex);
      const other = chosen === '#FFFFFF' ? '#000000' : '#FFFFFF';
      expect(contrastRatio(hex, chosen)!).toBeGreaterThanOrEqual(contrastRatio(hex, other)!);
    }
  });

  it('読めない値でも落ちない（白に倒す）', () => {
    expect(readableForeground('')).toBe('#FFFFFF');
  });
});

describe('isIndistinguishable', () => {
  it('下地と同じ色は埋もれる', () => {
    expect(isIndistinguishable('#FFFFFF', '#FFFFFF')).toBe(true);
    expect(isIndistinguishable('#1C1C1E', '#1C1C1E')).toBe(true);
  });

  it('白いカードの上のごく薄い色は埋もれる', () => {
    expect(isIndistinguishable('#FDFDF5', '#FFFFFF')).toBe(true);
    expect(isIndistinguishable('#DDDDDD', '#FFFFFF')).toBe(true);
  });

  it('暗いカードの上のごく暗い色は埋もれる', () => {
    expect(isIndistinguishable('#232325', '#1C1C1E')).toBe(true);
    expect(isIndistinguishable('#000000', '#1C1C1E')).toBe(true);
  });

  it('既存パレットでいちばん下地に近い黄（ライト）でも埋もれない', () => {
    // ここが埋もれると既存の見た目が変わる。しきい値の上限はこの 1.51 で決まっている
    expect(contrastRatio('#FFCC00', '#FFFFFF')!).toBeGreaterThan(BADGE_BORDER_CONTRAST);
    expect(isIndistinguishable('#FFCC00', '#FFFFFF')).toBe(false);
  });

  it('はっきり違う色は埋もれない', () => {
    expect(isIndistinguishable('#007AFF', '#FFFFFF')).toBe(false);
    expect(isIndistinguishable('#FF453A', '#1C1C1E')).toBe(false);
  });
});
