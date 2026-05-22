-- Required for reliable fixture provider upserts by external id.
create unique index if not exists idx_fixture_external_provider_id_unique
  on fixture(external_provider_id)
  where external_provider_id is not null;
