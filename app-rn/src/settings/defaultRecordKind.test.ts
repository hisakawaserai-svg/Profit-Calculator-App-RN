// SPEC-V2 §3.1 / §3.2 の検証テスト。
// kv-store は文字列 KV なので「不正値・未設定は既定値にフォールバックする」ことが仕様上の要件。

import { describe, expect, it } from 'vitest';

import { FALLBACK_RECORD_KIND, normalizeRecordKind } from './defaultRecordKind';

describe('§3.1 / §3.2 既定種別のフォールバック', () => {
  it('既定値は不用品（対象人数が多い側）', () => {
    expect(FALLBACK_RECORD_KIND).toBe('used');
  });

  it('保存済みの値はそのまま読める', () => {
    expect(normalizeRecordKind('used')).toBe('used');
    expect(normalizeRecordKind('sourced')).toBe('sourced');
  });

  it('未設定（null / undefined）は既定値', () => {
    expect(normalizeRecordKind(null)).toBe('used');
    expect(normalizeRecordKind(undefined)).toBe('used');
  });

  it('想定外の文字列は既定値に倒す', () => {
    expect(normalizeRecordKind('')).toBe('used');
    expect(normalizeRecordKind('gift')).toBe('used');
    expect(normalizeRecordKind('USED')).toBe('used');
  });
});
