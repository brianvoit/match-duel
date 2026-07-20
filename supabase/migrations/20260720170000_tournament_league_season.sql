-- Per-tournament API-Football target + single-active-tournament guarantee.
--
-- Until now the league id (WC_LEAGUE_ID = 1, men's) and season lived as a source
-- constant + a global env var, so one deployment could only ever serve one
-- tournament. Moving them onto the tournament row lets the sync/reconcile
-- pipeline target the right competition (e.g. the Women's World Cup, league 8)
-- purely from data — no source edits, no env flip.

alter table tournament add column if not exists league_id integer;
alter table tournament add column if not exists season integer;

-- Backfill the men's 2026 tournament to its API-Football league + season.
update tournament set league_id = 1, season = 2026 where year = 2026 and league_id is null;

-- The whole app resolves "the tournament" via is_active; enforce that at most one
-- row is active so a mis-provisioned second active tournament can't silently make
-- resolution order-dependent. The provisioner flips the old one off before (or in
-- the same transaction as) marking the new one active.
create unique index if not exists tournament_single_active_idx
  on tournament (is_active) where is_active;
