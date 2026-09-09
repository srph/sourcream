import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
export const movies = sqliteTable('movies', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  year: integer('year').notNull(),
  synopsis: text('synopsis').notNull().default(''),
  director: text('director').notNull().default(''),
  genres: text('genres', { mode: 'json' }).$type<string[]>().notNull().default([]),
  videoPath: text('video_path').notNull().unique(),
  duration: real('duration').notNull(),
  width: integer('width').notNull(),
  height: integer('height').notNull(),
  videoCodec: text('video_codec').notNull(),
  audioCodec: text('audio_codec').notNull(),
  addedAt: integer('added_at').notNull(),
});
export const subtitles = sqliteTable('subtitles', {
  id: text('id').primaryKey(),
  movieId: text('movie_id').notNull().references(() => movies.id, { onDelete: 'cascade' }),
  language: text('language').notNull(),
  label: text('label').notNull(),
  assetPath: text('asset_path').notNull(),
});
export type Movie = typeof movies.$inferSelect;
