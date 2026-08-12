// 商品写真の実体（ファイル）の置き場（SPEC-V5 §1.3）。
//
// **expo-file-system を直接は import しない。** 触るのは下の `PhotoFileSystem` の 4 本だけで、
// 実装は `expoPhotoFiles.ts`（アプリ本体）とテストの偽物の 2 つがある。
// こうしてあるのは「記録を消したら写真も消える」「差し替えたら古いファイルが消える」が
// SPEC-V5 §1.5 の要件で、**端末なしで確かめられる形にしておきたい**ため。
//
// 責務はファイルの出し入れだけ。どこまで縮めるか（logic/photo.ts）、いつ消すか
// （db/repository.ts）は持たない。

import { PHOTO_DIR_NAME, photoFileName } from '@/logic/photo';

/**
 * この層が必要とするファイル操作（SPEC-V5 §1.3）。expo-file-system の
 * `File` / `Directory` / `Paths` から、使うものだけを切り出した形。
 *
 * すべて**同期**にしてあるのは、expo-file-system の新 API（SDK 54 以降）が
 * `delete()` / `copySync()` / `exists` を同期で持っているため。repository（同期）から
 * そのまま呼べる。
 */
export type PhotoFileSystem = {
  /** 写真を置くディレクトリの URI（末尾のスラッシュは含めない） */
  directoryUri: string;
  /** ディレクトリを作る。既にあれば何もしない（idempotent） */
  ensureDirectory: () => void;
  /** `from` の中身を `to` へ複製する。`to` に既にファイルがあれば置き換える */
  copy: (from: string, to: string) => void;
  /** ファイルを消す。無ければ何もしない（消し直しで落ちない） */
  remove: (uri: string) => void;
};

export type PhotoStore = {
  /**
   * 縮小済みの画像（多くは一時ディレクトリにある）を写真置き場へ複製し、
   * 保存したファイル名を返す。**DB に入るのはこの戻り値**（SPEC-V5 §1.3）。
   */
  save: (sourceUri: string) => string;
  /** ファイル名を指定して消す（記録の削除・写真の差し替え。SPEC-V5 §1.5） */
  remove: (fileName: string) => void;
  /** ファイル名 → 表示に使う URI。null / 空文字はそのまま null（列が NULL 許容なので） */
  uri: (fileName: string | null | undefined) => string | null;
};

/**
 * 写真置き場を作る。
 *
 * @param fs         ファイル操作（アプリ本体は expoPhotoFiles.ts が渡す）
 * @param generateId 保存名に使う id。記録の id は使わない（logic/photo.photoFileName の理由）
 */
export function createPhotoStore(
  fs: PhotoFileSystem,
  deps: { generateId: () => string },
): PhotoStore {
  function uriFor(fileName: string): string {
    return `${fs.directoryUri}/${fileName}`;
  }

  return {
    save(sourceUri: string): string {
      // 初回の保存までディレクトリは作らない（写真を 1 枚も使わない人に空の階層を作らない）
      fs.ensureDirectory();
      const fileName = photoFileName(deps.generateId());
      fs.copy(sourceUri, uriFor(fileName));
      return fileName;
    },

    remove(fileName: string): void {
      // 空文字で消しに行くとディレクトリごと消しかねないので手前で弾く
      if (fileName === '') return;
      fs.remove(uriFor(fileName));
    },

    uri(fileName: string | null | undefined): string | null {
      if (fileName == null || fileName === '') return null;
      return uriFor(fileName);
    },
  };
}

/** ディレクトリ名を組み立てる側（expoPhotoFiles.ts）と共有する */
export const PHOTO_DIRECTORY_NAME = PHOTO_DIR_NAME;
