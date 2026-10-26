/** GOV01 read mechanics, not an issuer, installer, authorization or native lock.
 * The only executable source composition here is explicitly guarded TEST_ONLY.
 * No installed-source constructor or arbitrary authority-verification callback. */
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { types as nodeTypes } from 'node:util';
import {
  canonicalSerialize,
  createFinancialAccount,
  worldId,
  type FinancialAccount,
} from '@econmind/core';
import type { SqlExecutor } from '../persistence/sql-database.js';

export const GOV01_ORIGINAL_ID = 'U2544::ENTITY::ENTITY_GOVERNMENT_01::account';
const GOV = 'ENTITY_GOVERNMENT_01';
const CB = 'ENTITY_CENTRAL_BANK_01';
const DEFINITION = 'B06_C01_TYPED_REGISTER_STRUCTURE_V1';
const DEFINITION_RECEIPT =
  '968440af89bce122475915823336bbc11e6d481244424aa80bd72ac1bc3ab716';
const MAX_BYTES = 8 * 1024 * 1024;
type Row = Record<string, unknown>;
export type Gov01OriginalId = typeof GOV01_ORIGINAL_ID;
export interface Gov01ReadRequest {
  readonly registrationReference: string;
  readonly requestedOriginalId: Gov01OriginalId;
  readonly sourceSetVersion: string;
  readonly worldId: string;
  readonly heldHead: Readonly<{ worldVersion: string; eventSequence: string }>;
}
export interface Gov01RawPin {
  readonly documentId: string;
  readonly sourceVersion: string;
  readonly byteLength: string;
  readonly sha256: string;
  readonly pointer: string;
}
export interface Gov01ControlIdentity {
  readonly anchorReference: string;
  readonly scope: string;
  readonly generation: string;
  readonly headDigest: string;
}
export interface Gov01TypedAccountRecord {
  readonly sourceRecordId: string;
  readonly sourceVersion: string;
  readonly account: Readonly<FinancialAccount>;
  readonly role: 'TGA_ASSET' | 'TGA_ISSUANCE_LIABILITY';
  readonly holderId: typeof GOV;
  readonly issuerId: typeof CB;
  readonly purpose: 'TREASURY_DEPOSIT_AT_CB';
  readonly sourceHoldingKind: 'CLAIM';
  readonly sourcePin: Gov01RawPin;
}
export interface Gov01TypedRegisterBindingData {
  readonly schemaVersion: 'gov01-typed-register-binding-read-v1';
  readonly definitionVersion: typeof DEFINITION;
  readonly originalId: Gov01OriginalId;
  readonly ownerId: typeof GOV;
  readonly countryId: 'COUNTRY_01';
  readonly registrationReference: string;
  readonly sourceSetVersion: string;
  readonly sourceManifestPin: Gov01RawPin;
  readonly control: Gov01ControlIdentity;
  readonly opening: Readonly<{
    worldId: string;
    seedOrGenesisId: string;
    seedOrGenesisFingerprint: string;
    heldHead: Gov01ReadRequest['heldHead'];
    asOf: string;
    valueDate: string;
    calendarEpochSourceReference: string;
    lifecycleAttestationReference: string;
    openingAuthorityEvidenceReference: string;
    openingPin: Gov01RawPin;
  }>;
  readonly currency: Readonly<{
    code: string;
    unit: string;
    currencyPin: Gov01RawPin;
    adoptionEvidencePin: Gov01RawPin;
  }>;
  readonly asset: Gov01TypedAccountRecord;
  readonly necessaryMirror: Gov01TypedAccountRecord;
  readonly ownRegister: Readonly<{
    sourceRecordId: string;
    registerId: string;
    ownerId: typeof GOV;
    countryId: 'COUNTRY_01';
    definitionVersion: typeof DEFINITION;
    sourceVersion: string;
    sourcePin: Gov01RawPin;
    members: readonly [
      Readonly<{
        role: 'TGA_ASSET';
        accountId: string;
        sourceRecordId: string;
      }>,
    ];
  }>;
  readonly authorityEvidence: Readonly<{
    retainedOriginPin: Gov01RawPin;
    installationPin: Gov01RawPin;
    cbIssuerCustodyAppointmentPin: Gov01RawPin;
    govRegisterCustodyAppointmentPin: Gov01RawPin;
    holderConcurrencePin: Gov01RawPin;
    definitionAdoptionPin: Gov01RawPin;
    exactRecordSetAdoptionPin: Gov01RawPin;
    registrationPin: Gov01RawPin;
    controlCheckpointPin: Gov01RawPin;
  }>;
}
export interface Gov01HeldReadUse {
  assertCurrentFrom(
    executor: SqlExecutor,
    request: Gov01ReadRequest,
  ): Promise<void>;
}
/** Interface only. Its shape/brand never authenticates installation or custody. */
export interface Gov01TypedRecordSource {
  withCurrentBindingFrom<Result>(
    executor: SqlExecutor,
    request: Gov01ReadRequest,
    consume: (
      binding: Gov01TypedRegisterBindingData,
      use: Gov01HeldReadUse,
    ) => Promise<Result>,
  ): Promise<Result>;
}
export class Gov01RecordSourceInvalid extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.name = 'Gov01RecordSourceInvalid';
    this.code = code;
  }
}
function demand(ok: unknown, code: string): asserts ok {
  if (!ok) throw new Gov01RecordSourceInvalid(code);
}
function sha(bytes: string | Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}
function same(a: unknown, b: unknown): boolean {
  return canonicalSerialize(a) === canonicalSerialize(b);
}
/** Descriptor-safe, owned, finite data capture before any await/serialization. */
function capture(
  value: unknown,
  maxBytes = MAX_BYTES,
  rawNumbers = false,
): unknown {
  let nodes = 0,
    bytes = 0;
  const active = new Set<object>();
  function visit(v: unknown, depth: number): unknown {
    demand(++nodes <= 50000 && depth <= 24, 'CAP_EXCEEDED');
    if (typeof v === 'string') {
      demand(!/[\ud800-\udfff]/u.test(v), 'UTF8_INVALID');
      bytes += Buffer.byteLength(v);
      demand(bytes <= maxBytes && v.length <= 1024 * 1024, 'CAP_EXCEEDED');
      return v;
    }
    if (v === null || typeof v === 'boolean') return v;
    if (rawNumbers && typeof v === 'number') {
      demand(
        Number.isFinite(v) && Number.isSafeInteger(v),
        'DATA_SHAPE_INVALID',
      );
      return v;
    }
    demand(
      typeof v === 'object' && !nodeTypes.isProxy(v),
      'DATA_SHAPE_INVALID',
    );
    demand(!active.has(v), 'DATA_SHAPE_INVALID');
    const array = Array.isArray(v);
    demand(
      Object.getPrototypeOf(v) === (array ? Array.prototype : Object.prototype),
      'DATA_SHAPE_INVALID',
    );
    const ds = Object.getOwnPropertyDescriptors(v),
      keys = Reflect.ownKeys(ds);
    demand(keys.length <= (array ? 1025 : 65), 'CAP_EXCEEDED');
    active.add(v);
    try {
      if (array) {
        const n: unknown = ds.length?.value;
        demand(
          typeof n === 'number' && n >= 0 && n <= 1024 && keys.length === n + 1,
          'DATA_SHAPE_INVALID',
        );
        const result: unknown[] = [];
        for (let i = 0; i < n; i++) {
          const d = ds[String(i)];
          demand(
            d && Object.hasOwn(d, 'value') && d.enumerable,
            'DATA_SHAPE_INVALID',
          );
          result.push(visit(d.value, depth + 1));
        }
        return Object.freeze(result);
      }
      const result: [string, unknown][] = [];
      for (const k of keys) {
        demand(
          typeof k === 'string' && Buffer.byteLength(k) <= 512,
          'DATA_SHAPE_INVALID',
        );
        bytes += Buffer.byteLength(k);
        demand(bytes <= maxBytes, 'CAP_EXCEEDED');
        const d = ds[k];
        demand(
          d && Object.hasOwn(d, 'value') && d.enumerable,
          'DATA_SHAPE_INVALID',
        );
        result.push([k, visit(d.value, depth + 1)]);
      }
      return Object.freeze(Object.fromEntries(result));
    } finally {
      active.delete(v);
    }
  }
  return visit(value, 0);
}
function row(v: unknown, keys: readonly string[]): Row {
  demand(
    v !== null && typeof v === 'object' && !Array.isArray(v),
    'DATA_SHAPE_INVALID',
  );
  const actual = Object.keys(v);
  demand(
    actual.length === keys.length && actual.every((k) => keys.includes(k)),
    'CLOSED_KEYS_REQUIRED',
  );
  return v as Row;
}
function text(v: unknown, max = 512): string {
  demand(
    typeof v === 'string' &&
      v.length > 0 &&
      Buffer.byteLength(v) <= max &&
      v.trim() === v &&
      Array.from(v).every((c) => c.charCodeAt(0) >= 32) &&
      !/[\ud800-\udfff]/u.test(v),
    'TEXT_INVALID',
  );
  demand(
    !['UNKNOWN', 'NOT_SUPPLIED', 'SUPPLIER_UNCONFIRMED'].includes(v),
    'TEXT_INVALID',
  );
  return v;
}
function decimal(v: unknown): string {
  demand(
    typeof v === 'string' && /^(0|[1-9]\d{0,63})$/u.test(v),
    'DECIMAL_INVALID',
  );
  return v;
}
function hex(v: unknown): string {
  demand(typeof v === 'string' && /^[0-9a-f]{64}$/u.test(v), 'HASH_INVALID');
  return v;
}
function date(v: unknown): void {
  const s = text(v),
    candidate = /^\d{4}-\d{2}-\d{2}$/u.test(s) ? s + 'T00:00:00.000Z' : s;
  demand(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(candidate) &&
      Number.isFinite(Date.parse(candidate)) &&
      new Date(candidate).toISOString() === candidate,
    'DATE_INVALID',
  );
}
function head(v: unknown): void {
  const r = row(v, ['worldVersion', 'eventSequence']);
  decimal(r.worldVersion);
  decimal(r.eventSequence);
}
export function parseGov01ReadRequest(
  value: unknown,
): Readonly<Gov01ReadRequest> {
  const r = row(capture(value, 16 * 1024), [
    'registrationReference',
    'requestedOriginalId',
    'sourceSetVersion',
    'worldId',
    'heldHead',
  ]);
  text(r.registrationReference);
  text(r.sourceSetVersion);
  worldId(text(r.worldId));
  head(r.heldHead);
  demand(r.requestedOriginalId === GOV01_ORIGINAL_ID, 'ORIGINAL_ID_MISMATCH');
  return r as unknown as Readonly<Gov01ReadRequest>;
}
function pin(v: unknown): Gov01RawPin {
  const r = row(v, [
    'documentId',
    'sourceVersion',
    'byteLength',
    'sha256',
    'pointer',
  ]);
  text(r.documentId);
  text(r.sourceVersion);
  decimal(r.byteLength);
  hex(r.sha256);
  demand(BigInt(r.byteLength as string) <= 1024n * 1024n, 'CAP_EXCEEDED');
  demand(
    typeof r.pointer === 'string' &&
      Buffer.byteLength(r.pointer) <= 2048 &&
      (r.pointer === '' || r.pointer.startsWith('/')) &&
      !/~(?![01])/u.test(r.pointer),
    'POINTER_INVALID',
  );
  return r as unknown as Gov01RawPin;
}
const evidenceKeys = [
  'retainedOriginPin',
  'installationPin',
  'cbIssuerCustodyAppointmentPin',
  'govRegisterCustodyAppointmentPin',
  'holderConcurrencePin',
  'definitionAdoptionPin',
  'exactRecordSetAdoptionPin',
  'registrationPin',
  'controlCheckpointPin',
];
function control(v: unknown): Gov01ControlIdentity {
  const r = row(v, ['anchorReference', 'scope', 'generation', 'headDigest']);
  text(r.anchorReference);
  text(r.scope);
  decimal(r.generation);
  hex(r.headDigest);
  return r as unknown as Gov01ControlIdentity;
}
/** Syntax/reciprocity only: this pure parser NEVER authenticates its evidence. */
export function parseGov01TypedRegisterBindingData(
  value: unknown,
  requestValue: unknown,
): Readonly<Gov01TypedRegisterBindingData> {
  const request = parseGov01ReadRequest(requestValue);
  const r = row(capture(value), [
    'schemaVersion',
    'definitionVersion',
    'originalId',
    'ownerId',
    'countryId',
    'registrationReference',
    'sourceSetVersion',
    'sourceManifestPin',
    'control',
    'opening',
    'currency',
    'asset',
    'necessaryMirror',
    'ownRegister',
    'authorityEvidence',
  ]);
  demand(
    r.schemaVersion === 'gov01-typed-register-binding-read-v1' &&
      r.definitionVersion === DEFINITION &&
      r.originalId === GOV01_ORIGINAL_ID &&
      r.ownerId === GOV &&
      r.countryId === 'COUNTRY_01',
    'BINDING_SCOPE_MISMATCH',
  );
  demand(
    r.registrationReference === request.registrationReference &&
      r.sourceSetVersion === request.sourceSetVersion,
    'REGISTRATION_MISMATCH',
  );
  pin(r.sourceManifestPin);
  control(r.control);
  const o = row(r.opening, [
    'worldId',
    'seedOrGenesisId',
    'seedOrGenesisFingerprint',
    'heldHead',
    'asOf',
    'valueDate',
    'calendarEpochSourceReference',
    'lifecycleAttestationReference',
    'openingAuthorityEvidenceReference',
    'openingPin',
  ]);
  demand(
    o.worldId === request.worldId && same(o.heldHead, request.heldHead),
    'OPENING_HEAD_MISMATCH',
  );
  for (const k of [
    'seedOrGenesisId',
    'calendarEpochSourceReference',
    'lifecycleAttestationReference',
    'openingAuthorityEvidenceReference',
  ])
    text(o[k]);
  // Preserve native fingerprint syntax; do not strip/rehash it into agreement.
  demand(
    typeof o.seedOrGenesisFingerprint === 'string' &&
      /^sha256:[0-9a-f]{64}$/u.test(o.seedOrGenesisFingerprint),
    'OPENING_FINGERPRINT_INVALID',
  );
  head(o.heldHead);
  date(o.asOf);
  date(o.valueDate);
  pin(o.openingPin);
  const c = row(r.currency, [
    'code',
    'unit',
    'currencyPin',
    'adoptionEvidencePin',
  ]);
  text(c.code);
  text(c.unit, 256);
  pin(c.currencyPin);
  pin(c.adoptionEvidencePin);
  function account(v: unknown, asset: boolean): Gov01TypedAccountRecord {
    const a = row(v, [
      'sourceRecordId',
      'sourceVersion',
      'account',
      'role',
      'holderId',
      'issuerId',
      'purpose',
      'sourceHoldingKind',
      'sourcePin',
    ]);
    text(a.sourceRecordId);
    text(a.sourceVersion);
    const ap = pin(a.sourcePin);
    demand(ap.sourceVersion === a.sourceVersion, 'RECORD_VERSION_MISMATCH');
    const ar = row(a.account, [
      'worldId',
      'accountId',
      'ownerId',
      'countryId',
      'accountClass',
      'currency',
      'claimId',
      'counterpartyEntityId',
    ]);
    for (const key of Object.keys(ar)) text(ar[key]);
    demand(
      same(ar, createFinancialAccount(ar as unknown as FinancialAccount)),
      'ACCOUNT_NOT_CANONICAL',
    );
    demand(
      ar.worldId === request.worldId &&
        ar.ownerId === (asset ? GOV : CB) &&
        ar.countryId === 'COUNTRY_01' &&
        ar.accountClass === (asset ? 'ASSET' : 'LIABILITY') &&
        ar.currency === c.code &&
        ar.counterpartyEntityId === (asset ? CB : GOV) &&
        ar.claimId !== null,
      'ACCOUNT_ROLE_MISMATCH',
    );
    demand(
      a.role === (asset ? 'TGA_ASSET' : 'TGA_ISSUANCE_LIABILITY') &&
        a.holderId === GOV &&
        a.issuerId === CB &&
        a.purpose === 'TREASURY_DEPOSIT_AT_CB' &&
        a.sourceHoldingKind === 'CLAIM',
      'ACCOUNT_ROLE_MISMATCH',
    );
    return a as unknown as Gov01TypedAccountRecord;
  }
  const a = account(r.asset, true),
    m = account(r.necessaryMirror, false);
  demand(
    a.sourceRecordId !== m.sourceRecordId &&
      a.account.accountId !== m.account.accountId &&
      a.account.claimId === m.account.claimId,
    'RECIPROCAL_CLAIM_MISMATCH',
  );
  const g = row(r.ownRegister, [
    'sourceRecordId',
    'registerId',
    'ownerId',
    'countryId',
    'definitionVersion',
    'sourceVersion',
    'sourcePin',
    'members',
  ]);
  text(g.sourceRecordId);
  text(g.registerId);
  text(g.sourceVersion);
  demand(
    g.ownerId === GOV &&
      g.countryId === 'COUNTRY_01' &&
      g.definitionVersion === DEFINITION &&
      pin(g.sourcePin).sourceVersion === g.sourceVersion &&
      ![a.sourceRecordId, m.sourceRecordId].includes(
        g.sourceRecordId as string,
      ),
    'REGISTER_SCOPE_MISMATCH',
  );
  demand(
    Array.isArray(g.members) && g.members.length === 1,
    'OWN_ASSET_ONLY_REQUIRED',
  );
  const member = row(g.members[0], ['role', 'accountId', 'sourceRecordId']);
  demand(
    member.role === 'TGA_ASSET' &&
      member.accountId === a.account.accountId &&
      member.sourceRecordId === a.sourceRecordId,
    'OWN_ASSET_ONLY_REQUIRED',
  );
  const e = row(r.authorityEvidence, evidenceKeys);
  for (const key of evidenceKeys) pin(e[key]);
  demand(
    pin(e.definitionAdoptionPin).sha256 === DEFINITION_RECEIPT,
    'ADOPTED_DEFINITION_REQUIRED',
  );
  return r as unknown as Readonly<Gov01TypedRegisterBindingData>;
}

/** Strict raw JSON parser: reject duplicate decoded keys before JSON.parse.
 * Captured domain records contain strings/booleans/null, never JS numbers. */
function rawJson(bytes: string): unknown {
  let i = 0,
    nodes = 0;
  const ws = () => {
    while (i < bytes.length && /[\x20\t\r\n]/u.test(bytes[i]!)) i++;
  };
  function string(): string {
    const start = i++;
    while (i < bytes.length) {
      const c = bytes[i++];
      if (c === '"') return JSON.parse(bytes.slice(start, i)) as string;
      if (c === '\\') i++;
    }
    throw new Gov01RecordSourceInvalid('JSON_INVALID');
  }
  function value(depth: number): void {
    demand(++nodes <= 50000 && depth <= 24, 'CAP_EXCEEDED');
    ws();
    if (bytes[i] === '"') {
      string();
      return;
    }
    if (bytes[i] === '{') {
      i++;
      ws();
      const keys = new Set<string>();
      if (bytes[i] === '}') {
        i++;
        return;
      }
      for (;;) {
        ws();
        demand(bytes[i] === '"', 'JSON_INVALID');
        const k = string();
        demand(!keys.has(k), 'DUPLICATE_JSON_KEY');
        keys.add(k);
        ws();
        demand(bytes[i++] === ':', 'JSON_INVALID');
        value(depth + 1);
        ws();
        if (bytes[i] === '}') {
          i++;
          return;
        }
        demand(bytes[i++] === ',', 'JSON_INVALID');
      }
    }
    if (bytes[i] === '[') {
      i++;
      ws();
      let n = 0;
      if (bytes[i] === ']') {
        i++;
        return;
      }
      for (;;) {
        demand(++n <= 1024, 'CAP_EXCEEDED');
        value(depth + 1);
        ws();
        if (bytes[i] === ']') {
          i++;
          return;
        }
        demand(bytes[i++] === ',', 'JSON_INVALID');
      }
    }
    const match =
      /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/u.exec(
        bytes.slice(i),
      );
    demand(match, 'JSON_INVALID');
    i += match[0].length;
  }
  try {
    value(0);
    ws();
    demand(i === bytes.length, 'JSON_INVALID');
    return capture(JSON.parse(bytes), MAX_BYTES, true);
  } catch (error) {
    if (error instanceof Gov01RecordSourceInvalid) throw error;
    throw new Gov01RecordSourceInvalid('JSON_INVALID');
  }
}
function selected(value: unknown, pointer: string): unknown {
  let v = value;
  for (const token of pointer === '' ? [] : pointer.slice(1).split('/')) {
    const key = token.replace(/~1/gu, '/').replace(/~0/gu, '~');
    demand(
      v !== null && typeof v === 'object' && Object.hasOwn(v, key),
      'POINTER_UNRESOLVED',
    );
    if (Array.isArray(v))
      demand(/^(0|[1-9]\d*)$/u.test(key), 'POINTER_INVALID');
    v = (v as Row)[key];
  }
  return v;
}
/** Full byte integrity and exact selector only; return is inert unauthenticated data. */
export function readGov01PinnedJsonDocument(value: unknown): unknown {
  const r = row(capture(value), ['pin', 'utf8']);
  const p = pin(r.pin);
  demand(
    typeof r.utf8 === 'string' && !/[\ud800-\udfff]/u.test(r.utf8),
    'UTF8_INVALID',
  );
  const bytes = Buffer.from(r.utf8, 'utf8');
  demand(
    bytes.length <= 1024 * 1024 &&
      String(bytes.length) === p.byteLength &&
      sha(bytes) === p.sha256,
    'RAW_PIN_MISMATCH',
  );
  return selected(rawJson(r.utf8), p.pointer);
}

interface FixtureExpectation {
  readonly targetDeploymentRef: string;
  readonly databaseIdentityRef: string;
  readonly installationReference: string;
  readonly anchorReference: string;
  readonly scope: string;
  readonly checkpointGeneration: string;
  readonly checkpointHeadDigest: string;
}
export interface Gov01DataObservation {
  readonly readOrigin: 'TEST_ONLY';
  readonly binding: Gov01TypedRegisterBindingData;
  readonly controlIntent: Readonly<Row>;
}
const observationKeys = [
  'schemaVersion',
  'readOrigin',
  'targetDeploymentRef',
  'databaseIdentityRef',
  'installationReference',
  'allowedCaller',
  'previousHeadDigest',
  'checkpointGeneration',
  'checkpointHeadDigest',
  'dependencyStatuses',
  'binding',
  'documents',
];
const statusKeys = [
  'origin',
  'installation',
  'cbAppointment',
  'govAppointment',
  'holder',
  'definition',
  'recordSet',
  'registration',
  'currency',
  'opening',
  'accounts',
  'register',
  'checkpoint',
];
function without(value: object, keys: string[]): unknown {
  return Object.fromEntries(
    Object.entries(value).filter(([k]) => !keys.includes(k)),
  );
}
/** Full raw/document/set/current-comparison algorithm; DATA, not source authentication.
 * TEST_ONLY is mandatory; no generic expected pins can turn it into installed authority. */
export function inspectTestOnlyGov01Observation(
  value: unknown,
  requestValue: unknown,
  expectationValue: unknown,
): Readonly<Gov01DataObservation> {
  const request = parseGov01ReadRequest(requestValue);
  const e = row(capture(expectationValue), [
    'targetDeploymentRef',
    'databaseIdentityRef',
    'installationReference',
    'anchorReference',
    'scope',
    'checkpointGeneration',
    'checkpointHeadDigest',
  ]);
  for (const key of [
    'targetDeploymentRef',
    'databaseIdentityRef',
    'installationReference',
    'anchorReference',
    'scope',
  ])
    text(e[key]);
  decimal(e.checkpointGeneration);
  hex(e.checkpointHeadDigest);
  const r = row(capture(value), observationKeys);
  demand(
    r.schemaVersion === 'gov01-isolated-observation-v1' &&
      r.readOrigin === 'TEST_ONLY' &&
      r.allowedCaller === 'GOV01_F_ASYNC_RECEIVER',
    'TEST_ONLY_ORIGIN_REQUIRED',
  );
  for (const key of [
    'targetDeploymentRef',
    'databaseIdentityRef',
    'installationReference',
    'checkpointGeneration',
    'checkpointHeadDigest',
  ])
    demand(r[key] === e[key], 'INSTALLATION_BINDING_MISMATCH');
  hex(r.previousHeadDigest);
  const statuses = row(r.dependencyStatuses, statusKeys);
  demand(
    statusKeys.every((k) => statuses[k] === 'ACTIVE'),
    'DEPENDENCY_NOT_CURRENT',
  );
  const b = parseGov01TypedRegisterBindingData(r.binding, request);
  demand(
    b.control.anchorReference === e.anchorReference &&
      b.control.scope === e.scope,
    'CONTROL_SCOPE_MISMATCH',
  );
  const generation = BigInt(b.control.generation),
    checkpoint = BigInt(e.checkpointGeneration as string);
  demand(
    generation >= checkpoint &&
      (generation !== checkpoint ||
        b.control.headDigest === e.checkpointHeadDigest),
    'CONTROL_ROLLBACK',
  );
  // Require a checkpoint-adjacent chain in this finite single-read version.
  // Longer history must be supplied as an explicitly reviewed extension, not truncated.
  demand(
    generation === checkpoint ||
      (generation === checkpoint + 1n &&
        r.previousHeadDigest === e.checkpointHeadDigest),
    'CONTROL_HISTORY_GAP',
  );
  demand(
    Array.isArray(r.documents) && r.documents.length <= 32,
    'DOCUMENT_SET_INVALID',
  );
  const docs = new Map<string, { pin: Gov01RawPin; value: unknown }>();
  for (const d of r.documents) {
    const dr = row(d, ['pin', 'utf8']),
      p = pin(dr.pin);
    demand(!docs.has(p.documentId), 'DUPLICATE_DOCUMENT');
    docs.set(p.documentId, { pin: p, value: readGov01PinnedJsonDocument(dr) });
  }
  const resolve = (p: Gov01RawPin): unknown => {
    const d = docs.get(p.documentId);
    demand(d && same(d.pin, p), 'DOCUMENT_MEMBERSHIP_MISMATCH');
    return d.value;
  };
  const allPins = [
    b.asset.sourcePin,
    b.necessaryMirror.sourcePin,
    b.ownRegister.sourcePin,
    b.opening.openingPin,
    b.currency.currencyPin,
    b.currency.adoptionEvidencePin,
    ...Object.values(b.authorityEvidence),
  ];
  demand(
    new Set(allPins.map((p) => p.documentId)).size === allPins.length &&
      !allPins.some((p) => p.documentId === b.sourceManifestPin.documentId) &&
      docs.size === allPins.length + 1,
    'EXACT_DOCUMENT_SET_REQUIRED',
  );
  const manifest = row(resolve(b.sourceManifestPin), [
    'schemaVersion',
    'sourceSetVersion',
    'originalId',
    'members',
  ]);
  demand(
    manifest.schemaVersion === 'gov01-isolated-record-set-v1' &&
      manifest.sourceSetVersion === request.sourceSetVersion &&
      manifest.originalId === GOV01_ORIGINAL_ID &&
      Array.isArray(manifest.members) &&
      same(manifest.members, allPins),
    'EXACT_MANIFEST_MISMATCH',
  );
  demand(
    same(resolve(b.asset.sourcePin), without(b.asset, ['sourcePin'])) &&
      same(
        resolve(b.necessaryMirror.sourcePin),
        without(b.necessaryMirror, ['sourcePin']),
      ) &&
      same(
        resolve(b.ownRegister.sourcePin),
        without(b.ownRegister, ['sourcePin']),
      ),
    'SOURCE_RECORD_BODY_MISMATCH',
  );
  demand(
    same(resolve(b.opening.openingPin), {
      ...(without(b.opening, ['openingPin']) as Row),
      lifecycle: 'INACTIVE_NOT_ACTIVATED',
    }),
    'LAWFUL_OPENING_BODY_MISMATCH',
  );
  demand(
    same(resolve(b.currency.currencyPin), {
      code: b.currency.code,
      unit: b.currency.unit,
    }),
    'CURRENCY_BODY_MISMATCH',
  );
  const authorityPins = [
    ...Object.entries(b.authorityEvidence),
    ['currencyAdoptionPin', b.currency.adoptionEvidencePin] as const,
  ];
  for (const [kind, p] of authorityPins) {
    if (kind === 'definitionAdoptionPin') {
      // Actual retained definition receipt is raw pinned bytes, not our new schema.
      const original = resolve(p);
      demand(
        original !== null && typeof original === 'object',
        'ADOPTED_DEFINITION_REQUIRED',
      );
      continue;
    }
    const d = row(resolve(p), [
      'kind',
      'reference',
      'originalId',
      'registrationReference',
      'sourceSetVersion',
      'worldId',
      'asOf',
      'valueDate',
      'currency',
      'unit',
      'generation',
      'status',
    ]);
    demand(
      d.kind === kind &&
        typeof d.reference === 'string' &&
        d.reference === p.documentId &&
        d.originalId === GOV01_ORIGINAL_ID &&
        d.registrationReference === request.registrationReference &&
        d.sourceSetVersion === request.sourceSetVersion &&
        d.worldId === request.worldId &&
        d.asOf === b.opening.asOf &&
        d.valueDate === b.opening.valueDate &&
        d.currency === b.currency.code &&
        d.unit === b.currency.unit &&
        d.generation === b.control.generation &&
        d.status === 'ACTIVE',
      'AUTHORITY_BODY_MISMATCH',
    );
  }
  const intent = Object.freeze({
    anchorReference: b.control.anchorReference,
    scope: b.control.scope,
    generation: b.control.generation,
    previousHeadDigest: r.previousHeadDigest,
    registrationReference: request.registrationReference,
    sourceSetVersion: request.sourceSetVersion,
    sourceManifestPin: b.sourceManifestPin,
    dependencyStatuses: statuses,
  });
  demand(
    sha(canonicalSerialize(intent)) === b.control.headDigest,
    'CONTROL_DIGEST_MISMATCH',
  );
  return Object.freeze({
    readOrigin: 'TEST_ONLY',
    binding: b,
    controlIntent: intent,
  });
}

export interface Gov01TestOnlyBindingRead {
  readonly readStatus: 'TEST_ONLY_GOV01_BINDING_READ';
  readonly testOnlyBinding: Gov01TypedRegisterBindingData;
  readonly actualTypedRegisterBinding: null;
  readonly sourceAdmitted: false;
}
export interface Gov01TestOnlyRecordSource {
  readonly readOrigin: 'TEST_ONLY';
  withCurrentBindingFrom<Result>(
    executor: SqlExecutor,
    request: Gov01ReadRequest,
    consume: (
      read: Gov01TestOnlyBindingRead,
      use: Gov01HeldReadUse,
    ) => Promise<Result>,
  ): Promise<Result>;
}
const fixtureSources = new WeakSet<object>();
export function isTestOnlyGov01RecordSource(
  value: unknown,
): value is Gov01TestOnlyRecordSource {
  return (
    typeof value === 'object' && value !== null && fixtureSources.has(value)
  );
}
async function fixtureFile(
  root: string,
  name: string,
  max: number,
): Promise<string> {
  const file = await open(
    path.join(root, name),
    constants.O_RDONLY | constants.O_NOFOLLOW,
  );
  try {
    const s = await file.stat();
    demand(
      s.isFile() &&
        s.uid === process.getuid?.() &&
        s.nlink === 1 &&
        s.size <= max &&
        (s.mode & 0o777) === 0o600,
      'OWNED_FIXTURE_FILE_REQUIRED',
    );
    const data = Buffer.alloc(s.size + 1);
    let count = 0;
    while (count < data.length) {
      const read = await file.read(data, count, data.length - count, count);
      if (!read.bytesRead) break;
      count += read.bytesRead;
    }
    demand(count === s.size, 'FIXTURE_CHANGED');
    try {
      return new TextDecoder('utf8', { fatal: true, ignoreBOM: true }).decode(
        data.subarray(0, count),
      );
    } catch {
      throw new Gov01RecordSourceInvalid('UTF8_INVALID');
    }
  } finally {
    await file.close();
  }
}
/** Guarded disposable fixture input; immutable captured frames, NOT a source grant.
 * The explicit frame schedule models initial-before/after, use, final reads.
 * It makes no query/lock/native-transaction claim and cannot yield an actual slot. */
export async function createTestOnlyGov01RecordSource(
  input: Readonly<{ fixtureRoot: string }>,
): Promise<Gov01TestOnlyRecordSource> {
  const r = row(capture(input, 16384), ['fixtureRoot']);
  const root = text(r.fixtureRoot);
  demand(path.isAbsolute(root), 'OWNED_FIXTURE_ROOT_REQUIRED');
  const s = await lstat(root),
    parent = await realpath(tmpdir());
  demand(
    path.dirname(root) === parent &&
      path.basename(root).startsWith('gov01-record-source-fixture-') &&
      (await realpath(root)) === root &&
      s.isDirectory() &&
      !s.isSymbolicLink() &&
      s.uid === process.getuid?.() &&
      (s.mode & 0o777) === 0o700,
    'OWNED_FIXTURE_ROOT_REQUIRED',
  );
  const marker = await fixtureFile(root, '.fixture-owner', 64);
  hex(marker);
  const manifest = row(
    rawJson(await fixtureFile(root, 'fixture-manifest.json', 4096)),
    ['schemaVersion', 'framesByteLength', 'framesSha256'],
  );
  demand(
    manifest.schemaVersion === 'gov01-test-only-fixture-v1',
    'TEST_ONLY_ORIGIN_REQUIRED',
  );
  decimal(manifest.framesByteLength);
  hex(manifest.framesSha256);
  const bytes = await fixtureFile(root, 'frames.json', MAX_BYTES);
  demand(
    String(Buffer.byteLength(bytes)) === manifest.framesByteLength &&
      sha(bytes) === manifest.framesSha256,
    'RAW_PIN_MISMATCH',
  );
  const f = row(rawJson(bytes), [
    'readOrigin',
    'request',
    'expectation',
    'frames',
  ]);
  demand(
    f.readOrigin === 'TEST_ONLY' &&
      Array.isArray(f.frames) &&
      f.frames.length >= 4 &&
      f.frames.length <= 16,
    'TEST_ONLY_ORIGIN_REQUIRED',
  );
  const fixedRequest = parseGov01ReadRequest(f.request);
  const expectation = capture(f.expectation) as FixtureExpectation;
  const frames: readonly unknown[] = f.frames;
  let used = false;
  const source: Gov01TestOnlyRecordSource = Object.freeze({
    readOrigin: 'TEST_ONLY',
    async withCurrentBindingFrom<Result>(
      executor: SqlExecutor,
      requestValue: Gov01ReadRequest,
      consume: (
        read: Gov01TestOnlyBindingRead,
        use: Gov01HeldReadUse,
      ) => Promise<Result>,
    ): Promise<Result> {
      const request = parseGov01ReadRequest(requestValue);
      demand(
        !used && same(request, fixedRequest),
        'FIXTURE_SCOPE_OR_REUSE_DENIED',
      );
      used = true;
      demand(
        executor !== null &&
          typeof executor === 'object' &&
          !nodeTypes.isProxy(executor),
        'EXECUTOR_REQUIRED',
      );
      let cursor = 0,
        active = true;
      const read = () => {
        demand(active && cursor < frames.length, 'EXPIRED_OR_EXHAUSTED_READ');
        return inspectTestOnlyGov01Observation(
          frames[cursor++],
          request,
          expectation,
        );
      };
      try {
        const initial = read(),
          after = read();
        demand(same(initial, after), 'CURRENT_SOURCE_CHANGED');
        let useCount = 0,
          checking = false,
          failedUse = false;
        const use: Gov01HeldReadUse = Object.freeze({
          async assertCurrentFrom(
            other: SqlExecutor,
            atUse: Gov01ReadRequest,
          ): Promise<void> {
            try {
              demand(
                active &&
                  !failedUse &&
                  other === executor &&
                  same(parseGov01ReadRequest(atUse), request) &&
                  !checking,
                'EXPIRED_OR_FOREIGN_USE',
              );
              checking = true;
              demand(same(read(), initial), 'CURRENT_SOURCE_CHANGED');
              useCount++;
            } catch (error) {
              failedUse = true;
              throw error;
            } finally {
              checking = false;
            }
          },
        });
        const result = await consume(
          Object.freeze({
            readStatus: 'TEST_ONLY_GOV01_BINDING_READ',
            testOnlyBinding: initial.binding,
            actualTypedRegisterBinding: null,
            sourceAdmitted: false,
          }),
          use,
        );
        demand(
          useCount > 0 && !checking && !failedUse,
          'RECEIVING_USE_CHECK_REQUIRED',
        );
        demand(same(read(), initial), 'CURRENT_SOURCE_CHANGED');
        return result;
      } finally {
        active = false;
      }
    },
  });
  fixtureSources.add(source);
  return source;
}
