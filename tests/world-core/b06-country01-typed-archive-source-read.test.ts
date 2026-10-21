/** New archive I/O -> actual existing F reader. No source or authority issuance. */
import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { readB06TypedArchiveCountrySourceSlice as actualRead } from '../../apps/world-worker/src/preparation/b06-country01-typed-archive-source-read.js';
import * as consumer from '../../apps/world-worker/src/preparation/entity-native-cash-source-slice.js';
import { B06_C01_DEFINITION_VERSION } from '../../apps/world-worker/src/preparation/b06-country01-typed-register-preparation.js';
import {
  createTestOnlyFinancialOpeningPackageRegistryLoader,
  type LoadedFinancialOpeningPackageRegistry,
} from '../../apps/world-worker/src/preparation/financial-opening-package-registry.js';
import {
  materializeFinancialOpeningPackageFixture,
  disposeFinancialOpeningPackageFixture,
  type OwnedFinancialOpeningPackageFixture,
} from '../support/financial-opening-package-fixture.js';
import { originalEntityFixture } from '../support/entity-native-cash-candidate-fixture.js';

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, open: vi.fn(actual.open) };
});
const native =
  await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
type Input = Parameters<typeof actualRead>[0];
const observedIo: Awaited<ReturnType<typeof actualRead>>['io'][] = [];
let preIoRejections = 0;
const read = (input: Input) =>
  actualRead(input).then(
    (result) => {
      observedIo.push(result.io);
      return result;
    },
    (error) => {
      preIoRejections++;
      throw error;
    },
  );
const sha = (b: string | Uint8Array) =>
  createHash('sha256').update(b).digest('hex');
const gov = 'ENTITY_GOVERNMENT_01',
  op = 'ENTITY_OPERATOR_01',
  hh = 'ENTITY_HOUSEHOLDS_01',
  bank = 'ENTITY_BANK_01',
  cb = 'ENTITY_CENTRAL_BANK_01';
const id = (owner: string) => 'U2544::ENTITY::' + owner + '::account';
const relations = [
  [
    'TGA',
    'TGA_ASSET',
    'TGA_ISSUANCE_LIABILITY',
    gov,
    cb,
    'TREASURY_DEPOSIT_AT_CB',
  ],
  [
    'RESERVE',
    'RESERVE_ASSET',
    'RESERVE_ISSUANCE_LIABILITY',
    bank,
    cb,
    'BANK_RESERVE_DEPOSIT_AT_CB',
  ],
  [
    'HOUSEHOLD_DEPOSIT',
    'HOUSEHOLD_DEPOSIT_ASSET',
    'HOUSEHOLD_DEPOSIT_ISSUANCE_LIABILITY',
    hh,
    bank,
    'HOUSEHOLD_DEPOSIT_AT_BANK',
  ],
  [
    'BUSINESS_DEPOSIT',
    'BUSINESS_DEPOSIT_ASSET',
    'BUSINESS_DEPOSIT_ISSUANCE_LIABILITY',
    op,
    bank,
    'BUSINESS_DEPOSIT_AT_BANK',
  ],
] as const;
let fixture: OwnedFinancialOpeningPackageFixture;
let registry: LoadedFinancialOpeningPackageRegistry;
const roots: string[] = [];
beforeAll(async () => {
  fixture = await materializeFinancialOpeningPackageFixture();
  registry = await (
    await createTestOnlyFinancialOpeningPackageRegistryLoader({
      fixtureRoot: fixture.fixtureRoot,
    })
  ).load();
  console.info(
    'A_S1_OWNED_REGISTRY_FIXTURE_IO_NOT_PRIVATE_SOURCES',
    JSON.stringify(fixture.io),
  );
  console.info(
    'A_S1_GENUINE_FIXTURE_LOADER_IO',
    JSON.stringify({
      bytesRead: registry.bytesRead,
      receipt: registry.testOnlyReadReceipt,
      meaning:
        'Owned frozen fixture-kit sources, not original private source locations; no full financial producer executed.',
    }),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(fs.open).mockImplementation(native.open);
});
afterAll(async () => {
  const allReads = observedIo.flatMap((io) => io.reads);
  console.info(
    'A_S1_ARCHIVE_PRODUCT_IO',
    JSON.stringify({
      completedReadCalls: observedIo.length,
      preIoRejections,
      actualBytesRead: observedIo.reduce((s, io) => s + io.actualBytesRead, 0),
      readCalls: observedIo.reduce((s, io) => s + io.readCalls, 0),
      filesOpened: observedIo.reduce((s, io) => s + io.filesOpened, 0),
      callsWithRetry: observedIo.filter((io) => io.attempts === 2).length,
      sentinelBytesRead: allReads.reduce((s, r) => s + r.sentinelBytesRead, 0),
      eofProbeCalls: allReads.reduce((s, r) => s + r.eofProbeCalls, 0),
      actualBytesByPhase: Object.fromEntries(
        ['manifest-before', 'document', 'manifest-after'].map((phase) => [
          phase,
          allReads
            .filter((r) => r.phase === phase)
            .reduce((s, r) => s + r.actualBytesRead, 0),
        ]),
      ),
      note: 'Includes discarded attempts, manifest re-reads and sentinel; fixture provisioning I/O is separate; directory/stat/interpreter/build I/O not content bytes.',
    }),
  );
  for (const root of roots) {
    if (!path.basename(root).startsWith('a-b06-archive-test-'))
      throw Error('UNOWNED_CLEANUP');
    await native.rm(root, { recursive: true, force: true });
  }
  if (fixture) await disposeFinancialOpeningPackageFixture(fixture);
});
function vector(owners: string[]) {
  const records = relations
    .filter((r) => owners.includes(r[3]) || owners.includes(r[4]))
    .flatMap(([relation, asset, liability, holderId, issuerId, purpose]) =>
      (['ASSET', 'LIABILITY'] as const).map((accountClass) => ({
        role: accountClass === 'ASSET' ? asset : liability,
        sourceRecordId:
          'SYNTHETIC_RECORD_' + (accountClass === 'ASSET' ? asset : liability),
        accountId:
          'SYNTHETIC_ACCOUNT_' + (accountClass === 'ASSET' ? asset : liability),
        claimId: 'SYNTHETIC_CLAIM_' + relation,
        countryId: 'COUNTRY_01',
        ownerId: accountClass === 'ASSET' ? holderId : issuerId,
        holderId,
        issuerId,
        counterpartyEntityId: accountClass === 'ASSET' ? issuerId : holderId,
        accountClass,
        purpose,
        sourceHoldingKind: 'CLAIM',
        currency: 'XAA',
        sourceVersion: 'SYNTHETIC_ARCHIVE_V1',
        valueDate: '2026-10-13',
        sourceCapabilityLocator: null,
      })),
    );
  const registers = owners.map((ownerId) => ({
    stableId: id(ownerId),
    ownerId,
    countryId: 'COUNTRY_01',
    adoptedDefinitionVersion: B06_C01_DEFINITION_VERSION,
    sourceVersion: 'SYNTHETIC_ARCHIVE_V1',
    memberRoles: records
      .filter((r) => r.ownerId === ownerId)
      .map((r) => r.role),
  }));
  return {
    classification: 'SYNTHETIC_CANDIDATE',
    sourceNature: 'SYNTHETIC_DECLARATION',
    records,
    registers,
  };
}
type Vector = ReturnType<typeof vector>;
interface DocMeta {
  documentId: string;
  relativeLocator: string;
  byteLength: number;
  fullRawSha256: string;
  sourceId: string;
  sourceVersion: string;
  declaredNature: string;
  classification: string;
}
interface NavEntry {
  stableId: string;
  recordSelections: {
    role: string;
    sourceSchema: string;
    documentId: string;
    pointer: string;
  }[];
  registerSelections: {
    stableId: string;
    documentId: string;
    pointer: string;
  }[];
}
interface Nav {
  schemaVersion: string;
  nature: string;
  archiveVersion: string;
  definitionVersion: string;
  declaredNativeCurrency: string;
  documents: DocMeta[];
  entries: NavEntry[];
}
async function archive(owners = [gov], shared = true) {
  const root = await native.realpath(
    await native.mkdtemp(path.join(tmpdir(), 'a-b06-archive-test-')),
  );
  roots.push(root);
  const nav: Nav = {
    schemaVersion: 'b06-typed-archive-navigation-v1',
    nature: 'DECLARATION_NAVIGATION_NOT_ADOPTION',
    archiveVersion: 'TEST_ARCHIVE_V1',
    definitionVersion: B06_C01_DEFINITION_VERSION,
    declaredNativeCurrency: 'XAA',
    documents: [],
    entries: [],
  };
  const bodies = new Map<string, Vector>();
  for (const owner of shared ? [owners.join('|')] : owners) {
    const group = shared ? owners : [owner];
    const body = vector(group),
      documentId = 'TEST_DOC_' + nav.documents.length;
    const relativeLocator = 'docs/' + documentId + '.json';
    const bytes = JSON.stringify(body);
    await native.mkdir(path.dirname(path.join(root, relativeLocator)), {
      recursive: true,
    });
    await native.writeFile(path.join(root, relativeLocator), bytes);
    nav.documents.push({
      documentId,
      relativeLocator,
      byteLength: Buffer.byteLength(bytes),
      fullRawSha256: sha(bytes),
      sourceId: 'SYNTHETIC_DECLARATION_NOT_ADOPTION',
      sourceVersion: 'SYNTHETIC_ARCHIVE_V1',
      declaredNature: body.sourceNature,
      classification: body.classification,
    });
    bodies.set(documentId, body);
    for (const member of group) {
      const needed = relations
        .filter((r) => r[3] === member || r[4] === member)
        .flatMap((r) => [r[1], r[2]]);
      nav.entries.push({
        stableId: id(member),
        recordSelections: body.records.flatMap((r, i) =>
          needed.includes(r.role)
            ? [
                {
                  role: r.role,
                  sourceSchema: 'NORMALIZED_TYPED_ACCOUNT_V1',
                  documentId,
                  pointer: '/records/' + i,
                },
              ]
            : [],
        ),
        registerSelections: [
          {
            stableId: id(member),
            documentId,
            pointer:
              '/registers/' +
              body.registers.findIndex((r) => r.ownerId === member),
          },
        ],
      });
    }
  }
  const original = originalEntityFixture();
  const input: Input = {
    archive: {
      absoluteRoot: root,
      expectedArchiveVersion: nav.archiveVersion,
      manifest: {
        relativeLocator: 'navigation.json',
        byteLength: 1,
        sha256: sha('x'),
      },
    },
    context: {
      registry,
      mappings: {
        documentId: 'TEST_REFERENCE_MAPPING',
        bytes: original.mappingsBytes,
        sha256: sha(original.mappingsBytes),
      },
      originalFields: original.originalFields.filter((r) =>
        owners.map(id).includes(r.stableId),
      ),
    },
    requestedOriginalIds: owners.map(id),
  };
  async function seal() {
    const bytes = JSON.stringify(nav);
    await native.writeFile(path.join(root, 'navigation.json'), bytes);
    input.archive.manifest = {
      relativeLocator: 'navigation.json',
      byteLength: Buffer.byteLength(bytes),
      sha256: sha(bytes),
    };
  }
  async function rewrite(documentId: string) {
    const d = nav.documents.find((d) => d.documentId === documentId)!;
    const bytes = JSON.stringify(bodies.get(documentId));
    await native.writeFile(path.join(root, d.relativeLocator), bytes);
    d.byteLength = Buffer.byteLength(bytes);
    d.fullRawSha256 = sha(bytes);
    await seal();
  }
  await seal();
  return { root, nav, input, seal, bodies, rewrite };
}
function denied(
  result: Awaited<ReturnType<typeof read>>,
  code: string,
  calls = 0,
) {
  expect(result.rows).toHaveLength(1);
  expect(result.rows[0]!.error).toContain(code);
  expect(result.rows[0]!.consumerCalls).toBe(calls);
  expect(result.rows[0]!.sourceSlice).toBeNull();
}

describe('A S1 new archive-to-existing-reader path', () => {
  it('real filesystem -> actual F single Gov positive; preserves registry/slice/row identity', async () => {
    const a = await archive();
    const spy = vi.spyOn(consumer, 'readEntityCashCountrySourceSlice');
    const r = await read(a.input);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]![0].registry).toBe(registry);
    expect(spy.mock.calls[0]![0].declaredInput).toBeNull();
    expect(spy.mock.calls[0]![0].originalFields).toHaveLength(1);
    expect(r.rows[0]!.sourceSlice).toBe(spy.mock.results[0]!.value);
    const actualRow = r.rows[0]!.sourceSlice!.rows[0]!;
    expect(
      'typedRegisterPreparation' in actualRow &&
        actualRow.typedRegisterPreparation,
    ).toBe(r.rows[0]!.typedRow);
    expect(r.rows[0]!.disposition).toBe('DECLARATION_READ');
    expect(r.rows[0]!.typedRow!.sourceReferenceWitnesses).toHaveLength(2);
    expect(r.rows[0]!.typedRow!.shapeIssues).toEqual([]);
    const original = r.rows[0]!.sourceSlice!.rows[0]!;
    expect(original.currentPermission).toBe('UNKNOWN');
    expect(original.candidateValue).toBeNull();
    expect(original.actualValue).toBeNull();
    expect(r.rows[0]!.typedRow!.actualTypedRegisterBinding).toBeNull();
    expect(Object.values(original.originalFieldStages)).toEqual([
      false,
      false,
      false,
      false,
    ]);
    expect(r.sourceAdoption).toBe(false);
    expect(r).not.toHaveProperty('acceptedBinding');
    expect(r.originalClosures).toBe(0);
    expect(r.io.actualBytesRead).toBe(
      2 * a.input.archive.manifest.byteLength + a.nav.documents[0]!.byteLength,
    );
    expect(r.io.reads.map((x) => x.phase)).toEqual([
      'manifest-before',
      'document',
      'manifest-after',
    ]);
    expect(
      r.io.reads.every(
        (x) => x.eofProbeCalls === 1 && x.sentinelBytesRead === 0,
      ),
    ).toBe(true);
  });
  it.each([
    [op, 2],
    [hh, 2],
    [bank, 6],
    [cb, 4],
  ] as const)(
    'existing F determines %s own+mirror count %s',
    async (owner, count) => {
      const a = await archive([owner]);
      const spy = vi.spyOn(consumer, 'readEntityCashCountrySourceSlice');
      const r = await read(a.input);
      expect(spy).toHaveBeenCalledTimes(1);
      expect(r.rows[0]!.disposition).toBe('DECLARATION_READ');
      expect(r.rows[0]!.typedRow!.sourceReferenceWitnesses).toHaveLength(count);
    },
  );
  it('shared document read once, two genuine F calls, no unrelated complete-register requirement', async () => {
    const a = await archive([gov, hh]);
    const spy = vi.spyOn(consumer, 'readEntityCashCountrySourceSlice');
    const r = await read(a.input);
    expect(r.rows.map((x) => x.disposition)).toEqual([
      'DECLARATION_READ',
      'DECLARATION_READ',
    ]);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(r.io.reads.filter((x) => x.phase === 'document')).toHaveLength(1);
  });
  it('missing register invokes F once preserving original INCOMPLETE/issues', async () => {
    const a = await archive();
    a.nav.entries[0]!.registerSelections = [];
    await a.seal();
    const spy = vi.spyOn(consumer, 'readEntityCashCountrySourceSlice');
    const r = await read(a.input);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(r.rows[0]!.disposition).toBe('INCOMPLETE_DECLARATION');
    expect(r.rows[0]!.typedRow!.shapeIssues).toContain(
      'REGISTER_DECLARATION_NOT_SUPPLIED',
    );
    const actualRow = r.rows[0]!.sourceSlice!.rows[0]!;
    expect(
      'typedRegisterPreparation' in actualRow &&
        actualRow.typedRegisterPreparation,
    ).toBe(r.rows[0]!.typedRow);
  });
  it('absent entry/selectors is not a fake-source error; calls F once with empty selections', async () => {
    const a = await archive();
    a.nav.entries = [];
    await a.seal();
    const spy = vi.spyOn(consumer, 'readEntityCashCountrySourceSlice');
    const r = await read(a.input);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(r.rows[0]!.disposition).toBe('INCOMPLETE_DECLARATION');
    expect(r.rows[0]!.typedRow!.shapeIssues).toContain(
      'REQUIRED_ROLE_NOT_SUPPLIED:TGA_ASSET',
    );
    expect(r.io.reads.filter((x) => x.phase === 'document')).toHaveLength(0);
  });
  it('existing invalid pointer is NOT omitted: exactly one real F rejection', async () => {
    const a = await archive();
    a.nav.entries[0]!.recordSelections[0]!.pointer = '/records/999';
    await a.seal();
    const spy = vi.spyOn(consumer, 'readEntityCashCountrySourceSlice');
    const r = await read(a.input);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(r.rows[0]!.disposition).toBe('INVALID_ARCHIVE_OR_SOURCE');
    expect(r.rows[0]!.consumerCalls).toBe(1);
    expect(r.rows[0]!.error).not.toBeNull();
    expect(r.rows[0]!.recordSelections[0]!.pointer).toBe('/records/999');
  });
  it('selected bad hash gives explicit dependent-ID failure and ZERO F calls', async () => {
    const a = await archive();
    a.nav.documents[0]!.fullRawSha256 = '0'.repeat(64);
    await a.seal();
    const spy = vi.spyOn(consumer, 'readEntityCashCountrySourceSlice');
    denied(await read(a.input), 'ARCHIVE_FILE_HASH_MISMATCH');
    expect(spy).not.toHaveBeenCalled();
  });
  it('bad independent document does not erase another qualifying ID', async () => {
    const a = await archive([gov, hh], false);
    a.nav.documents[0]!.fullRawSha256 = '0'.repeat(64);
    await a.seal();
    const spy = vi.spyOn(consumer, 'readEntityCashCountrySourceSlice');
    const r = await read(a.input);
    expect(r.rows.map((x) => x.consumerCalls)).toEqual([0, 1]);
    expect(r.rows.map((x) => x.disposition)).toEqual([
      'INVALID_ARCHIVE_OR_SOURCE',
      'DECLARATION_READ',
    ]);
    expect(spy).toHaveBeenCalledTimes(1);
  });
  it('shared bad document fails both requested IDs, with zero calls', async () => {
    const a = await archive([gov, hh]);
    a.nav.documents[0]!.fullRawSha256 = '0'.repeat(64);
    await a.seal();
    const spy = vi.spyOn(consumer, 'readEntityCashCountrySourceSlice');
    const r = await read(a.input);
    expect(r.rows.map((x) => x.consumerCalls)).toEqual([0, 0]);
    expect(spy).not.toHaveBeenCalled();
  });
  it('unselected document is not opened or scanned', async () => {
    const a = await archive([gov, hh], false);
    (
      a.input as { requestedOriginalIds: readonly string[] }
    ).requestedOriginalIds = [id(gov)];
    await native.rm(path.join(a.root, a.nav.documents[1]!.relativeLocator));
    const r = await read(a.input);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]!.disposition).toBe('DECLARATION_READ');
    expect(r.io.reads.filter((x) => x.phase === 'document')).toHaveLength(1);
  });
  it('detaches caller pins, mapping bytes and original identities before first await', async () => {
    const a = await archive();
    const expectedPin = a.input.archive.manifest.sha256;
    const reading = read(a.input);
    a.input.archive.manifest.sha256 = '0'.repeat(64);
    a.input.archive.absoluteRoot = '/does-not-exist';
    (a.input.context.mappings as { bytes: string }).bytes = '{}';
    (a.input.context.originalFields[0] as { ownerId: string }).ownerId = op;
    (a.input.requestedOriginalIds as string[])[0] = id(op);
    const r = await reading;
    expect(r.rows[0]!.stableId).toBe(id(gov));
    expect(r.rows[0]!.disposition).toBe('DECLARATION_READ');
    expect(r.archiveManifest!.fullRawSha256).toBe(expectedPin);
  });
  it('caller accessors are rejected without evaluation', async () => {
    const a = await archive();
    let calls = 0;
    Object.defineProperty(a.input.archive, 'expectedArchiveVersion', {
      enumerable: true,
      get() {
        calls++;
        return 'TEST_ARCHIVE_V1';
      },
    });
    await expect(read(a.input)).rejects.toMatchObject({
      code: 'ARCHIVE_INPUT_ACCESSOR',
    });
    expect(calls).toBe(0);
  });
  it('extra top-level provider/registry/World overrides cannot enter F', async () => {
    const a = await archive();
    await expect(
      read({ ...a.input, provider: () => true } as unknown as Input),
    ).rejects.toMatchObject({ code: 'ARCHIVE_INPUT_KEYS' });
    await expect(
      read({
        ...a.input,
        context: { ...a.input.context, declaredInput: {} },
      } as unknown as Input),
    ).rejects.toMatchObject({ code: 'ARCHIVE_INPUT_KEYS' });
  });
  it('cloned registry is not a genuine context', async () => {
    const a = await archive();
    await expect(
      read({
        ...a.input,
        context: { ...a.input.context, registry: structuredClone(registry) },
      }),
    ).rejects.toMatchObject({ code: 'GENUINE_REGISTRY_REQUIRED' });
  });
  it.each([
    '../escape.json',
    '/absolute.json',
    'docs//x.json',
    'docs/./x.json',
    'docs\\x.json',
  ])('denies unsafe relative locator %s', async (locator) => {
    const a = await archive();
    a.nav.documents[0]!.relativeLocator = locator;
    await a.seal();
    const spy = vi.spyOn(consumer, 'readEntityCashCountrySourceSlice');
    denied(await read(a.input), 'ARCHIVE_PATH_DENIED');
    expect(spy).not.toHaveBeenCalled();
  });
  it('denies final symlink before opening source bytes', async () => {
    const a = await archive(),
      file = path.join(a.root, a.nav.documents[0]!.relativeLocator);
    await native.rename(file, file + '.retained');
    await native.symlink(file + '.retained', file);
    const r = await read(a.input);
    denied(r, 'ARCHIVE_REGULAR_FILE_REQUIRED');
    expect(
      r.io.reads.filter((x) => x.phase === 'document')[0]!.actualBytesRead,
    ).toBe(0);
  });
  it('denies symlink parent and noncanonical root', async () => {
    const a = await archive();
    await native.rename(
      path.join(a.root, 'docs'),
      path.join(a.root, 'original'),
    );
    await native.symlink(
      path.join(a.root, 'original'),
      path.join(a.root, 'docs'),
    );
    denied(await read(a.input), 'ARCHIVE_PARENT_PATH_DENIED');
    a.input.archive.absoluteRoot += '/.';
    await expect(read(a.input)).rejects.toMatchObject({
      code: 'ARCHIVE_ROOT_DENIED',
    });
  });
  it('opened file replacement is detected, only one same-pin fresh attempt', async () => {
    const a = await archive(),
      target = path.join(a.root, a.nav.documents[0]!.relativeLocator);
    let changes = 0;
    vi.mocked(fs.open).mockImplementation(async (file, flags, mode) => {
      const handle = await native.open(file, flags, mode);
      if (String(file) === target && changes++ === 0) {
        const bytes = await native.readFile(target);
        await native.rename(target, target + '.retained');
        await native.writeFile(target, bytes);
      }
      return handle;
    });
    const spy = vi.spyOn(consumer, 'readEntityCashCountrySourceSlice');
    const r = await read(a.input);
    expect(r.io.attempts).toBe(2);
    expect(r.rows[0]!.disposition).toBe('DECLARATION_READ');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(
      r.io.reads.some((x) => x.attempt === 1 && x.phase === 'document'),
    ).toBe(true);
    expect(r.io.actualBytesRead).toBe(
      3 * a.input.archive.manifest.byteLength + a.nav.documents[0]!.byteLength,
    );
  });
  it('repeated opened-file identity instability stops after attempt two, zero calls', async () => {
    const a = await archive(),
      target = path.join(a.root, a.nav.documents[0]!.relativeLocator);
    let n = 0;
    vi.mocked(fs.open).mockImplementation(async (file, flags, mode) => {
      const handle = await native.open(file, flags, mode);
      if (String(file) === target) {
        const bytes = await native.readFile(target);
        await native.rename(target, target + '.retained' + n++);
        await native.writeFile(target, bytes);
      }
      return handle;
    });
    const spy = vi.spyOn(consumer, 'readEntityCashCountrySourceSlice');
    const r = await read(a.input);
    denied(r, 'ARCHIVE_BYTES_CHANGED_RETRY');
    expect(r.io.attempts).toBe(2);
    expect(spy).not.toHaveBeenCalled();
    expect(r.io.actualBytesRead).toBe(2 * a.input.archive.manifest.byteLength);
  });
  it('parent descriptor replacement is detected, not treated as stable last-component NOFOLLOW', async () => {
    const a = await archive(),
      target = path.join(a.root, a.nav.documents[0]!.relativeLocator);
    let replaced = false;
    vi.mocked(fs.open).mockImplementation(async (file, flags, mode) => {
      const handle = await native.open(file, flags, mode);
      if (String(file) === target && !replaced) {
        replaced = true;
        await native.rename(
          path.join(a.root, 'docs'),
          path.join(a.root, 'retained-docs'),
        );
        await native.symlink(
          path.join(a.root, 'retained-docs'),
          path.join(a.root, 'docs'),
        );
      }
      return handle;
    });
    const spy = vi.spyOn(consumer, 'readEntityCashCountrySourceSlice');
    const r = await read(a.input);
    denied(r, 'ARCHIVE_PARENT_PATH_DENIED');
    expect(r.io.attempts).toBe(2);
    expect(spy).not.toHaveBeenCalled();
  });
  it('short and sentinel-detected overlong source are explicit errors, exact actual I/O retained', async () => {
    for (const extra of [-1, 1]) {
      const a = await archive(),
        d = a.nav.documents[0]!;
      const filename = path.join(a.root, d.relativeLocator);
      const old = await native.readFile(filename);
      await native.writeFile(
        filename,
        extra === 1
          ? Buffer.concat([old, Buffer.from('!')])
          : old.subarray(0, old.length - 1),
      );
      const r = await read(a.input);
      denied(r, 'ARCHIVE_FILE_SIZE_MISMATCH');
      const receipt = r.io.reads.find((x) => x.phase === 'document')!;
      expect(receipt.actualBytesRead).toBe(d.byteLength + extra);
      expect(receipt.sentinelBytesRead).toBe(extra === 1 ? 1 : 0);
      expect(r.io.actualBytesRead).toBe(
        2 * a.input.archive.manifest.byteLength + d.byteLength + extra,
      );
    }
  });
  it('invalid UTF8 is rejected before F even with exact raw pin', async () => {
    const a = await archive(),
      d = a.nav.documents[0]!;
    const bytes = Buffer.from([0xc3, 0x28]);
    await native.writeFile(path.join(a.root, d.relativeLocator), bytes);
    d.byteLength = bytes.length;
    d.fullRawSha256 = sha(bytes);
    await a.seal();
    const spy = vi.spyOn(consumer, 'readEntityCashCountrySourceSlice');
    denied(await read(a.input), 'ARCHIVE_UTF8_INVALID');
    expect(spy).not.toHaveBeenCalled();
  });
  it('real/H-D/unknown representation is not relabelled to enter F', async () => {
    const a = await archive(),
      d = a.nav.documents[0]!;
    const body = a.bodies.get(d.documentId)!;
    body.sourceNature = 'ACTUAL_SOURCE_NOT_SYNTHETIC';
    await a.rewrite(d.documentId);
    const spy = vi.spyOn(consumer, 'readEntityCashCountrySourceSlice');
    denied(await read(a.input), 'UNSUPPORTED_REPRESENTATION_NOT_RELABELLED');
    expect(spy).not.toHaveBeenCalled();
    a.nav.entries[0]!.recordSelections[0]!.sourceSchema =
      'HD_RECORD_ONLY_DRAFT';
    await a.seal();
    denied(await read(a.input), 'UNSUPPORTED_REPRESENTATION_NOT_RELABELLED');
    expect(spy).not.toHaveBeenCalled();
  });
  it('known A schema claim with a different pin does not imitate frozen constructed source', async () => {
    const a = await archive(),
      d = a.nav.documents[0]!;
    const fake = JSON.stringify({
      schemaVersion: 'A_B06_C01_TYPED_SOURCE_ISSUANCE_ADMISSION_CHAIN_V1',
      classification: 'CONSTRUCTED_NOT_ADOPTED',
      newSourceLeaves: [],
    });
    await native.writeFile(path.join(a.root, d.relativeLocator), fake);
    d.byteLength = Buffer.byteLength(fake);
    d.fullRawSha256 = sha(fake);
    d.classification = 'CONSTRUCTED_CANDIDATE';
    d.declaredNature = 'A_FROZEN_CONSTRUCTED_HOLDING_SUMMARY';
    a.nav.entries[0]!.recordSelections.forEach((s) => {
      s.sourceSchema = 'A_TYPED_HOLDING_REFERENCE_V1';
    });
    await a.seal();
    denied(await read(a.input), 'UNSUPPORTED_REPRESENTATION_NOT_RELABELLED');
  });
  it.each([
    'archiveVersion',
    'definitionVersion',
    'duplicate-document',
    'duplicate-entry',
    'foreign-register',
    'missing-document',
    'bad-source-json',
    'bad-manifest-json',
  ] as const)(
    'explicitly rejects %s, never drops the requested ID',
    async (kind) => {
      const a = await archive(),
        d = a.nav.documents[0]!;
      if (kind === 'archiveVersion') a.nav.archiveVersion = 'OTHER';
      if (kind === 'definitionVersion') a.nav.definitionVersion = 'OTHER';
      if (kind === 'duplicate-document') a.nav.documents.push({ ...d });
      if (kind === 'duplicate-entry')
        a.nav.entries.push(structuredClone(a.nav.entries[0]!));
      if (kind === 'foreign-register')
        a.nav.entries[0]!.registerSelections[0]!.stableId = id(hh);
      if (kind === 'missing-document') a.nav.documents = [];
      if (kind === 'bad-source-json') {
        await native.writeFile(path.join(a.root, d.relativeLocator), '{');
        d.byteLength = 1;
        d.fullRawSha256 = sha('{');
      }
      await a.seal();
      if (kind === 'bad-manifest-json') {
        await native.writeFile(path.join(a.root, 'navigation.json'), '{');
        a.input.archive.manifest.byteLength = 1;
        a.input.archive.manifest.sha256 = sha('{');
      }
      const spy = vi.spyOn(consumer, 'readEntityCashCountrySourceSlice');
      const r = await read(a.input);
      expect(r.rows).toHaveLength(1);
      expect(r.rows[0]!.disposition).toBe('INVALID_ARCHIVE_OR_SOURCE');
      expect(r.rows[0]!.error).not.toBeNull();
      expect(spy).not.toHaveBeenCalled();
    },
  );
  it('same identity/version with conflicting pin is rejected before source reads', async () => {
    const a = await archive(),
      d = a.nav.documents[0]!;
    a.nav.documents.push({
      ...d,
      documentId: 'OTHER_ID',
      fullRawSha256: '0'.repeat(64),
    });
    await a.seal();
    const r = await read(a.input);
    denied(r, 'ARCHIVE_DOCUMENT_VERSION_PIN_CONFLICT');
    expect(r.io.reads.filter((x) => x.phase === 'document')).toHaveLength(0);
  });
  it('bounds manifest/document lengths before allocation or source read', async () => {
    const a = await archive();
    a.input.archive.manifest.byteLength = 131073;
    await expect(read(a.input)).rejects.toMatchObject({
      code: 'ARCHIVE_PIN_OR_BUDGET_INVALID',
    });
    await a.seal();
    a.nav.documents[0]!.byteLength = 2097153;
    await a.seal();
    denied(await read(a.input), 'ARCHIVE_PIN_OR_BUDGET_INVALID');
  });
  it('rejects duplicate/foreign IDs and identity mismatch before I/O', async () => {
    const a = await archive();
    await expect(
      read({ ...a.input, requestedOriginalIds: [id(gov), id(gov)] }),
    ).rejects.toMatchObject({ code: 'REQUESTED_ID_SCOPE_INVALID' });
    await expect(
      read({
        ...a.input,
        requestedOriginalIds: ['U2544::ENTITY::ENTITY_GOVERNMENT_02::account'],
      }),
    ).rejects.toMatchObject({ code: 'REQUESTED_ID_SCOPE_INVALID' });
    (a.input.context.originalFields[0] as { ownerId: string }).ownerId = hh;
    await expect(read(a.input)).rejects.toMatchObject({
      code: 'ORIGINAL_FIELD_SCOPE_INVALID',
    });
  });
  it('retries never switch to latest/new pin and manifest rereads are charged', async () => {
    const a = await archive(),
      target = path.join(a.root, 'navigation.json');
    let count = 0;
    vi.mocked(fs.open).mockImplementation(async (file, flags, mode) => {
      if (String(file) === target && ++count === 2) {
        const other = JSON.stringify({
          ...a.nav,
          archiveVersion: 'NEWER_NOT_AUTHORIZED',
        });
        await native.writeFile(target, other);
      }
      return native.open(file, flags, mode);
    });
    const spy = vi.spyOn(consumer, 'readEntityCashCountrySourceSlice');
    const r = await read(a.input);
    expect(r.io.attempts).toBe(2);
    expect(spy).not.toHaveBeenCalled();
    expect(r.rows[0]!.error).not.toBeNull();
    expect(
      r.io.reads.filter((x) => x.phase.startsWith('manifest')).length,
    ).toBeGreaterThanOrEqual(3);
    expect(r.io.actualBytesRead).toBe(
      r.io.reads.reduce((s, x) => s + x.actualBytesRead, 0),
    );
  });
  it('selected unique byte budget fails before opening any document', async () => {
    const a = await archive(),
      base = a.nav.documents[0]!;
    a.nav.documents = Array.from({ length: 5 }, (_, i) => ({
      ...base,
      documentId: 'DOC_' + i,
      relativeLocator: 'docs/huge_' + i + '.json',
      byteLength: 2097152,
    }));
    a.nav.entries[0]!.recordSelections = a.nav.documents.map((d) => ({
      role: 'TGA_ASSET',
      sourceSchema: 'NORMALIZED_TYPED_ACCOUNT_V1',
      documentId: d.documentId,
      pointer: '/records/0',
    }));
    a.nav.entries[0]!.registerSelections = [];
    await a.seal();
    const spy = vi.spyOn(consumer, 'readEntityCashCountrySourceSlice');
    const r = await read(a.input);
    denied(r, 'ARCHIVE_SELECTED_UNIQUE_BYTE_BUDGET');
    expect(r.io.reads.filter((x) => x.phase === 'document')).toHaveLength(0);
    expect(spy).not.toHaveBeenCalled();
  });
  it('unavailable selected file is explicit zero-call failure, not omitted', async () => {
    const a = await archive();
    await native.rm(path.join(a.root, a.nav.documents[0]!.relativeLocator));
    const spy = vi.spyOn(consumer, 'readEntityCashCountrySourceSlice');
    denied(await read(a.input), 'ARCHIVE_FILE_UNAVAILABLE');
    expect(spy).not.toHaveBeenCalled();
  });
  it('wrong owner declaration retains existing F shape issue, no copied role policy', async () => {
    const a = await archive(),
      d = a.nav.documents[0]!;
    a.bodies.get(d.documentId)!.records[0]!.ownerId = hh;
    await a.rewrite(d.documentId);
    const spy = vi.spyOn(consumer, 'readEntityCashCountrySourceSlice');
    const r = await read(a.input);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(r.rows[0]!.disposition).toBe('INCOMPLETE_DECLARATION');
    expect(r.rows[0]!.typedRow!.shapeIssues).toContain(
      'TGA_ASSET:ROLE_ownerId_MISMATCH',
    );
  });
  it('sole runtime export offers no constructor/grant/accepted stub', async () => {
    const module =
      await import('../../apps/world-worker/src/preparation/b06-country01-typed-archive-source-read.js');
    expect(Object.keys(module)).toEqual([
      'readB06TypedArchiveCountrySourceSlice',
    ]);
  });
  it('deterministic same-byte read never creates or writes an identity/receipt', async () => {
    const a = await archive();
    const first = await read(a.input),
      second = await read(a.input);
    expect(second).toEqual(first);
    expect(second.rows[0]!.typedRow!.actualAdmission).toBeNull();
    expect(second.rows[0]!.sourceSlice!.accountIdsIssued).toBe(0);
    expect(second.rows[0]!.sourceSlice).not.toHaveProperty('claimIdsIssued');
    expect(second.rows[0]!.sourceSlice!.sourceAdoption).toBe(false);
  });

  it.skipIf(process.env.A_S1_ARCHIVE_PRIVATE !== '1')(
    'private pinned A constructed reference: real file bytes -> two witnesses, no account/register',
    async () => {
      const a = await archive(),
        d = a.nav.documents[0]!;
      const original =
        '/Users/samuel/Documents/econclub/.econmind-artifacts/unknown2544-resume-20261021/A/TYPED_SOURCE_ISSUANCE_AND_ADMISSION_CHAIN.json';
      const bytes = await native.readFile(original);
      expect(bytes.length).toBe(30063);
      expect(sha(bytes)).toBe(
        'c426f0d0215f9d410e569a0decf0475978ea0088f1683c6623b6b3b7551dbc56',
      );
      await native.writeFile(path.join(a.root, d.relativeLocator), bytes);
      d.byteLength = bytes.length;
      d.fullRawSha256 = sha(bytes);
      d.sourceVersion = 'LCFX_CB_REGION_20261013_V2_PROPOSED';
      d.classification = 'CONSTRUCTED_CANDIDATE';
      d.declaredNature = 'A_FROZEN_CONSTRUCTED_HOLDING_SUMMARY';
      a.nav.entries[0]!.recordSelections = [
        {
          role: 'TGA_ASSET',
          sourceSchema: 'A_TYPED_HOLDING_REFERENCE_V1',
          documentId: d.documentId,
          pointer: '/newSourceLeaves/1',
        },
        {
          role: 'TGA_ISSUANCE_LIABILITY',
          sourceSchema: 'A_TYPED_HOLDING_REFERENCE_V1',
          documentId: d.documentId,
          pointer: '/newSourceLeaves/0',
        },
      ];
      a.nav.entries[0]!.registerSelections = [];
      await a.seal();
      const r = await read(a.input);
      expect(r.rows[0]!.consumerCalls).toBe(1);
      expect(r.rows[0]!.typedRow!.sourceReferenceWitnesses).toHaveLength(2);
      expect(r.rows[0]!.disposition).toBe('INCOMPLETE_DECLARATION');
      expect(r.rows[0]!.typedRow!.actualTypedRegisterBinding).toBeNull();
      expect(r.rows[0]!.typedRow!.shapeIssues).toContain(
        'REGISTER_DECLARATION_NOT_SUPPLIED',
      );
      console.info('A_S1_PRIVATE_SOURCE_READ_BYTES', bytes.length);
    },
  );
});
