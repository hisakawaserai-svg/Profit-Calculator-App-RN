import { drizzle } from 'drizzle-orm/expo-sqlite';
import { migrate } from 'drizzle-orm/expo-sqlite/migrator';
import { randomUUID } from 'expo-crypto';
import { openDatabaseSync } from 'expo-sqlite';

import migrations from '../../drizzle/migrations';
import { createRepository } from './repository';
import * as schema from './schema';

const expoDb = openDatabaseSync('profit-calculator.db');

export const db = drizzle(expoDb, { schema });

/** UI が使うデータアクセスの唯一の入口。直接 db でクエリを書かないこと */
export const repository = createRepository(db, { generateId: randomUUID });

let initPromise: Promise<void> | null = null;

/**
 * drizzle-kit generate 済みのマイグレーション（drizzle/）を適用する。
 * アプリ起動時に app/_layout.tsx から呼ばれる。何度呼んでも 1 回しか走らない。
 */
export function initDatabase(): Promise<void> {
  initPromise ??= migrate(db, migrations);
  return initPromise;
}
