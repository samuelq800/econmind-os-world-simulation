import { createHash } from 'node:crypto';

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  COMMAND_SCHEMA_VERSION,
  DOMAIN_ERROR_CODES,
  EVENT_SCHEMA_VERSION,
  FINANCIAL_POSTING_SCHEMA_VERSION,
  INVENTORY_POSTING_SCHEMA_VERSION,
  Money,
  Quantity,
  SimTime,
  canonicalSerialize,
  commandId,
  commodityId,
  countryId,
  createFinancialAccount,
  createFinancialPostingBatch,
  createAuthoritativeTransition,
  createInventoryAccount,
  createReservationPosting,
  financialAccountId,
  financialPostingBatchId,
  financialPostingLegId,
  inventoryBatchId,
  inventoryLocationId,
  inventoryPostingId,
  inventoryReservationId,
  legalEntityId,
  parseAuthoritativeEvent,
  parseCanonicalCommand,
  rebuildV08LedgersFromLineage as rebuildV08LedgersFromLineageWithEvidence,
  worldId,
  type AuthoritativeTransition,
  type CanonicalCommand,
  type FinancialAccount,
  type V08AuthoritativeLedgerTransition,
} from '../../packages/core/src/index.js';
import { testOpeningSeed } from '../helpers/v08-ledgers.js';
import { FOUNDATION_PROPERTY_CONFIG } from '../property/property-config.js';

const sha256 = (preimage: string) =>
  createHash('sha256').update(preimage, 'utf8').digest('hex');
const WORLD = worldId('WORLD_GLOBAL_VERSION');
const OWNER = legalEntityId('ENTITY_GLOBAL_OWNER');
const COUNTRY = countryId('COUNTRY_GLOBAL');
const available = createInventoryAccount({
  worldId: WORLD,
  countryId: COUNTRY,
  commodityId: commodityId('GLOBAL_GOOD'),
  batchId: inventoryBatchId('GLOBAL_BATCH'),
  unit: 'unit',
  physicalLocationId: inventoryLocationId('GLOBAL_LOCATION'),
  bucket: 'AVAILABLE',
  reservationId: null,
  shipmentId: null,
  titleHolderId: OWNER,
  riskBearerId: OWNER,
  economicRecognitionId: null,
});
const reserved = createInventoryAccount({
  ...available,
  bucket: 'RESERVED',
  reservationId: inventoryReservationId('GLOBAL_RESERVATION'),
});
const cash = createFinancialAccount({
  worldId: WORLD,
  accountId: financialAccountId('GLOBAL_CASH'),
  ownerId: OWNER,
  countryId: COUNTRY,
  accountClass: 'CASH',
  currency: 'GCU',
  claimId: null,
  counterpartyEntityId: null,
});
const equity = createFinancialAccount({
  ...cash,
  accountId: financialAccountId('GLOBAL_EQUITY'),
  accountClass: 'EQUITY',
});
const commandsByTransition = new WeakMap<object, Readonly<CanonicalCommand>>();

function commandFor(
  owner: AuthoritativeTransition,
): Readonly<CanonicalCommand> {
  const command = commandsByTransition.get(owner);
  if (command === undefined) throw new Error('test transition command missing');
  return command;
}

function rebuildV08LedgersFromLineage(
  input: Omit<
    Parameters<typeof rebuildV08LedgersFromLineageWithEvidence>[0],
    'sha256Hex'
  >,
) {
  return rebuildV08LedgersFromLineageWithEvidence({
    ...input,
    sha256Hex: sha256,
  });
}

function seed() {
  return testOpeningSeed({
    worldId: WORLD,
    sha256Hex: sha256,
    inventory: { account: available, quantity: Quantity.from('100', 'unit') },
  });
}

function transition(input: {
  readonly number: number;
  readonly before?: number;
  readonly after?: number;
  readonly identity?: string;
  readonly commandPayloadVariant?: string;
  readonly expectedWorldVersion?: string | null;
  readonly idempotencyKey?: string | null;
}): Readonly<AuthoritativeTransition> {
  const before = input.before ?? input.number - 1;
  const after = input.after ?? input.number;
  const identity = input.identity ?? String(input.number);
  const commandIdentity = commandId(`GLOBAL_COMMAND_${identity}`);
  const simTime = String(input.number * 10_000);
  const command = parseCanonicalCommand(
    {
      actorId: 'ACTOR_GLOBAL_TEST',
      authSubject: '00000000-0000-4000-8000-000000000002',
      commandId: commandIdentity,
      commandType: 'V08_GLOBAL_COMMAND',
      correlationId: `GLOBAL_COMMAND_CORRELATION_${identity}`,
      countryId: COUNTRY,
      expectedWorldVersion:
        input.expectedWorldVersion === undefined
          ? String(before)
          : input.expectedWorldVersion,
      idempotencyKey:
        input.idempotencyKey === undefined
          ? `GLOBAL_IDEMPOTENCY_${identity}`
          : input.idempotencyKey,
      officeId: null,
      payload: {
        identity,
        variant: input.commandPayloadVariant ?? 'BASE',
      },
      schemaVersion: COMMAND_SCHEMA_VERSION,
      simTime,
      submittedAtReal: '2026-09-10T00:00:00.000Z',
      worldId: WORLD,
    },
    sha256,
  );
  const event = parseAuthoritativeEvent(
    {
      causationCommandId: command.commandId,
      correlationId: `GLOBAL_CORRELATION_${identity}`,
      correctsEventId: null,
      eventId: `GLOBAL_EVENT_${identity}`,
      eventType: 'V08_GLOBAL_TRANSITION',
      payload: { identity },
      recordedAtReal: new Date(
        Date.UTC(2026, 8, 10, 0, 0, input.number),
      ).toISOString(),
      schemaVersion: EVENT_SCHEMA_VERSION,
      sequence: String(input.number),
      simTime,
      worldId: WORLD,
      worldVersion: String(after),
    },
    sha256,
  );
  const owner = createAuthoritativeTransition({
    command,
    worldVersionBefore: String(before),
    worldVersionAfter: String(after),
    events: [event],
  });
  commandsByTransition.set(owner, command);
  return owner;
}

function inventoryPosting(
  owner: AuthoritativeTransition,
  suffix = 'A',
  quantity = '1',
  simTimeTicks = (BigInt(owner.worldVersionAfter) * 10_000n).toString(),
) {
  return createReservationPosting(
    {
      schemaVersion: INVENTORY_POSTING_SCHEMA_VERSION,
      postingId: inventoryPostingId(
        `GLOBAL_INVENTORY_${owner.worldVersionAfter}_${suffix}`,
      ),
      worldId: owner.worldId,
      causationCommandId: owner.commandId,
      causationEventIds: [owner.eventIds[0]!],
      worldVersionBefore: owner.worldVersionBefore,
      worldVersionAfter: owner.worldVersionAfter,
      simTime: SimTime.fromTicks(simTimeTicks),
      command: commandFor(owner),
      transition: owner,
      quantity: Quantity.from(quantity, 'unit'),
      source: available,
      destination: reserved,
    },
    sha256,
  );
}

function financialPosting(
  owner: AuthoritativeTransition,
  suffix = 'A',
  accountOverrides: Partial<FinancialAccount> = {},
) {
  const debit = createFinancialAccount({ ...cash, ...accountOverrides });
  return createFinancialPostingBatch(
    {
      schemaVersion: FINANCIAL_POSTING_SCHEMA_VERSION,
      batchId: financialPostingBatchId(
        `GLOBAL_FINANCIAL_${owner.worldVersionAfter}_${suffix}`,
      ),
      worldId: owner.worldId,
      causationCommandId: owner.commandId,
      causationEventIds: [owner.eventIds[0]!],
      worldVersionBefore: owner.worldVersionBefore,
      worldVersionAfter: owner.worldVersionAfter,
      simTime: SimTime.fromTicks(
        (BigInt(owner.worldVersionAfter) * 10_000n).toString(),
      ),
      command: commandFor(owner),
      transition: owner,
      settlementCurrency: 'GCU',
      legs: [
        {
          legId: financialPostingLegId(
            `GLOBAL_DEBIT_${owner.worldVersionAfter}_${suffix}`,
          ),
          account: debit,
          direction: 'DEBIT',
          amount: Money.from('1', 'GCU'),
          counterpartyAccountId: equity.accountId,
        },
        {
          legId: financialPostingLegId(
            `GLOBAL_CREDIT_${owner.worldVersionAfter}_${suffix}`,
          ),
          account: equity,
          direction: 'CREDIT',
          amount: Money.from('1', 'GCU'),
          counterpartyAccountId: debit.accountId,
        },
      ],
    },
    sha256,
  );
}

function record(input: {
  readonly owner: AuthoritativeTransition;
  readonly inventory?: boolean;
  readonly financial?: boolean;
}): V08AuthoritativeLedgerTransition {
  return {
    command: commandFor(input.owner),
    transition: input.owner,
    inventoryPostings: input.inventory ? [inventoryPosting(input.owner)] : [],
    financialPostingBatches: input.financial
      ? [financialPosting(input.owner)]
      : [],
  };
}

describe('V08 one global WorldVersion reconstruction', () => {
  it('reconstructs mixed Inventory then Financial transitions on one stream', () => {
    const first = transition({ number: 1 });
    const second = transition({ number: 2 });
    const rebuilt = rebuildV08LedgersFromLineage({
      seed: seed(),
      transitions: [
        record({ owner: first, inventory: true }),
        record({ owner: second, financial: true }),
      ],
    });
    expect(rebuilt.worldVersion).toBe('2');
    expect(rebuilt.inventory.worldVersion).toBe('2');
    expect(rebuilt.financial.worldVersion).toBe('2');
    expect(rebuilt.inventory.appliedPostings).toHaveLength(1);
    expect(rebuilt.financial.appliedBatches).toHaveLength(1);
  });

  it('applies joint Inventory and Financial facts with one version advance', () => {
    const owner = transition({ number: 1 });
    const rebuilt = rebuildV08LedgersFromLineage({
      seed: seed(),
      transitions: [record({ owner, inventory: true, financial: true })],
    });
    expect(rebuilt).toMatchObject({
      worldVersion: '1',
      inventory: { worldVersion: '1' },
      financial: { worldVersion: '1' },
    });
  });

  it('supports multiple postings inside one transition without extra version advances', () => {
    const owner = transition({ number: 1 });
    const rebuilt = rebuildV08LedgersFromLineage({
      seed: seed(),
      transitions: [
        {
          command: commandFor(owner),
          transition: owner,
          inventoryPostings: [
            inventoryPosting(owner, 'A'),
            inventoryPosting(owner, 'B'),
          ],
          financialPostingBatches: [
            financialPosting(owner, 'A'),
            financialPosting(owner, 'B'),
          ],
        },
      ],
    });
    expect(rebuilt.worldVersion).toBe('1');
    expect(rebuilt.inventory.appliedPostings).toHaveLength(2);
    expect(rebuilt.financial.appliedBatches).toHaveLength(2);
  });

  it.each([
    [
      'duplicate version',
      [
        record({ owner: transition({ number: 1, identity: 'A' }) }),
        record({
          owner: transition({
            number: 2,
            before: 0,
            after: 1,
            identity: 'B',
          }),
        }),
      ],
    ],
    [
      'version gap',
      [
        record({ owner: transition({ number: 1 }) }),
        record({ owner: transition({ number: 2, before: 2, after: 3 }) }),
      ],
    ],
    [
      'reverse or out-of-order version',
      [record({ owner: transition({ number: 1, before: 1, after: 2 }) })],
    ],
  ])('rejects %s in the global transition stream', (_label, transitions) => {
    expect(() =>
      rebuildV08LedgersFromLineage({ seed: seed(), transitions }),
    ).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.OPENING_SEED_INVALID,
      }),
    );
  });

  it('rejects duplicate exact transition replay deterministically', () => {
    const owner = transition({ number: 1 });
    const exact = record({ owner, inventory: true, financial: true });
    expect(() =>
      rebuildV08LedgersFromLineage({
        seed: seed(),
        transitions: [exact, exact],
      }),
    ).toThrowError('duplicated');
  });

  it('rejects posting identity/version binding to the wrong transition', () => {
    const first = transition({ number: 1, identity: 'FIRST' });
    const unrelated = transition({ number: 1, identity: 'UNRELATED' });
    expect(() =>
      rebuildV08LedgersFromLineage({
        seed: seed(),
        transitions: [
          {
            command: commandFor(first),
            transition: first,
            inventoryPostings: [inventoryPosting(unrelated)],
            financialPostingBatches: [],
          },
        ],
      }),
    ).toThrowError('not bound');
  });

  it('rejects generated Command-fingerprint divergence for both Posting owners', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('INVENTORY', 'FINANCIAL'),
        fc.constantFrom('b', 'c', 'd', 'e', 'f'),
        (ownerKind, fingerprintCharacter) => {
          const owner = transition({ number: 1 });
          const conflictingOwner = transition({
            number: 1,
            commandPayloadVariant: fingerprintCharacter,
          });
          expect(() =>
            rebuildV08LedgersFromLineage({
              seed: seed(),
              transitions: [
                {
                  command: commandFor(owner),
                  transition: owner,
                  inventoryPostings:
                    ownerKind === 'INVENTORY'
                      ? [inventoryPosting(conflictingOwner)]
                      : [],
                  financialPostingBatches:
                    ownerKind === 'FINANCIAL'
                      ? [financialPosting(conflictingOwner)]
                      : [],
                },
              ],
            }),
          ).toThrowError('not bound');
        },
      ),
      {
        ...FOUNDATION_PROPERTY_CONFIG,
        seed: FOUNDATION_PROPERTY_CONFIG.seed + 112,
      },
    );
  });

  it('rejects incomplete Event-group and mismatched SimTime binding', () => {
    const owner = transition({ number: 1 });
    const secondEvent = parseAuthoritativeEvent(
      {
        causationCommandId: owner.commandId,
        correlationId: 'GLOBAL_CORRELATION_SECOND',
        correctsEventId: null,
        eventId: 'GLOBAL_EVENT_SECOND',
        eventType: 'V08_GLOBAL_TRANSITION',
        payload: { identity: 'SECOND' },
        recordedAtReal: '2026-09-10T00:00:02.000Z',
        schemaVersion: EVENT_SCHEMA_VERSION,
        sequence: '2',
        simTime: '10000',
        worldId: WORLD,
        worldVersion: '1',
      },
      sha256,
    );
    const completeOwner: AuthoritativeTransition = {
      ...owner,
      eventIds: [owner.eventIds[0]!, secondEvent.eventId],
      events: [owner.events[0]!, secondEvent],
    };
    expect(() =>
      rebuildV08LedgersFromLineage({
        seed: seed(),
        transitions: [
          {
            command: commandFor(owner),
            transition: completeOwner,
            inventoryPostings: [
              inventoryPosting(owner, 'PARTIAL_EVENT_GROUP', '1', '20000'),
            ],
            financialPostingBatches: [],
          },
        ],
      }),
    ).toThrowError('bind the complete');
  });

  it('rejects forged Event payload evidence before it can authorize a Posting', () => {
    const owner = transition({ number: 1 });
    const forgedOwner: AuthoritativeTransition = {
      ...owner,
      events: [
        {
          ...owner.events[0]!,
          canonicalPayload: '{"identity":"FORGED"}',
        },
      ],
    };
    commandsByTransition.set(forgedOwner, commandFor(owner));
    expect(() => inventoryPosting(forgedOwner)).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.EVENT_SCHEMA_INVALID,
      }),
    );
  });

  it('rejects forged Command payload evidence before it can authorize a Posting', () => {
    const owner = transition({ number: 1 });
    const command = commandFor(owner);
    commandsByTransition.set(
      owner,
      Object.freeze({
        ...command,
        canonicalPayload: '{"forged":true}',
      }),
    );
    expect(() => inventoryPosting(owner)).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.COMMAND_SCHEMA_INVALID,
      }),
    );
  });

  it('rejects a non-null Command expected WorldVersion that does not bind the transition', () => {
    const owner = transition({ number: 1, expectedWorldVersion: '99' });
    expect(() => inventoryPosting(owner)).toThrowError(
      'expected WorldVersion does not match',
    );
  });

  it('rejects reuse of a non-null idempotency key across distinct Commands', () => {
    const first = transition({
      number: 1,
      identity: 'IDEMPOTENCY_FIRST',
      idempotencyKey: 'GLOBAL_IDEMPOTENCY_REUSED',
    });
    const second = transition({
      number: 2,
      identity: 'IDEMPOTENCY_SECOND',
      idempotencyKey: 'GLOBAL_IDEMPOTENCY_REUSED',
    });
    expect(() =>
      rebuildV08LedgersFromLineage({
        seed: seed(),
        transitions: [record({ owner: first }), record({ owner: second })],
      }),
    ).toThrowError('Idempotency key is reused across distinct Commands');
  });

  it('rejects generated non-contiguous Event lineage from the opening origin', () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 1_000_000 }), (sequence) => {
        const owner = transition({
          number: sequence,
          before: 0,
          after: 1,
          identity: `SEQUENCE_${sequence}`,
        });
        expect(() =>
          rebuildV08LedgersFromLineage({
            seed: seed(),
            transitions: [record({ owner })],
          }),
        ).toThrowError('out of order');
      }),
      {
        ...FOUNDATION_PROPERTY_CONFIG,
        seed: FOUNDATION_PROPERTY_CONFIG.seed + 113,
      },
    );
  });

  it('returns no candidate state when Inventory fails inside a joint transition', () => {
    const owner = transition({ number: 1 });
    const valid = record({ owner, inventory: true, financial: true });
    expect(() =>
      rebuildV08LedgersFromLineage({
        seed: seed(),
        transitions: [
          {
            ...valid,
            inventoryPostings: [inventoryPosting(owner, 'OVER', '101')],
          },
        ],
      }),
    ).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.INVENTORY_NEGATIVE_STOCK,
      }),
    );
    expect(
      rebuildV08LedgersFromLineage({
        seed: seed(),
        transitions: [valid],
      }).worldVersion,
    ).toBe('1');
  });

  it('returns no candidate state when Financial fails inside a joint transition', () => {
    const owner = transition({ number: 1 });
    const valid = record({ owner, inventory: true, financial: true });
    expect(() =>
      rebuildV08LedgersFromLineage({
        seed: seed(),
        transitions: [
          {
            ...valid,
            financialPostingBatches: [
              financialPosting(owner, 'A'),
              financialPosting(owner, 'B', { accountClass: 'LIABILITY' }),
            ],
          },
        ],
      }),
    ).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.FINANCIAL_POSTING_CONFLICT,
      }),
    );
    expect(
      rebuildV08LedgersFromLineage({
        seed: seed(),
        transitions: [valid],
      }).worldVersion,
    ).toBe('1');
  });

  it('reconstructs the same mixed lineage identically across restart', () => {
    const transitions = [
      record({ owner: transition({ number: 1 }), inventory: true }),
      record({ owner: transition({ number: 2 }), financial: true }),
      record({
        owner: transition({ number: 3 }),
        inventory: true,
        financial: true,
      }),
    ];
    const first = rebuildV08LedgersFromLineage({
      seed: seed(),
      transitions,
    });
    const restarted = rebuildV08LedgersFromLineage({
      seed: seed(),
      transitions,
    });
    expect(canonicalSerialize(restarted)).toBe(canonicalSerialize(first));
  });

  it('advances WorldVersion once per generated transition, not per posting', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom('NONE', 'INVENTORY', 'FINANCIAL', 'BOTH'), {
          minLength: 1,
          maxLength: 20,
        }),
        (modes) => {
          const transitions = modes.map((mode, index) => {
            const owner = transition({ number: index + 1 });
            return record({
              owner,
              inventory: mode === 'INVENTORY' || mode === 'BOTH',
              financial: mode === 'FINANCIAL' || mode === 'BOTH',
            });
          });
          const rebuilt = rebuildV08LedgersFromLineage({
            seed: seed(),
            transitions,
          });
          expect(rebuilt.worldVersion).toBe(String(modes.length));
          expect(rebuilt.inventory.worldVersion).toBe(String(modes.length));
          expect(rebuilt.financial.worldVersion).toBe(String(modes.length));
        },
      ),
      {
        ...FOUNDATION_PROPERTY_CONFIG,
        seed: FOUNDATION_PROPERTY_CONFIG.seed + 111,
      },
    );
  });
});
