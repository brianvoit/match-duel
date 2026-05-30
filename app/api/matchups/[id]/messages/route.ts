import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service';
import { ensureAppUser } from '@/lib/supabase/user';
import { createNotificationEvents } from '@/lib/notifications';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, context: RouteContext) {
  const { id: matchupId } = await context.params;
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const appUser = await ensureAppUser(user);
  const service = createServiceRoleClient();

  // Verify participant
  const { data: participant } = await service
    .from('matchup_participant').select('id').eq('matchup_id', matchupId).eq('user_id', appUser.id).maybeSingle();
  if (!participant) return NextResponse.json({ ok: false, error: 'Not a participant.' }, { status: 403 });

  const { data, error } = await service
    .from('message')
    .select(`id, sender_id, content, created_at,
      sender:app_user!sender_id(display_name, avatar_url),
      reactions:message_reaction(user_id, emoji)`)
    .eq('matchup_id', matchupId)
    .order('created_at', { ascending: true }) as {
      data: Array<{
        id: string; sender_id: string; content: string; created_at: string;
        sender: { display_name: string | null; avatar_url: string | null } | null;
        reactions: Array<{ user_id: string; emoji: string }>;
      }> | null;
      error: { message: string } | null;
    };

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const messages = (data ?? []).map((m) => ({
    id: m.id,
    senderId: m.sender_id,
    senderName: m.sender?.display_name ?? null,
    senderAvatar: m.sender?.avatar_url ?? null,
    content: m.content,
    createdAt: m.created_at,
    reactions: m.reactions ?? [],
  }));

  return NextResponse.json({ ok: true, messages });
}

const sendSchema = z.object({ content: z.string().trim().min(1).max(500) });

export async function POST(req: NextRequest, context: RouteContext) {
  const { id: matchupId } = await context.params;
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = sendSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'Invalid payload.' }, { status: 400 });

  const appUser = await ensureAppUser(user);
  const service = createServiceRoleClient();

  const { error } = await service.from('message').insert({
    matchup_id: matchupId,
    sender_id: appUser.id,
    content: parsed.data.content,
  });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  // Notify opponent if inactive — fire-and-forget
  notifyOpponentOfMessage(service, matchupId, appUser).catch(() => {});

  return NextResponse.json({ ok: true });
}

async function notifyOpponentOfMessage(
  service: ReturnType<typeof createServiceRoleClient>,
  matchupId: string,
  sender: { id: string; display_name: string | null; email: string }
) {
  const { data: opp } = await service
    .from('matchup_participant')
    .select('user_id, app_user:user_id(last_active_at)')
    .eq('matchup_id', matchupId)
    .neq('user_id', sender.id)
    .maybeSingle() as {
      data: { user_id: string; app_user: { last_active_at: string | null } | null } | null;
    };

  if (!opp) return;
  const lastActive = opp.app_user?.last_active_at;
  const isActive = lastActive && Date.now() - new Date(lastActive).getTime() < 60_000;
  if (isActive) return;

  const senderLabel = sender.display_name || sender.email.split('@')[0];
  await createNotificationEvents([{
    userId: opp.user_id,
    matchupId,
    eventType: 'NEW_MESSAGE',
    payload: { title: senderLabel, body: 'Sent you a message', url: '/play', tag: `chat-${matchupId}` },
  }]);
}
