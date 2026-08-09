ALTER TABLE `sale_records` ADD `kind` text DEFAULT 'used' NOT NULL;
--> statement-breakpoint
-- 以下は drizzle-kit の生成物ではなく手で追記したバックフィル（SPEC-V2 §2.2）。
-- 不用品は定義上 purchasePrice = 0 なので、値が入っている行は仕入品と見なす。
-- 誤判定は「仕入れたが仕入価格 0」の行だけで、その場合も表示ラベルが変わるのみ（金額は変わらない）。
UPDATE `sale_records` SET `kind` = 'sourced' WHERE `purchase_price` > 0;
