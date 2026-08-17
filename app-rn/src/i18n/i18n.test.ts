// 多言語化の器の検証（ステップ 1）。
//
// **ここで見るのは仕組みが動くことだけ**で、訳文の良し悪しは見ない ──
// 文言そのものは labels.test.ts が日本語側で押さえている。
// 言語を切り替えるので、vitest がテストファイルごとにモジュールを作り直すこと
// （既定の isolate）に依存している。他のファイルへは漏れない。

import { afterEach, describe, expect, it } from 'vitest';

import { setI18nLocale, t, tJa } from './index';
import { ja } from './ja';

// 既定（日本語）に戻してから次のテストへ渡す
afterEach(() => setI18nLocale('ja'));

describe('辞書の引き分け', () => {
  it('言語を切り替えると同じキーで別の文が返る', () => {
    setI18nLocale('ja');
    expect(t('settings.data.backup')).toBe('バックアップと復元');
    setI18nLocale('en');
    expect(t('settings.data.backup')).toBe('Back Up & Restore');
  });

  it('差し込みの値はどちらの言語でも効く', () => {
    setI18nLocale('ja');
    expect(t('settings.version', { version: '1.0.0' })).toBe('バージョン 1.0.0');
    setI18nLocale('en');
    expect(t('settings.version', { version: '1.0.0' })).toBe('Version 1.0.0');
  });

  it('英語だけ件数が単複で変わる（日本語は変わらない）', () => {
    setI18nLocale('ja');
    expect(t('common.count', { count: 0 })).toBe('0件');
    expect(t('common.count', { count: 1 })).toBe('1件');
    expect(t('common.count', { count: 2 })).toBe('2件');

    setI18nLocale('en');
    // 0 件のときに 'zero' を持っていないので 'other' に落ちる（i18n-js の既定の探し方）
    expect(t('common.count', { count: 0 })).toBe('0 items');
    expect(t('common.count', { count: 1 })).toBe('1 item');
    expect(t('common.count', { count: 2 })).toBe('2 items');
  });

  it('tJa は表示中の言語に関わらず日本語を返す（移行前の定数用）', () => {
    setI18nLocale('en');
    expect(t('common.tag')).toBe('Tags');
    expect(tJa('common.tag')).toBe('タグ');
  });

  it('翻訳の見つからないキーは目印付きで返る（訳し漏れが画面で分かる）', () => {
    setI18nLocale('en');
    // @ts-expect-error 辞書に無いキーは型で弾かれる。実行時の振る舞いだけをここで見る
    expect(t('settings.nope')).toContain('missing');
  });
});

describe('日本語と英語で語の共有関係が保たれている', () => {
  it('設定タブ「記録」群の見出しはタブ名と同じ語をひく', () => {
    // labels.ts の recordSettingsSectionTitle() が tabs.records をひいている前提。
    // 別々のキーに割ると、片方だけ訳し替えたときに語が食い違う
    for (const locale of ['ja', 'en'] as const) {
      setI18nLocale(locale);
      expect(t('tabs.records')).toBe(t('tabs.records'));
    }
    setI18nLocale('en');
    expect(t('tabs.records')).toBe('Records');
  });

  it('プリセットとタグの「まだ登録がありません」は同じキー', () => {
    setI18nLocale('en');
    expect(t('common.notRegistered')).toBe('Nothing saved yet');
  });
});

describe('辞書の形', () => {
  it('英語は日本語と同じキーをすべて持つ', async () => {
    // 型（en: Translations）でも担保されているが、実行時にも見ておく ──
    // 型は any を経由すると素通りしてしまうため
    const { en } = await import('./en');
    expect(dottedKeys(en)).toEqual(dottedKeys(ja));
  });
});

/** ネストした辞書を 'settings.help.label' の並びに畳む（キーの照合用） */
function dottedKeys(dict: object, prefix = ''): string[] {
  return Object.entries(dict)
    .flatMap(([key, value]) =>
      typeof value === 'string' ? `${prefix}${key}` : dottedKeys(value, `${prefix}${key}.`),
    )
    .sort();
}
