// 出品滞留アラートの閾値日数のうち、保存先に依存しない部分。
// reviewRequest.ts の normalizeCounter と同じ考え方だが、既定値が 0 ではなく 14 になる ──
// 「まだ一度も無い」ではなく「まだ設定を変えていない」ときに倒す先が違うため。

/** kv-store のキー */
export const LISTING_ALERT_THRESHOLD_DAYS_KEY = 'listingAlertThresholdDays';

/** 既定の閾値(日)。長期戦突破の実績(30日)より短く、「そろそろ」を早めに知らせる側に倒す */
export const DEFAULT_LISTING_ALERT_THRESHOLD_DAYS = 14;

/** 選べる範囲。上限は長期戦突破の実績と同じ 30 日(それ以上遅らせる意味が薄い) */
export const MIN_LISTING_ALERT_THRESHOLD_DAYS = 7;
export const MAX_LISTING_ALERT_THRESHOLD_DAYS = 30;

/**
 * 保存されている値を読める形にする。未設定・想定外の値・範囲外の値はすべて既定値(14)に倒す。
 */
export function normalizeListingAlertThresholdDays(value: string | null | undefined): number {
  if (typeof value !== 'string') return DEFAULT_LISTING_ALERT_THRESHOLD_DAYS;

  const parsed = Number(value);
  if (
    !Number.isSafeInteger(parsed) ||
    parsed < MIN_LISTING_ALERT_THRESHOLD_DAYS ||
    parsed > MAX_LISTING_ALERT_THRESHOLD_DAYS
  ) {
    return DEFAULT_LISTING_ALERT_THRESHOLD_DAYS;
  }

  return parsed;
}
