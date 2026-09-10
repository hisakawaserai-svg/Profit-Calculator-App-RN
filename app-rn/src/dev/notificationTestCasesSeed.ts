// 開発用: 出品滞留アラートの境界値をすぐ試せるテスト記録を投入する（__DEV__ 専用）。
// 「今日」を起点に、しきい値の前後・過去/未来の日付をまとめて作る。
// OS 通知の対象になるのは「到達日がまだ未来（または今日の 9:00 前）」の記録だけ。
// しきい値をすでに超えた分（300日前など）はお知らせの「滞留中」タブ用。
//
// **id は notiftest- で始まる**（devSeed.ts の devseed- と同じ考え方。この接頭辞の行
// だけを独立して削除できる）。
//
// **SQL は書かない**（seedKit.ts の方針と同じ）。createSeedKit が返す repository を
// そのまま使い、採番だけを接頭辞付きにする。
//
// 値下げ（priceChangedAt）を起点にした境界ケースは含まない ── 公開している
// repository.setSalesPrice は常に「今」を値下げ日にする作りで、任意の過去日付を
// 差し込む口が無い（あえて用意していない。repository.ts のコメント参照）。
// SQL を書かずに再現する手段が無いため、ここでは出品日（saleStartDate）だけを動かす。

import type { RecordKind } from '@/db/schema';
import { getListingAlertThresholdDays } from '@/settings';

import { countSeedRecords, createSeedKit, removeSeedRows, type SeedSummary } from './seedKit';

/** id の接頭辞。削除・件数カウントもこれで絞る */
const ID_PREFIX = 'notiftest-';

const kit = createSeedKit(ID_PREFIX);

const DAY_MS = 24 * 60 * 60 * 1000;

/** N 日前の Date（負数なら未来）。時刻は毎朝の通知と同じ 9:00 に揃える */
function daysAgo(days: number): Date {
  const date = new Date(Date.now() - days * DAY_MS);
  date.setHours(9, 0, 0, 0);
  return date;
}

/** 1件ぶんの出品中レコードを作る。利益が出る値で固定（loss 判定で除外されないように） */
function createListingRecord(itemName: string, saleStartDate: Date): void {
  kit.records.create({
    itemName,
    kind: 'sourced' as RecordKind,
    salesPrice: 3000,
    purchasePrice: 500,
    postage: 500,
    envelopeCost: 50,
    othersCost: 0,
    commission: 10,
    isSold: false,
    saleStartDate,
    saleDate: null,
    memo: '',
    siteName: '',
    photoFileName: null,
    shippingMaterialCost: 0,
    excludesShippingMaterial: false,
    shippingName: '',
    targetProfit: null,
    tagIds: [],
  });
}

/**
 * 出品滞留アラートの境界ケースを投入する。戻り値は追加した件数。
 *
 * しきい値（既定14日、設定で変更可）は `getListingAlertThresholdDays()` で今の設定値を
 * 読み、しきい値ちょうど・その前後のケースを動的に組み立てる ── 設定を変えても
 * 「ちょうどしきい値」のケースがずれない。
 */
export function insertNotificationTestCases(): number {
  const threshold = getListingAlertThresholdDays();

  const cases: readonly { label: string; days: number }[] = [
    { label: '明日', days: -1 },
    { label: '今日', days: 0 },
    { label: '昨日', days: 1 },
    { label: 'おととい', days: 2 },
    { label: `${threshold - 1}日前（しきい値の1日前）`, days: threshold - 1 },
    { label: `${threshold}日前（ちょうどしきい値・到達日は今朝9時。過ぎたら本番OSは出さない）`, days: threshold },
    { label: `${threshold + 1}日前（しきい値の1日後）`, days: threshold + 1 },
    { label: '300日前（大幅超過）', days: 300 },
  ];

  cases.forEach(({ label, days }) => {
    createListingRecord(`テスト通知: 出品日=${label}`, daysAgo(days));
  });

  return cases.length;
}

export function removeNotificationTestCases(): SeedSummary {
  return removeSeedRows(ID_PREFIX);
}

export function countNotificationTestCases(): number {
  return countSeedRecords(ID_PREFIX);
}
