import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CURRENT_REPLAY_BINDING,
  Money,
  canonicalSerialize,
  canonicalHashInput,
  canonicalSha256,
  createInventoryAccount,
  createFinancialAccount,
  worldId,
  countryId,
  commodityId,
  inventoryBatchId,
  inventoryLocationId,
  financialAccountId,
  financialClaimId,
  legalEntityId,
  parseOpeningSeed,
  rebuildV08LedgersFromLineage,
  type FinancialAccount,
} from '@econmind/core';
import {
  FIXED_OPENING_PROPOSAL_E,
  OPENING_ECONOMIC_DECISION_SCHEMA,
  OPENING_FINANCE_FIELDS,
  parseOpeningEconomicDecision,
  type OpeningEconomicDecisionV1,
  type OpeningFinanceValues,
  type OpeningProvenanceV1,
  type TrustedOpeningDecisionInputs,
} from '../../apps/world-worker/src/preparation/opening-economic-decision.js';
import {
  openingCountrySeedAssemblyFingerprint,
  prepareOpeningCanonicalSeed,
  type OpeningCanonicalSeedAssembly,
  type OpeningCountrySeedAssembly,
} from '../../apps/world-worker/src/preparation/opening-canonical-seed-bridge.js';

// Real frozen source; all World/owner/allocations/backing/legs below are INERT
// mechanism fixtures, never actual human economic adoption or opening evidence.
const mappingBytes = readFileSync(
  new URL(
    '../../docs/reports/world-connection/C_OFFICIAL_WORLD_OPENING_MAPPING.json',
    import.meta.url,
  ),
  'utf8',
);
const mapping = JSON.parse(mappingBytes) as {
  records: {
    finance: { coreCountryId: string; values: Record<string, string> }[];
    stocks: {
      coreCountryId: string;
      commodityId: string;
      unit: string;
      available: string;
      proposedInventoryEntryId: string;
      proposedBatchId: string;
      proposedInventoryLocationId: string;
    }[];
  };
};
const reference = `git:${'a'.repeat(40)}:status/decisions.json#/opening_economics/INERT_BRIDGE_TEST`;
const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');
const fingerprint = (v: unknown) => canonicalSha256(canonicalHashInput(v), sha);
interface Fixture {
  decision: OpeningEconomicDecisionV1;
  trusted: TrustedOpeningDecisionInputs;
  assembly: OpeningCanonicalSeedAssembly;
}

function adopt(f: Fixture): Fixture {
  const intent = parseOpeningEconomicDecision({
    ...f.decision,
    ownerAdoption: null,
  }).intentFingerprint;
  const record = {
    schemaVersion: 'opening-owner-adoption-record-v1',
    decision: 'ADOPT',
    ownerIdentity: 'INERT_NOT_A_REAL_HUMAN_APPROVAL',
    adoptedAtReal: '2026-10-07T00:00:00.000Z',
    effectiveScope: f.decision.effectiveScope,
    proposalSha256: FIXED_OPENING_PROPOSAL_E.proposalSha256,
    intentFingerprint: intent,
  };
  return {
    ...f,
    decision: {
      ...f.decision,
      ownerAdoption: { reference, recordFingerprint: fingerprint(record) },
    },
    trusted: { ...f.trusted, ownerRecords: [{ reference, record }] },
  };
}
function bindAssemblies(f: Fixture): Fixture {
  const old = f.decision.provenance.filter(
    (p) => !p.ref.startsWith('ADOPTED_ASSEMBLY_'),
  );
  const nodes = f.assembly.countries.map((c) => ({
    ref: c.adoptionRef,
    kind: 'DOMAIN_ADOPTED' as const,
    value: openingCountrySeedAssemblyFingerprint(f.assembly, c),
    inputRefs: OPENING_FINANCE_FIELDS.map(
      (field) =>
        f.decision.countries.find((d) => d.countryId === c.countryId)!
          .fieldProvenance[field]!,
    ),
    rule: 'EXPLICIT_OWNER_VALUE' as const,
    ownerRecordRef: reference,
    source: null,
  }));
  return adopt({
    ...f,
    decision: { ...f.decision, provenance: [...old, ...nodes] },
  });
}
function fixture(): Fixture {
  const provenance: OpeningProvenanceV1[] = [],
    countries: OpeningEconomicDecisionV1['countries'][number][] = [],
    assemblies: OpeningCountrySeedAssembly[] = [];
  const finance: TrustedOpeningDecisionInputs['source']['finance'][number][] =
    [];
  const world = worldId('WORLD_INERT_BRIDGE_TEST');
  for (const [index, row] of mapping.records.finance.entries()) {
    const cid = row.coreCountryId,
      nn = cid.slice(-2),
      values = Object.fromEntries(
        OPENING_FINANCE_FIELDS.map((f) => [f, row.values[f]!]),
      ) as unknown as OpeningFinanceValues;
    const roster = {
      operator: `ENTITY_OPERATOR_${nn}`,
      government: `ENTITY_GOVERNMENT_${nn}`,
      households: `ENTITY_HOUSEHOLDS_${nn}`,
      bank: `ENTITY_BANK_${nn}`,
      centralBank: `ENTITY_CENTRAL_BANK_${nn}`,
    };
    const sourceRefs = Object.fromEntries(
      OPENING_FINANCE_FIELDS.map((field, i) => {
        const ref = `SOURCE_${nn}_${i}`;
        provenance.push({
          ref,
          kind: 'SOURCE_IMMUTABLE',
          value: values[field],
          inputRefs: [],
          rule: null,
          ownerRecordRef: null,
          source: {
            locator: 'artifacts/world-balanced-candidate-v1/data/finance.json',
            sha256:
              '4f30d7dd43aa2190604d4fb73c776a8d4aaa263653dc783def6f7c2c5cc80805',
            pointer: `/${index}/${field}`,
          },
        });
        return [field, ref];
      }),
    );
    const adopted = (
      id: string,
      value: string,
      field = 'treasuryCentralBankBalance',
    ) => {
      const ref = `ADOPTED_${nn}_${id}`;
      provenance.push({
        ref,
        kind: 'OWNER_ADOPTED_VALUE',
        value,
        inputRefs: [sourceRefs[field]!],
        rule: 'EXPLICIT_OWNER_VALUE',
        ownerRecordRef: reference,
        source: null,
      });
      return ref;
    };
    const reserveId = `CLAIM_RESERVE_${nn}`,
      reserveAsset = `BANK_RESERVE_${nn}`,
      reserveLiab = `CB_RESERVE_${nn}`;
    const treasury = adopted('TREASURY', values.treasuryCentralBankBalance),
      cb = adopted('CB', '0'),
      reserve = adopted(
        'RESERVE',
        values.bankReserveAssets,
        'bankReserveAssets',
      ),
      backing = adopted(
        'BACKING',
        values.bankReserveAssets,
        'bankReserveAssets',
      );
    countries.push({
      countryId: cid,
      decisionStatus: 'OWNER_ADOPTION_REQUESTED',
      sourceFinance: values,
      legalEntities: {
        treasury: roster.government,
        centralBank: roster.centralBank,
        bank: roster.bank,
      },
      fundsModel: 'INDEPENDENT_GENESIS_POOLS',
      treasuryOpeningBalance: values.treasuryCentralBankBalance,
      centralBankOpeningBalance: '0',
      reserveClaim: {
        claimId: reserveId,
        amount: values.bankReserveAssets,
        assetAccountId: reserveAsset,
        liabilityAccountId: reserveLiab,
        assetOwnerId: roster.bank,
        liabilityOwnerId: roster.centralBank,
        provenanceRef: reserve,
      },
      treasuryClaim: null,
      centralBankPositions: [
        {
          accountId: `CB_POOL_${nn}`,
          accountClass: 'ASSET',
          purpose: 'GENESIS_POOL',
          amount: '0',
          claimId: null,
          counterpartyEntityId: null,
          provenanceRef: cb,
        },
        {
          accountId: reserveLiab,
          accountClass: 'LIABILITY',
          purpose: 'RESERVE_CLAIM',
          amount: values.bankReserveAssets,
          claimId: reserveId,
          counterpartyEntityId: roster.bank,
          provenanceRef: reserve,
        },
        {
          accountId: `CB_BACKING_${nn}`,
          accountClass: 'ASSET',
          purpose: 'EXPLICIT_ADOPTED_POSITION',
          amount: values.bankReserveAssets,
          claimId: null,
          counterpartyEntityId: null,
          provenanceRef: backing,
        },
      ],
      fieldProvenance: {
        ...sourceRefs,
        treasuryOpeningBalance: treasury,
        centralBankOpeningBalance: cb,
      },
    });
    finance.push({ countryId: cid, sourceRowPointer: `/${index}`, values });
    const account = (
      id: string,
      owner: string,
      kind: FinancialAccount['accountClass'],
      claim: string | null = null,
      cp: string | null = null,
    ) =>
      createFinancialAccount({
        worldId: world,
        countryId: countryId(cid),
        accountId: financialAccountId(`${id}_${nn}`),
        ownerId: legalEntityId(owner),
        accountClass: kind,
        currency: 'GCU',
        claimId: claim === null ? null : financialClaimId(`${claim}_${nn}`),
        counterpartyEntityId: cp === null ? null : legalEntityId(cp),
      });
    const leg = (
      id: string,
      owner: string,
      kind: FinancialAccount['accountClass'],
      amount: string,
      direction: 'DEBIT' | 'CREDIT',
      other: string,
      claim: string | null = null,
      cp: string | null = null,
    ) => ({
      legId: `LEG_${id}_${nn}`,
      account: account(id, owner, kind, claim, cp),
      direction,
      amount: { amount, currency: 'GCU' },
      counterpartLegId: `LEG_${other}_${nn}`,
    });
    const E = Money.from(values.bankReserveAssets, 'GCU')
      .subtract(
        Money.from(values.householdBankDeposits, 'GCU').add(
          Money.from(values.businessBankDeposits, 'GCU'),
        ),
      )
      .toCanonicalValue().amount;
    assemblies.push({
      countryId: cid,
      adoptionRef: `ADOPTED_ASSEMBLY_${nn}`,
      roster,
      inventoryEntries: mapping.records.stocks
        .filter(
          (s) =>
            s.coreCountryId === cid &&
            !Money.from(s.available, 'GCU').amount.isZero(),
        )
        .map((s) => ({
          entryId: s.proposedInventoryEntryId,
          account: createInventoryAccount({
            worldId: world,
            countryId: countryId(cid),
            commodityId: commodityId(s.commodityId),
            batchId: inventoryBatchId(s.proposedBatchId),
            unit: s.unit,
            physicalLocationId: inventoryLocationId(
              s.proposedInventoryLocationId,
            ),
            bucket: 'AVAILABLE',
            reservationId: null,
            shipmentId: null,
            economicRecognitionId: null,
            titleHolderId: legalEntityId(roster.operator),
            riskBearerId: legalEntityId(roster.operator),
          }),
          quantity: { amount: s.available, unit: s.unit },
        })),
      financialBatch: {
        batchId: `BATCH_INERT_${nn}`,
        settlementCurrency: 'GCU',
        legs: [
          leg(
            'BANK_RESERVE',
            roster.bank,
            'ASSET',
            values.bankReserveAssets,
            'DEBIT',
            'CB_RESERVE',
            'CLAIM_RESERVE',
            roster.centralBank,
          ),
          leg(
            'CB_RESERVE',
            roster.centralBank,
            'LIABILITY',
            values.bankReserveAssets,
            'CREDIT',
            'BANK_RESERVE',
            'CLAIM_RESERVE',
            roster.bank,
          ),
          leg(
            'HOUSE_DEPOSIT',
            roster.households,
            'ASSET',
            values.householdBankDeposits,
            'DEBIT',
            'BANK_HOUSE',
            'CLAIM_HOUSE',
            roster.bank,
          ),
          leg(
            'BANK_HOUSE',
            roster.bank,
            'LIABILITY',
            values.householdBankDeposits,
            'CREDIT',
            'HOUSE_DEPOSIT',
            'CLAIM_HOUSE',
            roster.households,
          ),
          leg(
            'BUSINESS_DEPOSIT',
            roster.operator,
            'ASSET',
            values.businessBankDeposits,
            'DEBIT',
            'BANK_BUSINESS',
            'CLAIM_BUSINESS',
            roster.bank,
          ),
          leg(
            'BANK_BUSINESS',
            roster.bank,
            'LIABILITY',
            values.businessBankDeposits,
            'CREDIT',
            'BUSINESS_DEPOSIT',
            'CLAIM_BUSINESS',
            roster.operator,
          ),
          leg('BANK_EQUITY', roster.bank, 'EQUITY', E, 'CREDIT', 'CB_BACKING'),
          leg(
            'CB_BACKING',
            roster.centralBank,
            'ASSET',
            values.bankReserveAssets,
            'DEBIT',
            'BANK_EQUITY',
          ),
          leg(
            'HOUSE_FUNDING',
            roster.households,
            'EQUITY',
            values.householdBankDeposits,
            'CREDIT',
            'HOUSE_DEPOSIT',
          ),
          leg(
            'BUSINESS_FUNDING',
            roster.operator,
            'EQUITY',
            values.businessBankDeposits,
            'CREDIT',
            'BUSINESS_DEPOSIT',
          ),
          leg(
            'TREASURY_POOL',
            roster.government,
            'ASSET',
            values.treasuryCentralBankBalance,
            'DEBIT',
            'TREASURY_FUNDING',
          ),
          leg(
            'TREASURY_FUNDING',
            roster.government,
            'EQUITY',
            values.treasuryCentralBankBalance,
            'CREDIT',
            'TREASURY_POOL',
          ),
        ],
      },
    });
  }
  const f: Fixture = {
    decision: {
      schemaVersion: OPENING_ECONOMIC_DECISION_SCHEMA,
      decisionVersion: 'INERT_BRIDGE_DECISION',
      proposal: FIXED_OPENING_PROPOSAL_E,
      sourceMutationAllowed: false,
      effectiveScope: {
        worldId: world,
        modelVersion: CURRENT_REPLAY_BINDING.modelVersion,
        orchestratorVersion: 'INERT_ORCHESTRATOR',
        sourcePackageId: 'BALANCED_2026_09_28_V1',
        sourceChecksumsSha256:
          '88dd44478f97d2e8893a4f11b3aaf96e256bdb13248aca0d08f097fabe10d315',
      },
      rules: {
        currency: 'EXACT_1_TO_1_GCU',
        legalOwnership: 'E_FIXED_ROSTER_TITLE_RISK',
        bankReconciliation: 'E_COMPONENT_ANCHOR',
        reserve: 'BANK_ASSET_CB_LIABILITY_SAME_CLAIM',
        transformationVersion: 'INERT_COMPONENT_V1',
      },
      ownerAdoption: null,
      countries,
      provenance,
    },
    trusted: {
      source: {
        sourcePackageId: 'BALANCED_2026_09_28_V1',
        sourceChecksumsSha256:
          '88dd44478f97d2e8893a4f11b3aaf96e256bdb13248aca0d08f097fabe10d315',
        financeSha256:
          '4f30d7dd43aa2190604d4fb73c776a8d4aaa263653dc783def6f7c2c5cc80805',
        finance,
      },
      ownerRecords: [],
    },
    assembly: {
      schemaVersion: 'opening-canonical-seed-assembly-v1',
      seedId: 'SEED_INERT_BRIDGE',
      sourceId: 'SOURCE_INERT_BRIDGE',
      replayBinding: CURRENT_REPLAY_BINDING,
      orchestratorVersion: 'INERT_ORCHESTRATOR',
      countries: assemblies,
    },
  };
  return bindAssemblies(f);
}
const run = (
  f: Fixture,
  assembly: unknown = f.assembly,
  bytes = mappingBytes,
) =>
  prepareOpeningCanonicalSeed({
    decision: f.decision,
    trusted: f.trusted,
    frozenMappingBytes: bytes,
    assembly,
  });
function changeCountry(
  f: Fixture,
  fn: (c: OpeningCountrySeedAssembly) => OpeningCountrySeedAssembly,
): Fixture {
  return {
    ...f,
    assembly: {
      ...f.assembly,
      countries: f.assembly.countries.map((c, i) => (i === 0 ? fn(c) : c)),
    },
  };
}
const blocked = (r: ReturnType<typeof run>, code: string) => {
  expect(r.status).toBe('BLOCKED');
  expect(r.seed).toBeNull();
  expect(r.activationAllowed).toBe(false);
  expect(r.blockers.some((b) => b.code === code)).toBe(true);
};

describe('source-only decision → existing Core seed bridge', () => {
  it('constructs only an inert NOT_ADMITTED candidate through Core parser and replay', () => {
    const f = fixture(),
      r = run(f);
    expect(r.blockers).toEqual([]);
    expect(r.status).toBe('NOT_ADMITTED');
    expect(r.activationAllowed).toBe(false);
    expect(r.admissionEvaluated).toBe(false);
    expect(r.seed!.inventoryEntries).toHaveLength(619);
    expect(r.seed!.financialBatches).toHaveLength(70);
    expect(
      r
        .seed!.financialBatches.flatMap((b) => b.legs)
        .some((l) => l.account.accountId.startsWith('CB_POOL_')),
    ).toBe(false);
    expect(
      r
        .seed!.financialBatches.flatMap((b) => b.legs)
        .every((l) => l.amount.amount.isPositive()),
    ).toBe(true);
    const raw = JSON.parse(canonicalSerialize(r.seed)) as unknown;
    expect(parseOpeningSeed(raw, sha).fingerprint).toBe(r.seed!.fingerprint);
    const ledgers = rebuildV08LedgersFromLineage({
      seed: r.seed!,
      sha256Hex: sha,
    });
    expect(ledgers.worldVersion).toBe('0');
    const payload = JSON.parse(r.seed!.sources[0]!.canonicalPayload) as {
      originalStockCells: unknown[];
      sourceFinance: TrustedOpeningDecisionInputs['source']['finance'];
    };
    expect(payload.originalStockCells).toHaveLength(840);
    expect(payload.sourceFinance[0]!.values.bankDepositLiabilities).toBe(
      '23398053465.6',
    );
    expect(f.decision.countries[0]!.sourceFinance.bankEquity).toBe(
      '2339805346.56',
    );
  });
  it('Core carries an explicitly adopted Treasury deposit as one claim, without claiming existing admission compatibility', () => {
    const f = fixture(),
      c = f.decision.countries[0]!,
      country = f.assembly.countries[0]!,
      T = c.treasuryOpeningBalance!;
    const backing = Money.from(c.sourceFinance.bankReserveAssets, 'GCU')
      .add(Money.from(T, 'GCU'))
      .toCanonicalValue().amount;
    const claim = 'CLAIM_TREASURY_01',
      cbAccount = 'CB_TREASURY_01',
      cbLeg = 'LEG_CB_TREASURY_01';
    const assembly = changeCountry(f, (s) => ({
      ...s,
      financialBatch: {
        ...s.financialBatch,
        legs: [
          ...s.financialBatch.legs.map((l) =>
            l.account.accountId === 'CB_BACKING_01'
              ? { ...l, amount: { ...l.amount, amount: backing } }
              : l.account.accountId === 'TREASURY_POOL_01'
                ? {
                    ...l,
                    account: {
                      ...l.account,
                      claimId: financialClaimId(claim),
                      counterpartyEntityId: legalEntityId(s.roster.centralBank),
                    },
                    counterpartLegId: cbLeg,
                  }
                : l,
          ),
          {
            legId: cbLeg,
            account: createFinancialAccount({
              worldId: worldId(f.decision.effectiveScope.worldId!),
              countryId: countryId(c.countryId),
              accountId: financialAccountId(cbAccount),
              ownerId: legalEntityId(s.roster.centralBank),
              accountClass: 'LIABILITY',
              currency: 'GCU',
              claimId: financialClaimId(claim),
              counterpartyEntityId: legalEntityId(s.roster.government),
            }),
            direction: 'CREDIT',
            amount: { amount: T, currency: 'GCU' },
            counterpartLegId: 'LEG_TREASURY_POOL_01',
          },
        ],
      },
    }));
    const cbRef = c.fieldProvenance.centralBankOpeningBalance!,
      backingRef = c.centralBankPositions.find(
        (p) => p.accountId === 'CB_BACKING_01',
      )!.provenanceRef;
    const decision: OpeningEconomicDecisionV1 = {
      ...f.decision,
      countries: f.decision.countries.map((d, i) =>
        i === 0
          ? {
              ...d,
              fundsModel: 'TREASURY_DEPOSIT_AT_CB',
              centralBankOpeningBalance: null,
              treasuryClaim: {
                claimId: claim,
                amount: T,
                assetAccountId: 'TREASURY_POOL_01',
                liabilityAccountId: cbAccount,
                assetOwnerId: country.roster.government,
                liabilityOwnerId: country.roster.centralBank,
                provenanceRef: c.fieldProvenance.treasuryOpeningBalance!,
              },
              centralBankPositions: [
                ...d.centralBankPositions
                  .filter((p) => p.purpose !== 'GENESIS_POOL')
                  .map((p) =>
                    p.accountId === 'CB_BACKING_01'
                      ? { ...p, amount: backing }
                      : p,
                  ),
                {
                  accountId: cbAccount,
                  accountClass: 'LIABILITY',
                  purpose: 'TREASURY_CLAIM',
                  amount: T,
                  claimId: claim,
                  counterpartyEntityId: country.roster.government,
                  provenanceRef: c.fieldProvenance.treasuryOpeningBalance!,
                },
              ],
            }
          : d,
      ),
      provenance: f.decision.provenance.map((p) =>
        p.ref === backingRef
          ? { ...p, value: backing }
          : p.ref === cbRef
            ? {
                ...p,
                kind: 'PROPOSAL_ONLY',
                value: null,
                ownerRecordRef: null,
                rule: null,
              }
            : p,
      ),
    };
    const r = run(bindAssemblies({ ...assembly, decision }));
    expect(r.blockers).toEqual([]);
    expect(r.status).toBe('NOT_ADMITTED');
    expect(r.admissionEvaluated).toBe(false);
    expect(
      r.seed!.financialBatches[0]!.legs.filter(
        (l) => l.account.claimId === claim,
      ),
    ).toHaveLength(2);
    expect(mappingBytes).toContain('MERGED_SOURCE_BALANCE_SPLIT_REQUIRED');
  });
  it('keeps official input unresolved with null World, no owner and no assembly', () => {
    const f = fixture();
    const pending = {
      ...f.decision,
      ownerAdoption: null,
      effectiveScope: { ...f.decision.effectiveScope, worldId: null },
      rules: {
        currency: null,
        legalOwnership: null,
        bankReconciliation: null,
        reserve: null,
        transformationVersion: null,
      },
      countries: f.decision.countries.map((c) => ({
        ...c,
        decisionStatus: 'UNRESOLVED_HUMAN_ECONOMIC_INPUT',
        fundsModel: null,
        legalEntities: null,
        treasuryOpeningBalance: null,
        centralBankOpeningBalance: null,
        reserveClaim: null,
        treasuryClaim: null,
        centralBankPositions: [],
      })),
      provenance: f.decision.provenance
        .filter((p) => !p.ref.startsWith('ADOPTED_ASSEMBLY_'))
        .map((p) =>
          p.kind === 'SOURCE_IMMUTABLE'
            ? p
            : {
                ...p,
                kind: 'PROPOSAL_ONLY',
                value: null,
                ownerRecordRef: null,
                rule: null,
              },
        ),
    };
    const r = prepareOpeningCanonicalSeed({
      decision: pending,
      trusted: { ...f.trusted, ownerRecords: [] },
      frozenMappingBytes: mappingBytes,
      assembly: null,
    });
    blocked(r, 'WORLD_ID_BINDING_REQUIRED');
    blocked(r, 'OWNER_ADOPTION_RECORD_MISSING');
    blocked(r, 'CANONICAL_SEED_ASSEMBLY_MISSING');
    expect(new Set(r.blockers.map((b) => b.countryId)).size).toBe(70);
    expect(r.sourceIdentity).toMatchObject({
      mappingBytesVerified: true,
      stockCellCount: '840',
      positiveStockCellCount: '619',
      zeroStockCellCount: '221',
    });
  });
  it('rejects caller approval flags and missing independently loaded records', () => {
    const f = fixture();
    blocked(
      run({ ...f, trusted: { ...f.trusted, ownerRecords: [] } }),
      'TRUSTED_OWNER_RECORD_MISSING_OR_AMBIGUOUS',
    );
    blocked(
      run(f, { ...f.assembly, ownerApproved: true }),
      'ASSEMBLY_SCHEMA_SCOPE_OR_VERSION_INVALID',
    );
  });
  it('requires exact assembly adoption even when A finance decisions validate', () => {
    const f = fixture();
    const changed = changeCountry(f, (c) => ({
      ...c,
      financialBatch: { ...c.financialBatch, batchId: 'CHANGED_BATCH' },
    }));
    blocked(run(changed), 'EXACT_COUNTRY_ASSEMBLY_ADOPTION_MISSING');
  });
  it('rejects changed frozen bytes rather than trusting report labels/hashes', () => {
    blocked(
      run(fixture(), undefined, `${mappingBytes}\n`),
      'FROZEN_MAPPING_INVALID',
    );
  });
  it('does not accept a source subset or relabeled finance pointer', () => {
    const f = fixture();
    blocked(
      run({
        ...f,
        trusted: {
          ...f.trusted,
          source: {
            ...f.trusted.source,
            finance: f.trusted.source.finance.slice(0, 69),
          },
        },
      }),
      'FULL_70_COUNTRY_SCOPE_REQUIRED',
    );
    const finance = f.trusted.source.finance.map((r, i) =>
      i === 0 ? { ...r, sourceRowPointer: '/900' } : r,
    );
    blocked(
      run({
        ...f,
        trusted: { ...f.trusted, source: { ...f.trusted.source, finance } },
      }),
      'FROZEN_FINANCE_LEXEME_MISMATCH',
    );
  });
  it('rejects missing inventory, zero entries and ownership swaps even if re-adopted in a mechanism fixture', () => {
    const f = fixture();
    blocked(
      run(
        bindAssemblies(
          changeCountry(f, (c) => ({
            ...c,
            inventoryEntries: c.inventoryEntries.slice(1),
          })),
        ),
      ),
      'POSITIVE_STOCK_COVERAGE_MISMATCH',
    );
    const zero = changeCountry(f, (c) => ({
      ...c,
      inventoryEntries: c.inventoryEntries.map((e, i) =>
        i === 0 ? { ...e, quantity: { ...e.quantity, amount: '0' } } : e,
      ),
    }));
    blocked(run(bindAssemblies(zero)), 'INVENTORY_SOURCE_OR_RIGHTS_MISMATCH');
    const rights = changeCountry(f, (c) => ({
      ...c,
      inventoryEntries: c.inventoryEntries.map((e, i) =>
        i === 0
          ? {
              ...e,
              account: {
                ...e.account,
                titleHolderId: legalEntityId(c.roster.government),
              },
            }
          : e,
      ),
    }));
    blocked(run(bindAssemblies(rights)), 'INVENTORY_SOURCE_OR_RIGHTS_MISMATCH');
  });
  it('rejects fixed roster replacement despite a matching assembly fingerprint', () => {
    const f = fixture(),
      changed = changeCountry(f, (c) => ({
        ...c,
        roster: { ...c.roster, operator: 'ENTITY_OTHER' },
      }));
    blocked(run(bindAssemblies(changed)), 'FIXED_ROSTER_NOT_ADOPTED');
  });
  it('rejects a missing reciprocal claim leg instead of creating a counterpart', () => {
    const f = fixture(),
      changed = changeCountry(f, (c) => ({
        ...c,
        financialBatch: {
          ...c.financialBatch,
          legs: c.financialBatch.legs.filter(
            (l) => !l.account.accountId.startsWith('CB_RESERVE_'),
          ),
        },
      }));
    blocked(
      run(bindAssemblies(changed)),
      'CLAIM_OPPOSITE_LEGS_MISSING_OR_MISMATCH',
    );
  });
  it('rejects one claim ID shared between countries', () => {
    const f = fixture(),
      changed = {
        ...f,
        assembly: {
          ...f.assembly,
          countries: f.assembly.countries.map((c, i) =>
            i === 1
              ? {
                  ...c,
                  financialBatch: {
                    ...c.financialBatch,
                    legs: c.financialBatch.legs.map((l) =>
                      l.account.claimId === 'CLAIM_HOUSE_02'
                        ? {
                            ...l,
                            account: {
                              ...l.account,
                              claimId: financialClaimId('CLAIM_HOUSE_01'),
                            },
                          }
                        : l,
                    ),
                  },
                }
              : c,
          ),
        },
      };
    blocked(run(bindAssemblies(changed)), 'CLAIM_SHARED_ACROSS_COUNTRIES');
  });
  it('rejects mathematically balanced but source-inconsistent household deposits', () => {
    const f = fixture(),
      changed = changeCountry(f, (c) => ({
        ...c,
        financialBatch: {
          ...c.financialBatch,
          legs: c.financialBatch.legs.map((l) =>
            ['HOUSE_DEPOSIT_01', 'BANK_HOUSE_01', 'HOUSE_FUNDING_01'].includes(
              l.account.accountId,
            )
              ? {
                  ...l,
                  amount: {
                    ...l.amount,
                    amount: Money.from(l.amount.amount, 'GCU')
                      .add(Money.from('1', 'GCU'))
                      .toCanonicalValue().amount,
                  },
                }
              : l,
          ),
        },
      }));
    blocked(
      run(bindAssemblies(changed)),
      'FINANCIAL_POSITION_DECISION_MISMATCH',
    );
  });
  it('rejects unauthorized CB backing/extra plug accounts', () => {
    const f = fixture(),
      changed = changeCountry(f, (c) => ({
        ...c,
        financialBatch: {
          ...c.financialBatch,
          legs: c.financialBatch.legs.map((l) =>
            l.account.accountId === 'CB_BACKING_01'
              ? {
                  ...l,
                  account: {
                    ...l.account,
                    accountId: financialAccountId('CB_PLUG_01'),
                  },
                }
              : l,
          ),
        },
      }));
    blocked(run(bindAssemblies(changed)), 'UNADOPTED_CB_POSITION_OR_BACKING');
  });
  it('rejects stale model/replay and noncanonical JS-number amounts', () => {
    const f = fixture();
    blocked(
      run(f, {
        ...f.assembly,
        replayBinding: { ...f.assembly.replayBinding, modelVersion: 'OTHER' },
      }),
      'ASSEMBLY_SCHEMA_SCOPE_OR_VERSION_INVALID',
    );
    const changed = changeCountry(f, (c) => ({
      ...c,
      financialBatch: {
        ...c.financialBatch,
        legs: c.financialBatch.legs.map((l, i) =>
          i === 0
            ? { ...l, amount: { ...l.amount, amount: 1 as unknown as string } }
            : l,
        ),
      },
    }));
    blocked(run(changed), 'ASSEMBLY_SCHEMA_SCOPE_OR_VERSION_INVALID');
  });
  it('leaves Core opposite-leg rejection authoritative without repairing the batch', () => {
    const f = fixture(),
      changed = changeCountry(f, (c) => ({
        ...c,
        financialBatch: {
          ...c.financialBatch,
          legs: c.financialBatch.legs.map((l) =>
            l.account.accountId === 'TREASURY_POOL_01'
              ? { ...l, counterpartLegId: l.legId }
              : l,
          ),
        },
      }));
    blocked(run(bindAssemblies(changed)), 'CORE_SEED_CONTRACT_REJECTED');
  });
  it('returns deterministic fingerprints across restart and source/country enumeration order', () => {
    const f = fixture(),
      first = run(f),
      restart = run(JSON.parse(canonicalSerialize(f)) as Fixture);
    expect(restart.seed!.fingerprint).toBe(first.seed!.fingerprint);
    const reordered = {
      ...f,
      assembly: {
        ...f.assembly,
        countries: [...f.assembly.countries].reverse(),
      },
      trusted: {
        ...f.trusted,
        source: {
          ...f.trusted.source,
          finance: [...f.trusted.source.finance].reverse(),
        },
      },
    };
    expect(run(reordered).seed!.fingerprint).toBe(first.seed!.fingerprint);
  });
});
