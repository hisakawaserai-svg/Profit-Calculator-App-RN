// SPEC.md §2 計算ロジック（純粋関数）
// 保存値・中間値は number のまま保持し、丸めは表示の瞬間のみ（SPEC §2.6）。

import { listingDays } from './listingDays';

export type CostInput = {
  salesPrice: number;
  purchasePrice: number;
  postage: number;
  envelopeCost: number;
  othersCost: number;
  /** 手数料率（%）。10 = 10% */
  commission: number;
};

/** §2.2 手数料額。丸めなし。 */
export function commissionCost(input: CostInput): number {
  return input.salesPrice * (input.commission / 100);
}

/** §2.4 経費合計（手数料込み）。丸めなし。 */
export function totalExpenses(input: CostInput): number {
  return (
    input.purchasePrice +
    input.postage +
    input.envelopeCost +
    input.othersCost +
    commissionCost(input)
  );
}

/** §2.3 純利益。丸めなし。 */
export function netProfit(input: CostInput): number {
  return input.salesPrice - totalExpenses(input);
}

/** 手数料以外の経費の合計。逆算の「目標 ＋ 経費」の右項に出る値でもある。 */
export function baseCosts(costs: Omit<CostInput, 'salesPrice'>): number {
  return costs.purchasePrice + costs.postage + costs.envelopeCost + costs.othersCost;
}

/**
 * §2.5 の切り上げ**前**の値。
 *
 * 逆算結果の根拠表示（「961.1... を切り上げて 962円」）が必要なので、式そのものはここに 1 本だけ置き、
 * requiredSalesPrice はこれを Math.ceil するだけにする。式を 2 か所に書くと、
 * 表示された「切り上げ前の値」と実際の結果がずれる余地ができる。
 */
export function exactRequiredSalesPrice(
  targetProfit: number,
  costs: Omit<CostInput, 'salesPrice'>,
): number {
  return (targetProfit + baseCosts(costs)) / (1 - costs.commission / 100);
}

/** §2.5 目標利益から必要販売価格を逆算。Math.ceil（決定 §7-3）。 */
export function requiredSalesPrice(
  targetProfit: number,
  costs: Omit<CostInput, 'salesPrice'>,
): number {
  return Math.ceil(exactRequiredSalesPrice(targetProfit, costs));
}

/** §2.6 表示用の丸め。逆算結果以外はすべてこれ（四捨五入）。 */
export function roundForDisplay(value: number): number {
  return Math.round(value);
}

// ---- 目標利益（SPEC-V9 §4） ----
//
// **端数処理は既存に合わせる**（決定 §7-3）: 「この価格なら届く」を返す関数は **Math.ceil**。
// 切り捨てると 1 円足りずに目標を割る価格を返すことがあり、それは答えとして嘘になる。
// 逆に差額（値下げ可能額・赤字までの余裕）は丸めない ── 中間値なので、
// 丸めるのは表示の瞬間だけ（§2.6）。
//
// **「目標が null」は 0 で代用しない。** 目標に関わる関数は揃って `null` を返す ──
// 呼び出し側が「決めていない」と「目標 0 円」を区別できる必要があるため（schema の targetProfit）。
// 0 を返すと「あと 0 円しか下げられない」と読めてしまい、意味が反転する。

/**
 * 手数料の固定額を含む経費（販売価格を除く）。
 *
 * **率（commission）と固定額（fixedFee）の両方を取る。** 今のアプリは率しか持たない
 * （schema の commission は %）が、固定額を別に取る販売先もあるので式の側では両方を受ける。
 * **固定額が無い構成では 0 を渡す** ── そのとき結果は率だけの式とぴったり同じになる
 * （fixedFee は割り算の外側にそのまま足されるだけなので、0 なら消える）。
 * 省略も 0 と同じ扱いにしてあるので、既存の `CostInput` をそのまま渡せる。
 */
export type TargetCostInput = Omit<CostInput, 'salesPrice'> & {
  /** 販売価格に比例しない固定額の手数料（円）。0 / 省略 = 固定額なし */
  fixedFee?: number;
};

/**
 * 損益分岐点の販売価格（§4.1）。**その価格で売ると純利益がちょうど 0 になる額**で、切り上げ。
 *
 * 式は逆算（§2.5）の目標 0 円の場合そのもので、固定額の手数料は
 * 「率のかからない支出」として目標側に寄せれば同じ形に収まる ──
 * だから `exactRequiredSalesPrice` を借りて式を 2 本にしない。
 *
 * 切り上げるのは requiredSalesPrice と同じ理由（決定 §7-3）: 切り捨てた価格では
 * わずかに赤字のままで、「ここから黒字」の答えにならない。
 */
export function breakEvenSalesPrice(costs: TargetCostInput): number {
  return Math.ceil(exactRequiredSalesPrice(costs.fixedFee ?? 0, costs));
}

/**
 * 目標利益を達成できる最低販売価格（§4.2）。切り上げ。**目標が null なら null。**
 *
 * `requiredSalesPrice`（計算タブの逆算）との違いは、固定額の手数料を受けることと、
 * 目標が「決めていない」場合を型で表せること。式そのものは同じ 1 本を通る。
 */
export function targetSalesPrice(
  targetProfit: number | null,
  costs: TargetCostInput,
): number | null {
  if (targetProfit == null) return null;
  return Math.ceil(exactRequiredSalesPrice(targetProfit + (costs.fixedFee ?? 0), costs));
}

/**
 * 値下げ可能額（§4.3）= 現在価格 − 目標達成最低価格。**負なら 0 / 目標が null なら null。**
 *
 * 負を 0 に丸めるのは、下げ幅としてマイナスが意味を持たないため ──
 * 「−300 円下げられる」ではなく「もう下げられない」が言いたいこと。
 * 目標に既に届いていないことは、この値ではなく `targetSalesPrice` との比較で分かる。
 */
export function discountRoom(
  currentPrice: number,
  targetProfit: number | null,
  costs: TargetCostInput,
): number | null {
  const required = targetSalesPrice(targetProfit, costs);
  if (required == null) return null;
  return Math.max(0, currentPrice - required);
}

/**
 * 赤字までの余裕（§4.4）= 現在価格 − 損益分岐点。**負なら 0。**
 *
 * こちらは目標と無関係なので常に数値を返す（目標を決めていなくても出せる）。
 * 0 は「余裕がない」であって「決めていない」ではない ── だから null を返す道がない。
 */
export function lossMargin(currentPrice: number, costs: TargetCostInput): number {
  return Math.max(0, currentPrice - breakEvenSalesPrice(costs));
}

/** 指定価格で売ったときの結果（§4.5 シミュレーター）。丸めなし（丸めは表示の瞬間だけ） */
export type PriceSimulation = {
  price: number;
  /** その価格での純利益。赤字なら負 */
  netProfit: number;
  /**
   * 利益率（%）= 純利益 ÷ 販売価格 × 100。**販売価格が 0 のときは null。**
   *
   * 0 で割れないから ── 0 を返すと「利益率 0%（＝とんとん）」に読めるが、
   * 価格 0 で経費が出ていれば実際は丸ごと赤字。計算できないことは
   * 計算できないと返す（目標が null のときと同じ考え方）。
   */
  profitRate: number | null;
};

/**
 * 指定価格での純利益と利益率（§4.5）。シミュレーターの 1 点ぶん。
 *
 * 固定額の手数料は `netProfit` の式には無いので、ここで引く
 * （`CostInput` に混ぜないのは、既存の式・SQL・CSV が率だけを前提にしているため）。
 */
export function simulateAtPrice(price: number, costs: TargetCostInput): PriceSimulation {
  const profit =
    netProfit({ ...costs, salesPrice: price }) - (costs.fixedFee ?? 0);
  return {
    price,
    netProfit: profit,
    profitRate: price === 0 ? null : (profit / price) * 100,
  };
}

/**
 * 期間合計の利益率（%）= 純利益合計 ÷ 売上合計 × 100（データタブの期間サマリー段）。
 * **単純平均ではなく合計同士の比率。** 1 件ずつの profitRate を平均すると、
 * 高額 1 件と少額多数が同じ重みで混ざり、合計の実感（「結局いくら残ったか」）とずれる。
 *
 * 売上合計が 0 のときは null（simulateAtPrice の profitRate と同じ理由。0 で割れない）。
 */
export function periodProfitRate(totalSales: number, totalNetProfit: number): number | null {
  return totalSales === 0 ? null : (totalNetProfit / totalSales) * 100;
}

/**
 * 期間合計の 1 件あたり純利益（データタブの期間サマリー段・展開時の 3 列目）
 * = 純利益合計 ÷ 販売件数。**販売件数が 0 のときは null**（0 で割れない。
 * periodProfitRate と同じ理由）。
 */
export function periodProfitPerRecord(
  totalNetProfit: number,
  recordCount: number,
): number | null {
  return recordCount === 0 ? null : totalNetProfit / recordCount;
}

/**
 * 期間合計の平均販売日数（データタブの期間サマリー段・展開時の 4 列目）
 * = 記録日 → 販売日の経過日数（elapsedDays）を売却済みの記録ごとに求めた単純平均。
 *
 * **日付が逆転している記録（販売日 < 記録日）は集計から除外する。** elapsedDays は逆転を
 * 0 に丸めずそのまま負の値で返す（§4.7 の決定）ので、混ぜると平均が実態より短く見える ──
 * 逆転そのものは入力の誤りで、この画面の指標が答えるべき「実際に何日で売れているか」の外側にある。
 * 0 日（当日売却）はそのまま含める（逆転ではなく、正当な最短の結果のため）。
 *
 * 対象記録が 1 件も無い（逆転記録を除いて 0 件）ときは null（periodProfitRate と同じ理由）。
 */
export function periodAverageSaleDays(
  records: readonly { saleStartDate: Date; saleDate: Date | null }[],
  today: Date,
): number | null {
  const validDays = records
    .map((record) => elapsedDays(record, today))
    .filter((days) => days >= 0);
  if (validDays.length === 0) return null;
  return validDays.reduce((sum, days) => sum + days, 0) / validDays.length;
}

/**
 * タグ別純利益ランキング（データタブ新規セクション）の 1 タグぶんの合計。
 * `tagId: null` は「未分類」。db/repository.ts の TagProfitStat と同じ形で、
 * こちら（logic 層）は DB に依存しない構造的な型として持つ。
 */
export type TagProfitTotals = {
  tagId: string | null;
  totalNetProfit: number;
  totalSales: number;
  recordCount: number;
};

export type RankedTagProfit = TagProfitTotals & {
  /** periodProfitRate と同じ考え方（このタグの純利益合計 ÷ 売上合計）。売上合計が 0 なら null */
  profitRate: number | null;
};

const TAG_PROFIT_RANKING_LIMIT = 3;

/**
 * 純利益の上位 N 件（既定 3）を降順で返す。
 * 同額のときは既存のソートロジックが無いため、件数が多い方を上にする（妥当な形として採用）。
 */
export function topTagProfits(
  totals: readonly TagProfitTotals[],
  limit: number = TAG_PROFIT_RANKING_LIMIT,
): RankedTagProfit[] {
  return [...totals]
    .sort((a, b) => b.totalNetProfit - a.totalNetProfit || b.recordCount - a.recordCount)
    .slice(0, limit)
    .map((total) => ({
      ...total,
      profitRate: periodProfitRate(total.totalSales, total.totalNetProfit),
    }));
}

/**
 * 「すべて見る」展開用。topTagProfits と同じ並び（純利益の降順）で、上位 3 件の制限をかけずに返す。
 * 0 件のタグは呼び出し側（analyticsProfitByTag）がそもそも含めないので、ここで除く必要はない。
 */
export function allTagProfits(totals: readonly TagProfitTotals[]): RankedTagProfit[] {
  return topTagProfits(totals, totals.length);
}

/**
 * 記録が 1 件も無いタグ（案 2b のタグ別利益ランキング下部「記録のない◯タグを見る」）。
 *
 * `totals`（analyticsProfitByTag の結果）には記録が 1 件以上あるタグしか出てこないので、
 * DB の全タグ一覧からその集合を引き算するだけで求まる。未分類（tagId: null）はタグの実体を
 * 持たない集計上の概念なので、この一覧の対象にはならない（allTags 側にそもそも現れない）。
 */
export function tagsWithoutRecords<T extends { id: string }>(
  allTags: readonly T[],
  totals: readonly TagProfitTotals[],
): T[] {
  const recordedTagIds = new Set(
    totals.map((total) => total.tagId).filter((tagId): tagId is string => tagId != null),
  );
  return allTags.filter((tag) => !recordedTagIds.has(tag.id));
}

/** シミュレーターが動かす価格の範囲（§4.6）。両端とも含む */
export type PriceRange = { min: number; max: number };

/** 範囲の端を丸める単位（円）。目盛りが 100 円刻みで読めるようにする */
const SIMULATION_PRICE_STEP = 100;

/**
 * 分岐点の外側に必ず見せる幅（円）。
 *
 * 黒字の記録では**下**へ（「あと少しで赤字」の側を切り落とさない）、
 * 赤字の記録では**上**へ（分岐点ちょうどが上端だと、黒字にする操作が端に張り付く）伸ばす。
 * どちらも「分岐点の線が範囲の端に来ないようにする」ための同じ 1 つの幅なので、定数も 1 つ。
 */
const SIMULATION_BREAK_EVEN_MARGIN = 500;

/** 100 円単位で切り下げ（0 未満にはしない） */
function floorToStep(value: number): number {
  return Math.max(0, Math.floor(value / SIMULATION_PRICE_STEP) * SIMULATION_PRICE_STEP);
}

/** 100 円単位で切り上げ */
function ceilToStep(value: number): number {
  return Math.ceil(value / SIMULATION_PRICE_STEP) * SIMULATION_PRICE_STEP;
}

/**
 * シミュレーターの価格の範囲（§4.6）。**現在価格が分岐点のどちら側かで向きが変わる。**
 *
 * - 現在価格 >= 分岐点（黒字）… 最小 = (分岐点 − 500) を 100 円単位で切り下げ・0 未満は 0 /
 *   最大 = 現在価格
 * - 現在価格 < 分岐点（赤字）… 最小 = 現在価格 /
 *   最大 = (分岐点 + 分岐点と現在価格の差) を 100 円単位で切り上げ。ただし最低でも分岐点 + 500 を超える
 *
 * **赤字のときに「最大 = 現在価格」を続けられない**のが向きを分ける理由 ──
 * 範囲の上端が分岐点に届かず、この画面でいちばんしたいこと（黒字になる価格を探す）が
 * 操作としてできなくなる。潰れた範囲をそのまま返していた旧仕様はここで終わりで、
 * **どちらの向きでも min < max が成り立つ**（現在価格 = 分岐点 = 0 の記録を除く）。
 *
 * 赤字側の下端を現在価格にするのは、そこから下は「もっと赤字」しか無いため ──
 * 今より下げる幅に意味が無い場面で、範囲の半分をそこに使わない。
 * 上端を「分岐点 + 今の不足額」にするのは、値上げ幅を今の不足と同じだけ**先まで**見せる形。
 */
export function simulationPriceRange(currentPrice: number, costs: TargetCostInput): PriceRange {
  const breakEven = breakEvenSalesPrice(costs);

  if (currentPrice >= breakEven) {
    return {
      min: floorToStep(breakEven - SIMULATION_BREAK_EVEN_MARGIN),
      max: currentPrice,
    };
  }

  const shortfall = breakEven - currentPrice;
  return {
    min: currentPrice,
    max: ceilToStep(Math.max(breakEven + shortfall, breakEven + SIMULATION_BREAK_EVEN_MARGIN)),
  };
}

/**
 * 経過日数（§4.7）。売却済みは 記録日 → 販売日、出品中は 記録日 → 今日。
 *
 * **数え方は logic/listingDays.ts が持つ**（暦日差・当日は 0 日。UI-SPEC §5-2）。
 * ここはその 1 本をそのまま通す ── 目標の面でも一覧・詳細と同じ日数が出るように、
 * 日付の引き算をこの場で書き直さない。
 *
 * **日付が逆転している記録（販売日 < 記録日）では負の値がそのまま返る。**
 * 0 に丸めない ── 逆転は入力の誤りなので、「0 日で売れた」と見せると
 * 直すきっかけごと消えてしまう。
 */
export function elapsedDays(
  record: { saleStartDate: Date; saleDate: Date | null },
  today: Date,
): number {
  return listingDays(record, today);
}
