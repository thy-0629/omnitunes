CREATE TABLE `api_keys_third_party` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`key` text NOT NULL,
	`last_refresh_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`expires_at` integer,
	`scope` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `api_keys_third_party_provider_scope_idx` ON `api_keys_third_party` (`provider`,`scope`);--> statement-breakpoint
CREATE TABLE `collections` (
	`id` text PRIMARY KEY NOT NULL,
	`song_work_id` text NOT NULL,
	`preferred_source` text,
	`preferred_recording_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`song_work_id`) REFERENCES `song_works`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`preferred_recording_id`) REFERENCES `recordings`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `collections_song_work_id_idx` ON `collections` (`song_work_id`);--> statement-breakpoint
CREATE TABLE `local_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`path` text NOT NULL,
	`format` text NOT NULL,
	`checksum` text,
	`size_bytes` integer,
	`duration_sec` real,
	`bitrate_kbps` integer,
	`sample_rate` integer,
	`tags` text,
	`mtime` integer,
	`indexed_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`source_item_id` text,
	FOREIGN KEY (`source_item_id`) REFERENCES `source_items`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `local_assets_checksum_idx` ON `local_assets` (`checksum`);--> statement-breakpoint
CREATE INDEX `local_assets_source_item_id_idx` ON `local_assets` (`source_item_id`);--> statement-breakpoint
CREATE TABLE `play_history` (
	`id` text PRIMARY KEY NOT NULL,
	`song_work_id` text NOT NULL,
	`source` text NOT NULL,
	`source_item_id` text,
	`trigger` text DEFAULT 'manual' NOT NULL,
	`duration_played_sec` real,
	`outcome` text DEFAULT 'completed' NOT NULL,
	`fallback_from_id` text,
	`played_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`song_work_id`) REFERENCES `song_works`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_item_id`) REFERENCES `source_items`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `play_history_played_at_idx` ON `play_history` (`played_at`);--> statement-breakpoint
CREATE INDEX `play_history_song_work_id_idx` ON `play_history` (`song_work_id`);--> statement-breakpoint
CREATE TABLE `playable_options` (
	`id` text PRIMARY KEY NOT NULL,
	`source_item_id` text NOT NULL,
	`type` text NOT NULL,
	`payload` text NOT NULL,
	`status` text DEFAULT 'available' NOT NULL,
	`expires_at` integer,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`source_item_id`) REFERENCES `source_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `playable_options_source_item_id_idx` ON `playable_options` (`source_item_id`);--> statement-breakpoint
CREATE TABLE `playlist_items` (
	`id` text PRIMARY KEY NOT NULL,
	`playlist_id` text NOT NULL,
	`song_work_id` text NOT NULL,
	`position` integer NOT NULL,
	`added_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`playlist_id`) REFERENCES `playlists`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`song_work_id`) REFERENCES `song_works`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `playlist_items_playlist_position_idx` ON `playlist_items` (`playlist_id`,`position`);--> statement-breakpoint
CREATE INDEX `playlist_items_playlist_id_idx` ON `playlist_items` (`playlist_id`);--> statement-breakpoint
CREATE TABLE `playlists` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`visibility` text DEFAULT 'private' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `recordings` (
	`id` text PRIMARY KEY NOT NULL,
	`song_work_id` text NOT NULL,
	`version_type` text DEFAULT 'studio' NOT NULL,
	`duration_sec` real,
	`performers` text,
	`album` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`song_work_id`) REFERENCES `song_works`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `recordings_song_work_id_idx` ON `recordings` (`song_work_id`);--> statement-breakpoint
CREATE TABLE `song_works` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`artists` text NOT NULL,
	`aliases` text DEFAULT '[]',
	`fingerprint` text,
	`language` text,
	`year` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `song_works_fingerprint_idx` ON `song_works` (`fingerprint`);--> statement-breakpoint
CREATE INDEX `song_works_title_artists_idx` ON `song_works` (`title`,`artists`);--> statement-breakpoint
CREATE TABLE `source_health` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`success_rate` real DEFAULT 1 NOT NULL,
	`avg_latency_ms` real DEFAULT 0 NOT NULL,
	`last_error_code` text,
	`last_error_at` integer,
	`total_calls` integer DEFAULT 0 NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `source_items` (
	`id` text PRIMARY KEY NOT NULL,
	`recording_id` text NOT NULL,
	`source` text NOT NULL,
	`external_id` text NOT NULL,
	`publisher` text,
	`url` text,
	`thumbnail_url` text,
	`fetched_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`recording_id`) REFERENCES `recordings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `source_items_source_external_idx` ON `source_items` (`source`,`external_id`);--> statement-breakpoint
CREATE INDEX `source_items_recording_id_idx` ON `source_items` (`recording_id`);--> statement-breakpoint
CREATE INDEX `source_items_fetched_at_idx` ON `source_items` (`fetched_at`);