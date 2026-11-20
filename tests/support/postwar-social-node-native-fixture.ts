/** TEST_ONLY standard Node Social fixture. Reuses two sealed caches; no World,
 * seed, registration, publisher or whole-seed selection/bootstrap is performed. */
import { randomBytes, randomUUID } from 'node:crypto';
import { fork } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { SOCIAL_POSITION_OFFER_CREATE_COMMAND } from '@econmind/core';
import type { ManualOfficeCommandRequestDto } from '@econmind/core/authenticated-office-command-contract';
import {
  clonePostwarNativeReference,
  loadPostwarNativeReferenceMarker,
} from './postwar-native-reference-db.js';
import { SELECT_POSTWAR_COUNTRY_VACANCY_SOURCE } from './postwar-social-country-source-selection.js';

interface Checkpoint {
  referenceMarker: string;
  templateDatabase: string;
  seedFingerprint: string;
  admissionRef: string;
  head?: { world_version: string; event_sequence: string };
  worldVersion?: string;
  eventSequence?: string;
}
const readCheckpoint = async (file: string) =>
  JSON.parse(await readFile(file, 'utf8')) as Checkpoint;
const ident = (value: string) => {
  if (!/^[a-z][a-z0-9_]{0,62}$/u.test(value))
    throw Error('TEST_ONLY_SCOPED_IDENTIFIER_REQUIRED');
  return '"' + value + '"';
};
const sourceText = (value: unknown): string => {
  if (typeof value !== 'string' || !value || value.trim() !== value)
    throw Error('ACTUAL_BOUNDED_SOURCE_TEXT_REQUIRED');
  return value;
};

export async function createPostwarSocialNodeNativeFixture(input: {
  h3Checkpoint: string;
  scopeCheckpoint: string;
}) {
  const h3 = await readCheckpoint(input.h3Checkpoint),
    scope = await readCheckpoint(input.scopeCheckpoint);
  if (
    h3.head?.world_version !== '3' ||
    h3.head.event_sequence !== '3' ||
    scope.worldVersion !== '4' ||
    scope.eventSequence !== '4' ||
    h3.referenceMarker !== scope.referenceMarker ||
    h3.seedFingerprint !== scope.seedFingerprint ||
    h3.admissionRef !== scope.admissionRef
  )
    throw Error('SEALED_SAME_PINS_H3_AND_H4_SCOPE_CACHES_REQUIRED');
  const marker = await loadPostwarNativeReferenceMarker(h3.referenceMarker);
  if (
    marker.seedFingerprint !== h3.seedFingerprint ||
    marker.admissionRef !== h3.admissionRef
  )
    throw Error('ACTUAL_REFERENCE_PINS_REQUIRED');
  const clone = await clonePostwarNativeReference(
    marker,
    'social_node',
    h3.templateDatabase,
  );
  const suffix = randomBytes(5).toString('hex'),
    roles = {
      bounded: 'social_node_read_' + suffix,
      intake: 'social_node_intake_' + suffix,
      source: 'social_node_source_' + suffix,
      worker: 'social_node_worker_' + suffix,
    },
    workerId = 'WORKER_SOCIAL_NODE_' + suffix.toUpperCase(),
    pools: Pool[] = [];
  const idleErrors: string[] = [];
  const open = (role: string, database = clone.database) => {
    const p = new Pool({
      host: marker.socket,
      port: marker.port,
      database,
      user: role,
      password: async () => '',
      ssl: false,
      max: 1,
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 1000,
      options: '-c request.jwt.claim.sub=' + marker.subject,
      application_name: 'TEST_ONLY_SOCIAL_NODE_' + suffix,
    });
    p.on('error', (error) => idleErrors.push(error.message));
    // The composition owns its pools. Idempotent fixture cleanup still joins
    // the same real end promise if startup failed or shutdown already ran.
    let ending: Promise<void> | undefined;
    const wrapped = new Proxy(p, {
      get(target, key, receiver) {
        if (key === 'end') return () => (ending ??= target.end());
        const value: unknown = Reflect.get(target, key, receiver);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    pools.push(wrapped);
    return wrapped;
  };
  let cleaned = false;
  const cleanup = async () => {
    if (cleaned) return;
    cleaned = true;
    const failures: unknown[] = [];
    for (const p of pools)
      try {
        await p.end();
      } catch (error) {
        failures.push(error);
      }
    try {
      await clone.drop();
    } catch (error) {
      failures.push(error);
    }
    const admin = open('postgres', 'postgres');
    try {
      for (const role of Object.values(roles))
        await admin.query('drop role if exists ' + ident(role));
    } catch (error) {
      failures.push(error);
    } finally {
      await admin.end().catch((error: unknown) => failures.push(error));
    }
    if (failures.length)
      throw new AggregateError(failures, 'SOCIAL_NODE_FIXTURE_CLEANUP_FAILED');
  };
  try {
    const current = await clone.installer.query<{
      world_version: string;
      event_sequence: string;
      model_version: string;
      seed_id: string;
      seed_fingerprint: string;
      admission_ref: string;
    }>(
      'select h.world_version::text,h.event_sequence::text,a.model_version,a.seed_id,a.seed_fingerprint,a.admission_ref from world_v2.world_head h join world_v2.runtime_opening_admission a using(world_id) where h.world_id=$1',
      [marker.worldId],
    );
    if (
      current.rows.length !== 1 ||
      current.rows[0]?.world_version !== '3' ||
      current.rows[0]?.event_sequence !== '3' ||
      current.rows[0]?.seed_id !== marker.seedId ||
      current.rows[0]?.seed_fingerprint !== marker.seedFingerprint ||
      current.rows[0]?.admission_ref !== marker.admissionRef
    )
      throw Error('ACTUAL_H3_REQUIRED');
    const eventTimes = await clone.installer.query<{
      event_id: string;
      event_sequence: string;
      sim_time: string;
    }>(
      'select event_id,event_sequence::text,sim_time::text from world_v2.authoritative_event where world_id=$1 order by event_sequence',
      [marker.worldId],
    );
    if (
      eventTimes.rows.length !== 3 ||
      eventTimes.rows.some(
        (e, index) =>
          e.event_sequence !== String(index + 1) ||
          !/^(0|[1-9][0-9]*)$/u.test(e.sim_time),
      )
    )
      throw Error('ACTUAL_COMPLETE_H3_EVENT_TIME_METADATA_REQUIRED');
    const committedSimTime = eventTimes.rows
      .reduce(
        (maximum, event) =>
          BigInt(event.sim_time) > maximum ? BigInt(event.sim_time) : maximum,
        0n,
      )
      .toString();
    const registrations = await clone.installer.query<{ count: string }>(
      'select count(*)::text from world_v2.social_operating_source_registration where world_id=$1',
      [marker.worldId],
    );
    if (registrations.rows[0]?.count !== '70')
      throw Error('EXISTING_SEVENTY_CUSTODY_REGISTRATIONS_REQUIRED');
    const selector = await clonePostwarNativeReference(
      marker,
      'social_node_scope',
      scope.templateDatabase,
    );
    let selected;
    try {
      selected = await selector.installer.query<{
        wage: Record<string, unknown>;
        funding: Record<string, unknown>;
        scope_bytes: number;
        scope_sha256: string;
        seed_fingerprint: string;
        admission_ref: string;
      }>(SELECT_POSTWAR_COUNTRY_VACANCY_SOURCE, [
        marker.worldId,
        marker.countryId,
      ]);
    } finally {
      await selector.drop();
    }
    const original = selected.rows[0];
    if (
      selected.rows.length !== 1 ||
      !original ||
      original.scope_bytes > 262144 ||
      original.seed_fingerprint !== marker.seedFingerprint ||
      original.admission_ref !== marker.admissionRef
    )
      throw Error('BOUNDED_IMMUTABLE_COUNTRY_VACANCY_LOCATOR_REQUIRED');
    const actor = await clone.installer.query<{ actor_id: string }>(
      "select distinct actor_id from world_v2.command_submission where world_id=$1 and auth_subject=$2 and office_id='SOCIAL'",
      [marker.worldId, marker.subject],
    );
    if (actor.rows.length !== 1)
      throw Error('ACTUAL_EXISTING_SERVER_SOCIAL_ACTOR_REQUIRED');
    const proposal = await readFile(
      new URL(
        '../../database/proposals/social-intake-authorization.sql',
        import.meta.url,
      ),
      'utf8',
    );
    await clone.installer.query(proposal);
    const names = Object.values(roles).map(ident);
    for (const name of names)
      await clone.installer.query(
        `create role ${name} login nosuperuser nobypassrls nocreatedb nocreaterole noreplication`,
      );
    const b = ident(roles.bounded),
      i = ident(roles.intake),
      s = ident(roles.source),
      w = ident(roles.worker);
    await clone.installer.query(`
      grant usage on schema world_v2 to ${names.join(',')};
      grant world_v2_postwar_projection_reader to ${b};
      grant world_v2_social_intake_lock_reader to ${i};
      grant world_v2_social_source_reader to ${s},${w};
      grant select on world_v2.world_head,world_v2.current_commit_authorization,world_v2.runtime_read_seat,world_v2.projection_entitlement,world_v2.runtime_opening_admission,world_v2.command_submission,world_v2.command_queue,world_v2.command_receipt to ${i};
      grant select(world_id,seed_id,seed_fingerprint,replay_binding)on world_v2.opening_seed to ${i};
      grant insert on world_v2.command_submission,world_v2.command_queue to ${i};
      grant update(command_id)on world_v2.command_submission to ${i};
      grant update(world_version)on world_v2.world_head to ${i};
      create policy social_node_seed_${suffix} on world_v2.opening_seed for select to ${i} using(world_id='${marker.worldId}'and current_setting('request.jwt.claim.sub',true)='${marker.subject}');
      grant select on world_v2.world_head,world_v2.command_submission,world_v2.command_receipt,world_v2.authoritative_event,world_v2.inventory_posting,world_v2.financial_posting_batch to ${s};
      grant select on world_v2.world_head,world_v2.command_submission,world_v2.command_queue,world_v2.command_receipt,world_v2.authoritative_event,world_v2.inventory_posting,world_v2.financial_posting_batch,world_v2.authoritative_commit_authorization,world_v2.current_materialization,world_v2.notification_outbox,world_v2.world_writer_lease,world_v2.current_commit_authorization to ${w};
      grant insert on world_v2.authoritative_event,world_v2.command_receipt,world_v2.authoritative_commit_authorization,world_v2.current_materialization,world_v2.notification_outbox to ${w};
      grant update on world_v2.world_head,world_v2.command_queue,world_v2.current_materialization to ${w};
      grant update(actor_id)on world_v2.command_submission to ${w};
      grant update(renewed_at_real)on world_v2.world_writer_lease to ${w};
      grant execute on function world_v2.assert_world_writer_commit_guard(text,text,bigint,bigint,timestamptz)to ${w};
    `);
    await clone.installer.query(
      'select * from world_v2.acquire_world_writer_lease($1,$2,clock_timestamp(),600000)',
      [marker.worldId, workerId],
    );
    const permissions = await clone.installer.query(
      `select role,has_table_privilege(role,'world_v2.current_commit_authorization','UPDATE')as authority_update,has_column_privilege(role,'world_v2.current_commit_authorization','authorization_version','UPDATE')as authority_revision_update,has_table_privilege(role,'world_v2.projection_entitlement','UPDATE')as entitlement_update,has_column_privilege(role,'world_v2.projection_entitlement','active','UPDATE')as entitlement_active_update,has_column_privilege(role,'world_v2.opening_seed','canonical_payload','SELECT')as raw_seed from unnest($1::text[])role order by role`,
      [[roles.bounded, roles.intake, roles.worker]],
    );
    const request: ManualOfficeCommandRequestDto = {
      worldId: marker.worldId,
      countryId: marker.countryId,
      officeId: 'SOCIAL',
      commandType: SOCIAL_POSITION_OFFER_CREATE_COMMAND,
      commandId: 'COMMAND_SOCIAL_NODE_' + suffix.toUpperCase(),
      idempotencyKey: 'KEY_SOCIAL_NODE_' + suffix.toUpperCase(),
      expectedWorldVersion: '3',
      payload: {
        schemaVersion: 'social-employment-position-offer-create-v1',
        positionId: 'POSITION_SOCIAL_NODE_' + suffix.toUpperCase(),
        locationId: sourceText(original.wage.locationId),
        skill: sourceText(original.wage.skill),
        publicService: sourceText(original.wage.classificationId),
        occupation: sourceText(original.wage.occupation),
        requiredCount: '1',
        wageScheduleRef: sourceText(original.wage.positionId),
        fundingAccountId: sourceText(original.funding.accountRef),
        coverageDays: '1',
      },
    };
    return {
      marker,
      clone,
      roles,
      workerId,
      request,
      proposal,
      permissions: permissions.rows,
      locator: {
        bytes: original.scope_bytes,
        sha256: original.scope_sha256,
        scopeCache: scope.templateDatabase,
        seedFingerprint: original.seed_fingerprint,
        admissionRef: original.admission_ref,
      },
      idleErrors,
      serverClockBinding: {
        classification:
          'TEST_ONLY_FROZEN_TO_ACTUAL_COMMITTED_PREFIX_NOT_CLOCK_ADVANCE',
        simTime: committedSimTime,
        events: eventTimes.rows,
        worldClockServiceStarted: false,
        clockAdvanceRequested: false,
      },
      nodeConfiguration: {
        socket: marker.socket,
        port: marker.port,
        database: clone.database,
        roles,
        workerId,
        subject: marker.subject,
        actorId: actor.rows[0]!.actor_id,
        authorizationPublisherRole: marker.roles.authorizationPublisherRole,
        modelVersion: sourceText(current.rows[0]!.model_version),
        simTime: committedSimTime,
        admittedWorldPins: {
          worldId: marker.worldId,
          seedRef: marker.seedId,
          contentHash: marker.seedFingerprint,
          admissionRef: marker.admissionRef,
          minimumWorldVersion: '3',
        },
      },
      cleanup,
    };
  } catch (error) {
    try {
      await cleanup();
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        'SOCIAL_NODE_SETUP_FAILED',
        { cause: cleanupError },
      );
    }
    throw error;
  }
}

/** Parent-owned OS process, fixed IPC only. Awaiting exit proves all child-local
 * WeakMaps and source caches disappear before the next cold host is started. */
export async function startPostwarSocialNodeNativeHost(configuration: object) {
  const child = fork(
    new URL(
      '../../tools/office-connection/native-social-node-host.mjs',
      import.meta.url,
    ),
    [],
    {
      execPath: process.execPath,
      execArgv: ['--max-old-space-size=2304'],
      serialization: 'advanced',
      env: {
        NODE_ENV: 'test',
        ECONMIND_ENV: 'ci',
        ECONMIND_SOCIAL_NODE_TEST_HOST: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    },
  );
  let stderr = '',
    stdout = '',
    closed: Record<string, unknown> | undefined;
  child.stderr?.on('data', (chunk: Buffer) => {
    stderr = (stderr + chunk.toString()).slice(-4096);
  });
  child.stdout?.on('data', (chunk: Buffer) => {
    stdout = (stdout + chunk.toString()).slice(-4096);
  });
  const pending = new Map<
    string,
    {
      resolve(value: Record<string, unknown>): void;
      reject(reason: Error): void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  let readyResolve!: (value: Record<string, unknown>) => void;
  let readyReject!: (error: Error) => void;
  const ready = new Promise<Record<string, unknown>>((resolve, reject) => {
    readyResolve = resolve;
    readyReject = reject;
  });
  const exit = new Promise<number | null>((resolve) =>
    child.once('exit', resolve),
  );
  child.on('error', (error) => readyReject(error));
  child.on('message', (value: unknown) => {
    if (!value || typeof value !== 'object') return;
    const message = value as Record<string, unknown>;
    if (message.type === 'LISTENING_TEST_ONLY') readyResolve(message);
    else if (message.type === 'CLOSED') closed = message;
    else if (message.type === 'ERROR') {
      const error = Error('SOCIAL_NODE_CHILD:' + String(message.message));
      if (typeof message.id === 'string' && pending.has(message.id)) {
        const p = pending.get(message.id)!;
        pending.delete(message.id);
        clearTimeout(p.timer);
        p.reject(error);
      } else readyReject(error);
    } else if (message.type === 'RESULT' && typeof message.id === 'string') {
      const p = pending.get(message.id);
      if (p) {
        pending.delete(message.id);
        clearTimeout(p.timer);
        p.resolve(message.result as Record<string, unknown>);
      }
    }
  });
  child.on('exit', (code, signal) => {
    const error = Error(
      'SOCIAL_NODE_CHILD_EXIT:' +
        String(code) +
        ':' +
        String(signal) +
        ':' +
        stderr,
    );
    readyReject(error);
    for (const p of pending.values()) {
      clearTimeout(p.timer);
      p.reject(error);
    }
    pending.clear();
  });
  const stop = async () => {
    if (child.exitCode === null && child.signalCode === null) {
      const force = setTimeout(() => {
          child.kill('SIGTERM');
        }, 15000),
        kill = setTimeout(() => {
          child.kill('SIGKILL');
        }, 20000);
      try {
        if (child.connected) child.send({ operation: 'close' });
        await exit;
      } finally {
        clearTimeout(force);
        clearTimeout(kill);
      }
    }
    if (
      child.exitCode !== 0 ||
      !closed ||
      !Array.isArray(closed.cleanupFailures) ||
      closed.cleanupFailures.length ||
      !Array.isArray(closed.idleErrors) ||
      closed.idleErrors.length
    )
      throw Error('SOCIAL_NODE_CHILD_CLEANUP_UNCONFIRMED:' + stderr);
    return closed;
  };
  const ask = (operation: 'consume' | 'inspect') =>
    new Promise<Record<string, unknown>>((resolve, reject) => {
      const id = randomUUID(),
        timer = setTimeout(
          () => {
            pending.delete(id);
            reject(Error('SOCIAL_NODE_CHILD_IPC_DEADLINE'));
          },
          operation === 'consume' ? 300000 : 10000,
        );
      pending.set(id, { resolve, reject, timer });
      if (!child.connected) {
        clearTimeout(timer);
        pending.delete(id);
        reject(Error('SOCIAL_NODE_CHILD_DISCONNECTED'));
        return;
      }
      child.send({ operation, id });
    });
  child.send({ operation: 'start', config: configuration });
  const startupDeadline = setTimeout(
    () => readyReject(Error('SOCIAL_NODE_CHILD_STARTUP_DEADLINE:' + stderr)),
    180000,
  );
  try {
    const info = await ready;
    return { info, ask, stop, diagnostics: () => ({ stdout, stderr, closed }) };
  } catch (error) {
    try {
      await stop();
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        'SOCIAL_NODE_CHILD_START_FAILED',
        { cause: cleanupError },
      );
    }
    throw error;
  } finally {
    clearTimeout(startupDeadline);
  }
}
