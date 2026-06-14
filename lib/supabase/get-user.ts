import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service';
import { ensureAppUser } from '@/lib/supabase/user';
import type { AppUserRow } from '@/lib/supabase/types';

/**
 * Returns the authenticated app_user for the current request.
 *
 * In development with BYPASS_AUTH=true, skips OAuth entirely and looks up
 * the user by DEV_USER_EMAIL — so you can work locally without signing in.
 * Never active in production (env vars are not set there).
 */
export async function getAuthenticatedUser(): Promise<AppUserRow | null> {
  if (process.env.BYPASS_AUTH === 'true') {
    const email = process.env.DEV_USER_EMAIL;
    if (email) {
      const service = createServiceRoleClient();
      const { data } = await service
        .from('app_user')
        .select('id, auth_user_id, email, display_name, avatar_url, created_at')
        .eq('email', email)
        .maybeSingle() as { data: AppUserRow | null };
      return data;
    }
  }

  const supabase = await createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return ensureAppUser(user);
}
