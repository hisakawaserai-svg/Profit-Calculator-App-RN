// 表示文字列の組み立ての検証。
// 期待値は UI-SPEC / SPEC の記述と Claude Design のモックの表記から導出している。

import { describe, expect, it } from 'vitest';

import {
  formatApproxYenSymbol,
  formatCompactYen,
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

describe('formatCompactYen — 軸の目盛り（単位をラベルごとに書き切る。案 37b）', () => {
  it('1000 未満はそのまま「円」', () => {
    expect(formatCompactYen(300)).toBe('300円');
    expect(formatCompactYen(600)).toBe('600円');
    expect(formatCompactYen(999)).toBe('999円');
  });

  it('1000 から「千円」', () => {
    expect(formatCompactYen(1000)).toBe('1千円');
    expect(formatCompactYen(3000)).toBe('3千円');
    expect(formatCompactYen(9000)).toBe('9千円');
  });

  it('10000 から「万円」', () => {
    expect(formatCompactYen(10000)).toBe('1万円');
    expect(formatCompactYen(100000)).toBe('10万円');
    expect(formatCompactYen(300000)).toBe('30万円');
    expect(formatCompactYen(1000000)).toBe('100万円');
  });

  it('キリのいい目盛り（1 / 1.5 / 2 / 3 / 5 × 10^n の整数倍）は小数第 1 位までで収まる', () => {
    // 幅 1500 の段（1.5 × 10^3）
    expect([1500, 3000, 4500, 6000].map(formatCompactYen)).toEqual([
      '1.5千円',
      '3千円',
      '4.5千円',
      '6千円',
    ]);
    // 幅 15000 の段（1.5 × 10^4）
    expect([15000, 30000, 45000].map(formatCompactYen)).toEqual(['1.5万円', '3万円', '4.5万円']);
    // 幅 3000 の段は 4 段目で万に乗る（単位が混ざるが、ラベルごとに書いてあるので読み違えない）
    expect([3000, 6000, 9000, 12000].map(formatCompactYen)).toEqual([
      '3千円',
      '6千円',
      '9千円',
      '1.2万円',
    ]);
  });

  it('0 には単位を付けない', () => {
    expect(formatCompactYen(0)).toBe('0');
    expect(formatCompactYen(-0)).toBe('0');
  });

  it('負の値でも壊れない（符号を付けたまま同じ規則）', () => {
    expect(formatCompactYen(-600)).toBe('-600円');
    expect(formatCompactYen(-3000)).toBe('-3千円');
    expect(formatCompactYen(-45000)).toBe('-4.5万円');
  });

  it('境界（999 / 1000 / 9999 / 10000）', () => {
    expect(formatCompactYen(999)).toBe('999円');
    expect(formatCompactYen(1000)).toBe('1千円');
    // 9999 は「千円」側。小数第 1 位に丸めるので「10千円」になるが、
    // キリのいい目盛りにこの値は現れない（現れるのは 9000 → 10000 の跳び方）
    expect(formatCompactYen(9999)).toBe('10千円');
    expect(formatCompactYen(10000)).toBe('1万円');
  });

  it('非有限値でも壊れない', () => {
    expect(formatCompactYen(Number.NaN)).toBe('NaN');
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

  it('**負の値は負号を ¥ の前に出す**（純利益はマイナスになり得る。§2.3。¥ の直後に負号を置く「¥-12,685」にはしない ── 一覧の行・グラフカード・帯グラフの符号つき表記と順序を揃えるため）', () => {
    expect(formatYenSymbol(-12685)).toBe('-¥12,685');
  });

  it('丸めの規則は変わっていない ── roundForDisplay を通した値に区切りを入れるだけ', () => {
    // §2.6 の Math.round（四捨五入。負値も同じ）。区切りの導入で丸め方が動いていないこと
    expect(formatYenSymbol(12685.4)).toBe('¥12,685');
    expect(formatYenSymbol(12685.5)).toBe('¥12,686');
    expect(formatYenSymbol(0.4)).toBe('¥0');
    expect(formatYenSymbol(0.5)).toBe('¥1');
    expect(formatYenSymbol(-0.5)).toBe('¥0'); // Math.round(-0.5) = -0
    expect(formatYenSymbol(-1234.5)).toBe('-¥1,234'); // Math.round(-1234.5) = -1234
  });

  it('丸めた結果に小数は残らない（区切りは整数に入る）', () => {
    for (const value of [1234.49, 99999.99, -55555.55]) {
      const rounded = roundForDisplay(value);
      const expected = rounded < 0 ? `-¥${groupDigits(Math.abs(rounded))}` : `¥${groupDigits(rounded)}`;
      expect(formatYenSymbol(value)).toBe(expected);
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
