// SPEC.md §2 計算ロジック（純粋関数）
// 保存値・中間値は number のまま保持し、丸めは表示の瞬間のみ（SPEC §2.6）。

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

/** §2.5 目標利益から必要販売価格を逆算。Math.ceil（決定 §7-3）。 */
export function requiredSalesPrice(
  targetProfit: number,
  costs: Omit<CostInput, 'salesPrice'>,
): number {
  const baseCosts =
    costs.purchasePrice + costs.postage + costs.envelopeCost + costs.othersCost;
  return Math.ceil((targetProfit + baseCosts) / (1 - costs.commission / 100));
}

/** §2.6 表示用の丸め。逆算結果以外はすべてこれ（四捨五入）。 */
export function roundForDisplay(value: number): number {
  return Math.round(value);
}
