// ローカル通知の予約・再予約・タップ時のナビゲーション。
//
// **ローカル通知だけで完結する。** プッシュ通知登録（APNs/デバイストークン）は行わない ──
// 「今すぐ・その端末だけに」予約するだけなので、サーバーもトークンも要らない
// （検討の経緯は docs/IMPROVEMENTS.md 参照）。
//
// **内容は都度計算し、次の 9:00 へ 1 件だけ予約し直す。** iOS はサードパーティアプリを
// バックグラウンドで自由に動かし続けられないため、「ある記録がちょうど今日 14 日を超えた」
// ことをリアルタイムに検知して通知することはできない。現実的にできるのは
// 「アプリを開閉するたびに、その時点のデータで再計算し、直近の 9:00 に予約し直す」ことだけ ──
// 通知の中身は「最後にアプリを触った時点」のスナップショットになる。
//
// 呼び出しどころ（AppState の background 遷移・起動時）は app/_layout.tsx。
import { randomUUID } from 'expo-crypto';
import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';

import { repository } from '@/db/client';
import { toDbDate } from '@/db/dates';
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
  newlyEligibleListingAlertItems,
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
  | { kind: 'monthlyReview'; monthKey: string };

const NOTIFICATION_HOUR = 9;
const NOTIFICATION_MINUTE = 0;

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
  return currentNotification(
    unsold,
    now,
    getListingAlertThresholdDays(),
    new Set(getIgnoredListingAlerts()),
    getDismissedMonthlyReview(),
  );
}

/**
 * 今なら OS 通知として何を出すべきか（rescheduleNotification・sendTestNotification が使う）。
 *
 * bell 用の `computeCurrentNotification` とは出品滞留アラートの絞り込みが違う ──
 * こちらは今日ちょうどしきい値へ到達した記録だけ（`newlyEligibleListingAlertItems` 参照）。
 * 該当が無くなれば（前からしきい値超えのままの記録しか無ければ）OS 通知は出さない。
 */
function computeCurrentOsNotification(now: Date = new Date()): NotificationContent | null {
  const content = computeCurrentNotification(now);
  if (content == null || content.kind !== 'listingAlert') return content;

  const items = newlyEligibleListingAlertItems(content.items, getListingAlertThresholdDays());
  if (items.length === 0) return null;
  return { kind: 'listingAlert', items };
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
  return {
    title: listingAlertOsTitle(locale),
    body: listingAlertOsBody(locale, first.record.itemName, first.elapsedDays, rest.length + 1),
    data: { kind: 'listingAlert', recordId: first.record.id },
  };
}

/**
 * 毎回同じ identifier で予約する（cancelAllScheduledNotificationsAsync は使わない）。
 *
 * **`cancelAll` だと開発用のテスト通知まで巻き込んで消してしまう。** テスト通知
 * （sendTestNotification）は数秒後に届く単発の予約だが、AppState の background は
 * ボタンを押した直後（ホーム画面に切り替えた瞬間）にも飛ぶので、そこで全消しすると
 * 発火前のテスト通知がその場で消える ── 「アプリの外では出ない」という不具合に見えていたが、
 * 実体はこの自滅だった。identifier を固定して `scheduleNotificationAsync` に渡せば、
 * 同じ identifier の予約だけを上書きでき、他の予約（テスト通知）には触れない。
 */
const DAILY_NOTIFICATION_IDENTIFIER = 'daily-notification';

/** 通知を再計算し、次の 9:00 へ予約し直す（上のコメント参照） */
export async function rescheduleNotification(now: Date = new Date()): Promise<void> {
  if (!getNotificationsEnabled()) {
    await Notifications.cancelScheduledNotificationAsync(DAILY_NOTIFICATION_IDENTIFIER).catch(() => {});
    return;
  }

  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') {
    await Notifications.cancelScheduledNotificationAsync(DAILY_NOTIFICATION_IDENTIFIER).catch(() => {});
    return;
  }

  const content = computeCurrentOsNotification(now);
  if (content == null) {
    await Notifications.cancelScheduledNotificationAsync(DAILY_NOTIFICATION_IDENTIFIER).catch(() => {});
    return;
  }

  const { title, body, data } = buildOsContent(content);
  await Notifications.scheduleNotificationAsync({
    identifier: DAILY_NOTIFICATION_IDENTIFIER,
    content: { title, body, data },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: nextNineAm(now) },
  });

  recordNotificationHistory(content, now);
}

/**
 * お知らせ画面「すべて」タブの履歴に、実際に予約した通知の内容を記録する。
 *
 * **同じ日に同じ対象を何度も記録しない**（alreadyLoggedToday）。`rescheduleNotification` は
 * AppState の background 遷移のたびに呼ばれるため、アプリを何度も出入りするだけで同じ
 * 「ちょうどしきい値」の記録・同じ月が繰り返し計算されうる。
 *
 * `days`（出品滞留アラート）・`totalNetProfit`（月次振り返り）はこの時点の値のまま履歴に
 * 凍結する ── あとから記録を編集しても、「その日実際に届いた通知には何と書いてあったか」
 * という履歴の性質上、動かさない（NotificationHistoryEntry のコメント参照）。
 */
function recordNotificationHistory(content: NotificationContent, now: Date): void {
  if (content.kind === 'monthlyReview') {
    const target: NotificationHistoryTarget = { kind: 'monthlyReview', monthKey: content.monthKey };
    if (alreadyLoggedToday(getNotificationHistory(), target, now)) return;

    const summary = repository.careerSummary({ isSoldMode: true, period: content.monthKey });
    appendNotificationHistory({
      id: randomUUID(),
      kind: 'monthlyReview',
      monthKey: content.monthKey,
      totalNetProfit: summary.totalNetProfit,
      occurredAt: toDbDate(now),
    });
    return;
  }

  const first = content.items[0];
  if (first == null) return;
  const target: NotificationHistoryTarget = { kind: 'listingAlert', recordId: first.record.id };
  if (alreadyLoggedToday(getNotificationHistory(), target, now)) return;

  appendNotificationHistory({
    id: randomUUID(),
    kind: 'listingAlert',
    recordId: first.record.id,
    itemName: first.record.itemName,
    days: first.elapsedDays,
    occurredAt: toDbDate(now),
  });
}

/** 設定タブの「通知を受け取る」をオンにしたときに呼ぶ。許可されたら true */
export async function requestNotificationPermission(): Promise<boolean> {
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

/**
 * 開発用: 内容はそのままに、数秒後に届くテスト通知を送る。
 *
 * **秒数はホーム画面に戻って OS 側のバナー表示を確認できるだけの余裕を持たせる。**
 * アプリを開いたままだと setupNotificationHandling の shouldShowBanner: true により
 * アプリ内にバナーが重なって出るだけなので、それだけでは「他のアプリの上にも出る」ことの
 * 確認にならない ── ボタンを押した後にホームボタン（または他アプリ）へ切り替える時間が要る。
 */
const TEST_NOTIFICATION_DELAY_SECONDS = 8;

export async function sendTestNotification(): Promise<void> {
  // 実際に毎朝届く内容と同じもの（computeCurrentOsNotification）で試す。bell の一覧
  // （しきい値超え全件）とは中身が異なりうる ── 詳しくは computeCurrentOsNotification 参照
  const content = computeCurrentOsNotification();
  const { title, body, data } = content
    ? buildOsContent(content)
    : {
        title: 'テスト通知',
        body: '今は出す内容がありません（月初でも、今日新たにしきい値へ到達した滞留商品も無い状態）',
        // 対象が無いのでタップしてもベル一覧を開くだけにする（下の navigateFromNotification 参照）
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

  // タップして起動した場合（コールドスタート）
  Notifications.getLastNotificationResponseAsync().then((response) => {
    if (response != null) navigateFromNotification(response.notification.request.content.data);
  });

  // 起動中にタップした場合
  Notifications.addNotificationResponseReceivedListener((response) => {
    navigateFromNotification(response.notification.request.content.data);
  });
}

const RECORD_DETAIL_PATHNAME = '/records/record/[id]' as const;
const RECORD_PRICING_PATHNAME = '/records/record/[id]/pricing' as const;

/**
 * タップ時の遷移先。**種類ごとに直接目的地へ飛ばす**（ベルの一覧をワンクッション挟まない）。
 *
 * 以前は種類を問わず記録タブのベル一覧を開くだけにしていたが、OS 通知をタップした人は
 * 既に「見たい」と決めてタップしているので、そこでもう一度ベルの行を押させるのは冗長、
 * という判断で変更した。ペイロード（recordId / monthKey）は通知を組み立てた時点の
 * ものをそのまま使う（上の NotificationPayload のコメント参照）。
 *
 * data が想定外の形（旧バージョンの通知が端末に残っていた等）のときはベル一覧に逃がす。
 */
function navigateFromNotification(data: unknown): void {
  const payload = data as Partial<NotificationPayload> | undefined;

  if (payload?.kind === 'listingAlert' && typeof payload.recordId === 'string') {
    // NotificationsScreen.openPricing と同じ理由・同じ形（そちらのコメント参照）── 記録一覧 →
    // 記録詳細 → 損益分岐点の順に、1 コマずつ間を空けて積む
    const recordId = payload.recordId;
    router.dismissTo('/records');
    requestAnimationFrame(() => {
      router.push({ pathname: RECORD_DETAIL_PATHNAME, params: { id: recordId } });
      requestAnimationFrame(() => {
        router.push({ pathname: RECORD_PRICING_PATHNAME, params: { id: recordId } });
      });
    });
    return;
  }
  if (payload?.kind === 'monthlyReview' && typeof payload.monthKey === 'string') {
    router.push({ pathname: '/data', params: { month: payload.monthKey } });
    return;
  }

  router.push('/notifications');
}
