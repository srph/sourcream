import { defineConfig } from 'drizzle-kit';
import { databasePath } from './lib/config';
export default defineConfig({ schema: './db/schema.ts', out: './drizzle', dialect: 'sqlite', dbCredentials: { url: databasePath } });
