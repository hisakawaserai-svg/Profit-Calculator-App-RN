// 計算メモ（UI-SPEC §7.2〜§7.4）の検証。
// §6.3 のテスト方針どおり、積み上げ・合計・「入れる」の可否はこの純粋関数のテストだけで担保し、
// 画面のスナップショットは取らない。

import { describe, expect, it } from 'vitest';

import {
  appendDigit,
  appendOperator,
  pickPresetsResult,
  presetRowIds,
  presetRowNames,
  backspace,
  clearAll,
  commitRow,
  createMemo,
  editRow,
  evaluateEditingRow,
  isEmptyMemo,
  memoRows,
  memoTotal,
  memoTotalText,
  removeRow,
  rowResultText,
  submitBlockedReason,
  type CalcMemo,
  type CalcMemoRow,
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
        return evaluateEditingRow(current);
      default:
        return appendDigit(current, key);
    }
  }, memo);
}

/** 画面に出る行を「記号 式 = 結果」で並べたもの */
/**
 * いま打てる行（`editingIndex` が指す行）。**位置で持つようになった**ので、
 * 旧 `memo.draft` の代わりにこれで取り出す（logic/calcMemo の CalcMemo）。
 */
function editing(memo: CalcMemo): CalcMemoRow {
  return memoRows(memo)[memo.editingIndex];
}

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
    // 行は 1 つだけで、それが編集中（旧い形では「積んだ行 0 ＋ 別スロットの draft」だった）
    expect(memoRows(memo)).toHaveLength(1);
    expect(memo.editingIndex).toBe(0);
    expect(editing(memo).expression).toBe('120');
    expect(memoTotal(memo)).toBe(120);
  });

  it('1 行目の記号も `＋`（派生決定）', () => {
    expect(editing(createMemo('120')).sign).toBe('+');
  });

  it('品名は常に空（§7.5）。列は持つが値は入れない', () => {
    expect(editing(createMemo('120')).name).toBe('');
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

    expect(visibleRows(memo)).toEqual(['+ 120 = 120', '+ 40 = 40']);
    // 40 はまだ ＋ を押していないが、編集中の行として合計に入る
    expect(memo.editingIndex).toBe(1);
    expect(editing(memo).expression).toBe('40');
    expect(memoTotal(memo)).toBe(160);
  });

  it('押した記号は次の行のもの。積まれる行は自分の記号を保つ', () => {
    const memo = press(createMemo(''), '100−50＋20');

    expect(memoRows(memo).map((row) => row.sign)).toEqual(['+', '-', '+']);
    expect(memoTotal(memo)).toBe(70);
  });

  it('式が空のまま ＋ − を押しても行は積まれず、次の行の記号だけが変わる', () => {
    const memo = press(createMemo(''), '−');

    expect(memoRows(memo)).toHaveLength(1);
    expect(editing(memo).sign).toBe('-');
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
    expect(editing(press(createMemo(''), '×')).expression).toBe('');
  });

  it('演算子を押し直したときは差し替える', () => {
    expect(editing(press(createMemo(''), '12×÷')).expression).toBe('12 ÷');
  });

  it('演算子で終わる式の結果は演算子を押す前の値のまま', () => {
    const memo = press(createMemo(''), '12×');

    expect(rowResultText(editing(memo).expression)).toBe('12');
    expect(memoTotal(memo)).toBe(12);
  });
});

describe('= は行の中だけを確定する（§7.2 追補）', () => {
  it('「2 × 3」で = を押すと式が「6」になる', () => {
    expect(visibleRows(press(createMemo(''), '2×3='))).toEqual(['+ 6 = 6']);
  });

  it('行は確定しない（続けて計算できる状態のまま）', () => {
    const memo = press(createMemo(''), '2×3=');

    expect(memoRows(memo)).toHaveLength(1);
    expect(editing(memo).expression).toBe('6');
    // そのまま次の演算子を続けられる
    expect(visibleRows(press(memo, '×2='))).toEqual(['+ 12 = 12']);
  });

  it('行を積むのは ＋ − と「＋ 行を足す」のまま（= では積まれない）', () => {
    const memo = press(createMemo(''), '2×3=＋2');

    expect(visibleRows(memo)).toEqual(['+ 6 = 6', '+ 2 = 2']);
    expect(memoTotal(memo)).toBe(8);
  });

  it('演算子で終わる式は演算子を落として確定する', () => {
    expect(editing(press(createMemo(''), '12×=')).expression).toBe('12');
  });

  it('空の行や確定済みの行で押しても何も変わらない', () => {
    expect(isEmptyMemo(evaluateEditingRow(createMemo('')))).toBe(true);
    expect(editing(press(createMemo(''), '120==')).expression).toBe('120');
  });

  it('割り切れない式は表示どおり小数第 1 位まで（行の結果と同じ値）', () => {
    expect(editing(press(createMemo(''), '10÷3=')).expression).toBe('3.3');
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
    expect(editing(press(createMemo(''), '120⌫')).expression).toBe('12');
  });

  it('⌫ は演算子を前後の空白ごと 1 手で消す', () => {
    expect(editing(press(createMemo(''), '12×⌫')).expression).toBe('12');
  });

  it('編集中の行が空なら直前の行を編集中に戻す（積んだ操作の取り消し）', () => {
    // 「40」を 2 手で消しきったところ。行はまだ 1 つ積まれている
    const memo = press(createMemo(''), '120＋40⌫⌫');

    expect(memoRows(memo)).toHaveLength(2);
    expect(editing(memo).expression).toBe('');

    // 空の行が消えて、1 つ前が編集中になる
    const undone = backspace(memo);
    expect(memoRows(undone)).toHaveLength(1);
    expect(editing(undone).expression).toBe('120');
    expect(memoTotal(undone)).toBe(120);
  });

  it('戻した行は記号も一緒に戻る', () => {
    const memo = press(createMemo(''), '1500−300⌫⌫⌫');

    expect(editing(backspace(memo)).sign).toBe('+');
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
   * **行は 1 つも動かない。** 編集中の位置が移るだけで並びはそのまま ──
   * 編集中の行を別のスロット（旧 `draft`）で持っていた間は、押した行が末尾へ抜けて
   * **押していない行まで 1 つずつ繰り上がっていた**。
   */
  it('押した行がその場で編集中になり、そのまま × 2 が打てる', () => {
    // 120 ＋ 40 を積んで、編集中の行は空
    const memo = press(createMemo(''), '120＋40＋');
    expect(visibleRows(memo)).toEqual(['+ 120 = 120', '+ 40 = 40', '+  = ']);

    // 最初の行（120）を押す。**空の 3 行目が落ちるだけで、120 と 40 は動かない**
    const edited = editRow(memo, 0);
    expect(visibleRows(edited)).toEqual(['+ 120 = 120', '+ 40 = 40']);
    expect(edited.editingIndex).toBe(0);

    // 続けて × 2 と打てる（これが要件）。打ち先は 1 行目のまま
    expect(visibleRows(press(edited, '×2'))).toEqual(['+ 120 × 2 = 240', '+ 40 = 40']);
    expect(memoTotal(press(edited, '×2'))).toBe(280);
  });

  it('押していない行は 1 つも動かない（並びも id もそのまま）', () => {
    const memo = press(createMemo(''), '120＋40＋15');
    const before = memoRows(memo).map((row) => row.id);

    expect(memoRows(editRow(memo, 0)).map((row) => row.id)).toEqual(before);
    expect(visibleRows(editRow(memo, 0))).toEqual(visibleRows(memo));
  });

  it('空の編集中の行は捨てる（押すたびに空行が増えない）', () => {
    const memo = press(createMemo(''), '120＋40＋');

    expect(memoRows(editRow(memo, 0))).toHaveLength(2);
  });

  it('打ちかけの式はその場で確定する（＋ を押したのと同じ正規化）', () => {
    // 3 行目に「7 ×」まで打ったところで 1 行目を押す
    const memo = press(createMemo(''), '120＋40＋7×');
    const edited = editRow(memo, 0);

    // 末尾の演算子が落ちて「7」で確定する。並びは動かない
    expect(visibleRows(edited)).toEqual(['+ 120 = 120', '+ 40 = 40', '+ 7 = 7']);
    expect(edited.editingIndex).toBe(0);
    expect(memoTotal(edited)).toBe(167);
  });

  it('合計は変わらない', () => {
    const memo = press(createMemo(''), '120＋40＋15');

    expect(memoTotal(editRow(memo, 0))).toBe(memoTotal(memo));
  });

  it('編集中の行そのもの・範囲外を押しても何も起きない（同じ参照を返す）', () => {
    const memo = press(createMemo(''), '120＋40');

    expect(editRow(memo, memo.editingIndex)).toBe(memo);
    expect(editRow(memo, 99)).toBe(memo);
    expect(editRow(memo, -1)).toBe(memo);
  });

  it('プリセットから積んだ行を押すと、名前も色も付いたまま編集中になる', () => {
    const box = { id: 'p-box', name: '箱（小）', value: 120, colorKey: 'blue' };
    const cushion = { id: 'p-cushion', name: '緩衝材', value: 40, colorKey: 'green' };
    const memo = pickPresetsResult(createMemo(''), [box, cushion]).memo;
    const edited = editRow(memo, 0);

    expect(editing(edited).name).toBe('箱（小）');
    expect(editing(edited).presetId).toBe('p-box');
    // 並びが動かないので、選択シートのチェックの順も変わらない
    expect(presetRowIds(edited)).toEqual(['p-box', 'p-cushion']);
  });
});

describe('梱包材プリセットを行にする（SPEC-V3 §4.5 / 案 c）', () => {
  const box = { id: 'p-box', name: '箱（小）', value: 120, colorKey: 'blue' };
  const cushion = { id: 'p-cushion', name: '緩衝材', value: 40, colorKey: 'green' };

  const pick = (memo: CalcMemo, items: { id: string; name: string; value: number; colorKey: string }[]) =>
    pickPresetsResult(memo, items);

  it('空の編集中の行はそこから使う（空行を挟まない）', () => {
    const { memo } = pick(createMemo(''), [box]);

    expect(visibleRows(memo)).toEqual(['+ 120 = 120']);
    expect(memoRows(memo)[0].name).toBe('箱（小）');
    expect(memoRows(memo)[0].colorKey).toBe('blue');
    expect(memoTotal(memo)).toBe(120);
  });

  it('手で打った行の後ろに続ける', () => {
    const { memo, text } = pick(press(createMemo(''), '300'), [box]);

    expect(visibleRows(memo)).toEqual(['+ 300 = 300', '+ 120 = 120']);
    expect(text).toBe('420');
  });

  it('複数件は選んだ順に 1 件 1 行になり、合計に載る', () => {
    const { memo } = pick(createMemo(''), [box, cushion]);

    expect(memoRows(memo).map((row) => row.name)).toEqual(['箱（小）', '緩衝材']);
    expect(visibleRows(memo)).toEqual(['+ 120 = 120', '+ 40 = 40']);
    expect(memoTotal(memo)).toBe(160);
  });

  it('手で打った行は残る（プリセットの行だけが入れ替わる）', () => {
    const { memo } = pick(press(createMemo(''), '120＋40＋'), [cushion]);

    expect(visibleRows(memo)).toEqual(['+ 120 = 120', '+ 40 = 40', '+ 40 = 40']);
    expect(memoTotal(memo)).toBe(200);
  });

  /**
   * **これが `× 2` の導線を保っている条件**（決定 §8-11）── 返した memo をそのまま
   * 電卓の初期値にすれば、最後の 1 件が編集中の行なので続けて掛けられる。
   * 「電卓で続ける」はこの memo を持って電卓を開くだけ（NumericField）。
   */
  it('最後の 1 件が編集中の行なので、そのまま × 2 と打てる（§2.4 の個数）', () => {
    const { memo } = pick(createMemo(''), [box, cushion]);

    expect(visibleRows(press(memo, '×2'))).toEqual(['+ 120 = 120', '+ 40 × 2 = 80']);
    expect(memoTotal(press(memo, '×2'))).toBe(200);
  });

  it('欄へ書く値は電卓の「入れる」と同じ（memoTotalText）', () => {
    const { text, memo } = pick(createMemo(''), [box, cushion]);

    expect(text).toBe('160');
    expect(text).toBe(memoTotalText(memo));
  });

  it('行の id は重複しない', () => {
    const { memo } = pick(createMemo(''), [box, cushion]);
    const ids = memoRows(memo).map((row) => row.id);

    expect(new Set(ids).size).toBe(ids.length);
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
      const first = pick(createMemo(''), [box, cushion]);
      const again = pick(first.memo, [box, cushion]);

      expect(first.text).toBe('160');
      expect(again.text).toBe('160');
    });

    it('外したプリセットの行は落ちる', () => {
      const first = pick(createMemo(''), [box, cushion]);
      const again = pick(first.memo, [box]);

      expect(again.text).toBe('120');
      expect(presetRowNames(again.memo)).toEqual(['箱（小）']);
    });

    it('足したぶんだけ増える', () => {
      const first = pick(createMemo(''), [box]);
      const again = pick(first.memo, [box, cushion]);

      expect(again.text).toBe('160');
      expect(presetRowNames(again.memo)).toEqual(['箱（小）', '緩衝材']);
    });

    it('電卓で × 2 と打った行は、資材を足しても 1 個ぶんに戻らない', () => {
      const first = pick(createMemo(''), [box]);
      // 「電卓で続ける」→ × 2 →「入れる」で確定した積み上げ
      const doubled = press(first.memo, '×2');
      expect(memoTotal(doubled)).toBe(240);

      const again = pick(doubled, [box, cushion]);

      // 箱は 120 × 2 のまま。緩衝材が足されるだけ
      expect(again.text).toBe('280');
    });

    it('手で打った行は残る（選び直しても消えない）', () => {
      const first = pick(createMemo('300'), [box]);
      const again = pick(first.memo, [cushion]);

      // 300（手打ち）＋ 40（緩衝材）。箱は外したので落ちる
      expect(again.text).toBe('340');
      expect(presetRowNames(again.memo)).toEqual(['緩衝材']);
    });

    it('全部外すと手で打った行だけが残る', () => {
      const first = pick(createMemo('300'), [box]);
      const again = pick(first.memo, []);

      expect(again.text).toBe('300');
      expect(presetRowNames(again.memo)).toEqual([]);
    });
  });

  describe('選択シートのチェックの初期値（案 c の presetRowIds）', () => {
    it('積み上げに入っているプリセットの id を積んだ順に返す', () => {
      expect(presetRowIds(pick(createMemo(''), [box, cushion]).memo)).toEqual(['p-box', 'p-cushion']);
    });

    it('手で打った行は id を持たないので落ちる', () => {
      expect(presetRowIds(pick(createMemo('300'), [box]).memo)).toEqual(['p-box']);
    });

    it('× 2 と打っても id は残る（選び直しでチェックが外れない）', () => {
      expect(presetRowIds(press(pick(createMemo(''), [box]).memo, '×2'))).toEqual(['p-box']);
    });

    it('手で打っただけの積み上げは 0 件', () => {
      expect(presetRowIds(press(createMemo(''), '120＋40'))).toEqual([]);
    });
  });

  describe('選んだ資材の名前（案 c の presetRowNames）', () => {
    it('プリセットから来た行の名前を、積んだ順に返す', () => {
      expect(presetRowNames(pick(createMemo(''), [box, cushion]).memo)).toEqual(['箱（小）', '緩衝材']);
    });

    it('手で作った行は名前を持たないので落ちる', () => {
      expect(presetRowNames(pick(createMemo('300'), [box]).memo)).toEqual(['箱（小）']);
    });

    it('× 2 を打っても名前は残る', () => {
      expect(presetRowNames(press(pick(createMemo(''), [box]).memo, '×2'))).toEqual(['箱（小）']);
    });

    it('同じ資材を 2 回選べば 2 回出る（積まれている行と数が食い違わない）', () => {
      expect(presetRowNames(pick(createMemo(''), [box, box]).memo)).toEqual(['箱（小）', '箱（小）']);
    });

    it('手で打っただけの積み上げは 0 件（＝欄の下に行が出ない）', () => {
      expect(presetRowNames(press(createMemo(''), '120＋40'))).toEqual([]);
    });
  });
});
