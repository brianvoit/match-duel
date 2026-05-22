# World Cup Pick'Em Architecture Baseline

## Scope and launch date
- Primary live gameplay target: FIFA Men's World Cup 2026 beginning June 11, 2026.
- Pre-2026 data is imported from CSV as read-only historical stats.

## Stack
- Web app: Next.js App Router with TypeScript.
- Backend/data: Supabase Postgres, Edge Functions, scheduled jobs.
- Push: browser web push plus in-app notification feed.

## Domain rules encoded in this baseline
- Tournament stages include Group through Final, including Round of 32 and Third Place.
- Stage scoring: 1, 2, 4, 8, 8, 16, 32.
- Draw rule: both players receive 1 point.
- Picks lock at fixture kickoff timestamp.
- Next round unlocks only when current stage fixtures are complete.
- First-picker order per stage: prior stage loser first, then lower tournament points if tied, then alternating by fixture chronology.

## API route skeletons included
- POST `/api/matchups/invite`
- POST `/api/matchups/invite/{id}/accept`
- GET `/api/matchups`
- GET `/api/rounds/current`
- GET `/api/rounds/{id}/fixtures`
- POST `/api/matchups/{id}/rounds/{roundId}/picks`
- GET `/api/matchups/{id}/live`
- POST `/api/admin/import/history`
- POST `/api/notifications/webpush/subscribe`

## Database migration included
- Core entities for users, OAuth identities, matchups, rounds, fixtures, picks, scoring config, standings, notifications, and historical import tracking.
- Seed tournament row for 2026 start date `2026-06-11T00:00:00Z`.

## Immediate next delivery milestones
1. Implement Supabase auth integration with Google and Apple providers.
2. Add row-level security policies for all matchup-scoped tables.
3. Implement fixture provider client and polling scheduler.
4. Implement pick submission validation and transactional lock enforcement.
5. Implement settlement and notification jobs end-to-end.
6. Build matchup dashboard and round bulk-pick UX.
