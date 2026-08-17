import { index, integer, primaryKey, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

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
  // 商品写真（SPEC-V5 §1）。**画像そのものは入れず、ファイル名だけを持つ**（§1.2）──
  // BLOB で持つと DB が肥大し、一覧のクエリまで重くなる。実体はドキュメントディレクトリ配下の
  // photos/ に置き、この列はその中のファイル名（"<uuid>.jpg"）。パスを持たないのは、
  // アプリのサンドボックスの絶対パスが再インストールや OS 更新で変わり得るため（§1.3）。
  //
  // **この列だけ NULL 許容**（他の列は空文字・0 で「未設定」を表す）。写真は
  // 「無い」と「空の写真」の区別が意味を持たないので、値が無いことを NULL で表す方が素直で、
  // 既存行を書き換えないマイグレーション（0005 の ADD COLUMN のみ・バックフィルなし）に
  // そのまま乗る（§2.1）。CSV には出さない（§5）。
  photoFileName: text('photo_file_name'),
  /**
   * 送料プリセットに付いていた専用資材の代金の「控え」（SPEC-V6 §1）。
   *
   * **postage はこれまでどおり「支払う送料の総額」で、資材費はそこに含まれる。**
   * この列は金額の計算には一切入らない（profit.ts も CSV も postage しか見ない）──
   * 入っているのは「選んだときの資材費がいくらだったか」だけで、
   * 「専用資材を使わない」トグルを押し戻せるようにするための記憶。
   *
   * 記録はプリセットを id で参照しない（SPEC-V3 §1.5）ので、プリセット側を見に行っても
   * 選んだ当時の資材費は分からない（あとから直っているかもしれない）。だから記録が持つ。
   * 0 = 資材費のないプリセットか、プリセットを使わず手で入れた記録（＝トグルを出さない）。
   */
  shippingMaterialCost: real('shipping_material_cost').notNull().default(0),
  /**
   * 「専用資材を使わない」（SPEC-V6 §3）。true = postage に資材費を含めていない。
   *
   * postage から逆算しない ── 選んだあとに送料を手で直せるので、
   * 「postage が資材費ぶん少ないか」では区別が付かない。押した状態そのものを持つ。
   */
  excludesShippingMaterial: integer('excludes_shipping_material', { mode: 'boolean' })
    .notNull()
    .default(false),
  /**
   * 目標利益（SPEC-V9 §1）。**null = 「目標を決めていない」。**
   *
   * **0 を「決めていない」の代わりに使わない。** 0 は「目標は 0 円（＝赤字にならなければよい）」
   * という立派な目標で、決めていない状態とは別のもの ── 値下げ可能額を出すときに
   * 「あと 300 円下げられる」と「そもそも下げ幅を言えない」を取り違えると、
   * 決めていない人に根拠のない下げ幅を見せることになる。
   * だから photo_file_name と同じく**この列も NULL 許容**で、他の金額列
   * （NOT NULL DEFAULT 0）の方針には乗せない。
   *
   * **整数**（real ではない）── 目標は人が決める切りのいい額で、
   * 端数を持つ意味がない。計算に入るのは「この額に届く最低販売価格」の右辺だけ。
   *
   * **アプリ全体の既定値は持たない**（設定タブに欄を作らない）。新規の記録は常に null で始まる。
   */
  targetProfit: integer('target_profit'),
  /**
   * 出品日（SPEC-V9 §1）。**列だけ確保してある。今回は読み書きしない。**
   *
   * sale_start_date が既に「出品日」の役割を持っているが、そちらは記録を作った日で
   * 埋まることが多い ── 将来「実際に出品した日」を別に持てるようにするための場所。
   * ALTER TABLE を 1 回で済ませられるうちに足しておくためだけの列なので、
   * **UI も計算式も CSV の読み書き以外の経路も無い**（バックアップの往復だけは通す）。
   */
  listedAt: text('listed_at'),
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
  // バッジの色（SPEC-V7 §2.1）。**hex（`#RRGGBB`）**。0007 でキーから移した。
  // 固定色かどうかは値そのもので決まるので、列は 1 本のまま自由色も収まる
  colorKey: text('color_key').notNull(),
  initial: text('initial').notNull().default(''), // 空 = name から導出（§1.2）
  value: real('value').notNull().default(0), // site = %, それ以外 = 円
  /**
   * 単価の計算方式（SPEC-V10 §1）。**梱包材だけが 3 通りを持つ**（他の 2 種は常に 'individual'）。
   *
   * - `individual` … 購入価格 ÷ 購入数量 → 1 個あたり（§2.6 の既存方式。**既定値**）
   * - `area`       … 購入価格 ÷ 購入面積 → ¥/㎡。平均使用サイズがあれば 1 回あたりまで
   * - `usage`      … 購入価格 ÷ 想定使用回数 → 1 回あたり
   *
   * **DEFAULT 'individual' が「既存データの互換」そのもの**（0010 の ADD COLUMN）──
   * 既に登録されている梱包材はすべて個数方式の行で、列が増えても読み方が変わらない。
   * colorKey と同じく drizzle の enum は付けず、読み出し側（logic/preset.presetCalcMethod）で
   * 知らない値を 'individual' へ倒す。
   */
  calcMethod: text('calc_method').notNull().default('individual'),
  // SPEC-V3 §2.6。梱包材のまとめ買い（「100 枚で 800 円」）の材料。
  // value（1 個あたり）が唯一の真実で、この 2 列はそれを作り直すための控え。
  //
  // **pack_quantity は「購入価格を割る数」**（SPEC-V10 §1.2）── 個数方式では入数、
  // 使用回数方式では想定使用回数が入る。列を分けないのは、どちらも
  // 「この買い物が何回ぶんか」を表す同じ数で、割り算（presetUnitPrice）も同じ 1 本だから。
  // どちらの意味かは calc_method が言う。
  packQuantity: integer('pack_quantity').notNull().default(0), // 入数 / 想定使用回数。0 = 1 個ずつ（未設定）
  packPrice: real('pack_price').notNull().default(0), // 購入価格（円）
  /**
   * 面積方式の購入サイズ（cm。SPEC-V10 §1.2）。0 = 未設定。
   * 縦 × 横 が購入面積で、購入価格をこれで割ると ¥/㎡ になる。
   */
  packHeight: real('pack_height').notNull().default(0),
  packWidth: real('pack_width').notNull().default(0),
  /**
   * 面積方式の平均使用サイズ（cm。SPEC-V10 §1.2）。**任意入力で、0 = 未入力。**
   *
   * 入っていれば ¥/㎡ × 平均使用面積 が 1 回あたりの単価になり、それが value に入る。
   * 未入力なら value は ¥/㎡ のまま（§1.3）── どちらが入っているかは
   * この 2 列を見れば分かるので、value の意味を別の列で持つ必要はない。
   */
  useHeight: real('use_height').notNull().default(0),
  useWidth: real('use_width').notNull().default(0),
  /**
   * 専用資材の代金（SPEC-V6 §1）。**送料プリセットだけが使う**（他の 2 種は常に 0）。
   *
   * 一部の配送方法は専用の箱・封筒を買わないと使えず、その代金は送料とは別にかかる。
   * value（送料そのもの）と分けて持つのは、記録側で「今回は資材を使わない」を
   * 選べるようにするため ── 合算して 1 つの値で持つと、あとから引き算できない。
   *
   * **まとめ買いの 2 列（packQuantity / packPrice）は、送料プリセットではこの列の材料になる。**
   * 列を増やさないのは、送料の value が「1 回いくら」でまとめ買いの概念を持たないため
   * （梱包材では value の材料、送料では materialCost の材料。isPackBuyDraft が種類で振り分ける）。
   */
  materialCost: real('material_cost').notNull().default(0),
  sortOrder: integer('sort_order').notNull().default(0),
}, (table) => [
  // 全アクセスが「ある種類を並び順で全件」なので、この 1 本で足りる（§1.6）
  index('idx_presets_type_order').on(table.type, table.sortOrder),
]);

export type Preset = typeof presets.$inferSelect;
export type NewPreset = typeof presets.$inferInsert;

// SPEC-V4 §1.6 のタグ。プリセット（presets）には同居させない（§1.1）──
// タグは中間テーブルから**参照される側**で、削除の作法が根本的に違うため。
// - 初期値（seed）は投入しない。0 件から始める（§1.2 / 決定 §9-7）
// - 数値も頭文字も持たない。名前そのものを読ませるチップとして出る（§0.1）
// - colorKey に drizzle の enum を付けないのは presets と同じ理由（読み出し時に
//   normalizePresetColor() で正規化する。§1.3）
export const tags = sqliteTable('tags', {
  id: text('id').primaryKey(), // UUID（seed がないので固定 ID は不要）
  name: text('name').notNull(),
  // バッジの色（SPEC-V7 §2.1）。**hex（`#RRGGBB`）**。0008 でキーから移した。
  // パレットはプリセットと共有（§1.1）で、自由色も同じ列に収まる
  colorKey: text('color_key').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
}, (table) => [
  // 全アクセスが「全件を並び順で」なので、この 1 本で足りる（§1.5）
  index('idx_tags_order').on(table.sortOrder),
]);

export type Tag = typeof tags.$inferSelect;
export type NewTag = typeof tags.$inferInsert;

// 記録とタグの多対多（SPEC-V4 §1.6）。関係だけを持ち、付けた日時などの列は足さない。
//
// **references() は意図の表明で、削除の保証は repository 側が持つ**（§1.4）──
// SQLite の外部キーは接続ごとに PRAGMA foreign_keys = ON が要り、既定は OFF。
// 「有効になっているつもり」で孤児行が残ると、絞り込みの件数が静かに狂う。
export const recordTags = sqliteTable('record_tags', {
  recordId: text('record_id').notNull().references(() => saleRecords.id),
  tagId: text('tag_id').notNull().references(() => tags.id),
}, (table) => [
  // 複合 PK。「同じタグを二重に付ける」が DB の側で起きなくなり、
  // record_id 先頭のインデックス（記録 → タグ）も自動で手に入る
  primaryKey({ columns: [table.recordId, table.tagId] }),
  // 絞り込み（§4）と使用件数（§3.3）は「タグ → 記録」の向きに引く。
  // 複合 PK は record_id が先頭なのでこの向きには効かない
  index('idx_record_tags_tag').on(table.tagId),
]);

export type RecordTag = typeof recordTags.$inferSelect;

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
