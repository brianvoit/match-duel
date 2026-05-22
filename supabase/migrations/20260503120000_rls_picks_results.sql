-- Row-level security for pick, round_result, and matchup_standing.
-- The service role client (used by all API routes and admin jobs) bypasses RLS entirely,
-- so these policies only restrict direct anon/user-key access.
--
-- Auth bridge pattern (matches existing migrations):
--   auth.uid() → app_user.auth_user_id → app_user.id → matchup_participant.user_id

alter table pick enable row level security;
alter table round_result enable row level security;
alter table matchup_standing enable row level security;

-- ── pick ──────────────────────────────────────────────────────────────────────

-- SELECT: any participant of the matchup can read all picks for that matchup
-- (both their own and their opponent's picks after kickoff)
drop policy if exists pick_select_participant on pick;
create policy pick_select_participant
  on pick
  for select
  using (
    exists (
      select 1
      from matchup_participant mp
      join app_user au on au.id = mp.user_id
      where mp.matchup_id = pick.matchup_id
        and au.auth_user_id = auth.uid()
    )
  );

-- INSERT: a user can only insert picks where participant_id is their own participant row
drop policy if exists pick_insert_self on pick;
create policy pick_insert_self
  on pick
  for insert
  with check (
    exists (
      select 1
      from matchup_participant mp
      join app_user au on au.id = mp.user_id
      where mp.id = pick.participant_id
        and au.auth_user_id = auth.uid()
    )
  );

-- UPDATE: a user can only update their own unlocked picks
drop policy if exists pick_update_self on pick;
create policy pick_update_self
  on pick
  for update
  using (
    exists (
      select 1
      from matchup_participant mp
      join app_user au on au.id = mp.user_id
      where mp.id = pick.participant_id
        and au.auth_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from matchup_participant mp
      join app_user au on au.id = mp.user_id
      where mp.id = pick.participant_id
        and au.auth_user_id = auth.uid()
    )
  );

-- ── round_result ──────────────────────────────────────────────────────────────

-- SELECT: any participant of the matchup can read all round results for it
drop policy if exists round_result_select_participant on round_result;
create policy round_result_select_participant
  on round_result
  for select
  using (
    exists (
      select 1
      from matchup_participant mp
      join app_user au on au.id = mp.user_id
      where mp.matchup_id = round_result.matchup_id
        and au.auth_user_id = auth.uid()
    )
  );

-- ── matchup_standing ──────────────────────────────────────────────────────────

-- SELECT: any participant of the matchup can read the standing for it
drop policy if exists matchup_standing_select_participant on matchup_standing;
create policy matchup_standing_select_participant
  on matchup_standing
  for select
  using (
    exists (
      select 1
      from matchup_participant mp
      join app_user au on au.id = mp.user_id
      where mp.matchup_id = matchup_standing.matchup_id
        and au.auth_user_id = auth.uid()
    )
  );
