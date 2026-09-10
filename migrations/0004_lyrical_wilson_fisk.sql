CREATE TABLE `event_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`kind` text DEFAULT 'manual' NOT NULL,
	`enabled` integer DEFAULT 0 NOT NULL,
	`trust` text DEFAULT 'third_party' NOT NULL,
	`config` text DEFAULT '{}' NOT NULL,
	`sync_every_min` integer DEFAULT 720 NOT NULL,
	`last_run_at` integer,
	`next_run_at` integer,
	`last_result` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `event_sources_enabled_idx` ON `event_sources` (`enabled`);--> statement-breakpoint
CREATE INDEX `event_sources_next_run_idx` ON `event_sources` (`next_run_at`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text,
	`external_id` text,
	`dedupe_hash` text NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`category_id` text,
	`kind` text DEFAULT 'other' NOT NULL,
	`subcategory` text,
	`venue_name` text,
	`address` text,
	`city` text,
	`country` text DEFAULT 'BE' NOT NULL,
	`lat` integer,
	`lng` integer,
	`starts_at` integer NOT NULL,
	`ends_at` integer,
	`all_day` integer DEFAULT 0 NOT NULL,
	`timezone` text DEFAULT 'Europe/Brussels' NOT NULL,
	`status` text DEFAULT 'upcoming' NOT NULL,
	`price_type` text DEFAULT 'unknown' NOT NULL,
	`price_min_cents` integer,
	`price_max_cents` integer,
	`currency` text DEFAULT 'EUR' NOT NULL,
	`url` text,
	`ticket_url` text,
	`image_url` text,
	`image_source` text,
	`image_attribution` text,
	`tags` text DEFAULT '[]' NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`source_url` text,
	`verification_status` text DEFAULT 'needs_review' NOT NULL,
	`locked_fields` text DEFAULT '[]' NOT NULL,
	`last_synced_at` integer,
	`next_sync_at` integer,
	`active` integer DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `event_sources`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`category_id`) REFERENCES `activity_categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `events_starts_at_idx` ON `events` (`starts_at`);--> statement-breakpoint
CREATE INDEX `events_status_idx` ON `events` (`status`);--> statement-breakpoint
CREATE INDEX `events_city_idx` ON `events` (`city`);--> statement-breakpoint
CREATE INDEX `events_kind_idx` ON `events` (`kind`);--> statement-breakpoint
CREATE INDEX `events_active_idx` ON `events` (`active`);--> statement-breakpoint
CREATE INDEX `events_dedupe_idx` ON `events` (`dedupe_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `events_source_external_unq` ON `events` (`source_id`,`external_id`);