// SPEC-V4 §7.3 の方針にある recordFilter の単体テスト:
//   - activeFilterCount（0〜3。タグを何個選んでも 1 本）
//   - filterSummaryText（0 件は null / 1 件 / タグ 2 つの畳み込み / 末尾の「の N件だけ」）
//   - clearAll が期間・検索・並び替えを動かさないこと
//   - effectiveFilter（出品中では販売サイトが効かない。§4.2）
//   - pruneMissingTags（消えたタグを落とす。§4.7）

import { describe, expect, it } from 'vitest';

import type { Tag } from '@/db/schema';

import {
  activeFilterCount,
  clearAll,
  effectiveFilter,
  EMPTY_RECORD_FILTER,
  filterSummaryText,
  hasActiveFilter,
  pruneMissingTags,
  toFilterConditions,
  type RecordFilterDraft,
} from './recordFilter';

const clothes: Tag = { id: 't1', name: '洋服', colorKey: 'red', sortOrder: 0 };
const summer: Tag = { id: 't2', name: '春夏物', colorKey: 'blue', sortOrder: 1 };
const books: Tag = { id: 't3', name: '本', colorKey: 'green', sortOrder: 2 };
const tags = [clothes, summer, books];

const draft = (over: Partial<RecordFilterDraft> = {}): RecordFilterDraft => ({
  ...EMPTY_RECORD_FILTER,
  ...over,
});

describe('§4.1 activeFilterCount: 条件の本数を数える（決定 §9-2）', () => {
  it('何も絞り込んでいなければ 0', () => {
    expect(activeFilterCount(EMPTY_RECORD_FILTER)).toBe(0);
    expect(hasActiveFilter(EMPTY_RECORD_FILTER)).toBe(false);
  });

  it('種別・販売サイト・タグでそれぞれ 1 本ずつ', () => {
    expect(activeFilterCount(draft({ kind: 'sourced' }))).toBe(1);
    expect(activeFilterCount(draft({ siteName: 'メルカリ' }))).toBe(1);
    expect(activeFilterCount(draft({ tagIds: [clothes.id] }))).toBe(1);
  });

  it('タグを 3 つ選んでも OR なので条件としては 1 本', () => {
    expect(activeFilterCount(draft({ tagIds: [clothes.id, summer.id, books.id] }))).toBe(1);
  });

  it('3 条件すべてで 3（最大）', () => {
    const filter = draft({ kind: 'used', siteName: 'メルカリ', tagIds: [clothes.id, summer.id] });

    expect(activeFilterCount(filter)).toBe(3);
    expect(hasActiveFilter(filter)).toBe(true);
  });
});

describe('§4.3 filterSummaryText: 絞り込み中の青い行の文言（案 34a-C）', () => {
  it('0 件なら null（行ごと出さない）', () => {
    expect(filterSummaryText(EMPTY_RECORD_FILTER, tags, 0)).toBeNull();
  });

  it('種別だけ。末尾は件数を含む「の N件だけ」', () => {
    expect(filterSummaryText(draft({ kind: 'sourced' }), tags, 14)).toBe('仕入品の14件だけ');
  });

  it('販売サイトは種類まで言う（名前だけでは何の名前か読めない）', () => {
    expect(filterSummaryText(draft({ siteName: 'メルカリ' }), tags, 3)).toBe(
      '販売サイト「メルカリ」の3件だけ',
    );
  });

  it('タグ 1 つ', () => {
    expect(filterSummaryText(draft({ tagIds: [clothes.id] }), tags, 2)).toBe('タグ「洋服」の2件だけ');
  });

  it('タグ 2 つ以上は「ほか N件」に畳む（末尾の件数とは別物）', () => {
    expect(filterSummaryText(draft({ tagIds: [clothes.id, summer.id, books.id] }), tags, 9)).toBe(
      'タグ「洋服」ほか2件の9件だけ',
    );
  });

  it('0 件に絞られても行は出る（条件が効いている事実は消えない）', () => {
    expect(filterSummaryText(draft({ kind: 'sourced' }), tags, 0)).toBe('仕入品の0件だけ');
  });

  it('3 条件は「・」で連なり、並ぶ数は activeFilterCount と一致する', () => {
    const filter = draft({ kind: 'sourced', siteName: 'メルカリ', tagIds: [clothes.id] });

    expect(filterSummaryText(filter, tags, 1)).toBe(
      '仕入品・販売サイト「メルカリ」・タグ「洋服」の1件だけ',
    );
    expect(activeFilterCount(filter)).toBe(3);
  });

  it('名前を引けないタグは文言に出ない（§4.7 で落とし切れなかった場合の防御）', () => {
    expect(filterSummaryText(draft({ tagIds: ['deleted'] }), tags, 5)).toBeNull();
  });
});

describe('§4.2 clearAll: 3 条件だけを初期値へ戻す', () => {
  it('種別・販売サイト・タグがすべて外れる', () => {
    expect(clearAll()).toEqual(EMPTY_RECORD_FILTER);
    expect(activeFilterCount(clearAll())).toBe(0);
  });

  /**
   * 期間・検索・並び替えは**この型が持っていない**ので、clearAll が触りようがない。
   * 「動かさないこと」をこの形で固定しておく（型に増やした瞬間にここが落ちる）。
   */
  it('期間・検索・並び替えは下書きの外にある', () => {
    expect(Object.keys(EMPTY_RECORD_FILTER).sort()).toEqual(['kind', 'siteName', 'tagIds']);
  });
});

describe('§4.2 effectiveFilter: 出品中では販売サイトが効かない', () => {
  const filter = draft({ kind: 'used', siteName: 'メルカリ', tagIds: [clothes.id] });

  it('売れた記録ではそのまま', () => {
    expect(effectiveFilter(filter, true)).toBe(filter);
    expect(activeFilterCount(effectiveFilter(filter, true))).toBe(3);
  });

  it('出品中では販売サイトが落ち、N も 1 つ減る', () => {
    const applied = effectiveFilter(filter, false);

    expect(applied.siteName).toBeNull();
    expect(applied.kind).toBe('used');
    expect(applied.tagIds).toEqual([clothes.id]);
    expect(activeFilterCount(applied)).toBe(2);
  });

  it('repository へ渡す条件でも落ちる（画面の見た目と二重にする）', () => {
    expect(toFilterConditions(filter, false)).toEqual({
      kind: 'used',
      siteName: null,
      tagIds: [clothes.id],
    });
  });

  it("種別の 'all' は repository の null に読み替わる", () => {
    expect(toFilterConditions(EMPTY_RECORD_FILTER, true)).toEqual({
      kind: null,
      siteName: null,
      tagIds: [],
    });
  });
});

describe('§4.7 pruneMissingTags: 消えたタグを落とす', () => {
  it('生きている id だけが残る', () => {
    const filter = draft({ tagIds: [clothes.id, 'deleted', books.id] });

    expect(pruneMissingTags(filter, tags).tagIds).toEqual([clothes.id, books.id]);
  });

  it('すべて消えたらその条件ごと解除された扱いになる', () => {
    const pruned = pruneMissingTags(draft({ tagIds: ['deleted'] }), tags);

    expect(pruned.tagIds).toEqual([]);
    expect(activeFilterCount(pruned)).toBe(0);
    expect(filterSummaryText(pruned, tags, 5)).toBeNull();
  });

  it('種別・販売サイトは触らない', () => {
    const filter = draft({ kind: 'sourced', siteName: 'メルカリ', tagIds: ['deleted'] });
    const pruned = pruneMissingTags(filter, tags);

    expect(pruned.kind).toBe('sourced');
    expect(pruned.siteName).toBe('メルカリ');
  });

  /** 変化がなければ同じ参照（画面が毎回 setState して引き直すのを防ぐ） */
  it('落とすものが無ければ同じ参照を返す', () => {
    const filter = draft({ tagIds: [clothes.id] });

    expect(pruneMissingTags(filter, tags)).toBe(filter);
  });
});
