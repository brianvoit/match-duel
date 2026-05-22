import { z } from 'zod';

export const providerFixtureSchema = z.object({
  externalProviderId: z.string().min(1).optional(),
  roundId: z.string().uuid(),
  startsAt: z.string().datetime(),
  homeTeam: z.string().min(1),
  awayTeam: z.string().min(1),
  homeScore: z.number().int().nullable().optional(),
  awayScore: z.number().int().nullable().optional(),
  status: z.enum(['SCHEDULED', 'LIVE', 'FINAL', 'POSTPONED', 'CANCELED'])
});

export type ProviderFixture = z.infer<typeof providerFixtureSchema>;

export const fixtureSyncPayloadSchema = z.object({
  provider: z.enum(['MANUAL']).default('MANUAL'),
  dryRun: z.boolean().default(false),
  fixtures: z.array(providerFixtureSchema).min(1)
});

export type FixtureSyncPayload = z.infer<typeof fixtureSyncPayloadSchema>;
