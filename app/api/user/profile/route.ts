import { getAuthenticatedUser } from '@/lib/supabase/get-user';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServiceRoleClient } from '@/lib/supabase/service';

const STAGES = ['GROUP','ROUND_OF_32','ROUND_OF_16','QUARTERFINAL','SEMIFINAL','THIRD_PLACE','FINAL'] as const;

const notifPrefsSchema = z.object({
  pick_reminder:   z.boolean().optional(),
  match_finished:  z.array(z.enum(STAGES)).optional(),
  round_complete:  z.boolean().optional(),
  chat_message:    z.boolean().optional(),
});

const patchSchema = z.object({
  displayName:              z.string().trim().min(1).max(64).optional(),
  defaultPickSide:          z.enum(['HOME', 'AWAY']).optional(),
  notificationPreferences:  notifPrefsSchema.optional(),
}).refine(
  (d) => d.displayName !== undefined || d.defaultPickSide !== undefined || d.notificationPreferences !== undefined,
  { message: 'At least one field must be provided.' }
);

export async function GET() {
  const appUser = await getAuthenticatedUser();
  if (!appUser) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  try {
    const service = createServiceRoleClient();
    const { data: fullUser } = await service
      .from('app_user')
      .select('default_pick_side, notification_preferences')
      .eq('id', appUser.id)
      .single() as { data: { default_pick_side: string; notification_preferences: Record<string, unknown> } | null };

    return NextResponse.json({
      ok: true,
      id: appUser.id,
      email: appUser.email,
      displayName: appUser.display_name,
      defaultPickSide: fullUser?.default_pick_side ?? 'HOME',
      notificationPreferences: fullUser?.notification_preferences ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load profile.';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const appUser = await getAuthenticatedUser();
  if (!appUser) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json().catch(() => ({}));
    const parsed = patchSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: 'Invalid payload.', details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const service = createServiceRoleClient();

    const updates: Record<string, unknown> = {};
    if (parsed.data.displayName !== undefined)             updates.display_name = parsed.data.displayName;
    if (parsed.data.defaultPickSide !== undefined)         updates.default_pick_side = parsed.data.defaultPickSide;
    if (parsed.data.notificationPreferences !== undefined) updates.notification_preferences = parsed.data.notificationPreferences;

    const { error: updateError } = await service
      .from('app_user')
      .update(updates)
      .eq('id', appUser.id);

    if (updateError) throw new Error(`Failed to update profile: ${updateError.message}`);

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update profile.';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
