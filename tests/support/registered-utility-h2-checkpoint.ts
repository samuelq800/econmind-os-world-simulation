/** TEST_ONLY immutable H2 checkpoint inspection. Reads canonical facts and
 * original request evidence; issues no source/control/claim/commit authority. */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Pool } from 'pg';
import { canonicalSerialize } from '@econmind/core';
import type { AuthenticatedOfficeCommandRequestDto } from '@econmind/core/authenticated-office-command-contract';
import { parseIndustryUtilityAutomaticWaterGrantIntent } from '@econmind/core/industry-utility-execution';
import { DurableV08LedgerLineageReader } from '../../apps/world-worker/src/persistence/durable-v08-ledger-lineage-reader.js';
import { PostgresSqlDatabase } from '../../apps/world-worker/src/persistence/postgres-sql-database.js';
import { readFinalReceiptFrom } from '../../apps/world-worker/src/persistence/atomic-transition-repository.js';
import { buildManualOfficeCommandIntent } from '../../apps/world-worker/src/intake/manual-office-command-intent.js';
import {
  inspectRegisteredFinalCommand,
  registeredFinalAssert as must,
  registeredFinalRecord as record,
  type RegisteredStoredCommand,
} from './postwar-registered-final-driver.js';
import type { RegisteredUtilityCounts } from './registered-utility-checkpoint-restore.js';

export const REGISTERED_UTILITY_H2_DIRECTORY =
  '/workspace/.cloud-setup/evidence/ru-c2-05';
const sha = (raw: string) => createHash('sha256').update(raw).digest('hex');
const evidenceHashes = Object.freeze({
  'driver-progress.json':
    'e2a463e50864b02f34c6092b35aca22b1a1dde1a17d8595ef122bf05558253ec',
  'utility-native-report.json':
    '3428494be4fd4cb2b799e6c5000a894c40ed30288db07a7a49a431c570ccf5e5',
  'verification.json':
    'f3fd729bc3e14f783bc1e832f42bead67b58a7cbafdacb95014b44b8f3fa65de',
  'pg/retained-checkpoint.json':
    '047d86e0eb1a8dee27c854c5078b2f8609f3e59b32c0d139ba2789207a30fdde',
});
export interface RegisteredUtilityH2Resume {
  readonly run: AuthenticatedOfficeCommandRequestDto;
  readonly book: AuthenticatedOfficeCommandRequestDto;
  readonly scope: Readonly<{
    countryId: 'COUNTRY_02';
    facilityId: 'OPEN-02-REFINED_FUEL';
    runId: string;
  }>;
  readonly grant: Readonly<{
    commandId: string;
    commandFingerprint: string;
    state: 'PENDING' | 'FINALIZED';
  }>;
  readonly priorFinals: readonly RegisteredStoredCommand[];
}
export async function readRegisteredUtilityH2Evidence() {
  const facts: Record<string, Record<string, unknown>> = {};
  for (const [name, expected] of Object.entries(evidenceHashes)) {
    const raw = await readFile(
      path.join(REGISTERED_UTILITY_H2_DIRECTORY, name),
      'utf8',
    );
    must(sha(raw) === expected, 'H2_IMMUTABLE_EVIDENCE_HASH_DIFFERS:' + name);
    facts[name] = record(JSON.parse(raw));
  }
  const driver = facts['driver-progress.json']!;
  must(
    facts['verification.json']!.worldCommit ===
      '31d6c9872343577032ba7d9702eb4762febdb8e1' &&
      driver.status === 'FAIL' &&
      Array.isArray(driver.originals) &&
      driver.originals.length === 2 &&
      Array.isArray(driver.stored) &&
      driver.stored.length === 2,
    'H2_PRIOR_RUN_BOOK_EVIDENCE_REQUIRED',
  );
  return { driver, checkpoint: facts['pg/retained-checkpoint.json']! };
}

/** Both states are read before deciding whether any consume may be attempted.
 * CLAIMED/unknown states are never repaired or automatically resubmitted. */
export function assertRegisteredUtilityResumeCounts(
  counts: RegisteredUtilityCounts,
  state: unknown,
): void {
  must(
    state === 'PENDING' || state === 'FINALIZED',
    'H2_RESUME_UNKNOWN_QUEUE_STATE',
  );
  const head = state === 'PENDING' ? '2' : '3';
  must(
    canonicalSerialize(counts) ===
      canonicalSerialize({
        worldVersion: head,
        eventSequence: head,
        commands: '3',
        queues: '3',
        receipts: head,
        events: head,
        batches: '0',
        inventory: '0',
      }),
    'H2_RESUME_EXACT_ECONOMIC_COUNTS_REQUIRED',
  );
}

export async function readRegisteredUtilityH2ResumeFrom(input: {
  readonly pool: Pool;
  readonly worldId: string;
  readonly seedFingerprint: string;
  readonly admissionRef: string;
  readonly counts: RegisteredUtilityCounts;
}): Promise<RegisteredUtilityH2Resume> {
  const { driver } = await readRegisteredUtilityH2Evidence();
  const originals =
    driver.originals as readonly AuthenticatedOfficeCommandRequestDto[];
  const expectedFinals = driver.stored as readonly RegisteredStoredCommand[];
  const database = new PostgresSqlDatabase(input.pool);
  const lineage = new DurableV08LedgerLineageReader({
    database,
    sha256Hex: sha,
  });
  const commands = [];
  const finals: RegisteredStoredCommand[] = [];
  for (let i = 0; i < 2; i++) {
    const original = originals[i]!;
    must(
      original.schemaVersion === 'world-authenticated-office-command-v1' &&
        typeof original.requestId === 'string',
      'H2_ORIGINAL_REQUEST_REQUIRED',
    );
    const command = await lineage.readCommandReadOnlyFrom(
      database,
      input.worldId,
      original.request.commandId,
    );
    const rederived = buildManualOfficeCommandIntent({
      request: original.request,
      countryId: 'COUNTRY_02',
      officeId: 'INDUSTRY',
      actor: command.actorId,
      authSubject: command.authSubject,
      simTime: command.simTime.toCanonicalValue(),
      submittedAtReal: command.submittedAtReal,
      correlationId: command.correlationId,
    });
    must(
      rederived.fingerprint === command.fingerprint,
      'H2_ORIGINAL_CANONICAL_COMMAND_DIFFERS',
    );
    const actual = await inspectRegisteredFinalCommand(
      input.pool,
      input.worldId,
      command.commandId,
    );
    must(
      canonicalSerialize(actual) === canonicalSerialize(expectedFinals[i]),
      'H2_IMMUTABLE_FINAL_OR_EVENT_DIFFERS',
    );
    const receipt = await readFinalReceiptFrom(database, command);
    must(receipt?.outcome === 'COMMITTED', 'H2_CANONICAL_FINAL_REQUIRED');
    commands.push(command);
    finals.push(actual);
  }
  const [run, book] = commands;
  must(
    run &&
      book &&
      run.commandType === 'CORE_INDUSTRY_RUN_SCHEDULE_V1' &&
      book.commandType === 'INDUSTRY_FIRST_DAY_POWER_EXECUTE_V1' &&
      run.expectedWorldVersion === '0' &&
      book.expectedWorldVersion === '1',
    'H2_EXACT_RUN_BOOK_SEQUENCE_REQUIRED',
  );
  const runPayload = record(JSON.parse(run.canonicalPayload)),
    bookPayload = record(JSON.parse(book.canonicalPayload));
  const runId = runPayload.runId;
  must(
    typeof runId === 'string' &&
      bookPayload.runId === runId &&
      runPayload.facilityId === 'OPEN-02-REFINED_FUEL' &&
      bookPayload.facilityId === runPayload.facilityId &&
      record(bookPayload.operation).action === 'BOOK',
    'H2_RUN_BOOK_SCOPE_REQUIRED',
  );
  const result = await input.pool.query<{
    command_id: string;
    command_fingerprint: string;
    schedule_command_id: string;
    source_ref: string;
    source_sha256: string;
    seed_fingerprint: string;
    admission_ref: string;
    queue_state: string;
    authority_kind: string;
    available_at_sim_time: string;
  }>(
    `select p.command_id,p.command_fingerprint,p.schedule_command_id,p.source_ref,
      s.source_sha256,p.seed_fingerprint,p.admission_ref,q.queue_state,q.authority_kind,q.available_at_sim_time::text
     from world_v2.postwar_industry_water_grant_publication p
     join world_v2.postwar_industry_utility_source s on s.world_id=p.world_id and s.source_ref=p.source_ref
     join world_v2.command_queue q on q.world_id=p.world_id and q.command_id=p.command_id
     where p.world_id=$1 and p.run_id=$2 and s.country_id='COUNTRY_02'and s.facility_id='OPEN-02-REFINED_FUEL'`,
    [input.worldId, runId],
  );
  must(
    result.rows.length === 1,
    'H2_EXACT_EXISTING_GRANT_PUBLICATION_REQUIRED',
  );
  const row = result.rows[0]!;
  const id =
    'COMMAND_INDUSTRY_WATER_GRANT_' +
    sha(
      canonicalSerialize([
        input.worldId,
        run.fingerprint,
        row.source_sha256,
        'INDUSTRY_BOUNDED_WATER_GRANT_V1',
      ]),
    ).toUpperCase();
  must(
    row.command_id === id &&
      row.schedule_command_id === run.commandId &&
      row.seed_fingerprint === input.seedFingerprint &&
      row.admission_ref === input.admissionRef &&
      row.authority_kind === 'VERSIONED_AUTOMATIC' &&
      (row.queue_state === 'PENDING' || row.queue_state === 'FINALIZED'),
    'H2_KNOWN_GRANT_IDENTITY_AND_STATE_REQUIRED',
  );
  const grant = await lineage.readCommandReadOnlyFrom(
    database,
    input.worldId,
    id,
  );
  parseIndustryUtilityAutomaticWaterGrantIntent(grant, sha);
  const payload = record(JSON.parse(grant.canonicalPayload));
  must(
    grant.fingerprint === row.command_fingerprint &&
      grant.actorId === run.actorId &&
      grant.authSubject === run.authSubject &&
      grant.correlationId === run.correlationId &&
      grant.idempotencyKey === id &&
      grant.simTime.toCanonicalValue() === '0' &&
      row.available_at_sim_time === '0' &&
      grant.expectedWorldVersion === '2' &&
      grant.officeId === null &&
      grant.countryId === 'COUNTRY_02' &&
      payload.runId === runId &&
      payload.facilityId === 'OPEN-02-REFINED_FUEL' &&
      payload.sourceRef === row.source_ref + '_WATER' &&
      payload.sourceRawSha256 === row.source_sha256,
    'H2_ACTUAL_CANONICAL_GRANT_SOURCE_DIFFERS',
  );
  const receipt = await readFinalReceiptFrom(database, grant);
  if (row.queue_state === 'PENDING')
    must(receipt === null, 'H2_PENDING_GRANT_MUST_HAVE_NO_FINAL');
  else {
    must(receipt?.outcome === 'COMMITTED', 'H2_FINAL_GRANT_RECEIPT_REQUIRED');
    await inspectRegisteredFinalCommand(input.pool, input.worldId, id);
  }
  assertRegisteredUtilityResumeCounts(input.counts, row.queue_state);
  const resume: RegisteredUtilityH2Resume = {
    run: originals[0]!,
    book: originals[1]!,
    priorFinals: finals,
    scope: {
      countryId: 'COUNTRY_02' as const,
      facilityId: 'OPEN-02-REFINED_FUEL' as const,
      runId,
    },
    grant: {
      commandId: id,
      commandFingerprint: grant.fingerprint,
      state: row.queue_state,
    },
  };
  return Object.freeze(resume);
}
