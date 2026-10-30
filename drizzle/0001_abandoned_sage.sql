CREATE TABLE `table_policies` (
	`id` text PRIMARY KEY NOT NULL,
	`table_name` text NOT NULL,
	`read_level` text DEFAULT 'public' NOT NULL,
	`write_level` text DEFAULT 'authenticated' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `table_policies_table_name_unique` ON `table_policies` (`table_name`);