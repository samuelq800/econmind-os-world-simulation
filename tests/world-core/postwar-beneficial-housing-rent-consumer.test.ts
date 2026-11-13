/** Real selected 70-country source and private producers; no SQL/host/Clock,
 * production admission, arbitrary balance or model-shaped source callbacks. */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import * as C from '@econmind/core';
import { loadPostwarSourceContext } from '../../apps/world-worker/src/preparation/postwar-source-context.js';
import { preparePostwarSocialServiceGenesis } from '../../apps/world-worker/src/preparation/postwar-social-service-genesis.js';
import { createPostwarPublicSafetyGenesis } from '../../apps/world-worker/src/preparation/postwar-public-safety-genesis.js';
import { preparePostwarLabourGenesis } from '../../apps/world-worker/src/preparation/postwar-labour-genesis.js';
import { createPostwarMonetaryGenesis } from '../../apps/world-worker/src/preparation/postwar-monetary-genesis.js';
import { createPostwarWagePolicy } from '../../apps/world-worker/src/preparation/postwar-wage-policy.js';
import { buildPostwarHousingGenesis } from '../../apps/world-worker/src/preparation/postwar-housing-genesis.js';
import { createPostwarFinancialGenesis } from '../../apps/world-worker/src/preparation/postwar-financial-genesis.js';
import {
  createPostwarHousingRentBindings,
  type PostwarHousingRentBindings,
} from '../../apps/world-worker/src/preparation/postwar-housing-rent-bindings.js';
import { createPostwarBeneficialHousingRentConsumer } from '../../apps/world-worker/src/persistence/postwar-beneficial-housing-rent-consumer.js';

const root = path.resolve(import.meta.dirname, '../..');
const read = (p: string) => readFile(path.join(root, p), 'utf8');
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const worldId = 'WORLD_TEST_ONLY_RENT_CONSUMER';
const seedId = 'SEED_TEST_ONLY_RENT_CONSUMER';
const now = '2026-10-28T00:00:00.000Z';
const due = C.SimTime.fromTicks(
  (1n + BigInt(C.SIMULATION_TICKS_PER_DAY)).toString(),
);
let bindings: PostwarHousingRentBindings;
let consumer: ReturnType<typeof createPostwarBeneficialHousingRentConsumer>;
type Step = C.V08AuthoritativeLedgerTransition;

beforeAll(async () => {
  const context = await loadPostwarSourceContext(root);
  const social = preparePostwarSocialServiceGenesis({
    adoption: context.labourSocial,
    mappingBytes: context.mappingBytes,
    regionsBytes: context.regionsBytes,
    worldId,
    seedId,
  });
  const safety = createPostwarPublicSafetyGenesis({
    worldId,
    seed: seedId,
    policyBytes: await read('config/postwar-genesis/public-safety.v1.json'),
    source: context.source,
    adoption: context.labourSocial,
    mappingBytes: context.mappingBytes,
    countriesBytes: context.countriesBytes,
    regionsBytes: context.regionsBytes,
  });
  const labour = preparePostwarLabourGenesis({
    adoption: context.labourSocial,
    mappingBytes: context.mappingBytes,
    regionsBytes: context.regionsBytes,
    facilitiesBytes: context.facilitiesBytes,
    serviceDemands: [...social.demands, ...safety.demands],
  });
  const monetary = createPostwarMonetaryGenesis({
    source: context.source,
    countriesBytes: context.countriesBytes,
    mappingBytes: context.mappingBytes,
    valueDate: '2026-10-28',
  });
  const wagePolicy = createPostwarWagePolicy({
    policyBytes: await read('config/postwar-genesis/wage-policy.v1.json'),
    adoption: context.labourSocial,
    financeSource: context.source,
    monetaryBindings: monetary.bindings,
    labourPreparation: labour,
  });
  const housing = buildPostwarHousingGenesis({
    sourceBytes: context.sourceBytes,
    ownerDecisionBytes: context.ownerOriginalBytes,
    policyBytes: await read('config/postwar-genesis/housing.v1.json'),
    wagePolicy,
  });
  const financial = createPostwarFinancialGenesis({
    adoption: context.ownerAdoption,
    monetary,
    worldId,
    seedId,
    sourceId: 'SOURCE_TEST_ONLY_RENT_CONSUMER_FINANCIAL_PARENT',
    genesisVersion: 'POSTWAR_OPERATING_20261028_V1',
  });
  bindings = createPostwarHousingRentBindings({ financial, housing });
  consumer = createPostwarBeneficialHousingRentConsumer({ bindings });
}, 120_000);

function command(
  countryId: string,
  history: readonly Step[] = [],
  changes: Record<string, unknown> = {},
) {
  const term = bindings.privateRentTerms.find(
    (t) => t.countryId === countryId,
  )!;
  const quoted = consumer.quote({
    countryId,
    leaseId: term.leaseIds[0]!,
    periodIndex: '0',
    simTime: due,
    history,
  });
  return C.parseCanonicalCommand(
    {
      schemaVersion: C.COMMAND_SCHEMA_VERSION,
      commandType: C.BENEFICIAL_HOUSING_RENT_COMMAND,
      commandId: `COMMAND_TEST_ONLY_RENT_${countryId}`,
      correlationId: `CORRELATION_TEST_ONLY_RENT_${countryId}`,
      worldId,
      countryId,
      expectedWorldVersion: history.length.toString(),
      actorId: 'ACTOR_TEST_ONLY_SOURCE_CONSUMER',
      authSubject: '11111111-1111-4111-8111-111111111111',
      officeId: null,
      idempotencyKey: quoted.idempotencyKey,
      payload: quoted.commandPayload,
      simTime: due.toCanonicalValue(),
      submittedAtReal: now,
      ...changes,
    },
    sha,
  );
}
function consume(c: C.CanonicalCommand, history: readonly Step[] = []) {
  return consumer.consume({ command: c, history, observedAtReal: now });
}

describe('separate genuine 70-country housing source → canonical payment consumer', () => {
  it('refuses copied producers and keeps all initial rent unpaid without enrolling automatic authority', () => {
    expect(() =>
      createPostwarBeneficialHousingRentConsumer({
        bindings: { ...bindings },
      }),
    ).toThrow('GENUINE_SOURCE_PRODUCER_REQUIRED');
    expect(bindings.countries).toHaveLength(70);
    expect(bindings.privateRentTerms).toHaveLength(122);
    expect(bindings.seed.sources).toHaveLength(71);
    expect(
      bindings.countries.every((c) => c.initialRentState.paid.length === 0),
    ).toBe(true);
    expect(consumer.classification).toBe(
      'SEPARATE_SOURCE_FAMILY_NOT_RUNTIME_ADMISSION',
    );
    expect('sourceCommitProtectionPort' in consumer).toBe(false);
    expect('start' in consumer).toBe(false);
    expect(bindings.productionAdmission).toBe(false);
  });
  it('produces the actual non-1LC full-cohort posting, conserving legal HH claims and independently replaying it', () => {
    const c = command('COUNTRY_01');
    const result = consume(c);
    expect(result.outcome).toBe('APPLIED');
    if (!result.step) throw Error('REAL_STEP_REQUIRED');
    expect(result.step.financialPostingBatches).toHaveLength(1);
    const batch = result.step.financialPostingBatches[0]!;
    const term = bindings.privateRentTerms.find(
      (t) => t.locationId === 'REGION_01_E1',
    )!;
    expect(batch.legs).toHaveLength(2);
    expect(batch.legs[0]!.amount.toCanonicalValue().amount).toBe(
      term.firstDayDue,
    );
    expect(term.firstDayDue).toBe('147353468.533808');
    expect(batch.legs[0]!.account.accountId).not.toBe(
      batch.legs[1]!.account.accountId,
    );
    const original = bindings.countries.find(
      (x) => x.countryId === 'COUNTRY_01',
    )!.receipt;
    const before = C.rebuildV08LedgersFromLineage({
      seed: bindings.seed,
      sha256Hex: sha,
    });
    expect(
      C.aggregateBeneficialHousingLiquidClaim(result.financial, original)
        .availableAmount,
    ).toBe(
      C.aggregateBeneficialHousingLiquidClaim(before.financial, original)
        .availableAmount,
    );
    const replay = C.rebuildV08LedgersFromLineage({
      seed: bindings.seed,
      transitions: [result.step],
      sha256Hex: sha,
    });
    expect(C.canonicalSerialize(result.financial)).toBe(
      C.canonicalSerialize(replay.financial),
    );
    expect(result.financial.worldVersion).toBe('1');
    expect(bindings.countries[0]!.initialRentState.paid).toHaveLength(0);
  });
  it('recovers an exact prior command without another posting and rejects reusing its ID with changed intent', () => {
    const c = command('COUNTRY_01');
    const first = consume(c);
    if (!first.step) throw Error('REAL_STEP_REQUIRED');
    const duplicate = consume(c, [first.step]);
    expect(duplicate.outcome).toBe('EXACT_DUPLICATE');
    expect(duplicate.step).toBeNull();
    expect(duplicate.financial.worldVersion).toBe('1');
    const altered = command('COUNTRY_01', [], {
      correlationId: 'CORRELATION_DIFFERENT_INTENT',
    });
    expect(() => consume(altered, [first.step])).toThrow('COMMAND_ID_CONFLICT');
  });
  it('replays both countries at one global head and refuses cross-country originals or stale heads', () => {
    const first = consume(command('COUNTRY_01'));
    if (!first.step) throw Error('REAL_STEP_REQUIRED');
    const second = consume(command('COUNTRY_02', [first.step]), [first.step]);
    expect(second.outcome).toBe('APPLIED');
    expect(second.financial.worldVersion).toBe('2');
    const wrong = command('COUNTRY_01', [], { countryId: 'COUNTRY_02' });
    expect(() => consume(wrong)).toThrow('WRONG_COUNTRY_ORIGINAL');
    const stale = command('COUNTRY_02', [first.step], {
      expectedWorldVersion: '0',
    });
    expect(() => consume(stale, [first.step])).toThrow('STALE_WORLD_HEAD');
  });
  it('refuses undued periods, skipped payments, unknown families and missing historical posting', () => {
    const term = bindings.privateRentTerms[0]!;
    const quote = {
      countryId: term.countryId,
      leaseId: term.leaseIds[0]!,
      periodIndex: '0',
      simTime: due,
      history: [],
    };
    expect(() =>
      consumer.quote({ ...quote, simTime: C.SimTime.fromTicks('0') }),
    ).toThrow('not yet due');
    expect(() => consumer.quote({ ...quote, periodIndex: '1' })).toThrow(
      'already paid or skipped',
    );
    expect(() =>
      consume(command('COUNTRY_01', [], { commandType: 'UNKNOWN_FAMILY_V1' })),
    ).toThrow('UNSUPPORTED_COMMAND_FAMILY');
    const first = consume(command('COUNTRY_01'));
    if (!first.step) throw Error('REAL_STEP_REQUIRED');
    const missing = { ...first.step, financialPostingBatches: [] };
    expect(() => consumer.quote({ ...quote, history: [missing] })).toThrow();
  });
});
