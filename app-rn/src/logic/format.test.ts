// 表示文字列の組み立ての検証。
// 期待値は UI-SPEC / SPEC の記述と Claude Design のモックの表記から導出している。

import { describe, expect, it } from 'vitest';

import {
  formatApproxYenSymbol,
  formatSignedYenSymbol,
  formatYen,
  formatYenSymbol,
  formatYenTight,
  groupDigits,
} from './format';
import { roundForDisplay } from './profit';

describe('groupDigits — 整数部の 3 桁区切り', () => {
  it('3 桁以下はそのまま（区切りを入れる場所がない）', () => {
    expect(groupDigits(0)).toBe('0');
    expect(groupDigits(1)).toBe('1');
    expect(groupDigits(999)).toBe('999');
  });

  it('4 桁から区切りが入る', () => {
    expect(groupDigits(1000)).toBe('1,000');
    expect(groupDigits(12685)).toBe('12,685');
    expect(groupDigits(123456)).toBe('123,456');
    expect(groupDigits(1234567)).toBe('1,234,567');
  });

  it('負の値は符号を残して絶対値側だけ刻む', () => {
    expect(groupDigits(-1000)).toBe('-1,000');
    expect(groupDigits(-12685)).toBe('-12,685');
    expect(groupDigits(-999)).toBe('-999');
  });

  it('小数はそのまま残す（丸めはこの関数の責務ではない。§2.6）', () => {
    expect(groupDigits(1234.5)).toBe('1,234.5');
    expect(groupDigits(-1234.5)).toBe('-1,234.5');
    expect(groupDigits(0.5)).toBe('0.5');
  });

  it('非有限値でも壊れない', () => {
    expect(groupDigits(Number.NaN)).toBe('NaN');
    expect(groupDigits(Number.POSITIVE_INFINITY)).toBe('Infinity');
  });
});

describe('formatYenSymbol — 「¥12,685」（区切りあり）', () => {
  it('5 桁を超える額に区切りが入る', () => {
    expect(formatYenSymbol(12685)).toBe('¥12,685');
    expect(formatYenSymbol(15145)).toBe('¥15,145');
    expect(formatYenSymbol(1234567)).toBe('¥1,234,567');
  });

  it('3 桁以下と 0 は従来どおり', () => {
    expect(formatYenSymbol(0)).toBe('¥0');
    expect(formatYenSymbol(980)).toBe('¥980');
  });

  it('負の値も壊れない（純利益はマイナスになり得る。§2.3）', () => {
    expect(formatYenSymbol(-12685)).toBe('¥-12,685');
  });

  it('丸めの規則は変わっていない ── roundForDisplay を通した値に区切りを入れるだけ', () => {
    // §2.6 の Math.round（四捨五入。負値も同じ）。区切りの導入で丸め方が動いていないこと
    expect(formatYenSymbol(12685.4)).toBe('¥12,685');
    expect(formatYenSymbol(12685.5)).toBe('¥12,686');
    expect(formatYenSymbol(0.4)).toBe('¥0');
    expect(formatYenSymbol(0.5)).toBe('¥1');
    expect(formatYenSymbol(-0.5)).toBe('¥0'); // Math.round(-0.5) = -0
    expect(formatYenSymbol(-1234.5)).toBe('¥-1,234'); // Math.round(-1234.5) = -1234
  });

  it('丸めた結果に小数は残らない（区切りは整数に入る）', () => {
    for (const value of [1234.49, 99999.99, -55555.55]) {
      expect(formatYenSymbol(value)).toBe(`¥${groupDigits(roundForDisplay(value))}`);
      expect(formatYenSymbol(value)).not.toContain('.');
    }
  });
});

describe('formatSignedYenSymbol — 符号つき「+¥4,500」', () => {
  it('符号の内側に区切りが入る', () => {
    expect(formatSignedYenSymbol(4500)).toBe('+¥4,500');
    expect(formatSignedYenSymbol(12685)).toBe('+¥12,685');
    expect(formatSignedYenSymbol(-12685)).toBe('-¥12,685');
  });

  it('0 は符号なしの「¥0」（「+¥0」は増えたと読める）', () => {
    expect(formatSignedYenSymbol(0)).toBe('¥0');
    expect(formatSignedYenSymbol(0.4)).toBe('¥0');
  });

  it('丸めは従来どおり表示の瞬間だけ', () => {
    expect(formatSignedYenSymbol(4499.5)).toBe('+¥4,500');
    expect(formatSignedYenSymbol(-4499.6)).toBe('-¥4,500');
  });
});

describe('formatApproxYenSymbol — 「約¥12,685」', () => {
  it('「約」の内側の金額に区切りが入る', () => {
    expect(formatApproxYenSymbol(12685)).toBe('約¥12,685');
    expect(formatApproxYenSymbol(980)).toBe('約¥980');
  });
});

describe('「円」表記は区切りなしのまま（Swift 版に合わせる）', () => {
  it('formatYen / formatYenTight は変えていない', () => {
    expect(formatYen(12685)).toBe('12685 円');
    expect(formatYenTight(12685)).toBe('12685円');
  });
});
