import { drizzle } from 'drizzle-orm/expo-sqlite';
import { migrate } from 'drizzle-orm/expo-sqlite/migrator';
import { randomUUID } from 'expo-crypto';
import { openDatabaseSync } from 'expo-sqlite';

import migrations from '../../drizzle/migrations';
import { photoStore } from '../media/expoPhotoFiles';
import { createBackupRepository } from './backup';
import { createPresetRepository } from './presets';
import { createRepository } from './repository';
import * as schema from './schema';
import { createTagRepository } from './tags';

const expoDb = openDatabaseSync('profit-calculator.db');

export const db = drizzle(expoDb, { schema });

/**
 * UI が使うデータアクセスの唯一の入口。直接 db でクエリを書かないこと。
 *
 * 写真の実体を消す口（`deletePhotoFile`）をここで渡す（SPEC-V5 §1.5）──
 * 「記録を消したら写真も消える」を repository の中で完結させるため。画面から
 * 消し忘れる余地を作らないのが目的で、repository 自身は expo-file-system を知らない。
 */
export const repository = createRepository(db, {
  generateId: randomUUID,
  deletePhotoFile: photoStore.remove,
});

/**
 * プリセット（SPEC-V3 §1）の入口。レコードと同じ DB に同居する（§1.6）ので、
 * マイグレーションも initDatabase の 1 回で足りる。
 */
export const presetRepository = createPresetRepository(db, { generateId: randomUUID });

/**
 * タグ（SPEC-V4 §1）の入口。中間テーブル（record_tags）の操作もここが持つ。
 * 同じ DB に同居する（§1.6）ので、マイグレーションは initDatabase の 1 回で足りる。
 */
export const tagRepository = createTagRepository(db, { generateId: randomUUID });

/**
 * バックアップと復元（SPEC-V8 §3.4）の入口。**他の 3 つとは別に持つ。**
 *
 * 復元は 4 テーブルを 1 つのトランザクションで全置換するので、
 * 1 件ずつトランザクションを張る上の 3 つとは呼び方が根本的に違う
 * （入れ子にできない。db/backup.ts の冒頭を参照）。id も採番しないので
 * generateId を渡さない ── 復元は同じ id を書き戻すことだから。
 */
export const backupRepository = createBackupRepository(db);

let initPromise: Promise<void> | null = null;

/**
 * drizzle-kit generate 済みのマイグレーション（drizzle/）を適用する。
 * アプリ起動時に app/_layout.tsx から呼ばれる。何度呼んでも 1 回しか走らない。
 */
export function initDatabase(): Promise<void> {
  initPromise ??= migrate(db, migrations);
  return initPromise;
}
