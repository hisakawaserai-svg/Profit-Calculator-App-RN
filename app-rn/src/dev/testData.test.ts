// 開発用テストデータ（src/dev/testData.ts）の**内訳**の検証。
//
// 金額も日付も乱数なので、値そのものは見ない。見るのは「実行するたびに満たすべき内訳」──
// 件数・状態・種別・赤字の数・タグの配分・期間。乱数の巡り合わせで崩れないことを確かめたいので、
// どのテストも同じ生成を何度も回している。

import { describe, expect, it } from 'vitest';

import { netProfit } from '@/logic/profit';

import {
  buildDevSeedRecords,
  DEV_SEED_MONTH_COUNTS,
  DEV_SEED_RANGE_END,
  DEV_SEED_RANGE_START,
  DEV_SEED_TAG_NAMES,
  type DevSeedSources,
} from './testData';

/** マイグレーション 0002 の初期プリセットと同じ値（実際の投入もこの値で走る） */
const SOURCES: DevSeedSources = {
  shippingValues: [210, 185, 450, 750, 850, 1050, 0],
  packagingValues: [15, 40, 20, 60, 100, 10],
  sites: [
    { name: '手数料 10%', commission: 10 },
    { name: '手数料 6%', commission: 6 },
    { name: '手数料 5%', commission: 5 },
    { name: '手数料なし（直接取引）', commission: 0 },
  ],
  tagIds: DEV_SEED_TAG_NAMES.map((_, index) => `tag-${index}`),
};

const RUNS = 30;

/** RUNS 回ぶんの生成結果 */
const samples = Array.from({ length: RUNS }, () => buildDevSeedRecords(SOURCES));

/** 各回の生成結果に対して同じ検証を回す */
function eachRun(assert: (records: ReturnType<typeof buildDevSeedRecords>) => void): void {
  for (const records of samples) assert(records);
}

/** 月キー "YYYY-MM"（記録タブ・月バーのグループ化と同じ基準日で作る） */
function monthKeyOf(record: { isSold: boolean; saleDate: Date | null; saleStartDate: Date }): string {
  const basis = record.isSold ? (record.saleDate ?? record.saleStartDate) : record.saleStartDate;
  return `${basis.getFullYear()}-${String(basis.getMonth() + 1).padStart(2, '0')}`;
}

describe('件数と内訳', () => {
  it('合計 50 件', () => {
    eachRun((records) => expect(records).toHaveLength(50));
  });

  it('販売済み 40 件 / 出品中 10 件', () => {
    eachRun((records) => {
      expect(records.filter((r) => r.isSold)).toHaveLength(40);
      expect(records.filter((r) => !r.isSold)).toHaveLength(10);
    });
  });

  it('不用品 30 件 / 仕入品 20 件', () => {
    eachRun((records) => {
      expect(records.filter((r) => r.kind === 'used')).toHaveLength(30);
      expect(records.filter((r) => r.kind === 'sourced')).toHaveLength(20);
    });
  });

  it('仕入値は仕入品にだけ入る', () => {
    eachRun((records) => {
      for (const record of records) {
        if (record.kind === 'used') expect(record.purchasePrice).toBe(0);
        else expect(record.purchasePrice).toBeGreaterThan(0);
      }
    });
  });

  it('商品名は 50 件すべて違い、30 文字以上のものが 3 件ある', () => {
    eachRun((records) => {
      expect(new Set(records.map((r) => r.itemName)).size).toBe(50);
      const long = records.filter((r) => Array.from(r.itemName).length >= 30);
      expect(long).toHaveLength(3);
    });
  });

  it('写真は付けない', () => {
    eachRun((records) => {
      for (const record of records) expect(record.photoFileName).toBeNull();
    });
  });
});

describe('日付', () => {
  it('月ごとの件数が指定どおりで、0 件の月が 1 か月ある', () => {
    eachRun((records) => {
      const counts = new Map<string, number>();
      for (const record of records) {
        const key = monthKeyOf(record);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }

      const expected = DEV_SEED_MONTH_COUNTS.map((count, index) => {
        const month = new Date(
          DEV_SEED_RANGE_START.getFullYear(),
          DEV_SEED_RANGE_START.getMonth() + index,
          1,
        );
        return { key: `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`, count };
      });

      for (const { key, count } of expected) expect(counts.get(key) ?? 0).toBe(count);
      expect(expected.filter((month) => month.count === 0)).toHaveLength(1);
      // 2〜6 件の範囲でばらついている（0 件の月を除く）
      for (const { count } of expected.filter((month) => month.count > 0)) {
        expect(count).toBeGreaterThanOrEqual(2);
        expect(count).toBeLessThanOrEqual(6);
      }
    });
  });

  it('2025 年と 2026 年の両方に記録がある', () => {
    eachRun((records) => {
      const years = new Set(records.map((r) => monthKeyOf(r).slice(0, 4)));
      expect([...years].sort()).toEqual(['2025', '2026']);
    });
  });

  it('出品中は販売日を持たず、出品日だけを持つ', () => {
    eachRun((records) => {
      for (const record of records.filter((r) => !r.isSold)) {
        expect(record.saleDate).toBeNull();
        expect(record.saleStartDate).toBeInstanceOf(Date);
      }
    });
  });

  it('販売済みは 出品日 < 販売日（数日〜数週間）', () => {
    eachRun((records) => {
      for (const record of records.filter((r) => r.isSold)) {
        const saleDate = record.saleDate;
        expect(saleDate).not.toBeNull();
        const days = (saleDate!.getTime() - record.saleStartDate.getTime()) / (24 * 60 * 60 * 1000);
        expect(days).toBeGreaterThan(0);
        expect(days).toBeLessThanOrEqual(25);
      }
    });
  });

  it('すべての日付が 2025-09-01 〜 2026-08-13 に収まる', () => {
    const start = DEV_SEED_RANGE_START.getTime();
    // 右端は「その日いっぱい」まで許す
    const end = new Date(
      DEV_SEED_RANGE_END.getFullYear(),
      DEV_SEED_RANGE_END.getMonth(),
      DEV_SEED_RANGE_END.getDate(),
      23,
      59,
      59,
    ).getTime();

    eachRun((records) => {
      for (const record of records) {
        expect(record.saleStartDate.getTime()).toBeGreaterThanOrEqual(start);
        expect(record.saleStartDate.getTime()).toBeLessThanOrEqual(end);
        if (record.saleDate != null) {
          expect(record.saleDate.getTime()).toBeGreaterThanOrEqual(start);
          expect(record.saleDate.getTime()).toBeLessThanOrEqual(end);
        }
      }
    });
  });
});

describe('金額', () => {
  it('売上は 500 〜 25000 円で、1 万円超が数件ある', () => {
    eachRun((records) => {
      for (const record of records) {
        expect(record.salesPrice).toBeGreaterThanOrEqual(500);
        expect(record.salesPrice).toBeLessThanOrEqual(25000);
      }
      expect(records.filter((r) => r.salesPrice > 10000).length).toBeGreaterThanOrEqual(3);
    });
  });

  it('赤字が 5〜7 件（仕入過多と送料過多の両方）', () => {
    eachRun((records) => {
      const loss = records.filter((r) => netProfit(r) < 0);
      expect(loss.length).toBeGreaterThanOrEqual(5);
      expect(loss.length).toBeLessThanOrEqual(7);

      // 仕入値が売上を超えている赤字
      expect(loss.filter((r) => r.purchasePrice > r.salesPrice).length).toBeGreaterThanOrEqual(1);
      // 送料が売上の半分以上を占める赤字
      expect(
        loss.filter((r) => r.purchasePrice === 0 && r.postage >= r.salesPrice / 2).length,
      ).toBeGreaterThanOrEqual(1);
    });
  });

  it('収支がちょうど 0 円の記録が 1 件', () => {
    eachRun((records) => {
      expect(records.filter((r) => netProfit(r) === 0)).toHaveLength(1);
    });
  });

  it('送料・梱包材はプリセットの値を複数種類使い分ける', () => {
    eachRun((records) => {
      const postages = new Set(records.map((r) => r.postage));
      expect(postages.size).toBeGreaterThanOrEqual(3);
      for (const postage of postages) expect(SOURCES.shippingValues).toContain(postage);

      // 梱包材は複数選択（合算）があるので、値がプリセットに無いこと自体は正しい
      expect(new Set(records.map((r) => r.envelopeCost)).size).toBeGreaterThanOrEqual(3);
    });
  });

  it('販売サイト名は販売済みにだけ写り、複数種類が使われる', () => {
    eachRun((records) => {
      for (const record of records.filter((r) => !r.isSold)) expect(record.siteName).toBe('');

      const names = new Set(
        records.filter((r) => r.isSold && r.siteName !== '').map((r) => r.siteName),
      );
      expect(names.size).toBeGreaterThanOrEqual(2);
      for (const name of names) expect(SOURCES.sites.map((s) => s.name)).toContain(name);
    });
  });
});

describe('タグ', () => {
  it('35 件に付き、15 件はタグ無し', () => {
    eachRun((records) => {
      expect(records.filter((r) => r.tagIds.length > 0)).toHaveLength(35);
      expect(records.filter((r) => r.tagIds.length === 0)).toHaveLength(15);
    });
  });

  it('2〜3 個付いた記録が 10 件以上ある', () => {
    eachRun((records) => {
      const multi = records.filter((r) => r.tagIds.length >= 2);
      expect(multi.length).toBeGreaterThanOrEqual(10);
      for (const record of multi) expect(record.tagIds.length).toBeLessThanOrEqual(3);
    });
  });

  it('6 種類すべてが使われる', () => {
    eachRun((records) => {
      const used = new Set(records.flatMap((r) => r.tagIds));
      expect(used.size).toBe(DEV_SEED_TAG_NAMES.length);
    });
  });

  it('OR 絞り込みが確かめられるよう、同じ組み合わせが重複して現れる', () => {
    eachRun((records) => {
      const combos = new Map<string, number>();
      for (const record of records.filter((r) => r.tagIds.length >= 2)) {
        const key = [...record.tagIds].sort().join('+');
        combos.set(key, (combos.get(key) ?? 0) + 1);
      }
      // 2 件以上で使い回されている組み合わせが 1 つ以上ある
      expect([...combos.values()].filter((count) => count >= 2).length).toBeGreaterThanOrEqual(1);

      // 2 つのタグを OR で選ぶと、片方だけのときより件数が増える組み合わせがある
      const [first, second] = SOURCES.tagIds;
      const onlyFirst = records.filter((r) => r.tagIds.includes(first)).length;
      const either = records.filter(
        (r) => r.tagIds.includes(first) || r.tagIds.includes(second),
      ).length;
      expect(either).toBeGreaterThan(onlyFirst);
    });
  });

  it('同じタグが 1 件に二重に付かない', () => {
    eachRun((records) => {
      for (const record of records) {
        expect(new Set(record.tagIds).size).toBe(record.tagIds.length);
      }
    });
  });
});
