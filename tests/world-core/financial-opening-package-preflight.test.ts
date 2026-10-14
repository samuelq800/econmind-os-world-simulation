import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { constants } from 'node:fs';
import {
  chmod,
  copyFile,
  cp,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readdir,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
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
  createTestOnlyFinancialOpeningPackageRegistryLoader,
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
  materializeFinancialOpeningPackageFixture,
  disposeFinancialOpeningPackageFixture,
  type OwnedFinancialOpeningPackageFixture,
} from '../support/financial-opening-package-fixture.js';
import {
  formalFinancialMechanismVector,
  formalFinancialTestAdoption,
} from './formal-financial-opening.test.js';

const repositoryRoot = path.resolve(import.meta.dirname, '../..');
let packageRoot: string;
let fixture: OwnedFinancialOpeningPackageFixture;
let loaded: LoadedFinancialOpeningPackageRegistry;
let result: Awaited<ReturnType<typeof preflightFinancialOpeningPackage>>;
const temps: string[] = [];
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
beforeAll(async () => {
  fixture = await materializeFinancialOpeningPackageFixture();
  packageRoot = fixture.packageRoot;
  loaded = await (
    await createTestOnlyFinancialOpeningPackageRegistryLoader({
      fixtureRoot: fixture.fixtureRoot,
    })
  ).load();
  result = await preflightFinancialOpeningPackage({
    registry: loaded,
    repositoryRoot,
  });
}, 30000);
afterAll(async () => {
  for (const dir of temps) await rm(dir, { recursive: true, force: true });
  if (fixture) await disposeFinancialOpeningPackageFixture(fixture);
});
async function copiedPackage() {
  const dir = await mkdtemp(
    path.join(await realpath(tmpdir()), 'financial-package-test-'),
  );
  temps.push(dir);
  for (const name of await readdir(packageRoot)) {
    await copyFile(
      path.join(packageRoot, name),
      path.join(dir, name),
      constants.COPYFILE_FICLONE,
    );
    // Only this freshly owned negative copy is writable, not fixture/original.
    await chmod(path.join(dir, name), 0o600);
  }
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
  it('provisions exact tracked bytes under an owned root with full cumulative IO and original parent gaps', async () => {
    expect(loaded.bytesRead).toBe(6505847);
    expect(fixture.io).toEqual({
      inputFiles: 41,
      outputFiles: 42,
      sourceReadBytes: 6444829,
      destinationVerificationReadBytes: 6425894,
      writtenBytes: 6444893,
      cleanupReadBytesReserved: 64,
      lifecyclePreparationReadBytesUpperBound: 12870787,
    });
    expect(loaded.testOnlyReadReceipt).toEqual({
      classification: 'TEST_ONLY_NOT_ADOPTION',
      fixtureManifestSha256:
        'a3306cc89cd8a9150c6bd4fb6820eeaa879f8a41e02f858514fee60344fa63cc',
      originalReaderBytes: 6505847,
      preparationReadBytesReserved: 12870787,
      factoryVerificationBytes: 18935,
      lifecycleReadBytesUpperBound: 19395569,
    });
    expect(result.originalSourceGaps).toHaveLength(1051);
    expect(result.blockers).toHaveLength(2368);
    expect(result.originalParentManifestFingerprint).toBe(
      'sha256:73c96665334557656836aa218108c85ad50b6b091a3fab722696bf7e0ae95ba9',
    );
    expect(sha(canonicalSerialize(result.originalSourceGaps))).toBe(
      '668a74df86b5550205d8dcc8f0680b0cff0b03b6846260b5efe9720c3334be3f',
    );
    const original = await lstat(
      path.join(
        repositoryRoot,
        'tests/fixtures/financial-opening-package-v1/blobs/2f22d0d66cc01c0af0507beaa299646845a310836a61c3c5f9c3248d6c36eef7',
      ),
    );
    const copy = await lstat(path.join(packageRoot, 'PACKAGE_MANIFEST.json'));
    expect(copy.isFile()).toBe(true);
    expect(copy.nlink).toBe(1);
    expect(copy.mode & 0o222).toBe(0);
    expect(copy.dev !== original.dev || copy.ino !== original.ino).toBe(true);
  });
  it('rejects bad fixture bytes and nonregular inputs without skipped setup or caller-controlled pins', async () => {
    const kit = path.join(
      repositoryRoot,
      'tests/fixtures/financial-opening-package-v1',
    );
    const blobName =
      '2f22d0d66cc01c0af0507beaa299646845a310836a61c3c5f9c3248d6c36eef7';
    for (const mutation of [
      'missing',
      'size',
      'hash',
      'directory',
      'symlink',
      'fifo',
    ]) {
      const root = await mkdtemp(
        path.join(await realpath(tmpdir()), 'financial-kit-negative-'),
      );
      temps.push(root);
      await cp(kit, root, { recursive: true });
      const blob = path.join(root, 'blobs', blobName);
      const bytes = await readFile(blob);
      await rm(blob);
      if (mutation === 'size') await writeFile(blob, '{}');
      if (mutation === 'hash') {
        bytes[10] = bytes[10] === 32 ? 33 : 32;
        await writeFile(blob, bytes);
      }
      if (mutation === 'directory') await mkdir(blob);
      if (mutation === 'symlink')
        await symlink(path.join(kit, 'blobs', blobName), blob);
      if (mutation === 'fifo') {
        const child = spawnSync('mkfifo', [blob], {
          timeout: 2500,
          encoding: 'utf8',
        });
        expect(child.error).toBeUndefined();
        expect(child.status).toBe(0);
      }
      const helperUrl = pathToFileURL(
        path.join(
          repositoryRoot,
          'tests/support/financial-opening-package-fixture.ts',
        ),
      ).href;
      const expected =
        mutation === 'missing'
          ? 'FIXTURE_CLOSED_FILE_SET_REQUIRED'
          : mutation === 'size'
            ? 'FIXTURE_FILE_SIZE_MISMATCH'
            : mutation === 'hash'
              ? 'FIXTURE_FILE_HASH_MISMATCH'
              : mutation === 'symlink'
                ? 'FIXTURE_SYMLINK_DENIED'
                : 'FIXTURE_REGULAR_COMPONENT_REQUIRED';
      const child = spawnSync(
        process.execPath,
        [
          '--experimental-strip-types',
          '--input-type=module',
          '-e',
          `
        const {materializeFinancialOpeningPackageFixture}=await import(${JSON.stringify(helperUrl)});
        try { await materializeFinancialOpeningPackageFixture({fixtureKitRoot:${JSON.stringify(root)}}); process.exitCode=1; }
        catch(e) { console.log(e.message); console.log(e.cause?.message ?? '');
          if(!String(e.message).includes(${JSON.stringify(expected)}) && !String(e.cause?.message).includes(${JSON.stringify(expected)})) process.exitCode=2; }
      `,
        ],
        {
          timeout: 2500,
          killSignal: 'SIGKILL',
          encoding: 'utf8',
          maxBuffer: 8192,
        },
      );
      expect(child.error, child.stdout + child.stderr).toBeUndefined();
      expect(child.signal).toBeNull();
      expect(child.status, child.stdout + child.stderr).toBe(0);
      expect(child.stdout).toContain(expected);
    }
    await expect(
      createTestOnlyFinancialOpeningPackageRegistryLoader({
        fixtureRoot: fixture.fixtureRoot,
        sourceMap: {},
      } as { fixtureRoot: string }),
    ).rejects.toThrow('EXACT_KEYS_REQUIRED');
    await expect(
      disposeFinancialOpeningPackageFixture({ ...fixture }),
    ).rejects.toThrow('GENUINE_OWNED_FIXTURE_REQUIRED');
    const another = await createTestOnlyFinancialOpeningPackageRegistryLoader({
      fixtureRoot: fixture.fixtureRoot,
    });
    await expect(
      another.load.call(
        Object.create(Object.getPrototypeOf(another)) as typeof another,
      ),
    ).rejects.toThrow();
  });
  it('has no physical archive-only files or old-root fallback in its verified TEST_ONLY layout', async () => {
    expect((await readdir(fixture.fixtureRoot)).sort()).toEqual([
      '.fixture-owner',
      'fixture-manifest.json',
      'package',
      'sources',
    ]);
    const archived = (
      loaded.sourceRegistry.sources as {
        sourceId: string;
        retainedRootId: string;
        relativeLocator: string;
      }[]
    ).filter((s) => loaded.archiveOnlySourceIds.includes(s.sourceId));
    expect(archived).toHaveLength(5);
    for (const s of archived) {
      const physicalRoot =
        s.retainedRootId === 'G_FUNDING_REGISTRY'
          ? packageRoot
          : path.join(fixture.fixtureRoot, 'sources', s.retainedRootId);
      await expect(
        lstat(path.join(physicalRoot, s.relativeLocator)),
      ).rejects.toMatchObject({ code: 'ENOENT' });
    }
    const loader = await createTestOnlyFinancialOpeningPackageRegistryLoader({
      fixtureRoot: fixture.fixtureRoot,
    });
    expect((await loader.load()).bytesRead).toBe(6505847);
    await expect(loader.load()).rejects.toThrow(
      'TEST_FIXTURE_OPERATION_ALREADY_CONSUMED',
    );
  });
  it('loads the same fixture through this candidate fresh compiled Worker in a finite child', () => {
    const url = pathToFileURL(
      path.join(
        repositoryRoot,
        'apps/world-worker/dist/preparation/financial-opening-package-registry.js',
      ),
    ).href;
    const child = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `
      const { createTestOnlyFinancialOpeningPackageRegistryLoader } = await import(${JSON.stringify(url)});
      const r = await (await createTestOnlyFinancialOpeningPackageRegistryLoader({fixtureRoot:${JSON.stringify(fixture.fixtureRoot)}})).load();
      if(r.bytesRead!==6505847 || r.testOnlyReadReceipt.classification!=='TEST_ONLY_NOT_ADOPTION') throw Error('BAD_RECEIPT');
      console.log('FRESH_CANDIDATE_TEST_ONLY_6505847');
    `,
      ],
      { timeout: 15000, encoding: 'utf8', maxBuffer: 8192 },
    );
    expect(child.error, child.stdout + child.stderr).toBeUndefined();
    expect(child.signal).toBeNull();
    expect(child.status, child.stdout + child.stderr).toBe(0);
    expect(child.stdout).toContain('FRESH_CANDIDATE_TEST_ONLY_6505847');
  });
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
  it('rejects FIFO and directory leaves within a finite child deadline and preserves regular wrong-size rejection', async () => {
    const dir = await mkdtemp(
      path.join(await realpath(tmpdir()), 'financial-package-guard-'),
    );
    temps.push(dir);
    const moduleUrl = pathToFileURL(
      path.join(
        repositoryRoot,
        'apps/world-worker/dist/preparation/financial-opening-package-registry.js',
      ),
    ).href;
    const rejection = (root: string, code: string) => {
      const child = spawnSync(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          `
        import { FinancialOpeningPackageRegistryLoader } from ${JSON.stringify(moduleUrl)};
        console.log('LOAD_STARTED');
        try {
          await new FinancialOpeningPackageRegistryLoader({packageRoot: ${JSON.stringify(root)}}).load();
          process.exitCode = 1;
        } catch (error) {
          console.log(error.message);
          if (!error.message.includes(${JSON.stringify(code)})) process.exitCode = 2;
        }
      `,
        ],
        {
          timeout: 2500,
          killSignal: 'SIGKILL',
          encoding: 'utf8',
          maxBuffer: 8192,
        },
      );
      expect(child.error, child.stdout + child.stderr).toBeUndefined();
      expect(child.signal).toBeNull();
      expect(child.status, child.stdout + child.stderr).toBe(0);
      expect(child.stdout).toContain('LOAD_STARTED');
      expect(child.stdout).toContain(code);
    };
    const leaf = path.join(dir, 'PACKAGE_MANIFEST.json');
    await writeFile(leaf, '{}');
    rejection(dir, 'FILE_SIZE_MISMATCH');
    await rm(leaf);
    const fifo = spawnSync('mkfifo', [leaf], {
      timeout: 2500,
      encoding: 'utf8',
    });
    expect(fifo.error).toBeUndefined();
    expect(fifo.status, fifo.stderr).toBe(0);
    rejection(dir, 'REGULAR_FILE_REQUIRED');
    // This is the open mode used if a regular leaf is replaced by a FIFO
    // after lstat: no writer is needed, and descriptor validation can run.
    const descriptor = await open(
      leaf,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    try {
      expect((await descriptor.stat()).isFIFO()).toBe(true);
    } finally {
      await descriptor.close();
    }
    await rm(leaf);
    await mkdir(leaf);
    rejection(dir, 'REGULAR_FILE_REQUIRED');
    const nonDirectoryRoot = path.join(dir, 'not-a-directory');
    await writeFile(nonDirectoryRoot, '{}');
    rejection(nonDirectoryRoot, 'DIRECTORY_COMPONENT_REQUIRED');
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
