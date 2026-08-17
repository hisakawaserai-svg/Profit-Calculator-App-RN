// 初回起動チュートリアルの既読フラグのフォールバック規則。
// defaultRecordKind.test.ts と同じ考え方 ── 未設定・不正値は常に「まだ見ていない」に倒れる。

import { describe, expect, it } from 'vitest';

import { normalizeTutorialSeen } from './tutorialSeen';

describe('初回起動チュートリアルの既読フラグ', () => {
  it('保存済みの "1" は既読として読める', () => {
    expect(normalizeTutorialSeen('1')).toBe(true);
  });

  it('未設定（null / undefined）は未読', () => {
    expect(normalizeTutorialSeen(null)).toBe(false);
    expect(normalizeTutorialSeen(undefined)).toBe(false);
  });

  it('想定外の文字列は未読に倒す', () => {
    expect(normalizeTutorialSeen('')).toBe(false);
    expect(normalizeTutorialSeen('true')).toBe(false);
    expect(normalizeTutorialSeen('0')).toBe(false);
  });
});
