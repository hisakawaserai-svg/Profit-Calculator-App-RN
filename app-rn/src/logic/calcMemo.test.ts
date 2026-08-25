// 計算メモ（UI-SPEC §7.2〜§7.4）の検証。
// §6.3 のテスト方針どおり、積み上げ・合計・「入れる」の可否はこの純粋関数のテストだけで担保し、
// 画面のスナップショットは取らない。

import { describe, expect, it } from 'vitest';

import {
  appendDigit,
  appendOperator,
  appendPresetRows,
  pickPresetsResult,
  presetRowIds,
  presetRowNames,
  backspace,
  clearAll,
  commitRow,
  createMemo,
  editRow,
  evaluateDraft,
  isEmptyMemo,
  memoRows,
  memoTotal,
  memoTotalText,
  removeRow,
  rowResultText,
  submitBlockedReason,
  type CalcMemo,
} from './calcMemo';

/** キーを押した並びをそのまま流す。`＋` `−` は行の積み上げ、`×` `÷` は行内の計算 */
function press(memo: CalcMemo, keys: string): CalcMemo {
  return [...keys].reduce((current, key) => {
    switch (key) {
      case '＋':
        return commitRow(current, '+');
      case '−':
        return commitRow(current, '-');
      case '×':
      case '÷':
        return appendOperator(current, key);
      case '⌫':
        return backspace(current);
      case '=':
        return evaluateDraft(current);
      default:
        return appendDigit(current, key);
    }
  }, memo);
}

/** 画面に出る行を「記号 式 = 結果」で並べたもの */
function visibleRows(memo: CalcMemo): string[] {
  return memoRows(memo).map(
    (row) => `${row.sign} ${row.expression} = ${rowResultText(row.expression)}`,
  );
}

describe('開いたときの状態（§7.2）', () => {
  it('空・`0` は行なし・編集中の行も空', () => {
    expect(isEmptyMemo(createMemo(''))).toBe(true);
    expect(isEmptyMemo(createMemo('0'))).toBe(true);
    expect(memoTotal(createMemo('0'))).toBe(0);
  });

  it('値が入っていればそれを編集中の行の式に入れる', () => {
    const memo = createMemo('120');
    expect(memo.rows).toHaveLength(0);
    expect(memo.draft.expression).toBe('120');
    expect(memoTotal(memo)).toBe(120);
  });

  it('1 行目の記号も `＋`（派生決定）', () => {
    expect(createMemo('120').draft.sign).toBe('+');
  });

  it('品名は常に空（§7.5）。列は持つが値は入れない', () => {
    expect(createMemo('120').draft.name).toBe('');
    expect(press(createMemo(''), '120＋40').rows[0].name).toBe('');
  });
});

describe('行の積み方（§7.2）', () => {
  it('120 ＋ 40 ＋ 15 で 3 行・合計 175', () => {
    const memo = press(createMemo(''), '120＋40＋15');

    expect(visibleRows(memo)).toEqual(['+ 120 = 120', '+ 40 = 40', '+ 15 = 15']);
    expect(memoTotal(memo)).toBe(175);
  });

  it('1500 − 300 で「＋ 1500」「− 300」・合計 1200', () => {
    const memo = press(createMemo(''), '1500−300');

    expect(visibleRows(memo)).toEqual(['+ 1500 = 1500', '- 300 = 300']);
    expect(memoTotal(memo)).toBe(1200);
  });

  it('編集中の行（＋ をまだ押していない値）も合計に含める（派生決定）', () => {
    const memo = press(createMemo(''), '120＋40');

    expect(memo.rows).toHaveLength(1);
    expect(memo.draft.expression).toBe('40');
    expect(memoTotal(memo)).toBe(160);
  });

  it('押した記号は次の行のもの。積まれる行は自分の記号を保つ', () => {
    const memo = press(createMemo(''), '100−50＋20');

    expect(memoRows(memo).map((row) => row.sign)).toEqual(['+', '-', '+']);
    expect(memoTotal(memo)).toBe(70);
  });

  it('式が空のまま ＋ − を押しても行は積まれず、次の行の記号だけが変わる', () => {
    const memo = press(createMemo(''), '−');

    expect(memo.rows).toHaveLength(0);
    expect(memo.draft.sign).toBe('-');
    expect(isEmptyMemo(memo)).toBe(true);
  });
});

describe('行内の計算（§7.2）', () => {
  it('1500 ÷ 100 も 3 × 25 も 1 行に収まる', () => {
    expect(visibleRows(press(createMemo(''), '1500÷100'))).toEqual(['+ 1500 ÷ 100 = 15']);
    expect(visibleRows(press(createMemo(''), '3×25'))).toEqual(['+ 3 × 25 = 75']);
  });

  it('行内の × ÷ は合計への足し方に影響しない（決めるのは行頭の記号だけ）', () => {
    const memo = press(createMemo(''), '3×25−1500÷100');

    expect(visibleRows(memo)).toEqual(['+ 3 × 25 = 75', '- 1500 ÷ 100 = 15']);
    expect(memoTotal(memo)).toBe(60);
  });

  it('空の行に × ÷ は置けない', () => {
    expect(press(createMemo(''), '×').draft.expression).toBe('');
  });

  it('演算子を押し直したときは差し替える', () => {
    expect(press(createMemo(''), '12×÷').draft.expression).toBe('12 ÷');
  });

  it('演算子で終わる式の結果は演算子を押す前の値のまま', () => {
    const memo = press(createMemo(''), '12×');

    expect(rowResultText(memo.draft.expression)).toBe('12');
    expect(memoTotal(memo)).toBe(12);
  });
});

describe('= は行の中だけを確定する（§7.2 追補）', () => {
  it('「2 × 3」で = を押すと式が「6」になる', () => {
    expect(visibleRows(press(createMemo(''), '2×3='))).toEqual(['+ 6 = 6']);
  });

  it('行は確定しない（続けて計算できる状態のまま）', () => {
    const memo = press(createMemo(''), '2×3=');

    expect(memo.rows).toHaveLength(0);
    expect(memo.draft.expression).toBe('6');
    // そのまま次の演算子を続けられる
    expect(visibleRows(press(memo, '×2='))).toEqual(['+ 12 = 12']);
  });

  it('行を積むのは ＋ − と「＋ 行を足す」のまま（= では積まれない）', () => {
    const memo = press(createMemo(''), '2×3=＋2');

    expect(visibleRows(memo)).toEqual(['+ 6 = 6', '+ 2 = 2']);
    expect(memoTotal(memo)).toBe(8);
  });

  it('演算子で終わる式は演算子を落として確定する', () => {
    expect(press(createMemo(''), '12×=').draft.expression).toBe('12');
  });

  it('空の行や確定済みの行で押しても何も変わらない', () => {
    expect(isEmptyMemo(evaluateDraft(createMemo('')))).toBe(true);
    expect(press(createMemo(''), '120==').draft.expression).toBe('120');
  });

  it('割り切れない式は表示どおり小数第 1 位まで（行の結果と同じ値）', () => {
    expect(press(createMemo(''), '10÷3=').draft.expression).toBe('3.3');
  });
});

describe('合計は表示されている行の結果を足す（§7.6 派生決定）', () => {
  it('丸めた行の結果を足すので 10 ÷ 3 の 3 行は 9.9', () => {
    const memo = press(createMemo(''), '10÷3＋10÷3＋10÷3');

    expect(visibleRows(memo).every((row) => row.endsWith('= 3.3'))).toBe(true);
    expect(memoTotal(memo)).toBe(9.9);
    expect(memoTotalText(memo)).toBe('9.9');
  });

  it('整数の合計は小数を付けない', () => {
    expect(memoTotalText(press(createMemo(''), '120＋40＋15'))).toBe('175');
  });
});

describe('訂正（§7.3）', () => {
  it('⌫ は編集中の行の末尾 1 文字を消す', () => {
    expect(press(createMemo(''), '120⌫').draft.expression).toBe('12');
  });

  it('⌫ は演算子を前後の空白ごと 1 手で消す', () => {
    expect(press(createMemo(''), '12×⌫').draft.expression).toBe('12');
  });

  it('編集中の行が空なら直前の行を編集中に戻す（積んだ操作の取り消し）', () => {
    // 「40」を 2 手で消しきったところ。行はまだ 1 つ積まれている
    const memo = press(createMemo(''), '120＋40⌫⌫');

    expect(memo.rows).toHaveLength(1);
    expect(memo.draft.expression).toBe('');

    const undone = backspace(memo);
    expect(undone.rows).toHaveLength(0);
    expect(undone.draft.expression).toBe('120');
    expect(memoTotal(undone)).toBe(120);
  });

  it('戻した行は記号も一緒に戻る', () => {
    const memo = press(createMemo(''), '1500−300⌫⌫⌫');

    expect(backspace(memo).draft.sign).toBe('+');
  });

  it('何もないところで ⌫ を押しても壊れない', () => {
    expect(isEmptyMemo(backspace(createMemo('')))).toBe(true);
  });

  it('AC はすべて消して初期状態に戻す', () => {
    expect(isEmptyMemo(clearAll())).toBe(true);
    expect(memoTotal(clearAll())).toBe(0);
  });

  it('行の id は重複しない（開いたままのスワイプが隣の行へ移らないため）', () => {
    const memo = press(createMemo(''), '120＋40＋15');
    const ids = memoRows(memo).map((row) => row.id);

    expect(new Set(ids).size).toBe(ids.length);
    // 先頭を消しても残った行の id は変わらない（＝別の行として作り直されない）
    expect(memoRows(removeRow(memo, 0)).map((row) => row.id)).toEqual(ids.slice(1));
  });

  it('行の削除で合計が即座に再計算される', () => {
    const memo = press(createMemo(''), '120＋40＋15');
    const removed = removeRow(memo, 1);

    expect(visibleRows(removed)).toEqual(['+ 120 = 120', '+ 15 = 15']);
    expect(memoTotal(removed)).toBe(135);
  });
});

describe('「入れる」の有効・無効（§7.4）', () => {
  it('行が 1 つもなく編集中の行も空なら無効（入るものがない）', () => {
    expect(submitBlockedReason(createMemo(''))).toBe('empty');
    expect(submitBlockedReason(createMemo('0'))).toBe('empty');
  });

  it('合計が負なら無効（書き戻し先の欄がマイナスを受け付けないため）', () => {
    const memo = press(createMemo(''), '300−500');

    expect(memoTotal(memo)).toBe(-200);
    expect(submitBlockedReason(memo)).toBe('negative');
  });

  it('0 以上なら有効。0 でも入れられる', () => {
    expect(submitBlockedReason(press(createMemo(''), '120'))).toBeNull();
    expect(submitBlockedReason(press(createMemo(''), '300−300'))).toBeNull();
  });
});


describe('積んだ行を編集中にする（UI-SPEC §7.3 の改訂）', () => {
  /**
   * **並べ替えでは編集できるようにならない**（編集中の行は配列の位置ではなく別のスロット）
   * ので、押した行をそのスロットへ移す形にしてある。
   */
  it('押した行が編集中になり、そのまま × 2 が打てる', () => {
    // 120 ＋ 40 を積んで、編集中の行は空
    const memo = press(createMemo(''), '120＋40＋');
    expect(visibleRows(memo)).toEqual(['+ 120 = 120', '+ 40 = 40', '+  = ']);

    // 最初の行（120）を押す
    const edited = editRow(memo, 0);
    expect(visibleRows(edited)).toEqual(['+ 40 = 40', '+ 120 = 120']);

    // 続けて × 2 と打てる（これが要件）
    expect(visibleRows(press(edited, '×2'))).toEqual(['+ 40 = 40', '+ 120 × 2 = 240']);
    expect(memoTotal(press(edited, '×2'))).toBe(280);
  });

  it('空の編集中の行は捨てる（押すたびに空行が増えない）', () => {
    const memo = press(createMemo(''), '120＋40＋');

    expect(memoRows(editRow(memo, 0))).toHaveLength(2);
  });

  it('打ちかけの編集中の行は積まれる（＋ を押したのと同じ扱い）', () => {
    const memo = press(createMemo(''), '120＋40＋7');
    const edited = editRow(memo, 0);

    // 打ちかけの 7 は積まれ、押した 120 が編集中に来る
    expect(visibleRows(edited)).toEqual(['+ 40 = 40', '+ 7 = 7', '+ 120 = 120']);
    expect(memoTotal(edited)).toBe(167);
  });

  it('合計は変わらない（順番が変わるだけ）', () => {
    const memo = press(createMemo(''), '120＋40＋15');

    expect(memoTotal(editRow(memo, 0))).toBe(memoTotal(memo));
  });

  it('編集中の行そのものを押しても何も起きない（同じ参照を返す）', () => {
    const memo = press(createMemo(''), '120＋40');

    // memoRows の末尾＝編集中の行。rows には無いので範囲外になる
    expect(editRow(memo, memo.rows.length)).toBe(memo);
    expect(editRow(memo, 99)).toBe(memo);
  });

  it('プリセットから積んだ行を押すと、名前も色も付いたまま編集中になる', () => {
    const box = { id: 'p-box', name: '箱（小）', value: 120, colorKey: 'blue' };
    const cushion = { id: 'p-cushion', name: '緩衝材', value: 40, colorKey: 'green' };
    const memo = pickPresetsResult(createMemo(''), [box, cushion]).memo;
    const edited = editRow(memo, 0);

    expect(edited.draft.name).toBe('箱（小）');
    expect(edited.draft.presetId).toBe('p-box');
    // 選び直しのチェックも外れない
    expect(presetRowIds(edited)).toEqual(['p-cushion', 'p-box']);
  });
});

describe('梱包材プリセットから行を積む（SPEC-V3 §4.5）', () => {
  const box = { id: 'p-box', name: '箱（小）', value: 120, colorKey: 'blue' };
  const cushion = { id: 'p-cushion', name: '緩衝材', value: 40, colorKey: 'green' };

  it('空の編集中の行はそこから使う（空行を挟まない）', () => {
    const memo = appendPresetRows(createMemo(''), [box]);

    expect(visibleRows(memo)).toEqual(['+ 120 = 120']);
    expect(memoRows(memo)[0].name).toBe('箱（小）');
    expect(memoRows(memo)[0].colorKey).toBe('blue');
    expect(memoTotal(memo)).toBe(120);
  });

  it('値が入っていれば、その行を積んでから後ろに続ける', () => {
    const memo = appendPresetRows(press(createMemo(''), '300'), [box]);

    expect(visibleRows(memo)).toEqual(['+ 300 = 300', '+ 120 = 120']);
    expect(memoTotal(memo)).toBe(420);
  });

  it('複数件は選んだ順に 1 件 1 行で積まれ、合計に載る', () => {
    const memo = appendPresetRows(createMemo(''), [box, cushion]);

    expect(memoRows(memo).map((row) => row.name)).toEqual(['箱（小）', '緩衝材']);
    expect(visibleRows(memo)).toEqual(['+ 120 = 120', '+ 40 = 40']);
    expect(memoTotal(memo)).toBe(160);
  });

  it('既に積んだ行は消さない（追加で積むだけ）', () => {
    const memo = appendPresetRows(press(createMemo(''), '120＋40＋'), [cushion]);

    expect(visibleRows(memo)).toEqual(['+ 120 = 120', '+ 40 = 40', '+ 40 = 40']);
    expect(memoTotal(memo)).toBe(200);
  });

  it('最後の 1 件は編集中の行なので、続けて × 2 と打てる（§2.4 の個数）', () => {
    const memo = press(appendPresetRows(createMemo(''), [box, cushion]), '×2');

    expect(visibleRows(memo)).toEqual(['+ 120 = 120', '+ 40 × 2 = 80']);
    expect(memoTotal(memo)).toBe(200);
  });

  it('0 件を渡しても何も起きない', () => {
    const memo = press(createMemo(''), '120');

    expect(appendPresetRows(memo, [])).toBe(memo);
  });

  describe('行の「🏷」から選んだとき（案 c の pickPresetsResult）', () => {
    it('欄へ書く値と、次に電卓を開いたときの積み上げを一緒に返す', () => {
      const result = pickPresetsResult(createMemo(''), [box, cushion]);

      expect(result.text).toBe('160');
      expect(visibleRows(result.memo)).toEqual(['+ 120 = 120', '+ 40 = 40']);
    });

    it('欄に値が入っていれば、その行を積んでから後ろに続ける（電卓と同じ扱い）', () => {
      const result = pickPresetsResult(createMemo('300'), [box]);

      expect(result.text).toBe('420');
      expect(visibleRows(result.memo)).toEqual(['+ 300 = 300', '+ 120 = 120']);
    });

    /**
     * **これが `× 2` の導線を保っている条件**（決定 §8-11）── 返した memo をそのまま
     * 電卓の初期値にすれば、最後の 1 件が編集中の行なので続けて掛けられる。
     * 「電卓で続ける」はこの memo を持って電卓を開くだけ（NumericField）。
     */
    it('返した積み上げの最後の 1 件は編集中の行なので、そのまま × 2 が打てる', () => {
      const result = pickPresetsResult(createMemo(''), [box, cushion]);

      // 行の id は採番なので、比べるのは見えている行（電卓で積んだ直後と同じ並び・同じ式）
      expect(visibleRows(press(result.memo, '×2'))).toEqual(
        visibleRows(press(appendPresetRows(createMemo(''), [box, cushion]), '×2')),
      );
      expect(memoTotal(press(result.memo, '×2'))).toBe(200);
    });

    it('欄へ書く値は電卓の「入れる」と同じ（memoTotalText）', () => {
      const result = pickPresetsResult(createMemo(''), [box, cushion]);

      expect(result.text).toBe(memoTotalText(result.memo));
    });
  });

  /**
   * **選び直しは積み増しではなく置き換え。**
   *
   * 行の「🏷」には積み上げが見えていないので、開き直して同じものを選ぶたびに増えると
   * 黙って倍になる（実機で「箱 ＋ テープ」を選び直して 140 円になった）。
   * `presetRowIds` でチェックが復元されることと対で「選び直し」が成り立つ。
   */
  describe('もう一度選び直したとき（案 c の置き換え）', () => {
    it('同じものを選び直しても倍にならない', () => {
      const first = pickPresetsResult(createMemo(''), [box, cushion]);
      const again = pickPresetsResult(first.memo, [box, cushion]);

      expect(first.text).toBe('160');
      expect(again.text).toBe('160');
    });

    it('外したプリセットの行は落ちる', () => {
      const first = pickPresetsResult(createMemo(''), [box, cushion]);
      const again = pickPresetsResult(first.memo, [box]);

      expect(again.text).toBe('120');
      expect(presetRowNames(again.memo)).toEqual(['箱（小）']);
    });

    it('足したぶんだけ増える', () => {
      const first = pickPresetsResult(createMemo(''), [box]);
      const again = pickPresetsResult(first.memo, [box, cushion]);

      expect(again.text).toBe('160');
      expect(presetRowNames(again.memo)).toEqual(['箱（小）', '緩衝材']);
    });

    it('電卓で × 2 と打った行は、資材を足しても 1 個ぶんに戻らない', () => {
      const first = pickPresetsResult(createMemo(''), [box]);
      // 「電卓で続ける」→ × 2 → 「入れる」で確定した積み上げ
      const doubled = press(first.memo, '×2');
      expect(memoTotal(doubled)).toBe(240);

      const again = pickPresetsResult(doubled, [box, cushion]);

      // 箱は 120 × 2 のまま。緩衝材が足されるだけ
      expect(again.text).toBe('280');
    });

    it('手で打った行は残る（選び直しても消えない）', () => {
      const first = pickPresetsResult(createMemo('300'), [box]);
      const again = pickPresetsResult(first.memo, [cushion]);

      // 300（手打ち）＋ 40（緩衝材）。箱は外したので落ちる
      expect(again.text).toBe('340');
      expect(presetRowNames(again.memo)).toEqual(['緩衝材']);
    });

    it('全部外すと手で打った行だけが残る', () => {
      const first = pickPresetsResult(createMemo('300'), [box]);
      const again = pickPresetsResult(first.memo, []);

      expect(again.text).toBe('300');
      expect(presetRowNames(again.memo)).toEqual([]);
    });
  });

  describe('選択シートのチェックの初期値（案 c の presetRowIds）', () => {
    it('積み上げに入っているプリセットの id を積んだ順に返す', () => {
      const result = pickPresetsResult(createMemo(''), [box, cushion]);

      expect(presetRowIds(result.memo)).toEqual(['p-box', 'p-cushion']);
    });

    it('手で打った行は id を持たないので落ちる', () => {
      const result = pickPresetsResult(createMemo('300'), [box]);

      expect(presetRowIds(result.memo)).toEqual(['p-box']);
    });

    it('× 2 と打っても id は残る（選び直しでチェックが外れない）', () => {
      const result = pickPresetsResult(createMemo(''), [box]);

      expect(presetRowIds(press(result.memo, '×2'))).toEqual(['p-box']);
    });

    it('手で打っただけの積み上げは 0 件', () => {
      expect(presetRowIds(press(createMemo(''), '120＋40'))).toEqual([]);
    });
  });

  describe('選んだ資材の名前（案 c の presetRowNames）', () => {
    it('プリセットから来た行の名前だけを、積んだ順に返す', () => {
      const memo = appendPresetRows(createMemo(''), [box, cushion]);

      expect(presetRowNames(memo)).toEqual(['箱（小）', '緩衝材']);
    });

    it('手で打った行は名前を持たないので落ちる', () => {
      const memo = appendPresetRows(press(createMemo(''), '300'), [box]);

      expect(presetRowNames(memo)).toEqual(['箱（小）']);
    });

    it('× 2 を打っても名前は残る（編集中の行も見るため）', () => {
      const memo = press(appendPresetRows(createMemo(''), [box]), '×2');

      expect(presetRowNames(memo)).toEqual(['箱（小）']);
    });

    it('同じ資材を 2 回選べば 2 回出る（積まれている行と数が食い違わない）', () => {
      const memo = appendPresetRows(createMemo(''), [box, box]);

      expect(presetRowNames(memo)).toEqual(['箱（小）', '箱（小）']);
    });

    it('手で打っただけの積み上げは 0 件（＝欄の下に行が出ない）', () => {
      expect(presetRowNames(press(createMemo(''), '120＋40'))).toEqual([]);
    });
  });

  it('行の id は重複しない（空の編集中の行は id ごと使い回す）', () => {
    const before = createMemo('');
    const memo = appendPresetRows(before, [box, cushion]);
    const ids = memoRows(memo).map((row) => row.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.at(-1)).toBe(before.draft.id);
  });
});
