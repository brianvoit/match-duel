import { createServiceRoleClient } from '@/lib/supabase/service';

export const ADMIN_EMAILS = ['brianvoit@plaudit.com', 'brianvoit@me.com'];

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.some(a => a.toLowerCase() === email.toLowerCase());
}

export async function userHasAccess(authUserId: string): Promise<boolean> {
  const service = createServiceRoleClient();
  const { data: appUser } = await service
    .from('app_user')
    .select('id')
    .eq('auth_user_id', authUserId)
    .maybeSingle();
  if (!appUser) return false;
  const { count } = await service
    .from('matchup_participant')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', appUser.id);
  return (count ?? 0) > 0;
}
