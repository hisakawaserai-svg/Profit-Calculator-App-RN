// ベル・OS通知が共有する判定ロジック（logic/notifications.ts）の検証テスト。

import { describe, expect, it } from 'vitest';

import type { SaleRecord } from '@/db/schema';

import {
  alreadyLoggedToday,
  currentNotification,
  hasUnreadBell,
  isMonthlyReviewActive,
  limitUpcomingListingAlertGroups,
  listingAlertFireAt,
  listingAlertForOsTest,
  listingAlertGroupOnCalendarDay,
  listingAlertItems,
  nextMonthlyReviewFireAt,
  notYetNotifiedListingAlertItems,
  previousMonthKey,
  shouldScheduleMonthlyReview,
  upcomingListingAlertGroups,
} from './notifications';

const record = (partial: Partial<SaleRecord> = {}): SaleRecord => ({
  id: 'id-1',
  itemName: 'えんぴつ',
  kind: 'sourced',
  salesPrice: 1000,
  purchasePrice: 300,
  postage: 175,
  envelopeCost: 20,
  othersCost: 5,
  commission: 10,
  isSold: false,
  saleStartDate: '2026-07-01T09:00:00.000',
  saleDate: null,
  memo: '',
  siteName: '',
  photoFileName: null,
  shippingMaterialCost: 0,
  excludesShippingMaterial: false,
  targetProfit: null,
  listedAt: null,
  shippingName: '',
  priceChangedAt: null,
  ...partial,
});

const today = new Date('2026-07-15T00:00:00.000');

describe('listingAlertItems', () => {
  it('しきい値以上の記録を経過日数の降順で返す（>=、値下げ後は無しなら出品日基準）', () => {
    const items = listingAlertItems(
      [
        record({ id: 'a', saleStartDate: '2026-07-01T00:00:00.000' }), // 14日経過
        record({ id: 'b', saleStartDate: '2026-06-01T00:00:00.000' }), // 44日経過
        record({ id: 'c', saleStartDate: '2026-07-10T00:00:00.000' }), // 5日経過（しきい値未満）
      ],
      today,
      14,
      new Set(),
    );

    expect(items.map((item) => item.record.id)).toEqual(['b', 'a']);
  });

  it('値下げ済みの記録は saleStartDate ではなく priceChangedAt を基準にする', () => {
    const items = listingAlertItems(
      [record({ id: 'a', saleStartDate: '2026-01-01T00:00:00.000', priceChangedAt: '2026-07-10T00:00:00.000' })],
      today,
      14,
      new Set(),
    );

    // 出品日基準なら 195 日経過だが、値下げ日基準なので 5 日経過でしきい値未満 → 対象外
    expect(items).toEqual([]);
  });

  it('価格未設定の記録は対象から外す（シミュレータが使えない）', () => {
    const items = listingAlertItems(
      [record({ id: 'a', saleStartDate: '2026-07-01T00:00:00.000', salesPrice: 0 })],
      today,
      14,
      new Set(),
    );

    expect(items).toEqual([]);
  });

  it('赤字の記録は対象から外す', () => {
    const items = listingAlertItems(
      [record({ id: 'a', saleStartDate: '2026-07-01T00:00:00.000', salesPrice: 100 })],
      today,
      14,
      new Set(),
    );

    expect(items).toEqual([]);
  });

  it('目標未達の記録は対象から外す（黒字でも）', () => {
    const items = listingAlertItems(
      [record({ id: 'a', saleStartDate: '2026-07-01T00:00:00.000', salesPrice: 1000, targetProfit: 50000 })],
      today,
      14,
      new Set(),
    );

    expect(items).toEqual([]);
  });

  it('無視リストに入っている記録は対象から外す', () => {
    const items = listingAlertItems(
      [record({ id: 'a', saleStartDate: '2026-07-01T00:00:00.000' })],
      today,
      14,
      new Set(['a']),
    );

    expect(items).toEqual([]);
  });
});

describe('listingAlertFireAt / upcomingListingAlertGroups', () => {
  it('起点の暦日にしきい値を足した 9:00 が到達日', () => {
    const fireAt = listingAlertFireAt(new Date(2026, 6, 1, 23, 50, 0), 14);
    expect(fireAt).toEqual(new Date(2026, 6, 15, 9, 0, 0, 0));
  });

  it('値下げ日を起点にする', () => {
    const fireAt = listingAlertFireAt(new Date(2026, 6, 10, 0, 0, 0), 14);
    expect(fireAt).toEqual(new Date(2026, 6, 24, 9, 0, 0, 0));
  });

  it('まだ来ていない到達日だけを、同じ暦日なら 1 グループにまとめる', () => {
    const now = new Date(2026, 6, 10, 12, 0, 0);
    const groups = upcomingListingAlertGroups(
      [
        record({ id: 'soon', saleStartDate: '2026-07-01T00:00:00.000' }), // 7/15 到達
        record({ id: 'same-day', saleStartDate: '2026-07-01T18:00:00.000' }), // 同じ 7/15
        record({ id: 'later', saleStartDate: '2026-07-05T00:00:00.000' }), // 7/19 到達
        record({ id: 'past', saleStartDate: '2026-06-01T00:00:00.000' }), // もう過ぎている
      ],
      now,
      14,
      new Set(),
    );

    expect(groups.map((group) => group.items.map((item) => item.record.id))).toEqual([
      ['same-day', 'soon'],
      ['later'],
    ]);
    expect(groups[0]?.items[0]?.elapsedDays).toBe(14);
  });

  it('今が到達日の 9:00 ちょうど／過ぎていれば予約しない', () => {
    const fireMorning = new Date(2026, 6, 15, 9, 0, 0, 0);
    const after = new Date(2026, 6, 15, 10, 0, 0, 0);
    const records = [record({ id: 'a', saleStartDate: '2026-07-01T00:00:00.000' })];

    expect(upcomingListingAlertGroups(records, new Date(2026, 6, 15, 8, 59, 0), 14, new Set())).toHaveLength(1);
    expect(upcomingListingAlertGroups(records, fireMorning, 14, new Set())).toEqual([]);
    expect(upcomingListingAlertGroups(records, after, 14, new Set())).toEqual([]);
  });

  it('価格未設定は到達日が未来でも予約しない', () => {
    const groups = upcomingListingAlertGroups(
      [record({ id: 'a', saleStartDate: '2026-07-01T00:00:00.000', salesPrice: 0 })],
      new Date(2026, 6, 10, 12, 0, 0),
      14,
      new Set(),
    );
    expect(groups).toEqual([]);
  });

  it('赤字・目標未達は到達日が未来でも予約しない', () => {
    const now = new Date(2026, 6, 10, 12, 0, 0);
    expect(
      upcomingListingAlertGroups(
        [record({ id: 'loss', saleStartDate: '2026-07-01T00:00:00.000', salesPrice: 100 })],
        now,
        14,
        new Set(),
      ),
    ).toEqual([]);
    expect(
      upcomingListingAlertGroups(
        [record({ id: 'below', saleStartDate: '2026-07-01T00:00:00.000', salesPrice: 1000, targetProfit: 50000 })],
        now,
        14,
        new Set(),
      ),
    ).toEqual([]);
  });

  it('無視リストの記録は到達日が未来でも予約しない', () => {
    const groups = upcomingListingAlertGroups(
      [record({ id: 'a', saleStartDate: '2026-07-01T00:00:00.000' })],
      new Date(2026, 6, 10, 12, 0, 0),
      14,
      new Set(['a']),
    );
    expect(groups).toEqual([]);
  });

  it('値下げ日を起点に到達日を組む', () => {
    const groups = upcomingListingAlertGroups(
      [
        record({
          id: 'a',
          saleStartDate: '2026-01-01T00:00:00.000',
          priceChangedAt: '2026-07-10T00:00:00.000',
        }),
      ],
      new Date(2026, 6, 10, 12, 0, 0),
      14,
      new Set(),
    );

    expect(groups).toHaveLength(1);
    expect(groups[0]?.fireAt).toEqual(new Date(2026, 6, 24, 9, 0, 0, 0));
    expect(groups[0]?.items[0]?.basisDateKey).toBe('2026-07-10T00:00:00.000');
  });

  it('9:00 過ぎの到達日ちょうどは upcoming に出ないが、テストプレビューには出る', () => {
    const afterNine = new Date(2026, 6, 15, 10, 0, 0, 0);
    const records = [record({ id: 'a', saleStartDate: '2026-07-01T00:00:00.000' })];

    expect(upcomingListingAlertGroups(records, afterNine, 14, new Set())).toEqual([]);
    expect(listingAlertGroupOnCalendarDay(records, afterNine, 14, new Set())?.items.map((item) => item.record.id)).toEqual(
      ['a'],
    );
    expect(listingAlertForOsTest(records, afterNine, 14, new Set())?.items[0]?.record.id).toBe('a');
  });
});

describe('nextMonthlyReviewFireAt', () => {
  it('1 日 9:00 前なら当月、過ぎていれば翌月', () => {
    expect(nextMonthlyReviewFireAt(new Date(2026, 7, 1, 8, 0, 0))).toEqual(new Date(2026, 7, 1, 9, 0, 0, 0));
    expect(nextMonthlyReviewFireAt(new Date(2026, 7, 1, 10, 0, 0))).toEqual(new Date(2026, 8, 1, 9, 0, 0, 0));
    expect(nextMonthlyReviewFireAt(new Date(2026, 7, 15, 12, 0, 0))).toEqual(new Date(2026, 8, 1, 9, 0, 0, 0));
  });
});

describe('notYetNotifiedListingAlertItems', () => {
  it('履歴に無い記録は対象（OS通知する）', () => {
    const items = listingAlertItems(
      [record({ id: 'a', saleStartDate: '2026-07-01T00:00:00.000' })], // 14日経過
      today,
      14,
      new Set(),
    );

    expect(notYetNotifiedListingAlertItems(items, []).map((item) => item.record.id)).toEqual(['a']);
  });

  it('今の基準日になってから既に履歴に記録済みの記録は対象外（連日リピート防止）', () => {
    const items = listingAlertItems(
      [record({ id: 'a', saleStartDate: '2026-06-01T00:00:00.000' })], // 44日経過、ずっと値下げなし
      today,
      14,
      new Set(),
    );
    const history = [
      {
        kind: 'listingAlert' as const,
        recordId: 'a',
        occurredAt: '2026-06-15T09:00:00.000', // 基準日(6/1)以降に既に通知済み
      },
    ];

    expect(notYetNotifiedListingAlertItems(items, history)).toEqual([]);
  });

  it('月初で通知枠を月次振り返りに使われて1日ズレても、翌日は対象に持ち越される', () => {
    // 2026-08-01(月初)にちょうど14日到達 → その日は月次振り返り優先で通知できず、
    // 履歴には記録が残らない。翌 2026-08-02 に持ち越して評価する
    const items = listingAlertItems(
      [record({ id: 'a', saleStartDate: '2026-07-18T00:00:00.000' })], // 8/2時点で15日経過
      new Date('2026-08-02T00:00:00.000'),
      14,
      new Set(),
    );

    // 前日ぶんの履歴が無い（月初は通知できなかった）ので、まだ対象のまま
    expect(notYetNotifiedListingAlertItems(items, []).map((item) => item.record.id)).toEqual(['a']);
  });

  it('値下げして基準日が変われば、古い履歴があっても再び対象になる', () => {
    const items = listingAlertItems(
      [
        record({
          id: 'a',
          saleStartDate: '2026-01-01T00:00:00.000',
          priceChangedAt: '2026-07-01T00:00:00.000', // 新しい基準日
        }),
      ], // 14日経過（新基準）
      today,
      14,
      new Set(),
    );
    const history = [
      {
        kind: 'listingAlert' as const,
        recordId: 'a',
        occurredAt: '2026-02-01T09:00:00.000', // 古い基準（値下げ前）での通知履歴
      },
    ];

    expect(notYetNotifiedListingAlertItems(items, history).map((item) => item.record.id)).toEqual(['a']);
  });
});

describe('isMonthlyReviewActive / previousMonthKey', () => {
  it('月初1日だけ true', () => {
    expect(isMonthlyReviewActive(new Date('2026-08-01T09:00:00.000'))).toBe(true);
    expect(isMonthlyReviewActive(new Date('2026-08-02T09:00:00.000'))).toBe(false);
  });

  it('先月の月キーを返す', () => {
    expect(previousMonthKey(new Date('2026-08-01T00:00:00.000'))).toBe('2026-07');
    expect(previousMonthKey(new Date('2026-01-01T00:00:00.000'))).toBe('2025-12');
  });
});

describe('currentNotification', () => {
  it('月初は滞留アラートより月次振り返りを優先する', () => {
    const content = currentNotification(
      [record({ id: 'a', saleStartDate: '2026-07-01T00:00:00.000' })],
      new Date('2026-08-01T00:00:00.000'),
      14,
      new Set(),
      null,
      3,
    );

    expect(content).toEqual({ kind: 'monthlyReview', monthKey: '2026-07' });
  });

  it('月次振り返りを消していれば滞留アラート側に回る', () => {
    const content = currentNotification(
      [record({ id: 'a', saleStartDate: '2026-07-01T00:00:00.000' })],
      new Date('2026-08-01T00:00:00.000'),
      14,
      new Set(),
      '2026-07',
      3,
    );

    expect(content?.kind).toBe('listingAlert');
  });

  it('先月の記録が0件なら月次振り返りを出さず滞留アラート側に回る', () => {
    const content = currentNotification(
      [record({ id: 'a', saleStartDate: '2026-07-01T00:00:00.000' })],
      new Date('2026-08-01T00:00:00.000'),
      14,
      new Set(),
      null,
      0,
    );

    expect(content?.kind).toBe('listingAlert');
  });

  it('対象が無ければ null', () => {
    const content = currentNotification([], today, 14, new Set(), null, 0);
    expect(content).toBeNull();
  });

  it('月初以外は滞留があれば listingAlert', () => {
    const content = currentNotification(
      [record({ id: 'a', saleStartDate: '2026-07-01T00:00:00.000' })],
      today,
      14,
      new Set(),
      null,
      3,
    );

    expect(content?.kind).toBe('listingAlert');
    if (content?.kind === 'listingAlert') {
      expect(content.items.map((item) => item.record.id)).toEqual(['a']);
    }
  });

  it('月初でも振り返りを出さず滞留も無ければ null', () => {
    expect(
      currentNotification([], new Date('2026-08-01T00:00:00.000'), 14, new Set(), '2026-07', 3),
    ).toBeNull();
    expect(
      currentNotification([], new Date('2026-08-01T00:00:00.000'), 14, new Set(), null, 0),
    ).toBeNull();
  });
});

describe('hasUnreadBell', () => {
  const now = new Date('2026-08-15T12:00:00.000');

  it('滞留があるだけでは点灯しない（content 非 null 相当を履歴なしで再現）', () => {
    expect(hasUnreadBell('2026-08-14T12:00:00.000', now, false, [])).toBe(false);
    expect(hasUnreadBell(null, now, false, [])).toBe(false);
  });

  it('月初の生きた振り返りがあり、今日まだ開いていなければ点灯する', () => {
    expect(hasUnreadBell('2026-07-31T12:00:00.000', now, true, [])).toBe(true);
    expect(hasUnreadBell(null, now, true, [])).toBe(true);
  });

  it('月初の生きた振り返りでも、今日すでに開いていれば点灯しない', () => {
    expect(hasUnreadBell('2026-08-15T08:00:00.000', now, true, [])).toBe(false);
  });

  it('最後に開いたあとで履歴が増えていれば点灯する', () => {
    expect(
      hasUnreadBell('2026-08-15T08:00:00.000', now, false, [
        { occurredAt: '2026-08-15T09:00:00.000' },
      ]),
    ).toBe(true);
  });

  it('表示から消した履歴だけでは点灯しない', () => {
    expect(
      hasUnreadBell('2026-08-15T08:00:00.000', now, false, [
        { occurredAt: '2026-08-15T09:00:00.000', hidden: true },
      ]),
    ).toBe(false);
  });

  it('一度も開いていなくても履歴があれば点灯する', () => {
    expect(hasUnreadBell(null, now, false, [{ occurredAt: '2026-08-15T09:00:00.000' }])).toBe(true);
  });
});

describe('alreadyLoggedToday', () => {
  const target = { kind: 'listingAlert' as const, recordId: 'r1' };

  it('同じ日・同じ対象の履歴があれば true', () => {
    const history = [
      { kind: 'listingAlert' as const, recordId: 'r1', occurredAt: '2026-07-15T09:00:00.000' },
    ];
    expect(alreadyLoggedToday(history, target, new Date('2026-07-15T20:00:00.000'))).toBe(true);
  });

  it('別の記録の履歴は対象外', () => {
    const history = [
      { kind: 'listingAlert' as const, recordId: 'r2', occurredAt: '2026-07-15T09:00:00.000' },
    ];
    expect(alreadyLoggedToday(history, target, new Date('2026-07-15T20:00:00.000'))).toBe(false);
  });

  it('別の日の履歴は対象外', () => {
    const history = [
      { kind: 'listingAlert' as const, recordId: 'r1', occurredAt: '2026-07-14T09:00:00.000' },
    ];
    expect(alreadyLoggedToday(history, target, new Date('2026-07-15T09:00:00.000'))).toBe(false);
  });

  it('種類（listingAlert / monthlyReview）が違えば対象外', () => {
    const monthlyTarget = { kind: 'monthlyReview' as const, monthKey: '2026-06' };
    const history = [
      { kind: 'listingAlert' as const, recordId: 'r1', occurredAt: '2026-07-15T09:00:00.000' },
    ];
    expect(alreadyLoggedToday(history, monthlyTarget, new Date('2026-07-15T09:00:00.000'))).toBe(
      false,
    );
  });

  it('履歴が空なら false', () => {
    expect(alreadyLoggedToday([], target, today)).toBe(false);
  });

  it('同じ日・同じ月の振り返り履歴があれば true', () => {
    const monthlyTarget = { kind: 'monthlyReview' as const, monthKey: '2026-07' };
    const history = [
      { kind: 'monthlyReview' as const, monthKey: '2026-07', occurredAt: '2026-08-01T09:00:00.000' },
    ];
    expect(alreadyLoggedToday(history, monthlyTarget, new Date('2026-08-01T20:00:00.000'))).toBe(true);
  });
});

describe('shouldScheduleMonthlyReview', () => {
  it('消していない・先月に記録がある・まだ書いていなければ予約する', () => {
    expect(shouldScheduleMonthlyReview('2026-07', null, 3, false)).toBe(true);
  });

  it('消した月・0件・もう書いた日は予約しない', () => {
    expect(shouldScheduleMonthlyReview('2026-07', '2026-07', 3, false)).toBe(false);
    expect(shouldScheduleMonthlyReview('2026-07', null, 0, false)).toBe(false);
    expect(shouldScheduleMonthlyReview('2026-07', null, 3, true)).toBe(false);
  });
});

describe('limitUpcomingListingAlertGroups', () => {
  it('近い到達日から 60 件までに切る', () => {
    const now = new Date(2026, 0, 1, 12, 0, 0);
    const records = Array.from({ length: 62 }, (_, index) => {
      const start = new Date(2026, 0, 2 + index, 0, 0, 0);
      const month = String(start.getMonth() + 1).padStart(2, '0');
      const day = String(start.getDate()).padStart(2, '0');
      return record({
        id: `id-${String(index).padStart(2, '0')}`,
        saleStartDate: `${start.getFullYear()}-${month}-${day}T00:00:00.000`,
      });
    });
    const limited = limitUpcomingListingAlertGroups(upcomingListingAlertGroups(records, now, 14, new Set()));

    expect(limited).toHaveLength(60);
    expect(limited[0]?.items[0]?.record.id).toBe('id-00');
    expect(limited[59]?.items[0]?.record.id).toBe('id-59');
  });
});
