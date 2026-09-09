import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { databasePath } from '../lib/config';
import * as schema from './schema';
const globalDb = globalThis as unknown as { libraryDb?: ReturnType<typeof connect> };
function connect() {
  mkdirSync(path.dirname(databasePath), { recursive: true });
  const sqlite = new Database(databasePath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');
  return drizzle(sqlite, { schema });
}
export const db = globalDb.libraryDb ?? connect();
globalDb.libraryDb = db;
