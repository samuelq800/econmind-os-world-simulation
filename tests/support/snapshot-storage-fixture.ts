// Disposable fixture precondition only; never a production initialization.
export const snapshotStorageFixtureSql = `
create role anon nologin nosuperuser nobypassrls;
create role authenticated nologin nosuperuser nobypassrls;
create schema storage;
create table storage.objects(bucket_id text);
alter table storage.objects enable row level security;
create policy existing_disposable_storage on storage.objects for all to public
  using(true) with check(true);
`;
