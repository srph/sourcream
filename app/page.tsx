import { desc, like, or } from 'drizzle-orm';
import { db } from '@/db';
import { movies } from '@/db/schema';
import { Library } from '@/components/library';
export const dynamic = 'force-dynamic';
export default async function Home({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const params = await searchParams;
  const q = typeof params.q === 'string' ? params.q.trim().slice(0, 200) : '';
  const rows = db.select().from(movies).where(q ? or(like(movies.title, `%${q}%`), like(movies.director, `%${q}%`), like(movies.genres, `%${q}%`)) : undefined).orderBy(desc(movies.addedAt)).all();
  const items = rows.map(({ id, title, year, synopsis, director, genres, duration, width }) => ({ id, title, year, synopsis, director, genres, duration, width }));
  return <Library movies={items} query={q} />;
}
