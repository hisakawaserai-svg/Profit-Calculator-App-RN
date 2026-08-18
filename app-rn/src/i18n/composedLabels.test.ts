// ロジック層が**組み立てる**表示語が、ちゃんと言語で切り替わることの検証。
//
// **これも一度実際に取りこぼした箇所の回帰テスト。** 画面の表示語を移しても、
// `logic/` の中でモジュールスコープの配列に畳んでいる語は import 時の言語で固まる。
// 計算タブの帯グラフの項目名（「手元に残る」「販売手数料10%」）がそれで、
// 画面だけ英語になり帯の中だけ日本語のまま残っていた。
//
// 関数の戻り値そのものを日英で比べるので、どこで畳まれていても必ず捕まる。

import { describe, expect, it } from 'vitest';

import { newCalcValues, profitBreakdown, requiredPriceResult } from '@/logic/calcForm';

const FILLED = {
  ...newCalcValues('sourced'),
  salesPrice: '3000',
  purchasePrice: '800',
  postage: '350',
  envelopeCost: '60',
  othersCost: '40',
  commission: 10,
};

/** 帯・一覧に出る項目名だけを取り出す */
function partLabels(locale: 'ja' | 'en'): string[] {
  return profitBreakdown(locale, FILLED).parts.map((part) => part.label);
}

describe('計算タブの帯グラフの項目名', () => {
  it('日本語の項目名が出る', () => {
    expect(partLabels('ja')).toEqual([
      '仕入価格',
      '送料',
      '販売手数料10%',
      '梱包材',
      'その他',
      '手元に残る',
    ]);
  });

  it('英語では全部の項目名が入れ替わる（1 つでも残っていたら落ちる）', () => {
    expect(partLabels('en')).toEqual([
      'Purchase price',
      'Shipping',
      'Selling fee 10%',
      'Packaging',
      'Other',
      'What you keep',
    ]);
  });

  it('金額は言語で変わらない（訳すのは語だけ）', () => {
    const ja = profitBreakdown('ja', FILLED);
    const en = profitBreakdown('en', FILLED);

    expect(en.parts.map((part) => part.amount)).toEqual(ja.parts.map((part) => part.amount));
    expect(en.kept).toBe(ja.kept);
    expect(en.deducted).toBe(ja.deducted);
  });

  it('逆算側の帯も同じように切り替わる（同じ costBreakdown を通る）', () => {
    const target = { ...FILLED, targetProfit: '3000' };
    const ja = requiredPriceResult('ja', target);
    const en = requiredPriceResult('en', target);

    expect(en.parts.map((part) => part.label)).not.toEqual(ja.parts.map((part) => part.label));
    expect(en.requiredPrice).toBe(ja.requiredPrice);
  });
});
