// バックアップの ZIP を作る・読む（SPEC-V8 §1.1 / §3.1 / §4）。
//
// **端末に触るのはこのファイルと expoPhotoFiles.ts だけ**、という分け方は
// media/ の既存の作法に合わせてある（photoFiles.ts の冒頭を参照）。
// CSV の中身の組み立てと検証は logic/backup.ts（純粋関数）が持ち、
// ここは「バイト列にして書く」「読んでバイト列を解く」だけを引き受ける。
//
// ---
//
// **fflate は同期 API しか使わない**（`zipSync` / `unzipSync`）。
//
// 非同期 API（`zip()` / `unzip()`）は Web Worker で並列化する作りで、
// React Native には Worker が無いので動かない。同期 API は JS スレッドを止めるので、
// 止まる時間の上限を **写真の合計 50MB**（§4.4）で縛っている。

import { Directory, File, Paths } from 'expo-file-system';
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';

import {
  BACKUP_FILES,
  BACKUP_PHOTOS_DIR,
  backupBaseName,
  backupFileName,
  BackupError,
  classifyBackupEntry,
  selectBackupFiles,
  selectPhotoNames,
} from '@/logic/backup';
import { BACKUP_BROKEN_ZIP_MESSAGE, BACKUP_NO_CSV_MESSAGE } from '@/logic/labels';

/** ZIP の MIME / UTI。共有シートの受け手が種類を判断するのに使う */
export const BACKUP_MIME_TYPE = 'application/zip';
export const BACKUP_UTI = 'public.zip-archive';

/**
 * 圧縮レベルを**中身で使い分ける**（§4.2）。fflate はファイルごとに指定できる。
 *
 * - CSV … **6（既定の deflate）**。テキストはよく縮む（1000 件で 145KB → 59KB）。
 *   数十 KB の話なので時間は無視できる
 * - 写真 … **0（store = 無圧縮）**。JPEG は既に圧縮済みで deflate が効かない。
 *   実測で 56.2MB → 54.7MB（3% しか縮まない）のために作成が 9 倍、展開が 166 倍
 *   遅くなっていた（§6.2）。**縮まないものを縮めようとする時間が丸ごと無駄**
 */
const CSV_LEVEL = 6;
const PHOTO_LEVEL = 0;

/** バックアップに入れる写真 1 枚。名前は `photo_file_name` そのもの */
export type BackupPhoto = { name: string; bytes: Uint8Array };

/**
 * ファイル名 → 中身の対応と写真から ZIP を作り、**キャッシュ領域に置いて URI を返す**（§1.1）。
 *
 * キャッシュに置くのは既存の CSV 書き出し（ExportSheet）と同じ理由 ──
 * 共有シートに渡した後の後始末は OS に任せ、ドキュメント領域を汚さない
 * （SPEC-V3 決定 §8-14）。同じ日に 2 回作ると名前がぶつかるので上書きする。
 *
 * **中にフォルダを 1 つ作る**（§1.1）── 解凍したときに中身が
 * ダウンロードフォルダに散らばらないようにするため。
 */
export function writeBackupZip(
  files: ReadonlyMap<string, string>,
  photos: readonly BackupPhoto[],
  createdAt: Date,
): string {
  const folder = backupBaseName(createdAt);

  // fflate はバイト列しか受け取らない。strToU8 は UTF-8 で符号化する
  // （TextEncoder があれば使い、無ければ内蔵の実装に落ちるので RN でも動く）
  const entries: Zippable = {};
  for (const [name, text] of files) {
    entries[`${folder}/${name}`] = [strToU8(text), { level: CSV_LEVEL }];
  }
  for (const photo of photos) {
    entries[`${folder}/${BACKUP_PHOTOS_DIR}/${photo.name}`] = [photo.bytes, { level: PHOTO_LEVEL }];
  }

  const zipped = zipSync(entries);

  const file = new File(Paths.cache, backupFileName(createdAt));
  file.create({ overwrite: true });
  file.write(zipped);
  return file.uri;
}

/** ZIP / フォルダから取り出した中身。写真は名前 → バイト列 */
export type BackupArchive = {
  files: Map<string, string>;
  photos: Map<string, Uint8Array>;
};

/**
 * 選ばれた ZIP ファイルから 5 つの CSV と写真を取り出す（§3.1 / §4.3）。
 *
 * **中の構造は 2 通りを受ける**（フォルダが 1 つ / 直下に CSV）。
 * `__MACOSX/` や `.DS_Store` を落とすのも含めて、その判断は
 * logic/backup.ts の `classifyBackupEntry` が持つ（純粋関数なのでテストできる）。
 */
export function readBackupZip(file: File): BackupArchive {
  let unzipped: Record<string, Uint8Array>;
  try {
    unzipped = unzipSync(file.bytesSync());
  } catch {
    // 壊れている・そもそも ZIP ではない。中身までは言えない
    throw new BackupError(BACKUP_BROKEN_ZIP_MESSAGE);
  }

  const textEntries: [string, string][] = [];
  const photos = new Map<string, Uint8Array>();
  for (const [path, bytes] of Object.entries(unzipped)) {
    // ディレクトリのエントリは中身が空。復号する前に名前で落とす方が安い
    if (path.endsWith('/')) continue;
    const entry = classifyBackupEntry(path);
    if (entry == null) continue;

    // **写真は文字列にしない。** strFromU8 を通すとバイト列が壊れるうえ、
    // 文字列の分だけメモリが余計に要る
    if (entry.kind === 'photo') photos.set(entry.name, bytes);
    else textEntries.push([path, strFromU8(bytes)]);
  }

  const files = selectBackupFiles(textEntries);
  if (files.size === 0) throw new BackupError(BACKUP_NO_CSV_MESSAGE);
  return { files, photos };
}

/**
 * 選ばれた**フォルダ**から 5 つの CSV と写真を取り出す（§3.1 / 決定 §8-2）。
 *
 * ZIP を解凍して中身を確かめた人が、そのまま復元できるようにするための経路。
 * 解凍先には `profit-calculator-backup_2026-08-14/` が 1 段できることも、
 * 中身が直に並ぶこともあるので、**1 段だけ潜って探す**。
 * 写真はさらにその下の `photos/` に入るので、探索は 2 段まで。
 */
export function readBackupDirectory(directory: Directory): BackupArchive {
  const textEntries: [string, string][] = [];
  const photos = new Map<string, Uint8Array>();

  const collect = (dir: Directory, prefix: string, depth: number) => {
    for (const item of dir.list()) {
      if (item instanceof File) {
        const path = `${prefix}${item.name}`;
        const entry = classifyBackupEntry(path);
        if (entry == null) continue;
        // 中身を読むのは要るものだけ。フォルダに大きなファイルが同居していても
        // 読みに行かない（解凍先がダウンロードフォルダそのものである可能性がある）
        if (entry.kind === 'photo') photos.set(entry.name, item.bytesSync());
        else if (BACKUP_FILES.includes(entry.name)) textEntries.push([path, item.textSync()]);
      } else if (depth > 0) {
        collect(item, `${prefix}${item.name}/`, depth - 1);
      }
    }
  };

  // 深さ 2 まで（選んだフォルダ / その直下のフォルダ / さらに下の photos/）
  collect(directory, '', 2);

  const files = selectBackupFiles(textEntries);
  if (files.size === 0) throw new BackupError(BACKUP_NO_CSV_MESSAGE);
  return { files, photos };
}

/** ZIP / フォルダに入っていた写真の名前（§4.3 の照合に渡す） */
export function archivePhotoNames(archive: BackupArchive): Set<string> {
  return selectPhotoNames([...archive.photos.keys()].map((name) => `${BACKUP_PHOTOS_DIR}/${name}`));
}
