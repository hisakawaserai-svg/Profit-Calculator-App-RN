// 商品写真（SPEC-V5）の純粋関数。**端末に触る処理はここには置かない** ──
// ファイルの読み書きは src/media/photoFiles.ts、選択と縮小は src/media/photoPicker.ts。
//
// ここにあるのは「どれだけ縮めるか」「どんな名前で置くか」という決めごとだけで、
// 単体テストで確かめられる形にしてある（logic/listingDays.ts などと同じ扱い）。

/**
 * 保存する画像の長辺の上限（SPEC-V5 §1.4）。
 *
 * 使い道はサムネイル（56pt）と詳細（幅 338pt）の 2 つだけで、3 倍密度の端末でも
 * 338 × 3 = 1014px あれば足りる。カメラロールの原寸（数 MB・4000px 級）をそのまま
 * 置くと、1 件ごとに数 MB がドキュメントディレクトリへ積み上がる。
 */
export const PHOTO_MAX_EDGE = 1000;

/**
 * JPEG の圧縮品質（SPEC-V5 §1.4）。0.7 は「拡大しなければ劣化が見えない」あたりで、
 * 1000px 長辺と合わせて 1 枚おおむね 100〜300KB に収まる。
 *
 * 元が PNG でも JPEG に揃える ── 用途が写真（連続階調）なので、PNG のままだと
 * 透過も使わないのにファイルだけが数倍になる。
 */
export const PHOTO_JPEG_QUALITY = 0.7;

/** 保存先のディレクトリ名（ドキュメントディレクトリ直下。SPEC-V5 §1.3） */
export const PHOTO_DIR_NAME = 'photos';

/** 保存する画像の拡張子。品質と同じく JPEG に揃える */
export const PHOTO_EXTENSION = '.jpg';

export type PhotoSize = {
  width: number;
  height: number;
};

/**
 * 縮小の指定（SPEC-V5 §1.4）。**長辺だけを指定して縦横比は保つ。**
 *
 * expo-image-manipulator の `resize` は片方だけ渡すともう片方を比率から決めるので、
 * 長辺の側だけを返す。**長辺が上限以下なら `null`** ── 小さい画像を上限まで
 * 引き伸ばすと、容量だけ増えて画質は上がらない。
 *
 * 幅・高さが 0 以下（取得できなかった場合）も `null` を返して縮小そのものを飛ばす。
 * 比率が出せない値で resize すると、縦横のどちらかが 0 の画像を作りかねない。
 */
export function resizeTarget(
  size: PhotoSize,
  maxEdge: number = PHOTO_MAX_EDGE,
): { width: number } | { height: number } | null {
  const { width, height } = size;
  if (width <= 0 || height <= 0) return null;
  if (Math.max(width, height) <= maxEdge) return null;
  return width >= height ? { width: maxEdge } : { height: maxEdge };
}

/**
 * 保存するファイル名（SPEC-V5 §1.3）。**記録の id は使わず、写真ごとに新しい id を振る。**
 *
 * 記録 id を名前にすると、差し替えのたびに同じ名前へ上書きすることになり、
 * 画像のキャッシュ（expo-image は URI をキーにする）が古い写真を出し続ける。
 * 名前が毎回変われば、差し替えた瞬間に新しい URI になるので取り違えが起きない。
 */
export function photoFileName(id: string): string {
  return `${id}${PHOTO_EXTENSION}`;
}

/**
 * 保存済みの写真のうち、消してよいものを選ぶ（SPEC-V5 §1.5）。
 *
 * フォームは「選んだ瞬間にファイルを書き、保存の瞬間に列へ載せる」形なので、
 * 選び直し・取り消しのたびにどこからも指されないファイルが残る。
 * 開いている間に作ったファイル名の一覧（`created`）から、**最後まで残った 1 枚
 * （`keep`）以外**を消す対象として返す。
 *
 * `keep` が null（写真なしで保存した・写真を外した）なら作ったものは全部消える。
 * 保存済みの写真（`created` に入っていないもの）は対象にならない ── そちらを消すのは
 * repository の責務で、記録の列が実際に書き換わったときだけ消す（二重に消さない）。
 */
export function orphanPhotoFiles(created: readonly string[], keep: string | null): string[] {
  return [...new Set(created)].filter((fileName) => fileName !== keep);
}
