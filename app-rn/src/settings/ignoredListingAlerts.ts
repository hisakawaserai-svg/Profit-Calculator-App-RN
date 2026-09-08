// 出品滞留アラートを「今後知らせない」にした記録の id 一覧。lastNotificationsCheckedAt.ts と
// 同じく、これも利用者が選ぶ設定値というより端末の履歴に近いが、保存先(kv-store)の
// 都合上ここに置く。
//
// **DB(sale_records テーブル)ではなく設定側に持つ**。理由: これは「その記録の属性」
// ではなく「通知をどう扱うか」という、通知機能だけのローカルな好み。DB 側に列を足すと
// マイグレーションが要り、CSV書き出し・バックアップの列にも影響が及ぶが、ここに置けば
// 既存の設定値と同じ形（getItemSync の文字列 1 本）で完結する。

/** kv-store のキー。値は記録 id の配列を JSON にしたもの */
export const IGNORED_LISTING_ALERTS_KEY = 'ignoredListingAlerts';

/** 保存されている値を読める形にする。形が違えば空配列にする（読めない値で落ちない） */
export function normalizeIgnoredListingAlerts(value: string | null | undefined): string[] {
  if (typeof value !== 'string') return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === 'string');
  } catch {
    return [];
  }
}
