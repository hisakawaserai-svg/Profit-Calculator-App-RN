// 式評価（SPEC 決定 §7-13）と、UI-SPEC §7.1 で画面に出すことにした `×` `÷` の扱いの検証。
// 記号の変換は calculator.ts に閉じる（§7.6）ので、`×` `÷` を入れて正しい値が返ることを
// ここで担保し、呼び出し側（calcMemo / MiniCalculator）では ASCII を一切扱わない。

import { describe, expect, it } from 'vitest';

import { evaluateExpression, formatCalculatorNumber, isCalculatorOperator } from './calculator';

describe('isCalculatorOperator', () => {
  it('画面に出る記号を演算子として扱う', () => {
    expect(isCalculatorOperator('×')).toBe(true);
    expect(isCalculatorOperator('÷')).toBe(true);
    expect(isCalculatorOperator('−')).toBe(true);
    expect(isCalculatorOperator('＋')).toBe(true);
  });

  it('数字は演算子ではない', () => {
    expect(isCalculatorOperator('7')).toBe(false);
    expect(isCalculatorOperator('')).toBe(false);
  });

  it('`=` はキーごと廃止したので演算子ではない（§7.1）', () => {
    expect(isCalculatorOperator('=')).toBe(false);
  });
});

describe('evaluateExpression', () => {
  it('`×` `÷` を評価できる（画面には `*` `/` を出さない）', () => {
    expect(evaluateExpression('1500 ÷ 100')).toBe('15');
    expect(evaluateExpression('3 × 25')).toBe('75');
  });

  it('従来の ASCII の式も評価できる', () => {
    expect(evaluateExpression('12+3')).toBe('15');
    expect(evaluateExpression('10*10')).toBe('100');
  });

  it('割り算で小数が出たときだけ小数第 1 位まで出す', () => {
    expect(evaluateExpression('10 ÷ 3')).toBe('3.3');
    expect(evaluateExpression('10 ÷ 2')).toBe('5');
  });

  it('演算子で終わる式は評価しない（空白付きでも同じ）', () => {
    expect(evaluateExpression('1500 ÷ ')).toBe('1500 ÷ ');
    expect(evaluateExpression('12+')).toBe('12+');
  });

  it('ゼロ除算・空文字・評価不能な式は表示を変えない', () => {
    expect(evaluateExpression('10 ÷ 0')).toBe('10 ÷ 0');
    expect(evaluateExpression('')).toBe('');
    expect(evaluateExpression('((')).toBe('((');
  });
});

describe('formatCalculatorNumber', () => {
  it('整数は小数なし、端数は小数第 1 位まで', () => {
    expect(formatCalculatorNumber(175)).toBe('175');
    expect(formatCalculatorNumber(3.3333)).toBe('3.3');
    expect(formatCalculatorNumber(-300)).toBe('-300');
  });
});
