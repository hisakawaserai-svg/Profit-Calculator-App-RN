// アプリ内レビュー依頼の判定（docs/DESIGN-REVIEW-PROMPT.md）の全条件。
//
// このファイルが条件の唯一の検証場所になる ── 実機では試し切れないため（reviewPrompt.ts 冒頭）。
// 9 本の条件（発火点 2 / 赤字の除外 1 / ゲート 5 / 通算上限 1）を、
// 「1 つだけ外して不成立になること」の形で 1 本ずつ確かめる。

import { describe, expect, it } from 'vitest';

import {
  decideReviewPrompt,
  MAX_REVIEW_REQUEST_COUNT,
  MIN_DAYS_BETWEEN_REQUESTS,
  MIN_DAYS_SINCE_FIRST_LAUNCH,
  MIN_LAUNCH_COUNT,
  MIN_SOLD_RECORD_COUNT,
  passesReviewGates,
  reviewPromptOccasion,
  type ReviewPromptState,
  type SaveOutcome,
} from './reviewPrompt';

const DAY_MS = 86_400_000;

/** 判定の基準時刻。実時間に依存させない（時計が動いてもテストが揺れない） */
const NOW = Date.UTC(2026, 7, 28, 12, 0, 0);

function daysAgo(days: number): number {
  return NOW - days * DAY_MS;
}

/** ゲートを**ちょうど全部満たす**状態。各テストはここから 1 つだけ崩す */
function passingState(overrides: Partial<ReviewPromptState> = {}): ReviewPromptState {
  return {
    launchCount: MIN_LAUNCH_COUNT,
    firstLaunchAt: daysAgo(MIN_DAYS_SINCE_FIRST_LAUNCH),
    lastRequestedAt: null,
    requestCount: 0,
    soldRecordCount: MIN_SOLD_RECORD_COUNT,
    ...overrides,
  };
}

/** 実績を獲得した保存（第一の発火点） */
const ACHIEVEMENT_SAVE: SaveOutcome = { newlyCompletedCount: 1, netProfit: 1200 };
/** 実績は出なかったが黒字だった保存（第二の発火点） */
const PROFITABLE_SAVE: SaveOutcome = { newlyCompletedCount: 0, netProfit: 1200 };

describe('発火点（reviewPromptOccasion）', () => {
  it('実績を新規獲得したら第一の発火点', () => {
    expect(reviewPromptOccasion(ACHIEVEMENT_SAVE)).toBe('achievement');
  });

  it('実績が出なくても黒字の記録なら第二の発火点', () => {
    expect(reviewPromptOccasion(PROFITABLE_SAVE)).toBe('profitable-record');
  });

  it('純利益ちょうど 0 は黒字側に入れる（売れて収支が合った記録）', () => {
    expect(reviewPromptOccasion({ newlyCompletedCount: 0, netProfit: 0 })).toBe(
      'profitable-record',
    );
  });

  it('赤字の記録は発火点にしない', () => {
    expect(reviewPromptOccasion({ newlyCompletedCount: 0, netProfit: -1 })).toBe(null);
  });

  it('**赤字なら実績を獲得していても発火点にしない**（利益を条件にしない実績があるため）', () => {
    expect(reviewPromptOccasion({ newlyCompletedCount: 2, netProfit: -500 })).toBe(null);
  });

  it('出品中（純利益がまだ無い）は、実績が出たときだけ発火点になる', () => {
    expect(reviewPromptOccasion({ newlyCompletedCount: 1, netProfit: null })).toBe('achievement');
    expect(reviewPromptOccasion({ newlyCompletedCount: 0, netProfit: null })).toBe(null);
  });
});

describe('ゲート（passesReviewGates）', () => {
  it('全部満たしていれば通る', () => {
    expect(passesReviewGates(passingState(), NOW)).toBe(true);
  });

  it('起動回数が 1 回でも足りなければ通らない', () => {
    expect(passesReviewGates(passingState({ launchCount: MIN_LAUNCH_COUNT - 1 }), NOW)).toBe(false);
  });

  it('初回起動からの経過が足りなければ通らない', () => {
    const justShort = daysAgo(MIN_DAYS_SINCE_FIRST_LAUNCH) + 1;
    expect(passesReviewGates(passingState({ firstLaunchAt: justShort }), NOW)).toBe(false);
  });

  it('初回起動を記録していなければ通らない（測れない＝満たせない）', () => {
    expect(passesReviewGates(passingState({ firstLaunchAt: null }), NOW)).toBe(false);
  });

  it('売れた記録が 1 件でも足りなければ通らない', () => {
    expect(
      passesReviewGates(passingState({ soldRecordCount: MIN_SOLD_RECORD_COUNT - 1 }), NOW),
    ).toBe(false);
  });

  it('前回頼んでからの間隔が足りなければ通らない', () => {
    const justShort = daysAgo(MIN_DAYS_BETWEEN_REQUESTS) + 1;
    expect(passesReviewGates(passingState({ lastRequestedAt: justShort, requestCount: 1 }), NOW)).toBe(
      false,
    );
  });

  it('間隔がちょうど空けば通る', () => {
    const exactly = daysAgo(MIN_DAYS_BETWEEN_REQUESTS);
    expect(passesReviewGates(passingState({ lastRequestedAt: exactly, requestCount: 1 }), NOW)).toBe(
      true,
    );
  });

  it('通算の上限に達していれば、どれだけ間隔が空いていても通らない', () => {
    expect(
      passesReviewGates(
        passingState({ requestCount: MAX_REVIEW_REQUEST_COUNT, lastRequestedAt: daysAgo(3650) }),
        NOW,
      ),
    ).toBe(false);
  });

  it('上限の 1 つ手前なら通る', () => {
    expect(
      passesReviewGates(
        passingState({
          requestCount: MAX_REVIEW_REQUEST_COUNT - 1,
          lastRequestedAt: daysAgo(MIN_DAYS_BETWEEN_REQUESTS),
        }),
        NOW,
      ),
    ).toBe(true);
  });

  it('時計が巻き戻っていたら通らない（迷ったら出さない側）', () => {
    // 初回起動が「未来」になっている端末
    expect(passesReviewGates(passingState({ firstLaunchAt: NOW + DAY_MS }), NOW)).toBe(false);
    // 前回頼んだのが「未来」になっている端末
    expect(
      passesReviewGates(passingState({ lastRequestedAt: NOW + DAY_MS, requestCount: 1 }), NOW),
    ).toBe(false);
  });
});

describe('発火点とゲートの両方（decideReviewPrompt）', () => {
  it('発火点でゲートも通れば、その発火点を返す', () => {
    expect(decideReviewPrompt(ACHIEVEMENT_SAVE, passingState(), NOW)).toBe('achievement');
    expect(decideReviewPrompt(PROFITABLE_SAVE, passingState(), NOW)).toBe('profitable-record');
  });

  it('発火点でもゲートを通らなければ出さない', () => {
    expect(decideReviewPrompt(ACHIEVEMENT_SAVE, passingState({ launchCount: 1 }), NOW)).toBe(null);
  });

  it('ゲートを通っていても発火点でなければ出さない', () => {
    const loss: SaveOutcome = { newlyCompletedCount: 3, netProfit: -1 };
    expect(decideReviewPrompt(loss, passingState(), NOW)).toBe(null);
  });
});
