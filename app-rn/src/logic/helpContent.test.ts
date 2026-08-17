// 使いかたの中身（helpContent.ts）の構造テスト。
//
// **文言そのものは試さない。** 地の文を assert に書き写すと、言い回しを直すたびに
// テストも直すことになり、テストが「変えるな」としか言わなくなる。
//
// ここで守るのは**型で守れない参照**だけ:
//   - `HELP_ENTRIES.leadItemId` は**ただの文字列**で、指す先の項目が消えても型は通る。
//     各画面の「？」が黙って「どれも開かない」状態に落ちるのがこれで、画面を開くまで気付けない
//   - `link.to` のページが実在するか（`HelpPageId` の union にあっても、
//     `HELP_PAGES` に無いページを指せば行き先が無い）
//   - 項目 id の重複（`leadItemId` は**全ページを通して**引くので、
//     同じ id が 2 つあると開く先が並び順に依存する）
import { describe, expect, it } from 'vitest';

import {
  HELP_ALL_PAGES,
  HELP_ENTRIES,
  HELP_PAGES,
  HELP_TERMS_PAGE,
  helpItemsOf,
  helpPageOf,
  type HelpPageId,
} from './helpContent';

const ALL_ITEMS = HELP_ALL_PAGES.flatMap((page) => helpItemsOf(page));

describe('ページの構成', () => {
  it('チップに出るのは 5 枚で、ことばは含まれない', () => {
    expect(HELP_PAGES.map((page) => page.id)).toEqual(['calc', 'record', 'sell', 'data', 'keep']);
  });

  it('ことばは HELP_ALL_PAGES からは引ける（チップ以外の入口があるため）', () => {
    expect(HELP_ALL_PAGES).toContain(HELP_TERMS_PAGE);
    expect(helpPageOf('terms')).toBe(HELP_TERMS_PAGE);
  });

  it('helpPageOf は id ごとにそのページを返す', () => {
    for (const page of HELP_ALL_PAGES) {
      expect(helpPageOf(page.id)).toBe(page);
    }
  });

  it('helpItemsOf は群をまたいで宣言順に平らにする', () => {
    const page = helpPageOf('sell');
    expect(helpItemsOf(page).map((item) => item.id)).toEqual(
      page.groups.flatMap((group) => group.items.map((item) => item.id)),
    );
  });

  it('どのページも空ではない', () => {
    for (const page of HELP_ALL_PAGES) {
      expect(helpItemsOf(page).length).toBeGreaterThan(0);
    }
  });
});

describe('群の見出し', () => {
  // 群が 2 つ以上あるページで見出しが無いと、境目が読めないまま段だけが増える
  it('群が複数あるページでは、すべての群が見出しを持つ', () => {
    for (const page of HELP_ALL_PAGES) {
      if (page.groups.length < 2) continue;
      for (const group of page.groups) {
        expect(group.title, `${page.id} の群に見出しが無い`).toBeTruthy();
      }
    }
  });

  // 群が 1 つだけのページに小見出しを立てると、無い後半を探させる（HelpScreen 冒頭）
  it('群が 1 つだけのページでは見出しを持たない', () => {
    for (const page of HELP_ALL_PAGES) {
      if (page.groups.length !== 1) continue;
      expect(page.groups[0].title, `${page.id} に不要な見出しがある`).toBeUndefined();
    }
  });
});

describe('項目', () => {
  it('id は全ページを通して一意', () => {
    const ids = ALL_ITEMS.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('見出しと本文が空の項目は無い', () => {
    for (const item of ALL_ITEMS) {
      expect(item.title, `${item.id} の見出しが空`).not.toBe('');
      expect(item.body, `${item.id} の本文が空`).not.toBe('');
    }
  });

  it('link の行き先はすべて実在するページ', () => {
    const pageIds = new Set<HelpPageId>(HELP_ALL_PAGES.map((page) => page.id));
    for (const item of ALL_ITEMS) {
      if (item.link == null) continue;
      expect(pageIds.has(item.link.to), `${item.id} の行き先 ${item.link.to} が無い`).toBe(true);
    }
  });

  it('link は自分のページを指さない（押しても何も起きないリンクを作らない）', () => {
    for (const page of HELP_ALL_PAGES) {
      for (const item of helpItemsOf(page)) {
        if (item.link == null) continue;
        expect(item.link.to, `${item.id} が自分のページを指している`).not.toBe(page.id);
      }
    }
  });
});

describe('各画面の「？」（HELP_ENTRIES）', () => {
  it('page はすべて実在するページ', () => {
    for (const [entryId, entry] of Object.entries(HELP_ENTRIES)) {
      const page = HELP_ALL_PAGES.find((candidate) => candidate.id === entry.page);
      expect(page, `${entryId} の page ${entry.page} が無い`).toBeDefined();
    }
  });

  // これが本命。leadItemId は型で守れないので、項目を消したり id を変えたりすると
  // 「？」が黙って全部畳んだ状態で開くようになる
  it('leadItemId は、指しているページの中に実在する', () => {
    for (const [entryId, entry] of Object.entries(HELP_ENTRIES)) {
      if (entry.leadItemId == null) continue;
      const ids = helpItemsOf(helpPageOf(entry.page)).map((item) => item.id);
      expect(ids, `${entryId} の leadItemId ${entry.leadItemId} が ${entry.page} に無い`).toContain(
        entry.leadItemId,
      );
    }
  });

  it('sheetTitle は空でない', () => {
    for (const entry of Object.values(HELP_ENTRIES)) {
      expect(entry.sheetTitle).not.toBe('');
    }
  });
});
