// MiniCalc.swift の式評価部分。
// Swift 版は NSExpression を使っていたが、決定 §7-13 により expr-eval で評価する。
// 演算子優先順位・小数の扱いはライブラリ標準に従い、末尾演算子ガード等の UI 側ガードは維持する。
import { Parser } from 'expr-eval';

const OPERATORS = ['/', '*', '-', '+', '='];

export function isCalculatorOperator(label: string): boolean {
  return OPERATORS.includes(label);
}

/**
 * 電卓の表示文字列を評価して次の表示文字列を返す。
 * 空文字・演算子で終わる式・評価不能な式は計算せず、元の表示をそのまま返す。
 * 日本円なので整数なら小数なし、割り算などで小数が出たときだけ小数第 1 位まで表示する。
 */
export function evaluateExpression(display: string): string {
  if (display.length === 0) return display;
  if (isCalculatorOperator(display.slice(-1))) return display;

  let result: number;
  try {
    result = Parser.evaluate(display);
  } catch {
    return display;
  }
  // ゼロ除算（Infinity）や NaN は表示を変えない
  if (!Number.isFinite(result)) return display;

  return result % 1 === 0 ? result.toFixed(0) : result.toFixed(1);
}
