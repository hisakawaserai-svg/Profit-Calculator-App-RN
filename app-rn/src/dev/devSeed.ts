// 開発用テストデータ（__DEV__ 専用）の投入と削除。本番ビルドには入らない
// （app/(tabs)/settings/index.tsx が import ではなく require で読む。理由はそちらのコメント）。
//
// **SQL は書かない。** 既存の repository / presetRepository / tagRepository の関数だけを使う。
// 唯一入れ替えているのは **id の採番**で、createRepository 系が受け取る generateId に
// DEV_SEED_ID_PREFIX 付きの UUID を返す関数を渡している ── これだけで
// 「投入した行」と「手入力の行」がスキーマを変えずに見分けられる（testData.ts の冒頭を参照）。
//
// 記録は 1 件ずつ create する。create が自分でトランザクションを張るので、外側で
// db.transaction() を重ねられない（tags.ts の「入れ子にしないのが規約」を参照）。

import { randomUUID } from 'expo-crypto';

import { db, presetRepository, repository, tagRepository } from '@/db/client';
import { createPresetRepository } from '@/db/presets';
import { createRepository } from '@/db/repository';
import type { PresetType } from '@/db/schema';
import { createTagRepository } from '@/db/tags';
import { photoStore } from '@/media/expoPhotoFiles';
import { PRESET_COLOR_KEYS, PRESET_TYPES } from '@/logic/preset';
import { nextTagColor } from '@/logic/tag';

import {
  buildDevSeedRecords,
  DEV_SEED_ID_PREFIX,
  DEV_SEED_TAG_NAMES,
  type DevSeedSources,
} from './testData';

/** 投入した行だけに付く id を作る。削除はこの接頭辞で絞る */
function devSeedId(): string {
  return `${DEV_SEED_ID_PREFIX}${randomUUID()}`;
}

// 投入用の入口。中身は本番と同じ createRepository で、採番だけが違う。
// deletePhotoFile は client.ts と同じものを渡す（投入するデータに写真は無いので実際には呼ばれないが、
// 「本番と同じ repository を使う」ことを崩さないため）。
const seedRepository = createRepository(db, { generateId: devSeedId, deletePhotoFile: photoStore.remove });
const seedPresetRepository = createPresetRepository(db, { generateId: devSeedId });
const seedTagRepository = createTagRepository(db, { generateId: devSeedId });

/**
 * 投入に最低限必要なプリセットの数。
 * 「複数種類を使い分ける」ためなので 1 件では足りない ── 足りないぶんだけ下の既定値で補う。
 */
const MIN_PRESETS: Record<PresetType, number> = { shipping: 3, packaging: 3, site: 2 };

/**
 * プリセットが消されているときに補う既定値。マイグレーション 0002 の初期値と同じ考え方で、
 * 配送サービスの商標を使わず、サイズと形状で表す。
 */
const FALLBACK_PRESETS: Record<
  PresetType,
  readonly { name: string; value: number; materialCost?: number }[]
> = {
  // 専用の箱を買わないと使えない配送方法（SPEC-V6 §1）を 2 つ混ぜる ──
  // 資材費のあるプリセットが無いと、記録側のトグルを確かめられない
  shipping: [
    { name: 'A4・厚さ3cm以内', value: 210 },
    { name: '専用箱（小）', value: 450, materialCost: 70 },
    { name: '専用箱（中）', value: 700, materialCost: 100 },
    { name: '宅配 80サイズ', value: 850 },
    { name: '宅配 100サイズ', value: 1050 },
  ],
  packaging: [
    { name: '封筒（A4）', value: 15 },
    { name: 'クッション封筒', value: 40 },
    { name: '段ボール（小）', value: 60 },
    { name: '段ボール（中）', value: 100 },
  ],
  site: [
    { name: '手数料 10%', value: 10 },
    { name: '手数料 6%', value: 6 },
    { name: '手数料なし（直接取引）', value: 0 },
  ],
};

/** 投入・削除の結果。画面がそのまま読み上げる */
export type DevSeedSummary = {
  records: number;
  tags: number;
  presets: number;
};

/**
 * 種類ごとのプリセットを揃える。**既存があればそれを使い、足りないぶんだけ作る**
 * （既存のプリセットは書き換えない）。作ったものには接頭辞付きの id が付くので、
 * 削除でも投入したぶんだけが消える。
 */
function ensurePresets(type: PresetType, created: { count: number }) {
  // 販売サイトの率が 100% だと逆算（testData の売上の押し上げ）が発散するので、極端な率は候補から外す
  const usable = presetRepository
    .listByType(type)
    .filter((preset) => preset.value >= 0 && (type !== 'site' || preset.value <= 50));

  const missing = MIN_PRESETS[type] - usable.length;
  if (missing <= 0) return usable;

  const existingNames = new Set(usable.map((preset) => preset.name));
  const additions = FALLBACK_PRESETS[type]
    .filter((preset) => !existingNames.has(preset.name))
    .slice(0, missing)
    .map((preset, index) =>
      seedPresetRepository.create({
        type,
        name: preset.name,
        colorKey: PRESET_COLOR_KEYS[(usable.length + index) % PRESET_COLOR_KEYS.length],
        initial: '', // 空 = 名前の先頭 1 文字から導出（SPEC-V3 §1.2）
        value: preset.value,
        packQuantity: 0,
        packPrice: 0,
        materialCost: preset.materialCost ?? 0,
      }),
    );

  created.count += additions.length;
  return [...usable, ...additions];
}

/**
 * タグ 6 種を揃える。**同じ名前のタグが既にあればそれを使う** ── 作ってしまうと
 * 同名が 2 つ並び、絞り込みでどちらか分からなくなる（SPEC-V4 §1.3 が名前の重複を禁じている理由）。
 * 既存を使った場合、その行には接頭辞が付かないので削除でも残る。
 */
function ensureTags(created: { count: number }): string[] {
  const ids: string[] = [];
  for (const name of DEV_SEED_TAG_NAMES) {
    const existing = tagRepository.listAll().find((tag) => tag.name === name);
    if (existing != null) {
      ids.push(existing.id);
      continue;
    }
    // 色は既存の使用状況から決める（SPEC-V4 §1.2）。1 件ずつ作るので毎回引き直す
    const tag = seedTagRepository.create({ name, colorKey: nextTagColor(tagRepository.listAll()) });
    ids.push(tag.id);
    created.count += 1;
  }
  return ids;
}

/**
 * テストデータを投入する（記録 50 件 ＋ 必要なタグ・プリセット）。
 * 返り値は**このとき作った件数**（既存を使い回したタグ・プリセットは数に入らない）。
 */
export function insertDevSeed(): DevSeedSummary {
  const createdPresets = { count: 0 };
  const createdTags = { count: 0 };

  const shipping = ensurePresets('shipping', createdPresets);
  const packaging = ensurePresets('packaging', createdPresets);
  const sites = ensurePresets('site', createdPresets);
  const tagIds = ensureTags(createdTags);

  const sources: DevSeedSources = {
    shippings: shipping.map((preset) => ({
      value: preset.value,
      materialCost: preset.materialCost,
    })),
    packagingValues: packaging.map((preset) => preset.value),
    sites: sites.map((preset) => ({ name: preset.name, commission: preset.value })),
    tagIds,
  };

  const records = buildDevSeedRecords(sources);
  for (const record of records) seedRepository.create(record);

  return { records: records.length, tags: createdTags.count, presets: createdPresets.count };
}

function isDevSeedRow(row: { id: string }): boolean {
  return row.id.startsWith(DEV_SEED_ID_PREFIX);
}

/**
 * 投入したぶんだけを消す。**手入力の記録・既存のタグ・既存のプリセットは残る**
 * （id の接頭辞で絞るため）。
 *
 * 記録は listForExport で全件を引いてから絞る ── 「期間なし・出品中も含める」は
 * 全件そのものなので（buildExportWhere が `1 = 1` になる）、この 1 本で足りる。
 */
export function removeDevSeed(): DevSeedSummary {
  const records = repository
    .listForExport({ period: null, includeListing: true })
    .filter(isDevSeedRow);
  for (const record of records) repository.remove(record.id);

  // 記録を先に消してあるので、ここで消えるのは中間行の無いタグ本体だけ
  const tags = tagRepository.listAll().filter(isDevSeedRow);
  for (const tag of tags) tagRepository.remove(tag.id);

  const presets = PRESET_TYPES.flatMap((type) => presetRepository.listByType(type)).filter(
    isDevSeedRow,
  );
  for (const preset of presets) presetRepository.remove(preset.id);

  return { records: records.length, tags: tags.length, presets: presets.length };
}

/** 画面に出す「いま入っている投入ぶんの件数」 */
export function countDevSeedRecords(): number {
  return repository.listForExport({ period: null, includeListing: true }).filter(isDevSeedRow)
    .length;
}
