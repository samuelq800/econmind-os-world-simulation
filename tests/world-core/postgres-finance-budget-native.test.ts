/** Explicit native integration against a cloned persistent actual generated
 * seed and controlled TEST_ONLY opening admission. It installs candidate SQL
 * only in its owned clone; no production, persistent keys, Clock or host loop. */
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import { describe, it, expect } from 'vitest';
import * as C from '@econmind/core';
import type { FinancialIntakeBindingDto } from '@econmind/core/authenticated-financial-intake-contract';
import {
  FINANCE_NATIVE_BUDGET_RULE,
  type FinanceNativeBudgetPolicy,
} from '@econmind/core/finance-budget-native';
import {
  loadPostwarNativeReferenceMarker,
  clonePostwarNativeReference,
} from '../support/postwar-native-reference-db.js';
import { PostgresSqlDatabase } from '../../apps/world-worker/src/persistence/postgres-sql-database.js';
import type { SqlDatabase } from '../../apps/world-worker/src/persistence/sql-database.js';
import {
  createFinanceBudgetAuthorizationDatabase,
  createPostgresFinanceBudgetNativeRuntime,
} from '../../apps/world-worker/src/persistence/postgres-finance-budget-custody.js';
import { createFinanceBudgetIntakeAuthorizationPool } from '../../apps/world-worker/src/persistence/finance-budget-intake-authorization.js';
import {
  createPostwarCentralBankOmoReader,
  PostwarOmoOriginalsMissing,
} from '../../apps/world-worker/src/persistence/postwar-financial-command-source.js';
import { createManualOfficeIntakeRuntime } from '../../apps/world-worker/src/intake/manual-office-intake-runtime.js';
import {
  PostgresOfficeCommandIntake,
  OFFICE_COMMAND_CURRENT_BINDING_QUERY,
} from '../../apps/world-worker/src/intake/postgres-office-command-intake.js';
import { createAuthoritativeWorkerExecution } from '../../apps/world-worker/src/authoritative-execution.js';
import { DurableV08LedgerLineageReader } from '../../apps/world-worker/src/persistence/durable-v08-ledger-lineage-reader.js';
const native =
  process.env.ECONMIND_POSTWAR_FINANCE_BUDGET_NATIVE === '1'
    ? describe
    : describe.skip;
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
native(
  'actual native Finance budget source → staged intake → sole consumer → atomic receipt TEST_ONLY',
  () => {
    it('uses original encumbrances, commits envelope/line exactly once and reads durable receipts after reconnect', async () => {
      const marker = await loadPostwarNativeReferenceMarker(
        process.env.ECONMIND_POSTWAR_REFERENCE_MARKER ??
          '/workspace/.cloud-setup/evidence/postwar-reference-persistent-20261028/reference-db.json',
      );
      const clone = await clonePostwarNativeReference(
        marker,
        'finance_budget',
        process.env.ECONMIND_POSTWAR_BOUNDED_TEMPLATE ?? marker.database,
      );
      const nonce = randomBytes(4).toString('hex'),
        workerRole = 'budget_test_worker_' + nonce,
        intakeRole = 'budget_test_intake_' + nonce,
        publisherRole = 'budget_test_publisher_' + nonce,
        workerId = 'WORKER_NATIVE_BUDGET_' + nonce.toUpperCase();
      const pools: Pool[] = [];
      const phases: { phase: string; milliseconds: number }[] = [];
      const failures: {
        name: string;
        message: string;
        code: string | null;
      }[][] = [];
      const describeFailure = (error: unknown) => {
        const chain: { name: string; message: string; code: string | null }[] =
          [];
        let cause = error;
        while (cause instanceof Error && chain.length < 5) {
          chain.push({
            name: cause.name,
            message: cause.message,
            code: 'code' in cause ? String(cause.code) : null,
          });
          cause = cause.cause;
        }
        return chain;
      };
      const timed = async <T>(phase: string, work: () => Promise<T>) => {
        const start = performance.now();
        try {
          return await work();
        } finally {
          phases.push({ phase, milliseconds: performance.now() - start });
        }
      };
      let completed = false,
        cap = 'NOT_CALCULATED',
        budget:
          | ReturnType<typeof createPostgresFinanceBudgetNativeRuntime>
          | undefined,
        runtime: ReturnType<typeof createManualOfficeIntakeRuntime> | undefined;
      try {
        await clone.installer.query(
          await readFile(
            new URL(
              '../../database/proposals/finance-budget-custody.sql',
              import.meta.url,
            ),
            'utf8',
          ),
        );
        await clone.installer.query(
          `create role ${workerRole} login nosuperuser nobypassrls nocreatedb nocreaterole noreplication;create role ${intakeRole} login nosuperuser nobypassrls nocreatedb nocreaterole noreplication;create role ${publisherRole} login nosuperuser nobypassrls nocreatedb nocreaterole noreplication;grant world_v2_finance_budget_source_reader,world_v2_postwar_offline_seed_reader to ${workerRole};grant world_v2_finance_budget_source_reader to ${intakeRole};grant world_v2_finance_budget_source_publisher to ${publisherRole};grant usage on schema world_v2 to ${workerRole},${intakeRole},${publisherRole};grant select on world_v2.world_head,world_v2.current_commit_authorization,world_v2.runtime_read_seat,world_v2.projection_entitlement,world_v2.runtime_opening_admission,world_v2.opening_seed,world_v2.command_submission,world_v2.command_queue,world_v2.command_receipt,world_v2.authoritative_event,world_v2.inventory_posting,world_v2.financial_posting_batch,world_v2.authoritative_commit_authorization,world_v2.current_materialization,world_v2.notification_outbox,world_v2.world_writer_lease to ${workerRole};grant insert on world_v2.command_submission,world_v2.command_queue,world_v2.command_receipt,world_v2.authoritative_event,world_v2.inventory_posting,world_v2.financial_posting_batch,world_v2.authoritative_commit_authorization,world_v2.current_materialization,world_v2.notification_outbox to ${workerRole};grant update on world_v2.command_queue,world_v2.world_head,world_v2.current_materialization to ${workerRole};grant update(renewed_at_real)on world_v2.world_writer_lease to ${workerRole};grant select on world_v2.world_head,world_v2.current_commit_authorization,world_v2.runtime_read_seat,world_v2.projection_entitlement,world_v2.runtime_opening_admission,world_v2.command_submission,world_v2.command_queue,world_v2.command_receipt to ${intakeRole};grant select(world_id,seed_id,seed_fingerprint,replay_binding)on world_v2.opening_seed to ${intakeRole};grant insert on world_v2.command_submission,world_v2.command_queue to ${intakeRole};grant update(command_id)on world_v2.command_submission to ${intakeRole},${workerRole};grant update(world_version)on world_v2.world_head to ${intakeRole}`,
        );
        // Metadata row-lock grants follow the existing intake protocol; neither
        // consumer nor intake receives UPDATE on current authorization/entitlement.
        // The isolated writer follows the existing lease metadata row-lock
        // protocol. This test grant is not a production enrollment approval.
        await clone.installer.query(
          `create policy budget_test_worker_seed_${nonce} on world_v2.opening_seed for select to ${workerRole} using(world_id='${marker.worldId}' and seed_fingerprint='${marker.seedFingerprint}' and current_setting('request.jwt.claim.sub',true)='${marker.subject}');create policy budget_test_intake_seed_${nonce} on world_v2.opening_seed for select to ${intakeRole} using(world_id='${marker.worldId}' and current_setting('request.jwt.claim.sub',true)='${marker.subject}')`,
        );
        await clone.installer.query(
          `alter table world_v2.world_writer_lease enable row level security;alter table world_v2.world_writer_lease force row level security;create policy budget_test_lease_read_${nonce} on world_v2.world_writer_lease for select to ${workerRole},world_v2_finance_budget_source_owner using(world_id='${marker.worldId}');create policy budget_test_lease_lock_${nonce} on world_v2.world_writer_lease for update to ${workerRole},world_v2_finance_budget_source_owner using(world_id='${marker.worldId}')with check(false)`,
        );
        const connected = (role: string) => {
          const p = new Pool({
            host: marker.socket,
            port: marker.port,
            database: clone.database,
            user: role,
            password: async () => '',
            ssl: false,
            max: 2,
            idleTimeoutMillis: 1000,
            options: '-c request.jwt.claim.sub=' + marker.subject,
          });
          p.on('error', () => undefined);
          pools.push(p);
          return p;
        };
        const publisher = connected(publisherRole),
          worker = connected(workerRole),
          rawIntake = connected(intakeRole);
        const leasePrivileges = await worker.query(
          `select has_any_column_privilege(current_user,'world_v2.current_commit_authorization','UPDATE')as authority_update,has_any_column_privilege(current_user,'world_v2.projection_entitlement','UPDATE')as entitlement_update`,
        );
        expect(leasePrivileges.rows).toEqual([
          { authority_update: false, entitlement_update: false },
        ]);
        const foreignWorld = 'WORLD_NATIVE_BUDGET_FOREIGN_TEST_ONLY';
        await clone.installer.query(
          'insert into world_v2.world_head values($1,0,0)',
          [foreignWorld],
        );
        await clone.installer.query(
          "insert into world_v2.world_writer_lease values($1,'WORKER_FOREIGN',1,now(),now(),now()+interval '10 minutes')",
          [foreignWorld],
        );
        expect(
          (
            await worker.query(
              'select * from world_v2.world_writer_lease where world_id=$1 for share',
              [foreignWorld],
            )
          ).rows,
        ).toEqual([]);
        expect(
          (
            await worker.query(
              'update world_v2.world_writer_lease set renewed_at_real=renewed_at_real where world_id=$1',
              [foreignWorld],
            )
          ).rowCount,
        ).toBe(0);
        const storedSeat = await clone.installer.query(
          "select seat_ref,authorization_revision from world_v2.runtime_read_seat where world_id=$1 and auth_subject=$2::uuid and country_id=$3 and office_id='FINANCE'",
          [marker.worldId, marker.subject, marker.countryId],
        );
        const exactScope =
          'OFFICE_' +
          Buffer.from(marker.countryId).toString('hex').toUpperCase() +
          '_' +
          Buffer.from('FINANCE').toString('hex').toUpperCase();
        const metadataArgs = [
          marker.worldId,
          marker.subject,
          marker.countryId,
          'FINANCE',
          storedSeat.rows[0].seat_ref,
          storedSeat.rows[0].authorization_revision,
          'FINANCE_BUDGET',
          exactScope,
        ];
        const metadataDirect = await rawIntake.query(
          OFFICE_COMMAND_CURRENT_BINDING_QUERY,
          metadataArgs,
        );
        const metadataLocked = await rawIntake.query(
          'select * from world_v2.lock_finance_budget_intake_binding($1,$2::uuid,$3,$4,$5,$6,$7,$8)',
          metadataArgs,
        );
        expect(metadataLocked.rows).toEqual(metadataDirect.rows);
        const source = await timed(
          'read_exact_original_financial_and_encumbrance_fields',
          () =>
            clone.installer.query<{
              government: string;
              currency: string;
              account: string;
              gross: string;
              encumbered: string;
            }>(
              `with roots as(select (x->>'canonicalPayload')::jsonb as body from world_v2.opening_seed s cross join lateral jsonb_array_elements(s.canonical_payload::jsonb->'sources')x where s.world_id=$1),financial as(select body from roots where body->>'schemaVersion'='adopted-financial-opening-source-v2'),roster as(select x->'roster' as roster from financial cross join lateral jsonb_array_elements(body->'assembly'->'countries')x where x->>'countryId'=$2),operating as(select body from roots where body->>'schemaVersion'='postwar-operating-genesis-seed-source-v1'),financial_original as(select(d->>'bytes')::jsonb as original from operating cross join lateral jsonb_array_elements(body->'carrier'->'documents')d where d->>'documentId'='POSTWAR_FINANCIAL_OFFICE_ORIGINALS'),country as(select x as country from financial_original cross join lateral jsonb_array_elements(original->'contract'->'countries')x where x->>'countryId'=$2),legs as(select l from world_v2.opening_seed s cross join lateral jsonb_array_elements(s.canonical_payload::jsonb->'financialBatches')b cross join lateral jsonb_array_elements(b->'legs')l cross join roster r cross join country c where s.world_id=$1 and l->'account'->>'countryId'=$2 and l->'account'->>'ownerId'=r.roster->>'government'and l->'account'->>'counterpartyEntityId'=r.roster->>'centralBank'and l->'account'->>'accountClass'='ASSET'and l->>'direction'='DEBIT'and l->'account'->>'currency'=c.country->>'localCurrency')select r.roster->>'government'as government,c.country->>'localCurrency'as currency,l->'account'->>'accountId'as account,l->'amount'->>'amount'as gross,(select coalesce(sum((f->>'ceilingAmount')::numeric),0)::text from operating o cross join lateral jsonb_array_elements(o.body->'carrier'->'facts'->'funding')f where f->>'accountId'=l->'account'->>'accountId')as encumbered from legs cross join roster r cross join country c`,
              [marker.worldId, marker.countryId],
            ),
        );
        expect(source.rows).toHaveLength(1);
        const original = source.rows[0]!;
        const free = C.Money.from(original.gross, original.currency).subtract(
          C.Money.from(original.encumbered, original.currency),
        );
        expect(free.amount.isNegative()).toBe(false);
        cap = C.canonicalDecimal(free.amount.dividedBy('2'));
        const policy: FinanceNativeBudgetPolicy = {
          schemaVersion: 'finance-native-budget-policy-v1',
          ruleRef: FINANCE_NATIVE_BUDGET_RULE,
          ruleRevision: 'RULE_NATIVE_TEST_ONLY_V1',
          sourceDocumentSHA256:
            'sha256:' +
            sha(
              await readFile(
                new URL('../../specs/extracted/FINANCE.md', import.meta.url),
                'utf8',
              ),
            ),
          normativeUnits: [
            'FINANCE-U0247',
            'FINANCE-U0252',
            'FINANCE-U0265',
            'FINANCE-U0295',
          ],
          worldId: marker.worldId,
          countryId: marker.countryId,
          governmentEntityId: original.government,
          currency: original.currency,
          envelopeRef: 'NATIVE_FINANCE_SELF_ADMIN',
          effectivePeriodRef: 'EXPLICIT_TEST_ONLY_OPENING_PERIOD',
          periodRevision: 'PERIOD_REV_TEST_ONLY',
          validFromSimTime: '0',
          validUntilSimTime: '1000000000',
          requestingOfficeId: 'FINANCE',
          programmeOwnerOfficeId: 'FINANCE',
          classification: 'ORDINARY_DEPARTMENTAL',
          funding: 'FULL_UNCONDITIONAL',
          requiredApprovalOffices: ['FINANCE'],
        };
        await timed('controlled_normative_policy_publication', () =>
          publisher.query(
            'select world_v2.publish_finance_budget_policy($1,$2,$3,$4,$5,$6)',
            [
              'POLICY_NATIVE_BUDGET_TEST_ONLY',
              'ISOLATED_TEST_ONLY_POLICY_PUBLISHER',
              C.canonicalSerialize(policy),
              marker.seedFingerprint,
              marker.admissionRef,
              policy.sourceDocumentSHA256.slice(7),
            ],
          ),
        );
        const now = new Date();
        await clone.installer.query(
          'insert into world_v2.world_writer_lease(world_id,holder_id,fencing_token,acquired_at_real,renewed_at_real,lease_expires_at_real)values($1,$2,1,$3,$3,$4)',
          [
            marker.worldId,
            workerId,
            now.toISOString(),
            new Date(now.getTime() + 600000).toISOString(),
          ],
        );
        const rawDatabase = new PostgresSqlDatabase(worker);
        const diagnosedDatabase: SqlDatabase = {
          query: rawDatabase.query.bind(rawDatabase),
          async transaction(operation) {
            try {
              return await rawDatabase.transaction((tx) =>
                operation({
                  async query<Row extends object>(
                    statement: string,
                    parameters?: readonly unknown[],
                  ) {
                    try {
                      return await tx.query<Row>(statement, parameters);
                    } catch (error) {
                      failures.push([
                        {
                          name: 'SQL_STATEMENT',
                          message: statement,
                          code: null,
                        },
                        ...describeFailure(error),
                      ]);
                      throw error;
                    }
                  },
                }),
              );
            } catch (error) {
              failures.push(describeFailure(error));
              throw error;
            }
          },
        };
        const database =
          createFinanceBudgetAuthorizationDatabase(diagnosedDatabase);
        budget = createPostgresFinanceBudgetNativeRuntime({
          database,
          workerId,
          sha256Hex: sha,
        });
        const intakePool =
            createFinanceBudgetIntakeAuthorizationPool(rawIntake),
          clock = {
            nowReal: () => new Date().toISOString(),
            simTime: async () => '0',
          };
        runtime = createManualOfficeIntakeRuntime({
          intakePool,
          workerDatabase: database,
          worldId: marker.worldId,
          workerId,
          clock,
          sha256Hex: sha,
          environment: { ECONMIND_ENV: 'ci', NODE_ENV: 'test', VITEST: 'true' },
          readers: { financeBudget: budget },
        });
        runtime.consumer.startPreparation();
        const intake = new PostgresOfficeCommandIntake({
          pool: intakePool,
          runtime,
          role: intakeRole,
          clock,
        });
        const binding = async (): Promise<FinancialIntakeBindingDto> => {
          const r = await clone.installer.query(
            `select s.seat_ref,a.team_id,a.authorization_version,h.world_version::text,h.event_sequence::text,ad.model_version,e.scope_key from world_v2.runtime_read_seat s join world_v2.current_commit_authorization a using(world_id,auth_subject,country_id,office_id)join world_v2.world_head h using(world_id)join world_v2.runtime_opening_admission ad using(world_id)join world_v2.projection_entitlement e on e.world_id=s.world_id and e.auth_subject=s.auth_subject and e.authorization_version=s.authorization_revision and e.classification='OFFICE_PRIVATE'and e.scope_key='OFFICE_'||upper(encode(convert_to(s.country_id,'UTF8'),'hex'))||'_'||upper(encode(convert_to(s.office_id,'UTF8'),'hex')) where s.world_id=$1 and s.auth_subject=$2::uuid and s.office_id='FINANCE'and a.capability='FINANCE_BUDGET'`,
            [marker.worldId, marker.subject],
          );
          expect(r.rows).toHaveLength(1);
          const seat = r.rows[0];
          return {
            source: 'SERVER_VERIFIED_READ_BINDING',
            capability: 'READ_AUTHORIZED_PROJECTION_AND_FINAL',
            seatRef: seat.seat_ref,
            seatState: 'ACTIVE',
            identity: {
              authSubjectId: marker.subject,
              worldId: marker.worldId,
              countryId: marker.countryId,
              officeId: 'FINANCE',
              scopeKey: seat.scope_key,
              classification: 'OFFICE_PRIVATE',
              authorizationRevision: seat.authorization_version,
              modelVersion: seat.model_version,
              projectionVersion: 'postwar-office-runtime-read-v1',
            },
            seed: {
              worldId: marker.worldId,
              seedRef: marker.seedId,
              contentHash: marker.seedFingerprint,
              admissionRef: marker.admissionRef,
            },
            readback: {
              worldId: marker.worldId,
              seedRef: marker.seedId,
              contentHash: marker.seedFingerprint,
              admissionRef: marker.admissionRef,
              worldVersion: seat.world_version,
              eventSequence: seat.event_sequence,
              readbackRef: marker.admissionRef,
            },
          };
        };
        const principal: C.AuthenticatedPrincipal = {
          authSubject: C.authSubject(marker.subject),
          facts: {
            user_id: marker.subject,
            display_name: null,
            school_id: null,
          },
          token: {
            subject: marker.subject,
            issuer: 'TEST_ONLY_AUTHENTICATED_INTAKE',
            audience: 'world-api',
            issuedAt: clock.nowReal(),
            expiresAt: new Date(Date.now() + 600000).toISOString(),
          },
        };
        const request = (
          operation: 'SET_ENVELOPE' | 'APPROVE_NEW_LINE',
          version: string,
          suffix: string,
        ) => ({
          worldId: marker.worldId,
          countryId: marker.countryId,
          officeId: 'FINANCE' as const,
          commandType: 'CORE_FINANCE_BUDGET_APPROPRIATION_V1' as const,
          commandId: 'COMMAND_NATIVE_BUDGET_' + suffix,
          idempotencyKey: 'KEY_NATIVE_BUDGET_' + suffix,
          expectedWorldVersion: version,
          payload: {
            operation,
            scope: {
              worldId: marker.worldId,
              countryId: marker.countryId,
              entityRef: original.government,
              envelopeRef: policy.envelopeRef,
              effectivePeriodRef: policy.effectivePeriodRef,
            },
            currency: original.currency,
            amount: cap,
            envelopeRevisionRef: 'ENVELOPE_REV_NATIVE',
            lineRef:
              operation === 'SET_ENVELOPE' ? null : 'LINE_NATIVE_SELF_ADMIN',
            revisionRef:
              operation === 'SET_ENVELOPE'
                ? 'ENVELOPE_REV_NATIVE'
                : 'LINE_REV_NATIVE',
            predecessorRevisionRef: null,
          },
        });
        for (const [operation, version, suffix] of [
          ['SET_ENVELOPE', '0', 'SET'],
          ['APPROVE_NEW_LINE', '1', 'LINE'],
        ] as const) {
          const r = request(operation, version, suffix);
          const bound = await binding();
          const accepted = await timed('intake_' + suffix, () =>
            intake.submit({
              request: r,
              binding: bound,
              principal,
              actor: 'ACTOR_NATIVE_BUDGET_TEST_ONLY',
              signal: new AbortController().signal,
            }),
          );
          expect(accepted.status).toBe('QUEUED');
          const step = await timed('consume_atomic_' + suffix, () =>
            runtime!.consumer.consumeOnce(),
          );
          expect(step.status, JSON.stringify(failures)).toBe('PROCESSED');
          if (step.status !== 'PROCESSED') throw Error('no receipt');
          expect(step.receipt.outcome).toBe('COMMITTED');
          expect(step.receipt.eventIds).toHaveLength(
            operation === 'SET_ENVELOPE' ? 1 : 3,
          );
        }
        const reader = new DurableV08LedgerLineageReader({
          database,
          sha256Hex: sha,
        });
        const last = await database.transaction((tx) =>
          reader.readCommandFrom(
            tx,
            marker.worldId,
            'COMMAND_NATIVE_BUDGET_LINE',
          ),
        );
        const repository = createAuthoritativeWorkerExecution({
          database,
          workerId,
          sha256Hex: sha,
          candidateFactory: budget.factory,
          financeBudgetSourceCommitProtectionPort: budget.commitGuard,
        }).repository;
        expect(
          (await repository.readFinalReceipt(last))?.worldVersionAfter,
        ).toBe('2');
        const currentBinding = await binding();
        const retry = await intake.submit({
          request: request('SET_ENVELOPE', '0', 'SET'),
          binding: currentBinding,
          principal,
          actor: 'ACTOR_NATIVE_BUDGET_TEST_ONLY',
          signal: new AbortController().signal,
        });
        expect(retry).toMatchObject({
          status: 'FINALIZED',
          source: 'EXISTING',
          submitted: false,
        });
        const submitNew = (bound = currentBinding) =>
          intake.submit({
            request: request('APPROVE_NEW_LINE', '2', 'REVOKED'),
            binding: bound,
            principal,
            actor: 'ACTOR_NATIVE_BUDGET_TEST_ONLY',
            signal: new AbortController().signal,
          });
        await publisher.query(
          'select world_v2.revoke_finance_budget_policy($1,$2)',
          ['POLICY_NATIVE_BUDGET_TEST_ONLY', 'TEST_ONLY_SOURCE_CUTOFF'],
        );
        expect(await submitNew()).toMatchObject({
          status: 'REJECTED',
          submitted: false,
          queued: false,
          reason: 'SOURCE_RUNTIME_UNAVAILABLE',
        });
        await clone.installer.query(
          "update world_v2.current_commit_authorization set active=false where world_id=$1 and auth_subject=$2::uuid and office_id='FINANCE'and capability='FINANCE_BUDGET'",
          [marker.worldId, marker.subject],
        );
        await expect(submitNew()).rejects.toMatchObject({
          code: C.DOMAIN_ERROR_CODES.AUTHORIZATION_DENIED,
        });
        const counts = await clone.installer.query(
          'select(select count(*)::int from world_v2.authoritative_event where world_id=$1)as events,(select count(*)::int from world_v2.financial_posting_batch where world_id=$1)as money_postings,(select count(*)::int from world_v2.inventory_posting where world_id=$1)as stock_postings',
          [marker.worldId],
        );
        expect(counts.rows).toEqual([
          { events: 4, money_postings: 0, stock_postings: 0 },
        ]);
        completed = true;
      } finally {
        await runtime?.consumer.stop();
        await Promise.all(pools.map((p) => p.end()));
        await clone.drop();
        const cleanup = new Pool({
          host: marker.socket,
          port: marker.port,
          database: 'postgres',
          user: 'postgres',
          password: async () => '',
          ssl: false,
          max: 1,
        });
        cleanup.on('error', () => undefined);
        try {
          await cleanup.query(
            `drop role if exists ${workerRole};drop role if exists ${intakeRole};drop role if exists ${publisherRole}`,
          );
        } finally {
          await cleanup.end();
        }

        const dir =
          process.env.ECONMIND_POSTWAR_BUDGET_EVIDENCE ??
          '/workspace/.cloud-setup/evidence/postwar-native-budget-20261028';
        await mkdir(dir, { recursive: true });
        await writeFile(
          dir + '/receipt.json',
          JSON.stringify(
            {
              classification:
                'TEST_ONLY_ACTUAL_NATIVE_REFERENCE_NOT_PRODUCTION',
              completed,
              template:
                process.env.ECONMIND_POSTWAR_BOUNDED_TEMPLATE ??
                marker.database,
              seedFingerprint: marker.seedFingerprint,
              admissionRef: marker.admissionRef,
              cap,
              zeroCapacityMeaning:
                cap === '0'
                  ? 'ALL_AVAILABLE_SOURCE_FUNDS_PROTECTED_ONLY_ZERO_BOOKKEEPING_NOT_FUNDED_NEW_PROGRAMME'
                  : null,
              ownedTestLoginsDropped: true,
              phases,
              failures,
              ownedCloneDropped: true,
              ownedPoolsClosed: true,
              clockStarted: false,
            },
            null,
            2,
          ),
        );
      }
    }, 300000);
    it('refuses OMO against actual bounded originals without an invented government security or quote', async () => {
      const marker = await loadPostwarNativeReferenceMarker(
        process.env.ECONMIND_POSTWAR_REFERENCE_MARKER ??
          '/workspace/.cloud-setup/evidence/postwar-reference-persistent-20261028/reference-db.json',
      );
      const clone = await clonePostwarNativeReference(
        marker,
        'cb_omo_negative',
        process.env.ECONMIND_POSTWAR_BOUNDED_TEMPLATE ?? marker.database,
      );
      try {
        const subject = C.authSubject(marker.subject),
          world = C.worldId(marker.worldId),
          country = C.countryId(marker.countryId);
        const authorization = await C.authorizeOfficeCapability({
          principal: {
            authSubject: subject,
            facts: { user_id: subject, display_name: null, school_id: null },
            token: {
              subject,
              issuer: 'TEST_ONLY_NATIVE_REFERENCE',
              audience: 'world-worker',
              issuedAt: new Date().toISOString(),
              expiresAt: new Date(Date.now() + 60000).toISOString(),
            },
          },
          worldId: world,
          requestedCountryId: country,
          requestedOfficeId: C.officeId('CENTRAL_BANK'),
          capability: 'CENTRAL_BANK_MONETARY_POLICY',
          resolver: {
            resolveCurrentIdentity: async (principal) =>
              principal.authSubject === subject ? subject : null,
            async resolveCurrentMembership(principal, worldId) {
              const rows = await clone.installer.query(
                "select team_id,authorization_version from world_v2.current_commit_authorization a where world_id=$1 and auth_subject=$2::uuid and country_id=$3 and office_id='CENTRAL_BANK'and capability='CENTRAL_BANK_MONETARY_POLICY'and active and not exists(select 1 from world_v2.current_commit_authorization o where o.world_id=a.world_id and o.auth_subject=a.auth_subject and o.active and(o.country_id<>a.country_id or o.team_id<>a.team_id or o.authorization_version<>a.authorization_version))",
                [worldId, principal.authSubject, country],
              );
              return rows.rows.length === 1
                ? {
                    authSubject: subject,
                    worldId: world,
                    countryId: country,
                    teamId: C.teamId(rows.rows[0].team_id),
                    authorizationVersion: rows.rows[0].authorization_version,
                    officeAssignments: [C.officeId('CENTRAL_BANK')],
                    active: true,
                    suspended: false,
                    isWorldAdmin: false,
                    negotiationPartyIds: [],
                  }
                : null;
            },
          },
        });
        const reader = createPostwarCentralBankOmoReader({
          database: new PostgresSqlDatabase(clone.boundedReader),
          authorization,
          runtimeReaderRole: marker.roles.boundedReaderRole,
          authorizationPublisherRole: marker.roles.authorizationPublisherRole,
        });
        let failure: unknown;
        try {
          await reader.read({
            worldId: world,
            countryId: country,
            commandId: C.commandId('COMMAND_OMO_NO_INVENTORY_TEST_ONLY'),
            commandFingerprint: 'sha256:' + '0'.repeat(64),
            expectedWorldVersion: '0',
            settlementSimTime: '0',
            securityRef: 'ABSENT_SECURITY_TEST_ONLY',
            batchRef: 'ABSENT_BATCH_TEST_ONLY',
          });
        } catch (error) {
          failure = error;
        }
        expect(failure).toBeInstanceOf(Error);
        const missing = failure instanceof Error ? failure.cause : null;
        expect(missing).toBeInstanceOf(PostwarOmoOriginalsMissing);
        if (!(missing instanceof PostwarOmoOriginalsMissing)) throw failure;
        expect(missing.missing).toEqual([
          'ACTUAL_GOVERNMENT_SECURITY_HOLDING',
          'SECURITY_BATCH_FACE_MATURITY_ENCUMBRANCE_TERMS',
          'ACTUAL_OMO_QUOTE_AT_SETTLEMENT_SIM_TIME',
        ]);
        expect(missing.binding).toMatchObject({
          worldId: world,
          countryId: country,
          seedFingerprint: marker.seedFingerprint,
          admissionRef: marker.admissionRef,
        });
        expect(
          (
            await clone.installer.query(
              'select(select count(*)::int from world_v2.authoritative_event)as events,(select count(*)::int from world_v2.command_submission)as commands',
            )
          ).rows,
        ).toEqual([{ events: 0, commands: 0 }]);
      } finally {
        await clone.drop();
      }
    });
  },
);
