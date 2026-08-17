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
  /**
   * 置き場ごと空にする（SPEC-V8 §4.2 の復元）。無ければ何もしない。
   *
   * 1 枚ずつ消す口（`remove`）と分けてあるのは、**消す対象を DB から引けない**ため ──
   * 復元は記録を全置換するので、消したい写真を指している行はもう存在しない。
   * 「残っているファイルを全部」という指定の仕方がここでしかできない。
   */
  removeAll: () => void;
  /**
   * 保存済みの写真の**名前と大きさ**（SPEC-V8 §4.4）。
   *
   * **中身は読まない。** バックアップ画面は合計サイズを出すためだけにこれを呼ぶので、
   * ここで実体を読むと「表示するためにメモリを食う」ことになる ── 上限を設けた理由
   * （メモリ）と真っ向から矛盾する。`File.size` はメタデータだけを見る。
   */
  list: () => { name: string; size: number }[];
  /** 写真を書き込む（復元。SPEC-V8 §4.5）。既にあれば置き換える */
  write: (fileName: string, bytes: Uint8Array) => void;
  /** ファイル名 → 中身（バックアップの作成）。1 枚ずつ読む */
  read: (fileName: string) => Uint8Array;
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
  /**
   * 保存済みの写真をすべて消す（SPEC-V8 §4.2）。**復元のときだけ使う。**
   *
   * 復元は記録を全置換するので、消さないとどこからも指されない画像が
   * ドキュメントディレクトリに残り続ける。
   */
  removeAll: () => void;
  /**
   * 保存済みの写真の名前と大きさ（SPEC-V8 §4.4）。**中身は読まない**（上の理由）。
   * バックアップ画面の「53枚・8.2MB」と、上限の判定に使う。
   */
  list: () => { name: string; size: number }[];
  /** 写真を書き込む（復元。SPEC-V8 §4.5） */
  write: (fileName: string, bytes: Uint8Array) => void;
  /** 写真を読み込む（バックアップの作成）。**1 枚ずつ**呼ぶ */
  read: (fileName: string) => Uint8Array;
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

    removeAll(): void {
      fs.removeAll();
    },

    list(): { name: string; size: number }[] {
      return fs.list();
    },

    write(fileName: string, bytes: Uint8Array): void {
      // remove と同じ理由で空文字を弾く（壊れた URI を組み立てない）
      if (fileName === '') return;
      fs.write(uriFor(fileName), bytes);
    },

    read(fileName: string): Uint8Array {
      return fs.read(uriFor(fileName));
    },
  };
}

/** ディレクトリ名を組み立てる側（expoPhotoFiles.ts）と共有する */
export const PHOTO_DIRECTORY_NAME = PHOTO_DIR_NAME;
