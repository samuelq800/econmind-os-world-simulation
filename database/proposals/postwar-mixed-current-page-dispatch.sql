-- For the current paged reader, which distinguishes NOT_PUBLISHED from UNAVAILABLE.
begin;

create or replace function world_v2.read_postwar_mixed_current_page(
 p_world text, p_office text, p_dataset text, p_offset integer, p_limit integer,
 p_expected_version text default null
)
returns table(status text, scope jsonb, source jsonb, page jsonb, rows_text text)
language plpgsql security definer set search_path=pg_catalog as $$
begin
 if p_offset is null or p_limit is null or p_offset not between 0 and 100000
    or p_limit not between 1 and 100 or p_office is null or p_dataset is null
    or not (
      (p_office='SOCIAL' and p_dataset in ('positions','service-pools'))
      or (p_office='FINANCE' and p_dataset in ('currency-fx','opening-financial-legs','ledger-balances','treasury-capacity'))
      or (p_office='CENTRAL_BANK' and p_dataset in ('currency-fx','cb-categories','cb-holdings','bank-loans','opening-financial-legs','ledger-balances'))
    )
    or (p_offset>0 and p_expected_version is null)
    or (p_expected_version is not null and p_expected_version !~ '^sha256:[a-f0-9]{64}$')
 then
  raise exception 'MIXED_INVALID_PAGE' using errcode='22023';
 end if;

 select r.status, r.scope, r.source, r.page, r.rows_text
 into strict status, scope, source, page, rows_text
 from world_v2.read_postwar_paged_current_page(
  p_world, p_office, p_dataset, p_offset, p_limit, p_expected_version
 ) r;

 -- A missing current document is the only reason to consult the legacy reader.
 if status = 'NOT_PUBLISHED' then
  return query select * from world_v2.read_postwar_mixed_current_page_legacy_array_v1(
   p_world, p_office, p_dataset, p_offset, p_limit, p_expected_version
  );
 else
  return next;
 end if;
end;
$$;

alter function world_v2.read_postwar_mixed_current_page(text,text,text,integer,integer,text)
 owner to world_v2_postwar_projection_owner;
revoke all on function world_v2.read_postwar_mixed_current_page(text,text,text,integer,integer,text) from public;
commit;
