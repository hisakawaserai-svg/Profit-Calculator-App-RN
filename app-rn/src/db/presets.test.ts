// SPEC-V3 §6.3 のテスト方針のうち、DB の側。
// - 初期プリセットが出荷されないこと（0002 が入れた 17 件を 0011 が消す）
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

/**
 * 全マイグレーション後の DB に、**かつての初期プリセット 17 件を入れ直した**もの。
 *
 * 初期値は 0011 で出荷しなくなった（多言語化のため。理由はそのマイグレーションの冒頭）が、
 * 「既に何件か登録されている状態」を土台にしたいテストはまだある ── CRUD の並び・採番や、
 * 列を足すマイグレーションが既存行に触れないこと。当時の 17 件をそのまま雛形に使うのは、
 * id が内容の読める固定値で、テストから名指しできるため。
 *
 * 0007（色キー → hex）を流し直しているのは、0002 の INSERT が色を**キー名**で書いており、
 * そのままだと今の形（hex）と食い違うため。`WHERE color_key NOT LIKE '#%'` が付いた
 * 条件付き UPDATE なので、何度流しても既に hex の行には触れない。
 */
function newDatabaseWithLegacyPresets() {
  const sqlite = newDatabase();
  for (const statement of migrationSql('0002_dusty_blink')) {
    if (statement.includes('INSERT INTO `presets`')) sqlite.exec(statement);
  }
  for (const statement of migrationSql('0007_preset_color_hex')) sqlite.exec(statement);
  return sqlite;
}

/** 0002（presets と site_name を足すマイグレーション）の idx */
const PRESETS_MIGRATION_IDX = 2;

/** 0011（初期プリセットを消すマイグレーション）の idx */
const SEED_REMOVAL_IDX = journal.entries.findIndex(
  (entry) => entry.tag === '0011_remove_seed_presets',
);

/** 0003（まとめ買いの 2 列を足すマイグレーション。§2.6.4）の idx */
const PACK_MIGRATION_IDX = 3;

describe('§1.6 / §2 / 0011 初期プリセットは出荷しない', () => {
  // SPEC-V3 §2 の初期値 17 件は 0002 が入れていたが、**0011 で消すようにした**
  // （多言語化。`手数料 10%` のような日本語が DB の行として焼き付いていて訳せないため）。
  // マイグレーションは追記だけで進めるので 0002 の INSERT はそのまま残してあり、
  // 新規インストールは「入れてから消す」経路で既存の端末と同じ状態に着地する。

  it('マイグレーションを流し終えた状態にプリセットは 1 件もない', () => {
    const sqlite = newDatabase();
    const { count } = sqlite.prepare('SELECT count(*) AS count FROM presets').get() as {
      count: number;
    };

    expect(count).toBe(0);
  });

  it('0011 の 1 つ手前までは 0002 の 17 件が入っている（履歴は書き換えていない）', () => {
    const sqlite = newDatabase(SEED_REMOVAL_IDX - 1);
    const { count } = sqlite.prepare('SELECT count(*) AS count FROM presets').get() as {
      count: number;
    };

    expect(count).toBe(17);
  });

  it('消えるのは seed- の行だけで、利用者が作った行は残る（§2.5）', () => {
    const sqlite = newDatabase(SEED_REMOVAL_IDX - 1);
    sqlite
      .prepare(
        `INSERT INTO presets (id, type, name, color_key, initial, value, sort_order)
         VALUES ('mine', 'packaging', 'エアキャップ', '#FFCC00', 'エ', 30, 7)`,
      )
      .run();
    for (const statement of migrationSql(journal.entries[SEED_REMOVAL_IDX].tag)) {
      sqlite.exec(statement);
    }

    const ids = (sqlite.prepare('SELECT id FROM presets').all() as { id: string }[]).map(
      (row) => row.id,
    );
    expect(ids).toEqual(['mine']);
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
    const sqlite = newDatabaseWithLegacyPresets();
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
    const db = drizzle(newDatabaseWithLegacyPresets(), { schema });
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
    // 初期値は出荷しなくなったので（0011）、土台はテスト側で用意する
    presetRepo = createPresetRepository(drizzle(newDatabaseWithLegacyPresets(), { schema }), {
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

describe('SPEC-V10 §1 マイグレーション 0010: 単価の計算方式', () => {
  /** 0010（計算方式とサイズの 5 列を足すマイグレーション）の idx */
  const CALC_METHOD_MIGRATION_IDX = 10;

  it('0009 で止めると calc_method / サイズの列はまだ存在しない', () => {
    const older = newDatabase(CALC_METHOD_MIGRATION_IDX - 1);

    expect(() => older.prepare('SELECT calc_method FROM presets').all()).toThrow();
    expect(() => older.prepare('SELECT pack_height FROM presets').all()).toThrow();
  });

  it('初期プリセットは「個数から」のまま（バックフィルなし）', () => {
    const sqlite = newDatabaseWithLegacyPresets();
    const rows = sqlite
      .prepare(
        `SELECT id, value, calc_method AS calcMethod, pack_height AS packHeight,
                pack_width AS packWidth, use_height AS useHeight, use_width AS useWidth
         FROM presets WHERE type = 'packaging' ORDER BY sort_order`,
      )
      .all() as {
      id: string;
      value: number;
      calcMethod: string;
      packHeight: number;
      packWidth: number;
      useHeight: number;
      useWidth: number;
    }[];

    expect(rows).toHaveLength(6);
    expect(rows.every((row) => row.calcMethod === 'individual')).toBe(true);
    expect(
      rows.every(
        (row) =>
          row.packHeight === 0 && row.packWidth === 0 && row.useHeight === 0 && row.useWidth === 0,
      ),
    ).toBe(true);
    // 金額は §2.4 のまま
    expect(rows.find((row) => row.id === 'seed-packaging-box-s')?.value).toBe(60);
  });

  it('利用者が作った既存行（まとめ買い）も個数方式のまま開く（0009 までで入れた行に 0010 を流す）', () => {
    const sqlite = newDatabase(CALC_METHOD_MIGRATION_IDX - 1);
    sqlite
      .prepare(
        `INSERT INTO presets (id, type, name, color_key, initial, value, pack_quantity, pack_price, sort_order)
         VALUES ('mine', 'packaging', '封筒（A4）', '#FFCC00', '封', 8, 100, 800, 7)`,
      )
      .run();
    for (const statement of migrationSql(journal.entries[CALC_METHOD_MIGRATION_IDX].tag)) {
      sqlite.exec(statement);
    }

    const row = sqlite
      .prepare(
        `SELECT value, pack_quantity AS packQuantity, pack_price AS packPrice,
                calc_method AS calcMethod, pack_height AS packHeight, pack_width AS packWidth,
                use_height AS useHeight, use_width AS useWidth
         FROM presets WHERE id = 'mine'`,
      )
      .get();

    // 単価（value）も控えの 2 列も動かず、方式だけが既定で埋まる
    expect(row).toEqual({
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

describe('SPEC-V10 §1.2 プリセットの保存: 計算方式とサイズ', () => {
  let sqlite: ReturnType<typeof newDatabase>;
  let presetRepo: PresetRepository;

  beforeEach(() => {
    sqlite = newDatabase();
    presetRepo = createPresetRepository(drizzle(sqlite, { schema }), { generateId: randomUUID });
  });

  it('方式を渡さない追加は「個数から」で入る（既存の呼び出しがそのまま動く）', () => {
    const created = presetRepo.create({
      type: 'packaging',
      name: '封筒（A4）',
      colorKey: '#FFCC00',
      initial: '封',
      value: 8,
      packQuantity: 100,
      packPrice: 800,
      materialCost: 0,
    });

    expect(created.calcMethod).toBe('individual');
    expect(presetRepo.getById(created.id)).toMatchObject({
      calcMethod: 'individual',
      value: 8,
      packQuantity: 100,
      packPrice: 800,
      packHeight: 0,
      packWidth: 0,
      useHeight: 0,
      useWidth: 0,
    });
  });

  it('面積方式は 1 回あたりの単価と、元の入力（サイズ 4 つ・購入価格）が両方残る', () => {
    const created = presetRepo.create({
      type: 'packaging',
      name: 'エアキャップ',
      colorKey: '#2E9E4F',
      initial: 'エ',
      // 500円 / 1㎡ を 30×20cm 使う → 30円
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

    expect(presetRepo.getById(created.id)).toMatchObject({
      calcMethod: 'area',
      value: 30,
      packPrice: 500,
      packHeight: 100,
      packWidth: 100,
      useHeight: 30,
      useWidth: 20,
    });
  });

  it('使用回数方式は割る数を pack_quantity に持つ（列を増やさない。§1.2）', () => {
    const created = presetRepo.create({
      type: 'packaging',
      name: 'テープ',
      colorKey: '#FF3B30',
      initial: 'テ',
      value: 20,
      packQuantity: 50,
      packPrice: 1000,
      materialCost: 0,
      calcMethod: 'usage',
    });

    expect(presetRepo.getById(created.id)).toMatchObject({
      calcMethod: 'usage',
      value: 20,
      packQuantity: 50,
      packPrice: 1000,
      packHeight: 0,
    });
  });

  it('面積方式から個数方式へ戻すとサイズは消える（不整合な行を残さない）', () => {
    const created = presetRepo.create({
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

    presetRepo.update(created.id, {
      type: 'packaging',
      name: 'エアキャップ',
      colorKey: '#2E9E4F',
      initial: 'エ',
      value: 8,
      packQuantity: 100,
      packPrice: 800,
      materialCost: 0,
    });

    expect(presetRepo.getById(created.id)).toMatchObject({
      calcMethod: 'individual',
      value: 8,
      packQuantity: 100,
      packPrice: 800,
      packHeight: 0,
      packWidth: 0,
      useHeight: 0,
      useWidth: 0,
    });
  });

  it('削除の取り消しは方式とサイズごと書き戻す', () => {
    const created = presetRepo.create({
      type: 'packaging',
      name: 'エアキャップ',
      colorKey: '#2E9E4F',
      initial: 'エ',
      value: 500,
      packQuantity: 0,
      packPrice: 500,
      materialCost: 0,
      calcMethod: 'area',
      packHeight: 100,
      packWidth: 100,
      useHeight: 0,
      useWidth: 0,
    });

    presetRepo.remove(created.id);
    presetRepo.restore(created);

    expect(presetRepo.getById(created.id)).toMatchObject({
      calcMethod: 'area',
      value: 500,
      packHeight: 100,
      packWidth: 100,
    });
  });
});
