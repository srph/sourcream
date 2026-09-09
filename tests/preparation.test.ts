import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { ffmpeg, probe, compatibility, fastStart } from '../scripts/media';
const require = createRequire(import.meta.url);

test('prepare previews and creates a playable copy, preserves the source and refuses overwrite', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'sourcream-prepare-'));
  try {
    const source = path.join(root, 'source.mkv');
    ffmpeg(['-f', 'lavfi', '-i', 'color=c=black:s=64x64:r=24:d=1', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', '-c:v', 'mpeg4', '-c:a', 'pcm_s16le', '-shortest', source]);
    const hash = () => createHash('sha256').update(readFileSync(source)).digest('hex');
    const before = hash();
    function run(execute: boolean) {
      return spawnSync(process.execPath, [require.resolve('tsx/cli'), 'scripts/movie.ts', 'prepare', 'source.mkv', '--output', 'ready.mp4', ...(execute ? ['--execute'] : [])], { encoding: 'utf8', env: { ...process.env, MOVIES_ROOT: root, DATABASE_PATH: path.join(root, 'library.sqlite') } });
    }
    const preview = run(false); assert.equal(preview.status, 0, preview.stderr); assert.equal(existsSync(path.join(root, 'ready.mp4')), false);
    const execute = run(true); assert.equal(execute.status, 0, execute.stderr);
    assert.equal(compatibility(probe(path.join(root, 'ready.mp4'))).browserReady, true);
    assert.equal(fastStart(path.join(root, 'ready.mp4')), true); assert.equal(hash(), before);
    const overwrite = run(true); assert.notEqual(overwrite.status, 0); assert.match(overwrite.stderr, /already exists/); assert.equal(hash(), before);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
