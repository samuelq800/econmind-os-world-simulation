/** Private server-owned, read-only file composition. No HTTP/request path,
 * approval issuer, database, bootstrap, publication or startup dependency. */
import { createHash } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import path from 'node:path';
import { canonicalSerialize } from '@econmind/core';
import type { OfficialOpeningSourceBytes } from './official-opening-decision-reconciliation.js';
import {
  loadNonHostOwnerPolicy,
  OWNER_NON_HOST_PINS,
  snapshotFinancialSupplementRegistration,
  type LoadedNonHostOwnerPolicy,
  type FinancialSupplementRegistration,
} from './owner-non-host-source-adoption.js';
import { OFFICIAL_OPENING_RECONCILIATION_PINS } from './official-opening-decision-reconciliation.js';

// File identity pins, not economic rules or permission to use the source.
const P = OFFICIAL_OPENING_RECONCILIATION_PINS;
const PACKAGE_ROOT = 'artifacts/world-balanced-candidate-v1';
const FIXED_FILES = {
  checksums: {
    locator: PACKAGE_ROOT + '/CHECKSUMS.json',
    sha256: P.checksumsSha256,
    bytes: 12967,
  },
  mapping: {
    locator:
      'docs/reports/world-connection/C_OFFICIAL_WORLD_OPENING_MAPPING.json',
    sha256: P.mappingSha256,
    bytes: 29609172,
  },
  coverage: {
    locator:
      'docs/reports/world-connection/C_OFFICIAL_WORLD_COMPLETE_COVERAGE.json',
    sha256: P.coverageSha256,
    bytes: 294812,
  },
  proposal: {
    locator: 'artifacts/E_OPENING_SEMANTIC_MAPPING_PROPOSAL_2026_10_07.md',
    sha256: P.proposalSha256,
    bytes: 17710,
  },
  selection: {
    locator: 'status/world-data-selection.json',
    sha256: '41f5bf1f50b761a2346de4190009ce34ffd13072ae1ed21455931566b3c88541',
    bytes: 2049,
  },
  mapManifest: {
    locator: 'artifacts/world-map-files-v1/manifest.json',
    sha256: '9a83b2de3e0da39dae9e485e8de4be5bf236de26d68937c48c7941d7d50f795f',
    bytes: 38543,
  },
  gaps: {
    locator: 'docs/reports/world-connection/C_OFFICIAL_WORLD_OPENING_GAPS.json',
    sha256: '1254b3c2929e10d3b8a582e032bc22648b04d01236e3098a18a1c39974d46539',
    bytes: 227292,
  },
} as const;
export const OFFICIAL_OPENING_BUNDLE_LIMITS = Object.freeze({
  fileBytes: 32 * 1024 * 1024,
  totalBytes: 96 * 1024 * 1024,
  ownerRecords: 64,
});
export interface OpeningBundleFileIdentity {
  readonly sha256: string;
  readonly bytes: number;
}
/** Provisioned once by reviewed server composition, never read from the bundle.
 * Locations are fixed below; a request cannot supply a path or expected hash.
 * Identity does not establish approval: existing validators inspect all bytes. */
export interface ServerOpeningIncomingManifest {
  readonly decision: OpeningBundleFileIdentity;
  readonly assembly: OpeningBundleFileIdentity;
  readonly ownerRecords: readonly Readonly<{
    recordId: string;
    reference: string;
    identity: OpeningBundleFileIdentity;
  }>[];
  readonly expectedBundleSha256: string;
}
export interface ServerOpeningIncomingManifestV2 extends Omit<
  ServerOpeningIncomingManifest,
  'expectedBundleSha256'
> {
  readonly schemaVersion: 'server-opening-incoming-v2';
  readonly expectedBundleSha256: string;
  readonly financial: Readonly<{
    input: OpeningBundleFileIdentity;
    adoptionReceipt: OpeningBundleFileIdentity;
    ownerInstruction: OpeningBundleFileIdentity;
    documents: readonly Readonly<{
      documentId: string;
      identity: OpeningBundleFileIdentity;
    }>[];
  }>;
}
export interface OfficialOpeningPublicationSourceBundle {
  readonly source: OfficialOpeningSourceBytes;
  readonly selectionBytes: string;
  readonly mapManifestBytes: string;
  readonly regionsBytes: string;
  readonly gapsBytes: string;
  readonly decisionBytes: string;
  readonly assemblyBytes: string;
  readonly ownerRecords: readonly Readonly<{
    reference: string;
    recordBytes: string;
  }>[];
}
export interface OfficialOpeningPublicationSourceBundleV2 extends OfficialOpeningPublicationSourceBundle {
  readonly schemaVersion: 'official-opening-publication-source-v2';
  readonly financial: Readonly<{
    inputBytes: string;
    adoptionReceiptBytes: string;
    ownerInstructionBytes: string;
    parentOwnerReceiptBytes: string;
    parentOwnerInstructionBytes: string;
    registeredReference: string | null;
    documents: readonly Readonly<{
      documentId: string;
      sourcePath: string;
      bytes: string;
    }>[];
  }>;
}
export function officialOpeningPublicationSourceSha256(
  bundle:
    | OfficialOpeningPublicationSourceBundle
    | OfficialOpeningPublicationSourceBundleV2,
): string {
  return createHash('sha256')
    .update(canonicalSerialize(bundle), 'utf8')
    .digest('hex');
}
export function isOfficialOpeningBundleV2(
  bundle: OfficialOpeningPublicationSourceBundle,
): bundle is OfficialOpeningPublicationSourceBundleV2 {
  return (
    'schemaVersion' in bundle &&
    bundle.schemaVersion === 'official-opening-publication-source-v2'
  );
}
export type OfficialOpeningSourceBundleInputs = Omit<
  OfficialOpeningPublicationSourceBundle,
  'decisionBytes' | 'assemblyBytes' | 'ownerRecords'
>;
export interface LoadedOfficialOpeningBundle {
  readonly inputs: OfficialOpeningSourceBundleInputs;
  readonly bundle: OfficialOpeningPublicationSourceBundle | null;
  readonly sourceBundleSha256: string | null;
  readonly validatedFiles: readonly Readonly<
    OpeningBundleFileIdentity & { locator: string }
  >[];
  readonly totalBytes: number;
  readonly financialProvenance?: Readonly<{
    parentPolicy: LoadedNonHostOwnerPolicy;
    registration: FinancialSupplementRegistration | null;
  }>;
}
export class OpeningBundleLoadError extends Error {
  constructor(
    readonly code:
      | 'OPENING_FILE_MANIFEST_INVALID'
      | 'OPENING_FILE_PATH_DENIED'
      | 'OPENING_FILE_UNAVAILABLE'
      | 'OPENING_FILE_SIZE_INVALID'
      | 'OPENING_FILE_HASH_MISMATCH'
      | 'OPENING_FILE_UTF8_INVALID'
      | 'OPENING_FILE_SET_INVALID'
      | 'OPENING_BUNDLE_DIGEST_MISMATCH',
    readonly locator: string,
  ) {
    super(code + ':' + locator);
    this.name = 'OpeningBundleLoadError';
  }
}
const sha = (bytes: Uint8Array) =>
  createHash('sha256').update(bytes).digest('hex');
const loadedInstances = new WeakSet<object>();
export function isLoadedOfficialOpeningBundle(
  value: unknown,
): value is LoadedOfficialOpeningBundle {
  return (
    typeof value === 'object' && value !== null && loadedInstances.has(value)
  );
}
function fail(code: OpeningBundleLoadError['code'], locator: string): never {
  throw new OpeningBundleLoadError(code, locator);
}
function keys(
  value: object,
  expected: readonly string[],
  locator: string,
): void {
  if (
    Object.keys(value).length !== expected.length ||
    expected.some((key) => !Object.hasOwn(value, key))
  )
    fail('OPENING_FILE_MANIFEST_INVALID', locator);
}
function identity(
  value: OpeningBundleFileIdentity,
  locator: string,
): OpeningBundleFileIdentity {
  if (!value || typeof value !== 'object')
    fail('OPENING_FILE_MANIFEST_INVALID', locator);
  keys(value, ['sha256', 'bytes'], locator);
  if (
    !/^[0-9a-f]{64}$/u.test(value.sha256) ||
    !Number.isSafeInteger(value.bytes) ||
    value.bytes <= 0 ||
    value.bytes > OFFICIAL_OPENING_BUNDLE_LIMITS.fileBytes
  )
    fail('OPENING_FILE_SIZE_INVALID', locator);
  return Object.freeze({ sha256: value.sha256, bytes: value.bytes });
}
function safeLocator(locator: string): void {
  if (
    typeof locator !== 'string' ||
    !locator ||
    locator.length > 512 ||
    path.posix.isAbsolute(locator) ||
    locator.includes('\\') ||
    [...locator].some((character) => {
      const code = character.codePointAt(0)!;
      return code < 32 || code === 127 || character === ':';
    }) ||
    path.posix.normalize(locator) !== locator ||
    locator
      .split('/')
      .some((part) => part === '.' || part === '..' || part === '')
  )
    fail('OPENING_FILE_PATH_DENIED', locator);
}
function snapshotIncoming(
  value: ServerOpeningIncomingManifest | ServerOpeningIncomingManifestV2,
): ServerOpeningIncomingManifest | ServerOpeningIncomingManifestV2 {
  const v2 = 'schemaVersion' in value;
  keys(
    value,
    v2
      ? [
          'schemaVersion',
          'financial',
          'decision',
          'assembly',
          'ownerRecords',
          'expectedBundleSha256',
        ]
      : ['decision', 'assembly', 'ownerRecords', 'expectedBundleSha256'],
    'incoming',
  );
  if (
    !/^[0-9a-f]{64}$/u.test(value.expectedBundleSha256) ||
    !Array.isArray(value.ownerRecords) ||
    value.ownerRecords.length + (v2 ? 2 : 0) >
      OFFICIAL_OPENING_BUNDLE_LIMITS.ownerRecords
  )
    fail('OPENING_FILE_MANIFEST_INVALID', 'incoming');
  const records = value.ownerRecords.map((row) => {
    keys(row, ['recordId', 'reference', 'identity'], 'incoming/owner-records');
    if (
      !/^[A-Z][A-Z0-9_]{0,127}$/u.test(row.recordId) ||
      typeof row.reference !== 'string' ||
      !row.reference ||
      row.reference.length > 1024
    )
      fail('OPENING_FILE_PATH_DENIED', 'incoming/owner-records');
    return Object.freeze({
      recordId: row.recordId,
      reference: row.reference,
      identity: identity(
        row.identity,
        'incoming/owner-records/' + row.recordId + '.json',
      ),
    });
  });
  if (
    new Set(records.map((r) => r.recordId)).size !== records.length ||
    new Set(records.map((r) => r.reference)).size !== records.length
  )
    fail('OPENING_FILE_SET_INVALID', 'incoming/owner-records');
  const base = Object.freeze({
    decision: identity(value.decision, 'incoming/decision.json'),
    assembly: identity(value.assembly, 'incoming/assembly.json'),
    ownerRecords: Object.freeze(records),
    expectedBundleSha256: value.expectedBundleSha256,
  });
  if (!v2) return base;
  if (value.schemaVersion !== 'server-opening-incoming-v2')
    fail('OPENING_FILE_MANIFEST_INVALID', 'version');
  const f = value.financial;
  keys(
    f,
    ['input', 'adoptionReceipt', 'ownerInstruction', 'documents'],
    'financial',
  );
  if (
    !Array.isArray(f.documents) ||
    f.documents.length === 0 ||
    f.documents.length > 256 ||
    new Set(f.documents.map((d) => d.documentId)).size !== f.documents.length
  )
    fail('OPENING_FILE_SET_INVALID', 'financial.documents');
  let documentBytes = 0;
  const documents = f.documents
    .map((d) => {
      keys(d, ['documentId', 'identity'], 'financial.document');
      if (!/^[A-Z][A-Z0-9_]{0,127}$/u.test(d.documentId))
        fail('OPENING_FILE_PATH_DENIED', 'documentId');
      const checked = identity(d.identity, 'financial.document');
      documentBytes += checked.bytes;
      if (checked.bytes > 4 * 1024 * 1024 || documentBytes > 16 * 1024 * 1024)
        fail('OPENING_FILE_SIZE_INVALID', 'financial.documents');
      return Object.freeze({ documentId: d.documentId, identity: checked });
    })
    .sort((a, b) => (a.documentId < b.documentId ? -1 : 1));
  return Object.freeze({
    ...base,
    schemaVersion: 'server-opening-incoming-v2',
    financial: Object.freeze({
      input: identity(f.input, 'financial.input'),
      adoptionReceipt: identity(f.adoptionReceipt, 'financial.adoptionReceipt'),
      ownerInstruction: identity(
        f.ownerInstruction,
        'financial.ownerInstruction',
      ),
      documents: Object.freeze(documents),
    }),
  });
}

export class OfficialOpeningBundleLoader {
  readonly #root: string;
  readonly #incoming:
    ServerOpeningIncomingManifest | ServerOpeningIncomingManifestV2 | null;
  readonly #financialRegistration: FinancialSupplementRegistration | null;
  constructor(
    input: Readonly<{
      repositoryRoot: string;
      incoming?:
        ServerOpeningIncomingManifest | ServerOpeningIncomingManifestV2;
      financialAdoptionRegistration?: FinancialSupplementRegistration;
    }>,
  ) {
    // Constructor is a private deployment dependency, not an invocation DTO.
    keys(
      input,
      [
        'repositoryRoot',
        ...(input.incoming === undefined ? [] : ['incoming']),
        ...(input.financialAdoptionRegistration === undefined
          ? []
          : ['financialAdoptionRegistration']),
      ],
      'composition',
    );
    if (!input.repositoryRoot || !path.isAbsolute(input.repositoryRoot))
      fail('OPENING_FILE_PATH_DENIED', 'repositoryRoot');
    this.#root = path.resolve(input.repositoryRoot);
    this.#incoming =
      input.incoming === undefined ? null : snapshotIncoming(input.incoming);
    if (
      input.financialAdoptionRegistration !== undefined &&
      (!this.#incoming || !('schemaVersion' in this.#incoming))
    )
      fail('OPENING_FILE_MANIFEST_INVALID', 'financialAdoptionRegistration');
    this.#financialRegistration =
      input.financialAdoptionRegistration === undefined
        ? null
        : snapshotFinancialSupplementRegistration(
            input.financialAdoptionRegistration,
          );
  }

  async load(): Promise<LoadedOfficialOpeningBundle> {
    const root = await realpath(this.#root).catch(() =>
      fail('OPENING_FILE_UNAVAILABLE', 'repositoryRoot'),
    );
    if (root !== this.#root) fail('OPENING_FILE_PATH_DENIED', 'repositoryRoot');
    let totalBytes = 0;
    const validated: (OpeningBundleFileIdentity & { locator: string })[] = [];
    const read = async (
      locator: string,
      expected: OpeningBundleFileIdentity,
    ): Promise<string> => {
      safeLocator(locator);
      identity(expected, locator);
      totalBytes += expected.bytes;
      if (totalBytes > OFFICIAL_OPENING_BUNDLE_LIMITS.totalBytes)
        fail('OPENING_FILE_SIZE_INVALID', locator);
      let current = root;
      try {
        for (const segment of locator.split('/')) {
          current = path.join(current, segment);
          const stat = await lstat(current);
          if (stat.isSymbolicLink()) fail('OPENING_FILE_PATH_DENIED', locator);
        }
        // Sources are retained in a private, immutable server-owned directory.
        // O_NOFOLLOW also rejects final-file symlink replacement; bounded reads
        // never allocate from file-reported size or silently truncate a file.
        const file = await open(
          current,
          fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW,
        );
        try {
          const stat = await file.stat();
          if (!stat.isFile() || stat.size !== expected.bytes)
            fail('OPENING_FILE_SIZE_INVALID', locator);
          const bytes = Buffer.alloc(expected.bytes + 1);
          let offset = 0;
          while (offset < bytes.length) {
            const result = await file.read(
              bytes,
              offset,
              bytes.length - offset,
              offset,
            );
            if (!result.bytesRead) break;
            offset += result.bytesRead;
          }
          if (offset !== expected.bytes)
            fail('OPENING_FILE_SIZE_INVALID', locator);
          const raw = bytes.subarray(0, offset);
          let text: string;
          try {
            text = new TextDecoder('utf-8', {
              fatal: true,
              ignoreBOM: true,
            }).decode(raw);
          } catch {
            return fail('OPENING_FILE_UTF8_INVALID', locator);
          }
          if (sha(raw) !== expected.sha256)
            fail('OPENING_FILE_HASH_MISMATCH', locator);
          validated.push(Object.freeze({ locator, ...expected }));
          return text;
        } finally {
          await file.close();
        }
      } catch (error) {
        if (error instanceof OpeningBundleLoadError) throw error;
        return fail('OPENING_FILE_UNAVAILABLE', locator);
      }
    };
    const fixed: Record<string, string> = {};
    for (const [name, { locator, sha256, bytes }] of Object.entries(
      FIXED_FILES,
    ))
      fixed[name] = await read(locator, { sha256, bytes });
    const checksumRows: unknown = JSON.parse(fixed.checksums!);
    if (!Array.isArray(checksumRows) || checksumRows.length !== 86)
      fail('OPENING_FILE_SET_INVALID', 'CHECKSUMS.json');
    const datasets: Record<string, string> = {};
    const paths = new Set<string>();
    for (const candidate of checksumRows) {
      const row = candidate as { path: string; sha256: string; bytes: number };
      keys(row, ['path', 'sha256', 'bytes'], 'CHECKSUMS.json');
      safeLocator(row.path);
      if (paths.has(row.path))
        fail('OPENING_FILE_SET_INVALID', 'CHECKSUMS.json');
      paths.add(row.path);
      const text = await read(PACKAGE_ROOT + '/' + row.path, {
        sha256: row.sha256,
        bytes: row.bytes,
      });
      if (/^data\/[a-z0-9-]+\.json$/u.test(row.path)) datasets[row.path] = text;
    }
    if (Object.keys(datasets).length !== 34 || !datasets['data/regions.json'])
      fail('OPENING_FILE_SET_INVALID', 'source.datasets');
    const inputs: OfficialOpeningSourceBundleInputs = Object.freeze({
      source: Object.freeze({
        checksumsBytes: fixed.checksums!,
        mappingBytes: fixed.mapping!,
        coverageBytes: fixed.coverage!,
        proposalBytes: fixed.proposal!,
        datasets: Object.freeze(datasets),
      }),
      selectionBytes: fixed.selection!,
      mapManifestBytes: fixed.mapManifest!,
      regionsBytes: datasets['data/regions.json'],
      gapsBytes: fixed.gaps!,
    });
    let bundle: OfficialOpeningPublicationSourceBundle | null = null;
    let sourceBundleSha256: string | null = null;
    let financialProvenance: LoadedOfficialOpeningBundle['financialProvenance'];
    if (this.#incoming) {
      const decisionBytes = await read(
        'incoming/decision.json',
        this.#incoming.decision,
      );
      const assemblyBytes = await read(
        'incoming/assembly.json',
        this.#incoming.assembly,
      );
      const ownerRecords = [];
      for (const row of this.#incoming.ownerRecords)
        ownerRecords.push(
          Object.freeze({
            reference: row.reference,
            recordBytes: await read(
              'incoming/owner-records/' + row.recordId + '.json',
              row.identity,
            ),
          }),
        );
      bundle = Object.freeze({
        ...inputs,
        decisionBytes,
        assemblyBytes,
        ownerRecords: Object.freeze(ownerRecords),
      });
      if ('schemaVersion' in this.#incoming) {
        const f = this.#incoming.financial;
        const inputBytes = await read('incoming/financial/input.json', f.input);
        const adoptionReceiptBytes = await read(
          'incoming/financial/adoption.json',
          f.adoptionReceipt,
        );
        const ownerInstructionBytes = await read(
          'incoming/financial/owner-instruction.md',
          f.ownerInstruction,
        );
        const documents = [];
        for (const d of f.documents) {
          const sourcePath =
            'incoming/financial/documents/' + d.documentId + '.json';
          documents.push(
            Object.freeze({
              documentId: d.documentId,
              sourcePath,
              bytes: await read(sourcePath, d.identity),
            }),
          );
        }
        const parentRoot = 'docs/governance/owner-inputs/2026-10-07/';
        const parentOwnerInstructionBytes = await read(
          parentRoot + 'OWNER_NON_HOST_DECISIONS.original.md',
          { sha256: OWNER_NON_HOST_PINS.documentSha256, bytes: 36506 },
        );
        const parentOwnerReceiptBytes = await read(
          parentRoot + 'OWNER_NON_HOST_DECISION_RECEIPT.json',
          { sha256: OWNER_NON_HOST_PINS.receiptSha256, bytes: 4500 },
        );
        const parentPolicy = await loadNonHostOwnerPolicy({
          ownerDocumentPath: path.join(
            root,
            parentRoot + 'OWNER_NON_HOST_DECISIONS.original.md',
          ),
          rootReceiptPath: path.join(
            root,
            parentRoot + 'OWNER_NON_HOST_DECISION_RECEIPT.json',
          ),
        });
        financialProvenance = Object.freeze({
          parentPolicy,
          registration: this.#financialRegistration,
        });
        bundle = Object.freeze({
          ...bundle,
          schemaVersion: 'official-opening-publication-source-v2' as const,
          financial: Object.freeze({
            inputBytes,
            adoptionReceiptBytes,
            ownerInstructionBytes,
            parentOwnerInstructionBytes,
            parentOwnerReceiptBytes,
            registeredReference:
              this.#financialRegistration?.retainedReference ?? null,
            documents: Object.freeze(documents),
          }),
        });
      }
      sourceBundleSha256 = officialOpeningPublicationSourceSha256(bundle);
      if (sourceBundleSha256 !== this.#incoming.expectedBundleSha256)
        fail('OPENING_BUNDLE_DIGEST_MISMATCH', 'incoming');
    }
    const loaded: LoadedOfficialOpeningBundle = Object.freeze({
      inputs,
      bundle,
      sourceBundleSha256,
      validatedFiles: Object.freeze(validated),
      totalBytes,
      ...(financialProvenance === undefined ? {} : { financialProvenance }),
    });
    loadedInstances.add(loaded);
    return loaded;
  }
}
