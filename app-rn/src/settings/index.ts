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

import { getLocales } from 'expo-localization';
import Storage from 'expo-sqlite/kv-store';
import { create } from 'zustand';

import type { RecordKind } from '@/db/schema';
import { setI18nLocale } from '@/i18n';

import { DEFAULT_RECORD_KIND_KEY, normalizeRecordKind } from './defaultRecordKind';
import {
  LANGUAGE_KEY,
  normalizeLanguage,
  resolveLocale,
  type LanguageSetting,
  type Locale,
} from './language';
import { LAST_BACKUP_AT_KEY, normalizeLastBackupAt } from './lastBackupAt';
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
export { LAST_BACKUP_AT_KEY, normalizeLastBackupAt } from './lastBackupAt';
export { normalizeTutorialSeen, TUTORIAL_SEEN_KEY } from './tutorialSeen';

/**
 * 端末で設定されている言語を優先順に並べたもの。
 *
 * iOS では実行中に変わらないので 1 回読めば足りる。Android は再起動なしで変えられるが、
 * その場合もアプリのプロセスは作り直されるため、起動時に読む形で足りている
 * （expo-localization のドキュメントが AppState での読み直しに触れているのは、
 * プロセスを保ったまま前面に戻る経路のため。ステップ 1 の範囲では扱わない）。
 */
function deviceLanguages(): string[] {
  return getLocales().map((locale) => locale.languageTag);
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
};

type SettingsStore = Settings & {
  setDefaultRecordKind: (kind: RecordKind) => void;
  setLanguage: (language: LanguageSetting) => void;
  setLastBackupAt: (createdAt: string) => void;
  markTutorialSeen: () => void;
};

/**
 * 起動時の言語。**ストアを作る前に i18n 側へも反映しておく** ── ストアの初期化は
 * このモジュールが最初に import された時点（app/_layout.tsx）で走るので、
 * どの画面が描画されるより前に `t()` が正しい言語を返すようになる。
 */
const initialLanguage = normalizeLanguage(Storage.getItemSync(LANGUAGE_KEY));
const initialLocale = resolveLocale(initialLanguage, deviceLanguages());
setI18nLocale(initialLocale);

const useSettingsStore = create<SettingsStore>((set) => ({
  // getItemSync なので初期値をその場で読める。不正値・未設定は 'used' に倒れる
  defaultRecordKind: normalizeRecordKind(Storage.getItemSync(DEFAULT_RECORD_KIND_KEY)),
  language: initialLanguage,
  locale: initialLocale,
  lastBackupAt: normalizeLastBackupAt(Storage.getItemSync(LAST_BACKUP_AT_KEY)),
  tutorialSeen: normalizeTutorialSeen(Storage.getItemSync(TUTORIAL_SEEN_KEY)),
  setDefaultRecordKind: (kind) => {
    // 先に永続化してからストアを更新する。書き込みが失敗したら state も進めない
    Storage.setItemSync(DEFAULT_RECORD_KIND_KEY, kind);
    set({ defaultRecordKind: kind });
  },
  setLanguage: (language) => {
    // 他の設定と同じく、先に永続化してからストアを更新する
    Storage.setItemSync(LANGUAGE_KEY, language);
    const locale = resolveLocale(language, deviceLanguages());
    // labels.ts が読む先（i18n-js）と、購読している画面（zustand）の両方を動かす。
    // 片方だけだと「文字列は変わったのに再描画されない」「再描画されたが文字列が古い」になる
    setI18nLocale(locale);
    set({ language, locale });
  },
  setLastBackupAt: (createdAt) => {
    Storage.setItemSync(LAST_BACKUP_AT_KEY, createdAt);
    set({ lastBackupAt: createdAt });
  },
  markTutorialSeen: () => {
    Storage.setItemSync(TUTORIAL_SEEN_KEY, '1');
    set({ tutorialSeen: true });
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
 * いま表示している言語を購読する。
 *
 * **表示語を出す画面はこれを呼ぶ。** labels.ts の各関数は呼ばれた時点の言語で文字列を返すが、
 * 言語が変わったことを React に伝えるのはこの購読だけ ── 呼んでいない画面は、
 * 次に他の理由で再描画されるまで前の言語のまま残る。
 * 返り値そのものを使う必要はない（購読が目的）。
 */
export function useLocale(): Locale {
  return useSettingsStore((state) => state.locale);
}

/** React の外・レンダー中の初期値計算から読む用（購読はしない） */
export function getDefaultRecordKind(): RecordKind {
  return useSettingsStore.getState().defaultRecordKind;
}

/** 設定画面以外から書き換える必要はないが、API の対称性のために公開しておく */
export function setDefaultRecordKind(kind: RecordKind): void {
  useSettingsStore.getState().setDefaultRecordKind(kind);
}
