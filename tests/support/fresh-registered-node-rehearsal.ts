/** Fresh, separately owned TEST_ONLY preparation. Reuses the fixed historical
 * source proof and controlled publishers; never restores an absent H3 world. */
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { Pool } from 'pg';
import { inspectFreshRehearsalStartup } from '../../tools/office-connection/fresh-rehearsal-startup-preflight.mjs';
import { createPostwarBeneficialRentChildNativeFixture } from './postwar-beneficial-rent-child-native-fixture.js';
import { createRegisteredFinalNodeSetup } from './registered-final-node-setup.js';
import { prepareRegisteredFinalNativeSqlPlan } from '../../tools/office-connection/registered-final-native-sql.mjs';
import { preparePostwarSocialEmploymentCreationForward } from './postwar-social-employment-creation-forward.js';
import { wireColdError } from '../../tools/office-connection/native-mixed-cold-errors.mjs';

const sha = (value: string) => createHash('sha256').update(value).digest('hex');
export async function prepareFreshRegisteredNodeRehearsal(input: {
  repositoryRoot: string;
  evidenceDirectory: string;
  manifestFile: string;
  expectedCommit: string;
}) {
  assert.equal(process.env.ECONMIND_REGISTERED_FINAL_NODE_NATIVE, '1');
  const preflight = await inspectFreshRehearsalStartup(input);
  assert.equal(
    preflight.status,
    'PRECHECK_ONLY_FULL_VALIDATION_NOT_RUN',
    'NEW_SOURCE_NEEDS_INDEPENDENT_VERSIONED_BINDING_NO_PIN_BYPASS',
  );
  const sqlPlan = await prepareRegisteredFinalNativeSqlPlan(input);
  const manifest = JSON.parse(await readFile(input.manifestFile, 'utf8')) as {
    parentFile: string;
    parentRawSha256: string;
  };
  // This exact source-bound entry relocates files; it does not broaden any
  // parent/child/product/SQL pin or accept a manifest as a private proof.
  assert.equal(
    manifest.parentRawSha256,
    'ee2f777126e9050ce7139e2d9d9e24d2ec7305de95b8380d3e4c35fc4edb314f',
  );
  const fixture = await createPostwarBeneficialRentChildNativeFixture({
    repositoryRoot: input.repositoryRoot,
    evidenceDirectory: path.join(input.evidenceDirectory, 'pg'),
    artifactDirectory: path.dirname(input.manifestFile),
    retainOwnedCheckpointOnCleanup: true,
  });
  let setup:
    Awaited<ReturnType<typeof createRegisteredFinalNodeSetup>> | undefined;
  try {
    setup = await createRegisteredFinalNodeSetup({
      fixture,
      repositoryRoot: input.repositoryRoot,
      sqlPlan,
    });
    const receipt: Record<string, unknown> = {
      classification: 'NEW_ISOLATED_ACTUAL_H0_NOT_RESTORED_H3',
      candidate: input.expectedCommit,
      preflight,
      referenceMarker: fixture.marker.markerPath,
      cloneDatabase: fixture.clone.database,
      before: await setup.counts(),
      supplement: 'NOT_RUN',
      sourceInitializer: 'NOT_RUN',
      node: 'NOT_STARTED',
      consumer: 'NOT_STARTED',
      clock: 'NOT_STARTED',
    };
    const save = () =>
      writeFile(
        path.join(input.evidenceDirectory, 'fresh-preparation.json'),
        JSON.stringify(receipt, null, 2) + '\n',
      );
    await save();
    // Fresh installation needs the supplement only. The retained v1->v2
    // thirteen-function forward must never be applied to already-current SQL.
    const forward = await preparePostwarSocialEmploymentCreationForward(
      input.repositoryRoot,
    );
    const supplement =
      'database/proposals/postwar-social-employment-creation.sql';
    const metadata = JSON.parse(
      await readFile(
        path.join(input.repositoryRoot, forward.manifestPath),
        'utf8',
      ),
    ) as { newSupplement: { path: string; sha256: string } };
    assert.equal(metadata.newSupplement.path, supplement);
    const sql = await readFile(
      path.join(input.repositoryRoot, supplement),
      'utf8',
    );
    assert.equal(sha(sql), metadata.newSupplement.sha256);
    const absence = await fixture.clone.installer.query<{
      present: string | null;
    }>(
      "select to_regclass('world_v2.postwar_social_employment_creation_licence')::text present",
    );
    assert.equal(
      absence.rows[0]?.present,
      null,
      'FRESH_SOCIAL_SUPPLEMENT_ONLY',
    );
    receipt.supplement = {
      status: 'COMMIT_RESULT_UNKNOWN',
      path: supplement,
      sha256: sha(sql),
    };
    await save();
    await fixture.clone.installer.query(sql);
    receipt.supplement = {
      status: 'COMMITTED',
      path: supplement,
      sha256: sha(sql),
    };
    await save();
    const publisher = new Pool({
      host: fixture.marker.socket,
      port: fixture.marker.port,
      database: fixture.clone.database,
      user: setup.roles.publication,
      max: 1,
      ssl: false,
      password: async () => '',
      connectionTimeoutMillis: 10000,
    });
    try {
      const client = await publisher.connect();
      try {
        await client.query('begin isolation level repeatable read');
        await client.query(
          'set local role world_v2_postwar_projection_publisher',
        );
        const result = await client.query<{ count: number }>(
          'select world_v2.prepare_postwar_social_employment_creation_licences($1)count',
          [fixture.marker.worldId],
        );
        assert.equal(result.rows.length, 1);
        const count = result.rows[0]!.count;
        assert(Number.isSafeInteger(count) && count >= 0);
        receipt.sourceInitializer = { status: 'COMMIT_RESULT_UNKNOWN', count };
        await save();
        await client.query('commit');
        receipt.sourceInitializer = {
          status: 'COMMITTED_ACTUAL_SOURCE_DERIVATION',
          count,
        };
        await save();
      } catch (error) {
        try {
          await client.query('rollback');
        } catch (rollback) {
          receipt.rollbackError = wireColdError(rollback);
        }
        receipt.sourceInitializerError = wireColdError(error);
        await save();
        throw error;
      } finally {
        client.release();
      }
    } finally {
      await publisher.end();
    }
    receipt.after = await setup.counts();
    assert.deepEqual(
      receipt.after,
      receipt.before,
      'SOURCE_PREPARATION_CANNOT_ADVANCE_HEAD_OR_CREATE_ECONOMIC_COMMANDS',
    );
    await save();
    const descriptor = {
      ...setup.descriptor,
      install: { ...setup.descriptor.install, centralBankOmo: false },
      beneficialRent: {
        ...setup.descriptor.beneficialRent,
        parentSeedPath: manifest.parentFile,
      },
    };
    return { fixture, setup, descriptor, receipt };
  } catch (error) {
    const failures: unknown[] = [error];
    try {
      await setup?.close();
    } catch (close) {
      failures.push(close);
    }
    try {
      await fixture.cleanup();
    } catch (close) {
      failures.push(close);
    }
    throw failures.length === 1
      ? error
      : new AggregateError(failures, 'FRESH_PREPARATION_AND_SEAL_FAILURE');
  }
}
