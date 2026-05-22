-- Add auth.users mapping and initial row-level security for matchup flows.

alter table app_user
  add column if not exists auth_user_id uuid unique;

create unique index if not exists idx_app_user_auth_user_id
  on app_user(auth_user_id)
  where auth_user_id is not null;

alter table app_user enable row level security;
alter table matchup enable row level security;
alter table matchup_participant enable row level security;

-- app_user: users can read/update only their own profile row.
drop policy if exists app_user_select_self on app_user;
create policy app_user_select_self
  on app_user
  for select
  using (auth.uid() = auth_user_id);

drop policy if exists app_user_update_self on app_user;
create policy app_user_update_self
  on app_user
  for update
  using (auth.uid() = auth_user_id)
  with check (auth.uid() = auth_user_id);

-- matchup: participants can see only matchups they are in; creator can insert.
drop policy if exists matchup_select_member on matchup;
create policy matchup_select_member
  on matchup
  for select
  using (
    exists (
      select 1
      from matchup_participant mp
      join app_user au on au.id = mp.user_id
      where mp.matchup_id = matchup.id
        and au.auth_user_id = auth.uid()
    )
  );

drop policy if exists matchup_insert_creator on matchup;
create policy matchup_insert_creator
  on matchup
  for insert
  with check (
    exists (
      select 1
      from app_user au
      where au.id = matchup.created_by
        and au.auth_user_id = auth.uid()
    )
  );

-- matchup_participant: participants can read rows in their matchups; users can add themselves.
drop policy if exists matchup_participant_select_member on matchup_participant;
create policy matchup_participant_select_member
  on matchup_participant
  for select
  using (
    exists (
      select 1
      from matchup_participant mp2
      join app_user au on au.id = mp2.user_id
      where mp2.matchup_id = matchup_participant.matchup_id
        and au.auth_user_id = auth.uid()
    )
  );

drop policy if exists matchup_participant_insert_self on matchup_participant;
create policy matchup_participant_insert_self
  on matchup_participant
  for insert
  with check (
    exists (
      select 1
      from app_user au
      where au.id = matchup_participant.user_id
        and au.auth_user_id = auth.uid()
    )
  );
