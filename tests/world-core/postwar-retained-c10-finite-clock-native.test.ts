/** One authorized isolated observation and continuation of the existing H6
 * transfer. The old recovery-only test remains strictly Clock=0. */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { Pool } from 'pg';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  sealPostwarReferenceClone,
  type PostwarNativeReferenceMarker,
} from '../support/postwar-native-reference-db.js';
import { describe, it } from 'vitest';
import { PostgresSqlDatabase } from '../../apps/world-worker/src/persistence/postgres-sql-database.js';
import {
  restoreCommittedRegisteredCheckpoint,
  reopenPreparedRegisteredCheckpoint,
} from '../support/restore-completed-fresh-h0.js';
import { renewResumedNativeExecution } from '../support/renew-resumed-native-execution.js';
import { createTestOnlyFiniteClockObservationBridge } from '../support/test-only-finite-clock-observation.js';
import {
  createRegisteredFinalDriver,
  registeredFinalRecord as row,
} from '../support/postwar-registered-final-driver.js';
import { runRetainedC10Completion } from '../support/run-retained-c10-completion.js';
import { wireColdError } from '../../tools/office-connection/native-mixed-cold-errors.mjs';
const flag = process.env.ECONMIND_RETAINED_C10_FINITE_OBSERVATION_NATIVE;
if (flag !== undefined && flag !== '1')
  throw Error('FINITE_NATIVE_FLAG_MUST_BE_1');
const native = flag === '1' ? describe : describe.skip;
const required = (name: string) => {
  const v = process.env[name];
  assert(v, name);
  return v;
};
const root = path.resolve(import.meta.dirname, '../..');
const sha = (v: string | Buffer) =>
  createHash('sha256').update(v).digest('hex');
const ledgerSql = `select jsonb_build_object('head',(select jsonb_build_object('worldVersion',world_version::text,'eventSequence',event_sequence::text)from world_v2.world_head where world_id=$1),'commands',(select jsonb_agg(jsonb_build_array(command_id,command_fingerprint)order by command_id)from world_v2.command_submission where world_id=$1),'receipts',(select jsonb_agg(jsonb_build_array(command_id,world_version_after::text,outcome)order by command_id)from world_v2.command_receipt where world_id=$1),'events',(select jsonb_agg(jsonb_build_object('id',event_id,'fingerprint',event_fingerprint,'raw',canonical_payload)order by event_sequence)from world_v2.authoritative_event where world_id=$1),'financial',(select coalesce(jsonb_agg(jsonb_build_object('id',batch_id,'fingerprint',batch_fingerprint,'raw',canonical_payload)order by batch_id),'[]'::jsonb)from world_v2.financial_posting_batch where world_id=$1),'inventory',(select jsonb_agg(jsonb_build_object('id',posting_id,'fingerprint',posting_fingerprint,'raw',canonical_payload)order by posting_id)from world_v2.inventory_posting where world_id=$1))facts`;
native('retained H6 finite observed clock and genuine C10 completion', () => {
  it('observes once, recovers six originals and executes only WORK/PAY/DELIVER', async () => {
    assert.equal(process.env.ECONMIND_REGISTERED_FINAL_NODE_NATIVE, '1');
    assert.equal(process.env.ECONMIND_RESUMED_REGISTERED_NODE_NATIVE, '1');
    const candidate = required('ECONMIND_REGISTERED_FINAL_CANDIDATE_SHA'),
      out = required('ECONMIND_REGISTERED_FINAL_EVIDENCE_DIR'),
      checkpoint = required('ECONMIND_RESUME_CHECKPOINT');
    assert(out.startsWith('/workspace/.cloud-setup/evidence/'));
    assert(
      !existsSync(path.join(out, 'finite-c10-native.json')),
      'EXISTING_ATTEMPT_REQUIRES_RECOVERY_NOT_NEW_OBSERVATION',
    );
    await mkdir(out, { recursive: true });
    const preparationDirectory = path.join(out, 'observation-preparation');
    const report: Record<string, unknown> = {
      classification:
        'NEW_ISOLATED_H6_CLONE_SINGLE_ACTUAL_OBSERVATION_NOT_PRODUCTION',
      candidate,
      status: 'RUNNING',
      continuousClockStarted: false,
      stages: [],
    };
    const save = () =>
      writeFile(
        path.join(out, 'finite-c10-native.json'),
        JSON.stringify(report, null, 2) + '\n',
      );
    let prepared:
      | Awaited<ReturnType<typeof restoreCommittedRegisteredCheckpoint>>
      | undefined;
    let driver: ReturnType<typeof createRegisteredFinalDriver> | undefined;
    let registrar: Pool | undefined, publisher: Pool | undefined;
    let closedPreparation:
      { marker: PostwarNativeReferenceMarker; database: string } | undefined;
    const failures: unknown[] = [];
    await save();
    try {
      prepared = await restoreCommittedRegisteredCheckpoint({
        repositoryRoot: root,
        evidenceDirectory: preparationDirectory,
        expectedCommit: candidate,
        completedCheckpointDirectory: checkpoint,
      });
      report.preparation = prepared.receipt;
      await save();
      const originalFixture = prepared.fixture,
        marker = originalFixture.marker,
        db = originalFixture.clone.database;
      const initial = (
        await originalFixture.clone.installer.query(ledgerSql, [marker.worldId])
      ).rows[0]!.facts;
      report.beforeObservation = initial;
      const originals = JSON.parse(
        await readFile(path.join(checkpoint, 'driver-progress.json'), 'utf8'),
      );
      assert.equal(originals.originals.length, 6);
      assert.equal(originals.stored.length, 6);
      assert.deepEqual(row(initial).head, {
        worldVersion: '6',
        eventSequence: '6',
      });
      report.renewal = await renewResumedNativeExecution(
        prepared,
        path.join(preparationDirectory, 'finite-execution-renewal.json'),
      );
      const sqlPath =
          'database/proposals/postwar-test-only-finite-clock-observation.sql',
        sql = await readFile(path.join(root, sqlPath), 'utf8');
      // The immutable candidate pins the reviewed isolated-only proposal. No
      // online grants, existing-function replacement or production install.
      assert.equal(
        sha(sql),
        'b0b06fc38c78b55c3a4aa5cb49501ec750a883cd968690b4fb6a1cbef670852d',
      );
      await originalFixture.clone.installer.query(sql);
      report.bridgeSqlSha256 = sha(sql);
      const lease = (
        await originalFixture.clone.installer.query(
          'select holder_id,fencing_token::text from world_v2.world_writer_lease where world_id=$1',
          [marker.worldId],
        )
      ).rows;
      assert.equal(lease.length, 1);
      assert.equal(lease[0]!.holder_id, prepared.descriptor.workerId);
      const scope = {
        worldId: marker.worldId,
        workerId: prepared.descriptor.workerId,
        oldRegistrationRef: prepared.descriptor.registrationRef,
        fencingToken: String(lease[0]!.fencing_token),
        worldVersion: '6',
        eventSequence: '6',
        observationRef:
          'CLOCK_OBSERVATION_' + randomUUID().replaceAll('-', '').toUpperCase(),
      };
      report.observationIntent = scope;
      await save();
      await prepared.setup.close();
      await originalFixture.clone.close();
      closedPreparation = { marker, database: db };
      const poolFor = (user: string) =>
        new Pool({
          host: marker.socket,
          port: marker.port,
          database: db,
          user,
          max: 1,
          ssl: false,
          connectionTimeoutMillis: 10000,
        });
      registrar = poolFor(marker.roles.registrarRole);
      const bridge = createTestOnlyFiniteClockObservationBridge(
        new PostgresSqlDatabase(registrar),
        scope,
      );
      assert.equal((await bridge.recover()).status, 'NOT_RECORDED');
      let publication: Awaited<ReturnType<typeof bridge.observe>>;
      try {
        publication = await bridge.observe();
      } catch (error) {
        report.observeError = wireColdError(error);
        await save();
        const recovered = await bridge.recover();
        report.observeRecovery = recovered;
        await save();
        assert.notEqual(
          recovered.status,
          'NOT_RECORDED',
          'UNKNOWN_OBSERVATION_NOT_REPEATED',
        );
        assert(recovered.status !== 'NOT_RECORDED');
        publication = recovered.publication;
      }
      report.observation = publication;
      await save();
      let registration;
      try {
        registration = await bridge.publish(publication);
      } catch (error) {
        report.publishError = wireColdError(error);
        await save();
        const recovered = await bridge.recover();
        report.publishRecovery = recovered;
        await save();
        assert.equal(
          recovered.status,
          'PUBLISHED',
          'UNKNOWN_PUBLICATION_NOT_REPEATED',
        );
        assert(recovered.status === 'PUBLISHED' && recovered.registration);
        registration = recovered.registration;
      }
      const recovered = await bridge.recover();
      assert.equal(recovered.status, 'PUBLISHED');
      report.observationRecovery = recovered;
      await registrar.end();
      registrar = undefined;
      prepared.descriptor.registrationRef = registration.registrationRef;
      assert(prepared.descriptor.beneficialRent);
      prepared.descriptor.beneficialRent.clockBindingRef =
        registration.clockSourceRef;
      const counts = prepared.receipt.before;
      await writeFile(
        path.join(preparationDirectory, 'registered-node-descriptor.json'),
        JSON.stringify(
          {
            classification: 'TEST_ONLY_CONFIGURATION_NOT_LIVE_AUTHORITY',
            descriptor: prepared.descriptor,
            roles: prepared.setup.roles,
            subjects: prepared.setup.subjects,
            actors: prepared.setup.actors,
          },
          null,
          2,
        ) + '\n',
      );
      const ddl = JSON.parse(
        await readFile(
          path.join(preparationDirectory, 'setup-ddl.json'),
          'utf8',
        ),
      );
      ddl.entries.push({
        name: 'postwar-test-only-finite-clock-observation',
        sha256: sha(sql),
        status: 'DDL_COMMITTED',
      });
      await writeFile(
        path.join(preparationDirectory, 'setup-ddl.json'),
        JSON.stringify(ddl, null, 2) + '\n',
      );
      await writeFile(
        path.join(preparationDirectory, 'pg/retained-checkpoint.json'),
        JSON.stringify(
          {
            classification: 'PREPARED_OWNED_DATABASE_NOT_RESTORED_AUTHORITY',
            ownershipNonce: marker.ownershipNonce,
            templateDatabase: db,
            head: { world_version: '6', event_sequence: '6' },
            economicCounts: counts,
            h0RestoreEligible: false,
            resourceState: 'PREPARED_OWNED_CLONE',
          },
          null,
          2,
        ) + '\n',
      );
      prepared = await reopenPreparedRegisteredCheckpoint({
        repositoryRoot: root,
        evidenceDirectory: out,
        expectedCommit: candidate,
        completedCheckpointDirectory: preparationDirectory,
      });
      closedPreparation = undefined;
      const f = prepared.fixture,
        s = prepared.setup,
        descriptor = prepared.descriptor;
      const ledger = async () => {
        const facts = (
          await f.clone.installer.query(ledgerSql, [marker.worldId])
        ).rows[0]!.facts;
        return { sha256: sha(JSON.stringify(facts)), facts };
      };
      assert.deepEqual(
        (await ledger()).facts,
        initial,
        'OBSERVATION_MUST_NOT_CHANGE_ECONOMIC_HISTORY',
      );
      report.afterObservation = await ledger();
      await save();
      driver = createRegisteredFinalDriver({
        repositoryRoot: root,
        evidenceDirectory: out,
        worldId: marker.worldId,
        installer: f.clone.installer,
        allowedOrigin: 'https://pages-test.example',
        signToken: (countryId) => {
          assert(
            ['COUNTRY_01', 'COUNTRY_02', 'COUNTRY_10'].includes(countryId),
          );
          return (
            s.signToken as (
              country: 'COUNTRY_01' | 'COUNTRY_02' | 'COUNTRY_10',
            ) => string
          )(countryId as 'COUNTRY_01' | 'COUNTRY_02' | 'COUNTRY_10');
        },
      });
      const d = driver;
      report.driver = d.report;
      report.firstColdStart = await d.launch(descriptor);
      assert.equal(await d.rpc('CLOCK'), registration.simTime);
      report.originalRecovery = [];
      for (const original of originals.originals) {
        const stored = originals.stored.find(
          (x: { commandId: string }) =>
            x.commandId === original.request.commandId,
        );
        assert(stored);
        assert.deepEqual(await d.inspect(original.request.commandId), stored);
        d.originals.push(original);
        d.stored.push(stored);
        (report.originalRecovery as unknown[]).push(
          await d.recover(original, { duplicateProbe: false }),
        );
      }
      assert.deepEqual((await ledger()).facts, initial);
      await save();
      publisher = poolFor(s.roles.industryPublication);
      report.c10 = await runRetainedC10Completion({
        driver: d,
        marker,
        database: db,
        publisher,
        evidencePath: path.join(out, 'c10-completion.json'),
        ledgerSnapshot: ledger,
      });
      await publisher.end();
      publisher = undefined;
      report.beforeRestart = await ledger();
      await save();
      const head = await d.readHead(),
        before = await s.counts();
      await d.stop();
      report.secondColdStart = await d.launch(descriptor);
      assert.deepEqual(await d.readHead(), head);
      assert.deepEqual(await s.counts(), before);
      assert.deepEqual(await ledger(), report.beforeRestart);
      assert.equal(await d.rpc('CLOCK'), registration.simTime);
      report.coldFinalRecoveries = [];
      for (const original of d.originals)
        (report.coldFinalRecoveries as unknown[]).push(
          await d.recover(original, { duplicateProbe: false }),
        );
      const book = d.originals.find(
        (o) =>
          o.request.commandType === 'INDUSTRY_FIRST_DAY_LOGISTICS_EXECUTE_V1' &&
          row(row(o.request.payload).operation).action === 'BOOK',
      )!;
      report.coldLogistics = await d.rpc('C10_LOGISTICS_ORDERS', {
        countryId: 'COUNTRY_10',
        facilityId: 'OPEN-10-REFINED_FUEL',
        runId: row(book.request.payload).runId,
        transferId: row(row(book.request.payload).operation).transferId,
        refPrefix: 'C10_COLD_RESTORE',
      });
      assert.equal(row(report.coldLogistics).status, 'ALREADY_DELIVERED');
      report.finalLedger = await ledger();
      assert.deepEqual(report.finalLedger, report.beforeRestart);
      report.status =
        'PASSED_FINITE_OBSERVATION_C10_WORK_PAY_DELIVER_AND_COLD_RECOVERY_NOT_REFINERY_OUTPUT';
    } catch (error) {
      failures.push(error);
      report.status = 'FAILED_OR_REAL_CONSTRAINT_BLOCKED';
      report.error = wireColdError(error);
    } finally {
      for (const close of [
        () => registrar?.end(),
        () => publisher?.end(),
        () => driver?.stop(),
        () => prepared?.setup.close(),
        async () => {
          if (!closedPreparation) {
            await prepared?.fixture.cleanup();
            return;
          }
          const { marker, database } = closedPreparation;
          await sealPostwarReferenceClone(marker, database);
          await promisify(execFile)('docker', [
            'stop',
            '--time',
            '10',
            marker.ownedContainer,
          ]);
          await writeFile(
            path.join(out, 'observation-blocked-checkpoint.json'),
            JSON.stringify(
              {
                database,
                parentDirectory: checkpoint,
                resourceState: 'RETAINED_STOPPED',
                observationIntent: report.observationIntent,
                classification:
                  'INSPECT_SAVED_OBSERVATION_BEFORE_ANY_RECOVERY_NO_REOBSERVATION',
              },
              null,
              2,
            ) + '\n',
          );
        },
      ]) {
        try {
          await close();
        } catch (error) {
          failures.push(error);
        }
      }
      report.cleanupErrors = failures
        .slice(report.error ? 1 : 0)
        .map(wireColdError);
      await save();
    }
    if (failures.length)
      throw new AggregateError(
        failures,
        'FINITE_C10_NATIVE_FAILED_OR_UNDRAINED',
      );
  }, 3600000);
});
