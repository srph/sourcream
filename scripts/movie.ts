import { readFile, writeFile, mkdir, mkdtemp, realpath, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db';
import { movies, subtitles } from '../db/schema';
import { assetsRoot, moviesRoot } from '../lib/config';
import { resolveFile, insideRoot } from '../lib/files';
import { toWebVtt } from '../lib/subtitles';
import { probe, compatibility, fastStart, ffmpeg } from './media';

const manifestSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/), title: z.string().min(1), year: z.number().int().min(1888).max(2200),
  synopsis: z.string().default(''), director: z.string().default(''), genres: z.array(z.string()).default([]),
  video: z.string().min(1), subtitles: z.array(z.object({ file: z.string(), language: z.string().regex(/^[a-z]{2,3}(?:-[A-Za-z0-9]+)*$/), label: z.string().min(1) })).default([]),
});
const { values, positionals } = parseArgs({ allowPositionals: true, options: { at: { type: 'string' }, output: { type: 'string' }, execute: { type: 'boolean' }, replace: { type: 'boolean' } } });
const [command, input] = positionals;

async function exists(target: string) {
  try { await stat(target); return true; } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
}

async function generatePreviews(id: string, videoPath: string) {
  const movieAssets = path.join(assetsRoot, id), destination = path.join(movieAssets, 'previews');
  if (await exists(destination)) return false;
  await mkdir(movieAssets, { recursive: true });
  const temporary = await mkdtemp(path.join(movieAssets, '.previews-'));
  try {
    ffmpeg(['-i', videoPath, '-vf', 'fps=1/10,scale=320:-2', '-q:v', '5', path.join(temporary, '%06d.jpg')]);
    await rename(temporary, destination);
    return true;
  } catch (error) {
    await rm(temporary, { recursive: true, force: true });
    throw error;
  }
}

async function main() {
  if (command === 'list') { console.table(db.select({ id: movies.id, title: movies.title, year: movies.year }).from(movies).all()); return; }
  if (!input) throw new Error('Usage: npm run movie -- inspect <relative-video> | add <manifest.json> [--replace] | frames <id> [--at seconds] | prepare <relative-video> --output <relative.mp4> [--execute] | list');
  if (command === 'inspect' || command === 'prepare') {
    const file = await resolveFile(moviesRoot, input);
    const info = probe(file.path), check = compatibility(info);
    if (command === 'inspect') { console.log(JSON.stringify({ ...check, duration: Number(info.format.duration), bitrate: info.format.bit_rate, fastStart: fastStart(file.path) }, null, 2)); return; }
    if (!values.output || !values.output.toLowerCase().endsWith('.mp4')) throw new Error('Provide --output with a new relative .mp4 path under MOVIES_ROOT.');
    const root = await realpath(moviesRoot);
    const destination = path.resolve(root, values.output);
    if (!insideRoot(root, destination)) throw new Error('Output must stay inside MOVIES_ROOT.');
    // Existing parent only: avoid creating folders or following unchecked junctions.
    const parent = await realpath(path.dirname(destination));
    const output = path.join(parent, path.basename(destination));
    if (!insideRoot(root, output) || output.toLowerCase() === file.path.toLowerCase()) throw new Error('Output must be a separate file inside MOVIES_ROOT.');
    try { await stat(output); throw new Error('Output already exists; choose another name.'); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
    const videoArgs = check.videoCopy ? ['-c:v', 'copy'] : ['-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-profile:v', 'high', '-level:v', '4.1', '-pix_fmt', 'yuv420p', '-vf', "scale=w='min(1920,iw)':h='min(1080,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2", '-r', '30', '-maxrate', '12M', '-bufsize', '24M'];
    const audioArgs = check.audioCopy ? ['-c:a', 'copy'] : ['-c:a', 'aac', '-ac', '2', '-b:a', '192k'];
    const args = ['-i', file.path, '-map', '0:v:0', '-map', '0:a:0?', ...videoArgs, ...audioArgs, '-sn', '-movflags', '+faststart', output];
    console.log(JSON.stringify({ mode: check.videoCopy ? 'Copy video without quality loss' : 'Transcode to H.264 1080p SDR compatibility target (HDR tone mapping is not included)', audio: check.audioCopy ? 'Copy audio' : 'AAC stereo', args }, null, 2));
    if (values.execute) { ffmpeg(args); console.log('Prepared file created. Inspect it, then add it explicitly to the catalog.'); }
    else console.log('Preview only. Add --execute to create the file.');
    return;
  }
  if (command === 'add') {
    const manifest = manifestSchema.parse(JSON.parse(await readFile(input, 'utf8')));
    const existing = db.select().from(movies).where(eq(movies.id, manifest.id)).get();
    if (existing && !values.replace) throw new Error('Movie ID already exists; use --replace to update this catalog entry.');
    const file = await resolveFile(moviesRoot, manifest.video);
    if (path.extname(file.path).toLowerCase() !== '.mp4') throw new Error('Prepare an MP4 before adding it.');
    const info = probe(file.path), check = compatibility(info);
    if (!check.browserReady) throw new Error('Outside the conservative browser playback profile. Use prepare, then add the prepared MP4.');
    const duration = Number(info.format.duration);
    if (!Number.isFinite(duration) || duration <= 0) throw new Error('Invalid movie duration');
    const relativeVideoPath = path.relative(await realpath(moviesRoot), file.path);
    if (existing && existing.videoPath !== relativeVideoPath && await exists(path.join(assetsRoot, manifest.id, 'previews'))) throw new Error('This replacement uses a different video, but preview frames already exist. Remove only that movie\'s generated previews directory, then retry.');
    const previewsCreated = await generatePreviews(manifest.id, file.path);
    const tracks: (typeof subtitles.$inferInsert)[] = [];
    for (const sub of manifest.subtitles) {
      const source = await resolveFile(moviesRoot, sub.file);
      if (source.info.size > 10 * 1024 * 1024) throw new Error('Subtitle file is unexpectedly large');
      const text = new TextDecoder('utf-8', { fatal: true }).decode(await readFile(source.path));
      const id = randomUUID();
      const assetPath = `${manifest.id}/${id}.vtt`;
      await mkdir(path.join(assetsRoot, manifest.id), { recursive: true });
      await writeFile(path.join(assetsRoot, assetPath), toWebVtt(text), { flag: 'wx' });
      tracks.push({ id, movieId: manifest.id, language: sub.language, label: sub.label, assetPath });
    }
    const row = { id: manifest.id, title: manifest.title, year: manifest.year, synopsis: manifest.synopsis, director: manifest.director, genres: manifest.genres, videoPath: relativeVideoPath, duration, width: check.video!.width!, height: check.video!.height!, videoCodec: check.video!.codec_name, audioCodec: check.audio?.codec_name || 'none', addedAt: existing?.addedAt || Date.now() };
    db.transaction(tx => {
      tx.insert(movies).values(row).onConflictDoUpdate({ target: movies.id, set: row }).run();
      tx.delete(subtitles).where(eq(subtitles.movieId, row.id)).run();
      for (const track of tracks) tx.insert(subtitles).values(track).run();
    });
    console.log(`Added ${row.title}. ${previewsCreated ? 'Generated slider previews every 10 seconds. ' : 'Kept existing slider previews. '}Run: npm run movie -- frames ${row.id} --at <seconds> to create artwork.`);
    return;
  }
  if (command === 'frames') {
    const movie = db.select().from(movies).where(eq(movies.id, input)).get();
    if (!movie || !/^[a-z0-9-]+$/.test(movie.id)) throw new Error('Movie not found');
    const file = await resolveFile(moviesRoot, movie.videoPath);
    const seconds = values.at ? Number(values.at) : Math.round(movie.duration * 0.18);
    if (!Number.isFinite(seconds) || seconds < 0 || seconds >= movie.duration) throw new Error('--at must be a timestamp inside the movie');
    const folder = path.join(assetsRoot, movie.id);
    await mkdir(folder, { recursive: true });
    const backdrop = path.join(folder, 'backdrop.jpg'), poster = path.join(folder, 'poster.jpg');
    if (!await exists(backdrop)) ffmpeg(['-ss', String(seconds), '-i', file.path, '-frames:v', '1', '-vf', 'scale=1600:-2', '-q:v', '3', backdrop]);
    if (!await exists(poster)) ffmpeg(['-ss', String(seconds), '-i', file.path, '-frames:v', '1', '-vf', 'scale=800:-2', '-q:v', '3', poster]);
    const previewsCreated = await generatePreviews(movie.id, file.path);
    console.log(`Artwork is available at ${seconds}s. ${previewsCreated ? 'Generated' : 'Kept existing'} 10-second slider previews in ${folder}`);
    return;
  }
  throw new Error(`Unknown command: ${command}`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
