-- The tournament's shape (which bracket + round set it uses). Lets the knockout
-- resolver pick the right bracket definition per tournament rather than assuming
-- the men's 48-team tree. Backfilled by inspecting each tournament's rounds:
-- a Round of 32 means the 48-team men's format, otherwise the 32-team women's.

alter table tournament add column if not exists format text;

update tournament t set format = case
  when exists (select 1 from round r where r.tournament_id = t.id and r.stage = 'ROUND_OF_32')
    then 'MENS_48'
  else 'WOMENS_32'
end
where format is null;
