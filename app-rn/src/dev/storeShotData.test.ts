// 撮影用テストデータ（src/dev/storeShotData.ts）の検証。
//
// **testData.test.ts とは見るものが違う。** あちらは乱数なので「毎回満たすべき内訳」しか
// 見られないが、こちらは全件が固定値なので**値そのもの**を見られる ── 掲載画像に写る
// 数字がおかしくないこと（キリのいい収支が並ばない・赤字が 1 件だけ）を直接確かめる。

import { describe, expect, it } from 'vitest';

import { netProfit, roundForDisplay } from '@/logic/profit';
import { LOCALES } from '@/settings/language';

import { decodeBase64 } from './base64';
import {
  buildStoreShotRecords,
  STORE_SHOT_COMMISSION,
  STORE_SHOT_COUNTS,
  STORE_SHOT_MONTH_COUNTS,
  STORE_SHOT_PRESETS,
  STORE_SHOT_TAG_NAMES,
  STORE_SHOT_TODAY,
  type StoreShotSources,
} from './storeShotData';
import { STORE_SHOT_PHOTOS } from './storeShotPhotos';

const PHOTO_FILE_NAMES = Object.fromEntries(
  Object.keys(STORE_SHOT_PHOTOS).map((name) => [name, `${name}.jpg`]),
);

function sourcesFor(locale: 'ja' | 'en'): StoreShotSources {
  return {
    locale,
    tagIds: STORE_SHOT_TAG_NAMES[locale].map((_, index) => `tag-${index}`),
    siteName: STORE_SHOT_PRESETS[locale].site[0].name,
    photoFileNames: PHOTO_FILE_NAMES,
  };
}

const records = buildStoreShotRecords(sourcesFor('ja'));

/** 表示に出る収支（SPEC §2.6 の丸め済み）。画面に並ぶのはこの値 */
function displayedProfit(record: (typeof records)[number]): number {
  return roundForDisplay(netProfit(record));
}

/** 月キー "YYYY-MM"（記録タブ・月バーのグループ化と同じ基準日で作る） */
function monthOf(record: (typeof records)[number]): number {
  const basis = record.isSold ? (record.saleDate ?? record.saleStartDate) : record.saleStartDate;
  return basis.getMonth() + 1;
}

describe('件数と内訳', () => {
  it('合計 42 件（販売済み 37 / 出品中 5）', () => {
    expect(records).toHaveLength(42);
    expect(STORE_SHOT_COUNTS.records).toBe(42);
    expect(records.filter((record) => record.isSold)).toHaveLength(37);
    expect(records.filter((record) => !record.isSold)).toHaveLength(5);
  });

  it('不用品と仕入品が混ざっている', () => {
    const sourced = records.filter((record) => record.kind === 'sourced');
    expect(sourced.length).toBeGreaterThanOrEqual(10);
    expect(records.length - sourced.length).toBeGreaterThanOrEqual(10);
  });

  it('仕入値は仕入品にだけ入る', () => {
    for (const record of records) {
      if (record.kind === 'used') expect(record.purchasePrice).toBe(0);
      else expect(record.purchasePrice).toBeGreaterThan(0);
    }
  });

  it('商品名に開発用シードのような実在ブランドを含まない', () => {
    // 網羅はできないので、開発用シード（testData.ts）が実際に使っている語を見張る
    const brands = ['ユニクロ', 'ダイソン', 'ナイキ', '無印', 'アップル', 'ディズニー', 'GU', 'ZARA'];
    for (const record of records) {
      for (const brand of brands) expect(record.itemName).not.toContain(brand);
    }
  });
});

describe('日付', () => {
  it('3 か月（6 / 7 / 8 月）に分かれ、どの月も 10〜20 件', () => {
    expect(Object.keys(STORE_SHOT_MONTH_COUNTS).map(Number).sort()).toEqual([6, 7, 8]);
    for (const count of Object.values(STORE_SHOT_MONTH_COUNTS)) {
      expect(count).toBeGreaterThanOrEqual(10);
      expect(count).toBeLessThanOrEqual(20);
    }
    for (const month of [6, 7, 8]) {
      expect(records.filter((record) => monthOf(record) === month)).toHaveLength(
        STORE_SHOT_MONTH_COUNTS[month],
      );
    }
  });

  it('いちばん新しい記録は 8 月', () => {
    const newest = Math.max(
      ...records.map((record) => (record.saleDate ?? record.saleStartDate).getTime()),
    );
    expect(new Date(newest).getMonth() + 1).toBe(8);
  });

  it('販売済みは 出品日 < 販売日、出品中は販売日を持たない', () => {
    for (const record of records) {
      if (record.isSold) {
        expect(record.saleDate).not.toBeNull();
        expect(record.saleStartDate.getTime()).toBeLessThan(record.saleDate!.getTime());
      } else {
        expect(record.saleDate).toBeNull();
      }
    }
  });

  it('出品中は撮影の基準日から 30 日以内に出品されている', () => {
    const day = 24 * 60 * 60 * 1000;
    for (const record of records.filter((candidate) => !candidate.isSold)) {
      const days = (STORE_SHOT_TODAY.getTime() - record.saleStartDate.getTime()) / day;
      expect(days).toBeGreaterThan(0);
      expect(days).toBeLessThanOrEqual(30);
    }
  });

  it('どの日付も撮影の基準日を越えない', () => {
    for (const record of records) {
      expect(record.saleStartDate.getTime()).toBeLessThanOrEqual(STORE_SHOT_TODAY.getTime());
      if (record.saleDate != null) {
        expect(record.saleDate.getTime()).toBeLessThanOrEqual(STORE_SHOT_TODAY.getTime());
      }
    }
  });
});

describe('金額', () => {
  it('手数料はすべて 10%', () => {
    for (const record of records) expect(record.commission).toBe(STORE_SHOT_COMMISSION);
  });

  it('販売価格はフリマで実際に付く値（10 円単位）', () => {
    for (const record of records) {
      expect(record.salesPrice % 10).toBe(0);
      expect(record.salesPrice).toBeGreaterThanOrEqual(500);
      expect(record.salesPrice).toBeLessThanOrEqual(9800);
    }
  });

  it('送料と梱包材は用意したプリセットの値だけを使う', () => {
    const shipping = STORE_SHOT_PRESETS.ja.shipping.map((preset) => preset.value);
    const packaging = STORE_SHOT_PRESETS.ja.packaging.map((preset) => preset.value);
    for (const record of records) {
      expect(shipping).toContain(record.postage);
      expect(packaging).toContain(record.envelopeCost);
    }
  });

  it('収支がキリのいい数字にならない（50 円で割り切れる記録が 1 件も無い）', () => {
    // 落ちたときに「どの記録がいくらなのか」がそのまま出るよう、一覧にして比べる
    const round = records
      .filter((record) => displayedProfit(record) % 50 === 0)
      .map((record) => `${record.itemName} ¥${displayedProfit(record)}`);
    expect(round).toEqual([]);
  });

  it('同じ収支の記録が並ばない（一覧が作り物に見えない）', () => {
    const counts = new Map<number, string[]>();
    for (const record of records) {
      const profit = displayedProfit(record);
      counts.set(profit, [...(counts.get(profit) ?? []), record.itemName]);
    }
    const duplicated = [...counts.entries()]
      .filter(([, names]) => names.length > 1)
      .map(([profit, names]) => `¥${profit}: ${names.join(' / ')}`);
    expect(duplicated).toEqual([]);
  });

  it('赤字は 1 件だけ（掲載画像は普通の使い方に見せる）', () => {
    const losses = records.filter((record) => displayedProfit(record) < 0);
    expect(losses).toHaveLength(1);
    // 桁の大きい赤字は「損をするアプリ」に見えるので、小さいものに限る
    expect(displayedProfit(losses[0])).toBeGreaterThan(-500);
  });
});

describe('タグ', () => {
  it('5 種類すべてが使われ、どれも 3 件以上ある（タグ別分析が成立する）', () => {
    for (let index = 0; index < STORE_SHOT_TAG_NAMES.ja.length; index += 1) {
      const tagged = records.filter((record) => record.tagIds.includes(`tag-${index}`));
      expect({ index, count: tagged.length >= 3 }).toEqual({ index, count: true });
    }
  });

  it('全件にタグが付く（タグ別分析に漏れを作らない）', () => {
    for (const record of records) expect(record.tagIds.length).toBeGreaterThanOrEqual(1);
  });

  it('同じタグが 1 件に二重に付かない', () => {
    for (const record of records) {
      expect(new Set(record.tagIds).size).toBe(record.tagIds.length);
    }
  });
});

describe('写真', () => {
  it('4 件だけが写真を持ち、すべて 8 月の記録', () => {
    const withPhoto = records.filter((record) => record.photoFileName != null);
    expect(withPhoto).toHaveLength(4);
    expect(STORE_SHOT_COUNTS.photos).toBe(4);
    for (const record of withPhoto) expect(monthOf(record)).toBe(8);
  });

  it('写真は 8 月のうち新しい方に付く（古い記録には付けない）', () => {
    const august = records
      .filter((record) => monthOf(record) === 8)
      .sort(
        (a, b) =>
          (b.saleDate ?? b.saleStartDate).getTime() - (a.saleDate ?? a.saleStartDate).getTime(),
      );
    const positions = august
      .map((record, index) => (record.photoFileName != null ? index : -1))
      .filter((index) => index >= 0);
    expect(positions.every((index) => index < 8)).toBe(true);
  });

  it('埋め込んである 4 枚が JPEG として読める', () => {
    // gen_store_photos.py の書き出しが壊れていないことの確認。
    // JPEG は SOI（FF D8）で始まり EOI（FF D9）で終わる
    for (const [name, base64] of Object.entries(STORE_SHOT_PHOTOS)) {
      const bytes = decodeBase64(base64);
      expect({ name, head: [...bytes.slice(0, 2)] }).toEqual({ name, head: [0xff, 0xd8] });
      expect({ name, tail: [...bytes.slice(-2)] }).toEqual({ name, tail: [0xff, 0xd9] });
    }
  });

  it('4 種類の絵をそれぞれ 1 回ずつ使う', () => {
    const used = records
      .map((record) => record.photoFileName)
      .filter((name): name is string => name != null);
    expect(new Set(used).size).toBe(4);
    expect(Object.keys(STORE_SHOT_PHOTOS)).toHaveLength(4);
  });
});

describe('目標利益', () => {
  it('大半の記録は目標を持たない（SPEC-V9 §1.3 の標準ケース）', () => {
    const withTarget = records.filter((record) => record.targetProfit != null);
    expect(withTarget.length).toBeGreaterThanOrEqual(2);
    expect(withTarget.length).toBeLessThanOrEqual(5);
  });

  it('出品中の目標は「今の価格なら届く」値（値下げの余地が出る）', () => {
    for (const record of records) {
      if (record.isSold || record.targetProfit == null) continue;
      expect(displayedProfit(record)).toBeGreaterThan(record.targetProfit);
    }
  });
});

describe('言語', () => {
  it('日英どちらでも同じ件数・同じ金額で、商品名だけが入れ替わる', () => {
    for (const locale of LOCALES) {
      const localized = buildStoreShotRecords(sourcesFor(locale));
      expect(localized).toHaveLength(records.length);
      localized.forEach((record, index) => {
        expect(record.salesPrice).toBe(records[index].salesPrice);
        expect(record.itemName.length).toBeGreaterThan(0);
      });
    }
    const english = buildStoreShotRecords(sourcesFor('en'));
    expect(english.some((record, index) => record.itemName !== records[index].itemName)).toBe(true);
  });

  it('タグとプリセットの名前が日英で揃っている', () => {
    expect(STORE_SHOT_TAG_NAMES.en).toHaveLength(STORE_SHOT_TAG_NAMES.ja.length);
    // SPEC-V4 §1.3: タグ名は 12 文字以内
    for (const locale of LOCALES) {
      for (const name of STORE_SHOT_TAG_NAMES[locale]) {
        expect({ name, ok: name.length <= 12 }).toEqual({ name, ok: true });
      }
    }
    for (const type of ['shipping', 'packaging', 'site'] as const) {
      expect(STORE_SHOT_PRESETS.en[type]).toHaveLength(STORE_SHOT_PRESETS.ja[type].length);
      STORE_SHOT_PRESETS.en[type].forEach((preset, index) => {
        expect(preset.value).toBe(STORE_SHOT_PRESETS.ja[type][index].value);
      });
    }
  });
});
