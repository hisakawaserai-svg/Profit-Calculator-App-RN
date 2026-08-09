CREATE TABLE `sale_records` (
	`id` text PRIMARY KEY NOT NULL,
	`item_name` text DEFAULT '' NOT NULL,
	`sales_price` real DEFAULT 0 NOT NULL,
	`purchase_price` real DEFAULT 0 NOT NULL,
	`postage` real DEFAULT 0 NOT NULL,
	`envelope_cost` real DEFAULT 0 NOT NULL,
	`others_cost` real DEFAULT 0 NOT NULL,
	`commission` real DEFAULT 0 NOT NULL,
	`is_sold` integer DEFAULT false NOT NULL,
	`sale_start_date` text NOT NULL,
	`sale_date` text,
	`memo` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_sale_records_sold_sale_date` ON `sale_records` (`is_sold`,`sale_date`);--> statement-breakpoint
CREATE INDEX `idx_sale_records_sold_start_date` ON `sale_records` (`is_sold`,`sale_start_date`);