import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  COMMAND_SCHEMA_VERSION,
  EVENT_SCHEMA_VERSION,
  canonicalHashInput,
  canonicalSha256,
  createAuthoritativeTransition,
  createFinalCommandReceipt,
  parseAuthoritativeEvent,
  parseCanonicalCommand,
  type CanonicalCommand,
} from '@econmind/core';
import {
  V10_ACCEPTANCE_SCENARIOS,
  assertV10ScenarioEvidence,
  planV10AcceptanceCampaign,
  runV10AcceptanceCampaign,
  type V10AuthoritativeTrace,
  type V10ScenarioEvidence,
} from '../support/v10-acceptance-runner.js';

const sha256 = (value: string): string =>
  createHash('sha256').update(value, 'utf8').digest('hex');
const AT = '2026-09-12T00:00:00.000Z';

function hash(value: unknown) {
  return canonicalSha256(canonicalHashInput(value), sha256);
}

function command(label: string): CanonicalCommand {
  return parseCanonicalCommand(
    {
      schemaVersion: COMMAND_SCHEMA_VERSION,
      commandType: 'GOODS_DELIVERY_TEST',
      commandId: `COMMAND_${label}`,
      idempotencyKey: `IDEMPOTENCY_${label}`,
      worldId: 'WORLD_ACCEPTANCE_TEST',
      actorId: 'ACTOR_ACCEPTANCE_TEST',
      authSubject: '11111111-1111-4111-8111-111111111111',
      countryId: 'COUNTRY_SELLER_TEST',
      officeId: 'TRADE',
      expectedWorldVersion: '0',
      simTime: '10000',
      submittedAtReal: AT,
      correlationId: `CORRELATION_${label}`,
      payload: { label },
    },
    sha256,
  );
}

function committedTrace(label: string): V10AuthoritativeTrace {
  const canonicalCommand = command(label);
  const event = parseAuthoritativeEvent(
    {
      schemaVersion: EVENT_SCHEMA_VERSION,
      eventId: `EVENT_${label}`,
      eventType: 'GOODS_DELIVERED_TEST',
      worldId: canonicalCommand.worldId,
      worldVersion: '1',
      sequence: '1',
      causationCommandId: canonicalCommand.commandId,
      correlationId: canonicalCommand.correlationId,
      simTime: canonicalCommand.simTime.toCanonicalValue(),
      recordedAtReal: AT,
      payload: { label },
      correctsEventId: null,
    },
    sha256,
  );
  const transition = createAuthoritativeTransition({
    command: canonicalCommand,
    worldVersionBefore: '0',
    worldVersionAfter: '1',
    events: [event],
  });
  const receipt = createFinalCommandReceipt({
    command: canonicalCommand,
    outcome: 'COMMITTED',
    reasonCode: null,
    transition,
    simTime: canonicalCommand.simTime,
    recordedAtReal: AT,
  });
  return {
    phase: 'DELIVERY_SETTLEMENT',
    command: canonicalCommand,
    finalReceipt: receipt,
    attemptResponses: [
      { kind: 'RESPONSE_DROPPED' },
      { kind: 'RECEIPT', receipt },
    ],
    beforeStateHash: hash({ label, state: 'before' }),
    afterStateHash: hash({ label, state: 'after' }),
    worldVersionBefore: '0',
    worldVersionAfter: '1',
    eventIds: transition.eventIds,
    inventoryPostingFingerprints: [hash({ label, inventory: '1' })],
    financialPostingFingerprints: [hash({ label, financial: '1' })],
    outboxMessageIds: [`OUTBOX_${label}`],
  };
}

function zeroEffectTrace(label: string): V10AuthoritativeTrace {
  const canonicalCommand = command(label);
  const receipt = createFinalCommandReceipt({
    command: canonicalCommand,
    outcome: 'REJECTED',
    reasonCode: 'INSUFFICIENT_FUNDS',
    transition: null,
    simTime: canonicalCommand.simTime,
    recordedAtReal: AT,
  });
  const stateHash = hash({ label, state: 'unchanged' });
  return {
    phase: 'DELIVERY_SETTLEMENT',
    command: canonicalCommand,
    finalReceipt: receipt,
    attemptResponses: [{ kind: 'RECEIPT', receipt }],
    beforeStateHash: stateHash,
    afterStateHash: stateHash,
    worldVersionBefore: '1',
    worldVersionAfter: '1',
    eventIds: [],
    inventoryPostingFingerprints: [],
    financialPostingFingerprints: [],
    outboxMessageIds: [],
  };
}

function evidenceFor(
  scenario: V10ScenarioEvidence['scenario'],
): V10ScenarioEvidence {
  if (scenario === 'PROJECTION_REBUILD') {
    const authoritative = hash({ authority: 'unchanged' });
    const projection = hash({ projection: 'rebuilt' });
    return {
      scenario,
      traces: [],
      projection: {
        authoritativeStateHashBefore: authoritative,
        authoritativeStateHashAfter: authoritative,
        projectionHashBefore: projection,
        projectionHashAfterRebuild: projection,
      },
    };
  }
  if (scenario === 'DOUBLE_SELL_CONCURRENCY') {
    return {
      scenario,
      traces: [
        committedTrace('DOUBLE_SELL_WINNER'),
        zeroEffectTrace('DOUBLE_SELL_LOSER'),
      ],
    };
  }
  if (
    scenario === 'SUCCESSFUL_TWO_COUNTRY_DELIVERY' ||
    scenario === 'DUPLICATE_DELIVERY' ||
    scenario === 'LOST_RESPONSE_RETRY' ||
    scenario === 'CRASH_RECOVERY'
  ) {
    return { scenario, traces: [committedTrace(scenario)] };
  }
  return { scenario, traces: [zeroEffectTrace(scenario)] };
}

describe('V10.4 acceptance evidence runner', () => {
  it('plans all acceptance work as NOT_RUN until a driver is supplied', () => {
    const plan = planV10AcceptanceCampaign();
    expect(plan).toHaveLength(V10_ACCEPTANCE_SCENARIOS.length);
    expect(plan.every((item) => item.result === 'NOT_RUN')).toBe(true);
  });

  it('reconciles a response-dropped retry to one committed receipt and transition', () => {
    expect(() =>
      assertV10ScenarioEvidence(evidenceFor('LOST_RESPONSE_RETRY')),
    ).not.toThrow();
  });

  it('fails closed when a rejected command changes an authoritative hash', () => {
    const evidence = evidenceFor('INSUFFICIENT_FUNDS');
    const trace = evidence.traces[0]!;
    expect(() =>
      assertV10ScenarioEvidence({
        ...evidence,
        traces: [{ ...trace, afterStateHash: hash({ changed: true }) }],
      }),
    ).toThrow('V10_ACCEPTANCE_EVIDENCE_INVALID');
  });

  it('rejects two simultaneous committed double-sell traces', () => {
    const winner = committedTrace('DOUBLE_SELL_WINNER');
    expect(() =>
      assertV10ScenarioEvidence({
        scenario: 'DOUBLE_SELL_CONCURRENCY',
        traces: [winner, committedTrace('DOUBLE_SELL_SECOND_WINNER')],
      }),
    ).toThrow('V10_ACCEPTANCE_EVIDENCE_INVALID');
  });

  it('marks a fake local driver structurally valid without claiming Gate B PASS', async () => {
    const results = await runV10AcceptanceCampaign({
      driver: {
        surface: 'LOCAL_ISOLATED',
        productionTarget: false,
        async runScenario(scenario) {
          return evidenceFor(scenario);
        },
      },
    });
    expect(results).toHaveLength(V10_ACCEPTANCE_SCENARIOS.length);
    expect(
      results.filter(
        (item) => item.result !== 'STRUCTURALLY_VALID_NOT_GATE_B_PASS',
      ),
    ).toEqual([]);
  });

  it('refuses a driver that claims a production target', async () => {
    await expect(
      runV10AcceptanceCampaign({
        driver: {
          surface: 'LOCAL_ISOLATED',
          productionTarget: true as false,
          async runScenario(scenario) {
            return evidenceFor(scenario);
          },
        },
      }),
    ).rejects.toThrow('V10_ACCEPTANCE_EVIDENCE_INVALID');
  });
});
