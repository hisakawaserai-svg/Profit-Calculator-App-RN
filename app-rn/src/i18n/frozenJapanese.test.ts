// 多言語化済みのファイルに、日本語固定の呼び出し（`'ja'`）が残っていないかの検査。
//
// **これも実際に取りこぼした箇所の回帰テスト。** 移行は区切りごとに進めていて、
// まだ移していない画面の呼び出しは `fn('ja', …)` に倒してある。ところが**その画面を
// あとで移したときに、倒したままの `'ja'` を戻し忘れる**ことがある。
// 型は通り、テストも通り、実機でその部分だけ日本語で残る
// （逆算の式・レシートの利益ラベル・帯グラフの項目名が実際にこれで残っていた）。
//
// 判定は 2 つある。
//
// 1. **`const locale = useLocale()` を持つ関数の本文に `'ja'` があったら落とす。**
//    その関数は locale を持っているのだから、日本語で固定する理由がない。
// 2. **移行済みファイルのどこであれ `fn('ja', …)` があったら落とす。**
//    1 だけでは、**locale を購読していない component** が漏れる ── 数字しか出さない
//    つもりの部品が、実は単位や日付を語で持っていることがある。データタブの Y 軸の目盛り
//    （`formatCompactYen('ja', …)`。「9千円」が英語でも出ていた）とタグ選択シートの件数が
//    実際にこれで残っていた。**その場合は component に `useLocale()` を足すのが直し方**で、
//    「locale を持っていないから 'ja' でよい」は理由にならない。
//
// 2 の対象は移行済みファイルだけ ── 未移行の画面と、書き出し CSV（logic/csv.ts）のように
// 出力の中身がまだ日本語固定の logic は、意図して `'ja'` を渡している。
// **バックアップの検証（logic/backup.ts / media/backupArchive.ts）はもう対象**：
// 画面ではなくそこでエラー文を組み立てるので、locale を渡し忘れると
// 英語で使っている人に復元のエラーだけ日本語で出る。

import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { MIGRATED_FILES } from './migratedFiles';

/** 関数の本文（開き波括弧から対応する閉じ波括弧まで）を切り出す */
function bodyEnd(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === '{') depth += 1;
    else if (text[i] === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return text.length;
}

/**
 * ファイル全体に残った `fn('ja', …)`。**関数の外（モジュールスコープ）も見る** ──
 * `const OPTIONS = KINDS.map((k) => label('ja', k))` のような畳み込みは、
 * 言語を切り替えても最初の言語の配列が残る（実際に絞り込みの種別がこれで残っていた）。
 */
function frozenCallsAnywhere(source: string): string[] {
  return (source.match(/(?<![.\w])\w+\('ja'[,)]/g) ?? []).map((call) => call);
}

/** locale を購読している関数の中に残った `'ja'` の呼び出しを拾う */
function frozenCalls(source: string): string[] {
  const found: string[] = [];
  const declaration = /\n(?:export )?(?:default )?function (\w+)\s*\(/g;

  for (let m = declaration.exec(source); m != null; m = declaration.exec(source)) {
    // 引数リストの閉じ括弧を数えてから本文の開き波括弧を探す
    let depth = 1;
    let i = m.index + m[0].length;
    while (i < source.length && depth > 0) {
      if (source[i] === '(') depth += 1;
      else if (source[i] === ')') depth -= 1;
      i += 1;
    }
    const open = source.indexOf('{', i);
    if (open === -1) continue;
    const body = source.slice(open, bodyEnd(source, open));
    if (!body.includes('const locale = useLocale()')) continue;

    for (const call of body.match(/(?<![.\w])\w+\('ja'[,)]/g) ?? []) {
      found.push(`${m[1]}: ${call}`);
    }
  }
  return found;
}

describe('多言語化済みのファイルに日本語固定の呼び出しが残っていない', () => {
  it.each(MIGRATED_FILES)('%s', (file) => {
    expect(frozenCalls(readFileSync(file, 'utf8'))).toEqual([]);
  });
});

// locale を購読していない component にも `'ja'` が残せてしまう（上の検査は素通りする）。
// 移行済みのファイルなら、**関数の外も含めて** 1 つも残っていないのが正しい状態。
describe('多言語化済みのファイルには locale を購読しない `ja` 固定も残っていない', () => {
  it.each(MIGRATED_FILES)('%s', (file) => {
    expect(frozenCallsAnywhere(readFileSync(file, 'utf8'))).toEqual([]);
  });
});
