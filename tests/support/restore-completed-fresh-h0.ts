/** Reopen a separately cloned, fully installed TEST_ONLY H0. No source,
 * admission, role, policy, actor, lease or economic command is created here.
 * Node still performs its own genuine source/seat/control validation. */
import assert from 'node:assert/strict';
import { generateKeyPairSync, randomUUID, createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import type { createRegisteredFinalNodeSetup } from './registered-final-node-setup.js';
import {
  loadPostwarNativeReferenceMarker,
  clonePostwarNativeReference,
  openPostwarNativeReferenceClone,
  sealPostwarReferenceClone,
} from './postwar-native-reference-db.js';
import { createRegisteredUtilityFixtureTokenSigner } from './registered-c10-http-actor.js';
const run = promisify(execFile);
type Setup = Awaited<ReturnType<typeof createRegisteredFinalNodeSetup>>;
type RestoreInput = {
  repositoryRoot: string;
  evidenceDirectory: string;
  completedCheckpointDirectory: string;
  expectedCommit: string;
};
export const restoreCompletedFreshH0 = (input: RestoreInput) =>
  restoreRegisteredCheckpoint(input, 'EMPTY_H0');
/** Positive, sealed checkpoint recovery: never reruns opening preparation or commands. */
export const restoreCommittedRegisteredCheckpoint = (input: RestoreInput) =>
  restoreRegisteredCheckpoint(input, 'COMMITTED_CHECKPOINT');
export const reopenPreparedRegisteredCheckpoint = (input: RestoreInput) =>
  restoreRegisteredCheckpoint(input, 'PREPARED_COMMITTED_CLONE');
async function restoreRegisteredCheckpoint(
  input: RestoreInput,
  mode: 'EMPTY_H0' | 'COMMITTED_CHECKPOINT' | 'PREPARED_COMMITTED_CLONE',
) {
  assert.equal(process.env.ECONMIND_REGISTERED_FINAL_NODE_NATIVE, '1');
  assert.equal(
    (
      await run('git', ['rev-parse', 'HEAD'], { cwd: input.repositoryRoot })
    ).stdout.trim(),
    input.expectedCommit,
  );
  assert.equal(
    (await run('git', ['status', '--porcelain'], { cwd: input.repositoryRoot }))
      .stdout,
    '',
  );
  await mkdir(path.join(input.evidenceDirectory, 'pg'), { recursive: true });
  const directory = input.completedCheckpointDirectory;
  const marker = await loadPostwarNativeReferenceMarker(
    path.join(directory, 'pg/reference-db.json'),
  );
  const checkpoint = JSON.parse(
    await readFile(path.join(directory, 'pg/retained-checkpoint.json'), 'utf8'),
  ) as {
    ownershipNonce: string;
    templateDatabase: string;
    head: { world_version: string; event_sequence: string };
    economicCounts: Record<string, string>;
    h0RestoreEligible: boolean;
    resourceState: string;
  };
  assert.equal(checkpoint.ownershipNonce, marker.ownershipNonce);
  if (mode === 'EMPTY_H0') {
    assert.deepEqual(checkpoint.head, {
      world_version: '0',
      event_sequence: '0',
    });
  } else {
    assert.equal(checkpoint.h0RestoreEligible, false);
    assert(BigInt(checkpoint.head.world_version) > 0n);
    assert(BigInt(checkpoint.head.event_sequence) > 0n);
    assert.equal(
      checkpoint.economicCounts.worldVersion,
      checkpoint.head.world_version,
    );
    assert.equal(
      checkpoint.economicCounts.eventSequence,
      checkpoint.head.event_sequence,
    );
  }
  const saved = JSON.parse(
    await readFile(
      path.join(directory, 'registered-node-descriptor.json'),
      'utf8',
    ),
  ) as {
    descriptor: Setup['descriptor'];
    roles: Setup['roles'];
    subjects: Setup['subjects'];
    actors: Setup['actors'];
  };
  const original = saved.descriptor;
  assert.equal(original.database, checkpoint.templateDatabase);
  for (const [key, expected] of Object.entries({
    worldId: marker.worldId,
    seedId: marker.seedId,
    seedFingerprint: marker.seedFingerprint,
    admissionRef: marker.admissionRef,
    socket: marker.socket,
    seedFileSHA256: marker.seedFileSha256,
  }))
    assert.equal(
      (original as unknown as Record<string, unknown>)[key],
      expected,
    );
  const ddl = JSON.parse(
    await readFile(path.join(directory, 'setup-ddl.json'), 'utf8'),
  ) as {
    entries: { name: string; sha256: string; status: string }[];
  };
  for (const entry of ddl.entries) {
    assert.equal(entry.status, 'DDL_COMMITTED');
    const bytes = await readFile(
      path.join(
        input.repositoryRoot,
        'database/proposals',
        entry.name + '.sql',
      ),
    );
    assert.equal(
      createHash('sha256').update(bytes).digest('hex'),
      entry.sha256,
      'INSTALLED_SQL_CHANGED_REQUIRES_SEPARATE_REVIEWED_UPGRADE',
    );
  }
  if (mode === 'PREPARED_COMMITTED_CLONE')
    assert.equal(checkpoint.resourceState, 'PREPARED_OWNED_CLONE');
  const clone =
    mode === 'PREPARED_COMMITTED_CLONE'
      ? await openPostwarNativeReferenceClone(
          marker,
          checkpoint.templateDatabase,
        )
      : await clonePostwarNativeReference(
          marker,
          mode === 'EMPTY_H0' ? 'completed_fresh_h0' : 'committed_resume',
          checkpoint.templateDatabase,
        );
  const counts = async () => {
    const result = await clone.installer.query<Record<string, string>>(
      'select h.world_version::text as "worldVersion",h.event_sequence::text as "eventSequence",(select count(*)::text from world_v2.command_submission where world_id=$1)commands,(select count(*)::text from world_v2.command_receipt where world_id=$1)receipts,(select count(*)::text from world_v2.authoritative_event where world_id=$1)events,(select count(*)::text from world_v2.financial_posting_batch where world_id=$1)batches,(select count(*)::text from world_v2.inventory_posting where world_id=$1)inventory,(select count(*)::text from world_v2.command_queue where world_id=$1)queues from world_v2.world_head h where h.world_id=$1',
      [marker.worldId],
    );
    assert.equal(result.rows.length, 1);
    return result.rows[0]!;
  };
  let closed = false;
  const cleanup = async () => {
    if (closed) return;
    closed = true;
    const head = await counts();
    await clone.close();
    await sealPostwarReferenceClone(marker, clone.database);
    await run('docker', ['stop', '--time', '10', marker.ownedContainer]);
    await writeFile(
      path.join(input.evidenceDirectory, 'pg/retained-checkpoint.json'),
      JSON.stringify(
        {
          classification: 'SEALED_OWNED_DATABASE_NOT_RESTORED_AUTHORITY',
          parentMarker: marker.markerPath,
          parentDatabase: checkpoint.templateDatabase,
          templateDatabase: clone.database,
          ownershipNonce: marker.ownershipNonce,
          head: {
            world_version: head.worldVersion,
            event_sequence: head.eventSequence,
          },
          economicCounts: head,
          h0RestoreEligible: Object.values(head).every((v) => v === '0'),
          resourceState: 'RETAINED_STOPPED',
          nodeAuthority: 'REQUIRES_FRESH_VALIDATION',
        },
        null,
        2,
      ) + '\n',
    );
  };
  try {
    if (mode === 'EMPTY_H0') {
      assert(
        Object.values(await counts()).every((v) => v === '0'),
        'ACTUAL_UNTOUCHED_H0_REQUIRED',
      );
    } else {
      assert.deepEqual(
        await counts(),
        checkpoint.economicCounts,
        'SEALED_CHECKPOINT_COUNTS_MUST_MATCH',
      );
    }
    const roles = await clone.installer.query<{
      rolname: string;
      rolsuper: boolean;
      rolbypassrls: boolean;
      rolcreatedb: boolean;
      rolcreaterole: boolean;
      rolreplication: boolean;
    }>(
      'select rolname,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole,rolreplication from pg_roles where rolname=any($1::text[])',
      [Object.values(saved.roles)],
    );
    assert.equal(roles.rows.length, Object.values(saved.roles).length);
    assert(
      roles.rows.every(
        (r) =>
          !r.rolsuper &&
          !r.rolbypassrls &&
          !r.rolcreatedb &&
          !r.rolcreaterole &&
          !r.rolreplication,
      ),
    );
    const bindings = await clone.installer.query<{
      auth_subject: string;
      actor_id: string;
    }>(
      'select auth_subject::text,actor_id from world_v2.world_actor_binding where world_id=$1',
      [marker.worldId],
    );
    for (const country of Object.keys(
      saved.subjects,
    ) as (keyof typeof saved.subjects)[]) {
      assert(
        original.countries.some((c) => String(c.countryId) === country),
        'SAVED_SUBJECT_REQUIRES_ACTUAL_REGISTERED_COUNTRY',
      );
      assert.equal(
        bindings.rows.filter(
          (b) =>
            b.auth_subject === saved.subjects[country] &&
            b.actor_id === saved.actors[country],
        ).length,
        1,
      );
    }
    const keys = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const kid = 'TEST_ONLY_FRESH_REOPEN_' + randomUUID();
    const jwk = {
      ...keys.publicKey.export({ format: 'jwk' }),
      kid,
      alg: 'ES256',
      use: 'sig',
      key_ops: ['verify'],
    };
    const descriptor = {
      ...original,
      database: clone.database,
      jwks: { keys: [jwk] },
      ...(mode !== 'EMPTY_H0' ? { prepareC10Sources: false } : {}),
    };
    const signToken = createRegisteredUtilityFixtureTokenSigner({
      subjects: saved.subjects,
      issuer: original.configuration.auth.expectedIssuer,
      kid,
      privateKey: keys.privateKey,
    });
    const receipt = {
      classification: 'REUSED_COMPLETED_ADMISSION_AND_SETUP_NOT_NEW_WORLD',
      recoveryMode: mode,
      candidate: input.expectedCommit,
      parentDirectory: directory,
      parentDatabase: checkpoint.templateDatabase,
      database: clone.database,
      noRolesOrSourcesCreated: true,
      noPrivateKeyPersisted: true,
      before: await counts(),
      sourcePreparation:
        mode !== 'EMPTY_H0'
          ? 'REUSED_SEALED_SOURCES_NO_PUBLICATION'
          : 'UNCHANGED_H0_DESCRIPTOR',
    };
    await copyFile(
      path.join(directory, 'pg/reference-db.json'),
      path.join(input.evidenceDirectory, 'pg/reference-db.json'),
    );
    await copyFile(
      path.join(directory, 'setup-ddl.json'),
      path.join(input.evidenceDirectory, 'setup-ddl.json'),
    );
    await writeFile(
      path.join(input.evidenceDirectory, 'registered-node-descriptor.json'),
      JSON.stringify(
        {
          classification: 'TEST_ONLY_CONFIGURATION_NOT_LIVE_AUTHORITY',
          descriptor,
          roles: saved.roles,
          subjects: saved.subjects,
          actors: saved.actors,
        },
        null,
        2,
      ) + '\n',
    );
    await writeFile(
      path.join(input.evidenceDirectory, 'restored-setup.json'),
      JSON.stringify(
        {
          receipt,
          descriptor,
          roles: saved.roles,
          subjects: saved.subjects,
          actors: saved.actors,
        },
        null,
        2,
      ) + '\n',
    );
    return {
      fixture: { marker, clone, cleanup },
      setup: {
        roles: saved.roles,
        subjects: saved.subjects,
        actors: saved.actors,
        signToken,
        counts,
        close: async () => undefined,
      },
      descriptor,
      receipt,
    };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
