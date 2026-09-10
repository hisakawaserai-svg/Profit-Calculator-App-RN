// ローカル通知の予約・再予約・タップ時のナビゲーション。
//
// **ローカル通知だけで完結する。** プッシュ通知登録（APNs/デバイストークン）は行わない ──
// 「今すぐ・その端末だけに」予約するだけなので、サーバーもトークンも要らない
// （検討の経緯は docs/IMPROVEMENTS.md 参照）。
//
// **出品滞留は到達日の朝 9:00 を商品（同じ暦日は 1 通）ごとに予約する。** iOS は
// バックグラウンドで日数を数え直せないが、到達日は起点＋しきい値で先に分かるので、
// その日時を OS に渡しておけばアプリを開いていなくても届く。月次振り返りは次の 1 日 9:00
// を別予約する（同じ朝に両方出てよい）。
//
// 呼び出しどころ（AppState の background 遷移・起動時）は app/_layout.tsx。
// しきい値変更・値下げのあとも、ここが走れば予約は出し直される。
//
// **お知らせ画面「すべて」タブへの記録は、予約した瞬間ではなく「予約時刻を過ぎた」ことを
// 確認できてから行う。** 詳しくは pendingNotificationLog.ts。
import { randomUUID } from 'expo-crypto';
import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';

import { repository } from '@/db/client';
import { fromDbDate, toDbDate, toMonthKey } from '@/db/dates';
import type { SaleRecord } from '@/db/schema';
import { formatMonthKeyTitle } from '@/logic/format';
import {
  listingAlertOsBody,
  listingAlertOsTitle,
  monthlyReviewOsBody,
  monthlyReviewOsTitle,
} from '@/logic/labels';
import {
  alreadyLoggedToday,
  currentNotification,
  isMonthlyReviewActive,
  nextMonthlyReviewFireAt,
  previousMonthKey,
  upcomingListingAlertGroups,
  type NotificationContent,
  type NotificationHistoryTarget,
} from '@/logic/notifications';
import {
  appendNotificationHistory,
  getDismissedMonthlyReview,
  getIgnoredListingAlerts,
  getListingAlertThresholdDays,
  getLocale,
  getNotificationHistory,
  getNotificationsEnabled,
  getPendingNotificationLog,
  setPendingNotificationLog,
  type PendingNotificationLogEntry,
} from '@/settings';

/**
 * 通知の中身の種類（OS 通知の content.data、タップ時の判定に使う）。
 *
 * **遷移先まで積む。** タップした瞬間にアプリ内で computeCurrentNotification を
 * もう一度呼んで代表 1 件を出す方式だと、通知が届いてからタップするまでの間に
 * データが変わっている可能性があり（例: 間に別の出品を編集していた）、通知に
 * 書いてあった内容と違う記録に飛びかねない。ペイロードに焼いた recordId/monthKey を
 * そのまま使えば、タップ時は常に「通知が言っていた対象」へ飛べる。
 */
export type NotificationPayload =
  | { kind: 'listingAlert'; recordId: string }
  /**
   * 出品滞留アラートが2件以上まとまった通知。**代表1件の recordId は持たない**
   * ── 本文（listingAlertOsBody の osBodyMany）が「〇件あります」としか言わず
   * どの商品なのか名指ししていないのに、タップしたら勝手にそのうちの1件（内部的な
   * 代表）の損益分岐点へ飛ぶと、利用者からは「なぜこれが開いた」と映る（実機の指摘）。
   * 複数件のときはお知らせ画面（一覧）へ誘導し、そこで選んでもらう。
   */
  | { kind: 'listingAlertMany' }
  | { kind: 'monthlyReview'; monthKey: string };

const NOTIFICATION_HOUR = 9;
const NOTIFICATION_MINUTE = 0;

/** iOS の待ち通知上限（約 64）を超えないよう、到達日グループは直近からこの件数まで */
const MAX_LISTING_ALERT_SCHEDULES = 60;

const LEGACY_DAILY_IDENTIFIER = 'daily-notification';
const MONTHLY_REVIEW_IDENTIFIER = 'monthly-review';
const LISTING_ALERT_ID_PREFIX = 'listing-alert:';

function listingAlertIdentifier(dayKey: string): string {
  return `${LISTING_ALERT_ID_PREFIX}${dayKey}`;
}

function dayKeyFromDate(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

/** 直近の 9:00（ローカル時刻）。もう過ぎていれば明日の 9:00 */
export function nextNineAm(now: Date): Date {
  const candidate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), NOTIFICATION_HOUR, NOTIFICATION_MINUTE, 0, 0);
  if (candidate.getTime() <= now.getTime()) {
    candidate.setDate(candidate.getDate() + 1);
  }
  return candidate;
}

/** isSold = false に絞って DB から読む（全履歴ではなく未売却の記録だけなので軽い） */
function fetchUnsoldRecords(): SaleRecord[] {
  return repository.filteredRecords({ isSoldMode: false }, 'saleDateDesc');
}

/** 今なら何を通知すべきか（bell が使う。出品滞留アラートは `>=` で全件） */
export function computeCurrentNotification(now: Date = new Date()): NotificationContent | null {
  const unsold = fetchUnsoldRecords();
  const previousMonthRecordCount = isMonthlyReviewActive(now)
    ? repository.careerSummary({ isSoldMode: true, period: previousMonthKey(now) }).recordCount
    : 0;
  return currentNotification(
    unsold,
    now,
    getListingAlertThresholdDays(),
    new Set(getIgnoredListingAlerts()),
    getDismissedMonthlyReview(),
    previousMonthRecordCount,
  );
}

/** OS 通知の title/body を組み立てる。月次振り返りは対象月の収支合計を別途読む */
function buildOsContent(content: NotificationContent): { title: string; body: string; data: NotificationPayload } {
  const locale = getLocale();

  if (content.kind === 'monthlyReview') {
    const summary = repository.careerSummary({ isSoldMode: true, period: content.monthKey });
    const month = formatMonthKeyTitle(locale, content.monthKey);
    return {
      title: monthlyReviewOsTitle(locale),
      body: monthlyReviewOsBody(locale, month, summary.totalNetProfit),
      data: { kind: 'monthlyReview', monthKey: content.monthKey },
    };
  }

  const [first, ...rest] = content.items;
  const count = rest.length + 1;
  return {
    title: listingAlertOsTitle(locale),
    body: listingAlertOsBody(locale, first.record.itemName, first.elapsedDays, count),
    data: count === 1 ? { kind: 'listingAlert', recordId: first.record.id } : { kind: 'listingAlertMany' },
  };
}

function toPendingEntry(content: NotificationContent, scheduledFor: Date, identifier: string): PendingNotificationLogEntry {
  const scheduledForKey = toDbDate(scheduledFor);
  if (content.kind === 'monthlyReview') {
    const summary = repository.careerSummary({ isSoldMode: true, period: content.monthKey });
    return {
      kind: 'monthlyReview',
      identifier,
      monthKey: content.monthKey,
      totalNetProfit: summary.totalNetProfit,
      scheduledFor: scheduledForKey,
    };
  }
  return {
    kind: 'listingAlert',
    identifier,
    items: content.items.map((item) => ({
      recordId: item.record.id,
      itemName: item.record.itemName,
      days: item.elapsedDays,
    })),
    scheduledFor: scheduledForKey,
  };
}

function upcomingSchedules(now: Date): { identifier: string; fireAt: Date; content: NotificationContent }[] {
  const unsold = fetchUnsoldRecords();
  const thresholdDays = getListingAlertThresholdDays();
  const ignored = new Set(getIgnoredListingAlerts());
  const history = getNotificationHistory();
  const schedules: { identifier: string; fireAt: Date; content: NotificationContent }[] = [];

  const listingGroups = upcomingListingAlertGroups(unsold, now, thresholdDays, ignored).slice(
    0,
    MAX_LISTING_ALERT_SCHEDULES,
  );
  for (const group of listingGroups) {
    schedules.push({
      identifier: listingAlertIdentifier(dayKeyFromDate(group.fireAt)),
      fireAt: group.fireAt,
      content: { kind: 'listingAlert', items: group.items },
    });
  }

  const monthlyFireAt = nextMonthlyReviewFireAt(now);
  const monthKey = previousMonthKey(monthlyFireAt);
  const dismissed = getDismissedMonthlyReview();
  const already = alreadyLoggedToday(history, { kind: 'monthlyReview', monthKey }, monthlyFireAt);
  if (monthKey !== dismissed && !already) {
    const summary = repository.careerSummary({ isSoldMode: true, period: monthKey });
    if (summary.recordCount > 0) {
      schedules.push({
        identifier: MONTHLY_REVIEW_IDENTIFIER,
        fireAt: monthlyFireAt,
        content: { kind: 'monthlyReview', monthKey },
      });
    }
  }

  return schedules;
}

/**
 * このアプリが管理する予約だけ消す（cancelAll は使わない）。
 *
 * **`cancelAll` だと開発用のテスト通知まで巻き込んで消してしまう。** テスト通知
 * （sendTestNotification）は数秒後に届く単発の予約だが、AppState の background は
 * ボタンを押した直後にも飛ぶので、そこで全消しすると発火前のテスト通知がその場で消える。
 */
async function cancelOwnedScheduledNotifications(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(LEGACY_DAILY_IDENTIFIER).catch(() => {});
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter(
        (request) =>
          request.identifier === MONTHLY_REVIEW_IDENTIFIER ||
          request.identifier.startsWith(LISTING_ALERT_ID_PREFIX),
      )
      .map((request) => Notifications.cancelScheduledNotificationAsync(request.identifier).catch(() => {})),
  );
}

/** 到達日・次の月初を計算し、OS へ予約し直す */
export async function rescheduleNotification(now: Date = new Date()): Promise<void> {
  promotePendingNotificationIfDue(now);

  if (!getNotificationsEnabled()) {
    await cancelOwnedScheduledNotifications();
    setPendingNotificationLog(null);
    return;
  }

  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') {
    await cancelOwnedScheduledNotifications();
    setPendingNotificationLog(null);
    return;
  }

  const schedules = upcomingSchedules(now);
  await cancelOwnedScheduledNotifications();

  if (schedules.length === 0) {
    setPendingNotificationLog(null);
    return;
  }

  const pending: PendingNotificationLogEntry[] = [];
  for (const schedule of schedules) {
    const { title, body, data } = buildOsContent(schedule.content);
    await Notifications.scheduleNotificationAsync({
      identifier: schedule.identifier,
      content: { title, body, data },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: schedule.fireAt },
    });
    pending.push(toPendingEntry(schedule.content, schedule.fireAt, schedule.identifier));
  }

  setPendingNotificationLog(pending);
}

/**
 * 保留中の通知のうち、発火予定時刻をもう過ぎていれば履歴へ記録する。
 * まだ先の予約はそのまま残す。
 */
export function promotePendingNotificationIfDue(now: Date = new Date()): void {
  const pending = getPendingNotificationLog();
  if (pending == null || pending.length === 0) return;

  const due: PendingNotificationLogEntry[] = [];
  const rest: PendingNotificationLogEntry[] = [];
  for (const entry of pending) {
    if (fromDbDate(entry.scheduledFor).getTime() > now.getTime()) rest.push(entry);
    else due.push(entry);
  }

  for (const entry of due) {
    appendDueHistory(entry);
  }

  setPendingNotificationLog(rest.length === 0 ? null : rest);
}

function appendDueHistory(pending: PendingNotificationLogEntry): void {
  const occurredAt = pending.scheduledFor;
  const historyNow = fromDbDate(occurredAt);

  if (pending.kind === 'monthlyReview') {
    const target: NotificationHistoryTarget = { kind: 'monthlyReview', monthKey: pending.monthKey };
    if (!alreadyLoggedToday(getNotificationHistory(), target, historyNow)) {
      appendNotificationHistory({
        id: randomUUID(),
        kind: 'monthlyReview',
        monthKey: pending.monthKey,
        totalNetProfit: pending.totalNetProfit,
        occurredAt,
      });
    }
    return;
  }

  const history = getNotificationHistory();
  for (const item of pending.items) {
    const target: NotificationHistoryTarget = { kind: 'listingAlert', recordId: item.recordId };
    if (alreadyLoggedToday(history, target, historyNow)) continue;

    appendNotificationHistory({
      id: randomUUID(),
      kind: 'listingAlert',
      recordId: item.recordId,
      itemName: item.itemName,
      days: item.days,
      occurredAt,
    });
  }
}

/** 設定タブの「通知を受け取る」をオンにしたときに呼ぶ。許可されたら true */
export async function requestNotificationPermission(): Promise<boolean> {
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

const TEST_NOTIFICATION_DELAY_SECONDS = 8;

/**
 * content を数秒後の OS 通知として送る。**履歴・本予約には触れない** ── 到達日の本番予約を
 * 「もう知らせた」扱いにすると、本当の朝 9 時が消えてしまう。
 */
async function sendTestOsNotification(content: NotificationContent | null): Promise<void> {
  const { title, body, data } = content
    ? buildOsContent(content)
    : {
        title: 'テスト通知',
        body: 'これから到達日の朝9時に予約する出品はありません（すでに過ぎた滞留はお知らせの「滞留中」に出ます）',
        data: undefined as NotificationPayload | undefined,
      };

  await Notifications.scheduleNotificationAsync({
    content: { title, body, data },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: TEST_NOTIFICATION_DELAY_SECONDS,
    },
  });
}

/** 次に予約される出品滞留アラート（最も近い到達日）で試す */
export async function sendTestNotification(): Promise<void> {
  const next = upcomingSchedules(new Date()).find((schedule) => schedule.content.kind === 'listingAlert');
  await sendTestOsNotification(next?.content ?? null);
}

/**
 * 月次振り返りのテスト通知を送る。**月初(1日)でなくても、先月ぶんの内容で試せる。**
 */
export async function sendTestMonthlyReviewNotification(): Promise<void> {
  const monthKey = previousMonthKey(new Date());
  await sendTestOsNotification({ kind: 'monthlyReview', monthKey });
}

/**
 * 直近に処理したタップの識別子（`request.identifier:notification.date`）。
 *
 * **通知をタップしてコールドスタートすると、`getLastNotificationResponseAsync` と
 * `addNotificationResponseReceivedListener` の両方が同じタップに反応することがある**
 * （expo-notifications の既知の挙動）。ガード無しだと `navigateFromNotification` が
 * 2 回走り、`/notifications` が二重に push されて閉じられなくなる（実機で発覚: 2026-09。
 * ✕ で閉じても後ろにもう1枚同じ画面が残り、タブバーも見えなくなる不具合だった）。
 *
 * **`request.identifier` 単体では駄目。** 同じ種別の予約は identifier が固定／日付付きで
 * 日をまたいでも衝突しうる。`notification.date`（実際に届いた時刻）を組み合わせて
 * 初めて「同じ1回のタップ」を一意に指せる。
 */
let lastHandledNotificationKey: string | null = null;

function handleNotificationResponseOnce(response: Notifications.NotificationResponse): void {
  const key = `${response.notification.request.identifier}:${response.notification.date}`;
  if (key === lastHandledNotificationKey) return;
  lastHandledNotificationKey = key;
  navigateFromNotification(response.notification.request.content.data);
}

/**
 * 通知の表示挙動（フォアグラウンド中も出す）とタップ時の遷移をまとめて登録する。
 * **アプリ全体で 1 か所だけで呼ぶ**（RootLayout。useDeviceLanguageSync と同じ立て付け）。
 */
export function setupNotificationHandling(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });

  Notifications.getLastNotificationResponseAsync().then((response) => {
    if (response != null) handleNotificationResponseOnce(response);
  });

  Notifications.addNotificationResponseReceivedListener((response) => {
    handleNotificationResponseOnce(response);
  });
}

const RECORD_DETAIL_PATHNAME = '/records/record/[id]' as const;
const RECORD_PRICING_PATHNAME = '/records/record/[id]/pricing' as const;

function recordsListHref(recordId: string): { pathname: '/records'; params?: { month: string; listing: string } } {
  const record = repository.getById(recordId);
  if (record == null) return { pathname: '/records' };
  return {
    pathname: '/records',
    params: { month: toMonthKey(fromDbDate(record.saleStartDate)), listing: '1' },
  };
}

function openListingPricing(recordId: string): void {
  router.dismissTo(recordsListHref(recordId));
  requestAnimationFrame(() => {
    router.push({ pathname: RECORD_DETAIL_PATHNAME, params: { id: recordId } });
    requestAnimationFrame(() => {
      router.push({ pathname: RECORD_PRICING_PATHNAME, params: { id: recordId } });
    });
  });
}

/**
 * お知らせ画面の行タップからも使う。記録一覧は出品日の月・出品中に合わせてから積む。
 */
export function openListingPricingFromApp(recordId: string): void {
  openListingPricing(recordId);
}

/**
 * タップ時の遷移先。**種類ごとに直接目的地へ飛ばす**（ベルの一覧をワンクッション挟まない）。
 *
 * data が想定外の形（旧バージョンの通知が端末に残っていた等）のときはベル一覧に逃がす。
 */
function navigateFromNotification(data: unknown): void {
  const payload = data as Partial<NotificationPayload> | undefined;

  if (payload?.kind === 'listingAlert' && typeof payload.recordId === 'string') {
    openListingPricing(payload.recordId);
    return;
  }
  if (payload?.kind === 'listingAlertMany') {
    router.push('/notifications');
    return;
  }
  if (payload?.kind === 'monthlyReview' && typeof payload.monthKey === 'string') {
    router.push({ pathname: '/data', params: { month: payload.monthKey } });
    return;
  }

  router.push('/notifications');
}
