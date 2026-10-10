import {
  AUTHENTICATED_OFFICE_COMMAND_SCHEMA,
  type AuthenticatedOfficeCommandRequestDto,
} from '@econmind/core/authenticated-office-command-contract';
import { officeProjectionFixture } from './office-projection-fixture.js';
import type { OfficeRole } from '../../apps/world-web/src/office-projection/model.js';
import { officeFamilies } from '../../apps/world-web/src/office-command/contract.js';

/** OFFLINE TEST_ONLY generated transport vectors, never actual source/seat/commit. */
export function officeCommandFixture(role: OfficeRole = 'captain') {
  const f = officeProjectionFixture(role);
  const payloads = {
    captain: {
      schemaVersion: 'captain-political-capital-allocation-v1',
      fromBucket: 'FISCAL_REFORM',
      toBucket: 'INDUSTRIAL_STRATEGY',
      amount: { amount: '7.125', unit: 'political_capital' },
      reasonFactRef: 'FACT.TEST_ONLY.REASON.1',
    },
    central_bank: {
      schemaVersion: 'central-bank-omo-intent-v1',
      direction: 'BUY_GOVERNMENT_SECURITIES',
      securityRef: 'SECURITY_TEST_ONLY_GOV',
      batchRef: 'BATCH_TEST_ONLY_GOV',
      faceValue: { amount: '2', currency: 'GCU' },
      settlementSimTime: '10000',
      policyNote: null,
    },
    social: {
      schemaVersion: 'social-employment-service-plan-v1',
      locationId: 'REGION_01_E1',
      skill: 'HIGH',
      positionId: 'POSITION_TEST_ONLY',
      servicePoolId: 'SERVICE_POOL_TEST_ONLY',
      requestedMatches: '3',
      dueDayIndex: '1',
    },
  };
  const request: AuthenticatedOfficeCommandRequestDto = {
    schemaVersion: AUTHENTICATED_OFFICE_COMMAND_SCHEMA,
    requestId: '11111111-1111-4111-8111-111111111111',
    request: {
      worldId: f.config.identity.worldId,
      countryId: f.config.identity.countryId,
      officeId: f.config.identity
        .officeId as AuthenticatedOfficeCommandRequestDto['request']['officeId'],
      commandType:
        officeFamilies[
          f.config.identity.officeId as keyof typeof officeFamilies
        ],
      commandId: f.lookup.commandId,
      idempotencyKey: f.lookup.idempotencyKey,
      expectedWorldVersion: '2',
      payload: payloads[role as keyof typeof payloads] ?? {},
    },
  };
  const endpoint = {
    origin: f.config.endpoints.origin,
    path: '/v1/office-command' as const,
    deploymentRef: 'TEST_OFFICE_DEPLOYMENT',
  };
  let submit: typeof fetch = async (_input, init) => {
    const r = JSON.parse(String(init?.body)) as typeof request;
    return Response.json(
      {
        schemaVersion: AUTHENTICATED_OFFICE_COMMAND_SCHEMA,
        requestId: r.requestId,
        ok: true,
        state: {
          status: 'QUEUED',
          source: 'NEW',
          commandType: r.request.commandType,
          commandId: r.request.commandId,
          commandFingerprint: f.lookup.commandFingerprint,
          submitted: true,
          queued: true,
        },
      },
      { status: 202 },
    );
  };
  const commands: { body: typeof request; init: RequestInit }[] = [];
  let transport: typeof fetch = f.fetcher;
  const fetcher: typeof fetch = (input, init) => {
    if (new URL(String(input)).pathname === endpoint.path) {
      commands.push({
        body: JSON.parse(String(init?.body)) as typeof request,
        init: init!,
      });
      return submit(input, init);
    }
    return transport(input, init);
  };
  return {
    f,
    request,
    endpoint,
    commands,
    fetcher,
    binding: { read: f.config, view: f.binding.view, endpoint },
    submit: (fn: typeof fetch) => {
      submit = fn;
    },
    reads: (fn: typeof fetch) => {
      transport = fn;
    },
  };
}
