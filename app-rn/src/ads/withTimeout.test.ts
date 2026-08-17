// withTimeout は「待ちに上限を付ける」だけの部品だが、**時間で分岐する**ので
// 目で見て確かめられない。偽タイマーで時間を進めて、境目の振る舞いを固定する。

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TimeoutError, withTimeout } from './withTimeout';

describe('withTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('上限までに解決すれば、その値をそのまま返す', async () => {
    const work = new Promise<string>((resolve) => setTimeout(() => resolve('ok'), 100));

    const result = withTimeout(work, 5000);
    await vi.advanceTimersByTimeAsync(100);

    await expect(result).resolves.toBe('ok');
  });

  it('上限を過ぎても解決しなければ TimeoutError で失敗する', async () => {
    // 解決も失敗もしない ＝ 同意リクエストが返ってこない状態
    const result = withTimeout(new Promise<never>(() => {}), 5000);
    // 待ち側が投げるので、誰も受けないと unhandled rejection になる。先に受け皿を作る
    const settled = result.catch((error: unknown) => error);

    await vi.advanceTimersByTimeAsync(5000);

    const error = await settled;
    expect(error).toBeInstanceOf(TimeoutError);
    expect((error as TimeoutError).timeoutMs).toBe(5000);
  });

  it('work 自身の失敗は、そのまま失敗として通す（TimeoutError にすり替えない）', async () => {
    const failure = new Error('ネットワークが切れている');
    const result = withTimeout(Promise.reject(failure), 5000);

    await expect(result).rejects.toBe(failure);
  });

  it('決着したらタイマーを落とす（時間ぶんのタイマーを残さない）', async () => {
    const result = withTimeout(Promise.resolve('ok'), 5000);
    await expect(result).resolves.toBe('ok');

    expect(vi.getTimerCount()).toBe(0);
  });

  it('work が失敗したときもタイマーを落とす', async () => {
    const result = withTimeout(Promise.reject(new Error('失敗')), 5000);
    await expect(result).rejects.toThrow('失敗');

    expect(vi.getTimerCount()).toBe(0);
  });

  it('上限ちょうどまでは待つ（1ms 手前では決着しない）', async () => {
    let settled = false;
    const result = withTimeout(new Promise<never>(() => {}), 5000);
    void result.catch(() => {
      settled = true;
    });

    await vi.advanceTimersByTimeAsync(4999);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toBe(true);
  });
});
