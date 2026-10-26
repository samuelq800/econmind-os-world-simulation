/** Isolated SIMULATED_OPENING documents only; never source admission or World usage. */
import { createHash } from 'node:crypto';
import { types } from 'node:util';
import { canonicalSerialize } from '@econmind/core';
import { PostgresSqlDatabase } from './postgres-sql-database.js';
import type { SqlExecutor } from './sql-database.js';

type Row = Record<string, unknown>;
export type SimulatedSocialSourcePurpose =
  'EMPLOYMENT' | 'EDUCATION' | 'HEALTHCARE';
export interface SocialOfficeSimulatedRecord {
  readonly recordId: string;
  readonly revision: string;
  readonly role:
    | 'RESOURCE_CATALOG'
    | 'PHYSICAL_ORIGINAL_BODY'
    | 'DOMAIN_FACTS'
    | 'CURRENT_AUTHORIZATION';
  readonly physicalGroupKey: string | null;
  readonly rawUtf8: string;
  readonly sha256: string;
}
export interface SocialOfficeSimulatedPublication {
  readonly schemaVersion: 'social-office-simulated-source-publication-v1';
  readonly sourceClass: 'SIMULATED_OPENING';
  readonly simulationId: string;
  readonly worldId: string;
  readonly countryId: string;
  readonly operationId: string;
  readonly expectedGeneration: string;
  readonly expectedManifestHash: string | null;
  readonly validFromSimTime: string;
  readonly validUntilSimTime: string | null;
  readonly disposition: 'ACTIVE' | 'REVOKED';
  readonly allowedPurposes: readonly SimulatedSocialSourcePurpose[];
  readonly selectedRecordIds: readonly string[];
  readonly records: readonly SocialOfficeSimulatedRecord[];
}
export interface SocialOfficeSimulatedSourceRequest {
  readonly schemaVersion: 'social-office-simulated-source-request-v1';
  readonly sourceClass: 'SIMULATED_OPENING';
  readonly simulationId: string;
  readonly worldId: string;
  readonly countryId: string;
  /** Document category only, never an Office capability or automatic authority. */
  readonly purpose: SimulatedSocialSourcePurpose;
  readonly simTime: string;
  readonly expectedGeneration: string | null;
  readonly expectedManifestHash: string | null;
}
export interface SocialOfficeSimulatedSourceSnapshot {
  readonly sourceClass: 'SIMULATED_OPENING';
  readonly sourceAdmitted: false;
  readonly actualSourceCustodian: 'SUPPLIER_UNCONFIRMED';
  readonly request: Readonly<SocialOfficeSimulatedSourceRequest>;
  readonly generation: string;
  readonly manifestHash: string;
  readonly publication: Readonly<SocialOfficeSimulatedPublication>;
}
const publicationKeys = [
  'schemaVersion',
  'sourceClass',
  'simulationId',
  'worldId',
  'countryId',
  'operationId',
  'expectedGeneration',
  'expectedManifestHash',
  'validFromSimTime',
  'validUntilSimTime',
  'disposition',
  'allowedPurposes',
  'selectedRecordIds',
  'records',
];
const recordKeys = [
  'recordId',
  'revision',
  'role',
  'physicalGroupKey',
  'rawUtf8',
  'sha256',
];
const requestKeys = [
  'schemaVersion',
  'sourceClass',
  'simulationId',
  'worldId',
  'countryId',
  'purpose',
  'simTime',
  'expectedGeneration',
  'expectedManifestHash',
];
const purposes: readonly string[] = ['EDUCATION', 'EMPLOYMENT', 'HEALTHCARE'];
const roles: readonly string[] = [
  'RESOURCE_CATALOG',
  'PHYSICAL_ORIGINAL_BODY',
  'DOMAIN_FACTS',
  'CURRENT_AUTHORIZATION',
];
const catalogId = 'COMMON_RF_RESOURCE_CATALOG_V1';
function fail(message: string): never {
  throw new Error(`SOCIAL_SIMULATED_SOURCE: ${message}`);
}
function own(input: unknown): unknown {
  let nodes = 0,
    bytes = 0;
  const seen = new Set<object>();
  function copy(v: unknown, depth: number): unknown {
    if (++nodes > 100_000 || depth > 32) fail('structural bound');
    if (v === null) return null;
    if (typeof v === 'string') {
      bytes += Buffer.byteLength(v, 'utf8');
      if (bytes > 4_194_304 || Buffer.from(v).toString('utf8') !== v)
        fail('UTF8 bound');
      return v;
    }
    if (!v || typeof v !== 'object' || types.isProxy(v) || seen.has(v))
      fail('inert own data required');
    seen.add(v);
    const array = Array.isArray(v);
    if (
      Object.getPrototypeOf(v) !== (array ? Array.prototype : Object.prototype)
    )
      fail('plain data required');
    const ds = Object.getOwnPropertyDescriptors(v),
      keys = Reflect.ownKeys(ds);
    if (keys.some((k) => typeof k !== 'string')) fail('symbol field');
    let out: unknown;
    if (array) {
      if (v.length > 16384 || keys.length !== v.length + 1)
        fail('dense array required');
      out = Array.from({ length: v.length }, (_, i) => {
        const d = ds[String(i)];
        if (!d || !Object.hasOwn(d, 'value') || !d.enumerable)
          fail('array accessor');
        return copy(d.value, depth + 1);
      });
    } else {
      const r: Row = {};
      for (const key of keys as string[]) {
        const d = ds[key]!;
        if (!Object.hasOwn(d, 'value') || !d.enumerable || key === '__proto__')
          fail('accessor field');
        r[key] = copy(d.value, depth + 1);
      }
      out = r;
    }
    seen.delete(v);
    return out;
  }
  return copy(input, 0);
}
function row(value: unknown, keys: readonly string[]): Row {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).sort().join('|') !== [...keys].sort().join('|')
  )
    fail('closed record required');
  return value as Row;
}
function text(v: unknown, max = 128): string {
  if (typeof v !== 'string' || !v.length || Buffer.byteLength(v) > max)
    fail('bounded text required');
  return v;
}
function ref(v: unknown): string {
  const s = text(v);
  if (!/^[A-Za-z][A-Za-z0-9._:-]{0,127}$/u.test(s))
    fail('canonical reference required');
  return s;
}
function decimal(v: unknown): string {
  const s = text(v, 19);
  if (!/^(?:0|[1-9]\d*)$/u.test(s) || BigInt(s) > 9223372036854775807n)
    fail('canonical integer required');
  return s;
}
function digest(v: unknown): string {
  const s = text(v, 64);
  if (!/^[a-f0-9]{64}$/u.test(s)) fail('digest required');
  return s;
}
function sha(v: string): string {
  return createHash('sha256').update(v, 'utf8').digest('hex');
}
function list(v: unknown, min: number, max: number): readonly unknown[] {
  if (!Array.isArray(v) || v.length < min || v.length > max)
    fail('array bound');
  return v;
}
function sortedUnique(v: readonly string[]): void {
  if (new Set(v).size !== v.length || [...v].sort().join('\n') !== v.join('\n'))
    fail('unique sorted list required');
}
function freeze<T>(v: T): Readonly<T> {
  if (v && typeof v === 'object') {
    for (const child of Object.values(v)) freeze(child);
    Object.freeze(v);
  }
  return v;
}
function scope(r: Row): void {
  ref(r.simulationId);
  ref(r.worldId);
  ref(r.countryId);
  if (r.sourceClass !== 'SIMULATED_OPENING') fail('simulation class required');
}
function catalog(record: SocialOfficeSimulatedRecord, p: Row): void {
  const c = row(own(JSON.parse(record.rawUtf8) as unknown), [
    'schemaVersion',
    'sourceClass',
    'simulationId',
    'worldId',
    'countryId',
    'resources',
  ]);
  scope(c);
  if (
    c.schemaVersion !== 'social-office-simulated-resource-catalog-v1' ||
    ['simulationId', 'worldId', 'countryId'].some((k) => c[k] !== p[k])
  )
    fail('catalog scope');
  const ids = new Set<string>(),
    aliases = new Set<string>();
  let aliasCount = 0;
  for (const value of list(c.resources, 1, 4096)) {
    const r = row(value, ['resourceId', 'kind', 'unit', 'aliases']),
      id = ref(r.resourceId);
    if (
      ids.has(id) ||
      !['PERSON', 'TIME', 'BUDGET', 'MEDICINE', 'FACILITY'].includes(
        text(r.kind),
      )
    )
      fail('resource identity');
    ids.add(id);
    ref(r.unit);
    const names = list(r.aliases, 1, 64).map(ref);
    if (!names.includes(id)) fail('canonical alias missing');
    for (const name of names) {
      if (aliases.has(name)) fail('alias collision');
      aliases.add(name);
    }
    aliasCount += names.length;
    if (aliasCount > 16384) fail('alias bound');
  }
}
/** Own data only. Original record bytes remain exact; no authority or effects. */
export function parseSocialOfficeSimulatedPublication(
  input: unknown,
): Readonly<SocialOfficeSimulatedPublication> {
  const p = row(own(input), publicationKeys);
  scope(p);
  ref(p.operationId);
  if (
    p.schemaVersion !== 'social-office-simulated-source-publication-v1' ||
    !['ACTIVE', 'REVOKED'].includes(text(p.disposition))
  )
    fail('publication schema');
  const generation = decimal(p.expectedGeneration);
  if (
    generation === '0'
      ? p.expectedManifestHash !== null
      : p.expectedManifestHash === null
  )
    fail('CAS pins paired');
  if (p.expectedManifestHash !== null) digest(p.expectedManifestHash);
  const from = decimal(p.validFromSimTime);
  if (
    p.validUntilSimTime !== null &&
    BigInt(decimal(p.validUntilSimTime)) <= BigInt(from)
  )
    fail('empty validity');
  const allowed = list(p.allowedPurposes, 1, 3).map((v) => text(v));
  sortedUnique(allowed);
  if (allowed.some((v) => !purposes.includes(v)))
    fail('unknown document purpose');
  const rs = list(p.records, 1, 256).map((v) => row(v, recordKeys)),
    ids: string[] = [],
    groups = new Set<string>();
  let catalogs = 0;
  for (const r of rs) {
    const id = ref(r.recordId);
    ids.push(id);
    ref(r.revision);
    if (!roles.includes(text(r.role))) fail('record role');
    const raw = text(r.rawUtf8, 1048576);
    if (sha(raw) !== digest(r.sha256)) fail('original bytes hash');
    const body: unknown = JSON.parse(raw);
    if (!body || typeof body !== 'object' || Array.isArray(body))
      fail('JSON original object required');
    if (r.role === 'PHYSICAL_ORIGINAL_BODY') {
      const b = body as Row;
      if (
        Object.hasOwn(b, 'headWorldVersion') ||
        Object.hasOwn(b, 'headEventSequence') ||
        b.worldId !== p.worldId ||
        b.countryId !== p.countryId
      )
        fail('physical body scope/audit');
      const key = sha(
        [
          'SOCIAL_PHYSICAL_GROUP_V1',
          ref(b.worldId),
          ref(b.countryId),
          ref(b.locationId),
          decimal(b.dayIndex),
        ].join('\n'),
      );
      if (r.physicalGroupKey !== key || groups.has(key))
        fail('physical group identity');
      groups.add(key);
    } else if (r.physicalGroupKey !== null) fail('unexpected physical key');
    if (r.role === 'RESOURCE_CATALOG') {
      if (id !== catalogId) fail('fixed catalog identity');
      catalogs++;
      catalog(r as unknown as SocialOfficeSimulatedRecord, p);
    } else if (id === catalogId) fail('catalog role');
  }
  sortedUnique(ids);
  if (catalogs !== 1) fail('one complete catalog required');
  const selected = list(p.selectedRecordIds, 1, 256).map(ref);
  sortedUnique(selected);
  if (
    selected.some((id) => !ids.includes(id)) ||
    rs.some(
      (r) =>
        (r.role === 'RESOURCE_CATALOG' ||
          r.role === 'PHYSICAL_ORIGINAL_BODY') &&
        !selected.includes(r.recordId as string),
    )
  )
    fail('selected original set');
  if (Buffer.byteLength(canonicalSerialize(p), 'utf8') > 4194304)
    fail('publication byte bound');
  return freeze(p as unknown as SocialOfficeSimulatedPublication);
}
export function parseSocialOfficeSimulatedSourceRequest(
  input: unknown,
): Readonly<SocialOfficeSimulatedSourceRequest> {
  const r = row(own(input), requestKeys);
  scope(r);
  decimal(r.simTime);
  if (
    r.schemaVersion !== 'social-office-simulated-source-request-v1' ||
    !purposes.includes(text(r.purpose))
  )
    fail('request schema/purpose');
  if ((r.expectedGeneration === null) !== (r.expectedManifestHash === null))
    fail('prepared pins paired');
  if (r.expectedGeneration !== null && decimal(r.expectedGeneration) === '0')
    fail('positive prepared generation');
  if (r.expectedManifestHash !== null) digest(r.expectedManifestHash);
  return freeze(r as unknown as SocialOfficeSimulatedSourceRequest);
}
/** Fixed publication function only. Actual grants are independent host setup. */
export async function publishSocialOfficeSimulatedSource(
  database: PostgresSqlDatabase,
  input: unknown,
): Promise<
  Readonly<{
    sourceClass: 'SIMULATED_OPENING';
    simulationId: string;
    worldId: string;
    countryId: string;
    source: 'NEW' | 'EXISTING';
    generation: string;
    manifestHash: string;
  }>
> {
  if (
    types.isProxy(database) ||
    Object.getPrototypeOf(database) !== PostgresSqlDatabase.prototype
  )
    fail('original PostgreSQL adapter required');
  const p = parseSocialOfficeSimulatedPublication(input),
    bytes = canonicalSerialize(p);
  return PostgresSqlDatabase.prototype.transaction.call(
    database,
    async (executor: SqlExecutor) => {
      const result = await executor.query<{ outcome: unknown }>(
        'select world_v2.social_demo_publish_source($1) as outcome',
        [bytes],
      );
      if (result.rows.length !== 1) fail('publication outcome required');
      const v = row(own(result.rows[0]!.outcome), [
        'sourceClass',
        'simulationId',
        'worldId',
        'countryId',
        'source',
        'generation',
        'manifestHash',
      ]);
      scope(v);
      if (
        (['simulationId', 'worldId', 'countryId'] as const).some(
          (k) => v[k] !== p[k],
        ) ||
        !['NEW', 'EXISTING'].includes(text(v.source)) ||
        decimal(v.generation) !==
          (BigInt(p.expectedGeneration) + 1n).toString() ||
        digest(v.manifestHash) !== sha(bytes)
      )
        fail('publication outcome mismatch');
      digest(v.manifestHash);
      return freeze(v);
    },
  ) as Promise<
    Readonly<{
      sourceClass: 'SIMULATED_OPENING';
      simulationId: string;
      worldId: string;
      countryId: string;
      source: 'NEW' | 'EXISTING';
      generation: string;
      manifestHash: string;
    }>
  >;
}
/** Locks ALL source documents/predicates before any source read; no World lock here. */
export async function readSocialOfficeSimulatedSourceFrom(
  executor: SqlExecutor,
  input: unknown,
): Promise<Readonly<SocialOfficeSimulatedSourceSnapshot>> {
  const r = parseSocialOfficeSimulatedSourceRequest(input),
    args = [r.simulationId, r.worldId, r.countryId];
  const anchor = await executor.query<{
    schema_version: string;
    source_class: string;
  }>(
    'select schema_version,source_class from world_v2.social_demo_source_scope where simulation_id=$1 and world_id=$2 and country_id=$3 for share',
    args,
  );
  if (
    anchor.rows.length !== 1 ||
    anchor.rows[0]!.schema_version !==
      'social-office-simulated-source-store-v1' ||
    anchor.rows[0]!.source_class !== 'SIMULATED_OPENING'
  )
    fail('permanent simulated anchor missing');
  const result = await executor.query<{
    generation: string;
    manifest_hash: string;
    publication_utf8: string;
  }>(
    'select generation::text,manifest_hash,publication_utf8 from world_v2.social_demo_source_revision where simulation_id=$1 and world_id=$2 and country_id=$3 order by generation desc limit 1',
    args,
  );
  if (result.rows.length !== 1) fail('current simulated source missing');
  const v = result.rows[0]!,
    generation = decimal(v.generation),
    manifestHash = digest(v.manifest_hash);
  if (sha(v.publication_utf8) !== manifestHash) fail('manifest bytes hash');
  const p = parseSocialOfficeSimulatedPublication(
    JSON.parse(v.publication_utf8) as unknown,
  );
  if (
    generation === '0' ||
    BigInt(generation) !== BigInt(p.expectedGeneration) + 1n ||
    ['simulationId', 'worldId', 'countryId'].some(
      (k) => p[k as keyof typeof p] !== r[k as keyof typeof r],
    )
  )
    fail('manifest scope/generation');
  if (
    (r.expectedGeneration !== null &&
      (r.expectedGeneration !== generation ||
        r.expectedManifestHash !== manifestHash)) ||
    p.disposition !== 'ACTIVE' ||
    !p.allowedPurposes.includes(r.purpose) ||
    BigInt(r.simTime) < BigInt(p.validFromSimTime) ||
    (p.validUntilSimTime !== null &&
      BigInt(r.simTime) >= BigInt(p.validUntilSimTime))
  )
    fail('current applicability/pins');
  const originals = await executor.query<{
    record_id: string;
    revision: string;
    role: string;
    physical_group_key: string | null;
    raw_utf8: string;
    sha256: string;
  }>(
    'select record_id,revision,role,physical_group_key,raw_utf8,sha256 from world_v2.social_demo_source_record where simulation_id=$1 and world_id=$2 and country_id=$3 order by record_id collate "C"',
    args,
  );
  const exact = originals.rows.map((o) => ({
    recordId: o.record_id,
    revision: o.revision,
    role: o.role,
    physicalGroupKey: o.physical_group_key,
    rawUtf8: o.raw_utf8,
    sha256: o.sha256,
  }));
  if (canonicalSerialize(exact) !== canonicalSerialize(p.records))
    fail('complete original set mismatch');
  return freeze({
    sourceClass: 'SIMULATED_OPENING',
    sourceAdmitted: false,
    actualSourceCustodian: 'SUPPLIER_UNCONFIRMED',
    request: r,
    generation,
    manifestHash,
    publication: p,
  });
}

/** Retained raw revision, not permission. The permanent anchor also covers absence. */
export async function readSocialOfficeSimulatedRevisionFrom(
  executor: SqlExecutor,
  identity: Readonly<{
    simulationId: string;
    worldId: string;
    countryId: string;
  }>,
  pins: Readonly<{ generation: string; manifestHash: string }> | null = null,
) {
  const args = [
    ref(identity.simulationId),
    ref(identity.worldId),
    ref(identity.countryId),
  ];
  const anchor = await executor.query<{
    source_class: string;
    schema_version: string;
  }>(
    'select source_class,schema_version from world_v2.social_demo_source_scope where simulation_id=$1 and world_id=$2 and country_id=$3 for share',
    args,
  );
  if (
    anchor.rows.length !== 1 ||
    anchor.rows[0]!.source_class !== 'SIMULATED_OPENING' ||
    anchor.rows[0]!.schema_version !== 'social-office-simulated-source-store-v1'
  )
    fail('permanent simulated anchor missing');
  if (pins !== null) {
    decimal(pins.generation);
    digest(pins.manifestHash);
  }
  const result = await executor.query<{
    generation: string;
    manifest_hash: string;
    publication_utf8: string;
  }>(
    `select generation::text,manifest_hash,publication_utf8 from world_v2.social_demo_source_revision where simulation_id=$1 and world_id=$2 and country_id=$3 ${pins === null ? 'order by generation desc limit 1' : 'and generation=$4 and manifest_hash=$5'}`,
    pins === null ? args : [...args, pins.generation, pins.manifestHash],
  );
  if (result.rows.length !== 1) fail('retained source missing');
  const value = result.rows[0]!,
    generation = decimal(value.generation),
    manifestHash = digest(value.manifest_hash);
  if (sha(value.publication_utf8) !== manifestHash) fail('manifest bytes hash');
  const publication = parseSocialOfficeSimulatedPublication(
    JSON.parse(value.publication_utf8) as unknown,
  );
  if (
    BigInt(generation) !== BigInt(publication.expectedGeneration) + 1n ||
    ['simulationId', 'worldId', 'countryId'].some(
      (k) =>
        publication[k as keyof typeof publication] !==
        identity[k as keyof typeof identity],
    )
  )
    fail('retained scope/generation');
  const originals = await executor.query<{
    record_id: string;
    revision: string;
    role: string;
    physical_group_key: string | null;
    raw_utf8: string;
    sha256: string;
  }>(
    'select record_id,revision,role,physical_group_key,raw_utf8,sha256 from world_v2.social_demo_source_record where simulation_id=$1 and world_id=$2 and country_id=$3 order by record_id collate "C"',
    args,
  );
  const exact = originals.rows.map((o) => ({
    recordId: o.record_id,
    revision: o.revision,
    role: o.role,
    physicalGroupKey: o.physical_group_key,
    rawUtf8: o.raw_utf8,
    sha256: o.sha256,
  }));
  if (canonicalSerialize(exact) !== canonicalSerialize(publication.records))
    fail('complete retained original set mismatch');
  return freeze({
    publicationUtf8: value.publication_utf8,
    generation,
    manifestHash,
    publication,
  });
}
