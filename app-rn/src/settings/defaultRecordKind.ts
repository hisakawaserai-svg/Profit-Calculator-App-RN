// 「新規作成時の種別」設定（SPEC-V2 §3.1）のうち、保存先に依存しない部分。
//
// 保存先は expo-sqlite/kv-store（SPEC-V2 §3.2）で、値は文字列としてしか返ってこない。
// 妥当性の検証はアプリ側の責務なので、その規則をここに置く。
// I/O（kv-store と zustand）は ./index.ts にあり、このファイルは import しない。
// 分けてあるのは、フォールバック規則を native モジュールなしで単体テストできるようにするため。

import type { RecordKind } from '@/db/schema';

/** kv-store のキー。SPEC-V2 §3.1 の設定キー名をそのまま使う */
export const DEFAULT_RECORD_KIND_KEY = 'defaultRecordKind';

/**
 * 未設定・不正値のときに使う既定値（SPEC-V2 §3.1）。
 * 'used'（不用品）にするのは、対象人数が多い側を既定にするという方針による。
 */
export const FALLBACK_RECORD_KIND: RecordKind = 'used';

/**
 * kv-store から読んだ文字列を種別に変換する。
 * 未設定（null）も、想定外の文字列（手で書き換えられた・将来の値からのダウングレード）も
 * 常に既定値へ倒す（SPEC-V2 §3.2）。
 */
export function normalizeRecordKind(value: string | null | undefined): RecordKind {
  return value === 'used' || value === 'sourced' ? value : FALLBACK_RECORD_KIND;
}
