-- Debug flag columns for simulation/testing purposes.
-- Rows marked is_debug=true can be wiped cleanly via DELETE /api/admin/debug/reset.

alter table app_user add column if not exists is_debug boolean not null default false;
alter table matchup  add column if not exists is_debug boolean not null default false;
