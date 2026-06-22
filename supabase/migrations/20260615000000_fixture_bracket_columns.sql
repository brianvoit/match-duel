-- Knockout-bracket support on fixture.
--   bracket_code   — stable id for a knockout slot (M73..M88, M89..M96, QF1..F),
--                    used to resolve/seed the bracket independently of the API id.
--   bracket_locked — admin pin: when true, neither the computed resolver nor the
--                    API reconciler overwrites the fixture's teams.
alter table fixture add column if not exists bracket_code text;
create index if not exists idx_fixture_bracket_code on fixture (bracket_code) where bracket_code is not null;

alter table fixture add column if not exists bracket_locked boolean not null default false;
