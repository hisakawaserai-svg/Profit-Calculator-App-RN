// テストデータ投入の共通部分（__DEV__ 専用）。開発用シード（devSeed.ts）と
// 撮影用シード（storeShotSeed.ts）の 2 セットが、この 1 本を通して投入・削除する。
//
// **SQL は書かない。** 既存の repository / presetRepository / tagRepository の関数だけを使う。
// 唯一入れ替えているのは **id の採番**で、createRepository 系が受け取る generateId に
// 接頭辞付きの UUID を返す関数を渡している ── これだけで「投入した行」と「手入力の行」が
// スキーマを変えずに見分けられる。
//
// **接頭辞をセットごとに変えるので、片方だけを消せる。** 2 セットを同時に入れておいて、
// 撮影用だけを消す、ということができる（両方 UUID だと区別が付かない）。
//
// 本番ビルドには入らない（app/(tabs)/settings/index.tsx の require 参照）。

import { randomUUID } from 'expo-crypto';

import { db, presetRepository, repository, tagRepository } from '@/db/client';
import { createPresetRepository } from '@/db/presets';
import { createRepository } from '@/db/repository';
import { createTagRepository } from '@/db/tags';
import { photoStore } from '@/media/expoPhotoFiles';
import { PRESET_TYPES } from '@/logic/preset';
import { nextTagColor } from '@/logic/tag';

/** 投入・削除の結果。画面がそのまま読み上げる */
export type SeedSummary = {
  records: number;
  tags: number;
  presets: number;
};

/** 作った件数を数えながら回すための入れ物（既存を使い回した行は数に入れない） */
export type CreatedCount = { count: number };

/**
 * 1 セットぶんの投入口。中身は本番と同じ createRepository 系で、**採番だけが違う。**
 *
 * deletePhotoFile は client.ts と同じものを渡す ── 「本番と同じ repository を使う」を
 * 崩さないため。撮影用シードは実際に写真を書くので、ここが繋がっていないと
 * 記録を消しても画像ファイルが残る。
 */
export function createSeedKit(idPrefix: string) {
  const generateId = () => `${idPrefix}${randomUUID()}`;
  return {
    idPrefix,
    records: createRepository(db, { generateId, deletePhotoFile: photoStore.remove }),
    presets: createPresetRepository(db, { generateId }),
    tags: createTagRepository(db, { generateId }),
  };
}

export type SeedKit = ReturnType<typeof createSeedKit>;

/**
 * タグを揃える。**同じ名前のタグが既にあればそれを使う** ── 作ってしまうと
 * 同名が 2 つ並び、絞り込みでどちらか分からなくなる（SPEC-V4 §1.3 が名前の重複を禁じている理由）。
 * 既存を使った場合、その行には接頭辞が付かないので削除でも残る。
 */
export function ensureTags(
  kit: SeedKit,
  names: readonly string[],
  created: CreatedCount,
): string[] {
  const ids: string[] = [];
  for (const name of names) {
    const existing = tagRepository.listAll().find((tag) => tag.name === name);
    if (existing != null) {
      ids.push(existing.id);
      continue;
    }
    // 色は既存の使用状況から決める（SPEC-V4 §1.2）。1 件ずつ作るので毎回引き直す
    const tag = kit.tags.create({ name, colorKey: nextTagColor(tagRepository.listAll()) });
    ids.push(tag.id);
    created.count += 1;
  }
  return ids;
}

function hasPrefix(row: { id: string }, idPrefix: string): boolean {
  return row.id.startsWith(idPrefix);
}

/**
 * そのセットで投入したぶんだけを消す。**手入力の記録・既存のタグ・既存のプリセットは残る**
 * （id の接頭辞で絞るため）。もう一方のセットも接頭辞が違うので巻き込まない。
 *
 * 記録は listForExport で全件を引いてから絞る ── 「期間なし・出品中も含める」は
 * 全件そのものなので（buildExportWhere が `1 = 1` になる）、この 1 本で足りる。
 * 消すのは**本番の repository**で行う ── 写真の実体を消す口が繋がっているのはそちら。
 */
export function removeSeedRows(idPrefix: string): SeedSummary {
  const records = repository
    .listForExport({ period: null, includeListing: true })
    .filter((row) => hasPrefix(row, idPrefix));
  for (const record of records) repository.remove(record.id);

  // 記録を先に消してあるので、ここで消えるのは中間行の無いタグ本体だけ
  const tags = tagRepository.listAll().filter((row) => hasPrefix(row, idPrefix));
  for (const tag of tags) tagRepository.remove(tag.id);

  const presets = PRESET_TYPES.flatMap((type) => presetRepository.listByType(type)).filter((row) =>
    hasPrefix(row, idPrefix),
  );
  for (const preset of presets) presetRepository.remove(preset.id);

  return { records: records.length, tags: tags.length, presets: presets.length };
}

/** 画面に出す「いま入っている投入ぶんの件数」 */
export function countSeedRecords(idPrefix: string): number {
  return repository
    .listForExport({ period: null, includeListing: true })
    .filter((row) => hasPrefix(row, idPrefix)).length;
}
