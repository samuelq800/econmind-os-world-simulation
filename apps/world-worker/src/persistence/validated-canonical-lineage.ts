import {
  DOMAIN_ERROR_CODES,
  DomainError,
  type FinalCommandReceipt,
  type OpeningSeed,
  type RebuiltV08Ledgers,
  type V08AuthoritativeLedgerTransition,
} from '@econmind/core';

import { DurableV08LedgerLineageReader } from './durable-v08-ledger-lineage-reader.js';
import type { SqlExecutor } from './sql-database.js';

export interface ValidatedCanonicalLineageData {
  readonly worldId: string;
  readonly seed: Readonly<OpeningSeed>;
  readonly headEventSequence: string;
  readonly headWorldVersion: string;
  readonly ledgers: Readonly<RebuiltV08Ledgers>;
  readonly transitions: readonly Readonly<
    V08AuthoritativeLedgerTransition & {
      readonly receipt: Readonly<FinalCommandReceipt>;
    }
  >[];
}

declare const validatedLineageView: unique symbol;

/** Data-validation/lifetime token only; NEVER source admission or commit proof. */
export interface ValidatedCanonicalLineageView {
  readonly [validatedLineageView]: true;
}

const activeViews = new WeakMap<
  object,
  {
    readonly executor: SqlExecutor;
    readonly data: Readonly<ValidatedCanonicalLineageData>;
  }
>();

function invalid(): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
    'Validated lineage view is forged, expired or belongs to another executor',
  );
}

function freezeData(value: unknown): void {
  if (typeof value !== 'object' || value === null) return;
  for (const child of Object.values(value)) freezeData(child);
  Object.freeze(value);
}

/**
 * The only token issuer reads through the actual Worker reader, not raw arrays.
 * The caller MUST await this entire scope inside its owning transaction callback.
 * The token expires on callback settlement (including throws). This lexical
 * association cannot establish backend isolation/locks or extend a transaction.
 * No database/pool query, nested transaction or source/authority registration.
 */
export async function withValidatedCanonicalLineageFrom<Result>(
  input: {
    readonly reader: DurableV08LedgerLineageReader;
    readonly executor: SqlExecutor;
    readonly worldId: string;
  },
  consume: (view: ValidatedCanonicalLineageView) => Promise<Result>,
): Promise<Result> {
  if (!(input.reader instanceof DurableV08LedgerLineageReader)) invalid();
  // Use the actual read/validation implementation, not an overridden callback.
  const data =
    await DurableV08LedgerLineageReader.prototype.readValidatedLineageFrom.call(
      input.reader,
      input.executor,
      input.worldId,
    );
  freezeData(data);
  const view = Object.freeze({}) as ValidatedCanonicalLineageView;
  activeViews.set(view, { executor: input.executor, data });
  try {
    return await consume(view);
  } finally {
    activeViews.delete(view);
  }
}

/**
 * Returns all canonical event types losslessly. Unknown budget/economic event
 * meaning is NOT accepted here: a later domain reducer must handle it or deny,
 * never silently filter it as unrelated. Escaped data remains only inert data.
 */
export function readValidatedCanonicalLineageFrom(
  executor: SqlExecutor,
  view: ValidatedCanonicalLineageView,
): Readonly<ValidatedCanonicalLineageData> {
  const entry = activeViews.get(view);
  if (entry === undefined || entry.executor !== executor) invalid();
  return entry.data;
}
