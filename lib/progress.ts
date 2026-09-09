export type Progress = { time: number; duration: number; updatedAt: number };
export function readProgress(id: string): Progress | null {
  try {
    const value = JSON.parse(localStorage.getItem(`sourcream:progress:${id}`) || 'null');
    if (!value || !Number.isFinite(value.time) || !Number.isFinite(value.duration) || value.time < 0 || value.duration <= 0) return null;
    return value;
  } catch { return null; }
}
export function saveProgress(id: string, time: number, duration: number) {
  if (!Number.isFinite(time) || !Number.isFinite(duration) || duration <= 0) return;
  try { localStorage.setItem(`sourcream:progress:${id}`, JSON.stringify({ time, duration, updatedAt: Date.now() })); } catch { /* Storage can be disabled or full on TVs. */ }
}
export function resumable(progress: Progress | null) { return !!progress && progress.time >= 5 && progress.time < progress.duration - 30; }
