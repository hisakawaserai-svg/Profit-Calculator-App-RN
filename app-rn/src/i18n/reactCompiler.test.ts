// 多言語化した画面が React Compiler に「定数」と見なされていないことの検証。
//
// **これは一度実際に壊した箇所の回帰テスト。** 表示語を `helpLinkLabel()` のように
// 引数なしで呼ぶと、コンパイラは依存が無いと判断して初回の値で固定する
// （生成コードに `Symbol.for("react.memo_cache_sentinel")` が入る）。
// そうなると言語を切り替えて再描画させても文字列が変わらない ── しかも型は通り、
// テストも通り、実機で見るまで分からない。だから生成コードそのものを見る。
//
// locale を引数で渡してあれば `if ($[0] !== locale)` という依存付きのキャッシュになるので、
// sentinel の枝に labels.ts の呼び出しが入ることはない。

import { transformSync } from '@babel/core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/** 多言語化済みの画面（ステップ 2 で移した画面もここに足す） */
const MIGRATED_SCREENS = [
  'app/(tabs)/_layout.tsx',
  'app/(tabs)/settings/index.tsx',
  'app/(tabs)/(calc)/index.tsx',
  'src/components/AddRecordFab.tsx',
  'src/components/AddRecordMenuSheet.tsx',
  'src/components/CostProportionBar.tsx',
  'src/components/LanguageSelector.tsx',
  'src/components/MiniCalculator.tsx',
  'src/components/NumericField.tsx',
  'src/components/PresetTagButton.tsx',
  'src/components/RecordKindSelector.tsx',
  'src/components/SiteNameRow.tsx',
  'src/components/Stepper.tsx',
  // 区切り 2-2: 記録タブの一覧
  'src/screens/RecordListScreen.tsx',
  'src/components/LongPressCopy.tsx',
  'src/components/MonthNavBar.tsx',
  'src/components/PeriodSheet.tsx',
  'src/components/RecordRow.tsx',
  'src/components/SearchBar.tsx',
  // 区切り 2-3: 記録の入力フォーム
  'src/screens/RecordFormSheet.tsx',
  'src/components/PhotoField.tsx',
  'src/components/TagChip.tsx',
  'src/components/TagPickerSheet.tsx',
  // 区切り 2-4: レコード詳細・絞り込み・複製
  'src/screens/SaleRecordDetailScreen.tsx',
  'src/screens/RecordFilterScreen.tsx',
  'src/screens/DuplicateSourceScreen.tsx',
  'src/components/PhotoViewer.tsx',
  'src/components/RecordDetailSections.tsx',
];

/**
 * 「一度だけ計算して固定する」枝の中に labels.ts の**関数呼び出し**が入っていないか。
 *
 * 生成コードの形は
 *   `if ($[0] === Symbol.for("react.memo_cache_sentinel")) { …計算… } else { …キャッシュ… }`
 * なので、sentinel から次の `}else{` までを 1 つの枝として切り出して中身を見る。
 *
 * **見るのは呼び出しだけで、定数の参照は見逃す。** 表示語はすべて locale を取る関数に
 * なっているので、固定されて困るのは呼び出しのほう。定数のまま残っているのは
 * 電卓のキー（`⌫` `AC` `÷`）のように**訳す対象でない記号**か、移行前の日本語固定の写しで、
 * どちらも固定されて正しい。
 */
const LABEL_CALL = /\(0,\s*_labels\.\w+\)\s*\(|(?<![.\w])_labels\.\w+\s*\(/;

function frozenLabelCalls(code: string): string[] {
  return code
    .split('Symbol.for("react.memo_cache_sentinel")')
    .slice(1)
    .map((rest) => rest.split('}else{')[0] ?? '')
    .filter((branch) => LABEL_CALL.test(branch));
}

function compileWithReactCompiler(file: string): string {
  const filename = resolve(file);
  const result = transformSync(readFileSync(filename, 'utf8'), {
    filename,
    presets: [['babel-preset-expo', {}]],
    plugins: [['babel-plugin-react-compiler', {}]],
    babelrc: false,
    configFile: false,
  });
  if (result?.code == null) throw new Error(`変換できなかった: ${file}`);
  return result.code;
}

describe('React Compiler が表示語を固定していない', () => {
  it.each(MIGRATED_SCREENS)('%s', (file) => {
    expect(frozenLabelCalls(compileWithReactCompiler(file))).toEqual([]);
  });

  it('引数なしで呼ぶと実際に固定される（この検査が機能していることの確認）', () => {
    // 検査そのものが空振りしていないかを見る ── 壊れた書き方を作って、必ず捕まることを確かめる
    const broken = compileWithReactCompiler('src/i18n/__fixtures__/frozenLabel.tsx');
    expect(frozenLabelCalls(broken).length).toBeGreaterThan(0);
  });
});
