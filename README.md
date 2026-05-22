# World Cup Pick'Em

Implementation baseline for an invite-only head-to-head FIFA Men's World Cup 2026 prediction app.

## Included
- Next.js TypeScript app scaffold
- Authenticated matchup API for invite creation/acceptance/listing
- Authenticated bulk pick submission API with kickoff lock and round-gating checks
- Authenticated rounds read APIs (`current` and `fixtures`)
- Playground UI at `/play` for create/join/load fixtures/submit picks
- Responsive app shell UI (`/play`) with desktop 35/65 layout and mobile segmented tabs
- Domain logic modules for scoring, pick-order, and pick locking
- Supabase SQL migration for core schema
- Supabase SQL migration for auth mapping + initial matchup RLS policies
- Vitest unit tests for critical game rules
- Supabase client/server auth plumbing and OAuth callback handlers
- Architecture notes and milestone checklist

## Environment setup
Copy `.env.example` into `.env.local` and provide values:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_PROJECT_REF`

Current local `.env.local` is prefilled with your project URL, anon key, and project ref.
You still need to add your real `SUPABASE_SERVICE_ROLE_KEY`.

## Supabase OAuth config
In Supabase dashboard:
1. Enable providers under `Authentication -> Providers` for Google and Apple.
2. Set local site URL to `http://localhost:3000`.
3. Add redirect URL: `http://localhost:3000/auth/callback`.

## Apply migrations
Run both SQL files in Supabase SQL editor in order:
1. [`supabase/migrations/20260309160000_init.sql`](./supabase/migrations/20260309160000_init.sql)
2. [`supabase/migrations/20260309173000_auth_rls_matchups.sql`](./supabase/migrations/20260309173000_auth_rls_matchups.sql)
3. [`supabase/migrations/20260309191500_fixture_sync_constraints.sql`](./supabase/migrations/20260309191500_fixture_sync_constraints.sql)

## Bulk picks endpoint
- `POST /api/matchups/{id}/rounds/{roundId}/picks`
- Payload:
  - `{ "picks": [{ "fixtureId": "<uuid>", "side": "HOME" | "AWAY" }] }`
- Validations:
  - user must be matchup participant
  - round must belong to matchup tournament
  - round must not be complete
  - all earlier rounds must already be complete (round gating)
  - fixture kickoff must be in the future (pick lock enforcement)

## Round query endpoints
- `GET /api/rounds/current?matchupId=<matchup-uuid>`
  - returns current open round for the matchup tournament
- `GET /api/rounds/{id}/fixtures?matchupId=<matchup-uuid>`
  - returns fixtures with lock state and current user's existing pick side

## Quick local flow
1. Sign in on `/`
2. Open `/play`
3. `Create Matchup Invite` or `Join Matchup` by code
4. Select matchup and click `Load Round Fixtures`
5. Set picks and click `Save All Picks`

## UI layout notes
- `/` is now a lightweight sign-in/entry page.
- `/play` is the main signed-in app shell.
- Desktop (`>=1024px`): two-column 35/65 split.
- Mobile (`<1024px`): top segmented control (`Competition 'YY`, `Matchups`, `Performance`, `Profile Settings`).

## Admin job endpoints (fixture ingest + round transitions)
- `POST /api/admin/fixtures/sync`
  - Payload:
    - `{ "provider": "MANUAL", "dryRun": false, "fixtures": [{ "externalProviderId": "api-123", "roundId": "<uuid>", "startsAt": "2026-06-11T16:00:00.000Z", "homeTeam": "Team A", "awayTeam": "Team B", "homeScore": 1, "awayScore": 0, "status": "FINAL" }] }`
  - Behavior:
    - upserts fixtures by `externalProviderId` (or fallback natural key)
    - updates `home_score`, `away_score`, `status`, `last_synced_at`

- `POST /api/admin/rounds/transitions`
  - Payload:
    - `{}` or `{ "tournamentId": "<uuid>" }`
  - Behavior:
    - marks round `is_complete=true` when all its fixtures are `FINAL`

- Optional admin token:
  - set `JOB_ADMIN_TOKEN` in `.env.local`
  - send `Authorization: Bearer <token>` for both endpoints

## Run locally
1. Install dependencies:
   - `npm install`
2. Run tests:
   - `npm test`
3. Start dev server:
   - `npm run dev`
