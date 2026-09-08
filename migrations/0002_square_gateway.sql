CREATE TABLE `credential_access_log` (
	`id` text PRIMARY KEY NOT NULL,
	`credential_id` text NOT NULL,
	`actor_id` text,
	`action` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `credential_access_log_cred_idx` ON `credential_access_log` (`credential_id`);--> statement-breakpoint
CREATE INDEX `credential_access_log_created_idx` ON `credential_access_log` (`created_at`);--> statement-breakpoint
CREATE TABLE `credentials` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`provider` text,
	`category` text DEFAULT 'other' NOT NULL,
	`username` text,
	`email` text,
	`url` text,
	`notes` text DEFAULT '' NOT NULL,
	`secret_enc` text NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`owner_id` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	`last_accessed_at` integer,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `credentials_category_idx` ON `credentials` (`category`);--> statement-breakpoint
CREATE TABLE `provider_communications` (
	`id` text PRIMARY KEY NOT NULL,
	`provider_id` text NOT NULL,
	`contact_id` text,
	`kind` text DEFAULT 'note' NOT NULL,
	`occurred_at` integer DEFAULT (unixepoch()) NOT NULL,
	`subject` text DEFAULT '' NOT NULL,
	`status` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_by` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`provider_id`) REFERENCES `providers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`contact_id`) REFERENCES `provider_contacts`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `provider_comms_provider_idx` ON `provider_communications` (`provider_id`);--> statement-breakpoint
CREATE TABLE `provider_contacts` (
	`id` text PRIMARY KEY NOT NULL,
	`provider_id` text NOT NULL,
	`business_name` text,
	`email` text,
	`phone` text,
	`website` text,
	`contact_page` text,
	`address` text,
	`contact_person` text,
	`role` text,
	`preferred_method` text,
	`notes` text DEFAULT '' NOT NULL,
	`next_follow_up_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`provider_id`) REFERENCES `providers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `provider_contacts_provider_idx` ON `provider_contacts` (`provider_id`);--> statement-breakpoint
ALTER TABLE `providers` ADD `crm_status` text DEFAULT 'not_contacted' NOT NULL;