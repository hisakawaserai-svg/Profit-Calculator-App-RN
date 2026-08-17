// データ層のスモークテスト。実行: npm run db:smoke
//
// アプリ本体と同じ schema / migration / repository を、expo-sqlite の代わりに
// better-sqlite3（インメモリ）で動かして検証する。repository は db 注入式なので
// コードパスは共通（SQL 方言も同じ SQLite）。

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';

import journal from '../drizzle/meta/_journal.json';
import { toDbDate } from '../src/db/dates';
import { createRepository, type SaveRecordInput } from '../src/db/repository';
import * as schema from '../src/db/schema';
import { netProfit, totalExpenses } from '../src/logic/profit';

// ---- セットアップ: drizzle-kit generate の成果物でマイグレーション ----

const sqlite = new Database(':memory:');
for (const entry of journal.entries) {
  const migrationSql = readFileSync(
    join(__dirname, '..', 'drizzle', `${entry.tag}.sql`),
    'utf8',
  );
  for (const statement of migrationSql.split('--> statement-breakpoint')) {
    sqlite.exec(statement);
  }
}

const db = drizzle(sqlite, { schema });
// 写真ファイルを消す口（SPEC-V5 §1.5）。このスクリプトは端末のファイルを持たないので
// 何もしない関数を渡す（消す判断が repository 側にあることは repository.test.ts が見る）
const repo = createRepository(db, { generateId: randomUUID, deletePhotoFile: () => {} });

// ---- ダミーデータ投入 ----

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
  // 販売サイト名（SPEC-V3 §1.5.1）。プリセット未実装の時点では常に空文字
  siteName: '',
  // 商品写真（SPEC-V5 §1.3）。null = 写真なし
  photoFileName: null,
  shippingMaterialCost: 0,
  excludesShippingMaterial: false,
  // タグ（SPEC-V4 §1.4）。この経路ではタグを付けないので空配列
  // 目標は既定で「決めていない」（SPEC-V9 §1）
  targetProfit: null,
  tagIds: [],
};

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day, 12, 0, 0);

// 売却済み: 2026-07 に 2 件、2026-08 に 1 件 / 出品中: 2026-08 に 2 件
const sold1 = repo.create({
  ...base,
  itemName: 'iPhone ケース',
  salesPrice: 999, // 手数料 99.9 円 → 小数を含む netProfit で丸めなしを検証
  purchasePrice: 300,
  postage: 175,
  isSold: true,
  saleStartDate: d(2026, 6, 20),
  saleDate: d(2026, 7, 5),
});
const sold2 = repo.create({
  ...base,
  itemName: 'ゲームソフト',
  salesPrice: 3500,
  purchasePrice: 1200,
  postage: 210,
  envelopeCost: 30,
  isSold: true,
  saleStartDate: d(2026, 7, 1),
  saleDate: d(2026, 7, 20),
});
const sold3 = repo.create({
  ...base,
  itemName: 'スニーカー',
  salesPrice: 8800,
  purchasePrice: 4000,
  postage: 750,
  othersCost: 120,
  isSold: true,
  saleStartDate: d(2026, 8, 1),
  saleDate: d(2026, 8, 3),
});
const listing1 = repo.create({
  ...base,
  itemName: 'iphone 充電器', // 検索の大文字小文字無視の検証用
  salesPrice: 1500,
  purchasePrice: 500,
  isSold: false,
  saleStartDate: d(2026, 8, 2),
  saleDate: d(2026, 8, 2), // 出品中なので保存時に null 化されるはず（§5.2）
});
repo.create({
  ...base,
  itemName: '古本セット',
  salesPrice: 1200,
  purchasePrice: 100,
  postage: 350,
  isSold: false,
  saleStartDate: d(2026, 8, 9),
  saleDate: null,
});

// ---- 検証 ----

// 保存時の正規化: 不用品の仕入価格は 0（SPEC-V2 §2.4）
const used = repo.create({
  ...base,
  itemName: '不用品のマグカップ',
  kind: 'used',
  salesPrice: 800,
  purchasePrice: 500, // 入力されていても 0 で保存される
  isSold: false,
  saleStartDate: d(2026, 8, 10),
  saleDate: null,
});
assert.equal(repo.getById(used.id)?.kind, 'used');
assert.equal(repo.getById(used.id)?.purchasePrice, 0, '不用品の仕入価格は 0 に強制される');
assert.equal(repo.getById(sold1.id)?.purchasePrice, 300, '仕入品の仕入価格はそのまま保存される');
repo.remove(used.id); // 以降の件数アサーションに影響させない

// 保存時の正規化: 出品中は saleDate 強制 null（§5.2）
assert.equal(repo.getById(listing1.id)?.saleDate, null, '出品中の saleDate は null 化される');
assert.equal(repo.getById(sold1.id)?.saleDate, toDbDate(d(2026, 7, 5)), '売却済みの saleDate は保持される');

// filteredAndGrouped: 実績タブ・全期間・販売日降順
const soldGroups = repo.filteredAndGrouped({ isSoldMode: true });
assert.deepEqual(
  soldGroups.map((g) => g.monthKey),
  ['2026-08', '2026-07'],
  '月グループは販売日の年月・降順',
);
assert.deepEqual(
  soldGroups[1].records.map((r) => r.itemName),
  ['ゲームソフト', 'iPhone ケース'],
  'グループ内は基準日（販売日）の降順',
);

// 月次集計: SQL の SUM が §2 の式（丸めなし Double）と一致すること
const jsProfit = (rows: (typeof sold1)[]) => rows.reduce((acc, r) => acc + netProfit(r), 0);
const jsExpenses = (rows: (typeof sold1)[]) => rows.reduce((acc, r) => acc + totalExpenses(r), 0);
const july = soldGroups[1];
const julyExpected = jsProfit([sold2, sold1]);
assert.ok(Math.abs(july.totalNetProfit - julyExpected) < 1e-9, `7月の Σ netProfit: ${july.totalNetProfit} ≒ ${julyExpected}`);
assert.ok(Math.abs(july.totalExpenses - jsExpenses([sold2, sold1])) < 1e-9, '7月の Σ totalExpenses');
assert.notEqual(july.totalNetProfit, Math.round(july.totalNetProfit), '小数を含む合算値が丸めずに返る（丸めは表示側）');
assert.equal(july.recordCount, 2);

// 月フィルタ（年月の完全一致）
const julyOnly = repo.filteredAndGrouped({ isSoldMode: true, period: '2026-07' });
assert.equal(julyOnly.length, 1);
assert.equal(julyOnly[0].recordCount, 2);

// 商品名検索（大文字小文字無視・両モード対象を isSold で絞る）
const soldSearch = repo.filteredAndGrouped({ isSoldMode: true, searchText: 'IPHONE' });
assert.deepEqual(soldSearch.flatMap((g) => g.records.map((r) => r.itemName)), ['iPhone ケース']);
const listingSearch = repo.filteredAndGrouped({ isSoldMode: false, searchText: 'IPHONE' });
assert.deepEqual(listingSearch.flatMap((g) => g.records.map((r) => r.itemName)), ['iphone 充電器']);

// ソート 8 種のうち日付以外の代表: 利益高い順（月内合計 Σ netProfit の比較）
const byProfit = repo.filteredAndGrouped({ isSoldMode: true }, 'profitDesc');
assert.deepEqual(byProfit.map((g) => g.monthKey), ['2026-08', '2026-07'], '8月(スニーカー)の利益 > 7月合計');
const byProfitAsc = repo.filteredAndGrouped({ isSoldMode: true }, 'profitAsc');
assert.deepEqual(byProfitAsc.map((g) => g.monthKey), ['2026-07', '2026-08']);
const byExpenses = repo.filteredAndGrouped({ isSoldMode: true }, 'expensesDesc');
assert.equal(byExpenses[0].monthKey, '2026-08', '経費高い順の先頭は8月');

// 出品中タブは saleStartDate 基準でグループ化
const listingGroups = repo.filteredAndGrouped({ isSoldMode: false });
assert.deepEqual(listingGroups.map((g) => g.monthKey), ['2026-08']);
assert.equal(listingGroups[0].recordCount, 2);

// careerSummary（下部累計）: フィルタ適用後の全件合計・丸めなし
const summary = repo.careerSummary({ isSoldMode: true });
assert.equal(summary.recordCount, 3);
assert.ok(Math.abs(summary.totalNetProfit - jsProfit([sold1, sold2, sold3])) < 1e-9);

// 売却トグル（§3.2）: ON で saleDate = 現在時刻、OFF で null
repo.setSoldStatus(listing1.id, true);
assert.notEqual(repo.getById(listing1.id)?.saleDate, null, 'トグル ON で saleDate が入る');
assert.equal(repo.getById(listing1.id)?.isSold, true);
repo.setSoldStatus(listing1.id, false);
assert.equal(repo.getById(listing1.id)?.saleDate, null, 'トグル OFF で saleDate が null に戻る');

// update / remove
repo.update(sold3.id, { ...sold3, tagIds: [], itemName: 'スニーカー（値下げ）', salesPrice: 8000, saleStartDate: d(2026, 8, 1), saleDate: d(2026, 8, 3) });
assert.equal(repo.getById(sold3.id)?.salesPrice, 8000);
repo.remove(sold3.id);
assert.equal(repo.getById(sold3.id), undefined);
assert.equal(repo.careerSummary({ isSoldMode: true }).recordCount, 2);

console.log('✅ db smoke test: all assertions passed');
console.log('   売却済みグループ:', soldGroups.map((g) => `${g.monthKey} (${g.recordCount}件, Σ利益=${g.totalNetProfit})`).join(' / '));
