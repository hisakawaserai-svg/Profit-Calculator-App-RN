// data タブ「実績」の判定ロジックのテスト。
// 期待値は logic/achievements.ts の式から手計算で導出している。
//
// 実績は「成長系」（⚡一撃 / 💰累計利益 / 📦販売件数 / 🎯得意分野 / 🔍売れ筋 の 5 ジャンル ×
// 5 段階 = 25 種）と「特殊実績」（はじめる系 5 種 + タグ系 3 種 + その他 5 種 = 13 種）、
// 計 38 種で構成する。

import { describe, expect, it } from 'vitest';
import {
  achievementBadgeTier,
  achievementCategory,
  achievementDifficulty,
  computePersonalBests,
  evaluateAchievements,
  groupAchievementsByGenre,
  newlyCompletedAchievements,
  selectNextAchievement,
  sortAchievementsByRecency,
  strikeAchievementsByRecordId,
  type Achievement,
  type AchievementId,
  type AchievementListingRecord,
  type AchievementSaleRecord,
} from './achievements';

let nextRecordId = 0;

/** 純利益がちょうど profit になるように salesPrice だけで作る（他の経費は 0・手数料 0%） */
function record(partial: {
  saleStartDate: Date;
  saleDate: Date;
  profit: number;
  salesPrice?: number;
  /** 明示指定がなければ、salesPrice 指定時は salesPrice-profit、それ以外は 0（従来どおり） */
  purchasePrice?: number;
  targetProfit?: number | null;
  tagIds?: readonly string[];
  id?: string;
  itemName?: string;
}): AchievementSaleRecord {
  nextRecordId += 1;
  return {
    id: partial.id ?? `record-${nextRecordId}`,
    itemName: partial.itemName ?? `商品${nextRecordId}`,
    saleStartDate: partial.saleStartDate,
    saleDate: partial.saleDate,
    salesPrice: partial.salesPrice ?? partial.profit,
    purchasePrice:
      partial.purchasePrice ??
      (partial.salesPrice != null ? partial.salesPrice - partial.profit : 0),
    postage: 0,
    envelopeCost: 0,
    othersCost: 0,
    commission: 0,
    tagIds: partial.tagIds ?? [],
    targetProfit: partial.targetProfit ?? null,
  };
}

/** 出品中も含む「はじめる系」の対象記録 */
function listing(partial: {
  saleStartDate: Date;
  tagIds?: readonly string[];
  id?: string;
  itemName?: string;
}): AchievementListingRecord {
  nextRecordId += 1;
  return {
    id: partial.id ?? `listing-${nextRecordId}`,
    itemName: partial.itemName ?? `商品${nextRecordId}`,
    saleStartDate: partial.saleStartDate,
    tagIds: partial.tagIds ?? [],
  };
}

const d = (s: string) => new Date(`${s}T00:00:00.000`);

function find(
  achievements: Achievement[],
  id: AchievementId,
): Achievement | undefined {
  return achievements.find((a) => a.id === id);
}

/** N 件の売却済み記録を、指定した純利益で 1 日ずつずらして作る（しきい値の境界テスト用） */
function soldRecordsWithProfits(
  profits: readonly number[],
): AchievementSaleRecord[] {
  return profits.map((profit, i) =>
    record({
      saleStartDate: d('2026-01-01'),
      saleDate: new Date(2026, 0, i + 1),
      profit,
    }),
  );
}

describe('evaluateAchievements（全体の構成）', () => {
  it('成長系 25 種 + 特殊実績 13 種 = 38 種を返す', () => {
    expect(evaluateAchievements([])).toHaveLength(38);
  });

  it('0 件ならすべて未達成（completedAt・completedRecord も null）', () => {
    const achievements = evaluateAchievements([]);
    for (const achievement of achievements) {
      expect(achievement.completed).toBe(false);
      expect(achievement.current).toBe(0);
      expect(achievement.completedAt).toBeNull();
      expect(achievement.completedRecord).toBeNull();
    }
  });

  it('今回の再編で削除した旧実績の id はもう返らない', () => {
    const ids = evaluateAchievements([]).map((a) => a.id);
    const removedIds = [
      'tag_three_faces',
      'tag_collector',
      'tag_specialty',
      'tag_bestseller',
      'sold_25',
      'sold_100',
      'sold_1000',
      'profit_streak_10',
    ];
    for (const removedId of removedIds) {
      expect(ids).not.toContain(removedId);
    }
  });
});

describe('evaluateAchievements（特殊実績: はじめる系）', () => {
  it('初めての一歩は 1 件売れた時点で達成し、達成日・達成した記録は最初の販売日の記録', () => {
    const records = [
      record({
        saleStartDate: d('2026-01-01'),
        saleDate: d('2026-01-05'),
        profit: 100,
        salesPrice: 500,
        id: 'r1',
        itemName: 'ヴィンテージ腕時計',
      }),
    ];
    const first = find(evaluateAchievements(records), 'first_sale');
    expect(first?.completed).toBe(true);
    expect(first?.completedAt).toEqual(d('2026-01-05'));
    expect(first?.completedRecord).toEqual({
      id: 'r1',
      itemName: 'ヴィンテージ腕時計',
      netProfit: 100,
      saleDate: d('2026-01-05'),
      tagId: null,
    });
  });

  it('販売デビューは出品中も含めた記録が 1 件でもあれば、出品日で達成する（売れていなくてもよい）', () => {
    const listingRecords = [
      listing({
        saleStartDate: d('2026-01-03'),
        id: 'l1',
        itemName: '未売却品',
      }),
    ];
    const achievement = find(
      evaluateAchievements([], { listingRecords }),
      'sale_debut',
    );
    expect(achievement?.completed).toBe(true);
    expect(achievement?.completedAt).toEqual(d('2026-01-03'));
    expect(achievement?.completedRecord).toEqual({
      id: 'l1',
      itemName: '未売却品',
      netProfit: null,
      saleDate: d('2026-01-03'),
      tagId: null,
    });
  });

  it('listingRecords を渡さないと販売デビュー・記録を続けよう・タグデビューは未達成のまま', () => {
    const soldRecords = [
      record({
        saleStartDate: d('2026-01-01'),
        saleDate: d('2026-01-02'),
        profit: 10,
      }),
    ];
    const achievements = evaluateAchievements(soldRecords);
    expect(find(achievements, 'sale_debut')?.completed).toBe(false);
    expect(find(achievements, 'record_count_10')?.completed).toBe(false);
    expect(find(achievements, 'tag_debut')?.completed).toBe(false);
  });

  it('初利益は純利益がプラスで売れた最初の記録の販売日で達成する（赤字・0円は数えない）', () => {
    const records = [
      record({
        saleStartDate: d('2026-01-01'),
        saleDate: d('2026-01-02'),
        profit: -100,
      }),
      record({
        saleStartDate: d('2026-01-01'),
        saleDate: d('2026-01-05'),
        profit: 0,
      }),
      record({
        saleStartDate: d('2026-01-01'),
        saleDate: d('2026-01-10'),
        profit: 300,
      }),
    ];
    const achievement = find(evaluateAchievements(records), 'first_profit');
    expect(achievement?.completed).toBe(true);
    expect(achievement?.completedAt).toEqual(d('2026-01-10'));
  });

  it('累計¥1,000は、累計純利益が¥1,000ぶん積み上がった記録の販売日で達成する', () => {
    // 500円 × 2 件 = 累計1000円
    const records = [
      record({
        saleStartDate: d('2026-01-01'),
        saleDate: d('2026-01-01'),
        profit: 500,
      }),
      record({
        saleStartDate: d('2026-01-01'),
        saleDate: d('2026-01-02'),
        profit: 500,
      }),
    ];
    const achievement = find(
      evaluateAchievements(records),
      'career_profit_1000',
    );
    expect(achievement?.completed).toBe(true);
    expect(achievement?.completedAt).toEqual(d('2026-01-02'));
    expect(achievement?.target).toBe(1000);
  });

  it('記録を続けようは出品中・売却済み問わず 10 件目の出品日で達成する', () => {
    const listingRecords = Array.from({ length: 10 }, (_, i) =>
      listing({ saleStartDate: new Date(2026, 0, i + 1) }),
    );
    const achievements = evaluateAchievements([], { listingRecords });
    const achievement = find(achievements, 'record_count_10');
    expect(achievement?.completed).toBe(true);
    expect(achievement?.completedAt).toEqual(new Date(2026, 0, 10));
    expect(achievement?.current).toBe(10);
  });
});

describe('evaluateAchievements（特殊実績: タグ系）', () => {
  it('タグデビューは出品中も含め、タグが付いた最初の記録の出品日で達成する', () => {
    const listingRecords = [
      listing({ saleStartDate: d('2026-01-01'), tagIds: [] }),
      listing({
        saleStartDate: d('2026-01-05'),
        tagIds: ['a'],
        id: 'l2',
        itemName: '初タグ品',
      }),
    ];
    const achievement = find(
      evaluateAchievements([], { listingRecords }),
      'tag_debut',
    );
    expect(achievement?.completed).toBe(true);
    expect(achievement?.completedAt).toEqual(d('2026-01-05'));
    expect(achievement?.completedRecord?.id).toBe('l2');
  });

  it('タグの総合力（★4）は、3 つ目のタグが累計純利益¥5,000に届いた記録の販売日で達成する', () => {
    const records = [
      // タグ a: ¥5,000 に到達（1/25 到達）
      record({
        saleStartDate: d('2026-01-01'),
        saleDate: d('2026-01-01'),
        profit: 5000,
        tagIds: ['a'],
      }),
      // タグ b: ¥5,000 に到達（1/26 到達）
      record({
        saleStartDate: d('2026-01-01'),
        saleDate: d('2026-01-26'),
        profit: 5000,
        tagIds: ['b'],
      }),
      // タグ c: ¥4,999 止まり（届かない）
      record({
        saleStartDate: d('2026-01-01'),
        saleDate: d('2026-01-27'),
        profit: 4999,
        tagIds: ['c'],
      }),
      // タグ d: ¥5,000 に到達（1/28 到達）── これで 3 タグ目
      record({
        saleStartDate: d('2026-01-01'),
        saleDate: d('2026-01-28'),
        profit: 5000,
        tagIds: ['d'],
      }),
    ];
    const achievement = find(evaluateAchievements(records), 'tag_synergy');
    expect(achievement?.completed).toBe(true);
    expect(achievement?.current).toBe(3);
    expect(achievement?.target).toBe(3);
    expect(achievement?.completedAt).toEqual(d('2026-01-28'));
    // 到達が早い 3 タグ（a, b, d）ぶんの記録が入る。c は届いていないので含まれない
    expect(achievement?.completedRecords).toHaveLength(3);
    expect(
      achievement?.completedRecords.map((r) => r.netProfit).sort(),
    ).toEqual([5000, 5000, 5000]);
  });

  it('タグの総合力は、しきい値に届いたタグが 3 つ未満なら未達成', () => {
    const records = [
      record({
        saleStartDate: d('2026-01-01'),
        saleDate: d('2026-01-01'),
        profit: 5000,
        tagIds: ['a'],
      }),
      record({
        saleStartDate: d('2026-01-01'),
        saleDate: d('2026-01-02'),
        profit: 5000,
        tagIds: ['b'],
      }),
    ];
    const achievement = find(evaluateAchievements(records), 'tag_synergy');
    expect(achievement?.completed).toBe(false);
    expect(achievement?.current).toBe(2);
    expect(achievement?.completedRecords).toEqual([]);
  });

  it('タグの達人（★5）はしきい値が¥10,000で、タグの総合力とは独立に判定される', () => {
    const records = [
      record({
        saleStartDate: d('2026-01-01'),
        saleDate: d('2026-01-01'),
        profit: 5000,
        tagIds: ['a'],
      }),
      record({
        saleStartDate: d('2026-01-01'),
        saleDate: d('2026-01-02'),
        profit: 5000,
        tagIds: ['b'],
      }),
      record({
        saleStartDate: d('2026-01-01'),
        saleDate: d('2026-01-03'),
        profit: 5000,
        tagIds: ['c'],
      }),
    ];
    const achievements = evaluateAchievements(records);
    // 3 タグとも¥5,000は超えているので総合力は達成、達人（¥10,000）は未達成
    expect(find(achievements, 'tag_synergy')?.completed).toBe(true);
    expect(find(achievements, 'tag_mastery')?.completed).toBe(false);
    expect(find(achievements, 'tag_mastery')?.current).toBe(0);
  });

  it('旧「タグマスター」「全タグ制覇」は AchievementId から削除されている（種類数ベースからの置き換え）', () => {
    const ids = evaluateAchievements([]).map((a) => a.id);
    expect(ids).not.toContain('tag_master');
    expect(ids).not.toContain('tag_all_conquest');
    expect(ids).toContain('tag_synergy');
    expect(ids).toContain('tag_mastery');
  });
});

describe('evaluateAchievements（特殊実績: 販売テクニック系・長期戦突破）', () => {
  it('出品日→販売日が30日以上の売却済み記録が1件あれば達成する', () => {
    const records = [
      record({
        saleStartDate: d('2026-01-01'),
        saleDate: d('2026-01-31'), // ちょうど30日
        profit: 100,
      }),
    ];
    const achievement = find(evaluateAchievements(records), 'long_battle');
    expect(achievement?.completed).toBe(true);
    expect(achievement?.completedAt).toEqual(d('2026-01-31'));
    expect(achievement?.completedRecord?.id).toBe(records[0].id);
    expect(achievement?.current).toBe(1);
    expect(achievement?.target).toBe(1);
  });

  it('経過日数が30日未満なら未達成', () => {
    const records = [
      record({
        saleStartDate: d('2026-01-01'),
        saleDate: d('2026-01-30'), // 29日
        profit: 100,
      }),
    ];
    const achievement = find(evaluateAchievements(records), 'long_battle');
    expect(achievement?.completed).toBe(false);
    expect(achievement?.current).toBe(0);
    expect(achievement?.completedAt).toBeNull();
    expect(achievement?.completedRecord).toBeNull();
  });

  it('日付逆転（販売日が出品日より前）の記録は判定から除外する', () => {
    const records = [
      record({
        saleStartDate: d('2026-02-10'),
        saleDate: d('2026-01-01'), // 経過日数が負
        profit: 100,
      }),
    ];
    const achievement = find(evaluateAchievements(records), 'long_battle');
    expect(achievement?.completed).toBe(false);
    expect(achievement?.current).toBe(0);
  });

  it('複数件のうち、しきい値に届く最初の販売日の記録で達成する', () => {
    const records = [
      record({
        saleStartDate: d('2026-01-01'),
        saleDate: d('2026-01-10'), // 9日・未達成
        profit: 100,
      }),
      record({
        saleStartDate: d('2026-01-01'),
        saleDate: d('2026-02-05'), // 35日・達成
        profit: 100,
        id: 'long-battle-hit',
      }),
    ];
    const achievement = find(evaluateAchievements(records), 'long_battle');
    expect(achievement?.completed).toBe(true);
    expect(achievement?.completedRecord?.id).toBe('long-battle-hit');
  });
});

describe('evaluateAchievements（特殊実績: 販売テクニック系・即売れ）', () => {
  it('出品日→販売日の経過日数が0日（同日中に売れた）の売却済み記録が1件あれば達成する', () => {
    const records = [
      record({
        saleStartDate: d('2026-01-01'),
        saleDate: d('2026-01-01'), // 0日
        profit: 100,
      }),
    ];
    const achievement = find(evaluateAchievements(records), 'instant_sale');
    expect(achievement?.completed).toBe(true);
    expect(achievement?.completedAt).toEqual(d('2026-01-01'));
    expect(achievement?.completedRecord?.id).toBe(records[0].id);
    expect(achievement?.current).toBe(1);
    expect(achievement?.target).toBe(1);
  });

  it('経過日数が1日以上なら未達成', () => {
    const records = [
      record({
        saleStartDate: d('2026-01-01'),
        saleDate: d('2026-01-02'), // 1日
        profit: 100,
      }),
    ];
    const achievement = find(evaluateAchievements(records), 'instant_sale');
    expect(achievement?.completed).toBe(false);
    expect(achievement?.current).toBe(0);
    expect(achievement?.completedAt).toBeNull();
    expect(achievement?.completedRecord).toBeNull();
  });

  it('日付逆転（販売日が出品日より前）の記録は判定から除外する', () => {
    const records = [
      record({
        saleStartDate: d('2026-02-10'),
        saleDate: d('2026-01-01'), // 経過日数が負
        profit: 100,
      }),
    ];
    const achievement = find(evaluateAchievements(records), 'instant_sale');
    expect(achievement?.completed).toBe(false);
    expect(achievement?.current).toBe(0);
  });

  it('複数件のうち、最初に0日で売れた記録で達成する', () => {
    const records = [
      record({
        saleStartDate: d('2026-01-01'),
        saleDate: d('2026-01-05'), // 4日・未達成
        profit: 100,
      }),
      record({
        saleStartDate: d('2026-02-01'),
        saleDate: d('2026-02-01'), // 0日・達成
        profit: 100,
        id: 'instant-sale-hit',
      }),
    ];
    const achievement = find(evaluateAchievements(records), 'instant_sale');
    expect(achievement?.completed).toBe(true);
    expect(achievement?.completedRecord?.id).toBe('instant-sale-hit');
  });
});

describe('evaluateAchievements（特殊実績: その他・有言実行/目標マスター）', () => {
  it('目標利益が設定され、実際の純利益がそれ以上の売却済み記録が1件あれば有言実行が達成する', () => {
    const records = [
      record({
        saleStartDate: d('2026-01-01'),
        saleDate: d('2026-01-05'),
        profit: 600,
        targetProfit: 500,
      }),
    ];
    const achievement = find(evaluateAchievements(records), 'goal_kept');
    expect(achievement?.completed).toBe(true);
    expect(achievement?.completedAt).toEqual(d('2026-01-05'));
    expect(achievement?.completedRecord?.id).toBe(records[0].id);
    expect(achievement?.current).toBe(1);
    expect(achievement?.target).toBe(1);
  });

  it('純利益がちょうど目標利益と同額でも達成扱い（境界値）', () => {
    const records = [
      record({
        saleStartDate: d('2026-01-01'),
        saleDate: d('2026-01-05'),
        profit: 500,
        targetProfit: 500,
      }),
    ];
    expect(find(evaluateAchievements(records), 'goal_kept')?.completed).toBe(
      true,
    );
  });

  it('実際の純利益が目標利益未満なら有言実行は未達成', () => {
    const records = [
      record({
        saleStartDate: d('2026-01-01'),
        saleDate: d('2026-01-05'),
        profit: 400,
        targetProfit: 500,
      }),
    ];
    const achievement = find(evaluateAchievements(records), 'goal_kept');
    expect(achievement?.completed).toBe(false);
    expect(achievement?.current).toBe(0);
  });

  it('目標利益が未設定（null）の記録は有言実行の判定から除外する', () => {
    const records = [
      record({
        saleStartDate: d('2026-01-01'),
        saleDate: d('2026-01-05'),
        profit: 100000, // 目標がなければ、どれだけ稼いでも対象外
      }),
    ];
    const achievement = find(evaluateAchievements(records), 'goal_kept');
    expect(achievement?.completed).toBe(false);
    expect(achievement?.current).toBe(0);
  });

  it('目標マスターは、条件を満たす記録が10件未満なら未達成', () => {
    const records = Array.from({ length: 9 }, (_, i) =>
      record({
        saleStartDate: d('2026-01-01'),
        saleDate: new Date(2026, 0, i + 1),
        profit: 600,
        targetProfit: 500,
      }),
    );
    const achievement = find(evaluateAchievements(records), 'goal_master');
    expect(achievement?.completed).toBe(false);
    expect(achievement?.current).toBe(9);
    expect(achievement?.target).toBe(10);
  });

  it('条件を満たす記録が10件になった時点で目標マスターが達成し、10件目の記録が達成した記録になる', () => {
    const records = Array.from({ length: 10 }, (_, i) =>
      record({
        saleStartDate: d('2026-01-01'),
        saleDate: new Date(2026, 0, i + 1),
        profit: 600,
        targetProfit: 500,
        id: `goal-${i}`,
      }),
    );
    const achievement = find(evaluateAchievements(records), 'goal_master');
    expect(achievement?.completed).toBe(true);
    expect(achievement?.current).toBe(10);
    expect(achievement?.completedRecord?.id).toBe('goal-9');
    expect(achievement?.completedRecords).toHaveLength(10);
  });

  it('有言実行と目標マスターは同じ抽出ロジックを共有しつつ、しきい値は独立して判定する', () => {
    const records = [
      record({
        saleStartDate: d('2026-01-01'),
        saleDate: d('2026-01-05'),
        profit: 600,
        targetProfit: 500,
      }),
    ];
    const achievements = evaluateAchievements(records);
    expect(find(achievements, 'goal_kept')?.completed).toBe(true);
    expect(find(achievements, 'goal_master')?.completed).toBe(false);
  });
});

describe('evaluateAchievements（特殊実績: その他・なんでも屋）', () => {
  it('仕入品（purchasePrice>0）・不用品（purchasePrice=0）両方でプラス純利益の記録があれば達成する', () => {
    const records = [
      record({
        saleStartDate: d('2026-01-01'),
        saleDate: d('2026-01-05'),
        profit: 500,
        salesPrice: 2000, // purchasePrice = 1500（仕入品）
        id: 'sourced-1',
      }),
      record({
        saleStartDate: d('2026-01-01'),
        saleDate: d('2026-01-10'),
        profit: 300, // purchasePrice = 0（不用品）
        id: 'used-1',
      }),
    ];
    const achievement = find(evaluateAchievements(records), 'all_rounder');
    expect(achievement?.completed).toBe(true);
    expect(achievement?.current).toBe(2);
    expect(achievement?.target).toBe(2);
    // 後から条件が揃った方（日付の遅い方）の記録が達成日・達成した記録になる
    expect(achievement?.completedAt).toEqual(d('2026-01-10'));
    expect(achievement?.completedRecord?.id).toBe('used-1');
    expect(achievement?.completedRecords.map((r) => r.id)).toEqual([
      'sourced-1',
      'used-1',
    ]);
  });

  it('仕入品のプラス利益しかなければ未達成', () => {
    const records = [
      record({
        saleStartDate: d('2026-01-01'),
        saleDate: d('2026-01-05'),
        profit: 500,
        salesPrice: 2000,
      }),
    ];
    const achievement = find(evaluateAchievements(records), 'all_rounder');
    expect(achievement?.completed).toBe(false);
    expect(achievement?.current).toBe(1);
  });

  it('不用品のプラス利益しかなければ未達成', () => {
    const records = [
      record({
        saleStartDate: d('2026-01-01'),
        saleDate: d('2026-01-05'),
        profit: 300,
      }),
    ];
    const achievement = find(evaluateAchievements(records), 'all_rounder');
    expect(achievement?.completed).toBe(false);
    expect(achievement?.current).toBe(1);
  });

  it('仕入品が赤字の場合は仕入品側の条件を満たさない（不用品が黒字でも未達成）', () => {
    const records = [
      record({
        saleStartDate: d('2026-01-01'),
        saleDate: d('2026-01-05'),
        profit: -100,
        salesPrice: 2000, // purchasePrice = 2100（仕入品だが赤字）
      }),
      record({
        saleStartDate: d('2026-01-01'),
        saleDate: d('2026-01-10'),
        profit: 300,
      }),
    ];
    const achievement = find(evaluateAchievements(records), 'all_rounder');
    expect(achievement?.completed).toBe(false);
    expect(achievement?.current).toBe(1);
  });
});

describe('evaluateAchievements（成長系: ⚡一撃 全5段階の境界値）', () => {
  it('★1〜★5（¥1,000/5,000/10,000/30,000/50,000）は、そのしきい値以上の記録が現れた最初の販売日で達成する', () => {
    const records = [
      record({
        saleStartDate: d('2026-01-01'),
        saleDate: d('2026-01-05'),
        profit: 800,
      }),
      record({
        saleStartDate: d('2026-01-01'),
        saleDate: d('2026-01-10'),
        profit: 1200,
      }),
      record({
        saleStartDate: d('2026-01-01'),
        saleDate: d('2026-01-15'),
        profit: 30000,
      }),
    ];
    const achievements = evaluateAchievements(records);

    const profit1000 = find(achievements, 'profit_1000');
    expect(profit1000?.completed).toBe(true);
    expect(profit1000?.completedAt).toEqual(d('2026-01-10'));

    const profit5000 = find(achievements, 'profit_5000');
    expect(profit5000?.completed).toBe(true);
    expect(profit5000?.completedAt).toEqual(d('2026-01-15'));

    const profit10000 = find(achievements, 'profit_10000');
    expect(profit10000?.completed).toBe(true);

    const profit30000 = find(achievements, 'profit_30000');
    expect(profit30000?.completed).toBe(true);
    expect(profit30000?.completedAt).toEqual(d('2026-01-15'));

    const profit50000 = find(achievements, 'profit_50000');
    expect(profit50000?.completed).toBe(false);
    expect(profit50000?.current).toBe(30000);
  });

  it('しきい値ちょうどは達成、1円未満は未達成（境界値）', () => {
    const exact = find(
      evaluateAchievements(soldRecordsWithProfits([30000])),
      'profit_30000',
    );
    expect(exact?.completed).toBe(true);

    const short = find(
      evaluateAchievements(soldRecordsWithProfits([29999])),
      'profit_30000',
    );
    expect(short?.completed).toBe(false);
    expect(short?.current).toBe(29999);
  });
});

describe('strikeAchievementsByRecordId（記録一覧・記録詳細のバッジが使う。重複表示を避ける）', () => {
  it('しきい値を単に超えているだけの記録にはバッジを付けない。最初に届いた記録だけが対象', () => {
    // r1(¥2,000) が最初に⚡一撃★1(¥1,000)へ届く。r3(¥3,000) も¥1,000を超えているが、
    // 実際に「達成した記録」（completedRecord）になるのは最初の r1 だけ ── r3 にはバッジを付けない
    // （記録単体の純利益だけを見ると全員バッジが付いてしまう、という重複表示のバグの再現ケース）
    const records = [
      record({ saleStartDate: d('2026-01-01'), saleDate: d('2026-01-01'), profit: 2000, id: 'r1' }),
      record({ saleStartDate: d('2026-01-01'), saleDate: d('2026-01-02'), profit: 6000, id: 'r2' }),
      record({ saleStartDate: d('2026-01-01'), saleDate: d('2026-01-03'), profit: 3000, id: 'r3' }),
    ];
    const badges = strikeAchievementsByRecordId(evaluateAchievements(records));

    // r1: ⚡一撃★1（¥1,000）に最初に届いた記録
    expect(badges.get('r1')?.id).toBe('profit_1000');
    // r2: ⚡一撃★2（¥5,000）に最初に届いた記録（★1 は r1 が先に取っている）
    expect(badges.get('r2')?.id).toBe('profit_5000');
    // r3: ¥1,000は超えているが、その段階はすでに r1 が「達成した記録」になっているので対象外
    expect(badges.has('r3')).toBe(false);
    expect(badges.size).toBe(2);
  });

  it('1 件の記録が複数の段階の completedRecord を兼ねるときは、最高難易度のものだけを持たせる', () => {
    // 唯一の売却済み記録（純利益¥35,000）は⚡一撃★1〜★4 すべての「達成した記録」を兼ねる
    const records = [
      record({ saleStartDate: d('2026-01-01'), saleDate: d('2026-03-01'), profit: 35000, id: 'r1' }),
    ];
    const badges = strikeAchievementsByRecordId(evaluateAchievements(records));

    expect(badges.size).toBe(1);
    expect(badges.get('r1')?.id).toBe('profit_30000');
  });

  it('純利益¥1,000未満の記録は誰の completedRecord にもならないので、対応表に現れない', () => {
    const records = [
      record({ saleStartDate: d('2026-01-01'), saleDate: d('2026-01-01'), profit: 999, id: 'r1' }),
    ];
    const badges = strikeAchievementsByRecordId(evaluateAchievements(records));
    expect(badges.size).toBe(0);
  });

  it('達成した実績が 1 つも無ければ空の対応表', () => {
    expect(strikeAchievementsByRecordId(evaluateAchievements([])).size).toBe(0);
  });

  it('対応表の Achievement は completedRecord がその記録そのものを指す（全画面表示の内容と一致する）', () => {
    const records = [
      record({
        saleStartDate: d('2026-01-01'),
        saleDate: d('2026-05-10'),
        profit: 12000,
        id: 'r42',
        itemName: 'ヴィンテージ腕時計',
      }),
    ];
    const achievement = strikeAchievementsByRecordId(evaluateAchievements(records)).get('r42');
    expect(achievement?.completedAt).toEqual(d('2026-05-10'));
    expect(achievement?.completedRecord).toEqual({
      id: 'r42',
      itemName: 'ヴィンテージ腕時計',
      netProfit: 12000,
      saleDate: d('2026-05-10'),
      tagId: null,
    });
  });
});

describe('evaluateAchievements（成長系: 💰累計利益 全5段階の境界値。⚡一撃・特殊実績の累計¥1,000とは独立）', () => {
  it('★1（¥10,000）は累計純利益が¥10,000に届いた記録の販売日で達成する', () => {
    const records = soldRecordsWithProfits([5000, 5000]);
    const achievement = find(
      evaluateAchievements(records),
      'career_profit_10000',
    );
    expect(achievement?.completed).toBe(true);
    expect(achievement?.completedAt).toEqual(new Date(2026, 0, 2));
  });

  it('★5（¥1,000,000。利益ハンター）は累計100万到達で達成する', () => {
    const records = [
      record({
        saleStartDate: d('2026-01-01'),
        saleDate: d('2026-01-01'),
        profit: 600000,
      }),
      record({
        saleStartDate: d('2026-01-01'),
        saleDate: d('2026-02-01'),
        profit: 500000,
      }),
    ];
    const achievement = find(
      evaluateAchievements(records),
      'career_profit_1000000',
    );
    expect(achievement?.completed).toBe(true);
    expect(achievement?.completedAt).toEqual(d('2026-02-01'));
  });

  it('小さい記録を積み重ねても⚡一撃は達成しないが、💰累計利益（成長系★1）は合計で達成する', () => {
    // 500円 × 3 件 = 累計1500円。単体ではどの⚡一撃しきい値（¥1,000〜）にも届かない
    const records = soldRecordsWithProfits([500, 500, 500]);
    const achievements = evaluateAchievements(records);
    expect(find(achievements, 'profit_1000')?.completed).toBe(false);
    // 累計¥1,000（特殊実績）も同じ理屈で合計だけで達成する
    expect(find(achievements, 'career_profit_1000')?.completed).toBe(true);
  });

  it('逆に 1 件で⚡一撃を達成しても、累計が閾値未満なら💰累計利益（成長系）は未達成', () => {
    // 1件で¥5,000（⚡一撃★2 達成）だが、他に赤字が続き累計は¥10,000未満
    const records = [
      record({
        saleStartDate: d('2026-01-01'),
        saleDate: d('2026-01-01'),
        profit: 5000,
      }),
      record({
        saleStartDate: d('2026-01-01'),
        saleDate: d('2026-01-02'),
        profit: -1000,
      }),
    ];
    const achievements = evaluateAchievements(records);
    expect(find(achievements, 'profit_5000')?.completed).toBe(true);
    expect(find(achievements, 'career_profit_10000')?.completed).toBe(false);
    expect(find(achievements, 'career_profit_10000')?.current).toBe(4000);
  });
});

describe('evaluateAchievements（成長系: 📦販売件数 全5段階の境界値）', () => {
  it('★1（1件）は 1 件目の販売日で達成する', () => {
    const records = [
      record({
        saleStartDate: d('2026-01-01'),
        saleDate: d('2026-01-01'),
        profit: 10,
      }),
    ];
    expect(find(evaluateAchievements(records), 'sold_1')?.completed).toBe(true);
  });

  it('★2〜★4（10/50/250件）は N 件目に売れた記録の販売日で達成する', () => {
    const records = soldRecordsWithProfits(
      Array.from({ length: 250 }, () => 10),
    );
    const achievements = evaluateAchievements(records);

    const sold10 = find(achievements, 'sold_10');
    expect(sold10?.completed).toBe(true);
    expect(sold10?.completedAt).toEqual(new Date(2026, 0, 10));

    const sold50 = find(achievements, 'sold_50');
    expect(sold50?.completed).toBe(true);

    const sold250 = find(achievements, 'sold_250');
    expect(sold250?.completed).toBe(true);
    expect(sold250?.completedAt).toEqual(new Date(2026, 8, 7));

    const sold500 = find(achievements, 'sold_500');
    expect(sold500?.completed).toBe(false);
    expect(sold500?.current).toBe(250);
  });

  it('★5（500件）は 500 件目の販売日で達成する', () => {
    const records = soldRecordsWithProfits(
      Array.from({ length: 500 }, () => 1),
    );
    const achievement = find(evaluateAchievements(records), 'sold_500');
    expect(achievement?.completed).toBe(true);
    expect(achievement?.current).toBe(500);
  });
});

describe('evaluateAchievements（成長系: 🎯得意分野 全5段階の境界値）', () => {
  it('★3（¥10,000）は 1 タグの累計純利益が¥10,000に届いた最初の記録で達成する', () => {
    const records = [
      record({
        saleStartDate: d('2026-01-01'),
        saleDate: d('2026-01-01'),
        profit: 6000,
        tagIds: ['a'],
      }),
      record({
        saleStartDate: d('2026-01-01'),
        saleDate: d('2026-01-05'),
        profit: 5000,
        tagIds: ['a'],
      }),
      // 別タグは合算しない
      record({
        saleStartDate: d('2026-01-01'),
        saleDate: d('2026-01-10'),
        profit: 9000,
        tagIds: ['b'],
      }),
    ];
    const achievement = find(
      evaluateAchievements(records),
      'tag_specialty_10000',
    );
    expect(achievement?.completed).toBe(true);
    expect(achievement?.completedAt).toEqual(d('2026-01-05'));
    expect(achievement?.current).toBe(10000);
  });

  it('★1（¥1,000）〜★5（¥100,000）は段階ごとに独立して判定される', () => {
    const records = [
      record({
        saleStartDate: d('2026-01-01'),
        saleDate: d('2026-01-01'),
        profit: 1000,
        tagIds: ['a'],
      }),
      record({
        saleStartDate: d('2026-01-01'),
        saleDate: d('2026-01-02'),
        profit: 4000,
        tagIds: ['a'],
      }),
    ];
    // タグ a の累計は 5000 円: ★1(1000)★2(5000) は達成、★3(10000) 以上は未達成
    const achievements = evaluateAchievements(records);
    expect(find(achievements, 'tag_specialty_1000')?.completed).toBe(true);
    expect(find(achievements, 'tag_specialty_5000')?.completed).toBe(true);
    expect(find(achievements, 'tag_specialty_10000')?.completed).toBe(false);
    expect(find(achievements, 'tag_specialty_50000')?.completed).toBe(false);
    expect(find(achievements, 'tag_specialty_100000')?.completed).toBe(false);
  });
});

describe('evaluateAchievements（成長系: 🔍売れ筋 全5段階の境界値）', () => {
  it('★2（10件）は 1 タグの売却済み件数が 10 件に届いた記録で達成する', () => {
    const records = Array.from({ length: 10 }, (_, i) =>
      record({
        saleStartDate: d('2026-01-01'),
        saleDate: new Date(2026, 0, i + 1),
        profit: 10,
        tagIds: ['a'],
      }),
    );
    const achievement = find(
      evaluateAchievements(records),
      'tag_bestseller_10',
    );
    expect(achievement?.completed).toBe(true);
    expect(achievement?.completedAt).toEqual(new Date(2026, 0, 10));
  });

  it('★1（3件）〜★5（100件）は段階ごとに独立して判定される', () => {
    const records = Array.from({ length: 25 }, (_, i) =>
      record({
        saleStartDate: d('2026-01-01'),
        saleDate: new Date(2026, 0, i + 1),
        profit: 10,
        tagIds: ['a'],
      }),
    );
    const achievements = evaluateAchievements(records);
    expect(find(achievements, 'tag_bestseller_3')?.completed).toBe(true);
    expect(find(achievements, 'tag_bestseller_10')?.completed).toBe(true);
    expect(find(achievements, 'tag_bestseller_25')?.completed).toBe(true);
    expect(find(achievements, 'tag_bestseller_50')?.completed).toBe(false);
    expect(find(achievements, 'tag_bestseller_50')?.current).toBe(25);
    expect(find(achievements, 'tag_bestseller_100')?.completed).toBe(false);
  });
});

describe('Achievement.completedRecords（達成に関与した記録すべて。全画面表示のアコーディオン用）', () => {
  it('「一撃」（単発の実績）は completedRecord と同じ 1 件だけの配列になる', () => {
    const records = soldRecordsWithProfits([1000, 5000]);
    const achievement = find(evaluateAchievements(records), 'profit_1000');
    expect(achievement?.completedRecords).toHaveLength(1);
    expect(achievement?.completedRecords[0].id).toBe(
      achievement?.completedRecord?.id,
    );
    // タグに紐づかない実績なので tagId は null
    expect(achievement?.completedRecords[0].tagId).toBeNull();
    expect(achievement?.completedRecord?.tagId).toBeNull();
  });

  it('未達成は completedRecords が空配列になる', () => {
    const achievement = find(evaluateAchievements([]), 'profit_1000');
    expect(achievement?.completedRecords).toEqual([]);
  });

  it('💰累計利益は、しきい値に届くまでの全記録（販売日の昇順）が入る', () => {
    // 400 + 400 + 400 = 1200 で ¥1,000 に到達 → 3 件とも contributing
    const records = soldRecordsWithProfits([400, 400, 400]);
    const achievement = find(
      evaluateAchievements(records),
      'career_profit_1000',
    );
    expect(achievement?.completed).toBe(true);
    expect(achievement?.completedRecords).toHaveLength(3);
    expect(achievement?.completedRecords.map((r) => r.netProfit)).toEqual([
      400, 400, 400,
    ]);
    // 最後の要素が completedRecord と一致する（しきい値に届いた瞬間の記録）
    expect(achievement?.completedRecords[2].id).toBe(
      achievement?.completedRecord?.id,
    );
  });

  it('📦販売件数は、しきい値件数ぶんの売却済み記録（販売日の昇順）が入る', () => {
    const records = soldRecordsWithProfits([100, 100, 100, 100, 100]);
    const achievement = find(evaluateAchievements(records), 'sold_1');
    expect(achievement?.completedRecords).toHaveLength(1);

    const sold10Locked = find(evaluateAchievements(records), 'sold_10');
    expect(sold10Locked?.completed).toBe(false);
    expect(sold10Locked?.completedRecords).toEqual([]);
  });

  it('🎯得意分野は、最初にしきい値へ届いたタグの記録だけが入る（他タグは含まない）', () => {
    const records = [
      record({
        saleStartDate: d('2026-01-01'),
        saleDate: new Date(2026, 0, 1),
        profit: 1000,
        tagIds: ['a'],
      }),
      record({
        saleStartDate: d('2026-01-01'),
        saleDate: new Date(2026, 0, 2),
        profit: 999,
        tagIds: ['b'],
      }),
    ];
    const achievement = find(
      evaluateAchievements(records),
      'tag_specialty_1000',
    );
    expect(achievement?.completed).toBe(true);
    expect(achievement?.completedRecords).toHaveLength(1);
    expect(achievement?.completedRecords[0].netProfit).toBe(1000);
    // 到達したのはタグ a なので、その tagId が付く（他タグの b ではない）
    expect(achievement?.completedRecords[0].tagId).toBe('a');
    expect(achievement?.completedRecord?.tagId).toBe('a');
  });

  it('🔍売れ筋は、しきい値件数に届いたタグの記録だけがしきい値件数ぶん入る', () => {
    const records = Array.from({ length: 5 }, (_, i) =>
      record({
        saleStartDate: d('2026-01-01'),
        saleDate: new Date(2026, 0, i + 1),
        profit: 10,
        tagIds: ['a'],
      }),
    );
    const achievement = find(evaluateAchievements(records), 'tag_bestseller_3');
    expect(achievement?.completedRecords).toHaveLength(3);
    expect(
      achievement?.completedRecords.every((r) => r.tagId === 'a'),
    ).toBe(true);
  });

  it('タグの総合力は、しきい値に届いた3タグぶんの記録だけが入る（届いていないタグは含まない）', () => {
    const records = [
      record({
        saleStartDate: d('2026-01-01'),
        saleDate: d('2026-01-01'),
        profit: 5000,
        tagIds: ['a'],
      }),
      record({
        saleStartDate: d('2026-01-01'),
        saleDate: d('2026-01-02'),
        profit: 5000,
        tagIds: ['b'],
      }),
      record({
        saleStartDate: d('2026-01-01'),
        saleDate: d('2026-01-03'),
        profit: 5000,
        tagIds: ['c'],
      }),
      // タグ d は¥5,000に届かない → completedRecords に入らない
      record({
        saleStartDate: d('2026-01-01'),
        saleDate: d('2026-01-04'),
        profit: 100,
        tagIds: ['d'],
      }),
    ];
    const achievement = find(evaluateAchievements(records), 'tag_synergy');
    expect(achievement?.completed).toBe(true);
    expect(achievement?.completedRecords).toHaveLength(3);
    expect(
      achievement?.completedRecords.some((r) => r.netProfit === 100),
    ).toBe(false);
    // タグごとにまとまって並ぶ（到達が早い順: a → b → c）。全画面表示のグループ分けに使う tagId
    expect(achievement?.completedRecords.map((r) => r.tagId)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('タグの達人は、1 タグが複数記録の積み上げでしきい値に届いても、その全記録が同じ tagId でまとまる', () => {
    const records = [
      // タグ a: 6000 + 5000 = ¥11,000 で¥10,000到達（2 件必要）
      record({
        saleStartDate: d('2026-01-01'),
        saleDate: d('2026-01-01'),
        profit: 6000,
        tagIds: ['a'],
      }),
      record({
        saleStartDate: d('2026-01-01'),
        saleDate: d('2026-01-10'),
        profit: 5000,
        tagIds: ['a'],
      }),
      record({
        saleStartDate: d('2026-01-01'),
        saleDate: d('2026-01-11'),
        profit: 10000,
        tagIds: ['b'],
      }),
      record({
        saleStartDate: d('2026-01-01'),
        saleDate: d('2026-01-12'),
        profit: 10000,
        tagIds: ['c'],
      }),
    ];
    const achievement = find(evaluateAchievements(records), 'tag_mastery');
    expect(achievement?.completed).toBe(true);
    expect(achievement?.completedRecords).toHaveLength(4);
    // タグ a の 2 件が連続してまとまり、続けて b・c が並ぶ（タグごとにグループ化されている）
    expect(achievement?.completedRecords.map((r) => r.tagId)).toEqual([
      'a',
      'a',
      'b',
      'c',
    ]);
  });

  it('記録を続けようは、出品中も含む記録のしきい値件数ぶんが入る（netProfit は null）', () => {
    const listingRecords = Array.from({ length: 10 }, (_, i) =>
      listing({ saleStartDate: new Date(2026, 0, i + 1) }),
    );
    const achievement = find(
      evaluateAchievements([], { listingRecords }),
      'record_count_10',
    );
    expect(achievement?.completed).toBe(true);
    expect(achievement?.completedRecords).toHaveLength(10);
    expect(
      achievement?.completedRecords.every((r) => r.netProfit == null),
    ).toBe(true);
  });
});

describe('achievementDifficulty / achievementBadgeTier', () => {
  it('38 種すべてに構成どおりの難易度が割り当たる', () => {
    const expected: Record<
      AchievementId,
      ReturnType<typeof achievementDifficulty>
    > = {
      // 特殊実績: はじめる系
      first_sale: 1,
      sale_debut: 1,
      first_profit: 1,
      career_profit_1000: 2,
      record_count_10: 2,
      // 特殊実績: タグ系
      tag_debut: 1,
      tag_synergy: 4,
      tag_mastery: 5,
      // 特殊実績: その他
      long_battle: 2,
      instant_sale: 2,
      goal_kept: 2,
      goal_master: 2,
      all_rounder: 2,
      // 成長系: ⚡一撃
      profit_1000: 1,
      profit_5000: 2,
      profit_10000: 3,
      profit_30000: 4,
      profit_50000: 5,
      // 成長系: 💰累計利益
      career_profit_10000: 1,
      career_profit_50000: 2,
      career_profit_100000: 3,
      career_profit_500000: 4,
      career_profit_1000000: 5,
      // 成長系: 📦販売件数
      sold_1: 1,
      sold_10: 2,
      sold_50: 3,
      sold_250: 4,
      sold_500: 5,
      // 成長系: 🎯得意分野
      tag_specialty_1000: 1,
      tag_specialty_5000: 2,
      tag_specialty_10000: 3,
      tag_specialty_50000: 4,
      tag_specialty_100000: 5,
      // 成長系: 🔍売れ筋
      tag_bestseller_3: 1,
      tag_bestseller_10: 2,
      tag_bestseller_25: 3,
      tag_bestseller_50: 4,
      tag_bestseller_100: 5,
    };
    for (const [id, difficulty] of Object.entries(expected) as [
      AchievementId,
      ReturnType<typeof achievementDifficulty>,
    ][]) {
      expect(achievementDifficulty(id)).toBe(difficulty);
    }
    // 表そのものが 38 種を網羅していること（増減の取りこぼしを検出する）
    expect(Object.keys(expected)).toHaveLength(38);
  });

  it('★5 相当の実績（成長系 5 ジャンルの頂点 + タグの達人）には difficulty 5・段位 legend が割り当たる', () => {
    const legendIds: AchievementId[] = [
      'profit_50000',
      'career_profit_1000000',
      'sold_500',
      'tag_specialty_100000',
      'tag_bestseller_100',
      'tag_mastery',
    ];
    for (const id of legendIds) {
      expect(achievementDifficulty(id)).toBe(5);
      expect(achievementBadgeTier(id)).toBe('legend');
    }
  });

  it('難易度から段位（ブロンズ〜レジェンド）を導く', () => {
    expect(achievementBadgeTier('first_sale')).toBe('bronze');
    expect(achievementBadgeTier('sold_10')).toBe('silver');
    expect(achievementBadgeTier('sold_50')).toBe('gold');
    expect(achievementBadgeTier('tag_synergy')).toBe('platinum');
    expect(achievementBadgeTier('sold_500')).toBe('legend');
  });
});

describe('sortAchievementsByRecency', () => {
  /** 判定に使う項目だけを埋めた最小限のダミー実績 */
  function achievement(
    id: AchievementId,
    completedAt: Date | null,
  ): Achievement {
    return {
      id,
      target: 1,
      current: completedAt != null ? 1 : 0,
      completed: completedAt != null,
      completedAt,
      completedRecord: null,
      completedRecords: [],
    };
  }

  it('達成日の新しい順（直近が先頭）に並べ替える', () => {
    const sorted = sortAchievementsByRecency([
      achievement('first_sale', d('2026-01-01')),
      achievement('sold_10', d('2026-03-01')),
      achievement('profit_1000', d('2026-02-01')),
    ]);
    expect(sorted.map((a) => a.id)).toEqual([
      'sold_10',
      'profit_1000',
      'first_sale',
    ]);
  });

  it('元の配列は変更しない', () => {
    const original = [
      achievement('first_sale', d('2026-01-01')),
      achievement('sold_10', d('2026-02-01')),
    ];
    const originalOrder = original.map((a) => a.id);
    sortAchievementsByRecency(original);
    expect(original.map((a) => a.id)).toEqual(originalOrder);
  });

  it('未達成（completedAt が null）は末尾に、元の並び順を保ったまま残る', () => {
    const sorted = sortAchievementsByRecency([
      achievement('tag_synergy', null),
      achievement('sold_10', d('2026-02-01')),
      achievement('tag_mastery', null),
      achievement('first_sale', d('2026-03-01')),
    ]);
    expect(sorted.map((a) => a.id)).toEqual([
      'first_sale',
      'sold_10',
      'tag_synergy',
      'tag_mastery',
    ]);
  });
});

describe('selectNextAchievement', () => {
  it('未達成が無ければ null（コンプリート）', () => {
    // 1 件も無い状態からでも、進捗率が最も高い未達成の実績が選ばれる（0 件は「未達成」）
    const achievements = evaluateAchievements([]);
    // すべて未達成なので null にはならない
    expect(selectNextAchievement(achievements)).not.toBeNull();

    const allCompleted = achievements.map((a) => ({ ...a, completed: true }));
    expect(selectNextAchievement(allCompleted)).toBeNull();
  });

  it('進捗率（現在値 ÷ 目標値）が最も高い未達成の実績を選ぶ', () => {
    // 8 件販売（sold_10: 8/10 = 80%）が、利益1000円（0/1000 = 0%）より進捗が高い
    const records = soldRecordsWithProfits(Array.from({ length: 8 }, () => 10));
    const next = selectNextAchievement(evaluateAchievements(records));
    expect(next?.id).toBe('sold_10');
    expect(next?.current).toBe(8);
    expect(next?.target).toBe(10);
  });

  it('実績数が増えても、進捗率最大の 1 件を選ぶ考え方は変わらない（listingRecords 込みでも動く）', () => {
    const listingRecords = Array.from({ length: 9 }, (_, i) =>
      listing({ saleStartDate: new Date(2026, 0, i + 1) }),
    );
    // record_count_10: 9/10 = 90% が他のどの実績よりも高い
    const next = selectNextAchievement(
      evaluateAchievements([], { listingRecords }),
    );
    expect(next?.id).toBe('record_count_10');
  });
});

describe('achievementCategory', () => {
  it('evaluateAchievements が返すすべての id が分類できる（実績を増減させても取りこぼさない）', () => {
    for (const achievement of evaluateAchievements([])) {
      expect(() => achievementCategory(achievement.id)).not.toThrow();
    }
  });

  it('はじめる系は start、タグ系（特殊実績）は tag にまとまる', () => {
    const startIds: AchievementId[] = [
      'first_sale',
      'sale_debut',
      'first_profit',
      'career_profit_1000',
      'record_count_10',
    ];
    for (const id of startIds) {
      expect(achievementCategory(id)).toBe('start');
    }
    const tagIds: AchievementId[] = [
      'tag_debut',
      'tag_synergy',
      'tag_mastery',
    ];
    for (const id of tagIds) {
      expect(achievementCategory(id)).toBe('tag');
    }
  });

  it('長期戦突破・即売れ・有言実行・目標マスター・なんでも屋（その他・特殊実績）は sales_technique にまとまる', () => {
    expect(achievementCategory('long_battle')).toBe('sales_technique');
    expect(achievementCategory('instant_sale')).toBe('sales_technique');
    expect(achievementCategory('goal_kept')).toBe('sales_technique');
    expect(achievementCategory('goal_master')).toBe('sales_technique');
    expect(achievementCategory('all_rounder')).toBe('sales_technique');
  });

  it('成長系の 5 ジャンルはそれぞれ別カテゴリ（🎯得意分野と🔍売れ筋も、色が同じでも別カテゴリ）', () => {
    expect(achievementCategory('profit_1000')).toBe('strike');
    expect(achievementCategory('career_profit_10000')).toBe('career_profit');
    expect(achievementCategory('sold_1')).toBe('sold_count');
    expect(achievementCategory('tag_specialty_1000')).toBe('tag_specialty');
    expect(achievementCategory('tag_bestseller_3')).toBe('tag_bestseller');

    const categories = new Set([
      achievementCategory('profit_1000'),
      achievementCategory('career_profit_10000'),
      achievementCategory('sold_1'),
      achievementCategory('tag_specialty_1000'),
      achievementCategory('tag_bestseller_3'),
      achievementCategory('tag_debut'),
      achievementCategory('first_sale'),
    ]);
    expect(categories.size).toBe(7);
  });
});

describe('groupAchievementsByGenre（実績一覧画面のジャンル別カード）', () => {
  it('8 ジャンル（成長系5 + 特殊実績3）に、順序どおり・過不足なく分ける', () => {
    const sections = groupAchievementsByGenre(evaluateAchievements([]));
    expect(sections.map((section) => section.category)).toEqual([
      'strike',
      'career_profit',
      'sold_count',
      'tag_specialty',
      'tag_bestseller',
      'start',
      'tag',
      'sales_technique',
    ]);
    const total = sections.reduce(
      (sum, section) => sum + section.achievements.length,
      0,
    );
    expect(total).toBe(evaluateAchievements([]).length);
  });

  it('その他は長期戦突破・即売れ・有言実行・目標マスター・なんでも屋の5件で構成する独立セクション（★1〜5の階段構造を持たない）', () => {
    const sections = groupAchievementsByGenre(evaluateAchievements([]));
    const salesTechnique = sections.find(
      (section) => section.category === 'sales_technique',
    );
    expect(salesTechnique?.achievements.map((a) => a.id)).toEqual([
      'long_battle',
      'instant_sale',
      'goal_kept',
      'goal_master',
      'all_rounder',
    ]);
  });

  it('成長系ジャンルは 5 段階（ブロンズ→レジェンド）が難易度昇順で並ぶ', () => {
    const sections = groupAchievementsByGenre(evaluateAchievements([]));
    const strike = sections.find((section) => section.category === 'strike');
    expect(strike?.achievements.map((a) => a.id)).toEqual([
      'profit_1000',
      'profit_5000',
      'profit_10000',
      'profit_30000',
      'profit_50000',
    ]);
    expect(strike?.achievements.map((a) => achievementDifficulty(a.id))).toEqual([
      1, 2, 3, 4, 5,
    ]);
  });

  it('特殊実績（はじめる系・タグ系）も難易度昇順。同点は元の並び順を保つ（安定ソート）', () => {
    const sections = groupAchievementsByGenre(evaluateAchievements([]));
    const start = sections.find((section) => section.category === 'start');
    // first_sale/sale_debut/first_profit は★1で同点。evaluateAchievements の push 順を保つ
    expect(start?.achievements.map((a) => a.id)).toEqual([
      'first_sale',
      'sale_debut',
      'first_profit',
      'career_profit_1000',
      'record_count_10',
    ]);

    const tag = sections.find((section) => section.category === 'tag');
    expect(tag?.achievements.map((a) => a.id)).toEqual([
      'tag_debut',
      'tag_synergy',
      'tag_mastery',
    ]);
  });

  it('達成済み・未達成が混在していても、両方をジャンル内の難易度順で保持する', () => {
    const records = soldRecordsWithProfits([1000, 5000]);
    const sections = groupAchievementsByGenre(evaluateAchievements(records));
    const strike = sections.find((section) => section.category === 'strike');
    expect(strike?.achievements.map((a) => a.completed)).toEqual([
      true,
      true,
      false,
      false,
      false,
    ]);
  });
});

describe('computePersonalBests', () => {
  it('0 件ならすべて null', () => {
    const bests = computePersonalBests([]);
    expect(bests).toEqual({
      bestNetProfit: null,
      bestSalesPrice: null,
      fastestSale: null,
      bestMonthByCount: null,
      bestMonthByProfit: null,
      bestTag: null,
    });
  });

  it('最高純利益・最高販売価格は 1 件の記録の最大値とその日付', () => {
    const records = [
      record({
        saleStartDate: d('2026-01-01'),
        saleDate: d('2026-01-02'),
        profit: 100,
        salesPrice: 1000,
      }),
      record({
        saleStartDate: d('2026-01-01'),
        saleDate: d('2026-05-18'),
        profit: 8400,
        salesPrice: 24800,
      }),
      record({
        saleStartDate: d('2026-01-01'),
        saleDate: d('2026-06-01'),
        profit: 200,
        salesPrice: 500,
      }),
    ];
    const bests = computePersonalBests(records);
    expect(bests.bestNetProfit).toEqual({ value: 8400, date: d('2026-05-18') });
    expect(bests.bestSalesPrice).toEqual({
      value: 24800,
      date: d('2026-05-18'),
    });
  });

  it('最速販売は経過日数の最小値。日付逆転は除外する', () => {
    const records = [
      record({
        saleStartDate: d('2026-01-01'),
        saleDate: d('2026-01-05'),
        profit: 10,
      }), // 4日
      record({
        saleStartDate: d('2026-06-01'),
        saleDate: d('2026-06-03'),
        profit: 10,
      }), // 2日
      // 逆転（販売日が記録日より前）は除外
      record({
        saleStartDate: d('2026-07-10'),
        saleDate: d('2026-07-01'),
        profit: 10,
      }),
    ];
    const bests = computePersonalBests(records);
    expect(bests.fastestSale).toEqual({ days: 2, date: d('2026-06-03') });
  });

  it('当日売却（0日）は逆転ではなく最短候補に含める', () => {
    const records = [
      record({
        saleStartDate: d('2026-01-01'),
        saleDate: d('2026-01-01'),
        profit: 10,
      }),
    ];
    expect(computePersonalBests(records).fastestSale).toEqual({
      days: 0,
      date: d('2026-01-01'),
    });
  });

  it('最多販売月・最高月間利益は月ごとの集計から最大の月を選ぶ', () => {
    const records = [
      record({
        saleStartDate: d('2026-01-01'),
        saleDate: d('2026-08-01'),
        profit: 1000,
      }),
      record({
        saleStartDate: d('2026-01-01'),
        saleDate: d('2026-08-15'),
        profit: 2000,
      }),
      record({
        saleStartDate: d('2026-01-01'),
        saleDate: d('2026-09-01'),
        profit: 50000,
      }),
    ];
    const bests = computePersonalBests(records);
    expect(bests.bestMonthByCount).toEqual({ monthKey: '2026-08', count: 2 });
    expect(bests.bestMonthByProfit).toEqual({
      monthKey: '2026-09',
      amount: 50000,
    });
  });

  it('最多販売タグは未分類（タグなし）も対象に含めて件数最大のものを選ぶ', () => {
    const records = [
      record({
        saleStartDate: d('2026-01-01'),
        saleDate: d('2026-01-01'),
        profit: 10,
        tagIds: ['a'],
      }),
      record({
        saleStartDate: d('2026-01-01'),
        saleDate: d('2026-01-02'),
        profit: 10,
        tagIds: [],
      }),
      record({
        saleStartDate: d('2026-01-01'),
        saleDate: d('2026-01-03'),
        profit: 10,
        tagIds: [],
      }),
      record({
        saleStartDate: d('2026-01-01'),
        saleDate: d('2026-01-04'),
        profit: 10,
        tagIds: [],
      }),
    ];
    expect(computePersonalBests(records).bestTag).toEqual({
      tagId: null,
      count: 3,
    });
  });

  it('複数タグが付いた記録はそれぞれのタグの集計に重複して数える', () => {
    const records = [
      record({
        saleStartDate: d('2026-01-01'),
        saleDate: d('2026-01-01'),
        profit: 10,
        tagIds: ['a', 'b'],
      }),
      record({
        saleStartDate: d('2026-01-01'),
        saleDate: d('2026-01-02'),
        profit: 10,
        tagIds: ['a'],
      }),
    ];
    expect(computePersonalBests(records).bestTag).toEqual({
      tagId: 'a',
      count: 2,
    });
  });
});

describe('newlyCompletedAchievements（保存トーストの新規獲得検出）', () => {
  it('保存前は未達成・保存後は達成になった実績だけを返す', () => {
    const records = [
      record({ saleStartDate: d('2026-01-01'), saleDate: d('2026-01-02'), profit: 100 }),
    ];
    const before = evaluateAchievements([]);
    const after = evaluateAchievements(records);

    const newly = newlyCompletedAchievements(before, after);

    expect(newly.length).toBeGreaterThan(0);
    expect(newly.every((a) => a.completed)).toBe(true);
    expect(newly.map((a) => a.id)).toContain('first_profit');
  });

  it('保存前後で達成状態が変わらない実績は含まない', () => {
    const records = [
      record({ saleStartDate: d('2026-01-01'), saleDate: d('2026-01-02'), profit: 100 }),
    ];
    const before = evaluateAchievements(records);
    const after = evaluateAchievements(records);

    expect(newlyCompletedAchievements(before, after)).toHaveLength(0);
  });

  it('before が全滅（0件）でも after 側の達成済みをすべて拾う', () => {
    const before: Achievement[] = [];
    const records = [
      record({ saleStartDate: d('2026-01-01'), saleDate: d('2026-01-02'), profit: 100 }),
    ];
    const after = evaluateAchievements(records);

    const newly = newlyCompletedAchievements(before, after);

    expect(newly).toEqual(after.filter((a) => a.completed));
  });
});
