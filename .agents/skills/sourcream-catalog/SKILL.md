---
name: sourcream-catalog
description: Add or update explicitly selected movies in Sourcream's local SQLite library, inspect media compatibility, convert supplied subtitles, and generate movie frames. Use for catalog maintenance in the Sourcream project.
---

Work from the Sourcream repository root. Read `README.md` for configuration and command syntax. The SQLite schema is in `db/schema.ts`; migrations are generated with Drizzle and applied with `npm run db:migrate`.

Only add movies the user selects. There is no automatic folder scanning or importing. Media paths in manifests are relative to `MOVIES_ROOT` (default `D:/Movies`); preserve the source files and their folders. Generated artwork and UTF-8 WebVTT files go to `ASSETS_ROOT`, separate from the originals.

1. Inspect the selected movie with `npm run movie -- inspect "relative/file.mp4"`. Use the output to decide whether it can play directly. The target is browser playback on a Samsung Tizen 7-era TV, with MP4, H.264 8-bit, and AAC-LC stereo as a conservative baseline.
2. Create a manifest in `catalog/` using `catalog/perfume.json` as the shape. Include the explicit title, year, director, synopsis, genres, relative video path, and user-supplied subtitle paths with language and label. Do not invent uncertain metadata; verify it or ask when necessary. Never download films or subtitles as part of adding a catalog entry.
3. Run `npm run movie -- add catalog/<id>.json`. Existing IDs require `--replace`, which updates that entry and replaces its subtitle associations. This command validates files and codecs, converts UTF-8 SRT to WebVTT, and generates 320px player preview frames every 10 seconds. Existing preview derivatives are retained when the registered video is unchanged.
4. Run `npm run movie -- frames <id> --at <seconds>` to generate a landscape card and backdrop and to ensure slider previews exist. Pick an ordinary representative scene. The command never overwrites existing images; remove only the exact generated artwork files if replacement is intended, then regenerate. Never remove source media.
5. Verify with `npm run movie -- list` and a request to `/w/<id>` and the media route. Report any remaining need to check playback or subtitle synchronization on the physical TV.

For incompatible media, `prepare` prints a conversion plan first. It copies compatible video, converts unsupported audio to AAC stereo, or transcodes incompatible video to H.264. Output must be a new file under the movie root; it never replaces originals. Run `--execute` when conversion is authorized. Do not transcode a whole movie just to test the script. HDR tone mapping is not implemented; retain the original and handle HDR sources separately. Add the new output explicitly after inspection; preparation does not change SQLite.

Catalog data lives only in SQLite. Browser local storage is exclusively for device-local playback progress and settings. This is a LAN app; publishing media or opening WAN access is a separate task.
