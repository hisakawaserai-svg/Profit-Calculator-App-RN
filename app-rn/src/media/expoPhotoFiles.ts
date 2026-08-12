// photoFiles.ts の `PhotoFileSystem` を expo-file-system で実装したもの（SPEC-V5 §1.3）。
//
// **端末に触るのはこのファイルだけ。** ここを差し替えれば同じ振る舞いをテストの偽物で
// 再現できる、という分け方にしてある（写真の消し忘れは目に見えないので、
// 端末なしで確かめられる形を保つ）。
//
// expo-file-system は SDK 54 以降の新 API（`File` / `Directory` / `Paths`）を使う。
// 旧 API（`FileSystem.documentDirectory` / `deleteAsync`）は `expo-file-system/legacy` に
// 移っており、新規に足す口で使う理由がない。

import { randomUUID } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';

import { createPhotoStore, PHOTO_DIRECTORY_NAME, type PhotoFileSystem } from './photoFiles';

/**
 * 写真の置き場。**ドキュメントディレクトリ配下**（SPEC-V5 §1.3）──
 * キャッシュディレクトリ（`Paths.cache`）は端末の空きが減ると OS に消されるので、
 * 記録から参照するものを置けない。カメラロールには書き戻さない（§1.3）。
 */
const photoDirectory = new Directory(Paths.document, PHOTO_DIRECTORY_NAME);

/** `Directory.uri` は末尾に "/" が付く。連結は photoFiles.ts が "/" を挟むので、ここで落とす */
const directoryUri = photoDirectory.uri.replace(/\/+$/, '');

const fileSystem: PhotoFileSystem = {
  directoryUri,

  ensureDirectory() {
    // idempotent: 併存する経路（保存と保存が続けて走る）で二重に作っても落ちない
    photoDirectory.create({ intermediates: true, idempotent: true });
  },

  copy(from: string, to: string) {
    const destination = new File(to);
    // 名前は毎回新しい UUID なので通常は起こらないが、既にあれば置き換える
    // （copySync は既存の宛先があると overwrite なしでは失敗する）
    if (destination.exists) destination.delete();
    new File(from).copySync(destination);
  },

  remove(uri: string) {
    const file = new File(uri);
    // 消し直し（記録の削除 → 取り消し → 再削除など）で落ちないよう、無ければ何もしない
    if (file.exists) file.delete();
  },
};

/**
 * アプリが使う唯一の写真置き場。DB の入口（db/client.ts）と画面の両方がここを見る。
 * ファイル名の採番は記録の id とは別（logic/photo.photoFileName の理由）。
 */
export const photoStore = createPhotoStore(fileSystem, { generateId: randomUUID });
