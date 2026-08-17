// 同意フローは「時間」と「順番」でしか壊れない ── 同意が返ってこない・二重に初期化される・
// 打ち切ったのに広告が出ない。どれも画面を見ても分からないので、ここで固定する。
//
// 実際に起きた不具合が起点: gatherConsent がシミュレータで**いつまでも解決せず**、
// 広告リクエストが一度も発行されないままになっていた（それを失敗として検知できなかった）。

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createConsentFlow, type ConsentFlowDeps } from './consentFlow';

const TIMEOUT_MS = 5000;

/** 呼ばれた回数と引数を控えるだけの偽物。同意の取得結果と canRequestAds は差し替えられる */
function fakeDeps(overrides: Partial<ConsentFlowDeps> = {}) {
  const initialized: boolean[] = [];
  const failures: unknown[] = [];
  let initializeCount = 0;

  const deps: ConsentFlowDeps = {
    gatherConsent: () => Promise.resolve(),
    getConsentInfo: () => Promise.resolve({ canRequestAds: true }),
    initializeSdk: () => {
      initializeCount += 1;
      return Promise.resolve();
    },
    onInitialized: (nonPersonalized) => initialized.push(nonPersonalized),
    onFailure: (error) => failures.push(error),
    timeoutMs: TIMEOUT_MS,
    ...overrides,
  };

  return {
    deps,
    initialized,
    failures,
    get initializeCount() {
      return initializeCount;
    },
  };
}

/** マイクロタスク（await の連なり）を進める。偽タイマーだけでは進まないため */
async function flush(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
}

describe('createConsentFlow', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('同意が取れたら、パーソナライズの指定なしで初期化する', async () => {
    const f = fakeDeps();

    createConsentFlow(f.deps).start();
    await flush();

    expect(f.initializeCount).toBe(1);
    expect(f.initialized).toEqual([false]);
    expect(f.failures).toEqual([]);
  });

  it('同意取得が返ってこなくても、上限を過ぎたら初期化まで進む', async () => {
    // 解決も失敗もしない ＝ シミュレータで再現した状態
    const f = fakeDeps({
      gatherConsent: () => new Promise(() => {}),
      // 同意が取れていないので canRequestAds は false のまま
      getConsentInfo: () => Promise.resolve({ canRequestAds: false }),
    });

    createConsentFlow(f.deps).start();
    await flush();

    // 上限までは動かない（同意フローが生きている間に広告を要求しない）
    expect(f.initializeCount).toBe(0);

    await vi.advanceTimersByTimeAsync(TIMEOUT_MS);

    expect(f.initializeCount).toBe(1);
    // 同意の状態が分からないので**非パーソナライズ**で出す
    expect(f.initialized).toEqual([true]);
    expect(f.failures).toHaveLength(1);
  });

  it('同意取得が失敗したときも初期化まで進む（非パーソナライズ）', async () => {
    const f = fakeDeps({
      gatherConsent: () => Promise.reject(new Error('ネットワークが切れている')),
      getConsentInfo: () => Promise.resolve({ canRequestAds: false }),
    });

    createConsentFlow(f.deps).start();
    await flush();

    expect(f.initializeCount).toBe(1);
    expect(f.initialized).toEqual([true]);
  });

  it('前回セッションで同意済みなら、同意フローの決着を待たずに初期化する', async () => {
    const f = fakeDeps({
      // フォームの往復が長引いている
      gatherConsent: () => new Promise((resolve) => setTimeout(resolve, 3000)),
      getConsentInfo: () => Promise.resolve({ canRequestAds: true }),
    });

    createConsentFlow(f.deps).start();
    await flush();

    // 3 秒待たずに出せている
    expect(f.initializeCount).toBe(1);
    expect(f.initialized).toEqual([false]);
  });

  it('2 経路から来ても初期化は 1 回だけ', async () => {
    const f = fakeDeps({
      gatherConsent: () => new Promise((resolve) => setTimeout(resolve, 1000)),
      getConsentInfo: () => Promise.resolve({ canRequestAds: true }),
    });

    createConsentFlow(f.deps).start();
    await vi.advanceTimersByTimeAsync(2000);

    expect(f.initializeCount).toBe(1);
    expect(f.initialized).toEqual([false]);
  });

  it('同意が要るのにまだ取れていない間は、広告を要求しない', async () => {
    const f = fakeDeps({
      // 決着はするが、同意は得られていない（EEA でフォームを閉じられた等）
      gatherConsent: () => Promise.resolve(),
      getConsentInfo: () => Promise.resolve({ canRequestAds: false }),
    });

    createConsentFlow(f.deps).start();
    await vi.advanceTimersByTimeAsync(TIMEOUT_MS * 2);

    expect(f.initializeCount).toBe(0);
    expect(f.initialized).toEqual([]);
  });

  it('打ち切りのあと同意が取れるようになれば、作り直した手順で普通に初期化する（諦めたまま固定しない）', async () => {
    let canRequestAds = false;
    const deps: Partial<ConsentFlowDeps> = {
      gatherConsent: () => new Promise(() => {}),
      getConsentInfo: () => Promise.resolve({ canRequestAds }),
    };

    // 1 回目の起動: 打ち切って非パーソナライズで出す
    const first = fakeDeps(deps);
    createConsentFlow(first.deps).start();
    await vi.advanceTimersByTimeAsync(TIMEOUT_MS);
    expect(first.initialized).toEqual([true]);

    // 2 回目の起動: 同意が取れている状態。**新しい手順**なので番人も鎖も持ち越さない
    canRequestAds = true;
    const second = fakeDeps({
      ...deps,
      getConsentInfo: () => Promise.resolve({ canRequestAds }),
    });
    createConsentFlow(second.deps).start();
    await flush();

    expect(second.initializeCount).toBe(1);
    expect(second.initialized).toEqual([false]);
  });

  it('初期化そのものが失敗しても投げない（広告が出ないだけ）', async () => {
    const f = fakeDeps({
      initializeSdk: () => Promise.reject(new Error('SDK の初期化に失敗')),
    });

    createConsentFlow(f.deps).start();
    await flush();

    expect(f.initialized).toEqual([]);
    expect(f.failures).toHaveLength(1);
  });
});
