CREATE TABLE `outreach_campaigns` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`test_mode` integer DEFAULT 1 NOT NULL,
	`total` integer DEFAULT 0 NOT NULL,
	`created_by` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`finished_at` integer
);
--> statement-breakpoint
CREATE TABLE `outreach_contacts` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`email` text NOT NULL,
	`kind` text DEFAULT 'unknown' NOT NULL,
	`source_type` text NOT NULL,
	`source_url` text,
	`domain_matches` integer DEFAULT 0 NOT NULL,
	`mx_ok` integer,
	`verification` text DEFAULT 'unverified' NOT NULL,
	`is_primary` integer DEFAULT 0 NOT NULL,
	`note` text,
	`found_at` integer DEFAULT (unixepoch()) NOT NULL,
	`checked_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `outreach_orgs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `outreach_contacts_org_email_unq` ON `outreach_contacts` (`org_id`,`email`);--> statement-breakpoint
CREATE INDEX `outreach_contacts_email_idx` ON `outreach_contacts` (`email`);--> statement-breakpoint
CREATE TABLE `outreach_events` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`message_id` text,
	`kind` text NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`created_by` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `outreach_orgs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`message_id`) REFERENCES `outreach_messages`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `outreach_events_org_idx` ON `outreach_events` (`org_id`);--> statement-breakpoint
CREATE TABLE `outreach_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`contact_id` text,
	`campaign_id` text,
	`to_email` text NOT NULL,
	`subject` text NOT NULL,
	`body_text` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`test_mode` integer DEFAULT 0 NOT NULL,
	`approved_by` text,
	`approved_at` integer,
	`approved_hash` text,
	`queued_at` integer,
	`sent_at` integer,
	`attempts` integer DEFAULT 0 NOT NULL,
	`provider_message_id` text,
	`provider_result` text,
	`error` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `outreach_orgs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`contact_id`) REFERENCES `outreach_contacts`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`campaign_id`) REFERENCES `outreach_campaigns`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `outreach_messages_org_idx` ON `outreach_messages` (`org_id`);--> statement-breakpoint
CREATE INDEX `outreach_messages_status_idx` ON `outreach_messages` (`status`);--> statement-breakpoint
CREATE INDEX `outreach_messages_campaign_idx` ON `outreach_messages` (`campaign_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `outreach_messages_one_per_contact` ON `outreach_messages` (`contact_id`,`test_mode`) WHERE status != 'cancelled' AND status != 'failed' AND contact_id IS NOT NULL;--> statement-breakpoint
CREATE TABLE `outreach_org_activities` (
	`org_id` text NOT NULL,
	`activity_id` text NOT NULL,
	PRIMARY KEY(`org_id`, `activity_id`),
	FOREIGN KEY (`org_id`) REFERENCES `outreach_orgs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`activity_id`) REFERENCES `activities`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `outreach_org_activities_activity_idx` ON `outreach_org_activities` (`activity_id`);--> statement-breakpoint
CREATE TABLE `outreach_orgs` (
	`id` text PRIMARY KEY NOT NULL,
	`domain` text NOT NULL,
	`name` text NOT NULL,
	`website_url` text NOT NULL,
	`activity_count` integer DEFAULT 0 NOT NULL,
	`discovery_status` text DEFAULT 'pending' NOT NULL,
	`discovery_note` text,
	`discovered_at` integer,
	`excluded` integer DEFAULT 0 NOT NULL,
	`excluded_reason` text,
	`review_flag` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `outreach_orgs_domain_unq` ON `outreach_orgs` (`domain`);--> statement-breakpoint
CREATE INDEX `outreach_orgs_discovery_idx` ON `outreach_orgs` (`discovery_status`);--> statement-breakpoint
CREATE INDEX `outreach_orgs_excluded_idx` ON `outreach_orgs` (`excluded`);--> statement-breakpoint
CREATE TABLE `outreach_suppressions` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`value` text NOT NULL,
	`reason` text NOT NULL,
	`note` text,
	`created_by` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `outreach_suppressions_unq` ON `outreach_suppressions` (`kind`,`value`);