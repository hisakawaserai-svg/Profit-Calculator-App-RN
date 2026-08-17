// SPEC-V8 §3.4（全置換）と §2（往復で値が変わらないこと）の検証。
//
// repository.test.ts と同じく、アプリ本体と同じ schema / migration を
// better-sqlite3（インメモリ）で動かす。
//
// ここで確かめたいのは 3 つ:
//   1. 書き出したものを読み戻すと**同じ値**になる（往復。§2）
//   2. 復元は**全置換**で、元のデータが残らない（§3.4）
//   3. 途中で失敗したら**何も変わらない**（§3。トランザクション）
//
// 3 が本命。全置換の機能なので、半分だけ入った状態を作らないことが要件そのもの。

import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';

import journal from '../../drizzle/meta/_journal.json';
import {
  BACKUP_PRESETS_FILE,
  BACKUP_RECORDS_FILE,
  BACKUP_RECORD_TAGS_FILE,
  BACKUP_TAGS_FILE,
  buildBackupFile,
  buildBackupInfo,
  parseBackupFile,
  readBackupContents,
  type BackupTables,
} from '@/logic/backup';
import { BACKUP_INFO_FILE } from '@/logic/labels';

import { createBackupRepository, type BackupRepository } from './backup';
import { createPresetRepository } from './presets';
import { createRepository, type SaveRecordInput } from './repository';
import * as schema from './schema';
import { createTagRepository } from './tags';

const drizzleDir = fileURLToPath(new URL('../../drizzle/', import.meta.url));

function newDatabase() {
  const sqlite = new Database(':memory:');
  for (const entry of journal.entries) {
    const statements = readFileSync(`${drizzleDir}${entry.tag}.sql`, 'utf8').split(
      '--> statement-breakpoint',
    );
    for (const statement of statements) sqlite.exec(statement);
  }
  return sqlite;
}

const baseRecord: SaveRecordInput = {
  itemName: 'えんぴつ',
  kind: 'sourced',
  salesPrice: 1500,
  purchasePrice: 300,
  postage: 210,
  envelopeCost: 15,
  othersCost: 0,
  commission: 10,
  isSold: true,
  saleStartDate: new Date(2026, 7, 1, 12, 0, 0),
  saleDate: new Date(2026, 7, 10, 9, 30, 0),
  memo: '',
  siteName: 'フリマA',
  photoFileName: null,
  shippingMaterialCost: 0,
  excludesShippingMaterial: false,
  // 目標は既定で「決めていない」（SPEC-V9 §1）
  targetProfit: null,
  tagIds: [],
};

describe('§3.4 バックアップと復元', () => {
  let db: ReturnType<typeof drizzle>;
  let backup: BackupRepository;
  let repository: ReturnType<typeof createRepository>;
  let tagRepository: ReturnType<typeof createTagRepository>;
  let presetRepository: ReturnType<typeof createPresetRepository>;

  beforeEach(() => {
    db = drizzle(newDatabase(), { schema });
    backup = createBackupRepository(db);
    repository = createRepository(db, { generateId: randomUUID, deletePhotoFile: () => {} });
    tagRepository = createTagRepository(db, { generateId: randomUUID });
    presetRepository = createPresetRepository(db, { generateId: randomUUID });
  });

  /** CSV を経由して往復させる（実際の経路と同じ形にする） */
  function roundTrip(): BackupTables {
    const dumped = backup.dump();
    const files = new Map<string, string>([
      [
        BACKUP_INFO_FILE,
        buildBackupInfo(
          {
            records: dumped.records.length,
            presets: dumped.presets.length,
            tags: dumped.tags.length,
            recordTags: dumped.recordTags.length,
          },
          '2026-08-13T14:30:00.000',
          0,
        ),
      ],
      [BACKUP_RECORDS_FILE, buildBackupFile(BACKUP_RECORDS_FILE, dumped.records)],
      [BACKUP_PRESETS_FILE, buildBackupFile(BACKUP_PRESETS_FILE, dumped.presets)],
      [BACKUP_TAGS_FILE, buildBackupFile(BACKUP_TAGS_FILE, dumped.tags)],
      [BACKUP_RECORD_TAGS_FILE, buildBackupFile(BACKUP_RECORD_TAGS_FILE, dumped.recordTags)],
    ]);
    return readBackupContents(files).tables;
  }

  it('書き出して読み戻すと同じ値になる（§2 の往復）', () => {
    const tag = tagRepository.create({ name: '洋服', colorKey: '#007AFF' });
    repository.create({ ...baseRecord, tagIds: [tag.id] });
    const before = backup.dump();

    backup.restore(roundTrip());

    expect(backup.dump()).toEqual(before);
  });

  it('出品中の記録は sale_date が空欄で往復する（§2.3）', () => {
    repository.create({ ...baseRecord, isSold: false, saleDate: null });

    const dumped = backup.dump();
    expect(dumped.records[0].sale_date).toBe('');

    backup.restore(roundTrip());
    expect(repository.listForExport({ period: null, includeListing: true })[0].saleDate).toBeNull();
  });

  it('不用品の仕入価格 0 が復元で書き換わらない（正規化を通さない。冒頭の理由 2）', () => {
    repository.create({ ...baseRecord, kind: 'used', purchasePrice: 0 });

    backup.restore(roundTrip());

    const [record] = repository.listForExport({ period: null, includeListing: true });
    expect(record.kind).toBe('used');
    expect(record.purchasePrice).toBe(0);
  });

  it('小数の手数料率が丸められずに往復する（§2.2）', () => {
    repository.create({ ...baseRecord, commission: 10.5 });

    backup.restore(roundTrip());

    expect(repository.listForExport({ period: null, includeListing: true })[0].commission).toBe(10.5);
  });

  it('カンマ・改行を含む商品名とメモが往復する', () => {
    repository.create({ ...baseRecord, itemName: 'a,b', memo: '1"2\n3' });

    backup.restore(roundTrip());

    const [record] = repository.listForExport({ period: null, includeListing: true });
    expect(record.itemName).toBe('a,b');
    expect(record.memo).toBe('1"2\n3');
  });

  it('復元は全置換（元のデータは残らない。§3.4）', () => {
    repository.create({ ...baseRecord, itemName: 'のこす' });
    const tables = roundTrip();

    // 復元用のデータを作ったあとで、DB 側にだけ 2 件目を足す
    repository.create({ ...baseRecord, itemName: 'きえる' });
    expect(backup.counts().records).toBe(2);

    backup.restore(tables);

    const records = repository.listForExport({ period: null, includeListing: true });
    expect(records).toHaveLength(1);
    expect(records[0].itemName).toBe('のこす');
  });

  it('初期プリセット（seed-*）も全置換の対象になる', () => {
    // マイグレーション 0002 が入れた固定 id のプリセットが最初からある
    expect(presetRepository.listByType('site').some((p) => p.id.startsWith('seed-'))).toBe(true);

    backup.restore({ records: [], presets: [], tags: [], recordTags: [] });

    expect(presetRepository.listByType('site')).toHaveLength(0);
  });

  it('タグと中間行が関係ごと復元される', () => {
    const tag = tagRepository.create({ name: '洋服', colorKey: '#007AFF' });
    const record = repository.create({ ...baseRecord, tagIds: [tag.id] });

    backup.restore(roundTrip());

    expect(tagRepository.tagIdsByRecord(record.id)).toEqual([tag.id]);
    expect(tagRepository.countsByTag().get(tag.id)).toBe(1);
  });

  // ---- §4 写真 ----

  it('書き出しに写真のファイル名が入る（§4.1。実体は ZIP の photos/ に入る）', () => {
    repository.create({ ...baseRecord, photoFileName: 'a1b2c3.jpg' });

    expect(backup.dump().records[0].photo_file_name).toBe('a1b2c3.jpg');
  });

  it('写真を戻さないなら photo_file_name は null に落ちる（§4.2）', () => {
    const record = repository.create({ ...baseRecord, photoFileName: 'a1b2c3.jpg' });

    // 第 2 引数を渡さない = 書き戻せる写真が 1 枚も無い（写真なしのバックアップ）
    backup.restore(roundTrip());

    expect(repository.getById(record.id)?.photoFileName).toBeNull();
  });

  it('写真を戻すなら photo_file_name が残る（§4.3）', () => {
    const record = repository.create({ ...baseRecord, photoFileName: 'a1b2c3.jpg' });

    backup.restore(roundTrip(), new Set(['a1b2c3.jpg']));

    expect(repository.getById(record.id)?.photoFileName).toBe('a1b2c3.jpg');
  });

  it('欠けている写真を指す記録だけが null になる（§4.3。他の記録は残る）', () => {
    const kept = repository.create({ ...baseRecord, photoFileName: 'ok.jpg' });
    const lost = repository.create({ ...baseRecord, photoFileName: 'missing.jpg' });

    backup.restore(roundTrip(), new Set(['ok.jpg']));

    expect(repository.getById(kept.id)?.photoFileName).toBe('ok.jpg');
    expect(repository.getById(lost.id)?.photoFileName).toBeNull();
  });

  it('clearPhotos は指定した名前だけを null にする（§4.5 の手順 5）', () => {
    const kept = repository.create({ ...baseRecord, photoFileName: 'ok.jpg' });
    const failed = repository.create({ ...baseRecord, photoFileName: 'failed.jpg' });
    backup.restore(roundTrip(), new Set(['ok.jpg', 'failed.jpg']));

    backup.clearPhotos(['failed.jpg']);

    expect(repository.getById(kept.id)?.photoFileName).toBe('ok.jpg');
    expect(repository.getById(failed.id)?.photoFileName).toBeNull();
  });

  it('clearPhotos に空を渡しても何も起きない', () => {
    const record = repository.create({ ...baseRecord, photoFileName: 'ok.jpg' });
    backup.restore(roundTrip(), new Set(['ok.jpg']));

    backup.clearPhotos([]);

    expect(repository.getById(record.id)?.photoFileName).toBe('ok.jpg');
  });

  // ---- §3 トランザクション（本命） ----

  it('途中で失敗したら何も変わらない（§3。id の重複で INSERT を落とす）', () => {
    repository.create({ ...baseRecord, itemName: 'もとのまま' });
    const before = backup.dump();

    // 同じ id が 2 行ある = 主キー違反。検証（logic/backup.ts）は id の重複までは
    // 見ないので、ここは DB の制約に落とさせる経路になる
    const broken: BackupTables = {
      records: [
        { ...before.records[0], id: 'dup', item_name: 'あたらしい1' },
        { ...before.records[0], id: 'dup', item_name: 'あたらしい2' },
      ],
      presets: [],
      tags: [],
      recordTags: [],
    };

    expect(() => backup.restore(broken)).toThrow();

    // 消す処理は INSERT より先に走っているので、巻き戻っていなければ 0 件になる
    expect(backup.dump()).toEqual(before);
  });

  it('中間行の INSERT で失敗しても記録の削除ごと巻き戻る（§3.4 の削除→挿入の順）', () => {
    const tag = tagRepository.create({ name: '洋服', colorKey: '#007AFF' });
    repository.create({ ...baseRecord, tagIds: [tag.id] });
    const before = backup.dump();

    // record_tags に同じ組を 2 回入れる = 複合 PK 違反
    const broken: BackupTables = {
      ...before,
      recordTags: [before.recordTags[0], before.recordTags[0]],
    };

    expect(() => backup.restore(broken)).toThrow();
    expect(backup.dump()).toEqual(before);
  });

  it('空のバックアップを復元すると 0 件になる（消せることも仕様のうち）', () => {
    repository.create(baseRecord);

    backup.restore({ records: [], presets: [], tags: [], recordTags: [] });

    expect(backup.counts()).toEqual({ records: 0, presets: 0, tags: 0, recordTags: 0 });
  });

  // ---- §3.4 件数（SQLite の変数上限） ----

  it('1000 件でも SQL の変数上限に当たらない（INSERT_CHUNK_SIZE の理由）', () => {
    const records = Array.from({ length: 1000 }, (_, i) => ({
      id: `r${i}`,
      item_name: `商品${i}`,
      sales_price: '1500',
      purchase_price: '300',
      postage: '210',
      envelope_cost: '15',
      others_cost: '0',
      commission: '10',
      is_sold: '1',
      sale_start_date: '2026-08-01T12:00:00.000',
      sale_date: '2026-08-10T09:30:00.000',
      memo: '',
      kind: 'sourced',
      site_name: 'フリマA',
      photo_file_name: '',
      shipping_material_cost: '0',
      excludes_shipping_material: '0',
    }));

    backup.restore({ records, presets: [], tags: [], recordTags: [] });

    expect(backup.counts().records).toBe(1000);
  });

  it('dump の並びは id 昇順で安定する（同じデータから同じファイルが出る）', () => {
    repository.create({ ...baseRecord, itemName: 'a' });
    repository.create({ ...baseRecord, itemName: 'b' });

    const ids = backup.dump().records.map((row) => row.id);
    expect([...ids].sort()).toEqual(ids);
  });

  it('dump が出した CSV はそのまま parseBackupFile を通る（列の定義が一致している）', () => {
    repository.create(baseRecord);
    const dumped = backup.dump();

    expect(() =>
      parseBackupFile(BACKUP_RECORDS_FILE, buildBackupFile(BACKUP_RECORDS_FILE, dumped.records)),
    ).not.toThrow();
    expect(() =>
      parseBackupFile(BACKUP_PRESETS_FILE, buildBackupFile(BACKUP_PRESETS_FILE, dumped.presets)),
    ).not.toThrow();
  });

  // ---- SPEC-V9 §3 目標利益（null と 0 の書き分け・古いバックアップの読み込み） ----

  it('目標を決めていない記録は空欄で書き出され、null のまま戻る', () => {
    repository.create({ ...baseRecord, targetProfit: null });

    expect(backup.dump().records[0].target_profit).toBe('');

    backup.restore(roundTrip());
    expect(
      repository.listForExport({ period: null, includeListing: true })[0].targetProfit,
    ).toBeNull();
  });

  it('**目標 0 円は 0 と書き出され、0 のまま戻る**（null に化けない）', () => {
    repository.create({ ...baseRecord, targetProfit: 0 });

    expect(backup.dump().records[0].target_profit).toBe('0');

    backup.restore(roundTrip());
    expect(repository.listForExport({ period: null, includeListing: true })[0].targetProfit).toBe(0);
  });

  it('null / 0 / 正の額が同じファイルの中で混ざっても往復する', () => {
    for (const targetProfit of [null, 0, 2000]) {
      repository.create({ ...baseRecord, targetProfit });
    }
    const before = backup.dump();

    backup.restore(roundTrip());

    expect(backup.dump()).toEqual(before);
    expect(
      repository
        .listForExport({ period: null, includeListing: true })
        .map((record) => record.targetProfit)
        .sort((a, b) => (a ?? -1) - (b ?? -1)),
    ).toEqual([null, 0, 2000]);
  });

  it('listed_at はまだ書き込まないので、往復しても空欄のまま', () => {
    repository.create(baseRecord);

    expect(backup.dump().records[0].listed_at).toBe('');

    backup.restore(roundTrip());
    expect(repository.listForExport({ period: null, includeListing: true })[0].listedAt).toBeNull();
  });

  it('**2 列が無い古いバックアップも復元でき、目標は null になる**（§3 の例外）', () => {
    repository.create({ ...baseRecord, itemName: '復元前の記録', targetProfit: 999 });

    // SPEC-V9 より前の records.csv（17 列）をそのまま組む
    const legacyHeader =
      'id,item_name,sales_price,purchase_price,postage,envelope_cost,others_cost,' +
      'commission,is_sold,sale_start_date,sale_date,memo,kind,site_name,' +
      'photo_file_name,shipping_material_cost,excludes_shipping_material';
    const legacyCsv =
      `${legacyHeader}\r\n` +
      'old-1,古い記録,1500,300,210,15,0,10,1,' +
      '2026-08-01T12:00:00.000,2026-08-10T09:30:00.000,,sourced,フリマA,,0,0\r\n';

    backup.restore({
      records: parseBackupFile(BACKUP_RECORDS_FILE, legacyCsv),
      presets: [],
      tags: [],
      recordTags: [],
    });

    const restored = repository.getById('old-1');
    expect(restored?.itemName).toBe('古い記録');
    // 17 列ぶんの値は落ちない
    expect(restored?.salesPrice).toBe(1500);
    // 無かった 2 列は null（0 ではない）
    expect(restored?.targetProfit).toBeNull();
    expect(restored?.listedAt).toBeNull();
    // 全置換なので、復元前の記録は残らない
    expect(backup.counts().records).toBe(1);
  });

  // ---- SPEC-V10 §1.6 梱包材の単価計算方式（往復と古いバックアップ） ----

  it('面積方式の梱包材が方式・サイズごと往復する', () => {
    presetRepository.create({
      type: 'packaging',
      name: 'エアキャップ',
      colorKey: '#2E9E4F',
      initial: 'エ',
      value: 30,
      packQuantity: 0,
      packPrice: 500,
      materialCost: 0,
      calcMethod: 'area',
      packHeight: 100,
      packWidth: 100,
      useHeight: 30,
      useWidth: 20,
    });
    const before = backup.dump();

    backup.restore(roundTrip());

    expect(backup.dump()).toEqual(before);
    expect(
      presetRepository.listByType('packaging').find((preset) => preset.name === 'エアキャップ'),
    ).toMatchObject({
      calcMethod: 'area',
      value: 30,
      packHeight: 100,
      useWidth: 20,
    });
  });

  it('**5 列が無い古いバックアップも復元でき、梱包材は個数方式のまま**（§1.6 の例外）', () => {
    // SPEC-V10 より前の presets.csv（10 列）をそのまま組む
    const legacyHeader =
      'id,type,name,color_key,initial,value,pack_quantity,pack_price,material_cost,sort_order';
    const legacyCsv =
      `${legacyHeader}\r\n` + 'old-p,packaging,封筒（A4）,#FFCC00,封,8,100,800,0,1\r\n';

    backup.restore({
      records: [],
      presets: parseBackupFile(BACKUP_PRESETS_FILE, legacyCsv),
      tags: [],
      recordTags: [],
    });

    // 単価も控えの 2 列も落ちず、方式だけが既定（個数から）で埋まる
    expect(presetRepository.getById('old-p')).toMatchObject({
      name: '封筒（A4）',
      value: 8,
      packQuantity: 100,
      packPrice: 800,
      calcMethod: 'individual',
      packHeight: 0,
      packWidth: 0,
      useHeight: 0,
      useWidth: 0,
    });
  });
});
