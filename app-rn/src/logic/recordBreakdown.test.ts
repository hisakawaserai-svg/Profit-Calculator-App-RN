// レコード詳細の帯グラフ（logic/recordBreakdown.ts）の検証テスト。
// 期待値は表示の規則（並び・0 円・不用品・赤字の 2 本）から導出している。

import { describe, expect, it } from 'vitest';

import type { SaleRecord } from '@/db/schema';

import { costBreakdown } from './calcForm';
import {
  BAR_LABEL_MIN_RATIO,
  COLLAPSE_COST_RATIO,
  MINI_BAR_ORDER,
  SHORTFALL_AMOUNT_MIN_RATIO,
  findBarPart,
  leaderLines,
  miniBarItems,
  recordBreakdown,
  showsBarLabel,
  showsPricedAmounts,
  showsShortfallAmount,
} from './recordBreakdown';

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
  isSold: true,
  saleStartDate: '2026-07-01T09:00:00.000',
  saleDate: '2026-07-05T09:00:00.000',
  memo: '',
  siteName: '',
  photoFileName: null,
  shippingMaterialCost: 0,
  excludesShippingMaterial: false,
  targetProfit: null,
  listedAt: null,
  ...partial,
});

const keys = (breakdown: ReturnType<typeof recordBreakdown>) =>
  breakdown.parts.map((part) => part.key);

const partOf = (breakdown: ReturnType<typeof recordBreakdown>, key: string) => {
  const part = breakdown.parts.find((candidate) => candidate.key === key);
  if (part == null) throw new Error(`項目が無い: ${key}`);
  return part;
};

describe('並び（計算タブの帯と同じ順に固定する）', () => {
  it('仕入 → 送料 → 販売手数料 → 梱包材・その他 → 利益', () => {
    expect(keys(recordBreakdown('ja', record()))).toEqual([
      'purchasePrice',
      'postage',
      'commission',
      'envelopeCost',
      'kept',
    ]);
  });

  it('赤字でも並びは変わらない（黒字/赤字の切り替えで順番が入れ替わらない）', () => {
    const deficit = recordBreakdown('ja', record({ salesPrice: 100 }));

    expect(deficit.deficit).toBe(true);
    expect(keys(deficit)).toEqual(keys(recordBreakdown('ja', record())));
  });

  it('額の大小で並べ替えない（送料が仕入より大きくても順は同じ）', () => {
    expect(keys(recordBreakdown('ja', record({ purchasePrice: 10, postage: 500 })))).toEqual([
      'purchasePrice',
      'postage',
      'commission',
      'envelopeCost',
      'kept',
    ]);
  });

  it('計算タブの帯（costBreakdown）と同じ並びになっている', () => {
    const calc = costBreakdown('ja', 
      {
        salesPrice: 1000,
        purchasePrice: 300,
        postage: 175,
        envelopeCost: 20,
        othersCost: 5,
        commission: 10,
      },
      'sourced',
    );

    // 計算タブは梱包材とその他を別の行にするので、そこから先は比べない
    expect(keys(recordBreakdown('ja', record())).slice(0, 4)).toEqual(
      calc.parts.map((part) => part.key).slice(0, 4),
    );
  });
});

describe('showsPricedAmounts（価格未設定では帯グラフ・レシートの利益行を出さない）', () => {
  it('販売価格が 0 円のときは false（費用だけの割合や損失額を確定した赤字に見せない）', () => {
    expect(showsPricedAmounts(record({ salesPrice: 0 }))).toBe(false);
  });

  it('費用がかかっていても、価格が 0 円なら false', () => {
    expect(
      showsPricedAmounts(record({ salesPrice: 0, purchasePrice: 300, postage: 175 })),
    ).toBe(false);
  });

  it('販売価格が設定されていれば true（黒字）', () => {
    expect(showsPricedAmounts(record())).toBe(true);
  });

  it('販売価格が設定されていれば true（赤字でも）', () => {
    expect(showsPricedAmounts(record({ salesPrice: 100 }))).toBe(true);
  });
});

describe('黒字（帯 1 本 ＝ 販売価格）', () => {
  const breakdown = recordBreakdown('ja', record());

  it('全長は販売価格', () => {
    expect(breakdown.deficit).toBe(false);
    if (breakdown.deficit) return;

    expect(breakdown.total).toBe(1000);
  });

  it('利益は引き算の結果で、レシートの結果行と同じ額になる', () => {
    // 1000 − 300 − 175 − 100（手数料 10%）− 25（梱包 20 ＋ その他 5）
    expect(partOf(breakdown, 'kept').amount).toBe(400);
  });

  it('区画の割合の合計が 1 になる（帯が全長を埋める）', () => {
    const total = breakdown.parts.reduce((sum, part) => sum + (part.ratio ?? 0), 0);

    expect(total).toBeCloseTo(1);
  });

  it('利益 0 円でも帯は成立する（利益の区画だけが消える）', () => {
    // 販売価格 = 費用の合計
    const even = recordBreakdown('ja', record({ salesPrice: 500, purchasePrice: 325, postage: 100, envelopeCost: 25, othersCost: 0 }));

    expect(even.deficit).toBe(false);
    expect(partOf(even, 'kept').amount).toBe(0);
    expect(partOf(even, 'kept').inBar).toBe(false);
  });
});

describe('0 円の項目', () => {
  const breakdown = recordBreakdown('ja', record({ postage: 0 }));

  it('帯には区画を作らない', () => {
    expect(partOf(breakdown, 'postage').inBar).toBe(false);
    expect(partOf(breakdown, 'postage').ratio).toBeNull();
  });

  it('項目自体は残る（レシートの行に付けるドットをグレーにするために引ける）', () => {
    // 行はレシートに残り、ドットだけが「帯に区画が無い」ことを示す
    expect(keys(breakdown)).toContain('postage');
    expect(partOf(breakdown, 'postage').amount).toBe(0);
    expect(partOf(breakdown, 'postage').inBar).toBe(false);
  });

  it('梱包材とその他は 1 行にまとめる（両方 0 なら 1 行が 0 円）', () => {
    const merged = recordBreakdown('ja', record({ envelopeCost: 20, othersCost: 5 }));

    expect(partOf(merged, 'envelopeCost').amount).toBe(25);
    expect(partOf(recordBreakdown('ja', record({ envelopeCost: 0, othersCost: 0 })), 'envelopeCost').inBar)
      .toBe(false);
  });
});

describe('不用品（仕入価格が無い記録）', () => {
  const breakdown = recordBreakdown('ja', record({ kind: 'used', purchasePrice: 0 }));

  it('仕入の項目自体を作らない（0 円の行としても出さない）', () => {
    expect(keys(breakdown)).toEqual(['postage', 'commission', 'envelopeCost', 'kept']);
  });

  it('その分だけ他の項目の割合が大きくなる', () => {
    const sourced = recordBreakdown('ja', record());

    expect(partOf(breakdown, 'kept').ratio).toBeGreaterThan(partOf(sourced, 'kept').ratio ?? 0);
  });

  it('保存値に仕入価格が残っていても計算に入れない（種別の意味として出さない）', () => {
    const withStale = recordBreakdown('ja', record({ kind: 'used', purchasePrice: 300 }));

    expect(keys(withStale)).not.toContain('purchasePrice');
    expect(partOf(withStale, 'kept').amount).toBe(700);
  });
});

describe('赤字（費用が販売価格を上回る。2026-08-14: 案 C — 黒字と同じ積み上げ ＋ 斜線の「足りない」区画）', () => {
  // 販売価格 450・費用 300 + 175 + 45 + 25 = 545 → 95 円足りない
  const breakdown = recordBreakdown('ja', record({ salesPrice: 450 }));

  it('不足額は かかった費用 − 売った金額', () => {
    expect(breakdown.deficit).toBe(true);
    if (!breakdown.deficit) return;

    expect(breakdown.shortfall).toBe(95);
  });

  it('全長は 費用の合計 ＋ 不足額（黒字の「費用 ＋ 手元に残る額」と同じ組み立て）', () => {
    expect(breakdown.deficit).toBe(true);
    if (!breakdown.deficit) return;

    expect(breakdown.total).toBe(545 + 95);
    expect(breakdown.shortfallRatio).toBeCloseTo(95 / 640);
  });

  it('**費用側は黒字と同じく区画を作る**（kept だけが区画を持たない）', () => {
    if (!breakdown.deficit) return;

    expect(partOf(breakdown, 'kept').inBar).toBe(false);
    expect(partOf(breakdown, 'kept').ratio).toBeNull();
    expect(partOf(breakdown, 'purchasePrice').inBar).toBe(true);
    expect(partOf(breakdown, 'postage').inBar).toBe(true);
    expect(partOf(breakdown, 'commission').inBar).toBe(true);
  });

  it('費用の区画の割合の分母は帯の全長（費用 ＋ 不足額）', () => {
    if (!breakdown.deficit) return;

    // 仕入 300 / 640
    expect(partOf(breakdown, 'purchasePrice').ratio).toBeCloseTo(300 / 640);
  });

  it('区画の割合の合計 ＋ 不足額の割合が 1 になる（帯が全長を埋める）', () => {
    if (!breakdown.deficit) return;

    const partsRatio = breakdown.parts.reduce((sum, part) => sum + (part.ratio ?? 0), 0);
    expect(partsRatio + breakdown.shortfallRatio).toBeCloseTo(1);
  });

  it('費用側は 1 項目が 9 割を超えないので、まとめない（collapsedCosts は false）', () => {
    if (!breakdown.deficit) return;

    expect(breakdown.collapsedCosts).toBe(false);
  });

  it('項目の一覧と金額はそのまま残る（レシートの行がここから引くため）', () => {
    // 利益は負のまま。並びも黒字と同じ（仕入 → 送料 → 手数料 → 梱包 → 利益）
    expect(partOf(breakdown, 'kept').amount).toBe(-95);
    expect(partOf(breakdown, 'purchasePrice').amount).toBe(300);
    expect(keys(breakdown)).toEqual(['purchasePrice', 'postage', 'commission', 'envelopeCost', 'kept']);
  });

  it('1 円も売れていない記録（販売価格 0）も同じ形', () => {
    const zero = recordBreakdown('ja', record({ salesPrice: 0 }));

    expect(zero.deficit).toBe(true);
    if (!zero.deficit) return;
    expect(zero.shortfall).toBe(500); // 300 + 175 + 0（手数料は売上比例）+ 25
    expect(zero.total).toBe(1000); // 500（費用）+ 500（不足額）
    expect(partOf(zero, 'purchasePrice').inBar).toBe(true);
  });

  describe('軽い赤字（確認用データ 1: 仕入 2,000・送料 750・手数料 500・梱包 50・販売 2,500）', () => {
    // 費用 2,000 + 750 + 500 + 50 = 3,300 → 800 円足りない
    // （手数料は率で持つフィールドなので、額 500 円 ＝ 販売価格 2,500 の 20% で入力する）
    const light = recordBreakdown('ja', 
      record({
        salesPrice: 2500,
        purchasePrice: 2000,
        postage: 750,
        commission: 20,
        envelopeCost: 50,
        othersCost: 0,
      }),
    );

    it('不足額は 800 円（3,300 − 2,500）', () => {
      expect(light.deficit).toBe(true);
      if (!light.deficit) return;
      expect(light.shortfall).toBe(800);
    });

    it('1 項目も 9 割を超えないので、費用側はまとめない', () => {
      if (!light.deficit) return;
      expect(light.collapsedCosts).toBe(false);
    });

    it('不足額の割合は 25% 未満なので、区画の中に額を入れない（帯の外の引き出し線に回す）', () => {
      if (!light.deficit) return;
      // 800 / (3300 + 800) ≈ 19.5%
      expect(light.shortfallRatio).toBeLessThan(SHORTFALL_AMOUNT_MIN_RATIO);
      expect(showsShortfallAmount(light)).toBe(false);
    });
  });

  describe('極端な赤字（確認用データ 2: 仕入 400,000・販売 1,000）', () => {
    const extreme = recordBreakdown('ja', 
      record({ salesPrice: 1000, purchasePrice: 400000, postage: 0, envelopeCost: 0, othersCost: 0, commission: 10 }),
    );

    it('不足額は 399,100 円（400,000 + 100（手数料）− 1,000）', () => {
      expect(extreme.deficit).toBe(true);
      if (!extreme.deficit) return;
      expect(extreme.shortfall).toBe(399100);
    });

    it(
      '全長の分母に不足額も入るので、仕入が費用のほぼ全部でも全長のうちでは半分ほどにしかならず、まとめない',
      () => {
        if (!extreme.deficit) return;

        // 費用 400,100・不足額 399,100 → 全長 799,200。仕入の割合 = 400,000 / 799,200 ≈ 50%
        // 「1 項目で費用の大半」であっても、赤字が深いほど不足額も帯の幅を大きく占めるので、
        // 90% の閾値は「費用側の中の割合」ではなく「全長の中の割合」で見て初めて意味を持つ
        expect(partOf(extreme, 'purchasePrice').ratio).toBeCloseTo(400000 / 799200);
        expect(extreme.collapsedCosts).toBe(false);
        expect(partOf(extreme, 'purchasePrice').inBar).toBe(true);
      },
    );

    it('項目の金額はそのまま残る（レシートの行がここから引くため）', () => {
      if (!extreme.deficit) return;

      expect(partOf(extreme, 'purchasePrice').amount).toBe(400000);
      expect(partOf(extreme, 'kept').amount).toBe(-399100);
    });

    it('不足額の割合が 25% を超えるので、区画の中に額を入れる', () => {
      if (!extreme.deficit) return;

      expect(extreme.shortfallRatio).toBeGreaterThan(SHORTFALL_AMOUNT_MIN_RATIO);
      expect(showsShortfallAmount(extreme)).toBe(true);
    });
  });

  describe('費用側の 1 項目が全長の 9 割を超える（collapsedCosts）', () => {
    // まとめの分母は「費用 ＋ 不足額」なので、1 項目が全長の 9 割を超えるのは
    // 不足額そのものが小さい（＝損益分岐点にわずかに届かなかった）記録に限られる
    it('不足額が小さくても、1 項目が全長の 9 割に届かなければまとめない', () => {
      // 費用 800 + 200 = 1,000。販売 990 → 不足額 10。全長 1,010。仕入の割合 ≈ 79.2%
      const under = recordBreakdown('ja', 
        record({
          salesPrice: 990,
          purchasePrice: 800,
          postage: 200,
          commission: 0,
          envelopeCost: 0,
          othersCost: 0,
        }),
      );

      expect(under.deficit).toBe(true);
      if (!under.deficit) return;
      expect(partOf(under, 'purchasePrice').ratio).toBeLessThan(COLLAPSE_COST_RATIO);
      expect(under.collapsedCosts).toBe(false);
    });

    it('1 項目が全長の 9 割を超えたらまとめる', () => {
      // 費用 10,000 + 10 = 10,010。販売 9,900 → 不足額 110。全長 10,120。仕入の割合 ≈ 98.8%
      const over = recordBreakdown('ja', 
        record({
          salesPrice: 9900,
          purchasePrice: 10000,
          postage: 10,
          commission: 0,
          envelopeCost: 0,
          othersCost: 0,
        }),
      );

      expect(over.deficit).toBe(true);
      if (!over.deficit) return;
      expect(over.collapsedCosts).toBe(true);
      // まとめた結果、費用側のどの項目も区画を持たない（描くのは 1 区画だけ）。
      // 割合も持たない ── まとめた区画は 1 つの色で描くので、個々の割合は意味を失う
      expect(partOf(over, 'purchasePrice').inBar).toBe(false);
      expect(partOf(over, 'purchasePrice').ratio).toBeNull();
      expect(partOf(over, 'postage').inBar).toBe(false);
    });

    it('まとめても項目の金額はそのまま残り、引き出し線は出ない（指す先の区画が無い）', () => {
      const over = recordBreakdown('ja', 
        record({
          salesPrice: 9900,
          purchasePrice: 10000,
          postage: 10,
          commission: 0,
          envelopeCost: 0,
          othersCost: 0,
        }),
      );

      expect(over.deficit).toBe(true);
      if (!over.deficit) return;
      expect(partOf(over, 'purchasePrice').amount).toBe(10000);
      expect(leaderLines(over.parts)).toEqual([]);
    });
  });
});

describe('帯の中の文字（幅が足りる区画だけ）', () => {
  it('全体の 15% 以上の区画には入れる', () => {
    const breakdown = recordBreakdown('ja', record());

    expect(showsBarLabel(partOf(breakdown, 'purchasePrice'))).toBe(true); // 30%
    expect(showsBarLabel(partOf(breakdown, 'postage'))).toBe(true); // 17.5%
  });

  it('15% 未満の区画は色だけにする', () => {
    const breakdown = recordBreakdown('ja', record());

    expect(partOf(breakdown, 'envelopeCost').ratio).toBeLessThan(BAR_LABEL_MIN_RATIO);
    expect(showsBarLabel(partOf(breakdown, 'envelopeCost'))).toBe(false); // 2.5%
  });

  it('ちょうど 15% は入れる（境界）', () => {
    const breakdown = recordBreakdown('ja', record({ salesPrice: 1000, postage: 150 }));

    expect(partOf(breakdown, 'postage').ratio).toBe(BAR_LABEL_MIN_RATIO);
    expect(showsBarLabel(partOf(breakdown, 'postage'))).toBe(true);
  });

  it('帯に無い項目には入れない', () => {
    expect(showsBarLabel(partOf(recordBreakdown('ja', record({ postage: 0 })), 'postage'))).toBe(false);
  });
});

describe('引き出し線（帯に文字が入らない細い区画の割合）', () => {
  const leadersOf = (breakdown: ReturnType<typeof recordBreakdown>) =>
    leaderLines(breakdown.parts);

  it('15% 未満の区画にだけ出す（帯の中に文字が入る区画には出さない）', () => {
    // 利益 40% / 手数料 10% / 仕入 30% / 送料 17.5% / 梱包 2.5%
    expect(leadersOf(recordBreakdown('ja', record())).map((leader) => leader.key)).toEqual([
      'commission',
      'envelopeCost',
    ]);
  });

  it('閾値は帯の中の文字と同じ（ちょうど 15% の区画には出さない）', () => {
    const breakdown = recordBreakdown('ja', record({ salesPrice: 1000, postage: 150 }));

    expect(partOf(breakdown, 'postage').ratio).toBe(BAR_LABEL_MIN_RATIO);
    expect(leadersOf(breakdown).map((leader) => leader.key)).not.toContain('postage');
  });

  it('帯に区画のない項目には出さない（0 円・不用品の仕入・赤字の利益）', () => {
    const zeroPostage = recordBreakdown('ja', record({ postage: 0 }));
    const used = recordBreakdown('ja', record({ kind: 'used' }));
    const deficit = recordBreakdown('ja', record({ salesPrice: 450 }));

    expect(leadersOf(zeroPostage).map((leader) => leader.key)).not.toContain('postage');
    expect(leadersOf(used).map((leader) => leader.key)).not.toContain('purchasePrice');
    expect(leadersOf(deficit).map((leader) => leader.key)).not.toContain('kept');
  });

  it('隣り合う細い区画は段をずらす（線の長さが変わってラベルが重ならない）', () => {
    // 手数料 2% / 梱包 1% が並ぶ（どちらも 15% 未満）
    const breakdown = recordBreakdown('ja', 
      record({ salesPrice: 1000, purchasePrice: 300, postage: 0, commission: 2, envelopeCost: 10, othersCost: 0 }),
    );
    const leaders = leadersOf(breakdown);

    expect(leaders).toHaveLength(2);
    expect(leaders[0].tier).not.toBe(leaders[1].tier);
  });

  it('3 本以上でも隣どうしは必ず別の段になる（交互）', () => {
    const breakdown = recordBreakdown('ja', 
      record({ salesPrice: 1000, purchasePrice: 50, postage: 30, commission: 1, envelopeCost: 20, othersCost: 0 }),
    );
    const tiers = leadersOf(breakdown).map((leader) => leader.tier);

    expect(tiers.length).toBeGreaterThanOrEqual(3);
    expect(tiers.every((tier, index) => index === 0 || tier !== tiers[index - 1])).toBe(true);
  });

  it('割合だけを持つ（金額は持たない ── 額はレシートの行が言う）', () => {
    const leader = leadersOf(recordBreakdown('ja', record()))[0];

    expect(leader.ratio).toBeCloseTo(0.1);
    expect(leader).not.toHaveProperty('amount');
  });

  // 赤字でも費用側の細い区画には出る（黒字と同じ leaderLines(parts) を通す）。
  // 費用側を 1 色にまとめた赤字（collapsedCosts）で出ないことは
  // 「赤字（費用が販売価格を上回る）」の節の「極端な赤字」が見る

  it('細い区画が無い記録では 1 本も出さない', () => {
    const breakdown = recordBreakdown('ja', 
      record({ salesPrice: 1000, purchasePrice: 400, postage: 200, commission: 0, envelopeCost: 200, othersCost: 0 }),
    );

    expect(leadersOf(breakdown)).toEqual([]);
  });
});

describe('レシートの行に付けるドット（findBarPart）', () => {
  it('帯に区画のある項目は引ける（その色で塗る）', () => {
    const part = findBarPart(recordBreakdown('ja', record()), 'kept');

    expect(part?.inBar).toBe(true);
  });

  it('0 円の項目は inBar が false（ドットはグレーになる）', () => {
    expect(findBarPart(recordBreakdown('ja', record({ postage: 0 })), 'postage')?.inBar).toBe(false);
  });

  it('赤字のときの利益も false（帯に緑の区画が無い）', () => {
    expect(findBarPart(recordBreakdown('ja', record({ salesPrice: 100 })), 'kept')?.inBar).toBe(false);
  });

  it('不用品の仕入は項目自体が無いので null（レシートも行を出さない）', () => {
    expect(findBarPart(recordBreakdown('ja', record({ kind: 'used' })), 'purchasePrice')).toBeNull();
  });

  it('梱包材・その他の行は envelopeCost の区画に対応する（1 行にまとめてある）', () => {
    const part = findBarPart(recordBreakdown('ja', record()), 'envelopeCost');

    expect(part?.amount).toBe(25);
    expect(part?.inBar).toBe(true);
  });
});

describe('端数（表示値どうしで足し引きする）', () => {
  it('各項を丸めてから引くので、帯の額を足すと販売価格に一致する', () => {
    const breakdown = recordBreakdown('ja', record({ salesPrice: 999.5, postage: 175.4, commission: 7 }));
    const total = breakdown.parts.reduce((sum, part) => sum + part.amount, 0);

    // 利益 ＝ 販売価格 − 費用 なので、利益を含めた全項目の和は必ず販売価格に戻る（黒字・赤字とも）
    expect(total).toBe(1000); // roundForDisplay(999.5)
  });
});

describe('miniBarItems（PricingScreen シミュレーターのミニ帯グラフ。仕入→送料→手数料→梱包→利益に固定）', () => {
  const itemKeys = (items: ReturnType<typeof miniBarItems>) => items.map((item) => item.key);

  const itemOf = (items: ReturnType<typeof miniBarItems>, key: string) => {
    const item = items.find((candidate) => candidate.key === key);
    if (item == null) throw new Error(`項目が無い: ${key}`);
    return item;
  };

  it('並びは MINI_BAR_ORDER と同じ（記録詳細の帯・計算タブの帯とも同じ順）', () => {
    expect(MINI_BAR_ORDER).toEqual(['purchasePrice', 'postage', 'commission', 'envelopeCost', 'kept']);
    expect(itemKeys(miniBarItems('ja', record(), 1000))).toEqual(MINI_BAR_ORDER);
  });

  it('価格をシミュレーター値に差し替えて計算する（記録の salesPrice は使わない）', () => {
    // 記録の salesPrice は 1000 のまま、シミュレーター値 450 で計算する
    const items = miniBarItems('ja', record(), 450);

    expect(itemOf(items, 'purchasePrice').amount).toBe(300); // 費用側は価格に依存しない
    expect(itemOf(items, 'kept').label).toBe('足りない'); // 450 では赤字になる
  });

  describe('黒字（シミュレーター価格 1000）', () => {
    const items = miniBarItems('ja', record(), 1000);

    it('全項目が仕入→送料→手数料→梱包→利益の順に並ぶ', () => {
      expect(itemKeys(items)).toEqual(['purchasePrice', 'postage', 'commission', 'envelopeCost', 'kept']);
    });

    it('利益の項目は通常の「残る」の額（斜線ではない）', () => {
      const kept = itemOf(items, 'kept');

      expect(kept.shortfall).toBe(false);
      expect(kept.amount).toBe(400); // 1000 − 300 − 175 − 100（手数料 10%）− 25
      expect(kept.inBar).toBe(true);
    });

    it('費用側の額は記録詳細の帯（recordBreakdown）と同じ数字（計算式を作り直していない）', () => {
      const full = recordBreakdown('ja', record());

      expect(itemOf(items, 'purchasePrice').amount).toBe(findBarPart(full, 'purchasePrice')?.amount);
      expect(itemOf(items, 'postage').amount).toBe(findBarPart(full, 'postage')?.amount);
      expect(itemOf(items, 'commission').amount).toBe(findBarPart(full, 'commission')?.amount);
      expect(itemOf(items, 'envelopeCost').amount).toBe(findBarPart(full, 'envelopeCost')?.amount);
    });
  });

  describe('赤字（シミュレーター価格 450。費用 545 のところ 450 でしか売れない）', () => {
    const items = miniBarItems('ja', record(), 450);

    it('並びは黒字と変わらない（利益の位置がそのまま「足りない」に入れ替わるだけ）', () => {
      expect(itemKeys(items)).toEqual(['purchasePrice', 'postage', 'commission', 'envelopeCost', 'kept']);
    });

    it('利益の位置の項目が斜線の「足りない」に変わる', () => {
      const shortfall = itemOf(items, 'kept');

      expect(shortfall.shortfall).toBe(true);
      expect(shortfall.label).toBe('足りない');
      expect(shortfall.amount).toBe(95); // 545 − 450
      expect(shortfall.inBar).toBe(true);
    });

    it('価格に依存しない費用（仕入・送料・梱包）は黒字とまったく同じ額・同じ位置', () => {
      const surplus = miniBarItems('ja', record(), 1000);

      for (const key of ['purchasePrice', 'postage', 'envelopeCost']) {
        expect(itemOf(items, key).amount).toBe(itemOf(surplus, key).amount);
        expect(itemOf(items, key).shortfall).toBe(false);
      }
    });

    it('手数料は売上に比例するので額はシミュレーター価格ごとに変わるが、位置・shortfall は変わらない', () => {
      expect(itemOf(items, 'commission').amount).toBe(45); // 450 の 10%
      expect(itemOf(items, 'commission').shortfall).toBe(false);
    });
  });

  it('価格を動かしても項目の並びは入れ替わらない（幅だけが変わる）', () => {
    const prices = [100, 450, 1000, 3000, 50000];

    for (const price of prices) {
      expect(itemKeys(miniBarItems('ja', record(), price))).toEqual(MINI_BAR_ORDER);
    }
  });

  it('不用品（仕入価格が無い記録）は仕入の項目自体を作らない。並びはそのまま', () => {
    const items = miniBarItems('ja', record({ kind: 'used', purchasePrice: 0 }), 1000);

    expect(itemKeys(items)).toEqual(['postage', 'commission', 'envelopeCost', 'kept']);
  });

  it('0 円の項目は凡例には残るが、帯には区画を作らない（inBar が false）', () => {
    const items = miniBarItems('ja', record({ postage: 0 }), 1000);
    const postage = itemOf(items, 'postage');

    expect(postage.amount).toBe(0);
    expect(postage.inBar).toBe(false);
    // 項目自体は一覧から消えない（凡例に「送料 ¥0」として残る）
    expect(itemKeys(items)).toContain('postage');
  });

  it('利益がちょうど 0 円（損益分岐点）でも帯には区画を作らない', () => {
    // 費用の合計 = シミュレーター価格（手数料は率を 0 にして計算を単純にする）
    const items = miniBarItems('ja', 
      record({ purchasePrice: 300, postage: 175, commission: 0, envelopeCost: 20, othersCost: 5 }),
      500,
    );
    const kept = itemOf(items, 'kept');

    expect(kept.shortfall).toBe(false);
    expect(kept.amount).toBe(0);
    expect(kept.inBar).toBe(false);
  });
});

describe('金額が 1 つも無い記録', () => {
  it('区画は 1 つも作らない（0 除算にしない）', () => {
    const empty = recordBreakdown('ja', 
      record({ salesPrice: 0, purchasePrice: 0, postage: 0, envelopeCost: 0, othersCost: 0 }),
    );

    expect(empty.deficit).toBe(false);
    if (empty.deficit) return;
    expect(empty.total).toBe(0);
    expect(empty.parts.every((part) => !part.inBar)).toBe(true);
    expect(empty.parts.every((part) => part.ratio == null)).toBe(true);
  });
});
