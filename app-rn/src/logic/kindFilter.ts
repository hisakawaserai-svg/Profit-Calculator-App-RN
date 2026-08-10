// 種別フィルタの選択値（SPEC-V2 §4.2 / §7-10）。
//
// repository 側の条件は `RecordKind | null`（null = すべて）だが、UI の選択肢は
// 「すべて」も 1 つの選択肢として並ぶ。null を選択値に使うと OptionSheet の
// SheetOption<T extends string> にも SegmentedControl の index 対応にも載らないので、
// 画面では 'all' を含む文字列 enum で持ち、repository へ渡す直前に null へ戻す。
//
// 記録タブ（合計行の種別チップ。UI-SPEC §1.2）とデータタブ（SegmentedControl）で
// UI の形は違うが、選択肢の順序と表示名は共通なのでここに集約する。

import type { RecordKind } from '@/db/schema';

import { recordKindLabel } from './labels';

/** 画面が持つ種別フィルタの状態。'all' = 絞り込みなし */
export type KindFilter = 'all' | RecordKind;

/** 選択肢の並び（§1.3「すべて / 不用品 / 仕入品」の 3 択） */
export const KIND_FILTERS: readonly KindFilter[] = ['all', 'used', 'sourced'];

/** 絞り込みなしの既定値。フィルタのリセットでもここへ戻す */
export const DEFAULT_KIND_FILTER: KindFilter = 'all';

/** 選択肢の表示名。種別そのものの表示名は labels.ts の確定値を使う（§1.1） */
export function kindFilterLabel(value: KindFilter): string {
  return value === 'all' ? 'すべて' : recordKindLabel(value);
}

/** repository の RecordListFilter.kind / AnalyticsFilter.kind へ渡す値（§4.2） */
export function toKindCondition(value: KindFilter): RecordKind | null {
  return value === 'all' ? null : value;
}

/**
 * 選択肢の配列（`SheetOption<KindFilter>[]` と同じ形）。
 * データタブの SegmentedControl はここからラベルの配列だけを使う。
 */
export const KIND_FILTER_OPTIONS = KIND_FILTERS.map((value) => ({
  label: kindFilterLabel(value),
  value,
}));
