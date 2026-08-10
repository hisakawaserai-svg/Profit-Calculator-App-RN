// SPEC-V2 §2.2（kind 列のバックフィル）・§2.4（不用品の purchasePrice 正規化）・
// §4.2（種別フィルタ）の検証テスト。
//
// analytics.test.ts と同じく、アプリ本体と同じ schema / migration / repository を
// better-sqlite3（インメモリ）で動かす。集計テストと同じ DB を汚さないよう、
// この describe 群は自前の DB を建てる。

import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import journal from '../../drizzle/meta/_journal.json';
import { netProfit, totalExpenses } from '../logic/profit';
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

// ---- §4.2 種別フィルタ ----
//
// 絞り込みは buildWhere / buildAnalyticsWhere の 1 条件だけで、集計式（netProfitSql 等）には
// 一切触れない（§0 / §4.4）。したがってここで確かめるのは「対象レコードが正しく減ること」と
// 「減った結果の合計が手計算と一致すること」の 2 点。
// 種別ごとの内訳を返す関数（summaryByKind）は §4.3 の決定により存在しない。

describe('§4.2 種別フィルタ: 一覧・累計・分析の絞り込み', () => {
  let repo: Repository;
  /** 期待値を手計算する側（SQL の SUM と突き合わせる） */
  let created: Record<string, ReturnType<Repository['create']>>;

  const d = (y: number, m: number, day: number) => new Date(y, m - 1, day, 12, 0, 0, 0);

  beforeAll(() => {
    repo = createRepository(drizzle(newDatabase(), { schema }), { generateId: randomUUID });
    created = {
      // 2026-07: 同じ月に両種別が混在する（§0 の前提）
      usedJuly: repo.create({
        ...base,
        kind: 'used',
        purchasePrice: 0,
        itemName: '不要な本',
        salesPrice: 1000,
        postage: 100,
        isSold: true,
        saleStartDate: d(2026, 6, 20),
        saleDate: d(2026, 7, 5),
      }),
      sourcedJuly: repo.create({
        ...base,
        kind: 'sourced',
        purchasePrice: 500,
        itemName: '仕入れたカメラ',
        salesPrice: 2000,
        isSold: true,
        saleStartDate: d(2026, 7, 1),
        saleDate: d(2026, 7, 10),
      }),
      // 2026-08: 不用品だけの月（種別で絞ると月グループごと消えること）
      usedAugust: repo.create({
        ...base,
        kind: 'used',
        purchasePrice: 0,
        itemName: '不要な椅子',
        salesPrice: 3000,
        isSold: true,
        saleStartDate: d(2026, 8, 1),
        saleDate: d(2026, 8, 3),
      }),
      // 出品中の仕入品（出品中タブでも絞れること）
      sourcedListing: repo.create({
        ...base,
        kind: 'sourced',
        purchasePrice: 800,
        itemName: 'カメラのケース',
        salesPrice: 1500,
        isSold: false,
        saleStartDate: d(2026, 8, 2),
        saleDate: null,
      }),
    };
  });

  const sumProfit = (keys: (keyof typeof created)[]) =>
    keys.reduce((acc, key) => acc + netProfit(created[key]), 0);
  const sumExpenses = (keys: (keyof typeof created)[]) =>
    keys.reduce((acc, key) => acc + totalExpenses(created[key]), 0);
  const itemNames = (groups: ReturnType<Repository['filteredAndGrouped']>) =>
    groups.flatMap((group) => group.records.map((record) => record.itemName));

  describe('filteredAndGrouped', () => {
    it('kind を省略すると全種別が対象になる（従来どおり）', () => {
      const groups = repo.filteredAndGrouped({ isSoldMode: true });

      expect(groups.map((group) => group.monthKey)).toEqual(['2026-08', '2026-07']);
      expect(itemNames(groups)).toEqual(['不要な椅子', '仕入れたカメラ', '不要な本']);
    });

    it('kind: null も「すべて」として扱う（UI の「すべて」がこの値を渡す）', () => {
      expect(repo.filteredAndGrouped({ isSoldMode: true, kind: null }).map((g) => g.recordCount))
        .toEqual([1, 2]);
    });

    it('不用品だけに絞ると仕入品が月グループから外れる', () => {
      const groups = repo.filteredAndGrouped({ isSoldMode: true, kind: 'used' });

      expect(groups.map((group) => group.monthKey)).toEqual(['2026-08', '2026-07']);
      expect(itemNames(groups)).toEqual(['不要な椅子', '不要な本']);
      // 7 月の合計から仕入品ぶんが抜けている（集計式は変わらない。§4.4）
      expect(groups[1].recordCount).toBe(1);
      expect(groups[1].totalNetProfit).toBeCloseTo(sumProfit(['usedJuly']), 9);
      expect(groups[1].totalExpenses).toBeCloseTo(sumExpenses(['usedJuly']), 9);
    });

    it('仕入品だけに絞ると、その種別が 0 件の月はグループごと消える', () => {
      const groups = repo.filteredAndGrouped({ isSoldMode: true, kind: 'sourced' });

      expect(groups.map((group) => group.monthKey)).toEqual(['2026-07']);
      expect(itemNames(groups)).toEqual(['仕入れたカメラ']);
      expect(groups[0].totalNetProfit).toBeCloseTo(sumProfit(['sourcedJuly']), 9);
    });

    it('出品中タブでも効く（isSold との AND）', () => {
      expect(itemNames(repo.filteredAndGrouped({ isSoldMode: false, kind: 'sourced' }))).toEqual([
        'カメラのケース',
      ]);
      expect(repo.filteredAndGrouped({ isSoldMode: false, kind: 'used' })).toEqual([]);
    });

    it('月フィルタ・検索との AND になる', () => {
      expect(
        itemNames(repo.filteredAndGrouped({ isSoldMode: true, monthKey: '2026-07', kind: 'used' })),
      ).toEqual(['不要な本']);
      // 「カメラ」に一致するのは仕入品だけなので、不用品で絞ると 0 件
      expect(
        repo.filteredAndGrouped({ isSoldMode: true, searchText: 'カメラ', kind: 'used' }),
      ).toEqual([]);
      expect(
        itemNames(repo.filteredAndGrouped({ isSoldMode: true, searchText: 'カメラ', kind: 'sourced' })),
      ).toEqual(['仕入れたカメラ']);
    });
  });

  describe('careerSummary（下部累計にも種別を適用する。§4.2「フィルタの適用範囲」）', () => {
    it('絞り込みなしの累計は全種別の合計', () => {
      const summary = repo.careerSummary({ isSoldMode: true });

      expect(summary.recordCount).toBe(3);
      expect(summary.totalNetProfit).toBeCloseTo(
        sumProfit(['usedJuly', 'sourcedJuly', 'usedAugust']),
        9,
      );
    });

    it('不用品だけの累計が取れる（§4.1 の「フィルタで内訳を代替する」）', () => {
      const summary = repo.careerSummary({ isSoldMode: true, kind: 'used' });

      expect(summary.recordCount).toBe(2);
      expect(summary.totalNetProfit).toBeCloseTo(sumProfit(['usedJuly', 'usedAugust']), 9);
      expect(summary.totalExpenses).toBeCloseTo(sumExpenses(['usedJuly', 'usedAugust']), 9);
    });

    it('種別ごとの累計を足すと絞り込みなしの累計に戻る', () => {
      const all = repo.careerSummary({ isSoldMode: true });
      const used = repo.careerSummary({ isSoldMode: true, kind: 'used' });
      const sourced = repo.careerSummary({ isSoldMode: true, kind: 'sourced' });

      expect(used.recordCount + sourced.recordCount).toBe(all.recordCount);
      expect(used.totalNetProfit + sourced.totalNetProfit).toBeCloseTo(all.totalNetProfit, 9);
    });

    it('該当 0 件でも 0 が返る（coalesce）', () => {
      expect(repo.careerSummary({ isSoldMode: false, kind: 'used' })).toEqual({
        totalNetProfit: 0,
        totalExpenses: 0,
        recordCount: 0,
      });
    });
  });

  describe('分析（AnalyticsFilter）', () => {
    it('kind を省略すると全種別（出品中は従来どおり対象外）', () => {
      const summary = repo.analyticsSummary({ range: null });

      expect(summary.recordCount).toBe(3);
    });

    it('サマリーが種別で絞られる', () => {
      const summary = repo.analyticsSummary({ range: null, kind: 'used' });

      expect(summary.recordCount).toBe(2);
      expect(summary.totalSales).toBeCloseTo(
        created.usedJuly.salesPrice + created.usedAugust.salesPrice,
        9,
      );
      expect(summary.totalNetProfit).toBeCloseTo(sumProfit(['usedJuly', 'usedAugust']), 9);
    });

    it('種別を絞っても出品中は入ってこない（isSold 条件との AND）', () => {
      // 出品中の仕入品（カメラのケース）は含まれず、売却済みの仕入品 1 件だけになる
      expect(repo.analyticsSummary({ range: null, kind: 'sourced' }).recordCount).toBe(1);
    });

    it('チャートの集計点は形が変わらず件数だけ減る（§4.4）', () => {
      const all = repo.analyticsSeries({ range: null }, 'month');
      const used = repo.analyticsSeries({ range: null, kind: 'used' }, 'month');

      expect(all.map((point) => point.key)).toEqual(['2026-07', '2026-08']);
      expect(all[0].recordCount).toBe(2);
      expect(used.map((point) => point.key)).toEqual(['2026-07', '2026-08']);
      expect(used[0].recordCount).toBe(1);
      expect(used[0].profit).toBeCloseTo(sumProfit(['usedJuly']), 9);
    });

    it('期間と種別の AND で絞られる', () => {
      const july = { startDate: d(2026, 7, 1), endDate: d(2026, 7, 31) };

      expect(repo.analyticsSummary({ range: july, kind: 'sourced' }).recordCount).toBe(1);
      expect(repo.analyticsSummary({ range: july, kind: 'used' }).totalNetProfit).toBeCloseTo(
        sumProfit(['usedJuly']),
        9,
      );
    });

    it('内訳リストも種別で絞られる', () => {
      const names = (kind: 'used' | 'sourced' | undefined) =>
        repo
          .analyticsDetails({ range: null, kind }, 'month', '2026-07', 'sales')
          .map((record) => record.itemName);

      expect(names(undefined)).toEqual(['仕入れたカメラ', '不要な本']);
      expect(names('used')).toEqual(['不要な本']);
      expect(names('sourced')).toEqual(['仕入れたカメラ']);
    });
  });
});
