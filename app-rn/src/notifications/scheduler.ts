// ローカル通知の予約・再予約・タップ時のナビゲーション。
//
// **ローカル通知だけで完結する。** プッシュ通知登録（APNs/デバイストークン）は行わない ──
// 「今すぐ・その端末だけに」予約するだけなので、サーバーもトークンも要らない
// （検討の経緯は docs/IMPROVEMENTS.md 参照）。
//
// **出品滞留は到達日の朝 9:00 を商品（同じ暦日は 1 通）ごとに予約する。** iOS は
// バックグラウンドで日数を数え直せないが、到達日は起点＋しきい値で先に分かるので、
// その日時を OS に渡しておけばアプリを開いていなくても届く。月次振り返りは次の 1 日 9:00
// を別予約する。**その振り返りの日と、出品滞留アラートの到達日が同じ朝に重なるときは、
// 1通の OS 通知にまとめる**（合意: 2026-09。同じ朝に2通バラバラ届くのは煩わしいという
// 実機の指摘）。まとめても「すべて」タブの履歴には従来どおり別々の行として残す
// （upcomingSchedules・toPendingEntries 参照）。
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
  combinedNotificationOsBody,
  listingAlertOsBody,
  listingAlertOsTitle,
  monthlyReviewOsBody,
  monthlyReviewOsTitle,
} from '@/logic/labels';
import {
  alreadyLoggedToday,
  currentNotification,
  isMonthlyReviewActive,
  limitUpcomingListingAlertGroups,
  listingAlertForOsTest,
  nextMonthlyReviewFireAt,
  previousMonthKey,
  shouldScheduleMonthlyReview,
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
  markNotificationsChecked,
  partitionPendingNotificationLog,
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
  | { kind: 'monthlyReview'; monthKey: string }
  /** 月次振り返りと出品滞留アラートを1通にまとめた通知（NotificationContent の combined 参照） */
  | { kind: 'combined'; monthKey: string };

const NOTIFICATION_HOUR = 9;
const NOTIFICATION_MINUTE = 0;

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

  if (content.kind === 'combined') {
    // タイトルは月次振り返り側を使う（月初1日だけの限定情報で、出品滞留アラートより
    // 鮮度が高い。currentNotification の優先判定と同じ考え方）
    const summary = repository.careerSummary({ isSoldMode: true, period: content.monthKey });
    const month = formatMonthKeyTitle(locale, content.monthKey);
    return {
      title: monthlyReviewOsTitle(locale),
      body: combinedNotificationOsBody(locale, month, summary.totalNetProfit, content.items.length),
      data: { kind: 'combined', monthKey: content.monthKey },
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

function toMonthlyReviewPendingEntry(
  monthKey: string,
  scheduledForKey: string,
  identifier: string,
): PendingNotificationLogEntry {
  const summary = repository.careerSummary({ isSoldMode: true, period: monthKey });
  return {
    kind: 'monthlyReview',
    identifier,
    monthKey,
    totalNetProfit: summary.totalNetProfit,
    scheduledFor: scheduledForKey,
  };
}

function toListingAlertPendingEntry(
  items: readonly { record: SaleRecord; elapsedDays: number }[],
  scheduledForKey: string,
  identifier: string,
): PendingNotificationLogEntry {
  return {
    kind: 'listingAlert',
    identifier,
    items: items.map((item) => ({
      recordId: item.record.id,
      itemName: item.record.itemName,
      days: item.elapsedDays,
    })),
    scheduledFor: scheduledForKey,
  };
}

/**
 * 1つの予約（1回の scheduleNotificationAsync）を、履歴へ記録するための保留データへ変換する。
 *
 * **combined は2件返す。** OS 通知としては1通でも、「すべて」タブの履歴では従来どおり
 * 月次振り返り・出品滞留アラートを別々の行として残す（HistoryRow が種類ごとに見た目を
 * 変えているため、無理に1行へまとめない）。
 */
function toPendingEntries(
  content: NotificationContent,
  scheduledFor: Date,
  identifier: string,
): PendingNotificationLogEntry[] {
  const scheduledForKey = toDbDate(scheduledFor);
  if (content.kind === 'monthlyReview') {
    return [toMonthlyReviewPendingEntry(content.monthKey, scheduledForKey, identifier)];
  }
  if (content.kind === 'combined') {
    return [
      toMonthlyReviewPendingEntry(content.monthKey, scheduledForKey, `${identifier}:review`),
      toListingAlertPendingEntry(content.items, scheduledForKey, `${identifier}:listing`),
    ];
  }
  return [toListingAlertPendingEntry(content.items, scheduledForKey, identifier)];
}

function upcomingSchedules(now: Date): { identifier: string; fireAt: Date; content: NotificationContent }[] {
  const unsold = fetchUnsoldRecords();
  const thresholdDays = getListingAlertThresholdDays();
  const ignored = new Set(getIgnoredListingAlerts());
  const history = getNotificationHistory();
  const schedules: { identifier: string; fireAt: Date; content: NotificationContent }[] = [];

  const listingGroups = limitUpcomingListingAlertGroups(
    upcomingListingAlertGroups(unsold, now, thresholdDays, ignored),
  );

  const monthlyFireAt = nextMonthlyReviewFireAt(now);
  const monthlyDayKey = dayKeyFromDate(monthlyFireAt);
  const monthKey = previousMonthKey(monthlyFireAt);
  const already = alreadyLoggedToday(history, { kind: 'monthlyReview', monthKey }, monthlyFireAt);
  const previousMonthRecordCount = repository.careerSummary({ isSoldMode: true, period: monthKey }).recordCount;
  const scheduleMonthly = shouldScheduleMonthlyReview(
    monthKey,
    getDismissedMonthlyReview(),
    previousMonthRecordCount,
    already,
  );

  // 振り返りの到達日と重なる出品滞留グループが見つかれば、そこで1回だけ統合する
  // （同じ日に到達日グループは1つしか無い＝同じ暦日は1通にまとめる設計のため、
  // 重なりうるのは高々1グループ）
  let monthlyMerged = false;

  for (const group of listingGroups) {
    const dayKey = dayKeyFromDate(group.fireAt);
    const identifier = listingAlertIdentifier(dayKey);
    if (scheduleMonthly && !monthlyMerged && dayKey === monthlyDayKey) {
      schedules.push({
        identifier,
        fireAt: group.fireAt,
        content: { kind: 'combined', monthKey, items: group.items },
      });
      monthlyMerged = true;
      continue;
    }
    schedules.push({ identifier, fireAt: group.fireAt, content: { kind: 'listingAlert', items: group.items } });
  }

  if (scheduleMonthly && !monthlyMerged) {
    schedules.push({
      identifier: MONTHLY_REVIEW_IDENTIFIER,
      fireAt: monthlyFireAt,
      content: { kind: 'monthlyReview', monthKey },
    });
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

  // **直列ではなく並列で予約する。** 到達日グループは最大 MAX_LISTING_ALERT_SCHEDULES
  // （60）+ 月次振り返り1件で、最大61回のネイティブ呼び出しになりうる。1件ずつ await
  // すると（実機の指摘どおり）バックグラウンドに送るたびに直列待ちが積み重なって重くなる。
  // 各予約は identifier も対象も独立しているので、まとめて Promise.all してよい
  const results = await Promise.all(
    schedules.map(async (schedule) => {
      const { title, body, data } = buildOsContent(schedule.content);
      await Notifications.scheduleNotificationAsync({
        identifier: schedule.identifier,
        content: { title, body, data },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: schedule.fireAt },
      });
      return toPendingEntries(schedule.content, schedule.fireAt, schedule.identifier);
    }),
  );

  setPendingNotificationLog(results.flat());
}

/**
 * 保留中の通知のうち、発火予定時刻をもう過ぎていれば履歴へ記録する。
 * まだ先の予約はそのまま残す。
 */
export function promotePendingNotificationIfDue(now: Date = new Date()): void {
  const pending = getPendingNotificationLog();
  if (pending == null || pending.length === 0) return;

  const { due, rest } = partitionPendingNotificationLog(pending, now);

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
        unread: true,
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
      unread: true,
    });
  }
}

/** 設定タブの「通知を受け取る」をオンにしたときに呼ぶ。許可されたら true */
export async function requestNotificationPermission(): Promise<boolean> {
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

const TEST_NOTIFICATION_DELAY_SECONDS = 8;
/** 開発用テスト通知。同じ id で差し替えるので、連打しても OS 上に何通も残らない */
const TEST_NOTIFICATION_IDENTIFIER = 'dev-test-notification';

/**
 * content を数秒後の OS 通知として送る。
 *
 * 本番の予約（pending）は触らない。ただし「すべて」タブへは残す ── 届いた通知を
 * お知らせで確認できないと、テストしても仕様が信じられない。pending に載せると
 * reschedule が本番予約で上書きして消えるので、履歴へ直接書く。
 */
async function sendTestOsNotification(content: NotificationContent | null): Promise<void> {
  const { title, body, data } = content
    ? buildOsContent(content)
    : {
        title: 'テスト通知',
        body: 'これから到達日の朝9時に予約する出品はありません（すでに過ぎた滞留はお知らせの「滞留中」に出ます）',
        data: { kind: 'listingAlertMany' } satisfies NotificationPayload,
      };

  await Notifications.cancelScheduledNotificationAsync(TEST_NOTIFICATION_IDENTIFIER).catch(() => {});
  await Notifications.scheduleNotificationAsync({
    identifier: TEST_NOTIFICATION_IDENTIFIER,
    content: { title, body, data },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: TEST_NOTIFICATION_DELAY_SECONDS,
    },
  });

  if (content != null) {
    for (const entry of toPendingEntries(content, new Date(), TEST_NOTIFICATION_IDENTIFIER)) {
      appendDueHistory(entry);
    }
  }
}

/**
 * 次に予約される出品滞留アラートで試す。9:00 過ぎて本番予約が無いときは、
 * 今朝届くはずだった到達日（しきい値ちょうど前）の文言を出す。
 */
export async function sendTestNotification(): Promise<void> {
  const now = new Date();
  const preview = listingAlertForOsTest(
    fetchUnsoldRecords(),
    now,
    getListingAlertThresholdDays(),
    new Set(getIgnoredListingAlerts()),
  );
  await sendTestOsNotification(preview);
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
/** Stack が載るまで（DB 準備完了まで）タップ遷移を保留する */
let notificationNavigationReady = false;
let pendingNotificationData: unknown | undefined;
let notificationHandlingStarted = false;

function handleNotificationResponseOnce(response: Notifications.NotificationResponse): void {
  const key = `${response.notification.request.identifier}:${response.notification.date}`;
  if (key === lastHandledNotificationKey) return;
  lastHandledNotificationKey = key;
  // お知らせ「すべて」へ載せるのを遷移より先にする。タップで開いた画面が空だと、
  // 届いていないように見える
  promotePendingNotificationIfDue();
  if (!notificationNavigationReady) {
    pendingNotificationData = response.notification.request.content.data;
    return;
  }
  navigateFromNotification(response.notification.request.content.data);
}

/**
 * RootLayout が Stack を出したあとに呼ぶ。コールドスタートのタップは、ここまで
 * 待たないと `router.push` が消えて「何も開かない」になる。
 */
export function setNotificationNavigationReady(ready: boolean): void {
  notificationNavigationReady = ready;
  if (!ready) return;
  const data = pendingNotificationData;
  pendingNotificationData = undefined;
  if (data !== undefined) {
    promotePendingNotificationIfDue();
    navigateFromNotification(data);
  }
}

/**
 * 通知の表示挙動（フォアグラウンド中も出す）とタップ時の遷移をまとめて登録する。
 * **アプリ全体で 1 か所だけで呼ぶ**（RootLayout。useDeviceLanguageSync と同じ立て付け）。
 *
 * Fast Refresh で RootLayout が何度マウントされても listener は 1 本だけにする。
 * 増えるとお知らせモーダルが何枚も push される。
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

  if (notificationHandlingStarted) return;
  notificationHandlingStarted = true;

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

function openNotifications(): void {
  // push だと同じモーダルが何枚も積まれる。navigate なら既に開いていれば重ねない
  router.navigate('/notifications');
}

/**
 * OS 通知のタップ先はお知らせ。1件でも損益分岐点へ直行しない ──
 * 「すべて」の未読印を見てから行を開く。ベルの点はお知らせを開いた時点で消す。
 */
function navigateFromNotification(_data: unknown): void {
  markNotificationsChecked(toDbDate(new Date()));
  openNotifications();
}
