import { describe, expect, it } from 'vitest';

import { normalizePendingNotificationLog, partitionPendingNotificationLog } from './pendingNotificationLog';

describe('normalizePendingNotificationLog', () => {
  it('旧形式の 1 件 object を配列に包む', () => {
    const raw = JSON.stringify({
      kind: 'monthlyReview',
      monthKey: '2026-07',
      totalNetProfit: 1000,
      scheduledFor: '2026-08-01T09:00:00.000',
    });

    expect(normalizePendingNotificationLog(raw)).toEqual([
      {
        kind: 'monthlyReview',
        identifier: 'monthly-review',
        monthKey: '2026-07',
        totalNetProfit: 1000,
        scheduledFor: '2026-08-01T09:00:00.000',
      },
    ]);
  });

  it('配列はそのまま読む', () => {
    const raw = JSON.stringify([
      {
        kind: 'listingAlert',
        identifier: 'listing-alert:2026-07-15',
        items: [{ recordId: 'a', itemName: 'えんぴつ', days: 14 }],
        scheduledFor: '2026-07-15T09:00:00.000',
      },
    ]);

    expect(normalizePendingNotificationLog(raw)?.[0]?.kind).toBe('listingAlert');
  });

  it('空や壊れた値は null', () => {
    expect(normalizePendingNotificationLog(null)).toBeNull();
    expect(normalizePendingNotificationLog('[]')).toBeNull();
    expect(normalizePendingNotificationLog('{')).toBeNull();
  });
});

describe('partitionPendingNotificationLog', () => {
  it('発火予定を過ぎた分とまだ先の分に分ける', () => {
    const pending = [
      {
        kind: 'listingAlert' as const,
        identifier: 'listing-alert:2026-07-15',
        items: [{ recordId: 'a', itemName: 'えんぴつ', days: 14 }],
        scheduledFor: '2026-07-15T09:00:00.000',
      },
      {
        kind: 'monthlyReview' as const,
        identifier: 'monthly-review',
        monthKey: '2026-07',
        totalNetProfit: 1000,
        scheduledFor: '2026-08-01T09:00:00.000',
      },
    ];

    const atFire = partitionPendingNotificationLog(pending, new Date(2026, 6, 15, 9, 0, 0, 0));
    expect(atFire.due.map((entry) => entry.identifier)).toEqual(['listing-alert:2026-07-15']);
    expect(atFire.rest.map((entry) => entry.identifier)).toEqual(['monthly-review']);

    const before = partitionPendingNotificationLog(pending, new Date(2026, 6, 15, 8, 59, 0, 0));
    expect(before.due).toEqual([]);
    expect(before.rest).toHaveLength(2);
  });
});
