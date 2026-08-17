// 「図として成り立つ条件」を画面を開く前に固定する（helpFigureExample.test.ts と同じ考え方）。

import { describe, expect, it } from 'vitest';

import { achievementCategory } from './achievements';
import {
  ONBOARDING_ACHIEVEMENT_CATEGORIES,
  ONBOARDING_ACHIEVEMENT_FEATURED_ID,
  ONBOARDING_CALC_EXAMPLE,
  ONBOARDING_CHART_PROFITS,
  ONBOARDING_DATA_EXAMPLE,
  ONBOARDING_ITEM_NAME_EXAMPLE,
  ONBOARDING_PACKAGING_PRESET_EXAMPLE,
  ONBOARDING_PAGES,
  ONBOARDING_SHIPPING_PRESET_EXAMPLE,
  ONBOARDING_SITE_PRESET_EXAMPLE,
  ONBOARDING_TAG_EXAMPLE,
  ONBOARDING_TARGET_PROFIT_EXAMPLE,
} from './onboardingContent';

describe('初回起動チュートリアルの構成', () => {
  it('8 ページぶんある（計算 → 逆算 → プリセット → 保存の仕方 → 値下げ → データ → 梱包材のまとめ買い → 実績）', () => {
    expect(ONBOARDING_PAGES).toHaveLength(8);
    expect(ONBOARDING_PAGES.map((page) => page.id)).toEqual([
      'calc',
      'target',
      'preset',
      'save',
      'simulator',
      'data',
      'packagingPreset',
      'achievements',
    ]);
  });

  it('ページの id・見出し・本文が重複していない', () => {
    expect(new Set(ONBOARDING_PAGES.map((page) => page.id)).size).toBe(8);
    expect(new Set(ONBOARDING_PAGES.map((page) => page.title)).size).toBe(8);
    expect(new Set(ONBOARDING_PAGES.map((page) => page.body)).size).toBe(8);
  });

  it('梱包材のまとめ買い計算の題材は 500円 ÷ 10個 = 1個あたり50円（presetUnitPrice と同じ割り算）', () => {
    const { packPrice, packQuantity } = ONBOARDING_PACKAGING_PRESET_EXAMPLE;
    expect(packPrice / packQuantity).toBe(50);
  });

  it('梱包材のまとめ買い計算のページは実績の直前（終盤）に置いてある', () => {
    const packagingIndex = ONBOARDING_PAGES.findIndex((page) => page.id === 'packagingPreset');
    const achievementsIndex = ONBOARDING_PAGES.findIndex((page) => page.id === 'achievements');
    expect(packagingIndex).toBe(achievementsIndex - 1);
  });

  it('送料プリセットの例は「送料のみ」の額より「＋資材」の額（value）の方が大きい', () => {
    const { value, materialCost } = ONBOARDING_SHIPPING_PRESET_EXAMPLE;
    expect(materialCost).toBeGreaterThan(0);
    expect(value - materialCost).toBeGreaterThan(0);
    expect(value).toBeGreaterThan(value - materialCost);
  });

  it('販売サイト（手数料）プリセットの例は種類が site で、率が 0〜100% の範囲', () => {
    expect(ONBOARDING_SITE_PRESET_EXAMPLE.type).toBe('site');
    expect(ONBOARDING_SITE_PRESET_EXAMPLE.value).toBeGreaterThan(0);
    expect(ONBOARDING_SITE_PRESET_EXAMPLE.value).toBeLessThanOrEqual(100);
  });

  it('実績のアイコン行は 5 ジャンル・重複なし（紫・緑・ティール・青・オレンジの 5 色ぶん）', () => {
    expect(ONBOARDING_ACHIEVEMENT_CATEGORIES).toHaveLength(5);
    expect(new Set(ONBOARDING_ACHIEVEMENT_CATEGORIES).size).toBe(5);
  });

  it('全画面表示で下に置く実例は「始める系」の 1 つ（first_sale）', () => {
    expect(achievementCategory(ONBOARDING_ACHIEVEMENT_FEATURED_ID)).toBe('start');
  });

  it('計算の題材は 5,000円 − 600円(送料) − 100円(梱包材) − 10%手数料 = 3,800円 になる', () => {
    const { salesPrice, postage, envelopeCost, commission } = ONBOARDING_CALC_EXAMPLE;
    const netProfit = salesPrice - postage - envelopeCost - salesPrice * (commission / 100);
    expect(netProfit).toBe(3800);
  });

  it('逆算の目標額は 0 より大きい', () => {
    expect(ONBOARDING_TARGET_PROFIT_EXAMPLE).toBeGreaterThan(0);
  });

  it('データの題材は 収支 = 売上 − 経費 が成り立つ（DataSummaryBar の例と同じ額）', () => {
    const { totalNetProfit, totalSales, totalExpenses } = ONBOARDING_DATA_EXAMPLE;
    expect(totalNetProfit).toBe(totalSales - totalExpenses);
  });

  it('グラフの日別収支の合計は集計段の収支（¥12,685）とぴったり一致する', () => {
    const sum = ONBOARDING_CHART_PROFITS.reduce((total, value) => total + value, 0);
    expect(sum).toBe(ONBOARDING_DATA_EXAMPLE.totalNetProfit);
  });

  it('グラフには赤字の日が 1 つ混ざっている（BarChart の符号色の挙動も見せるため）', () => {
    expect(ONBOARDING_CHART_PROFITS.some((value) => value < 0)).toBe(true);
  });

  it('商品名の例とタグの例が空でなく、内容が食い違わない（腕時計 → アクセサリー）', () => {
    expect(ONBOARDING_ITEM_NAME_EXAMPLE.length).toBeGreaterThan(0);
    expect(ONBOARDING_TAG_EXAMPLE.length).toBeGreaterThan(0);
    expect(ONBOARDING_ITEM_NAME_EXAMPLE).not.toBe(ONBOARDING_TAG_EXAMPLE);
  });
});
