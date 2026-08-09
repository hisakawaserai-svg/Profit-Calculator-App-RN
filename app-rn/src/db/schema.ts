import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// SPEC.md §1 SaleRecordEntities に対応するテーブル。
// - 金額・手数料率は Double のまま保持し、丸めは表示時のみ（SPEC §2.6）
// - saleStartDate は RN 版では必須（SPEC 決定 §7-11）
// - saleDate は出品中（isSold = false）のとき null（SPEC §1）
// - 日付は「端末ローカル時刻の ISO 8601 文字列」(YYYY-MM-DDTHH:mm:ss.SSS、タイムゾーン記号なし) で保存。
//   月次グループ化 (SPEC §6.1「端末ローカルの暦で月初日に正規化」) を SQL の substr(date, 1, 7) で
//   行えるようにするための決定。変換は src/db/dates.ts に集約する。
export const saleRecords = sqliteTable('sale_records', {
  id: text('id').primaryKey(), // UUID
  itemName: text('item_name').notNull().default(''),
  salesPrice: real('sales_price').notNull().default(0),
  purchasePrice: real('purchase_price').notNull().default(0),
  postage: real('postage').notNull().default(0),
  envelopeCost: real('envelope_cost').notNull().default(0),
  othersCost: real('others_cost').notNull().default(0),
  commission: real('commission').notNull().default(0), // 手数料「率」(%). 10 = 10%
  isSold: integer('is_sold', { mode: 'boolean' }).notNull().default(false),
  saleStartDate: text('sale_start_date').notNull(), // 出品日（必須）
  saleDate: text('sale_date'), // 販売日（出品中は null）
  memo: text('memo').notNull().default(''),
  // レコード種別（SPEC-V2 §1.1 / §2.1）。'used' = 不用品 / 'sourced' = 仕入品。
  // NOT NULL にして「種別なし」の第 3 状態を作らない。DEFAULT は 0001 の列追加で
  // 既存行を埋めるために必要で、アプリ側は常に明示指定する（SPEC-V2 §2.1）。
  // 不用品は purchasePrice = 0 が repository の toRow で保証される（SPEC-V2 §2.4）。
  kind: text('kind', { enum: ['used', 'sourced'] }).notNull().default('used'),
}, (table) => [
  // 一覧・集計は常に isSold で絞り、基準日 (売却済み=saleDate / 出品中=saleStartDate) で並べる
  index('idx_sale_records_sold_sale_date').on(table.isSold, table.saleDate),
  index('idx_sale_records_sold_start_date').on(table.isSold, table.saleStartDate),
]);

export type SaleRecord = typeof saleRecords.$inferSelect;
export type NewSaleRecord = typeof saleRecords.$inferInsert;

/**
 * レコード種別（SPEC-V2 §1.1）。boolean ではなく文字列 enum にしてあるのは、
 * DB を直接見たときに意味が読めることと、将来値を増やすときに列追加が要らないため。
 * kind 列の定義から導出しているので、schema と型が食い違うことはない。
 */
export type RecordKind = SaleRecord['kind'];
