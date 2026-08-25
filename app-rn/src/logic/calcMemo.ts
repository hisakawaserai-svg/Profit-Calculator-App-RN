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
   * 品名（§7.5）。梱包材プリセットから積んだ行にはその名前が入る（SPEC-V3 §4.5）。
   * 手で作った行は空で、空なら列の幅は 0 になり式が左端から始まる。
   */
  name: string;
  /**
   * この行の出どころのプリセット id（SPEC-V3 §4.5）。**手で作った行は空文字。**
   *
   * 名前ではなく id を持つのは、**プリセット名が一意ではない**ため（validatePreset は
   * 重複を弾かない）── 同じ名前の梱包材が 2 件あると、名前では選び直しの照合ができない。
   *
   * これがあるので「🏷 をもう一度開いたとき、いま入っているものにチェックが付いている」
   * （presetRowIds）と「選び直すと積み増しではなく置き換わる」（pickPresetsResult）が
   * 成り立つ。**表示には使わない**（品名列に出るのは name）。
   */
  presetId: string;
  /**
   * 品名の前に出すバッジの色キー（SPEC-V3 §4.5 / 設計案 26c）。手で作った行は空文字。
   *
   * §8-6 は「電卓は数字を読む面なので品名にバッジは出さない」と決めていたが、
   * 実装してみると**名前だけの行は、自分で打った行と見分けが付かない**。
   * どれがプリセットから積んだ行かが色で分かる方が、積み上げを読み直すときに速い。
   * 色そのものはプリセットの保存値で、ここでは持ち回すだけ（正規化は PresetBadge 側）。
   */
  colorKey: string;
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
  return { id: lastRowId, sign, name: '', presetId: '', colorKey: '', expression };
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

/** 梱包材プリセット 1 件ぶん（SPEC-V3 §4.5）。行に写すのは id・名前・金額・色 */
export type CalcPresetItem = {
  /** 選び直しの照合に使う（CalcMemoRow.presetId）。名前は一意ではないので id で持つ */
  id: string;
  name: string;
  value: number;
  colorKey: string;
};

/**
 * 「梱包材から選ぶ」で選んだぶんを行として積む（SPEC-V3 §4.5）。
 *
 * - **1 件が 1 行**（`sign = '+'`、`name` はプリセット名、式は金額）。積んである行は消さない。
 * - 編集中の行が空ならそこから使い、値が入っていればその行を積んでから後ろに続ける。
 * - **最後の 1 件は編集中の行にする** ── 積んだ直後に `× 2` と打って個数を掛けられるように
 *   （§2.4 でプリセットに個数欄を持たせなかったぶんを、この続きの打ち方で賄う）。
 * - 合計は「表示されている行の結果の和」（`memoTotal`）のままなので、ここでは何も足さない。
 */
export function appendPresetRows(memo: CalcMemo, items: readonly CalcPresetItem[]): CalcMemo {
  const last = items.at(-1);
  if (last == null) return memo;

  const rows = [...memo.rows];
  const draftExpression = normalizeExpression(memo.draft.expression);

  // 空の draft は id ごと使い回す（行のリストキーが飛ばないように）
  let base = memo.draft;
  if (draftExpression !== '') {
    rows.push({ ...memo.draft, expression: draftExpression });
    base = newRow('+');
  }

  for (const item of items.slice(0, -1)) {
    rows.push({ ...newRow('+'), ...presetRowFields(item) });
  }

  return { rows, draft: { ...base, ...presetRowFields(last) } };
}

function presetRowFields(item: CalcPresetItem) {
  return {
    sign: '+' as const,
    name: item.name,
    presetId: item.id,
    colorKey: item.colorKey,
    expression: formatCalculatorNumber(item.value),
  };
}

/**
 * **行の「🏷」から梱包材を選んだときの結果**（案 c。SPEC-V3 §4.5 の改訂）。
 *
 * 入口が電卓の中から金額行へ移ったので、選んだ瞬間に「欄へ書き戻す値」と
 * 「次に電卓を開いたときの積み上げ」の両方をここで作る ──
 * **電卓の「入れる」（MiniCalculator の onSubmit）が返しているものと同じ 2 つ。**
 *
 * ## 積み増しではなく**置き換え**（`appendPresetRows` との違い）
 *
 * `appendPresetRows` は**電卓の中で使う前提**の関数で、積んである行を消さずに足す ──
 * 積み上げが目の前に見えているので、増えることが画面から分かる。
 *
 * **行の「🏷」は目の前に積み上げが無い。** そこで積み増しにすると、
 * シートを開き直して選び直すたびに黙って倍になる（「箱 ＋ テープ」を選び直して 140 円）。
 * この口が答えているのは「この記録でどの梱包材を使ったか」という 1 つの問いなので、
 * **答え直したら前の答えは置き換わる**のが素直。だから:
 *
 * - **手で打った行は残す**（`presetId` が空の行）── 「300 と打ってから箱を選ぶ」は足し算のまま
 * - **選ばれ続けているプリセットの行はそのまま使い回す** ── 電卓で `× 2` と打った行が、
 *   資材を 1 つ足しただけで 1 個ぶんに戻らない
 * - **外したプリセットの行は落ちる**
 * - **新しく選ばれたものは末尾に足す**
 *
 * 選び直しのチェックの初期値は `presetRowIds` が返す（同じ `presetId` で照合する）。
 *
 * ## `× 2` の導線（決定 §8-11）
 *
 * **最後の 1 件を編集中の行にする**ので、このあと 🖩 を押した電卓は
 * 「電卓の中で選んで入れた直後」と同じ状態で開き、続けて `× 2` と打てる。
 * 個数欄を持たないという結論はそのままで、変わったのは選ぶ場所だけ。
 *
 * `text` は**まだ欄のフィルタを通していない**（`sanitizeNumericInput` は呼び出し側）──
 * 書き戻しの経路を電卓と 1 本に保つため（UI-SPEC §7.4）。
 */
export function pickPresetsResult(
  memo: CalcMemo,
  items: readonly CalcPresetItem[],
): { text: string; memo: CalcMemo } {
  const rows = memoRows(memo);

  // 手で打った行だけ残す。空の行（開いた直後の編集中の行）は落とす ──
  // 残すと選んだ資材の前に空行が 1 つ挟まる
  const manual = rows.filter(
    (row) => row.presetId === '' && normalizeExpression(row.expression) !== '',
  );

  // 既に積んである行を id で引けるようにする（選ばれ続けているものを使い回すため）
  const existing = new Map(rows.filter((row) => row.presetId !== '').map((row) => [row.presetId, row]));

  const picked = items.map(
    (item) => existing.get(item.id) ?? { ...newRow('+'), ...presetRowFields(item) },
  );

  const last = picked.at(-1);
  const next: CalcMemo = {
    rows: [...manual, ...picked.slice(0, -1)],
    // 選択を全部外したときは編集中の行を空に戻す（手で打った行は上に残る）
    draft: last ?? newRow('+'),
  };
  return { text: memoTotalText(next), memo: next };
}

/**
 * 積み上げに入っているプリセットの id（案 c）。**選択シートのチェックの初期値。**
 *
 * これがあるので、「🏷」を開き直したときに**いま欄に入っているものにチェックが付く** ──
 * 付いていないと、選び直しのつもりで同じものをもう一度選んで二重に積むことになる
 * （`pickPresetsResult` が置き換えなのはそのため。両方揃って初めて選び直しが成り立つ）。
 *
 * 並びは積んである順（＝前に選んだ順）。名前ではなく id で返す理由は `CalcMemoRow.presetId`。
 */
export function presetRowIds(memo: CalcMemo): string[] {
  return memoRows(memo)
    .map((row) => row.presetId)
    .filter((presetId) => presetId !== '');
}

/**
 * 積み上げのうち**プリセットから来た行の名前**（案 c の「選んだ名前の行」）。
 *
 * 手で作った行は `name` が空なので落ちる ── 拾えるのは「🏷 から選んだもの」だけで、
 * 打ち込んだ数字が名前として現れることはない。
 * 編集中の行も見る（`memoRows`）── 選んだ最後の 1 件はそこに入っているため。
 *
 * **同じ資材を 2 回選べば 2 回出る。** 積まれている行がそのまま 2 行なので、
 * ここで畳むと画面と行の数が食い違う。
 */
export function presetRowNames(memo: CalcMemo): string[] {
  return memoRows(memo)
    .map((row) => row.name)
    .filter((name) => name !== '');
}

/**
 * **積んだ行を編集中の行にする**（UI-SPEC §7.3 の改訂）。`index` は `memoRows` の並びの位置。
 *
 * 電卓で打てるのは編集中の行だけで、それは配列の中の位置ではなく**別のスロット**
 * （`draft`）── だから「並べ替え」では編集できるようにならない。押した行を
 * そのスロットへ移す、というのがこの関数。
 *
 * - **押した行は末尾（編集中）へ移る。** 合計は行の結果の和なので、順番が変わっても値は同じ
 * - **それまでの編集中の行は、空でなければ積まれる**（`＋` を押したのと同じ扱い）。
 *   空なら捨てる ── 何も打っていない行を残すと、押すたびに空行が増える
 * - **編集中の行そのものを押しても何も起きない**（既にそこにいる）
 *
 * これで「あとから最初の行に `× 2` を掛ける」ができる。`⌫` の巻き戻し（空の編集中の行で
 * 直前の 1 行を戻す）は末尾にしか届かないので、そちらとは別の操作として持つ。
 */
export function editRow(memo: CalcMemo, index: number): CalcMemo {
  const target = memo.rows[index];
  // 範囲外（＝編集中の行を押した）ときは何もしない。同じ参照を返して再描画も起こさない
  if (target == null) return memo;

  const rest = memo.rows.filter((_, position) => position !== index);
  const draftExpression = normalizeExpression(memo.draft.expression);

  return {
    rows: draftExpression === '' ? rest : [...rest, { ...memo.draft, expression: draftExpression }],
    draft: target,
  };
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
