# Sourcream

## Description

Local movie library and streaming website for a Samsung TV web browser. The app is TV-first and serves the UI, catalog, artwork, subtitles, and video files from this PC over the LAN. Movies are selected and added manually; there is no automatic folder scanning or importing.

- **Library** — searchable movie catalog at `/`, with artwork and metadata from SQLite
- **Watch page** — native HTML video player at `/w/<id>` with subtitles, seeking, resume, and fullscreen
- **Media routes** — bounded video, artwork, and WebVTT responses under `/api`
- **Catalog scripts** — inspect, prepare, add, list, and generate frames for explicitly selected movies

This is a trusted-LAN application. Authentication, HTTPS, WAN access, bandwidth management, and series support are future work. Do not broaden the network/security scope while making an ordinary UI or catalog change.

## Stack

Next.js 15 App Router, React 19, TypeScript strict, Tailwind CSS 3.4, Base UI/shadcn-style components, Lucide icons, Inter, SQLite with `better-sqlite3`, and Drizzle ORM. FFmpeg/FFprobe are used by the catalog preparation and frame-generation scripts.

The browser uses a native `<video>` element. There is no video-player library: playback controls, focus navigation, remote-key handling, subtitles, progress persistence, and accelerated seeking are owned by the app.

## Structure

```
app/
  page.tsx                         library and title search (`/`, `/?q=`)
  w/[id]/page.tsx                  watch page (`/w/<id>`)
  api/movies/[id]/video/route.ts   registered video streaming
  api/movies/[id]/art/route.ts     backdrop/poster artwork
  api/subtitles/[id]/route.ts      registered WebVTT subtitles
  globals.css                      TV-first global styles and theme
components/
  library.tsx                      movie grid, feature title, search UI
  player.tsx                       native video player and controls
  focus-navigation.tsx             directional TV focus movement
  ui/button.tsx                    Base UI button styling
db/
  schema.ts                        movies and subtitles tables
  index.ts                         SQLite/Drizzle connection and pragmas
drizzle/                           checked-in migrations
lib/
  config.ts                        MOVIES_ROOT, DATABASE_PATH, ASSETS_ROOT
  files.ts                         path confinement and range streaming
  progress.ts                      browser-local playback progress
  remote-seek.ts                   remote press/hold/release behavior
  subtitles.ts                     SRT to WebVTT conversion
scripts/
  movie.ts                         catalog CLI
  media.ts                         FFmpeg/FFprobe and compatibility checks
  migrate.ts                       explicit Drizzle migration runner
tests/                              Node test-runner tests for media and remote input
.agents/skills/sourcream-catalog/  catalog-maintenance skill
```

## Data and file boundaries

`data/library.sqlite` is the catalog and `data/assets` contains generated artwork and converted subtitle files. Back these up together. Never put database files in `public/`.

Movie and subtitle source paths passed to the catalog CLI are relative to `MOVIES_ROOT` (default `D:/Movies`). `resolveFile()` resolves real paths and rejects absolute paths, traversal, symlinks/junctions escaping the root, directories, and missing files. HTTP requests use catalog IDs and registered database paths; they never accept raw disk paths.

SQLite is configured with WAL mode, foreign keys, and a 5-second busy timeout. Preserve those pragmas: the development server and catalog work must be able to share the database safely.

The catalog is the source of truth. Browser `localStorage` is only for device-local progress, volume, mute, and subtitle preferences; it must not be used to register movies or replace database metadata.

## Catalog maintenance

Only add movies the user explicitly selects. Read `README.md` and `.agents/skills/sourcream-catalog/SKILL.md` before catalog work. Pass verified metadata directly to the catalog CLI and do not invent uncertain metadata.

```powershell
npm run movie -- inspect "relative/movie.mp4"
npm run movie -- add "relative/movie.mp4" --id <id> --title "Title" --year <year> [metadata options]
npm run movie -- frames <id> --at 1600
npm run movie -- list

# Preview a TV-compatible output, then execute only when conversion is authorized
npm run movie -- prepare "relative/movie.mkv" --output "relative/movie.tv.mp4"
npm run movie -- prepare "relative/movie.mkv" --output "relative/movie.tv.mp4" --execute
```

`add` accepts metadata directly, validates the media, requires an MP4 within the conservative browser profile, converts UTF-8 SRT input to WebVTT under `ASSETS_ROOT`, and updates the movie/subtitle rows transactionally. Existing IDs require `--replace`. SQLite is the sole catalog source of truth; do not create manifest files. Preparation never changes SQLite, replaces originals, or overwrites an existing output. After preparing a file, inspect it and add it explicitly.

Frame generation creates `backdrop.jpg` and `poster.jpg` under `ASSETS_ROOT/<id>/` and never overwrites existing outputs. To regenerate, remove only those exact generated files; never remove source media.

## Playback profile

The conservative target is MP4 with H.264, 8-bit `yuv420p`, at most 1920×1080, Level 4.2 or lower, up to 60fps, and AAC-LC stereo. Compatible video is copied losslessly; unsupported audio is converted to AAC stereo; incompatible video is encoded to H.264 with a 1080p maximum and 30fps. Fast-start metadata is enabled for generated MP4s.

HDR tone mapping, surround-track selection, AVPlay, and a native Tizen app are not implemented. Browser behavior still needs physical-TV verification, especially subtitles, seeking, fullscreen, resume, remote buttons, and 2×/4×/8× playback.

## Media serving and player behavior

`fileResponse()` is the common implementation for video, artwork, and subtitles. It supports `GET`/`HEAD` where applicable, byte ranges (`206`), ETags/`304`, `If-Range`, `416` for unsatisfiable ranges, bounded backpressure for slow TV clients, and stream cleanup on disconnect. Preserve these behaviors when changing media routes.

The player saves progress every three seconds, on pause, page exit, and window-focus loss. Resume ignores the first five and final thirty seconds. Progress and playback settings remain local to each browser/device. Remote behavior is intentionally explicit: short Right/Left presses seek 15 seconds; holding Right for 500ms starts 2×, and separate presses increase to 4× and 8×; Left returns to normal speed and seeks back 15 seconds.

Directional navigation uses elements marked `data-tv-focus`; keep focus-visible states and test with keyboard/remote-like events. Minimize motion to transform, translate, and opacity for the TV browser, and respect reduced-motion preferences.

## Conventions

- Use hyphen-cased filenames for new frontend files.
- Use the `@/` alias for project imports; avoid deep relative imports.
- Keep TypeScript strict and prefer named exports.
- Use built-in Tailwind 3 font sizes and the existing CSS theme/classes; avoid arbitrary values and unnecessary new dependencies.
- Keep route handlers thin: look up the catalog row, validate the registered ID/path, then delegate file delivery to `fileResponse()`.
- Keep catalog business rules in the scripts and schema rather than duplicating them in UI components.
- Preserve original movie files and existing generated assets unless replacement is explicitly requested.
- Keep changes compatible with the Browserslist baseline (`Chrome >= 94`, `Safari >= 15`); do not assume modern browser APIs without a fallback.

## Commands

```powershell
npm install
Copy-Item .env.example .env
npm run db:migrate
npm run dev                 # LAN-accessible development server
npm run build
npm start                   # LAN-accessible production server

npm run typecheck
npm test

# After a schema change
npm run db:generate
npm run db:migrate
```

The server binds to `0.0.0.0`; use `http://<PC-LAN-IPv4>:3000` on the TV. Keep the PC awake, keep the movie drive connected, and allow Node through Windows Firewall only on the private network if prompted. These scripts do not change firewall or router rules.

## Testing

Tests use Node's built-in test runner through `tsx` and focus on behavior at the boundaries:

- `media.test.ts` covers byte ranges, `HEAD`, validators, backpressure, path confinement, subtitle conversion, and compatibility decisions.
- `preparation.test.ts` covers FFmpeg preparation, fast-start output, source preservation, and overwrite refusal.
- `remote-seek.test.ts` covers TV remote key normalization and press/hold/release behavior.

Run `npm run typecheck`, `npm test`, and `npm run build` for changes that touch application code. Physical TV playback is a separate verification step and cannot be replaced by the automated tests.

## Gotchas

- The movie drive may be unavailable; media failures should return a safe `404` message without exposing absolute disk paths.
- Do not add an automatic scanner or silently import files. Catalog changes are deliberate and explicit.
- `MOVIES_ROOT`, `DATABASE_PATH`, `ASSETS_ROOT`, `FFMPEG_PATH`, and `FFPROBE_PATH` are read from `.env`; environment changes require a server/script restart.
- Generated migrations are checked in and applied explicitly. Never run migrations from an HTTP request.
- A movie must be added through its registered ID before `/w/<id>` or its media routes can serve it.
- Artwork routes default to the backdrop and accept `?kind=poster` for the landscape card.
- SQLite `genres` is stored as JSON text; search currently uses SQLite `LIKE`, so `%` and `_` retain wildcard semantics.
- Next route `params` and `searchParams` are async in this version; preserve that shape when editing App Router pages and handlers.
- This is a trusted-LAN app without authentication. Do not describe it as WAN-safe or add WAN exposure as part of an unrelated change.
