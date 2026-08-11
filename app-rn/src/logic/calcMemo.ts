// 電卓の「計算メモ」（UI-SPEC §7.2）。
//
// 1 回きりの計算しかできない電卓を、行を積み上げて合計を出す計算メモにする。
// 画面（components/MiniCalculator.tsx）はここが返す新しい state を持つだけで、
// 式の組み立ても合計の算出も持たない（§6.3 のテスト方針どおり、担保はこの純粋関数側）。
//
// 式は**表示どおりの記号**（`×` `÷`）で保持する。ASCII への変換は calculator.ts の中だけ（§7.6）。

import { evaluateExpression, formatCalculatorNumber, isCalculatorOperator } from './calculator';

/** 行頭の記号。**その行を合計へどう足すか**を表す（§7.2）。行内の `×` `÷` は関係しない */
export type CalcRowSign = '+' | '-';

export type CalcMemoRow = {
  /**
   * 行の識別子。**計算には関与せず、画面のリストキーにだけ使う**。
   * 添字をキーにすると、行を消したときに開いたままのスワイプが 1 つ下の行へ引き継がれる
   * （消えるのは末尾の要素で、残った要素が中身だけ差し替わるため）。
   */
  id: number;
  sign: CalcRowSign;
  /**
   * 品名。**現時点では常に空**（§7.5）。空なら列の幅は 0 で、式が左端から始まる。
   * 将来の梱包材プリセットで左列に入る想定なので、後から列を足さずに済むよう最初から持たせる。
   */
  name: string;
  /** 表示どおりの式（「1500 ÷ 100」）。四則演算が使え、`3 × 25` も 1 行に収まる */
  expression: string;
};

export type CalcMemo = {
  /** 積んだ行 */
  rows: CalcMemoRow[];
  /**
   * 編集中の行（積み上げの最終行）。常に 1 行あり、**その結果も合計に含める**（§7.2 派生決定）──
   * `＋` をまだ押していない値が合計から漏れると、見えている数字と合計が食い違うため。
   */
  draft: CalcMemoRow;
};

/** 「入れる」を押せない理由（§7.4）。文言は labels.ts の calculatorBlockedNote */
export type CalcSubmitBlockedReason = 'empty' | 'negative';

/**
 * 行の識別子を配る。積み上げはシートを閉じれば消える（§7.4）ので、連番は 1 つで足りる。
 * 既存の行を作り直すときは常に元の行を展開する（`{ ...row }`）ので、id は行に付いて回る。
 */
let lastRowId = 0;

function newRow(sign: CalcRowSign, expression = ''): CalcMemoRow {
  lastRowId += 1;
  return { id: lastRowId, sign, name: '', expression };
}

/**
 * 開いたときの状態（§7.2）。
 * 呼び出し元の欄が空 or `0` なら行なし・編集中の行も空。値が入っていればそれを編集中の行の式に入れる。
 */
export function createMemo(initialText: string): CalcMemo {
  const expression = initialText === '0' ? '' : initialText;
  return { rows: [], draft: newRow('+', expression) };
}

/** 積んだ行 ＋ 編集中の行。画面に出る行の並びそのもの */
export function memoRows(memo: CalcMemo): CalcMemoRow[] {
  return [...memo.rows, memo.draft];
}

function endsWithOperator(expression: string): boolean {
  const trimmed = expression.trimEnd();
  return trimmed !== '' && isCalculatorOperator(trimmed.slice(-1));
}

/**
 * 評価にかける形へ整える。末尾の演算子は落とす ──
 * 演算子で終わる式は評価しないため、その行の結果は「演算子を押す前の値のまま」になる（§7.2）。
 */
function normalizeExpression(expression: string): string {
  let normalized = expression.trimEnd();
  while (normalized !== '' && isCalculatorOperator(normalized.slice(-1))) {
    normalized = normalized.slice(0, -1).trimEnd();
  }
  return normalized;
}

function withDraftExpression(memo: CalcMemo, expression: string): CalcMemo {
  return { rows: memo.rows, draft: { ...memo.draft, expression } };
}

/** 数字キー。演算子の直後は空白を挟んで「1500 ÷ 1」の形にする */
export function appendDigit(memo: CalcMemo, digit: string): CalcMemo {
  const expression = memo.draft.expression;
  if (expression === '') return withDraftExpression(memo, digit);
  return withDraftExpression(
    memo,
    endsWithOperator(expression) ? `${expression} ${digit}` : `${expression}${digit}`,
  );
}

/**
 * `×` `÷`。**行は積まれず、編集中の行の式に続く**（§7.2）。
 * 空の行には置けない（左辺のない式になるため）。押し直したときは記号を差し替える。
 */
export function appendOperator(memo: CalcMemo, operator: string): CalcMemo {
  const expression = memo.draft.expression.trimEnd();
  if (expression === '') return memo;
  return withDraftExpression(
    memo,
    endsWithOperator(expression)
      ? `${expression.slice(0, -1)}${operator}`
      : `${expression} ${operator}`,
  );
}

/**
 * `=`（§7.2 追補）。**編集中の行の中だけで**計算を確定し、式を結果に置き換える。
 *
 * 行の結果は右端に常に出ているので `=` は本来なくても足りるが、電卓では `=` を押す手が先に出る
 * （押しても何も起きないと壊れて見える）。行は積まないので、`6` になったところから
 * そのまま `× 2` と続けられる。行を積むのは `＋` `−` と「＋ 行を足す」のまま。
 */
export function evaluateDraft(memo: CalcMemo): CalcMemo {
  const result = rowResultText(memo.draft.expression);
  if (result === '') return memo;
  return withDraftExpression(memo, result);
}

/**
 * `＋` `−` と「＋ 行を足す」（§7.2）。編集中の行を確定して積み、次の行を `sign` で始める。
 * 積まれる行が持つのは**その行自身の記号**で、押した記号は次の行のもの。
 *
 * 式が空のまま押したときは行を積まず、次の行の記号だけを差し替える（空行は積まない）。
 */
export function commitRow(memo: CalcMemo, sign: CalcRowSign): CalcMemo {
  const expression = normalizeExpression(memo.draft.expression);
  if (expression === '') {
    return { rows: memo.rows, draft: { ...memo.draft, sign } };
  }
  return { rows: [...memo.rows, { ...memo.draft, expression }], draft: newRow(sign) };
}

/**
 * `⌫`（§7.3）。編集中の行の末尾 1 文字を消す。
 * 編集中の行が空のときは**直前に積んだ行を編集中に戻す**（＝行を積んだ操作の取り消し。派生決定）。
 */
export function backspace(memo: CalcMemo): CalcMemo {
  if (memo.draft.expression !== '') {
    // 演算子は前後の空白ごと 1 手で消す（見えている記号 1 個ぶんが 1 手）
    const trimmed = memo.draft.expression.trimEnd();
    return withDraftExpression(memo, trimmed.slice(0, -1).trimEnd());
  }

  const last = memo.rows.at(-1);
  if (last == null) return memo;
  return { rows: memo.rows.slice(0, -1), draft: last };
}

/** `AC`（§7.3）。確認は挟まない ── 積み上げはシートを閉じれば消えるもので、失われるものが小さい */
export function clearAll(): CalcMemo {
  return createMemo('');
}

/** 行の左スワイプ →「削除」（§7.3）。編集中の行はスワイプの対象にしないので rows の添字だけ */
export function removeRow(memo: CalcMemo, index: number): CalcMemo {
  return { rows: memo.rows.filter((_, i) => i !== index), draft: memo.draft };
}

/** その行の結果（右端に出る文字列）。式が空なら空文字 */
export function rowResultText(expression: string): string {
  const normalized = normalizeExpression(expression);
  if (normalized === '') return '';
  return evaluateExpression(normalized);
}

/** 記号どおりに符号を付けた行の値。評価できない式は 0 として扱う */
function rowValue(row: CalcMemoRow): number {
  const value = Number.parseFloat(rowResultText(row.expression));
  if (!Number.isFinite(value)) return 0;
  return row.sign === '-' ? -value : value;
}

/**
 * 合計（§7.1-5）。**表示されている行の結果**を符号どおりに足した値（§7.6 派生決定）──
 * 丸める前の値で足すと、見えている行を足した数と合計が食い違うことがあるため。
 * 端数は行ごとに小数第 1 位までなので、最後に浮動小数の誤差だけを落とす。
 */
export function memoTotal(memo: CalcMemo): number {
  const total = memoRows(memo).reduce((sum, row) => sum + rowValue(row), 0);
  return Math.round(total * 10) / 10;
}

/** 書き戻す値（§7.4）。合計だけを渡す。行は渡さない */
export function memoTotalText(memo: CalcMemo): string {
  return formatCalculatorNumber(memoTotal(memo));
}

/** 行が 1 つもなく編集中の行も空（＝入るものがない） */
export function isEmptyMemo(memo: CalcMemo): boolean {
  return memo.rows.length === 0 && normalizeExpression(memo.draft.expression) === '';
}

/**
 * 「入れる」の有効・無効（§7.4）。
 * 負を弾くのは、書き戻し先の数値欄がマイナスを受け付けない（`sanitizeNumericInput` が `-` を落とす）ため。
 * フィルタ側ではなく電卓の側で止める（§7.4）。
 */
export function submitBlockedReason(memo: CalcMemo): CalcSubmitBlockedReason | null {
  if (isEmptyMemo(memo)) return 'empty';
  return memoTotal(memo) < 0 ? 'negative' : null;
}
