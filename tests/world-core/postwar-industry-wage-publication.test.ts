/** Real low-role SQL over tiny TEST_ONLY admission metadata and actual Core
 * RUN/WORK frames. Not a full E03/native source or successful wage execution. */
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import * as C from '@econmind/core';
import {
  createIndustryFirstDayWorkState,
  prepareIndustryRunScheduleFrame,
  prepareIndustryFirstDayWorkFrame,
} from '@econmind/core/industry-first-day-work';
import type { FinanceNativeBudgetCanonicalFrame } from '@econmind/core/finance-budget-native';
import { createIndustryFirstDayWorkCoreFixture } from '../support/industry-first-day-work-core-fixture.js';
import { createPostwarIndustryRunCustodyFixture } from '../support/postwar-industry-run-custody-fixture.js';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const read = (s: string) =>
  readFile(new URL('../../database/' + s, import.meta.url), 'utf8');
describe('fixed committed WORK wage publication and historical source protocol', () => {
  it('issues only an exact automatic task, recovers it once and preserves low-role/source boundaries', async () => {
    const f = await createPostwarIndustryRunCustodyFixture();
    try {
      for (const p of [
        'postwar-industry-first-day-source',
        'postwar-industry-work-custody',
      ])
        await f.db.exec(await read('proposals/' + p + '.sql'));
      await f.db.exec(`
create role world_v2_social_source_reader nologin nosuperuser nobypassrls nocreatedb nocreaterole noreplication;
create role world_v2_finance_budget_source_reader nologin nosuperuser nobypassrls nocreatedb nocreaterole noreplication;
grant usage on schema world_v2 to world_v2_social_source_reader,world_v2_finance_budget_source_reader;
create table world_v2.social_operating_source_registration(world_id text,country_id text,registration_ref text primary key,seed_fingerprint text,admission_ref text);
create table world_v2.finance_budget_policy_original(world_id text,country_id text,policy_ref text primary key,seed_fingerprint text,admission_ref text);
alter table world_v2.social_operating_source_registration enable row level security;
alter table world_v2.social_operating_source_registration force row level security;
alter table world_v2.finance_budget_policy_original enable row level security;
alter table world_v2.finance_budget_policy_original force row level security;
create role test_wage_publisher nologin nosuperuser nobypassrls nocreatedb nocreaterole noreplication;
grant world_v2_industry_source_publisher to test_wage_publisher;
grant world_v2_social_source_reader,world_v2_finance_budget_source_reader to ${f.f.readerRole};`);
      for (const [p, t] of [
        ['social-operating-custody.sql', 'social_operating_source_revocation'],
        ['finance-budget-custody.sql', 'finance_budget_policy_revocation'],
      ] as const) {
        const s = await read('proposals/' + p),
          a = s.indexOf('create table world_v2.' + t + '('),
          b = s.indexOf(');', a);
        if (a < 0 || b < a) throw Error('ACTUAL_REVOCATION_DDL_REQUIRED');
        await f.db.exec(s.slice(a, b + 2));
        await f.db.exec(
          `alter table world_v2.${t} enable row level security;alter table world_v2.${t} force row level security`,
        );
      }
      for (const p of [
        'postwar-industry-run-history',
        'postwar-industry-wage-history',
        'postwar-industry-wage-publication',
        'postwar-source-revocation-fence',
      ])
        await f.db.exec(await read('proposals/' + p + '.sql'));
      const raw = createIndustryFirstDayWorkCoreFixture(),
        country = 'COUNTRY_02',
        sourceText = C.canonicalSerialize({
          worldId: f.world,
          countryId: country,
          facilityId: raw.source.facilityId,
          recipe: { workersPerDailyOutputUnit: '0.008' },
        }),
        sourceSha = sha(sourceText),
        sourceRef = 'INDUSTRY_FIRST_DAY_' + sourceSha.toUpperCase(),
        reg = 'REGISTRATION_TEST_ONLY_WAGE';
      await f.db.query(
        'insert into world_v2.postwar_industry_original(world_id,country_id,facility_id,registration_ref,seed_fingerprint,admission_ref,operating_source_id,operating_source_hash,checksums_sha256,owner_original_sha256,document_text,document_sha256)values($1,$2,$3,$4,$5,$6,$7,$8,$9,$9,$10,$11)',
        [
          f.world,
          country,
          raw.source.facilityId,
          reg,
          f.f.seed.fingerprint,
          f.f.admissionRef,
          f.f.seed.sources[0]!.sourceId,
          f.f.seed.sources[0]!.payloadHash,
          'a'.repeat(64),
          sourceText,
          sourceSha,
        ],
      );
      await f.db.query(
        'insert into world_v2.postwar_industry_first_day_source values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',
        [
          f.world,
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
          sourceSha,
        ],
      );
      for (const [t, ref] of [
        ['social_operating_source_registration', 'REGISTRATION_TEST_ONLY_HOST'],
        ['finance_budget_policy_original', 'POLICY_TEST_ONLY_HOST'],
      ] as const)
        await f.db.query(`insert into world_v2.${t} values($1,$2,$3,$4,$5)`, [
          f.world,
          country,
          ref,
          f.f.seed.fingerprint,
          f.f.admissionRef,
        ]);
      const source = {
        ...raw.source,
        worldId: f.world,
        countryId: country,
        seedId: f.f.seed.seedId,
        seedFingerprint: f.f.seed.fingerprint,
        admissionRef: f.f.admissionRef,
        sourceRef,
        sourceRawSha256: sourceSha,
      };
      const parse = (
        id: string,
        type: string,
        version: string,
        time: string,
        payload: unknown,
        automatic = false,
      ) =>
        C.parseCanonicalCommand(
          {
            schemaVersion: 'command-v1',
            worldId: f.world,
            commandId: id,
            commandType: type,
            actorId: 'ACTOR_TEST_ONLY_WAGE',
            authSubject: f.subject,
            countryId: country,
            officeId: automatic ? null : 'INDUSTRY',
            expectedWorldVersion: version,
            idempotencyKey: id,
            correlationId: 'CORRELATION_TEST_ONLY_WAGE',
            simTime: time,
            submittedAtReal: f.at,
            payload,
          },
          sha,
        );
      const scheduled = prepareIndustryRunScheduleFrame(
        {
          state: createIndustryFirstDayWorkState([source]),
          command: parse(
            'COMMAND_TEST_ONLY_WAGE_RUN',
            'CORE_INDUSTRY_RUN_SCHEDULE_V1',
            '0',
            '0',
            { ...raw.terms, sourceRef, sourceRawSha256: sourceSha },
          ),
          head: { worldVersion: '0', eventSequence: '0' },
          observedAtReal: f.at,
        },
        sha,
      );
      const worked = prepareIndustryFirstDayWorkFrame(
        {
          state: scheduled.state,
          command: parse(
            'COMMAND_TEST_ONLY_WAGE_WORK',
            'CORE_INDUSTRY_FIRST_DAY_WORK_V1',
            '1',
            '230400',
            {
              schemaVersion: 'postwar-industry-work-command-v1',
              runId: raw.terms.runId,
              scheduleCommandFingerprint: scheduled.frame.command.fingerprint,
              allocations: [raw.allocation],
            },
            true,
          ),
          head: { worldVersion: '1', eventSequence: '1' },
          observedAtReal: f.at,
        },
        sha,
      );
      async function store(frame: FinanceNativeBudgetCanonicalFrame) {
        const c = frame.command,
          r = frame.receipt;
        await f.db.query(
          'insert into world_v2.command_submission(world_id,command_id,idempotency_key,command_type,schema_version,canonical_payload,payload_sha256,command_fingerprint,auth_subject,actor_id,country_id,office_id,expected_world_version,sim_time,correlation_id,submitted_at_real)values($1,$2,$3,$4,$5,$6,$7,$8,$9::uuid,$10,$11,$12,$13::bigint,$14::numeric,$15,$16::timestamptz)',
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
            c.officeId,
            c.expectedWorldVersion,
            c.simTime.toCanonicalValue(),
            c.correlationId,
            c.submittedAtReal,
          ],
        );
        for (const e of frame.events)
          await f.db.query(
            'insert into world_v2.authoritative_event(world_id,event_id,event_sequence,world_version,causation_command_id,correlation_id,event_type,schema_version,canonical_payload,payload_sha256,event_fingerprint,sim_time,recorded_at_real)values($1,$2,$3::bigint,$4::bigint,$5,$6,$7,$8,$9,$10,$11,$12::numeric,$13::timestamptz)',
            [
              f.world,
              e.eventId,
              e.sequence,
              e.worldVersion,
              e.causationCommandId,
              e.correlationId,
              e.eventType,
              e.schemaVersion,
              e.canonicalPayload,
              e.payloadHash,
              e.fingerprint,
              e.simTime.toCanonicalValue(),
              e.recordedAtReal,
            ],
          );
        await f.db.query(
          'insert into world_v2.command_receipt(world_id,command_id,idempotency_key,schema_version,command_fingerprint,outcome,reason_code,transition_id,world_version_before,world_version_after,sim_time,event_ids,recorded_at_real)values($1,$2,$3,$4,$5,$6,$7,$8,$9::bigint,$10::bigint,$11::numeric,$12::jsonb,$13::timestamptz)',
          [
            f.world,
            c.commandId,
            c.idempotencyKey,
            r.schemaVersion,
            r.commandFingerprint,
            r.outcome,
            r.reasonCode,
            r.transitionId,
            r.worldVersionBefore,
            r.worldVersionAfter,
            r.simTime.toCanonicalValue(),
            JSON.stringify(r.eventIds),
            r.recordedAtReal,
          ],
        );
      }
      await store(scheduled.frame);
      await store(worked.frame);
      await f.db.query(
        'update world_v2.world_head set world_version=2,event_sequence=2 where world_id=$1',
        [f.world],
      );
      const e = worked.frame.events[0]!,
        policy = 'INDUSTRY_ACTUAL_COMPLETED_WORK_WAGE_V2',
        key = sha(
          C.canonicalSerialize([
            f.world,
            f.f.seed.fingerprint,
            e.fingerprint,
            policy,
          ]),
        ).toUpperCase(),
        wage = parse(
          'COMMAND_INDUSTRY_WAGE_' + key,
          'CORE_INDUSTRY_OPERATING_WAGE_PAY_V1',
          '2',
          '230400',
          {
            schemaVersion: 'industry-operating-wage-payment-v1',
            workEventId: e.eventId,
            workEventFingerprint: e.fingerprint,
            policyVersion: policy,
          },
          true,
        );
      // Publisher key has its own fixed idempotency prefix, unlike this fixture's generic parser.
      const {
        canonicalPayload,
        fingerprint: ignored,
        payloadHash: ignoredHash,
        simTime,
        ...fields
      } = wage;
      void ignored;
      void ignoredHash;
      const command = C.parseCanonicalCommand(
        {
          ...fields,
          idempotencyKey: 'INDUSTRY_WAGE_' + key,
          simTime: simTime.toCanonicalValue(),
          payload: JSON.parse(canonicalPayload) as unknown,
        },
        sha,
      );
      const params = [
        f.world,
        e.eventId,
        e.fingerprint,
        f.worker,
        '2',
        '2',
        f.at,
        '230400',
        command.fingerprint,
      ];
      const run = async <T>(role: string, action: () => Promise<T>) => {
        await f.begin({ role });
        try {
          const v = await action();
          await f.db.exec('commit');
          return v;
        } catch (e) {
          await f.db.exec('rollback');
          throw e;
        } finally {
          await f.f.reset();
        }
      };
      const publish = () =>
        f.tx.query<Record<string, unknown>>(
          'select * from world_v2.publish_postwar_industry_wage_due($1,$2,$3,$4,$5,$6,$7::timestamptz,$8,$9)',
          params,
        );
      await expect(run(f.readerRole, publish)).rejects.toMatchObject({
        code: '42501',
      });
      // Use a real separate test publisher login, not owner/admin membership.
      await f.db.exec(
        'grant world_v2_industry_source_publisher to ' + f.f.readerRole,
      );
      const validFingerprint = params[8];
      params[8] = 'sha256:' + '0'.repeat(64);
      await expect(
        run('world_v2_industry_source_publisher', publish),
      ).rejects.toThrow('CORE_CANONICAL_FINGERPRINT_REQUIRED');
      params[8] = validFingerprint;
      params[4] = '1';
      await expect(
        run('world_v2_industry_source_publisher', publish),
      ).rejects.toThrow('CURRENT_HEAD_REQUIRED');
      params[4] = '2';
      const issued = await run('world_v2_industry_source_publisher', publish);
      expect(issued.rows).toHaveLength(1);
      expect(issued.rows[0]?.command_fingerprint).toBe(command.fingerprint);
      expect(
        C.parseCanonicalCommand(
          JSON.parse(String(issued.rows[0]!.command_json)) as unknown,
          sha,
        ),
      ).toEqual(command);
      expect(
        (await run('world_v2_industry_source_publisher', publish)).rows,
      ).toEqual(issued.rows);
      const history = [
        f.world,
        country,
        'SOCIAL',
        country,
        e.eventId,
        e.fingerprint,
        '2',
        '2',
        f.f.seed.fingerprint,
        f.f.admissionRef,
      ];
      const readOriginal = () =>
        f.tx.query<Record<string, unknown>>(
          'select * from world_v2.read_postwar_industry_completed_work_original($1,$2,$3,$4,$5,$6,$7::bigint,$8::bigint,$9,$10)',
          history,
        );
      expect(
        (await run('world_v2_social_source_reader', readOriginal)).rows[0]
          ?.run_maximum_expense_amount,
      ).toBe(raw.terms.maximumExpense.amount);
      history[2] = 'FINANCE';
      expect(
        (await run('world_v2_finance_budget_source_reader', readOriginal)).rows,
      ).toHaveLength(1);
      history[2] = 'SOCIAL';
      await expect(
        run('world_v2_finance_budget_source_reader', readOriginal),
      ).rejects.toMatchObject({ code: '42501' });
      const counts = await f.db.query<{ n: string }>(
        'select count(*)::text n from world_v2.command_queue',
      );
      expect(counts.rows[0]?.n).toBe('1');
      expect(
        (await f.db.query('select * from world_v2.financial_posting_batch'))
          .rows,
      ).toHaveLength(0);
      await f.db.query(
        'insert into world_v2.postwar_industry_first_day_source_revocation(world_id,source_ref,reason_ref)values($1,$2,$3)',
        [f.world, sourceRef, 'TEST_ONLY_SOURCE_REVOKED'],
      );
      expect(
        (await run('world_v2_social_source_reader', readOriginal)).rows,
      ).toHaveLength(1);
      await f.db.query(
        'insert into world_v2.social_operating_source_revocation(registration_ref,reason_ref)values($1,$2)',
        ['REGISTRATION_TEST_ONLY_HOST', 'TEST_ONLY_HOST_REVOKED'],
      );
      await expect(
        run('world_v2_social_source_reader', readOriginal),
      ).rejects.toThrow('HOST_SOURCE_REVOKED');
      await f.begin();
      const privileges = await f.tx.query<{
        raw: boolean;
        auth_update: boolean;
        insert_queue: boolean;
      }>(
        "select has_table_privilege(current_user,'world_v2.postwar_industry_wage_publication','SELECT')raw,has_column_privilege(current_user,'world_v2.current_commit_authorization','active','UPDATE')auth_update,has_table_privilege(current_user,'world_v2.command_queue','INSERT')insert_queue",
      );
      expect(privileges.rows).toEqual([
        { raw: false, auth_update: false, insert_queue: false },
      ]);
    } finally {
      await f.close();
    }
  });
});
