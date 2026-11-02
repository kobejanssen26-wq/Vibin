CREATE TABLE `owner_activity_decisions` (
	`activity_id` text PRIMARY KEY NOT NULL,
	`decision` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`prev_active` integer,
	`prev_status` text,
	`title_key` text,
	`url_key` text,
	`reresearch` integer DEFAULT 0 NOT NULL,
	`note` text,
	`decided_by` text,
	`decided_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `owner_activity_decisions_decision_idx` ON `owner_activity_decisions` (`decision`);--> statement-breakpoint
CREATE INDEX `owner_activity_decisions_title_key_idx` ON `owner_activity_decisions` (`title_key`);--> statement-breakpoint
CREATE INDEX `owner_activity_decisions_url_key_idx` ON `owner_activity_decisions` (`url_key`);--> statement-breakpoint
CREATE TABLE `owner_decision_log` (
	`seq` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`activity_id` text NOT NULL,
	`kind` text NOT NULL,
	`from_decision` text,
	`to_decision` text,
	`version` integer NOT NULL,
	`prev_active` integer,
	`prev_status` text,
	`prev_dec_active` integer,
	`prev_dec_status` text,
	`prev_audit` text,
	`undone` integer DEFAULT 0 NOT NULL,
	`note` text,
	`decided_by` text,
	`decided_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `owner_decision_log_activity_idx` ON `owner_decision_log` (`activity_id`,`seq`);