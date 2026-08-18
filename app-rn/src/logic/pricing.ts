// 「いくらで売る？」画面（SPEC-V9 §9）の材料をひとまとめにする層。
//
// **式は書かない。** 損益分岐点・目標達成価格・シミュレーションはすべて profit.ts（§4）の
// 純粋関数を呼ぶだけで、ここがやるのは「どの数字を並べるか」と「今どの状態か」の判定。
// 画面（PricingScreen）に式を書かないための置き場で、表示の文字列は labels.ts が持つ。
//
// **目標が null のとき、目標に関わる値は 0 ではなく null**（SPEC-V9 §1.2 / §7-3）。
// 「決めていない」と「目標 0 円」は別のもので、0 で代用すると
// 「もう下げられない」と「下げ幅を言えない」が入れ替わる。

import type { RecordKind } from '@/db/schema';

import {
  breakEvenSalesPrice,
  simulateAtPrice,
  simulationPriceRange,
  targetSalesPrice,
  type PriceRange,
  type PriceSimulation,
  type TargetCostInput,
} from './profit';

/**
 * この画面が読む記録の中身。`SaleRecord` をそのまま渡せる形にしてある
 * （余分な列は無視される）ので、テストからは最小の object で呼べる。
 */
export type PricingInput = TargetCostInput & {
  salesPrice: number;
  /** SPEC-V9 §1.2。**null = 決めていない。0 は「利益ゼロを目標にする」という有効な値** */
  targetProfit: number | null;
};

/**
 * 画面の 3 状態（× 目標の有無で 4 パターン）。
 *
 * - `unpriced` … 売る価格が未設定（`salesPrice === 0`）。**主役の数字が出せない**
 * - `loss` … 今の価格が損益分岐点を割っている（売ると手元のお金が減る）
 * - `profit` … 分岐点以上（目標に届いているかは別。`meetsTarget` を見る）
 *
 * **目標の有無は状態に入れない。** 目標は「あるとどの線が上がるか」を変えるだけで、
 * 画面の骨格（主役の数字が出るか・向きが反転するか）を変えるのは価格のほうだから。
 */
export type PricingState = 'unpriced' | 'loss' | 'profit';

export type PricingAnalysis = {
  state: PricingState;
  /** SPEC-V9 §1.2 の区別。**`targetProfit === 0` でも true** */
  hasTarget: boolean;
  /** 決めてある目標額そのもの（表示語に出る額）。**null = 決めていない** */
  targetProfit: number | null;
  currentPrice: number;
  /**
   * 今の価格で売れたときの見込み（§4.5）。**価格未設定のときは null。**
   *
   * 0 円の記録に「純利益 −2,800 円」と出さないための null ── 未設定は
   * 「0 円で売る」ではなく「まだ決めていない」で、引き算の答えを出す場面ではない。
   */
  current: PriceSimulation | null;
  /** §4.1 損益分岐点 */
  breakEven: number;
  /** §4.2 目標達成最低価格。目標が null なら null */
  targetPrice: number | null;
  /**
   * 「ここまでなら下げてよい」の下限 ＝ `targetPrice ?? breakEven`。
   * 目標を決めると基準線が分岐点から目標ラインへ**上がる**（画面の B が A と違う点はこれだけ）。
   */
  floorPrice: number;
  /** 現在価格 − floorPrice。**負なら 0**（§4.3 と同じ理由で、下げ幅にマイナスは無い） */
  room: number;
  /** 分岐点までの不足額（赤字のときだけ正）。黒字なら 0 */
  breakEvenShortfall: number;
  /** 目標達成価格までの不足額。**目標が null なら null**。届いていれば 0 */
  targetShortfall: number | null;
  /** 目標に届いているか。**目標が null なら null**（「届いていない」ではない） */
  meetsTarget: boolean | null;
  /** §4.6 シミュレーターが動かせる範囲 */
  range: PriceRange;
  /** 手数料以外の経費（＝価格が無くても分かっている「すでにかかった費用」。E の 1 行目） */
  spent: number;
};

/** 記録 1 件ぶんの分析（画面はこれ 1 つを受け取る） */
export function analyzePricing(input: PricingInput): PricingAnalysis {
  const { salesPrice, targetProfit, ...costs } = input;

  const breakEven = breakEvenSalesPrice(costs);
  const targetPrice = targetSalesPrice(targetProfit, costs);
  const floorPrice = targetPrice ?? breakEven;

  // 価格が未設定（0）のときだけは、分岐点との大小で赤字と呼ばない ──
  // 0 円は必ず分岐点を割るので、放っておくと全部「赤字」になってしまう
  const state: PricingState =
    salesPrice === 0 ? 'unpriced' : salesPrice < breakEven ? 'loss' : 'profit';

  return {
    state,
    hasTarget: targetProfit != null,
    targetProfit,
    currentPrice: salesPrice,
    current: state === 'unpriced' ? null : simulateAtPrice(salesPrice, costs),
    breakEven,
    targetPrice,
    floorPrice,
    room: Math.max(0, salesPrice - floorPrice),
    breakEvenShortfall: Math.max(0, breakEven - salesPrice),
    targetShortfall: targetPrice == null ? null : Math.max(0, targetPrice - salesPrice),
    meetsTarget: targetPrice == null ? null : salesPrice >= targetPrice,
    range: simulationPriceRange(salesPrice, costs),
    spent: costs.purchasePrice + costs.postage + costs.envelopeCost + costs.othersCost,
  };
}

/**
 * 結論の帯（画面の 3 段目）が言うこと。**文字列は labels.ts が組み立てる。**
 *
 * - `safe` … 分岐点まで下げる余裕がある（目標なし・黒字。A）
 * - `safeWithTarget` … 目標ラインまで下げる余裕がある（目標あり・黒字。B）
 * - `belowTarget` … 赤字ではないが目標には届いていない（**モックに無い 5 つ目**。下記）
 * - `loss` … 赤字（目標なし。C）
 * - `lossWithTarget` … 赤字（目標あり。D。2 行目が目標に戻す価格に変わる）
 *
 * `belowTarget` を持つのは、**目標を決めた記録では必ず通る道**だから ──
 * 目標 1,000 円に対して今の価格が分岐点と目標ラインの間にあるとき、B の文
 * （「あと ¥777 は下げられます」）は 0 円の余裕を「下げられます」と言うことになる。
 */
export type PricingConclusion =
  | 'safe'
  | 'safeWithTarget'
  | 'belowTarget'
  | 'loss'
  | 'lossWithTarget';

/** 帯の色。good = 青 / warn = オレンジ / bad = 赤（theme の *Background と対で使う） */
export type PricingTone = 'good' | 'warn' | 'bad';

export const CONCLUSION_TONES: Record<PricingConclusion, PricingTone> = {
  safe: 'good',
  safeWithTarget: 'good',
  belowTarget: 'warn',
  loss: 'bad',
  lossWithTarget: 'bad',
};

/** 結論の帯の種類。**価格未設定のときは帯そのものを出さない**ので null */
export function pricingConclusion(analysis: PricingAnalysis): PricingConclusion | null {
  if (analysis.state === 'unpriced') return null;
  if (analysis.state === 'loss') return analysis.hasTarget ? 'lossWithTarget' : 'loss';
  if (!analysis.hasTarget) return 'safe';
  return analysis.meetsTarget === true ? 'safeWithTarget' : 'belowTarget';
}

/**
 * 記録詳細の帯グラフに足す結論行（O3 案）が使う 4 状態。
 *
 * 全画面の結論の帯（PricingConclusion）と違い、`belowTarget`（黒字だが目標未達）は
 * `safeWithTarget` と**同じ文言でよい**ので合流させる ── どちらも「floorPrice
 * （＝目標ライン）まで下げられる」としか言わず、目標に届いているかどうかは
 * この 1 行の主題ではない（届いているかはレシートの結果行の色が言う）。
 *
 * 価格未設定（`unpriced`）は結論を出せない（赤字/目標達成の判定に価格が必要）ので、
 * `'unpriced'` という専用の一種類として扱う ── null にすると「行自体が無い」ことになり、
 * 記録詳細から G（価格が無くても分かっていること）への入口が消えてしまう。
 * 呼び出し側は `'unpriced'` を「専用文言で入口だけ出す」に使う（結論文は出さない）。
 */
export type RecordDetailConclusion =
  | 'safe'
  | 'safeWithTarget'
  | 'loss'
  | 'lossWithTarget'
  | 'unpriced';

export function recordDetailConclusion(analysis: PricingAnalysis): RecordDetailConclusion {
  if (analysis.state === 'unpriced') return 'unpriced';
  if (analysis.state === 'loss') return analysis.hasTarget ? 'lossWithTarget' : 'loss';
  return analysis.hasTarget ? 'safeWithTarget' : 'safe';
}

/**
 * 価格ラインの目盛り（左 → 右）。**値の昇順に並べるだけ**で、赤字のときの
 * 「今の価格が左・分岐点が右」という逆転もこの並びから自然に出る
 * （順序を状態ごとに書き分けると、2 つの規則が食い違う余地ができる）。
 *
 * **目標が無いときは目標の点を作らない**（空の目盛りを残さない。画面の A の指定）。
 */
export type PriceTickKey = 'current' | 'breakEven' | 'target';
export type PriceTick = { key: PriceTickKey; value: number };

export function priceLineTicks(analysis: PricingAnalysis): PriceTick[] {
  const ticks: PriceTick[] = [
    { key: 'breakEven', value: analysis.breakEven },
    { key: 'current', value: analysis.currentPrice },
  ];
  if (analysis.targetPrice != null) {
    ticks.push({ key: 'target', value: analysis.targetPrice });
  }
  return ticks.sort((a, b) => a.value - b.value);
}

/**
 * シミュレーターの初期値。
 *
 * - 黒字 … **今の価格そのもの**。開いた時点では何も変えていないので、
 *   記録に書き戻すボタンも押せない状態から始まる（勝手に値下げ案を置かない）
 * - 赤字 … **損益分岐点**。この画面で赤字の記録を開いてすることは
 *   「黒字になる価格を探す」なので、その答えの位置から始める
 * - 価格未設定 … シミュレーターは不活性なので値は使われない。範囲の下端を返す
 */
export function initialSimulationPrice(analysis: PricingAnalysis): number {
  if (analysis.state === 'loss') return analysis.breakEven;
  if (analysis.state === 'unpriced') return analysis.range.min;
  return analysis.currentPrice;
}

/**
 * シミュレーターの判定（カード下部の 1 行）。**「達成」は目標があるときだけ。**
 *
 * - `loss` … その価格ではまだ赤字
 * - `turnsProfit` … 赤字の記録が黒字になる（C の「黒字になります（手取り ¥80）」）
 * - `roomLeft` … 目標なし・黒字。分岐点までの残りを言う（A の「まだ ¥1,388 の余裕があります」）
 * - `belowTarget` … 目標に届かない（赤字ではない）
 * - `targetMet` … 目標を達成（B）
 */
export type SimulationVerdictKey =
  | 'loss'
  | 'turnsProfit'
  | 'roomLeft'
  | 'belowTarget'
  | 'targetMet';

export type SimulationVerdict = {
  key: SimulationVerdictKey;
  tone: PricingTone;
  /** その価格での見込み（§4.5） */
  simulation: PriceSimulation;
  /** 分岐点までの残り（roomLeft / belowTarget の「あと ¥…」に使う） */
  room: number;
  /** 目標までの不足。目標が無ければ null */
  shortfall: number | null;
};

export function simulationVerdict(
  analysis: PricingAnalysis,
  price: number,
  costs: TargetCostInput,
): SimulationVerdict {
  const simulation = simulateAtPrice(price, costs);
  const room = Math.max(0, price - analysis.floorPrice);
  const shortfall =
    analysis.targetPrice == null ? null : Math.max(0, analysis.targetPrice - price);

  const key = verdictKey(analysis, price);
  return { key, tone: VERDICT_TONES[key], simulation, room, shortfall };
}

const VERDICT_TONES: Record<SimulationVerdictKey, PricingTone> = {
  loss: 'bad',
  turnsProfit: 'good',
  roomLeft: 'good',
  belowTarget: 'warn',
  targetMet: 'good',
};

function verdictKey(analysis: PricingAnalysis, price: number): SimulationVerdictKey {
  if (price < analysis.breakEven) return 'loss';
  if (analysis.targetPrice != null) {
    return price >= analysis.targetPrice ? 'targetMet' : 'belowTarget';
  }
  // 目標が無いので「達成」は言えない。赤字だった記録なら黒字になったこと自体が答えで、
  // もともと黒字なら分岐点までの残りが答えになる
  return analysis.state === 'loss' ? 'turnsProfit' : 'roomLeft';
}

/**
 * シミュレーターの値を記録に書き戻せるか。
 *
 * - 今の価格と同じなら押せない（書き換えるものが無い）
 * - **赤字の記録では分岐点に届いていないと押せない** ── ボタンの語が
 *   「価格を ¥3,112 以上に直す」なので、届いていない価格で押せると文が嘘になる
 */
export function canApplyPrice(analysis: PricingAnalysis, price: number): boolean {
  if (analysis.state === 'unpriced') return false;
  if (price === analysis.currentPrice) return false;
  return analysis.state !== 'loss' || price >= analysis.breakEven;
}

// ──────────────────────────────────────────────────────────────────────────
// 売却済み分析「どうだった？」。出品中の 3 状態（unpriced/loss/profit）と
// PricingAnalysis はそのまま流用する（売れた価格を salesPrice として渡せばよい）。
// ここに足すのは「見出しがどの文言になるか」「達成バーの割合」「経過日数の 3 分岐」の
// 3 つだけ ── どれも既存の PricingAnalysis / elapsedDays の上に乗るだけの判定で、
// 損益分岐点や目標達成価格の式そのものは 1 本も増やさない。
// ──────────────────────────────────────────────────────────────────────────

/**
 * 売却済み画面の見出しの出し分け（目標の有無 × 達成したか）。
 *
 * - `noTarget` … 目標なし（標準）。「どこまで下げられた取引だったか」
 * - `targetMet` … 目標あり・達成。「値下げの余裕はどれだけあったか」
 * - `belowTarget` … 目標あり・未達成。同じ見出しだが「保てませんでした」側の文言になる
 * - `unpriced` … 売れた価格が未設定。**結論文は出せない**（達成の判定に価格が必要）ので、
 *   出品中側（`recordDetailConclusion`）とまったく同じく専用の一種類として扱う
 *
 * **`unpriced` で null を返してはいけない。** 記録詳細の入口の行（PricingEntryRow）は
 * この戻り値が null かどうかで出す・出さないを決めているので、null にすると
 * 「売れた × 価格未設定」の記録だけこの画面へ**到達できなくなる**（2026-08-18 に実機で発覚）。
 * この状態は「通常起きない」ものではない ── 記録詳細の「売れた」は価格を一切見ずに
 * 販売日を入れるだけなので（SaleRecordDetailScreen の handleMarkSold）、
 * 売値を入れないまま売却済みにするのは普通の使い方でできる。
 */
export type SoldConclusion = 'noTarget' | 'targetMet' | 'belowTarget' | 'unpriced';

/**
 * 価格が入っている売却済みの 3 状態。**結論文（見出し・本文）を出せるのはこれだけ**なので、
 * 文言側（labels.ts の soldSectionTitle / soldSectionBody）はこちらを受け取る ──
 * `unpriced` を渡せないことを型で示しておけば、呼ぶ前に必ず分岐が要る。
 */
export type PricedSoldConclusion = Exclude<SoldConclusion, 'unpriced'>;

export function soldConclusion(analysis: PricingAnalysis): SoldConclusion {
  if (analysis.state === 'unpriced') return 'unpriced';
  if (!analysis.hasTarget) return 'noTarget';
  return analysis.meetsTarget ? 'targetMet' : 'belowTarget';
}

/**
 * 達成バーの割合（0〜1）。目標が null なら null（バーそのものを出さない判定に使う）。
 *
 * 目標を超えていてもバーは 100% で止める ── バーは「届いたか」を面積で見せる部品で、
 * 超過分の量は隣のバッジ（「目標より +¥700」）が数字で言う。
 * 目標 0 円は「利益ゼロを目標にする」という有効な目標なので、黒字なら達成（1）、
 * 赤字なら未達成（0）として扱う（0 除算を避けつつ、0 ÷ 0 のような意味不明な値を返さない）。
 */
export function targetAchievementRatio(analysis: PricingAnalysis): number | null {
  if (analysis.targetProfit == null || analysis.current == null) return null;
  if (analysis.targetProfit === 0) return analysis.current.netProfit >= 0 ? 1 : 0;
  return Math.max(0, Math.min(1, analysis.current.netProfit / analysis.targetProfit));
}

/**
 * 経過日数の 3 分岐（記録日 → 販売日）。**elapsedDays（§4.7）の上に判定を足すだけ**で、
 * 日数の数え方そのものはここでは持たない。
 *
 * - `reversed` … 販売日が記録日より前（日付の誤り）。経過日数も 1 日あたり利益も出さない
 * - `sameDay` … 記録した日に売れた（0 日）。割り算をしない
 * - `normal` … それ以外。`days` は 1 以上
 */
export type SoldElapsed =
  | { kind: 'reversed' }
  | { kind: 'sameDay' }
  | { kind: 'normal'; days: number };

export function soldElapsed(days: number): SoldElapsed {
  if (days < 0) return { kind: 'reversed' };
  if (days === 0) return { kind: 'sameDay' };
  return { kind: 'normal', days };
}

/**
 * 1 日あたり利益。**仕入品（`kind === 'sourced'`）かつ経過日数が数えられるときだけ**返す。
 *
 * 不用品では出さない ── 「仕入れて何日で回収したか」を言う数字なので、
 * 仕入れの無い不用品には意味がない。0 日・日付逆転（`normal` 以外）でも出さない
 * （0 除算を避けるためではなく、そもそも割り算が意味を持たない場面のため）。
 */
export function soldPerDayProfit(
  kind: RecordKind,
  elapsed: SoldElapsed,
  netProfit: number,
): number | null {
  if (kind !== 'sourced') return null;
  if (elapsed.kind !== 'normal') return null;
  return netProfit / elapsed.days;
}
