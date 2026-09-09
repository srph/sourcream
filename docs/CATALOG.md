# Adding movies

Catalog changes are deliberate: Sourcream never scans or imports a folder automatically. From the repository root:

1. Run `npm run movie -- inspect "relative/movie.mp4"`. If it is outside the TV playback profile, preview a conversion with `prepare`, then add `--execute` only after checking the proposed output path.
2. Copy `catalog/perfume.json` to `catalog/<movie-id>.json` and enter verified metadata, a video path relative to `MOVIES_ROOT`, and any subtitle paths. Do not guess metadata or download media.
3. Run `npm run movie -- add catalog/<movie-id>.json`. This validates the MP4, converts registered subtitles to WebVTT, writes the SQLite rows, and generates 320px slider previews every 10 seconds.
4. Run `npm run movie -- frames <movie-id> --at <seconds>` with a representative scene, then verify with `npm run movie -- list` and `/w/<movie-id>`.

The manifest is an explicit, reviewable input to the catalog command; it is not used by the running app. SQLite remains the runtime source of truth. Keeping the manifest makes an entry reproducible and lets the CLI validate paths and media before updating the database.

The repository skill at `.agents/skills/sourcream-catalog/SKILL.md` contains the full safe workflow, including preparation, subtitle handling, replacement rules, and physical-TV checks. Ask Codex to use the Sourcream catalog skill when adding or updating a selected movie.
