CREATE TABLE `outreach_message_activities` (
	`message_id` text NOT NULL,
	`activity_id` text NOT NULL,
	`title` text NOT NULL,
	PRIMARY KEY(`message_id`, `activity_id`),
	FOREIGN KEY (`message_id`) REFERENCES `outreach_messages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `outreach_message_activities_activity_idx` ON `outreach_message_activities` (`activity_id`);--> statement-breakpoint
ALTER TABLE `outreach_contacts` ADD `role` text DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE `outreach_contacts` ADD `activity_id` text;--> statement-breakpoint
ALTER TABLE `outreach_org_activities` ADD `confidence` text DEFAULT 'high' NOT NULL;--> statement-breakpoint
ALTER TABLE `outreach_org_activities` ADD `source` text DEFAULT 'domain' NOT NULL;--> statement-breakpoint
ALTER TABLE `outreach_org_activities` ADD `included` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `outreach_orgs` ADD `group_confidence` text DEFAULT 'unchecked' NOT NULL;--> statement-breakpoint
ALTER TABLE `outreach_orgs` ADD `group_source` text;--> statement-breakpoint
ALTER TABLE `outreach_orgs` ADD `group_note` text;--> statement-breakpoint
ALTER TABLE `outreach_orgs` ADD `group_confirmed` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- An organisation with at most one activity needs no grouping decision.
UPDATE `outreach_orgs` SET `group_confidence` = 'high', `group_source` = 'single' WHERE `activity_count` <= 1;
