// レビュー依頼の履歴（kv-store）の値の検証テスト。
// lastBackupAt.test.ts と同じ考え方 ── kv-store は文字列 KV なので、
// 読めない値がそのまま判定に流れ込まないことがここの要件になる。
//
// **倒す先は常に「出さない側」**（reviewRequest.ts のコメント）。
// 壊れた値を拾ったときに、条件を満たしている側へ転ばせない。

import { describe, expect, it } from 'vitest';

import { normalizeCounter, normalizeEpochMs } from './reviewRequest';

describe('回数（起動回数・依頼した回数）', () => {
  it('保存した数字はそのまま読める', () => {
    expect(normalizeCounter('0')).toBe(0);
    expect(normalizeCounter('7')).toBe(7);
  });

  it('未設定は 0', () => {
    expect(normalizeCounter(null)).toBe(0);
    expect(normalizeCounter(undefined)).toBe(0);
  });

  it('数として読めない値は 0 に倒す', () => {
    expect(normalizeCounter('')).toBe(0);
    expect(normalizeCounter('5回')).toBe(0);
    expect(normalizeCounter('NaN')).toBe(0);
  });

  it('回数として書いた覚えのない形（負・小数）は 0 に倒す', () => {
    expect(normalizeCounter('-1')).toBe(0);
    expect(normalizeCounter('1.5')).toBe(0);
  });
});

describe('日時（初回起動・前回頼んだ時刻）', () => {
  it('保存した epoch ms はそのまま読める', () => {
    const at = Date.UTC(2026, 7, 28, 12, 0, 0);
    expect(normalizeEpochMs(String(at))).toBe(at);
  });

  it('未設定は null', () => {
    expect(normalizeEpochMs(null)).toBe(null);
    expect(normalizeEpochMs(undefined)).toBe(null);
  });

  it('日時として読めない値は null', () => {
    expect(normalizeEpochMs('')).toBe(null);
    expect(normalizeEpochMs('2026-08-28')).toBe(null);
    expect(normalizeEpochMs('きのう')).toBe(null);
  });

  it('0 と負の数は弾く（この端末で起きたこととしてありえない）', () => {
    expect(normalizeEpochMs('0')).toBe(null);
    expect(normalizeEpochMs('-1')).toBe(null);
  });
});
