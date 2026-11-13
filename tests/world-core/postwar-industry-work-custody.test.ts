/** Real embedded metadata/role/claim boundary. No genuine Social source, WORK
 * execution, production, economic FINAL or production permissions are claimed. */
import { readFile } from 'node:fs/promises';
import { afterAll, afterEach, beforeAll, describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import * as C from '@econmind/core';
import { parseCanonicalCommand } from '@econmind/core';
import {
  createIndustryFirstDayWorkState,
  prepareIndustryRunScheduleFrame,
  prepareIndustryFirstDayWorkFrame,
} from '@econmind/core/industry-first-day-work';
import { createIndustryFirstDayWorkCoreFixture } from '../support/industry-first-day-work-core-fixture.js';
import { createPostwarIndustryRunCustodyFixture } from '../support/postwar-industry-run-custody-fixture.js';
import { INDUSTRY_WORK_SCOPE_QUERY } from '../../apps/world-worker/src/persistence/postwar-industry-work-runtime.js';
const read = (s: string) =>
  readFile(new URL('../../database/' + s, import.meta.url), 'utf8');
describe('fixed automatic Industry WORK actual claim metadata', () => {
  let f: Awaited<ReturnType<typeof createPostwarIndustryRunCustodyFixture>>,
    params: unknown[];
  beforeAll(async () => {
    f = await createPostwarIndustryRunCustodyFixture();
    for (const p of [
      'migrations/artifacts/0010_world_v2_command_claim_fencing.sql',
      'migrations/artifacts/0012_world_v2_command_claim_active_lease_guard.sql',
      'proposals/postwar-industry-first-day-source.sql',
      'proposals/postwar-industry-work-custody.sql',
      'proposals/postwar-industry-work-publication.sql',
    ])
      await f.db.exec(await read(p));
    const c = parseCanonicalCommand(
      {
        schemaVersion: 'command-v1',
        worldId: f.world,
        commandId: 'COMMAND_TEST_ONLY_WORK_SCOPE',
        commandType: 'CORE_INDUSTRY_FIRST_DAY_WORK_V1',
        actorId: 'ACTOR_TEST_ONLY_WORK_SCOPE',
        authSubject: f.subject,
        countryId: f.countryId,
        officeId: null,
        expectedWorldVersion: '0',
        idempotencyKey: 'KEY_TEST_ONLY_WORK_SCOPE',
        correlationId: 'CORRELATION_TEST_ONLY_WORK_SCOPE',
        simTime: '0',
        submittedAtReal: f.at,
        payload: {
          schemaVersion: 'postwar-industry-work-command-v1',
          runId: 'RUN_TEST_ONLY_METADATA',
          scheduleCommandFingerprint: 'sha256:' + 'a'.repeat(64),
          allocations: [],
        },
      },
      (s) => createHash('sha256').update(s).digest('hex'),
    );
    await f.db.query(
      'insert into world_v2.command_submission(world_id,command_id,idempotency_key,command_type,schema_version,canonical_payload,payload_sha256,command_fingerprint,auth_subject,actor_id,country_id,office_id,expected_world_version,sim_time,correlation_id,submitted_at_real) values($1,$2,$3,$4,$5,$6,$7,$8,$9::uuid,$10,$11,null,0,0,$12,$13::timestamptz)',
      [
        f.world,
        c.commandId,
        c.idempotencyKey,
        c.commandType,
        c.schemaVersion,
        c.canonicalPayload,
        c.payloadHash,
        c.fingerprint,
        c.authSubject,
        c.actorId,
        c.countryId,
        c.correlationId,
        c.submittedAtReal,
      ],
    );
    await f.db.query(
      "insert into world_v2.command_queue(world_id,command_id,authority_kind,available_at_sim_time)values($1,$2,'VERSIONED_AUTOMATIC',0)",
      [f.world, c.commandId],
    );
    await f.db.query(
      "update world_v2.command_queue set queue_state='CLAIMED',claimed_by=$3,claimed_at_real=$4,claim_fencing_token=1 where world_id=$1 and command_id=$2",
      [f.world, c.commandId, f.worker, f.at],
    );
    params = [f.world, c.commandId, c.fingerprint, f.worker, f.at, '0'];
  }, 30000);
  afterEach(async () => {
    await f?.f.reset();
  });
  afterAll(async () => {
    await f?.close();
  });
  it('locks actual lease/head/claimed due task without user authorization or raw metadata writes', async () => {
    await f.begin();
    const r = await f.tx.query(INDUSTRY_WORK_SCOPE_QUERY, params);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({
      world_version: '0',
      event_sequence: '0',
      holder_id: f.worker,
      fencing_token: '1',
    });
    expect(
      (
        await f.tx.query(
          "select has_column_privilege(current_user,'world_v2.command_queue','command_id','UPDATE')queue_update,has_column_privilege(current_user,'world_v2.current_commit_authorization','active','UPDATE')auth_update,has_table_privilege(current_user,'world_v2.command_submission','INSERT')command_insert",
        )
      ).rows[0],
    ).toEqual({
      queue_update: false,
      auth_update: false,
      command_insert: false,
    });
  });
  it('rejects wrong fingerprint/holder/time and a role merely holding reader membership', async () => {
    for (const [i, value] of [
      [2, 'sha256:' + 'b'.repeat(64)],
      [3, 'WORKER_OTHER'],
      [5, '1'],
    ] as const) {
      await f.begin();
      const p = [...params];
      p[i] = value;
      await expect(
        f.tx.query(INDUSTRY_WORK_SCOPE_QUERY, p),
      ).rejects.toMatchObject({ code: '55000' });
    }
    await f.begin({ role: 'BASE' });
    await expect(
      f.tx.query(INDUSTRY_WORK_SCOPE_QUERY, params),
    ).rejects.toMatchObject({ code: '42501' });
    await f.begin();
    await expect(
      f.db.exec('set role world_v2_industry_source_owner'),
    ).rejects.toMatchObject({ code: '42501' });
  });
  it('separates publisher recovery EXEC from the actual source reader and returns genuine absence', async () => {
    await f.f.reset();
    await f.db.exec(
      'grant world_v2_industry_source_publisher to ' + f.f.readerRole,
    );
    try {
      await f.begin({ role: 'world_v2_industry_source_publisher' });
      expect(
        (
          await f.tx.query(
            'select * from world_v2.read_postwar_industry_work_publication_for_run($1,$2,$3,$4)',
            [
              f.world,
              f.countryId,
              'FACILITY_NOT_PUBLISHED',
              'RUN_NOT_PUBLISHED',
            ],
          )
        ).rows,
      ).toHaveLength(0);
      await f.begin();
      await expect(
        f.tx.query(
          'select * from world_v2.read_postwar_industry_work_publication_for_run($1,$2,$3,$4)',
          [f.world, f.countryId, 'FACILITY_NOT_PUBLISHED', 'RUN_NOT_PUBLISHED'],
        ),
      ).rejects.toMatchObject({ code: '42501' });
    } finally {
      await f.f.reset();
      await f.db.exec(
        'revoke world_v2_industry_source_publisher from ' + f.f.readerRole,
      );
    }
  });
  it('queues an exact Core due task once from TEST_ONLY committed schedule metadata, without committing WORK or any money/stock', async () => {
    await f.f.reset();
    await f.db.exec(
      await read('proposals/postwar-source-revocation-fence.sql'),
    );
    await f.db.exec(
      'create role test_industry_work_publisher nologin nosuperuser nobypassrls nocreaterole nocreatedb noreplication;grant world_v2_industry_source_publisher to test_industry_work_publisher',
    );
    const raw = createIndustryFirstDayWorkCoreFixture(),
      world = f.world,
      country = f.f.buyer,
      reg = 'INDUSTRY_TEST_ONLY_RULE_PACKET';
    const sourceText = JSON.stringify({
        worldId: world,
        countryId: country,
        facilityId: raw.source.facilityId,
        recipe: { workersPerDailyOutputUnit: '0.008' },
      }),
      rawSha = createHash('sha256').update(sourceText).digest('hex'),
      sourceRef = 'INDUSTRY_FIRST_DAY_' + rawSha.toUpperCase();
    await f.db.query(
      'insert into world_v2.postwar_industry_original(world_id,country_id,facility_id,registration_ref,seed_fingerprint,admission_ref,operating_source_id,operating_source_hash,checksums_sha256,owner_original_sha256,document_text,document_sha256)values($1,$2,$3,$4,$5,$6,$7,$8,$9,$9,$10,$11)',
      [
        world,
        country,
        raw.source.facilityId,
        reg,
        f.f.seed.fingerprint,
        f.f.admissionRef,
        f.f.seed.sources[0]!.sourceId,
        f.f.seed.sources[0]!.payloadHash,
        'a'.repeat(64),
        sourceText,
        rawSha,
      ],
    );
    await f.db.query(
      'insert into world_v2.postwar_industry_first_day_source values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',
      [
        world,
        country,
        raw.source.facilityId,
        sourceRef,
        reg,
        f.f.seed.seedId,
        f.f.seed.fingerprint,
        f.f.admissionRef,
        raw.source.policyVersion,
        raw.source.policyRawSha256,
        raw.source.userAdoptionRawSha256,
        sourceText,
        rawSha,
      ],
    );
    const source = {
        ...raw.source,
        worldId: world,
        countryId: country,
        seedId: f.f.seed.seedId,
        seedFingerprint: f.f.seed.fingerprint,
        admissionRef: f.f.admissionRef,
        sourceRef,
        sourceRawSha256: rawSha,
      },
      initial = createIndustryFirstDayWorkState([source]);
    const scheduleCommand = C.parseCanonicalCommand(
      {
        schemaVersion: 'command-v1',
        worldId: world,
        commandId: 'COMMAND_TEST_ONLY_CORE_RUN_FOR_PUBLICATION',
        commandType: 'CORE_INDUSTRY_RUN_SCHEDULE_V1',
        actorId: 'ACTOR_TEST_ONLY_CORE_RUN',
        authSubject: f.subject,
        countryId: country,
        officeId: 'INDUSTRY',
        expectedWorldVersion: '0',
        idempotencyKey: 'KEY_TEST_ONLY_CORE_RUN',
        correlationId: 'CORRELATION_TEST_ONLY_CORE_RUN',
        simTime: '0',
        submittedAtReal: f.at,
        payload: { ...raw.terms, sourceRef, sourceRawSha256: rawSha },
      },
      (v) => createHash('sha256').update(v).digest('hex'),
    );
    const scheduled = prepareIndustryRunScheduleFrame(
      {
        state: initial,
        command: scheduleCommand,
        head: { worldVersion: '0', eventSequence: '0' },
        observedAtReal: f.at,
      },
      (v) => createHash('sha256').update(v).digest('hex'),
    );
    await f.db.query(
      'insert into world_v2.command_submission(world_id,command_id,idempotency_key,command_type,schema_version,canonical_payload,payload_sha256,command_fingerprint,auth_subject,actor_id,country_id,office_id,expected_world_version,sim_time,correlation_id,submitted_at_real)values($1,$2,$3,$4,$5,$6,$7,$8,$9::uuid,$10,$11,$12,0,0,$13,$14::timestamptz)',
      [
        world,
        scheduleCommand.commandId,
        scheduleCommand.idempotencyKey,
        scheduleCommand.commandType,
        scheduleCommand.schemaVersion,
        scheduleCommand.canonicalPayload,
        scheduleCommand.payloadHash,
        scheduleCommand.fingerprint,
        scheduleCommand.authSubject,
        scheduleCommand.actorId,
        country,
        scheduleCommand.officeId,
        scheduleCommand.correlationId,
        f.at,
      ],
    );
    const e = scheduled.frame.events[0]!;
    await f.db.query(
      'insert into world_v2.authoritative_event(world_id,event_id,event_sequence,world_version,causation_command_id,correlation_id,event_type,schema_version,canonical_payload,payload_sha256,event_fingerprint,sim_time,recorded_at_real)values($1,$2,1,1,$3,$4,$5,$6,$7,$8,$9,0,$10::timestamptz)',
      [
        world,
        e.eventId,
        scheduleCommand.commandId,
        e.correlationId,
        e.eventType,
        e.schemaVersion,
        e.canonicalPayload,
        e.payloadHash,
        e.fingerprint,
        f.at,
      ],
    );
    await f.db.query(
      "insert into world_v2.command_receipt(world_id,command_id,idempotency_key,schema_version,command_fingerprint,outcome,reason_code,transition_id,world_version_before,world_version_after,sim_time,event_ids,recorded_at_real)values($1,$2,$3,'command-receipt-v2',$4,'COMMITTED',null,$2,0,1,0,$5::jsonb,$6::timestamptz)",
      [
        world,
        scheduleCommand.commandId,
        scheduleCommand.idempotencyKey,
        scheduleCommand.fingerprint,
        JSON.stringify([e.eventId]),
        f.at,
      ],
    );
    await f.db.query(
      'update world_v2.world_head set world_version=1,event_sequence=1 where world_id=$1',
      [world],
    );
    const allocation = raw.allocation,
      payload = {
        schemaVersion: 'postwar-industry-work-command-v1',
        runId: raw.terms.runId,
        scheduleCommandFingerprint: scheduleCommand.fingerprint,
        allocations: [allocation],
      },
      id =
        'COMMAND_INDUSTRY_WORK_' +
        createHash('sha256')
          .update(
            C.canonicalSerialize([
              world,
              scheduleCommand.fingerprint,
              'INDUSTRY_FIRST_DAY_WORK_RULE_V1',
            ]),
          )
          .digest('hex')
          .toUpperCase();
    const workCommand = C.parseCanonicalCommand(
      {
        schemaVersion: 'command-v1',
        worldId: world,
        commandId: id,
        commandType: 'CORE_INDUSTRY_FIRST_DAY_WORK_V1',
        actorId: scheduleCommand.actorId,
        authSubject: f.subject,
        countryId: country,
        officeId: null,
        expectedWorldVersion: '1',
        idempotencyKey: id,
        correlationId: scheduleCommand.correlationId,
        simTime: '230400',
        submittedAtReal: f.at,
        payload,
      },
      (v) => createHash('sha256').update(v).digest('hex'),
    );
    prepareIndustryFirstDayWorkFrame(
      {
        state: scheduled.state,
        command: workCommand,
        head: { worldVersion: '1', eventSequence: '1' },
        observedAtReal: f.at,
      },
      (v) => createHash('sha256').update(v).digest('hex'),
    );
    async function publisher<T>(action: () => Promise<T>) {
      await f.f.reset();
      await f.db.exec(
        'set session authorization test_industry_work_publisher;begin isolation level repeatable read;set local role world_v2_industry_source_publisher',
      );
      try {
        const out = await action();
        await f.db.exec('commit');
        return out;
      } catch (error) {
        await f.db.exec('rollback');
        throw error;
      } finally {
        await f.f.reset();
      }
    }
    const publish = () =>
      f.tx.query(
        'select * from world_v2.publish_postwar_industry_work_due($1,$2,$3,$4,$5,$6::timestamptz,$7,$8,$9)',
        [
          world,
          scheduleCommand.commandId,
          f.worker,
          '1',
          '1',
          f.at,
          '230400',
          workCommand.canonicalPayload,
          workCommand.fingerprint,
        ],
      );
    const first = await publisher(publish);
    expect(first.rows).toHaveLength(1);
    expect(first.rows[0]).toMatchObject({
      command_fingerprint: workCommand.fingerprint,
      publication_status: 'QUEUED',
    });
    expect((await publisher(publish)).rows).toEqual(first.rows);
    const counts = await f.db.query<{
      commands: number;
      events: number;
      financial: number;
      inventory: number;
    }>(
      'select(select count(*)::int from world_v2.command_submission where command_id=$1)commands,(select count(*)::int from world_v2.authoritative_event where causation_command_id=$1)events,(select count(*)::int from world_v2.financial_posting_batch where causation_command_id=$1)financial,(select count(*)::int from world_v2.inventory_posting where causation_command_id=$1)inventory',
      [workCommand.commandId],
    );
    expect(counts.rows[0]).toEqual({
      commands: 1,
      events: 0,
      financial: 0,
      inventory: 0,
    });
    await f.db.query(
      'insert into world_v2.postwar_industry_first_day_source_revocation(world_id,source_ref,reason_ref)values($1,$2,$3)',
      [world, sourceRef, 'TEST_ONLY_REVOKED'],
    );
    expect((await publisher(publish)).rows).toEqual(first.rows); // recovery precedes new-use revocation
  });
});
