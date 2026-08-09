// SPEC-V2 §2.2（kind 列のバックフィル）・§2.4（不用品の purchasePrice 正規化）の検証テスト。
//
// analytics.test.ts と同じく、アプリ本体と同じ schema / migration / repository を
// better-sqlite3（インメモリ）で動かす。集計テストと同じ DB を汚さないよう、
// この describe 群は自前の DB を建てる。

import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';

import journal from '../../drizzle/meta/_journal.json';
import { createRepository, type Repository, type SaveRecordInput } from './repository';
import * as schema from './schema';

const drizzleDir = fileURLToPath(new URL('../../drizzle/', import.meta.url));

function migrationSql(tag: string): string[] {
  return readFileSync(`${drizzleDir}${tag}.sql`, 'utf8').split('--> statement-breakpoint');
}

/** 0000 から指定 idx までのマイグレーションを流したインメモリ DB */
function newDatabase(throughIdx = journal.entries.length - 1) {
  const sqlite = new Database(':memory:');
  for (const entry of journal.entries) {
    if (entry.idx > throughIdx) break;
    for (const statement of migrationSql(entry.tag)) sqlite.exec(statement);
  }
  return sqlite;
}

const base: Omit<SaveRecordInput, 'kind' | 'purchasePrice'> = {
  itemName: 'えんぴつ',
  salesPrice: 1000,
  postage: 0,
  envelopeCost: 0,
  othersCost: 0,
  commission: 10,
  isSold: false,
  saleStartDate: new Date(2026, 7, 1, 12, 0, 0),
  saleDate: null,
  memo: '',
};

describe('§2.4 保存時の正規化: 不用品の仕入価格は 0 に強制する', () => {
  let repo: Repository;

  beforeEach(() => {
    repo = createRepository(drizzle(newDatabase(), { schema }), { generateId: randomUUID });
  });

  it('不用品は仕入価格が入力されていても 0 で保存される', () => {
    const created = repo.create({ ...base, kind: 'used', purchasePrice: 500 });

    expect(created.kind).toBe('used');
    expect(created.purchasePrice).toBe(0);
    expect(repo.getById(created.id)?.purchasePrice).toBe(0);
  });

  it('仕入品は入力値をそのまま保存する', () => {
    const created = repo.create({ ...base, kind: 'sourced', purchasePrice: 500 });

    expect(created.kind).toBe('sourced');
    expect(repo.getById(created.id)?.purchasePrice).toBe(500);
  });

  it('更新でも同じ規則が効く（仕入品 → 不用品 で仕入価格が消える）', () => {
    const created = repo.create({ ...base, kind: 'sourced', purchasePrice: 500 });
    repo.update(created.id, { ...base, kind: 'used', purchasePrice: 500 });

    expect(repo.getById(created.id)?.kind).toBe('used');
    expect(repo.getById(created.id)?.purchasePrice).toBe(0);
  });

  it('不用品 → 仕入品 に戻すと仕入価格が保存されるようになる', () => {
    const created = repo.create({ ...base, kind: 'used', purchasePrice: 500 });
    repo.update(created.id, { ...base, kind: 'sourced', purchasePrice: 300 });

    expect(repo.getById(created.id)?.kind).toBe('sourced');
    expect(repo.getById(created.id)?.purchasePrice).toBe(300);
  });

  it('正規化されるのは仕入価格だけで、他の経費は種別によらず保存される', () => {
    const created = repo.create({
      ...base,
      kind: 'used',
      purchasePrice: 500,
      postage: 175,
      envelopeCost: 20,
      othersCost: 5,
    });
    const row = repo.getById(created.id);

    expect(row?.postage).toBe(175);
    expect(row?.envelopeCost).toBe(20);
    expect(row?.othersCost).toBe(5);
  });
});

describe('§2.2 マイグレーション: kind 列の追加とバックフィル', () => {
  /** 0000 までを流した「kind 列がない状態」に行を入れてから 0001 を流す */
  function migrateWithRows(purchasePrices: number[]) {
    const sqlite = newDatabase(0);
    purchasePrices.forEach((purchasePrice, i) => {
      sqlite
        .prepare(
          `INSERT INTO sale_records (id, item_name, sales_price, purchase_price, is_sold, sale_start_date)
           VALUES (?, ?, ?, ?, 0, '2026-08-01T12:00:00.000')`,
        )
        .run(`id-${i}`, `商品${i}`, 1000, purchasePrice);
    });
    for (const statement of migrationSql(journal.entries[1].tag)) sqlite.exec(statement);
    return sqlite
      .prepare('SELECT purchase_price AS purchasePrice, kind FROM sale_records ORDER BY id')
      .all() as { purchasePrice: number; kind: string }[];
  }

  it('仕入価格が入っている行は仕入品、0 の行は不用品になる', () => {
    expect(migrateWithRows([0, 300, 0.5])).toEqual([
      { purchasePrice: 0, kind: 'used' },
      { purchasePrice: 300, kind: 'sourced' },
      { purchasePrice: 0.5, kind: 'sourced' },
    ]);
  });

  it('バックフィルは kind を書き換えるだけで金額には触れない', () => {
    const rows = migrateWithRows([300]);

    expect(rows[0].purchasePrice).toBe(300);
  });
});
