ALTER TABLE `presets` ADD `material_cost` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `sale_records` ADD `shipping_material_cost` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `sale_records` ADD `excludes_shipping_material` integer DEFAULT false NOT NULL;