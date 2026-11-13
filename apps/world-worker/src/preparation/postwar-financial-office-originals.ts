/** Retains the actual financial constructor inputs in the same operating
 * carrier. This is data binding, never a new issuer, balance or admission. */
import { createHash } from 'node:crypto';
import { canonicalSerialize, type OpeningSeed } from '@econmind/core';
import { isFinancialSupplementAdoption } from './owner-non-host-source-adoption.js';
import {
  isParsedFormalFinancialOpeningContract,
  type FormalFinancialOpeningContract,
} from './formal-financial-opening-contract.js';
import type { PostwarFinancialGenesis } from './postwar-financial-genesis.js';
import type { PostwarGenesisSourceDocument } from './postwar-operating-genesis-adoption.js';

export const POSTWAR_FINANCIAL_OFFICE_ORIGINALS_ID =
  'POSTWAR_FINANCIAL_OFFICE_ORIGINALS';
export interface PostwarFinancialOfficeOriginals {
  readonly schemaVersion: 'postwar-financial-office-originals-v1';
  readonly provenanceKind: 'GENERATED_POLICY';
  readonly worldId: string;
  readonly seedId: string;
  readonly financialSourceId: string;
  readonly financialSourcePayloadHash: string;
  readonly contractFingerprint: string;
  readonly contract: FormalFinancialOpeningContract;
}
const sha = (bytes: string) => createHash('sha256').update(bytes).digest('hex');
function invalid(reason: string): never {
  throw Error(`POSTWAR_FINANCIAL_OFFICE_ORIGINALS:${reason}`);
}
function row(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    invalid('record required');
  return value as Record<string, unknown>;
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
function financialSource(seed: OpeningSeed, sourceId: string) {
  const candidates = seed.sources
    .filter((source) => source.sourceId === sourceId)
    .map((source) => ({
      source,
      payload: row(JSON.parse(source.canonicalPayload)),
    }));
  if (
    candidates.length !== 1 ||
    candidates[0]!.source.sourceKind !== 'AUTHORITATIVE_DATASET' ||
    candidates[0]!.payload.schemaVersion !==
      'adopted-financial-opening-source-v2'
  )
    invalid('unique canonical financial source required');
  return candidates[0]!;
}
export function createPostwarFinancialOfficeOriginalDocument(
  financial: PostwarFinancialGenesis,
): PostwarGenesisSourceDocument {
  if (
    !isFinancialSupplementAdoption(financial.proof) ||
    !isParsedFormalFinancialOpeningContract(financial.contract)
  )
    invalid('actual parsed/adopted financial constructor required');
  const { source } = financialSource(
    financial.baselineSeed,
    financial.contract.sourceId,
  );
  const value: PostwarFinancialOfficeOriginals = {
    schemaVersion: 'postwar-financial-office-originals-v1',
    provenanceKind: 'GENERATED_POLICY',
    worldId: financial.baselineSeed.worldId,
    seedId: financial.baselineSeed.seedId,
    financialSourceId: source.sourceId,
    financialSourcePayloadHash: source.payloadHash,
    contractFingerprint: financial.proof.contractFingerprint,
    contract: financial.contract,
  };
  const bytes = canonicalSerialize(value);
  const document: PostwarGenesisSourceDocument = {
    documentId: POSTWAR_FINANCIAL_OFFICE_ORIGINALS_ID,
    path: 'generated/postwar-genesis/financial-office-originals.v1.json',
    sha256: sha(bytes),
    bytes,
    provenanceKind: 'GENERATED_POLICY',
  };
  validatePostwarFinancialOfficeOriginalDocument(
    document,
    financial.baselineSeed,
  );
  return freeze(document);
}
/** The caller must obtain seed from canonical seed parsing/admission. All
 * original bytes, pointers and fingerprints remain data, not source authority. */
export function validatePostwarFinancialOfficeOriginalDocument(
  document: PostwarGenesisSourceDocument,
  seed: OpeningSeed,
): PostwarFinancialOfficeOriginals {
  if (
    document.documentId !== POSTWAR_FINANCIAL_OFFICE_ORIGINALS_ID ||
    document.path !==
      'generated/postwar-genesis/financial-office-originals.v1.json' ||
    document.provenanceKind !== 'GENERATED_POLICY' ||
    sha(document.bytes) !== document.sha256
  )
    invalid('document identity/hash mismatch');
  const value = JSON.parse(document.bytes) as PostwarFinancialOfficeOriginals;
  if (
    canonicalSerialize(value) !== document.bytes ||
    Object.keys(value).sort().join('|') !==
      [
        'schemaVersion',
        'provenanceKind',
        'worldId',
        'seedId',
        'financialSourceId',
        'financialSourcePayloadHash',
        'contractFingerprint',
        'contract',
      ]
        .sort()
        .join('|') ||
    value.schemaVersion !== 'postwar-financial-office-originals-v1' ||
    value.provenanceKind !== 'GENERATED_POLICY' ||
    value.worldId !== seed.worldId ||
    value.seedId !== seed.seedId
  )
    invalid('original scope/schema mismatch');
  const { source, payload } = financialSource(seed, value.financialSourceId);
  const assembly = row(payload.assembly),
    record = row(payload.record);
  if (
    value.financialSourceId !== source.sourceId ||
    value.financialSourcePayloadHash !== source.payloadHash ||
    value.contractFingerprint !== payload.contractFingerprint ||
    value.contractFingerprint !== record.contractFingerprint ||
    value.contractFingerprint !== assembly.contractFingerprint ||
    value.contractFingerprint !==
      `sha256:${sha(canonicalSerialize(value.contract))}` ||
    value.contract.worldId !== seed.worldId ||
    value.contract.sourceId !== source.sourceId ||
    assembly.sourceId !== source.sourceId ||
    assembly.worldId !== seed.worldId ||
    assembly.seedId !== seed.seedId ||
    value.contract.sourceVersion !== record.sourceVersion ||
    value.contract.valueDate !== record.valueDate ||
    value.contract.ownerReceiptSha256 !== payload.parentReceiptSha256 ||
    value.contract.adoptionManifestFingerprint !==
      payload.adoptionManifestFingerprint
  )
    invalid('financial source/contract binding mismatch');
  const metadata = value.contract.documents.map((d) => {
    if (sha(d.bytes) !== d.sha256 || !d.sourcePath || !d.documentId)
      invalid('original financial document bytes changed');
    return {
      documentId: d.documentId,
      sourcePath: d.sourcePath,
      sha256: d.sha256,
      bytes: String(Buffer.byteLength(d.bytes, 'utf8')),
      version: d.version,
      valueDate: d.valueDate,
    };
  });
  if (
    canonicalSerialize(metadata) !== canonicalSerialize(record.documents) ||
    new Set(metadata.map((d) => d.documentId)).size !== metadata.length
  )
    invalid('adopted document metadata mismatch');
  const countries = assembly.countries;
  if (
    !Array.isArray(countries) ||
    new Set(value.contract.countries.map((c) => c.countryId)).size !==
      value.contract.countries.length ||
    canonicalSerialize(
      value.contract.countries.map((c) => c.countryId).sort(),
    ) !== canonicalSerialize(countries.map((c) => row(c).countryId).sort())
  )
    invalid('financial country coverage mismatch');
  // Contract fingerprint binds all documents. Verify every retained register,
  // category, holding and FX pointer is actually resolvable in those bytes.
  const documents = new Map(
    value.contract.documents.map((d) => [
      d.documentId,
      JSON.parse(d.bytes) as unknown,
    ]),
  );
  const pointer = (ref: { documentId: string; pointer: string }) => {
    if (
      !ref ||
      !documents.has(ref.documentId) ||
      !ref.pointer.startsWith('/') ||
      /~(?![01])/u.test(ref.pointer)
    )
      invalid('financial source pointer required');
    let node = documents.get(ref.documentId);
    for (const segment of ref.pointer.slice(1).split('/')) {
      const key = segment.replace(/~1/gu, '/').replace(/~0/gu, '~');
      if (!node || typeof node !== 'object' || !Object.hasOwn(node, key))
        invalid('financial source pointer absent');
      node = (node as Record<string, unknown>)[key];
    }
  };
  for (const country of value.contract.countries) {
    pointer(country.openingFx.source);
    pointer(country.cbRegister.source);
    country.cbRegister.categories.forEach((c) => pointer(c.source));
    country.cbRegister.holdings.forEach((h) => pointer(h.source));
    country.cbRegister.crossCbMirrors?.forEach((h) => {
      pointer(h.source);
      pointer(h.valuation.source);
    });
    country.bankLoans.forEach((l) => pointer(l.source));
  }
  return freeze(value);
}
/** Fixed carrier path; never filesystem lookup, caller-provided register or
 * guessed account-name to instrument conversion. */
export function readPostwarFinancialOfficeOriginalsFromSeed(
  seed: OpeningSeed,
): PostwarFinancialOfficeOriginals {
  const carriers = seed.sources
    .map((s) => row(JSON.parse(s.canonicalPayload)))
    .filter(
      (p) => p.schemaVersion === 'postwar-operating-genesis-seed-source-v1',
    );
  if (carriers.length !== 1) invalid('unique operating carrier required');
  const carrier = row(carriers[0]!.carrier),
    documents = carrier.documents;
  if (!Array.isArray(documents)) invalid('operating source documents required');
  const selected = documents.filter(
    (d) => row(d).documentId === POSTWAR_FINANCIAL_OFFICE_ORIGINALS_ID,
  );
  if (selected.length !== 1)
    invalid('retained financial originals unavailable');
  return validatePostwarFinancialOfficeOriginalDocument(
    selected[0] as PostwarGenesisSourceDocument,
    seed,
  );
}
