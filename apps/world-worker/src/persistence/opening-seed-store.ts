import {
  DOMAIN_ERROR_CODES,
  DomainError,
  canonicalSerialize,
  parseOpeningSeed,
  rebuildV08LedgersFromLineage,
  type OpeningSeed,
  type Sha256Hex,
} from '@econmind/core';

import type { SqlDatabase, SqlExecutor } from './sql-database.js';

const RFC3339_MILLISECONDS =
  /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;

interface OpeningSeedRow {
  readonly world_id: unknown;
  readonly seed_id: unknown;
  readonly opening_world_version: unknown;
  readonly replay_binding: unknown;
  readonly canonical_payload: unknown;
  readonly seed_fingerprint: unknown;
}

function invalid(message: string): never {
  throw new DomainError(DOMAIN_ERROR_CODES.OPENING_SEED_INVALID, message);
}

function databaseText(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    invalid(`${label} is absent or non-canonical`);
  }
  return value;
}

function databaseOpeningWorldVersion(value: unknown): '0' {
  if (value === '0' || value === 0 || value === 0n) return '0';
  invalid('Opening seed WorldVersion is absent or non-canonical');
}

function openingSeedIntent(seed: OpeningSeed): object {
  const { fingerprint: _fingerprint, ...intent } = seed;
  void _fingerprint;
  return intent;
}

function canonicalSeedPayload(seed: OpeningSeed): string {
  return canonicalSerialize(openingSeedIntent(seed));
}

function assertServerOwnedSeed(seed: OpeningSeed, sha256Hex: Sha256Hex): void {
  if (seed.sources.some((source) => source.sourceKind === 'TEST_FIXTURE')) {
    invalid('Server opening seed cannot contain TEST_FIXTURE provenance');
  }
  // A valid constructor object is still insufficient by itself. Rebuild once
  // before persistence so only the immutable opening lineage receives a row.
  rebuildV08LedgersFromLineage({ seed, sha256Hex });
}

function seedFromRow(
  row: OpeningSeedRow,
  sha256Hex: Sha256Hex,
): Readonly<OpeningSeed> {
  const worldId = databaseText(row.world_id, 'Opening seed World ID');
  const seedId = databaseText(row.seed_id, 'Opening seed ID');
  const openingWorldVersion = databaseOpeningWorldVersion(
    row.opening_world_version,
  );
  const replayBinding = databaseText(
    row.replay_binding,
    'Opening replay binding',
  );
  const canonicalPayload = databaseText(
    row.canonical_payload,
    'Opening seed canonical payload',
  );
  const fingerprint = databaseText(
    row.seed_fingerprint,
    'Opening seed fingerprint',
  );
  let intent: unknown;
  let replay: unknown;
  try {
    intent = JSON.parse(canonicalPayload);
    replay = JSON.parse(replayBinding);
  } catch {
    invalid('Opening seed row contains invalid JSON evidence');
  }
  if (
    canonicalSerialize(intent) !== canonicalPayload ||
    canonicalSerialize(replay) !== replayBinding
  ) {
    invalid('Opening seed row contains non-canonical evidence');
  }
  if (
    typeof intent !== 'object' ||
    intent === null ||
    Array.isArray(intent) ||
    (intent as { readonly worldId?: unknown }).worldId !== worldId ||
    (intent as { readonly seedId?: unknown }).seedId !== seedId ||
    (intent as { readonly openingWorldVersion?: unknown })
      .openingWorldVersion !== openingWorldVersion ||
    canonicalSerialize(
      (intent as { readonly replayBinding?: unknown }).replayBinding,
    ) !== replayBinding
  ) {
    invalid('Opening seed columns do not bind canonical seed intent');
  }
  const seed = parseOpeningSeed(
    { ...(intent as Record<string, unknown>), fingerprint },
    sha256Hex,
  );
  assertServerOwnedSeed(seed, sha256Hex);
  return seed;
}

/**
 * Explicit server-only WorldVersion-zero bootstrap and replay boundary. It
 * has no browser input path and never creates balances from cache, fixtures,
 * or a caller-supplied current snapshot.
 */
export class WorldOpeningSeedStore {
  readonly #database: SqlDatabase;
  readonly #sha256Hex: Sha256Hex;

  constructor(input: {
    readonly database: SqlDatabase;
    readonly sha256Hex: Sha256Hex;
  }) {
    this.#database = input.database;
    this.#sha256Hex = input.sha256Hex;
  }

  async bootstrap(input: {
    readonly seed: OpeningSeed;
    readonly bootstrappedAtReal: string;
  }): Promise<'BOOTSTRAPPED' | 'ALREADY_BOOTSTRAPPED'> {
    if (!RFC3339_MILLISECONDS.test(input.bootstrappedAtReal)) {
      invalid(
        'Opening seed bootstrap time must be canonical RFC3339 milliseconds',
      );
    }
    assertServerOwnedSeed(input.seed, this.#sha256Hex);
    const canonicalPayload = canonicalSeedPayload(input.seed);
    const replayBinding = canonicalSerialize(input.seed.replayBinding);
    return this.#database.transaction(async (transaction) => {
      const inserted = await transaction.query(
        `insert into world_v2.opening_seed
           (world_id, seed_id, opening_world_version, replay_binding,
            canonical_payload, seed_fingerprint, bootstrapped_at_real)
         values ($1, $2, $3, $4, $5, $6, $7)
         on conflict (world_id) do nothing`,
        [
          input.seed.worldId,
          input.seed.seedId,
          input.seed.openingWorldVersion,
          replayBinding,
          canonicalPayload,
          input.seed.fingerprint,
          input.bootstrappedAtReal,
        ],
      );
      const persisted = await this.#loadWith(transaction, input.seed.worldId);
      if (canonicalSerialize(persisted) !== canonicalSerialize(input.seed)) {
        invalid(
          'Opening seed bootstrap conflicts with immutable server lineage',
        );
      }
      return inserted.rowCount === 1 ? 'BOOTSTRAPPED' : 'ALREADY_BOOTSTRAPPED';
    });
  }

  async load(worldId: string): Promise<Readonly<OpeningSeed>> {
    return this.#loadWith(this.#database, worldId);
  }

  /**
   * Lets another server-owned reader share its already-open read transaction.
   * It does not expose a browser route or bypass canonical rehydration.
   */
  async loadFrom(
    executor: SqlExecutor,
    worldId: string,
  ): Promise<Readonly<OpeningSeed>> {
    return this.#loadWith(executor, worldId);
  }

  async #loadWith(
    executor: SqlExecutor,
    worldId: string,
  ): Promise<Readonly<OpeningSeed>> {
    const result = await executor.query<OpeningSeedRow>(
      `select world_id, seed_id, opening_world_version, replay_binding,
              canonical_payload, seed_fingerprint
         from world_v2.opening_seed
        where world_id = $1`,
      [worldId],
    );
    const row = result.rows[0];
    if (row === undefined || result.rows.length !== 1) {
      invalid('No immutable opening seed exists for World');
    }
    return seedFromRow(row, this.#sha256Hex);
  }
}
