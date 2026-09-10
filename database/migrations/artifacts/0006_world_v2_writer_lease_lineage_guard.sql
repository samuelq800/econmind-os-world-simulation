create function world_v2.reject_world_writer_lease_lineage_reset()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'World writer lease lineage is append-only; DELETE is forbidden'
      using errcode = '55000';
  end if;
  raise exception 'World writer lease lineage is append-only; TRUNCATE is forbidden'
    using errcode = '55000';
end;
$$;

create trigger world_writer_lease_delete_is_forbidden
before delete on world_v2.world_writer_lease
for each row execute function world_v2.reject_world_writer_lease_lineage_reset();

create trigger world_writer_lease_truncate_is_forbidden
before truncate on world_v2.world_writer_lease
for each statement execute function world_v2.reject_world_writer_lease_lineage_reset();

comment on function world_v2.reject_world_writer_lease_lineage_reset() is
  'V09.1 forward fix for V09.1-BLK-01: DELETE or TRUNCATE cannot erase a World fencing lineage and reset token allocation';

comment on trigger world_writer_lease_delete_is_forbidden on world_v2.world_writer_lease is
  'Forbids direct Worker-role DELETE of the operational lease lineage; normal expiry/takeover must use acquire_world_writer_lease';

comment on trigger world_writer_lease_truncate_is_forbidden on world_v2.world_writer_lease is
  'Forbids direct Worker-role TRUNCATE of the operational lease lineage; migration/role ownership remains a separately staged grant boundary';
