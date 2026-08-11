CREATE TABLE `record_tags` (
	`record_id` text NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY(`record_id`, `tag_id`),
	FOREIGN KEY (`record_id`) REFERENCES `sale_records`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_record_tags_tag` ON `record_tags` (`tag_id`);--> statement-breakpoint
CREATE TABLE `tags` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`color_key` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_tags_order` ON `tags` (`sort_order`);