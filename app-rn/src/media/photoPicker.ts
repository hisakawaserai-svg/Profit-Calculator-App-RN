// カメラロールから 1 枚選び、縮小して写真置き場に保存するまで（SPEC-V5 §1.4 / §3.2）。
//
// **カメラは起動しない**（SPEC-V5 §3.2 / 決定 §6-2）── 販売サイトにも載せる使い方を想定すると、
// 写真は先にカメラロールへ撮ってある。カメラを足すと権限（NSCameraUsageDescription）も
// 選択肢も増えるので、要るようになってから足す。
//
// 選んだ画像はそのままでは数 MB あるので、**保存する前に必ず縮小と再圧縮を通す**（§1.4）。
// 縮める量の判断は logic/photo.ts（純粋関数）、置き場は media/photoFiles.ts、
// ここはその 2 つと expo-image-picker を繋ぐだけ。

import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { PHOTO_JPEG_QUALITY, resizeTarget } from '@/logic/photo';

import { photoStore } from './expoPhotoFiles';

/**
 * 選択の結果（SPEC-V5 §3.2）。**失敗も含めて型で返す** ── 呼び出し側（フォーム）は
 * 「何も起きなかった」と「拒否された」を区別して出し分ける必要がある（§3.3）。
 */
export type PickPhotoResult =
  /** 保存まで済んだ。`fileName` をフォームの state に載せる（DB へ入るのは保存時） */
  | { status: 'picked'; fileName: string }
  /** 利用者がシートを閉じた。何も出さない */
  | { status: 'canceled' }
  /** 写真へのアクセスが許可されていない（§3.3 の説明を出す） */
  | { status: 'denied' }
  /** 縮小・保存に失敗した。原因は端末側なので「できなかった」までしか言えない */
  | { status: 'failed' };

/**
 * カメラロールから 1 枚選ぶ（§3.2）。
 *
 * `allowsMultipleSelection` は付けない ── 1 件 1 枚（§0.1）なので、複数選べる口を出すと
 * 選ばせた後に 1 枚へ落とすことになる。`allowsEditing`（正方形の切り抜き）も付けない ──
 * 一覧のサムネは正方形だが詳細は横長で、どちらか一方に合わせて切ると他方が破綻する。
 * 切り抜きは表示側（contentFit）の仕事にする。
 */
export async function pickPhoto(): Promise<PickPhotoResult> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return { status: 'denied' };

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    // 選択の時点でも一度落としておく（この後さらに縮小と再圧縮を通す）
    quality: PHOTO_JPEG_QUALITY,
    allowsMultipleSelection: false,
  });
  if (result.canceled) return { status: 'canceled' };

  const asset = result.assets?.[0];
  if (asset == null) return { status: 'failed' };

  try {
    return { status: 'picked', fileName: await storeResized(asset) };
  } catch {
    // 縮小も保存も端末側の事情でしか失敗しないので、ここで直せることはない
    return { status: 'failed' };
  }
}

/**
 * 縮小 → JPEG で書き出し → 写真置き場へ複製（§1.4）。
 *
 * `saveAsync` が書き出す先は**キャッシュディレクトリ**なので、そのままでは OS に消される。
 * ドキュメントディレクトリ配下へ複製するところまでが保存（§1.3）。
 */
async function storeResized(asset: ImagePicker.ImagePickerAsset): Promise<string> {
  const context = ImageManipulator.manipulate(asset.uri);
  // 長辺が上限以下ならそのまま（引き伸ばさない。resizeTarget が null を返す）
  const target = resizeTarget({ width: asset.width, height: asset.height });
  if (target != null) context.resize(target);

  const image = await context.renderAsync();
  const rendered = await image.saveAsync({
    format: SaveFormat.JPEG,
    compress: PHOTO_JPEG_QUALITY,
  });

  return photoStore.save(rendered.uri);
}
