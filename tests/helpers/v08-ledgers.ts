import {
  COMMAND_SCHEMA_VERSION,
  CURRENT_REPLAY_BINDING,
  EVENT_SCHEMA_VERSION,
  OPENING_SEED_SCHEMA_VERSION,
  OPENING_SOURCE_SCHEMA_VERSION,
  createOpeningSeed,
  createOpeningSource,
  createAuthoritativeTransition,
  parseCanonicalCommand,
  parseAuthoritativeEvent,
  openingInventoryEntryId,
  openingSeedId,
  openingSourceId,
  rebuildV08LedgersFromLineage,
  type InventoryAccount,
  type AuthoritativeTransition,
  type CanonicalCommand,
  type CommandId,
  type EventId,
  type OpeningSeed,
  type Quantity,
  type RebuiltV08Ledgers,
  type Sha256Hex,
  type SimTime,
  type WorldId,
} from '../../packages/core/src/index.js';

export interface TestAuthoritativeTransitionEvidence {
  readonly command: Readonly<CanonicalCommand>;
  readonly transition: Readonly<AuthoritativeTransition>;
}

export function testAuthoritativeTransition(input: {
  readonly worldId: WorldId;
  readonly commandId: CommandId;
  readonly eventIds: readonly EventId[];
  readonly worldVersionBefore: string;
  readonly worldVersionAfter: string;
  readonly simTime: SimTime;
  readonly sha256Hex: Sha256Hex;
  readonly firstEventSequence?: string;
  readonly commandPayload?: unknown;
}): Readonly<TestAuthoritativeTransitionEvidence> {
  const firstEventSequence = BigInt(input.firstEventSequence ?? '1');
  const command = parseCanonicalCommand(
    {
      actorId: 'ACTOR_LEDGER_TEST',
      authSubject: '00000000-0000-4000-8000-000000000001',
      commandId: input.commandId,
      commandType: 'TEST_LEDGER_COMMAND',
      correlationId: `TEST_CORRELATION_${input.commandId}`,
      countryId: 'COUNTRY_LEDGER_TEST',
      expectedWorldVersion: input.worldVersionBefore,
      idempotencyKey: `IDEMPOTENCY_${input.commandId}`,
      officeId: null,
      payload: input.commandPayload ?? { commandId: input.commandId },
      schemaVersion: COMMAND_SCHEMA_VERSION,
      simTime: input.simTime.toCanonicalValue(),
      submittedAtReal: '2026-09-10T00:00:00.000Z',
      worldId: input.worldId,
    },
    input.sha256Hex,
  );
  const events = input.eventIds.map((identity, index) =>
    parseAuthoritativeEvent(
      {
        causationCommandId: command.commandId,
        correlationId: `TEST_CORRELATION_${input.commandId}_${index + 1}`,
        correctsEventId: null,
        eventId: identity,
        eventType: 'TEST_LEDGER_TRANSITION',
        payload: { commandId: input.commandId, eventId: identity },
        recordedAtReal: '2026-09-10T00:00:00.000Z',
        schemaVersion: EVENT_SCHEMA_VERSION,
        sequence: (firstEventSequence + BigInt(index)).toString(),
        simTime: input.simTime.toCanonicalValue(),
        worldId: input.worldId,
        worldVersion: input.worldVersionAfter,
      },
      input.sha256Hex,
    ),
  );
  const transition = createAuthoritativeTransition({
    command,
    worldVersionBefore: input.worldVersionBefore,
    worldVersionAfter: input.worldVersionAfter,
    events,
  });
  return Object.freeze({
    command,
    transition,
  });
}

export function openingLedgers(input: {
  readonly worldId: WorldId;
  readonly sha256Hex: Sha256Hex;
  readonly inventory?: Readonly<{
    account: Readonly<InventoryAccount>;
    quantity: Quantity;
  }>;
}): Readonly<RebuiltV08Ledgers> {
  return rebuildV08LedgersFromLineage({
    seed: testOpeningSeed(input),
    sha256Hex: input.sha256Hex,
  });
}

export function testOpeningSeed(input: {
  readonly worldId: WorldId;
  readonly sha256Hex: Sha256Hex;
  readonly inventory?: Readonly<{
    account: Readonly<InventoryAccount>;
    quantity: Quantity;
  }>;
}): Readonly<OpeningSeed> {
  const source = createOpeningSource(
    {
      schemaVersion: OPENING_SOURCE_SCHEMA_VERSION,
      sourceId: openingSourceId(`SOURCE_${input.worldId}`),
      sourceKind: 'TEST_FIXTURE',
      locator: 'tests/helpers/v08-ledgers.ts',
      sourceVersion: 'v08-forward-fix-1',
      payload: { worldId: input.worldId },
    },
    input.sha256Hex,
  );
  return createOpeningSeed(
    {
      schemaVersion: OPENING_SEED_SCHEMA_VERSION,
      seedId: openingSeedId(`SEED_${input.worldId}`),
      worldId: input.worldId,
      openingWorldVersion: '0',
      replayBinding: CURRENT_REPLAY_BINDING,
      sources: [source],
      inventoryEntries:
        input.inventory === undefined
          ? []
          : [
              {
                entryId: openingInventoryEntryId(
                  `OPENING_INVENTORY_${input.worldId}`,
                ),
                sourceId: source.sourceId,
                account: input.inventory.account,
                quantity: input.inventory.quantity,
              },
            ],
      financialBatches: [],
    },
    input.sha256Hex,
  );
}
