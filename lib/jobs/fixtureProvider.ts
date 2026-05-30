import { z } from 'zod';

export const providerFixtureSchema = z.object({
  externalProviderId: z.string().min(1).optional(),
  roundId: z.string().uuid(),
  startsAt: z.string().datetime(),
  homeTeam: z.string().min(1),
  awayTeam: z.string().min(1),
  homeScore: z.number().int().nullable().optional(),
  awayScore: z.number().int().nullable().optional(),
  status: z.enum(['SCHEDULED', 'LIVE', 'FINAL', 'POSTPONED', 'CANCELED']),
  matchday: z.number().int().positive().nullable().optional(),
  groupName: z.string().nullable().optional(),
  venue: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
});

export type ProviderFixture = z.infer<typeof providerFixtureSchema>;

export const fixtureSyncPayloadSchema = z.object({
  provider: z.enum(['MANUAL', 'API_FOOTBALL']).default('MANUAL'),
  dryRun: z.boolean().default(false),
  fixtures: z.array(providerFixtureSchema).min(1)
});

export type FixtureSyncPayload = z.infer<typeof fixtureSyncPayloadSchema>;
