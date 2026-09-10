import { describe, expect, it } from 'vitest';

import { normalizePendingNotificationLog } from './pendingNotificationLog';

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
