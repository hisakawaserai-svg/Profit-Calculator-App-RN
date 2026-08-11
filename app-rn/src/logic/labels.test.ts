// SPEC-V2 §5.3「確定ラベル表」の検証。
// §6.3 のテスト方針どおり、表示ラベルはこの純粋関数のテストだけで担保し、
// 画面のスナップショットは取らない。

import { describe, expect, it } from 'vitest';

import {
  CHART_UNIT_NOTE,
  filterNoMatchNote,
  filterTagSearchEmptyBody,
  filterTagSearchEmptyTitle,
  filterTagSearchResultLabel,
  filterTagSectionLabel,
  matchingRecordLabel,
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
  presetUnitPriceText,
  presetValueFieldLabel,
  presetValueText,
  PRESET_SECTION_TITLE,
  TAG_ADD_LABEL,
  TAG_SECTION_TITLE,
  tagBlockedNote,
  tagDeletedMessage,
  tagFormTitle,
  versionLabel,
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

  it('注記は全期間で何が変わるかを名指しする（年ごとへの切替も含めて。§1.5-6）', () => {
    expect(CHART_UNIT_NOTE).toBe(
      '全期間を選ぶと刻みが「月ごと」（記録が3年ぶんを超えると「年ごと」）に変わり、' +
        '見出しも「全期間の収支」になります。',
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

describe('UI-SPEC §7 電卓', () => {
  it('見出しは行き先を明示する（§7.1）', () => {
    expect(calculatorTitle('梱包材')).toBe('梱包材の計算');
    expect(calculatorTitle('送料')).toBe('送料の計算');
    // 逆算モードの入力欄も同じ規則で作る
    expect(calculatorTitle('目標の純利益')).toBe('目標の純利益の計算');
  });

  it('書き戻しは「入れる」、合計行は「合計」（§7.1）', () => {
    expect(CALC_SUBMIT_LABEL).toBe('入れる');
    expect(CALC_TOTAL_LABEL).toBe('合計');
  });

  it('積み上げの末尾は記録フォームと同じ「＋ …」の形（§7.1-4）', () => {
    expect(additionLabel(CALC_ADD_ROW_LABEL)).toBe('＋ 行を足す');
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
    expect(additionLabel('x').startsWith(calcRowSignLabel('+'))).toBe(true);
  });

  it('「入れる」が押せない理由を名指しする（§7.4。グレーなだけでは分からない）', () => {
    expect(calculatorBlockedNote('negative')).toBe('合計がマイナスのままでは入れられません');
    expect(calculatorBlockedNote('empty')).toBe('数字を入れると合計が出ます');
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
    expect(presetCountLabel(4)).toBe('4件');
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
    expect(versionLabel('1.0.0')).toBe('バージョン 1.0.0');
  });
});

// ---- SPEC-V4 §2 タグの表示語 ----

describe('SPEC-V4 §2 タグの表示語', () => {
  it('群はプリセットと別の見出しになる（§2.1。目的が違うので同じ群に入れない）', () => {
    expect(TAG_SECTION_TITLE).toBe('記録を分類する');
    expect(TAG_SECTION_TITLE).not.toBe(PRESET_SECTION_TITLE);
  });

  it('追加の口の「＋」は additionLabel の字を使う（半角に振れない）', () => {
    expect(TAG_ADD_LABEL).toBe(additionLabel('追加'));
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
