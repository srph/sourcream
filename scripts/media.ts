import { createRequire } from 'node:module';
import { execFileSync, spawnSync } from 'node:child_process';
import { openSync, readSync, closeSync } from 'node:fs';
const require = createRequire(import.meta.url);
export function ffmpeg(args: string[]) {
  const binary = process.env.FFMPEG_PATH || require('ffmpeg-static');
  const result = spawnSync(binary, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-n', ...args], { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`FFmpeg failed (${result.status}). Existing outputs are never overwritten.`);
}
export type Probe = { format: { duration: string; format_name: string; bit_rate?: string }; streams: { codec_type: string; codec_name: string; width?: number; height?: number; pix_fmt?: string; level?: number; profile?: string; channels?: number; avg_frame_rate?: string }[] };
export function probe(file: string): Probe {
  const binary = process.env.FFPROBE_PATH || require('ffprobe-static').path;
  return JSON.parse(execFileSync(binary, ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', file], { encoding: 'utf8' }));
}
export function fastStart(file: string): boolean {
  const fd = openSync(file, 'r');
  try {
    let offset = 0;
    const header = Buffer.alloc(16);
    for (let i = 0; i < 10000; i++) {
      if (readSync(fd, header, 0, 8, offset) !== 8) return false;
      let size = header.readUInt32BE(0);
      const type = header.toString('ascii', 4, 8);
      if (type === 'moov') return true;
      if (type === 'mdat') return false;
      if (size === 1) { if (readSync(fd, header, 8, 8, offset + 8) !== 8) return false; size = Number(header.readBigUInt64BE(8)); }
      if (!Number.isSafeInteger(size) || size < 8) return false;
      offset += size;
    }
    return false;
  } finally { closeSync(fd); }
}
export function compatibility(info: Probe) {
  const video = info.streams.find(s => s.codec_type === 'video');
  const audio = info.streams.find(s => s.codec_type === 'audio');
  const [n, d] = (video?.avg_frame_rate || '0/1').split('/').map(Number);
  const fps = d ? n / d : 0;
  const videoCopy = !!video && video.codec_name === 'h264' && video.pix_fmt === 'yuv420p' && (video.level || 999) <= 42 && (video.width || 9999) <= 1920 && (video.height || 9999) <= 1080 && fps > 0 && fps <= 60;
  const audioCopy = !audio || (audio.codec_name === 'aac' && audio.profile === 'LC' && (audio.channels || 0) <= 2);
  return { video, audio, fps, videoCopy, audioCopy, browserReady: videoCopy && audioCopy && info.format.format_name.includes('mp4') };
}
