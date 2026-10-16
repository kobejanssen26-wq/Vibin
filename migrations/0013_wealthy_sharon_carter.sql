CREATE TABLE `activity_audits` (
	`activity_id` text PRIMARY KEY NOT NULL,
	`outcome` text NOT NULL,
	`rule` text NOT NULL,
	`reason` text NOT NULL,
	`confidence` text NOT NULL,
	`issues` text DEFAULT '[]' NOT NULL,
	`duplicate_of` text,
	`hidden` integer DEFAULT 0 NOT NULL,
	`previous_active` integer,
	`previous_status` text,
	`source` text DEFAULT 'rules' NOT NULL,
	`decided_by` text,
	`audited_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`activity_id`) REFERENCES `activities`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `activity_audits_outcome_idx` ON `activity_audits` (`outcome`);--> statement-breakpoint
CREATE INDEX `activity_audits_rule_idx` ON `activity_audits` (`rule`);