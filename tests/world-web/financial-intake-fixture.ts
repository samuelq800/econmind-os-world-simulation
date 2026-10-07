import {
  AUTHENTICATED_FINANCIAL_INTAKE_PATH,
  AUTHENTICATED_FINANCIAL_INTAKE_SCHEMA,
  type FinancialIntakeAction,
  type FinancialIntakeStateDto,
} from '@econmind/core';
import type { FinancialIntakeBinding } from '../../apps/world-web/src/financial-intake/controller.js';
import type { OfficeRole } from '../../apps/world-web/src/office-projection/model.js';
import { officeProjectionFixture } from './office-projection-fixture.js';

/** OFFLINE TEST_ONLY. Existing real server parser checks every staged request.
 * All identities/authority/token/ports here are fixtures, never live binding. */
export function financialIntakeFixture(
  role: OfficeRole = 'trade',
  action: FinancialIntakeAction = 'ENQUEUE',
  parseRequest?: (value: unknown) => unknown,
) {
  const f = officeProjectionFixture(role);
  const binding: FinancialIntakeBinding = {
    read: f.config,
    view: f.binding.view,
    finalLookup: f.lookup,
    endpoint: {
      origin: f.config.endpoints.origin,
      path: AUTHENTICATED_FINANCIAL_INTAKE_PATH,
      deploymentRef: 'TEST_DEPLOYMENT',
    },
    request: {
      schemaVersion: AUTHENTICATED_FINANCIAL_INTAKE_SCHEMA,
      requestId: '33333333-3333-4333-8333-333333333333',
      request: {
        schemaVersion: 'world-staged-transfer-v1',
        action,
        worldId: f.config.identity.worldId,
        countryId: f.config.identity.countryId,
        officeId: f.config.identity.officeId as 'TRADE' | 'FINANCE',
        commandId: f.lookup.commandId,
        idempotencyKey: f.lookup.idempotencyKey,
        ...(!['INSPECT', 'READ', 'REGISTER'].includes(action)
          ? { commandFingerprint: f.lookup.commandFingerprint }
          : {}),
        ...(action === 'ENQUEUE' ? { approvalRef: 'TEST_APPROVAL' } : {}),
        ...(action === 'REGISTER'
          ? {
              intent: {
                expectedWorldVersion: '2',
                buyerCountryId: 'TEST_BUYER',
                quantity: { amount: '0.125', unit: 'tonne' },
                price: {
                  amount: '9007199254740993.25',
                  currency: 'GCU',
                  perUnit: 'tonne',
                },
                assetSource: {
                  batchId: 'TEST_BATCH',
                  physicalLocationId: 'TEST_PORT',
                  titleHolderId: 'TEST_OWNER',
                  riskBearerId: 'TEST_RISK',
                  economicRecognitionId: 'TEST_ECONOMIC',
                },
                expiresAtReal: '2026-10-08T00:00:00.000Z',
              },
            }
          : {}),
      },
    },
  };
  let reply: {
    status: number;
    state?: FinancialIntakeStateDto;
    error?: { code: string; retryable: boolean };
  } | null = null;
  let fingerprint = f.lookup.commandFingerprint;
  const calls: { url: string; body: string; init: RequestInit | undefined }[] =
    [];
  const fetcher: typeof fetch = async (input, init) => {
    const body = String(init?.body);
    calls.push({ url: String(input), body, init });
    const envelope = JSON.parse(body) as FinancialIntakeBinding['request'];
    try {
      parseRequest?.(envelope.request);
    } catch {
      return Response.json(
        {
          schemaVersion: AUTHENTICATED_FINANCIAL_INTAKE_SCHEMA,
          requestId: envelope.requestId,
          ok: false,
          error: { code: 'PROTOCOL_ERROR', retryable: false },
        },
        { status: 400 },
      );
    }
    if (envelope.request.action === 'INSPECT') {
      const state =
        action === 'REGISTER'
          ? { status: 'NOT_FOUND' as const }
          : {
              status: 'INTENT' as const,
              commandId: f.lookup.commandId,
              idempotencyKey: f.lookup.idempotencyKey,
              commandFingerprint: fingerprint,
            };
      return authorized(envelope.requestId, state);
    }
    if (reply) {
      const r = reply;
      reply = null;
      return Response.json(
        {
          schemaVersion: AUTHENTICATED_FINANCIAL_INTAKE_SCHEMA,
          requestId: envelope.requestId,
          ok: false,
          ...(r.state ? { state: r.state } : {}),
          ...(r.error ? { error: r.error } : {}),
        },
        { status: r.status },
      );
    }
    return authorized(
      envelope.requestId,
      action.startsWith('SIGN_')
        ? {
            status: 'SIGNATURE_RECORDED',
            officeId: binding.request.request.officeId,
            commandFingerprint: f.lookup.commandFingerprint,
          }
        : action === 'BIND_REFERENCE'
          ? {
              status: 'REFERENCE_BOUND',
              approvalRef: 'TEST_APPROVAL',
              commandFingerprint: f.lookup.commandFingerprint,
            }
          : {
              status:
                action === 'REGISTER'
                  ? 'PENDING_APPROVAL_OR_ENQUEUE'
                  : 'QUEUED',
              acknowledgement: {
                status: 'ACCEPTED',
                worldId: f.config.identity.worldId,
                commandId: f.lookup.commandId,
                commandFingerprint: f.lookup.commandFingerprint,
              },
            },
    );
  };
  async function authorized(requestId: string, state: FinancialIntakeStateDto) {
    const r = await f.fetcher(
      f.config.endpoints.origin + f.config.endpoints.projectionPath,
      { body: JSON.stringify({ requestId }) },
    );
    const a = (await r.json()) as { authority: unknown };
    return Response.json({
      schemaVersion: AUTHENTICATED_FINANCIAL_INTAKE_SCHEMA,
      requestId,
      ok: true,
      authority: a.authority,
      state,
    });
  }
  return {
    f,
    binding,
    calls,
    fetcher,
    authorized,
    setReply: (r: NonNullable<typeof reply>) => {
      reply = r;
    },
    mismatch: () => {
      fingerprint = `sha256:${'b'.repeat(64)}`;
    },
  };
}
