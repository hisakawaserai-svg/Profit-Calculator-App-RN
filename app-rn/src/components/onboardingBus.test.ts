// achievementToastBus.ts と同じ「モジュール内 1 対 1 の購読」の配線だけを見るテスト。
// RN に依存しない純粋なモジュールなので vitest からそのまま読める。

import { afterEach, describe, expect, it, vi } from 'vitest';

import { registerOnboardingRequestListener, requestOnboarding } from './onboardingBus';

afterEach(() => {
  // 次のテストへ登録を持ち越さない
  registerOnboardingRequestListener(null);
});

describe('onboardingBus', () => {
  it('登録済みの受け手に要求を届ける', () => {
    const listener = vi.fn();
    registerOnboardingRequestListener(listener);

    requestOnboarding();

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('受け手が登録されていなければ何も起きない（例外にならない）', () => {
    expect(() => requestOnboarding()).not.toThrow();
  });

  it('null を登録すると受け手が外れる', () => {
    const listener = vi.fn();
    registerOnboardingRequestListener(listener);
    registerOnboardingRequestListener(null);

    requestOnboarding();

    expect(listener).not.toHaveBeenCalled();
  });
});
