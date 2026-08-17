// SPEC-V3 §6.3 のテスト方針のうち、DB の側。
// - マイグレーション（0002）後に §2 の初期値 17 件が入っていること
// - presets の CRUD と sortOrder の採番（§3.4）
// - sale_records.site_name の保存・取得と、既存行が空文字になること（§1.5.1）
//
// repository.test.ts と同じく、アプリ本体と同じ schema / migration / repository を
// better-sqlite3（インメモリ）で動かす。

import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';

import journal from '../../drizzle/meta/_journal.json';
import { PRESET_COLOR_HEXES, presetColorKeyOf } from '../logic/preset';
import { createPresetRepository, type PresetRepository } from './presets';
import { createRepository, type Repository, type SaveRecordInput } from './repository';
import * as schema from './schema';
import type { PresetType } from './schema';

/**
 * repository の依存（SPEC-V5 §1.5 で写真ファイルを消す口が増えた）。
 * ここでは実体のファイルを持たないので、既定は何もしない関数を渡す。
 * 消されたかどうかを見たいテストだけが自前の関数を渡す。
 */
function recordDeps(deletePhotoFile: (fileName: string) => void = () => {}) {
  return { generateId: randomUUID, deletePhotoFile };
}


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

/** 0002（presets と site_name を足すマイグレーション）の idx */
const PRESETS_MIGRATION_IDX = 2;

/** 0003（まとめ買いの 2 列を足すマイグレーション。§2.6.4）の idx */
const PACK_MIGRATION_IDX = 3;

type SeedRow = { id: string; name: string; colorKey: string; initial: string; value: number; sortOrder: number };

function seedRows(sqlite: ReturnType<typeof newDatabase>, type: PresetType): SeedRow[] {
  return sqlite
    .prepare(
      `SELECT id, name, color_key AS colorKey, initial, value, sort_order AS sortOrder
       FROM presets WHERE type = ? ORDER BY sort_order`,
    )
    .all(type) as SeedRow[];
}

describe('§1.6 / §2 マイグレーション: 初期値 17 件が入る', () => {
  let sqlite: ReturnType<typeof newDatabase>;

  beforeEach(() => {
    sqlite = newDatabase();
  });

  it('マイグレーション後の合計は 17 件（4 + 7 + 6）', () => {
    const { count } = sqlite.prepare('SELECT count(*) AS count FROM presets').get() as {
      count: number;
    };

    expect(count).toBe(17);
    expect(seedRows(sqlite, 'site')).toHaveLength(4);
    expect(seedRows(sqlite, 'shipping')).toHaveLength(7);
    expect(seedRows(sqlite, 'packaging')).toHaveLength(6);
  });

  it('販売サイトは §2.2 の 4 件（サービス名を持たず「手数料 N%」の形）', () => {
    expect(seedRows(sqlite, 'site')).toEqual([
      // 色は 0007 で hex に移した（SPEC-V7 §2.1）。**同じ色**のまま形だけが変わっている
      { id: 'seed-site-10', name: '手数料 10%', colorKey: PRESET_COLOR_HEXES.red, initial: '10', value: 10, sortOrder: 1 },
      { id: 'seed-site-6', name: '手数料 6%', colorKey: PRESET_COLOR_HEXES.orange, initial: '6', value: 6, sortOrder: 2 },
      { id: 'seed-site-5', name: '手数料 5%', colorKey: PRESET_COLOR_HEXES.blue, initial: '5', value: 5, sortOrder: 3 },
      { id: 'seed-site-none', name: '手数料なし（直接取引）', colorKey: PRESET_COLOR_HEXES.green, initial: '0', value: 0, sortOrder: 4 },
    ]);
  });

  it('送料は §2.3 の 7 件（名前に金額を含めない）', () => {
    const rows = seedRows(sqlite, 'shipping');

    expect(rows.map((row) => [row.name, row.value])).toEqual([
      ['A4・厚さ3cm以内', 210],
      ['A4・厚さ2cm以内', 185],
      ['専用箱（小）', 450],
      ['宅配 60サイズ', 750],
      ['宅配 80サイズ', 850],
      ['宅配 100サイズ', 1050],
      ['送料込み・手渡し', 0],
    ]);
    // 名前の中に金額を書かない（改定したとき数字が取り残されるため。§2.3）
    for (const row of rows) expect(row.name).not.toMatch(/\d{3}円|\d+円/);
  });

  it('「宅配 100サイズ」だけ頭文字が空（3 文字は上限を超える。§2.3）', () => {
    const rows = seedRows(sqlite, 'shipping');
    const hundred = rows.find((row) => row.id === 'seed-shipping-100');

    expect(hundred?.initial).toBe('');
    // 他の 6 件は頭文字を持っている
    expect(rows.filter((row) => row.initial === '')).toHaveLength(1);
  });

  it('梱包材は §2.4 の 6 件', () => {
    expect(seedRows(sqlite, 'packaging').map((row) => [row.name, row.value, row.initial])).toEqual([
      ['封筒（A4）', 15, '封'],
      ['クッション封筒', 40, 'ク'],
      ['宅配ビニール袋', 20, '袋'],
      ['段ボール（小）', 60, '小'],
      ['段ボール（中）', 100, '中'],
      ['緩衝材・テープ', 10, '緩'],
    ]);
  });

  it('id は内容が読める固定 ID で、全件ユニーク（§2.4）', () => {
    const ids = (sqlite.prepare('SELECT id FROM presets').all() as { id: string }[]).map(
      (row) => row.id,
    );

    expect(new Set(ids).size).toBe(17);
    for (const id of ids) expect(id).toMatch(/^seed-(site|shipping|packaging)-/);
  });

  it('sort_order は種類ごとに 1 から連番（§2.4。10 刻みにしない）', () => {
    for (const [type, count] of [['site', 4], ['shipping', 7], ['packaging', 6]] as const) {
      expect(seedRows(sqlite, type).map((row) => row.sortOrder)).toEqual(
        Array.from({ length: count }, (_, i) => i + 1),
      );
    }
  });

  it('色は固定パレットの hex になっている（§1.3 / SPEC-V7 §2.1）', () => {
    const rows = sqlite.prepare('SELECT color_key AS colorKey FROM presets').all() as {
      colorKey: string;
    }[];

    for (const row of rows) {
      // 0007 のあと、初期値はすべて「固定色として選ばれた」形（hex）で入っている
      expect(presetColorKeyOf(row.colorKey)).not.toBeNull();
      expect(row.colorKey).toMatch(/^#[0-9A-F]{6}$/);
    }
  });

  it('マイグレーションを 0001 で止めると presets はまだ存在しない', () => {
    const older = newDatabase(PRESETS_MIGRATION_IDX - 1);

    expect(() => older.prepare('SELECT * FROM presets').all()).toThrow();
  });
});

describe('§2.6.4 マイグレーション 0003: まとめ買いの 2 列', () => {
  it('0002 で止めると pack_quantity / pack_price はまだ存在しない', () => {
    const older = newDatabase(PACK_MIGRATION_IDX - 1);

    expect(() => older.prepare('SELECT pack_quantity FROM presets').all()).toThrow();
  });

  it('既存 6 件の梱包材は「1 個ずつ」のまま（バックフィルなし。§2.6.5）', () => {
    const sqlite = newDatabase();
    const rows = sqlite
      .prepare(
        `SELECT id, value, pack_quantity AS packQuantity, pack_price AS packPrice
         FROM presets WHERE type = 'packaging' ORDER BY sort_order`,
      )
      .all() as { id: string; value: number; packQuantity: number; packPrice: number }[];

    expect(rows).toHaveLength(6);
    expect(rows.every((row) => row.packQuantity === 0 && row.packPrice === 0)).toBe(true);
    // 金額は §2.4 のまま（「100 枚 1,500 円」に書き換えたりしない）
    expect(rows.find((row) => row.id === 'seed-packaging-box-s')?.value).toBe(60);
  });

  it('利用者が作った既存行も既定値のまま開く（0002 までで入れた行に 0003 を流す）', () => {
    const sqlite = newDatabase(PACK_MIGRATION_IDX - 1);
    sqlite
      .prepare(
        `INSERT INTO presets (id, type, name, color_key, initial, value, sort_order)
         VALUES ('mine', 'packaging', 'エアキャップ', 'yellow', 'エ', 30, 7)`,
      )
      .run();
    for (const statement of migrationSql(journal.entries[PACK_MIGRATION_IDX].tag)) {
      sqlite.exec(statement);
    }

    expect(
      sqlite
        .prepare(
          `SELECT value, pack_quantity AS packQuantity, pack_price AS packPrice
           FROM presets WHERE id = 'mine'`,
        )
        .get(),
    ).toEqual({ value: 30, packQuantity: 0, packPrice: 0 });
  });
});

describe('§1.5.1 マイグレーション: sale_records.site_name', () => {
  /** 0001 までを流した「site_name 列がない状態」に行を入れてから 0002 を流す */
  function migrateWithRows(itemNames: string[]) {
    const sqlite = newDatabase(PRESETS_MIGRATION_IDX - 1);
    itemNames.forEach((itemName, i) => {
      sqlite
        .prepare(
          `INSERT INTO sale_records (id, item_name, sales_price, purchase_price, is_sold, sale_start_date)
           VALUES (?, ?, 1000, 0, 0, '2026-08-01T12:00:00.000')`,
        )
        .run(`id-${i}`, itemName);
    });
    for (const statement of migrationSql(journal.entries[PRESETS_MIGRATION_IDX].tag)) {
      sqlite.exec(statement);
    }
    return sqlite
      .prepare('SELECT item_name AS itemName, site_name AS siteName FROM sale_records ORDER BY id')
      .all() as { itemName: string; siteName: string }[];
  }

  it('既存行の site_name は空文字になる（バックフィルは行わない。§1.5.1）', () => {
    expect(migrateWithRows(['えんぴつ', 'ノート'])).toEqual([
      { itemName: 'えんぴつ', siteName: '' },
      { itemName: 'ノート', siteName: '' },
    ]);
  });

  it('列の追加は既存の値に触れない', () => {
    const sqlite = newDatabase(PRESETS_MIGRATION_IDX - 1);
    sqlite
      .prepare(
        `INSERT INTO sale_records (id, item_name, sales_price, purchase_price, commission, is_sold, sale_start_date)
         VALUES ('id-1', 'えんぴつ', 1000, 300, 10, 1, '2026-08-01T12:00:00.000')`,
      )
      .run();
    for (const statement of migrationSql(journal.entries[PRESETS_MIGRATION_IDX].tag)) {
      sqlite.exec(statement);
    }

    expect(
      sqlite
        .prepare('SELECT sales_price AS salesPrice, purchase_price AS purchasePrice, commission FROM sale_records')
        .get(),
    ).toEqual({ salesPrice: 1000, purchasePrice: 300, commission: 10 });
  });
});

describe('§1.5.1 repository: site_name の保存と取得', () => {
  let repo: Repository;

  const base: SaveRecordInput = {
    itemName: 'えんぴつ',
    kind: 'used',
    salesPrice: 1000,
    purchasePrice: 0,
    postage: 0,
    envelopeCost: 0,
    othersCost: 0,
    commission: 10,
    isSold: false,
    saleStartDate: new Date(2026, 7, 1, 12, 0, 0),
    saleDate: null,
    memo: '',
    siteName: '',
    photoFileName: null,
    shippingMaterialCost: 0,
    excludesShippingMaterial: false,
    // 目標は既定で「決めていない」（SPEC-V9 §1）
    targetProfit: null,
    tagIds: [],
  };

  beforeEach(() => {
    repo = createRepository(drizzle(newDatabase(), { schema }), recordDeps());
  });

  it('保存した名前がそのまま読み出せる', () => {
    const created = repo.create({ ...base, siteName: 'メ' });

    expect(created.siteName).toBe('メ');
    expect(repo.getById(created.id)?.siteName).toBe('メ');
  });

  it('未設定は空文字（NULL は使わない）', () => {
    const created = repo.create(base);

    expect(repo.getById(created.id)?.siteName).toBe('');
  });

  it('更新で差し替えられる。手数料率を変えても名前は消えない（§1.5.1）', () => {
    const created = repo.create({ ...base, siteName: 'メ', commission: 10 });
    repo.update(created.id, { ...base, siteName: 'メ', commission: 8 });

    const row = repo.getById(created.id);
    expect(row?.commission).toBe(8);
    expect(row?.siteName).toBe('メ');
  });

  it('空文字で更新すれば消える（チップの ✕ がこの経路）', () => {
    const created = repo.create({ ...base, siteName: 'メ' });
    repo.update(created.id, { ...base, siteName: '' });

    expect(repo.getById(created.id)?.siteName).toBe('');
  });

  it('絞り込み・集計には影響しない（計算式にも buildWhere にも入らない。§1.5.1）', () => {
    repo.create({ ...base, siteName: 'メ', isSold: true, saleDate: new Date(2026, 7, 5) });
    repo.create({ ...base, siteName: '', isSold: true, saleDate: new Date(2026, 7, 6) });

    const summary = repo.careerSummary({ isSoldMode: true });
    expect(summary.recordCount).toBe(2);
    // 手数料 10% を引いた 900 円 × 2
    expect(summary.totalNetProfit).toBeCloseTo(1800, 9);
  });
});

describe('§3.1 / 設計案 25c 件数の 2 本', () => {
  let repo: Repository;

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
    photoFileName: null,
    shippingMaterialCost: 0,
    excludesShippingMaterial: false,
    // 目標は既定で「決めていない」（SPEC-V9 §1）
    targetProfit: null,
    tagIds: [],
  };

  beforeEach(() => {
    repo = createRepository(drizzle(newDatabase(), { schema }), recordDeps());
  });

  it('totalCount は出品中も含めた全件（設定タブ「記録の件数」。UI-SPEC §1.6-4）', () => {
    expect(repo.totalCount()).toBe(0);

    repo.create(base);
    repo.create({ ...base, isSold: false, saleDate: null });

    expect(repo.totalCount()).toBe(2);
  });

  it('countBySiteName は名前の写しで数える（削除確認の「N 件あります」。§1.5.1）', () => {
    repo.create({ ...base, siteName: 'メ' });
    repo.create({ ...base, siteName: 'メ' });
    repo.create({ ...base, siteName: 'ラ' });
    repo.create(base);

    expect(repo.countBySiteName('メ')).toBe(2);
    expect(repo.countBySiteName('ラ')).toBe(1);
    // 一度も使われていない名前は 0 件 = 確認なしで消える
    expect(repo.countBySiteName('ヤ')).toBe(0);
  });

  it('プリセットを消しても記録の site_name は残る（§1.5。確認文の「記録は残る」の裏付け）', () => {
    // 同じ DB の上に 2 つの repository を載せる（アプリ本体と同じ構成。client.ts）
    const db = drizzle(newDatabase(), { schema });
    const records = createRepository(db, recordDeps());
    const presetRepo = createPresetRepository(db, { generateId: randomUUID });

    const record = records.create({ ...base, siteName: '手数料 10%' });
    presetRepo.remove('seed-site-10');

    expect(presetRepo.getById('seed-site-10')).toBeUndefined();
    expect(records.getById(record.id)?.siteName).toBe('手数料 10%');
    expect(records.countBySiteName('手数料 10%')).toBe(1);
  });
});

describe('§3 presets repository: CRUD と sortOrder の採番', () => {
  let presetRepo: PresetRepository;

  beforeEach(() => {
    presetRepo = createPresetRepository(drizzle(newDatabase(), { schema }), {
      generateId: randomUUID,
    });
  });

  it('listByType は sortOrder の昇順で、その種類だけを返す（§3.4）', () => {
    const rows = presetRepo.listByType('shipping');

    expect(rows).toHaveLength(7);
    expect(rows.every((row) => row.type === 'shipping')).toBe(true);
    expect(rows.map((row) => row.sortOrder)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('countByType は種類ごとの件数（設定タブの「N 件」。§3.1）', () => {
    expect(presetRepo.countByType('site')).toBe(4);
    expect(presetRepo.countByType('shipping')).toBe(7);
    expect(presetRepo.countByType('packaging')).toBe(6);
  });

  it('create は末尾に積む（max(sortOrder) + 1。§3.4）', () => {
    const created = presetRepo.create({
      type: 'packaging',
      name: 'エアキャップ',
      colorKey: 'yellow',
      initial: 'エ',
      value: 30,
      packQuantity: 0,
      packPrice: 0,
      materialCost: 0,
    });

    expect(created.sortOrder).toBe(7); // 初期値 6 件の次
    expect(presetRepo.listByType('packaging').at(-1)?.id).toBe(created.id);
    expect(presetRepo.countByType('packaging')).toBe(7);
  });

  it('create は他の種類の件数に影響されない（種類ごとに採番する）', () => {
    const created = presetRepo.create({
      type: 'site',
      name: '手数料 3%',
      colorKey: 'teal',
      initial: '3',
      value: 3,
      packQuantity: 0,
      packPrice: 0,
      materialCost: 0,
    });

    expect(created.sortOrder).toBe(5); // site は 4 件なので 5
    expect(presetRepo.countByType('shipping')).toBe(7);
  });

  it('全部消した状態から作ると 1 番になる（§2.5「全部消した状態も正常」）', () => {
    for (const row of presetRepo.listByType('site')) presetRepo.remove(row.id);
    expect(presetRepo.listByType('site')).toEqual([]);

    const created = presetRepo.create({
      type: 'site',
      name: '手数料 4%',
      colorKey: 'purple',
      initial: '4',
      value: 4,
      packQuantity: 0,
      packPrice: 0,
      materialCost: 0,
    });

    expect(created.sortOrder).toBe(1);
  });

  it('update は名前・色・頭文字・値を差し替え、type と sortOrder は動かさない', () => {
    const before = presetRepo.getById('seed-shipping-a4-3cm');
    presetRepo.update('seed-shipping-a4-3cm', {
      type: 'shipping',
      name: 'ネコポス',
      colorKey: 'purple',
      initial: 'ネ',
      value: 250,
      packQuantity: 0,
      packPrice: 0,
      materialCost: 0,
    });

    const after = presetRepo.getById('seed-shipping-a4-3cm');
    expect(after).toEqual({
      ...before,
      name: 'ネコポス',
      colorKey: 'purple',
      initial: 'ネ',
      value: 250,
      packQuantity: 0,
      packPrice: 0,
      materialCost: 0,
    });
    expect(after?.sortOrder).toBe(before?.sortOrder);
    expect(after?.type).toBe('shipping');
  });

  it('まとめ買いは入数・購入価格と、確定した 1 個あたりを書く（§2.6.4）', () => {
    const created = presetRepo.create({
      type: 'packaging',
      name: '封筒（A4）100枚',
      colorKey: 'blue',
      initial: '封',
      // value は保存時に確定した 1 個あたり（validatePreset の結果）
      value: 8,
      packQuantity: 100,
      packPrice: 0,
      materialCost: 0,
    });

    expect(presetRepo.getById(created.id)).toMatchObject({
      value: 8,
      packQuantity: 100,
      packPrice: 0,
      materialCost: 0,
    });
  });

  it('「1 個ずつ」に戻す更新は 2 列を 0 に戻す（決定 §2.6.8-3）', () => {
    const created = presetRepo.create({
      type: 'packaging',
      name: '封筒（A4）100枚',
      colorKey: 'blue',
      initial: '封',
      value: 8,
      packQuantity: 100,
      packPrice: 0,
      materialCost: 0,
    });

    presetRepo.update(created.id, {
      type: 'packaging',
      name: '封筒（A4）',
      colorKey: 'blue',
      initial: '封',
      value: 8,
      packQuantity: 0,
      packPrice: 0,
      materialCost: 0,
    });

    expect(presetRepo.getById(created.id)).toMatchObject({
      // 金額はそのときの 1 個あたりが残る（値は変わらない。§2.6.6）
      value: 8,
      packQuantity: 0,
      packPrice: 0,
      materialCost: 0,
    });
  });

  it('初期値は自由に編集・削除できる（「正解の一覧」ではない。§2.5）', () => {
    presetRepo.remove('seed-site-10');

    expect(presetRepo.getById('seed-site-10')).toBeUndefined();
    expect(presetRepo.countByType('site')).toBe(3);
    // 残った行の sortOrder は詰め直さない（並びは相対順序だけで決まる）
    expect(presetRepo.listByType('site').map((row) => row.sortOrder)).toEqual([2, 3, 4]);
  });

  it('remove は他の行に触れない（物理削除。参照する先がない。§1.1 / §1.5）', () => {
    presetRepo.remove('seed-packaging-box-s');

    expect(presetRepo.countByType('packaging')).toBe(5);
    expect(presetRepo.countByType('shipping')).toBe(7);
    // 同じ末尾の id を持つ送料側は消えていない
    expect(presetRepo.getById('seed-shipping-box-s')).toBeDefined();
  });

  it('restore は消した行をそのまま書き戻す（§3.2 の UndoBar。id も並び順も元のまま）', () => {
    const removed = presetRepo.getById('seed-shipping-a4-3cm');
    presetRepo.remove('seed-shipping-a4-3cm');
    expect(presetRepo.countByType('shipping')).toBe(6);

    presetRepo.restore(removed!);

    expect(presetRepo.getById('seed-shipping-a4-3cm')).toEqual(removed);
    // 末尾に積み直されるのではなく、消える前と同じ位置に戻る
    expect(presetRepo.listByType('shipping').map((row) => row.id)).toContain(
      'seed-shipping-a4-3cm',
    );
    expect(presetRepo.listByType('shipping')[removed!.sortOrder - 1]?.id).toBe(
      'seed-shipping-a4-3cm',
    );
  });

  it('名前の重複を DB が拒まない（§1.4。見分けは色と頭文字が担う）', () => {
    const input = {
      type: 'packaging',
      name: '段ボール（小）',
      colorKey: 'teal',
      initial: '小',
      value: 70,
      packQuantity: 0,
      packPrice: 0,
      materialCost: 0,
    } as const;
    const created = presetRepo.create(input);

    expect(created.id).not.toBe('seed-packaging-box-s');
    expect(
      presetRepo.listByType('packaging').filter((row) => row.name === '段ボール（小）'),
    ).toHaveLength(2);
  });
});

describe('SPEC-V6 §1 専用資材の代金の読み書き', () => {
  let presetRepo: PresetRepository;

  beforeEach(() => {
    presetRepo = createPresetRepository(drizzle(newDatabase(), { schema }), {
      generateId: randomUUID,
    });
  });

  it('create で資材費が書かれ、読み出しでそのまま返る', () => {
    const created = presetRepo.create({
      type: 'shipping',
      name: '専用箱（小）',
      colorKey: 'blue',
      initial: '小',
      value: 450,
      packQuantity: 0,
      packPrice: 0,
      materialCost: 70,
    });

    expect(created.materialCost).toBe(70);
    expect(presetRepo.getById(created.id)?.materialCost).toBe(70);
  });

  it('update で 0 に戻せる（書かずに残すと古い資材費が生き続ける）', () => {
    const created = presetRepo.create({
      type: 'shipping',
      name: '専用箱（中）',
      colorKey: 'green',
      initial: '中',
      value: 700,
      packQuantity: 0,
      packPrice: 0,
      materialCost: 100,
    });

    presetRepo.update(created.id, {
      type: 'shipping',
      name: '専用箱（中）',
      colorKey: 'green',
      initial: '中',
      value: 700,
      packQuantity: 0,
      packPrice: 0,
      materialCost: 0,
    });

    expect(presetRepo.getById(created.id)?.materialCost).toBe(0);
  });

  it('まとめ買いで登録した資材費は、入数と購入価格の控えと一緒に残る（§2）', () => {
    const created = presetRepo.create({
      type: 'shipping',
      name: '専用袋',
      colorKey: 'teal',
      initial: '袋',
      value: 520,
      packQuantity: 100,
      packPrice: 1500,
      materialCost: 15,
    });

    expect(presetRepo.getById(created.id)).toMatchObject({
      value: 520,
      materialCost: 15,
      packQuantity: 100,
      packPrice: 1500,
    });
  });

  it('初期プリセット（0002 の seed）は資材費 0 円のまま', () => {
    for (const preset of presetRepo.listByType('shipping')) {
      if (preset.id.startsWith('seed-')) expect(preset.materialCost).toBe(0);
    }
  });
});

describe('SPEC-V7 §2.1 マイグレーション: 色キー → hex（0007 / 0008）', () => {
  /** 0006 までを流した「色キーのままの状態」に行を入れてから 0007・0008 を流す */
  function migrateWithRows() {
    const sqlite = newDatabase(6);
    sqlite
      .prepare(
        `INSERT INTO presets (id, type, name, color_key, initial, value, pack_quantity, pack_price, sort_order)
         VALUES ('mine-blue', 'shipping', '自分の送料', 'blue', '自', 450, 0, 0, 98),
                ('mine-broken', 'shipping', '壊れた色', 'chartreuse', '壊', 300, 0, 0, 99)`,
      )
      .run();
    sqlite
      .prepare(
        `INSERT INTO tags (id, name, color_key, sort_order) VALUES ('t1', '洋服', 'green', 1)`,
      )
      .run();
    // 流すのは 0007 / 0008 の 2 つだけ（この節の主題）。先まで流さないのは、
    // 下の「二重に流しても」が同じ範囲をもう一度流すため ── ALTER TABLE を含む
    // マイグレーション（0009）は 2 度流せない（列が既にある）
    for (const entry of journal.entries.slice(7, 9)) {
      for (const statement of migrationSql(entry.tag)) sqlite.exec(statement);
    }
    return sqlite;
  }

  it('固定色は同じ色の hex になる（見た目が変わらない）', () => {
    const row = migrateWithRows()
      .prepare(`SELECT color_key AS colorKey FROM presets WHERE id = 'mine-blue'`)
      .get() as { colorKey: string };

    expect(row.colorKey).toBe(PRESET_COLOR_HEXES.blue);
    // 変換後も「固定色の青」として解決される ＝ 明暗の出し分けが従来どおり続く
    expect(presetColorKeyOf(row.colorKey)).toBe('blue');
  });

  it('読めない色は既定色（青）へ倒す（読み出し時の挙動と同じ）', () => {
    const row = migrateWithRows()
      .prepare(`SELECT color_key AS colorKey FROM presets WHERE id = 'mine-broken'`)
      .get() as { colorKey: string };

    expect(row.colorKey).toBe(PRESET_COLOR_HEXES.blue);
  });

  it('タグも同じ変換を受ける（0008。パレットを共有しているため）', () => {
    const row = migrateWithRows()
      .prepare(`SELECT color_key AS colorKey FROM tags WHERE id = 't1'`)
      .get() as { colorKey: string };

    expect(row.colorKey).toBe(PRESET_COLOR_HEXES.green);
  });

  it('金額・名前・並び順は 1 つも動かない', () => {
    const row = migrateWithRows()
      .prepare(`SELECT * FROM presets WHERE id = 'mine-blue'`)
      .get() as Record<string, unknown>;

    expect(row).toMatchObject({
      name: '自分の送料',
      initial: '自',
      value: 450,
      pack_quantity: 0,
      pack_price: 0,
      sort_order: 98,
    });
  });

  it('二重に流しても hex は書き換わらない（すでに # で始まる行は対象外）', () => {
    const sqlite = migrateWithRows();
    for (const entry of journal.entries.slice(7, 9)) {
      for (const statement of migrationSql(entry.tag)) sqlite.exec(statement);
    }

    expect(
      (
        sqlite
          .prepare(`SELECT color_key AS colorKey FROM presets WHERE id = 'mine-blue'`)
          .get() as { colorKey: string }
      ).colorKey,
    ).toBe(PRESET_COLOR_HEXES.blue);
  });
});
