// SPEC.md §6.2（DataView の集計）を repository のレベルで検証する。
//
// アプリ本体と同じ schema / migration / repository を、expo-sqlite の代わりに
// better-sqlite3（インメモリ）で動かす（scripts/db-smoke-test.ts と同じ構成）。
// repository は db 注入式なのでコードパスは共通で、SQL 方言も同じ SQLite。

import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { beforeAll, describe, expect, it } from 'vitest';

import journal from '../../drizzle/meta/_journal.json';
import { netProfit, totalExpenses } from '../logic/profit';
import {
  createRepository,
  type AnalyticsFilter,
  type AnalyticsRange,
  type Repository,
  type SaveRecordInput,
} from './repository';
import * as schema from './schema';

/**
 * 期間だけの集計条件。種別フィルタ（SPEC-V2 §4.2）が入って引数が AnalyticsFilter に
 * 変わったので、種別を見ない既存のケースはこれで包む（kind 省略 = すべて）。
 * 種別で絞るケースは repository.test.ts 側に置く。
 */
const period = (range: AnalyticsRange): AnalyticsFilter => ({ range });

const base: Omit<SaveRecordInput, 'itemName' | 'isSold' | 'saleStartDate' | 'saleDate'> = {
  // 仕入価格を持つフィクスチャなので仕入品。不用品にすると §2.4 の正規化で 0 になる
  kind: 'sourced',
  salesPrice: 0,
  purchasePrice: 0,
  postage: 0,
  envelopeCost: 0,
  othersCost: 0,
  commission: 10,
  memo: '',
};

const d = (y: number, m: number, day: number, h = 12, min = 0) =>
  new Date(y, m - 1, day, h, min, 0, 0);

let repo: Repository;
/** 期待値を手計算する側（SQL の SUM と突き合わせる） */
let created: Record<string, ReturnType<Repository['create']>>;

beforeAll(() => {
  const sqlite = new Database(':memory:');
  const drizzleDir = fileURLToPath(new URL('../../drizzle/', import.meta.url));
  for (const entry of journal.entries) {
    const migrationSql = readFileSync(`${drizzleDir}${entry.tag}.sql`, 'utf8');
    for (const statement of migrationSql.split('--> statement-breakpoint')) {
      sqlite.exec(statement);
    }
  }

  repo = createRepository(drizzle(sqlite, { schema }), { generateId: randomUUID });

  created = {
    // 2026-07-05 12:00 / 手数料 99.9 円 → 丸めなしの合算を確かめるための小数
    july1: repo.create({
      ...base,
      itemName: 'iPhone ケース',
      salesPrice: 999,
      purchasePrice: 300,
      postage: 175,
      isSold: true,
      saleStartDate: d(2026, 6, 20),
      saleDate: d(2026, 7, 5),
    }),
    // 同じ日の 2 件目（日別ではまとまり、明細では別の点になる）
    july2: repo.create({
      ...base,
      itemName: 'ゲームソフト',
      salesPrice: 3500,
      purchasePrice: 1200,
      postage: 210,
      isSold: true,
      saleStartDate: d(2026, 7, 1),
      saleDate: d(2026, 7, 5, 18, 30),
    }),
    // 期間の開始日ちょうど 00:10（決定 §7-10 の下端の検証用）
    aug1: repo.create({
      ...base,
      itemName: 'スニーカー',
      salesPrice: 8800,
      purchasePrice: 4000,
      postage: 750,
      isSold: true,
      saleStartDate: d(2026, 8, 1),
      saleDate: d(2026, 8, 3, 0, 10),
    }),
    // 期間の終了日ちょうど 23:30（決定 §7-10 の上端の検証用）
    aug2: repo.create({
      ...base,
      itemName: '腕時計',
      salesPrice: 20000,
      purchasePrice: 15000,
      isSold: true,
      saleStartDate: d(2026, 8, 5),
      saleDate: d(2026, 8, 9, 23, 30),
    }),
    // 赤字レコード（純利益がマイナスでも合算されること）
    prevYear: repo.create({
      ...base,
      itemName: '古本セット',
      salesPrice: 100,
      purchasePrice: 500,
      isSold: true,
      saleStartDate: d(2025, 3, 1),
      saleDate: d(2025, 3, 10),
    }),
  };

  // 出品中（対象外。saleDate は保存時に null 化される）
  repo.create({
    ...base,
    itemName: '出品中の商品',
    salesPrice: 5000,
    purchasePrice: 1000,
    isSold: false,
    saleStartDate: d(2026, 8, 4),
    saleDate: null,
  });
});

const sumSales = (keys: (keyof typeof created)[]) =>
  keys.reduce((acc, key) => acc + created[key].salesPrice, 0);
const sumProfit = (keys: (keyof typeof created)[]) =>
  keys.reduce((acc, key) => acc + netProfit(created[key]), 0);
const sumExpenses = (keys: (keyof typeof created)[]) =>
  keys.reduce((acc, key) => acc + totalExpenses(created[key]), 0);

/** 2026-08-03 〜 2026-08-09。境界ちょうどの 2 件を含む期間 */
const augRange = { startDate: d(2026, 8, 3), endDate: d(2026, 8, 9) };

describe('§6.2 対象レコード: isSold = true かつ saleDate 非 null のみ', () => {
  it('全期間（range = null）の合計に出品中は含まれない', () => {
    const summary = repo.analyticsSummary(period(null));
    expect(summary.recordCount).toBe(5);
    expect(summary.totalSales).toBeCloseTo(
      sumSales(['july1', 'july2', 'aug1', 'aug2', 'prevYear']),
      9,
    );
  });
});

describe('決定 §7-10 期間の境界: 開始日 00:00:00 〜 終了日 23:59:59.999 の閉区間', () => {
  it('終了日その日の 23:30 の売却が含まれる（Swift 版で漏れ得たケース）', () => {
    const details = repo.analyticsDetails(period(augRange), 'day', '2026-08-09', 'sales');
    expect(details.map((r) => r.itemName)).toEqual(['腕時計']);
  });

  it('開始日その日の 00:10 の売却も含まれる', () => {
    const details = repo.analyticsDetails(period(augRange), 'day', '2026-08-03', 'sales');
    expect(details.map((r) => r.itemName)).toEqual(['スニーカー']);
  });

  it('期間外（7 月・前年）は集計から外れる', () => {
    const summary = repo.analyticsSummary(period(augRange));
    expect(summary.recordCount).toBe(2);
    expect(summary.totalSales).toBeCloseTo(sumSales(['aug1', 'aug2']), 9);
  });

  it('開始日と終了日が同じ日でも、その日ぶんはすべて入る', () => {
    const oneDay = { startDate: d(2026, 8, 9), endDate: d(2026, 8, 9) };
    expect(repo.analyticsSummary(period(oneDay)).recordCount).toBe(1);
  });
});

describe('§6.2 サマリーカード: totalNetProfit = totalSales − totalExpenses', () => {
  it('合算値は丸めずに返る（丸めは表示側。決定 §7-2）', () => {
    const summary = repo.analyticsSummary(period(null));
    const expected = sumProfit(['july1', 'july2', 'aug1', 'aug2', 'prevYear']);
    expect(summary.totalNetProfit).toBeCloseTo(expected, 9);
    expect(summary.totalExpenses).toBeCloseTo(
      sumExpenses(['july1', 'july2', 'aug1', 'aug2', 'prevYear']),
      9,
    );
    // 手数料 99.9 円ぶんの小数が生きたまま返っていること
    expect(summary.totalNetProfit).not.toBe(Math.round(summary.totalNetProfit));
  });

  it('totalNetProfit は Σ netProfit と一致する（§6.2 の「等価」）', () => {
    const summary = repo.analyticsSummary(period(augRange));
    expect(summary.totalSales - summary.totalExpenses).toBeCloseTo(summary.totalNetProfit, 9);
    expect(summary.totalNetProfit).toBeCloseTo(sumProfit(['aug1', 'aug2']), 9);
  });

  it('赤字レコードも合算される（純利益はマイナスになり得る）', () => {
    const range = { startDate: d(2025, 3, 1), endDate: d(2025, 3, 31) };
    const summary = repo.analyticsSummary(period(range));
    expect(summary.totalNetProfit).toBeCloseTo(sumProfit(['prevYear']), 9);
    expect(summary.totalNetProfit).toBeLessThan(0);
  });

  it('対象 0 件なら合計は 0（coalesce）', () => {
    const empty = { startDate: d(2020, 1, 1), endDate: d(2020, 1, 31) };
    expect(repo.analyticsSummary(period(empty))).toEqual({
      totalSales: 0,
      totalExpenses: 0,
      totalNetProfit: 0,
      recordCount: 0,
    });
  });
});

describe('§6.2 チャート集計: 単位ごとの日付キーに丸めて合算', () => {
  it('明細は丸めなし（同じ日の 2 件が別の点になる）', () => {
    const series = repo.analyticsSeries(period(null), 'record');
    expect(series).toHaveLength(5);
    // 日付キーの昇順
    expect(series.map((p) => p.date.getTime())).toEqual(
      [...series.map((p) => p.date.getTime())].sort((a, b) => a - b),
    );
    expect(series[1].date).toEqual(d(2026, 7, 5));
    expect(series[1].recordCount).toBe(1);
  });

  it('日別は startOfDay に丸める（同じ日の 2 件が 1 点にまとまる）', () => {
    const july = { startDate: d(2026, 7, 1), endDate: d(2026, 7, 31) };
    const series = repo.analyticsSeries(period(july), 'day');
    expect(series).toHaveLength(1);
    expect(series[0].key).toBe('2026-07-05');
    expect(series[0].date).toEqual(new Date(2026, 6, 5, 0, 0, 0, 0));
    expect(series[0].recordCount).toBe(2);
    expect(series[0].sales).toBeCloseTo(sumSales(['july1', 'july2']), 9);
    expect(series[0].profit).toBeCloseTo(sumProfit(['july1', 'july2']), 9);
  });

  it('月別は月初日に丸める', () => {
    const series = repo.analyticsSeries(period(null), 'month');
    expect(series.map((p) => p.key)).toEqual(['2025-03', '2026-07', '2026-08']);
    expect(series[1].date).toEqual(new Date(2026, 6, 1, 0, 0, 0, 0));
    expect(series[2].profit).toBeCloseTo(sumProfit(['aug1', 'aug2']), 9);
  });

  it('年別は年初日に丸める', () => {
    const series = repo.analyticsSeries(period(null), 'year');
    expect(series.map((p) => p.key)).toEqual(['2025', '2026']);
    expect(series[1].date).toEqual(new Date(2026, 0, 1, 0, 0, 0, 0));
    expect(series[1].recordCount).toBe(4);
    expect(series[1].sales).toBeCloseTo(sumSales(['july1', 'july2', 'aug1', 'aug2']), 9);
  });

  it('各点の合計は期間全体の合計と一致する', () => {
    const series = repo.analyticsSeries(period(augRange), 'day');
    const summary = repo.analyticsSummary(period(augRange));
    const seriesSales = series.reduce((acc, p) => acc + p.sales, 0);
    const seriesProfit = series.reduce((acc, p) => acc + p.profit, 0);
    expect(seriesSales).toBeCloseTo(summary.totalSales, 9);
    expect(seriesProfit).toBeCloseTo(summary.totalNetProfit, 9);
  });
});

describe('§6.2 内訳リスト: 指標に応じた降順', () => {
  it('売上金額なら salesPrice の降順', () => {
    const details = repo.analyticsDetails(period(null), 'day', '2026-07-05', 'sales');
    expect(details.map((r) => r.itemName)).toEqual(['ゲームソフト', 'iPhone ケース']);
  });

  it('純利益なら netProfit の降順（売上の順とは逆になるケース）', () => {
    // 8 月: スニーカー 売上 8800 / 利益 8800−(4000+750+880)=3170
    //       腕時計   売上 20000 / 利益 20000−(15000+2000)=3000
    // → 売上順は腕時計が先、利益順はスニーカーが先
    const august = { startDate: d(2026, 8, 1), endDate: d(2026, 8, 31) };
    expect(
      repo.analyticsDetails(period(august), 'month', '2026-08', 'sales').map((r) => r.itemName),
    ).toEqual(['腕時計', 'スニーカー']);
    expect(
      repo.analyticsDetails(period(august), 'month', '2026-08', 'netProfit').map((r) => r.itemName),
    ).toEqual(['スニーカー', '腕時計']);
  });

  it('期間外のキーを指定しても期間条件が優先されて 0 件になる', () => {
    expect(repo.analyticsDetails(period(augRange), 'day', '2026-07-05', 'sales')).toHaveLength(0);
  });
});
