import { createBrowserClient } from '@supabase/ssr';

// Reference process.env.NEXT_PUBLIC_* DIRECTLY at the call site so Next/Turbopack
// reliably inlines the values into this client chunk. Going through an indirection
// (e.g. the clientEnv getter object) can defeat that inlining and ship an empty key.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
