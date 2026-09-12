create or replace function world_v2.validate_command_queue_transition()
returns trigger
language plpgsql
as $$
declare
  active_lease world_v2.world_writer_lease%rowtype;
begin
  if tg_op = 'INSERT' then
    if new.queue_state <> 'PENDING' then
      raise exception 'Command queue rows must be inserted PENDING before a lease-bound claim'
        using errcode = '55000';
    end if;
    return new;
  end if;

  if new.world_id is distinct from old.world_id
     or new.command_id is distinct from old.command_id
     or new.authority_kind is distinct from old.authority_kind
     or new.priority_rank is distinct from old.priority_rank
     or new.available_at_sim_time is distinct from old.available_at_sim_time then
    raise exception 'command queue identity and authority are immutable'
      using errcode = '55000';
  end if;
  if new.attempt_count < old.attempt_count then
    raise exception 'command queue attempt count cannot decrease'
      using errcode = '55000';
  end if;

  if old.queue_state = 'PENDING' then
    if new.queue_state <> 'CLAIMED'
       or new.claimed_by is null
       or new.claimed_at_real is null
       or new.finalized_at_real is not null
       or new.claim_fencing_token is null
       or new.claim_fencing_token <= 0 then
      raise exception 'a Command claim requires a positive persisted fencing token'
        using errcode = '55000';
    end if;

    select *
      into active_lease
      from world_v2.world_writer_lease
      where world_id = new.world_id
      for key share;
    if not found
       or active_lease.holder_id is distinct from new.claimed_by
       or active_lease.fencing_token is distinct from new.claim_fencing_token
       or active_lease.lease_expires_at_real <= new.claimed_at_real then
      raise exception 'Command claim must bind the exact active World writer lease holder and fencing token'
        using errcode = '55000';
    end if;
  elsif old.queue_state = 'CLAIMED' then
    if new.queue_state = 'PENDING' then
      if new.claimed_by is not null
         or new.claimed_at_real is not null
         or new.finalized_at_real is not null
         or new.claim_fencing_token is not null then
        raise exception 'released Command claim must clear its holder and fencing token'
          using errcode = '55000';
      end if;
    elsif new.queue_state = 'FINALIZED' then
      if new.finalized_at_real is null
         or new.claim_fencing_token is distinct from old.claim_fencing_token then
        raise exception 'finalized Command must retain its claimed fencing token'
          using errcode = '55000';
      end if;
    else
      raise exception 'invalid command queue transition'
        using errcode = '55000';
    end if;
  elsif old.queue_state = 'FINALIZED' then
    if new.queue_state <> 'FINALIZED'
       or new.claim_fencing_token is distinct from old.claim_fencing_token
       or new.claimed_by is distinct from old.claimed_by
       or new.claimed_at_real is distinct from old.claimed_at_real
       or new.finalized_at_real is distinct from old.finalized_at_real then
      raise exception 'finalized Command claim evidence is immutable'
        using errcode = '55000';
    end if;
  else
    raise exception 'unsupported command queue state'
      using errcode = '55000';
  end if;
  return new;
end;
$$;

drop trigger command_queue_transition_is_guarded on world_v2.command_queue;

create trigger command_queue_transition_is_guarded
before insert or update on world_v2.command_queue
for each row execute function world_v2.validate_command_queue_transition();

comment on trigger command_queue_transition_is_guarded on world_v2.command_queue is
  'Rejects direct non-PENDING insertion and binds every PENDING-to-CLAIMED transition, under a lease row lock, to the current holder, unexpired operational lease and exact fencing token.';
