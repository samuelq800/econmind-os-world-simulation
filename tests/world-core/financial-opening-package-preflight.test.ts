import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import {
  copyFile,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  COMMAND_SCHEMA_VERSION,
  EVENT_SCHEMA_VERSION,
  FINANCIAL_POSTING_SCHEMA_VERSION,
  Money,
  acquireWorldWriterLease,
  canonicalSerialize,
  createAuthoritativeTransition,
  createFinalCommandReceipt,
  createFinancialPostingBatch,
  createWorldWriterCommitAssertion,
  financialPostingBatchId,
  financialPostingLegId,
  parseAuthoritativeEvent,
  parseCanonicalCommand,
  workerId,
  worldWriterLeaseRequest,
} from '@econmind/core';
import { applyFinancialPostingBatch } from '../../packages/core/dist/finance/financial-ledger.js';
import { prepareAtomicTransitionCandidate } from '../../apps/world-worker/src/persistence/atomic-transition-repository.js';
import {
  FinancialOpeningPackageRegistryLoader,
  inspectFinancialRegistryFact,
  parseFinancialRegistrySourceJson,
  resolveFinancialRegistrySource,
  selectFinancialRegistryCsvCell,
  selectFinancialRegistryJsonPointer,
  type LoadedFinancialOpeningPackageRegistry,
} from '../../apps/world-worker/src/preparation/financial-opening-package-registry.js';
import {
  calculateFinancialPackageCarrier,
  diagnoseFinancialPackageGross,
  preflightFinancialOpeningPackage,
  type DeclaredCashDiagnostic,
  type GrossDiagnosticObligation,
} from '../../apps/world-worker/src/preparation/financial-opening-package-preflight.js';
import { createV10TwoCountryTestFixture } from '../support/v10-two-country-fixture.js';
import {
  formalFinancialMechanismVector,
  formalFinancialTestAdoption,
} from './formal-financial-opening.test.js';

const repositoryRoot = path.resolve(import.meta.dirname, '../..');
const packageRoot =
  '/Users/samuel/Documents/econclub/artifacts/g-funding-source-registry-20261013';
let loaded: LoadedFinancialOpeningPackageRegistry;
let result: Awaited<ReturnType<typeof preflightFinancialOpeningPackage>>;
const temps: string[] = [];
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
beforeAll(async () => {
  loaded = await new FinancialOpeningPackageRegistryLoader({
    packageRoot,
  }).load();
  result = await preflightFinancialOpeningPackage({
    registry: loaded,
    repositoryRoot,
  });
}, 30000);
afterAll(async () => {
  for (const dir of temps) await rm(dir, { recursive: true, force: true });
});
async function copiedPackage() {
  const dir = await mkdtemp(
    path.join(await realpath(tmpdir()), 'financial-package-test-'),
  );
  temps.push(dir);
  for (const name of await readdir(packageRoot))
    await copyFile(
      path.join(packageRoot, name),
      path.join(dir, name),
      constants.COPYFILE_FICLONE,
    );
  return dir;
}
function cash(
  overrides: Partial<DeclaredCashDiagnostic> = {},
): DeclaredCashDiagnostic {
  const account =
    createV10TwoCountryTestFixture().financialAccounts.buyerTreasury;
  return {
    account,
    sourceHoldingKind: 'CASH',
    sourceNativeCurrency: 'GCU',
    sourceOwnerId: account.ownerId,
    availableAmount: '10',
    restrictedAmount: '0',
    permissionKnown: true,
    ...overrides,
  };
}
function obligation(
  flowId: string,
  amount = '6',
  fee: string | null = '0',
): GrossDiagnosticObligation {
  const account = cash().account;
  return {
    flowId,
    amount,
    fee,
    ownerId: account.ownerId,
    accountId: account.accountId,
    currency: 'GCU',
    dueBucket: 'SIM_140',
  };
}
function pairedMechanism(amount = '2') {
  const fixture = createV10TwoCountryTestFixture();
  const at = '2026-09-12T00:00:00.000Z';
  const command = parseCanonicalCommand(
    {
      schemaVersion: COMMAND_SCHEMA_VERSION,
      commandType: 'FINANCIAL_PACKAGE_MECHANISM_TEST_ONLY',
      commandId: 'COMMAND_FINANCIAL_PACKAGE_TEST_ONLY',
      idempotencyKey: 'FINANCIAL_PACKAGE_TEST_ONLY',
      worldId: fixture.worldId,
      actorId: 'ACTOR_PACKAGE_TEST_ONLY',
      authSubject: fixture.command.authSubject,
      countryId: fixture.command.countryId,
      officeId: null,
      expectedWorldVersion: '0',
      simTime: '0',
      submittedAtReal: at,
      correlationId: 'CORRELATION_PACKAGE_TEST_ONLY',
      payload: { classification: 'TEST_ONLY_NO_RUNTIME' },
    },
    sha,
  );
  const event = parseAuthoritativeEvent(
    {
      schemaVersion: EVENT_SCHEMA_VERSION,
      worldId: fixture.worldId,
      eventId: 'EVENT_FINANCIAL_PACKAGE_TEST_ONLY',
      eventType: 'FINANCIAL_PACKAGE_MECHANISM_TEST_ONLY',
      causationCommandId: command.commandId,
      correlationId: command.correlationId,
      worldVersion: '1',
      sequence: '1',
      simTime: '0',
      recordedAtReal: at,
      correctsEventId: null,
      payload: { classification: 'TEST_ONLY_NO_RUNTIME' },
    },
    sha,
  );
  const transition = createAuthoritativeTransition({
    command,
    worldVersionBefore: '0',
    worldVersionAfter: '1',
    events: [event],
  });
  const batch = createFinancialPostingBatch(
    {
      schemaVersion: FINANCIAL_POSTING_SCHEMA_VERSION,
      batchId: financialPostingBatchId('BATCH_PACKAGE_TEST_ONLY'),
      worldId: fixture.worldId,
      causationCommandId: command.commandId,
      causationEventIds: [event.eventId],
      worldVersionBefore: '0',
      worldVersionAfter: '1',
      simTime: command.simTime,
      settlementCurrency: 'GCU',
      command,
      transition,
      legs: [
        {
          legId: financialPostingLegId('LEG_PACKAGE_BUYER'),
          account: fixture.financialAccounts.buyerTreasury,
          direction: 'CREDIT',
          amount: Money.from(amount, 'GCU'),
          counterpartyAccountId:
            fixture.financialAccounts.sellerSettlement.accountId,
        },
        {
          legId: financialPostingLegId('LEG_PACKAGE_SELLER'),
          account: fixture.financialAccounts.sellerSettlement,
          direction: 'DEBIT',
          amount: Money.from(amount, 'GCU'),
          counterpartyAccountId:
            fixture.financialAccounts.buyerTreasury.accountId,
        },
      ],
    },
    sha,
  );
  const receipt = createFinalCommandReceipt({
    command,
    outcome: 'COMMITTED',
    reasonCode: null,
    transition,
    simTime: command.simTime,
    recordedAtReal: at,
  });
  const lease = acquireWorldWriterLease(
    null,
    worldWriterLeaseRequest(
      fixture.worldId,
      workerId('WORKER_PACKAGE_TEST_ONLY'),
      at,
      '2026-09-12T00:01:00.000Z',
    ),
  ).lease;
  const candidate = prepareAtomicTransitionCandidate({
    command,
    commitAuthorization: null,
    draft: {
      transition,
      inventoryPostings: [],
      financialPostingBatches: [batch],
      receipt,
      outboxMessages: [],
      currentMaterializations: [],
      authorityKind: 'VERSIONED_AUTOMATIC',
      commitAssertion: createWorldWriterCommitAssertion(lease, '0'),
      observedAtReal: at,
    },
    sha256Hex: sha,
  });
  return { fixture, command, transition, batch, candidate };
}

describe('financial package adapter finite preparation', () => {
  it('loads the exact reviewed package and selected small sources, not five archived flows/journals', () => {
    expect(loaded.packageManifestSha256).toBe(
      '2f22d0d66cc01c0af0507beaa299646845a310836a61c3c5f9c3248d6c36eef7',
    );
    expect(loaded.selectedSourceIds).toHaveLength(24);
    expect(loaded.archiveOnlySourceIds).toHaveLength(5);
    expect(loaded.bytesRead).toBeLessThan(96 * 1024 * 1024);
    expect(loaded.originalCarrierInput).toBeNull();
    expect(
      resolveFinancialRegistrySource(loaded, {
        sourceId: 'clearing_original_journal',
        selector: { kind: 'JSON_POINTER', pointer: '/224684' },
      }),
    ).toEqual({
      status: 'NOT_DEREFERENCED',
      sourceId: 'clearing_original_journal',
    });
  });
  it('actually loads the original parent and preserves missing formal input, original source gaps and all external deny flags', () => {
    expect(result.status).toBe('PREFLIGHT_BLOCKED');
    expect(result.nativeCoverage).toEqual({
      countries: 70,
      ownerLeaves: 1470,
      summaryLeaves: 490,
      spendableCash: false,
    });
    expect(result.originalSourceGaps.length).toBeGreaterThan(0);
    for (const g of result.originalSourceGaps)
      expect(
        result.blockers.some(
          (b) =>
            b.code === g.code &&
            b.field === g.field &&
            b.countryId === g.countryId,
        ),
      ).toBe(true);
    for (const code of [
      'FINANCIAL_CONTRACT_INPUT_NOT_PROVISIONED',
      'SUPPLEMENTAL_FINANCIAL_SOURCE_ADOPTION_UNRESOLVED',
      'FORMAL_WORLD_BINDING_UNRESOLVED',
      'GAP_GCU_ACCOUNT_OWNERSHIP',
      'GAP_FX_FEES_QUOTE',
      'CLEARING_TERMS_NOT_ADOPTED',
      'SETTLEMENT_PATH_NOT_IMPLEMENTED',
    ])
      expect(result.blockers.some((b) => b.code === code)).toBe(true);
    expect(result).toMatchObject({
      originalCarrierResult: null,
      seed: null,
      admissionAllowed: false,
      activationAllowed: false,
      runtimeExecuted: false,
    });
    expect(result.countryFunding).toHaveLength(70);
    expect(
      result.countryFunding.every((c) => c.actualGcuCash === 'UNKNOWN'),
    ).toBe(true);
  });
  it('rejects copied registry/approved DTOs instead of transferring the integrity brand', async () => {
    const clone = JSON.parse(
      JSON.stringify(loaded),
    ) as LoadedFinancialOpeningPackageRegistry;
    await expect(
      preflightFinancialOpeningPackage({ registry: clone, repositoryRoot }),
    ).rejects.toThrow('GENUINE_REGISTRY_REQUIRED');
    expect(() =>
      resolveFinancialRegistrySource(clone, {
        sourceId: 'native_lc',
        selector: { kind: 'JSON_POINTER', pointer: '' },
      }),
    ).toThrow('GENUINE_REGISTRY_REQUIRED');
    expect(
      () =>
        new FinancialOpeningPackageRegistryLoader({
          packageRoot,
          approved: true,
        } as { packageRoot: string }),
    ).toThrow('EXACT_KEYS_REQUIRED');
  });
  it('rejects changed exact payload bytes and preserves original immutable source', async () => {
    const dir = await copiedPackage();
    const original = await readFile(
      path.join(packageRoot, 'COUNTRY_SOURCE_REGISTRY.json'),
    );
    const changed = Buffer.from(original);
    changed[10] = changed[10] === 32 ? 33 : 32;
    await writeFile(path.join(dir, 'COUNTRY_SOURCE_REGISTRY.json'), changed);
    await expect(
      new FinancialOpeningPackageRegistryLoader({ packageRoot: dir }).load(),
    ).rejects.toThrow('FILE_HASH_MISMATCH');
    expect(
      await readFile(path.join(packageRoot, 'COUNTRY_SOURCE_REGISTRY.json')),
    ).toEqual(original);
  });
  it('rejects final-file symlinks without weakening hash/regular-file guards', async () => {
    const dir = await copiedPackage();
    const target = path.join(dir, 'SOURCE_REGISTRY.json');
    await rm(target);
    await symlink(path.join(packageRoot, 'SOURCE_REGISTRY.json'), target);
    await expect(
      new FinancialOpeningPackageRegistryLoader({ packageRoot: dir }).load(),
    ).rejects.toThrow('SYMLINK_DENIED');
  });
  it('rejects unlisted package members rather than accepting a new input or registration', async () => {
    const dir = await copiedPackage();
    await writeFile(path.join(dir, 'financial-input.json'), '{}');
    await expect(
      new FinancialOpeningPackageRegistryLoader({ packageRoot: dir }).load(),
    ).rejects.toThrow('FILE_SET_INVALID');
  });
  it('keeps UNKNOWN null, exact decimal kinds and the original numeric bound', () => {
    const unknown = {
      status: 'UNKNOWN',
      value: null,
      source: null,
      evidenceClass: null,
      gapId: 'GAP_GCU_SPENDABILITY',
    };
    expect(inspectFinancialRegistryFact(unknown).value).toBeNull();
    expect(() =>
      inspectFinancialRegistryFact({ ...unknown, value: '0' }),
    ).toThrow('UNKNOWN_NOT_NULL');
    expect(() =>
      inspectFinancialRegistryFact({
        ...unknown,
        source: { sourceId: 'native_lc' },
      }),
    ).toThrow('UNKNOWN_NOT_NULL');
    const known = loaded.facts.find(
      (f) => f.fact.valueKind === 'DECIMAL_STRING',
    )!.fact;
    expect(() => inspectFinancialRegistryFact({ ...known, value: 1 })).toThrow(
      'FACT_VALUE_KIND_INVALID',
    );
    expect(() =>
      inspectFinancialRegistryFact({ ...known, value: '9'.repeat(121) }),
    ).toThrow();
    expect(() =>
      inspectFinancialRegistryFact({ ...known, evidenceClass: 'ADOPTED' }),
    ).toThrow('ADOPTION_LABEL_NOT_ALLOWED');
  });
  it('resolves lossless >2^53 numeric lexemes and RFC6901 own keys, never inherited keys', () => {
    const value = parseFinancialRegistrySourceJson(
      '{"a/b":{"~key":9007199254740993.001}}',
    );
    expect(selectFinancialRegistryJsonPointer(value, '/a~1b/~0key')).toBe(
      '9007199254740993.001',
    );
    expect(() =>
      selectFinancialRegistryJsonPointer(value, '/toString'),
    ).toThrow('JSON_POINTER_MISSING');
    expect(() => selectFinancialRegistryJsonPointer(value, '/a~2b')).toThrow(
      'JSON_POINTER_INVALID',
    );
  });
  it('uses quoted CSV unique composite keys, not row numbers or rounded numbers', () => {
    const csv =
      'countryId,simDay,value\r\nA,140,"9007199254740993.001"\r\nB,140,"x,y"\r\n';
    expect(
      selectFinancialRegistryCsvCell(
        csv,
        { countryId: 'A', simDay: '140' },
        'value',
      ),
    ).toBe('9007199254740993.001');
    expect(
      selectFinancialRegistryCsvCell(
        csv,
        { countryId: 'B', simDay: '140' },
        'value',
      ),
    ).toBe('x,y');
    expect(() =>
      selectFinancialRegistryCsvCell(csv, { countryId: 'C' }, 'value'),
    ).toThrow('CSV_KEY_NOT_UNIQUE');
    expect(() =>
      selectFinancialRegistryCsvCell(
        csv + 'A,140,2\n',
        { countryId: 'A', simDay: '140' },
        'value',
      ),
    ).toThrow('CSV_KEY_NOT_UNIQUE');
    expect(() =>
      selectFinancialRegistryCsvCell('x,x\n1,2', { x: '1' }, 'x'),
    ).toThrow('CSV_HEADER_OR_KEY_INVALID');
  });
  it('accepts both actual native shapes without granting nullable summary leaves a payer owner', () => {
    const summaries = loaded.nativeLeaves.filter((l) => l.ownerLabel === null);
    expect(summaries).toHaveLength(490);
    expect(
      summaries.every(
        (l) =>
          !Object.hasOwn(l, 'originalGcuLineage') && l.spendableCash === false,
      ),
    ).toBe(true);
    const owner = loaded.nativeLeaves.find((l) => l.ownerLabel !== null)!;
    expect(owner.sourceId).toBe('native_lc');
    expect(
      (owner.originalGcuLineage as { primaryNativeSource: boolean })
        .primaryNativeSource,
    ).toBe(false);
    expect(() =>
      resolveFinancialRegistrySource(loaded, {
        sourceId: 'joint_opening',
        selector: { kind: 'JSON_POINTER', pointer: owner.nativeAmountPointer },
      }),
    ).toThrow('JSON_POINTER_MISSING');
  });
  it('does not net an incoming reference promise against gross outgoing liquidity', () => {
    const diagnostic = {
      cash: cash({ availableAmount: '0' }),
      obligations: [obligation('OUT', '10')],
      referenceIncomingPromise: '10',
    };
    expect(diagnoseFinancialPackageGross(diagnostic).status).toBe(
      'INSUFFICIENT_DECLARED_CANDIDATE',
    );
  });
  it('shares one budget across simultaneous obligations and rejects duplicate intent identities', () => {
    const obligations = [obligation('A'), obligation('B')];
    const r = diagnoseFinancialPackageGross({ cash: cash(), obligations });
    expect(r.status).toBe('INSUFFICIENT_DECLARED_CANDIDATE');
    expect(r.grossByBucket[0]!.gross).toBe('12');
    expect(() =>
      diagnoseFinancialPackageGross({
        cash: cash(),
        obligations: [obligation('A'), obligation('A')],
      }),
    ).toThrow('GROSS_IDENTITY_INVALID');
  });
  it('keeps fee, restrictions, timing and permission unknown instead of defaulting them', () => {
    expect(
      diagnoseFinancialPackageGross({
        cash: cash(),
        obligations: [obligation('A', '1', null)],
      }).status,
    ).toBe('UNKNOWN');
    expect(
      diagnoseFinancialPackageGross({
        cash: cash({ restrictedAmount: null }),
        obligations: [obligation('A')],
      }).status,
    ).toBe('UNKNOWN');
    expect(
      diagnoseFinancialPackageGross({
        cash: cash({ permissionKnown: false }),
        obligations: [obligation('A')],
      }).status,
    ).toBe('UNKNOWN');
    expect(
      diagnoseFinancialPackageGross({
        cash: cash(),
        obligations: [
          obligation('A'),
          { ...obligation('B'), dueBucket: 'SIM_141' },
        ],
      }).status,
    ).toBe('UNKNOWN');
  });
  it('does not turn LC, a claim, wrong-owner CB money or a CASH label into payer GCU', () => {
    for (const overrides of [
      { sourceHoldingKind: 'CLAIM' as const },
      { sourceNativeCurrency: 'XAA' },
      { sourceOwnerId: 'ENTITY_OTHER_CB' },
    ])
      expect(
        diagnoseFinancialPackageGross({
          cash: cash(overrides),
          obligations: [obligation('A')],
        }).status,
      ).toBe('NOT_SETTLEMENT_CASH');
    const declared = diagnoseFinancialPackageGross({
      cash: cash(),
      obligations: [obligation('A', '2')],
    });
    expect(declared).toMatchObject({
      status: 'DECLARED_CANDIDATE_SUFFICIENT_NOT_ADOPTED',
      seed: null,
      admissionAllowed: false,
      activationAllowed: false,
      runtimeExecuted: false,
    });
  });
  it('actually invokes the original branded parser/producer on the genuine finite mechanism vector, never adopting it', () => {
    const adoption = formalFinancialTestAdoption();
    const inputBytes = canonicalSerialize(
      formalFinancialMechanismVector('1.25', 'NATIVE'),
    );
    const calculated = calculateFinancialPackageCarrier({
      adoption,
      inputBytes,
    });
    expect(calculated.candidate).not.toBeNull();
    expect(calculated).toMatchObject({
      status: 'BLOCKED',
      seed: null,
      admissionAllowed: false,
      activationAllowed: false,
    });
    expect(
      calculated.blockers.some(
        (b) => b.code === 'SUPPLEMENTAL_FINANCIAL_SOURCE_ADOPTION_UNRESOLVED',
      ),
    ).toBe(true);
    expect(
      calculated.blockers.some(
        (b) => b.code === 'FORMAL_WORLD_BINDING_UNRESOLVED',
      ),
    ).toBe(true);
    expect(() =>
      calculateFinancialPackageCarrier({
        adoption: { ...adoption },
        inputBytes,
      }),
    ).toThrow('REAL_NON_ACTIVATED_ADOPTION_REQUIRED');
  });
  it('cannot indirectly import/call adoption/seed/full V2 branches or leak nested authority', async () => {
    const banned = [
      'prepareOfficialOpeningBundleCandidate',
      'preflightOfficialOpeningBundle',
      'loadFinancialSupplementAdoption',
      'prepareFinancialSupplementOpeningSeed',
    ];
    for (const name of [
      'financial-opening-package-registry.ts',
      'financial-opening-package-preflight.ts',
    ]) {
      const text = await readFile(
        path.join(repositoryRoot, 'apps/world-worker/src/preparation', name),
        'utf8',
      );
      const source = ts.createSourceFile(
        name,
        text,
        ts.ScriptTarget.Latest,
        true,
      );
      const identifiers: string[] = [],
        imports: string[] = [];
      const visit = (n: ts.Node) => {
        if (ts.isIdentifier(n)) identifiers.push(n.text);
        if (ts.isImportDeclaration(n) && ts.isStringLiteral(n.moduleSpecifier))
          imports.push(n.moduleSpecifier.text);
        ts.forEachChild(n, visit);
      };
      visit(source);
      for (const id of banned) expect(identifiers).not.toContain(id);
      expect(
        imports.some((i) =>
          /candidate-composition|bundle-preflight|opening-canonical-seed-bridge/u.test(
            i,
          ),
        ),
      ).toBe(false);
    }
    const visit = (v: unknown): void => {
      if (!v || typeof v !== 'object') return;
      for (const [k, x] of Object.entries(v)) {
        if (k === 'seed') expect(x).toBeNull();
        expect([
          'proof',
          'registration',
          'financialAdoptionRegistration',
        ]).not.toContain(k);
        visit(x);
      }
    };
    visit(result);
  });
  it('uses real Core paired GCU and Atomic preparation factories; replay duplicates and conflicting reuse stay distinct', () => {
    const { fixture, batch, command, transition, candidate } =
      pairedMechanism();
    expect(candidate.financialPostingBatches).toHaveLength(1);
    expect(candidate.receipt.outcome).toBe('COMMITTED'); // TEST_ONLY factory receipt, not DB evidence.
    expect(() =>
      createFinancialPostingBatch(
        {
          schemaVersion: batch.schemaVersion,
          batchId: batch.batchId,
          worldId: batch.worldId,
          causationCommandId: batch.causationCommandId,
          causationEventIds: batch.causationEventIds,
          worldVersionBefore: batch.worldVersionBefore,
          worldVersionAfter: batch.worldVersionAfter,
          simTime: batch.simTime,
          settlementCurrency: batch.settlementCurrency,
          legs: [batch.legs[0]!],
          command,
          transition,
        },
        sha,
      ),
    ).toThrow();
    expect(() =>
      prepareAtomicTransitionCandidate({
        command,
        commitAuthorization: null,
        draft: {
          transition,
          inventoryPostings: [],
          financialPostingBatches: [batch, batch],
          receipt: candidate.receipt,
          outboxMessages: [],
          currentMaterializations: [],
          authorityKind: candidate.authorityKind,
          commitAssertion: candidate.commitAssertion,
          observedAtReal: candidate.observedAtReal,
        },
        sha256Hex: sha,
      }),
    ).toThrow();
    expect(batch.legs[0]!.amount.toCanonicalValue()).toEqual(
      batch.legs[1]!.amount.toCanonicalValue(),
    );
    const applied = applyFinancialPostingBatch(
      fixture.rebuiltLedgers.financial,
      batch,
    );
    expect(applied.receipt.outcome).toBe('APPLIED');
    expect(
      applyFinancialPostingBatch(applied.state, batch).receipt.outcome,
    ).toBe('EXACT_DUPLICATE');
    const conflict = pairedMechanism('3');
    expect(() =>
      applyFinancialPostingBatch(applied.state, conflict.batch),
    ).toThrow();
    expect(fixture.rebuiltLedgers.financial.worldVersion).toBe('0');
  });
});
