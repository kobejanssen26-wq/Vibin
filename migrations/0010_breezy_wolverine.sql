ALTER TABLE `activities` ADD `short_description` text;--> statement-breakpoint
ALTER TABLE `activities` ADD `full_description` text;--> statement-breakpoint
ALTER TABLE `activities` ADD `description_source` text;--> statement-breakpoint
ALTER TABLE `activities` ADD `description_checked_at` integer;--> statement-breakpoint
ALTER TABLE `activities` ADD `price_min_cents` integer;--> statement-breakpoint
ALTER TABLE `activities` ADD `price_max_cents` integer;--> statement-breakpoint
ALTER TABLE `activities` ADD `price_unit_note` text;--> statement-breakpoint
ALTER TABLE `activities` ADD `price_confidence` text;--> statement-breakpoint
ALTER TABLE `activities` ADD `price_source_url` text;--> statement-breakpoint
ALTER TABLE `activities` ADD `price_checked_at` integer;--> statement-breakpoint
ALTER TABLE `activities` ADD `image_quality_score` integer;--> statement-breakpoint
ALTER TABLE `activities` ADD `needs_review_fields` text DEFAULT '[]' NOT NULL;