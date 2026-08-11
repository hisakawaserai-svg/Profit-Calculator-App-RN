// SPEC-V2 §5.3「確定ラベル表」の検証。
// §6.3 のテスト方針どおり、表示ラベルはこの純粋関数のテストだけで担保し、
// 画面のスナップショットは取らない。

import { describe, expect, it } from 'vitest';

import {
  CHART_UNIT_NOTE,
  COMMISSION_LABEL,
  ENVELOPE_AND_OTHERS_FIELD_LABEL,
  EXPENSES_LABEL,
  LISTING_COUNT_LABEL,
  LISTING_STATUS_LABEL,
  MARKED_AS_SOLD_MESSAGE,
  MARK_AS_SOLD_BUTTON_LABEL,
  POSTAGE_LABEL,
  PROFIT_TREND_LABEL,
  PURCHASE_PRICE_LABEL,
  REQUIRED_SALES_PRICE_LABEL,
  REVERT_TO_LISTING_BUTTON_LABEL,
  REVERT_TO_LISTING_CONFIRM_LABEL,
  SALES_PRICE_LABEL,
  SOLD_BADGE_LABEL,
  SOLD_DATE_FIELD_LABEL,
  SOLD_DATE_ROW_LABEL,
  SOLD_RECORDS_LABEL,
  UNDO_LABEL,
  WEEKDAY_LABELS,
  TARGET_TAB_LABEL,
  TOTAL_PROFIT_LABEL,
  TOTAL_SALES_LABEL,
  additionLabel,
  chartUnitLabel,
  commissionFieldLabel,
  commissionItemLabel,
  commissionRowLabel,
  dateSectionLabel,
  deductionLabel,
  lowerPriceWarning,
  memoSectionLabel,
  optionalCostsLabel,
  profitLabel,
  profitTabLabel,
  recordKindLabel,
  recordTimelineText,
  requiredPriceFormulaLines,
  requiredPriceSummary,
  revertToListingConfirmTitle,
  selectedPointTitle,
  soldDateChipsNote,
  soldDateNotes,
  soldDatePickerNote,
  soldDatePickerSingleDayNote,
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

describe('UI-SPEC §1.5 データタブの語', () => {
  it('グラフの見出しは指標が 1 つになったので固定文言', () => {
    expect(PROFIT_TREND_LABEL).toBe(`${TOTAL_PROFIT_LABEL}の推移`);
  });

  it('刻みは日ごと / 月ごとの 2 語（§5-5）', () => {
    expect(chartUnitLabel('day')).toBe('日ごと');
    expect(chartUnitLabel('month')).toBe('月ごと');
  });

  it('選択した点の見出しは日付と件数を並べる（§1.5-5）', () => {
    expect(selectedPointTitle('8月9日', 3)).toBe('8月9日の記録　3件');
  });

  it('注記は全期間で何が変わるかを名指しする（§1.5-6）', () => {
    expect(CHART_UNIT_NOTE).toBe(
      '全期間を選ぶと刻みが「月ごと」に変わり、見出しも「全期間の収支」になります。',
    );
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

describe('UI-SPEC §8 出品中 ⇄ 売れた の切り替え（案 15c）', () => {
  it('状態カードのボタンは状態ごとに 1 個', () => {
    expect(MARK_AS_SOLD_BUTTON_LABEL).toBe('売れた');
    expect(REVERT_TO_LISTING_BUTTON_LABEL).toBe('出品中に戻す');
  });

  it('ボタンの語はバッジと同じでも定数を分ける（表示と操作で役割が違う。§8.8）', () => {
    expect(MARK_AS_SOLD_BUTTON_LABEL).toBe(SOLD_BADGE_LABEL);
  });

  it('常設の行は「売れた日」。入力欄の「販売日」とは語を揃えない（§8.2）', () => {
    expect(SOLD_DATE_ROW_LABEL).toBe('売れた日');
    expect(SOLD_DATE_ROW_LABEL).not.toBe(SOLD_DATE_FIELD_LABEL);
  });

  it('押した直後のバーは本文と取り消しの 2 語（§8.3）', () => {
    expect(MARKED_AS_SOLD_MESSAGE).toBe('売れた記録にしました');
    expect(UNDO_LABEL).toBe('元に戻す');
  });

  it('出品中に戻す確認は消える販売日を M/d で名指しする（§8.4）', () => {
    expect(revertToListingConfirmTitle('8/10')).toBe('販売日 8/10 が消えます。戻しますか？');
    expect(REVERT_TO_LISTING_CONFIRM_LABEL).toBe('戻す');
  });
});

describe('UI-SPEC §8.9 状態カードのバッジ（案 16a）', () => {
  it('状態カードのバッジは既存の状態語をそのまま使う（新しい語を足さない）', () => {
    expect(LISTING_STATUS_LABEL).toBe('出品中');
    expect(SOLD_RECORDS_LABEL).toBe('売れた記録');
  });

  it('補足行は置かない ── メタ行と同じ事実を 2 度読ませないため（実装時の決定）', () => {
    // メタ行だけが出品日・販売日・日数を持つ。状態カードは操作とその主語（バッジ）だけ
    expect(recordTimelineText({ kind: 'used', listedDate: '8/2', soldDate: '8/9', days: 7 })).toBe(
      '不用品 ・ 8/2 出品 → 8/9 販売（7日）',
    );
  });
});

describe('UI-SPEC §8.10 カレンダーの語（案 16d）', () => {
  it('週の始まりは日曜固定（ロケールで振らない）', () => {
    expect(WEEKDAY_LABELS).toEqual(['日', '月', '火', '水', '木', '金', '土']);
  });

  it('選べない理由は両端を名指しする（淡いマスの説明を推測させない）', () => {
    expect(soldDatePickerNote('8/2')).toBe('出品（8/2）より前と、今日より後は選べません');
  });

  it('出品日が未来のときは選べる日が 1 日しかないと言う（§8.5 派生決定 3）', () => {
    expect(soldDatePickerSingleDayNote('8/20')).toBe('出品日（8/20）だけが選べます');
  });
});

describe('UI-SPEC §8.10.1 行のチップの「選べない理由」', () => {
  const at = (year: number, month: number, day: number) => new Date(year, month - 1, day, 12);
  const today = at(2026, 8, 10);

  it('行のチップは下限だけを名指しする（未来のチップは存在しないので触れない）', () => {
    expect(soldDateChipsNote('8/9')).toBe('出品日（8/9）より前は選べません');
    expect(soldDateChipsNote('8/9')).not.toContain('今日より後');
  });

  it('カレンダーの一行とは別の語 ── 行とシートで淡くなっているものが違う', () => {
    const notes = soldDateNotes(at(2026, 8, 9), today);

    expect(notes.chips).not.toBe(notes.calendar);
    expect(notes.calendar).toContain('今日より後');
  });

  it('当日出品（選べるのが「今日」だけ）でも同じ言い方で説明が付く', () => {
    // 「昨日」「一昨日」が落ちる状態。理由が出ないと押せないのが不具合に見える
    expect(soldDateNotes(today, today).chips).toBe('出品日（8/10）より前は選べません');
  });

  it('出品日が未来なら「出品日だけが選べます」に寄せる（「より前」では説明にならない）', () => {
    const notes = soldDateNotes(at(2026, 8, 20), today);

    expect(notes.chips).toBe('出品日（8/20）だけが選べます');
    // 3 つとも落ちる状態なので、盤面と行で同じ言い方になる
    expect(notes.chips).toBe(notes.calendar);
  });
});
