ALTER TABLE `activities` ADD `monetization_type` text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE `activities` ADD `affiliate_url` text;--> statement-breakpoint
ALTER TABLE `activities` ADD `affiliate_network` text;--> statement-breakpoint
ALTER TABLE `activities` ADD `affiliate_partner_id` text;--> statement-breakpoint
ALTER TABLE `activities` ADD `commission_type` text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE `activities` ADD `commission_rate` real;--> statement-breakpoint
ALTER TABLE `activities` ADD `commission_currency` text;--> statement-breakpoint
ALTER TABLE `activities` ADD `commission_status` text DEFAULT 'none' NOT NULL;--> statement-breakpoint
CREATE INDEX `activities_monetization_idx` ON `activities` (`monetization_type`);