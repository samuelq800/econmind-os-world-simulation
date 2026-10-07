import { createHash } from 'node:crypto';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  Money,
  Quantity,
  isQuantity,
  canonicalSerialize,
} from '@econmind/core';
import {
  OWNER_NON_HOST_PINS,
  NON_HOST_DECISION_CROSSWALK,
  CENTRAL_BANK_OPENING_CATEGORIES,
  loadNonHostOwnerPolicy,
  isLoadedNonHostOwnerPolicy,
  loadOwnerNonHostSourceAdoption,
  produceOwnerNonHostSourceAdoption,
  isOwnerNonHostSourceAdoption,
  createTestOnlyOpeningFx,
  inspectCentralBankHoldingCandidate,
  type OwnerNonHostSourceAdoption,
} from '../../apps/world-worker/src/preparation/owner-non-host-source-adoption.js';

const repositoryRoot = path.resolve(import.meta.dirname, '../..');
// Optional server-source dependency override used only before Root's record merge.
// Default clean-checkout execution resolves the committed portable governance files.
const governanceRoot =
  process.env.ECONMIND_OWNER_GOVERNANCE_ROOT ?? repositoryRoot;
const governanceDir = path.join(
  governanceRoot,
  'docs/governance/owner-inputs/2026-10-07',
);
const ownerFiles = {
  ownerDocumentPath: path.join(
    governanceDir,
    'OWNER_NON_HOST_DECISIONS.original.md',
  ),
  rootReceiptPath: path.join(
    governanceDir,
    'OWNER_NON_HOST_DECISION_RECEIPT.json',
  ),
};
const wid = 'WORLD_TEST_ONLY_NONHOST';
let official: OwnerNonHostSourceAdoption;
beforeAll(async () => {
  official = await loadOwnerNonHostSourceAdoption({
    repositoryRoot,
    ...ownerFiles,
    scope: { environment: 'NON_ACTIVATED_PREPARATION', worldId: null },
  });
});
const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');
const testOnly = () =>
  produceOwnerNonHostSourceAdoption({
    source: official.source,
    ownerPolicy: official.ownerPolicy,
    scope: { environment: 'TEST_ONLY', worldId: wid },
  });
describe('actual fixed source + independently loaded non-host Owner adoption', () => {
  it('loads actual adopted subset receipt and document, not the old proposal as a blanket approval', async () => {
    expect(sha(await readFile(ownerFiles.ownerDocumentPath, 'utf8'))).toBe(
      OWNER_NON_HOST_PINS.documentSha256,
    );
    expect(sha(await readFile(ownerFiles.rootReceiptPath, 'utf8'))).toBe(
      OWNER_NON_HOST_PINS.receiptSha256,
    );
    expect(isLoadedNonHostOwnerPolicy(official.ownerPolicy)).toBe(true);
    expect(official.ownerPolicy.wholeLegacyProposalAdopted).toBe(false);
    expect(official.ownerPolicy.formalWorldId).toBeNull();
    expect(official.ownerPolicy.productionAuthorized).toBe(false);
    expect(
      NON_HOST_DECISION_CROSSWALK.historicalAuditD06BankReconciliation,
    ).toBe('D03.5');
    expect(NON_HOST_DECISION_CROSSWALK.D06).toBe(
      'IDENTITY_SEAT_NPC_NOT_BANK_RECONCILIATION',
    );
    expect(NON_HOST_DECISION_CROSSWALK.D05).toBe('OWNER_EXCLUDED_DEFERRED');
  });
  it('preserves 70 countries, all 490 original lexemes and existing source IDs', () => {
    expect(official.manifest.countries).toHaveLength(70);
    let cells = 0;
    for (const c of official.manifest.countries) {
      const raw = official.trustedSource.finance.find(
        (r) => r.countryId === c.countryId,
      )!;
      expect(c.rawFinance).toEqual(raw.values);
      for (const d of Object.values(c.denominations)) {
        expect(d.rawLexeme).toBe(raw.values[d.field]);
        cells++;
        expect(d.sourcePointer).toBe(raw.sourceRowPointer + '/' + d.field);
        expect(d.gcuEquivalent.currency).toBe('GCU');
        expect(d.localBookValue).toBeNull();
      }
    }
    expect(cells).toBe(490);
    expect(official.manifest.entities).toHaveLength(350);
    expect(
      new Set(official.manifest.entities.map((e) => e.entityId)).size,
    ).toBe(350);
    expect(official.manifest.entities.map((e) => e.entityId)).toEqual(
      official.source.legalEntityProposals.map(
        (r) => r.proposedCoreLegalEntityId,
      ),
    );
    expect(
      official.manifest.entities.every(
        (e) => e.playerId === null && !e.seatGranted && !e.policyNpcEnabled,
      ),
    ).toBe(true);
  });
  it('adopts only opening L/E exact component anchors and preserves original/delta versions', () => {
    let Lchanges = 0,
      Echanges = 0;
    for (const c of official.manifest.countries) {
      const r = c.rawFinance,
        b = c.bankOpening;
      expect(b.adoptedL).toEqual(
        Money.from(r.householdBankDeposits, 'GCU')
          .add(Money.from(r.businessBankDeposits, 'GCU'))
          .toCanonicalValue(),
      );
      expect(b.adoptedE).toEqual(
        Money.from(r.bankReserveAssets, 'GCU')
          .add(Money.from(r.bankLoanAssets, 'GCU'))
          .subtract(Money.from(b.adoptedL.amount, 'GCU'))
          .toCanonicalValue(),
      );
      expect(b.adoptedL.amount).toBe(
        b.originalReport?.expectedDepositLiabilities,
      );
      expect(b.adoptedE.amount).toBe(b.originalReport?.expectedBankEquity);
      if (b.adoptedMinusOriginalL !== '0') Lchanges++;
      if (b.adoptedMinusOriginalE !== '0') Echanges++;
      expect(b.causeOfDifference).toBe('NOT_ASSUMED');
      expect(b.resetRuntimeLiabilitiesOrEquity).toBe(false);
    }
    expect(Lchanges).toBe(56);
    expect(Echanges).toBe(62);
    expect(
      official.manifest.countries[0]?.rawFinance.householdBankDeposits,
    ).toBe('17548540099.199997');
    expect(
      official.manifest.countries[0]?.rawFinance.bankDepositLiabilities,
    ).toBe('23398053465.6');
    expect(official.manifest.countries[0]?.rawFinance.bankEquity).toBe(
      '2339805346.56',
    );
  });
  it('uses full B and full R as same-claim two-sided meanings, never CB assets or two cash pools', () => {
    for (const c of official.manifest.countries) {
      expect(c.treasury.assetHolderId).toBe(c.holderRoster.treasury);
      expect(c.reserve.assetHolderId).toBe(c.holderRoster.bank);
      expect(c.treasury.liabilityIssuerId).toBe(c.holderRoster.centralBank);
      expect(c.reserve.liabilityIssuerId).toBe(c.holderRoster.centralBank);
      expect(c.treasury.gcuEquivalentAmount.amount).toBe(
        Money.from(
          c.rawFinance.treasuryCentralBankBalance,
          'GCU',
        ).toCanonicalValue().amount,
      );
      expect(c.reserve.gcuEquivalentAmount.amount).toBe(
        Money.from(c.rawFinance.bankReserveAssets, 'GCU').toCanonicalValue()
          .amount,
      );
      expect(c.treasury.claimId).toBeNull();
      expect(c.reserve.claimId).toBeNull();
      expect(c.treasury.notCentralBankAssetOrCash).toBe(true);
      expect(
        c.cbInput
          .filter((r) => r.accountClass === 'ASSET')
          .every((r) => r.gcuEquivalentAmount === null),
      ).toBe(true);
    }
  });
  it('reports missing LC/FX by all countries and all seven fields, not default rate 1', () => {
    for (const c of official.manifest.countries) {
      expect(
        official.manifest.gaps.filter(
          (g) =>
            g.countryId === c.countryId &&
            g.code === 'OPENING_FX_SOURCE_MISSING',
        ),
      ).toHaveLength(7);
      expect(
        official.manifest.gaps.filter(
          (g) =>
            g.countryId === c.countryId &&
            g.code === 'OPENING_LC_CODE_SOURCE_MISSING',
        ),
      ).toHaveLength(7);
    }
    expect(
      official.manifest.gaps.some(
        (g) => g.code === 'WORLD_BINDING_NOT_VERIFIED_NO_SEED',
      ),
    ).toBe(true);
    expect(official.inventoryEntries).toHaveLength(0);
    expect(official.seedAdmissionAllowed).toBe(false);
  });
  it('performs FX !=1 exactly once; source GCU value is not renamed LC', () => {
    const fx = createTestOnlyOpeningFx(wid, [
      {
        countryId: 'COUNTRY_01',
        localCurrency: 'AVN',
        localCurrencyPerGcu: '2.5',
        version: 'TEST_ONLY_FX_V1',
        valueDate: 'TEST_ONLY_OPENING_T0',
      },
    ]);
    const result = produceOwnerNonHostSourceAdoption({
      source: official.source,
      ownerPolicy: official.ownerPolicy,
      scope: { environment: 'TEST_ONLY', worldId: wid },
      openingFx: fx,
    });
    const c = result.manifest.countries[0]!;
    expect(c.denominations.treasuryCentralBankBalance.rawLexeme).toBe(
      '46796106931.2',
    );
    expect(c.denominations.treasuryCentralBankBalance.gcuEquivalent).toEqual({
      amount: '46796106931.2',
      currency: 'GCU',
    });
    expect(c.denominations.treasuryCentralBankBalance.localBookValue).toEqual({
      amount: '116990267328',
      currency: 'AVN',
    });
    expect(c.treasury.localAmount).toEqual(
      c.denominations.treasuryCentralBankBalance.localBookValue,
    );
    expect(c.bankOpening.localL).toEqual({
      amount: '58495133663.9999925',
      currency: 'AVN',
    });
    expect(c.denominations.householdBankDeposits.fxAuthority).toBe(
      'TEST_ONLY_NOT_PRODUCTION',
    );
    expect(
      result.manifest.countries[1]?.denominations.bankReserveAssets
        .localBookValue,
    ).toBeNull();
    expect(result.productionAuthorized).toBe(false);
  });
  it('rejects fake policy/source/adoption object clones, production requests and fixture FX in non-test scope', () => {
    expect(() =>
      produceOwnerNonHostSourceAdoption({
        source: official.source,
        ownerPolicy: { ...official.ownerPolicy },
        scope: { environment: 'NON_ACTIVATED_PREPARATION', worldId: null },
      }),
    ).toThrow('UNTRUSTED_OWNER_POLICY');
    expect(() =>
      produceOwnerNonHostSourceAdoption({
        source: { ...official.source },
        ownerPolicy: official.ownerPolicy,
        scope: { environment: 'NON_ACTIVATED_PREPARATION', worldId: null },
      }),
    ).toThrow('FABRICATED_SOURCE');
    expect(isOwnerNonHostSourceAdoption(official)).toBe(true);
    expect(isOwnerNonHostSourceAdoption({ ...official })).toBe(false);
    const fx = createTestOnlyOpeningFx(wid, []);
    expect(() =>
      produceOwnerNonHostSourceAdoption({
        source: official.source,
        ownerPolicy: official.ownerPolicy,
        scope: { environment: 'NON_ACTIVATED_PREPARATION', worldId: null },
        openingFx: fx,
      }),
    ).toThrow('TEST_FX_CANNOT_ENTER_PRODUCTION');
    expect(() =>
      produceOwnerNonHostSourceAdoption({
        source: official.source,
        ownerPolicy: official.ownerPolicy,
        scope: { environment: 'PRODUCTION', worldId: 'WORLD_FORMAL' } as never,
      }),
    ).toThrow('PRODUCTION_EXCLUDED');
  });
  it('materializes actual Core inventory carriers in TEST_ONLY only; zero cells make no entry', () => {
    const r = testOnly();
    expect(r.inventoryEntries).toHaveLength(619);
    expect(r.manifest.stockRights.filter((s) => !s.positive)).toHaveLength(221);
    for (const s of r.manifest.stockRights) {
      const entry = r.inventoryEntries.find(
        (e) => e.entryId === s.inventoryEntryId,
      );
      if (!s.positive) {
        expect(entry).toBeUndefined();
        continue;
      }
      expect(entry?.account.worldId).toBe(wid);
      expect(entry?.account.titleHolderId).toBe(s.titleHolderId);
      expect(entry?.account.riskBearerId).toBe(s.titleHolderId);
      expect(entry?.quantity.toCanonicalValue()).toEqual(
        Quantity.from(s.available, s.unit).toCanonicalValue(),
      );
      expect(isQuantity(entry?.quantity)).toBe(true);
      expect(entry?.account.physicalLocationId).toBe(s.locationId);
    }
    expect(r.productionAuthorized).toBe(false);
    expect(r.seedAdmissionAllowed).toBe(false);
  });
  it('covers actual 10/7/4 CB catalogue without filling unknown zero/asset/capital', () => {
    expect(CENTRAL_BANK_OPENING_CATEGORIES).toHaveLength(21);
    expect(
      CENTRAL_BANK_OPENING_CATEGORIES.filter((c) => c[1] === 'ASSET'),
    ).toHaveLength(10);
    expect(
      CENTRAL_BANK_OPENING_CATEGORIES.filter((c) => c[1] === 'LIABILITY'),
    ).toHaveLength(7);
    expect(
      CENTRAL_BANK_OPENING_CATEGORIES.filter((c) => c[1] === 'EQUITY'),
    ).toHaveLength(4);
    for (const c of official.manifest.countries) {
      expect(c.cbInput).toHaveLength(21);
      expect(
        c.cbInput.filter((p) => p.gcuEquivalentAmount !== null),
      ).toHaveLength(2);
      expect(
        c.cbInput
          .filter((p) => p.accountClass === 'ASSET')
          .every(
            (p) =>
              p.state === 'NOT_ADOPTED_NO_DECLARED_INSTRUMENT' &&
              p.gcuEquivalentAmount === null,
          ),
      ).toBe(true);
      expect(c.centralBankNetWorth.amount).toBeNull();
      expect(c.centralBankNetWorth.state).toBe(
        'SOURCE_MISSING_COMPLETE_REGISTER',
      );
      expect(
        official.manifest.gaps.some(
          (g) =>
            g.countryId === c.countryId &&
            g.code ===
              'CB_OPENING_HOLDING_REGISTER_COMPLETENESS_NOT_ESTABLISHED',
        ),
      ).toBe(true);
      expect(c.prohibitedBackingSubstitutions).toContain('BANK_E');
      expect(c.prohibitedBackingSubstitutions).toContain(
        'PHYSICAL_ASSET_BOOK_VALUE',
      );
    }
  });
  it('distinguishes no holding, declared holding missing fields, and explicitly sourced amount zero', () => {
    const empty = {
      countryId: 'COUNTRY_01',
      category: 'FX_CASH_AND_DEPOSITS' as const,
      declaredInstrument: false,
      holdingId: null,
      amount: null,
      currency: null,
      holderId: null,
      counterpartyId: null,
      counterpartyRequired: true,
      valuationRef: null,
      usableStatus: null,
      sourceRef: null,
    };
    expect(inspectCentralBankHoldingCandidate(empty)).toMatchObject({
      state: 'NO_DECLARED_INSTRUMENT',
      amount: null,
      adoptionAllowed: false,
    });
    expect(
      inspectCentralBankHoldingCandidate({
        ...empty,
        declaredInstrument: true,
        holdingId: 'TEST_HOLDING',
      }),
    ).toMatchObject({
      state: 'SOURCE_MISSING',
      amount: null,
      missingFields: expect.arrayContaining([
        'amount',
        'currency',
        'counterpartyId',
      ]),
    });
    expect(() =>
      inspectCentralBankHoldingCandidate({ ...empty, amount: '0' }),
    ).toThrow('UNDECLARED_HOLDING_HAS_VALUES');
    expect(
      inspectCentralBankHoldingCandidate({
        ...empty,
        declaredInstrument: true,
        holdingId: 'TEST_HOLDING',
        amount: '0',
        currency: 'GCU',
        holderId: 'ENTITY_CENTRAL_BANK_01',
        counterpartyId: 'TEST_CUSTODIAN',
        valuationRef: 'TEST_VALUE_T0',
        usableStatus: 'TEST_ONLY',
        sourceRef: 'TEST_ONLY_EXPLICIT_ZERO',
      }),
    ).toMatchObject({
      state: 'SOURCE_COMPLETE_CANDIDATE_NOT_ADOPTED',
      amount: '0',
      adoptionAllowed: false,
    });
  });
  it('uses actual A parser/inspection with real source; subset record does not self-certify legacy full intent', () => {
    expect(
      official.legacyInspection.candidate.body.rules.bankReconciliation,
    ).toBe('E_COMPONENT_ANCHOR');
    expect(official.legacyInspection.candidate.body.rules.currency).toBe(
      'EXACT_1_TO_1_GCU',
    );
    expect(
      official.legacyInspection.candidate.body.countries.every(
        (c) => c.fundsModel === 'TREASURY_DEPOSIT_AT_CB',
      ),
    ).toBe(true);
    expect(official.legacyOwnerRecords).toEqual([]);
    expect(official.legacyInspection.status).toBe('BLOCKED');
    expect(
      official.legacyInspection.blockers.some(
        (b) => b.code === 'OWNER_ADOPTION_RECORD_MISSING',
      ),
    ).toBe(true);
    expect(official.legacyInspection.openingAdmissionAllowed).toBe(false);
    expect(official.legacyInspection.derivedBank).toHaveLength(0);
  });
  it('is deterministic with unchanged raw source and stable typed output; no ambient clock', () => {
    const again = produceOwnerNonHostSourceAdoption({
      source: official.source,
      ownerPolicy: official.ownerPolicy,
      scope: { environment: 'NON_ACTIVATED_PREPARATION', worldId: null },
    });
    expect(again.manifestFingerprint).toBe(official.manifestFingerprint);
    expect(canonicalSerialize(again.manifest)).toBe(
      canonicalSerialize(official.manifest),
    );
    expect(Object.isFrozen(official.manifest.countries[0]?.denominations)).toBe(
      true,
    );
    expect(official.source.financeOriginals[0]?.bankEquity).toBe(
      '2339805346.56',
    );
  });
  it('rejects fixture FX under wrong World, invalid rate, shared currencies and out-of-range exact result', () => {
    expect(() => createTestOnlyOpeningFx('WORLD_FORMAL', [])).toThrow(
      'TEST_ONLY_WORLD_REQUIRED',
    );
    const row = {
      countryId: 'COUNTRY_01',
      localCurrency: 'AVN',
      localCurrencyPerGcu: '0',
      version: 'TEST_ONLY',
      valueDate: 'TEST_ONLY_T0',
    };
    expect(() => createTestOnlyOpeningFx(wid, [row])).toThrow(
      'FX_RATE_OR_LC_INVALID',
    );
    expect(() =>
      createTestOnlyOpeningFx(wid, [
        { ...row, localCurrencyPerGcu: '1' },
        { ...row, countryId: 'COUNTRY_02', localCurrencyPerGcu: '1' },
      ]),
    ).toThrow('FX_DUPLICATE');
    const fx = createTestOnlyOpeningFx(wid, [
      { ...row, localCurrencyPerGcu: '9'.repeat(120) },
    ]);
    expect(() =>
      produceOwnerNonHostSourceAdoption({
        source: official.source,
        ownerPolicy: official.ownerPolicy,
        scope: { environment: 'TEST_ONLY', worldId: wid },
        openingFx: fx,
      }),
    ).toThrow();
    const small = createTestOnlyOpeningFx(wid, [
      { ...row, localCurrencyPerGcu: '2' },
    ]);
    expect(() =>
      produceOwnerNonHostSourceAdoption({
        source: official.source,
        ownerPolicy: official.ownerPolicy,
        scope: { environment: 'TEST_ONLY', worldId: 'WORLD_TEST_ONLY_OTHER' },
        openingFx: small,
      }),
    ).toThrow('TEST_FX_CANNOT_ENTER_PRODUCTION_OR_WRONG_WORLD');
  });
  it.each(['document', 'receipt'] as const)(
    'rejects source drift, self-declared approval and missing %s files',
    async (kind) => {
      const tmp = await mkdtemp(
        path.join(os.tmpdir(), 'econmind-owner-policy-test-'),
      );
      try {
        const doc = await readFile(ownerFiles.ownerDocumentPath, 'utf8'),
          receipt = await readFile(ownerFiles.rootReceiptPath, 'utf8');
        await writeFile(
          path.join(tmp, 'doc.md'),
          kind === 'document' ? doc + '\n' : doc,
        );
        await writeFile(
          path.join(tmp, 'receipt.json'),
          kind === 'receipt'
            ? JSON.stringify({
                approved: true,
                sha256: OWNER_NON_HOST_PINS.receiptSha256,
              })
            : receipt,
        );
        await expect(
          loadNonHostOwnerPolicy({
            ownerDocumentPath: path.join(tmp, 'doc.md'),
            rootReceiptPath: path.join(tmp, 'receipt.json'),
          }),
        ).rejects.toThrow(
          kind === 'document'
            ? 'OWNER_DOCUMENT_SOURCE_DRIFT'
            : 'OWNER_RECEIPT_SOURCE_DRIFT',
        );
        await expect(
          loadNonHostOwnerPolicy({
            ...ownerFiles,
            rootReceiptPath: path.join(tmp, 'missing.json'),
          }),
        ).rejects.toThrow('OWNER_RECORD_SOURCE_MISSING');
      } finally {
        await rm(tmp, { recursive: true, force: true });
      }
    },
  );
});
