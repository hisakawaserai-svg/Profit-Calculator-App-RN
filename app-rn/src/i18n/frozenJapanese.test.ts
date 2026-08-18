// 多言語化済みのファイルに、日本語固定の呼び出し（`'ja'`）が残っていないかの検査。
//
// **これも実際に取りこぼした箇所の回帰テスト。** 移行は区切りごとに進めていて、
// まだ移していない画面の呼び出しは `fn('ja', …)` に倒してある。ところが**その画面を
// あとで移したときに、倒したままの `'ja'` を戻し忘れる**ことがある。
// 型は通り、テストも通り、実機でその部分だけ日本語で残る
// （逆算の式・レシートの利益ラベル・帯グラフの項目名が実際にこれで残っていた）。
//
// 判定は単純で、**`const locale = useLocale()` を持つ関数の本文に `'ja'` があったら落とす**。
// その関数は locale を持っているのだから、日本語で固定する理由がない。

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
