import { createHash } from 'node:crypto';

import {
  CURRENT_REPLAY_BINDING,
  canonicalSerialize,
  type CanonicalCommand,
} from '@econmind/core';
import type { V09AtomicTestDatabase } from './v09-atomic-contract.js';

export const V29_WORKER_REPLAY_STATUS =
  'LOCAL_PGLITE_FIXED_SEQUENCE_NOT_V29_3_ACCEPTANCE' as const;

export interface V29DurableStepHash {
  readonly commandIndex: number;
  readonly eventHash: string;
  readonly inventoryHash: string;
  readonly financialHash: string;
  readonly receiptHash: string;
  readonly worldVersionHash: string;
  readonly worldVersion: string;
  readonly stepHash: string;
}

export interface V29WorkerReplayEvidence {
  readonly status: typeof V29_WORKER_REPLAY_STATUS;
  readonly seed: string;
  readonly commandCount: number;
  readonly sequenceHash: string;
  readonly steps: readonly V29DurableStepHash[];
}

export interface V29ReplayReproduction {
  readonly seed: string;
  readonly commandIndex: number;
  readonly first: V29DurableStepHash | null;
  readonly second: V29DurableStepHash | null;
}

export class V29WorkerReplayMismatchError extends Error {
  readonly reproduction: Readonly<V29ReplayReproduction>;

  constructor(reproduction: V29ReplayReproduction) {
    const safe = Object.freeze({
      seed: /^[A-Za-z0-9_-]{1,64}$/u.test(reproduction.seed)
        ? reproduction.seed
        : 'INVALID_SEED',
      commandIndex:
        Number.isSafeInteger(reproduction.commandIndex) &&
        reproduction.commandIndex >= 0
          ? reproduction.commandIndex
          : 0,
      first: safeStep(reproduction.first ?? undefined),
      second: safeStep(reproduction.second ?? undefined),
    });
    super(`V29_WORKER_REPLAY_MISMATCH ${JSON.stringify(safe)}`);
    this.name = 'V29WorkerReplayMismatchError';
    this.reproduction = safe;
  }
}

/** Optional index marker for a driver failure; its raw cause is never echoed. */
export class V29WorkerReplayStepError extends Error {
  readonly commandIndex: number;

  constructor(commandIndex: number) {
    super('V29_WORKER_REPLAY_STEP_FAILED');
    this.name = 'V29WorkerReplayStepError';
    this.commandIndex =
      Number.isSafeInteger(commandIndex) && commandIndex >= 0
        ? commandIndex
        : 0;
  }
}

function invalid(message: string): never {
  throw new Error(`V29_WORKER_REPLAY_INVALID: ${message}`);
}

function hash(value: unknown): string {
  return `sha256:${createHash('sha256').update(canonicalSerialize(value), 'utf8').digest('hex')}`;
}

function singleRow(
  rows: readonly Readonly<Record<string, unknown>>[],
  label: string,
): Readonly<Record<string, string | null>> {
  const row = rows[0];
  if (rows.length !== 1 || row === undefined) {
    invalid(`${label} must have exactly one durable row`);
  }
  for (const value of Object.values(row)) {
    if (value !== null && typeof value !== 'string') {
      invalid(`${label} contains non-canonical database evidence`);
    }
  }
  return row as Readonly<Record<string, string | null>>;
}

/** Read only committed database facts; no in-memory candidate is hashed. */
export async function readV29DurableWorkerStep(input: {
  readonly database: V09AtomicTestDatabase;
  readonly command: CanonicalCommand;
  readonly commandIndex: number;
}): Promise<V29DurableStepHash> {
  if (
    input.database.kind !== 'PGLITE' ||
    !Number.isSafeInteger(input.commandIndex) ||
    input.commandIndex < 0
  ) {
    invalid('read requires a disposable PGlite database and command index');
  }
  const scope = [input.command.worldId, input.command.commandId];
  const event = singleRow(
    (
      await input.database.query<Record<string, unknown>>(
        `select event_id, event_sequence::text, world_version::text,
                event_type, schema_version, event_fingerprint, canonical_payload,
                payload_sha256, sim_time::text
           from world_v2.authoritative_event
          where world_id = $1 and causation_command_id = $2`,
        scope,
      )
    ).rows,
    'Event',
  );
  const inventory = singleRow(
    (
      await input.database.query<Record<string, unknown>>(
        `select posting_id, world_version_before::text,
                world_version_after::text, operation, posting_fingerprint,
                canonical_payload, sim_time::text
           from world_v2.inventory_posting
          where world_id = $1 and causation_command_id = $2`,
        scope,
      )
    ).rows,
    'Inventory Posting',
  );
  const financial = singleRow(
    (
      await input.database.query<Record<string, unknown>>(
        `select batch_id, world_version_before::text,
                world_version_after::text, settlement_currency,
                batch_fingerprint, canonical_payload, sim_time::text
           from world_v2.financial_posting_batch
          where world_id = $1 and causation_command_id = $2`,
        scope,
      )
    ).rows,
    'Financial Posting',
  );
  const receipt = singleRow(
    (
      await input.database.query<Record<string, unknown>>(
        `select command_id, command_fingerprint, schema_version, outcome, reason_code,
                transition_id, world_version_before::text,
                world_version_after::text, sim_time::text,
                event_ids::text, recorded_at_real::text
           from world_v2.command_receipt
          where world_id = $1 and command_id = $2`,
        scope,
      )
    ).rows,
    'Receipt',
  );
  const world = singleRow(
    (
      await input.database.query<Record<string, unknown>>(
        `select world_version::text, event_sequence::text
           from world_v2.world_head where world_id = $1`,
        [input.command.worldId],
      )
    ).rows,
    'WorldVersion',
  );
  if (
    receipt.outcome !== 'COMMITTED' ||
    receipt.world_version_after !== world.world_version ||
    event.world_version !== world.world_version ||
    inventory.world_version_after !== world.world_version ||
    financial.world_version_after !== world.world_version ||
    event.event_sequence !== world.event_sequence ||
    typeof world.world_version !== 'string'
  ) {
    invalid('durable facts disagree on committed WorldVersion');
  }
  const hashes = Object.freeze({
    eventHash: hash(event),
    inventoryHash: hash(inventory),
    financialHash: hash(financial),
    receiptHash: hash(receipt),
    worldVersionHash: hash(world),
  });
  return Object.freeze({
    commandIndex: input.commandIndex,
    ...hashes,
    worldVersion: world.world_version,
    stepHash: hash({ ...hashes, worldVersion: world.world_version }),
  });
}

function isCanonicalHash(value: string): boolean {
  return /^sha256:[0-9a-f]{64}$/u.test(value);
}

function safeStep(
  step: V29DurableStepHash | undefined,
): V29DurableStepHash | null {
  if (
    step === undefined ||
    !Number.isSafeInteger(step.commandIndex) ||
    step.commandIndex < 0 ||
    !/^(?:0|[1-9]\d*)$/u.test(step.worldVersion) ||
    ![
      step.eventHash,
      step.inventoryHash,
      step.financialHash,
      step.receiptHash,
      step.worldVersionHash,
      step.stepHash,
    ].every(isCanonicalHash)
  ) {
    return null;
  }
  return Object.freeze({
    commandIndex: step.commandIndex,
    eventHash: step.eventHash,
    inventoryHash: step.inventoryHash,
    financialHash: step.financialHash,
    receiptHash: step.receiptHash,
    worldVersionHash: step.worldVersionHash,
    worldVersion: step.worldVersion,
    stepHash: step.stepHash,
  });
}

function validateSteps(
  steps: readonly V29DurableStepHash[],
  seed: string,
  side: 'first' | 'second',
): void {
  if (steps.length === 0) {
    throw new V29WorkerReplayMismatchError({
      seed,
      commandIndex: 0,
      first: null,
      second: null,
    });
  }
  for (const [index, step] of steps.entries()) {
    const safe = safeStep(step);
    if (
      safe === null ||
      safe.commandIndex !== index ||
      safe.stepHash !==
        hash({
          eventHash: step.eventHash,
          inventoryHash: step.inventoryHash,
          financialHash: step.financialHash,
          receiptHash: step.receiptHash,
          worldVersionHash: step.worldVersionHash,
          worldVersion: step.worldVersion,
        })
    ) {
      throw new V29WorkerReplayMismatchError({
        seed,
        commandIndex: index,
        first: side === 'first' ? safe : null,
        second: side === 'second' ? safe : null,
      });
    }
  }
}

/** The callback must construct and close a fresh disposable database per call. */
export async function assertV29WorkerFixedSeedReplay(input: {
  readonly seed: string;
  createAndRunFreshDatabase(
    seed: string,
  ): Promise<readonly V29DurableStepHash[]>;
}): Promise<V29WorkerReplayEvidence> {
  if (!/^[A-Za-z0-9_-]{1,64}$/u.test(input.seed)) {
    invalid('fixed test seed must be short and non-secret');
  }
  let first: readonly V29DurableStepHash[];
  try {
    first = await input.createAndRunFreshDatabase(input.seed);
  } catch (error) {
    throw new V29WorkerReplayMismatchError({
      seed: input.seed,
      commandIndex:
        error instanceof V29WorkerReplayStepError ? error.commandIndex : 0,
      first: null,
      second: null,
    });
  }
  let second: readonly V29DurableStepHash[];
  try {
    second = await input.createAndRunFreshDatabase(input.seed);
  } catch (error) {
    const index =
      error instanceof V29WorkerReplayStepError ? error.commandIndex : 0;
    throw new V29WorkerReplayMismatchError({
      seed: input.seed,
      commandIndex: index,
      first: safeStep(first[index]),
      second: null,
    });
  }
  validateSteps(first, input.seed, 'first');
  validateSteps(second, input.seed, 'second');
  const length = Math.max(first.length, second.length);
  for (let index = 0; index < length; index += 1) {
    const left = first[index] ?? null;
    const right = second[index] ?? null;
    if (left?.stepHash !== right?.stepHash) {
      throw new V29WorkerReplayMismatchError({
        seed: input.seed,
        commandIndex: index,
        first: safeStep(left ?? undefined),
        second: safeStep(right ?? undefined),
      });
    }
  }
  return Object.freeze({
    status: V29_WORKER_REPLAY_STATUS,
    seed: input.seed,
    commandCount: first.length,
    sequenceHash: hash({
      replayBinding: CURRENT_REPLAY_BINDING,
      seed: input.seed,
      steps: first.map((step) => step.stepHash),
    }),
    steps: Object.freeze([...first]),
  });
}
