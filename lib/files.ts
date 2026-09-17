import path from 'node:path';
import { realpath, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import type { Readable } from 'node:stream';

export function insideRoot(root: string, candidate: string) {
  const relative = path.relative(root, candidate);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

// Resolve symlinks/junctions too. Request paths never become disk paths.
export async function resolveFile(root: string, relative: string) {
  if (path.isAbsolute(relative)) throw new Error('Expected a relative library path');
  const base = await realpath(root);
  const candidate = await realpath(path.resolve(base, relative));
  if (!insideRoot(base, candidate)) throw new Error('File is outside library root');
  const info = await stat(candidate);
  if (!info.isFile()) throw new Error('Expected a regular file');
  return { path: candidate, info };
}

export function parseRange(header: string, size: number): { start: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2]) || size <= 0) return null;
  if (!match[1]) {
    const suffix = Number(match[2]);
    return Number.isSafeInteger(suffix) && suffix > 0 ? { start: Math.max(0, size - suffix), end: size - 1 } : null;
  }
  const start = Number(match[1]);
  const end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || end < start) return null;
  return { start, end };
}

export function toBoundedWebStream(stream: Readable) {
  // Count queued bytes, not chunks: the default Web Stream strategy can otherwise
  // buffer thousands of 256KB chunks for a slow TV connection.
  let controller: ReadableStreamDefaultController<Uint8Array>;
  let settled = false;

  const cleanup = () => {
    stream.off('data', onData);
    stream.off('end', onEnd);
    stream.off('error', onError);
    stream.off('close', onClose);
  };
  const close = () => {
    if (settled) return;
    settled = true;
    cleanup();
    controller.close();
  };
  const onData = (chunk: unknown) => {
    if (settled) return;
    if (!(chunk instanceof Uint8Array)) {
      onError(new TypeError('Expected a binary stream chunk'));
      return;
    }
    // Copy Buffers backed by Node's shared pool before handing them to Web Streams.
    controller.enqueue(new Uint8Array(chunk));
    if (controller.desiredSize !== null && controller.desiredSize <= 0) stream.pause();
  };
  const onEnd = () => close();
  const onClose = () => close();
  const onError = (error: Error) => {
    if (settled) return;
    settled = true;
    cleanup();
    controller.error(error);
  };

  return new ReadableStream<Uint8Array>({
    start(value) {
      controller = value;
      stream.pause();
      stream.on('data', onData);
      stream.once('end', onEnd);
      stream.once('error', onError);
      stream.once('close', onClose);
    },
    pull() {
      if (!settled) stream.resume();
    },
    cancel() {
      if (settled) return;
      settled = true;
      cleanup();
      stream.destroy();
    },
  }, { highWaterMark: 256 * 1024, size: chunk => chunk.byteLength });
}

export async function fileResponse(request: Request, root: string, relative: string, contentType: string) {
  try {
    const file = await resolveFile(root, relative);
    const size = file.info.size;
    const etag = `"${size.toString(16)}-${Math.trunc(file.info.mtimeMs).toString(16)}"`;
    const headers = new Headers({ 'Accept-Ranges': 'bytes', 'Content-Type': contentType, 'Cache-Control': 'private, max-age=0, must-revalidate', 'ETag': etag, 'Last-Modified': file.info.mtime.toUTCString(), 'X-Content-Type-Options': 'nosniff' });
    const rangeHeader = request.headers.get('range');
    if (!rangeHeader && request.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers });
    const ifRange = request.headers.get('if-range');
    const useRange = rangeHeader && (!ifRange || ifRange === etag || ifRange === file.info.mtime.toUTCString());
    const range = useRange ? parseRange(rangeHeader, size) : undefined;
    if (range === null) { headers.set('Content-Range', `bytes */${size}`); return new Response(null, { status: 416, headers }); }
    headers.set('Content-Length', String(range ? range.end - range.start + 1 : size));
    if (range) headers.set('Content-Range', `bytes ${range.start}-${range.end}/${size}`);
    const status = range ? 206 : 200;
    if (request.method === 'HEAD' || size === 0) return new Response(null, { status, headers });
    const stream = createReadStream(file.path, { ...(range || {}), highWaterMark: 256 * 1024 });
    return new Response(toBoundedWebStream(stream), { status, headers });
  } catch {
    return new Response('Media file unavailable. Check that the movie drive is connected.', { status: 404 });
  }
}
