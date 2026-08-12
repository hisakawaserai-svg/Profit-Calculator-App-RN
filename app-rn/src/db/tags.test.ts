// SPEC-V4 §7.3 のテスト方針のうち、DB の側。
// - CRUD と sortOrder の採番（§1.5）
// - **タグ削除で中間行が消えること・restore で中間行も戻ること**（§1.4）
// - **記録削除で中間行が消えること**（§1.4。repository.remove の側）
// - countsByTag（§3.3）/ countsByTagForFilter（§4.2.1）/ siteNames（§4.2）/ tagNamesByRecord（§5.4）
//
// presets.test.ts と同じく、アプリ本体と同じ schema / migration / repository を
// better-sqlite3（インメモリ）で動かす。
//
// **注意: better-sqlite3 は PRAGMA foreign_keys を既定で ON にする**（SQLite 本来の既定は
// OFF で、expo-sqlite はそちら）。つまりテストの方がアプリ本体より厳しく、
// 「FK が消してくれた」のか「repository が消した」のかはここでは区別が付かない ──
// §1.4 が外部キーに頼らないと決めたのはまさにこの食い違いのため。
// 孤児行が残らないことは recordTagRows() で直接数えて確かめる。

import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';

import journal from '../../drizzle/meta/_journal.json';
import { createRepository, type Repository, type SaveRecordInput } from './repository';
import * as schema from './schema';
import { createTagRepository, type TagRepository } from './tags';

const drizzleDir = fileURLToPath(new URL('../../drizzle/', import.meta.url));

function migrationSql(tag: string): string[] {
  return readFileSync(`${drizzleDir}${tag}.sql`, 'utf8').split('--> statement-breakpoint');
}

/** 0000 から最新までのマイグレーションを流したインメモリ DB */
function newDatabase() {
  const sqlite = new Database(':memory:');
  for (const entry of journal.entries) {
    for (const statement of migrationSql(entry.tag)) sqlite.exec(statement);
  }
  return sqlite;
}

const base: SaveRecordInput = {
  itemName: 'えんぴつ',
  kind: 'used',
  salesPrice: 1000,
  purchasePrice: 0,
  postage: 0,
  envelopeCost: 0,
  othersCost: 0,
  commission: 10,
  isSold: true,
  saleStartDate: new Date(2026, 7, 1, 12, 0, 0),
  saleDate: new Date(2026, 7, 5, 12, 0, 0),
  memo: '',
  siteName: '',
  tagIds: [],
};

let sqlite: ReturnType<typeof newDatabase>;
let repo: Repository;
let tagRepo: TagRepository;
/** ドライバの挙動そのものを見るテスト（§9-15）だけが直接触る */
let db: () => ReturnType<typeof drizzle>;

beforeEach(() => {
  sqlite = newDatabase();
  const instance = drizzle(sqlite, { schema });
  db = () => instance;
  repo = createRepository(instance, { generateId: randomUUID });
  tagRepo = createTagRepository(instance, { generateId: randomUUID });
});

/** 中間テーブルを直接覗く（repository を通さずに孤児行の有無を見るため） */
function recordTagRows(): { recordId: string; tagId: string }[] {
  return sqlite
    .prepare('SELECT record_id AS recordId, tag_id AS tagId FROM record_tags ORDER BY tag_id')
    .all() as { recordId: string; tagId: string }[];
}

describe('§1.2 / §1.5 タグの CRUD と採番', () => {
  it('seed は投入しない（0 件から始まる。決定 §9-7）', () => {
    expect(tagRepo.listAll()).toEqual([]);
    expect(tagRepo.count()).toBe(0);
  });

  it('追加は末尾（max(sortOrder) + 1）。一覧は sortOrder 昇順', () => {
    const first = tagRepo.create({ name: '洋服', colorKey: 'red' });
    const second = tagRepo.create({ name: '食器', colorKey: 'blue' });

    expect(first.sortOrder).toBe(1);
    expect(second.sortOrder).toBe(2);
    expect(tagRepo.listAll().map((tag) => tag.name)).toEqual(['洋服', '食器']);
    expect(tagRepo.count()).toBe(2);
  });

  it('update は名前と色だけを動かす（sortOrder は追加時のまま）', () => {
    const tag = tagRepo.create({ name: '洋服', colorKey: 'red' });
    tagRepo.create({ name: '食器', colorKey: 'blue' });

    tagRepo.update(tag.id, { name: '衣類', colorKey: 'green' });

    expect(tagRepo.getById(tag.id)).toEqual({
      id: tag.id,
      name: '衣類',
      colorKey: 'green',
      sortOrder: 1,
    });
    // 並びは動かない
    expect(tagRepo.listAll().map((t) => t.name)).toEqual(['衣類', '食器']);
  });
});

describe('§1.4 削除と取り消し: 中間行の後始末', () => {
  it('タグを削除すると、そのタグの中間行がすべて消える', () => {
    const clothes = tagRepo.create({ name: '洋服', colorKey: 'red' });
    const dish = tagRepo.create({ name: '食器', colorKey: 'blue' });
    const record = repo.create({ ...base, tagIds: [clothes.id, dish.id] });

    tagRepo.remove(clothes.id);

    expect(tagRepo.getById(clothes.id)).toBeUndefined();
    // 消したタグの行だけが消え、もう一方は残る（孤児行も残らない）
    expect(recordTagRows()).toEqual([{ recordId: record.id, tagId: dish.id }]);
  });

  it('remove は消す前の recordId[] を返す（Undo が両方を書き戻すため）', () => {
    const tag = tagRepo.create({ name: '洋服', colorKey: 'red' });
    const a = repo.create({ ...base, tagIds: [tag.id] });
    const b = repo.create({ ...base, tagIds: [tag.id] });
    repo.create({ ...base, tagIds: [] });

    const removed = tagRepo.remove(tag.id);

    expect(removed?.tag).toEqual(tag);
    expect(removed?.recordIds.sort()).toEqual([a.id, b.id].sort());
  });

  it('restore はタグ本体と中間行の両方を書き戻す（id と sortOrder もそのまま）', () => {
    const clothes = tagRepo.create({ name: '洋服', colorKey: 'red' });
    tagRepo.create({ name: '食器', colorKey: 'blue' });
    const record = repo.create({ ...base, tagIds: [clothes.id] });

    const removed = tagRepo.remove(clothes.id);
    tagRepo.restore(removed!.tag, removed!.recordIds);

    expect(tagRepo.getById(clothes.id)).toEqual(clothes);
    // 一覧の中の位置も元どおり（sortOrder = 1 なので先頭）
    expect(tagRepo.listAll().map((tag) => tag.name)).toEqual(['洋服', '食器']);
    // 記録から剥がれたままにならない
    expect(tagRepo.tagIdsByRecord(record.id)).toEqual([clothes.id]);
  });

  it('付いている記録が 0 件のタグも restore できる', () => {
    const tag = tagRepo.create({ name: '洋服', colorKey: 'red' });

    const removed = tagRepo.remove(tag.id);
    expect(removed?.recordIds).toEqual([]);

    tagRepo.restore(removed!.tag, removed!.recordIds);
    expect(tagRepo.listAll()).toEqual([tag]);
  });

  it('既に消えている id の remove は null（二度押しで落とさない）', () => {
    const tag = tagRepo.create({ name: '洋服', colorKey: 'red' });
    tagRepo.remove(tag.id);

    expect(tagRepo.remove(tag.id)).toBeNull();
  });

  it('記録を削除すると、その記録の中間行がすべて消える（repository.remove。§1.4）', () => {
    const clothes = tagRepo.create({ name: '洋服', colorKey: 'red' });
    const dish = tagRepo.create({ name: '食器', colorKey: 'blue' });
    const removed = repo.create({ ...base, tagIds: [clothes.id, dish.id] });
    const kept = repo.create({ ...base, tagIds: [clothes.id] });

    repo.remove(removed.id);

    expect(recordTagRows()).toEqual([{ recordId: kept.id, tagId: clothes.id }]);
    // タグ本体は消えない（§2.2 の注記「タグを消しても記録は消えません」の逆向き）
    expect(tagRepo.listAll()).toHaveLength(2);
  });
});

describe('§1.4 記録の保存: 全消し → 入れ直し', () => {
  it('create で渡した tagIds が中間行になる', () => {
    const clothes = tagRepo.create({ name: '洋服', colorKey: 'red' });
    const dish = tagRepo.create({ name: '食器', colorKey: 'blue' });

    const record = repo.create({ ...base, tagIds: [clothes.id, dish.id] });

    expect(tagRepo.tagIdsByRecord(record.id).sort()).toEqual([clothes.id, dish.id].sort());
  });

  it('update は差分を取らずに入れ替える（外したタグは消え、足したタグは入る）', () => {
    const clothes = tagRepo.create({ name: '洋服', colorKey: 'red' });
    const dish = tagRepo.create({ name: '食器', colorKey: 'blue' });
    const record = repo.create({ ...base, tagIds: [clothes.id] });

    repo.update(record.id, { ...base, tagIds: [dish.id] });

    expect(tagRepo.tagIdsByRecord(record.id)).toEqual([dish.id]);
  });

  it('空配列で更新すると全部外れる', () => {
    const tag = tagRepo.create({ name: '洋服', colorKey: 'red' });
    const record = repo.create({ ...base, tagIds: [tag.id] });

    repo.update(record.id, { ...base, tagIds: [] });

    expect(tagRepo.tagIdsByRecord(record.id)).toEqual([]);
    expect(recordTagRows()).toEqual([]);
  });

  it('同じ id を 2 つ渡しても 1 行だけ入る（複合 PK。§1.6）', () => {
    const tag = tagRepo.create({ name: '洋服', colorKey: 'red' });

    const record = repo.create({ ...base, tagIds: [tag.id, tag.id] });

    expect(recordTagRows()).toEqual([{ recordId: record.id, tagId: tag.id }]);
  });

  it('setTagsForRecord でも同じ結果になる（記録を保存せずに付け替える経路）', () => {
    const clothes = tagRepo.create({ name: '洋服', colorKey: 'red' });
    const dish = tagRepo.create({ name: '食器', colorKey: 'blue' });
    const record = repo.create({ ...base, tagIds: [clothes.id] });

    tagRepo.setTagsForRecord(record.id, [dish.id]);

    expect(tagRepo.tagIdsByRecord(record.id)).toEqual([dish.id]);
  });

  it('tagIdsByRecord は tags.sortOrder 昇順（付けた順ではない。§1.5）', () => {
    const clothes = tagRepo.create({ name: '洋服', colorKey: 'red' });
    const dish = tagRepo.create({ name: '食器', colorKey: 'blue' });
    const book = tagRepo.create({ name: '本', colorKey: 'green' });

    const record = repo.create({ ...base, tagIds: [book.id, clothes.id, dish.id] });

    expect(tagRepo.tagIdsByRecord(record.id)).toEqual([clothes.id, dish.id, book.id]);
  });
});

describe('§3.3 countsByTag: 1 本のクエリで全タグぶん', () => {
  it('状態（売れた / 出品中）を問わない全記録で数える（§2.2）', () => {
    const clothes = tagRepo.create({ name: '洋服', colorKey: 'red' });
    const dish = tagRepo.create({ name: '食器', colorKey: 'blue' });
    repo.create({ ...base, tagIds: [clothes.id, dish.id] });
    repo.create({ ...base, isSold: false, saleDate: null, tagIds: [clothes.id] });

    const counts = tagRepo.countsByTag();

    expect(counts.get(clothes.id)).toBe(2);
    expect(counts.get(dish.id)).toBe(1);
  });

  it('0 件のタグはキーごと現れない（呼び出し側で ?? 0 する）', () => {
    const tag = tagRepo.create({ name: '洋服', colorKey: 'red' });

    expect(tagRepo.countsByTag().has(tag.id)).toBe(false);
  });

  it('記録を消すと件数も減る（孤児行が残っていれば減らない）', () => {
    const tag = tagRepo.create({ name: '洋服', colorKey: 'red' });
    const record = repo.create({ ...base, tagIds: [tag.id] });

    repo.remove(record.id);

    expect(tagRepo.countsByTag().get(tag.id)).toBeUndefined();
  });
});

describe('§9-15 db.transaction: 途中で失敗したら中間行も本体も残らない', () => {
  it('例外でロールバックされる（トランザクション内の書き込みだけが巻き戻る）', () => {
    const tag = tagRepo.create({ name: '洋服', colorKey: 'red' });
    const record = repo.create({ ...base, tagIds: [] });
    const boom = new Error('boom');

    expect(() =>
      db().transaction((tx) => {
        tx.insert(schema.recordTags).values({ recordId: record.id, tagId: tag.id }).run();
        throw boom;
      }),
    ).toThrow(boom);

    expect(recordTagRows()).toEqual([]);
    // トランザクションの外で入れた行は巻き込まれない
    expect(tagRepo.listAll()).toHaveLength(1);
    expect(repo.getById(record.id)).toBeDefined();
  });

  /**
   * repository.create が本体と中間行を 1 つのトランザクションで書いていることの確認。
   * better-sqlite3 は foreign_keys が ON なので、存在しない tagId の中間行で失敗する ──
   * そのとき**記録本体も残らない**のがトランザクション化の目的。
   */
  it('中間行の書き込みが失敗したら記録本体も残らない', () => {
    expect(() => repo.create({ ...base, tagIds: ['no-such-tag'] })).toThrow();

    expect(repo.totalCount()).toBe(0);
    expect(recordTagRows()).toEqual([]);
  });
});

describe('§4.2 siteNames: 絞り込みの候補は記録に実在する名前', () => {
  it('重複を畳んで名前順。空文字は候補に出さない', () => {
    repo.create({ ...base, siteName: 'メルカリ' });
    repo.create({ ...base, siteName: 'メルカリ' });
    repo.create({ ...base, siteName: 'ヤフオク' });
    repo.create({ ...base, siteName: '' });

    expect(tagRepo.siteNames()).toEqual(['ヤフオク', 'メルカリ'].sort());
  });

  it('記録が 0 件なら空配列', () => {
    expect(tagRepo.siteNames()).toEqual([]);
  });
});

describe('§5.4 tagNamesByRecord: CSV 用にまとめて引く', () => {
  it('記録ごとのタグ名を sortOrder 昇順で返す', () => {
    const clothes = tagRepo.create({ name: '洋服', colorKey: 'red' });
    const summer = tagRepo.create({ name: '春夏物', colorKey: 'blue' });
    const withTags = repo.create({ ...base, tagIds: [summer.id, clothes.id] });
    const other = repo.create({ ...base, tagIds: [summer.id] });

    const map = tagNames([withTags.id, other.id]);

    expect(map.get(withTags.id)).toEqual(['洋服', '春夏物']);
    expect(map.get(other.id)).toEqual(['春夏物']);
  });

  it('タグなしの記録はキーごと現れない（呼び出し側で空文字に倒す）', () => {
    const record = repo.create({ ...base, tagIds: [] });

    expect(tagNames([record.id]).has(record.id)).toBe(false);
  });

  it('id を 1 件も渡さなければ空の Map（IN () を組み立てない）', () => {
    expect(tagNames([]).size).toBe(0);
  });

  function tagNames(ids: string[]) {
    return tagRepo.tagNamesByRecord(ids);
  }
});

describe('§4.2.1 countsByTagForFilter: 選択中のタグ以外のすべての条件で絞って数える', () => {
  // 「押したら何件出るか」の予告なので、下部の件数（countRecords）と同じ集合の上で数える。
  // §2.2 の「状態を問わない全記録」はここだけ例外になる。
  function setup() {
    const clothes = tagRepo.create({ name: '洋服', colorKey: 'red' });
    const summer = tagRepo.create({ name: '春夏物', colorKey: 'blue' });
    return { clothes, summer };
  }

  it('状態（売れた / 出品中）で数が変わる', () => {
    const { clothes } = setup();
    repo.create({ ...base, tagIds: [clothes.id] });
    repo.create({ ...base, tagIds: [clothes.id] });
    repo.create({ ...base, isSold: false, saleDate: null, tagIds: [clothes.id] });

    expect(repo.countsByTagForFilter({ isSoldMode: true }).get(clothes.id)).toBe(2);
    expect(repo.countsByTagForFilter({ isSoldMode: false }).get(clothes.id)).toBe(1);
    // 設定画面・記録フォームが使う方は従来どおり全記録（§2.2）
    expect(tagRepo.countsByTag().get(clothes.id)).toBe(3);
  });

  it('種別で数が変わる', () => {
    const { clothes } = setup();
    repo.create({ ...base, kind: 'used', tagIds: [clothes.id] });
    repo.create({ ...base, kind: 'sourced', tagIds: [clothes.id] });

    expect(repo.countsByTagForFilter({ isSoldMode: true }).get(clothes.id)).toBe(2);
    expect(repo.countsByTagForFilter({ isSoldMode: true, kind: 'sourced' }).get(clothes.id)).toBe(1);
  });

  it('販売サイトで数が変わる', () => {
    const { clothes } = setup();
    repo.create({ ...base, siteName: 'メルカリ', tagIds: [clothes.id] });
    repo.create({ ...base, siteName: 'ラクマ', tagIds: [clothes.id] });

    expect(
      repo.countsByTagForFilter({ isSoldMode: true, siteName: 'メルカリ' }).get(clothes.id),
    ).toBe(1);
  });

  it('期間（monthKey）で数が変わる', () => {
    const { clothes } = setup();
    repo.create({ ...base, tagIds: [clothes.id] }); // 2026-08
    repo.create({
      ...base,
      saleStartDate: new Date(2026, 6, 1, 12, 0, 0),
      saleDate: new Date(2026, 6, 5, 12, 0, 0),
      tagIds: [clothes.id],
    }); // 2026-07

    expect(repo.countsByTagForFilter({ isSoldMode: true }).get(clothes.id)).toBe(2);
    expect(
      repo.countsByTagForFilter({ isSoldMode: true, period: '2026-08' }).get(clothes.id),
    ).toBe(1);
  });

  it('**選択中のタグでは変わらない**（洋服を選んでも春夏物の数字が動かない）', () => {
    const { clothes, summer } = setup();
    repo.create({ ...base, tagIds: [clothes.id] });
    repo.create({ ...base, tagIds: [summer.id] });

    const before = repo.countsByTagForFilter({ isSoldMode: true });
    const after = repo.countsByTagForFilter({ isSoldMode: true, tagIds: [clothes.id] });

    // 洋服 AND 春夏物 なら 0 になるが、押した結果は 洋服 OR 春夏物 で 2 件に**増える**。
    // 予告として嘘にならないよう、タグの条件だけは織り込まない（§4.4）
    expect(before.get(summer.id)).toBe(1);
    expect(after.get(summer.id)).toBe(1);
    expect(after.get(clothes.id)).toBe(1);
  });

  it('isSoldMode = false のときは販売サイトの条件が無視される（§4.2 / buildWhere と同じ規則）', () => {
    const { clothes } = setup();
    repo.create({ ...base, isSold: false, saleDate: null, siteName: '', tagIds: [clothes.id] });

    // 出品中の記録は site_name が空。条件が効いてしまうと必ず 0 件になる
    expect(
      repo.countsByTagForFilter({ isSoldMode: false, siteName: 'メルカリ' }).get(clothes.id),
    ).toBe(1);
  });

  it('その条件に 1 件も無いタグはキーごと現れない（呼び出し側で ?? 0 して「0」と出す）', () => {
    const { clothes } = setup();
    repo.create({ ...base, tagIds: [clothes.id] });

    expect(repo.countsByTagForFilter({ isSoldMode: false }).get(clothes.id)).toBeUndefined();
  });

  it('複数のタグを 1 本のクエリでまとめて数える（§3.3 と同じ）', () => {
    const { clothes, summer } = setup();
    repo.create({ ...base, tagIds: [clothes.id, summer.id] });
    repo.create({ ...base, tagIds: [summer.id] });

    const counts = repo.countsByTagForFilter({ isSoldMode: true });

    expect(counts.get(clothes.id)).toBe(1);
    expect(counts.get(summer.id)).toBe(2);
  });
});
