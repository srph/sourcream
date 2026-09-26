# Sourcream

## Description

TV-first movie library served from this PC to a Samsung TV over the LAN. Movies are added manually; no folder scanning. `/` lists movies, `/w/<id>` plays them, and `/api` serves registered media. Keep ordinary changes within the trusted-LAN scope.

## Stack

Next.js 15, React 19, strict TypeScript, Tailwind 3.4, Base UI, SQLite/Drizzle, and FFmpeg/FFprobe. Playback uses native `<video>` with app-owned controls and TV remote handling.

## Structure

```
app/                 pages, styles, API routes
components/          library, player, TV focus, shared UI
db/, drizzle/        SQLite and migrations
lib/                 media, playback, configuration
scripts/             catalog and migration CLIs
tests/               behavior tests
.agents/skills/      catalog skill
```

## Data and file boundaries

Back up `data/library.sqlite` with `data/assets`; keep databases out of `public/`. Source files stay under `MOVIES_ROOT`, and HTTP serves registered IDs, never raw paths. Preserve SQLite WAL, foreign keys, and busy timeout. `localStorage` stores device playback state only.

## Catalog and playback

Read `docs/CATALOG.md` for catalog, media, and player rules. For catalog changes, also read `.agents/skills/sourcream-catalog/SKILL.md`. Add only movies the user selects, using verified metadata.

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
npm run dev
npm run typecheck
npm test
npm run build
npm start
# After schema changes
npm run db:generate
npm run db:migrate
```

Dev: port `10023` (`.next-dev`). Production: port `10010` (`.next-prod`). TV: `http://<PC-LAN-IPv4>:10010`.

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

## Git Commits

Keep commits reasonably scoped: separate unrelated changes and distinct tasks/sessions, but group related work together. Don't over-optimize for atomic commits.
