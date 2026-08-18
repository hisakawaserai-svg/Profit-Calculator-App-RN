// SPEC-V2 §5.3「確定ラベル表」の検証。
// §6.3 のテスト方針どおり、表示ラベルはこの純粋関数のテストだけで担保し、
// 画面のスナップショットは取らない。

import { describe, expect, it } from 'vitest';

import { PRESET_CALC_METHODS, PRESET_COLOR_HEXES } from './preset';
import {
  analyzePricing,
  pricingConclusion,
  recordDetailConclusion,
  simulationVerdict,
  soldConclusion,
} from './pricing';

import {
  ALMOST_ALL_PERCENT_LABEL,
  AMOUNT_PLACEHOLDER,
  DETAILS_COLLAPSE_LABEL,
  DETAILS_EXPAND_LABEL,
  LESS_THAN_ONE_PERCENT_LABEL,
  averageSaleDaysValue,
  detailsToggleLabel,
  perRecordProfitValue,
  percentLabel,
  applyPriceButtonLabel,
  listingDayBadgeLabel,
  lossAmountNote,
  netProfitEstimateNote,
  pricingConclusionText,
  pricingHeroAmount,
  recordDetailConclusionDetail,
  recordDetailConclusionHeadline,
  simulationVerdictText,
  soldRecordDetailConclusionDetail,
  soldRecordDetailConclusionHeadline,
  targetProfitRowValue,
  PRICE_APPLY_EXTERNAL_NOTE,
  colorRemainingLabel,
  colorUserLabel,
  COLOR_ALL_USED_SUBTITLE,
  COLOR_USED_PICK_SECTION_LABEL,
  COLOR_USED_SECTION_LABEL,
  CUSTOM_COLOR_CHANGE_LABEL,
  CUSTOM_COLOR_CREATE_LABEL,
  CUSTOM_COLOR_LABEL,
  otherUsedSectionLabel,
  ownColorLabel,
  presetColorLabel,
  sameColorNote,
  CHART_UNIT_NOTE,
  DATA_MODE_PROFIT_LABEL,
  DATA_MODE_TAG_LABEL,
  achievementToastText,
  filterNoMatchNote,
  filterTagSearchEmptyBody,
  filterTagSearchEmptyTitle,
  filterTagSearchResultLabel,
  filterTagSectionLabel,
  matchingRecordLabel,
  nextPeriodLabel,
  periodProfitLabel,
  periodTitle,
  previousPeriodLabel,
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
  chartBarLegendLabel,
  chartUnitLabel,
  commissionFieldLabel,
  commissionItemLabel,
  commissionRowLabel,
  dateSectionLabel,
  deductionLabel,
  lowerPriceWarning,
  memoSectionLabel,
  optionalCostsLabel,
  CALC_ADD_ROW_LABEL,
  CALC_KEY_BACKSPACE,
  CALC_KEY_CLEAR_ALL,
  CALC_KEY_DIVIDE,
  CALC_KEY_EQUALS,
  CALC_KEY_MINUS,
  CALC_KEY_MULTIPLY,
  CALC_KEY_PLUS,
  CALC_SUBMIT_LABEL,
  CALC_TOTAL_LABEL,
  calcRowSignLabel,
  calculatorBlockedNote,
  calculatorTitle,
  profitLabel,
  profitTabLabel,
  recordKindLabel,
  recordTimelineText,
  requiredPriceFormulaLines,
  requiredPriceSummary,
  revertToListingConfirmTitle,
  selectedPointTitle,
  selectedTagTitle,
  tagSectionMetaText,
  zeroRecordTagsToggleLabel,
  soldDateChipsNote,
  soldDateNotes,
  soldDatePickerNote,
  soldDatePickerSingleDayNote,
  switchStatusLabel,
  targetProfitLabel,
  todayDateLabel,
  presetAddLabel,
  presetBlockedNote,
  presetCountLabel,
  presetDeleteConfirmMessage,
  presetDeleteLabel,
  presetEditValueNote,
  presetFormTitle,
  presetListNote,
  presetOverflowLabel,
  presetPackQuantityFieldLabel,
  presetUnitNote,
  presetUnitPriceRowLabel,
  presetUnitPriceText,
  PRESET_CALC_METHOD_OPTIONS,
  presetValueFieldLabel,
  presetValueText,
  presetSectionTitle,
  PROFIT_RATE_LABEL,
  TAG_ADD_LABEL,
  tagSectionTitle,
  tagBlockedNote,
  tagDeletedMessage,
  tagFormTitle,
  tagProfitMetaText,
  versionLabel,
} from './labels';

describe('§1.1 種別の表示名', () => {
  it('不用品 / 仕入品', () => {
    expect(recordKindLabel('ja', 'used')).toBe('不用品');
    expect(recordKindLabel('ja', 'sourced')).toBe('仕入品');
  });
});

describe('§5.3 レコード 1 件の netProfit', () => {
  it('不用品は「純利益」', () => {
    expect(profitLabel('ja', 'used')).toBe('純利益');
  });

  it('仕入品は「利益」', () => {
    expect(profitLabel('ja', 'sourced')).toBe('利益');
  });

  it('不用品を「手取り」とは呼ばない（§1.2 / §7-8）', () => {
    expect(profitLabel('ja', 'used')).not.toBe('手取り');
  });
});

describe('§5.3 複数レコードの Σ netProfit', () => {
  it('種別が混ざるので中立語「収支」', () => {
    expect(TOTAL_PROFIT_LABEL).toBe('収支');
  });

  it('合計は種別語のどちらとも一致しない（案 D の動的ラベルは採らない。§5.2）', () => {
    expect(TOTAL_PROFIT_LABEL).not.toBe(profitLabel('ja', 'used'));
    expect(TOTAL_PROFIT_LABEL).not.toBe(profitLabel('ja', 'sourced'));
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
    expect(profitTabLabel('ja', 'used')).toBe('純利益を出す');
    expect(profitTabLabel('ja', 'sourced')).toBe('利益を出す');
  });

  it('逆算側のセグメント名は種別で変えない', () => {
    expect(TARGET_TAB_LABEL).toBe('目標から逆算');
  });

  it('逆算入力欄のラベル', () => {
    expect(targetProfitLabel('ja', 'used')).toBe('目標の純利益');
    expect(targetProfitLabel('ja', 'sourced')).toBe('目標利益');
  });

  it('手数料の入力行と逆算結果の一覧には率が入る', () => {
    expect(commissionFieldLabel('ja', 10)).toBe('手数料 10%');
    expect(commissionItemLabel('ja', 10)).toBe('販売手数料10%');
  });
});

describe('UI-SPEC §1.1-6 梱包材・その他の折りたたみ見出し', () => {
  it('入力があれば合計を添える（畳んだままでも結果に効いていると分かるように）', () => {
    expect(optionalCostsLabel('ja', 80)).toBe('梱包材・その他を入力（80円）');
  });

  it('合計 0 なら金額を出さない', () => {
    expect(optionalCostsLabel('ja', 0)).toBe('梱包材・その他を入力');
  });

  it('端数は表示用に丸める', () => {
    expect(optionalCostsLabel('ja', 80.4)).toBe('梱包材・その他を入力（80円）');
  });
});

describe('UI-SPEC §1.1-3b / 採用案 12c 逆算結果の説明文', () => {
  it('確定デザインの文をそのまま組み立てる', () => {
    expect(
      requiredPriceSummary('ja', {
        requiredPrice: 962,
        commissionAmount: 96,
        expenses: 765,
        kept: 101,
      }),
    ).toBe('962円で売ると、手数料96円と経費765円が引かれて101円が残ります。');
  });

  it('経費が 0 項目なら手数料だけを言う', () => {
    expect(
      requiredPriceSummary('ja', { requiredPrice: 112, commissionAmount: 11, expenses: 0, kept: 101 }),
    ).toBe('112円で売ると、手数料11円が引かれて101円が残ります。');
  });

  it('手数料 0% なら経費だけを言う', () => {
    expect(
      requiredPriceSummary('ja', { requiredPrice: 865, commissionAmount: 0, expenses: 765, kept: 100 }),
    ).toBe('865円で売ると、経費765円が引かれて100円が残ります。');
  });

  it('引かれるものが何もなければ「引かれて」と言わない', () => {
    expect(
      requiredPriceSummary('ja', { requiredPrice: 100, commissionAmount: 0, expenses: 0, kept: 100 }),
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
    expect(requiredPriceFormulaLines('ja', designExample)).toEqual([
      '目標100円 ＋ 経費765円 ＝ 865円',
      '手数料10%が引かれるので ÷ 0.9',
      '→ 961.1... を切り上げて 962円',
    ]);
  });

  it('切り上げ前の値は切り捨てて出す（切り上げの話が続くため）', () => {
    const lines = requiredPriceFormulaLines('ja', { ...designExample, exact: 961.96 });
    expect(lines[2]).toBe('→ 961.9... を切り上げて 962円');
  });

  it('経費が 0 項目なら足し算の行を出さない', () => {
    expect(
      requiredPriceFormulaLines('ja', {
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
      requiredPriceFormulaLines('ja', {
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
    const lines = requiredPriceFormulaLines('ja', {
      ...designExample,
      exact: 962,
      roundedUp: false,
    });
    expect(lines[2]).toBe('→ 962円');
  });
});

describe('UI-SPEC §1.1-3b / 採用案 12c 1 つ下の価格の注意文', () => {
  it('確定デザインの文をそのまま組み立てる', () => {
    expect(lowerPriceWarning('ja', { price: 950, profit: 90 })).toBe(
      '950円では90円にしかならず、目標に届きません',
    );
  });
});

describe('UI-SPEC §1.5 データタブの語', () => {
  it('グラフの見出しは指標が 1 つになったので固定文言', () => {
    expect(PROFIT_TREND_LABEL).toBe(`${TOTAL_PROFIT_LABEL}の推移`);
  });

  it('刻みは日ごと / 月ごと / 年ごとの 3 語（§5-5）', () => {
    expect(chartUnitLabel('day')).toBe('日ごと');
    expect(chartUnitLabel('month')).toBe('月ごと');
    expect(chartUnitLabel('year')).toBe('年ごと');
  });

  it('凡例は棒が何かを言う（刻みの語を畳んである）', () => {
    expect(chartBarLegendLabel('year')).toBe('年ごとの収支');
  });

  it('選択した点の見出しは日付と件数を並べる（§1.5-5）', () => {
    expect(selectedPointTitle('8月9日', 3)).toBe('8月9日の記録　3件');
  });

  it('注記は年・全期間で何が変わるかを名指しする（年ごとへの切替も含めて。§1.5-6）', () => {
    expect(CHART_UNIT_NOTE).toBe(
      '年や全期間を選ぶと刻みが「月ごと」（全期間で記録が3年ぶんを超えると「年ごと」）に変わり、' +
        '見出しも選んだ期間の語（「〇〇年の収支」「全期間の収支」）になります。',
    );
  });

  /**
   * 期間が 3 値になった（SPEC-V3 §5.5 の改訂）。見出しの語も 3 通りになる。
   * **年だけ「この年」ではなく年そのものを出す** ── 月バーの表示と同じ語にするため。
   */
  it('合計行の見出しは期間の種類で変わる（§1.2 / §1.5-4）', () => {
    expect(periodProfitLabel('ja', '2026-08')).toBe('この月の収支');
    expect(periodProfitLabel('ja', '2025')).toBe('2025年の収支');
    expect(periodProfitLabel('ja', null)).toBe('全期間の収支');
  });

  it('月バーの中央に出る期間の語（§1.2）', () => {
    expect(periodTitle('ja', '2026-08')).toBe('2026年8月');
    expect(periodTitle('ja', '2025')).toBe('2025年');
    expect(periodTitle('ja', null)).toBe('全期間');
  });

  /** 矢印の動く単位が期間の種類で変わるので、読み上げの語も変える（§5-14 / §8.10.3） */
  it('◀ ▶ の読み上げ語は月と年で変わる', () => {
    expect([previousPeriodLabel('ja', '2026-08'), nextPeriodLabel('ja', '2026-08')]).toEqual([
      '前の月',
      '次の月',
    ]);
    expect([previousPeriodLabel('ja', '2025'), nextPeriodLabel('ja', '2025')]).toEqual(['前の年', '次の年']);
  });

  it('タグ別利益ランキングの行の補足は率が何かを言う', () => {
    expect(tagProfitMetaText('69.3%', '10件')).toBe(`${PROFIT_RATE_LABEL} 69.3%・10件`);
  });

  it('タグ別利益ランキングの行タップで開く内訳一覧の見出しは selectedPointTitle と同じ形', () => {
    expect(selectedTagTitle('洋服', 3)).toBe('洋服の記録　3件');
  });

  it('タグ別の純利益セクションの見出し下の 1 行は期間・件数を語なしで並べる', () => {
    expect(tagSectionMetaText('2026年', '22件')).toBe('2026年・22件');
  });

  it('記録のないタグの開閉行は開閉状態で語を変える', () => {
    expect(zeroRecordTagsToggleLabel(3, false)).toBe('記録のない3タグを見る');
    expect(zeroRecordTagsToggleLabel(3, true)).toBe('記録のない3タグを閉じる');
  });
});

describe('UI-SPEC §1.3 / §1.4 伝票・レシートの行名', () => {
  it('控除行は記号を前置する', () => {
    expect(deductionLabel(POSTAGE_LABEL)).toBe('− 送料');
    expect(deductionLabel(PURCHASE_PRICE_LABEL)).toBe('− 仕入価格');
  });

  it('加算行（梱包材・その他）は ＋ を前置する', () => {
    expect(additionLabel('ja', ENVELOPE_AND_OTHERS_FIELD_LABEL)).toBe('＋ 梱包材・その他');
  });

  it('レコード詳細の手数料行は率を括弧で添える', () => {
    expect(commissionRowLabel(10)).toBe(`${COMMISSION_LABEL} (10%)`);
  });

  it('記録フォームの手数料行は計算タブと同じ短縮形', () => {
    expect(deductionLabel(commissionFieldLabel('ja', 10))).toBe('− 手数料 10%');
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

describe('UI-SPEC §7 電卓', () => {
  it('見出しは行き先を明示する（§7.1）', () => {
    expect(calculatorTitle('ja', '梱包材')).toBe('梱包材の計算');
    expect(calculatorTitle('ja', '送料')).toBe('送料の計算');
    // 逆算モードの入力欄も同じ規則で作る
    expect(calculatorTitle('ja', '目標の純利益')).toBe('目標の純利益の計算');
  });

  it('書き戻しは「入れる」、合計行は「合計」（§7.1）', () => {
    expect(CALC_SUBMIT_LABEL).toBe('入れる');
    expect(CALC_TOTAL_LABEL).toBe('合計');
  });

  it('積み上げの末尾は記録フォームと同じ「＋ …」の形（§7.1-4）', () => {
    expect(additionLabel('ja', CALC_ADD_ROW_LABEL)).toBe('＋ 行を足す');
  });

  it('記号は × ÷ で、`*` `/` は画面に出さない（§7.1）', () => {
    expect(CALC_KEY_MULTIPLY).toBe('×');
    expect(CALC_KEY_DIVIDE).toBe('÷');
    expect([CALC_KEY_MULTIPLY, CALC_KEY_DIVIDE]).not.toContain('*');
    expect([CALC_KEY_MULTIPLY, CALC_KEY_DIVIDE]).not.toContain('/');
  });

  it('C は AC と ⌫ の 2 キーに分かれる（§7.1）', () => {
    expect(CALC_KEY_CLEAR_ALL).toBe('AC');
    expect(CALC_KEY_BACKSPACE).toBe('⌫');
  });

  it('行の中の計算を確定するキーは = （§7.1 追補）', () => {
    expect(CALC_KEY_EQUALS).toBe('=');
  });

  it('行頭の記号はキーパッドと同じ字を使う（§7.2）', () => {
    expect(calcRowSignLabel('+')).toBe(CALC_KEY_PLUS);
    expect(calcRowSignLabel('-')).toBe(CALC_KEY_MINUS);
    // 積み上げ行の「＋」は additionLabel の「＋」と同じ字（半角に振れない）
    expect(additionLabel('ja', 'x').startsWith(calcRowSignLabel('+'))).toBe(true);
  });

  it('「入れる」が押せない理由を名指しする（§7.4。グレーなだけでは分からない）', () => {
    expect(calculatorBlockedNote('ja', 'negative')).toBe('合計がマイナスのままでは入れられません');
    expect(calculatorBlockedNote('ja', 'empty')).toBe('数字を入れると合計が出ます');
  });
});

// ---- SPEC-V3 §3 プリセットの表示語 ----

describe('SPEC-V3 §3 プリセットの表示語', () => {
  it('値は種類で単位が変わる（§2.1）:「10%」/「210円」', () => {
    expect(presetValueText('site', 10)).toBe('10%');
    expect(presetValueText('site', 3.5)).toBe('3.5%');
    expect(presetValueText('shipping', 210)).toBe('210円');
    expect(presetValueText('packaging', 0)).toBe('0円');
  });

  it('金額は小数第 1 位まで出す（まとめ買いの単価。§2.6.3）', () => {
    // 整数に丸めると、編集画面の「9.8円」と一覧の「10円」が食い違う
    expect(presetValueText('packaging', 9.8)).toBe('9.8円');
    expect(presetValueText('packaging', 26.7)).toBe('26.7円');
    expect(presetValueText('packaging', 0.1)).toBe('0.1円');
    // 末尾の .0 は出さない
    expect(presetValueText('packaging', 10)).toBe('10円');
  });

  it('まとめ買いの 1 個あたりは末尾の .0 を出さない（§2.6.3）', () => {
    expect(presetUnitPriceText(8)).toBe('8円');
    expect(presetUnitPriceText(9.8)).toBe('9.8円');
    expect(presetUnitPriceText(10)).toBe('10円');
    expect(presetUnitPriceText(0.1)).toBe('0.1円');
    expect(presetUnitPriceText(0)).toBe('0円');
  });

  it('入数が空・0 のあいだは「—」（行ごと消すと高さが動く。§2.6.6）', () => {
    expect(presetUnitPriceText(null)).toBe('—');
  });

  it('保存できない理由はまとめ買いの 2 つも名指しする（§2.6.6）', () => {
    expect(presetBlockedNote('pack-quantity-required', 'packaging')).toBe('入数を入れてください');
    expect(presetBlockedNote('pack-price-out-of-range', 'packaging')).toBe(
      '購入価格は 0 以上で入れてください',
    );
  });

  it('設定タブのカードは件数と「ほかN件」で数に戻す（§3.1 / 設計案 24a）', () => {
    expect(presetCountLabel('ja', 4)).toBe('4件');
    expect(presetOverflowLabel(2)).toBe('ほか2件');
  });

  it('追加行は記録フォームの「＋ …」と同じ形（§3.2-3）', () => {
    expect(presetAddLabel('shipping')).toBe('＋ 送料を追加');
    expect(presetAddLabel('site')).toBe('＋ 販売サイトを追加');
  });

  it('見出しは追加と編集で語だけが違う（§3.3-1）', () => {
    expect(presetFormTitle('packaging', true)).toBe('梱包材を追加');
    expect(presetFormTitle('packaging', false)).toBe('梱包材を編集');
  });

  it('値の欄の見出しは率と金額で分かれる（§3.3-4）', () => {
    expect(presetValueFieldLabel('site')).toBe('手数料率（%）');
    expect(presetValueFieldLabel('shipping')).toBe('金額');
  });

  it('編集の注記は「保存済みの記録は変わらない」を値の語で言う（§1.5 / 設計案 25b）', () => {
    expect(presetEditValueNote('shipping')).toBe(
      '金額を変えても、これまでの記録の金額はそのままです。',
    );
    expect(presetEditValueNote('site')).toBe(
      '手数料率を変えても、これまでの記録の手数料はそのままです。',
    );
  });

  it('削除の確認は件数と「記録は残る」を 1 文で言う（設計案 25c）', () => {
    expect(presetDeleteConfirmMessage('shipping', 18)).toBe(
      'この送料を使った記録が18件あります。記録とその金額は残り、今後の入力候補から外れます。',
    );
  });

  it('削除の口は種類を名乗る（設計案 25b の下端）', () => {
    expect(presetDeleteLabel('site')).toBe('この販売サイトを削除');
  });

  it('一覧の注記は種類ごとに 1 行で、記録が変わらないことは販売サイトだけが言う（§3.5）', () => {
    expect(presetListNote('site')).toContain('保存済みの記録の手数料は変わりません');
    expect(presetListNote('shipping')).not.toContain('保存済み');
    expect(presetListNote('packaging')).not.toContain('保存済み');
  });

  it('バージョン表記（UI-SPEC §1.6-5）', () => {
    expect(versionLabel('ja', '1.0.0')).toBe('バージョン 1.0.0');
  });
});

// ---- SPEC-V4 §2 タグの表示語 ----

describe('SPEC-V4 §2 タグの表示語', () => {
  it('群はプリセットと別の見出しになる（§2.1。目的が違うので同じ群に入れない）', () => {
    expect(tagSectionTitle('ja')).toBe('記録を分類する');
    expect(tagSectionTitle('ja')).not.toBe(presetSectionTitle('ja'));
  });

  it('追加の口の「＋」は additionLabel の字を使う（半角に振れない）', () => {
    expect(TAG_ADD_LABEL).toBe(additionLabel('ja', '追加'));
  });

  it('シートの見出しは追加と編集で出し分ける（§2.3-1）', () => {
    expect(tagFormTitle(true)).toBe('タグを追加');
    expect(tagFormTitle(false)).toBe('タグを編集');
  });

  it('取り消しバーは使用件数が 1 件以上のときだけ「記録から外れた」を添える（§2.2）', () => {
    expect(tagDeletedMessage('洋服', 0)).toBe('『洋服』を削除しました');
    expect(tagDeletedMessage('洋服', 12)).toBe(
      '『洋服』を削除しました（12件の記録から外れました）',
    );
  });

  it('保存が押せない理由を 4 通り言い分ける（§1.3。重複はプリセットに無い理由）', () => {
    expect(tagBlockedNote('name-required')).toBe('名前を入れてください');
    expect(tagBlockedNote('name-too-long')).toBe('名前は12文字までです');
    expect(tagBlockedNote('name-has-separator')).toBe('「・」は使えません');
    expect(tagBlockedNote('name-duplicated')).toBe('同じ名前のタグがあります');
  });
});

describe('§4.2 絞り込みページの文言（案 35c〜35f）', () => {
  it('下部の見出しは状態で変わる（出品中では対象を言う。案 35c）', () => {
    expect(matchingRecordLabel(true)).toBe('この条件に合う記録');
    expect(matchingRecordLabel(false)).toBe('この条件に合う出品中の記録');
  });

  it('0 件の 2 行目は月名と条件の本数だけ（条件の名前は出さない。案 35e）', () => {
    expect(filterNoMatchNote('2026年8月', 3)).toBe('2026年8月には、この3つが揃った記録がありません。');
  });

  it('全期間なら月名を出さない（入れる月が無い）', () => {
    expect(filterNoMatchNote(null, 2)).toBe('この2つが揃った記録がありません。');
  });

  it('条件が 0 本なら 2 行目ごと出さない（原因は期間しかなく、この画面で言えることが無い）', () => {
    expect(filterNoMatchNote('2026年8月', 0)).toBeNull();
    expect(filterNoMatchNote(null, 0)).toBeNull();
  });

  it('タグの節の見出しは登録件数。0 件なら件数を書かない（案 35a / 35d）', () => {
    expect(filterTagSectionLabel(32)).toBe('タグ（32件）');
    expect(filterTagSectionLabel(0)).toBe('タグ');
  });

  it('検索の結果は「N件のうちM件が該当」（案 35f）', () => {
    expect(filterTagSearchResultLabel(32, 2)).toBe('32件のうち2件が該当');
  });

  it('検索 0 件の見出しは検索語を含む', () => {
    expect(filterTagSearchEmptyTitle('くつ')).toBe('「くつ」に合うタグがありません');
  });

  it('検索 0 件の 2 行目は、選んでいるタグがあるときだけ出る', () => {
    expect(filterTagSearchEmptyBody([])).toBeNull();
    expect(filterTagSearchEmptyBody(['洋服'])).toBe('選んでいるタグ（洋服）は、そのまま効いています。');
  });

  it('選んでいるタグが 2 つ以上なら「ほか N件」に畳む（解除バーと同じ作法）', () => {
    expect(filterTagSearchEmptyBody(['洋服', '春夏物', '食器'])).toBe(
      '選んでいるタグ（洋服ほか2件）は、そのまま効いています。',
    );
  });
});

// 設計案 50c: 色を使用状況で 2 群に分けたときの語。
// 「誰が使っているか」を出すのはこの表示語だけなので、畳み方をここで固定する。
describe('色の 2 群表示（設計案 50c）', () => {
  it('色名は日本語で持つ（読み上げにも使うので英語キーを出さない）', () => {
    expect(presetColorLabel(PRESET_COLOR_HEXES.orange)).toBe('オレンジ');
    expect(presetColorLabel('teal')).toBe('ティール');
  });

  it('固定 11 色のどれでもない値は「自由色」', () => {
    expect(presetColorLabel('#123456')).toBe(CUSTOM_COLOR_LABEL);
    expect(presetColorLabel('')).toBe(CUSTOM_COLOR_LABEL);
  });

  it('編集のときは自分の色を名指しする', () => {
    expect(ownColorLabel(PRESET_COLOR_HEXES.orange, 'タグ')).toBe('オレンジ（このタグの色）');
    expect(ownColorLabel(PRESET_COLOR_HEXES.red, '送料')).toBe('赤（この送料の色）');
  });

  it('残りの数は「N色」', () => {
    expect(colorRemainingLabel(5)).toBe('5色');
    expect(colorRemainingLabel(0)).toBe('0色');
  });

  it('下の群の見出しは、編集のときだけ「ほかの◯◯」になる', () => {
    expect(COLOR_USED_SECTION_LABEL).toBe('使用中');
    expect(otherUsedSectionLabel('タグ')).toBe('ほかのタグが使用中');
    expect(otherUsedSectionLabel('梱包材')).toBe('ほかの梱包材が使用中');
  });

  it('同じ色を複数が使っていたら「ほか N件」に畳む（解除バーと同じ作法）', () => {
    expect(colorUserLabel(['衣類'])).toBe('衣類');
    expect(colorUserLabel(['衣類', '本'])).toBe('衣類 ほか1件');
    expect(colorUserLabel(['衣類', '本', '雑貨'])).toBe('衣類 ほか2件');
  });

  it('重なったときの注記も 1 件だけ名指しして、残りは件数にする', () => {
    expect(sameColorNote(['衣類'])).toBe('「衣類」と同じ色です');
    expect(sameColorNote(['衣類', '本'])).toBe('「衣類」ほか1件と同じ色です');
  });

  it('名前に「・」を含むプリセットでも区切りが紛れない（名前は 1 件しか書かない）', () => {
    expect(sameColorNote(['A4・厚さ3cm以内', '宅配60サイズ'])).toBe(
      '「A4・厚さ3cm以内」ほか1件と同じ色です',
    );
  });
});

// 設計案 51b: 固定 11 色を使い切ったときだけ出る語。
// 「0色」「すべて使われています」を言わずに同じ状態を伝えるのがこの案の主眼なので、
// 数を出さないことと、押せることを言う見出しになっていることを固定する。
describe('色を使い切ったときの語（設計案 51b）', () => {
  it('副文言は固定色の数を言い切る（残り数「0色」は出さない）', () => {
    expect(COLOR_ALL_USED_SUBTITLE).toBe('固定の11色は使い切りました');
    expect(COLOR_ALL_USED_SUBTITLE).not.toContain('0色');
  });

  it('主文言は、自由色を選んでいるかどうかで「作る」と「変える」に分かれる', () => {
    expect(CUSTOM_COLOR_CREATE_LABEL).toBe('新しい色を作る');
    expect(CUSTOM_COLOR_CHANGE_LABEL).toBe(`${CUSTOM_COLOR_LABEL}を変える`);
  });

  it('下の群の見出しは状態ではなく操作を言う（ここでしか固定色を選べない）', () => {
    expect(COLOR_USED_PICK_SECTION_LABEL).toBe('使用中の色から選ぶ');
    expect(COLOR_USED_PICK_SECTION_LABEL).toContain(COLOR_USED_SECTION_LABEL);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 「いくらで売る？」（SPEC-V9 §9）の表示語。
//
// 見張るのは 3 つの禁じ手 ── **「¥0」を「決めていない」の意味で使わない**（§1.2）、
// **目標が無いときに「達成」と言わない**（§9.4）、**「手取り」を使わない**（SPEC-V2 §7-8）。
// 金額そのものの正しさは logic/pricing.test.ts が見るので、ここでは語だけを見る。
// ───────────────────────────────────────────────────────────────────────────
describe('SPEC-V9 §9 「いくらで売る？」の表示語', () => {
  const costs = { purchasePrice: 2000, postage: 750, envelopeCost: 50, othersCost: 0, commission: 10 };
  const analyze = (salesPrice: number, targetProfit: number | null) =>
    analyzePricing({ ...costs, salesPrice, targetProfit });

  const conclusionOf = (salesPrice: number, targetProfit: number | null) => {
    const analysis = analyze(salesPrice, targetProfit);
    const conclusion = pricingConclusion(analysis);
    if (conclusion == null) throw new Error('価格未設定では帯を出さない');
    return pricingConclusionText(conclusion, analysis, 'sourced');
  };

  const verdictOf = (salesPrice: number, targetProfit: number | null, price: number) => {
    const analysis = analyze(salesPrice, targetProfit);
    return simulationVerdictText(simulationVerdict(analysis, price, costs), analysis, 'sourced');
  };

  it('A. 目標なし・黒字（モックの文）', () => {
    expect(conclusionOf(5000, null)).toEqual({
      headline: '¥3,112 までなら赤字になりません。',
      detail: '交渉されても、あと ¥1,888 は下げられます。',
    });
  });

  it('B. 目標あり・黒字（基準線が目標ラインへ上がる）', () => {
    expect(conclusionOf(5000, 1000)).toEqual({
      headline: '¥4,223 までなら、目標利益 ¥1,000 を保てます。',
      detail: '交渉されても、あと ¥777 は下げられます。',
    });
  });

  it('C. 目標なし・赤字', () => {
    expect(conclusionOf(2500, null)).toEqual({
      headline: 'あと ¥612 の値上げで、赤字から抜けます。',
      detail: '¥3,112 で利益ゼロ。それより上なら手元にお金が残ります。',
    });
  });

  it('D. 目標あり・赤字は 2 行目だけが変わる', () => {
    const loss = conclusionOf(2500, 1000);

    expect(loss.headline).toBe(conclusionOf(2500, null).headline);
    expect(loss.detail).toBe('目標利益 ¥1,000 まで戻すなら ¥4,223（今より ¥1,723 上）');
  });

  it('**余裕がちょうど 0 のとき「あと ¥0 は下げられます」と言わない**', () => {
    const detail = conclusionOf(3112, null).detail;

    expect(detail).not.toContain('¥0');
    expect(detail).toBe('今の価格がその下限です。これ以上は下げられません。');
  });

  it('**目標が無いときは「達成」と言わない**（§9.4）', () => {
    expect(verdictOf(5000, null, 4500)).toBe('まだ ¥1,388 の余裕があります');
    expect(verdictOf(5000, null, 4500)).not.toContain('達成');
  });

  it('目標があるときだけ「達成」と言う', () => {
    expect(verdictOf(5000, 1000, 4500)).toBe('目標利益 ¥1,000 を達成');
  });

  it('赤字だった記録が黒字になるときと、黒字が赤字になるときで語が違う', () => {
    expect(verdictOf(2500, null, 3200)).toBe('黒字になります（手元に残る ¥80）');
    expect(verdictOf(5000, null, 3000)).toBe('赤字になります（−¥100）');
    expect(verdictOf(2500, null, 3000)).toBe('まだ赤字です（−¥100）');
  });

  it('**「手取り」は使わない**（SPEC-V2 §7-8）', () => {
    const texts = [
      netProfitEstimateNote(34),
      lossAmountNote(-550),
      verdictOf(2500, null, 3200),
      conclusionOf(2500, null).detail,
    ];
    for (const text of texts) expect(text).not.toContain('手取り');
  });

  it('主役の数字は赤字だけ負号が付く（黒字に「+」は付けない）', () => {
    expect(pricingHeroAmount(1700)).toBe('¥1,700');
    expect(pricingHeroAmount(-550)).toBe('−¥550');
    expect(pricingHeroAmount(0)).toBe('¥0');
  });

  it('バッジは出品当日が 1 日目。**日付が逆転していれば日数を出さない**', () => {
    expect(listingDayBadgeLabel(13)).toBe('出品中 14日目');
    expect(listingDayBadgeLabel(0)).toBe('出品中 1日目');
    expect(listingDayBadgeLabel(-2)).toBe('出品中');
  });

  it('最下段の目標の行は、決めていなければ語・決めてあれば「この記録だけ」を添える', () => {
    expect(targetProfitRowValue(null)).toBe('決めていません');
    expect(targetProfitRowValue(1000)).toBe('¥1,000（この記録だけ）');
    // **目標 0 円は「決めていません」ではない**（§1.2）
    expect(targetProfitRowValue(0)).toBe('¥0（この記録だけ）');
  });

  it('ボタンの語は赤字だけ「直す」に変わる（§9.10）', () => {
    expect(applyPriceButtonLabel(analyze(5000, null))).toBe('この価格でこのアプリに記録する');
    expect(applyPriceButtonLabel(analyze(2500, null))).toBe('価格を ¥3,112 以上に直す');
  });

  it('注意文にサービス名を出さない（§9.1）', () => {
    expect(PRICE_APPLY_EXTERNAL_NOTE).toBe(
      '出品しているサイトの価格は変わりません。あちらはご自分で変更してください。',
    );
  });
});

// 記録詳細の帯グラフに足す結論行（O3 案。SPEC-V9 未反映）の 4 状態の文言分岐。
// 数字は logic/pricing.test.ts と同じモックの 1 件（仕入 2,000 ＋ 送料 750 ＋ 梱包 50、手数料 10%）。
describe('記録詳細の結論行（O3 案）の文言', () => {
  const costs = { purchasePrice: 2000, postage: 750, envelopeCost: 50, othersCost: 0, commission: 10 };
  const analyze = (salesPrice: number, targetProfit: number | null) =>
    analyzePricing({ ...costs, salesPrice, targetProfit });

  const headlineOf = (salesPrice: number, targetProfit: number | null) => {
    const analysis = analyze(salesPrice, targetProfit);
    const conclusion = recordDetailConclusion(analysis);
    return recordDetailConclusionHeadline(conclusion, analysis, 'sourced');
  };

  const detailOf = (salesPrice: number, targetProfit: number | null) => {
    const conclusion = recordDetailConclusion(analyze(salesPrice, targetProfit));
    return recordDetailConclusionDetail(conclusion);
  };

  it('A. 目標なし・黒字', () => {
    expect(headlineOf(5000, null)).toBe('あと ¥1,888 下げても赤字になりません');
    expect(detailOf(5000, null)).toBe('値下げを試す・赤字にならない価格を見る');
  });

  it('B. 目標あり・黒字', () => {
    expect(headlineOf(5000, 1000)).toBe('¥4,223までなら、目標利益¥1,000を保てます');
    expect(detailOf(5000, 1000)).toBe('値下げを試す・目標を保てる価格を見る');
  });

  it('C. 目標なし・赤字', () => {
    expect(headlineOf(2500, null)).toBe('あと¥612の値上げで、赤字から抜けます');
    expect(detailOf(2500, null)).toBe('値上げを試す・赤字から抜ける価格を見る');
  });

  it('D. 目標あり・赤字', () => {
    expect(headlineOf(2500, 1000)).toBe('目標利益¥1,000まで戻すなら¥4,223');
    expect(detailOf(2500, 1000)).toBe('値上げを試す・目標を保てる価格を見る');
  });

  it('E. 価格未設定 → 結論文は出せないので専用の誘導文言（G への入口）', () => {
    expect(headlineOf(0, null)).toBe('価格を入れると、どこまで下げられるか分かります');
    expect(detailOf(0, null)).toBe('売る価格を入力する');
  });
});

// 記録詳細の結論行（O3 案）の売却済み版。数字は上と同じモックの 1 件を使う。
describe('記録詳細の結論行（O3 案）の文言・売却済み版', () => {
  const costs = { purchasePrice: 2000, postage: 750, envelopeCost: 50, othersCost: 0, commission: 10 };
  const analyze = (salesPrice: number, targetProfit: number | null) =>
    analyzePricing({ ...costs, salesPrice, targetProfit });

  const headlineOf = (salesPrice: number, targetProfit: number | null) => {
    const analysis = analyze(salesPrice, targetProfit);
    const conclusion = soldConclusion(analysis);
    if (conclusion == null) throw new Error('価格未設定では行を出さない');
    return soldRecordDetailConclusionHeadline(conclusion, analysis);
  };

  const detailOf = (salesPrice: number, targetProfit: number | null) => {
    const conclusion = soldConclusion(analyze(salesPrice, targetProfit));
    if (conclusion == null) throw new Error('価格未設定では行を出さない');
    return soldRecordDetailConclusionDetail(conclusion);
  };

  it('目標なし', () => {
    expect(headlineOf(5000, null)).toBe('交渉されても、あと¥1,888は応じられた計算でした');
    expect(detailOf(5000, null)).toBe('どこまで下げられたか見る');
  });

  it('目標あり・達成', () => {
    expect(headlineOf(5000, 1000)).toBe('¥4,223まで、目標利益を保てました');
    expect(detailOf(5000, 1000)).toBe('どこまで下げられたか見る');
  });

  it('目標あり・未達成（黒字のまま）', () => {
    expect(headlineOf(3500, 1000)).toBe('目標まであと¥723でした');
    expect(detailOf(3500, 1000)).toBe('目標にどれだけ届かなかったか見る');
  });

  it('価格未設定では行自体を出さない（soldConclusion が null）', () => {
    expect(soldConclusion(analyze(0, null))).toBeNull();
  });
});

// 帯グラフの割合（percentLabel）。**区画の割合の和が 100% を超えて読めてはいけない。**
// 仕入 400,000 円・手数料 100 円の記録で「仕入価格 100%」と「1%未満」が同時に出ていた。
describe('帯グラフの割合の語', () => {
  it('丸めて 0% になる区画は「1%未満」（「無い」と読ませない）', () => {
    expect(percentLabel(0.004)).toBe(LESS_THAN_ONE_PERCENT_LABEL);
    expect(percentLabel(0.0000025)).toBe(LESS_THAN_ONE_PERCENT_LABEL);
  });

  it('**全部ではないのに「100%」と言わない**', () => {
    // 400000 / 400100 = 99.975%
    expect(percentLabel(400000 / 400100)).toBe(ALMOST_ALL_PERCENT_LABEL);
    expect(percentLabel(0.999)).toBe(ALMOST_ALL_PERCENT_LABEL);
  });

  it('ちょうど全部のときだけ「100%」', () => {
    expect(percentLabel(1)).toBe('100%');
  });

  it('間の値は整数に丸めるだけ', () => {
    expect(percentLabel(0.5)).toBe('50%');
    expect(percentLabel(0.324)).toBe('32%');
    expect(percentLabel(0.985)).toBe('99%');
  });
});

// データタブ集計段直下の開閉行（案 1c）
describe('開閉行の文言 detailsToggleLabel', () => {
  it('畳んでいるときは「詳細を見る」', () => {
    expect(detailsToggleLabel(false)).toBe(DETAILS_EXPAND_LABEL);
    expect(detailsToggleLabel(false)).toBe('詳細を見る');
  });

  it('開いているときは「閉じる」', () => {
    expect(detailsToggleLabel(true)).toBe(DETAILS_COLLAPSE_LABEL);
    expect(detailsToggleLabel(true)).toBe('閉じる');
  });
});

describe('展開時 3 列目の値 perRecordProfitValue', () => {
  it('黒字は formatSignedYenSymbol と同じ「+¥」表記（一覧の行・グラフカードと揃える）', () => {
    expect(perRecordProfitValue(12686 / 9)).toBe('+¥1,410');
  });

  it('**赤字は「-¥」の順**（formatYenSymbol 単体の「¥-」順ではない。一覧の行・グラフカードの選択値・帯グラフの不足額と同じ表記）', () => {
    expect(perRecordProfitValue(-200)).toBe('-¥200');
  });

  it('**null（0 件で割れない）は AMOUNT_PLACEHOLDER（「ーー」）**', () => {
    expect(perRecordProfitValue(null)).toBe(AMOUNT_PLACEHOLDER);
    expect(perRecordProfitValue(null)).toBe('ーー');
  });
});

describe('展開時 4 列目の値 averageSaleDaysValue', () => {
  it('小数第 1 位までの「◯日」表記', () => {
    expect(averageSaleDaysValue(5)).toBe('5.0日');
    expect(averageSaleDaysValue(2.5)).toBe('2.5日');
  });

  it('0 日（当日売却）もそのまま表示する', () => {
    expect(averageSaleDaysValue(0)).toBe('0.0日');
  });

  it('**null（対象 0 件）は AMOUNT_PLACEHOLDER（「ーー」）**', () => {
    expect(averageSaleDaysValue(null)).toBe(AMOUNT_PLACEHOLDER);
    expect(averageSaleDaysValue(null)).toBe('ーー');
  });
});

describe('データタブのセグメント（収支 / タグ）の語', () => {
  it('計算タブの「利益を出す/目標から逆算」と同じ SegmentedControl の 2 択', () => {
    expect(DATA_MODE_PROFIT_LABEL).toBe('収支');
    expect(DATA_MODE_TAG_LABEL).toBe('タグ');
  });
});

describe('achievementToastText（実績獲得トースト）', () => {
  it('1個だけなら実績名をそのまま出す', () => {
    expect(achievementToastText(['first_sale'])).toBe(
      '実績「初めての一歩」を達成しました',
    );
  });

  it('複数なら件数でまとめる', () => {
    expect(achievementToastText(['first_sale', 'first_profit'])).toBe(
      '実績を2件達成しました',
    );
  });
});

describe('SPEC-V10 §1 梱包材の単価計算方式の語', () => {
  it('3 択の並びは PRESET_CALC_METHODS そのもの（既定の「個数から」が先頭）', () => {
    expect(PRESET_CALC_METHOD_OPTIONS).toEqual(['個数から', '面積から', '使用回数から']);
    expect(PRESET_CALC_METHOD_OPTIONS).toHaveLength(PRESET_CALC_METHODS.length);
  });

  it('割る数の欄は方式で名前が変わる（同じ列でも入れる数の意味が違う）', () => {
    expect(presetPackQuantityFieldLabel('individual')).toBe('入数（個）');
    expect(presetPackQuantityFieldLabel('area')).toBe('入数（個）');
    expect(presetPackQuantityFieldLabel('usage')).toBe('想定使用回数（回）');
  });

  it('計算結果の帯の見出しも方式で変わる（1 個あたり / 1 回あたり）', () => {
    expect(presetUnitPriceRowLabel('individual')).toBe('1個あたり');
    expect(presetUnitPriceRowLabel('area')).toBe('1回あたり');
    expect(presetUnitPriceRowLabel('usage')).toBe('1回あたり');
  });

  it('保存できない理由は方式に合わせて欄を名指しする（§1.4）', () => {
    expect(presetBlockedNote('pack-quantity-required', 'packaging', 'usage')).toBe(
      '想定使用回数を入れてください',
    );
    // 方式を渡さない呼び出し（送料・販売サイト）は従来の文言のまま
    expect(presetBlockedNote('pack-quantity-required', 'packaging')).toBe('入数を入れてください');
    expect(presetBlockedNote('pack-size-required', 'packaging', 'area')).toBe(
      '購入サイズの縦・横を入れてください',
    );
    expect(presetBlockedNote('use-size-invalid', 'packaging', 'area')).toBe(
      '平均使用サイズは縦・横の両方を入れてください',
    );
  });
});

describe('SPEC-V10 §1.5 一覧・選択シートの行に出す「何あたり」の 1 行', () => {
  const packaging = { type: 'packaging' as const, packQuantity: 0 };

  it('手で金額を入れた行には出さない（その額が 1 回ぶんそのもの）', () => {
    expect(presetUnitNote(packaging)).toBeNull();
  });

  it('個数から計算した行は「1個あたり」', () => {
    expect(presetUnitNote({ ...packaging, packQuantity: 100 })).toBe('1個あたり');
  });

  it('使用回数から計算した行は「1回あたり」', () => {
    expect(presetUnitNote({ ...packaging, calcMethod: 'usage', packQuantity: 50 })).toBe(
      '1回あたり',
    );
  });

  it('面積から計算した行は、平均使用サイズを添えて「1回あたり」', () => {
    expect(
      presetUnitNote({
        ...packaging,
        calcMethod: 'area',
        packHeight: 100,
        packWidth: 100,
        useHeight: 30,
        useWidth: 20,
      }),
    ).toBe('1回あたり（30×20cm）');
  });

  it('平均使用サイズを入れていない面積の行は「1㎡あたり」（額の単位が他の行と違う）', () => {
    expect(
      presetUnitNote({ ...packaging, calcMethod: 'area', packHeight: 100, packWidth: 100 }),
    ).toBe('1㎡あたり');
  });

  it('サイズの末尾の .0 は出さない（21.5cm はそのまま）', () => {
    expect(
      presetUnitNote({
        ...packaging,
        calcMethod: 'area',
        packHeight: 100,
        packWidth: 100,
        useHeight: 21.5,
        useWidth: 30,
      }),
    ).toBe('1回あたり（21.5×30cm）');
  });

  it('梱包材以外には出さない（送料は「＋専用資材」の 1 行を持つ）', () => {
    expect(presetUnitNote({ type: 'shipping', packQuantity: 100 })).toBeNull();
    expect(presetUnitNote({ type: 'site', packQuantity: 0 })).toBeNull();
  });
});
