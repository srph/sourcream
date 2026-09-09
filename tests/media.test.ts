import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { fileResponse, parseRange, resolveFile, toBoundedWebStream } from '../lib/files';
import { toWebVtt } from '../lib/subtitles';
import { compatibility } from '../scripts/media';

test('byte ranges cover TV seek patterns and reject unsatisfiable requests', () => {
  assert.deepEqual(parseRange('bytes=0-1', 100), { start: 0, end: 1 });
  assert.deepEqual(parseRange('bytes=50-', 100), { start: 50, end: 99 });
  assert.deepEqual(parseRange('bytes=-10', 100), { start: 90, end: 99 });
  assert.deepEqual(parseRange('bytes=90-999', 100), { start: 90, end: 99 });
  for (const range of ['bytes=100-', 'bytes=9-2', 'bytes=-0', 'bytes=-', 'bytes=0-1,4-5', 'bytes=x-y']) assert.equal(parseRange(range, 100), null);
});

test('a slow client applies backpressure instead of buffering the movie', async () => {
  let bytesRead = 0;
  const chunk = Buffer.alloc(64 * 1024);
  const stream = new Readable({ highWaterMark: chunk.length, read() {
    if (bytesRead >= 64 * 1024 * 1024) { this.push(null); return; }
    bytesRead += chunk.length; this.push(chunk);
  } });
  const web = toBoundedWebStream(stream);
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.ok(bytesRead > 0 && bytesRead < 1024 * 1024, `Read ${bytesRead} bytes while consumer was idle`);
  await web.cancel();
  assert.equal(stream.destroyed, true);
});

test('stream responses support exact bytes, HEAD, validators, and missing files without exposing disk paths', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sourcream-stream-'));
  try {
    await writeFile(path.join(root, 'video.mp4'), Buffer.from('0123456789'));
    const ranged = await fileResponse(new Request('http://localhost/video', { headers: { range: 'bytes=3-6' } }), root, 'video.mp4', 'video/mp4');
    assert.equal(ranged.status, 206); assert.equal(ranged.headers.get('content-range'), 'bytes 3-6/10'); assert.equal(await ranged.text(), '3456');
    const suffix = await fileResponse(new Request('http://localhost/video', { headers: { range: 'bytes=-3' } }), root, 'video.mp4', 'video/mp4');
    assert.equal(await suffix.text(), '789');
    const head = await fileResponse(new Request('http://localhost/video', { method: 'HEAD' }), root, 'video.mp4', 'video/mp4');
    assert.equal(head.headers.get('content-length'), '10'); assert.equal(await head.text(), '');
    const cached = await fileResponse(new Request('http://localhost/video', { headers: { 'if-none-match': head.headers.get('etag')! } }), root, 'video.mp4', 'video/mp4');
    assert.equal(cached.status, 304);
    const invalid = await fileResponse(new Request('http://localhost/video', { headers: { range: 'bytes=20-' } }), root, 'video.mp4', 'video/mp4');
    assert.equal(invalid.status, 416); assert.equal(invalid.headers.get('content-range'), 'bytes */10');
    const changed = await fileResponse(new Request('http://localhost/video', { headers: { range: 'bytes=0-1', 'if-range': '"old"' } }), root, 'video.mp4', 'video/mp4');
    assert.equal(changed.status, 200); assert.equal(await changed.text(), '0123456789');
    const missing = await fileResponse(new Request('http://localhost/video'), root, 'missing.mp4', 'video/mp4');
    assert.equal(missing.status, 404); assert.ok(!(await missing.text()).includes(root));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('registered paths cannot escape their media root', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'sourcream-path-'));
  try {
    const root = path.join(temp, 'media'); await mkdir(root);
    await writeFile(path.join(temp, 'outside.mp4'), 'private');
    await assert.rejects(resolveFile(root, '../outside.mp4'));
    await assert.rejects(resolveFile(root, path.join(temp, 'outside.mp4')));
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test('SRT conversion retains cues, line breaks, tags and timing', () => {
  const converted = toWebVtt('\ufeff1\r\n00:01:19,740 --> 00:01:22,370\r\n<i>Hello</i>\r\nWorld\r\n');
  assert.equal(converted, 'WEBVTT\n\n1\n00:01:19.740 --> 00:01:22.370\n<i>Hello</i>\nWorld\n');
  assert.equal(toWebVtt('WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHi'), 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHi\n');
  assert.throws(() => toWebVtt('not a subtitle'));
});

test('preparation copies compatible video but converts unsupported audio or 10-bit video', () => {
  const info = { format: { duration: '30', format_name: 'mov,mp4' }, streams: [{ codec_type: 'video', codec_name: 'h264', pix_fmt: 'yuv420p', level: 41, width: 1920, height: 816, avg_frame_rate: '24000/1001' }, { codec_type: 'audio', codec_name: 'aac', profile: 'LC', channels: 2 }] };
  assert.equal(compatibility(info).browserReady, true);
  assert.equal(compatibility({ ...info, streams: [info.streams[0], { codec_type: 'audio', codec_name: 'dts', channels: 6 }] }).audioCopy, false);
  assert.equal(compatibility({ ...info, streams: [{ ...info.streams[0], pix_fmt: 'yuv420p10le' }] }).videoCopy, false);
});
