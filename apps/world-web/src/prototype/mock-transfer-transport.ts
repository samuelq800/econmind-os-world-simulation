import { PREPARATION_ONLY_MARKER } from './contracts.js';
import type {
  PrototypeGoodsTransferSubmitEnvelope,
  PrototypeGoodsTransferTransport,
  PrototypeSubmitResult,
  PrototypeTransferReceipt,
  PrototypeTransferScenario,
} from './transfer-contracts.js';

function wait(delayMs: number): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, delayMs));
}

function mockReceipt(
  command: PrototypeGoodsTransferSubmitEnvelope,
  outcome: 'COMMITTED' | 'REJECTED',
): PrototypeTransferReceipt {
  return {
    marker: PREPARATION_ONLY_MARKER,
    schemaVersion: 'command-receipt-v2',
    worldId: command.worldId,
    commandId: command.commandId,
    idempotencyKey: command.idempotencyKey,
    commandFingerprint: 'MOCK_FINGERPRINT_NOT_AUTHORITATIVE',
    outcome,
    reasonCode: outcome === 'REJECTED' ? 'MOCK_INSUFFICIENT_STOCK' : null,
    transitionId: outcome === 'COMMITTED' ? command.commandId : null,
    worldVersionBefore: command.expectedWorldVersion,
    worldVersionAfter: outcome === 'COMMITTED' ? '1843' : null,
    simTime: command.simTime,
    eventIds: outcome === 'COMMITTED' ? ['EVENT-PROTOTYPE-TRANSFER-001'] : [],
    recordedAtReal: '2032-03-18T06:20:00.000Z',
  };
}

export class LocalMockGoodsTransferTransport implements PrototypeGoodsTransferTransport {
  readonly marker = PREPARATION_ONLY_MARKER;
  readonly submitCalls: PrototypeGoodsTransferSubmitEnvelope[] = [];
  readonly lookupCalls: string[] = [];
  readonly #receipts = new Map<string, PrototypeTransferReceipt>();

  constructor(
    readonly scenario: PrototypeTransferScenario,
    readonly delayMs = 650,
  ) {}

  async submit(
    command: PrototypeGoodsTransferSubmitEnvelope,
  ): Promise<PrototypeSubmitResult> {
    this.submitCalls.push(command);
    await wait(this.delayMs);

    if (this.scenario === 'AUTHORIZATION_REVOKED') {
      return {
        kind: 'AUTHORIZATION_REVOKED',
        reason:
          'The local mock authorization revision was revoked; the office-private draft was cleared from browser state.',
      };
    }
    if (this.scenario === 'STALE_WORLD_VERSION') {
      return {
        kind: 'STALE_WORLD_VERSION',
        expectedWorldVersion: command.expectedWorldVersion,
        currentWorldVersion: '1843',
      };
    }

    const receipt = mockReceipt(
      command,
      this.scenario === 'REJECTED' ? 'REJECTED' : 'COMMITTED',
    );
    this.#receipts.set(command.commandId, receipt);

    if (this.scenario === 'UNKNOWN_OUTCOME') {
      return { kind: 'UNKNOWN_OUTCOME', commandId: command.commandId };
    }
    return { kind: 'FINAL', receipt };
  }

  async lookupReceipt(
    commandId: string,
  ): Promise<PrototypeTransferReceipt | null> {
    this.lookupCalls.push(commandId);
    await wait(this.delayMs);
    return this.#receipts.get(commandId) ?? null;
  }
}
