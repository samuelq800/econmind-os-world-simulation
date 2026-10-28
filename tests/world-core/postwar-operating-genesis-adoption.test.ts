/** TEST_ONLY mechanism fixtures. No official economic adoption, authority key,
 * publication, payment, actual enqueue, Clock, World reset or production DB. */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  canonicalSerialize,
  createOpeningSource,
  createOpeningSeed,
  createFinancialAccount,
  CURRENT_REPLAY_BINDING,
  OPENING_SOURCE_SCHEMA_VERSION,
  OPENING_SEED_SCHEMA_VERSION,
  openingSourceId,
  openingSeedId,
  worldId,
  countryId,
  legalEntityId,
  financialAccountId,
  financialOpeningBatchId,
  financialOpeningLegId,
  Money,
  rebuildV08LedgersFromLineage,
  isValidatedOpeningSeed,
  type FinancialOpeningBatch,
} from '@econmind/core';
import {
  POSTWAR_OPERATING_USER_RECEIPT,
  POSTWAR_SELECTED_SOURCE_PINS,
  adoptPostwarOperatingGenesis,
  readPostwarNewWorldScopeFrom,
  readPostwarOperatingGenesisFromSeed,
  isPostwarOperatingGenesisAdoption,
  preparePostwarOperatingGenesisFromFinancialSupplement,
  requirePostwarSha256OpeningSeed,
  type PostwarOperatingGenesisCarrier,
  type PostwarOperatingGenesisFacts,
  type PostwarNewWorldScope,
} from '../../apps/world-worker/src/preparation/postwar-operating-genesis-adoption.js';
import type { FinancialSupplementAdoption } from '../../apps/world-worker/src/preparation/owner-non-host-source-adoption.js';
import type { FormalFinancialCandidate } from '../../apps/world-worker/src/preparation/formal-financial-opening-producer.js';
import type { OpeningCanonicalSeedAssemblyV2 } from '../../apps/world-worker/src/preparation/opening-canonical-seed-bridge.js';
import type { SqlExecutor } from '../../apps/world-worker/src/persistence/sql-database.js';
const sha = (bytes: string) => createHash('sha256').update(bytes).digest('hex');
const wid = 'WORLD_TEST_ONLY_POSTWAR_GENESIS_V1';
const copy = <T>(value: T): T => JSON.parse(canonicalSerialize(value)) as T;
const data = (name: string) =>
  readFile(
    new URL(
      `../../artifacts/world-balanced-candidate-v1/data/${name}.json`,
      import.meta.url,
    ),
    'utf8',
  );
const db = new PGlite();
const executor: SqlExecutor = {
  async query<Row extends object>(
    sql: string,
    parameters: readonly unknown[] = [],
  ) {
    const result = await db.query(sql, [...parameters]);
    return { rows: result.rows as Row[], rowCount: result.rows.length };
  },
};
let scope: PostwarNewWorldScope;
let fixture: Awaited<ReturnType<typeof buildFixture>>;
async function observe(id = wid) {
  await db.exec('begin isolation level repeatable read read only');
  try {
    return await readPostwarNewWorldScopeFrom(executor, id);
  } finally {
    await db.exec('rollback');
  }
}
beforeAll(async () => {
  await db.exec(
    'create schema world_v2; create table world_v2.world_head(world_id text primary key); create table world_v2.opening_seed(world_id text primary key)',
  );
  scope = await observe();
  fixture = await buildFixture();
}, 30_000);
afterAll(async () => {
  await db.close();
});
async function buildFixture() {
  const selectedSource = {
    regionsBytes: await data('regions'),
    countriesBytes: await data('countries'),
    employmentBytes: await data('employment'),
    regionMappingBytes: await readFile(
      new URL(
        '../../config/postwar-genesis/region-mapping.v1.json',
        import.meta.url,
      ),
      'utf8',
    ),
    selectionBytes: await readFile(
      new URL('../../status/world-data-selection.json', import.meta.url),
      'utf8',
    ),
  };
  const regions = JSON.parse(selectedSource.regionsBytes) as {
    id: string;
    countryId: string;
    initial: {
      population: number;
      workingAge: number;
      labourForce: number;
      households: number;
      housingUnits: number;
    };
  }[];
  const countries = JSON.parse(selectedSource.countriesBytes) as {
    id: string;
    number: string;
  }[];
  const employment = JSON.parse(selectedSource.employmentBytes) as {
    countryId: string;
    employed: number;
  }[];
  const facts: {
    -readonly [
      K in keyof PostwarOperatingGenesisFacts
    ]: PostwarOperatingGenesisFacts[K] extends readonly (infer R)[]
      ? R[]
      : never;
  } = {
    regions: [],
    people: [],
    positions: [],
    services: [],
    housing: [],
    funding: [],
    obligations: [],
    events: [],
  };
  const source = createOpeningSource(
    {
      schemaVersion: OPENING_SOURCE_SCHEMA_VERSION,
      sourceId: openingSourceId('SOURCE_TEST_ONLY_FINANCIAL'),
      sourceKind: 'DOCUMENTED_ASSUMPTION',
      locator: 'fixture://TEST_ONLY/postwar-financial',
      sourceVersion: 'TEST_ONLY',
      payload: { mechanismOnly: true },
    },
    sha,
  );
  const batches: FinancialOpeningBatch[] = [];
  const remaining = new Map(
    employment.map((e) => [e.countryId, BigInt(e.employed)]),
  );
  for (const country of countries) {
    const cid = `COUNTRY_${country.number}`,
      payer = `ENTITY_GOVERNMENT_${country.number}`,
      amount = BigInt(
        employment.find((e) => e.countryId === country.id)!.employed,
      );
    const cash = createFinancialAccount({
      worldId: worldId(wid),
      accountId: financialAccountId(`ACCOUNT_CASH_${country.number}`),
      countryId: countryId(cid),
      ownerId: legalEntityId(payer),
      accountClass: 'CASH',
      currency: 'GCU',
      claimId: null,
      counterpartyEntityId: null,
    });
    const equity = createFinancialAccount({
      ...cash,
      accountId: financialAccountId(`ACCOUNT_EQUITY_${country.number}`),
      accountClass: 'EQUITY',
    });
    const debit = financialOpeningLegId(`LEG_CASH_${country.number}`),
      credit = financialOpeningLegId(`LEG_EQUITY_${country.number}`);
    batches.push({
      batchId: financialOpeningBatchId(`BATCH_${country.number}`),
      sourceId: source.sourceId,
      settlementCurrency: 'GCU',
      legs: [
        {
          legId: debit,
          account: cash,
          direction: 'DEBIT',
          amount: Money.from((amount * 2n).toString(), 'GCU'),
          counterpartLegId: credit,
        },
        {
          legId: credit,
          account: equity,
          direction: 'CREDIT',
          amount: Money.from((amount * 2n).toString(), 'GCU'),
          counterpartLegId: debit,
        },
      ],
    });
    facts.funding.push({
      fundingId: `FUND_${country.number}`,
      accountId: cash.accountId,
      countryId: cid,
      payerEntityId: payer,
      currency: 'GCU',
      ceilingAmount: amount.toString(),
    });
  }
  for (const [i, r] of regions.entries()) {
    const country = countries.find((c) => c.id === r.countryId)!,
      cid = `COUNTRY_${country.number}`,
      rid = r.id,
      prefix = `R${i}`,
      available = remaining.get(r.countryId)!,
      lf = BigInt(r.initial.labourForce),
      employed = available < lf ? available : lf;
    remaining.set(r.countryId, available - employed);
    facts.regions.push({ regionId: rid, countryId: cid });
    let cursor = 0n;
    const add = (
      suffix: string,
      count: bigint,
      workingAge: boolean,
      labourForce: boolean,
      activity: PostwarOperatingGenesisFacts['people'][number]['activity'],
    ) => {
      const start = cursor;
      if (count > 0n)
        facts.people.push({
          cohortId: prefix + suffix,
          regionId: rid,
          startOrdinal: start.toString(),
          count: count.toString(),
          workingAge,
          labourForce,
          activity,
        });
      cursor += count;
      return start;
    };
    const employedStart = add('E', employed, true, true, 'EMPLOYED');
    add('U', lf - employed, true, true, 'UNEMPLOYED');
    add(
      'N',
      BigInt(r.initial.workingAge) - lf,
      true,
      false,
      'OUTSIDE_LABOUR_FORCE',
    );
    add('S', 1n, false, false, 'STUDENT');
    add(
      'D',
      BigInt(r.initial.population) - BigInt(r.initial.workingAge) - 1n,
      false,
      false,
      'DEPENDENT',
    );
    if (employed > 0n) {
      facts.positions.push({
        positionId: prefix + 'JOB',
        regionId: rid,
        employerId: `ENTITY_GOVERNMENT_${country.number}`,
        sector: 'TEST_ONLY_MECHANISM_EMPLOYMENT',
        cohortId: prefix + 'E',
        startOrdinal: employedStart.toString(),
        filledCount: employed.toString(),
        requestedCount: employed.toString(),
        wageObligationId: prefix + 'WAGE',
      });
      facts.obligations.push({
        obligationId: prefix + 'WAGE',
        regionId: rid,
        kind: 'WAGE',
        payerEntityId: `ENTITY_GOVERNMENT_${country.number}`,
        payeeEntityId: `ENTITY_HOUSEHOLDS_${country.number}`,
        currency: 'GCU',
        unitAmount: '1',
        units: employed.toString(),
        amount: employed.toString(),
        periodDays: '365',
        dueSimDay: '365',
        fundingId: `FUND_${country.number}`,
        state: 'OPEN_UNPAID',
      });
      facts.events.push({
        eventId: prefix + 'WAGE_DUE',
        obligationId: prefix + 'WAGE',
        dueSimDay: '365',
        state: 'INITIAL_OPEN',
      });
    }
    for (const kind of ['SCHOOL', 'MEDICAL', 'POLICE', 'WELFARE'] as const)
      facts.services.push({
        serviceId: prefix + kind,
        regionId: rid,
        kind,
        cohortIds: [prefix + (kind === 'MEDICAL' ? 'D' : 'S')],
        demandCount: '1',
        allocatedCount: '0',
        unallocatedCount: '1',
        capacityCount: '0',
        capacityBounds: [
          { reference: 'TEST_ONLY_UNFUNDED_CAPACITY', count: '0' },
        ],
        staffing: [],
        obligationIds: [],
      });
    facts.housing.push({
      housingCohortId: prefix + 'H',
      regionId: rid,
      startHouseholdOrdinal: '0',
      households: String(r.initial.households),
      occupiedUnits: String(r.initial.households),
      tenure: 'OWNER_OCCUPIED',
      tenantEntityId: `ENTITY_HOUSEHOLDS_${country.number}`,
      landlordEntityId: null,
      rentObligationId: null,
      rentRuleReference: null,
      rentState: 'NOT_RENTAL',
    });
  }
  const policyBytes = canonicalSerialize({
    schemaVersion: 'TEST_ONLY_POLICY_NOT_FORMAL_SOURCE',
    mechanismOnly: true,
    rules: [
      'preserve actual population and E/U',
      'future unpaid wages',
      'explicit unserved service demand',
    ],
  });
  const outputBytes = canonicalSerialize(facts);
  const carrier: PostwarOperatingGenesisCarrier = {
    schemaVersion: 'postwar-operating-genesis-v1',
    provenanceKind: 'GENERATED_POLICY',
    genesisVersion: 'TEST_ONLY_V1',
    worldId: wid,
    openingSimDay: '0',
    policyReceipt: POSTWAR_OPERATING_USER_RECEIPT,
    policyDocumentId: 'POLICY',
    outputDocumentId: 'OUTPUT',
    sourcePins: POSTWAR_SELECTED_SOURCE_PINS,
    selectedSource,
    facts,
    documents: [
      {
        documentId: 'POLICY',
        path: 'generated/TEST_ONLY/policy.json',
        bytes: policyBytes,
        sha256: sha(policyBytes),
        provenanceKind: 'GENERATED_POLICY',
      },
      {
        documentId: 'OUTPUT',
        path: 'generated/TEST_ONLY/output.json',
        bytes: outputBytes,
        sha256: sha(outputBytes),
        provenanceKind: 'GENERATED_POLICY',
      },
    ],
  };
  const baselineSeed = createOpeningSeed(
    {
      schemaVersion: OPENING_SEED_SCHEMA_VERSION,
      seedId: openingSeedId('SEED_TEST_ONLY_POSTWAR_V1'),
      worldId: worldId(wid),
      openingWorldVersion: '0',
      replayBinding: CURRENT_REPLAY_BINDING,
      sources: [source],
      inventoryEntries: [],
      financialBatches: batches,
    },
    sha,
  );
  return { carrier, baselineSeed };
}
function adopt(carrier = fixture.carrier, newWorldScope = scope) {
  return adoptPostwarOperatingGenesis({
    carrier,
    baselineSeed: fixture.baselineSeed,
    sourceId: 'SOURCE_POSTWAR_TEST_ONLY',
    newWorldScope,
  });
}
function altered(change: (facts: PostwarOperatingGenesisFacts) => void) {
  const carrier = copy(fixture.carrier);
  change(carrier.facts);
  const output = carrier.documents.find(
    (d) => d.documentId === carrier.outputDocumentId,
  )!;
  Object.assign(output, {
    bytes: canonicalSerialize(carrier.facts),
    sha256: sha(canonicalSerialize(carrier.facts)),
  });
  return carrier;
}
describe('versioned postwar operating source adoption and canonical seed consumer', () => {
  it('keeps eligible applicants distinct from enrolled students and medical episodes distinct from people', () => {
    const applicants = altered((f) => {
      for (const person of f.people)
        if (person.activity === 'STUDENT')
          Object.assign(person, { activity: 'DEPENDENT' });
      for (const school of f.services)
        if (school.kind === 'SCHOOL')
          Object.assign(school, { populationUse: 'ELIGIBLE_SUBSET' });
    });
    expect(adopt(applicants).blockers).toEqual([]);
    const episodes = altered((f) => {
      const service = f.services.find((s) => s.kind === 'MEDICAL')!;
      const person = f.people.find((p) => p.cohortId === service.cohortIds[0])!;
      const count = (BigInt(person.count) + 1n).toString();
      Object.assign(service, {
        measureUnit: 'EPISODE',
        populationUse: 'ELIGIBLE_SUBSET',
        populationCount: '1',
        demandCount: count,
        unallocatedCount: count,
      });
    });
    const result = adopt(episodes);
    expect(result.blockers).toEqual([]);
    expect(
      readPostwarOperatingGenesisFromSeed(result.seed).facts.people,
    ).toEqual(fixture.carrier.facts.people);
    const missingPopulation = altered((f) =>
      Object.assign(
        f.services.find((s) => s.kind === 'MEDICAL')!,
        { measureUnit: 'EPISODE' },
      ),
    );
    expect(adopt(missingPopulation).blockers[0]?.code).toBe(
      'SERVICE_POPULATION_SUBSET_REQUIRED',
    );
  });
  it('does not treat an arbitrary positive ASSET account as a liquid TGA or deposit claim', () => {
    const seed = createOpeningSeed(
      {
        schemaVersion: OPENING_SEED_SCHEMA_VERSION,
        seedId: fixture.baselineSeed.seedId,
        worldId: fixture.baselineSeed.worldId,
        openingWorldVersion: '0',
        replayBinding: fixture.baselineSeed.replayBinding,
        sources: fixture.baselineSeed.sources,
        inventoryEntries: fixture.baselineSeed.inventoryEntries,
        financialBatches: fixture.baselineSeed.financialBatches.map(
          (batch) => ({
            ...batch,
            legs: batch.legs.map((leg) => ({
              ...leg,
              account:
                leg.account.accountClass === 'CASH'
                  ? createFinancialAccount({
                      ...leg.account,
                      accountClass: 'ASSET',
                    })
                  : leg.account,
            })),
          }),
        ),
      },
      sha,
    );
    const result = adoptPostwarOperatingGenesis({
      carrier: fixture.carrier,
      baselineSeed: seed,
      sourceId: 'SOURCE_POSTWAR_TEST_ONLY',
      newWorldScope: scope,
    });
    expect(result.seed).toBeNull();
    expect(result.blockers[0]?.code).toBe(
      'FUNDING_NOT_ACTUAL_LIQUID_SEED_BALANCE',
    );
  });
  it('accepts a legitimate regional zero while rejecting the all-zero service shortcut', () => {
    const localZero = altered((f) =>
      Object.assign(f.services[0]!, {
        demandCount: '0',
        unallocatedCount: '0',
      }),
    );
    expect(adopt(localZero).blockers).toEqual([]);
    const allZero = altered((f) => {
      for (const service of f.services)
        if (service.kind === 'SCHOOL')
          Object.assign(service, { demandCount: '0', unallocatedCount: '0' });
    });
    expect(adopt(allZero).blockers[0]?.code).toBe(
      'EMPTY_SERVICE_GENESIS_SHORTCUT',
    );
  });
  it('rejects reused payroll funding and staff capacity even when each individual record fits its local ceiling', () => {
    const wages = altered((f) => {
      const position = f.positions[0]!,
        wage = f.obligations.find(
          (o) => o.obligationId === position.wageObligationId,
        )!;
      const half = BigInt(position.filledCount) / 2n;
      expect(BigInt(position.filledCount) % 2n).toBe(0n);
      (f.positions as unknown[]).push({
        ...position,
        positionId: 'SECOND_HALF_JOB',
        startOrdinal: (BigInt(position.startOrdinal) + half).toString(),
        filledCount: half.toString(),
        requestedCount: half.toString(),
      });
      Object.assign(position, {
        filledCount: half.toString(),
        requestedCount: half.toString(),
      });
      Object.assign(wage, { units: half.toString(), amount: half.toString() });
    });
    expect(adopt(wages).blockers[0]?.code).toBe(
      'WAGE_OBLIGATION_REUSED_FOR_MULTIPLE_JOBS',
    );
    const staff = altered((f) => {
      const p = f.positions[0]!;
      for (const kind of ['SCHOOL', 'MEDICAL']) {
        const s = f.services.find(
          (service) => service.regionId === p.regionId && service.kind === kind,
        )!;
        Object.assign(s, {
          capacityCount: '20000000',
          capacityBounds: [
            { reference: 'TEST_ONLY_CAPACITY', count: '20000000' },
          ],
          staffing: [{ positionId: p.positionId, unitsPerStaff: '1' }],
        });
      }
    });
    expect(adopt(staff).blockers[0]?.code).toBe(
      'STAFF_CAPACITY_DOUBLE_ALLOCATED',
    );
  });
  it('actually validates 122 regions, preserves 70-country E/U and money, attaches/consumes one canonical source, and deterministically reruns without payments or enqueue', () => {
    const result = adopt();
    expect(result.blockers).toEqual([]);
    expect(result.status).toBe('PROJECT_ADOPTED_NOT_ADMITTED');
    expect(isPostwarOperatingGenesisAdoption(result)).toBe(true);
    expect(isPostwarOperatingGenesisAdoption(copy(result))).toBe(false);
    const view = readPostwarOperatingGenesisFromSeed(result.seed);
    expect(view.facts.regions).toHaveLength(122);
    expect(
      view.facts.regions
        .map((r) => r.countryId)
        .filter((v, i, a) => a.indexOf(v) === i),
    ).toHaveLength(70);
    expect(result.seed!.fingerprint).not.toBe(fixture.baselineSeed.fingerprint);
    expect(result.seed!.financialBatches).toEqual(
      fixture.baselineSeed.financialBatches,
    );
    expect(result.seed!.inventoryEntries).toEqual(
      fixture.baselineSeed.inventoryEntries,
    );
    expect(
      rebuildV08LedgersFromLineage({ seed: result.seed!, sha256Hex: sha })
        .financial.positions,
    ).toEqual(
      rebuildV08LedgersFromLineage({
        seed: fixture.baselineSeed,
        sha256Hex: sha,
      }).financial.positions,
    );
    expect(view.facts.obligations.every((o) => o.state === 'OPEN_UNPAID')).toBe(
      true,
    );
    expect(adopt().seed!.fingerprint).toBe(result.seed!.fingerprint);
    expect(result.admissionAllowed).toBe(false);
    expect(result.activationAllowed).toBe(false);
  });
  it.each([
    [
      'population overlap',
      (f: PostwarOperatingGenesisFacts) =>
        Object.assign(f.people[1]!, { startOrdinal: '0' }),
      'POPULATION_PARTITION_GAP_OR_OVERLAP',
    ],
    [
      'double employment',
      (f: PostwarOperatingGenesisFacts) =>
        Object.assign(f.positions[0]!, {
          filledCount: (BigInt(f.positions[0]!.filledCount) + 1n).toString(),
        }),
      'WORKER_DOUBLE_ALLOCATION',
    ],
    [
      'source employment changed',
      (f: PostwarOperatingGenesisFacts) => {
        const p = f.people.find((c) => c.activity === 'UNEMPLOYED')!;
        Object.assign(p, { activity: 'EMPLOYED' });
      },
      'EMPLOYMENT_PARTITION_MISMATCH',
    ],
    [
      'housing overlap',
      (f: PostwarOperatingGenesisFacts) =>
        Object.assign(f.housing[0]!, { startHouseholdOrdinal: '1' }),
      'HOUSEHOLD_PARTITION_GAP_OR_OVERLAP',
    ],
    [
      'unstaffed school',
      (f: PostwarOperatingGenesisFacts) => {
        const s = f.services[0]!;
        Object.assign(s, {
          capacityCount: '1',
          capacityBounds: [{ reference: 'fabricated', count: '1' }],
        });
      },
      'UNSTAFFED_SERVICE_CAPACITY',
    ],
    [
      'unfunded obligations',
      (f: PostwarOperatingGenesisFacts) =>
        Object.assign(f.funding[0]!, { ceilingAmount: '0' }),
      'PERIOD_FUNDS_INSUFFICIENT',
    ],
    [
      'duplicate due task',
      (f: PostwarOperatingGenesisFacts) =>
        (f.events as unknown[]).push({
          ...f.events[0],
          eventId: 'DUPLICATE_TASK',
        }),
      'EVENT_QUEUE_DUPLICATE_OR_BINDING_MISMATCH',
    ],
    [
      'paid history',
      (f: PostwarOperatingGenesisFacts) =>
        Object.assign(f.obligations[0]!, { state: 'PAID' }),
      'OBLIGATION_STATE_OR_PARTIES_INVALID',
    ],
  ] as const)(
    'rejects %s using facts even when document hashes are recomputed',
    (_name, change, expected) => {
      const result = adopt(altered(change));
      expect(result.seed).toBeNull();
      expect(result.blockers[0]?.code).toBe(expected);
    },
  );
  it('rejects document/receipt/source drift and serialized/request-supplied new-world approval', () => {
    const changed = copy(fixture.carrier);
    Object.assign(changed.documents[0]!, { bytes: 'tampered' });
    expect(adopt(changed).blockers[0]?.code).toBe(
      'GENERATED_DOCUMENT_HASH_MISMATCH',
    );
    const receipt = copy(fixture.carrier);
    Object.assign(receipt.policyReceipt, { reference: 'CALLER_APPROVED' });
    expect(adopt(receipt).blockers[0]?.code).toBe('USER_RECEIPT_MISMATCH');
    const source = copy(fixture.carrier);
    Object.assign(source.selectedSource, { regionsBytes: '[]' });
    expect(adopt(source).blockers[0]?.code).toBe(
      'SELECTED_SOURCE_BYTES_MISMATCH',
    );
    expect(adopt(fixture.carrier, copy(scope)).blockers[0]?.code).toBe(
      'REAL_NEW_WORLD_SOURCE_OBSERVATION_REQUIRED',
    );
  });
  it('uses actual source reads to reject existing Worlds and unstable transactions', async () => {
    await expect(readPostwarNewWorldScopeFrom(executor, wid)).rejects.toThrow(
      'POSTWAR_STABLE_READ_ONLY_SOURCE_REQUIRED',
    );
    await db.query('insert into world_v2.world_head values($1)', [
      'WORLD_ALREADY_EXISTS',
    ]);
    await expect(observe('WORLD_ALREADY_EXISTS')).rejects.toThrow(
      'POSTWAR_EXISTING_WORLD_CANNOT_BE_RESET',
    );
  });
  it('does not turn an absent/structural financial V2 adoption proof into a seed', () => {
    const result = preparePostwarOperatingGenesisFromFinancialSupplement({
      carrier: fixture.carrier,
      assembly: {} as OpeningCanonicalSeedAssemblyV2,
      proof: {} as FinancialSupplementAdoption,
      candidate: {} as FormalFinancialCandidate,
      sourceId: 'SOURCE_POSTWAR_TEST_ONLY',
      newWorldScope: scope,
    });
    expect(result.seed).toBeNull();
    expect(result.blockers[0]?.field).toContain(
      'GENUINE_FINANCIAL_ADOPTION_REQUIRED',
    );
  });
  it('the fixed seed consumer rejects corrupted seed bytes and refuses duplicate source attachment', () => {
    const result = adopt(),
      tampered = copy(result.seed!);
    Object.assign(tampered.sources.at(-1)!, { canonicalPayload: '{}' });
    expect(() => readPostwarOperatingGenesisFromSeed(tampered)).toThrow();
    const duplicate = adoptPostwarOperatingGenesis({
      carrier: fixture.carrier,
      baselineSeed: result.seed!,
      sourceId: 'SOURCE_DUPLICATE',
      newWorldScope: scope,
    });
    expect(duplicate.blockers[0]?.code).toBe(
      'OPERATING_SOURCE_ALREADY_ATTACHED',
    );
  });
  it('reuses only genuine immutable Core seeds and still verifies copied, frozen-DTO and proxy inputs before a cache hit', () => {
    const seed = adopt().seed!;
    expect(isValidatedOpeningSeed(seed)).toBe(true);
    expect(Object.isFrozen(seed)).toBe(true);
    const view = readPostwarOperatingGenesisFromSeed(seed);
    expect(Reflect.set(seed, 'worldId', 'WORLD_FORGED')).toBe(false);
    expect(Reflect.set(seed.sources[0]!, 'canonicalPayload', '{}')).toBe(false);
    expect(readPostwarOperatingGenesisFromSeed(seed)).toBe(view);
    const dto = copy(seed);
    expect(isValidatedOpeningSeed(dto)).toBe(false);
    expect(readPostwarOperatingGenesisFromSeed(dto)).toEqual(view);
    expect(
      readPostwarOperatingGenesisFromSeed(Object.freeze(copy(seed))),
    ).toEqual(view);
    const proxy = new Proxy(seed, {});
    expect(isValidatedOpeningSeed(proxy)).toBe(false);
    expect(() => readPostwarOperatingGenesisFromSeed(proxy)).toThrow('Proxy');
    const altered = copy(seed);
    Object.assign(altered.sources[0]!, { canonicalPayload: '{}' });
    expect(() =>
      readPostwarOperatingGenesisFromSeed(Object.freeze(altered)),
    ).toThrow();
    expect(() =>
      readPostwarOperatingGenesisFromSeed({
        ...seed,
        fingerprint: 'sha256:' + '0'.repeat(64),
      }),
    ).toThrow();
    const wrongDigestSeed = createOpeningSeed(
      { ...seed, seedId: openingSeedId('SEED_WRONG_INJECTED_DIGEST') },
      () => seed.fingerprint.slice('sha256:'.length),
    );
    expect(isValidatedOpeningSeed(wrongDigestSeed)).toBe(true);
    expect(() => readPostwarOperatingGenesisFromSeed(wrongDigestSeed)).toThrow(
      'CORE_SEED_HASH_BINDING_MISMATCH',
    );
    const originalSource = seed.sources[0]!;
    const wrongSourceDigest = createOpeningSource(
      {
        schemaVersion: originalSource.schemaVersion,
        sourceId: originalSource.sourceId,
        sourceKind: originalSource.sourceKind,
        locator: originalSource.locator,
        sourceVersion: originalSource.sourceVersion,
        payload: JSON.parse(originalSource.canonicalPayload),
      },
      () => '0'.repeat(64),
    );
    const nestedWrongDigestSeed = createOpeningSeed(
      {
        ...seed,
        sources: [wrongSourceDigest, ...seed.sources.slice(1)],
      },
      sha,
    );
    expect(isValidatedOpeningSeed(nestedWrongDigestSeed)).toBe(true);
    expect(() =>
      readPostwarOperatingGenesisFromSeed(nestedWrongDigestSeed),
    ).toThrow('CORE_SOURCE_HASH_BINDING_MISMATCH');
  });
  it('reuses assembly seeds only after real outer/source SHA checks and fully parses detached DTOs', () => {
    const seed = fixture.baselineSeed;
    expect(requirePostwarSha256OpeningSeed(seed)).toBe(seed);
    const copied = requirePostwarSha256OpeningSeed(copy(seed));
    expect(copied).toEqual(seed);
    expect(copied).not.toBe(seed);
    const wrongOuter = createOpeningSeed(
      { ...seed, seedId: openingSeedId('SEED_BAD_ASSEMBLY_DIGEST') },
      () => seed.fingerprint.slice(7),
    );
    expect(() => requirePostwarSha256OpeningSeed(wrongOuter)).toThrow(
      'CORE_SEED_HASH_BINDING_MISMATCH',
    );
    const original = seed.sources[0]!;
    const wrongSource = createOpeningSource(
      { ...original, payload: JSON.parse(original.canonicalPayload) },
      () => '0'.repeat(64),
    );
    const nested = createOpeningSeed(
      { ...seed, sources: [wrongSource, ...seed.sources.slice(1)] },
      sha,
    );
    expect(() => requirePostwarSha256OpeningSeed(nested)).toThrow(
      'CORE_SOURCE_HASH_BINDING_MISMATCH',
    );
    const detached = copy(seed);
    Object.assign(detached.sources[0]!, { canonicalPayload: '{}' });
    expect(() =>
      requirePostwarSha256OpeningSeed(Object.freeze(detached)),
    ).toThrow();
  });
});
