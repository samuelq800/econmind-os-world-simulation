-- Fixed forward candidate. Main-site release chain only; never run manually.
-- CONTROL_TOWER_OWNER_DELEGATION: new World bucket only, no old ACL change.
create policy world_v2_snapshot_objects_insert_deny
  on storage.objects as restrictive for insert to anon, authenticated
  with check (bucket_id is distinct from 'world-v2-official-source-v1');

create policy world_v2_snapshot_objects_delete_deny
  on storage.objects as restrictive for delete to anon, authenticated
  using (bucket_id is distinct from 'world-v2-official-source-v1');
