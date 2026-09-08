// アプリ設定の唯一の入口（SPEC-V2 §3）。画面から kv-store を直接触らないこと。
//
// - 保存先は expo-sqlite/kv-store（SPEC-V2 §3.2）。依存の追加がなく、同期 API を持つので
//   「起動時に読める値」として扱える。読み込み中の state もちらつきも要らない。
// - 設定 DB はレコード DB（profit-calculator.db）と別ファイルなので、
//   レコード側のマイグレーションに巻き込まれない。
// - 複数画面（計算タブ / 記録フォーム / 設定画面）から同じ値を購読するため、
//   導入済みの zustand でストアにしている（SPEC-V2 §3.2）。
//   kv-store は書き込みの通知を持たないので、購読はこのストアが担当する。
//
// 設定が変えるのは「これから作るレコードの初期値」だけで、
// 保存済みレコードの kind は書き換わらない（SPEC-V2 §3.4）。

import { getLocales, useLocales, type Locale as DeviceLocale } from 'expo-localization';
import Storage from 'expo-sqlite/kv-store';
import { useEffect } from 'react';
import { create } from 'zustand';

import type { RecordKind } from '@/db/schema';

import { DEFAULT_RECORD_KIND_KEY, normalizeRecordKind } from './defaultRecordKind';
import {
  LANGUAGE_KEY,
  normalizeLanguage,
  resolveLocale,
  type LanguageSetting,
  type Locale,
} from './language';
import {
  DISMISSED_MONTHLY_REVIEW_KEY,
  normalizeDismissedMonthlyReview,
} from './dismissedMonthlyReview';
import { LAST_BACKUP_AT_KEY, normalizeLastBackupAt } from './lastBackupAt';
import {
  LAST_NOTIFICATIONS_CHECKED_AT_KEY,
  normalizeLastNotificationsCheckedAt,
} from './lastNotificationsCheckedAt';
import {
  LISTING_ALERT_THRESHOLD_DAYS_KEY,
  normalizeListingAlertThresholdDays,
} from './listingAlertThresholdDays';
import {
  IGNORED_LISTING_ALERTS_KEY,
  normalizeIgnoredListingAlerts,
} from './ignoredListingAlerts';
import { NOTIFICATIONS_ENABLED_KEY, normalizeNotificationsEnabled } from './notificationsEnabled';
import {
  NOTIFICATION_HISTORY_KEY,
  NOTIFICATION_HISTORY_LIMIT,
  normalizeNotificationHistory,
  type NotificationHistoryEntry,
} from './notificationHistory';
import {
  FIRST_LAUNCH_AT_KEY,
  LAUNCH_COUNT_KEY,
  normalizeCounter,
  normalizeEpochMs,
  REVIEW_REQUEST_COUNT_KEY,
  REVIEW_REQUESTED_AT_KEY,
} from './reviewRequest';
import { normalizeTutorialSeen, TUTORIAL_SEEN_KEY } from './tutorialSeen';

export {
  DEFAULT_RECORD_KIND_KEY,
  FALLBACK_RECORD_KIND,
  normalizeRecordKind,
} from './defaultRecordKind';
export {
  FALLBACK_LANGUAGE,
  FALLBACK_LOCALE,
  LANGUAGE_KEY,
  LANGUAGE_SETTINGS,
  LOCALES,
  normalizeLanguage,
  resolveLocale,
  type LanguageSetting,
  type Locale,
} from './language';
export {
  DISMISSED_MONTHLY_REVIEW_KEY,
  normalizeDismissedMonthlyReview,
} from './dismissedMonthlyReview';
export { LAST_BACKUP_AT_KEY, normalizeLastBackupAt } from './lastBackupAt';
export {
  LAST_NOTIFICATIONS_CHECKED_AT_KEY,
  normalizeLastNotificationsCheckedAt,
} from './lastNotificationsCheckedAt';
export {
  DEFAULT_LISTING_ALERT_THRESHOLD_DAYS,
  LISTING_ALERT_THRESHOLD_DAYS_KEY,
  MAX_LISTING_ALERT_THRESHOLD_DAYS,
  MIN_LISTING_ALERT_THRESHOLD_DAYS,
  normalizeListingAlertThresholdDays,
} from './listingAlertThresholdDays';
export {
  IGNORED_LISTING_ALERTS_KEY,
  normalizeIgnoredListingAlerts,
} from './ignoredListingAlerts';
export { NOTIFICATIONS_ENABLED_KEY, normalizeNotificationsEnabled } from './notificationsEnabled';
export {
  NOTIFICATION_HISTORY_KEY,
  NOTIFICATION_HISTORY_LIMIT,
  normalizeNotificationHistory,
  type NotificationHistoryEntry,
} from './notificationHistory';
export {
  FIRST_LAUNCH_AT_KEY,
  LAUNCH_COUNT_KEY,
  normalizeCounter,
  normalizeEpochMs,
  REVIEW_REQUEST_COUNT_KEY,
  REVIEW_REQUESTED_AT_KEY,
} from './reviewRequest';
export { normalizeTutorialSeen, TUTORIAL_SEEN_KEY } from './tutorialSeen';

/**
 * expo-localization が返す並びから、言語タグ（'ja-JP'）だけを取り出す。
 * `getLocales()`（起動時の 1 回）と `useLocales()`（購読）で同じ形にするために挟んでいる。
 */
function toLanguageTags(locales: readonly DeviceLocale[]): string[] {
  return locales.map((locale) => locale.languageTag);
}

/**
 * 起動時に読む端末の言語。**これだけでは追随しない**ので、
 * 実行中の変更は `useDeviceLanguageSync()` が拾う（下記）。
 *
 * ここで同期に読むのは、初期表示のちらつきを避けるため ── kv-store と同じく、
 * 最初の描画の時点で表示する言語が確定している必要がある。
 */
function initialDeviceLanguages(): string[] {
  return toLanguageTags(getLocales());
}

export type Settings = {
  /** 新規レコード・計算タブの初期種別（SPEC-V2 §1.4 / §3.1） */
  defaultRecordKind: RecordKind;
  /** 設定タブで選んだ 3 択そのもの。'system' は言語ではなく「端末に合わせる」という決め方 */
  language: LanguageSetting;
  /**
   * `language` と端末の言語から決まった、**いま表示に使っている言語**。
   * 画面はこちらを購読する（'system' のままでは何語で出ているか分からないため）。
   * 保存するのは `language` だけで、こちらは毎回起動時に決め直す。
   */
  locale: Locale;
  /**
   * 最後にバックアップを作った日時（SPEC-V8 / 案 53a）。まだ作っていなければ null。
   *
   * **設定ではなく端末の履歴**なので、復元（全置換）では書き換えない ──
   * 「いつ作ったか」はファイルの中身ではなく、この端末で起きたこと。
   */
  lastBackupAt: string | null;
  /**
   * 初回起動チュートリアルを見終えたか（スキップ・「はじめる」のどちらでも true）。
   * true になったあとは false へ戻す口を持たない ── 再表示は onboardingBus 経由の
   * 一時的な表示要求（設定タブ「チュートリアルをもう一度見る」）で行い、既読の記録はそのまま残す。
   */
  tutorialSeen: boolean;
  /** 通知(記録タブのベル・ローカル通知)の全体オンオフ。既定 false(オプトイン) */
  notificationsEnabled: boolean;
  /** 出品滞留アラートの閾値(日)。既定 14 */
  listingAlertThresholdDays: number;
  /**
   * ベルを最後に開いた日時。まだ一度も開いていなければ null。
   * lastBackupAt と同じく**設定ではなく端末の履歴**（未読ドットの判定にだけ使う）。
   */
  lastNotificationsCheckedAt: string | null;
  /**
   * 出品滞留アラートを「今後知らせない」にした記録の id 一覧（お知らせ画面の長押し）。
   * lastNotificationsCheckedAt と同じく端末の履歴に近いが、型として Settings 側に置く
   * （画面から読む必要は無いが、他の設定値と同じ「1 か所からしか触らない」規約に乗せるため）
   */
  ignoredListingAlerts: string[];
  /**
   * 「先月の振り返り」を消した対象月（"YYYY-MM"）。まだ消していなければ null。
   * 押した瞬間にベルから消すため（月初1日の間、同じ月をまた出さない）
   */
  dismissedMonthlyReview: string | null;
  /**
   * 通知履歴（お知らせ画面「すべて」タブ）。新しい順、最大 NOTIFICATION_HISTORY_LIMIT 件。
   * lastNotificationsCheckedAt と同じく端末の履歴（詳しくは notificationHistory.ts の冒頭）
   */
  notificationHistory: NotificationHistoryEntry[];
};

type SettingsStore = Settings & {
  /**
   * 端末で設定されている言語を優先順に並べたもの。**設定ではなく端末の状態**なので
   * `Settings` には入れない（保存もしない）。`locale` を決め直すときの材料として、
   * 起動時の値と `useDeviceLanguageSync()` が流し込む値をここで一本化している。
   */
  deviceLanguages: readonly string[];
  /**
   * アプリ内レビュー依頼の履歴（docs/DESIGN-REVIEW-PROMPT.md）。
   * **設定ではなく端末の履歴**なので `deviceLanguages` と同じく `Settings` には入れない ──
   * 画面に出す値ではなく（出す予定も無い）、判定から読むだけのもの。
   *
   * `reviewRequestCount` / `reviewRequestedAt` が数えているのは**こちらから頼んだ回数と時刻**で、
   * 利用者が実際にレビュー画面を見た回数ではない。表示回数は OS が管理し、
   * 出たかどうかはアプリに返ってこない（logic/reviewPrompt.ts の冒頭）。
   */
  launchCount: number;
  firstLaunchAt: number | null;
  reviewRequestedAt: number | null;
  reviewRequestCount: number;
  setDefaultRecordKind: (kind: RecordKind) => void;
  setDeviceLanguages: (languages: readonly string[]) => void;
  setLanguage: (language: LanguageSetting) => void;
  setLastBackupAt: (createdAt: string) => void;
  markTutorialSeen: () => void;
  countLaunch: (now: number) => void;
  markReviewRequested: (at: number) => void;
  setNotificationsEnabled: (enabled: boolean) => void;
  setListingAlertThresholdDays: (days: number) => void;
  setLastNotificationsCheckedAt: (checkedAt: string) => void;
  ignoreListingAlert: (recordId: string) => void;
  dismissMonthlyReview: (monthKey: string) => void;
  appendNotificationHistory: (entry: NotificationHistoryEntry) => void;
  removeNotificationHistoryEntry: (id: string) => void;
  clearNotificationHistory: () => void;
};

// 起動時の言語。kv-store は同期に読めるので、初期値をその場で決められる
const initialLanguage = normalizeLanguage(Storage.getItemSync(LANGUAGE_KEY));
const initialDeviceLanguageTags = initialDeviceLanguages();
const initialLocale = resolveLocale(initialLanguage, initialDeviceLanguageTags);

const useSettingsStore = create<SettingsStore>((set, get) => ({
  // getItemSync なので初期値をその場で読める。不正値・未設定は 'used' に倒れる
  defaultRecordKind: normalizeRecordKind(Storage.getItemSync(DEFAULT_RECORD_KIND_KEY)),
  language: initialLanguage,
  locale: initialLocale,
  deviceLanguages: initialDeviceLanguageTags,
  lastBackupAt: normalizeLastBackupAt(Storage.getItemSync(LAST_BACKUP_AT_KEY)),
  tutorialSeen: normalizeTutorialSeen(Storage.getItemSync(TUTORIAL_SEEN_KEY)),
  launchCount: normalizeCounter(Storage.getItemSync(LAUNCH_COUNT_KEY)),
  firstLaunchAt: normalizeEpochMs(Storage.getItemSync(FIRST_LAUNCH_AT_KEY)),
  reviewRequestedAt: normalizeEpochMs(Storage.getItemSync(REVIEW_REQUESTED_AT_KEY)),
  reviewRequestCount: normalizeCounter(Storage.getItemSync(REVIEW_REQUEST_COUNT_KEY)),
  notificationsEnabled: normalizeNotificationsEnabled(Storage.getItemSync(NOTIFICATIONS_ENABLED_KEY)),
  listingAlertThresholdDays: normalizeListingAlertThresholdDays(
    Storage.getItemSync(LISTING_ALERT_THRESHOLD_DAYS_KEY),
  ),
  lastNotificationsCheckedAt: normalizeLastNotificationsCheckedAt(
    Storage.getItemSync(LAST_NOTIFICATIONS_CHECKED_AT_KEY),
  ),
  ignoredListingAlerts: normalizeIgnoredListingAlerts(
    Storage.getItemSync(IGNORED_LISTING_ALERTS_KEY),
  ),
  dismissedMonthlyReview: normalizeDismissedMonthlyReview(
    Storage.getItemSync(DISMISSED_MONTHLY_REVIEW_KEY),
  ),
  notificationHistory: normalizeNotificationHistory(Storage.getItemSync(NOTIFICATION_HISTORY_KEY)),
  setDefaultRecordKind: (kind) => {
    // 先に永続化してからストアを更新する。書き込みが失敗したら state も進めない
    Storage.setItemSync(DEFAULT_RECORD_KIND_KEY, kind);
    set({ defaultRecordKind: kind });
  },
  /**
   * 端末の言語が変わったことを受け取り、表示する言語を決め直す。
   * 呼ぶのは `useDeviceLanguageSync()` だけ。
   *
   * `language` が 'ja' / 'en'（3 択で明示的に選ばれている）ときは `resolveLocale` が
   * その値をそのまま返すので、**端末の言語を変えても表示は動かない**。
   * 動くのは 'system'（端末に合わせる）のときだけ。
   */
  setDeviceLanguages: (languages) => {
    const { deviceLanguages: current, language } = get();
    // 並びまで同じなら何もしない。ストア全体を購読している画面
    // （useSettings）を無駄に再描画させないため
    if (current.length === languages.length && current.every((tag, i) => tag === languages[i])) {
      return;
    }
    set({ deviceLanguages: languages, locale: resolveLocale(language, languages) });
  },
  setLanguage: (language) => {
    // 他の設定と同じく、先に永続化してからストアを更新する
    Storage.setItemSync(LANGUAGE_KEY, language);
    // 表示語は locale を引数に取るので（src/i18n/index.ts）、
    // ここで state を進めれば購読している画面の再描画と文字列の引き直しが同時に起きる
    set({ language, locale: resolveLocale(language, get().deviceLanguages) });
  },
  setLastBackupAt: (createdAt) => {
    Storage.setItemSync(LAST_BACKUP_AT_KEY, createdAt);
    set({ lastBackupAt: createdAt });
  },
  markTutorialSeen: () => {
    Storage.setItemSync(TUTORIAL_SEEN_KEY, '1');
    set({ tutorialSeen: true });
  },
  setNotificationsEnabled: (enabled) => {
    Storage.setItemSync(NOTIFICATIONS_ENABLED_KEY, enabled ? '1' : '0');
    set({ notificationsEnabled: enabled });
  },
  setListingAlertThresholdDays: (days) => {
    Storage.setItemSync(LISTING_ALERT_THRESHOLD_DAYS_KEY, String(days));
    set({ listingAlertThresholdDays: days });
  },
  setLastNotificationsCheckedAt: (checkedAt) => {
    Storage.setItemSync(LAST_NOTIFICATIONS_CHECKED_AT_KEY, checkedAt);
    set({ lastNotificationsCheckedAt: checkedAt });
  },
  ignoreListingAlert: (recordId) => {
    const current = get().ignoredListingAlerts;
    if (current.includes(recordId)) return;
    const next = [...current, recordId];
    Storage.setItemSync(IGNORED_LISTING_ALERTS_KEY, JSON.stringify(next));
    set({ ignoredListingAlerts: next });
  },
  dismissMonthlyReview: (monthKey) => {
    Storage.setItemSync(DISMISSED_MONTHLY_REVIEW_KEY, monthKey);
    set({ dismissedMonthlyReview: monthKey });
  },
  /** 新しい順の先頭に足し、上限 NOTIFICATION_HISTORY_LIMIT 件を超えた分は古い方から切り捨てる */
  appendNotificationHistory: (entry) => {
    const next = [entry, ...get().notificationHistory].slice(0, NOTIFICATION_HISTORY_LIMIT);
    Storage.setItemSync(NOTIFICATION_HISTORY_KEY, JSON.stringify(next));
    set({ notificationHistory: next });
  },
  /**
   * 履歴の1件を「すべて」タブの表示から消す。呼ぶのは行タップ（対応した = もう要らない）と
   * 長押しの「今後知らせない」（合意: 2026-09）。
   *
   * **物理削除ではなく `hidden: true` を立てるだけ**（NotificationHistoryEntry のコメント
   * 参照）。物理削除すると、`notYetNotifiedListingAlertItems` がこの履歴を「もう知らせた」の
   * 記録として使えなくなり、確認しただけの商品がすぐ再び OS 通知の対象に戻ってしまう
   * （実機で発覚: 2026-09）。
   */
  removeNotificationHistoryEntry: (id) => {
    const next = get().notificationHistory.map((entry) =>
      entry.id === id ? { ...entry, hidden: true } : entry,
    );
    Storage.setItemSync(NOTIFICATION_HISTORY_KEY, JSON.stringify(next));
    set({ notificationHistory: next });
  },
  /** 「すべて」タブの「すべて消す」から呼ぶ。履歴をまるごと空にする */
  clearNotificationHistory: () => {
    Storage.setItemSync(NOTIFICATION_HISTORY_KEY, JSON.stringify([]));
    set({ notificationHistory: [] });
  },
  /**
   * この起動を 1 回として数える。呼ぶのは `countLaunch()` だけ（下記の once ガード付き）。
   *
   * **初回起動の時刻は、まだ無いときだけ書く。** 上書きしてしまうと
   * 「初回起動から 7 日以上」の条件が毎回リセットされ、永久に満たせなくなる。
   */
  countLaunch: (now) => {
    const next = get().launchCount + 1;
    Storage.setItemSync(LAUNCH_COUNT_KEY, String(next));

    const firstLaunchAt = get().firstLaunchAt;
    if (firstLaunchAt == null) {
      Storage.setItemSync(FIRST_LAUNCH_AT_KEY, String(now));
      set({ launchCount: next, firstLaunchAt: now });
      return;
    }

    set({ launchCount: next });
  },
  /**
   * レビューを**頼んだ**ことを記録する（見せられたことではない。型のコメント参照）。
   * 他の値と同じく、先に永続化してからストアを更新する。
   */
  markReviewRequested: (at) => {
    const next = get().reviewRequestCount + 1;
    Storage.setItemSync(REVIEW_REQUESTED_AT_KEY, String(at));
    Storage.setItemSync(REVIEW_REQUEST_COUNT_KEY, String(next));
    set({ reviewRequestedAt: at, reviewRequestCount: next });
  },
}));

/**
 * 設定の購読（設定画面・計算タブ）。
 * 変更するときは返り値の setDefaultRecordKind を呼ぶ（永続化までまとめて行う）。
 */
export function useSettings(): SettingsStore {
  return useSettingsStore();
}

/**
 * 端末の言語設定の変更をストアへ流し込む。**アプリ全体で 1 か所だけで呼ぶ**（RootLayout）。
 *
 * **なぜ購読が要るのか。** 起動時に `getLocales()` を 1 回読むだけでは追随できない。
 * Android は app.json の expo-localization が `allowDynamicLocaleChangesAndroid` を
 * 既定 true で持っており、prebuild が `android:configChanges` に `locale|layoutDirection`
 * を足す。**その結果、端末の言語を変えても Activity は作り直されない** ──
 * プロセスも JS の状態もそのまま残るので、購読しない限り初回に読んだ言語で固まる。
 * iOS も設定アプリから戻る経路でプロセスは生き続けるので同じ。
 *
 * `useLocales()` は expo-localization が用意している購読フックで、OS 側の変更で
 * 再描画がかかる。ここで受けてストアへ渡し、表示語は従来どおり `useLocale()` →
 * labels.ts への引数、という経路のまま動かす（React Compiler 対応の規約は変えない）。
 */
export function useDeviceLanguageSync(): void {
  // `useLocales()` は毎回新しい配列を返すので、そのままでは effect の依存にできない。
  // 言語タグに ',' は現れないので、並びを畳んだ文字列を依存に使い、中で戻す
  const languageTags = toLanguageTags(useLocales()).join(',');

  useEffect(() => {
    useSettingsStore.getState().setDeviceLanguages(languageTags.split(','));
  }, [languageTags]);
}

/**
 * いま表示している言語を購読する。
 *
 * **表示語を出す画面はこれを呼び、返り値を labels.ts の各関数へ渡す。**
 * 引数として渡すことが必須なのは React Compiler のため（src/i18n/index.ts の冒頭）── 
 * 渡し忘れは型エラーになるので、購読だけして渡し忘れる、ということが起きない。
 */
export function useLocale(): Locale {
  return useSettingsStore((state) => state.locale);
}

/** React の外・レンダー中の初期値計算から読む用（購読はしない） */
export function getDefaultRecordKind(): RecordKind {
  return useSettingsStore.getState().defaultRecordKind;
}

/** React の外（通知スケジューラなど）から表示語を組み立てる用。購読はしない */
export function getLocale(): Locale {
  return useSettingsStore.getState().locale;
}

/** 設定画面以外から書き換える必要はないが、API の対称性のために公開しておく */
export function setDefaultRecordKind(kind: RecordKind): void {
  useSettingsStore.getState().setDefaultRecordKind(kind);
}

/** `countLaunch()` を 1 プロセスにつき 1 回に抑える番人（下記の理由） */
let launchCounted = false;

/**
 * この起動を 1 回として数える。**アプリ全体で 1 か所だけで呼ぶ**（RootLayout）。
 *
 * `useDeviceLanguageSync()` と同じく「起動につき 1 回」の副作用だが、こちらは
 * **呼ばれた回数がそのまま保存される**ので、二重呼び出しが数字の誤りとして残る ──
 * effect は開発時の再マウントや将来の StrictMode で 2 回走りうる。
 * モジュールの寿命はプロセスと同じなので、ここで弾けば実際の起動回数と一致する。
 */
export function countLaunch(now: number = Date.now()): void {
  if (launchCounted) return;
  launchCounted = true;
  useSettingsStore.getState().countLaunch(now);
}

/**
 * レビュー依頼の判定（logic/reviewPrompt.ts）が読む履歴。**購読はしない** ──
 * 読むのは保存操作の直後に 1 回だけで、値が変わったことを画面に映す必要がない。
 *
 * 売れた記録の件数（`soldRecordCount`）はここに含めない。あれは設定ではなく
 * 記録 DB の集計なので、呼び出し側が repository から足す。
 */
export function getReviewPromptHistory(): {
  launchCount: number;
  firstLaunchAt: number | null;
  lastRequestedAt: number | null;
  requestCount: number;
} {
  const { launchCount, firstLaunchAt, reviewRequestedAt, reviewRequestCount } =
    useSettingsStore.getState();

  return {
    launchCount,
    firstLaunchAt,
    lastRequestedAt: reviewRequestedAt,
    requestCount: reviewRequestCount,
  };
}

/** レビューを頼んだことを記録する。呼ぶのは src/review/requestReview.ts だけ */
export function markReviewRequested(at: number = Date.now()): void {
  useSettingsStore.getState().markReviewRequested(at);
}

/** 設定画面の通知セクションが購読する */
export function useNotificationsEnabled(): boolean {
  return useSettingsStore((state) => state.notificationsEnabled);
}
export function setNotificationsEnabled(enabled: boolean): void {
  useSettingsStore.getState().setNotificationsEnabled(enabled);
}

export function useListingAlertThresholdDays(): number {
  return useSettingsStore((state) => state.listingAlertThresholdDays);
}
export function setListingAlertThresholdDays(days: number): void {
  useSettingsStore.getState().setListingAlertThresholdDays(days);
}

/**
 * React の外（通知スケジューラ・AppState のコールバック）から読む用。購読はしない。
 * 記録タブのベルは `useSettings()` 経由でこれらを購読して未読ドットを出す。
 */
export function getNotificationsEnabled(): boolean {
  return useSettingsStore.getState().notificationsEnabled;
}
export function getListingAlertThresholdDays(): number {
  return useSettingsStore.getState().listingAlertThresholdDays;
}
export function getLastNotificationsCheckedAt(): string | null {
  return useSettingsStore.getState().lastNotificationsCheckedAt;
}

/** ベルを開いたことを記録する。呼ぶのは記録タブのベルだけ */
export function markNotificationsChecked(checkedAt: string): void {
  useSettingsStore.getState().setLastNotificationsCheckedAt(checkedAt);
}
export function getIgnoredListingAlerts(): string[] {
  return useSettingsStore.getState().ignoredListingAlerts;
}
/** お知らせ画面の長押しから呼ぶ。この記録の出品滞留アラートを今後出さないようにする */
export function ignoreListingAlert(recordId: string): void {
  useSettingsStore.getState().ignoreListingAlert(recordId);
}
export function getDismissedMonthlyReview(): string | null {
  return useSettingsStore.getState().dismissedMonthlyReview;
}
/** お知らせ画面で「先月の振り返り」を押したときに呼ぶ */
export function dismissMonthlyReview(monthKey: string): void {
  useSettingsStore.getState().dismissMonthlyReview(monthKey);
}

/** お知らせ画面「すべて」タブが購読する */
export function useNotificationHistory(): NotificationHistoryEntry[] {
  return useSettingsStore((state) => state.notificationHistory);
}
/** React の外（通知スケジューラ）から読む用。購読はしない */
export function getNotificationHistory(): NotificationHistoryEntry[] {
  return useSettingsStore.getState().notificationHistory;
}
/** 呼ぶのは通知スケジューラだけ（rescheduleNotification が実際に予約した内容を記録する） */
export function appendNotificationHistory(entry: NotificationHistoryEntry): void {
  useSettingsStore.getState().appendNotificationHistory(entry);
}
/** お知らせ画面「すべて」タブの行タップ・長押しから呼ぶ。対応済みの履歴を消す */
export function removeNotificationHistoryEntry(id: string): void {
  useSettingsStore.getState().removeNotificationHistoryEntry(id);
}
/** お知らせ画面「すべて」タブの「すべて消す」から呼ぶ */
export function clearNotificationHistory(): void {
  useSettingsStore.getState().clearNotificationHistory();
}
