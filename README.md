# World Cup Pick'Em '26

A head-to-head FIFA World Cup 2026 prediction game for two friends.

## How it works

**One matchup, one opponent.** Create an invite link and share it — your opponent joins and you're locked in 1v1 for the entire tournament.

**Draft-style picks.** For every fixture, one player picks a team first, the other is automatically assigned the opposite side. You can never pick the same team. Pick order alternates based on who performed worse in the previous stage — giving the loser first pick next round.

**Points escalate.** Group stage picks are worth 1 pt each, rising to 32 pts for the Final. Whoever accumulates more points across all 104 matches wins.

---

## Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 16, React 19, TypeScript |
| Database | Supabase (Postgres + Realtime + Edge Functions) |
| Auth | Supabase OAuth (Google, Apple) |
| Hosting | Cloudflare Workers via opennextjs-cloudflare |
| Push | Web Push API + VAPID + Supabase Edge Function |
| Cron | Cloudflare Worker (`match-duel-cron`) |

---

## Features

- **1v1 matchups** — invite-only via shareable code
- **Alternating pick draft** — loser-picks-first ordering with tiebreakers on goals scored
- **Live score polling** — fixtures update every 30s during live matches
- **Pick progress summary** — bell icon shows unpicked count by urgency, auto-shows on load
- **Push notifications** — PICKS_DUE_SOON, OPPONENT_PICKED, RESULTS_SETTLED, NEW_MESSAGE
- **In-app chat** — per-matchup trash talk with emoji reactions and real-time presence
- **Score chart** — cumulative points and goals chart by matchday + knockout stage
- **Calendar export** — `.ics` download for individual fixtures or the full schedule
- **Theme toggle** — System / Day / Night with localStorage persistence

---

## Local development

### Prerequisites

Copy `.env.example` to `.env.local` and fill in the values.

The `BYPASS_AUTH=true` and `DEV_USER_EMAIL` vars skip OAuth entirely on localhost — you land straight in `/play` as your real user record without signing in.

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # vitest unit tests
```

### Environment variables

See `.env.example` for the full list. Required vars:

- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT`
- `SUPABASE_FUNCTIONS_URL`

---

## Database migrations

Run SQL files in `supabase/migrations/` in order via the Supabase SQL editor or CLI:

```bash
supabase db push
```

---

## Supabase Edge Functions

Two functions deployed to Supabase:

| Function | Purpose |
|----------|---------|
| `dispatch-notifications` | Reads undelivered notification events, sends web push, records delivery |
| `picks-due-soon` | Finds upcoming fixtures, notifies first-pickers who haven't picked yet |

Deploy:
```bash
supabase functions deploy dispatch-notifications
supabase functions deploy picks-due-soon
```

Secrets needed in Supabase dashboard (Edge Functions → Secrets):
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`

---

## Cron worker

A separate Cloudflare Worker (`wrangler.cron.toml`) fires `picks-due-soon` every 30 minutes:

```bash
wrangler secret put SUPABASE_SERVICE_ROLE_KEY --config wrangler.cron.toml
wrangler deploy --config wrangler.cron.toml
```

---

## Deploy (main app)

```bash
npm run deploy     # builds and deploys to Cloudflare via opennextjs-cloudflare
```

Requires `CLOUDFLARE_API_TOKEN` in environment.

---

## Admin endpoints

All require `Authorization: Bearer <JOB_ADMIN_TOKEN>` if `JOB_ADMIN_TOKEN` is set.

| Endpoint | Description |
|----------|-------------|
| `POST /api/admin/fixtures/sync` | Ingest fixture data from a provider |
| `POST /api/admin/rounds/transitions` | Mark complete rounds, settle scores |
| `POST /api/admin/notifications/picks-due-soon` | Manually trigger the picks-due-soon job |
| `GET /api/admin/debug/picks` | Debug view of pick state |
