import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const callbackSchema = z.object({
  code: z.string().min(1)
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = callbackSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Invalid callback payload.' }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.exchangeCodeForSession(parsed.data.code);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 401 });
  }

  return NextResponse.json({ ok: true });
}
