import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { movies } from '@/db/schema';
import { assetsRoot } from '@/lib/config';
import { fileResponse } from '@/lib/files';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: { params: Promise<{ id: string; frame: string }> }) {
  const { id, frame } = await context.params;
  if (!/^[a-z0-9-]+$/.test(id) || !/^[1-9][0-9]*$/.test(frame)) return new Response(null, { status: 404 });
  const movie = db.select({ duration: movies.duration }).from(movies).where(eq(movies.id, id)).get();
  const frameNumber = Number(frame);
  if (!movie || !Number.isSafeInteger(frameNumber) || frameNumber > Math.ceil(movie.duration / 10) + 1) return new Response(null, { status: 404 });
  return fileResponse(request, assetsRoot, `${id}/previews/${String(frameNumber).padStart(6, '0')}.jpg`, 'image/jpeg');
}

export const HEAD = GET;
