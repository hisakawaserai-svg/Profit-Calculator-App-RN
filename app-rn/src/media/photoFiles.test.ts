// SPEC-V5 §1.3 の写真置き場。**偽のファイルシステム**で動かして、
// 「置いた」「消した」「URI を組み立てた」が仕様どおりかを確かめる。
//
// 端末（expo-file-system）を使う実装は expoPhotoFiles.ts にあり、そちらは
// この PhotoFileSystem を実装しているだけ ── 分けてあるのは、
// 写真の消し忘れが目に見えない不具合だから（§1.5）。

import { beforeEach, describe, expect, it } from 'vitest';

import { PHOTO_EXTENSION } from '@/logic/photo';

import { createPhotoStore, type PhotoFileSystem, type PhotoStore } from './photoFiles';

/** 置かれたファイルの一覧を持つだけの偽物。中身は「どこから来たか」を控える */
function fakeFileSystem() {
  const files = new Map<string, string>();
  let created = 0;

  const fs: PhotoFileSystem = {
    directoryUri: 'file:///documents/photos',
    ensureDirectory() {
      created += 1;
    },
    copy(from, to) {
      files.set(to, from);
    },
    remove(uri) {
      files.delete(uri);
    },
    removeAll() {
      files.clear();
    },
    list() {
      // 偽物では「どこから来たか」を中身として持っているので、その長さを大きさに見立てる
      return [...files].map(([uri, from]) => ({
        name: uri.slice(uri.lastIndexOf('/') + 1),
        size: from.length,
      }));
    },
    write(uri, bytes) {
      files.set(uri, `bytes:${bytes.length}`);
    },
    read(uri) {
      return new Uint8Array((files.get(uri) ?? '').length);
    },
  };

  return { fs, files, createdCount: () => created };
}

describe('§1.3 createPhotoStore', () => {
  let fake: ReturnType<typeof fakeFileSystem>;
  let store: PhotoStore;
  let nextId: number;

  beforeEach(() => {
    fake = fakeFileSystem();
    nextId = 0;
    store = createPhotoStore(fake.fs, {
      generateId: () => {
        nextId += 1;
        return `id${nextId}`;
      },
    });
  });

  it('save は写真置き場へ複製し、ファイル名を返す', () => {
    const fileName = store.save('file:///cache/tmp-1.jpg');

    expect(fileName).toBe(`id1${PHOTO_EXTENSION}`);
    expect(fake.files.get(`file:///documents/photos/id1${PHOTO_EXTENSION}`)).toBe(
      'file:///cache/tmp-1.jpg',
    );
  });

  it('保存のたびに新しい名前が付く（差し替えても URI が変わる。§1.3）', () => {
    expect(store.save('file:///cache/a.jpg')).not.toBe(store.save('file:///cache/b.jpg'));
    expect(fake.files.size).toBe(2);
  });

  it('保存の前にディレクトリを用意する（初回だけ作られるのは実装側の責務）', () => {
    store.save('file:///cache/a.jpg');

    expect(fake.createdCount()).toBe(1);
  });

  it('remove はファイル名から URI を組み立てて消す', () => {
    const fileName = store.save('file:///cache/a.jpg');

    store.remove(fileName);

    expect(fake.files.size).toBe(0);
  });

  it('無いファイルを消しても落ちない（二度押し・記録の削除の後）', () => {
    expect(() => store.remove('missing.jpg')).not.toThrow();
  });

  it('空文字では消しに行かない（ディレクトリごと消しかねないため）', () => {
    store.save('file:///cache/a.jpg');

    store.remove('');

    expect(fake.files.size).toBe(1);
  });

  it('uri はファイル名を置き場の URI に繋ぐ', () => {
    expect(store.uri('a.jpg')).toBe('file:///documents/photos/a.jpg');
  });

  it('写真なし（null・空文字）は URI にしない', () => {
    expect(store.uri(null)).toBeNull();
    expect(store.uri(undefined)).toBeNull();
    expect(store.uri('')).toBeNull();
  });

  // SPEC-V8 §4.2: 復元は記録を全置換するので、消す対象を DB から引けない。
  // 「残っているものを全部」という指定はこの口でしかできない。
  it('removeAll は保存済みの写真をすべて消す（復元。SPEC-V8 §4.2）', () => {
    store.save('file:///cache/a.jpg');
    store.save('file:///cache/b.jpg');

    store.removeAll();

    expect(fake.files.size).toBe(0);
  });

  it('1 枚も無い状態で removeAll しても落ちない', () => {
    expect(() => store.removeAll()).not.toThrow();
  });

  // SPEC-V8 §4.4: 合計サイズは実体を読まずに出す（読むとメモリを食い、上限の意味が消える）
  it('list は名前と大きさを返す（バックアップ画面の「N枚・NMB」）', () => {
    store.save('file:///cache/a.jpg');
    store.save('file:///cache/bb.jpg');

    const listed = store.list();

    expect(listed).toHaveLength(2);
    expect(listed.map((p) => p.name).sort()).toEqual([`id1${PHOTO_EXTENSION}`, `id2${PHOTO_EXTENSION}`]);
    expect(listed.every((p) => p.size > 0)).toBe(true);
  });

  it('1 枚も無ければ list は空（合計 0 バイト）', () => {
    expect(store.list()).toEqual([]);
  });

  // SPEC-V8 §4.5: 復元は ZIP から取り出したバイト列を置き場へ書く
  it('write は写真置き場へ書き込む', () => {
    store.write('restored.jpg', new Uint8Array(123));

    expect(fake.files.get('file:///documents/photos/restored.jpg')).toBe('bytes:123');
  });

  it('空のファイル名では書き込まない（壊れた URI を作らない）', () => {
    store.write('', new Uint8Array(1));

    expect(fake.files.size).toBe(0);
  });
});
