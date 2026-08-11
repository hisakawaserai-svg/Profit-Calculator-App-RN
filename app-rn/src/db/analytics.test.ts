// SPEC.md §6.2 / UI-SPEC §1.5（データタブの集計）を repository のレベルで検証する。
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
  type Repository,
  type SaveRecordInput,
} from './repository';
import * as schema from './schema';

/**
 * 期間だけの集計条件。種別フィルタ（SPEC-V2 §4.2）が入って引数が AnalyticsFilter に
 * 変わったので、種別を見ない既存のケースはこれで包む（kind 省略 = すべて）。
 * 種別で絞るケースは repository.test.ts 側に置く。
 *
 * 期間は開始・終了日の自由指定から月キーに変わった（UI-SPEC §5-5）。null = 全期間。
 */
const period = (monthKey: string | null): AnalyticsFilter => ({ monthKey });

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

/** 8 月（2026-08）。日をまたぐ端の 2 件（00:10 と 23:30）を含む月 */
const AUGUST = '2026-08';

describe('§6.2 対象レコード: isSold = true かつ saleDate 非 null のみ', () => {
  it('全期間（monthKey = null）の合計に出品中は含まれない', () => {
    const summary = repo.analyticsSummary(period(null));
    expect(summary.recordCount).toBe(5);
    expect(summary.totalSales).toBeCloseTo(
      sumSales(['july1', 'july2', 'aug1', 'aug2', 'prevYear']),
      9,
    );
  });
});

describe('UI-SPEC §5-5 期間は販売日の月キーの完全一致', () => {
  it('その月の端（00:10 / 23:30）の売却も同じ月に入る', () => {
    // 旧実装は開始日 00:00:00 〜 終了日 23:59:59.999 の閉区間を自前で組んでいた（旧・決定 §7-10）。
    // 月キーの前方一致にしたことで、時刻に関わらずその月のものはすべて入る
    expect(repo.analyticsDetails(period(AUGUST), 'day', '2026-08-03').map((r) => r.itemName)).toEqual([
      'スニーカー',
    ]);
    expect(repo.analyticsDetails(period(AUGUST), 'day', '2026-08-09').map((r) => r.itemName)).toEqual([
      '腕時計',
    ]);
  });

  it('ほかの月（7 月・前年）は集計から外れる', () => {
    const summary = repo.analyticsSummary(period(AUGUST));
    expect(summary.recordCount).toBe(2);
    expect(summary.totalSales).toBeCloseTo(sumSales(['aug1', 'aug2']), 9);
  });

  it('年をまたいでも月キーの完全一致で絞られる（2025-03 と 2026-03 が混ざらない）', () => {
    expect(repo.analyticsSummary(period('2025-03')).recordCount).toBe(1);
    expect(repo.analyticsSummary(period('2026-03')).recordCount).toBe(0);
  });
});

describe('§6.2 合計行: totalNetProfit = totalSales − totalExpenses', () => {
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
    const summary = repo.analyticsSummary(period(AUGUST));
    expect(summary.totalSales - summary.totalExpenses).toBeCloseTo(summary.totalNetProfit, 9);
    expect(summary.totalNetProfit).toBeCloseTo(sumProfit(['aug1', 'aug2']), 9);
  });

  it('赤字レコードも合算される（収支はマイナスになり得る）', () => {
    const summary = repo.analyticsSummary(period('2025-03'));
    expect(summary.totalNetProfit).toBeCloseTo(sumProfit(['prevYear']), 9);
    expect(summary.totalNetProfit).toBeLessThan(0);
  });

  it('対象 0 件なら合計は 0（coalesce）', () => {
    expect(repo.analyticsSummary(period('2020-01'))).toEqual({
      totalSales: 0,
      totalExpenses: 0,
      totalNetProfit: 0,
      recordCount: 0,
    });
  });
});

describe('§6.2 チャート集計: 刻みごとの日付キーに丸めて合算', () => {
  it('日ごとは startOfDay に丸める（同じ日の 2 件が 1 点にまとまる）', () => {
    const series = repo.analyticsSeries(period('2026-07'), 'day');
    expect(series).toHaveLength(1);
    expect(series[0].key).toBe('2026-07-05');
    expect(series[0].date).toEqual(new Date(2026, 6, 5, 0, 0, 0, 0));
    expect(series[0].recordCount).toBe(2);
    expect(series[0].sales).toBeCloseTo(sumSales(['july1', 'july2']), 9);
    expect(series[0].profit).toBeCloseTo(sumProfit(['july1', 'july2']), 9);
  });

  it('月ごとは月初日に丸める（全期間で使う刻み。§5-5）', () => {
    const series = repo.analyticsSeries(period(null), 'month');
    expect(series.map((p) => p.key)).toEqual(['2025-03', '2026-07', '2026-08']);
    expect(series[1].date).toEqual(new Date(2026, 6, 1, 0, 0, 0, 0));
    expect(series[2].profit).toBeCloseTo(sumProfit(['aug1', 'aug2']), 9);
  });

  it('各点の合計は期間全体の合計と一致する', () => {
    const series = repo.analyticsSeries(period(AUGUST), 'day');
    const summary = repo.analyticsSummary(period(AUGUST));
    const seriesSales = series.reduce((acc, p) => acc + p.sales, 0);
    const seriesProfit = series.reduce((acc, p) => acc + p.profit, 0);
    expect(seriesSales).toBeCloseTo(summary.totalSales, 9);
    expect(seriesProfit).toBeCloseTo(summary.totalNetProfit, 9);
  });
});

describe('UI-SPEC §1.5-5 選択した点の一覧', () => {
  it('並びは収支（netProfit）の降順で固定（指標切替の廃止。§6-10）', () => {
    // 8 月: スニーカー 売上 8800 / 収支 8800−(4000+750+880)=3170
    //       腕時計   売上 20000 / 収支 20000−(15000+2000)=3000
    // → 売上順なら腕時計が先だが、収支順なのでスニーカーが先になる
    expect(
      repo.analyticsDetails(period(AUGUST), 'month', '2026-08').map((r) => r.itemName),
    ).toEqual(['スニーカー', '腕時計']);
  });

  it('同じキーの複数件がまとめて返る', () => {
    const details = repo.analyticsDetails(period(null), 'day', '2026-07-05');
    expect(details.map((r) => r.itemName)).toEqual(['ゲームソフト', 'iPhone ケース']);
  });

  it('期間外のキーを指定しても期間条件が優先されて 0 件になる', () => {
    expect(repo.analyticsDetails(period(AUGUST), 'day', '2026-07-05')).toHaveLength(0);
  });
});

describe('UI-SPEC §1.2 期間シートの月グリッド（monthsWithRecords）', () => {
  it('売却済みは販売日の月で数える（出品日の月ではない）', () => {
    // july1 は 2026-06-20 出品 → 2026-07-05 販売。数えるのは 2026-07 だけ
    expect(repo.monthsWithRecords()).toContain('2026-07');
    expect(repo.monthsWithRecords()).not.toContain('2026-06');
  });

  it('出品中は出品日の月で数える（データタブの対象外でもグリッドには出る）', () => {
    // 出品中の商品（2026-08-04 出品）。データタブの集計からは外れるが、
    // グリッドの濃淡は状態を無視した全記録で決まる（§1.2 の派生決定）
    expect(repo.monthsWithRecords()).toContain('2026-08');
  });

  it('古い順に重複なく並ぶ', () => {
    expect(repo.monthsWithRecords()).toEqual(['2025-03', '2026-07', '2026-08']);
  });
});

describe('UI-SPEC §5-14 月バーの ◀ の下端（analyticsEarliestMonthKey）', () => {
  it('売却済みレコードの最古の月を返す（選択中の月には左右されない）', () => {
    expect(repo.analyticsEarliestMonthKey({ monthKey: null })).toBe('2025-03');
    expect(repo.analyticsEarliestMonthKey({ monthKey: AUGUST })).toBe('2025-03');
  });

  it('出品中は含まれない（種別で絞ればその集合の最古になる）', () => {
    // 出品中の商品（2026-08-04 出品）は saleDate が null なので最古の判定に効かない
    expect(repo.analyticsEarliestMonthKey({ monthKey: null, kind: 'sourced' })).toBe('2025-03');
  });

  it('対象 0 件なら null', () => {
    expect(repo.analyticsEarliestMonthKey({ monthKey: null, kind: 'used' })).toBeNull();
  });
});
