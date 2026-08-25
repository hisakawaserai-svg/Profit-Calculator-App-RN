// ストア掲載用スクリーンショットのテストデータ（__DEV__ 専用）の投入と削除。
//
// **開発用シード（devSeed.ts）とは別のセット。** 仕掛け（採番・タグの用意・接頭辞での削除）は
// seedKit.ts を共有しているが、id の接頭辞が `storeshot-` なので**片方だけを消せる。**
// 開発用シードを入れたまま撮影用だけを足す／消す、ができる。
//
// 開発用シードと違ってここが余分に持つのは 2 つ:
//   1. **プリセットを必ず用意する** ── マイグレーション 0011 でプリセットは空から始まるので、
//      作らないと計算タブにも記録フォームにも 1 行も出ない（掲載画像がいちばん寂しい状態）
//   2. **商品写真を書く** ── 記録が持つのはファイル名だけで、実体は写真置き場に要る
//      （SPEC-V5 §1.3）。投入の前に photoStore.write でファイルを作ってから名前を渡す
//
// 本番ビルドには入らない（app/(tabs)/settings/index.tsx の require 参照）。

import { randomUUID } from 'expo-crypto';

import { presetRepository } from '@/db/client';
import type { PresetType } from '@/db/schema';
import { photoStore } from '@/media/expoPhotoFiles';
import { photoFileName } from '@/logic/photo';
import { PRESET_COLOR_HEXES, PRESET_COLOR_KEYS } from '@/logic/preset';
import type { Locale } from '@/settings/language';

import { decodeBase64 } from './base64';
import {
  countSeedRecords,
  createSeedKit,
  ensureTags,
  removeSeedRows,
  type CreatedCount,
  type SeedSummary,
} from './seedKit';
import {
  buildStoreShotRecords,
  STORE_SHOT_ID_PREFIX,
  STORE_SHOT_PRESETS,
  STORE_SHOT_TAG_NAMES,
  type StoreShotSources,
} from './storeShotData';
import { STORE_SHOT_PHOTOS, type StoreShotPhotoName } from './storeShotPhotos';

/** 撮影用シードの投入口。id が `storeshot-` で始まる（削除はこの接頭辞で絞る） */
const kit = createSeedKit(STORE_SHOT_ID_PREFIX);

/** 投入・削除の結果。写真の枚数だけ開発用シードより 1 つ多い */
export type StoreShotSummary = SeedSummary & { photos: number };

/**
 * プリセットを揃える。**同じ種類・同じ名前のものが既にあればそれを使う**
 * （ensureTags と同じ扱い）── 投入し直すたびに同じ名前が積み上がると、
 * プリセットの一覧を撮ったときに同じ行が並んでしまう。
 *
 * 既存を使った場合、その行には接頭辞が付かないので削除でも残る。
 * **記録の金額はこの結果に左右されない** ── 記録はプリセットを id で参照せず
 * 値を写して持つ形なので（SPEC-V3 §1.5）、金額は storeShotData.ts の表が持っている。
 */
function ensurePresets(
  type: PresetType,
  presets: readonly { name: string; value: number }[],
  created: CreatedCount,
): void {
  const existingNames = new Set(presetRepository.listByType(type).map((preset) => preset.name));

  presets.forEach((preset, index) => {
    if (existingNames.has(preset.name)) return;
    kit.presets.create({
      type,
      name: preset.name,
      // プリセットの色は hex で保存する（SPEC-V7 §2.1）
      colorKey: PRESET_COLOR_HEXES[PRESET_COLOR_KEYS[index % PRESET_COLOR_KEYS.length]],
      initial: '', // 空 = 名前の先頭 1 文字から導出（SPEC-V3 §1.2）
      value: preset.value,
      packQuantity: 0,
      packPrice: 0,
      materialCost: 0,
    });
    created.count += 1;
  });
}

/**
 * 商品写真を写真置き場へ書き、名前を返す。
 *
 * 名前には接頭辞を付ける ── 写真は DB の行ではないので接頭辞で消すわけではない
 * （記録を消すと repository が実体も消す。SPEC-V5 §1.5）が、置き場を覗いたときに
 * 「撮影用に入れたもの」だと分かる方がよい。
 */
function writePhotos(): Record<StoreShotPhotoName, string> {
  const names: Record<string, string> = {};
  for (const [key, base64] of Object.entries(STORE_SHOT_PHOTOS)) {
    const fileName = photoFileName(`${STORE_SHOT_ID_PREFIX}${randomUUID()}`);
    photoStore.write(fileName, decodeBase64(base64));
    names[key] = fileName;
  }
  return names;
}

/**
 * 撮影用データを投入する（記録 42 件 ＋ タグ 5 種 ＋ プリセット 6 件 ＋ 写真 4 枚）。
 *
 * `locale` は**投入した時点の表示言語**。商品名・タグ名・プリセット名は DB の行なので、
 * 入れたあとに表示言語を変えても訳されない ── 英語の掲載画像を撮るときは、
 * 英語表示にしてから投入し直すこと。
 *
 * 返り値は**このとき作った件数**（既存を使い回したタグ・プリセットは数に入らない）。
 */
export function insertStoreShotSeed(locale: Locale): StoreShotSummary {
  const createdPresets: CreatedCount = { count: 0 };
  const createdTags: CreatedCount = { count: 0 };

  const presets = STORE_SHOT_PRESETS[locale];
  ensurePresets('shipping', presets.shipping, createdPresets);
  ensurePresets('packaging', presets.packaging, createdPresets);
  ensurePresets('site', presets.site, createdPresets);

  const tagIds = ensureTags(kit, STORE_SHOT_TAG_NAMES[locale], createdTags);
  const photoFileNames = writePhotos();

  const sources: StoreShotSources = {
    locale,
    tagIds,
    siteName: presets.site[0].name,
    photoFileNames,
  };

  // 記録は 1 件ずつ create する（create が自分でトランザクションを張るので外側で重ねられない）
  const records = buildStoreShotRecords(sources);
  for (const record of records) kit.records.create(record);

  return {
    records: records.length,
    tags: createdTags.count,
    presets: createdPresets.count,
    photos: Object.keys(photoFileNames).length,
  };
}

/**
 * 撮影用データだけを消す。**手入力の記録も、開発用シード（`devseed-`）も残る。**
 *
 * 写真の実体も一緒に消える ── 記録を消すのは本番の repository なので、
 * deletePhotoFile が繋がっている（seedKit.removeSeedRows）。
 */
export function removeStoreShotSeed(): StoreShotSummary {
  const summary = removeSeedRows(STORE_SHOT_ID_PREFIX);
  // 写真は記録と一緒に消えるので、ここで数えられるのは「消えたはずの枚数」ではなく
  // 「記録に付いていた枚数」── 数字として意味を持たないので 0 を返す
  return { ...summary, photos: 0 };
}

/** 画面に出す「いま入っている撮影用データの件数」 */
export function countStoreShotRecords(): number {
  return countSeedRecords(STORE_SHOT_ID_PREFIX);
}
