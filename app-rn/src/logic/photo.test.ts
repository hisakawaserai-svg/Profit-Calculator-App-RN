// SPEC-V5 §1.4（縮小の指定）・§1.3（保存名）・§1.5（片づけの対象）の検証。

import { describe, expect, it } from 'vitest';

import {
  PHOTO_EXTENSION,
  PHOTO_MAX_EDGE,
  orphanPhotoFiles,
  photoFileName,
  resizeTarget,
} from './photo';

describe('§1.4 resizeTarget: 長辺だけを上限に合わせる', () => {
  it('横長は幅を上限に合わせる（高さは比率で決まるので渡さない）', () => {
    expect(resizeTarget({ width: 4032, height: 3024 })).toEqual({ width: PHOTO_MAX_EDGE });
  });

  it('縦長は高さを上限に合わせる', () => {
    expect(resizeTarget({ width: 3024, height: 4032 })).toEqual({ height: PHOTO_MAX_EDGE });
  });

  it('正方形は幅で合わせる（どちらでも同じなので分岐を増やさない）', () => {
    expect(resizeTarget({ width: 2000, height: 2000 })).toEqual({ width: PHOTO_MAX_EDGE });
  });

  it('長辺が上限以下なら縮小しない（引き伸ばさない）', () => {
    expect(resizeTarget({ width: 800, height: 600 })).toBeNull();
    expect(resizeTarget({ width: 600, height: 800 })).toBeNull();
  });

  it('長辺がちょうど上限でも縮小しない（境界）', () => {
    expect(resizeTarget({ width: PHOTO_MAX_EDGE, height: 400 })).toBeNull();
  });

  it('長辺が上限を 1px でも超えたら縮小する（境界）', () => {
    expect(resizeTarget({ width: PHOTO_MAX_EDGE + 1, height: 400 })).toEqual({
      width: PHOTO_MAX_EDGE,
    });
  });

  it('大きさが取れなかった（0 以下）ときは縮小そのものを飛ばす', () => {
    expect(resizeTarget({ width: 0, height: 0 })).toBeNull();
    expect(resizeTarget({ width: -1, height: 2000 })).toBeNull();
  });

  it('上限は引数で変えられる（テストと将来の調整のため）', () => {
    expect(resizeTarget({ width: 900, height: 300 }, 500)).toEqual({ width: 500 });
  });
});

describe('§1.3 photoFileName: 保存名', () => {
  it('id に拡張子を付けるだけ（JPEG に揃える）', () => {
    expect(photoFileName('abc-123')).toBe(`abc-123${PHOTO_EXTENSION}`);
  });
});

describe('§1.5 orphanPhotoFiles: 使われなかった写真', () => {
  it('残す 1 枚以外が対象になる', () => {
    expect(orphanPhotoFiles(['a.jpg', 'b.jpg', 'c.jpg'], 'c.jpg')).toEqual(['a.jpg', 'b.jpg']);
  });

  it('残すものが無ければ（取り消し・写真を外した）全部が対象になる', () => {
    expect(orphanPhotoFiles(['a.jpg', 'b.jpg'], null)).toEqual(['a.jpg', 'b.jpg']);
  });

  it('1 枚も作っていなければ何も消さない', () => {
    expect(orphanPhotoFiles([], null)).toEqual([]);
    expect(orphanPhotoFiles([], 'saved.jpg')).toEqual([]);
  });

  it('保存済みの写真（作っていないもの）を残す指定でも、作ったものは消える', () => {
    // 編集で写真を選んだあと「削除」して保存した場合。保存済みの old.jpg を消すのは
    // repository の責務（§1.5）なので、ここには出てこない
    expect(orphanPhotoFiles(['new.jpg'], null)).toEqual(['new.jpg']);
  });

  it('同じ名前が二重に控えられていても 1 回しか出さない', () => {
    expect(orphanPhotoFiles(['a.jpg', 'a.jpg'], null)).toEqual(['a.jpg']);
  });
});
