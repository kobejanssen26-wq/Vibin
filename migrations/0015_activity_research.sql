CREATE TABLE `activity_contact_links` (
	`activity_id` text NOT NULL,
	`contact_id` text NOT NULL,
	`scope` text DEFAULT 'organisation' NOT NULL,
	`status` text DEFAULT 'unverified' NOT NULL,
	`link_source` text DEFAULT 'domain' NOT NULL,
	`evidence_url` text,
	`note` text,
	`checked_at` integer,
	PRIMARY KEY(`activity_id`, `contact_id`),
	FOREIGN KEY (`activity_id`) REFERENCES `activities`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`contact_id`) REFERENCES `outreach_contacts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `activity_contact_links_contact_idx` ON `activity_contact_links` (`contact_id`);--> statement-breakpoint
CREATE TABLE `activity_research` (
	`activity_id` text PRIMARY KEY NOT NULL,
	`verdict` text NOT NULL,
	`existence` text DEFAULT 'unknown' NOT NULL,
	`suitability` text DEFAULT 'unclear' NOT NULL,
	`method` text NOT NULL,
	`evidence` text DEFAULT '[]' NOT NULL,
	`sources` text DEFAULT '[]' NOT NULL,
	`corrections` text DEFAULT '[]' NOT NULL,
	`corrections_applied` integer DEFAULT 0 NOT NULL,
	`duplicate_of` text,
	`note` text DEFAULT '' NOT NULL,
	`run_id` text,
	`researched_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`activity_id`) REFERENCES `activities`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `activity_research_verdict_idx` ON `activity_research` (`verdict`);--> statement-breakpoint
CREATE INDEX `activity_research_method_idx` ON `activity_research` (`method`);--> statement-breakpoint
ALTER TABLE `outreach_contacts` ADD `evidence_status` text DEFAULT 'unverified' NOT NULL;--> statement-breakpoint
ALTER TABLE `outreach_contacts` ADD `evidence_url` text;--> statement-breakpoint
ALTER TABLE `outreach_contacts` ADD `evidence_note` text;--> statement-breakpoint
ALTER TABLE `outreach_contacts` ADD `evidence_checked_at` integer;