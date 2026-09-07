CREATE TABLE `activities` (
	`id` text PRIMARY KEY NOT NULL,
	`provider_id` text NOT NULL,
	`external_id` text,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`category_id` text NOT NULL,
	`subcategory` text,
	`provider` text,
	`provider_website` text,
	`location_label` text NOT NULL,
	`address` text,
	`city` text,
	`country` text DEFAULT 'BE' NOT NULL,
	`lat` integer,
	`lng` integer,
	`price_cents` integer,
	`price_type` text DEFAULT 'per_person' NOT NULL,
	`price_band` text NOT NULL,
	`currency` text DEFAULT 'EUR' NOT NULL,
	`duration_min` integer,
	`min_participants` integer,
	`max_participants` integer,
	`min_age` integer,
	`indoor_outdoor` text,
	`accessibility` text,
	`opening_hours` text DEFAULT '{}' NOT NULL,
	`website_url` text,
	`booking_url` text,
	`ticket_url` text,
	`image_url` text,
	`image_source` text,
	`image_attribution` text,
	`tags` text DEFAULT '[]' NOT NULL,
	`source` text DEFAULT 'seed' NOT NULL,
	`source_url` text,
	`last_verified_at` integer,
	`status` text DEFAULT 'needs_review' NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`provider_id`) REFERENCES `providers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `activity_categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `activities_category_idx` ON `activities` (`category_id`);--> statement-breakpoint
CREATE INDEX `activities_active_idx` ON `activities` (`active`);--> statement-breakpoint
CREATE INDEX `activities_status_idx` ON `activities` (`status`);--> statement-breakpoint
CREATE INDEX `activities_city_idx` ON `activities` (`city`);--> statement-breakpoint
CREATE UNIQUE INDEX `activities_provider_external_unq` ON `activities` (`provider_id`,`external_id`);--> statement-breakpoint
CREATE TABLE `activity_categories` (
	`id` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`icon` text DEFAULT '✨' NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `activity_images` (
	`id` text PRIMARY KEY NOT NULL,
	`activity_id` text NOT NULL,
	`url` text NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`activity_id`) REFERENCES `activities`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `activity_images_activity_idx` ON `activity_images` (`activity_id`);--> statement-breakpoint
CREATE TABLE `activity_votes` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`activity_id` text NOT NULL,
	`user_id` text NOT NULL,
	`value` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`activity_id`) REFERENCES `activities`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `activity_votes_group_activity_user_unq` ON `activity_votes` (`group_id`,`activity_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `activity_votes_group_activity_idx` ON `activity_votes` (`group_id`,`activity_id`);--> statement-breakpoint
CREATE TABLE `date_options` (
	`id` text PRIMARY KEY NOT NULL,
	`match_id` text NOT NULL,
	`group_id` text NOT NULL,
	`starts_at` integer NOT NULL,
	`label` text NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`match_id`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `date_options_match_idx` ON `date_options` (`match_id`);--> statement-breakpoint
CREATE TABLE `date_votes` (
	`id` text PRIMARY KEY NOT NULL,
	`date_option_id` text NOT NULL,
	`match_id` text NOT NULL,
	`user_id` text NOT NULL,
	`value` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`date_option_id`) REFERENCES `date_options`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`match_id`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `date_votes_option_user_unq` ON `date_votes` (`date_option_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `date_votes_match_idx` ON `date_votes` (`match_id`);--> statement-breakpoint
CREATE TABLE `email_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `email_tokens_hash_idx` ON `email_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `email_tokens_user_idx` ON `email_tokens` (`user_id`);--> statement-breakpoint
CREATE TABLE `group_activity_pool` (
	`group_id` text NOT NULL,
	`activity_id` text NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	`added_at` integer DEFAULT (unixepoch()) NOT NULL,
	PRIMARY KEY(`group_id`, `activity_id`),
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`activity_id`) REFERENCES `activities`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `group_activity_pool_sort_idx` ON `group_activity_pool` (`group_id`,`sort`);--> statement-breakpoint
CREATE TABLE `group_invites` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`code` text NOT NULL,
	`created_by` text NOT NULL,
	`max_uses` integer,
	`uses` integer DEFAULT 0 NOT NULL,
	`expires_at` integer,
	`revoked_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `group_invites_code_unq` ON `group_invites` (`code`);--> statement-breakpoint
CREATE INDEX `group_invites_group_idx` ON `group_invites` (`group_id`);--> statement-breakpoint
CREATE TABLE `group_members` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`joined_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `group_members_group_user_unq` ON `group_members` (`group_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `group_members_group_idx` ON `group_members` (`group_id`);--> statement-breakpoint
CREATE INDEX `group_members_user_idx` ON `group_members` (`user_id`);--> statement-breakpoint
CREATE TABLE `group_settings` (
	`group_id` text PRIMARY KEY NOT NULL,
	`categories` text DEFAULT '[]' NOT NULL,
	`all_activities` integer DEFAULT 0 NOT NULL,
	`location_label` text,
	`lat` integer,
	`lng` integer,
	`radius_km` integer DEFAULT 25 NOT NULL,
	`budget_band` text DEFAULT 'any' NOT NULL,
	`date_mode` text DEFAULT 'unknown' NOT NULL,
	`date_specific` integer,
	`time_band` text DEFAULT 'unknown' NOT NULL,
	`time_specific` text,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `groups` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`creator_id` text NOT NULL,
	`status` text DEFAULT 'configuring' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`creator_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `groups_creator_idx` ON `groups` (`creator_id`);--> statement-breakpoint
CREATE TABLE `matches` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`activity_id` text NOT NULL,
	`status` text DEFAULT 'activity_matched' NOT NULL,
	`chosen_date_option_id` text,
	`starts_at` integer,
	`matched_at` integer DEFAULT (unixepoch()) NOT NULL,
	`completed_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`activity_id`) REFERENCES `activities`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `matches_group_idx` ON `matches` (`group_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `matches_group_activity_unq` ON `matches` (`group_id`,`activity_id`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`user_id` text,
	`kind` text DEFAULT 'text' NOT NULL,
	`body` text NOT NULL,
	`meta` text DEFAULT '{}' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `messages_group_created_idx` ON `messages` (`group_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `notification_prefs` (
	`user_id` text PRIMARY KEY NOT NULL,
	`channels` text DEFAULT '{}' NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`data` text DEFAULT '{}' NOT NULL,
	`read_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `notifications_user_created_idx` ON `notifications` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `plans` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`match_id` text NOT NULL,
	`activity_id` text NOT NULL,
	`starts_at` integer,
	`location_label` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`match_id`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`activity_id`) REFERENCES `activities`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `plans_group_idx` ON `plans` (`group_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `plans_match_unq` ON `plans` (`match_id`);--> statement-breakpoint
CREATE TABLE `profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`avatar_key` text,
	`age` integer,
	`location_label` text,
	`bio` text,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `providers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`kind` text DEFAULT 'seed' NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL,
	`config` text DEFAULT '{}' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `reports` (
	`id` text PRIMARY KEY NOT NULL,
	`reporter_id` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`reason` text NOT NULL,
	`detail` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`resolver_id` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`resolved_at` integer,
	FOREIGN KEY (`reporter_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`resolver_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `reports_status_idx` ON `reports` (`status`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`email_normalized` text NOT NULL,
	`password_hash` text NOT NULL,
	`email_verified_at` integer,
	`role` text DEFAULT 'user' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_normalized_unq` ON `users` (`email_normalized`);