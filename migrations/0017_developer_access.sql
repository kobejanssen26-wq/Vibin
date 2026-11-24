CREATE TABLE `developer_access` (
	`user_id` text PRIMARY KEY NOT NULL,
	`permissions` text DEFAULT '[]' NOT NULL,
	`invited_by` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `developer_invites` (
	`id` text PRIMARY KEY NOT NULL,
	`email_normalized` text NOT NULL,
	`token_hash` text NOT NULL,
	`permissions` text DEFAULT '[]' NOT NULL,
	`invited_by` text NOT NULL,
	`expires_at` integer NOT NULL,
	`accepted_at` integer,
	`revoked_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `developer_invites_token_unq` ON `developer_invites` (`token_hash`);--> statement-breakpoint
CREATE INDEX `developer_invites_email_idx` ON `developer_invites` (`email_normalized`);