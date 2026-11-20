/** Actual selected 70-country source → SOURCE_CANDIDATE → original producer →
 * actual adoption loader → V2 bridge → canonical seed. No fixture money,
 * signatures, private authority, SQL installation or runtime activation. */
import path from 'node:path';
import { describe, expect, it, beforeAll } from 'vitest';
import {
  Money,
  canonicalDecimal,
  canonicalSerialize,
  rebuildV08LedgersFromLineage,
} from '@econmind/core';
import {
  loadOwnerNonHostSourceAdoption,
  isFinancialSupplementAdoption,
  snapshotFinancialSupplementRegistration,
  loadFinancialSupplementAdoption,
  type OwnerNonHostSourceAdoption,
} from '../../apps/world-worker/src/preparation/owner-non-host-source-adoption.js';
import { createPostwarMonetaryGenesis } from '../../apps/world-worker/src/preparation/postwar-monetary-genesis.js';
import {
  createPostwarFinancialGenesis,
  readPostwarLiquidFundingAccountsFromSeed,
  type PostwarFinancialGenesis,
} from '../../apps/world-worker/src/preparation/postwar-financial-genesis.js';
import { financialInputSha256 } from '../../apps/world-worker/src/preparation/formal-financial-opening-contract.js';
import { openingV2AssemblyIntentFingerprint } from '../../apps/world-worker/src/preparation/opening-canonical-seed-bridge.js';
import { produceFormalFinancialOpening } from '../../apps/world-worker/src/preparation/formal-financial-opening-producer.js';
import { POSTWAR_OPERATING_USER_RECEIPT } from '../../apps/world-worker/src/preparation/postwar-operating-genesis-adoption.js';
import {
  readFile,
  mkdtemp,
  realpath,
  mkdir,
  copyFile,
  writeFile,
  rm,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import {
  OfficialOpeningBundleLoader,
  officialOpeningPublicationSourceSha256,
  type OfficialOpeningPublicationSourceBundleV2,
  type ServerOpeningIncomingManifestV2,
} from '../../apps/world-worker/src/preparation/official-opening-bundle-loader.js';
import { prepareOfficialOpeningBundleCandidate } from '../../apps/world-worker/src/preparation/official-opening-candidate-composition.js';
const root = path.resolve(import.meta.dirname, '../..');
const sha = financialInputSha256;
let parent: OwnerNonHostSourceAdoption;
let actual: PostwarFinancialGenesis;
let create: () => PostwarFinancialGenesis;
beforeAll(async () => {
  parent = await loadOwnerNonHostSourceAdoption({
    repositoryRoot: root,
    ownerDocumentPath: path.join(
      root,
      'docs/governance/owner-inputs/2026-10-07/OWNER_NON_HOST_DECISIONS.original.md',
    ),
    rootReceiptPath: path.join(
      root,
      'docs/governance/owner-inputs/2026-10-07/OWNER_NON_HOST_DECISION_RECEIPT.json',
    ),
    scope: { environment: 'NON_ACTIVATED_PREPARATION', worldId: null },
  });
  const monetary = createPostwarMonetaryGenesis({
    source: parent.source,
    countriesBytes: await readFile(
      path.join(
        root,
        'artifacts/world-balanced-candidate-v1/data/countries.json',
      ),
      'utf8',
    ),
    mappingBytes: await readFile(
      path.join(
        root,
        'docs/reports/world-connection/C_OFFICIAL_WORLD_OPENING_MAPPING.json',
      ),
      'utf8',
    ),
    valueDate: '2026-10-28',
  });
  create = () =>
    createPostwarFinancialGenesis({
      adoption: parent,
      monetary,
      worldId: 'WORLD_POSTWAR_SOURCE_20261028_V1',
      seedId: 'SEED_POSTWAR_SOURCE_20261028_V1',
      sourceId: 'SOURCE_POSTWAR_FINANCIAL_20261028_V1',
      genesisVersion: 'POSTWAR_OPERATING_20261028_V1',
    });
  actual = create();
}, 60_000);
describe('actual postwar financial source and canonical account bindings', () => {
  it('reloads exact generated documents through the genuine pinned V2 loader and original candidate composition', async () => {
    const base = await new OfficialOpeningBundleLoader({
      repositoryRoot: root,
    }).load();
    const stage = await mkdtemp(
      path.join(await realpath(tmpdir()), 'postwar-financial-v2-'),
    );
    try {
      const parentPath = 'docs/governance/owner-inputs/2026-10-07/';
      for (const locator of [
        ...base.validatedFiles.map((f) => f.locator),
        parentPath + 'OWNER_NON_HOST_DECISIONS.original.md',
        parentPath + 'OWNER_NON_HOST_DECISION_RECEIPT.json',
      ]) {
        await mkdir(path.dirname(path.join(stage, locator)), {
          recursive: true,
        });
        await copyFile(path.join(root, locator), path.join(stage, locator));
      }
      const financial: OfficialOpeningPublicationSourceBundleV2['financial'] = {
        inputBytes: canonicalSerialize(actual.contract),
        adoptionReceiptBytes: actual.receiptBytes,
        ownerInstructionBytes: actual.instructionBytes,
        parentOwnerInstructionBytes: await readFile(
          path.join(root, parentPath + 'OWNER_NON_HOST_DECISIONS.original.md'),
          'utf8',
        ),
        parentOwnerReceiptBytes: await readFile(
          path.join(root, parentPath + 'OWNER_NON_HOST_DECISION_RECEIPT.json'),
          'utf8',
        ),
        registeredReference: actual.registration.retainedReference,
        documents: actual.contract.documents.map((d) => ({
          documentId: d.documentId,
          sourcePath: d.sourcePath,
          bytes: d.bytes,
        })),
      };
      const decisionBytes = 'null',
        assemblyBytes = canonicalSerialize(actual.assembly);
      const bundle: OfficialOpeningPublicationSourceBundleV2 = {
        ...base.inputs,
        schemaVersion: 'official-opening-publication-source-v2',
        decisionBytes,
        assemblyBytes,
        ownerRecords: [],
        financial,
      };
      const files = {
        'incoming/decision.json': decisionBytes,
        'incoming/assembly.json': assemblyBytes,
        'incoming/financial/input.json': financial.inputBytes,
        'incoming/financial/adoption.json': actual.receiptBytes,
        'incoming/financial/owner-instruction.md': actual.instructionBytes,
        ...Object.fromEntries(
          financial.documents.map((d) => [d.sourcePath, d.bytes]),
        ),
      };
      for (const [locator, bytes] of Object.entries(files)) {
        await mkdir(path.dirname(path.join(stage, locator)), {
          recursive: true,
        });
        await writeFile(path.join(stage, locator), bytes);
      }
      const identity = (bytes: string) => ({
        sha256: sha(bytes),
        bytes: Buffer.byteLength(bytes),
      });
      const incoming: ServerOpeningIncomingManifestV2 = {
        schemaVersion: 'server-opening-incoming-v2',
        decision: identity(decisionBytes),
        assembly: identity(assemblyBytes),
        ownerRecords: [],
        expectedBundleSha256: officialOpeningPublicationSourceSha256(bundle),
        financial: {
          input: identity(financial.inputBytes),
          adoptionReceipt: identity(actual.receiptBytes),
          ownerInstruction: identity(actual.instructionBytes),
          documents: financial.documents.map((d) => ({
            documentId: d.documentId,
            identity: identity(d.bytes),
          })),
        },
      };
      const loaded = await new OfficialOpeningBundleLoader({
        repositoryRoot: stage,
        incoming,
        financialAdoptionRegistration: actual.registration,
      }).load();
      const candidate = prepareOfficialOpeningBundleCandidate(loaded);
      expect(candidate.rawFinancialResult?.candidate?.fingerprint).toBe(
        actual.candidate.fingerprint,
      );
      expect(candidate.bridgeStatus).toBe(
        'CORE_PARSED_AND_REBUILT_NOT_ADMITTED',
      );
      // Other Office gaps and private runtime admission remain separate facts.
      expect(candidate.admissionAllowed).toBe(false);
      expect(candidate.activationAllowed).toBe(false);
      expect(
        candidate.blockers.some(
          (b) => b.stage === 'financial' || b.stage === 'bridge',
        ),
      ).toBe(false);
    } finally {
      await rm(stage, { recursive: true, force: true });
    }
  }, 30_000);
  it('produces a real full-70-country V2 baseline using SOURCE_CANDIDATE and the existing proof/bridge, preserving source stocks and GCU finance', () => {
    expect(actual.contract.schemaVersion).toBe(
      'formal-financial-opening-input-v2',
    );
    expect(actual.contract.evidenceKind).toBe('SOURCE_CANDIDATE');
    expect(actual.contract.countries).toHaveLength(70);
    expect(isFinancialSupplementAdoption(actual.proof)).toBe(true);
    expect(actual.baselineSeed.inventoryEntries).toHaveLength(619);
    expect(
      actual.baselineSeed.sources.every((s) => s.sourceKind !== 'TEST_FIXTURE'),
    ).toBe(true);
    expect(actual.baselineSeed.sources[0]!.sourceKind).toBe(
      'AUTHORITATIVE_DATASET',
    );
    expect(actual.admissionAllowed).toBe(false);
    expect(actual.activationAllowed).toBe(false);
    const original = produceFormalFinancialOpening({
      adoption: parent,
      contract: actual.contract,
    });
    expect(original.seed).toBeNull();
    expect(original.blockers.map((b) => b.code).sort()).toEqual([
      'FORMAL_WORLD_BINDING_UNRESOLVED',
      'SUPPLEMENTAL_FINANCIAL_SOURCE_ADOPTION_UNRESOLVED',
    ]);
    for (const reconciliation of actual.candidate.reconciliations) {
      const raw = parent.manifest.countries.find(
        (c) => c.countryId === reconciliation.countryId,
      )!.rawFinance;
      expect(reconciliation.original).toEqual(raw);
      for (const denomination of reconciliation.denominations) {
        expect(denomination.gcuEquivalent.amount).toBe(
          Money.from(raw[denomination.field], 'GCU').toCanonicalValue().amount,
        );
        expect(denomination.rawLexeme).toBe(raw[denomination.field]);
        expect(denomination.localBookValue.amount).toBe(
          canonicalDecimal(
            Money.from(raw[denomination.field], 'GCU').amount.times(
              actual.contract.countries.find(
                (c) => c.countryId === reconciliation.countryId,
              )!.openingFx.localCurrencyPerGcu,
            ),
          ),
        );
      }
    }
  });
  it('explicitly declares generated instrument scope rather than observing missing categories as zero; computes genuine negative CB net worth without new assets/cash', () => {
    const register = JSON.parse(
      actual.contract.documents.find(
        (d) => d.documentId === 'POSTWAR_FINANCIAL_REGISTER',
      )!.bytes,
    ) as {
      provenanceKind: string;
      sourceFinanceOriginals: Record<string, unknown>[];
    };
    expect(register.provenanceKind).toBe('GENERATED_POLICY');
    expect(register.sourceFinanceOriginals).toEqual(
      parent.source.financeOriginals,
    );
    expect(
      register.sourceFinanceOriginals.every(
        (r) =>
          r.publicDebt === '0' &&
          r.bankLoanAssets === '0' &&
          Array.isArray(r.existingContracts) &&
          r.existingContracts.length === 0 &&
          Array.isArray(r.historicalClaims) &&
          r.historicalClaims.length === 0,
      ),
    ).toBe(true);
    for (const country of actual.contract.countries) {
      expect(country.cbRegister.holdings).toHaveLength(2);
      expect(
        country.cbRegister.categories.filter(
          (c) => c.disposition === 'NO_DECLARED_INSTRUMENT',
        ),
      ).toHaveLength(19);
      expect(
        country.cbRegister.holdings.every(
          (h) =>
            h.kind === 'CLAIM' &&
            [
              'COMMERCIAL_BANK_RESERVE_ACCOUNTS',
              'TREASURY_GOVERNMENT_DEPOSIT',
            ].includes(h.category),
        ),
      ).toBe(true);
    }
    for (const row of actual.candidate.reconciliations) {
      expect(row.cbAssets.amount).toBe('0');
      expect(
        Money.from(
          row.cbNetWorth.amount,
          row.cbNetWorth.currency,
        ).amount.isNegative(),
      ).toBe(true);
      expect(
        Money.from(row.cbNetWorth.amount, row.cbNetWorth.currency)
          .amount.negated()
          .equals(
            Money.from(row.cbLiabilities.amount, row.cbLiabilities.currency)
              .amount,
          ),
      ).toBe(true);
    }
    const ledger = rebuildV08LedgersFromLineage({
      seed: actual.baselineSeed,
      sha256Hex: sha,
    });
    expect(
      ledger.financial.accounts.some((a) => a.accountClass === 'CASH'),
    ).toBe(false);
    expect(ledger.worldVersion).toBe('0');
    expect(
      actual.baselineSeed.sources.some((s) =>
        /MECHANISM_TEST_VECTOR|TEST_FIXTURE|fixture:\/\//u.test(
          s.canonicalPayload,
        ),
      ),
    ).toBe(false);
  });
  it('binds actual canonical GOV TGA / OP / HH assets to reciprocal liability claims, never counts reserve or arbitrary ASSET as spendable', () => {
    const accounts = readPostwarLiquidFundingAccountsFromSeed(
      actual.baselineSeed,
    );
    expect(accounts).toHaveLength(210);
    expect(new Set(accounts.map((a) => a.accountId)).size).toBe(210);
    const ledger = rebuildV08LedgersFromLineage({
      seed: actual.baselineSeed,
      sha256Hex: sha,
    });
    for (const account of accounts) {
      const original = parent.manifest.countries.find(
        (c) => c.countryId === account.countryId,
      )!;
      const position = ledger.financial.positions.find(
        (p) => p.account.accountId === account.accountId,
      )!;
      const counterpart = ledger.financial.positions.find(
        (p) => p.account.accountId === account.counterpartAccountId,
      )!;
      expect(position.account.accountClass).toBe('ASSET');
      expect(position.account.claimId).toBe(counterpart.account.claimId);
      expect(position.account.counterpartyEntityId).toBe(
        counterpart.account.ownerId,
      );
      expect(account.ownerId).toBe(
        account.kind === 'TREASURY_TGA'
          ? original.holderRoster.treasury
          : account.kind === 'OPERATOR_BANK_DEPOSIT'
            ? original.holderRoster.operator
            : original.holderRoster.households,
      );
      expect(account.issuerEntityId).toBe(
        account.kind === 'TREASURY_TGA'
          ? original.holderRoster.centralBank
          : original.holderRoster.bank,
      );
      expect(account.availableAmount).toBe(
        canonicalDecimal(position.netDebitBalance.amount),
      );
    }
    const bankOwners = new Set(
      parent.manifest.countries.map((c) => c.holderRoster.bank),
    );
    expect(accounts.some((a) => bankOwners.has(a.ownerId))).toBe(false);
  });
  it('retains the exact current user source receipt and hashes without pretending it is an Owner signature/PR approval or a nonexistent git document', () => {
    const evidence = JSON.parse(actual.instructionBytes) as Record<
      string,
      unknown
    >;
    expect(evidence.reference).toBe(POSTWAR_OPERATING_USER_RECEIPT.reference);
    expect(evidence.receivedAtReal).toBe(
      POSTWAR_OPERATING_USER_RECEIPT.receivedAtReal,
    );
    expect(evidence.instruction).toBe(
      POSTWAR_OPERATING_USER_RECEIPT.instruction,
    );
    expect(actual.registration.retainedReference).toBe(
      `chat:${POSTWAR_OPERATING_USER_RECEIPT.reference}:sha256:${sha(actual.receiptBytes)}`,
    );
    expect(actual.registration.expectedInstructionSha256).toBe(
      sha(actual.instructionBytes),
    );
    expect(actual.proof.admissionAllowed).toBe(false);
    expect(() =>
      snapshotFinancialSupplementRegistration({
        ...actual.registration,
        retainedReference:
          'chat:SOME_OTHER_MESSAGE:sha256:' + sha(actual.receiptBytes),
      }),
    ).toThrow('FINANCIAL_REGISTRATION_INVALID');
    expect(() =>
      snapshotFinancialSupplementRegistration({
        ...actual.registration,
        retainedReference: `chat:${POSTWAR_OPERATING_USER_RECEIPT.reference}:sha256:${'0'.repeat(64)}`,
      }),
    ).toThrow('FINANCIAL_REGISTRATION_INVALID');
    const instruction = canonicalSerialize({
      ...evidence,
      policySha256: '0'.repeat(64),
    });
    const record = JSON.parse(actual.receiptBytes) as Record<string, unknown>;
    record.ownerInstructionSha256 = sha(instruction);
    const receiptBytes = canonicalSerialize(record);
    const registration = {
      ...actual.registration,
      expectedInstructionSha256: sha(instruction),
      expectedReceiptSha256: sha(receiptBytes),
      retainedReference: `chat:${POSTWAR_OPERATING_USER_RECEIPT.reference}:sha256:${sha(receiptBytes)}`,
    };
    expect(() =>
      loadFinancialSupplementAdoption({
        registration,
        receiptBytes,
        instructionBytes: instruction,
        parent,
        contract: actual.contract,
        candidate: actual.candidate,
        assemblyIntentFingerprint: openingV2AssemblyIntentFingerprint(
          actual.assembly,
        ),
        seedId: actual.assembly.seedId,
        orchestratorVersion: actual.assembly.orchestratorVersion,
      }),
    ).toThrow('POSTWAR_CURRENT_USER_SOURCE_RECORD_MISMATCH');
  });
  it('is deterministic and rejects a serialized monetary or parent source as authority', () => {
    expect(create().baselineSeed.fingerprint).toBe(
      actual.baselineSeed.fingerprint,
    );
    expect(actual.receiptBytes).toBe(create().receiptBytes);
    expect(() =>
      createPostwarFinancialGenesis({
        adoption: JSON.parse(JSON.stringify(parent)),
        monetary: {} as never,
        worldId: actual.assembly.worldId,
        seedId: actual.assembly.seedId,
        sourceId: actual.assembly.sourceId,
        genesisVersion: 'POSTWAR_OPERATING_20261028_V1',
      }),
    ).toThrow('POSTWAR_REAL_OWNER_SOURCE_ADOPTION_REQUIRED');
  });
});
