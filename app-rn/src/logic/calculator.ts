// MiniCalc.swift の式評価部分。
// Swift 版は NSExpression を使っていたが、決定 §7-13 により expr-eval で評価する。
// 演算子優先順位・小数の扱いはライブラリ標準に従い、末尾演算子ガード等の UI 側ガードは維持する。
//
// UI-SPEC §7.1 で画面に出る記号を `×` `÷` に変えた。**記号の変換はこのファイルに閉じる**（§7.6）──
// 行の式（logic/calcMemo.ts）は表示どおりの記号で保持し、画面側でも置換しない。
// ここが `×` `÷` を受け取れる唯一の場所で、評価の直前にだけ ASCII へ直す。
import { Parser } from 'expr-eval';

/** 画面に出る記号 → expr-eval が読む記号（UI-SPEC §7.1 のキーパッド） */
const DISPLAY_OPERATORS: Record<string, string> = {
  '×': '*',
  '÷': '/',
  // `−`（U+2212）`＋`（U+FF0B）は行頭の記号（§7.2）なので式には入らないが、
  // 同じ字が式に混じっても評価できるようにしておく（画面の字とここの表を 1 対 1 にする）
  '−': '-',
  '＋': '+',
};

/**
 * 電卓の演算子。`=` は §7.1 でキーごと廃止したので含めない（行の結果が常に出るため）。
 * ASCII の 4 記号を残してあるのは、末尾演算子ガードが表示用と ASCII のどちらの式にも効くようにするため。
 */
const OPERATORS = [...Object.keys(DISPLAY_OPERATORS), '/', '*', '-', '+'];

export function isCalculatorOperator(label: string): boolean {
  return OPERATORS.includes(label);
}

/** 表示用の式を expr-eval が読める形にする（§7.6） */
function toEvaluableExpression(display: string): string {
  return display.replace(/[×÷−＋]/g, (symbol) => DISPLAY_OPERATORS[symbol]);
}

/**
 * 電卓が出す数値の表示規則。
 * 日本円なので整数なら小数なし、割り算などで小数が出たときだけ小数第 1 位まで表示する。
 *
 * 行の結果・合計・書き戻しの値がすべて同じ丸めになるよう 1 か所に置く（UI-SPEC §7.6 派生決定）。
 */
export function formatCalculatorNumber(value: number): string {
  return value % 1 === 0 ? value.toFixed(0) : value.toFixed(1);
}

/**
 * 電卓の表示文字列を評価して次の表示文字列を返す。
 * 空文字・演算子で終わる式・評価不能な式は計算せず、元の表示をそのまま返す。
 */
export function evaluateExpression(display: string): string {
  // 式は「1500 ÷ 100」のように空白を含む（§7.2）ので、末尾の判定は空白を落としてから行う
  const expression = display.trim();
  if (expression.length === 0) return display;
  if (isCalculatorOperator(expression.slice(-1))) return display;

  let result: number;
  try {
    result = Parser.evaluate(toEvaluableExpression(expression));
  } catch {
    return display;
  }
  // ゼロ除算（Infinity）や NaN は表示を変えない
  if (!Number.isFinite(result)) return display;

  return formatCalculatorNumber(result);
}
