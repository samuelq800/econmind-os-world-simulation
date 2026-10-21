/** Server preparation file intake only. Integrity/declared shape is not source
 * authority, adoption, account issuance, accepted binding or current permission. */
import { constants, type BigIntStats } from 'node:fs';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import {
  B06_C01_DEFINITION_VERSION,
  B06_C01_ORIGINAL_IDS,
  type B06Country01TypedRole,
  type B06TypedRegisterPreparationInput,
  type inspectB06Country01TypedRegisterPreparation,
} from './b06-country01-typed-register-preparation.js';
import {
  readEntityCashCountrySourceSlice,
  type EntityCashSliceInput,
} from './entity-native-cash-source-slice.js';
import {
  isLoadedFinancialOpeningPackageRegistry,
  parseFinancialRegistrySourceJson,
} from './financial-opening-package-registry.js';
import {
  financialInputSha256,
  freezeFinancialInput,
} from './formal-financial-opening-contract.js';

type Row = Record<string, unknown>;
type TypedInput = Omit<B06TypedRegisterPreparationInput, 'registry'>;
type Slice = ReturnType<typeof readEntityCashCountrySourceSlice>;
type TypedRow = ReturnType<
  typeof inspectB06Country01TypedRegisterPreparation
>['rows'][number];
interface Pin {
  byteLength: number;
  sha256: string;
}
interface ArchiveConfig {
  absoluteRoot: string;
  manifest: Pin & { relativeLocator: string };
  expectedArchiveVersion: string;
}
interface Input {
  readonly archive: ArchiveConfig;
  readonly context: Pick<
    EntityCashSliceInput,
    'registry' | 'mappings' | 'originalFields'
  >;
  readonly requestedOriginalIds: readonly string[];
}
interface Document extends Pin {
  documentId: string;
  relativeLocator: string;
  sourceId: string;
  sourceVersion: string;
  declaredNature: string;
  classification: 'CONSTRUCTED_CANDIDATE' | 'SYNTHETIC_CANDIDATE';
}
interface Entry {
  stableId: string;
  records: TypedInput['records'];
  registers: TypedInput['registers'];
}
interface Navigation {
  archiveVersion: string;
  declaredNativeCurrency: string;
  documents: Document[];
  entries: Entry[];
}
interface Io {
  actualBytesRead: number;
  readCalls: number;
  filesOpened: number;
  attempts: number;
  reads: {
    attempt: number;
    phase: string;
    locator: string;
    byteLimit: number;
    actualBytesRead: number;
    readCalls: number;
    eofProbeCalls: number;
    sentinelBytesRead: number;
  }[];
}
interface FileWitness {
  relativeLocator: string;
  byteLength: number;
  fullRawSha256: string;
  device: string;
  inode: string;
}
interface DocumentRead {
  document: Document;
  bytes: string | null;
  witness: FileWitness | null;
  error: string | null;
}
interface IdRead {
  stableId: string;
  disposition:
    | 'DECLARATION_READ'
    | 'INCOMPLETE_DECLARATION'
    | 'INVALID_ARCHIVE_OR_SOURCE'
    | 'UNSUPPORTED_REPRESENTATION_NOT_RELABELLED';
  consumerCalls: 0 | 1;
  error: string | null;
  sourceSlice: Slice | null;
  typedRow: TypedRow | null;
  selectedDocuments: {
    documentId: string;
    sourceVersion: string;
    relativeLocator: string;
    sha256: string;
    byteLength: number;
    declaredNature: string;
    classification: string;
    witness: FileWitness | null;
  }[];
  recordSelections: TypedInput['records'];
  registerSelections: TypedInput['registers'];
}
class ArchiveInvalid extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'TypedArchiveReadInvalid';
  }
}
const A_PIN =
  'c426f0d0215f9d410e569a0decf0475978ea0088f1683c6623b6b3b7551dbc56';
const MANIFEST_LIMIT = 128 * 1024;
const DOCUMENT_LIMIT = 2 * 1024 * 1024;
const UNIQUE_LIMIT = 8 * 1024 * 1024;
function demand(ok: unknown, code: string): asserts ok {
  if (!ok) throw new ArchiveInvalid(code);
}
function errorCode(error: unknown): string {
  return error instanceof ArchiveInvalid
    ? error.code
    : 'ARCHIVE_FILE_UNAVAILABLE';
}
function object(value: unknown, keys: readonly string[], code: string): Row {
  demand(
    value !== null && typeof value === 'object' && !Array.isArray(value),
    code,
  );
  const r = value as Row;
  demand(Object.keys(r).sort().join('|') === [...keys].sort().join('|'), code);
  return r;
}
function text(value: unknown): string {
  demand(
    typeof value === 'string' &&
      value.length > 0 &&
      value.length <= 1024 &&
      value.trim() === value &&
      !value.includes('\0'),
    'ARCHIVE_TEXT_INVALID',
  );
  return value;
}
/** No accessor is evaluated, including on config/context. The registry is
 * captured separately by identity; all JSON-like caller data is detached. */
function detach(value: unknown, depth = 0): unknown {
  demand(depth <= 24, 'ARCHIVE_INPUT_DEPTH');
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return value;
  if (typeof value === 'number') {
    demand(Number.isFinite(value), 'ARCHIVE_INPUT_INVALID');
    return value;
  }
  demand(value !== null && typeof value === 'object', 'ARCHIVE_INPUT_INVALID');
  demand(
    Array.isArray(value) ||
      Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null,
    'ARCHIVE_INPUT_NOT_PLAIN',
  );
  const descriptors = Object.getOwnPropertyDescriptors(value);
  demand(
    Object.getOwnPropertySymbols(value).length === 0,
    'ARCHIVE_INPUT_SYMBOL',
  );
  for (const d of Object.values(descriptors))
    demand(!d.get && !d.set, 'ARCHIVE_INPUT_ACCESSOR');
  if (Array.isArray(value)) {
    demand(value.length <= 350, 'ARCHIVE_INPUT_ARRAY_BUDGET');
    return Array.from({ length: value.length }, (_, i) => {
      const d = descriptors[String(i)];
      demand(d && 'value' in d, 'ARCHIVE_INPUT_SPARSE_ARRAY');
      return detach(d.value, depth + 1);
    });
  }
  demand(Object.keys(descriptors).length <= 32, 'ARCHIVE_INPUT_KEY_BUDGET');
  return Object.fromEntries(
    Object.entries(descriptors).map(([k, d]) => [
      k,
      detach(d.value, depth + 1),
    ]),
  );
}
function data(value: unknown, keys: readonly string[]): Row {
  demand(
    value !== null && typeof value === 'object' && !Array.isArray(value),
    'ARCHIVE_INPUT_INVALID',
  );
  const descriptors = Object.getOwnPropertyDescriptors(value);
  demand(
    Object.getOwnPropertySymbols(value).length === 0 &&
      Object.keys(descriptors).sort().join('|') === [...keys].sort().join('|'),
    'ARCHIVE_INPUT_KEYS',
  );
  for (const d of Object.values(descriptors))
    demand('value' in d && !d.get && !d.set, 'ARCHIVE_INPUT_ACCESSOR');
  return Object.fromEntries(
    Object.entries(descriptors).map(([k, d]) => [k, d.value]),
  );
}
function relative(value: unknown): string {
  const s = text(value);
  demand(
    s.length <= 512 &&
      !path.isAbsolute(s) &&
      !s.includes('\\') &&
      s.split('/').every((p) => p !== '' && p !== '.' && p !== '..'),
    'ARCHIVE_PATH_DENIED',
  );
  return s;
}
function pin(r: Row, max: number): Pin {
  demand(
    Number.isSafeInteger(r.byteLength) &&
      Number(r.byteLength) > 0 &&
      Number(r.byteLength) <= max &&
      typeof r.sha256 === 'string' &&
      /^[0-9a-f]{64}$/u.test(r.sha256),
    'ARCHIVE_PIN_OR_BUDGET_INVALID',
  );
  return { byteLength: r.byteLength as number, sha256: r.sha256 };
}
function array(value: unknown, max: number): unknown[] {
  demand(Array.isArray(value) && value.length <= max, 'ARCHIVE_ARRAY_BUDGET');
  return value;
}
function snapshot(input: Input) {
  const top = data(input, ['archive', 'context', 'requestedOriginalIds']);
  const ctx = data(top.context, ['registry', 'mappings', 'originalFields']);
  const registry = ctx.registry;
  demand(
    isLoadedFinancialOpeningPackageRegistry(registry),
    'GENUINE_REGISTRY_REQUIRED',
  );
  const a = object(
    detach(top.archive),
    ['absoluteRoot', 'manifest', 'expectedArchiveVersion'],
    'ARCHIVE_CONFIG_INVALID',
  );
  const root = text(a.absoluteRoot);
  demand(
    path.isAbsolute(root) &&
      path.resolve(root) === root &&
      root !== path.parse(root).root,
    'ARCHIVE_ROOT_DENIED',
  );
  const m = object(
    a.manifest,
    ['relativeLocator', 'byteLength', 'sha256'],
    'ARCHIVE_PIN_INVALID',
  );
  const archive = {
    absoluteRoot: root,
    expectedArchiveVersion: text(a.expectedArchiveVersion),
    manifest: {
      relativeLocator: relative(m.relativeLocator),
      ...pin(m, MANIFEST_LIMIT),
    },
  };
  const ids = array(detach(top.requestedOriginalIds), 5).map(text);
  demand(
    ids.length > 0 &&
      new Set(ids).size === ids.length &&
      ids.every((id) => B06_C01_ORIGINAL_IDS.includes(id)),
    'REQUESTED_ID_SCOPE_INVALID',
  );
  const mappings = object(
    detach(ctx.mappings),
    ['documentId', 'bytes', 'sha256'],
    'ARCHIVE_MAPPING_INVALID',
  );
  demand(
    typeof mappings.bytes === 'string' &&
      Buffer.byteLength(mappings.bytes) <= 1024 * 1024 &&
      financialInputSha256(mappings.bytes) === mappings.sha256,
    'MAPPING_PIN_MISMATCH',
  );
  text(mappings.documentId);
  const originals = array(detach(ctx.originalFields), 10).map((v) =>
    object(
      v,
      ['stableId', 'ownerId', 'countryId', 'missingField'],
      'ORIGINAL_FIELD_INVALID',
    ),
  );
  const selected = ids.map((id) => {
    const rows = originals.filter((r) => r.stableId === id);
    demand(rows.length === 1, 'ORIGINAL_FIELD_UNIQUE_REQUIRED');
    const r = rows[0]!;
    demand(
      r.countryId === 'COUNTRY_01' &&
        r.missingField === 'account' &&
        r.stableId === `U2544::ENTITY::${String(r.ownerId)}::account`,
      'ORIGINAL_FIELD_SCOPE_INVALID',
    );
    return {
      stableId: id,
      ownerId: text(r.ownerId),
      countryId: 'COUNTRY_01',
      missingField: 'account' as const,
    };
  });
  // Never deep-copy or deep-freeze the branded registry through a DTO.
  return {
    registry,
    archive: freezeFinancialInput(archive),
    ids: Object.freeze(ids),
    mappings: freezeFinancialInput(
      mappings as unknown as EntityCashSliceInput['mappings'],
    ),
    originals: freezeFinancialInput(selected),
  };
}
function sameIdentity(a: BigIntStats, b: BigIntStats): boolean {
  return a.dev === b.dev && a.ino === b.ino && a.mode === b.mode;
}
function sameFile(a: BigIntStats, b: BigIntStats): boolean {
  return (
    sameIdentity(a, b) &&
    a.size === b.size &&
    a.mtimeNs === b.mtimeNs &&
    a.ctimeNs === b.ctimeNs
  );
}
type Parent = { location: string; handle: fs.FileHandle; stat: BigIntStats };
async function parentChain(filename: string): Promise<Parent[]> {
  const result: Parent[] = [];
  try {
    let current = path.parse(filename).root;
    const parts = path
      .dirname(filename)
      .slice(current.length)
      .split('/')
      .filter(Boolean);
    for (const part of ['', ...parts]) {
      current = part === '' ? current : path.join(current, part);
      const before = await fs.lstat(current, { bigint: true });
      demand(
        before.isDirectory() && !before.isSymbolicLink(),
        'ARCHIVE_PARENT_PATH_DENIED',
      );
      const handle = await fs.open(
        current,
        constants.O_RDONLY |
          constants.O_NONBLOCK |
          constants.O_NOFOLLOW |
          constants.O_DIRECTORY,
      );
      let opened: BigIntStats;
      try {
        opened = await handle.stat({ bigint: true });
      } catch (error) {
        await handle.close();
        throw error;
      }
      result.push({ location: current, handle, stat: opened });
      demand(
        opened.isDirectory() && sameIdentity(before, opened),
        'ARCHIVE_BYTES_CHANGED_RETRY',
      );
    }
    await checkParents(result);
    return result;
  } catch (error) {
    await Promise.all(result.map((p) => p.handle.close()));
    throw error;
  }
}
async function checkParents(parents: Parent[]): Promise<void> {
  for (const parent of parents) {
    let named: BigIntStats;
    try {
      named = await fs.lstat(parent.location, { bigint: true });
    } catch {
      throw new ArchiveInvalid('ARCHIVE_BYTES_CHANGED_RETRY');
    }
    const opened = await parent.handle.stat({ bigint: true });
    demand(
      named.isDirectory() &&
        !named.isSymbolicLink() &&
        sameIdentity(named, parent.stat) &&
        sameIdentity(opened, parent.stat),
      'ARCHIVE_BYTES_CHANGED_RETRY',
    );
  }
}
/** Parent descriptors and named paths plus final opened identity are checked
 * before and after byte reads. This is not a claim of openat/atomic traversal. */
async function readPinned(
  root: string,
  locator: string,
  expected: Pin,
  io: Io,
  phase: string,
): Promise<{ bytes: string; witness: FileWitness }> {
  demand(
    process.platform !== 'win32' &&
      constants.O_NOFOLLOW > 0 &&
      constants.O_NONBLOCK > 0 &&
      constants.O_DIRECTORY > 0,
    'ARCHIVE_SAFE_FILE_OPEN_UNSUPPORTED',
  );
  demand((await fs.realpath(root)) === root, 'ARCHIVE_ROOT_DENIED');
  const filename = path.join(root, locator);
  const parents = await parentChain(filename);
  let file: fs.FileHandle | null = null;
  const receipt = {
    attempt: io.attempts,
    phase,
    locator,
    byteLimit: expected.byteLength + 1,
    actualBytesRead: 0,
    readCalls: 0,
    eofProbeCalls: 0,
    sentinelBytesRead: 0,
  };
  io.reads.push(receipt);
  try {
    const named = await fs.lstat(filename, { bigint: true });
    demand(
      named.isFile() && !named.isSymbolicLink(),
      'ARCHIVE_REGULAR_FILE_REQUIRED',
    );
    file = await fs.open(
      filename,
      constants.O_RDONLY | constants.O_NONBLOCK | constants.O_NOFOLLOW,
    );
    io.filesOpened++;
    const before = await file.stat({ bigint: true });
    demand(
      before.isFile() && sameFile(named, before),
      'ARCHIVE_BYTES_CHANGED_RETRY',
    );
    await checkParents(parents);
    demand(
      sameFile(before, await fs.lstat(filename, { bigint: true })),
      'ARCHIVE_BYTES_CHANGED_RETRY',
    );
    // File-reported size never controls allocation. The pin controls length+1.
    const buffer = Buffer.alloc(expected.byteLength + 1);
    let offset = 0;
    while (offset < buffer.length) {
      receipt.readCalls++;
      io.readCalls++;
      if (offset >= expected.byteLength) receipt.eofProbeCalls++;
      const read = await file.read(
        buffer,
        offset,
        buffer.length - offset,
        offset,
      );
      offset += read.bytesRead;
      receipt.sentinelBytesRead = Math.max(0, offset - expected.byteLength);
      receipt.actualBytesRead += read.bytesRead;
      io.actualBytesRead += read.bytesRead;
      if (!read.bytesRead) break;
    }
    const after = await file.stat({ bigint: true });
    await checkParents(parents);
    const finalNamed = await fs.lstat(filename, { bigint: true });
    demand(
      sameFile(before, after) && sameFile(after, finalNamed),
      'ARCHIVE_BYTES_CHANGED_RETRY',
    );
    demand(
      offset === expected.byteLength &&
        after.size === BigInt(expected.byteLength),
      'ARCHIVE_FILE_SIZE_MISMATCH',
    );
    const raw = buffer.subarray(0, offset);
    let bytes: string;
    try {
      bytes = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
        raw,
      );
    } catch {
      throw new ArchiveInvalid('ARCHIVE_UTF8_INVALID');
    }
    demand(Buffer.from(bytes, 'utf8').equals(raw), 'ARCHIVE_UTF8_INVALID');
    demand(
      financialInputSha256(bytes) === expected.sha256,
      'ARCHIVE_FILE_HASH_MISMATCH',
    );
    return {
      bytes,
      witness: {
        relativeLocator: locator,
        byteLength: offset,
        fullRawSha256: expected.sha256,
        device: after.dev.toString(),
        inode: after.ino.toString(),
      },
    };
  } finally {
    if (file) await file.close();
    await Promise.all(parents.map((p) => p.handle.close()));
  }
}
function parseNavigation(bytes: string, expectedVersion: string): Navigation {
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes);
  } catch {
    throw new ArchiveInvalid('ARCHIVE_NAVIGATION_JSON_INVALID');
  }
  const r = object(
    parsed,
    [
      'schemaVersion',
      'nature',
      'archiveVersion',
      'definitionVersion',
      'declaredNativeCurrency',
      'documents',
      'entries',
    ],
    'ARCHIVE_NAVIGATION_SCHEMA_INVALID',
  );
  demand(
    r.schemaVersion === 'b06-typed-archive-navigation-v1' &&
      r.nature === 'DECLARATION_NAVIGATION_NOT_ADOPTION',
    'ARCHIVE_NAVIGATION_SCHEMA_INVALID',
  );
  demand(r.archiveVersion === expectedVersion, 'ARCHIVE_VERSION_MISMATCH');
  demand(
    r.definitionVersion === B06_C01_DEFINITION_VERSION,
    'DEFINITION_VERSION_MISMATCH',
  );
  const documents = array(r.documents, 16).map((v) => {
    const d = object(
      v,
      [
        'documentId',
        'relativeLocator',
        'byteLength',
        'fullRawSha256',
        'sourceId',
        'sourceVersion',
        'declaredNature',
        'classification',
      ],
      'ARCHIVE_DOCUMENT_SCHEMA_INVALID',
    );
    return {
      documentId: text(d.documentId),
      relativeLocator: relative(d.relativeLocator),
      ...pin(
        { byteLength: d.byteLength, sha256: d.fullRawSha256 },
        DOCUMENT_LIMIT,
      ),
      sourceId: text(d.sourceId),
      sourceVersion: text(d.sourceVersion),
      declaredNature: text(d.declaredNature),
      classification: text(d.classification) as Document['classification'],
    };
  });
  demand(
    new Set(documents.map((d) => d.documentId)).size === documents.length,
    'ARCHIVE_DOCUMENT_ID_CONFLICT',
  );
  const locators = new Map<string, string>();
  for (const d of documents) {
    const identity = JSON.stringify([d.sourceVersion, d.sha256, d.byteLength]);
    demand(
      !locators.has(d.relativeLocator) ||
        locators.get(d.relativeLocator) === identity,
      'ARCHIVE_DOCUMENT_VERSION_PIN_CONFLICT',
    );
    locators.set(d.relativeLocator, identity);
  }
  const entries = array(r.entries, 5).map((v) => {
    const e = object(
      v,
      ['stableId', 'recordSelections', 'registerSelections'],
      'ARCHIVE_ENTRY_INVALID',
    );
    const stableId = text(e.stableId);
    demand(
      B06_C01_ORIGINAL_IDS.includes(stableId),
      'ARCHIVE_ENTRY_SCOPE_INVALID',
    );
    const records = array(e.recordSelections, 8).map((s) => {
      const q = object(
        s,
        ['role', 'sourceSchema', 'documentId', 'pointer'],
        'ARCHIVE_SELECTOR_INVALID',
      );
      return {
        role: text(q.role) as B06Country01TypedRole,
        sourceSchema: text(
          q.sourceSchema,
        ) as TypedInput['records'][number]['sourceSchema'],
        documentId: text(q.documentId),
        pointer: text(q.pointer),
      };
    });
    const registers = array(e.registerSelections, 5).map((s) => {
      const q = object(
        s,
        ['stableId', 'documentId', 'pointer'],
        'ARCHIVE_SELECTOR_INVALID',
      );
      demand(q.stableId === stableId, 'ARCHIVE_REGISTER_FOREIGN_ID');
      return {
        stableId,
        documentId: text(q.documentId),
        pointer: text(q.pointer),
      };
    });
    return { stableId, records, registers };
  });
  demand(
    new Set(entries.map((e) => e.stableId)).size === entries.length,
    'ARCHIVE_ENTRY_DUPLICATE',
  );
  return freezeFinancialInput({
    archiveVersion: expectedVersion,
    declaredNativeCurrency: text(r.declaredNativeCurrency),
    documents,
    entries,
  });
}
function representation(
  d: Document,
  bytes: string,
  selectors: TypedInput['records'],
): string | null {
  if (
    !['CONSTRUCTED_CANDIDATE', 'SYNTHETIC_CANDIDATE'].includes(d.classification)
  )
    return 'UNSUPPORTED_REPRESENTATION_NOT_RELABELLED';
  if (
    selectors.some(
      (s) =>
        ![
          'A_TYPED_HOLDING_REFERENCE_V1',
          'NORMALIZED_TYPED_ACCOUNT_V1',
        ].includes(s.sourceSchema),
    )
  )
    return 'UNSUPPORTED_REPRESENTATION_NOT_RELABELLED';
  let root: Row;
  try {
    const parsed = parseFinancialRegistrySourceJson(bytes);
    demand(
      parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed),
      'ARCHIVE_SOURCE_JSON_INVALID',
    );
    root = parsed as Row;
  } catch {
    return 'ARCHIVE_SOURCE_JSON_INVALID';
  }
  if (
    root.schemaVersion === 'A_B06_C01_TYPED_SOURCE_ISSUANCE_ADMISSION_CHAIN_V1'
  ) {
    return d.sha256 === A_PIN &&
      d.byteLength === 30063 &&
      root.classification === 'CONSTRUCTED_NOT_ADOPTED' &&
      d.classification === 'CONSTRUCTED_CANDIDATE' &&
      d.declaredNature === 'A_FROZEN_CONSTRUCTED_HOLDING_SUMMARY' &&
      selectors.every((s) => s.sourceSchema === 'A_TYPED_HOLDING_REFERENCE_V1')
      ? null
      : 'UNSUPPORTED_REPRESENTATION_NOT_RELABELLED';
  }
  return root.classification === d.classification &&
    root.sourceNature === d.declaredNature &&
    ((d.declaredNature === 'SYNTHETIC_DECLARATION' &&
      d.classification === 'SYNTHETIC_CANDIDATE') ||
      (d.declaredNature === 'CONSTRUCTED_SCENARIO_DECLARATION' &&
        d.classification === 'CONSTRUCTED_CANDIDATE')) &&
    selectors.every((s) => s.sourceSchema === 'NORMALIZED_TYPED_ACCOUNT_V1')
    ? null
    : 'UNSUPPORTED_REPRESENTATION_NOT_RELABELLED';
}
function failedRow(stableId: string, error: string, entry?: Entry): IdRead {
  return {
    stableId,
    disposition:
      error === 'UNSUPPORTED_REPRESENTATION_NOT_RELABELLED'
        ? 'UNSUPPORTED_REPRESENTATION_NOT_RELABELLED'
        : 'INVALID_ARCHIVE_OR_SOURCE',
    consumerCalls: 0,
    error,
    sourceSlice: null,
    typedRow: null,
    selectedDocuments: [],
    recordSelections: entry?.records ?? [],
    registerSelections: entry?.registers ?? [],
  };
}
function documentKey(d: Document): string {
  return JSON.stringify([
    d.relativeLocator,
    d.sourceVersion,
    d.sha256,
    d.byteLength,
  ]);
}

/** Only runtime export. It cannot install, grant or return accepted authority.
 * All caller data except the genuine registry reference is captured before I/O. */
export async function readB06TypedArchiveCountrySourceSlice(input: Input) {
  const captured = snapshot(input);
  const { registry, archive, ids, mappings, originals } = captured;
  const io: Io = {
    actualBytesRead: 0,
    readCalls: 0,
    filesOpened: 0,
    attempts: 0,
    reads: [],
  };
  let globalError: string | null = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    io.attempts = attempt;
    try {
      const first = await readPinned(
        archive.absoluteRoot,
        archive.manifest.relativeLocator,
        archive.manifest,
        io,
        'manifest-before',
      );
      const nav = parseNavigation(first.bytes, archive.expectedArchiveVersion);
      const entries = ids.map(
        (id) =>
          nav.entries.find((e) => e.stableId === id) ?? {
            stableId: id,
            records: [],
            registers: [],
          },
      );
      const needed = new Set(
        entries.flatMap((e) =>
          [...e.records, ...e.registers].map((s) => s.documentId),
        ),
      );
      const selected = nav.documents.filter((d) => needed.has(d.documentId));
      const cache = new Map<
        string,
        Awaited<ReturnType<typeof readPinned>> | string
      >();
      const uniqueDocuments = new Map(selected.map((d) => [documentKey(d), d]));
      const uniqueBytes = [...uniqueDocuments.values()].reduce(
        (sum, d) => sum + d.byteLength,
        0,
      );
      demand(
        uniqueBytes <= UNIQUE_LIMIT,
        'ARCHIVE_SELECTED_UNIQUE_BYTE_BUDGET',
      );
      for (const [key, d] of uniqueDocuments) {
        try {
          cache.set(
            key,
            await readPinned(
              archive.absoluteRoot,
              d.relativeLocator,
              d,
              io,
              'document',
            ),
          );
        } catch (error) {
          const code = errorCode(error);
          if (code === 'ARCHIVE_BYTES_CHANGED_RETRY') throw error;
          cache.set(key, code);
        }
      }
      const documents: DocumentRead[] = selected.map((document) => {
        const value = cache.get(documentKey(document))!;
        return typeof value === 'string'
          ? { document, bytes: null, witness: null, error: value }
          : {
              document,
              bytes: value.bytes,
              witness: value.witness,
              error: null,
            };
      });
      let last: Awaited<ReturnType<typeof readPinned>>;
      try {
        last = await readPinned(
          archive.absoluteRoot,
          archive.manifest.relativeLocator,
          archive.manifest,
          io,
          'manifest-after',
        );
      } catch {
        throw new ArchiveInvalid('ARCHIVE_BYTES_CHANGED_RETRY');
      }
      demand(
        first.bytes === last.bytes &&
          first.witness.device === last.witness.device &&
          first.witness.inode === last.witness.inode,
        'ARCHIVE_BYTES_CHANGED_RETRY',
      );
      // No F call occurs until all attempt-local bytes and manifest are stable.
      const rows: IdRead[] = entries.map((entry, index) => {
        const referenced = [...entry.records, ...entry.registers].map(
          (s) => s.documentId,
        );
        const selectedReads = documents.filter((d) =>
          referenced.includes(d.document.documentId),
        );
        let invalid = referenced.some(
          (id) => !nav.documents.some((d) => d.documentId === id),
        )
          ? 'ARCHIVE_SELECTED_DOCUMENT_MISSING'
          : null;
        for (const read of selectedReads) {
          invalid ??= read.error;
          if (read.bytes !== null)
            invalid ??= representation(
              read.document,
              read.bytes,
              entry.records.filter(
                (s) => s.documentId === read.document.documentId,
              ),
            );
        }
        const trace = selectedReads.map((r) => ({
          documentId: r.document.documentId,
          sourceVersion: r.document.sourceVersion,
          relativeLocator: r.document.relativeLocator,
          sha256: r.document.sha256,
          byteLength: r.document.byteLength,
          declaredNature: r.document.declaredNature,
          classification: r.document.classification,
          witness: r.witness,
        }));
        if (invalid)
          return {
            ...failedRow(entry.stableId, invalid, entry),
            selectedDocuments: trace,
          };
        try {
          const sourceSlice = readEntityCashCountrySourceSlice({
            registry,
            countryId: 'COUNTRY_01',
            mappings,
            originalFields: [originals[index]!],
            declaredInput: null,
            typedRegisterPreparation: {
              adoptedDefinitionVersion: B06_C01_DEFINITION_VERSION,
              requestedOriginalIds: [entry.stableId],
              selectionMode: 'PER_ORIGINAL',
              declaredNativeCurrency: nav.declaredNativeCurrency,
              documents: selectedReads.map((r) => ({
                documentId: r.document.documentId,
                sourceId: r.document.sourceId,
                sourceVersion: r.document.sourceVersion,
                classification: r.document.classification,
                bytes: r.bytes!,
                sha256: r.document.sha256,
                byteLength: r.document.byteLength,
              })),
              records: entry.records,
              registers: entry.registers,
            },
          });
          const originalRow = sourceSlice.rows[0];
          demand(
            originalRow &&
              'typedRegisterPreparation' in originalRow &&
              originalRow.typedRegisterPreparation !== undefined &&
              originalRow.typedRegisterPreparation !== null,
            'F_TYPED_ROW_MISSING',
          );
          const typedRow = originalRow.typedRegisterPreparation;
          return {
            stableId: entry.stableId,
            disposition:
              typedRow.shapeStatus === 'COMPLETE_DECLARED_SHAPE'
                ? 'DECLARATION_READ'
                : 'INCOMPLETE_DECLARATION',
            consumerCalls: 1,
            error: null,
            sourceSlice,
            typedRow,
            selectedDocuments: trace,
            recordSelections: entry.records,
            registerSelections: entry.registers,
          };
        } catch (error) {
          return {
            ...failedRow(
              entry.stableId,
              error instanceof Error
                ? error.message
                : 'F_DECLARATION_READ_REJECTED',
              entry,
            ),
            consumerCalls: 1,
            selectedDocuments: trace,
          };
        }
      });
      return freezeFinancialInput({
        schemaVersion: 'b06-typed-archive-source-read-v1',
        mode: 'DECLARATION_READ_ONLY',
        archiveVersion: nav.archiveVersion,
        archiveManifest: first.witness,
        rows,
        uniqueSelectedByteBudgetUsed: uniqueBytes,
        io,
        sourceNatureVerification:
          'DECLARED_MARKERS_AND_KNOWN_PIN_NOT_HISTORY_OR_ADOPTION',
        sourceAdoption: false,
        originalClosures: 0,
      });
    } catch (error) {
      globalError = errorCode(error);
      if (globalError === 'ARCHIVE_BYTES_CHANGED_RETRY' && attempt === 1)
        continue;
      break;
    }
  }
  return freezeFinancialInput({
    schemaVersion: 'b06-typed-archive-source-read-v1',
    mode: 'DECLARATION_READ_ONLY',
    archiveVersion: archive.expectedArchiveVersion,
    archiveManifest: null,
    rows: ids.map((id) => failedRow(id, globalError!)),
    uniqueSelectedByteBudgetUsed: 0,
    io,
    sourceNatureVerification:
      'DECLARED_MARKERS_AND_KNOWN_PIN_NOT_HISTORY_OR_ADOPTION',
    sourceAdoption: false,
    originalClosures: 0,
  });
}
