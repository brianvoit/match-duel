-- Core schema for World Cup Pick'Em v1 (2026 launch)

create extension if not exists pgcrypto;

create type stage_name as enum (
  'GROUP',
  'ROUND_OF_32',
  'ROUND_OF_16',
  'QUARTERFINAL',
  'SEMIFINAL',
  'THIRD_PLACE',
  'FINAL'
);

create type fixture_status as enum ('SCHEDULED', 'LIVE', 'FINAL', 'POSTPONED', 'CANCELED');
create type pick_side as enum ('HOME', 'AWAY');
create type provider_name as enum ('GOOGLE', 'APPLE');
create type notification_channel as enum ('IN_APP', 'WEB_PUSH');
create type notification_event_type as enum (
  'ROUND_OPEN',
  'PICKS_DUE_SOON',
  'MISSED_PICK',
  'OPPONENT_PICKED',
  'RESULTS_SETTLED'
);

create table app_user (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  display_name text,
  created_at timestamptz not null default now()
);

create table identity_provider_account (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_user(id) on delete cascade,
  provider provider_name not null,
  provider_subject text not null,
  created_at timestamptz not null default now(),
  unique (provider, provider_subject)
);

create table tournament (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  year int not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  is_active boolean not null default false,
  unique (year)
);

create table round (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournament(id) on delete cascade,
  stage stage_name not null,
  order_index int not null,
  starts_at timestamptz,
  ends_at timestamptz,
  is_complete boolean not null default false,
  unique (tournament_id, stage),
  unique (tournament_id, order_index)
);

create table fixture (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references round(id) on delete cascade,
  external_provider_id text,
  starts_at timestamptz not null,
  home_team text not null,
  away_team text not null,
  home_score int,
  away_score int,
  status fixture_status not null default 'SCHEDULED',
  last_synced_at timestamptz,
  unique (round_id, home_team, away_team, starts_at)
);

create table matchup (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournament(id) on delete cascade,
  invite_code text not null unique,
  status text not null default 'ACTIVE',
  created_by uuid not null references app_user(id),
  created_at timestamptz not null default now()
);

create table matchup_participant (
  id uuid primary key default gen_random_uuid(),
  matchup_id uuid not null references matchup(id) on delete cascade,
  user_id uuid not null references app_user(id) on delete cascade,
  joined_at timestamptz not null default now(),
  unique (matchup_id, user_id)
);

create table pick_order_assignment (
  id uuid primary key default gen_random_uuid(),
  matchup_id uuid not null references matchup(id) on delete cascade,
  round_id uuid not null references round(id) on delete cascade,
  fixture_id uuid not null references fixture(id) on delete cascade,
  first_picker_participant_id uuid not null references matchup_participant(id),
  created_at timestamptz not null default now(),
  unique (matchup_id, fixture_id)
);

create table pick (
  id uuid primary key default gen_random_uuid(),
  matchup_id uuid not null references matchup(id) on delete cascade,
  round_id uuid not null references round(id) on delete cascade,
  fixture_id uuid not null references fixture(id) on delete cascade,
  participant_id uuid not null references matchup_participant(id) on delete cascade,
  side pick_side not null,
  locked_at timestamptz,
  submitted_at timestamptz not null default now(),
  unique (fixture_id, participant_id)
);

create table round_result (
  id uuid primary key default gen_random_uuid(),
  matchup_id uuid not null references matchup(id) on delete cascade,
  round_id uuid not null references round(id) on delete cascade,
  participant_id uuid not null references matchup_participant(id) on delete cascade,
  points int not null default 0,
  tiebreak_goals int not null default 0,
  settled_at timestamptz,
  unique (matchup_id, round_id, participant_id)
);

create table matchup_standing (
  id uuid primary key default gen_random_uuid(),
  matchup_id uuid not null references matchup(id) on delete cascade,
  participant_id uuid not null references matchup_participant(id) on delete cascade,
  tournament_points int not null default 0,
  total_goals_tiebreak int not null default 0,
  updated_at timestamptz not null default now(),
  unique (matchup_id, participant_id)
);

create table scoring_config (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournament(id) on delete cascade,
  stage stage_name not null,
  win_points int not null,
  draw_points int not null default 1,
  unique (tournament_id, stage)
);

create table notification_subscription (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_user(id) on delete cascade,
  channel notification_channel not null,
  endpoint text,
  p256dh text,
  auth_secret text,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table notification_event (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_user(id) on delete cascade,
  matchup_id uuid references matchup(id) on delete cascade,
  event_type notification_event_type not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create table notification_delivery (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references notification_event(id) on delete cascade,
  subscription_id uuid references notification_subscription(id) on delete cascade,
  delivered_at timestamptz,
  failed_at timestamptz,
  failure_reason text
);

create table historical_import_run (
  id uuid primary key default gen_random_uuid(),
  uploaded_by uuid not null references app_user(id),
  csv_sha256 text not null,
  dry_run boolean not null,
  row_count int not null,
  inserted_count int not null,
  skipped_count int not null,
  error_count int not null,
  report jsonb not null,
  created_at timestamptz not null default now()
);

create table historical_result (
  id uuid primary key default gen_random_uuid(),
  season_year int not null,
  matchup_label text not null,
  user_id uuid references app_user(id) on delete set null,
  points int not null,
  goals_tiebreak int not null,
  source_import_run_id uuid not null references historical_import_run(id),
  unique (season_year, matchup_label, coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid))
);

create index idx_fixture_round_starts on fixture(round_id, starts_at);
create index idx_fixture_status on fixture(status);
create index idx_pick_matchup_round on pick(matchup_id, round_id);
create index idx_round_result_matchup_round on round_result(matchup_id, round_id);
create index idx_notification_event_user_created on notification_event(user_id, created_at desc);

insert into tournament (name, year, starts_at, is_active)
values ('FIFA Men''s World Cup 2026', 2026, '2026-06-11T00:00:00Z', true);
