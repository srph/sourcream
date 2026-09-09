import { loadEnvConfig } from '@next/env';
import path from 'node:path';
loadEnvConfig(process.cwd());
export const moviesRoot = path.resolve(process.env.MOVIES_ROOT || 'D:/Movies');
export const databasePath = path.resolve(process.env.DATABASE_PATH || './data/library.sqlite');
export const assetsRoot = path.resolve(process.env.ASSETS_ROOT || './data/assets');
