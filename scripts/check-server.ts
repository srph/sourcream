import assert from 'node:assert/strict';
import { open } from 'node:fs/promises';
import { db } from '../db';
import { movies, subtitles } from '../db/schema';
import { resolveFile } from '../lib/files';
import { moviesRoot } from '../lib/config';
const base = process.env.TEST_URL || 'http://localhost:3000';
async function main() {
  for (const route of ['/', '/?q=Perfume', '/?q=no-such-movie-xyz', '/w/perfume-2006']) {
    const response = await fetch(base + route); assert.equal(response.status, 200, route); await response.arrayBuffer();
  }
  assert.equal((await fetch(base + '/w/not-a-movie')).status, 404);
  assert.equal((await fetch(base + '/api/movies/not-a-movie/video')).status, 404);
  const movie = db.select().from(movies).get()!;
  const file = await resolveFile(moviesRoot, movie.videoPath);
  const response = await fetch(`${base}/api/movies/${movie.id}/video`, { headers: { range: 'bytes=1000000-1001023' } });
  assert.equal(response.status, 206); assert.equal(response.headers.get('content-length'), '1024');
  const handle = await open(file.path); const expected = Buffer.alloc(1024);
  try { await handle.read(expected, 0, 1024, 1000000); } finally { await handle.close(); }
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), expected);
  const head = await fetch(`${base}/api/movies/${movie.id}/video`, { method: 'HEAD' });
  assert.equal(head.status, 200); assert.equal(Number(head.headers.get('content-length')), file.info.size);
  const track = db.select().from(subtitles).get()!;
  const sub = await fetch(`${base}/api/subtitles/${track.id}`); assert.equal(sub.status, 200); assert.ok((await sub.text()).startsWith('WEBVTT'));
  const art = await fetch(`${base}/api/movies/${movie.id}/art`); assert.equal(art.status, 200); assert.equal(art.headers.get('content-type'), 'image/jpeg'); await art.arrayBuffer();
  console.log('Live routes, movie byte integrity, HEAD, subtitles, and artwork passed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
