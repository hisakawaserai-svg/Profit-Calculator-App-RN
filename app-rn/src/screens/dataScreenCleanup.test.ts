// データタブをセグメント切替式に戻した際に削除した「タグ別分析」サブ画面まわりの残骸チェック。
// 画面のレンダリングテスト基盤が無いプロジェクトなので、削除したファイルが復活していないこと・
// 消したはずの識別子への参照が src/app のどこにも残っていないことを、ファイル走査で直接確かめる。
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const appRnRoot = join(here, '..', '..');

const DELETED_FILES = [
  'src/screens/TagAnalysisScreen.tsx',
  'app/(tabs)/data/tags.tsx',
  'src/components/TagAnalysisEntryCard.tsx',
];

const FORBIDDEN_IDENTIFIERS = [
  'TagAnalysisScreen',
  'TagAnalysisEntryCard',
  'topResolvedTagProfit',
  'TAG_ANALYSIS_PATHNAME',
  '/data/tags',
];

/** src・app 配下の .ts/.tsx を再帰的に列挙する（node_modules 等は最初から辿らない） */
function listSourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return listSourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

describe('データタブのセグメント化で削除した「タグ別分析」サブ画面の残骸が無いこと', () => {
  it('削除したファイルが復活していない', () => {
    for (const relativePath of DELETED_FILES) {
      expect(() => statSync(join(appRnRoot, relativePath))).toThrow();
    }
  });

  it('消した識別子・ルートへの参照が src / app のどこにも残っていない', () => {
    const files = [...listSourceFiles(join(appRnRoot, 'src')), ...listSourceFiles(join(appRnRoot, 'app'))];
    // このテスト自身の FORBIDDEN_IDENTIFIERS 一覧（文字列リテラル）は対象から除く
    const target = files.filter((file) => file !== fileURLToPath(import.meta.url));

    const offenders = target.flatMap((file) => {
      const content = readFileSync(file, 'utf8');
      const hits = FORBIDDEN_IDENTIFIERS.filter((identifier) => content.includes(identifier));
      return hits.length > 0 ? [{ file, hits }] : [];
    });

    expect(offenders).toEqual([]);
  });
});
