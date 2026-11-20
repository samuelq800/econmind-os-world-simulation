/** Explicit TEST_ONLY renewal on a sealed checkpoint's owned clone. It keeps
 * the exact immutable Clock original and existing worker/scope. No economic
 * command, source, role or permission is created or changed. */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Pool } from 'pg';
import { canonicalSerialize } from '@econmind/core';
import type { restoreCommittedRegisteredCheckpoint } from './restore-completed-fresh-h0.js';
export async function renewResumedNativeExecution(
  prepared: Awaited<ReturnType<typeof restoreCommittedRegisteredCheckpoint>>,
  evidencePath: string,
) {
  assert.equal(process.env.ECONMIND_RESUMED_REGISTERED_NODE_NATIVE, '1');
  const {
    fixture: { marker, clone },
    descriptor,
    setup,
  } = prepared;
  assert.match(clone.database, /^postwar_clone_committed_resume_[a-f0-9]+$/u);
  const beforeCounts = await setup.counts();
  const rows = (
    await clone.installer.query<{
      registration_text: string;
      clock_original_text: string;
      control_original_text: string;
    }>(
      'select registration_text,clock_original_text,control_original_text from world_v2.world_command_execution_registration where registration_ref=$1 and world_id=$2 and not exists(select 1 from world_v2.world_command_execution_revocation r where r.registration_ref=$1)',
      [descriptor.registrationRef, marker.worldId],
    )
  ).rows;
  assert.equal(rows.length, 1, 'EXISTING_UNREVOKED_EXECUTION_REQUIRED');
  const old = rows[0]!,
    original = JSON.parse(old.registration_text),
    clock = JSON.parse(old.clock_original_text),
    control = JSON.parse(old.control_original_text);
  assert.equal(original.worldId, marker.worldId);
  assert.equal(original.workerId, descriptor.workerId);
  assert.equal(original.consumerRole, descriptor.workerRole);
  assert.equal(original.seedFingerprint, marker.seedFingerprint);
  assert.equal(original.admissionRef, marker.admissionRef);
  assert.equal(original.controlMode, 'MANUAL_FINITE');
  assert.equal(original.simTime, '0');
  assert.equal(clock.simTime, '0');
  assert.equal(
    original.clockSourceRef,
    descriptor.beneficialRent?.clockBindingRef,
  );
  const beforeLease = (
    await clone.installer.query(
      'select * from world_v2.world_writer_lease where world_id=$1',
      [marker.worldId],
    )
  ).rows;
  assert.equal(beforeLease.length, 1);
  assert.equal(beforeLease[0].holder_id, descriptor.workerId);
  const lease = (
    await clone.installer.query(
      'select * from world_v2.acquire_world_writer_lease($1,$2,clock_timestamp(),3600000)',
      [marker.worldId, descriptor.workerId],
    )
  ).rows;
  assert.equal(lease.length, 1);
  assert.equal(lease[0].holder_id, descriptor.workerId);
  const uid = randomUUID().replaceAll('-', '').toUpperCase();
  const now = (
    await clone.installer.query<{ now: string }>(
      'select clock_timestamp()::text as now',
    )
  ).rows[0]!.now;
  const validFromReal = new Date(Date.parse(now) - 1000).toISOString();
  const validUntilReal = new Date(Date.parse(now) + 3600000).toISOString();
  const sha = (value: string) =>
    createHash('sha256').update(value).digest('hex');
  const nextControl = canonicalSerialize({
    ...control,
    sourceRef: 'CONTROL_TEST_ONLY_RESUMED_' + uid,
    validFromReal,
    validUntilReal,
    provenanceRef: 'TEST_ONLY_SAME_SCOPE_FINITE_RENEWAL_NO_CLOCK_ADVANCE',
  });
  const registration = {
    ...original,
    registrationRef: 'EXECUTION_TEST_ONLY_RESUMED_' + uid,
    controlSourceRef: 'CONTROL_TEST_ONLY_RESUMED_' + uid,
    controlSourceSha256: sha(nextControl),
    validFromReal,
    validUntilReal,
  };
  const raw = canonicalSerialize(registration);
  const registrar = new Pool({
    host: marker.socket,
    port: marker.port,
    database: clone.database,
    user: marker.roles.registrarRole,
    password: async () => '',
    ssl: false,
    max: 1,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 1000,
  });
  const client = await registrar.connect();
  try {
    await client.query('begin');
    await client.query('set local role world_v2_admission_release');
    await client.query(
      'select world_v2.revoke_world_command_execution($1,$2,$3)',
      [
        marker.worldId,
        descriptor.registrationRef,
        'TEST_ONLY_EXPLICIT_FINITE_SAME_CLOCK_RENEWAL',
      ],
    );
    await client.query(
      'select world_v2.register_world_command_execution($1,$2,$3,$4)',
      [raw, sha(raw), old.clock_original_text, nextControl],
    );
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
    await registrar.end();
  }
  assert.deepEqual(
    await setup.counts(),
    beforeCounts,
    'RENEWAL_CANNOT_CHANGE_ECONOMIC_HISTORY',
  );
  descriptor.registrationRef = registration.registrationRef;
  const receipt = {
    classification: 'TEST_ONLY_ONE_FINITE_SAME_SCOPE_RENEWAL_NOT_CLOCK_ADVANCE',
    database: clone.database,
    beforeCounts,
    beforeLease,
    lease,
    before: original,
    after: registration,
    clockOriginalUnchanged: true,
  };
  await writeFile(evidencePath, JSON.stringify(receipt, null, 2) + '\n');
  await writeFile(
    path.join(path.dirname(evidencePath), 'registered-node-descriptor.json'),
    JSON.stringify(
      {
        classification: 'TEST_ONLY_CONFIGURATION_NOT_LIVE_AUTHORITY',
        descriptor,
        roles: setup.roles,
        subjects: setup.subjects,
        actors: setup.actors,
      },
      null,
      2,
    ) + '\n',
  );
  return receipt;
}
