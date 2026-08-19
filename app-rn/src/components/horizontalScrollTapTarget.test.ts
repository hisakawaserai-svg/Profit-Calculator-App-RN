// 横スクロールの中身を、押せるものの**中**に入れていないかを見張るテスト。
//
// **一度実際に壊した箇所の回帰テスト。** 書き出しシートの簡易プレビューは
// カード全体が `Pressable` で、その中に横スクロールの表が入っていた ──
// 実際の利用者から「横に滑らせにくい」と報告された。
//
// 型は通るしテストも通る。実機でしか分からない種類の壊れ方なので、形のほうを見張る:
//
// - Android の `ReactHorizontalScrollView` が親の押下を取り消すのは、指の移動が
//   タッチスロップ（約 8dp）を超えて native のスクロールが始まったときだけ
// - `Pressability` の押下判定は要素の外側 +20/30dp まで生きているので、
//   それ未満の動きでは押下が生き残り、**離した時点で `onPress` が走る**
//
// つまり「ちょっとだけ横に動かす」がスクロールにならず遷移になる。
// 押せるものはスクローラの**中**に置く（実績のバッジ列・複製元のタグ絞り込みと同じ向き）。
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

/** スクロールを持つ要素（`horizontal` が付いているときだけ見る） */
const SCROLLERS = new Set(['ScrollView', 'FlatList', 'SectionList', 'Animated.ScrollView']);

/** 押下を取る要素。`onPress` を持つものだけを数える（器として使うだけの Pressable は無害） */
const PRESSABLES = new Set([
  'Pressable',
  'TouchableOpacity',
  'TouchableHighlight',
  'TouchableWithoutFeedback',
  'TouchableNativeFeedback',
]);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return entry.endsWith('.tsx') ? [path] : [];
  });
}

function tagNameOf(node: ts.JsxOpeningElement | ts.JsxSelfClosingElement): string {
  return node.tagName.getText();
}

function hasProp(node: ts.JsxOpeningElement | ts.JsxSelfClosingElement, name: string): boolean {
  return node.attributes.properties.some(
    (property) => ts.isJsxAttribute(property) && property.name.getText() === name,
  );
}

/** `<Pressable onPress>` の中に `<ScrollView horizontal>` がある箇所を拾う */
function scrollersInsidePressables(file: string): string[] {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TSX,
  );

  const found: string[] = [];

  function walk(node: ts.Node, pressableAncestor: string | null): void {
    let ancestor = pressableAncestor;

    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = tagNameOf(node);
      if (SCROLLERS.has(tag) && hasProp(node, 'horizontal') && ancestor != null) {
        const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
        found.push(`${relative(ROOT, file)}:${line} <${tag} horizontal> が <${ancestor}> の中`);
      }
    }

    // 器を跨いで下へ伝えるので、開始タグではなく要素そのもので見る
    if (ts.isJsxElement(node)) {
      const tag = tagNameOf(node.openingElement);
      if (PRESSABLES.has(tag) && hasProp(node.openingElement, 'onPress')) ancestor = tag;
    }

    node.forEachChild((child) => walk(child, ancestor));
  }

  walk(source, null);
  return found;
}

describe('横スクロールと押下の同居', () => {
  it('`horizontal` なスクローラを `onPress` を持つ要素の中に置かない', () => {
    const offenders = [...sourceFiles(join(ROOT, 'src')), ...sourceFiles(join(ROOT, 'app'))]
      .flatMap(scrollersInsidePressables)
      .sort();

    expect(offenders).toEqual([]);
  });
});
