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
//
// **お知らせ画面「すべて」タブへの記録は、予約した瞬間ではなく「予約時刻を過ぎた」ことを
// 確認できてから行う。** rescheduleNotification は background 遷移のたびに走るが、実際に
// OS 通知が届くのは次の 9:00 だけ。予約の瞬間に記録すると、まだ1通も届いていないのに
// 履歴だけ先に積み上がってしまう（詳しくは pendingNotificationLog.ts・
// promotePendingNotificationIfDue のコメント参照）。
import { randomUUID } from 'expo-crypto';
import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';

import { repository } from '@/db/client';
import { fromDbDate, toDbDate } from '@/db/dates';
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
  notYetNotifiedListingAlertItems,
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
  type PendingNotificationLog,
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
 * bell 用の `computeCurrentNotification` とは、両方とも「まだ知らせていないか」を
 * 履歴と突き合わせて絞り込む点が違う。
 *
 * **月次振り返りも、出品滞留アラートと同じく「今日すでに知らせていれば予約し直さない」。**
 * `rescheduleNotification` は AppState の background 遷移のたびに呼ばれるため、月初の
 * 9:00 に届いたあとその日のうちにもう一度アプリをバックグラウンドへ送ると、
 * `currentNotification` は（まだ月初なので）また月次振り返りを返してしまう。ここで
 * 弾かないと、「次の 9:00」＝翌日の 9:00 へ同じ内容が再予約され、履歴には二重記録
 * されない（alreadyLoggedToday）のに OS 通知だけ翌朝もう一度届いてしまう
 * （実機で発覚: 2026-09）。
 */
function computeCurrentOsNotification(now: Date = new Date()): NotificationContent | null {
  const content = computeCurrentNotification(now);
  if (content == null) return null;

  if (content.kind === 'monthlyReview') {
    const target: NotificationHistoryTarget = { kind: 'monthlyReview', monthKey: content.monthKey };
    if (alreadyLoggedToday(getNotificationHistory(), target, now)) return null;
    return content;
  }

  const items = notYetNotifiedListingAlertItems(content.items, getNotificationHistory());
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
  const count = rest.length + 1;
  return {
    title: listingAlertOsTitle(locale),
    body: listingAlertOsBody(locale, first.record.itemName, first.elapsedDays, count),
    data: count === 1 ? { kind: 'listingAlert', recordId: first.record.id } : { kind: 'listingAlertMany' },
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
  // 前回予約した内容の発火予定時刻をもう過ぎていれば、ここで初めて履歴へ記録する
  // （enabled・許可の状態に関わらず、まず過去分を確定させる。詳しくは関数のコメント）
  promotePendingNotificationIfDue(now);

  if (!getNotificationsEnabled()) {
    await Notifications.cancelScheduledNotificationAsync(DAILY_NOTIFICATION_IDENTIFIER).catch(() => {});
    setPendingNotificationLog(null);
    return;
  }

  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') {
    await Notifications.cancelScheduledNotificationAsync(DAILY_NOTIFICATION_IDENTIFIER).catch(() => {});
    setPendingNotificationLog(null);
    return;
  }

  const content = computeCurrentOsNotification(now);
  if (content == null) {
    await Notifications.cancelScheduledNotificationAsync(DAILY_NOTIFICATION_IDENTIFIER).catch(() => {});
    setPendingNotificationLog(null);
    return;
  }

  const { title, body, data } = buildOsContent(content);
  const scheduledFor = nextNineAm(now);
  await Notifications.scheduleNotificationAsync({
    identifier: DAILY_NOTIFICATION_IDENTIFIER,
    content: { title, body, data },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: scheduledFor },
  });

  // ここではまだ履歴に記録しない（下のコメント参照）。次に rescheduleNotification が
  // 走ったとき、この予約時刻をもう過ぎていれば、そこで初めて記録される
  setPendingNotificationLog(toPendingNotificationLog(content, scheduledFor));
}

/**
 * content（今まさに予約する内容）を、あとで履歴に記録するための保留データに変換する。
 * 月次振り返りの合計額はこの時点の値のまま保留データに凍結する（NotificationHistoryEntry の
 * コメントと同じ理由 ── 実際に記録するのは発火予定時刻を過ぎたあとだが、値は予約した
 * 瞬間のものを使う。届く直前に売上が動いても、通知に書いた数字とはズレさせない）。
 */
function toPendingNotificationLog(content: NotificationContent, scheduledFor: Date): PendingNotificationLog {
  const scheduledForKey = toDbDate(scheduledFor);
  if (content.kind === 'monthlyReview') {
    const summary = repository.careerSummary({ isSoldMode: true, period: content.monthKey });
    return {
      kind: 'monthlyReview',
      monthKey: content.monthKey,
      totalNetProfit: summary.totalNetProfit,
      scheduledFor: scheduledForKey,
    };
  }
  return {
    kind: 'listingAlert',
    items: content.items.map((item) => ({
      recordId: item.record.id,
      itemName: item.record.itemName,
      days: item.elapsedDays,
    })),
    scheduledFor: scheduledForKey,
  };
}

/**
 * 保留中の通知（前回 rescheduleNotification が予約した内容）の発火予定時刻をもう過ぎていれば、
 * 「実際に OS 通知として届いたはず」とみなして、ここで初めてお知らせ画面「すべて」タブの
 * 履歴へ記録する。過ぎていなければ何もしない（据え置く）。
 *
 * **予約した瞬間ではなく、届いたはずの時刻を過ぎてから記録する。**
 * `rescheduleNotification` は AppState の background 遷移のたびに走る（ホーム画面に戻る・
 * 他アプリへ切り替える等、日常的に何度も起きる）。予約の瞬間に記録すると、実際には
 * まだ1通も届いていないのに「バックグラウンドへ送るたびに履歴だけ先に積み上がる」
 * 「届く前から『すべて』タブに出る」「一度記録された時点でテスト通知が『対象なし』に
 * なる」という食い違いが起きる（実機で発覚: 2026-09。pendingNotificationLog.ts 参照）。
 *
 * `occurredAt` には保留データの `scheduledFor`（＝実際に届いたはずの時刻）を使う。
 * 「その日実際に届いた通知には何と書いてあったか」という履歴の性質上、記録に気づいた
 * 瞬間（`now`）ではなく、本来届いたはずの時刻を残す方が正確。
 *
 * `rescheduleNotification` の中でも呼ぶが、それだけだと background 遷移まで気づけない。
 * アプリを開いたまま（active）でも早めに「すべて」タブへ反映されてほしいので、
 * export して AppState の active 遷移（app/_layout.tsx）からも直接呼べるようにしてある。
 */
export function promotePendingNotificationIfDue(now: Date = new Date()): void {
  const pending = getPendingNotificationLog();
  if (pending == null) return;
  if (fromDbDate(pending.scheduledFor).getTime() > now.getTime()) return;

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
  } else {
    // OS 通知の本文は pending.items 全件をまとめて数える（buildOsContent の osBodyMany）。
    // 履歴側も代表 1 件だけでなく、束ねた全件をそれぞれ 1 行ずつ記録する ── そうしないと
    // 「3件あります」と届いたのに「すべて」タブには 1 件しか無い、という食い違いになる
    // （実機の指摘）。
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

  setPendingNotificationLog(null);
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
 * 直近に処理したタップの識別子（`request.identifier:notification.date`）。
 *
 * **通知をタップしてコールドスタートすると、`getLastNotificationResponseAsync` と
 * `addNotificationResponseReceivedListener` の両方が同じタップに反応することがある**
 * （expo-notifications の既知の挙動）。ガード無しだと `navigateFromNotification` が
 * 2 回走り、`/notifications` が二重に push されて閉じられなくなる（実機で発覚: 2026-09。
 * ✕ で閉じても後ろにもう1枚同じ画面が残り、タブバーも見えなくなる不具合だった）。
 *
 * **`request.identifier` 単体では駄目。** 毎朝の通知は `DAILY_NOTIFICATION_IDENTIFIER`
 * 固定なので、日をまたいだ次の通知も同じ identifier になる。`notification.date`
 * （実際に届いた時刻）を組み合わせて初めて「同じ1回のタップ」を一意に指せる。
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

  // タップして起動した場合（コールドスタート）
  Notifications.getLastNotificationResponseAsync().then((response) => {
    if (response != null) handleNotificationResponseOnce(response);
  });

  // 起動中にタップした場合
  Notifications.addNotificationResponseReceivedListener((response) => {
    handleNotificationResponseOnce(response);
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
  // 複数件まとまった通知（NotificationPayload の listingAlertMany のコメント参照）。
  // どれか1件へ勝手に飛ばさず、お知らせ画面で選んでもらう
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
