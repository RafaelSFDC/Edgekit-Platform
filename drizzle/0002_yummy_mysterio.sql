ALTER TABLE `table_policies` ADD `rls_enabled` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `table_policies` ADD `select_rule` text DEFAULT 'public' NOT NULL;--> statement-breakpoint
ALTER TABLE `table_policies` ADD `insert_rule` text DEFAULT 'authenticated' NOT NULL;--> statement-breakpoint
ALTER TABLE `table_policies` ADD `update_rule` text DEFAULT 'owner' NOT NULL;--> statement-breakpoint
ALTER TABLE `table_policies` ADD `delete_rule` text DEFAULT 'owner' NOT NULL;--> statement-breakpoint
ALTER TABLE `table_policies` ADD `owner_column` text DEFAULT 'user_id' NOT NULL;