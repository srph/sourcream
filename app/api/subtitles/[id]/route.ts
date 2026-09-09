import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { subtitles } from '@/db/schema';
import { assetsRoot } from '@/lib/config';
import { fileResponse } from '@/lib/files';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const subtitle = db.select().from(subtitles).where(eq(subtitles.id, id)).get();
  if (!subtitle) return new Response(null, { status: 404 });
  return fileResponse(request, assetsRoot, subtitle.assetPath, 'text/vtt; charset=utf-8');
}
