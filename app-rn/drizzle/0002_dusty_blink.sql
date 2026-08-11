CREATE TABLE `presets` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`name` text NOT NULL,
	`color_key` text NOT NULL,
	`initial` text DEFAULT '' NOT NULL,
	`value` real DEFAULT 0 NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_presets_type_order` ON `presets` (`type`,`sort_order`);--> statement-breakpoint
ALTER TABLE `sale_records` ADD `site_name` text DEFAULT '' NOT NULL;--> statement-breakpoint
-- 以下は drizzle-kit の生成物ではなく手で追記した初期値（SPEC-V3 §1.6 / §2）。
-- 「初回起動フラグ」を持たずに 1 回だけ入れるため、マイグレーション SQL に直接書く。
-- id は内容が読める固定 ID（§2.4）── SQL に直接書くので生成器を通せず、テストで名指しできる。
-- sort_order は §2 の表の # をそのまま入れる（10 刻みにしない。手動並べ替えを持たないため。§3.4）。
--
-- 販売サイト（§2.2）: サービス名を持たず「手数料 N%」の形。頭文字は率の数字。
INSERT INTO `presets` (`id`, `type`, `name`, `color_key`, `initial`, `value`, `sort_order`) VALUES
	('seed-site-10', 'site', '手数料 10%', 'red', '10', 10, 1),
	('seed-site-6', 'site', '手数料 6%', 'orange', '6', 6, 2),
	('seed-site-5', 'site', '手数料 5%', 'blue', '5', 5, 3),
	('seed-site-none', 'site', '手数料なし（直接取引）', 'green', '0', 0, 4);--> statement-breakpoint
-- 送料（§2.3）: 配送サービスの商標を使わず、サイズと形状で表す。名前に金額を含めない。
-- 「宅配 100サイズ」だけ頭文字を空にしてある ── 「100」は 3 文字で上限を超え、「10」に縮めると
-- 「60」「80」と混ざるため。空なので name の先頭 1 文字（「宅」）が表示に使われる（§1.2）。
INSERT INTO `presets` (`id`, `type`, `name`, `color_key`, `initial`, `value`, `sort_order`) VALUES
	('seed-shipping-a4-3cm', 'shipping', 'A4・厚さ3cm以内', 'blue', 'A4', 210, 1),
	('seed-shipping-a4-2cm', 'shipping', 'A4・厚さ2cm以内', 'teal', 'A4', 185, 2),
	('seed-shipping-box-s', 'shipping', '専用箱（小）', 'indigo', '小', 450, 3),
	('seed-shipping-60', 'shipping', '宅配 60サイズ', 'green', '60', 750, 4),
	('seed-shipping-80', 'shipping', '宅配 80サイズ', 'orange', '80', 850, 5),
	('seed-shipping-100', 'shipping', '宅配 100サイズ', 'red', '', 1050, 6),
	('seed-shipping-none', 'shipping', '送料込み・手渡し', 'purple', '0', 0, 7);--> statement-breakpoint
-- 梱包材（§2.4）: 1 回の発送で複数使うので、選択は複数選択（§4.3）。個数欄は持たない（決定 §8-11）。
INSERT INTO `presets` (`id`, `type`, `name`, `color_key`, `initial`, `value`, `sort_order`) VALUES
	('seed-packaging-envelope-a4', 'packaging', '封筒（A4）', 'blue', '封', 15, 1),
	('seed-packaging-cushion-envelope', 'packaging', 'クッション封筒', 'teal', 'ク', 40, 2),
	('seed-packaging-poly-bag', 'packaging', '宅配ビニール袋', 'indigo', '袋', 20, 3),
	('seed-packaging-box-s', 'packaging', '段ボール（小）', 'orange', '小', 60, 4),
	('seed-packaging-box-m', 'packaging', '段ボール（中）', 'red', '中', 100, 5),
	('seed-packaging-filler', 'packaging', '緩衝材・テープ', 'green', '緩', 10, 6);