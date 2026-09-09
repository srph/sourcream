"use client";

import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, CircleHelp, Gauge, Maximize, Minimize, Pause, Play, RotateCcw, Subtitles, Volume2, VolumeX, X } from 'lucide-react';
import { Button } from './ui/button';
import { Spinner } from './ui/spinner';
import { moveFocus } from './focus-navigation';
import { readProgress, resumable, saveProgress } from '@/lib/progress';
import { RemoteSeek, remoteKey } from '@/lib/remote-seek';
import { timeLabel } from '@/lib/utils';
import { useIsTvMedia } from '@/lib/use-is-tv-media';

type Track = { id: string; language: string; label: string };
type Panel = 'debug' | 'help' | 'subtitles' | null;
type TransferRates = { download: number | null; upload: number | null };

function formatRate(bytesPerSecond: number | null) {
  if (bytesPerSecond === null) return '—';
  if (bytesPerSecond >= 1024 * 1024) return `${(bytesPerSecond / 1024 / 1024).toFixed(1)} MB/s`;
  if (bytesPerSecond >= 1024) return `${Math.round(bytesPerSecond / 1024)} KB/s`;
  return `${Math.round(bytesPerSecond)} B/s`;
}

function useTransferRates(id: string, active: boolean): TransferRates {
  const [rates, setRates] = useState<TransferRates>({ download: null, upload: null });
  useEffect(() => {
    if (!active) return;
    const resourceBytes = () => performance.getEntriesByType('resource')
      .filter(entry => entry.name.includes(`/api/movies/${id}/video`))
      .reduce((total, entry) => total + ((entry as PerformanceResourceTiming).transferSize || 0), 0);
    let previousBytes = resourceBytes(), previousAt = performance.now();
    const update = () => {
      const now = performance.now(), bytes = resourceBytes(), elapsed = Math.max(1, now - previousAt);
      const measured = Math.max(0, (bytes - previousBytes) * 1000 / elapsed);
      const connection = (navigator as Navigator & { connection?: { downlink?: number } }).connection;
      setRates({ download: measured || (connection?.downlink ? connection.downlink * 125000 : null), upload: 0 });
      previousBytes = bytes; previousAt = now;
    };
    update();
    const interval = window.setInterval(update, 1000);
    return () => window.clearInterval(interval);
  }, [active, id]);
  return rates;
}

export function Player({ id, title, duration: initialDuration, tracks, restart }: { id: string; title: string; duration: number; tracks: Track[]; restart: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null), rootRef = useRef<HTMLDivElement>(null), playRef = useRef<HTMLButtonElement>(null);
  const subtitleRef = useRef<HTMLButtonElement>(null), helpRef = useRef<HTMLButtonElement>(null), debugRef = useRef<HTMLButtonElement>(null);
  const [playing, setPlaying] = useState(false), [time, setTime] = useState(0), [duration, setDuration] = useState(initialDuration);
  const [volume, setVolume] = useState(1), [muted, setMuted] = useState(false), [rate, setRate] = useState(1);
  const [visible, setVisible] = useState(true), [panel, setPanelState] = useState<Panel>(null), [subtitle, setSubtitle] = useState(tracks[0]?.language || 'off');
  const [error, setError] = useState(''), [waiting, setWaiting] = useState(false), [fullscreen, setFullscreen] = useState(false), [ended, setEnded] = useState(false);
  const [scrubTime, setScrubTime] = useState<number | null>(null), [previewTime, setPreviewTime] = useState<number | null>(null), [previewAvailable, setPreviewAvailable] = useState(true);
  const panelRef = useRef<Panel>(null), visibleRef = useRef(true), lastActivity = useRef(Date.now()), subtitleChoice = useRef(tracks[0]?.language || 'off');
  const scrubTimeRef = useRef<number | null>(null), scrubbingRef = useRef(false);
  const isTvMedia = useIsTvMedia();
  const rates = useTransferRates(id, panel === 'debug');

  function setPanel(next: Panel) { panelRef.current = next; setPanelState(next); reveal(); }
  function reveal() { lastActivity.current = Date.now(); visibleRef.current = true; setVisible(true); }
  function storeSettings() {
    const video = videoRef.current;
    if (video) try { localStorage.setItem('sourcream:settings', JSON.stringify({ volume: video.volume, muted: video.muted, subtitle: subtitleChoice.current })); } catch { /* TV storage may be unavailable. */ }
  }
  function chooseSubtitle(language: string) {
    subtitleChoice.current = language; setSubtitle(language);
    const video = videoRef.current;
    if (video) for (let index = 0; index < video.textTracks.length; index++) video.textTracks[index].mode = index === tracks.findIndex(track => track.language === language) ? 'showing' : 'disabled';
    storeSettings();
  }
  function positionCues(chromeVisible = visibleRef.current) {
    const video = videoRef.current;
    if (!video) return;
    for (let trackIndex = 0; trackIndex < video.textTracks.length; trackIndex++) {
      const cues = video.textTracks[trackIndex].cues;
      if (!cues) continue;
      for (let cueIndex = 0; cueIndex < cues.length; cueIndex++) {
        const cue = cues[cueIndex] as VTTCue;
        if ('line' in cue) { cue.snapToLines = true; cue.line = chromeVisible ? -9 : -3; }
      }
    }
  }
  function normalRate() { if (videoRef.current) videoRef.current.playbackRate = 1; }
  function toggle() {
    const video = videoRef.current; if (!video) return;
    reveal();
    if (video.playbackRate !== 1) { normalRate(); return; }
    if (video.paused) void video.play().catch(() => { setError('Playback could not start. Press Play to retry.'); }); else video.pause();
  }
  async function toggleFullscreen() {
    reveal();
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (rootRef.current?.requestFullscreen) await rootRef.current.requestFullscreen();
      else setError('Fullscreen is unavailable in this browser. The player already fills the page.');
    } catch { setError('Fullscreen was unavailable. You can continue watching here.'); }
  }
  function stageScrub(value: number) {
    const next = Math.max(0, Math.min(duration, value));
    scrubTimeRef.current = next; setScrubTime(next); setPreviewTime(next); setPreviewAvailable(true); reveal();
  }
  function commitScrub(value = scrubTimeRef.current) {
    const video = videoRef.current;
    if (video && value !== null && Number.isFinite(video.duration)) { video.currentTime = value; setTime(value); }
    scrubTimeRef.current = null; scrubbingRef.current = false; setScrubTime(null); setPreviewTime(null);
  }
  function pointerTime(event: React.PointerEvent<HTMLInputElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    return duration * Math.max(0, Math.min(1, (event.clientX - box.left) / box.width));
  }

  useEffect(() => {
    const video = videoRef.current!, root = rootRef.current!;
    video.focus();
    let lastSave = 0;
    let waitingTimer: number | null = null;
    let initialSubtitle = tracks[0]?.language || 'off';
    try {
      const settings = JSON.parse(localStorage.getItem('sourcream:settings') || '{}');
      if (Number.isFinite(settings.volume)) video.volume = Math.max(0, Math.min(1, settings.volume));
      video.muted = settings.muted === true;
      if (typeof settings.subtitle === 'string' && (settings.subtitle === 'off' || tracks.some(track => track.language === settings.subtitle))) initialSubtitle = settings.subtitle;
    } catch { /* Use defaults. */ }
    subtitleChoice.current = initialSubtitle; setSubtitle(initialSubtitle); setVolume(video.volume); setMuted(video.muted);
    try { localStorage.setItem('sourcream:settings', JSON.stringify({ volume: video.volume, muted: video.muted, subtitle: initialSubtitle })); } catch { /* TV storage may be unavailable. */ }
    function persist() { saveProgress(id, video.currentTime, video.duration); }
    function applyTracks() {
      for (let index = 0; index < video.textTracks.length; index++) video.textTracks[index].mode = index === tracks.findIndex(track => track.language === subtitleChoice.current) ? 'showing' : 'disabled';
      positionCues();
    }
    function onCueChange() { positionCues(); }
    function onAddTrack(event: TrackEvent) { event.track?.addEventListener('cuechange', onCueChange); applyTracks(); }
    function metadata() {
      if (Number.isFinite(video.duration)) setDuration(video.duration);
      const saved = readProgress(id);
      if (!restart && resumable(saved)) video.currentTime = Math.min(saved!.time, video.duration - 1);
      applyTracks(); void video.play().catch(() => { visibleRef.current = true; setVisible(true); });
    }
    function update() { setTime(video.currentTime); if (Date.now() - lastSave > 3000) { persist(); lastSave = Date.now(); } }
    function onPlay() { setPlaying(true); setEnded(false); setError(''); }
    function onPause() { setPlaying(false); visibleRef.current = true; setVisible(true); persist(); }
    function onEnded() { setEnded(true); setPlaying(false); visibleRef.current = true; setVisible(true); video.playbackRate = 1; saveProgress(id, video.duration, video.duration); }
    function onRate() { setRate(video.playbackRate); }
    function onVolume() { setVolume(video.volume); setMuted(video.muted); }
    function stopWaiting() {
      if (waitingTimer !== null) window.clearTimeout(waitingTimer);
      waitingTimer = null; setWaiting(false);
    }
    function onError() { stopWaiting(); setError('This movie could not be played. Check the drive connection and try again. If it persists, prepare a compatible MP4.'); visibleRef.current = true; setVisible(true); }
    function onWaiting() {
      if (waitingTimer !== null) return;
      waitingTimer = window.setTimeout(() => { waitingTimer = null; setWaiting(true); }, 600);
    }
    function onReady() { stopWaiting(); }
    function onFullscreen() { setFullscreen(!!document.fullscreenElement); }
    function seek(delta: number) { if (Number.isFinite(video.duration)) video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + delta)); }
    function speedUp() { try { video.playbackRate = Math.min(8, video.playbackRate < 2 ? 2 : video.playbackRate * 2); void video.play().catch(() => setVisible(true)); } catch { video.playbackRate = 1; setError('This browser cannot fast-play this file. Use 15-second jumps.'); } }
    const remoteSeek = new RemoteSeek({ rate: () => video.playbackRate, speedUp, normal: () => { video.playbackRate = 1; }, seek });
    function keyDown(event: KeyboardEvent) {
      const key = remoteKey(event), target = event.target as HTMLElement;
      if (key === 'Escape' || key === 'Backspace' || event.keyCode === 10009) {
        event.preventDefault();
        if (panelRef.current) {
          const closing = panelRef.current; setPanel(null);
          (closing === 'subtitles' ? subtitleRef : closing === 'help' ? helpRef : debugRef).current?.focus();
        } else if (video.playbackRate !== 1) video.playbackRate = 1;
        else if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
        else if (target !== video) video.focus();
        else { persist(); window.location.assign('/'); }
        return;
      }
      if (panelRef.current && key.startsWith('Arrow')) { event.preventDefault(); moveFocus(key, document.querySelector(`[data-panel="${panelRef.current}"]`)!); return; }
      if (key === ' ' || key === 'MediaPlayPause' || event.keyCode === 10252 || ((key === 'Enter' || key === 'Select') && target === video)) { event.preventDefault(); if (!event.repeat) toggle(); return; }
      if (key === 'MediaPlay' || event.keyCode === 415) { event.preventDefault(); video.playbackRate = 1; void video.play().catch(() => setVisible(true)); return; }
      if (key === 'MediaPause' || event.keyCode === 19) { event.preventDefault(); video.pause(); return; }
      if (!key.startsWith('Arrow')) return;
      reveal();
      if (target instanceof HTMLInputElement && target.type === 'range' && ['ArrowLeft', 'ArrowRight'].includes(key)) return;
      const onSurface = target === video || target === root || target.dataset.seek === 'true';
      if (onSurface && (key === 'ArrowRight' || key === 'ArrowLeft')) { event.preventDefault(); remoteSeek.down(key); return; }
      event.preventDefault();
      if (target === video && (key === 'ArrowDown' || key === 'ArrowUp')) playRef.current?.focus();
      else if (target.dataset.seek === 'true' && key === 'ArrowUp') video.focus();
      else moveFocus(key, root);
    }
    function keyUp(event: KeyboardEvent) { if (remoteSeek.up(remoteKey(event))) event.preventDefault(); }
    function blur() { remoteSeek.cancel(); persist(); if (video.playbackRate !== 1) video.playbackRate = 1; }
    function visibilityChange() { if (document.hidden) blur(); }
    const events = { loadedmetadata: metadata, timeupdate: update, play: onPlay, pause: onPause, ended: onEnded, ratechange: onRate, volumechange: onVolume, error: onError, waiting: onWaiting, playing: onReady, canplay: onReady, seeked: onReady };
    for (const [name, handler] of Object.entries(events)) video.addEventListener(name, handler);
    for (let index = 0; index < video.textTracks.length; index++) video.textTracks[index].addEventListener('cuechange', onCueChange);
    video.textTracks.addEventListener('addtrack', onAddTrack);
    document.addEventListener('keydown', keyDown); document.addEventListener('keyup', keyUp);
    document.addEventListener('fullscreenchange', onFullscreen); document.addEventListener('visibilitychange', visibilityChange);
    window.addEventListener('pagehide', persist); window.addEventListener('blur', blur);
    const hide = window.setInterval(() => {
      if (!video.paused && !panelRef.current && Date.now() - lastActivity.current > 4000) {
        visibleRef.current = false; setVisible(false); positionCues(false);
        if (document.activeElement !== video) video.focus();
      }
    }, 500);
    if (video.readyState >= 1) metadata();
    return () => {
      persist(); remoteSeek.cancel(); window.clearInterval(hide);
      if (waitingTimer !== null) window.clearTimeout(waitingTimer);
      for (const [name, handler] of Object.entries(events)) video.removeEventListener(name, handler);
      for (let index = 0; index < video.textTracks.length; index++) video.textTracks[index].removeEventListener('cuechange', onCueChange);
      video.textTracks.removeEventListener('addtrack', onAddTrack);
      document.removeEventListener('keydown', keyDown); document.removeEventListener('keyup', keyUp);
      document.removeEventListener('fullscreenchange', onFullscreen); document.removeEventListener('visibilitychange', visibilityChange);
      window.removeEventListener('pagehide', persist); window.removeEventListener('blur', blur);
    };
    // Native media listeners are deliberately installed once per movie.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, restart, tracks]);

  useEffect(() => { positionCues(visible); }, [visible]);
  useEffect(() => {
    if (!panel) return;
    const selector = panel === 'subtitles' ? '[data-panel="subtitles"] [aria-checked="true"]' : `[data-panel="${panel}"] [data-tv-focus]`;
    window.setTimeout(() => document.querySelector<HTMLElement>(selector)?.focus(), 0);
  }, [panel]);

  const tabIndex = visible ? 0 : -1;
  const shownTime = scrubTime ?? time;
  const shownPreview = scrubTime ?? previewTime;
  const previewPercent = duration && shownPreview !== null ? shownPreview / duration * 100 : 0;
  const previewLeft = Math.max(8, Math.min(92, previewPercent));
  const previewFrame = shownPreview === null ? 1 : Math.floor(shownPreview / 10) + 1;

  return <div ref={rootRef} className={`relative h-screen w-full overflow-hidden bg-black ${visible ? '' : 'cursor-none'}`} onMouseMove={reveal} onTouchStart={reveal}>
    <video ref={videoRef} className="h-full w-full object-contain outline-none" src={`/api/movies/${id}/video`} poster={`/api/movies/${id}/art`} preload="metadata" playsInline tabIndex={0} aria-label={`${title}. Enter to play or pause. Left or right to seek. Down for controls.`} onClick={() => { videoRef.current?.focus(); toggle(); }}>
      {tracks.map(track => <track key={track.id} kind="subtitles" src={`/api/subtitles/${track.id}`} srcLang={track.language} label={track.label} onLoad={() => positionCues()} />)}
    </video>

    <div className={`absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/80 to-transparent px-[4%] py-8 transition-opacity ${visible ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}`} aria-hidden={!visible}>
      <a href="/" data-tv-focus tabIndex={tabIndex} className="inline-flex items-center gap-4 rounded-lg p-3 text-lg" onFocus={reveal}><ArrowLeft size={24} /> Library</a><span className="text-2xl font-semibold tracking-tight">sourcream.</span>
    </div>
    {waiting && <div className="pointer-events-none absolute inset-0 grid place-items-center">
      <span className="rounded-full bg-black/60 p-3 text-white shadow-xl"><Spinner label="Buffering" /></span>
    </div>}
    {rate > 1 && <button className="absolute left-1/2 top-24 -translate-x-1/2 rounded-lg border border-line bg-panel px-7 py-4 text-2xl text-accent" onClick={normalRate} aria-label="Return to normal speed">{rate}× <span className="mt-1 block text-xs text-neutral-300">Press Play for normal speed</span></button>}
    {error && <div className="absolute left-1/2 top-1/3 w-4/5 max-w-2xl -translate-x-1/2 rounded-xl border border-line bg-panel p-8 text-center" role="alert"><p className="mb-6 leading-7">{error}</p><Button onClick={() => { setError(''); videoRef.current?.load(); }} data-tv-focus>Retry playback</Button></div>}
    {ended && <div className="absolute left-1/2 top-1/3 w-4/5 max-w-2xl -translate-x-1/2 rounded-xl border border-line bg-panel p-8 text-center"><p>That’s a wrap.</p><h1 className="my-5 text-3xl">{title}</h1><div className="flex justify-center gap-4 max-sm:flex-col"><Button data-tv-focus onClick={() => { const video = videoRef.current!; video.currentTime = 0; void video.play().catch(() => {}); video.focus(); }}><RotateCcw size={21} /> Watch again</Button><a href="/" data-tv-focus className="inline-flex min-h-14 items-center justify-center rounded-lg border border-line bg-control px-6 font-medium">Back to library</a></div></div>}

    {panel === 'help' && <div data-panel="help" className="absolute inset-0 z-50 grid place-items-center bg-black/70 p-8" role="dialog" aria-modal="true" aria-labelledby="help-title">
      <div className="w-full max-w-xl rounded-xl border border-line bg-panel p-7 shadow-2xl"><div className="mb-6 flex items-center justify-between"><h2 id="help-title" className="text-2xl font-semibold">Player controls</h2><Button size="icon" variant="ghost" data-tv-focus aria-label="Close help" onClick={() => { setPanel(null); helpRef.current?.focus(); }}><X /></Button></div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-8 gap-y-4 text-base"><dt className="font-semibold text-accent">Enter / Space</dt><dd>Play or pause</dd><dt className="font-semibold text-accent">← / →</dt><dd>Skip 15 seconds</dd><dt className="font-semibold text-accent">Hold →</dt><dd>Start 2× playback; press again for 4× and 8×</dd><dt className="font-semibold text-accent">Play</dt><dd>Return to normal speed</dd><dt className="font-semibold text-accent">↓</dt><dd>Move from the picture to controls</dd><dt className="font-semibold text-accent">Back</dt><dd>Close a panel, exit fullscreen, or return to the library</dd></dl>
      </div></div>}
    {panel === 'debug' && <div data-panel="debug" className="absolute bottom-40 right-[4%] z-40 w-72 rounded-xl border border-line bg-panel p-5 shadow-2xl" role="status"><div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold uppercase tracking-widest text-muted">Transfer rate</h2><button data-tv-focus className="rounded p-2 text-muted hover:text-foreground" aria-label="Close debug rates" onClick={() => { setPanel(null); debugRef.current?.focus(); }}><X size={18} /></button></div><div className="flex justify-between py-2"><span>Download</span><strong className="font-medium text-accent">{formatRate(rates.download)}</strong></div><div className="flex justify-between py-2"><span>Upload</span><strong className="font-medium text-accent">{formatRate(rates.upload)}</strong></div></div>}
    {panel === 'subtitles' && <div data-panel="subtitles" className="absolute bottom-40 right-[4%] z-40 w-72 rounded-xl border border-line bg-panel p-4 shadow-2xl" role="radiogroup" aria-label="Subtitles"><h2 className="mx-2 mb-2 text-sm text-muted">Subtitles</h2>{[{ language: 'off', label: 'Off' }, ...tracks].filter((track, index, all) => all.findIndex(value => value.language === track.language) === index).map(track => <button className="flex w-full items-center justify-between rounded-lg p-3 text-left text-lg focus-visible:text-accent" key={track.language} data-tv-focus role="radio" aria-checked={subtitle === track.language} onClick={() => { chooseSubtitle(track.language); setPanel(null); subtitleRef.current?.focus(); }}>{track.label}{subtitle === track.language && <Check size={20} />}</button>)}</div>}

    <div className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/90 to-transparent px-[4%] pb-6 pt-24 transition-opacity ${visible ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}`} aria-hidden={!visible} onFocus={reveal}>
      <div className="flex items-center gap-5 text-sm tabular-nums tv:text-lg"><span className="min-w-[60px]">{timeLabel(shownTime)}</span><div className="relative flex-1">
        {shownPreview !== null && previewAvailable && <div className="pointer-events-none absolute bottom-9 z-30 -translate-x-1/2 overflow-hidden rounded-lg border border-white/30 bg-black shadow-xl" style={{ left: `${previewLeft}%` }}><img key={previewFrame} className="h-28 w-48 object-cover" src={`/api/movies/${id}/preview/${previewFrame}`} alt="" onError={() => setPreviewAvailable(false)} /><span className="block px-2 py-1 text-center text-xs text-white">{timeLabel(shownPreview)}</span></div>}
        <input aria-label="Movie position" aria-valuetext={`${timeLabel(shownTime)} of ${timeLabel(duration)}`} data-seek="true" data-tv-focus tabIndex={tabIndex} className="timeline-range h-7 w-full" type="range" min={0} max={duration} step={1} value={Math.min(shownTime, duration)} style={{ '--progress': `${duration ? shownTime / duration * 100 : 0}%` } as React.CSSProperties}
          onChange={event => stageScrub(Number(event.target.value))}
          onPointerDown={event => { scrubbingRef.current = true; stageScrub(pointerTime(event)); }}
          onPointerMove={event => { const next = pointerTime(event); if (scrubbingRef.current) stageScrub(next); else { setPreviewTime(next); setPreviewAvailable(true); } }}
          onPointerUp={event => { const next = pointerTime(event); stageScrub(next); commitScrub(next); }}
          onPointerCancel={() => commitScrub()}
          onPointerLeave={() => { if (!scrubbingRef.current) setPreviewTime(null); }}
          onKeyUp={event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') commitScrub(); }}
          onBlur={() => commitScrub()} />
      </div><span className="min-w-[60px] text-right">{timeLabel(duration)}</span></div>
      <div className="mt-4 flex items-center gap-4 tv:gap-6"><Button ref={playRef} variant="ghost" size="icon" data-tv-focus tabIndex={tabIndex} aria-label={rate > 1 ? 'Normal speed' : playing ? 'Pause' : 'Play'} onClick={toggle}>{playing && rate === 1 ? <Pause fill="currentColor" /> : <Play fill="currentColor" />}</Button>
        {!isTvMedia && <div className="flex items-center gap-1"><Button variant="ghost" size="icon" data-tv-focus tabIndex={tabIndex} aria-label={muted ? 'Unmute' : 'Mute'} onClick={() => { videoRef.current!.muted = !videoRef.current!.muted; storeSettings(); }}>{muted || volume === 0 ? <VolumeX /> : <Volume2 />}</Button><input className="w-20 accent-accent max-lg:hidden" type="range" min={0} max={1} step={0.05} value={muted ? 0 : volume} aria-label="Volume" data-tv-focus tabIndex={tabIndex} onChange={event => { videoRef.current!.volume = Number(event.target.value); videoRef.current!.muted = false; storeSettings(); }} /></div>}
        <div className="ml-6 mr-auto min-w-0 max-sm:hidden"><h1 className="truncate text-lg font-medium tv:text-2xl">{title}</h1></div>
        <Button ref={debugRef} variant="ghost" size="icon" data-tv-focus tabIndex={tabIndex} aria-label="Debug transfer rate" aria-expanded={panel === 'debug'} onClick={() => setPanel(panel === 'debug' ? null : 'debug')}><Gauge /></Button>
        <Button ref={helpRef} variant="ghost" size="icon" data-tv-focus tabIndex={tabIndex} aria-label="Player help" aria-expanded={panel === 'help'} onClick={() => setPanel(panel === 'help' ? null : 'help')}><CircleHelp /></Button>
        <Button ref={subtitleRef} variant="ghost" size="icon" data-tv-focus tabIndex={tabIndex} aria-label="Subtitles" aria-expanded={panel === 'subtitles'} disabled={!tracks.length} onClick={() => setPanel(panel === 'subtitles' ? null : 'subtitles')}><Subtitles /></Button>
        <Button variant="ghost" size="icon" data-tv-focus tabIndex={tabIndex} aria-label={fullscreen ? 'Exit fullscreen' : 'Fullscreen'} onClick={toggleFullscreen}>{fullscreen ? <Minimize /> : <Maximize />}</Button>
      </div>
    </div>
  </div>;
}
