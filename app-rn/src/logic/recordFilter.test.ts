// SPEC-V4 §7.3 / SPEC-V11 §10 の方針にある recordFilter の単体テスト:
//   - activeFilterCount（0〜9。タグを何個選んでも 1 本・範囲は両端で 1 本）
//   - filterSummaryText（0 件は null / 畳み込み / 末尾の「の N件だけ」）
//   - clearAll が期間・検索・並び替えを動かさないこと
//   - effectiveFilter（出品中では販売サイトと目標が効かない。赤字のみは残る）
//   - 群ごとの本数・解除・初期開閉（SPEC-V11 §2 / §3）
//   - siteNameOptions（プリセットの合併と、選択中の名前の確保。SPEC-V11 §4.3）
//   - pruneMissingTags（消えたタグを落とす。§4.7）

import { describe, expect, it } from 'vitest';

import type { Tag } from '@/db/schema';

import {
  activeFilterCount,
  clearAll,
  clearSection,
  effectiveFilter,
  EMPTY_RECORD_FILTER,
  FILTER_SECTIONS,
  filterSummaryText,
  hasActiveFilter,
  initialSectionExpansion,
  pruneMissingTags,
  sectionActiveCount,
  siteNameOptions,
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

/** 範囲 1 本だけを入れた下書き（他の 8 本は空のまま） */
const amountDraft = (
  key: 'netProfit' | 'salesPrice' | 'expenses',
  min: string,
  max: string,
): RecordFilterDraft =>
  draft({ amounts: { ...EMPTY_RECORD_FILTER.amounts, [key]: { min, max } } });

/** 9 本すべてが効いている下書き（範囲は両端入り = それでも 1 本ずつ） */
const ALL_NINE: RecordFilterDraft = draft({
  kind: 'sourced',
  siteName: 'フリマA',
  tagIds: [clothes.id, summer.id],
  amounts: {
    netProfit: { min: '1000', max: '5000' },
    salesPrice: { min: '2000', max: '9000' },
    expenses: { min: '100', max: '3000' },
  },
  targetStatus: 'met',
  lossOnly: true,
  memoState: 'with',
});

describe('§4.1 activeFilterCount: 条件の本数を数える（決定 §9-2）', () => {
  it('何も絞り込んでいなければ 0', () => {
    expect(activeFilterCount(EMPTY_RECORD_FILTER)).toBe(0);
    expect(hasActiveFilter(EMPTY_RECORD_FILTER)).toBe(false);
  });

  it('種別・販売サイト・タグでそれぞれ 1 本ずつ', () => {
    expect(activeFilterCount(draft({ kind: 'sourced' }))).toBe(1);
    expect(activeFilterCount(draft({ siteName: 'フリマA' }))).toBe(1);
    expect(activeFilterCount(draft({ tagIds: [clothes.id] }))).toBe(1);
  });

  it('タグを 3 つ選んでも OR なので条件としては 1 本', () => {
    expect(activeFilterCount(draft({ tagIds: [clothes.id, summer.id, books.id] }))).toBe(1);
  });

  it('3 条件すべてで 3', () => {
    const filter = draft({ kind: 'used', siteName: 'フリマA', tagIds: [clothes.id, summer.id] });

    expect(activeFilterCount(filter)).toBe(3);
    expect(hasActiveFilter(filter)).toBe(true);
  });

  /** SPEC-V11 §1.4: 増えた 6 本もそれぞれ 1 本。**範囲は両端を入れても 1 本** */
  it('金額・目標・赤字・メモでそれぞれ 1 本ずつ', () => {
    expect(activeFilterCount(amountDraft('netProfit', '1000', ''))).toBe(1);
    expect(activeFilterCount(amountDraft('netProfit', '1000', '5000'))).toBe(1);
    expect(activeFilterCount(amountDraft('salesPrice', '', '3000'))).toBe(1);
    expect(activeFilterCount(amountDraft('expenses', '500', ''))).toBe(1);
    expect(activeFilterCount(draft({ targetStatus: 'missed' }))).toBe(1);
    expect(activeFilterCount(draft({ lossOnly: true }))).toBe(1);
    expect(activeFilterCount(draft({ memoState: 'without' }))).toBe(1);
  });

  it('空白だけの入力は効いていない（空欄と同じ扱い）', () => {
    expect(activeFilterCount(amountDraft('netProfit', '  ', ' '))).toBe(0);
  });

  it('9 本すべてで 9（最大）', () => {
    expect(activeFilterCount(ALL_NINE)).toBe(9);
  });

  /** 群の見出しに出る数と青い行の条件数を 2 か所で数えないための不変条件（SPEC-V11 §1.4） */
  it('群ごとの本数の合計が activeFilterCount と一致する', () => {
    const total = FILTER_SECTIONS.reduce(
      (sum, section) => sum + sectionActiveCount(ALL_NINE, section),
      0,
    );

    expect(total).toBe(activeFilterCount(ALL_NINE));
  });
});

describe('§4.3 filterSummaryText: 絞り込み中の青い行の文言（案 34a-C）', () => {
  it('0 件なら null（行ごと出さない）', () => {
    expect(filterSummaryText('ja', EMPTY_RECORD_FILTER, tags, 0)).toBeNull();
  });

  it('種別だけ。末尾は件数を含む「の N件だけ」', () => {
    expect(filterSummaryText('ja', draft({ kind: 'sourced' }), tags, 14)).toBe('仕入品の14件だけ');
  });

  it('販売サイトは種類まで言う（名前だけでは何の名前か読めない）', () => {
    expect(filterSummaryText('ja', draft({ siteName: 'フリマA' }), tags, 3)).toBe(
      '販売サイト「フリマA」の3件だけ',
    );
  });

  it('タグ 1 つ', () => {
    expect(filterSummaryText('ja', draft({ tagIds: [clothes.id] }), tags, 2)).toBe('タグ「洋服」の2件だけ');
  });

  it('タグ 2 つ以上は「ほか N件」に畳む（末尾の件数とは別物）', () => {
    expect(filterSummaryText('ja', draft({ tagIds: [clothes.id, summer.id, books.id] }), tags, 9)).toBe(
      'タグ「洋服」ほか2件の9件だけ',
    );
  });

  it('0 件に絞られても行は出る（条件が効いている事実は消えない）', () => {
    expect(filterSummaryText('ja', draft({ kind: 'sourced' }), tags, 0)).toBe('仕入品の0件だけ');
  });

  it('2 本までは「・」で連なり、並ぶ数は activeFilterCount と一致する', () => {
    const filter = draft({ kind: 'sourced', siteName: 'フリマA' });

    expect(filterSummaryText('ja', filter, tags, 1)).toBe('仕入品・販売サイト「フリマA」の1件だけ');
    expect(activeFilterCount(filter)).toBe(2);
  });

  /**
   * SPEC-V11 §5: 3 本以上は**先頭 2 つ ＋「ほか N 条件」**に畳む。9 本は 1 行に入らない。
   * 「件」ではなく「条件」で数えるのは、末尾の「のN件だけ」が記録の件数だから。
   */
  it('3 本以上は先頭 2 つ ＋「ほか N 条件」に畳む', () => {
    const filter = draft({ kind: 'sourced', siteName: 'フリマA', tagIds: [clothes.id] });

    expect(filterSummaryText('ja', filter, tags, 1)).toBe(
      '仕入品・販売サイト「フリマA」・ほか1条件の1件だけ',
    );
    expect(activeFilterCount(filter)).toBe(3);
  });

  it('9 本でも並ぶのは 3 つまで（畳んだ数は activeFilterCount − 2）', () => {
    const filter = draft({
      kind: 'sourced',
      siteName: 'フリマA',
      tagIds: [clothes.id],
      amounts: {
        netProfit: { min: '1000', max: '5000' },
        salesPrice: { min: '', max: '3000' },
        expenses: { min: '500', max: '' },
      },
      targetStatus: 'met',
      lossOnly: true,
      memoState: 'with',
    });

    expect(activeFilterCount(filter)).toBe(9);
    expect(filterSummaryText('ja', filter, tags, 2)).toBe(
      '仕入品・販売サイト「フリマA」・ほか7条件の2件だけ',
    );
  });

  it('未設定の販売サイトは文の中で種類まで言う（行の語は「未設定」だけ）', () => {
    expect(filterSummaryText('ja', draft({ siteName: '' }), tags, 4)).toBe(
      '販売サイト未設定の4件だけ',
    );
  });

  it('金額の範囲は入っている側だけを出す（片側だけの指定を 0 で埋めない）', () => {
    const from = draft({ amounts: { ...EMPTY_RECORD_FILTER.amounts, netProfit: { min: '1000', max: '' } } });
    const to = draft({ amounts: { ...EMPTY_RECORD_FILTER.amounts, expenses: { min: '', max: '3000' } } });

    expect(filterSummaryText('ja', from, tags, 1)).toBe('純利益1000円〜の1件だけ');
    expect(filterSummaryText('ja', to, tags, 1)).toBe('経費〜3000円の1件だけ');
  });

  // 英語では語順が入れ替わる（件数が先、条件があと）。日本語のまま出ていた回帰の検査
  it('英語は件数を先に言う（条件は「 · 」で連ねる）', () => {
    expect(filterSummaryText('en', draft({ kind: 'sourced' }), tags, 14)).toBe(
      'Only 14 records · Item for resale',
    );
    expect(filterSummaryText('en', draft({ tagIds: [clothes.id, summer.id] }), tags, 1)).toBe(
      'Only 1 record · Tag “洋服” +1 more',
    );
  });

  it('名前を引けないタグは文言に出ない（§4.7 で落とし切れなかった場合の防御）', () => {
    expect(filterSummaryText('ja', draft({ tagIds: ['deleted'] }), tags, 5)).toBeNull();
  });
});

describe('§4.2 clearAll: 下書きだけを初期値へ戻す', () => {
  it('9 条件がすべて外れる', () => {
    expect(clearAll()).toEqual(EMPTY_RECORD_FILTER);
    expect(activeFilterCount(clearAll())).toBe(0);
  });

  /**
   * 期間・検索・並び替えは**この型が持っていない**ので、clearAll が触りようがない。
   * **これが SPEC-V11 §0.2 の歯止めそのもの**（守っているのは本数ではなく、
   * 「画面の外に専用の UI を持つ条件を下書きへ入れない」こと）。
   * 型に増やした瞬間にここが落ちる。
   */
  it('期間・検索・並び替えは下書きの外にある', () => {
    expect(Object.keys(EMPTY_RECORD_FILTER).sort()).toEqual([
      'amounts',
      'kind',
      'lossOnly',
      'memoState',
      'siteName',
      'tagIds',
      'targetStatus',
    ]);
  });
});

describe('§4.2 / SPEC-V11 §7 effectiveFilter: 出品中では販売サイトと目標が効かない', () => {
  const filter = draft({ kind: 'used', siteName: 'フリマA', tagIds: [clothes.id] });

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

  /**
   * SPEC-V11 §7.1: 出品中の純利益は見込み額なので「達成」が言えない。
   * §7.2: 赤字のみは比べる相手が 0 なので、見込み額のままでも意味が変わらない ── **落とさない**。
   */
  it('出品中では目標も落ちるが、赤字のみは残る', () => {
    const applied = effectiveFilter(draft({ targetStatus: 'missed', lossOnly: true }), false);

    expect(applied.targetStatus).toBeNull();
    expect(applied.lossOnly).toBe(true);
    expect(activeFilterCount(applied)).toBe(1);
  });

  it('金額・メモは出品中でもそのまま効く', () => {
    const applied = effectiveFilter(
      draft({ amounts: { ...EMPTY_RECORD_FILTER.amounts, netProfit: { min: '1000', max: '' } }, memoState: 'with' }),
      false,
    );

    expect(activeFilterCount(applied)).toBe(2);
  });

  /** 落とすものが無ければ同じ参照（画面が毎回 setState して引き直すのを防ぐ） */
  it('出品中でも落とすものが無ければ同じ参照を返す', () => {
    const plain = draft({ kind: 'used', lossOnly: true });

    expect(effectiveFilter(plain, false)).toBe(plain);
  });

  it('repository へ渡す条件でも落ちる（画面の見た目と二重にする）', () => {
    expect(toFilterConditions(filter, false)).toMatchObject({
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
      netProfitMin: null,
      netProfitMax: null,
      salesPriceMin: null,
      salesPriceMax: null,
      expensesMin: null,
      expensesMax: null,
      targetStatus: null,
      lossOnly: false,
      memoState: null,
    });
  });

  /** SPEC-V11 §6: 空欄は「その側の境界なし」で、0 とは別物（0 と読むと赤字が黙って落ちる） */
  it('空欄は境界なし（null）で、"0" は 0 として渡る', () => {
    const empty = toFilterConditions(EMPTY_RECORD_FILTER, true);
    const zero = toFilterConditions(
      draft({ amounts: { ...EMPTY_RECORD_FILTER.amounts, netProfit: { min: '0', max: '' } } }),
      true,
    );

    expect(empty.netProfitMin).toBeNull();
    expect(zero.netProfitMin).toBe(0);
    expect(zero.netProfitMax).toBeNull();
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
    expect(filterSummaryText('ja', pruned, tags, 5)).toBeNull();
  });

  it('種別・販売サイトは触らない', () => {
    const filter = draft({ kind: 'sourced', siteName: 'フリマA', tagIds: ['deleted'] });
    const pruned = pruneMissingTags(filter, tags);

    expect(pruned.kind).toBe('sourced');
    expect(pruned.siteName).toBe('フリマA');
  });

  /** 変化がなければ同じ参照（画面が毎回 setState して引き直すのを防ぐ） */
  it('落とすものが無ければ同じ参照を返す', () => {
    const filter = draft({ tagIds: [clothes.id] });

    expect(pruneMissingTags(filter, tags)).toBe(filter);
  });
});

describe('SPEC-V11 §3 群ごとの本数と解除', () => {
  it('9 本は 5 群に 1・1・1・3・3 で分かれる', () => {
    expect(sectionActiveCount(ALL_NINE, 'kind')).toBe(1);
    expect(sectionActiveCount(ALL_NINE, 'site')).toBe(1);
    expect(sectionActiveCount(ALL_NINE, 'tag')).toBe(1);
    expect(sectionActiveCount(ALL_NINE, 'amount')).toBe(3);
    expect(sectionActiveCount(ALL_NINE, 'other')).toBe(3);
  });

  it('その群だけが初期値へ戻り、他の群は動かない', () => {
    const cleared = clearSection(ALL_NINE, 'amount');

    expect(sectionActiveCount(cleared, 'amount')).toBe(0);
    expect(activeFilterCount(cleared)).toBe(6);
    expect(cleared.kind).toBe('sourced');
    expect(cleared.siteName).toBe('フリマA');
    expect(cleared.tagIds).toEqual([clothes.id, summer.id]);
    expect(cleared.targetStatus).toBe('met');
  });

  it('「その他」は 3 本まとめて外れる（目標・赤字・メモ）', () => {
    const cleared = clearSection(ALL_NINE, 'other');

    expect(cleared.targetStatus).toBeNull();
    expect(cleared.lossOnly).toBe(false);
    expect(cleared.memoState).toBeNull();
    expect(sectionActiveCount(cleared, 'other')).toBe(0);
  });

  /** 群ごとの解除を全部押した状態と「すべて解除」は必ず同じ下書きになる（§3） */
  it('全部の群を解除すると clearAll と同じになる', () => {
    const cleared = FILTER_SECTIONS.reduce(
      (filter, section) => clearSection(filter, section),
      ALL_NINE,
    );

    expect(cleared).toEqual(clearAll());
  });
});

describe('SPEC-V11 §2.2 initialSectionExpansion: 初期の開閉', () => {
  it('何も効いていなければ種別だけ開く', () => {
    expect(initialSectionExpansion(EMPTY_RECORD_FILTER, true)).toEqual({
      kind: true,
      site: false,
      tag: false,
      amount: false,
      other: false,
    });
  });

  it('効いている群は開く（種別は常に開く）', () => {
    expect(initialSectionExpansion(draft({ lossOnly: true }), true)).toMatchObject({
      kind: true,
      other: true,
      amount: false,
    });
    expect(initialSectionExpansion(amountDraft('expenses', '', '3000'), true)).toMatchObject({
      amount: true,
      other: false,
    });
  });

  /**
   * 出品中で消える節は、条件が残っていても開かない ── 開いても中身が無い
   * （effectiveFilter を通してから数えるので、こうなる）。
   */
  it('出品中では販売サイトと目標の節は開かない', () => {
    const filter = draft({ siteName: 'フリマA', targetStatus: 'met', lossOnly: true });

    expect(initialSectionExpansion(filter, false)).toMatchObject({
      site: false,
      other: true,
    });
  });
});

describe('SPEC-V11 §4.3 siteNameOptions: 候補の合併', () => {
  it('記録の名前とプリセットの名前を重複なく昇順で返す', () => {
    expect(siteNameOptions(['フリマA', 'フリマB'], ['フリマB', 'オク'], null)).toEqual([
      'オク',
      'フリマA',
      'フリマB',
    ]);
  });

  /** 候補から落ちると、効いているのに画面から選択が消え、外す口もなくなる */
  it('選択中の名前は、記録にもプリセットにも無くても必ず含まれる', () => {
    expect(siteNameOptions([], [], '消えたサイト')).toEqual(['消えたサイト']);
  });

  it("'' は名前ではないので候補に入らない（未設定の行は画面が末尾に置く）", () => {
    expect(siteNameOptions(['', 'フリマA'], [''], '')).toEqual(['フリマA']);
  });
});
