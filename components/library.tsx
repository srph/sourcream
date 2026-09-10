"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowUpRight, Film, Play, Search, X } from 'lucide-react';
import { FocusNavigation } from './focus-navigation';
import { Button } from './ui/button';
import { readProgress, resumable, type Progress } from '@/lib/progress';
import { timeLabel } from '@/lib/utils';

export type LibraryMovie = { id: string; title: string; year: number; synopsis: string; director: string; genres: string[]; duration: number; width: number };

export function Library({ movies, query }: { movies: LibraryMovie[]; query: string }) {
  const router = useRouter();
  const [search, setSearch] = useState(query);
  const [progress, setProgress] = useState<Record<string, Progress>>({});
  const [selected, setSelected] = useState(movies[0]?.id);

  useEffect(() => {
    const next: Record<string, Progress> = {};
    movies.forEach(movie => { const value = readProgress(movie.id); if (value) next[movie.id] = value; });
    setProgress(next);
  }, [movies]);

  useEffect(() => { setSearch(query); }, [query]);
  useEffect(() => {
    if (search === query) return;
    const timeout = window.setTimeout(() => router.replace(search.trim() ? `/?q=${encodeURIComponent(search.trim())}` : '/'), 350);
    return () => window.clearTimeout(timeout);
  }, [query, router, search]);

  const feature = movies.find(movie => movie.id === selected) || movies[0];
  const continueMovies = movies.filter(movie => resumable(progress[movie.id]));

  function card(movie: LibraryMovie, continuing = false) {
    const value = progress[movie.id];
    return <a key={movie.id} href={`/w/${movie.id}`} data-tv-focus className="group min-w-0 rounded-lg transition-transform duration-150 focus-visible:-translate-y-1" onFocus={() => setSelected(movie.id)}>
      <div className="relative aspect-video overflow-hidden rounded-lg bg-raised">
        <img className="h-full w-full object-cover" src={`/api/movies/${movie.id}/art?kind=poster`} alt="" loading="lazy" onError={event => { event.currentTarget.style.display = 'none'; }} />
        <span className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/70 to-transparent" />
        <span className="absolute left-1/2 top-1/2 z-10 grid h-12 w-12 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-accent text-black opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"><Play fill="currentColor" size={24} /></span>
        <span className="absolute bottom-3 right-3 z-10 text-xs text-white">{Math.round(movie.duration / 60)} min</span>
        {resumable(value) && <span className="absolute inset-x-0 bottom-0 z-20 h-1 bg-white/40"><span className="block h-full bg-accent" style={{ width: `${Math.min(100, value.time / value.duration * 100)}%` }} /></span>}
      </div>
      <div className="mt-4 flex items-start justify-between gap-3 text-base font-medium leading-6 tv:text-xl">{movie.title}<ArrowUpRight className="mt-1 shrink-0 text-muted" size={18} /></div>
      <p className="mt-2 text-sm leading-5 text-muted">{continuing && value ? `${Math.ceil((value.duration - value.time) / 60)} min left` : `${movie.year} · ${movie.genres.join(' / ')}`}</p>
    </a>;
  }

  return <main><FocusNavigation />
    <header className="relative z-30 flex h-20 items-center gap-8 border-b border-white/5 px-[5%]">
      <a href="/" className="flex items-center text-2xl font-bold tracking-tight" data-tv-focus><span className="mr-3 grid h-10 w-10 place-items-center rounded-xl bg-accent text-black"><Film size={23} /></span>sourcream<span className="text-accent">.</span></a>
      <form action="/" className="ml-auto flex w-80 items-center gap-3 rounded-lg border border-line bg-panel px-4 text-muted outline-offset-4 transition-colors focus-within:outline focus-within:outline-2 focus-within:outline-accent" onSubmit={event => { event.preventDefault(); router.replace(search.trim() ? `/?q=${encodeURIComponent(search.trim())}` : '/'); }}>
        <Search className="shrink-0" size={21} />
        <input className="w-full min-w-0 border-0 bg-transparent py-3 text-sm text-foreground outline-none" name="q" aria-label="Search movies" placeholder="Search your library" value={search} onChange={event => setSearch(event.target.value)} data-tv-focus />
      </form>
    </header>

    {query ? <section className="px-[5%] py-12">
      <a href="/" data-tv-focus className="inline-flex items-center gap-3 text-sm text-foreground"><ArrowLeft size={19} /> All movies</a>
      <h1 className="mb-3 mt-7 text-4xl font-medium tracking-tight">Results for “{query}”</h1><p className="text-muted">{movies.length} {movies.length === 1 ? 'movie' : 'movies'} in your library</p>
    </section> : feature && <section className="relative flex h-[59vw] min-h-[590px] max-h-[760px] items-center overflow-hidden max-sm:min-h-[600px] max-sm:items-end">
      <div className="absolute inset-y-0 left-1/4 right-0 bg-raised max-sm:inset-x-0 max-sm:top-0 max-sm:h-3/5"><img className="h-full w-full object-cover object-center" src={`/api/movies/${feature.id}/art`} alt="" onError={event => { event.currentTarget.style.display = 'none'; }} /></div>
      <div className="absolute inset-0 bg-gradient-to-r from-background via-background/70 to-transparent" /><div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />
      <div className="relative w-3/5 max-w-4xl px-[5%] py-12 max-lg:w-4/5 max-sm:w-full max-sm:pb-12 max-sm:pt-32">
        <h1 className="mb-7 max-w-3xl text-6xl font-semibold leading-none tracking-tighter max-sm:text-4xl">{feature.title}</h1>
        <div className="flex flex-wrap items-center gap-5 text-sm text-neutral-300"><span>{feature.year}</span><span>{Math.floor(feature.duration / 3600)}h {Math.round(feature.duration / 60) % 60}m</span><span className="rounded border border-neutral-500 p-1 text-xs font-semibold">{feature.width >= 1920 ? '1080' : 'HD'}</span>{feature.genres.map(genre => <span key={genre}>{genre}</span>)}</div>
        <p className="my-6 max-w-xl text-base leading-7 text-neutral-300">{feature.synopsis}</p>
        <div className="flex flex-wrap gap-4"><a data-tv-focus href={`/w/${feature.id}`} className="inline-flex min-h-14 items-center justify-center gap-3 rounded-lg bg-accent px-6 font-semibold text-black transition-transform focus-visible:scale-105"><Play size={23} fill="currentColor" />{resumable(progress[feature.id]) ? `Resume · ${timeLabel(progress[feature.id].time)}` : 'Watch movie'}</a>{resumable(progress[feature.id]) && <a data-tv-focus href={`/w/${feature.id}?restart=1`} className="inline-flex min-h-14 items-center rounded-lg border border-line bg-control px-6 font-semibold">Start over</a>}</div>
        {feature.director && <p className="mt-6 text-sm text-muted">A film by <span className="text-neutral-300">{feature.director}</span></p>}
      </div>
    </section>}

    <div className="relative -mt-3 px-[5%]">{!query && continueMovies.length > 0 && <section className="mb-12"><div className="mb-6 flex items-center justify-between"><h2 className="text-2xl font-medium tracking-tight">Continue watching</h2></div><div className="grid grid-cols-4 gap-6 max-lg:grid-cols-3 max-sm:grid-cols-2 max-sm:gap-4">{continueMovies.map(movie => card(movie, true))}</div></section>}
      <section className="mb-12"><div className="mb-6 flex items-center justify-between"><h2 className="flex items-center gap-4 text-2xl font-medium tracking-tight">{query ? 'Search results' : 'Your collection'}<span className="rounded border border-line bg-raised px-2 py-1 text-xs tracking-normal text-muted">{movies.length.toString().padStart(2, '0')}</span></h2></div>
        {movies.length ? <div className="grid grid-cols-4 gap-6 max-lg:grid-cols-3 max-sm:grid-cols-2 max-sm:gap-4">{movies.map(movie => card(movie))}</div> : <div className="rounded-xl border border-line px-8 py-16 text-center text-muted"><Film className="mx-auto mb-5" size={40} /><h2 className="mb-3 text-3xl text-foreground">{query ? 'No movies found' : 'Make room for movie night.'}</h2><p className="mb-6">{query ? 'Try a different title, director, or genre.' : 'Your movies will appear here once they’re added to the library.'}</p>{query && <Button render={<a href="/" />} nativeButton={false} data-tv-focus variant="secondary"><X size={18} />Clear search</Button>}</div>}
      </section><footer className="flex justify-between border-t border-line py-7 text-xs text-muted"><span>Crafted by Kier Borromeo</span></footer>
    </div>
  </main>;
}
