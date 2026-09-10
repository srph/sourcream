# Sourcream

A local movie library for a Samsung TV web browser. Next.js 15, React, Tailwind 3.4, shadcn/Base UI, Inter, SQLite and Drizzle. A native HTML video element handles playback; the application owns controls and remote navigation.

## Run on this PC

Node.js 22 or 24 is recommended. From this folder:

```powershell
npm install
Copy-Item .env.example .env
npm run db:migrate
npm run build
npm start
```

Open `http://localhost:3000` on the PC. On the TV, open `http://<PC-LAN-IPv4>:3000` in its browser. Both devices must be on the same LAN with client isolation disabled. Wi-Fi TV and wired PC can communicate through the same router. If Windows Firewall prompts for Node, allow the private network. Keep the PC awake and the drive connected. No firewall or router rules are changed by these scripts.

`npm run dev` starts development on the same address; use the production build for TV playback. Changing an environment variable requires a restart. `.env` supports `MOVIES_ROOT`, `DATABASE_PATH`, `ASSETS_ROOT`, and optional `FFMPEG_PATH` / `FFPROBE_PATH` overrides. Fonts are served locally; playback needs no external service.

## Library maintenance

Movie files stay in their existing folders. Nothing discovers or imports movies automatically. `data/library.sqlite` is the catalog; back it up along with `data/assets` and your movie drive. Do not put database files in `public/`.

```powershell
npm run movie -- inspect "relative/folder/movie.mp4"
npm run movie -- add "relative/folder/movie.mp4" --id perfume-2006 --title "Perfume: The Story of a Murderer" --year 2006 --director "Tom Tykwer" --genre Drama --genre Thriller --synopsis "In eighteenth-century France, a young man with an extraordinary sense of smell becomes obsessed with capturing the perfect scent." --subtitle "relative/folder/movie.srt|en|English"
npm run movie -- frames perfume-2006 --at 1600
npm run movie -- list
```

SQLite is the only catalog source of truth; there are no manifest files. The `add` command accepts verified metadata directly, refuses duplicate IDs unless `--replace` is supplied, validates the media, and writes the catalog transactionally. Repeat `--genre` and `--subtitle` for multiple values. A subtitle uses `relative-file|language|label`; subtitle input is UTF-8 SRT or WebVTT. Paths are relative to `MOVIES_ROOT`; the scripts resolve junctions and reject paths outside it. Subtitles are converted without changing originals, and `add` generates 320px player previews every 10 seconds. Obsolete generated subtitle files are retained for safety. See `docs/CATALOG.md` for the short workflow.

The discoverable project skill is in `.agents/skills/sourcream-catalog/SKILL.md`.

`frames` makes a 1600px backdrop and 800px landscape card from an explicitly chosen time and ensures the 10-second slider previews exist. Existing outputs are never overwritten. To change the selected frame, remove only `data/assets/<id>/backdrop.jpg` and `poster.jpg` and run the command again. A missing image uses a plain fallback surface.

## Playback profile and preparation

The initial target is MP4 containing H.264 High/Main/Baseline, 8-bit `yuv420p`, at most 1920×1080 / Level 4.2 / 60fps, with AAC-LC stereo. This is a conservative application profile, not the full decoder capability of every Samsung TV. The selected Perfume is H.264 High 4.1, 1920×816 at 23.976fps, AAC-LC stereo, 2.55 GB, approximately 2h 27m. It does not require transcoding.

```powershell
# Preview the decision and FFmpeg arguments. Output's parent folder must exist.
npm run movie -- prepare "relative/movie.mkv" --output "relative/movie.tv.mp4"
# Execute when ready; originals and existing outputs are never overwritten.
npm run movie -- prepare "relative/movie.mkv" --output "relative/movie.tv.mp4" --execute
```

Compatible H.264 is copied losslessly; unsupported audio becomes AAC stereo. Other video is encoded to H.264 with a 1080p maximum and 30fps. Fast-start metadata is written at the beginning of the MP4. For a compatible MP4 that lacks fast-start, the same script can remux it without re-encoding. Range support still allows the original MP4 to play. HDR tone mapping, surround-track selection and AVPlay are not implemented. The script does not silently register its output. Add it explicitly after inspection.

## Controls

- Click the picture / Enter while the picture is focused / Space: play or pause. At accelerated speed, Play returns to 1×.
- Tap Right / Left on the picture or timeline: forward / back 15 seconds.
- Hold Right for 500ms: 2× playback. Release, then press again for 4×, then 8×. Repeated keydown events do not increase the speed. Left returns to normal speed and skips back 15 seconds.
- Down from the picture: focus player controls. Arrow keys move between controls. Up from the timeline returns focus to the picture. In the volume slider, Left / Right changes volume.
- Back / Escape: close subtitles, cancel accelerated speed, exit fullscreen, return focus to the picture, then return to the library, depending on current state.
- The controls hide after four idle seconds while the picture is focused and playback is active. They remain visible while a control has focus.
- Progress saves every three seconds, on pause, page exit, and loss of window focus. Resume ignores the first five and final thirty seconds. The first available subtitle track is enabled by default; subtitle choice, volume, and mute persist on that browser.

## TV compatibility and limits

Samsung's [web engine table](https://developer.samsung.com/smarttv/develop/specifications/web-engine-specifications.html) lists Tizen 7.0 as Chromium 94; it does not list a separate 7.2 target. The TV's exact user agent and physical playback still need checking. Tailwind 3.4 avoids [Tailwind 4's Chrome 111 requirement](https://tailwindcss.com/docs/compatibility), and Browserslist targets Chromium 94. Next 15 is used to retain the older browser baseline. The button is adapted from the [shadcn Base UI registry](https://ui.shadcn.com/r/styles/base-nova/button.json), with modern-only CSS replaced. UI motion uses only transform and opacity, respecting reduced motion.

Samsung's [2023 decoder specifications](https://developer.samsung.com/smarttv/develop/specifications/media-specifications/2023-tv-video-specifications.html) describe hardware support; browser behavior can differ. Actual TV verification must cover audio, subtitles, seeking, hold/release events, fullscreen, resume after closing the browser, and 2×/4×/8× playback. A TV browser may reserve remote buttons or limit playbackRate. No installed Tizen app or privileged remote-key registration is assumed.

Routes: `/`, `/?q=...`, `/w/<id>`. Media is streamed through registered IDs using bounded disk streams, HTTP 206 byte ranges, HEAD, ETags, and disconnect cleanup. Raw disk paths are never accepted in HTTP requests. Search matches title, director and genres; `%` and `_` follow SQLite LIKE wildcard semantics. SQLite reads happen on the server; playback state stays on each device.

This initial version is intended for a trusted LAN and has no authentication. WAN access, access control, HTTPS, bandwidth management, and series support remain future work.

## Development

```powershell
npm run typecheck
npm test
npm run build
# After a schema change:
npm run db:generate
npm run db:migrate
```

Generated migrations are checked in and applied explicitly, never on HTTP requests. Tests exercise streaming byte correctness and status codes, path confinement, subtitles and media preparation decisions. Physical TV validation is separate from these checks.
