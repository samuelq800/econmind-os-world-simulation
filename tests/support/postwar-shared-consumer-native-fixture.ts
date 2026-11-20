/** TEST_ONLY existing H6 small-source clone. No seed reconstruction, World,
 * scheduler, raw-source permission on intake, or production registration. */
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { fork } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { canonicalSerialize } from '@econmind/core';
import {
  clonePostwarNativeReference,
  loadPostwarNativeReferenceMarker,
} from './postwar-native-reference-db.js';
import { SELECT_POSTWAR_COUNTRY_VACANCY_SOURCE } from './postwar-social-country-source-selection.js';

const ident = (name: string) => {
  if (!/^[a-z][a-z0-9_]{0,62}$/u.test(name))
    throw Error('OWNED_SHARED_FIXTURE_IDENTIFIER_REQUIRED');
  return '"' + name + '"';
};
const text = (v: unknown) => {
  if (typeof v !== 'string' || !v || v.trim() !== v)
    throw Error('REAL_SOURCE_TEXT_REQUIRED');
  return v;
};
const sql = (name: string) =>
  readFile(
    new URL('../../database/proposals/' + name, import.meta.url),
    'utf8',
  );
interface Policy {
  worldId: string;
  countryId: string;
  governmentEntityId: string;
  currency: string;
  envelopeRef: string;
  effectivePeriodRef: string;
  sourceDocumentSHA256: string;
}
interface Cache {
  classification: string;
  referenceMarker: string;
  database: string;
  policy: Policy;
  policyRef: string;
  sourceSHA256: string;
  canonicalSHA256: string;
}
export async function createPostwarSharedConsumerNativeFixture(input: {
  sourceCheckpoint: string;
  scopeCheckpoint: string;
}) {
  const cache = JSON.parse(
    await readFile(input.sourceCheckpoint, 'utf8'),
  ) as Cache;
  if (
    cache.classification !== 'TEST_ONLY_SEALED_H6_DERIVED_SOURCE_NOT_AUTHORITY'
  )
    throw Error('EXISTING_SEALED_H6_SMALL_SOURCE_REQUIRED');
  const marker = await loadPostwarNativeReferenceMarker(cache.referenceMarker);
  const scope = JSON.parse(await readFile(input.scopeCheckpoint, 'utf8')) as {
    referenceMarker: string;
    templateDatabase: string;
    seedFingerprint: string;
    admissionRef: string;
  };
  if (
    scope.referenceMarker !== cache.referenceMarker ||
    scope.seedFingerprint !== marker.seedFingerprint ||
    scope.admissionRef !== marker.admissionRef
  )
    throw Error('EXISTING_SCOPE_CACHE_IMMUTABLE_PINS_DIFFER');
  const clone = await clonePostwarNativeReference(
    marker,
    'shared_consumer',
    cache.database,
  );
  const suffix = randomBytes(5).toString('hex'),
    roles = {
      bounded: 'shared_read_' + suffix,
      intake: 'shared_intake_' + suffix,
      source: 'shared_source_' + suffix,
      worker: 'shared_worker_' + suffix,
      publisher: 'shared_pub_' + suffix,
    },
    workerId = 'WORKER_SHARED_CONSUMER_' + suffix.toUpperCase();
  const pools: Pool[] = [],
    idleErrors: string[] = [];
  const open = (user: string, database = clone.database) => {
    const pool = new Pool({
      host: marker.socket,
      port: marker.port,
      database,
      user,
      ssl: false,
      password: async () => '',
      max: 1,
      idleTimeoutMillis: 1000,
      connectionTimeoutMillis: 10000,
    });
    pool.on('error', (error) => idleErrors.push(error.message));
    pools.push(pool);
    return pool;
  };
  let cleaned = false;
  const cleanup = async () => {
    if (cleaned) return;
    cleaned = true;
    const errors: unknown[] = [];
    for (const pool of pools)
      try {
        if (!pool.ended) await pool.end();
      } catch (error) {
        errors.push(error);
      }
    try {
      await clone.drop();
    } catch (error) {
      errors.push(error);
    }
    const admin = open('postgres', 'postgres');
    try {
      for (const role of Object.values(roles))
        await admin.query('drop role if exists ' + ident(role));
    } catch (error) {
      errors.push(error);
    } finally {
      await admin.end().catch((error: unknown) => errors.push(error));
    }
    if (errors.length)
      throw new AggregateError(errors, 'SHARED_NATIVE_FIXTURE_CLEANUP_FAILED');
  };
  try {
    const metadata = (
      await clone.installer.query<Record<string, string>>(
        'select h.world_version::text,h.event_sequence::text,a.seed_id,a.seed_fingerprint,a.admission_ref,a.model_version from world_v2.world_head h join world_v2.runtime_opening_admission a using(world_id) where h.world_id=$1',
        [marker.worldId],
      )
    ).rows;
    if (
      metadata.length !== 1 ||
      metadata[0]!.world_version !== '6' ||
      metadata[0]!.event_sequence !== '10' ||
      metadata[0]!.seed_fingerprint !== marker.seedFingerprint ||
      metadata[0]!.admission_ref !== marker.admissionRef
    )
      throw Error('ACTUAL_SEALED_H6_LINEAGE_REQUIRED');
    const events = (
      await clone.installer.query<{ event_id: string; sim_time: string }>(
        'select event_id,sim_time::text from world_v2.authoritative_event where world_id=$1 order by event_sequence',
        [marker.worldId],
      )
    ).rows;
    if (
      events.length !== 10 ||
      events.some((e) => !/^(0|[1-9][0-9]*)$/u.test(e.sim_time))
    )
      throw Error('ACTUAL_H6_EVENT_TIME_REQUIRED');
    const simTime = events
      .reduce((n, e) => (BigInt(e.sim_time) > n ? BigInt(e.sim_time) : n), 0n)
      .toString();
    const capacity = (
      await clone.installer.query<Record<string, string>>(
        'select seed_fingerprint,admission_ref,source_sha256,canonical_seed_sha256 from world_v2.finance_budget_capacity_original where world_id=$1 and country_id=$2',
        [marker.worldId, marker.countryId],
      )
    ).rows;
    if (
      capacity.length !== 1 ||
      capacity[0]!.seed_fingerprint !== marker.seedFingerprint ||
      capacity[0]!.admission_ref !== marker.admissionRef ||
      capacity[0]!.source_sha256 !== cache.sourceSHA256 ||
      capacity[0]!.canonical_seed_sha256 !== cache.canonicalSHA256
    )
      throw Error('ACTUAL_C01_SMALL_FINANCE_ORIGINAL_REQUIRED');
    const originalPolicy = (
      await clone.installer.query<{ policy_text: string }>(
        'select policy_text from world_v2.finance_budget_policy_original where world_id=$1 and country_id=$2 and policy_ref=$3',
        [marker.worldId, marker.countryId, cache.policyRef],
      )
    ).rows;
    if (originalPolicy.length !== 1) throw Error('ACTUAL_C01_POLICY_REQUIRED');
    const c01Policy = JSON.parse(originalPolicy[0]!.policy_text) as Policy;
    for (const k of [
      'worldId',
      'countryId',
      'governmentEntityId',
      'currency',
      'envelopeRef',
      'effectivePeriodRef',
      'sourceDocumentSHA256',
    ] as const)
      if (c01Policy[k] !== cache.policy[k])
        throw Error('ACTUAL_C01_POLICY_PINS_DIFFER');
    const ancestor = await clonePostwarNativeReference(
      marker,
      'shared_locator',
      scope.templateDatabase,
    );
    const locators: Record<
      string,
      {
        wage: Record<string, unknown>;
        funding: Record<string, unknown>;
        servicePoolId: string;
        bytes: number;
        sha256: string;
      }
    > = {};
    try {
      for (const country of ['COUNTRY_01', 'COUNTRY_02']) {
        const found = (
          await ancestor.installer.query<{
            wage: Record<string, unknown>;
            funding: Record<string, unknown>;
            scope_bytes: number;
            scope_sha256: string;
            seed_fingerprint: string;
            admission_ref: string;
          }>(SELECT_POSTWAR_COUNTRY_VACANCY_SOURCE, [marker.worldId, country])
        ).rows;
        if (
          found.length !== 1 ||
          found[0]!.scope_bytes > 262144 ||
          found[0]!.seed_fingerprint !== marker.seedFingerprint ||
          found[0]!.admission_ref !== marker.admissionRef
        )
          throw Error('REAL_BOUNDED_COUNTRY_LOCATOR_REQUIRED');
        const row = found[0]!;
        const pool = (
          await ancestor.installer.query<{ pool: Record<string, unknown> }>(
            `select p as pool from world_v2.postwar_social_prefix_scope s cross join lateral jsonb_array_elements(s.scope_document::jsonb->'servicePools')p where s.world_id=$1 and s.country_id=$2 and octet_length(s.scope_document)<=262144 and s.scope_sha256=encode(sha256(convert_to(s.scope_document,'UTF8')),'hex')and p->>'countryId'=$2 and p->>'locationId'=$3 and p->>'skill'=$4`,
            [marker.worldId, country, row.wage.locationId, row.wage.skill],
          )
        ).rows;
        if (pool.length !== 1)
          throw Error('ACTUAL_MATCHING_SERVICE_POOL_REQUIRED');
        locators[country] = {
          wage: row.wage,
          funding: row.funding,
          servicePoolId: text(pool[0]!.pool.poolId),
          bytes: row.scope_bytes,
          sha256: row.scope_sha256,
        };
      }
    } finally {
      await ancestor.drop();
    }
    const socialActor = (
      await clone.installer.query<{ actor_id: string }>(
        `select actor_id from world_v2.command_submission where world_id=$1 and auth_subject=$2::uuid and office_id='SOCIAL'order by submitted_at_real,command_id limit 1`,
        [marker.worldId, marker.subject],
      )
    ).rows;
    if (socialActor.length !== 1)
      throw Error('ACTUAL_EXISTING_C01_SERVER_ACTOR_REQUIRED');
    await clone.installer.query(await sql('social-intake-authorization.sql'));
    for (const role of Object.values(roles))
      await clone.installer.query(
        `create role ${ident(role)} login nosuperuser nobypassrls nocreatedb nocreaterole noreplication`,
      );
    const b = ident(roles.bounded),
      i = ident(roles.intake),
      s = ident(roles.source),
      w = ident(roles.worker),
      p = ident(roles.publisher);
    await clone.installer.query(`
      grant usage on schema world_v2 to ${[b, i, s, w, p].join(',')};
      grant world_v2_postwar_projection_reader to ${b};
      grant world_v2_finance_budget_source_reader,world_v2_social_intake_lock_reader to ${i};
      grant world_v2_social_source_reader to ${s};
      grant world_v2_finance_budget_source_reader,world_v2_social_source_reader to ${w};
      grant world_v2_finance_budget_source_publisher to ${p};
      grant select on world_v2.world_head,world_v2.current_commit_authorization,world_v2.runtime_read_seat,world_v2.projection_entitlement,world_v2.runtime_opening_admission,world_v2.command_submission,world_v2.command_queue,world_v2.command_receipt to ${i};
      grant select(world_id,seed_id,seed_fingerprint,replay_binding)on world_v2.opening_seed to ${i};
      grant insert on world_v2.command_submission,world_v2.command_queue to ${i};
      grant update(command_id)on world_v2.command_submission to ${i};grant update(world_version)on world_v2.world_head to ${i};
      create policy shared_seed_${suffix} on world_v2.opening_seed for select to ${i} using(world_id='${marker.worldId}');
      grant select on world_v2.world_head,world_v2.command_submission,world_v2.command_receipt,world_v2.authoritative_event,world_v2.inventory_posting,world_v2.financial_posting_batch to ${s};
      grant select on world_v2.world_head,world_v2.command_submission,world_v2.command_queue,world_v2.command_receipt,world_v2.authoritative_event,world_v2.inventory_posting,world_v2.financial_posting_batch,world_v2.authoritative_commit_authorization,world_v2.current_materialization,world_v2.notification_outbox,world_v2.world_writer_lease,world_v2.current_commit_authorization to ${w};
      grant insert on world_v2.authoritative_event,world_v2.command_receipt,world_v2.authoritative_commit_authorization,world_v2.current_materialization,world_v2.notification_outbox to ${w};
      grant update on world_v2.world_head,world_v2.command_queue,world_v2.current_materialization to ${w};grant update(command_id)on world_v2.command_submission to ${w};grant update(renewed_at_real)on world_v2.world_writer_lease to ${w};
      grant execute on function world_v2.assert_world_writer_commit_guard(text,text,bigint,bigint,timestamptz)to ${w};
      create policy shared_lease_read_${suffix} on world_v2.world_writer_lease for select to ${w} using(world_id='${marker.worldId}');
      create policy shared_lease_lock_${suffix} on world_v2.world_writer_lease for update to ${w} using(world_id='${marker.worldId}')with check(false);
    `);
    await clone.installer.query(
      'select * from world_v2.acquire_world_writer_lease($1,$2,clock_timestamp(),600000)',
      [marker.worldId, workerId],
    );
    const permissions = (
      await clone.installer.query<Record<string, unknown>>(
        `select r as role,has_table_privilege(r,'world_v2.current_commit_authorization','UPDATE')auth_update,has_column_privilege(r,'world_v2.current_commit_authorization','authorization_version','UPDATE')auth_revision_update,has_column_privilege(r,'world_v2.projection_entitlement','active','UPDATE')entitlement_update,has_column_privilege(r,'world_v2.opening_seed','canonical_payload','SELECT')raw_seed,pg_has_role(r,'world_v2_social_source_reader','MEMBER')social_reader,pg_has_role(r,'world_v2_finance_budget_source_reader','MEMBER')finance_reader,pg_has_role(r,'world_v2_social_intake_lock_reader','MEMBER')social_intake_lock from unnest($1::text[])r order by r`,
        [[roles.bounded, roles.intake, roles.worker]],
      )
    ).rows;
    // Country02 has a distinct TEST_ONLY subject. This is fixture-only
    // enrollment, never a Country01 reassignment or a production entitlement.
    const country02 = 'COUNTRY_02',
      subject02 = randomUUID(),
      actor02 = 'ACTOR_SHARED_COUNTRY02_' + suffix.toUpperCase();
    const c02OriginalRows = (
      await clone.installer.query<{
        source_text: string;
        source_sha256: string;
      }>(
        "select source_text,source_sha256 from world_v2.finance_budget_mixed_social_original where world_id=$1 and country_id=$2 and octet_length(source_text)<=262144 and source_sha256=encode(sha256(convert_to(source_text,'UTF8')),'hex')",
        [marker.worldId, country02],
      )
    ).rows;
    if (c02OriginalRows.length !== 1)
      throw Error('REAL_C02_MIXED_ORIGINAL_REQUIRED');
    const original02 = JSON.parse(c02OriginalRows[0]!.source_text) as {
      worldId: string;
      countryId: string;
      fundingAccounts: Record<string, unknown>[];
    };
    const gov02 = original02.fundingAccounts.filter(
      (f) => f.countryId === country02 && f.payerRole === 'GOV',
    );
    if (
      original02.worldId !== marker.worldId ||
      original02.countryId !== country02 ||
      gov02.length !== 1 ||
      text(gov02[0]!.payerEntityId) !==
        text(locators[country02]!.funding.payerEntityId) ||
      text(gov02[0]!.currency) !== text(locators[country02]!.funding.currency)
    )
      throw Error('REAL_C02_GOV_AND_CURRENCY_REQUIRED');
    const normativeBytes = await readFile(
      new URL('../../specs/extracted/FINANCE.md', import.meta.url),
      'utf8',
    );
    const normativeSha = createHash('sha256')
      .update(normativeBytes)
      .digest('hex');
    if (
      normativeSha !==
      '6152e2c87a5545e1c354c8a6dbe8b948bbfcb3d396ef54624d9326d0bc1b8385'
    )
      throw Error('EXACT_EXISTING_FINANCE_NORMATIVE_RULE_REQUIRED');
    const policy02 = {
      schemaVersion: 'finance-native-budget-policy-v1',
      ruleRef: 'FINANCE_ORDINARY_SELF_ADMINISTRATION_FULL_V1',
      ruleRevision: 'RULE_SHARED_TEST_ONLY_V1',
      sourceDocumentSHA256: 'sha256:' + normativeSha,
      normativeUnits: [
        'FINANCE-U0247',
        'FINANCE-U0252',
        'FINANCE-U0265',
        'FINANCE-U0295',
      ],
      worldId: marker.worldId,
      countryId: country02,
      governmentEntityId: text(gov02[0]!.payerEntityId),
      currency: text(gov02[0]!.currency),
      envelopeRef: 'SHARED_COUNTRY02_ENVELOPE_' + suffix.toUpperCase(),
      effectivePeriodRef: 'SHARED_COUNTRY02_PERIOD_' + suffix.toUpperCase(),
      periodRevision: 'PERIOD_REV_SHARED_TEST_ONLY',
      validFromSimTime: '0',
      validUntilSimTime: '86400000',
      requestingOfficeId: 'FINANCE',
      programmeOwnerOfficeId: 'FINANCE',
      classification: 'ORDINARY_DEPARTMENTAL',
      funding: 'FULL_UNCONDITIONAL',
      requiredApprovalOffices: ['FINANCE'],
    };
    const publisher = open(roles.publisher),
      policyRef02 = 'POLICY_SHARED_COUNTRY02_' + suffix.toUpperCase();
    await publisher.query(
      'select world_v2.publish_finance_budget_policy($1,$2,$3,$4,$5,$6)',
      [
        policyRef02,
        'TEST_ONLY_SHARED_COUNTRY02_PUBLISHER',
        canonicalSerialize(policy02),
        marker.seedFingerprint,
        marker.admissionRef,
        normativeSha,
      ],
    );
    const source02 = (
      await publisher.query<{ hash: string }>(
        'select world_v2.publish_finance_budget_capacity($1,$2,$3,$4,$5)as hash',
        [
          marker.worldId,
          country02,
          marker.seedFingerprint,
          marker.admissionRef,
          cache.canonicalSHA256,
        ],
      )
    ).rows;
    if (source02.length !== 1 || !/^[a-f0-9]{64}$/u.test(source02[0]!.hash))
      throw Error('CONTROLLED_ACTUAL_C02_CAPACITY_PUBLICATION_REQUIRED');
    await clone.installer.query(
      'insert into world_v2.current_commit_authorization values($1,$2::uuid,$3,$4,$5,$6,$7,true,clock_timestamp())',
      [
        marker.worldId,
        subject02,
        country02,
        'FINANCE',
        'FINANCE_BUDGET',
        'TEAM_SHARED_COUNTRY02_' + suffix.toUpperCase(),
        'REV_SHARED_COUNTRY02_' + suffix.toUpperCase(),
      ],
    );
    await clone.installer.query(
      'insert into world_v2.runtime_read_seat(world_id,auth_subject,country_id,office_id,team_id,authorization_revision)values($1,$2::uuid,$3,$4,$5,$6)',
      [
        marker.worldId,
        subject02,
        country02,
        'FINANCE',
        'TEAM_SHARED_COUNTRY02_' + suffix.toUpperCase(),
        'REV_SHARED_COUNTRY02_' + suffix.toUpperCase(),
      ],
    );
    await clone.installer.query(
      "insert into world_v2.projection_entitlement values($1,$2::uuid,'OFFICE_PRIVATE',$3,$4,true,clock_timestamp(),null)",
      [
        marker.worldId,
        subject02,
        'OFFICE_' +
          Buffer.from(country02).toString('hex').toUpperCase() +
          '_46494E414E4345',
        'REV_SHARED_COUNTRY02_' + suffix.toUpperCase(),
      ],
    );
    return {
      marker,
      clone,
      roles,
      workerId,
      locators,
      cache,
      c01Policy,
      policy02,
      subject02,
      policyRef02,
      simTime,
      events,
      permissions,
      idleErrors,
      open,
      cleanup,
      closeFixturePools: async () => {
        for (const pool of pools) if (!pool.ended) await pool.end();
      },
      country02Provenance: {
        sourceSha256: c02OriginalRows[0]!.source_sha256,
        governmentEntityId: policy02.governmentEntityId,
        currency: policy02.currency,
        capacitySourceSha256: source02[0]!.hash,
        policyRef: policyRef02,
        normativeSha256: normativeSha,
        classification: 'TEST_ONLY_ISOLATED_ENROLLMENT_NOT_PRODUCTION',
      },
      nodeConfiguration: {
        socket: marker.socket,
        port: marker.port,
        database: clone.database,
        roles,
        workerId,
        subject: marker.subject,
        actors: [
          {
            subject: marker.subject,
            actorId: socialActor[0]!.actor_id,
            countryId: marker.countryId,
          },
          { subject: subject02, actorId: actor02, countryId: country02 },
        ],
        authorizationPublisherRole: marker.roles.authorizationPublisherRole,
        modelVersion: metadata[0]!.model_version,
        simTime,
        financeCountries: [
          {
            countryId: marker.countryId,
            expectedRawSourceSHA256: cache.sourceSHA256,
          },
          {
            countryId: 'COUNTRY_02',
            expectedRawSourceSHA256: source02[0]!.hash,
          },
        ],
        admittedWorldPins: {
          worldId: marker.worldId,
          seedRef: marker.seedId,
          contentHash: marker.seedFingerprint,
          admissionRef: marker.admissionRef,
          minimumWorldVersion: '6',
        },
      },
    };
  } catch (error) {
    try {
      await cleanup();
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        'SHARED_NATIVE_SETUP_FAILED',
        { cause: cleanupError },
      );
    }
    throw error;
  }
}

/** Parent-owned OS process, fixed IPC only. Awaiting exit proves all child-local
 * WeakMaps and source caches disappear before the next cold host is started. */
export async function startPostwarSharedConsumerNativeHost(
  configuration: object,
) {
  const child = fork(
    new URL(
      '../../tools/office-connection/native-shared-consumer-host.mjs',
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
        ECONMIND_SHARED_CONSUMER_TEST_HOST: '1',
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
      const error = Error('SHARED_CONSUMER_CHILD:' + String(message.message));
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
      'SHARED_CONSUMER_CHILD_EXIT:' +
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
      throw Error('SHARED_CONSUMER_CHILD_CLEANUP_UNCONFIRMED:' + stderr);
    return closed;
  };
  const ask = (operation: 'consume' | 'inspect') =>
    new Promise<Record<string, unknown>>((resolve, reject) => {
      const id = randomUUID(),
        timer = setTimeout(
          () => {
            pending.delete(id);
            reject(Error('SHARED_CONSUMER_CHILD_IPC_DEADLINE'));
          },
          operation === 'consume' ? 300000 : 10000,
        );
      pending.set(id, { resolve, reject, timer });
      if (!child.connected) {
        clearTimeout(timer);
        pending.delete(id);
        reject(Error('SHARED_CONSUMER_CHILD_DISCONNECTED'));
        return;
      }
      child.send({ operation, id });
    });
  child.send({ operation: 'start', config: configuration });
  const startupDeadline = setTimeout(
    () =>
      readyReject(Error('SHARED_CONSUMER_CHILD_STARTUP_DEADLINE:' + stderr)),
    180000,
  );
  try {
    const info = await ready;
    return {
      info,
      ask,
      stop,
      diagnostics: () => ({
        stdout,
        stderr,
        closed,
        exitCode: child.exitCode,
        signalCode: child.signalCode,
      }),
    };
  } catch (error) {
    try {
      await stop();
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        'SHARED_CONSUMER_CHILD_START_FAILED',
        { cause: cleanupError },
      );
    }
    throw error;
  } finally {
    clearTimeout(startupDeadline);
  }
}
