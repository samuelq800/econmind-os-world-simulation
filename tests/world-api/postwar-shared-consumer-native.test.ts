/** Opt-in actual standard Node shared consumer. One controller per process,
 * never two standalone consumers. Isolated existing H6 + controlled C02 policy;
 * no seed rebuild, original source substitution, production or Clock start. */
import { generateKeyPairSync, sign, randomUUID, createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import * as C from '@econmind/core';
import {
  AUTHENTICATED_OFFICE_COMMAND_PATH,
  AUTHENTICATED_OFFICE_COMMAND_SCHEMA,
  FINANCE_BUDGET_APPROPRIATION_COMMAND,
  type ManualOfficeCommandRequestDto,
} from '@econmind/core/authenticated-office-command-contract';
import { buildManualOfficeCommandIntent } from '../../apps/world-worker/src/intake/manual-office-command-intent.js';
import { clonePostwarNativeReference } from '../support/postwar-native-reference-db.js';
import { serializePostwarSocialPrefixEvidence } from '../support/postwar-social-prefix-evidence-json.js';
import {
  createPostwarSharedConsumerNativeFixture,
  startPostwarSharedConsumerNativeHost,
} from '../support/postwar-shared-consumer-native-fixture.js';
const flag = process.env.ECONMIND_SHARED_CONSUMER_NATIVE;
if (flag !== undefined && flag !== '1')
  throw Error('EXPLICIT_SHARED_CONSUMER_NATIVE_FLAG_REQUIRED');
const native = flag === '1' ? describe : describe.skip;
const root = path.resolve(import.meta.dirname, '../..');
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
native('one actual World consumer across Finance and Social', () => {
  it('executes a mixed sequence through standard HTTP, restarts pending/final safely, and never skips unknown or stale global queue heads', async () => {
    const sourceCheckpoint =
        process.env.ECONMIND_SHARED_CONSUMER_SOURCE_CHECKPOINT,
      scopeCheckpoint = process.env.ECONMIND_SHARED_CONSUMER_SCOPE_CHECKPOINT;
    if (!sourceCheckpoint || !scopeCheckpoint)
      throw Error('EXISTING_SEALED_SMALL_SOURCE_AND_LOCATOR_REQUIRED');
    const directory =
      process.env.ECONMIND_SHARED_CONSUMER_EVIDENCE_DIR ??
      '/workspace/office-connection-evidence/postwar-shared-consumer-native-development-20261029';
    const report: Record<string, unknown> = {
      classification:
        'TEST_ONLY_ACTUAL_SHARED_FINANCE_SOCIAL_NODE_NOT_PRODUCTION',
      status: 'RUNNING',
      sourceCheckpoint,
      scopeCheckpoint,
      WorldClock: false,
      productionVerifiedOffices: 0,
      productionOfficeDenominator: 6,
    };
    const stages: { stage: string; at: string }[] = [],
      hosts: Record<string, unknown>[] = [],
      http: Record<string, unknown>[] = [];
    report.stages = stages;
    report.hosts = hosts;
    report.http = http;
    const checkpoint = async (stage: string) => {
      stages.push({ stage, at: new Date().toISOString() });
      console.info('SHARED_NATIVE_STAGE:' + stage);
      await mkdir(directory, { recursive: true });
      await writeFile(
        path.join(directory, 'progress.json'),
        serializePostwarSocialPrefixEvidence(report),
      );
    };
    let f:
      | Awaited<ReturnType<typeof createPostwarSharedConsumerNativeFixture>>
      | undefined;
    let host:
      | Awaited<ReturnType<typeof startPostwarSharedConsumerNativeHost>>
      | undefined;
    const extraClones: Awaited<
      ReturnType<typeof clonePostwarNativeReference>
    >[] = [];
    const cleanupErrors: string[] = [];
    const stop = async () => {
      if (!host) return;
      const current = host;
      try {
        const inspection = await current.ask('inspect');
        hosts.push({ inspection });
        expect(inspection.onlineQuerySummary).toMatchObject({
          canonicalOpeningSeedQueries: 0,
        });
        const summary = inspection.onlineQuerySummary as Record<
          string,
          unknown
        >;
        expect(Number(summary.maximumJsonRowBytes)).toBeLessThanOrEqual(262144);
      } finally {
        hosts.push({
          closed: await current.stop(),
          diagnostics: current.diagnostics(),
        });
        host = undefined;
      }
    };
    try {
      const sourceHashes: Record<string, string> = {};
      for (const name of [
        'tests/support/postwar-shared-consumer-native-fixture.ts',
        'tests/world-api/postwar-shared-consumer-native.test.ts',
        'tools/office-connection/native-shared-consumer-host.mjs',
        'apps/world-worker/src/runtime-preparation/finance-social-runtime-connection.ts',
        'apps/world-api/src/runtime/postwar-finance-social-connection.ts',
      ])
        sourceHashes[name] = sha(await readFile(path.join(root, name), 'utf8'));
      report.sourceHashes = sourceHashes;
      f = await createPostwarSharedConsumerNativeFixture({
        sourceCheckpoint,
        scopeCheckpoint,
      });
      const fixture = f;
      Object.assign(report, {
        database: f.clone.database,
        sourcePins: {
          seedFingerprint: f.marker.seedFingerprint,
          admissionRef: f.marker.admissionRef,
        },
        actorScope:
          'COUNTRY01_UNCHANGED_PLUS_DISTINCT_TEST_ONLY_COUNTRY02_FINANCE_SUBJECT',
        country02: f.country02Provenance,
        permissions: f.permissions,
        frozenSimTime: f.simTime,
      });
      for (const p of f.permissions) {
        expect(p.auth_update).toBe(false);
        expect(p.auth_revision_update).toBe(false);
        expect(p.entitlement_update).toBe(false);
        if (p.role === f.roles.intake) {
          expect(p.raw_seed).toBe(false);
          expect(p.social_reader).toBe(false);
          expect(p.finance_reader).toBe(true);
          expect(p.social_intake_lock).toBe(true);
        }
        if (p.role === f.roles.worker) {
          expect(p.social_reader).toBe(true);
          expect(p.finance_reader).toBe(true);
        }
      }
      await checkpoint('ACTUAL_H6_SMALL_SOURCES_AND_COUNTRY02_INSTALLED');
      const keys = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }),
        project = 'abcdefghijklmnopqrst',
        issuer = 'https://' + project + '.supabase.co/auth/v1',
        jwk = {
          ...keys.publicKey.export({ format: 'jwk' }),
          kid: 'TEST_ONLY_SHARED_CONSUMER',
          alg: 'ES256',
          use: 'sig',
          key_ops: ['verify'],
        };
      const token = (subject = fixture.marker.subject) => {
        const now = Math.floor(Date.now() / 1000),
          header = Buffer.from(
            JSON.stringify({ alg: 'ES256', typ: 'JWT', kid: jwk.kid }),
          ).toString('base64url'),
          payload = Buffer.from(
            JSON.stringify({
              sub: subject,
              iss: issuer,
              aud: 'authenticated',
              iat: now - 5,
              exp: now + 600,
            }),
          ).toString('base64url'),
          data = header + '.' + payload;
        return (
          data +
          '.' +
          sign('sha256', Buffer.from(data), {
            key: keys.privateKey,
            dsaEncoding: 'ieee-p1363',
          }).toString('base64url')
        );
      };
      const launch = async (database = fixture.clone.database) => {
        host = await startPostwarSharedConsumerNativeHost({
          ...fixture.nodeConfiguration,
          database,
          auth: {
            projectRef: project,
            expectedIssuer: issuer,
            jwksUrl: issuer + '/.well-known/jwks.json',
            jwk,
          },
        });
        hosts.push(host.info);
        expect(host.info.consumerState).toBe('PREPARED');
        expect(host.info.sharedNodeControlIdentity).toBe(true);
        expect(host.info.borrowersExposeConsumer).toBe(false);
        expect(host.info.financeCountryIds).toEqual([
          'COUNTRY_01',
          'COUNTRY_02',
        ]);
        await checkpoint('SHARED_OS_LISTENING_' + String(host.info.pid));
      };
      const call = async (
        endpoint: string,
        body: unknown,
        subject = fixture.marker.subject,
      ) => {
        if (!host) throw Error('OWN_SHARED_NODE_REQUIRED');
        const start = performance.now(),
          r = await fetch(String(host.info.origin) + endpoint, {
            method: 'POST',
            headers: {
              authorization: 'Bearer ' + token(subject),
              origin: 'https://pages.example',
              'content-type': 'application/json',
            },
            body: JSON.stringify(body),
          }),
          text = await r.text();
        http.push({
          endpoint,
          status: r.status,
          bytes: Buffer.byteLength(text),
          milliseconds: performance.now() - start,
        });
        return {
          status: r.status,
          body: JSON.parse(text) as Record<string, unknown>,
        };
      };
      const head = async (pool = fixture.clone.installer) => {
        const rows = (
          await pool.query<{ world_version: string; event_sequence: string }>(
            'select world_version::text,event_sequence::text from world_v2.world_head where world_id=$1',
            [fixture.marker.worldId],
          )
        ).rows;
        expect(rows).toHaveLength(1);
        return rows[0]!;
      };
      const envelope = (request: ManualOfficeCommandRequestDto) => ({
        schemaVersion: AUTHENTICATED_OFFICE_COMMAND_SCHEMA,
        requestId: randomUUID(),
        request,
      });
      const recover = (originalRequest: ReturnType<typeof envelope>) => ({
        schemaVersion: C.AUTHENTICATED_COMMAND_RECOVERY_SCHEMA,
        requestId: randomUUID(),
        request: {
          worldId: fixture.marker.worldId,
          commandId: originalRequest.request.commandId,
          idempotencyKey: originalRequest.request.idempotencyKey,
          originalRequest,
        },
      });
      const nonce = randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase();
      const finance = (
        policy: typeof fixture.c01Policy,
        version: string,
        name: string,
        operation: 'SET_ENVELOPE' | 'APPROVE_NEW_LINE',
      ) =>
        envelope({
          worldId: fixture.marker.worldId,
          countryId: policy.countryId,
          officeId: 'FINANCE',
          commandType: FINANCE_BUDGET_APPROPRIATION_COMMAND,
          commandId: 'COMMAND_SHARED_' + name + '_' + nonce,
          idempotencyKey: 'KEY_SHARED_' + name + '_' + nonce,
          expectedWorldVersion: version,
          payload: {
            operation,
            scope: {
              worldId: fixture.marker.worldId,
              countryId: policy.countryId,
              entityRef: policy.governmentEntityId,
              envelopeRef: policy.envelopeRef,
              effectivePeriodRef: policy.effectivePeriodRef,
            },
            currency: policy.currency,
            amount: operation === 'SET_ENVELOPE' ? '1000' : '100',
            envelopeRevisionRef:
              'ENVELOPE_REV_SHARED_' + policy.countryId + '_' + nonce,
            lineRef:
              operation === 'SET_ENVELOPE'
                ? null
                : 'LINE_SHARED_' + name + '_' + nonce,
            revisionRef:
              operation === 'SET_ENVELOPE'
                ? 'ENVELOPE_REV_SHARED_' + policy.countryId + '_' + nonce
                : 'LINE_REV_SHARED_' +
                  policy.countryId +
                  '_' +
                  name +
                  '_' +
                  nonce,
            predecessorRevisionRef: null,
          },
        });
      const loc = fixture.locators.COUNTRY_01!;
      const position = (version: string) =>
        envelope({
          worldId: fixture.marker.worldId,
          countryId: 'COUNTRY_01',
          officeId: 'SOCIAL',
          commandType: C.SOCIAL_POSITION_OFFER_CREATE_COMMAND,
          commandId: 'COMMAND_SHARED_POSITION_' + nonce,
          idempotencyKey: 'KEY_SHARED_POSITION_' + nonce,
          expectedWorldVersion: version,
          payload: {
            schemaVersion: 'social-employment-position-offer-create-v1',
            positionId: 'POSITION_SHARED_' + nonce,
            locationId: loc.wage.locationId,
            skill: loc.wage.skill,
            publicService: loc.wage.classificationId,
            occupation: loc.wage.occupation,
            requiredCount: '1',
            wageScheduleRef: loc.wage.positionId,
            fundingAccountId: loc.funding.accountRef,
            coverageDays: '1',
          },
        });
      const plan = (version: string) =>
        envelope({
          worldId: fixture.marker.worldId,
          countryId: 'COUNTRY_01',
          officeId: 'SOCIAL',
          commandType: C.SOCIAL_EMPLOYMENT_SERVICE_PLAN_COMMAND,
          commandId: 'COMMAND_SHARED_PLAN_' + nonce,
          idempotencyKey: 'KEY_SHARED_PLAN_' + nonce,
          expectedWorldVersion: version,
          payload: {
            schemaVersion: 'social-employment-service-plan-v1',
            locationId: loc.wage.locationId,
            skill: loc.wage.skill,
            positionId: 'POSITION_SHARED_' + nonce,
            servicePoolId: loc.servicePoolId,
            requestedMatches: '1',
            dueDayIndex: (BigInt(fixture.simTime) / 86400000n).toString(),
          },
        });
      const originals: ReturnType<typeof envelope>[] = [],
        receipts: Record<string, unknown>[] = [];
      const consume = async (
        current: ReturnType<typeof envelope>,
        subject = fixture.marker.subject,
      ) => {
        if (!host) throw Error('OWN_SHARED_NODE_REQUIRED');
        const before = await head();
        const step = await host.ask('consume');
        report.lastStep = step;
        expect(step).toMatchObject({
          status: 'PROCESSED',
          commandId: current.request.commandId,
          receipt: {
            outcome: 'COMMITTED',
            worldVersionBefore: before.world_version,
            worldVersionAfter: (BigInt(before.world_version) + 1n).toString(),
          },
        });
        const final = await call(
          C.AUTHENTICATED_COMMAND_RECOVERY_PATH,
          recover(current),
          subject,
        );
        expect(final).toMatchObject({
          status: 200,
          body: {
            ok: true,
            state: {
              status: 'FINAL',
              receipt: {
                outcome: 'COMMITTED',
                commandId: current.request.commandId,
              },
            },
          },
        });
        receipts.push(final.body.state as Record<string, unknown>);
        await checkpoint(
          'COMMITTED_' +
            current.request.commandType +
            '_' +
            current.request.countryId,
        );
      };
      await launch();
      const first = finance(
        fixture.c01Policy,
        (await head()).world_version,
        'SET',
        'SET_ENVELOPE',
      );
      originals.push(first);
      expect(
        await call(AUTHENTICATED_OFFICE_COMMAND_PATH, first),
      ).toMatchObject({
        status: 202,
        body: { ok: true, state: { status: 'QUEUED', source: 'NEW' } },
      });
      await stop();
      await launch();
      expect(
        (await call(C.AUTHENTICATED_COMMAND_RECOVERY_PATH, recover(first)))
          .body,
      ).toMatchObject({ ok: true, state: { status: 'QUEUED' } });
      await consume(first);
      const staleWire = finance(
        fixture.c01Policy,
        '6',
        'STALE_HTTP',
        'APPROVE_NEW_LINE',
      );
      expect(
        (await call(AUTHENTICATED_OFFICE_COMMAND_PATH, staleWire)).status,
      ).toBe(409);
      for (const builder of [
        position,
        plan,
        (version: string) =>
          finance(fixture.c01Policy, version, 'LINE', 'APPROVE_NEW_LINE'),
      ]) {
        const current = builder((await head()).world_version);
        originals.push(current);
        expect(
          (await call(AUTHENTICATED_OFFICE_COMMAND_PATH, current)).status,
        ).toBe(202);
        await consume(current);
      }
      await stop();
      await launch();
      for (let index = 0; index < originals.length; index++) {
        const restored = await call(
          C.AUTHENTICATED_COMMAND_RECOVERY_PATH,
          recover(originals[index]!),
        );
        expect(restored.status).toBe(200);
        expect(restored.body.state).toEqual(receipts[index]);
        expect(
          (await call(AUTHENTICATED_OFFICE_COMMAND_PATH, originals[index]!))
            .body,
        ).toMatchObject({
          ok: true,
          state: { status: 'FINALIZED', source: 'EXISTING', submitted: false },
        });
      }
      const secondCountry = finance(
        fixture.policy02,
        (await head()).world_version,
        'COUNTRY02_SET',
        'SET_ENVELOPE',
      );
      expect(
        (await call(AUTHENTICATED_OFFICE_COMMAND_PATH, secondCountry)).status,
      ).toBe(403);
      expect(
        (
          await call(
            AUTHENTICATED_OFFICE_COMMAND_PATH,
            secondCountry,
            fixture.subject02,
          )
        ).status,
      ).toBe(202);
      await consume(secondCountry, fixture.subject02);
      originals.push(secondCountry);
      const finalHead = await head();
      expect(finalHead.world_version).toBe('11');
      report.positiveHead = finalHead;
      report.receipts = receipts;
      const positiveCounts = (
        await fixture.clone.installer.query(
          `select (select count(*)::text from world_v2.command_receipt where world_id=$1 and command_id=any($2::text[])and outcome='COMMITTED')receipts,(select count(*)::text from world_v2.command_queue where world_id=$1 and command_id=any($2::text[])and queue_state='FINALIZED')finalized,(select count(*)::text from world_v2.financial_posting_batch where world_id=$1)financial,(select count(*)::text from world_v2.inventory_posting where world_id=$1)inventory`,
          [fixture.marker.worldId, originals.map((x) => x.request.commandId)],
        )
      ).rows;
      expect(positiveCounts).toEqual([
        { receipts: '5', finalized: '5', financial: '0', inventory: '0' },
      ]);
      report.positiveCounts = positiveCounts;
      await stop();
      await fixture.closeFixturePools();
      await fixture.clone.close();
      // Two separate owned clones preserve the successful immutable prefix; no
      // queued command is deleted/rewritten merely to clear a negative test.
      const negatives: Record<string, unknown>[] = [];
      for (const kind of ['UNKNOWN', 'STALE'] as const) {
        const branch = await clonePostwarNativeReference(
          fixture.marker,
          'shared_consumer',
          fixture.clone.database,
        );
        extraClones.push(branch);
        const unknown = kind === 'UNKNOWN';
        const id = 'COMMAND_AAA_SHARED_' + kind + '_' + nonce;
        const known = finance(
          fixture.c01Policy,
          finalHead.world_version,
          'ZZZ_' + kind,
          'APPROVE_NEW_LINE',
        );
        const stale = finance(
          fixture.c01Policy,
          '6',
          'AAA_' + kind,
          'APPROVE_NEW_LINE',
        );
        const raw = unknown
          ? C.parseCanonicalCommand(
              {
                schemaVersion: C.COMMAND_SCHEMA_VERSION,
                commandType: 'UNREGISTERED_SHARED_QUEUE_TEST_V1',
                worldId: fixture.marker.worldId,
                commandId: id,
                idempotencyKey: 'KEY_AAA_SHARED_' + kind + '_' + nonce,
                countryId: 'COUNTRY_01',
                officeId: 'FINANCE',
                authSubject: fixture.marker.subject,
                actorId: fixture.nodeConfiguration.actors[0]!.actorId,
                expectedWorldVersion: finalHead.world_version,
                simTime: fixture.simTime,
                submittedAtReal: new Date().toISOString(),
                correlationId: 'CORRELATION_' + id,
                payload: { testOnly: true },
              },
              sha,
            )
          : buildManualOfficeCommandIntent({
              request: { ...stale.request, commandId: id },
              countryId: 'COUNTRY_01',
              officeId: 'FINANCE',
              authSubject: fixture.marker.subject,
              actor: fixture.nodeConfiguration.actors[0]!.actorId,
              simTime: fixture.simTime,
              submittedAtReal: new Date().toISOString(),
              correlationId: 'CORRELATION_' + id,
            });
        const following = buildManualOfficeCommandIntent({
          request: {
            ...known.request,
            commandId: 'COMMAND_ZZZ_SHARED_' + kind + '_' + nonce,
          },
          countryId: 'COUNTRY_01',
          officeId: 'FINANCE',
          authSubject: fixture.marker.subject,
          actor: fixture.nodeConfiguration.actors[0]!.actorId,
          simTime: fixture.simTime,
          submittedAtReal: new Date().toISOString(),
          correlationId: 'CORRELATION_ZZZ_' + kind + '_' + nonce,
        });
        for (const c of [raw, following]) {
          await branch.installer.query(
            'insert into world_v2.command_submission(world_id,command_id,idempotency_key,command_type,schema_version,canonical_payload,payload_sha256,command_fingerprint,auth_subject,actor_id,country_id,office_id,expected_world_version,sim_time,correlation_id,submitted_at_real)values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)',
            [
              c.worldId,
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
          await branch.installer.query(
            "insert into world_v2.command_queue(world_id,command_id,authority_kind,available_at_sim_time)values($1,$2,'DISCRETIONARY_USER',$3)",
            [c.worldId, c.commandId, c.simTime.toCanonicalValue()],
          );
        }
        await launch(branch.database);
        const blocked = await host!.ask('consume');
        expect(blocked.commandId).toBe(raw.commandId);
        if (blocked.status === 'PROCESSED')
          expect(blocked).toMatchObject({ receipt: { outcome: 'REJECTED' } });
        else expect(blocked.status).toBe('BLOCKED');
        expect(await head(branch.installer)).toEqual(finalHead);
        const later = (
          await branch.installer.query(
            'select q.queue_state,(select count(*)::text from world_v2.command_receipt r where r.world_id=q.world_id and r.command_id=q.command_id)receipts from world_v2.command_queue q where world_id=$1 and command_id=$2',
            [fixture.marker.worldId, following.commandId],
          )
        ).rows;
        expect(later).toEqual([{ queue_state: 'PENDING', receipts: '0' }]);
        negatives.push({
          kind,
          fixtureOnlyCanonicalQueuedInput: true,
          headCommandId: raw.commandId,
          followingCommandId: following.commandId,
          result: blocked,
          later,
        });
        await stop();
        await branch.drop();
        extraClones.pop();
      }
      report.negatives = negatives;
      report.status = 'PASS';
      await checkpoint(
        'MIXED_SINGLE_CONSUMER_AND_GLOBAL_HEAD_NEGATIVES_PASSED',
      );
    } catch (error) {
      report.status = 'FAIL';
      report.failure =
        error instanceof Error
          ? {
              message: error.message,
              stack: error.stack,
              cause:
                error.cause instanceof Error
                  ? { message: error.cause.message, stack: error.cause.stack }
                  : String(error.cause ?? ''),
            }
          : String(error);
      throw error;
    } finally {
      const metadataPool = extraClones.at(-1)?.installer ?? f?.clone.installer;
      if (metadataPool && !metadataPool.ended && f) {
        try {
          report.finalQueueMetadata = (
            await metadataPool.query(
              `select command_id,queue_state,claimed_by,(select outcome from world_v2.command_receipt r where r.world_id=q.world_id and r.command_id=q.command_id)outcome from world_v2.command_queue q where world_id=$1 and command_id like 'COMMAND_%SHARED_%' order by command_id limit 20`,
              [f.marker.worldId],
            )
          ).rows;
          report.finalActualMetadata = (
            await metadataPool.query(
              `select world_version::text,event_sequence::text,(select count(*)::text from world_v2.command_receipt r where r.world_id=h.world_id) receipt_count,(select count(*)::text from world_v2.command_queue q where q.world_id=h.world_id and queue_state='PENDING') pending_count from world_v2.world_head h where world_id=$1`,
              [f.marker.worldId],
            )
          ).rows;
        } catch (error) {
          report.finalMetadataFailure =
            error instanceof Error ? error.message : String(error);
        }
      }
      try {
        await stop();
      } catch (error) {
        cleanupErrors.push(
          error instanceof Error ? error.message : String(error),
        );
      }
      for (const branch of extraClones)
        try {
          await branch.drop();
        } catch (error) {
          cleanupErrors.push(
            error instanceof Error ? error.message : String(error),
          );
        }
      try {
        await f?.cleanup();
      } catch (error) {
        cleanupErrors.push(
          error instanceof Error ? error.message : String(error),
        );
      }
      report.cleanupErrors = cleanupErrors;
      report.idleErrors = f?.idleErrors ?? [];
      if (cleanupErrors.length) report.status = 'FAIL';
      await mkdir(directory, { recursive: true });
      await writeFile(
        path.join(directory, 'report.json'),
        serializePostwarSocialPrefixEvidence(report),
      );
      expect(cleanupErrors).toEqual([]);
      expect(f?.idleErrors ?? []).toEqual([]);
    }
  }, 900000);
});
