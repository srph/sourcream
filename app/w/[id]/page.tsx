import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { db } from '@/db';
import { movies, subtitles } from '@/db/schema';
import { Player } from '@/components/player';
export const dynamic = 'force-dynamic';
export default async function Watch({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ restart?: string }> }) {
  const { id } = await params;
  const movie = db.select().from(movies).where(eq(movies.id, id)).get();
  if (!movie) notFound();
  const tracks = db.select({ id: subtitles.id, language: subtitles.language, label: subtitles.label }).from(subtitles).where(eq(subtitles.movieId, id)).all();
  return <Player id={id} title={movie.title} duration={movie.duration} tracks={tracks} restart={(await searchParams).restart === '1'} />;
}
