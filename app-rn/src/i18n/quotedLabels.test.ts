// 英語の本文が引いている「実物のラベル」との照合。
//
// **これも実際に取りこぼした箇所の回帰テスト。** 使いかた・チュートリアルの本文は
// 画面の語を「」で引きながら操作を説明する。日本語はラベルをそのまま引いて書けるが、
// 英語は本文を訳すときに引用まで訳し直してしまい、**画面に無い語**が残る ──
// 「いくらで売る？」の画面を英語の本文だけ “What should I sell it for?” と呼び続け、
// 実物のタイトルは 'What price?' だった（10 か所）。並び替えの「新しい順」も
// 本文が “Newest”、実物は 'Newest first' で、探しても見つからない語になっていた。
//
// 判定の筋道は「日本語を正とする」:
//
//   日本語の本文の 「」 引用 → その語と同じ値を持つ辞書キー → 同じキーの英語の値
//
// を引き、**英語の本文がその値を “” で引用しているか**を見る。日本語の本文が
// ラベルを引いている以上、英語の本文も同じ位置で同じラベルを引いているはずで、
// 引けていなければ訳文が実物から離れている。
//
// **辞書のオブジェクトをそのまま歩く**ので、あとからキーを足しても自動で対象に入る
// （ファイルの字面を読んでいた頃の検査と違い、書き方の揺れで漏れることがない）。

import { describe, expect, it } from 'vitest';

import { en } from './en';
import { ja } from './ja';

/** 辞書のネストを 'pricing.title' のような 1 段の表に畳む（値が文字列のものだけ） */
function flatten(dict: object, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(dict)) {
    const path = prefix === '' ? key : `${prefix}.${key}`;
    if (typeof value === 'string') out[path] = value;
    else if (value != null && typeof value === 'object') Object.assign(out, flatten(value, path));
  }
  return out;
}

const JA = flatten(ja);
const EN = flatten(en);

/** 本文（説明文）のキー。ここに書かれた「」がラベルを指しているかを見る */
const isProse = (key: string): boolean => key.startsWith('help.') || key.startsWith('onboarding.');

/** 表示語 → それを持つキー。「」で引かれた語から実物のキーを逆に引くための表 */
const KEYS_BY_JA_VALUE = new Map<string, string[]>();
for (const [key, value] of Object.entries(JA)) {
  if (isProse(key)) continue; // 本文どうしは引用の関係にならない
  KEYS_BY_JA_VALUE.set(value, [...(KEYS_BY_JA_VALUE.get(value) ?? []), key]);
}

/**
 * 照合から外す組み合わせ。**理由を書けるものだけ**をここに置く。
 *
 * どれも「日本語のラベルと、端末の OS のアプリ名がたまたま同じ語」という同じ形:
 * 本文の「写真」「ファイル」は iOS の Photos / Files アプリを指していて、
 * このアプリの `photo.field`（'Photo'）や `backup.diffFileHeader`（'File'）を
 * 引いているのではない。英語の本文は既に Photos / the Files app と正しく書けている。
 */
const EXEMPT: readonly { key: string; quote: string; why: string }[] = [
  { key: 'help.items.record-photo.body', quote: '写真', why: '端末の Photos アプリ' },
  { key: 'help.items.backup-create.body', quote: '写真', why: '端末の Photos アプリ' },
  { key: 'backup.photoLimitFooter', quote: '写真', why: '端末の Photos アプリ' },
  { key: 'help.items.backup-migrate.body', quote: 'ファイル', why: '端末の Files アプリ' },
  { key: 'help.items.export-share.body', quote: 'ファイル', why: '端末の Files アプリ' },
];

const isExempt = (key: string, quote: string): boolean =>
  EXEMPT.some((e) => e.key === key && e.quote === quote);

/** 本文の中の 「」 引用。差し込み値そのもの（「{{name}}」）は語ではないので外す */
function quotedInJapanese(text: string): string[] {
  const found = text.match(/「[^」]{2,40}」/g) ?? [];
  return [...new Set(found.map((q) => q.slice(1, -1)))].filter((q) => !q.includes('{{'));
}

/**
 * 1 つのキーについて、英語の本文が引きそこねている実物のラベルを挙げる。
 * 同じ語を複数のキーが持つことがある（「実績」など）ので、**どれか 1 つでも
 * 引けていればよい**とする。
 */
function missingQuotes(key: string): string[] {
  const japanese = JA[key];
  const english = EN[key];
  if (japanese == null || english == null) return [];

  const missing: string[] = [];
  for (const quote of quotedInJapanese(japanese)) {
    if (isExempt(key, quote)) continue;

    const labelKeys = (KEYS_BY_JA_VALUE.get(quote) ?? []).filter((k) => k !== key);
    const expected = labelKeys.map((k) => EN[k]).filter((v): v is string => v != null);
    if (expected.length === 0) continue; // 辞書のラベルではない語（例え話・一般語）

    if (!expected.some((label) => english.includes(`“${label}”`))) {
      missing.push(`ja「${quote}」(${labelKeys[0]}) の実物 “${expected[0]}” が英語の本文に無い`);
    }
  }
  return missing;
}

/** 「」で語を引いている日本語のキー。ここが検査の対象で、キーを足せば自動で増える */
const KEYS_WITH_QUOTES = Object.keys(JA)
  .filter((key) => EN[key] != null && quotedInJapanese(JA[key]).length > 0)
  .sort();

describe('英語の本文が、画面に実在するラベルを引いている', () => {
  it('検査の対象が空になっていない（辞書の畳み方が壊れたら気づけるように）', () => {
    expect(KEYS_WITH_QUOTES.length).toBeGreaterThan(50);
  });

  it.each(KEYS_WITH_QUOTES)('%s', (key) => {
    expect(missingQuotes(key)).toEqual([]);
  });
});

// 除外は増やすほど検査が緩む。**要らなくなった除外は落とす**ためのテスト ──
// 本文を書き換えて食い違いが消えたのに除外だけが残ると、次に同じ場所が
// ずれたときに黙って素通りする。
describe('EXEMPT に死んだ除外が残っていない', () => {
  it.each(EXEMPT)('$key の「$quote」（$why）', ({ key, quote }) => {
    expect(Object.keys(JA)).toContain(key);
    expect(quotedInJapanese(JA[key])).toContain(quote);
  });
});
