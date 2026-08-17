// 表示言語の決まり方の検証。
// defaultRecordKind.test.ts と同じ方針で、フォールバック規則を native なしで押さえる。

import { describe, expect, it } from 'vitest';

import {
  FALLBACK_LANGUAGE,
  FALLBACK_LOCALE,
  normalizeLanguage,
  resolveLocale,
} from './language';

describe('保存された設定値の正規化', () => {
  it('既定は「システムに従う」', () => {
    expect(FALLBACK_LANGUAGE).toBe('system');
  });

  it('保存済みの 3 択はそのまま読める', () => {
    expect(normalizeLanguage('system')).toBe('system');
    expect(normalizeLanguage('ja')).toBe('ja');
    expect(normalizeLanguage('en')).toBe('en');
  });

  it('未設定（null / undefined）は既定値', () => {
    expect(normalizeLanguage(null)).toBe('system');
    expect(normalizeLanguage(undefined)).toBe('system');
  });

  it('想定外の文字列は既定値に倒す', () => {
    expect(normalizeLanguage('')).toBe('system');
    expect(normalizeLanguage('fr')).toBe('system');
    expect(normalizeLanguage('JA')).toBe('system');
    expect(normalizeLanguage('ja-JP')).toBe('system');
  });
});

describe('表示する言語の解決', () => {
  it('明示的に選ばれていれば端末の言語は見ない', () => {
    expect(resolveLocale('ja', ['en-US'])).toBe('ja');
    expect(resolveLocale('en', ['ja-JP'])).toBe('en');
  });

  it('「システムに従う」で端末が日本語なら日本語', () => {
    expect(resolveLocale('system', ['ja'])).toBe('ja');
    expect(resolveLocale('system', ['ja-JP'])).toBe('ja');
  });

  it('「システムに従う」で端末が日本語以外なら英語', () => {
    expect(resolveLocale('system', ['en-US'])).toBe('en');
    expect(resolveLocale('system', ['fr-FR'])).toBe('en');
    expect(resolveLocale('system', ['zh-Hans-CN'])).toBe('en');
  });

  it('対応している言語のうち、端末で優先度が高いほうを採る', () => {
    expect(resolveLocale('system', ['en-US', 'ja-JP'])).toBe('en');
    expect(resolveLocale('system', ['ja-JP', 'en-US'])).toBe('ja');
    // 出せない言語（フランス語）は飛ばして、次の日本語を拾う ── 3 番目の英語には落ちない
    expect(resolveLocale('system', ['fr-FR', 'ja-JP', 'en-US'])).toBe('ja');
  });

  it('端末の言語が空・不明なら英語に倒す', () => {
    expect(resolveLocale('system', [])).toBe('en');
    expect(resolveLocale('system', [null, undefined])).toBe('en');
    expect(FALLBACK_LOCALE).toBe('en');
  });
});
