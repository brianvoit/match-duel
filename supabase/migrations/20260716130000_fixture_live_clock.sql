-- Live match clock: the API's elapsed minute and period (1H/HT/2H/ET/P/...),
-- so the Match Details page can show a running clock while a fixture is LIVE.
alter table fixture add column if not exists elapsed_minute integer;
alter table fixture add column if not exists period text;
