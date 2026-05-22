import { createClient } from '@supabase/supabase-js';
import { serverEnv } from '@/lib/supabase/env';

export function createServiceRoleClient() {
  if (!serverEnv.SUPABASE_SERVICE_ROLE_KEY || serverEnv.SUPABASE_SERVICE_ROLE_KEY === 'REPLACE_WITH_SERVICE_ROLE_KEY') {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured.');
  }

  return createClient(serverEnv.NEXT_PUBLIC_SUPABASE_URL, serverEnv.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}
