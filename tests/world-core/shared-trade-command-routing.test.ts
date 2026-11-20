/** Public transport/dispatcher only. A real canonical tiny Core command is
 * parsed; no signature, source admission, queue or economic outcome is issued. */
import { describe, it, expect } from 'vitest';
import {
  approvalLockCommand,
  approvalLockSha,
} from '../support/b-narrow-approval-lock-native.js';
import {
  parseCanonicalCommand,
  parseNarrowTreasuryGcuTransferTerms,
} from '@econmind/core';
import { validateManualOfficeCommandIntent } from '../../apps/world-worker/src/intake/manual-office-command-intent.js';
import {
  parseManualOfficeCommandRequest,
  manualOfficeCommandCapability,
} from '../../apps/world-worker/src/intake/postgres-office-command-intake.js';
import {
  createManualOfficeCommandComposition,
  manualOfficeCapability,
} from '../../apps/world-worker/src/preparation/manual-office-command-composition.js';
describe('fixed shared narrow Trade transport and dispatch', () => {
  it('uses the existing narrow parser and exact TRADE_CONTRACTS mapping without changing threshold/payment semantics', () => {
    const command = approvalLockCommand('_SHARED_ROUTING'),
      payload = JSON.parse(command.canonicalPayload);
    const request = {
      worldId: command.worldId,
      countryId: command.countryId,
      officeId: 'TRADE',
      commandType: 'CORE_GOODS_TRANSFER_V1',
      commandId: command.commandId,
      idempotencyKey: command.idempotencyKey,
      expectedWorldVersion: '0',
      payload,
    };
    expect(parseManualOfficeCommandRequest(request)).toEqual(request);
    expect(manualOfficeCommandCapability(request)).toBe('TRADE_CONTRACTS');
    expect(manualOfficeCapability(command)).toBe('TRADE_CONTRACTS');
    expect(() => validateManualOfficeCommandIntent(command)).not.toThrow();
    const terms = parseNarrowTreasuryGcuTransferTerms(command);
    expect(terms.paymentSource).toBe('BUYER_TREASURY_GCU');
    expect(terms.threshold.maxSettlement.toCanonicalValue()).toEqual({
      amount: '6',
      currency: 'GCU',
    });
    for (const wrong of [
      { officeId: 'FINANCE' },
      { commandType: 'CORE_GOODS_SHIPMENT_V1' },
      { commandType: 'UNKNOWN_TRADE' },
    ])
      expect(() =>
        parseManualOfficeCommandRequest({ ...request, ...wrong }),
      ).toThrow();
    const header = Object.fromEntries(
      Object.entries(command).filter(
        ([key]) =>
          !['fingerprint', 'payloadHash', 'canonicalPayload'].includes(key),
      ),
    );
    const invalid = parseCanonicalCommand(
      {
        ...header,
        simTime: command.simTime.toCanonicalValue(),
        payload: {
          ...payload,
          threshold: {
            ...payload.threshold,
            maxSettlement: { amount: '600', currency: 'GCU' },
          },
        },
      },
      approvalLockSha,
    );
    expect(() => validateManualOfficeCommandIntent(invalid)).toThrow();
  });
  it('refuses a structural Trade factory instead of constructing a legacy consumer or assuming approval', () => {
    const command = approvalLockCommand('_SHARED_NO_SOURCE');
    const database = {
      query: async () => {
        throw Error('NO_IO');
      },
      transaction: async () => {
        throw Error('NO_IO');
      },
    };
    expect(
      createManualOfficeCommandComposition({
        command,
        database,
        workerId: 'WORKER_SHARED_TEST',
        sha256Hex: approvalLockSha,
        readers: {},
      }),
    ).toBeNull();
    expect(
      createManualOfficeCommandComposition({
        command,
        database,
        workerId: 'WORKER_SHARED_TEST',
        sha256Hex: approvalLockSha,
        readers: { tradeReservation: {} as never, tradeSource: {} as never },
      }),
    ).toBeNull();
  });
});
