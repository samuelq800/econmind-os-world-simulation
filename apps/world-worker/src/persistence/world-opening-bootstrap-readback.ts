import {
  DOMAIN_ERROR_CODES,
  DomainError,
  type OpeningSeed,
  type Sha256Hex,
} from '@econmind/core';

import { DurableV08LedgerLineageReader } from './durable-v08-ledger-lineage-reader.js';
import { WorldOpeningSeedStore } from './opening-seed-store.js';
import type { SqlDatabase } from './sql-database.js';

function invalid(message: string): never {
  throw new DomainError(DOMAIN_ERROR_CODES.OPENING_SEED_INVALID, message);
}

export interface WorldOpeningReadback {
  readonly worldId: string;
  readonly seedId: string;
  readonly seedFingerprint: string;
  readonly worldVersion: string;
  readonly eventSequence: string;
  readonly inventoryBalanceCount: number;
  readonly financialPositionCount: number;
}

/**
 * Reuses the one immutable opening store and V08 lineage reader. This is a
 * Worker-only readback, not another ledger or an authorization to transform
 * numerical source data into opening facts.
 */
export class WorldOpeningBootstrapReadback {
  readonly #database: SqlDatabase;
  readonly #opening: WorldOpeningSeedStore;
  readonly #lineage: DurableV08LedgerLineageReader;

  constructor(input: {
    readonly database: SqlDatabase;
    readonly sha256Hex: Sha256Hex;
  }) {
    this.#database = input.database;
    this.#opening = new WorldOpeningSeedStore(input);
    this.#lineage = new DurableV08LedgerLineageReader(input);
  }

  async read(worldId: string): Promise<Readonly<WorldOpeningReadback>> {
    return this.#database.transaction(async (transaction) => {
      // The lineage reader holds the World head before reading the opening and
      // transition facts. Both readings share this transaction's snapshot.
      const snapshot = await this.#lineage.rebuildFrom(transaction, worldId);
      const seed = await this.#opening.loadFrom(transaction, worldId);
      if (
        snapshot.ledgers.seedId !== seed.seedId ||
        snapshot.ledgers.seedFingerprint !== seed.fingerprint ||
        snapshot.ledgers.inventory.worldId !== seed.worldId ||
        snapshot.ledgers.financial.worldId !== seed.worldId ||
        snapshot.ledgers.worldVersion !== snapshot.headWorldVersion
      ) {
        invalid('Opening readback differs from durable lineage reconstruction');
      }
      return Object.freeze({
        worldId: seed.worldId,
        seedId: seed.seedId,
        seedFingerprint: seed.fingerprint,
        worldVersion: snapshot.headWorldVersion,
        eventSequence: snapshot.headEventSequence,
        inventoryBalanceCount: snapshot.ledgers.inventory.balances.length,
        financialPositionCount: snapshot.ledgers.financial.positions.length,
      });
    });
  }

  async bootstrapAndReadback(input: {
    readonly seed: OpeningSeed;
    readonly bootstrappedAtReal: string;
  }): Promise<
    Readonly<{
      readonly disposition: 'BOOTSTRAPPED' | 'ALREADY_BOOTSTRAPPED';
      readonly readback: WorldOpeningReadback;
    }>
  > {
    const disposition = await this.#opening.bootstrap(input);
    const readback = await this.read(input.seed.worldId);
    if (
      readback.seedFingerprint !== input.seed.fingerprint ||
      readback.seedId !== input.seed.seedId ||
      readback.worldId !== input.seed.worldId
    ) {
      invalid('Persisted opening readback differs from requested seed');
    }
    return Object.freeze({ disposition, readback });
  }
}
