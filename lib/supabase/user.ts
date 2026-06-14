import { User } from '@supabase/supabase-js';
import { createServiceRoleClient } from '@/lib/supabase/service';
import { AppUserRow } from '@/lib/supabase/types';

/** Converts "brian voit" → "Brian Voit", "JOHN DOE" → "John Doe" */
function toTitleCase(str: string): string {
  return str.toLowerCase().replace(/(?:^|\s)\S/g, (c) => c.toUpperCase());
}

export async function ensureAppUser(authUser: User): Promise<AppUserRow> {
  if (!authUser.id) {
    throw new Error('Authenticated user id is required.');
  }

  const service = createServiceRoleClient();

  const { data: existing, error: selectError } = await service
    .from('app_user')
    .select('id, auth_user_id, email, display_name, avatar_url, created_at')
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
    // Seed the OAuth avatar only if the user has none yet — never overwrite a
    // custom uploaded avatar (or a previously-seeded one) on subsequent logins.
    if (avatarUrl && !existing.avatar_url) {
      await service
        .from('app_user')
        .update({ avatar_url: avatarUrl })
        .eq('id', existing.id);
      return { ...existing, avatar_url: avatarUrl };
    }
    return existing;
  }

  const email = authUser.email;

  if (!email) {
    throw new Error('Authenticated user does not have an email address.');
  }

  const rawName =
    (authUser.user_metadata?.full_name as string | undefined) ??
    (authUser.user_metadata?.name as string | undefined) ??
    null;
  const displayName = rawName ? toTitleCase(rawName) : null;

  const { data: inserted, error: insertError } = await service
    .from('app_user')
    .insert({
      auth_user_id: authUser.id,
      email,
      display_name: displayName,
      avatar_url: avatarUrl
    })
    .select('id, auth_user_id, email, display_name, avatar_url, created_at')
    .single<AppUserRow>();

  if (insertError) {
    throw new Error(`Failed to create app_user: ${insertError.message}`);
  }

  return inserted;
}
