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

import Storage from 'expo-sqlite/kv-store';
import { create } from 'zustand';

import type { RecordKind } from '@/db/schema';

import { DEFAULT_RECORD_KIND_KEY, normalizeRecordKind } from './defaultRecordKind';
import { LAST_BACKUP_AT_KEY, normalizeLastBackupAt } from './lastBackupAt';

export {
  DEFAULT_RECORD_KIND_KEY,
  FALLBACK_RECORD_KIND,
  normalizeRecordKind,
} from './defaultRecordKind';
export { LAST_BACKUP_AT_KEY, normalizeLastBackupAt } from './lastBackupAt';

export type Settings = {
  /** 新規レコード・計算タブの初期種別（SPEC-V2 §1.4 / §3.1） */
  defaultRecordKind: RecordKind;
  /**
   * 最後にバックアップを作った日時（SPEC-V8 / 案 53a）。まだ作っていなければ null。
   *
   * **設定ではなく端末の履歴**なので、復元（全置換）では書き換えない ──
   * 「いつ作ったか」はファイルの中身ではなく、この端末で起きたこと。
   */
  lastBackupAt: string | null;
};

type SettingsStore = Settings & {
  setDefaultRecordKind: (kind: RecordKind) => void;
  setLastBackupAt: (createdAt: string) => void;
};

const useSettingsStore = create<SettingsStore>((set) => ({
  // getItemSync なので初期値をその場で読める。不正値・未設定は 'used' に倒れる
  defaultRecordKind: normalizeRecordKind(Storage.getItemSync(DEFAULT_RECORD_KIND_KEY)),
  lastBackupAt: normalizeLastBackupAt(Storage.getItemSync(LAST_BACKUP_AT_KEY)),
  setDefaultRecordKind: (kind) => {
    // 先に永続化してからストアを更新する。書き込みが失敗したら state も進めない
    Storage.setItemSync(DEFAULT_RECORD_KIND_KEY, kind);
    set({ defaultRecordKind: kind });
  },
  setLastBackupAt: (createdAt) => {
    Storage.setItemSync(LAST_BACKUP_AT_KEY, createdAt);
    set({ lastBackupAt: createdAt });
  },
}));

/**
 * 設定の購読（設定画面・計算タブ）。
 * 変更するときは返り値の setDefaultRecordKind を呼ぶ（永続化までまとめて行う）。
 */
export function useSettings(): SettingsStore {
  return useSettingsStore();
}

/** React の外・レンダー中の初期値計算から読む用（購読はしない） */
export function getDefaultRecordKind(): RecordKind {
  return useSettingsStore.getState().defaultRecordKind;
}

/** 設定画面以外から書き換える必要はないが、API の対称性のために公開しておく */
export function setDefaultRecordKind(kind: RecordKind): void {
  useSettingsStore.getState().setDefaultRecordKind(kind);
}
