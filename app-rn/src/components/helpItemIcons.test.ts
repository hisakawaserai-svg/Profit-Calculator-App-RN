// 使いかたの項目アイコン（helpItemIcons.ts）と本文（logic/helpContent.ts）の突き合わせ。
//
// **アイコンの選び方そのものは試さない**（「電卓の項目が電卓か」は目で見るもの）。
// ここで守るのは、型で守れない**対応表と本文のずれ**だけ:
//   - 表の key はただの文字列なので、項目を足しても id を変えても型は通る。
//     未登録の項目は既定のアイコン（丸に i）で黙って出てしまい、開くまで気付けない
//   - 同じページで同じ絵が 2 つあると、畳んだ見出しの列で目印として働かない
//     （helpItemIcons.ts の選び方を参照。ページをまたぐ重なりは意図的に許す）
import { describe, expect, it } from 'vitest';

import { HELP_ALL_PAGES, helpItemsOf } from '@/logic/helpContent';

import { HELP_ITEM_ICONS, helpItemIcon } from './helpItemIcons';

const ALL_ITEMS = HELP_ALL_PAGES.flatMap((page) => helpItemsOf(page));

describe('項目アイコンの対応表', () => {
  it('すべての項目にアイコンが登録されている', () => {
    for (const item of ALL_ITEMS) {
      expect(HELP_ITEM_ICONS[item.id], `${item.id} のアイコンが未登録`).toBeTruthy();
    }
  });

  // 消した項目の行が残ると、次に選ぶときの手本にならない（存在しない id の見本が並ぶ）
  it('本文に無い id は表に残っていない', () => {
    const ids = new Set(ALL_ITEMS.map((item) => item.id));
    for (const id of Object.keys(HELP_ITEM_ICONS)) {
      expect(ids.has(id), `${id} は helpContent.ts に無い`).toBe(true);
    }
  });

  it('同じページの中でアイコンが重ならない', () => {
    for (const page of HELP_ALL_PAGES) {
      const names = helpItemsOf(page).map((item) => helpItemIcon(item.id));
      const duplicated = names.filter((name, index) => names.indexOf(name) !== index);
      expect(duplicated, `${page.id} で ${duplicated.join(' / ')} が重複`).toEqual([]);
    }
  });

  // ページをまたぐ重なりは許すが、それは「同じ話が別のページに続く」ときだけのはず
  // （日付・目標・絞り込みなど）。1 つの絵があちこちに散ると、印としての意味が薄れる
  it('同じアイコンが全体で 3 項目を超えて使われていない', () => {
    const count = new Map<string, string[]>();
    for (const item of ALL_ITEMS) {
      const name = helpItemIcon(item.id);
      count.set(name, [...(count.get(name) ?? []), item.id]);
    }
    for (const [name, ids] of count) {
      expect(ids.length, `${name} が ${ids.join(' / ')} で使い回されている`).toBeLessThanOrEqual(3);
    }
  });
});

describe('helpItemIcon', () => {
  it('登録があればその名前を返す', () => {
    expect(helpItemIcon('calc-calculator')).toBe(HELP_ITEM_ICONS['calc-calculator']);
  });

  it('知らない id では既定のアイコンに落ちる（行の形を崩さない）', () => {
    expect(helpItemIcon('no-such-item')).toBe('information-circle-outline');
  });
});
