import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { clientEnv } from '@/lib/supabase/env';

export async function createServerSupabaseClient() {
  const cookieStore = await cookies();

  return createServerClient(clientEnv.NEXT_PUBLIC_SUPABASE_URL, clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const cookie of cookiesToSet) {
            cookieStore.set(cookie.name, cookie.value, cookie.options);
          }
        } catch {
          // Server Components can't set cookies — middleware handles session refresh
        }
      }
    }
  });
}
