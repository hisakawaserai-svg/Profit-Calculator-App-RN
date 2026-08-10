// SPEC-V2 §5.3「確定ラベル表」の検証。
// §6.3 のテスト方針どおり、表示ラベルはこの純粋関数のテストだけで担保し、
// 画面のスナップショットは取らない。

import { describe, expect, it } from 'vitest';

import {
  COMMISSION_LABEL,
  ENVELOPE_AND_OTHERS_FIELD_LABEL,
  EXPENSES_LABEL,
  LISTING_COUNT_LABEL,
  LISTING_STATUS_LABEL,
  POSTAGE_LABEL,
  PURCHASE_PRICE_LABEL,
  REQUIRED_SALES_PRICE_LABEL,
  SALES_PRICE_LABEL,
  SOLD_BADGE_LABEL,
  SOLD_RECORDS_LABEL,
  TARGET_TAB_LABEL,
  TOTAL_PROFIT_LABEL,
  TOTAL_SALES_LABEL,
  additionLabel,
  commissionFieldLabel,
  commissionItemLabel,
  commissionRowLabel,
  dateSectionLabel,
  deductionLabel,
  lowerPriceWarning,
  memoSectionLabel,
  metricLabel,
  optionalCostsLabel,
  profitLabel,
  profitTabLabel,
  recordKindLabel,
  recordTimelineText,
  requiredPriceFormulaLines,
  requiredPriceSummary,
  switchStatusLabel,
  targetProfitLabel,
  todayDateLabel,
} from './labels';

describe('§1.1 種別の表示名', () => {
  it('不用品 / 仕入品', () => {
    expect(recordKindLabel('used')).toBe('不用品');
    expect(recordKindLabel('sourced')).toBe('仕入品');
  });
});

describe('§5.3 レコード 1 件の netProfit', () => {
  it('不用品は「純利益」', () => {
    expect(profitLabel('used')).toBe('純利益');
  });

  it('仕入品は「利益」', () => {
    expect(profitLabel('sourced')).toBe('利益');
  });

  it('不用品を「手取り」とは呼ばない（§1.2 / §7-8）', () => {
    expect(profitLabel('used')).not.toBe('手取り');
  });
});

describe('§5.3 複数レコードの Σ netProfit', () => {
  it('種別が混ざるので中立語「収支」', () => {
    expect(TOTAL_PROFIT_LABEL).toBe('収支');
  });

  it('合計は種別語のどちらとも一致しない（案 D の動的ラベルは採らない。§5.2）', () => {
    expect(TOTAL_PROFIT_LABEL).not.toBe(profitLabel('used'));
    expect(TOTAL_PROFIT_LABEL).not.toBe(profitLabel('sourced'));
  });
});

describe('§5.3 種別で変えない語', () => {
  it('経費 / 販売価格 / 仕入価格 / 売上 / 販売手数料 / 必要な販売価格', () => {
    expect(EXPENSES_LABEL).toBe('経費');
    expect(SALES_PRICE_LABEL).toBe('販売価格');
    expect(PURCHASE_PRICE_LABEL).toBe('仕入価格');
    expect(TOTAL_SALES_LABEL).toBe('売上');
    expect(COMMISSION_LABEL).toBe('販売手数料');
    expect(REQUIRED_SALES_PRICE_LABEL).toBe('必要な販売価格');
  });
});

describe('§1.3 / UI-SPEC §6-4 計算タブのラベル', () => {
  it('結果側のセグメント名は種別で出し分ける', () => {
    expect(profitTabLabel('used')).toBe('純利益を出す');
    expect(profitTabLabel('sourced')).toBe('利益を出す');
  });

  it('逆算側のセグメント名は種別で変えない', () => {
    expect(TARGET_TAB_LABEL).toBe('目標から逆算');
  });

  it('逆算入力欄のラベル', () => {
    expect(targetProfitLabel('used')).toBe('目標の純利益');
    expect(targetProfitLabel('sourced')).toBe('目標利益');
  });

  it('手数料の入力行と逆算結果の一覧には率が入る', () => {
    expect(commissionFieldLabel(10)).toBe('手数料 10%');
    expect(commissionItemLabel(10)).toBe('販売手数料10%');
  });
});

describe('UI-SPEC §1.1-6 梱包材・その他の折りたたみ見出し', () => {
  it('入力があれば合計を添える（畳んだままでも結果に効いていると分かるように）', () => {
    expect(optionalCostsLabel(80)).toBe('梱包材・その他を入力（80円）');
  });

  it('合計 0 なら金額を出さない', () => {
    expect(optionalCostsLabel(0)).toBe('梱包材・その他を入力');
  });

  it('端数は表示用に丸める', () => {
    expect(optionalCostsLabel(80.4)).toBe('梱包材・その他を入力（80円）');
  });
});

describe('UI-SPEC §1.1-3b / 採用案 12c 逆算結果の説明文', () => {
  it('確定デザインの文をそのまま組み立てる', () => {
    expect(
      requiredPriceSummary({
        requiredPrice: 962,
        commissionAmount: 96,
        expenses: 765,
        kept: 101,
      }),
    ).toBe('962円で売ると、手数料96円と経費765円が引かれて101円が残ります。');
  });

  it('経費が 0 項目なら手数料だけを言う', () => {
    expect(
      requiredPriceSummary({ requiredPrice: 112, commissionAmount: 11, expenses: 0, kept: 101 }),
    ).toBe('112円で売ると、手数料11円が引かれて101円が残ります。');
  });

  it('手数料 0% なら経費だけを言う', () => {
    expect(
      requiredPriceSummary({ requiredPrice: 865, commissionAmount: 0, expenses: 765, kept: 100 }),
    ).toBe('865円で売ると、経費765円が引かれて100円が残ります。');
  });

  it('引かれるものが何もなければ「引かれて」と言わない', () => {
    expect(
      requiredPriceSummary({ requiredPrice: 100, commissionAmount: 0, expenses: 0, kept: 100 }),
    ).toBe('100円で売ると、そのまま100円が残ります。');
  });
});

describe('UI-SPEC §1.1-3b / 採用案 12c 計算のしかた', () => {
  const designExample = {
    targetProfit: 100,
    expenses: 765,
    subtotal: 865,
    commissionRate: 10,
    divisor: 0.9,
    exact: 961.1111111111111,
    requiredPrice: 962,
    roundedUp: true,
  };

  it('確定デザインの 3 行をそのまま組み立てる', () => {
    expect(requiredPriceFormulaLines(designExample)).toEqual([
      '目標100円 ＋ 経費765円 ＝ 865円',
      '手数料10%が引かれるので ÷ 0.9',
      '→ 961.1... を切り上げて 962円',
    ]);
  });

  it('切り上げ前の値は切り捨てて出す（切り上げの話が続くため）', () => {
    const lines = requiredPriceFormulaLines({ ...designExample, exact: 961.96 });
    expect(lines[2]).toBe('→ 961.9... を切り上げて 962円');
  });

  it('経費が 0 項目なら足し算の行を出さない', () => {
    expect(
      requiredPriceFormulaLines({
        ...designExample,
        targetProfit: 100,
        expenses: 0,
        subtotal: 100,
        exact: 111.11111111111111,
        requiredPrice: 112,
      })[0],
    ).toBe('目標100円');
  });

  it('手数料 0% なら割り算の行を出さない', () => {
    expect(
      requiredPriceFormulaLines({
        ...designExample,
        commissionRate: 0,
        divisor: 1,
        exact: 865,
        requiredPrice: 865,
        roundedUp: false,
      }),
    ).toEqual(['目標100円 ＋ 経費765円 ＝ 865円', '→ 865円']);
  });

  it('割り切れたときは「切り上げて」と言わない', () => {
    const lines = requiredPriceFormulaLines({
      ...designExample,
      exact: 962,
      roundedUp: false,
    });
    expect(lines[2]).toBe('→ 962円');
  });
});

describe('UI-SPEC §1.1-3b / 採用案 12c 1 つ下の価格の注意文', () => {
  it('確定デザインの文をそのまま組み立てる', () => {
    expect(lowerPriceWarning({ price: 950, profit: 90 })).toBe(
      '950円では90円にしかならず、目標に届きません',
    );
  });
});

describe('§1.3 データタブの指標セグメント', () => {
  it('売上金額はそのまま / netProfit は集計なので「収支」', () => {
    expect(metricLabel('sales')).toBe('売上金額');
    expect(metricLabel('netProfit')).toBe(TOTAL_PROFIT_LABEL);
  });
});

describe('UI-SPEC §1.3 / §1.4 伝票・レシートの行名', () => {
  it('控除行は記号を前置する', () => {
    expect(deductionLabel(POSTAGE_LABEL)).toBe('− 送料');
    expect(deductionLabel(PURCHASE_PRICE_LABEL)).toBe('− 仕入価格');
  });

  it('加算行（梱包材・その他）は ＋ を前置する', () => {
    expect(additionLabel(ENVELOPE_AND_OTHERS_FIELD_LABEL)).toBe('＋ 梱包材・その他');
  });

  it('レコード詳細の手数料行は率を括弧で添える', () => {
    expect(commissionRowLabel(10)).toBe(`${COMMISSION_LABEL} (10%)`);
  });

  it('記録フォームの手数料行は計算タブと同じ短縮形', () => {
    expect(deductionLabel(commissionFieldLabel(10))).toBe('− 手数料 10%');
  });
});

describe('UI-SPEC §1.3-3 記録フォームの状態切替リンク', () => {
  it('リンクは切り替えた先の状態を名乗る', () => {
    expect(switchStatusLabel(false)).toBe('出品中にする');
    expect(switchStatusLabel(true)).toBe('売れた記録にする');
  });
});

describe('UI-SPEC §1.3-12 日付カードの見出し', () => {
  it('当日は「今日（…）」で包む', () => {
    expect(todayDateLabel('2026/08/09')).toBe('今日（2026/08/09）');
  });

  it('売却済みは販売日、出品中は出品日を畳んだ見出しに出す', () => {
    expect(dateSectionLabel(true, '今日（2026/08/09）')).toBe('販売日 今日（2026/08/09）');
    expect(dateSectionLabel(false, '2026/08/02')).toBe('出品日 2026/08/02');
  });
});

describe('UI-SPEC §1.3-13 メモの折りたたみ見出し', () => {
  it('未入力なら操作を促し、入力済みなら中身があることを示す', () => {
    expect(memoSectionLabel('')).toBe('メモを書く');
    expect(memoSectionLabel('傷あり')).toBe('メモ');
  });
});

describe('UI-SPEC §1.4-2 レコード詳細のメタ行', () => {
  it('確定デザインの文をそのまま組み立てる', () => {
    expect(
      recordTimelineText({ kind: 'used', listedDate: '8/2', soldDate: '8/9', days: 7 }),
    ).toBe('不用品 ・ 8/2 出品 → 8/9 販売（7日）');
  });

  it('出品中は矢印を出さず経過日数を添える', () => {
    expect(
      recordTimelineText({ kind: 'sourced', listedDate: '8/2', soldDate: null, days: 7 }),
    ).toBe('仕入品 ・ 8/2 出品（7日経過）');
  });

  it('出品当日は 0 日（§5-2）', () => {
    expect(
      recordTimelineText({ kind: 'used', listedDate: '8/9', soldDate: null, days: 0 }),
    ).toBe('不用品 ・ 8/9 出品（0日経過）');
  });
});

describe('UI-SPEC §1.4-2 状態の語', () => {
  it('詳細のバッジは「売れた」で、一覧の状態チップ（売れた記録）とは別語', () => {
    expect(SOLD_BADGE_LABEL).toBe('売れた');
    expect(SOLD_BADGE_LABEL).not.toBe(SOLD_RECORDS_LABEL);
  });

  it('出品中はどこでも同じ 1 語', () => {
    expect(LISTING_STATUS_LABEL).toBe('出品中');
    expect(LISTING_COUNT_LABEL).toBe(LISTING_STATUS_LABEL);
  });
});
