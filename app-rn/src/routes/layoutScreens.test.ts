// レイアウトの screen 宣言が壊れていないかを見張るテスト。
//
// **見張っているのは「宣言の漏れ」ではなく「宣言したせいで起きること」。**
// expo-router のルートはファイルで決まるので、`<Stack.Screen>` を書かなかったルートも
// そのまま登録される（withLayoutContext は useOnlyUserDefinedScreens を渡していない）。
// 落ちるのは登録ではなく**並び**のほう ── useScreens.ts の getSortedChildren は
// 「宣言した screen → 残りのファイル」の順に並べ、expo-router は initialRouteName を
// anchor 経由でしか navigator に渡さない。つまり anchor が無いレイアウトで screen を
// 1 つでも宣言すると、**その宣言が初期ルートになる**。
//
// 実際に起きた事故: 設定タブが `<Stack.Screen name="export" presentation="modal">` を
// 宣言したことで、設定タブの起点が index から export に移り、設定の一覧が出なくなった。
// 一覧が消えると、そこにしか入口の無いタグ・プリセット・使いかたごと開けなくなる。
//
// ファイルを読んで正規表現で見る形にしてあるのは、レイアウトが expo-router の
// ネイティブ側を引き込むため、Node のテストでは import できないから。
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../app');

/** app/ 配下の _layout.tsx を全部集める */
function findLayouts(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return findLayouts(path);
    return entry === '_layout.tsx' ? [path] : [];
  });
}

/** そのレイアウトが束ねるルート名（同じ階層のファイル名・ディレクトリ名） */
function siblingRoutes(layoutPath: string): string[] {
  return readdirSync(dirname(layoutPath))
    .filter((entry) => entry !== '_layout.tsx')
    .map((entry) => entry.replace(/\.tsx$/, ''));
}

/** `<Stack.Screen name="x"` / `<Tabs.Screen name="x"` の x を拾う */
function declaredScreens(source: string): string[] {
  return [...source.matchAll(/<(?:Stack|Tabs)\.Screen\s[^>]*?name="([^"]+)"/g)].map(
    (match) => match[1],
  );
}

/** `unstable_settings` の anchor（旧 initialRouteName）。無ければ null */
function anchorOf(source: string): string | null {
  if (!/export\s+const\s+unstable_settings/.test(source)) return null;
  const match = source.match(/(?:anchor|initialRouteName):\s*'([^']+)'/);
  return match ? match[1] : null;
}

const layouts = findLayouts(APP_DIR).map((path) => {
  const source = readFileSync(path, 'utf8');
  return {
    name: relative(APP_DIR, path),
    routes: siblingRoutes(path),
    screens: declaredScreens(source),
    anchor: anchorOf(source),
  };
});

describe('レイアウトの screen 宣言', () => {
  it('app/ 配下のレイアウトを見つけられている', () => {
    // 見つからないと以下が全部素通りするので、本数そのものを固定する
    expect(layouts.map((layout) => layout.name).sort()).toEqual([
      '(tabs)/(calc)/_layout.tsx',
      '(tabs)/_layout.tsx',
      '(tabs)/data/_layout.tsx',
      '(tabs)/records/_layout.tsx',
      '(tabs)/settings/_layout.tsx',
      '_layout.tsx',
    ]);
  });

  it.each(layouts)('$name: 宣言した screen が実在するルートを指している', (layout) => {
    // 実在しないルートを宣言すると expo-router は警告を出して**その宣言を捨てる**ので、
    // 付けたはずの options（presentation など）が黙って効かなくなる
    for (const screen of layout.screens) {
      expect(layout.routes, `screen "${screen}"`).toContain(screen);
    }
  });

  it.each(layouts)('$name: 起点が index のままになっている', (layout) => {
    // 実際に navigator の初期ルートになるもの＝**並びの先頭**。
    // getSortedChildren は「宣言した screen → 残りのファイル」の順に並べるので、
    // 宣言が 1 本でもあればその先頭が勝つ。**anchor はここには効かない** ──
    // anchor は sortRoutesWithInitial に渡るだけで、効くのは後ろに push される
    // 「残りのファイル」の側だけ。宣言が 0 本のときだけ anchor が先頭を決める。
    // （この優先順位を逆に書いていたせいで、壊れたままテストが通った）
    const initialRoute = layout.screens[0] ?? layout.anchor ?? 'index';
    // index を持たないレイアウト（ルート直下は (tabs) だけ）は、その 1 本が起点でよい
    const expected = layout.routes.includes('index') ? 'index' : layout.routes[0];
    expect(initialRoute, 'この画面が起点になり、他は入口ごと開けなくなる').toBe(expected);
  });

  it.each(layouts)('$name: anchor が実在するルートを指している', (layout) => {
    if (layout.anchor === null) return;
    expect(layout.routes).toContain(layout.anchor);
  });
});
