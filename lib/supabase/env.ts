// Lazy getters — values are read at request time, never at module load /
// build time. This means the build never crashes due to missing env vars,
// and Next.js still inlines NEXT_PUBLIC_* references correctly at compile time.

export const clientEnv = {
  get NEXT_PUBLIC_SUPABASE_URL(): string {
    return process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  },
  get NEXT_PUBLIC_SUPABASE_ANON_KEY(): string {
    return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
  },
};

export const serverEnv = {
  get NEXT_PUBLIC_SUPABASE_URL(): string {
    return process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  },
  get NEXT_PUBLIC_SUPABASE_ANON_KEY(): string {
    return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
  },
  get SUPABASE_SERVICE_ROLE_KEY(): string | undefined {
    return process.env.SUPABASE_SERVICE_ROLE_KEY;
  },
  get SUPABASE_PROJECT_REF(): string | undefined {
    return process.env.SUPABASE_PROJECT_REF;
  },
  get BETA_CODE(): string | undefined {
    return process.env.BETA_CODE;
  },
  get VAPID_PRIVATE_KEY(): string | undefined {
    return process.env.VAPID_PRIVATE_KEY;
  },
  get VAPID_SUBJECT(): string {
    return process.env.VAPID_SUBJECT ?? 'mailto:swimmer571@gmail.com';
  },
  get SUPABASE_FUNCTIONS_URL(): string | undefined {
    return process.env.SUPABASE_FUNCTIONS_URL;
  },
};
