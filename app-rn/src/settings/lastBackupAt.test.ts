// 「前回作ったのは …」（案 53a）の値の検証テスト。
// kv-store は文字列 KV なので、読めない値が画面に出ないことがここの要件になる。

import { describe, expect, it } from 'vitest';

import { normalizeLastBackupAt } from './lastBackupAt';

describe('案 53a 前回作った日時', () => {
  it('保存した形（DB と同じ）はそのまま読める', () => {
    expect(normalizeLastBackupAt('2026-07-02T10:30:00.000')).toBe('2026-07-02T10:30:00.000');
  });

  it('まだ作っていなければ null', () => {
    expect(normalizeLastBackupAt(null)).toBe(null);
    expect(normalizeLastBackupAt(undefined)).toBe(null);
  });

  it('日付として読めない値は「無かったこと」にする', () => {
    expect(normalizeLastBackupAt('')).toBe(null);
    expect(normalizeLastBackupAt('2026-07-02')).toBe(null);
    expect(normalizeLastBackupAt('きのう')).toBe(null);
  });
});
