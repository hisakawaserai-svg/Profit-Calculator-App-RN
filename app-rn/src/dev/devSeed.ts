// 開発用テストデータ（__DEV__ 専用）の投入と削除。本番ビルドには入らない
// （app/(tabs)/settings/index.tsx が import ではなく require で読む。理由はそちらのコメント）。
//
// **投入の仕掛け（採番・タグの用意・接頭辞での削除）は seedKit.ts が持つ。**
// このファイルに残っているのは、開発用シード固有の「プリセットの揃え方」と
// testData.ts への繋ぎだけ ── 撮影用シード（storeShotSeed.ts）が同じ仕掛けを使う。
//
// 記録は 1 件ずつ create する。create が自分でトランザクションを張るので、外側で
// db.transaction() を重ねられない（tags.ts の「入れ子にしないのが規約」を参照）。

import { presetRepository } from '@/db/client';
import type { PresetType } from '@/db/schema';
import { PRESET_COLOR_HEXES, PRESET_COLOR_KEYS } from '@/logic/preset';

import {
  countSeedRecords,
  createSeedKit,
  ensureTags,
  removeSeedRows,
  type CreatedCount,
  type SeedSummary,
} from './seedKit';
import {
  buildDevSeedRecords,
  DEV_SEED_ID_PREFIX,
  DEV_SEED_TAG_NAMES,
  type DevSeedSources,
} from './testData';

/** 開発用シードの投入口。id が `devseed-` で始まる（削除はこの接頭辞で絞る） */
const kit = createSeedKit(DEV_SEED_ID_PREFIX);

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

/** 投入・削除の結果。画面がそのまま読み上げる（撮影用シードと同じ形） */
export type DevSeedSummary = SeedSummary;

/**
 * 種類ごとのプリセットを揃える。**既存があればそれを使い、足りないぶんだけ作る**
 * （既存のプリセットは書き換えない）。作ったものには接頭辞付きの id が付くので、
 * 削除でも投入したぶんだけが消える。
 */
function ensurePresets(type: PresetType, created: CreatedCount) {
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
      kit.presets.create({
        type,
        name: preset.name,
        // プリセットの色は hex で保存する（SPEC-V7 §2.1）。タグは今もキーのまま
        colorKey:
          PRESET_COLOR_HEXES[PRESET_COLOR_KEYS[(usable.length + index) % PRESET_COLOR_KEYS.length]],
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
 * テストデータを投入する（記録 50 件 ＋ 必要なタグ・プリセット）。
 * 返り値は**このとき作った件数**（既存を使い回したタグ・プリセットは数に入らない）。
 */
export function insertDevSeed(): DevSeedSummary {
  const createdPresets = { count: 0 };
  const createdTags = { count: 0 };

  const shipping = ensurePresets('shipping', createdPresets);
  const packaging = ensurePresets('packaging', createdPresets);
  const sites = ensurePresets('site', createdPresets);
  const tagIds = ensureTags(kit, DEV_SEED_TAG_NAMES, createdTags);

  const sources: DevSeedSources = {
    shippings: shipping.map((preset) => ({
      // 名前も渡す（0012）── 記録は選んだ送料プリセット名を写すので、
      // 値だけでは投入データがバッジの経路を通らない
      name: preset.name,
      value: preset.value,
      materialCost: preset.materialCost,
    })),
    packagingValues: packaging.map((preset) => preset.value),
    sites: sites.map((preset) => ({ name: preset.name, commission: preset.value })),
    tagIds,
  };

  const records = buildDevSeedRecords(sources);
  for (const record of records) kit.records.create(record);

  return { records: records.length, tags: createdTags.count, presets: createdPresets.count };
}

/**
 * 投入したぶんだけを消す。**手入力の記録・既存のタグ・既存のプリセットは残る**
 * （id の接頭辞で絞るため）。撮影用シード（`storeshot-`）も接頭辞が違うので巻き込まない。
 */
export function removeDevSeed(): DevSeedSummary {
  return removeSeedRows(DEV_SEED_ID_PREFIX);
}

/** 画面に出す「いま入っている投入ぶんの件数」 */
export function countDevSeedRecords(): number {
  return countSeedRecords(DEV_SEED_ID_PREFIX);
}
