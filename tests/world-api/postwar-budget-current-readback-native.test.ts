/** Explicit TEST_ONLY actual H6 seed/prefix → sealed small sources → fresh
 * process JWT HTTP → durable Budget H7. Never production approval or Clock. */
import { fork, type ChildProcess } from 'node:child_process';
import { generateKeyPairSync, sign, randomUUID, createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import * as C from '@econmind/core';
import {
  AUTHENTICATED_OFFICE_COMMAND_PATH,
  AUTHENTICATED_OFFICE_COMMAND_SCHEMA,
} from '@econmind/core/authenticated-office-command-contract';
import { createBudgetCurrentReadbackFixture } from '../support/postwar-budget-current-readback-fixture.js';

import { createPostwarBoundedFinancialCurrentPublisher } from '../../apps/world-worker/src/persistence/postwar-bounded-financial-current-publication.js';
import { createPostwarBudgetCurrentReadbackConsumer } from '../../apps/world-worker/src/outbox/postwar-budget-current-readback-consumer.js';

import { startBudgetCurrentReadbackBrowser } from '../support/postwar-budget-current-readback-browser.js';

const checkpoint = process.env.ECONMIND_POSTWAR_MIXED_H6_CHECKPOINT;
const native = checkpoint ? describe : describe.skip;
native('actual H7 bounded financial after-commit readback', () => {
  it('commits H7, clears stale Main fields, independently publishes bounded same-head financial pages, and retries derivation without resending the command', async () => {
    const f = await createBudgetCurrentReadbackFixture(checkpoint!);
    const dir =
      '/workspace/.cloud-setup/evidence/postwar-budget-current-readback-native-20261028';
    const evidence: Record<string, unknown> = {
      classification:
        'TEST_ONLY_ACTUAL_NATIVE_PG_MIXED_CAPACITY_NOT_PRODUCTION',
      seedFingerprint: f.marker.seedFingerprint,
      admissionRef: f.marker.admissionRef,
      offlinePublicationMilliseconds: f.publicationMilliseconds,
      policyClassification:
        'ISOLATED_TEST_ONLY_CONTROLLED_PUBLISHER_NOT_PRODUCTION_OWNER_APPROVAL',
      WorldClock: false,
    };
    let child: ChildProcess | undefined,
      closeChild: (() => Promise<void>) | undefined,
      ask:
        ((operation: string) => Promise<Record<string, unknown>>) | undefined,
      base = '',
      complete = false;
    let readbackBrowser:
      Awaited<ReturnType<typeof startBudgetCurrentReadbackBrowser>> | undefined;
    const hosts: Record<string, unknown>[] = [],
      http: { status: number; bytes: number; milliseconds: number }[] = [];
    const keys = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }),
      project = 'abcdefghijklmnopqrst',
      issuer = `https://${project}.supabase.co/auth/v1`,
      jwksUrl = issuer + '/.well-known/jwks.json',
      ui = 'https://pages.example';
    const jwk = {
      ...keys.publicKey.export({ format: 'jwk' }),
      kid: 'TEST_ONLY_MIXED_CAPACITY',
      alg: 'ES256',
      use: 'sig',
      key_ops: ['verify'],
    };
    const token = () => {
      const now = Math.floor(Date.now() / 1000),
        head = Buffer.from(
          JSON.stringify({ alg: 'ES256', typ: 'JWT', kid: jwk.kid }),
        ).toString('base64url'),
        claims = Buffer.from(
          JSON.stringify({
            sub: f.marker.subject,
            iss: issuer,
            aud: 'authenticated',
            iat: now - 5,
            exp: now + 600,
          }),
        ).toString('base64url'),
        body = head + '.' + claims;
      return (
        body +
        '.' +
        sign('sha256', Buffer.from(body), {
          key: keys.privateKey,
          dsaEncoding: 'ieee-p1363',
        }).toString('base64url')
      );
    };
    const launch = async () => {
      child = fork(
        new URL(
          '../../tools/office-connection/native-budget-capacity-host.mjs',
          import.meta.url,
        ),
        [],
        {
          execPath: process.execPath,
          serialization: 'advanced',
          env: {
            NODE_ENV: 'test',
            ECONMIND_ENV: 'ci',
            ECONMIND_BUDGET_CAPACITY_TEST_HOST: '1',
          },
          stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
        },
      );
      const actor = child;
      let stderr = '';
      actor.stderr?.on('data', (b) => {
        stderr = (stderr + String(b)).slice(-4096);
      });
      const pending = new Map<
        string,
        {
          resolve: (v: Record<string, unknown>) => void;
          reject: (e: Error) => void;
          timer: ReturnType<typeof setTimeout>;
        }
      >();
      let readyResolve: (v: Record<string, unknown>) => void = () => undefined,
        readyReject: (e: Error) => void = () => undefined;
      const ready = new Promise<Record<string, unknown>>((resolve, reject) => {
        readyResolve = resolve;
        readyReject = reject;
      });
      actor.on('message', (raw: Record<string, unknown>) => {
        if (raw.type === 'LISTENING_TEST_ONLY') {
          readyResolve(raw);
          return;
        }
        const p = typeof raw.id === 'string' ? pending.get(raw.id) : undefined;
        if (raw.type === 'ERROR') {
          const error = Error(String(raw.message));
          if (p) {
            clearTimeout(p.timer);
            pending.delete(String(raw.id));
            p.reject(error);
          } else readyReject(error);
        } else if (raw.type === 'RESULT' && p) {
          clearTimeout(p.timer);
          pending.delete(String(raw.id));
          p.resolve(raw.result as Record<string, unknown>);
        }
      });
      actor.on('exit', (code) => {
        for (const p of pending.values()) {
          clearTimeout(p.timer);
          p.reject(Error('OWNED_CHILD_EXIT_' + code + ':' + stderr));
        }
        pending.clear();
        if (code !== 0)
          readyReject(Error('OWNED_CHILD_START_FAILED:' + stderr));
      });
      ask = (operation) =>
        new Promise((resolve, reject) => {
          const id = randomUUID(),
            timer = setTimeout(() => {
              pending.delete(id);
              reject(Error('NATIVE_IPC_DEADLINE'));
            }, 10000);
          pending.set(id, { resolve, reject, timer });
          actor.send({ operation, id });
        });
      closeChild = async () => {
        if (actor.exitCode !== null) return;
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => {
            actor.kill('SIGTERM');
            reject(Error('OWNED_CHILD_CLEANUP_DEADLINE'));
          }, 10000);
          actor.once('exit', (code) => {
            clearTimeout(timer);
            if (code === 0) resolve();
            else reject(Error('OWNED_CHILD_EXIT_' + code));
          });
          actor.send({ operation: 'close' });
        });
      };
      actor.send({
        operation: 'start',
        config: {
          socket: f.marker.socket,
          port: f.marker.port,
          database: f.clone.database,
          workerRole: f.workerRole,
          intakeRole: f.intakeRole,
          readerRole: f.marker.roles.boundedReaderRole,
          authorizationPublisherRole: f.marker.roles.authorizationPublisherRole,
          workerId: f.workerId,
          subject: f.marker.subject,
          countryId: f.marker.countryId,
          sourceSHA256: f.sourceSHA256,
          historyMode: 'BUDGET_SOCIAL',
          pins: {
            worldId: f.marker.worldId,
            seedRef: f.marker.seedId,
            contentHash: f.marker.seedFingerprint,
            admissionRef: f.marker.admissionRef,
            minimumWorldVersion: '0',
          },
          projectRef: project,
          issuer,
          jwksUrl,
          jwk,
          ui,
          origin: 'https://read.example',
        },
      });
      const timer = setTimeout(
        () => readyReject(Error('OWNED_CHILD_LISTEN_DEADLINE:' + stderr)),
        10000,
      );
      try {
        const info = await ready;
        hosts.push(info);
        base = String(info.base);
      } finally {
        clearTimeout(timer);
      }
    };
    const call = async (path: string, body: unknown) => {
      const started = performance.now(),
        response = await fetch(base + path, {
          method: 'POST',
          headers: {
            authorization: 'Bearer ' + token(),
            origin: ui,
            'content-type': 'application/json',
          },
          body: JSON.stringify(body),
        }),
        text = await response.text();
      http.push({
        status: response.status,
        bytes: Buffer.byteLength(text),
        milliseconds: performance.now() - started,
      });
      expect(response.headers.get('cache-control')).toBe('private, no-store');
      return {
        status: response.status,
        body: JSON.parse(text) as Record<string, unknown>,
      };
    };
    const request = {
      worldId: f.marker.worldId,
      countryId: f.marker.countryId,
      officeId: 'FINANCE',
      commandType: 'CORE_FINANCE_BUDGET_APPROPRIATION_V1',
      commandId: 'COMMAND_MIXED_CAPACITY_NEXT_SET',
      idempotencyKey: 'KEY_MIXED_CAPACITY_NEXT_SET',
      expectedWorldVersion: '6',
      payload: {
        operation: 'SET_ENVELOPE',
        scope: {
          worldId: f.marker.worldId,
          countryId: f.marker.countryId,
          entityRef: f.policy.governmentEntityId,
          envelopeRef: f.policy.envelopeRef,
          effectivePeriodRef: f.policy.effectivePeriodRef,
        },
        currency: f.policy.currency,
        amount: '1',
        envelopeRevisionRef: 'ENVELOPE_REV_MIXED_CAPACITY_NEXT',
        lineRef: null,
        revisionRef: 'ENVELOPE_REV_MIXED_CAPACITY_NEXT',
        predecessorRevisionRef: null,
      },
    };
    const envelope = {
      schemaVersion: AUTHENTICATED_OFFICE_COMMAND_SCHEMA,
      requestId: randomUUID(),
      request,
    };
    const recovery = {
      schemaVersion: C.AUTHENTICATED_COMMAND_RECOVERY_SCHEMA,
      requestId: randomUUID(),
      request: {
        worldId: f.marker.worldId,
        commandId: request.commandId,
        idempotencyKey: request.idempotencyKey,
        originalRequest: envelope,
      },
    };
    try {
      const h6 = await f.read('FINANCE', 'treasury-capacity');
      expect(h6.status).toBe('PAGE');
      if (h6.status !== 'PAGE') throw Error('H6_PAGE_REQUIRED');
      await mkdir(dir, { recursive: true });
      readbackBrowser = await startBudgetCurrentReadbackBrowser(f, dir);
      const before = h6.rows[0] as {
        budgetEnvelopeCapacity: string;
        availableCapacity: string;
      };
      await readbackBrowser.assertBudget(
        before.budgetEnvelopeCapacity,
        'h6-before-command',
      );
      await expect(
        f.worker.query(
          'select canonical_payload from world_v2.opening_seed where world_id=$1',
          [f.marker.worldId],
        ),
      ).rejects.toMatchObject({ code: '42501' });
      await expect(
        f.worker.query(
          'select * from world_v2.finance_budget_mixed_social_original',
        ),
      ).rejects.toMatchObject({ code: '42501' });
      await launch();
      const wrongCountry = {
        ...envelope,
        requestId: randomUUID(),
        request: {
          ...request,
          countryId: 'COUNTRY_02',
          payload: {
            ...request.payload,
            scope: { ...request.payload.scope, countryId: 'COUNTRY_02' },
          },
        },
      };
      expect(
        (await call(AUTHENTICATED_OFFICE_COMMAND_PATH, wrongCountry)).status,
      ).toBe(403);
      const wrongClaim = {
        ...envelope,
        requestId: randomUUID(),
        request: {
          ...request,
          payload: {
            ...request.payload,
            treasuryClaimId: 'CLAIM_FORGED_TEST_ONLY',
          },
        },
      };
      expect(
        (await call(AUTHENTICATED_OFFICE_COMMAND_PATH, wrongClaim)).status,
      ).toBe(400);
      const queued = await call(AUTHENTICATED_OFFICE_COMMAND_PATH, envelope);
      expect(
        queued.status,
        JSON.stringify({
          response: queued.body,
          source: await ask!('inspect'),
        }),
      ).toBe(202);
      expect((await ask!('consume')).receipt).toMatchObject({
        outcome: 'COMMITTED',
        worldVersionAfter: '7',
      });
      expect((await f.read('FINANCE', 'treasury-capacity')).status).toBe(
        'UNAVAILABLE',
      );
      expect((await f.read('CENTRAL_BANK', 'ledger-balances')).status).toBe(
        'UNAVAILABLE',
      );
      await readbackBrowser.refreshUnavailable();
      const publisher = createPostwarBoundedFinancialCurrentPublisher({
        sourceDatabase: f.sourceDatabase,
        publicationDatabase: f.publicationDatabase,
        worldId: f.marker.worldId,
        countryId: f.marker.countryId,
        workerId: f.workerId,
      });
      const consumer = createPostwarBudgetCurrentReadbackConsumer({
        publisher,
      });
      // Real failing publisher SQL (wrong parameter count) rolls back only this
      // derived attempt; no economic command is replayed.
      const failing = createPostwarBoundedFinancialCurrentPublisher({
        sourceDatabase: f.sourceDatabase,
        publicationDatabase: {
          query: f.publicationDatabase.query.bind(f.publicationDatabase),
          transaction: async (work) =>
            f.publicationDatabase.transaction((tx) =>
              work({
                query: (q, args) =>
                  tx.query(
                    q.includes('publication_originals')
                      ? 'select * from world_v2.read_postwar_financial_current_publication_originals($1)'
                      : q,
                    args,
                  ),
              }),
            ),
        },
        worldId: f.marker.worldId,
        countryId: f.marker.countryId,
        workerId: f.workerId,
      });
      expect(
        (
          await createPostwarBudgetCurrentReadbackConsumer({
            publisher: failing,
          }).dispatchCommittedCommand(request.commandId)
        ).status,
      ).toBe('RETRY_PENDING');
      const started = performance.now(),
        memoryBefore = process.memoryUsage(),
        heap = memoryBefore.heapUsed;
      const outcome = await consumer.dispatchCommittedCommand(
        request.commandId,
      );
      expect(outcome.status).toBe('PUBLISHED');
      if (outcome.status !== 'PUBLISHED')
        throw Error('ACTUAL_BOUNDED_PUBLICATION_REQUIRED');
      const publication = outcome.publication;
      evidence.readbackPublication = {
        ...publication,
        milliseconds: performance.now() - started,
        heapDelta: process.memoryUsage().heapUsed - heap,
        memoryBefore,
        memoryAfter: process.memoryUsage(),
        memoryLimit:
          'Point samples in Node test host with Vite; not a peak/Workers deployment guarantee',
      };
      expect(publication.head).toEqual({
        worldVersion: '7',
        eventSequence: '11',
      });
      const h7 = await f.read('FINANCE', 'treasury-capacity'),
        cb7 = await f.read('CENTRAL_BANK', 'ledger-balances');
      expect(h7.status).toBe('PAGE');
      expect(cb7.status).toBe('PAGE');
      if (h7.status !== 'PAGE' || cb7.status !== 'PAGE')
        throw Error('SAME_HEAD_PAGE_REQUIRED');
      expect(h7.source.worldVersion).toBe('7');
      expect(cb7.source.worldVersion).toBe('7');
      const after = h7.rows[0] as {
        budgetEnvelopeCapacity: string;
        availableCapacity: string;
      };
      expect(after.budgetEnvelopeCapacity).toBe(
        C.Money.from(before.budgetEnvelopeCapacity, f.policy.currency)
          .add(C.Money.from('1', f.policy.currency))
          .toCanonicalValue().amount,
      );
      expect(after.availableCapacity).toBe(
        C.Money.from(before.availableCapacity, f.policy.currency)
          .subtract(C.Money.from('1', f.policy.currency))
          .toCanonicalValue().amount,
      );
      expect(
        (await f.read('FINANCE', 'treasury-capacity', h6.source.sourceVersion))
          .status,
      ).toBe('STALE');
      const count = async () =>
        (
          await f.clone.installer.query(
            'select count(*)::text as documents from world_v2.postwar_financial_current_document where world_id=$1',
            [f.marker.worldId],
          )
        ).rows;
      await readbackBrowser.refresh();
      await readbackBrowser.assertBudget(
        after.budgetEnvelopeCapacity,
        'h7-after-publication',
      );
      expect(
        (await readbackBrowser.staleCursor(h6.source.sourceVersion)).status,
      ).toBe(409);
      const cbHttp = await readbackBrowser.readCurrent(
        'CENTRAL_BANK',
        'ledger-balances',
      );
      expect(cbHttp.status).toBe(200);
      expect(cbHttp.body).toMatchObject({
        authority: { readback: { worldVersion: '7' } },
      });
      evidence.browser = readbackBrowser.evidence();
      expect(
        f.sourceMetrics.some((q) =>
          /from world_v2\.opening_seed/iu.test(q.sql),
        ),
      ).toBe(false);
      evidence.publisherSourceMetrics = f.sourceMetrics;
      evidence.publisherStatements = f.statements;
      const wrongCountryPublisher =
        createPostwarBoundedFinancialCurrentPublisher({
          sourceDatabase: f.sourceDatabase,
          publicationDatabase: f.publicationDatabase,
          worldId: f.marker.worldId,
          countryId: 'COUNTRY_02',
          workerId: f.workerId,
        });
      expect(
        (
          await createPostwarBudgetCurrentReadbackConsumer({
            publisher: wrongCountryPublisher,
          }).dispatchCommittedCommand(request.commandId)
        ).status,
      ).toBe('RETRY_PENDING');
      const beforeDuplicate = await count();
      expect(
        (await consumer.dispatchCommittedCommand(request.commandId)).status,
      ).toBe('PUBLISHED');
      expect(await count()).toEqual(beforeDuplicate);
      evidence.sameHeadReadback = {
        h6: before,
        h7: after,
        financeHead: h7.source.worldVersion,
        centralBankHead: cb7.source.worldVersion,
        oldCursor: 'STALE',
        retry: 'PUBLISHED',
        duplicateDocumentsUnchanged: true,
      };
      const final = await call(C.AUTHENTICATED_COMMAND_RECOVERY_PATH, recovery);
      expect(final.body).toMatchObject({
        ok: true,
        state: {
          status: 'FINAL',
          receipt: { outcome: 'COMMITTED', worldVersionAfter: '7' },
        },
      });
      hosts.push(await ask!('inspect'));
      await closeChild!();
      await launch();
      expect(
        (await call(AUTHENTICATED_OFFICE_COMMAND_PATH, envelope)).body,
      ).toMatchObject({
        ok: true,
        state: { status: 'FINALIZED', source: 'EXISTING', submitted: false },
      });
      expect(
        (await call(C.AUTHENTICATED_COMMAND_RECOVERY_PATH, recovery)).body,
      ).toMatchObject({
        ok: true,
        state: { status: 'FINAL', receipt: { worldVersionAfter: '7' } },
      });
      const event = (
        await f.clone.installer.query(
          'select canonical_payload from world_v2.authoritative_event where world_id=$1 and causation_command_id=$2',
          [f.marker.worldId, request.commandId],
        )
      ).rows;
      expect(event).toHaveLength(1);
      const binding = JSON.parse(event[0].canonical_payload).binding as {
        openingEncumbranceHash: string;
        mixedSourceBindingsFingerprint: string;
      };
      const rows = (
        await f.clone.installer.query(
          'select source_text from world_v2.finance_budget_capacity_original where world_id=$1 and country_id=$2',
          [f.marker.worldId, f.marker.countryId],
        )
      ).rows;
      const capacity = JSON.parse(rows[0].source_text) as {
        treasury: { assetAccount: { accountId: string; currency: string } };
        openingFunding: { totalAmount: string; recordsSha256: string };
      };
      const social = (
        await f.clone.installer.query(
          "select canonical_payload from world_v2.authoritative_event where world_id=$1 and event_type='SOCIAL_EMPLOYMENT_POSITION_OFFER_CREATED_V1'order by event_sequence",
          [f.marker.worldId],
        )
      ).rows.map(
        (r) =>
          JSON.parse(r.canonical_payload).reservation as {
            reservationId: string;
            countryId: string;
            accountId: string;
            amount: string;
            currency: string;
          },
      );
      const encumbrances = [
        {
          reference:
            'OPENING_FUNDING_TOTAL_' +
            capacity.openingFunding.recordsSha256.slice(7).toUpperCase(),
          accountId: capacity.treasury.assetAccount.accountId,
          amount: capacity.openingFunding.totalAmount,
          currency: capacity.treasury.assetAccount.currency,
        },
        ...social
          .filter((r) => r.countryId === f.marker.countryId)
          .map((r) => ({
            reference: r.reservationId,
            accountId: r.accountId,
            amount: r.amount,
            currency: r.currency,
          })),
      ];
      const sha = (s: string) => createHash('sha256').update(s).digest('hex');
      expect(binding.openingEncumbranceHash).toBe(
        C.canonicalSha256(C.canonicalHashInput(encumbrances), sha),
      );
      expect(binding.mixedSourceBindingsFingerprint).toMatch(
        /^sha256:[a-f0-9]{64}$/u,
      );
      expect(social).toHaveLength(1);
      expect(social[0]?.amount).toBe('162.72');
      await f.publisher.query(
        'select world_v2.revoke_finance_budget_policy($1,$2)',
        [f.policyRef, 'TEST_ONLY_MIXED_NATIVE_REVOKED'],
      );
      expect(
        (await consumer.dispatchCommittedCommand(request.commandId)).status,
      ).toBe('RETRY_PENDING');
      const revoked = {
        ...envelope,
        requestId: randomUUID(),
        request: {
          ...request,
          expectedWorldVersion: '7',
          commandId: 'COMMAND_MIXED_CAPACITY_REVOKED',
          idempotencyKey: 'KEY_MIXED_CAPACITY_REVOKED',
          payload: {
            ...request.payload,
            operation: 'APPROVE_NEW_LINE',
            lineRef: 'LINE_MIXED_CAPACITY_REVOKED',
            revisionRef: 'LINE_REV_MIXED_CAPACITY_REVOKED',
          },
        },
      };
      expect(
        (await call(AUTHENTICATED_OFFICE_COMMAND_PATH, revoked)).body,
      ).toMatchObject({
        ok: false,
        error: { code: 'SOURCE_RUNTIME_UNAVAILABLE' },
      });
      hosts.push(await ask!('inspect'));
      const inspected = hosts.filter((h) => Array.isArray(h.queries));
      for (const h of inspected) {
        expect(Number(h.heapUsed)).toBeLessThan(128 * 1024 * 1024);
        expect(
          (h.queries as string[]).some((q) =>
            /from world_v2\.opening_seed/iu.test(q),
          ),
        ).toBe(false);
      }
      const sourceReads = inspected
        .flatMap(
          (h) =>
            h.queryMetrics as { sql: string; rows: number; bytes: number }[],
        )
        .filter((q) =>
          q.sql.includes('read_finance_budget_mixed_social_original'),
        );
      expect(sourceReads.length).toBeGreaterThan(0);
      expect(sourceReads.every((q) => q.bytes <= 262144 + 2048)).toBe(true);
      const footprint = (
        await f.clone.installer.query(
          'select world_version::text,event_sequence::text,(select count(*)::int from world_v2.financial_posting_batch where world_id=$1)financial,(select count(*)::int from world_v2.inventory_posting where world_id=$1)inventory,(select count(*)::int from world_v2.command_receipt where world_id=$1)receipts from world_v2.world_head where world_id=$1',
          [f.marker.worldId],
        )
      ).rows;
      expect(footprint).toEqual([
        {
          world_version: '7',
          event_sequence: '11',
          financial: 0,
          inventory: 0,
          receipts: 7,
        },
      ]);
      expect(http.every((h) => h.milliseconds < 10000)).toBe(true);
      Object.assign(evidence, {
        status: 'PASS_TEST_ONLY',
        footprint,
        binding,
        socialReservations: social,
        hosts,
        http,
        maximumOnlineCountrySourceBytes: Math.max(
          ...sourceReads.map((q) => q.bytes),
        ),
        actualWorkersDeployment: 'NOT_RUN',
        memoryMeasurement:
          'Node child sampled V8 heap and RSS; not peak or a Cloudflare fit guarantee',
      });
      complete = true;
    } catch (error) {
      evidence.status = 'FAILED';
      evidence.failure = error instanceof Error ? error.message : String(error);
      if (ask)
        try {
          hosts.push(await ask('inspect'));
        } catch (inspectionError) {
          evidence.inspectionFailure =
            inspectionError instanceof Error
              ? inspectionError.message
              : String(inspectionError);
        }
      Object.assign(evidence, { hosts, http });
      throw error;
    } finally {
      let cleanupFailure: unknown = null;
      try {
        await readbackBrowser?.close();
      } catch (error) {
        cleanupFailure = error;
      }
      try {
        await closeChild?.();
      } catch (error) {
        cleanupFailure = error;
        if (child && child.exitCode === null) {
          child.kill('SIGKILL');
          await new Promise<void>((resolve) =>
            child!.once('exit', () => resolve()),
          );
        }
      }
      await f.cleanup();
      await mkdir(dir, { recursive: true });
      await writeFile(
        dir + '/summary.json',
        JSON.stringify(
          {
            ...evidence,
            complete,
            ownedCleanup: true,
            retainedOfflineDerivedTemplate:
              process.env.ECONMIND_POSTWAR_MIXED_CAPACITY_SOURCE_CHECKPOINT,
          },
          null,
          2,
        ) + '\n',
      );
      expect(cleanupFailure).toBeNull();
    }
  }, 180000);
});
