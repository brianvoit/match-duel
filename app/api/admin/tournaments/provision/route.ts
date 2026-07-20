import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { provisionTournament } from '@/lib/supabase/provisionTournament';

/**
 * Idempotently stand up a tournament + its rounds from a format descriptor —
 * replaces the old hand-run SQL. Guarded by JOB_ADMIN_TOKEN (like the other admin
 * routes). Defaults to inactive; pass activate:true to switch the live tournament.
 *
 * POST body: { name, year, format: 'MENS_48'|'WOMENS_32', leagueId, season,
 *              startsAt (ISO), endsAt?, activate? }
 */
const bodySchema = z.object({
  name: z.string().min(1),
  year: z.number().int().min(1900).max(3000),
  format: z.enum(['MENS_48', 'WOMENS_32']),
  leagueId: z.number().int().positive(),
  season: z.number().int().min(1900).max(3000),
  startsAt: z.string().min(1),
  endsAt: z.string().nullable().optional(),
  activate: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  const token = process.env.JOB_ADMIN_TOKEN;
  if (token) {
    const auth = req.headers.get('Authorization');
    if (auth !== `Bearer ${token}`) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }
  }

  let parsed;
  try {
    parsed = bodySchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: 'Invalid body', details: err instanceof z.ZodError ? err.flatten() : String(err) },
      { status: 400 }
    );
  }

  try {
    const result = await provisionTournament(parsed);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
