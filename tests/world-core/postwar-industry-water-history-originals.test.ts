import type { SqlExecutor } from '../../apps/world-worker/src/persistence/sql-database.js';
import * as C from '@econmind/core';
import { canonicalSerialize as sourceSerialize } from '../../packages/core/src/serialization/canonical.js';
import { describe, expect, it } from 'vitest';
import {
  createIndustryWaterExecutionFixture,
  waterExecutionSha as sha,
} from '../support/industry-water-execution-fixture.js';
import {
  reconstructPostwarIndustryWaterGrantOriginals,
  readPostwarIndustryWaterCommandOriginalFrom,
  POSTWAR_WATER_COMMAND_EVIDENCE_QUERY,
} from '../../apps/world-worker/src/persistence/postwar-industry-water-history-originals.js';
import {
  readIndustryFirstDayWaterExecutionState,
  readIndustryFirstDayWaterCommandSource,
} from '../../packages/core/src/commands/industry-first-day-water-execution.js';

// Worker imports the built Core package. Rehydrate persisted transport exactly
// as SQL does; do not pass private source-build domain objects across issuers.
function transportCommand(command: Parameters<typeof sourceSerialize>[0]) {
  const { canonicalPayload, payloadHash, fingerprint, ...body } = JSON.parse(
    sourceSerialize(command),
  );
  void payloadHash;
  void fingerprint;
  return C.parseCanonicalCommand(
    { ...body, payload: JSON.parse(canonicalPayload) },
    sha,
  );
}
function transportGrant(
  frame: ReturnType<typeof createIndustryWaterExecutionFixture>['grant'],
) {
  const command = transportCommand(frame.command),
    events = frame.events.map((event) => {
      const { canonicalPayload, payloadHash, fingerprint, ...body } =
        JSON.parse(sourceSerialize(event));
      void payloadHash;
      void fingerprint;
      return C.parseAuthoritativeEvent(
        { ...body, payload: JSON.parse(canonicalPayload) },
        sha,
      );
    }),
    transition = C.createAuthoritativeTransition({
      command,
      events,
      worldVersionBefore: frame.transition.worldVersionBefore,
      worldVersionAfter: frame.transition.worldVersionAfter,
    });
  return {
    ...frame,
    command,
    events,
    transition,
    receipt: C.createFinalCommandReceipt({
      command,
      transition,
      outcome: 'COMMITTED',
      reasonCode: null,
      simTime: command.simTime,
      recordedAtReal: frame.receipt.recordedAtReal,
    }),
  };
}
function originalData(
  original: ReturnType<
    typeof createIndustryWaterExecutionFixture
  >['waterOriginal'],
) {
  const { paymentFrames, ...data } = original;
  void paymentFrames;
  return data;
}
function fixtureOriginal(
  original: Parameters<typeof reconstructPostwarIndustryWaterGrantOriginals>[0],
  paymentFrames: NonNullable<
    ReturnType<
      typeof createIndustryWaterExecutionFixture
    >['waterOriginal']['paymentFrames']
  > = [],
) {
  const { paymentFrames: previous, ...data } = original;
  void previous;
  return { ...data, paymentFrames };
}
describe('water historical source snapshots from complete committed grants', () => {
  it('preserves the original GRANT fingerprint while adding its actual right/service references, and replays through page boundaries', () => {
    const f = createIndustryWaterExecutionFixture();
    const rebuilt = reconstructPostwarIndustryWaterGrantOriginals(
      originalData(f.waterOriginal),
      [transportGrant(f.grant)],
    );
    expect(rebuilt.commandSources).toEqual([
      {
        commandFingerprint: f.grant.command.fingerprint,
        source: f.waterOriginal.source,
      },
    ]);
    expect(rebuilt.source.originals).toContainEqual({
      kind: 'WATER_RIGHT_COMMIT',
      reference: f.grant.events[0]!.eventId,
      rawSha256: sha(f.grant.events[0]!.canonicalPayload),
    });
    expect(rebuilt.source.originals).toContainEqual({
      kind: 'WATER_SERVICE_WORK_SOURCE',
      reference: f.waterOriginal.serviceWorkSourceRef,
      rawSha256: f.waterOriginal.serviceWorkSourceRawSha256,
    });
    expect(
      f.waterOriginal.source.originals.some(
        (pin) => pin.kind === 'WATER_RIGHT_COMMIT',
      ),
    ).toBe(false);
    // Full real Core ledger/run/grant/work/pay/power fold, using small complete
    // pages. No mock state or synthetic right is substituted.
    const replay = f.replay(
      f.frames,
      fixtureOriginal(rebuilt, f.waterFinal.paymentFrames),
      f.powerWithPayment,
      2,
    );
    expect(
      readIndustryFirstDayWaterExecutionState(
        replay.result.industryWaterState!,
        sha,
      ).registeredRights,
    ).toHaveLength(1);
    expect(
      reconstructPostwarIndustryWaterGrantOriginals(rebuilt, [
        transportGrant(f.grant),
      ]),
    ).toEqual(rebuilt);
    expect(
      rebuilt.source.originals.some(
        (pin) => pin.kind === 'WATER_CURRENT_PROTECTED_SET',
      ),
    ).toBe(false);
  });
  it('does not convert an absent grant or unrelated RUN into an authoritative right', () => {
    const f = createIndustryWaterExecutionFixture();
    expect(
      reconstructPostwarIndustryWaterGrantOriginals(
        originalData(f.waterOriginal),
        [],
      ),
    ).toEqual(originalData(f.waterOriginal));
    const other = {
      ...originalData(f.waterOriginal),
      source: { ...f.waterOriginal.source, runId: 'OTHER_RUN' },
    };
    expect(
      reconstructPostwarIndustryWaterGrantOriginals(other, [
        transportGrant(f.grant),
      ]),
    ).toBe(other);
  });
  it('rejects another immutable source, changed original and a non-COMMITTED receipt', () => {
    const f = createIndustryWaterExecutionFixture();
    const changed = {
      ...originalData(f.waterOriginal),
      source: {
        ...f.waterOriginal.source,
        originals: [
          ...f.waterOriginal.source.originals,
          { kind: 'EXTRA', reference: 'BAD', rawSha256: '0'.repeat(64) },
        ],
      },
    };
    expect(() =>
      reconstructPostwarIndustryWaterGrantOriginals(changed, [
        transportGrant(f.grant),
      ]),
    ).toThrow('EXACT_IMMUTABLE_GRANT_SOURCE_SNAPSHOT_REQUIRED');
    expect(() =>
      reconstructPostwarIndustryWaterGrantOriginals(
        originalData(f.waterOriginal),
        [
          {
            ...transportGrant(f.grant),
            receipt: {
              ...transportGrant(f.grant).receipt,
              outcome: 'REJECTED',
            },
          } as never,
        ],
      ),
    ).toThrow('EXACT_COMMITTED_ZERO_JOURNAL_GRANT_REQUIRED');
    const conflicting = {
      ...originalData(f.waterOriginal),
      source: { ...f.waterOriginal.source, sourceRawSha256: '0'.repeat(64) },
    };
    expect(() =>
      reconstructPostwarIndustryWaterGrantOriginals(conflicting, [
        transportGrant(f.grant),
      ]),
    ).toThrow('EXACT_HISTORICAL_SOURCE_REQUIRED');
  });
});

/** TEST_ONLY RPC transport around genuine Core frames, not native SQL proof. */
function deliveryEvidence(
  f: ReturnType<typeof createIndustryWaterExecutionFixture>,
) {
  return {
    grant_pin: {
      kind: 'WATER_RIGHT_COMMIT',
      reference: f.grant.events[0]!.eventId,
      rawSha256: sha(f.grant.events[0]!.canonicalPayload),
    },
    power_pins: [
      {
        kind: 'POWER_DELIVERY',
        reference: f.powerDelivery.events[0]!.eventId,
        rawSha256: sha(f.powerDelivery.events[0]!.canonicalPayload),
      },
    ],
    work_source: {
      facilityId: f.waterOriginal.serviceFacilityId,
      runId: f.waterOriginal.serviceRunId,
      sourceRef: f.waterOriginal.serviceWorkSourceRef,
      sourceRawSha256: f.waterOriginal.serviceWorkSourceRawSha256,
    },
    protected_claims: [],
    from_ticks: '0',
  };
}
function evidenceTx(
  rows: readonly Record<string, unknown>[],
  calls: unknown[][] = [],
): SqlExecutor {
  return {
    async query<Row extends object>(
      statement: string,
      parameters?: readonly unknown[],
    ) {
      calls.push([statement, parameters]);
      return { rowCount: rows.length, rows: rows as readonly Row[] };
    },
  };
}

describe('actual water evidence RPC transport and same-command replay source', () => {
  it('binds actual grant, service, power and explicitly empty current claims without changing old GRANT source', async () => {
    const f = createIndustryWaterExecutionFixture(),
      command = transportCommand(f.waterCommand),
      calls: unknown[][] = [];
    const original = reconstructPostwarIndustryWaterGrantOriginals(
      originalData(f.waterOriginal),
      [transportGrant(f.grant)],
    );
    const water = await readPostwarIndustryWaterCommandOriginalFrom(
      evidenceTx([deliveryEvidence(f)], calls),
      { original, command, beforeHead: f.beforeWater.head },
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]![0]).toBe(POSTWAR_WATER_COMMAND_EVIDENCE_QUERY);
    expect(calls[0]![1]).toEqual([
      command.worldId,
      command.countryId,
      water.source.facilityId,
      water.source.runId,
      '10',
      '11',
      '72000',
      f.waterPaid.work.events[0]!.fingerprint,
      C.canonicalSerialize([f.powerDelivery.events[0]!.fingerprint]),
    ]);
    const before = f.replay(
      f.frames,
      fixtureOriginal(water, f.waterFinal.paymentFrames),
      f.powerWithPayment,
      2,
    );
    expect(
      readIndustryFirstDayWaterCommandSource(
        before.result.industryWaterState!,
        f.waterCommand,
        sha,
      ),
    ).toEqual(water.source);
    const committed = f.commit(
      f.waterDraft(before, f.waterCommand, water.source),
    );
    const after = f.replay(
      [...f.frames, committed],
      fixtureOriginal(water, f.waterFinal.paymentFrames),
      f.powerWithPayment,
      2,
    );
    expect(
      readIndustryFirstDayWaterExecutionState(
        after.result.industryWaterState!,
        sha,
      ).committedDeliveryEventFingerprints,
    ).toEqual([committed.events[0]!.fingerprint]);
    const reconstructed = await readPostwarIndustryWaterCommandOriginalFrom(
      evidenceTx([deliveryEvidence(f)]),
      {
        original,
        command,
        beforeHead: f.beforeWater.head,
        expectedSourceFingerprint: JSON.parse(
          committed.events[0]!.canonicalPayload,
        ).sourceFingerprint,
      },
    );
    expect(reconstructed).toEqual(water);
  });
  it('refuses missing/null claims, missing grant row, foreign service and an earlier head instead of accepting empty data', async () => {
    const f = createIndustryWaterExecutionFixture(),
      command = transportCommand(f.waterCommand),
      input = {
        original: originalData(f.waterOriginal),
        command,
        beforeHead: f.beforeWater.head,
      };
    await expect(
      readPostwarIndustryWaterCommandOriginalFrom(evidenceTx([]), input),
    ).rejects.toThrow('COMPLETE_CURRENT_WATER_EVIDENCE_ROW_REQUIRED');
    await expect(
      readPostwarIndustryWaterCommandOriginalFrom(
        evidenceTx([{ ...deliveryEvidence(f), protected_claims: null }]),
        input,
      ),
    ).rejects.toThrow('COMPLETE_BOUNDED_CURRENT_PROTECTED_CLAIMS_REQUIRED');
    await expect(
      readPostwarIndustryWaterCommandOriginalFrom(
        evidenceTx([
          {
            ...deliveryEvidence(f),
            work_source: {
              ...deliveryEvidence(f).work_source,
              facilityId: 'FOREIGN_FACILITY',
            },
          },
        ]),
        input,
      ),
    ).rejects.toThrow('EXACT_CURRENT_WATER_SERVICE_WORK_ORIGINAL_REQUIRED');
    await expect(
      readPostwarIndustryWaterCommandOriginalFrom(
        evidenceTx([deliveryEvidence(f)]),
        { ...input, beforeHead: { worldVersion: '9', eventSequence: '10' } },
      ),
    ).rejects.toThrow('EXACT_DELIVERY_COMMAND_AND_BEFORE_HEAD_REQUIRED');
    await expect(
      readPostwarIndustryWaterCommandOriginalFrom(
        evidenceTx([deliveryEvidence(f)]),
        { ...input, expectedSourceFingerprint: 'sha256:' + '0'.repeat(64) },
      ),
    ).rejects.toThrow('HISTORICAL_DELIVERY_SOURCE_FINGERPRINT_CHANGED');
    expect(() =>
      readIndustryFirstDayWaterCommandSource(
        f.beforeWater.result.industryWaterState!,
        f.waterCommand,
        sha,
      ),
    ).toThrow('EXACT_INSTALLED_WATER_COMMAND_SNAPSHOT_REQUIRED');
  });
  it('compares the complete protected set and preserves the maximum exact reservation for duplicate overlapping origins', async () => {
    const f = createIndustryWaterExecutionFixture(),
      raw = JSON.parse(f.waterCommand.canonicalPayload);
    const claim = {
      claimRef: 'PRIOR_HIGH_PRIORITY_TEST_ONLY',
      sourceRegionId: 'visual-territory-02-R1',
      rawReserved: { numerator: '2', denominator: '1', unit: 'm3' },
    };
    const command = transportCommand(
      f.command(
        'WATER_PROTECTED_TEST_ONLY',
        f.waterCommand.commandType,
        '10',
        '72000',
        {
          ...raw,
          operation: { ...raw.operation, additionalProtectedClaims: [claim] },
        },
      ),
    );
    const evidence = {
      ...deliveryEvidence(f),
      protected_claims: [
        { ...claim, rawReserved: { ...claim.rawReserved, numerator: '1' } },
        claim,
      ],
    };
    const result = await readPostwarIndustryWaterCommandOriginalFrom(
      evidenceTx([evidence]),
      {
        original: originalData(f.waterOriginal),
        command,
        beforeHead: f.beforeWater.head,
      },
    );
    expect(
      result.source.originals.filter(
        (p) => p.kind === 'WATER_CURRENT_PROTECTED_SET',
      ),
    ).toHaveLength(1);
    await expect(
      readPostwarIndustryWaterCommandOriginalFrom(evidenceTx([evidence]), {
        original: originalData(f.waterOriginal),
        command: transportCommand(f.waterCommand),
        beforeHead: f.beforeWater.head,
      }),
    ).rejects.toThrow('COMMAND_MUST_MATCH_ACTUAL_CURRENT_PROTECTED_CLAIMS');
    await expect(
      readPostwarIndustryWaterCommandOriginalFrom(
        evidenceTx([
          {
            ...evidence,
            protected_claims: [
              claim,
              { ...claim, sourceRegionId: 'visual-territory-03-R1' },
            ],
          },
        ]),
        {
          original: originalData(f.waterOriginal),
          command,
          beforeHead: f.beforeWater.head,
        },
      ),
    ).rejects.toThrow('IMMUTABLE_PROTECTED_CLAIM_REGION_REQUIRED');
  });
});
