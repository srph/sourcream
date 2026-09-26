# Catalog, media, and playback

## Files and boundaries

Movies are selected and added manually. SQLite (`data/library.sqlite`) is the only catalog; `data/assets` holds generated artwork, previews, and converted subtitles. Back up both together. Never put the database in `public/` or create a manifest.

Movie and subtitle paths passed to the CLI are relative to `MOVIES_ROOT` (default `D:/Movies`). `resolveFile()` rejects absolute paths, traversal, missing files, directories, and symlinks or junctions escaping the root. HTTP accepts registered IDs, not disk paths. Keep SQLite's WAL mode, foreign keys, and five-second busy timeout. Browser `localStorage` holds device-local progress and playback preferences only.

## Add a movie

Read `.agents/skills/sourcream-catalog/SKILL.md` before catalog work. Add only titles the user explicitly selects, using verified metadata. Do not guess metadata or download media.

```powershell
npm run movie -- inspect "relative/movie.mp4"
npm run movie -- add "relative/movie.mp4" --id movie-id --title "Movie Title" --year 2026 --director "Director Name" --genre Drama --subtitle "relative/movie.srt|en|English"
npm run movie -- frames movie-id --at 1600
npm run movie -- list
```

Repeat `--genre` and `--subtitle` as needed; director, genres, synopsis, and subtitles are optional. `add` requires a compatible MP4, validates it, converts registered UTF-8 SRT subtitles to WebVTT, writes rows transactionally, and generates 320px slider previews every 10 seconds. Existing IDs require `--replace`.

For incompatible media, preview conversion before authorizing `--execute`. Preparation does not change SQLite, replace the source, or overwrite an existing output. Inspect the prepared MP4, then add it explicitly.

```powershell
npm run movie -- prepare "relative/movie.mkv" --output "relative/movie.tv.mp4"
npm run movie -- prepare "relative/movie.mkv" --output "relative/movie.tv.mp4" --execute
```

`frames` creates `backdrop.jpg` and `poster.jpg` under `ASSETS_ROOT/<id>/` without overwriting them. To regenerate, remove only those exact generated files. Verify the result at `/w/<id>`; preserve source media.

## Playback profile

Target MP4 with H.264, 8-bit `yuv420p`, at most 1920×1080, Level 4.2 or lower, up to 60fps, and AAC-LC stereo. Preparation copies compatible video, converts unsupported audio to AAC stereo, or encodes incompatible video to H.264 at up to 1080p/30fps. Generated MP4s use fast-start metadata. HDR tone mapping, surround-track selection, AVPlay, and a native Tizen app are not implemented.

## Media and player behavior

`fileResponse()` serves video, artwork, and subtitles with `GET`/`HEAD` where applicable, byte ranges (`206`), ETags/`304`, `If-Range`, `416` for unsatisfiable ranges, bounded backpressure, and disconnect cleanup. Preserve these behaviors and return safe `404` responses when the movie drive is unavailable.

The player saves progress every three seconds, on pause, page exit, and window-focus loss. Resume skips the first five and final thirty seconds. Settings and progress stay on each device. Short Right/Left presses seek 15 seconds; holding Right for 500ms starts 2×, with later presses increasing to 4× and 8×. Left restores normal speed and seeks back 15 seconds.

Directional navigation uses `data-tv-focus`. Keep visible focus states, test remote-like keys, limit motion to transform, translate, and opacity, and respect reduced motion. Verify subtitles, seeking, fullscreen, resume, remote buttons, and accelerated playback on the physical TV.
