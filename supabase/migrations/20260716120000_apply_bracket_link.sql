-- apply_bracket_link: atomically adopt the API's home/away orientation for a
-- knockout fixture when the bracket reconciler links it.
--
-- A knockout fixture is seeded with a provisional (bracket-structure) home/away,
-- and players may pick before the API publishes the real orientation. When the
-- reconciler then links the fixture and the real orientation is reversed, we must
-- swap the fixture's teams/scores AND every pick's side together — otherwise a
-- pick stored as HOME (their chosen team) would silently point at the other team
-- and their points would flip. Doing it in one function keeps it in a single
-- transaction, so a mid-flight failure can never leave a half-migrated fixture.
--
-- p_flip = true only when the reconciler detects a genuine orientation reversal;
-- otherwise this just sets teams / external id / kickoff (a plain link or a
-- placeholder fill), leaving scores and picks untouched.
create or replace function apply_bracket_link(
  p_fixture_id uuid,
  p_home       text,
  p_away       text,
  p_ext        text,
  p_kickoff    timestamptz,
  p_flip       boolean
) returns void
language plpgsql
as $$
begin
  update fixture set
    home_team            = p_home,
    away_team            = p_away,
    external_provider_id = p_ext,
    starts_at            = coalesce(p_kickoff, starts_at),
    home_score           = case when p_flip then away_score     else home_score     end,
    away_score           = case when p_flip then home_score     else away_score     end,
    home_pen_score       = case when p_flip then away_pen_score else home_pen_score end,
    away_pen_score       = case when p_flip then home_pen_score else away_pen_score end
  where id = p_fixture_id;

  if p_flip then
    update pick
      set side = (case when side = 'HOME' then 'AWAY' else 'HOME' end)::pick_side
      where fixture_id = p_fixture_id;
  end if;
end;
$$;
