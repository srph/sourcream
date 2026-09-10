# Adding movies

Catalog changes are deliberate: Sourcream never scans or imports a folder automatically. From the repository root:

1. Run `npm run movie -- inspect "relative/movie.mp4"`. If it is outside the TV playback profile, preview a conversion with `prepare`, then add `--execute` only after checking the proposed output path.
2. Add the movie with verified metadata passed directly to the command. Do not guess metadata or download media:

   ```powershell
   npm run movie -- add "relative/movie.mp4" --id movie-id --title "Movie Title" --year 2026 --director "Director Name" --genre Drama --genre Thriller --synopsis "Synopsis" --subtitle "relative/movie.srt|en|English"
   ```

   Repeat `--genre` and `--subtitle` as needed. Director, genres, synopsis, and subtitles are optional. Existing IDs require `--replace`.
3. The command validates the MP4, converts registered subtitles to WebVTT, writes the SQLite rows transactionally, and generates 320px slider previews every 10 seconds.
4. Run `npm run movie -- frames <movie-id> --at <seconds>` with a representative scene, then verify with `npm run movie -- list` and `/w/<movie-id>`.

SQLite is the sole catalog source of truth. Back up `data/library.sqlite` together with `data/assets`; no separate manifest files are created or maintained.

The repository skill at `.agents/skills/sourcream-catalog/SKILL.md` contains the full safe workflow, including preparation, subtitle handling, replacement rules, and physical-TV checks. Ask Codex to use the Sourcream catalog skill when adding or updating a selected movie.
