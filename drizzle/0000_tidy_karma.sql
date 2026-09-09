CREATE TABLE `movies` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`year` integer NOT NULL,
	`synopsis` text DEFAULT '' NOT NULL,
	`director` text DEFAULT '' NOT NULL,
	`genres` text DEFAULT '[]' NOT NULL,
	`video_path` text NOT NULL,
	`duration` real NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`video_codec` text NOT NULL,
	`audio_codec` text NOT NULL,
	`added_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `movies_video_path_unique` ON `movies` (`video_path`);--> statement-breakpoint
CREATE TABLE `subtitles` (
	`id` text PRIMARY KEY NOT NULL,
	`movie_id` text NOT NULL,
	`language` text NOT NULL,
	`label` text NOT NULL,
	`asset_path` text NOT NULL,
	FOREIGN KEY (`movie_id`) REFERENCES `movies`(`id`) ON UPDATE no action ON DELETE cascade
);
