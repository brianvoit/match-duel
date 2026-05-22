import { z } from 'zod';

const clientEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1)
});

const serverEnvSchema = clientEnvSchema.extend({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  SUPABASE_PROJECT_REF: z.string().min(1).optional()
});

// During CI/build (SKIP_ENV_VALIDATION=1), skip Zod validation so the build
// doesn't crash when secrets aren't present at compile time. At runtime on
// the Worker, validation runs normally and will throw if vars are missing.
const skip = !!process.env.SKIP_ENV_VALIDATION;

const rawClient = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
};

const rawServer = {
  ...rawClient,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_PROJECT_REF: process.env.SUPABASE_PROJECT_REF,
};

export const clientEnv = skip
  ? (rawClient as z.infer<typeof clientEnvSchema>)
  : clientEnvSchema.parse(rawClient);

export const serverEnv = skip
  ? (rawServer as z.infer<typeof serverEnvSchema>)
  : serverEnvSchema.parse(rawServer);
