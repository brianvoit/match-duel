import { User } from '@supabase/supabase-js';
import { createServiceRoleClient } from '@/lib/supabase/service';
import { AppUserRow } from '@/lib/supabase/types';

export async function ensureAppUser(authUser: User): Promise<AppUserRow> {
  if (!authUser.id) {
    throw new Error('Authenticated user id is required.');
  }

  const service = createServiceRoleClient();

  const { data: existing, error: selectError } = await service
    .from('app_user')
    .select('id, auth_user_id, email, display_name, created_at')
    .eq('auth_user_id', authUser.id)
    .maybeSingle<AppUserRow>();

  if (selectError) {
    throw new Error(`Failed to read app_user: ${selectError.message}`);
  }

  const avatarUrl =
    (authUser.user_metadata?.avatar_url as string | undefined) ??
    (authUser.user_metadata?.picture as string | undefined) ??
    null;

  if (existing) {
    // Refresh avatar URL in case it changed (e.g. user updated their Google photo)
    if (avatarUrl && avatarUrl !== (existing as unknown as Record<string, unknown>).avatar_url) {
      await service
        .from('app_user')
        .update({ avatar_url: avatarUrl })
        .eq('id', existing.id);
    }
    return existing;
  }

  const email = authUser.email;

  if (!email) {
    throw new Error('Authenticated user does not have an email address.');
  }

  const displayName =
    (authUser.user_metadata?.full_name as string | undefined) ??
    (authUser.user_metadata?.name as string | undefined) ??
    null;

  const { data: inserted, error: insertError } = await service
    .from('app_user')
    .insert({
      auth_user_id: authUser.id,
      email,
      display_name: displayName,
      avatar_url: avatarUrl
    })
    .select('id, auth_user_id, email, display_name, created_at')
    .single<AppUserRow>();

  if (insertError) {
    throw new Error(`Failed to create app_user: ${insertError.message}`);
  }

  return inserted;
}
