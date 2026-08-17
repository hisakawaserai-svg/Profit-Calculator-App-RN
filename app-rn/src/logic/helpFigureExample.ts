// 使いかたの図が使う題材のうち、**中身が条件を満たしているかを試験したいもの。**
//
// 図そのもの（`HelpDiagram` / `HelpPartFigure`）はコンポーネントなので vitest から読めない。
// 題材だけをここへ置くと、「図が図として成り立つ条件」を画面を開く前に固定できる ──
// 目盛りが 2 点に潰れていないか、段位が飛んでいないか、といった類のこと。
//
// **語や色は持たない。** 表示語は labels.ts、色は theme.ts / TIER_COLORS の側にあり、
// ここにあるのは「どの記録を」「どの実績を」例に使うかという選択だけ。
//
// ---
//
// ## 1. 「売る」ページの図が共有する 1 件（SPEC-V9 §9）
//
// ## なぜ図の中ではなくここに置くか
//
// `HelpDiagram.tsx` の冒頭には「図の中の語と数字はこのファイルに置く」と書いてある。
// あれは**1 つの図の中で幅・凡例・金額が食い違わないようにする**ための決まりで、
// この題材はその条件を 1 つ超えている ── **2 つのファイルの 3 つの図**が同じ 1 件を読む:
//
//   - `HelpPartFigure.PriceLineFigure`  … 実物の `PriceLine`（目盛り 3 点）
//   - `HelpPartFigure.SimulatorFigure`  … 実物の `PriceSlider`（範囲と見込み）
//   - `HelpDiagram.TargetRoomFigure`    … 目標の持ち方 3 通りと下げ幅
//
// 片方のファイルに置いてもう片方が import すると、図どうしに上下関係ができる。
// **数字だけを持つ場所を 1 つ作る**ほうが素直で、しかもここなら試験できる
// （`src/logic/` は純粋なロジックの層で、コンポーネントは vitest から読めない）。
//
// ## 経費の組み合わせを選んである
//
// 1,300 ＋ 400 ＋ 100 = 1,800、手数料 10% なので 1,800 ÷ 0.9 = **分岐点ちょうど 2,000 円**。
// 目標 900 円なら (1,800 ＋ 900) ÷ 0.9 = **3,000 円**。図の中で読む数字に端数が出ないので、
// 「¥2,111」のような額に気を取られずに、線の上の**位置関係**だけを読める。
//
// この関係（3 点が離れていること・試している価格が範囲の内側にあること）は
// 図の読みやすさそのものなので、`helpFigureExample.test.ts` で固定してある。

import type { AchievementId } from './achievements';
import type { PricingInput } from './pricing';

/** 3 つの図が共有する 1 件。**目標あり・黒字**の、いちばん普通の出品中の記録 */
export const PRICING_EXAMPLE: PricingInput = {
  salesPrice: 5000,
  purchasePrice: 1300,
  postage: 400,
  envelopeCost: 100,
  othersCost: 0,
  commission: 10,
  targetProfit: 900,
};

/**
 * シミュレーターの図で「いま試している価格」。
 *
 * **今の価格より下**にする ── あの図が描いているのは値下げを試している最中で、
 * つまみが右端（＝今の価格のまま）に貼り付いていると、動かせることが読めない。
 */
export const PRICING_EXAMPLE_SIMULATED_PRICE = 4000;

// ---
//
// ## 2. 実績の図（`HelpDiagram.AchievementKindsFigure`）が並べる実績

/**
 * 「5 段階で登るもの」の例に使うジャンル。**⚡一撃を選んである。**
 *
 * 名前にしきい値の額がそのまま入っている（一撃¥1,000 → 一撃¥50,000）ので、
 * 段が上がるほど条件が重くなることが、★の数を数えなくても名前の側から読める。
 * 累計利益や販売件数でも成り立つが、⚡一撃だけは★5 に固有名（利益ハンター）が無く、
 * 5 行が同じ形の名前でそろう ── 図の中で 1 行だけ命名規則が変わらない。
 *
 * **並びは難易度の昇順**（ブロンズ → レジェンド）。図はこの順で上から積み、
 * 各段に `achievementBadgeTierName()` の段位名を添えるので、
 * 順番が崩れると段位の列がそのまま嘘になる（helpFigureExample.test.ts で固定）。
 */
export const ACHIEVEMENT_LADDER_IDS = [
  'profit_1000',
  'profit_5000',
  'profit_10000',
  'profit_30000',
  'profit_50000',
] as const satisfies readonly AchievementId[];

/**
 * 「条件を満たすと 1 回だけ付くもの」の例。
 *
 * **成長系ではないジャンルから採る。** 段を持たない実績にも段位はあるので、
 * 図では★と段位名を同じように出す ── 違いは「5 つ並んで登るか、1 つで終わるか」だけで、
 * ★や段位の有無ではない（実物の実績詳細も、単発の実績に★と段位チップを出す）。
 */
export const ACHIEVEMENT_ONCE_ID = 'instant_sale' satisfies AchievementId;
