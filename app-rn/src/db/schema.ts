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
  // 販売サイト名の「写し」（SPEC-V3 §1.5.1 / 決定 §8-1）。プリセットの id は持たない ──
  // 参照ではなく「そのとき何と書いてあったか」なので、プリセットを直しても過去の記録は動かない。
  // 空文字 = 未設定（NULL は使わない。既存列と同じ方針）。計算式にも buildWhere にも入らない。
  siteName: text('site_name').notNull().default(''),
}, (table) => [
  // 一覧・集計は常に isSold で絞り、基準日 (売却済み=saleDate / 出品中=saleStartDate) で並べる
  index('idx_sale_records_sold_sale_date').on(table.isSold, table.saleDate),
  index('idx_sale_records_sold_start_date').on(table.isSold, table.saleStartDate),
]);

export type SaleRecord = typeof saleRecords.$inferSelect;
export type NewSaleRecord = typeof saleRecords.$inferInsert;

// SPEC-V3 §1.6 のプリセット。販売サイト / 送料 / 梱包材は「名前・色・頭文字・数値」を持つ点で
// 構造が同じなので、1 テーブルに type 列で 3 種を同居させる（§1.1）。
// - value は 1 列で兼用。単位は type が決める（site = 手数料率 %, それ以外 = 円。§2.1）
// - 記録はプリセットの id を参照しない（§1.5）ので、削除は物理削除でよい
// - colorKey に drizzle の enum 指定は付けない。色を 1 つ足すたびにマイグレーションが要るのは重く、
//   値の妥当性は読み出し時に normalizePresetColor() で担保する（§1.6）
export const presets = sqliteTable('presets', {
  id: text('id').primaryKey(), // UUID。初期値だけは内容が読める固定 ID（§2.4）
  type: text('type', { enum: ['site', 'shipping', 'packaging'] }).notNull(),
  name: text('name').notNull(),
  colorKey: text('color_key').notNull(), // PresetColorKey（§1.3）
  initial: text('initial').notNull().default(''), // 空 = name から導出（§1.2）
  value: real('value').notNull().default(0), // site = %, それ以外 = 円
  // SPEC-V3 §2.6。梱包材のまとめ買い（「100 枚で 800 円」）の材料。
  // value（1 個あたり）が唯一の真実で、この 2 列はそれを作り直すための控え。
  packQuantity: integer('pack_quantity').notNull().default(0), // 入数。0 = 1 個ずつ（未設定）
  packPrice: real('pack_price').notNull().default(0), // 購入価格（円）
  sortOrder: integer('sort_order').notNull().default(0),
}, (table) => [
  // 全アクセスが「ある種類を並び順で全件」なので、この 1 本で足りる（§1.6）
  index('idx_presets_type_order').on(table.type, table.sortOrder),
]);

export type Preset = typeof presets.$inferSelect;
export type NewPreset = typeof presets.$inferInsert;

/**
 * プリセットの種類（SPEC-V3 §1.1）。RecordKind と同じく文字列 enum。
 * type 列の定義から導出しているので、schema と型が食い違うことはない。
 */
export type PresetType = Preset['type'];

/**
 * レコード種別（SPEC-V2 §1.1）。boolean ではなく文字列 enum にしてあるのは、
 * DB を直接見たときに意味が読めることと、将来値を増やすときに列追加が要らないため。
 * kind 列の定義から導出しているので、schema と型が食い違うことはない。
 */
export type RecordKind = SaleRecord['kind'];
