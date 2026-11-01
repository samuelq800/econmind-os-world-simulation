-- Exact current OMO custody only. The same shared transaction must replay
-- all canonical pages through Core before deriving any current settlement.
begin;
grant create on schema world_v2 to world_v2_cb_omo_source_owner;
create function world_v2.lock_central_bank_omo_paged_originals(p_world text,p_country text,p_security text,p_batch text,p_worker text,p_at timestamptz,p_subject uuid,p_sim_time text)
returns table(adoption_ref text,admission_ref text,admission_revision text,source_ref text,source_revision text,source_class text,original_text text,original_sha256 text,quote_text text,quote_sha256 text,seed_fingerprint text,canonical_seed_sha256 text,world_version text,event_sequence text,team_id text,authorization_version text,fencing_token text,acquired_at_real text,renewed_at_real text,lease_expires_at_real text,history_mode text)
language plpgsql security definer set search_path=pg_catalog as $$
declare ad world_v2.runtime_opening_admission%rowtype;a world_v2.central_bank_omo_adoption%rowtype;o world_v2.central_bank_omo_original%rowtype;q world_v2.central_bank_omo_quote%rowtype;l world_v2.world_writer_lease%rowtype;au world_v2.current_commit_authorization%rowtype;h world_v2.world_head%rowtype;begin
 if current_setting('transaction_isolation')not in('repeatable read','serializable')then raise exception 'CB_OMO_PAGED_SNAPSHOT_REQUIRED'using errcode='25001';end if;
 perform world_v2.cb_omo_require_role('READER');perform set_config('econmind.cb_omo_world',p_world,true);
 if p_at is null or not isfinite(p_at)then raise exception 'CB_OMO_EXACT_OBSERVATION_REQUIRED' using errcode='22023';end if;
 select * into h from world_v2.world_head x where x.world_id=p_world for share;
 if not found then raise exception 'CB_OMO_WORLD_HEAD_REQUIRED' using errcode='55000';end if;
 select * into l from world_v2.world_writer_lease x where x.world_id=p_world and x.holder_id=p_worker and x.acquired_at_real<=p_at and x.renewed_at_real<=p_at and x.lease_expires_at_real>p_at for share;
 if not found then raise exception 'CB_OMO_CURRENT_WRITER_LEASE_REQUIRED' using errcode='55000';end if;
 ad:=world_v2.cb_omo_admission(p_world);
 select * into a from world_v2.central_bank_omo_adoption x where x.world_id=p_world and x.country_id=p_country and x.admission_ref=ad.admission_ref and x.seed_fingerprint=ad.seed_fingerprint for share;
 if not found then raise exception 'CB_OMO_INDEPENDENT_SOURCE_ADOPTION_REQUIRED' using errcode='55000';end if;
 if exists(select 1 from world_v2.central_bank_omo_revocation x where x.adoption_ref=a.adoption_ref and x.resource_ref='SOURCE')then raise exception 'CB_OMO_SOURCE_REVOKED' using errcode='55000';end if;
 select * into o from world_v2.central_bank_omo_original x where x.adoption_ref=a.adoption_ref for share;
 if not found then raise exception 'CB_OMO_REGISTERED_ORIGINAL_REQUIRED' using errcode='55000';end if;
 select * into q from world_v2.central_bank_omo_quote x where x.adoption_ref=a.adoption_ref and x.security_ref=p_security and x.batch_ref=p_batch and x.world_version=h.world_version and x.valid_at_sim_time::text=p_sim_time for share;
 if not found then raise exception 'CB_OMO_CURRENT_ADOPTED_QUOTE_REQUIRED' using errcode='55000';end if;
 if exists(select 1 from world_v2.central_bank_omo_revocation x where x.adoption_ref=a.adoption_ref and x.resource_ref=q.quote_ref)then raise exception 'CB_OMO_QUOTE_REVOKED' using errcode='55000';end if;
 select * into au from world_v2.current_commit_authorization x where x.world_id=p_world and x.auth_subject=p_subject and x.country_id=p_country and x.office_id='CENTRAL_BANK'and x.capability='CENTRAL_BANK_MONETARY_POLICY'and x.active for share;
 if not found or exists(select 1 from world_v2.current_commit_authorization x where x.world_id=p_world and x.auth_subject=p_subject and x.active and(x.country_id<>au.country_id or x.team_id<>au.team_id or x.authorization_version<>au.authorization_version))then raise exception 'CB_OMO_CURRENT_EXACT_AUTHORIZATION_REQUIRED' using errcode='42501';end if;
 history_mode:='GENUINE_SHARED_PAGED_CORE_REPLAY_REQUIRED';
 adoption_ref:=a.adoption_ref;admission_ref:=a.admission_ref;admission_revision:=a.admission_revision;source_ref:=a.source_ref;source_revision:=a.source_revision;source_class:=a.source_class;original_text:=o.original_text;original_sha256:=o.original_sha256;quote_text:=q.quote_text;quote_sha256:=q.quote_sha256;seed_fingerprint:=a.seed_fingerprint;canonical_seed_sha256:=o.canonical_seed_sha256;world_version:=h.world_version::text;event_sequence:=h.event_sequence::text;team_id:=au.team_id;authorization_version:=au.authorization_version;fencing_token:=l.fencing_token::text;
 acquired_at_real:=to_char(l.acquired_at_real at time zone'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');renewed_at_real:=to_char(l.renewed_at_real at time zone'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');lease_expires_at_real:=to_char(l.lease_expires_at_real at time zone'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');return next;
end;$$;
alter function world_v2.lock_central_bank_omo_paged_originals(text,text,text,text,text,timestamptz,uuid,text)owner to world_v2_cb_omo_source_owner;
revoke all on function world_v2.lock_central_bank_omo_paged_originals(text,text,text,text,text,timestamptz,uuid,text)from public;
grant execute on function world_v2.lock_central_bank_omo_paged_originals(text,text,text,text,text,timestamptz,uuid,text)to world_v2_cb_omo_source_reader;
revoke create on schema world_v2 from world_v2_cb_omo_source_owner;
commit;
