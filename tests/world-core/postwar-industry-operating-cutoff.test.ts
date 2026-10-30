/** TEST_ONLY real Core production. No admitted operating receipts or production approval. */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import * as C from '@econmind/core';
import { canonicalSerialize as fixtureSerialize } from '../../packages/core/src/index.js';
import { createProductionSchemaFixture } from '../support/production-schema-fixture.js';
import { decodeIndustryProductionRow } from '../../apps/world-worker/src/persistence/industry-production-row-decoder.js';
import {
  industryOperatingRequirementsForCandidate,
  createPostwarIndustryOperatingCutoffGuard,
  isPostwarIndustryOperatingCutoffGuard,
} from '../../apps/world-worker/src/persistence/postwar-industry-operating-cutoff.js';
import {
  createPostwarIndustryCurrentSource,
  INDUSTRY_OPERATING_SESSION_QUERY,
} from '../../apps/world-worker/src/persistence/postwar-industry-current-source.js';
import {
  ProtectedIndustryProductionGuard,
  type IndustryProductionCutoffRequest,
} from '../../apps/world-worker/src/persistence/industry-production-source-cutoff.js';
import type { SqlExecutor } from '../../apps/world-worker/src/persistence/sql-database.js';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
function candidate(): IndustryProductionCutoffRequest {
  const fixture = createProductionSchemaFixture(),
    raw = fixture.make();
  function input(v: object) {
    const { canonicalPayload, payloadHash, fingerprint, ...rest } = JSON.parse(
      fixtureSerialize(v),
    ) as Record<string, unknown>;
    void payloadHash;
    void fingerprint;
    return {
      ...rest,
      payload: JSON.parse(String(canonicalPayload)) as unknown,
    };
  }
  const command = C.parseCanonicalCommand(input(raw.command), sha),
    events = raw.transition.events.map((e) =>
      C.parseAuthoritativeEvent(input(e), sha),
    );
  const transition = C.createAuthoritativeTransition({
    command,
    events,
    worldVersionBefore: raw.transition.worldVersionBefore,
    worldVersionAfter: raw.transition.worldVersionAfter,
  });
  const { fingerprint, ...body } = JSON.parse(
    fixtureSerialize(raw.posting),
  ) as Record<string, unknown>;
  const posting = decodeIndustryProductionRow({
    command,
    transition,
    row: {
      canonical_payload: body,
      causation_command_id: command.commandId,
      fingerprint,
    },
    sha256Hex: sha,
  });
  return {
    command,
    transition,
    posting,
    expectedHead: {
      worldVersion: transition.worldVersionBefore,
      eventSequence: (BigInt(events[0]!.sequence) - 1n).toString(),
    },
    fundingBatchId: posting.evidence.operating.payload.fundingBatchId,
    fundingFingerprint: posting.evidence.operating.payload.fundingFingerprint,
    costLegId: posting.evidence.operating.payload.costLegId,
  };
}
describe('Industry operating fixed candidate boundary', () => {
  it('derives eight exact data requirements from actual recalculated Core posting', () => {
    const c = candidate(),
      r = industryOperatingRequirementsForCandidate(c);
    expect(r.requirements).toHaveLength(8);
    expect(
      r.requirements.find((x) => x.kind === 'WORK')!.factCanonicalPayload,
    ).toBe(c.posting.evidence.input.labour.canonicalPayload);
    expect(
      r.requirements.find((x) => x.kind === 'PAID_COST')!.factCanonicalPayload,
    ).toBe(C.canonicalSerialize(c.posting.evidence.operating.payload));
    expect(r.scope.operatorId).toBe(c.posting.evidence.output.titleHolderId);
    expect(r.requirements.some((x) => x.kind === 'WATER_DELIVERY')).toBe(false);
  });
  it('rejects copied posting, mismatched funding and wrong head before SQL', () => {
    const c = candidate();
    expect(() =>
      industryOperatingRequirementsForCandidate({
        ...c,
        posting: { ...c.posting },
      }),
    ).toThrow('GENUINE');
    expect(() =>
      industryOperatingRequirementsForCandidate({
        ...c,
        fundingFingerprint: 'sha256:' + sha('other'),
      }),
    ).toThrow('EXACT');
    expect(() =>
      industryOperatingRequirementsForCandidate({
        ...c,
        expectedHead: { ...c.expectedHead, eventSequence: '0' },
      }),
    ).toThrow('EXACT');
  });
  it('never accepts a callback as protected guard, nor a cloned current-source issuer', () => {
    const source = createPostwarIndustryCurrentSource({
      worldId: 'WORLD_PRODUCTION_TEST',
      countryId: 'COUNTRY_01',
      runtimeReaderRole: 'test_industry_reader',
    });
    expect(() =>
      createPostwarIndustryOperatingCutoffGuard({
        source,
        protectedGuard: {
          assertCurrentFrom: async () => ({}),
        } as unknown as ProtectedIndustryProductionGuard,
      }),
    ).toThrow('FIXED');
    expect(() =>
      createPostwarIndustryOperatingCutoffGuard({
        source: { ...source },
        protectedGuard: Object.create(
          ProtectedIndustryProductionGuard.prototype,
        ) as ProtectedIndustryProductionGuard,
      }),
    ).toThrow('FIXED');
    expect(
      isPostwarIndustryOperatingCutoffGuard({
        assertCurrentFrom: async () => ({}),
      }),
    ).toBe(false);
  });
  it('does not delegate or issue observations when actual receipt originals are absent', async () => {
    // An object with a class prototype does not possess its private fields. Even
    // this cannot bypass the fixed prototype invocation; missing data closes first.
    const c = candidate();
    const source = createPostwarIndustryCurrentSource({
      worldId: c.command.worldId,
      countryId: c.command.countryId,
      runtimeReaderRole: 'test_industry_reader',
    });
    const guard = createPostwarIndustryOperatingCutoffGuard({
      source,
      protectedGuard: Object.create(
        ProtectedIndustryProductionGuard.prototype,
      ) as ProtectedIndustryProductionGuard,
    });
    expect(isPostwarIndustryOperatingCutoffGuard(guard)).toBe(true);
    expect(isPostwarIndustryOperatingCutoffGuard({ ...guard })).toBe(false);
    const tx: SqlExecutor = {
      async query<Row extends object>(q: string) {
        const rows =
          q === INDUSTRY_OPERATING_SESSION_QUERY
            ? [
                {
                  role_name: 'test_industry_reader',
                  rolsuper: false,
                  rolbypassrls: false,
                  rolcreatedb: false,
                  rolcreaterole: false,
                  rolreplication: false,
                  isolation: 'repeatable read',
                  read_only: 'off',
                  backend_pid: '100',
                  virtual_xid: '1/1',
                  reader_member: true,
                  owner_member: false,
                  publisher_member: false,
                },
              ]
            : [
                {
                  original: {
                    worldVersion: c.expectedHead.worldVersion,
                    eventSequence: c.expectedHead.eventSequence,
                    registrationRef: 'TEST_ONLY_REG',
                    documentSha256: sha('{}'),
                    seedFingerprint: 'sha256:' + sha('TEST_ONLY'),
                    admissionRef: 'TEST_ONLY_ADMISSION',
                  },
                  frames: [],
                },
              ];
        return { rows: rows as Row[], rowCount: rows.length };
      },
    };
    // Missing originals reject before the protected path; no mock admission.
    await expect(guard.assertCurrentFrom(tx, c)).rejects.toThrow(
      'ACTUAL_PAYMENT_DATA_PREPARATION_REQUIRED',
    );
  });
});
