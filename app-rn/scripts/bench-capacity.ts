// 規模の実測（何件まで耐えるか）。実行: npx tsx scripts/bench-capacity.ts 10000
//
// db-smoke-test.ts と同じ土台（better-sqlite3 + 本物の migration / repository）で、
// 件数だけを変えて画面ごとの所要時間を測る。UI の描画は測れないが、
// 画面が 1 フレーム目までに走らせる**クエリと JS の集計**はすべて同じコードを通る。

import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';

import journal from '../drizzle/meta/_journal.json';
import { createBackupRepository } from '../src/db/backup';
import { fromDbDate } from '../src/db/dates';
import { createRepository, type AnalyticsFilter, type RecordListFilter } from '../src/db/repository';
import * as schema from '../src/db/schema';
import { createTagRepository } from '../src/db/tags';
import { chartUnitFor } from '../src/logic/analytics';
import {
  computePersonalBests,
  evaluateAchievements,
  strikeAchievementsByRecordId,
  type AchievementListingRecord,
  type AchievementSaleRecord,
} from '../src/logic/achievements';
import {
  BACKUP_PRESETS_FILE,
  BACKUP_RECORD_TAGS_FILE,
  BACKUP_RECORDS_FILE,
  BACKUP_TAGS_FILE,
  buildBackupFile,
  buildBackupInfo,
  readBackupContents,
} from '../src/logic/backup';
import { BACKUP_INFO_FILE } from '../src/logic/labels';
import { periodAverageSaleDays } from '../src/logic/profit';

const COUNT = Number(process.argv[2] ?? 10_000);
const TAG_COUNT = 10;
const TODAY = new Date(2026, 7, 19, 12, 0, 0);

// ---- 計測の道具 ----

type Row = { group: string; label: string; ms: number; note: string };
const results: Row[] = [];

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/** 1 回だけ空回しして（SQLite のページキャッシュを温める）、その後 runs 回の中央値を取る */
function bench<T>(group: string, label: string, fn: () => T, runs = 5): T {
  fn();
  const times: number[] = [];
  let out!: T;
  for (let i = 0; i < runs; i += 1) {
    const t0 = performance.now();
    out = fn();
    times.push(performance.now() - t0);
  }
  results.push({ group, label, ms: median(times), note: '' });
  return out;
}

/** 1 回しか測れないもの（破壊的な操作など） */
function benchOnce<T>(group: string, label: string, fn: () => T): T {
  const t0 = performance.now();
  const out = fn();
  results.push({ group, label, ms: performance.now() - t0, note: '' });
  return out;
}

function note(text: string): void {
  results[results.length - 1].note = text;
}

// ---- DB を作る（アプリと同じくファイル。:memory: にすると I/O が消えて実機と離れる） ----

const dir = mkdtempSync(join(tmpdir(), 'bench-capacity-'));
const dbPath = join(dir, 'profit-calculator.db');
const sqlite = new Database(dbPath);

const migrateStart = performance.now();
for (const entry of journal.entries) {
  const sqlText = readFileSync(join(__dirname, '..', 'drizzle', `${entry.tag}.sql`), 'utf8');
  for (const statement of sqlText.split('--> statement-breakpoint')) sqlite.exec(statement);
}
const migrateMs = performance.now() - migrateStart;

const db = drizzle(sqlite, { schema });
const repo = createRepository(db, { generateId: randomUUID, deletePhotoFile: () => {} });
const tagRepo = createTagRepository(db, { generateId: randomUUID });
const backupRepo = createBackupRepository(db);

// ---- ダミーデータ ----

const ITEM_NAMES = [
  'ワンピース 花柄 Mサイズ', 'iPhone ケース クリア', 'ゲームソフト 中古',
  'スニーカー 27cm 白', '古本セット 文庫 10冊', 'マグカップ 陶器',
  'ニット セーター グレー', 'ヘッドホン ワイヤレス', '腕時計 レザーベルト',
  'トートバッグ キャンバス', 'フィギュア 限定版', 'コート ロング 冬物',
];
const SITE_NAMES = ['メルカリ', 'ラクマ', 'ヤフオク', 'PayPayフリマ', ''];

function pad(n: number, width = 2): string {
  return String(n).padStart(width, '0');
}

/** 端末ローカル時刻の ISO 風文字列（src/db/dates.ts と同じ形） */
function dbDate(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}T${pad(9 + (day % 10))}:${pad(day % 60)}:00.000`;
}

// 決定的な擬似乱数（実行のたびに同じデータになるように）
let seed = 12345;
function rand(): number {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}
function pick<T>(xs: readonly T[]): T {
  return xs[Math.floor(rand() * xs.length)];
}

const tagIds: string[] = [];
sqlite.transaction(() => {
  const insertTag = sqlite.prepare(
    'INSERT INTO tags (id, name, color_key, sort_order) VALUES (?, ?, ?, ?)',
  );
  const tagNames = ['洋服', '本', '家電', 'ゲーム', '雑貨', '靴', 'バッグ', 'おもちゃ', 'food', '季節物'];
  for (let i = 0; i < TAG_COUNT; i += 1) {
    const id = randomUUID();
    tagIds.push(id);
    insertTag.run(id, tagNames[i], 'blue', i);
  }

  const insertPreset = sqlite.prepare(
    `INSERT INTO presets (id, type, name, color_key, initial, value, sort_order,
       pack_quantity, pack_price, material_cost, calc_method,
       pack_height, pack_width, use_height, use_width)
     VALUES (?, ?, ?, ?, '', ?, ?, 0, 0, 0, 'individual', 0, 0, 0, 0)`,
  );
  for (let i = 0; i < 4; i += 1) insertPreset.run(randomUUID(), 'site', SITE_NAMES[i], 'red', 10, i);
  for (let i = 0; i < 5; i += 1) insertPreset.run(randomUUID(), 'shipping', `送料${i}`, 'green', 175 + i * 50, i);
  for (let i = 0; i < 3; i += 1) insertPreset.run(randomUUID(), 'packaging', `梱包${i}`, 'yellow', 20 + i * 10, i);
}).call(null);

const seedStart = performance.now();
sqlite.transaction(() => {
  const insertRecord = sqlite.prepare(
    `INSERT INTO sale_records (
       id, item_name, sales_price, purchase_price, postage, envelope_cost, others_cost,
       commission, is_sold, sale_start_date, sale_date, memo, kind, site_name,
       photo_file_name, shipping_material_cost, excludes_shipping_material, target_profit, listed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
  );
  const insertRecordTag = sqlite.prepare('INSERT INTO record_tags (record_id, tag_id) VALUES (?, ?)');

  // 直近 36 か月にばらす（2023-09 .. 2026-08）
  for (let i = 0; i < COUNT; i += 1) {
    const id = randomUUID();
    const monthsAgo = Math.floor(rand() * 36);
    const base = new Date(2026, 7 - monthsAgo, 1 + Math.floor(rand() * 28));
    const year = base.getFullYear();
    const month = base.getMonth() + 1;
    const day = base.getDate();
    const startDate = dbDate(year, month, day);
    // 8 割は売却済み。販売日は出品日の 0〜40 日後
    const isSold = rand() < 0.8;
    const sellDay = day + Math.floor(rand() * 40);
    const sold = new Date(year, month - 1, sellDay);
    const saleDate = isSold
      ? dbDate(sold.getFullYear(), sold.getMonth() + 1, sold.getDate())
      : null;

    const salesPrice = Math.floor(300 + rand() * 12_000);
    const kind = rand() < 0.6 ? 'sourced' : 'used';
    insertRecord.run(
      id,
      `${pick(ITEM_NAMES)} #${i}`,
      salesPrice,
      kind === 'sourced' ? Math.floor(salesPrice * (0.2 + rand() * 0.4)) : 0,
      Math.floor(rand() * 900),
      rand() < 0.3 ? 30 : 0,
      rand() < 0.2 ? Math.floor(rand() * 300) : 0,
      10,
      isSold ? 1 : 0,
      startDate,
      saleDate,
      rand() < 0.3 ? 'ネコポスで発送。梱包材は再利用。' : '',
      kind,
      pick(SITE_NAMES),
      null,
      0,
      0,
      rand() < 0.25 ? Math.floor(rand() * 3000) : null,
    );

    // 6 割の記録に 1〜3 個のタグ
    if (rand() < 0.6) {
      const n = 1 + Math.floor(rand() * 3);
      const used = new Set<string>();
      for (let t = 0; t < n; t += 1) {
        const tagId = pick(tagIds);
        if (used.has(tagId)) continue;
        used.add(tagId);
        insertRecordTag.run(id, tagId);
      }
    }
  }
}).call(null);
const seedMs = performance.now() - seedStart;

const dbBytes = statSync(dbPath).size;
const recordTagCount = sqlite.prepare('SELECT count(*) as c FROM record_tags').get() as { c: number };

console.log(`\n${'='.repeat(78)}`);
console.log(`件数: ${COUNT.toLocaleString()} 件 / タグ付け ${recordTagCount.c.toLocaleString()} 行 / DB ${(dbBytes / 1024 / 1024).toFixed(1)}MB`);
console.log(`投入 ${(seedMs / 1000).toFixed(1)}s / migration ${migrateMs.toFixed(0)}ms`);
console.log('='.repeat(78));

// ---- 1. 起動 ----
//
// アプリ起動時に走るのは initDatabase()（= migrate。適用済みなので journal を読むだけ）と、
// 最初に開くタブの問い合わせ。migration は上で実測済み（migrateMs）。

results.push({ group: '起動', label: 'migration（適用済み・全 12 本の検査）', ms: migrateMs, note: '初回起動時は実際に流れる' });

// ---- 2. 記録一覧（RecordListScreen） ----
//
// useRecordList（queryList）+ useRecordTags + useAchievementsData が 1 フレーム目に走る。

const listFilter: RecordListFilter = {
  isSoldMode: true, period: null, kind: null, siteName: null, tagIds: [], searchText: '',
};
const summaryFilter: RecordListFilter = { ...listFilter, searchText: '' };

const records = bench('記録一覧', 'filteredRecords（全件・販売日降順）', () =>
  repo.filteredRecords(listFilter, 'saleDateDesc'));
note(`${records.length.toLocaleString()} 行を JS に載せる`);

bench('記録一覧', 'careerSummary（合計行）', () => repo.careerSummary(summaryFilter));
bench('記録一覧', 'earliestMonthKey', () => repo.earliestMonthKey({ ...summaryFilter, period: null, searchText: '' }));
bench('記録一覧', 'monthsWithRecords（期間シート）', () => repo.monthsWithRecords());

const recordIds = bench('記録一覧', 'records.map(r => r.id)', () => records.map((r) => r.id));

// useRecordTags は id を join(',') して useMemo のキーにする
bench('記録一覧', "useRecordTags の recordIds.join(',')（毎レンダー）", () => recordIds.join(','));
note(`${(recordIds.join(',').length / 1024 / 1024).toFixed(2)}MB の文字列`);
bench('記録一覧', "同 key.split(',')", () => recordIds.join(',').split(','));

let tagsByRecordFailed: string | null = null;
try {
  const map = bench('記録一覧', 'tagsByRecord（一覧の全 id で 1 本の IN クエリ）', () =>
    tagRepo.tagsByRecord(recordIds), 3);
  note(`IN (?×${recordIds.length.toLocaleString()}) / ${map.size.toLocaleString()} 件ぶん返る`);
} catch (error) {
  tagsByRecordFailed = error instanceof Error ? error.message : String(error);
  results.push({ group: '記録一覧', label: 'tagsByRecord（一覧の全 id で 1 本の IN クエリ）', ms: NaN, note: `❌ ${tagsByRecordFailed}` });
}

bench('記録一覧', '商品名検索（LIKE。1 文字打つたび）', () =>
  repo.filteredRecords({ ...listFilter, searchText: 'ケース' }, 'saleDateDesc'), 3);
bench('記録一覧', '並び替え（利益高い順）', () => repo.filteredRecords(listFilter, 'profitDesc'), 3);
bench('記録一覧', '出品中タブへ切り替え', () => repo.filteredRecords({ ...listFilter, isSoldMode: false }, 'saleDateDesc'), 3);

// ---- 3. 実績（useAchievementsData。記録一覧・データタブ・詳細画面が画面復帰のたびに呼ぶ） ----


const ACHIEVEMENTS_FILTER: AnalyticsFilter = { period: null, kind: null, siteName: null, tagIds: undefined };

function computeAchievementsData() {
  const soldRecords = repo.analyticsSoldRecords(ACHIEVEMENTS_FILTER);
  const allRecords = repo.allRecordsForAchievements();
  const tagsByRecord = tagRepo.tagsByRecord(allRecords.map((r) => r.id));

  const achievementRecords: AchievementSaleRecord[] = soldRecords.map((record) => ({
    id: record.id,
    itemName: record.itemName,
    saleStartDate: fromDbDate(record.saleStartDate),
    saleDate: fromDbDate(record.saleDate as string),
    salesPrice: record.salesPrice,
    purchasePrice: record.purchasePrice,
    postage: record.postage,
    envelopeCost: record.envelopeCost,
    othersCost: record.othersCost,
    commission: record.commission,
    tagIds: (tagsByRecord.get(record.id) ?? []).map((t) => t.id),
    targetProfit: record.targetProfit,
  }));
  const listingRecords: AchievementListingRecord[] = allRecords.map((record) => ({
    id: record.id,
    itemName: record.itemName,
    saleStartDate: fromDbDate(record.saleStartDate),
    tagIds: (tagsByRecord.get(record.id) ?? []).map((t) => t.id),
  }));

  const achievements = evaluateAchievements(achievementRecords, { listingRecords });
  return { achievements, achievementRecords };
}

if (tagsByRecordFailed == null) {
  bench('実績', 'analyticsSoldRecords（全売却済みを JS へ）', () => repo.analyticsSoldRecords(ACHIEVEMENTS_FILTER), 3);
  bench('実績', 'allRecordsForAchievements（全件を JS へ）', () => repo.allRecordsForAchievements(), 3);
  const data = bench('実績', 'computeAchievementsData 全体', () => computeAchievementsData(), 3);
  note('画面復帰のたびに走る（記録一覧 / データタブ / 詳細）');
  bench('実績', 'computePersonalBests', () => computePersonalBests(data.achievementRecords), 3);
  bench('実績', 'strikeAchievementsByRecordId（行のバッジ）', () => strikeAchievementsByRecordId(data.achievements), 3);
  bench('実績', 'queryAchievements 全体（= 画面 1 枚ぶん）', () => {
    const d = computeAchievementsData();
    repo.careerSummary({ isSoldMode: true, period: null, kind: null, siteName: null, tagIds: [], searchText: '' });
    computePersonalBests(d.achievementRecords);
    return d;
  }, 3);
} else {
  results.push({ group: '実績', label: 'computeAchievementsData 全体', ms: NaN, note: `❌ tagsByRecord と同じ理由で失敗` });
}

// ---- 4. データタブ（DataScreen / useAnalyticsData） ----

const analyticsFilter: AnalyticsFilter = { period: null, kind: null, siteName: null, tagIds: undefined };

const earliest = bench('データタブ', 'analyticsEarliestMonthKey', () => repo.analyticsEarliestMonthKey(analyticsFilter));
const unit = chartUnitFor({ period: null, earliestMonthKey: earliest, today: TODAY });

bench('データタブ', 'averageSaleDays（全売却済みを JS へ載せて平均）', () =>
  periodAverageSaleDays(
    repo.analyticsSoldRecords(analyticsFilter).map((r) => ({
      saleStartDate: fromDbDate(r.saleStartDate),
      saleDate: r.saleDate == null ? null : fromDbDate(r.saleDate),
    })),
    TODAY,
  ), 3);
note('SQL では出せないのでレコード実体を全部読む');

bench('データタブ', 'analyticsSummary（合計）', () => repo.analyticsSummary(analyticsFilter));
const series = bench('データタブ', `analyticsSeries（グラフの点。刻み=${unit}）`, () => repo.analyticsSeries(analyticsFilter, unit));
note(`${series.length} 点`);
const tagProfits = bench('データタブ', 'analyticsProfitByTag（タグ別ランキング）', () => repo.analyticsProfitByTag(analyticsFilter));
note(`${tagProfits.length} タグ`);
const tagSeries = bench('データタブ', 'analyticsSeriesByTag（タグ別推移）', () => repo.analyticsSeriesByTag(analyticsFilter, unit));
note(`${tagSeries.length} 点（点 × タグ）`);
bench('データタブ', 'monthsWithRecords', () => repo.monthsWithRecords());

bench('データタブ', 'queryAnalytics 全体（= タブを開く 1 回）', () => {
  const e = repo.analyticsEarliestMonthKey(analyticsFilter);
  const u = chartUnitFor({ period: null, earliestMonthKey: e, today: TODAY });
  periodAverageSaleDays(
    repo.analyticsSoldRecords(analyticsFilter).map((r) => ({
      saleStartDate: fromDbDate(r.saleStartDate),
      saleDate: r.saleDate == null ? null : fromDbDate(r.saleDate),
    })),
    TODAY,
  );
  repo.analyticsSummary(analyticsFilter);
  repo.analyticsSeries(analyticsFilter, u);
  repo.analyticsProfitByTag(analyticsFilter);
  repo.analyticsSeriesByTag(analyticsFilter, u);
  repo.monthsWithRecords();
}, 3);
note('実績モードの computeAchievementsData は別途');

// 棒グラフのタップ（1 点の内訳）
if (series.length > 0) {
  bench('データタブ', '棒グラフの点をタップ（内訳）', () =>
    repo.analyticsDetails(analyticsFilter, unit, series[series.length - 1].key), 3);
}

// ---- 5. タグ別分析 ----

bench('タグ別分析', 'analyticsProfitByTag', () => repo.analyticsProfitByTag(analyticsFilter), 3);
bench('タグ別分析', 'analyticsSeriesByTag', () => repo.analyticsSeriesByTag(analyticsFilter, unit), 3);
bench('タグ別分析', 'analyticsCountsByTagForFilter（絞り込みページ）', () => repo.analyticsCountsByTagForFilter(analyticsFilter), 3);
bench('タグ別分析', 'countsByTagForFilter（記録タブの絞り込み）', () => repo.countsByTagForFilter(listFilter), 3);
bench('タグ別分析', 'analyticsDetailsByTag（ランキングの行タップ）', () =>
  repo.analyticsDetailsByTag(analyticsFilter, tagIds[0]), 3);
bench('タグ別分析', 'analyticsDetailsByTag（未分類）', () =>
  repo.analyticsDetailsByTag(analyticsFilter, null), 3);

// ---- 6. バックアップの書き出し ----

const tables = bench('バックアップ書き出し', 'dump（4 テーブル → CSV の行）', () => backupRepo.dump(), 3);

const files = bench('バックアップ書き出し', 'buildBackupFile ×5（CSV の文字列化）', () => {
  const m = new Map<string, string>();
  m.set(BACKUP_INFO_FILE, buildBackupInfo(
    { records: tables.records.length, presets: tables.presets.length, tags: tables.tags.length, recordTags: tables.recordTags.length },
    '2026-08-19T12:00:00.000', 0,
  ));
  m.set(BACKUP_RECORDS_FILE, buildBackupFile(BACKUP_RECORDS_FILE, tables.records));
  m.set(BACKUP_PRESETS_FILE, buildBackupFile(BACKUP_PRESETS_FILE, tables.presets));
  m.set(BACKUP_TAGS_FILE, buildBackupFile(BACKUP_TAGS_FILE, tables.tags));
  m.set(BACKUP_RECORD_TAGS_FILE, buildBackupFile(BACKUP_RECORD_TAGS_FILE, tables.recordTags));
  return m;
}, 3);
const csvBytes = [...files.values()].reduce((acc, t) => acc + Buffer.byteLength(t, 'utf8'), 0);
note(`CSV 合計 ${(csvBytes / 1024 / 1024).toFixed(1)}MB`);

const zipped = bench('バックアップ書き出し', 'zipSync（JS スレッドを止める）', () => {
  const entries: Zippable = {};
  for (const [name, text] of files) entries[`backup/${name}`] = [strToU8(text), { level: 6 }];
  return zipSync(entries);
}, 3);
note(`ZIP ${(zipped.length / 1024 / 1024).toFixed(1)}MB`);

const zipPath = join(dir, 'backup.zip');
benchOnce('バックアップ書き出し', 'ファイル書き出し', () => writeFileSync(zipPath, zipped));

// ---- 7. バックアップの復元 ----

const bytes = readFileSync(zipPath);

const unzipped = bench('バックアップ復元', 'unzipSync', () => unzipSync(new Uint8Array(bytes)), 3);
const texts = bench('バックアップ復元', 'strFromU8（バイト列 → 文字列）', () => {
  const m = new Map<string, string>();
  for (const [path, b] of Object.entries(unzipped)) {
    const name = path.split('/').pop()!;
    if (name !== '') m.set(name, strFromU8(b));
  }
  return m;
}, 3);

const contents = bench('バックアップ復元', 'readBackupContents（CSV 解析 + 全行の検証）', () =>
  readBackupContents('ja', texts), 3);
note(`records ${contents.tables.records.length.toLocaleString()} 行を 1 セルずつ検証`);

benchOnce('バックアップ復元', 'restore（全削除 + 50 行ずつ INSERT）', () =>
  backupRepo.restore(contents.tables));
note(`${Math.ceil(contents.tables.records.length / 50).toLocaleString()} 文 + ${Math.ceil(contents.tables.recordTags.length / 50).toLocaleString()} 文`);

benchOnce('バックアップ復元', '復元後の counts', () => backupRepo.counts());

// ---- 出力 ----

console.log('');
let currentGroup = '';
for (const row of results) {
  if (row.group !== currentGroup) {
    currentGroup = row.group;
    console.log(`\n【${currentGroup}】`);
  }
  const ms = Number.isNaN(row.ms) ? '   FAIL' : `${row.ms.toFixed(1).padStart(7)}ms`;
  console.log(`  ${ms}  ${row.label}${row.note === '' ? '' : `\n            └ ${row.note}`}`);
}

console.log(`\nDB ファイル: ${(statSync(dbPath).size / 1024 / 1024).toFixed(1)}MB`);
sqlite.close();
rmSync(dir, { recursive: true, force: true });
