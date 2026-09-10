// ベル通知（記録タブ）とローカル通知（OS）が共有する「何を出すか」の判定。純粋関数のみ、
// DB・React・Notifications SDK のいずれにも依存しない。
//
// **ベル（アプリ内）は月次振り返りと出品滞留アラートを同時に出さない。** 月初(1日だけ)は
// 月次振り返りを優先する ── 生きた振り返りカードが1枚なため。OS 通知は別予約なので、
// 同じ朝に振り返りと到達日アラートが両方届いてよい（scheduler.ts）。
import { fromDbDate, toDbDate } from '@/db/dates';
import type { SaleRecord } from '@/db/schema';

import { daysBetween, listingDays } from './listingDays';
import { analyzePricing, type PricingAnalysis } from './pricing';

export type ListingAlertItem = {
  record: SaleRecord;
  /** 出品からの経過日数 */
  elapsedDays: number;
  /** 損益分岐点(目標があれば目標ライン)までの値下げ余地。0 以上 */
  discountRoom: number;
  /**
   * 経過日数の起点(値下げ日 or 出品日）。DB 形式の文字列のまま保持する。
   * `notYetNotifiedListingAlertItems` が「今の基準のまま、まだ OS 通知していないか」を
   * 履歴と突き合わせるのに使う。
   */
  basisDateKey: string;
};

/**
 * 出品滞留アラートの対象（既定 14 日、設定で変更可）。
 *
 * **経過日数の基準は「値下げ（価格変更）してから」**（0013）。まだ一度も値下げしていない
 * 記録（`priceChangedAt === null`）は出品日を基準にする。「出品からの日数」のままだと、
 * しきい値を超え続けている間ずっと対象になり続けて日々通知が積み上がる ── 値下げを基準に
 * すれば、一度知らせたあとは実際に値下げするまで再び対象にならない（合意: 2026-09）。
 *
 * 抑制条件（対象から外す）:
 *   - `state === 'unpriced'`（価格未設定。値下げシミュレータが使えないので知らせても動けない）
 *   - `state === 'loss'`（既に損益分岐点以下。これ以上下げると赤字が広がるだけ）
 *   - `hasTarget && meetsTarget === false`（目標が設定済みで、既に目標ラインを下回っている）
 *
 * **records は呼び出し側で isSold = false に絞ってから渡すこと**（DB 側の SQL 条件で
 * 絞る方が、未売却の記録は全履歴よりずっと少ないぶん軽い。ここでは絞り直さない）。
 *
 * `ignoredRecordIds` はお知らせ画面の長押し「今後知らせない」で外した記録（settings の
 * ignoredListingAlerts）。ここで抑制条件と同列に弾く。
 *
 * 経過日数の降順（一番長く値下げしていないものを先頭に）で返す。
 */
export function isListingAlertEligible(
  analysis: Pick<PricingAnalysis, 'state' | 'hasTarget' | 'meetsTarget'>,
  recordId: string,
  ignoredRecordIds: ReadonlySet<string>,
): boolean {
  if (analysis.state === 'unpriced' || analysis.state === 'loss') return false;
  if (analysis.hasTarget && analysis.meetsTarget === false) return false;
  if (ignoredRecordIds.has(recordId)) return false;
  return true;
}

export function listingAlertItems(
  records: readonly SaleRecord[],
  today: Date,
  thresholdDays: number,
  ignoredRecordIds: ReadonlySet<string>,
): ListingAlertItem[] {
  return records
    .map((record) => {
      const basisDate = fromDbDate(record.priceChangedAt ?? record.saleStartDate);
      const elapsedDays = listingDays({ saleStartDate: basisDate, saleDate: null }, today);
      const analysis = analyzePricing(record);
      return { record, elapsedDays, analysis };
    })
    .filter(
      ({ record, elapsedDays, analysis }) =>
        elapsedDays >= thresholdDays && isListingAlertEligible(analysis, record.id, ignoredRecordIds),
    )
    .sort((a, b) => b.elapsedDays - a.elapsedDays)
    .map(({ record, elapsedDays, analysis }) => ({
      record,
      elapsedDays,
      discountRoom: analysis.room,
      basisDateKey: record.priceChangedAt ?? record.saleStartDate,
    }));
}

const NOTIFICATION_HOUR = 9;

/** iOS の待ち通知上限（約 64）を超えないよう、到達日グループは直近からこの件数まで */
export const MAX_LISTING_ALERT_SCHEDULES = 60;

/**
 * 出品滞留アラートを OS に出す日時（ローカル 9:00）。
 * 起点の暦日にしきい値日数を足した朝 ── その日の経過日数がちょうど thresholdDays になる。
 */
export function listingAlertFireAt(basisDate: Date, thresholdDays: number): Date {
  return new Date(
    basisDate.getFullYear(),
    basisDate.getMonth(),
    basisDate.getDate() + thresholdDays,
    NOTIFICATION_HOUR,
    0,
    0,
    0,
  );
}

/** 同じ到達日にまとめる OS 通知 1 通ぶん */
export type UpcomingListingAlertGroup = {
  fireAt: Date;
  items: readonly ListingAlertItem[];
};

/**
 * まだ来ていない到達日の OS 通知。同じ暦日は 1 グループ（1 通）にまとめる。
 *
 * **すでに到達日を過ぎた記録は含めない**（お知らせの「滞留中」タブは listingAlertItems の
 * `>=` で見せる）。本文に書く経過日数は、届く朝の値（しきい値ちょうど）で凍結する。
 */
export function upcomingListingAlertGroups(
  records: readonly SaleRecord[],
  now: Date,
  thresholdDays: number,
  ignoredRecordIds: ReadonlySet<string>,
): UpcomingListingAlertGroup[] {
  const groups = new Map<string, ListingAlertItem[]>();
  const fireByKey = new Map<string, Date>();

  for (const record of records) {
    const analysis = analyzePricing(record);
    if (!isListingAlertEligible(analysis, record.id, ignoredRecordIds)) continue;

    const basisDate = fromDbDate(record.priceChangedAt ?? record.saleStartDate);
    const fireAt = listingAlertFireAt(basisDate, thresholdDays);
    if (fireAt.getTime() <= now.getTime()) continue;

    const dayKey = [
      fireAt.getFullYear(),
      String(fireAt.getMonth() + 1).padStart(2, '0'),
      String(fireAt.getDate()).padStart(2, '0'),
    ].join('-');
    const existing = groups.get(dayKey) ?? [];
    existing.push({
      record,
      elapsedDays: thresholdDays,
      discountRoom: analysis.room,
      basisDateKey: record.priceChangedAt ?? record.saleStartDate,
    });
    groups.set(dayKey, existing);
    fireByKey.set(dayKey, fireAt);
  }

  return [...groups.keys()]
    .sort()
    .map((dayKey) => ({
      fireAt: fireByKey.get(dayKey) ?? new Date(0),
      items: (groups.get(dayKey) ?? []).sort((a, b) => a.record.id.localeCompare(b.record.id)),
    }));
}

function fireDayKey(fireAt: Date): string {
  return [
    fireAt.getFullYear(),
    String(fireAt.getMonth() + 1).padStart(2, '0'),
    String(fireAt.getDate()).padStart(2, '0'),
  ].join('-');
}

/** その暦日が到達日のグループ（9:00 を過ぎていても含む。開発用プレビュー向き） */
export function listingAlertGroupOnCalendarDay(
  records: readonly SaleRecord[],
  day: Date,
  thresholdDays: number,
  ignoredRecordIds: ReadonlySet<string>,
): UpcomingListingAlertGroup | null {
  const wantKey = fireDayKey(day);
  const items: ListingAlertItem[] = [];
  let fireAt: Date | null = null;

  for (const record of records) {
    const analysis = analyzePricing(record);
    if (!isListingAlertEligible(analysis, record.id, ignoredRecordIds)) continue;

    const basisDate = fromDbDate(record.priceChangedAt ?? record.saleStartDate);
    const at = listingAlertFireAt(basisDate, thresholdDays);
    if (fireDayKey(at) !== wantKey) continue;

    fireAt = at;
    items.push({
      record,
      elapsedDays: thresholdDays,
      discountRoom: analysis.room,
      basisDateKey: record.priceChangedAt ?? record.saleStartDate,
    });
  }

  if (fireAt == null || items.length === 0) return null;
  items.sort((a, b) => a.record.id.localeCompare(b.record.id));
  return { fireAt, items };
}

/**
 * 開発用テスト通知の中身。本番予約と同じ「次の到達日」を優先し、
 * それが無いときだけ「今朝 9:00 に届くはずだった分」（14日前ちょうど等）を出す。
 * 9:00 過ぎの本番 OS には積まないが、テストボタンでは文言を確認できるようにする。
 */
export function listingAlertForOsTest(
  records: readonly SaleRecord[],
  now: Date,
  thresholdDays: number,
  ignoredRecordIds: ReadonlySet<string>,
): { kind: 'listingAlert'; items: readonly ListingAlertItem[] } | null {
  const upcoming = upcomingListingAlertGroups(records, now, thresholdDays, ignoredRecordIds);
  const group = upcoming[0] ?? listingAlertGroupOnCalendarDay(records, now, thresholdDays, ignoredRecordIds);
  if (group == null) return null;
  return { kind: 'listingAlert', items: group.items };
}

/** 近い到達日から MAX_LISTING_ALERT_SCHEDULES 件までに切る */
export function limitUpcomingListingAlertGroups(
  groups: readonly UpcomingListingAlertGroup[],
): UpcomingListingAlertGroup[] {
  return groups.slice(0, MAX_LISTING_ALERT_SCHEDULES);
}

/** 次に月次振り返りを出す 1 日 9:00。もう過ぎていれば翌月の 1 日 */
export function nextMonthlyReviewFireAt(now: Date): Date {
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1, NOTIFICATION_HOUR, 0, 0, 0);
  if (thisMonth.getTime() > now.getTime()) return thisMonth;
  return new Date(now.getFullYear(), now.getMonth() + 1, 1, NOTIFICATION_HOUR, 0, 0, 0);
}

/**
 * OS に次の月初の振り返りを予約するか。消した月・もう書いた日・先月 0 件は積まない。
 */
export function shouldScheduleMonthlyReview(
  monthKey: string,
  dismissedMonth: string | null,
  previousMonthRecordCount: number,
  alreadyLogged: boolean,
): boolean {
  return monthKey !== dismissedMonth && previousMonthRecordCount > 0 && !alreadyLogged;
}

/**
 * 出品滞留アラートのうち、OS ローカル通知としてまだ知らせていないものに絞ったもの。
 *
 * **ベル（アプリ内一覧）は `>=`（listingAlertItems）のまま、OS 通知だけこちらを使う。**
 *
 * 以前は「ちょうど今日 thresholdDays に到達した記録だけ」（elapsedDays === thresholdDays）
 * という単日だけの一致条件だった（合意: 2026-09、実機テストで「289日経過した商品が19件」
 * という通知を見て発覚した連日リピートの再発防止のため）。しかしこれだと、月初は
 * その日の通知枠を月次振り返りが必ず使う（currentNotification）ため、ちょうどその日に
 * しきい値へ到達した記録は翌日には thresholdDays+1 日になってしまい、二度と一致せず
 * 「OS 通知のチャンスを永久に失う」副作用があった（実機で発覚: 2026-09）。
 *
 * 単日一致の代わりに、「今の基準日（値下げ日 or 出品日）になってから、その記録をまだ
 * 一度も履歴に記録していないか」で判定する。基準日が変わらない限り対象であり続ける
 * （＝月初で1日ズレても翌日に持ち越される）が、一度知らせたあとは同じ基準のまま
 * 二度と対象にならない（＝連日リピートも防げる）。値下げして基準日が動けば、また
 * 新しい基準として再び対象になりうる。
 */
export function notYetNotifiedListingAlertItems(
  items: readonly ListingAlertItem[],
  history: readonly {
    kind: 'listingAlert' | 'monthlyReview';
    recordId?: string;
    occurredAt: string;
  }[],
): ListingAlertItem[] {
  return items.filter(
    (item) =>
      !history.some(
        (entry) =>
          entry.kind === 'listingAlert' &&
          entry.recordId === item.record.id &&
          entry.occurredAt >= item.basisDateKey,
      ),
  );
}

/** 月次振り返りを出す期間（月初1日だけ）。ローカルの暦日で判定する */
export function isMonthlyReviewActive(today: Date): boolean {
  return today.getDate() === 1;
}

/** 月次振り返りの対象月（先月）の月キー "YYYY-MM" */
export function previousMonthKey(today: Date): string {
  const prev = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
}

export type NotificationContent =
  | { kind: 'monthlyReview'; monthKey: string }
  | { kind: 'listingAlert'; items: readonly ListingAlertItem[] }
  /**
   * 月次振り返りと出品滞留アラートが同じ朝(9:00)に重なったとき、OS通知を1通にまとめた形
   * （合意: 2026-09）。**scheduler.ts の OS 通知予約だけが作る**（currentNotification は
   * 作らない） ── ベル（アプリ内）はカード1枚しか置けないので、月初は振り返りを優先して
   * 滞留アラート側を隠す、という従来の判定はそのまま。OS 通知には「1枚」の制約が無いので、
   * 1通にまとめて両方の内容を伝えられる。
   */
  | { kind: 'combined'; monthKey: string; items: readonly ListingAlertItem[] };

/**
 * ベル・ローカル通知の両方が使う「今なら何を出すか」。
 * @param unsoldRecords isSold = false に絞った記録（呼び出し側で用意する）
 * @param dismissedMonthlyReviewMonth 「先月の振り返り」を押して消した対象月（"YYYY-MM"）。
 *   まだ消していなければ null。対象月と一致するときだけ振り返りを抑え、滞留アラート側に回す
 *   （settings の dismissedMonthlyReview。押した瞬間にベルから消すため）
 * @param previousMonthRecordCount 先月の売却済み件数。0 件なら振り返る中身が無いので
 *   月次振り返りは出さず、滞留アラート側に回す（ベルと OS 通知で同じ判定にする）。
 */
export function currentNotification(
  unsoldRecords: readonly SaleRecord[],
  today: Date,
  listingAlertThresholdDays: number,
  ignoredRecordIds: ReadonlySet<string>,
  dismissedMonthlyReviewMonth: string | null,
  previousMonthRecordCount: number,
): NotificationContent | null {
  if (isMonthlyReviewActive(today)) {
    const monthKey = previousMonthKey(today);
    if (monthKey !== dismissedMonthlyReviewMonth && previousMonthRecordCount > 0) {
      return { kind: 'monthlyReview', monthKey };
    }
  }

  const items = listingAlertItems(unsoldRecords, today, listingAlertThresholdDays, ignoredRecordIds);
  if (items.length === 0) return null;
  return { kind: 'listingAlert', items };
}

/** 通知履歴（お知らせ画面「すべて」タブ）の1件が指す対象。settings/notificationHistory.ts の
 *  NotificationHistoryEntry から id・occurredAt 等の記録専用フィールドを除いたもの */
export type NotificationHistoryTarget =
  | { kind: 'listingAlert'; recordId: string }
  | { kind: 'monthlyReview'; monthKey: string };

/**
 * ベルの未読ドット。滞留中の出品が残っているだけでは点灯しない（毎日点き直すのを防ぐ）。
 *
 * 点灯するのは次のどれか:
 *   - 月初の生きた振り返りがあり、今日まだベルを開いていない
 *   - 「すべて」タブに、最後にベルを開いた時刻より後の履歴がある（表示から消した行は除く）
 */
export function hasUnreadBell(
  lastCheckedAt: string | null,
  now: Date,
  hasLiveMonthlyReview: boolean,
  history: readonly { occurredAt: string; hidden?: boolean }[],
): boolean {
  const checkedToday =
    lastCheckedAt != null && daysBetween(fromDbDate(lastCheckedAt), now) === 0;

  if (hasLiveMonthlyReview && !checkedToday) return true;

  return history.some(
    (entry) =>
      entry.hidden !== true && (lastCheckedAt == null || entry.occurredAt > lastCheckedAt),
  );
}

/**
 * 履歴に「今日、同じ対象をすでに記録済みか」を判定する（二重記録の防止）。
 *
 * `rescheduleNotification` は AppState の background 遷移のたびに呼ばれるため、
 * 同じ日にアプリを何度も出入りするだけで同じ「ちょうどしきい値」の記録・同じ月が
 * 繰り返し計算されうる。直近の履歴に、種類・対象・暦日がすべて一致するものが
 * 1件でもあれば記録済みとみなす。
 */
export function alreadyLoggedToday(
  history: readonly {
    kind: 'listingAlert' | 'monthlyReview';
    recordId?: string;
    monthKey?: string;
    occurredAt: string;
  }[],
  target: NotificationHistoryTarget,
  today: Date,
): boolean {
  const todayKey = toDbDate(today).slice(0, 10);
  return history.some((entry) => {
    if (entry.occurredAt.slice(0, 10) !== todayKey) return false;
    if (entry.kind !== target.kind) return false;
    return target.kind === 'listingAlert'
      ? entry.recordId === target.recordId
      : entry.monthKey === target.monthKey;
  });
}
