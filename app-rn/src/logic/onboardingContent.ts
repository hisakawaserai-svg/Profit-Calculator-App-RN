// 初回起動チュートリアルの構成（5 ページ・横スワイプ）。**文言と並びだけを持つ純粋なデータ。**
// helpContent.ts と同じ分け方 ── 図そのもの（OnboardingFigure.tsx）はコンポーネントなので
// vitest から読めない。ページの並び・見出し・題材の選び方だけをここに置いて試験できるようにする。
//
// 表示語は labels.ts 経由（SPEC-V2 §5.3）。ここでは組み立てない。

import type { AchievementCategory, AchievementId } from './achievements';
import {
  ONBOARDING_ACHIEVEMENTS_BODY,
  ONBOARDING_ACHIEVEMENTS_TITLE,
  ONBOARDING_CALC_BODY,
  ONBOARDING_CALC_TITLE,
  ONBOARDING_DATA_BODY,
  ONBOARDING_DATA_TITLE,
  ONBOARDING_PACKAGING_PRESET_BODY,
  ONBOARDING_PACKAGING_PRESET_TITLE,
  ONBOARDING_PRESET_BODY,
  ONBOARDING_PRESET_TITLE,
  ONBOARDING_SAVE_BODY,
  ONBOARDING_SAVE_TITLE,
  ONBOARDING_SIMULATOR_BODY,
  ONBOARDING_SIMULATOR_TITLE,
  ONBOARDING_TARGET_BODY,
  ONBOARDING_TARGET_TITLE,
} from './labels';

export type OnboardingPageId =
  | 'calc'
  | 'target'
  | 'preset'
  | 'save'
  | 'simulator'
  | 'data'
  | 'packagingPreset'
  | 'achievements';

export type OnboardingPage = {
  id: OnboardingPageId;
  title: string;
  body: string;
};

/**
 * ページの並び（計算 → 逆算＋記録 → 保存の仕方 → 値下げシミュレーション → データ →
 * プリセット・電卓 → 梱包材のまとめ買い計算 → 実績）。
 *
 * プリセットは梱包材のまとめ買い計算（電卓の中からプリセットを呼び出す話）の一歩手前の
 * 前提知識にあたるので、梱包材のまとめ買い計算ページの直前に置く（構成の指定「プリセット設定の
 * チュートリアル画面を梱包材プリセットの一つ前の画面に移動」）。
 * シミュレーションは「保存したあと、出品中に値段を動かす話」なので保存の直後に置く
 * （まだ売れていない記録に対してだけ意味を持つ機能のため）。
 * 梱包材のまとめ買い計算は「プリセットを**編集する**ときだけ出る、一歩踏み込んだ機能」
 * なので、他のページ（記録の作り方の一直線の流れ）から離し、終盤（実績の直前）に置く
 * （構成の指定「最後らへんに移動」）。
 */
export const ONBOARDING_PAGES: readonly OnboardingPage[] = [
  { id: 'calc', title: ONBOARDING_CALC_TITLE, body: ONBOARDING_CALC_BODY },
  { id: 'target', title: ONBOARDING_TARGET_TITLE, body: ONBOARDING_TARGET_BODY },
  { id: 'save', title: ONBOARDING_SAVE_TITLE, body: ONBOARDING_SAVE_BODY },
  { id: 'simulator', title: ONBOARDING_SIMULATOR_TITLE, body: ONBOARDING_SIMULATOR_BODY },
  { id: 'data', title: ONBOARDING_DATA_TITLE, body: ONBOARDING_DATA_BODY },
  { id: 'preset', title: ONBOARDING_PRESET_TITLE, body: ONBOARDING_PRESET_BODY },
  {
    id: 'packagingPreset',
    title: ONBOARDING_PACKAGING_PRESET_TITLE,
    body: ONBOARDING_PACKAGING_PRESET_BODY,
  },
  { id: 'achievements', title: ONBOARDING_ACHIEVEMENTS_TITLE, body: ONBOARDING_ACHIEVEMENTS_BODY },
];

/**
 * 1・2 ページ目の図が共有する題材。送料・梱包材・手数料を同じ条件で続けて読めるようにする。
 * 梱包材（envelopeCost）も入れてあるのは、1 ページ目の入力欄・2 ページ目の内訳のどちらでも
 * 「販売価格だけでなく複数の経費が引かれる」ことが帯グラフ（CostProportionBar）に出るようにするため
 * （送料・手数料の 2 項目だけだと、経費の区画が 1 色に潰れて「内訳」の絵にならない）。
 */
export const ONBOARDING_CALC_EXAMPLE = {
  salesPrice: 5000,
  postage: 600,
  envelopeCost: 100,
  commission: 10,
} as const;

/** 2 ページ目（逆算）の目標額。1 ページ目と同じ送料・梱包材・手数料条件で、実物の逆算関数にそのまま渡す */
export const ONBOARDING_TARGET_PROFIT_EXAMPLE = 5000;

/**
 * プリセットページの送料プリセットの題材（実物の PresetRow にそのまま渡す）。
 * 資材費（materialCost）を持たせてあるのは、送料プリセットが「送料のみ／＋資材」の
 * 2 択を持つ実物の挙動（PresetRow の belowName）まで見せるため。
 */
export const ONBOARDING_SHIPPING_PRESET_EXAMPLE = {
  type: 'shipping',
  name: '宅配 60サイズ',
  initial: '60',
  colorKey: 'green',
  value: 750,
  materialCost: 100,
} as const;

/**
 * プリセットページの販売サイト（手数料）プリセットの題材。送料・梱包材だけでなく
 * 手数料もプリセットから選べることを見せる（構成の指定「販売手数料（サイト）と送料もあるでしょ」）。
 * 実物の PresetRow は type が 'site'（isRatePreset）だと右端の額を「%」で出す。
 * 名前は実在のサービス名を挙げず、設定タブの開発用シード（手数料10%等）と同じ
 * 「手数料そのものを名前にする」形にしてある。
 */
export const ONBOARDING_SITE_PRESET_EXAMPLE = {
  type: 'site',
  name: '手数料10%',
  initial: '10',
  colorKey: 'red',
  value: 10,
} as const;

/** 3 ページ目（保存の仕方）の商品名欄に出す記入済みの例。空欄のプレースホルダではなく
 * 「実際に入れた状態」を見せる（構成の指定） */
export const ONBOARDING_ITEM_NAME_EXAMPLE = '腕時計';

/** 同じページのタグの例。商品名（腕時計）と食い違わないジャンルにする */
export const ONBOARDING_TAG_EXAMPLE = 'アクセサリー';

/**
 * 梱包材のまとめ買い計算ページの題材。実物の presetUnitPrice（logic/preset.ts）は
 * 「購入価格 ÷ 入数（個）」の割り算だけを行う（面積・サイズ単位の計算には対応していない）。
 * 500 円で 10 個入りを買った例にしてあるのは、1 個あたりがちょうど 50 円という
 * 割り切れる額になり、割り算そのものが一目で正しいと分かるようにするため。
 *
 * name/initial/colorKey も持たせてあるのは、この題材を「登録する」図（PackBuyFields）だけでなく
 * 「電卓から呼び出す」図（PresetMultiPickerSheet の簡易再現）の両方に同じ 1 件として使うため
 * （構成の指定「設定した梱包材のプリセットは電卓から呼び出すことを矢印で表して」）。
 */
export const ONBOARDING_PACKAGING_PRESET_EXAMPLE = {
  name: '緩衝材（小）',
  initial: '緩',
  colorKey: 'orange',
  packPrice: 500,
  packQuantity: 10,
} as const;

/**
 * 5 ページ目の丸アイコンに使う 5 ジャンル（構成の指定「紫・緑・ティール・青・オレンジ」）。
 * 色とアイコンは実物と同じ定数（AchievementsSection.categoryColor / CATEGORY_ICONS）から引く。
 * 並びは 1 ジャンル 1 色の実物の対応（紫=start / 緑=strike / ティール=career_profit /
 * 青=sold_count / オレンジ=tag）と揃えてある。
 */
export const ONBOARDING_ACHIEVEMENT_CATEGORIES: readonly AchievementCategory[] = [
  'start',
  'strike',
  'career_profit',
  'sold_count',
  'tag',
];

/**
 * アイコン行の下に「実物の全画面表示」をそのまま置く 1 件（AchievementDetailModal.AchievementPage
 * を export して再利用）。「はじめる系」の実例として `first_sale`（「初めての一歩」。
 * はじめる系の中でいちばん早く解除される、しきい値 1 件の実績）を選んである ──
 * 初回起動という文脈にいちばん近い「最初の 1 歩」を実例にするため。
 */
export const ONBOARDING_ACHIEVEMENT_FEATURED_ID = 'first_sale' satisfies AchievementId;

/**
 * 4 ページ目（データ）の集計段の題材。DataSummaryBar.tsx 冒頭のコメントの例
 * （売上 ¥15,145 / 経費 ¥2,460）と同じ売上・経費を使う。収支はその差（¥12,685）── コメントの
 * ¥12,686 は別の例からの丸めが混ざった値なので使わず、ここでは「収支 = 売上 − 経費」が
 * 実物と同じ関係で閉じるようにする。
 */
export const ONBOARDING_DATA_EXAMPLE = {
  period: '2026-08',
  earliestMonthKey: '2026-01',
  currentMonthKey: '2026-08',
  totalSales: 15145,
  totalExpenses: 2460,
  totalNetProfit: 15145 - 2460,
} as const;

/**
 * 「収支の推移」グラフ（実物の BarChart）に渡す 1 週間ぶんの日別収支。
 * 合計が ONBOARDING_DATA_EXAMPLE.totalNetProfit（¥12,685）とぴったり一致するようにしてある ──
 * 集計段の額とグラフの額が図の中で食い違わないようにするため。赤字の日を 1 つ混ぜて
 * あるのは、実物の BarChart が符号で棒の色（緑/赤）を変える挙動も見せるため。
 */
export const ONBOARDING_CHART_PROFITS: readonly number[] = [1200, -300, 2500, 4000, 1800, 3485];
