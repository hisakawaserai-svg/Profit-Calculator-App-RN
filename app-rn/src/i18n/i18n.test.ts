// 多言語化の器の検証（ステップ 1）。
//
// **ここで見るのは仕組みが動くことだけ**で、訳文の良し悪しは見ない ──
// 文言そのものは labels.test.ts が日本語側で押さえている。

import { describe, expect, it } from 'vitest';

import { t } from './index';
import { ja } from './ja';

describe('辞書の引き分け', () => {
  it('同じキーでも locale が変われば別の文が返る', () => {
    expect(t('settings.data.backup', 'ja')).toBe('バックアップと復元');
    expect(t('settings.data.backup', 'en')).toBe('Back Up & Restore');
  });

  it('差し込みの値はどちらの言語でも効く', () => {
    expect(t('settings.version', 'ja', { version: '1.0.0' })).toBe('バージョン 1.0.0');
    expect(t('settings.version', 'en', { version: '1.0.0' })).toBe('Version 1.0.0');
  });

  it('英語だけ件数が単複で変わる（日本語は変わらない）', () => {
    expect(t('common.count', 'ja', { count: 0 })).toBe('0件');
    expect(t('common.count', 'ja', { count: 1 })).toBe('1件');
    expect(t('common.count', 'ja', { count: 2 })).toBe('2件');

    // 0 件のときに 'zero' を持っていないので 'other' に落ちる（i18n-js の既定の探し方）
    expect(t('common.count', 'en', { count: 0 })).toBe('0 items');
    expect(t('common.count', 'en', { count: 1 })).toBe('1 item');
    expect(t('common.count', 'en', { count: 2 })).toBe('2 items');
  });

  it('翻訳の見つからないキーは目印付きで返る（訳し漏れが画面で分かる）', () => {
    // @ts-expect-error 辞書に無いキーは型で弾かれる。実行時の振る舞いだけをここで見る
    expect(t('settings.nope', 'en')).toContain('missing');
  });

  it('引き方に順番の依存がない（呼ぶたびに locale だけで決まる）', () => {
    // t() がモジュールの可変状態を持っていたら、この並びで結果が変わってしまう。
    // React Compiler 対策で locale を引数にした結果、その心配がないことの確認
    const first = t('tabs.settings', 'en');
    t('tabs.settings', 'ja');
    expect(t('tabs.settings', 'en')).toBe(first);
  });
});

describe('日本語と英語で語の共有関係が保たれている', () => {
  it('設定タブ「記録」群の見出しはタブ名と同じキーをひく', () => {
    // labels.ts の recordSettingsSectionTitle() が tabs.records をひいている前提。
    // 別々のキーに割ると、片方だけ訳し替えたときに語が食い違う
    expect(t('tabs.records', 'en')).toBe('Records');
  });

  it('プリセットとタグの「まだ登録がありません」は同じキー', () => {
    expect(t('common.notRegistered', 'en')).toBe('Nothing saved yet');
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
