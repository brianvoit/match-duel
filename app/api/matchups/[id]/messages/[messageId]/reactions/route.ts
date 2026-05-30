import { getAuthenticatedUser } from '@/lib/supabase/get-user';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServiceRoleClient } from '@/lib/supabase/service';

const PRESET = new Set(['👍', '❤️', '😂', '😮', '💀', '💯', '👌']);

const schema = z.object({ emoji: z.string().refine((e) => PRESET.has(e), 'Invalid emoji.') });

interface RouteContext {
  params: Promise<{ id: string; messageId: string }>;
}

export async function POST(req: NextRequest, context: RouteContext) {
  const { id: matchupId, messageId } = await context.params;
    const appUser = await getAuthenticatedUser();
  if (!appUser) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'Invalid emoji.' }, { status: 400 });
  const service = createServiceRoleClient();

  // Verify message belongs to a matchup the user is in
  const { data: msg } = await service
    .from('message').select('matchup_id').eq('id', messageId).maybeSingle();
  if (!msg || msg.matchup_id !== matchupId)
    return NextResponse.json({ ok: false, error: 'Message not found.' }, { status: 404 });

  const { data: participant } = await service
    .from('matchup_participant').select('id').eq('matchup_id', matchupId).eq('user_id', appUser.id).maybeSingle();
  if (!participant) return NextResponse.json({ ok: false, error: 'Not a participant.' }, { status: 403 });

  const { data: existing } = await service
    .from('message_reaction')
    .select('id')
    .eq('message_id', messageId)
    .eq('user_id', appUser.id)
    .eq('emoji', parsed.data.emoji)
    .maybeSingle();

  if (existing) {
    await service.from('message_reaction').delete().eq('id', existing.id);
    return NextResponse.json({ ok: true, action: 'removed' });
  }

  await service.from('message_reaction').insert({
    message_id: messageId,
    user_id: appUser.id,
    emoji: parsed.data.emoji,
  });
  return NextResponse.json({ ok: true, action: 'added' });
}
