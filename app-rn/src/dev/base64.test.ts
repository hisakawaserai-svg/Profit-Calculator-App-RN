// src/dev/base64.ts の検証。Node には `Buffer` があるので、**正解を Buffer から作って**
// 突き合わせる ── 期待値を手で書くと、写経のずれをそのまま仕様にしてしまう。

import { describe, expect, it } from 'vitest';

import { decodeBase64 } from './base64';

function expected(text: string): Uint8Array {
  return new Uint8Array(Buffer.from(text, 'base64'));
}

describe('decodeBase64', () => {
  it('埋め文字の数（0 / 1 / 2 個）ごとに Buffer と一致する', () => {
    // 長さ 3n / 3n+1 / 3n+2 で埋め文字の数が変わる
    for (const source of ['abc', 'ab', 'a', '', 'hello world', 'うりつみ']) {
      const encoded = Buffer.from(source).toString('base64');
      expect(decodeBase64(encoded)).toEqual(expected(encoded));
    }
  });

  it('JPEG の先頭（0xFF 0xD8 0xFF）のようなバイト列も壊さない', () => {
    const bytes = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
    const encoded = Buffer.from(bytes).toString('base64');
    expect(decodeBase64(encoded)).toEqual(bytes);
  });

  it('0〜255 のすべてのバイトを往復できる', () => {
    const bytes = Uint8Array.from({ length: 256 }, (_, index) => index);
    expect(decodeBase64(Buffer.from(bytes).toString('base64'))).toEqual(bytes);
  });

  it('base64 に無い文字は落とす（壊れた入力を静かに通さない）', () => {
    expect(() => decodeBase64('ab*d')).toThrow();
    expect(() => decodeBase64('ab\ncd')).toThrow();
  });
});
