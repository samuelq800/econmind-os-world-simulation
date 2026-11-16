/** Resume the already observed H7 database. No DDL, observation, clock publish,
 * RUN/BOOK/SHIP/WORK, opening initialization or replacement clone. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { Pool } from 'pg';
import { describe, it } from 'vitest';
import {
  loadPostwarNativeReferenceMarker,
  sealPostwarReferenceClone,
} from '../support/postwar-native-reference-db.js';
import { reopenPreparedRegisteredCheckpoint } from '../support/restore-completed-fresh-h0.js';
import { createTestOnlyFiniteClockObservationBridge } from '../support/test-only-finite-clock-observation.js';
import { PostgresSqlDatabase } from '../../apps/world-worker/src/persistence/postgres-sql-database.js';
import {
  createRegisteredFinalDriver,
  registeredFinalRecord as row,
} from '../support/postwar-registered-final-driver.js';
import { runRetainedC10Completion } from '../support/run-retained-c10-completion.js';
import { probeRetainedFxQuotes } from '../support/probe-retained-fx-quotes.js';
import {
  runRetainedSocialApplication,
  recoverRetainedSocialApplication,
} from '../support/run-retained-social-application.js';
import { wireColdError } from '../../tools/office-connection/native-mixed-cold-errors.mjs';
const flag = process.env.ECONMIND_RETAINED_C10_H7_RESUME_NATIVE;
if (flag !== undefined && flag !== '1') throw Error('H7_RESUME_FLAG_MUST_BE_1');
const native = flag === '1' ? describe : describe.skip;
const required = (name: string) => {
  const v = process.env[name];
  assert(v, name);
  return v;
};
const root = path.resolve(import.meta.dirname, '../..');
const sha = (v: string | Buffer) =>
  createHash('sha256').update(v).digest('hex');
native('same observed H7 C10 resume without reexecuting committed work', () => {
  it('recovers seven originals, reads the corrected prefix, then pays/delivers and applies', async () => {
    assert.equal(process.env.ECONMIND_REGISTERED_FINAL_NODE_NATIVE, '1');
    const candidate = required('ECONMIND_REGISTERED_FINAL_CANDIDATE_SHA'),
      out = required('ECONMIND_REGISTERED_FINAL_EVIDENCE_DIR'),
      checkpoint = required('ECONMIND_RESUME_CHECKPOINT');
    assert.equal(
      checkpoint,
      '/workspace/.cloud-setup/evidence/fn16f-d806-finite-c10',
    );
    assert(out.startsWith('/workspace/.cloud-setup/evidence/'));
    assert(!existsSync(path.join(out, 'h7-resume-native.json')));
    await mkdir(path.join(out, 'prepared-h7/pg'), { recursive: true });
    const report: Record<string, unknown> = {
      candidate,
      status: 'RUNNING',
      classification: 'EXISTING_H7_RECOVERY_NO_DDL_OR_SECOND_OBSERVATION',
    };
    const save = () =>
      writeFile(
        path.join(out, 'h7-resume-native.json'),
        JSON.stringify(report, null, 2) + '\n',
      );
    const prior = JSON.parse(
      await readFile(path.join(checkpoint, 'finite-c10-native.json'), 'utf8'),
    );
    const cp = JSON.parse(
      await readFile(
        path.join(checkpoint, 'pg/retained-checkpoint.json'),
        'utf8',
      ),
    );
    const originals = JSON.parse(
      await readFile(path.join(checkpoint, 'driver-progress.json'), 'utf8'),
    );
    const m = await loadPostwarNativeReferenceMarker(
      path.join(checkpoint, 'pg/reference-db.json'),
    );
    assert.equal(
      cp.templateDatabase,
      'postwar_clone_committed_resume_1b185a1988',
    );
    assert.equal(cp.head.world_version, '7');
    assert.equal(cp.head.event_sequence, '7');
    assert.equal(originals.originals.length, 7);
    assert.equal(originals.stored.length, 7);
    assert.equal(prior.observationRecovery.status, 'PUBLISHED');
    assert.equal(prior.observation.activeRealMilliseconds, '121');
    assert.equal(prior.observation.registration.simTime, '1210');
    const backup = JSON.parse(
      await readFile(
        '/workspace/.cloud-setup/evidence/fn16g-h7-backup-export/report.json',
        'utf8',
      ),
    );
    assert.equal(backup.status, 'PASS');
    assert.equal(backup.database, cp.templateDatabase);
    assert.equal(sha(await readFile(backup.backup.path)), backup.backup.sha256);
    report.backup = backup.backup;
    let prepared:
        | Awaited<ReturnType<typeof reopenPreparedRegisteredCheckpoint>>
        | undefined,
      driver: ReturnType<typeof createRegisteredFinalDriver> | undefined,
      registrar: Pool | undefined,
      publisher: Pool | undefined,
      opened = false;
    const failures: unknown[] = [];
    const pool = (database: string, user = 'postgres') =>
      new Pool({
        host: m.socket,
        port: m.port,
        database,
        user,
        max: 1,
        ssl: false,
        connectionTimeoutMillis: 10000,
      });
    await save();
    try {
      const admin = pool('postgres');
      try {
        const state = (
          await admin.query(
            'select datallowconn from pg_database where datname=$1',
            [cp.templateDatabase],
          )
        ).rows;
        assert.deepEqual(state, [{ datallowconn: false }]);
        await admin.query(
          'alter database ' + cp.templateDatabase + ' allow_connections true',
        );
        opened = true;
      } finally {
        await admin.end();
      }
      const dir = path.join(out, 'prepared-h7');
      for (const file of [
        'pg/reference-db.json',
        'registered-node-descriptor.json',
        'setup-ddl.json',
      ])
        await copyFile(path.join(checkpoint, file), path.join(dir, file));
      await writeFile(
        path.join(dir, 'pg/retained-checkpoint.json'),
        JSON.stringify(
          { ...cp, resourceState: 'PREPARED_OWNED_CLONE' },
          null,
          2,
        ) + '\n',
      );
      prepared = await reopenPreparedRegisteredCheckpoint({
        repositoryRoot: root,
        evidenceDirectory: out,
        completedCheckpointDirectory: dir,
        expectedCommit: candidate,
      });
      const f = prepared.fixture,
        s = prepared.setup,
        descriptor = prepared.descriptor;
      const ledger = async () => {
        const facts: Record<string, unknown> = { head: await s.counts() };
        for (const table of [
          'command_submission',
          'command_receipt',
          'authoritative_event',
          'financial_posting_batch',
          'inventory_posting',
          'current_materialization',
        ]) {
          const data = (
            await f.clone.installer.query(
              'select * from world_v2.' + table + ' where world_id=$1',
              [m.worldId],
            )
          ).rows;
          facts[table] = data.sort((a, b) =>
            JSON.stringify(a).localeCompare(JSON.stringify(b)),
          );
        }
        return {
          sha256: sha(JSON.stringify(facts)),
          facts: JSON.parse(JSON.stringify(facts)),
        };
      };
      report.before = await ledger();
      const beforeFacts = row(row(report.before).facts);
      for (const table of [
        'command_submission',
        'command_receipt',
        'authoritative_event',
        'financial_posting_batch',
        'inventory_posting',
        'current_materialization',
      ]) {
        const expected = JSON.parse(
          await readFile(
            '/workspace/.cloud-setup/evidence/fn16g-h7-backup-export/' +
              table +
              '.json',
            'utf8',
          ),
        );
        expected.sort((a: unknown, b: unknown) =>
          JSON.stringify(a).localeCompare(JSON.stringify(b)),
        );
        assert.deepEqual(
          beforeFacts[table],
          expected,
          'EXACT_EXPORTED_H7_' + table,
        );
      }
      registrar = pool(cp.templateDatabase, m.roles.registrarRole);
      const bridge = createTestOnlyFiniteClockObservationBridge(
        new PostgresSqlDatabase(registrar),
        prior.observationIntent,
      );
      const recovered = await bridge.recover();
      assert.equal(recovered.status, 'PUBLISHED');
      assert(recovered.status === 'PUBLISHED' && recovered.registration);
      assert.deepEqual(recovered.publication, prior.observation);
      report.observationRecovery = recovered;
      assert.equal(
        descriptor.registrationRef,
        recovered.registration.registrationRef,
      );
      assert.equal(
        descriptor.beneficialRent?.clockBindingRef,
        recovered.registration.clockSourceRef,
      );
      assert(
        Date.parse(recovered.registration.validUntilReal) > Date.now(),
        'SAME_OBSERVATION_TEST_REGISTRATION_EXPIRED_NO_AUTORENEWAL',
      );
      await registrar.end();
      registrar = undefined;
      await save();
      driver = createRegisteredFinalDriver({
        repositoryRoot: root,
        evidenceDirectory: out,
        worldId: m.worldId,
        installer: f.clone.installer,
        allowedOrigin: 'https://pages-test.example',
        signToken: (countryId) => {
          assert(
            countryId === 'COUNTRY_01' ||
              countryId === 'COUNTRY_02' ||
              countryId === 'COUNTRY_10',
          );
          return (
            s.signToken as (
              country: 'COUNTRY_01' | 'COUNTRY_02' | 'COUNTRY_10',
            ) => string
          )(countryId);
        },
      });
      const d = driver;
      report.driver = d.report;
      report.firstColdStart = await d.launch(descriptor);
      assert.equal(await d.rpc('CLOCK'), '1210');
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
      // Fail before PAY if the original H7 mixed prefix still cannot be replayed.
      report.restrictedH7Selectors = await d.rpc('INDUSTRY_SELECTORS', {
        countryId: 'COUNTRY_10',
        facilityId: 'OPEN-10-REFINED_FUEL',
      });
      assert.deepEqual(await ledger(), report.before);
      await save();
      // FINAL recovery must not reexecute work. The earlier failed post-commit
      // replay left H6 derived pages behind; explicitly rebuild the registered
      // countries at the held H7 head before demanding current ledger readback.
      report.h7DerivedRecovery = await d.rpc('PUBLISH_CURRENT_COUNTRIES', {
        countryIds: ['COUNTRY_02', 'COUNTRY_10'],
        expectedHead: { worldVersion: '7', eventSequence: '7' },
      });
      const publication = row(report.h7DerivedRecovery);
      assert.equal(publication.status, 'PUBLISHED');
      assert.deepEqual(publication.head, {
        worldId: m.worldId,
        worldVersion: '7',
        eventSequence: '7',
      });
      assert.deepEqual(publication.countries, ['COUNTRY_02', 'COUNTRY_10']);
      assert.deepEqual(await ledger(), report.before);
      await save();
      report.fxQuotesBefore = await probeRetainedFxQuotes({
        driver: d,
        installer: f.clone.installer,
        worldId: m.worldId,
      });
      assert.deepEqual(await ledger(), report.before);
      await save();
      publisher = pool(cp.templateDatabase, s.roles.industryPublication);
      report.c10 = await runRetainedC10Completion({
        driver: d,
        marker: m,
        database: cp.templateDatabase,
        publisher,
        evidencePath: path.join(out, 'c10-completion.json'),
        ledgerSnapshot: ledger,
        resumeCommittedWork: true,
      });
      await publisher.end();
      publisher = undefined;
      await save();
      report.socialApplication = await runRetainedSocialApplication({
        driver: d,
        installer: f.clone.installer,
        worldId: m.worldId,
        evidencePath: path.join(out, 'social-application.json'),
        ledgerSnapshot: ledger,
        browser: {
          applicationOrigin: 'https://pages-test.example',
          authSubject: s.subjects.COUNTRY_02,
          countryId: 'COUNTRY_02',
          countryDisplayId: '02',
          readConfiguration: descriptor.configuration,
          getAccessToken: () => 'Bearer ' + s.signToken('COUNTRY_02'),
        },
      });
      report.beforeRestart = await ledger();
      const head = await d.readHead();
      await save();
      await d.stop();
      report.secondColdStart = await d.launch(descriptor);
      assert.deepEqual(await d.readHead(), head);
      assert.equal(await d.rpc('CLOCK'), '1210');
      assert.deepEqual(await ledger(), report.beforeRestart);
      report.coldFinalRecoveries = [];
      for (const original of d.originals)
        (report.coldFinalRecoveries as unknown[]).push(
          await d.recover(original, { duplicateProbe: false }),
        );
      report.socialApplicationAfterRestart =
        await recoverRetainedSocialApplication({
          driver: d,
          worldId: m.worldId,
          prior: row(report.socialApplication),
        });
      report.fxQuotesAfterRestart = await probeRetainedFxQuotes({
        driver: d,
        installer: f.clone.installer,
        worldId: m.worldId,
      });
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
        refPrefix: 'C10_H7_COLD',
      });
      assert.equal(row(report.coldLogistics).status, 'ALREADY_DELIVERED');
      report.after = await ledger();
      assert.deepEqual(report.after, report.beforeRestart);
      report.status =
        'PASSED_EXISTING_H7_CONTINUATION_AND_COLD_RECOVERY_NOT_REFINERY_OUTPUT';
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
          if (prepared) await prepared.fixture.cleanup();
          else if (opened)
            await sealPostwarReferenceClone(m, cp.templateDatabase);
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
        'RETAINED_H7_NATIVE_FAILED_OR_UNDRAINED',
      );
  }, 3600000);
});
