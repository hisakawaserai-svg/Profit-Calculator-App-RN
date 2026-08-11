import { drizzle } from 'drizzle-orm/expo-sqlite';
import { migrate } from 'drizzle-orm/expo-sqlite/migrator';
import { randomUUID } from 'expo-crypto';
import { openDatabaseSync } from 'expo-sqlite';

import migrations from '../../drizzle/migrations';
import { createPresetRepository } from './presets';
import { createRepository } from './repository';
import * as schema from './schema';
import { createTagRepository } from './tags';

const expoDb = openDatabaseSync('profit-calculator.db');

export const db = drizzle(expoDb, { schema });

/** UI が使うデータアクセスの唯一の入口。直接 db でクエリを書かないこと */
export const repository = createRepository(db, { generateId: randomUUID });

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

let initPromise: Promise<void> | null = null;

/**
 * drizzle-kit generate 済みのマイグレーション（drizzle/）を適用する。
 * アプリ起動時に app/_layout.tsx から呼ばれる。何度呼んでも 1 回しか走らない。
 */
export function initDatabase(): Promise<void> {
  initPromise ??= migrate(db, migrations);
  return initPromise;
}
