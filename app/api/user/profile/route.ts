import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service';
import { ensureAppUser } from '@/lib/supabase/user';

const patchSchema = z.object({
  displayName: z.string().trim().min(1).max(64).optional(),
  defaultPickSide: z.enum(['HOME', 'AWAY']).optional()
}).refine((d) => d.displayName !== undefined || d.defaultPickSide !== undefined, {
  message: 'At least one field must be provided.'
});

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const appUser = await ensureAppUser(user);
    const service = createServiceRoleClient();
    const { data: fullUser } = await service
      .from('app_user')
      .select('default_pick_side')
      .eq('id', appUser.id)
      .single() as { data: { default_pick_side: string } | null };

    return NextResponse.json({
      ok: true,
      email: appUser.email,
      displayName: appUser.display_name,
      defaultPickSide: fullUser?.default_pick_side ?? 'HOME'
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load profile.';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const parsed = patchSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: 'Invalid payload.', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const appUser = await ensureAppUser(user);
    const service = createServiceRoleClient();

    const updates: Record<string, string> = {};
    if (parsed.data.displayName !== undefined) updates.display_name = parsed.data.displayName;
    if (parsed.data.defaultPickSide !== undefined) updates.default_pick_side = parsed.data.defaultPickSide;

    const { error: updateError } = await service
      .from('app_user')
      .update(updates)
      .eq('id', appUser.id);

    if (updateError) {
      throw new Error(`Failed to update profile: ${updateError.message}`);
    }

    return NextResponse.json({
      ok: true,
      displayName: parsed.data.displayName,
      defaultPickSide: parsed.data.defaultPickSide
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update profile.';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
