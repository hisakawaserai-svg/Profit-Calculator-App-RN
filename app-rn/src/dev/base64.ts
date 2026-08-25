// base64 の文字列をバイト列に戻す（__DEV__ 専用）。
//
// **なぜ自前で書くのか。** 撮影用の商品写真は base64 の文字列としてバンドルに入っており
// （storeShotPhotos.ts）、写真置き場へ書く口（photoStore.write）が受け取るのは
// `Uint8Array` なので、どこかで戻す必要がある。ところが
//
//   * React Native / Hermes は `atob` を用意していない（`btoa` も無い）
//   * `Buffer` も Node の外には無い
//   * base64-js は react-native の推移的な依存でしかなく、直接 import すると
//     react-native の内部構成が変わった日に静かに壊れる
//
// 依存を足すには用途が細すぎるので、20 行ぶんをここに置く。**投入のときに 4 回しか
// 呼ばれない**ので、速さより「読めばすぐ分かること」を採っている。
//
// 本番ビルドには入らない（app/(tabs)/settings/index.tsx の require 参照）。

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** 文字 → 6 ビットの値。1 文字ずつ indexOf を引くより速く、表そのものが仕様になる */
const VALUES = new Map<string, number>([...ALPHABET].map((char, index) => [char, index]));

/**
 * base64 をバイト列に戻す。
 *
 * 4 文字（6 ビット × 4）が 3 バイトになる。末尾は `=` で埋められているので、
 * 埋めた数だけ最後のバイトを落とす。**改行や空白は受け付けない** ── 生成元
 * （gen_store_photos.py）が 1 行の文字列しか出さないので、受け入れると
 * 「壊れた入力が静かに通る」経路を作るだけになる。
 */
export function decodeBase64(text: string): Uint8Array {
  const padding = text.endsWith('==') ? 2 : text.endsWith('=') ? 1 : 0;
  const body = text.slice(0, text.length - padding);
  const bytes = new Uint8Array(Math.floor((body.length * 6) / 8));

  let buffer = 0;
  let bits = 0;
  let written = 0;
  for (const char of body) {
    const value = VALUES.get(char);
    if (value == null) throw new Error(`base64 に使えない文字: ${JSON.stringify(char)}`);
    buffer = (buffer << 6) | value;
    bits += 6;
    // 8 ビット貯まるごとに上位から 1 バイトずつ取り出す
    if (bits >= 8) {
      bits -= 8;
      bytes[written] = (buffer >> bits) & 0xff;
      written += 1;
    }
  }
  return bytes;
}
