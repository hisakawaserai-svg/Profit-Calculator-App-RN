// 要求の間隔（60 秒）を守る時計。守れないと AdMob の推奨に反した頻度で要求が飛ぶので、
// 「経ったら 0 になる」「途中は残りが減る」「時計が巻き戻っても待ち続けない」を固定する。

import { beforeEach, describe, expect, it } from 'vitest';

import {
  adRequestCooldown,
  markAdRequested,
  MIN_AD_REQUEST_INTERVAL_MS,
  resetAdRequestInterval,
} from './requestInterval';

/** 時刻の基準。Date.now() を使わず、すべて引数で渡して固定する */
const T0 = 1_700_000_000_000;

describe('adRequestCooldown', () => {
  beforeEach(() => {
    resetAdRequestInterval();
  });

  it('一度も要求していなければ待たない', () => {
    expect(adRequestCooldown(T0)).toBe(0);
  });

  it('要求した直後は 60 秒まるごと待つ', () => {
    markAdRequested(T0);
    expect(adRequestCooldown(T0)).toBe(MIN_AD_REQUEST_INTERVAL_MS);
  });

  it('経った分だけ残りが減る', () => {
    markAdRequested(T0);
    expect(adRequestCooldown(T0 + 20_000)).toBe(40_000);
  });

  it('60 秒経てば待たない', () => {
    markAdRequested(T0);
    expect(adRequestCooldown(T0 + MIN_AD_REQUEST_INTERVAL_MS)).toBe(0);
  });

  it('60 秒より後も待たない（負にならない）', () => {
    markAdRequested(T0);
    expect(adRequestCooldown(T0 + MIN_AD_REQUEST_INTERVAL_MS + 5_000)).toBe(0);
  });

  it('要求し直すと待ち時間も引き直される', () => {
    markAdRequested(T0);
    markAdRequested(T0 + 30_000);
    expect(adRequestCooldown(T0 + 30_000)).toBe(MIN_AD_REQUEST_INTERVAL_MS);
  });

  it('時計が巻き戻ったら待たせない（待ち続けて広告が出なくなるのを避ける）', () => {
    markAdRequested(T0);
    expect(adRequestCooldown(T0 - 10_000)).toBe(0);
  });
});
