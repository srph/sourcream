import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { movies } from '@/db/schema';
import { assetsRoot } from '@/lib/config';
import { fileResponse } from '@/lib/files';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!/^[a-z0-9-]+$/.test(id) || !db.select({ id: movies.id }).from(movies).where(eq(movies.id, id)).get()) return new Response(null, { status: 404 });
  const kind = new URL(request.url).searchParams.get('kind');
  return fileResponse(request, assetsRoot, `${id}/${kind === 'poster' ? 'poster' : 'backdrop'}.jpg`, 'image/jpeg');
}
export const HEAD = GET;
