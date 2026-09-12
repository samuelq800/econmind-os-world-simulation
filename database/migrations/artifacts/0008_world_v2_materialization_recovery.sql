drop trigger current_materialization_delete_is_rejected
  on world_v2.current_materialization;

create or replace function world_v2.validate_current_materialization_update()
returns trigger
language plpgsql
as $$
begin
  if new.world_id is distinct from old.world_id
     or new.materialization_key is distinct from old.materialization_key then
    raise exception 'Current materialization identity is immutable'
      using errcode = '55000';
  end if;
  if new.world_version < old.world_version then
    raise exception 'Current materialization WorldVersion cannot regress'
      using errcode = '55000';
  end if;
  return new;
end;
$$;

comment on function world_v2.validate_current_materialization_update() is
  'Allows same-watermark repair and deletion/rebuild only for non-authoritative current materializations; WorldVersion regression remains forbidden';
