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
import { toDbDate } from './dates';
import { createRepository, type Repository, type SaveRecordInput } from './repository';
import * as schema from './schema';
import { createTagRepository, type TagRepository } from './tags';

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
  // 販売サイト名（SPEC-V3 §1.5.1）。プリセット未実装の時点では常に空文字
  siteName: '',
  // タグ（SPEC-V4 §1.4）。タグを使う describe 群は自前で上書きする
  tagIds: [],
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
        totalSales: 0,
        recordCount: 0,
      });
    });
  });

  describe('分析（AnalyticsFilter）', () => {
    it('kind を省略すると全種別（出品中は従来どおり対象外）', () => {
      const summary = repo.analyticsSummary({ monthKey: null });

      expect(summary.recordCount).toBe(3);
    });

    it('サマリーが種別で絞られる', () => {
      const summary = repo.analyticsSummary({ monthKey: null, kind: 'used' });

      expect(summary.recordCount).toBe(2);
      expect(summary.totalSales).toBeCloseTo(
        created.usedJuly.salesPrice + created.usedAugust.salesPrice,
        9,
      );
      expect(summary.totalNetProfit).toBeCloseTo(sumProfit(['usedJuly', 'usedAugust']), 9);
    });

    it('種別を絞っても出品中は入ってこない（isSold 条件との AND）', () => {
      // 出品中の仕入品（カメラのケース）は含まれず、売却済みの仕入品 1 件だけになる
      expect(repo.analyticsSummary({ monthKey: null, kind: 'sourced' }).recordCount).toBe(1);
    });

    it('チャートの集計点は形が変わらず件数だけ減る（§4.4）', () => {
      const all = repo.analyticsSeries({ monthKey: null }, 'month');
      const used = repo.analyticsSeries({ monthKey: null, kind: 'used' }, 'month');

      expect(all.map((point) => point.key)).toEqual(['2026-07', '2026-08']);
      expect(all[0].recordCount).toBe(2);
      expect(used.map((point) => point.key)).toEqual(['2026-07', '2026-08']);
      expect(used[0].recordCount).toBe(1);
      expect(used[0].profit).toBeCloseTo(sumProfit(['usedJuly']), 9);
    });

    it('期間（月キー）と種別の AND で絞られる', () => {
      expect(repo.analyticsSummary({ monthKey: '2026-07', kind: 'sourced' }).recordCount).toBe(1);
      expect(
        repo.analyticsSummary({ monthKey: '2026-07', kind: 'used' }).totalNetProfit,
      ).toBeCloseTo(sumProfit(['usedJuly']), 9);
    });

    it('内訳リストも種別で絞られる', () => {
      const names = (kind: 'used' | 'sourced' | undefined) =>
        repo
          .analyticsDetails({ monthKey: null, kind }, 'month', '2026-07')
          .map((record) => record.itemName);

      // 並びは収支の降順で固定（UI-SPEC §6-10 で指標切替を廃止）
      expect(names(undefined)).toEqual(['仕入れたカメラ', '不要な本']);
      expect(names('used')).toEqual(['不要な本']);
      expect(names('sourced')).toEqual(['仕入れたカメラ']);
    });

    it('月バーの下端（analyticsEarliestMonthKey）も種別で絞られる', () => {
      expect(repo.analyticsEarliestMonthKey({ monthKey: null })).toBe('2026-07');
      expect(repo.analyticsEarliestMonthKey({ monthKey: null, kind: 'used' })).toBe('2026-07');
      expect(repo.analyticsEarliestMonthKey({ monthKey: null, kind: 'sourced' })).toBe('2026-07');
    });
  });
});

// UI-SPEC §1.2（記録タブ 8a）で追加した、月グループを介さないフラットな取得。
describe('記録タブ（UI-SPEC §1.2）: filteredRecords / earliestMonthKey / 出品価格の合計', () => {
  let repo: Repository;

  const d = (y: number, m: number, day: number) => new Date(y, m - 1, day, 12, 0, 0, 0);

  beforeAll(() => {
    repo = createRepository(drizzle(newDatabase(), { schema }), { generateId: randomUUID });
    // 売れた記録: 2026-06 / 2026-08 に 2 件（同月に複数件あること）
    repo.create({
      ...base,
      kind: 'used',
      purchasePrice: 0,
      itemName: '6月の本',
      salesPrice: 1000,
      postage: 0,
      commission: 0,
      isSold: true,
      saleStartDate: d(2026, 6, 1),
      saleDate: d(2026, 6, 10),
    });
    repo.create({
      ...base,
      kind: 'used',
      purchasePrice: 0,
      itemName: '8月の椅子',
      salesPrice: 3000,
      postage: 500,
      commission: 0,
      isSold: true,
      saleStartDate: d(2026, 8, 1),
      saleDate: d(2026, 8, 3),
    });
    repo.create({
      ...base,
      kind: 'sourced',
      purchasePrice: 100,
      itemName: '8月のカメラ',
      salesPrice: 2000,
      postage: 0,
      commission: 0,
      isSold: true,
      saleStartDate: d(2026, 8, 2),
      saleDate: d(2026, 8, 20),
    });
    // 出品中: 2026-07 と 2026-08
    repo.create({
      ...base,
      kind: 'sourced',
      purchasePrice: 300,
      itemName: '出品中のケース',
      salesPrice: 1500,
      postage: 0,
      commission: 0,
      isSold: false,
      saleStartDate: d(2026, 7, 20),
      saleDate: null,
    });
    repo.create({
      ...base,
      kind: 'used',
      purchasePrice: 0,
      itemName: '出品中のバッグ',
      salesPrice: 800,
      postage: 0,
      commission: 0,
      isSold: false,
      saleStartDate: d(2026, 8, 5),
      saleDate: null,
    });
  });

  const names = (records: ReturnType<Repository['filteredRecords']>) =>
    records.map((record) => record.itemName);

  describe('filteredRecords: 月グループを作らずフラットに返す', () => {
    it('月を指定するとその月のレコードだけが 1 本のリストで返る', () => {
      expect(names(repo.filteredRecords({ isSoldMode: true, monthKey: '2026-08' }))).toEqual([
        '8月のカメラ',
        '8月の椅子',
      ]);
    });

    it('全期間（monthKey なし）では全部が 1 本のリストになる', () => {
      expect(repo.filteredRecords({ isSoldMode: true })).toHaveLength(3);
    });

    it('販売日の昇順・降順で並べ替えられる', () => {
      expect(names(repo.filteredRecords({ isSoldMode: true }, 'saleDateAsc'))).toEqual([
        '6月の本',
        '8月の椅子',
        '8月のカメラ',
      ]);
      expect(names(repo.filteredRecords({ isSoldMode: true }, 'saleDateDesc'))).toEqual([
        '8月のカメラ',
        '8月の椅子',
        '6月の本',
      ]);
    });

    it('出品日で並べ替えられる（出品中でも効く。saleDate は常に null）', () => {
      expect(names(repo.filteredRecords({ isSoldMode: false }, 'saleStartDateAsc'))).toEqual([
        '出品中のケース',
        '出品中のバッグ',
      ]);
    });

    it('収支（netProfit）で並べ替えられる', () => {
      // 6月の本 1000 / 8月の椅子 2500 / 8月のカメラ 1900
      expect(names(repo.filteredRecords({ isSoldMode: true }, 'profitDesc'))).toEqual([
        '8月の椅子',
        '8月のカメラ',
        '6月の本',
      ]);
      expect(names(repo.filteredRecords({ isSoldMode: true }, 'profitAsc'))[0]).toBe('6月の本');
    });

    it('経費で並べ替えられる', () => {
      // 6月の本 0 / 8月の椅子 500 / 8月のカメラ 100
      expect(names(repo.filteredRecords({ isSoldMode: true }, 'expensesDesc'))).toEqual([
        '8月の椅子',
        '8月のカメラ',
        '6月の本',
      ]);
    });

    it('検索・種別の絞り込みは従来どおり AND で効く', () => {
      expect(
        names(repo.filteredRecords({ isSoldMode: true, searchText: 'カメラ' })),
      ).toEqual(['8月のカメラ']);
      expect(names(repo.filteredRecords({ isSoldMode: true, kind: 'used' }))).toEqual([
        '8月の椅子',
        '6月の本',
      ]);
    });
  });

  describe('earliestMonthKey: 月バーの ◀ の下限（UI-SPEC §5-14）', () => {
    it('売れた記録の最古の月', () => {
      expect(repo.earliestMonthKey({ isSoldMode: true })).toBe('2026-06');
    });

    it('出品中は出品日で数えるので別の月になる', () => {
      expect(repo.earliestMonthKey({ isSoldMode: false })).toBe('2026-07');
    });

    it('種別で絞ると最古の月も変わる', () => {
      expect(repo.earliestMonthKey({ isSoldMode: false, kind: 'used' })).toBe('2026-08');
    });

    it('0 件なら null', () => {
      expect(repo.earliestMonthKey({ isSoldMode: true, kind: 'sourced', monthKey: '2026-06' })).toBe(
        null,
      );
    });
  });

  describe('monthsWithRecords: 期間シートの月グリッドの濃淡（UI-SPEC §1.2）', () => {
    it('状態チップを無視して両方の状態から集める（古い順・重複なし）', () => {
      // 売れた記録は 2026-06 / 2026-08、出品中は 2026-07 / 2026-08。
      // 2026-07 は出品中しかない月なので、状態で絞っていない証拠になる
      expect(repo.monthsWithRecords()).toEqual(['2026-06', '2026-07', '2026-08']);
    });

    it('種別で絞られない（引数を取らないので絞りようがないことを固定する）', () => {
      // 不用品しかない月・仕入品しかない月のどちらも落ちない
      expect(repo.monthsWithRecords()).toContain('2026-07'); // 仕入品の出品中だけ
      expect(repo.monthsWithRecords()).toContain('2026-06'); // 不用品の売れた記録だけ
    });
  });

  describe('careerSummary.totalSales: 出品価格の合計（UI-SPEC §6-3）', () => {
    it('出品中の Σ salesPrice が取れる', () => {
      expect(repo.careerSummary({ isSoldMode: false }).totalSales).toBe(1500 + 800);
    });

    it('月で絞ればその月ぶんだけになる', () => {
      const summary = repo.careerSummary({ isSoldMode: false, monthKey: '2026-08' });

      expect(summary.totalSales).toBe(800);
      expect(summary.recordCount).toBe(1);
    });
  });
});

describe('UI-SPEC §8 出品中 ⇄ 売れた の切り替え（案 15c）', () => {
  let repo: Repository;

  beforeEach(() => {
    repo = createRepository(drizzle(newDatabase(), { schema }), { generateId: randomUUID });
  });

  /** 出品中のレコードを 1 件作る（出品日は引数で動かす） */
  const listing = (saleStartDate: Date) =>
    repo.create({ ...base, kind: 'used', purchasePrice: 0, saleStartDate });

  it('売れた側は渡した日付をそのまま入れる（§8.5 派生決定 3 の判断は呼び出し側）', () => {
    const created = listing(new Date(2026, 7, 2, 9, 0));
    repo.setSoldStatus(created.id, true, new Date(2026, 7, 10, 15, 45));

    const saved = repo.getById(created.id);
    expect(saved?.isSold).toBe(true);
    expect(saved?.saleDate).toBe('2026-08-10T15:45:00.000');
  });

  it('日付を省いたときは今日が入る（§8.1 の既定）', () => {
    const created = listing(new Date(2026, 7, 2, 9, 0));
    repo.setSoldStatus(created.id, true);

    expect(repo.getById(created.id)?.saleDate?.slice(0, 10)).toBe(
      toDbDate(new Date()).slice(0, 10),
    );
  });

  it('出品中に戻すと販売日が消える（§8.4）', () => {
    const created = listing(new Date(2026, 7, 2, 9, 0));
    repo.setSoldStatus(created.id, true, new Date(2026, 7, 10, 15, 45));
    repo.setSoldStatus(created.id, false);

    const saved = repo.getById(created.id);
    expect(saved?.isSold).toBe(false);
    expect(saved?.saleDate).toBe(null);
  });

  it('setSaleDate は状態を変えずに売れた日だけ差し替える（§8.2 の常設行）', () => {
    const created = listing(new Date(2026, 7, 2, 9, 0));
    repo.setSoldStatus(created.id, true, new Date(2026, 7, 10, 15, 45));
    repo.setSaleDate(created.id, new Date(2026, 7, 5, 15, 45));

    const saved = repo.getById(created.id);
    expect(saved?.isSold).toBe(true);
    expect(saved?.saleDate).toBe('2026-08-05T15:45:00.000');
  });
});

describe('SPEC-V4 §4.4 タグが付いても集計が二重にならない', () => {
  let repo: Repository;
  let tagRepo: TagRepository;

  beforeEach(() => {
    const db = drizzle(newDatabase(), { schema });
    repo = createRepository(db, { generateId: randomUUID });
    tagRepo = createTagRepository(db, { generateId: randomUUID });
  });

  const sold = (tagIds: string[]) =>
    repo.create({
      ...base,
      kind: 'used',
      purchasePrice: 0,
      isSold: true,
      saleDate: new Date(2026, 7, 5, 12, 0, 0),
      tagIds,
    });

  /**
   * §4.4 の案 B（JOIN + DISTINCT）を退けた理由をテストで固定する。
   * タグを 2 つ付けた記録が 2 行に増えると、件数も収支も倍になる ──
   * EXISTS（案 A）は行を増やさないので、集計は付ける前と変わらない。
   */
  it('タグを 2 つ付けても careerSummary の件数・合計は変わらない', () => {
    const clothes = tagRepo.create({ name: '洋服', colorKey: 'red' });
    const summer = tagRepo.create({ name: '春夏物', colorKey: 'blue' });
    const record = sold([]);
    const before = repo.careerSummary({ isSoldMode: true });

    repo.update(record.id, {
      ...base,
      kind: 'used',
      purchasePrice: 0,
      isSold: true,
      saleDate: new Date(2026, 7, 5, 12, 0, 0),
      tagIds: [clothes.id, summer.id],
    });

    expect(repo.careerSummary({ isSoldMode: true })).toEqual(before);
  });

  it('一覧・月次グループ・分析でもレコードが重複しない', () => {
    const clothes = tagRepo.create({ name: '洋服', colorKey: 'red' });
    const summer = tagRepo.create({ name: '春夏物', colorKey: 'blue' });
    sold([clothes.id, summer.id]);

    expect(repo.filteredRecords({ isSoldMode: true })).toHaveLength(1);
    expect(repo.filteredAndGrouped({ isSoldMode: true })[0].recordCount).toBe(1);
    expect(repo.analyticsSummary({ monthKey: null }).recordCount).toBe(1);
  });
});

describe('SPEC-V4 §4.6 countRecords: 絞り込みシート下部の「N 件」', () => {
  let repo: Repository;

  beforeEach(() => {
    repo = createRepository(drizzle(newDatabase(), { schema }), { generateId: randomUUID });
  });

  const create = (over: Partial<SaveRecordInput>) =>
    repo.create({ ...base, kind: 'used', purchasePrice: 0, ...over });

  beforeEach(() => {
    // 売却済み 2026-08 に 2 件（うち 1 件は仕入品）／2026-07 に 1 件／出品中 1 件
    create({ isSold: true, saleDate: new Date(2026, 7, 5) });
    create({ kind: 'sourced', purchasePrice: 100, isSold: true, saleDate: new Date(2026, 7, 6) });
    create({ isSold: true, saleDate: new Date(2026, 6, 5) });
    create({ isSold: false, saleDate: null });
  });

  it('件数だけを返す（条件は buildWhere と同じなので一覧の件数と必ず一致する）', () => {
    const filter = { isSoldMode: true, monthKey: '2026-08' };

    expect(repo.countRecords(filter)).toBe(2);
    expect(repo.countRecords(filter)).toBe(repo.filteredRecords(filter).length);
  });

  it('状態・期間・種別の 3 条件が効く', () => {
    expect(repo.countRecords({ isSoldMode: true })).toBe(3);
    expect(repo.countRecords({ isSoldMode: false })).toBe(1);
    expect(repo.countRecords({ isSoldMode: true, kind: 'sourced' })).toBe(1);
    expect(repo.countRecords({ isSoldMode: true, monthKey: '2026-07' })).toBe(1);
  });

  it('0 件でも落ちずに 0 を返す', () => {
    expect(repo.countRecords({ isSoldMode: true, monthKey: '2020-01' })).toBe(0);
  });
});

describe('SPEC-V4 §4.5 buildWhere に足した 2 条件（販売サイト / タグ）', () => {
  let repo: Repository;
  let tagRepo: TagRepository;
  let clothes: schema.Tag;
  let summer: schema.Tag;

  const soldOn = (day: number) => new Date(2026, 7, day, 12, 0, 0);

  beforeEach(() => {
    const db = drizzle(newDatabase(), { schema });
    repo = createRepository(db, { generateId: randomUUID });
    tagRepo = createTagRepository(db, { generateId: randomUUID });
    clothes = tagRepo.create({ name: '洋服', colorKey: 'red' });
    summer = tagRepo.create({ name: '春夏物', colorKey: 'blue' });

    const sold = (over: Partial<SaveRecordInput>) =>
      repo.create({ ...base, kind: 'used', purchasePrice: 0, isSold: true, ...over });

    // 売却済み 3 件（メルカリ 2 / ラクマ 1）＋ 出品中 1 件（サイト名は空）
    sold({ saleDate: soldOn(1), siteName: 'メルカリ', tagIds: [clothes.id] });
    sold({ saleDate: soldOn(2), siteName: 'メルカリ', tagIds: [summer.id] });
    sold({ saleDate: soldOn(3), siteName: 'ラクマ', tagIds: [clothes.id, summer.id] });
    repo.create({ ...base, kind: 'used', purchasePrice: 0, tagIds: [clothes.id] });
  });

  describe('販売サイト（§4.2）', () => {
    it('名前の完全一致で絞れる', () => {
      expect(repo.countRecords({ isSoldMode: true, siteName: 'メルカリ' })).toBe(2);
      expect(repo.countRecords({ isSoldMode: true, siteName: 'ラクマ' })).toBe(1);
    });

    it('合計行（careerSummary）にも同じ条件が効く（§4.5 の表）', () => {
      expect(repo.careerSummary({ isSoldMode: true, siteName: 'メルカリ' }).recordCount).toBe(2);
    });

    /** 出品中の記録は site_name が空。画面で節を消すのと二重に、SQL の側でも無視する（§4.2） */
    it('isSoldMode = false のときは条件ごと無視される', () => {
      expect(repo.countRecords({ isSoldMode: false, siteName: 'メルカリ' })).toBe(1);
      expect(repo.filteredRecords({ isSoldMode: false, siteName: 'メルカリ' })).toHaveLength(1);
    });

    it('null / 空文字は「すべて」（条件を組み立てない）', () => {
      expect(repo.countRecords({ isSoldMode: true, siteName: null })).toBe(3);
      expect(repo.countRecords({ isSoldMode: true, siteName: '' })).toBe(3);
    });
  });

  describe('タグ（§4.4 の EXISTS）', () => {
    it('1 つのタグで絞れる', () => {
      expect(repo.countRecords({ isSoldMode: true, tagIds: [clothes.id] })).toBe(2);
    });

    /** 2 つ以上は OR。両方付いた記録が二重に数えられないことがこの条件の要点 */
    it('2 つ選ぶと OR になり、両方付いた記録も 1 件のまま', () => {
      const filter = { isSoldMode: true, tagIds: [clothes.id, summer.id] };

      expect(repo.countRecords(filter)).toBe(3);
      expect(repo.filteredRecords(filter)).toHaveLength(3);
      expect(repo.careerSummary(filter).recordCount).toBe(3);
      expect(repo.filteredAndGrouped(filter)[0].recordCount).toBe(3);
    });

    it('存在しない id は単に 0 件になる（SQL は壊れない。§4.7）', () => {
      expect(repo.countRecords({ isSoldMode: true, tagIds: ['deleted'] })).toBe(0);
    });

    it('空配列は「すべて」（条件を組み立てない）', () => {
      expect(repo.countRecords({ isSoldMode: true, tagIds: [] })).toBe(3);
    });

    it('出品中の記録にもタグの条件は効く（状態と違って落とさない）', () => {
      expect(repo.countRecords({ isSoldMode: false, tagIds: [clothes.id] })).toBe(1);
      expect(repo.countRecords({ isSoldMode: false, tagIds: [summer.id] })).toBe(0);
    });
  });

  it('販売サイトとタグは AND で重なる', () => {
    expect(
      repo.countRecords({ isSoldMode: true, siteName: 'メルカリ', tagIds: [clothes.id] }),
    ).toBe(1);
  });

  it('earliestMonthKey も同じ条件で動く（buildWhere の 4 経路すべてに効く。§4.4）', () => {
    expect(repo.earliestMonthKey({ isSoldMode: true, siteName: 'ラクマ' })).toBe('2026-08');
    expect(repo.earliestMonthKey({ isSoldMode: true, siteName: '無い名前' })).toBeNull();
  });
});
