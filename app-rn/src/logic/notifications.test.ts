// ベル・OS通知が共有する判定ロジック（logic/notifications.ts）の検証テスト。

import { describe, expect, it } from 'vitest';

import type { SaleRecord } from '@/db/schema';

import {
  alreadyLoggedToday,
  currentNotification,
  isMonthlyReviewActive,
  listingAlertItems,
  newlyEligibleListingAlertItems,
  previousMonthKey,
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

describe('newlyEligibleListingAlertItems', () => {
  it('ちょうどしきい値に到達した記録だけに絞る（OS通知用）', () => {
    const items = listingAlertItems(
      [
        record({ id: 'a', saleStartDate: '2026-07-01T00:00:00.000' }), // 14日経過（ちょうど）
        record({ id: 'b', saleStartDate: '2026-06-01T00:00:00.000' }), // 44日経過（前からしきい値超え）
      ],
      today,
      14,
      new Set(),
    );

    const newlyEligible = newlyEligibleListingAlertItems(items, 14);

    expect(newlyEligible.map((item) => item.record.id)).toEqual(['a']);
  });

  it('しきい値をとうに超えた記録しか無ければ空になる（＝OS通知を出さない）', () => {
    const items = listingAlertItems(
      [record({ id: 'b', saleStartDate: '2026-06-01T00:00:00.000' })], // 44日経過
      today,
      14,
      new Set(),
    );

    expect(newlyEligibleListingAlertItems(items, 14)).toEqual([]);
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
    );

    expect(content?.kind).toBe('listingAlert');
  });

  it('対象が無ければ null', () => {
    const content = currentNotification([], today, 14, new Set(), null);
    expect(content).toBeNull();
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
});
