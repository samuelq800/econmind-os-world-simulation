import type { DecisionResultHead } from '../authorization/office-decision-result-contract.js';
import {
  validateCanonicalCommand,
  type CanonicalCommand,
  type CanonicalSha256,
  type Sha256Hex,
} from '../commands/command.js';
import {
  bindAuthoritativeTransition,
  createAuthoritativeTransition,
  type AuthoritativeTransition,
} from '../commands/receipt.js';
import { DOMAIN_ERROR_CODES, DomainError } from '../errors.js';
import {
  validateAuthoritativeEvent,
  type AuthoritativeEvent,
} from '../events/event.js';
import { commandId, inventoryPostingId, worldId } from '../ids.js';
import { SimTime } from '../numeric/sim-time.js';
import {
  canonicalSerialize,
  isCanonicalInputProxy,
} from '../serialization/canonical.js';

type Head = Readonly<{ worldVersion: string; eventSequence: string }>;
type Target = Readonly<{
  targetDeploymentRef: string;
  databaseIdentityRef: string;
}>;
type Build = Readonly<{
  constructorSourceCommit: string;
  constructorBlobSHA256: string;
  decoderProtocol: 'industry-production-decoder-v1';
  decoderBuildSHA256: string;
}>;

/** Expected scope data only; no native observation, source grant or capability. */
export interface IndustryPersistenceSchemaReadContextV1 {
  readonly schemaVersion: 'industry-persistence-schema-read-context-v1';
  readonly purpose: 'INDUSTRY_PRODUCTION_CANONICAL_HISTORY_READ';
  readonly worldId: string;
  readonly expectedHead: Head;
  readonly target: Target;
  readonly build: Build;
}

/** Expected fresh candidate data, independently compared at the server boundary. */
export interface IndustryPersistenceSchemaCommitContextV1 {
  readonly schemaVersion: 'industry-persistence-schema-commit-context-v1';
  readonly purpose: 'INDUSTRY_PRODUCTION_NEW_EFFECT_COMMIT';
  readonly worldId: string;
  readonly expectedHead: Head;
  readonly target: Target;
  readonly build: Build;
  readonly commandBinding: Readonly<{
    commandId: string;
    commandFingerprint: CanonicalSha256;
    simTime: string;
  }>;
}

export type IndustryPersistenceSchemaBoundaryContextV1 =
  | IndustryPersistenceSchemaReadContextV1
  | IndustryPersistenceSchemaCommitContextV1;

export interface IndustryPersistenceSchemaPostingIdentityV1 {
  readonly schemaVersion: string;
  readonly operation: string;
  readonly worldId: string;
  readonly causationCommandId: string;
  readonly postingId: string;
  readonly fingerprint: CanonicalSha256;
  readonly worldVersionBefore: string;
  readonly worldVersionAfter: string;
}

export interface IndustryPersistenceSchemaBoundaryActualInputV1 {
  readonly context: unknown;
  readonly actualHeldHead: DecisionResultHead;
  readonly actualTarget: Target;
  readonly actualBuild: Build;
  readonly command: CanonicalCommand;
  readonly transition: AuthoritativeTransition;
  readonly postingIdentities: readonly IndustryPersistenceSchemaPostingIdentityV1[];
}

type Data = Record<string, unknown>;
function invalid(message: string): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.INVENTORY_INPUT_INVALID,
    `Industry persistence boundary: ${message}`,
  );
}

function fields(value: unknown, keys: readonly string[]): Data {
  if (
    isCanonicalInputProxy(value) ||
    value === null ||
    typeof value !== 'object' ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    invalid('Plain closed own data required');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const actual = Reflect.ownKeys(descriptors);
  if (
    actual.length !== keys.length ||
    actual.some((key) => typeof key !== 'string' || !keys.includes(key))
  )
    invalid('Missing or unknown key');
  const owned: Data = {};
  for (const key of keys) {
    const d = descriptors[key];
    if (!d || !Object.hasOwn(d, 'value') || !d.enumerable)
      invalid('Own enumerable data properties required');
    owned[key] = d.value;
  }
  return owned;
}

function array(value: unknown, min: number, max: number): unknown[] {
  if (
    isCanonicalInputProxy(value) ||
    !Array.isArray(value) ||
    value.length < min ||
    value.length > max
  )
    invalid('Array capacity exceeded');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).length !== value.length + 1)
    invalid('Dense array without extra keys required');
  const owned: unknown[] = [];
  for (let i = 0; i < value.length; i++) {
    const d = descriptors[String(i)];
    if (!d || !Object.hasOwn(d, 'value') || !d.enumerable)
      invalid('Array holes or accessors refused');
    owned.push(d.value);
  }
  return owned;
}

function text(value: unknown, max?: number): string {
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    (max !== undefined && value.length > max)
  )
    invalid('Bounded exact text required');
  return value;
}
function integer(value: unknown, positive = false): string {
  if (
    typeof value !== 'string' ||
    value.length > 19 ||
    !(positive ? /^[1-9]\d*$/u : /^(?:0|[1-9]\d*)$/u).test(value) ||
    BigInt(value) > 9_223_372_036_854_775_807n
  )
    invalid('Canonical PostgreSQL bigint text required');
  return value;
}
function fingerprint(value: unknown): CanonicalSha256 {
  if (typeof value !== 'string' || !/^sha256:[0-9a-f]{64}$/u.test(value))
    invalid('Canonical object fingerprint required');
  return value as CanonicalSha256;
}
function hex(value: unknown, length: 40 | 64): string {
  if (
    typeof value !== 'string' ||
    value.length !== length ||
    !/^[0-9a-f]+$/u.test(value)
  )
    invalid('Exact lowercase Git or raw byte hash required');
  return value;
}
function literal<T extends string>(value: unknown, expected: T): T {
  if (value !== expected) invalid('Unsupported schema, purpose or protocol');
  return expected;
}
function simTime(value: unknown): string {
  const ticks = text(value, 120);
  return SimTime.fromTicks(ticks).toCanonicalValue();
}
function head(value: unknown): Head {
  const r = fields(value, ['worldVersion', 'eventSequence']);
  return Object.freeze({
    worldVersion: integer(r.worldVersion),
    eventSequence: integer(r.eventSequence),
  });
}
function target(value: unknown): Target {
  const r = fields(value, ['targetDeploymentRef', 'databaseIdentityRef']);
  return Object.freeze({
    targetDeploymentRef: text(r.targetDeploymentRef, 512),
    databaseIdentityRef: text(r.databaseIdentityRef, 512),
  });
}
function build(value: unknown): Build {
  const r = fields(value, [
    'constructorSourceCommit',
    'constructorBlobSHA256',
    'decoderProtocol',
    'decoderBuildSHA256',
  ]);
  return Object.freeze({
    constructorSourceCommit: hex(r.constructorSourceCommit, 40),
    constructorBlobSHA256: hex(r.constructorBlobSHA256, 64),
    decoderProtocol: literal(
      r.decoderProtocol,
      'industry-production-decoder-v1',
    ),
    decoderBuildSHA256: hex(r.decoderBuildSHA256, 64),
  });
}
// Canonical JSON escapes lone surrogates. Count UTF8 without browser/server APIs.
function utf8Bytes(value: string): number {
  let bytes = 0;
  for (const character of value) {
    const point = character.codePointAt(0)!;
    bytes += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
  }
  return bytes;
}

/** Detached, deeply frozen expected data. Never freezes the caller's objects. */
export function parseIndustryPersistenceSchemaBoundaryContext(
  value: unknown,
): Readonly<IndustryPersistenceSchemaBoundaryContextV1> {
  // Inspect the discriminator as own data, never by invoking a getter/Proxy.
  if (
    isCanonicalInputProxy(value) ||
    value === null ||
    typeof value !== 'object'
  )
    invalid('Context data required');
  const discriminator = Object.getOwnPropertyDescriptor(value, 'schemaVersion');
  if (!discriminator || !Object.hasOwn(discriminator, 'value'))
    invalid('Own schema required');
  const read =
    discriminator.value === 'industry-persistence-schema-read-context-v1';
  const r = fields(value, [
    'schemaVersion',
    'purpose',
    'worldId',
    'expectedHead',
    'target',
    'build',
    ...(read ? [] : ['commandBinding']),
  ]);
  const common = {
    worldId: worldId(text(r.worldId)),
    expectedHead: head(r.expectedHead),
    target: target(r.target),
    build: build(r.build),
  };
  let parsed: IndustryPersistenceSchemaBoundaryContextV1;
  if (read) {
    parsed = Object.freeze({
      schemaVersion: literal(
        r.schemaVersion,
        'industry-persistence-schema-read-context-v1',
      ),
      purpose: literal(r.purpose, 'INDUSTRY_PRODUCTION_CANONICAL_HISTORY_READ'),
      ...common,
    });
  } else {
    const c = fields(r.commandBinding, [
      'commandId',
      'commandFingerprint',
      'simTime',
    ]);
    parsed = Object.freeze({
      schemaVersion: literal(
        r.schemaVersion,
        'industry-persistence-schema-commit-context-v1',
      ),
      purpose: literal(r.purpose, 'INDUSTRY_PRODUCTION_NEW_EFFECT_COMMIT'),
      ...common,
      commandBinding: Object.freeze({
        commandId: commandId(text(c.commandId)),
        commandFingerprint: fingerprint(c.commandFingerprint),
        simTime: simTime(c.simTime),
      }),
    });
  }
  if (utf8Bytes(canonicalSerialize(parsed)) > 4096)
    invalid('Context exceeds 4096 UTF8 bytes');
  return parsed;
}

/** Structural recognition only; never installed representation admission. */
export function classifyInventoryPersistenceSchemaPair(
  value: unknown,
): Readonly<{
  status: 'SCHEMA_PAIR_RECOGNIZED_NOT_ADMITTED';
  family: 'V08_MOVEMENT' | 'INDUSTRY_PRODUCTION';
}> {
  const r = fields(value, ['schemaVersion', 'operation']);
  let family: 'V08_MOVEMENT' | 'INDUSTRY_PRODUCTION';
  if (
    r.schemaVersion === 'inventory-posting-v1' &&
    typeof r.operation === 'string' &&
    ['RESERVE', 'RELEASE', 'SHIP', 'DELIVER'].includes(r.operation)
  )
    family = 'V08_MOVEMENT';
  else if (
    r.schemaVersion === 'inventory-production-consumption-v1' &&
    r.operation === 'PRODUCE_AND_CONSUME'
  )
    family = 'INDUSTRY_PRODUCTION';
  else invalid('Unknown or mixed schema-operation pair');
  return Object.freeze({
    status: 'SCHEMA_PAIR_RECOGNIZED_NOT_ADMITTED',
    family,
  });
}

/**
 * Compare independently supplied actual data. D must supply the complete actual
 * group and independently verify bodies, constructors, native admission, purpose,
 * source decisions and physical resource protection. This result grants none.
 */
export function assertIndustryPersistenceSchemaBoundaryMatchesActual(
  input: IndustryPersistenceSchemaBoundaryActualInputV1,
  sha256Hex: Sha256Hex,
): Readonly<{
  status: 'BOUNDARY_DATA_MATCHED_NOT_ADMITTED';
  scope: 'CONTEXT_AND_CANONICAL_IDENTITIES_ONLY';
}> {
  const r = fields(input, [
    'context',
    'actualHeldHead',
    'actualTarget',
    'actualBuild',
    'command',
    'transition',
    'postingIdentities',
  ]);
  const context = parseIndustryPersistenceSchemaBoundaryContext(r.context);
  const h = fields(r.actualHeldHead, [
    'worldId',
    'worldVersion',
    'eventSequence',
  ]);
  const actualWorld = worldId(text(h.worldId));
  const held = head({
    worldVersion: h.worldVersion,
    eventSequence: h.eventSequence,
  });
  if (
    actualWorld !== context.worldId ||
    canonicalSerialize(held) !== canonicalSerialize(context.expectedHead) ||
    canonicalSerialize(target(r.actualTarget)) !==
      canonicalSerialize(context.target) ||
    canonicalSerialize(build(r.actualBuild)) !==
      canonicalSerialize(context.build)
  )
    invalid('Actual scope differs from expected context');

  // Existing canonical handling rejects nested getters/Proxies/cycles before
  // any existing validator reads properties. Reconstruct owned Core values.
  const commandWire = canonicalSerialize(r.command);
  const command = validateCanonicalCommand(
    r.command as CanonicalCommand,
    sha256Hex,
  );
  if (commandWire !== canonicalSerialize(command))
    invalid('Command changed during validation');
  simTime(command.simTime.toCanonicalValue());
  const transitionWire = canonicalSerialize(r.transition);
  const t = fields(r.transition, [
    'schemaVersion',
    'transitionId',
    'worldId',
    'commandId',
    'commandFingerprint',
    'worldVersionBefore',
    'worldVersionAfter',
    'eventIds',
    'events',
  ]);
  const transition = createAuthoritativeTransition({
    command,
    worldVersionBefore: integer(t.worldVersionBefore),
    worldVersionAfter: integer(t.worldVersionAfter, true),
    events: array(t.events, 1, 10000).map((event) =>
      validateAuthoritativeEvent(event as AuthoritativeEvent, sha256Hex),
    ),
  });
  if (transitionWire !== canonicalSerialize(transition))
    invalid('Transition differs from complete canonical evidence');
  // Unlike transition construction alone, this binds every Event's SimTime.
  bindAuthoritativeTransition({ command, transition }, sha256Hex);
  const first = integer(transition.events[0]!.sequence, true);
  const last = integer(
    transition.events[transition.events.length - 1]!.sequence,
    true,
  );
  if (
    command.worldId !== actualWorld ||
    command.expectedWorldVersion !== transition.worldVersionBefore
  )
    invalid('Actual Command/transition World or expected version mismatch');
  const afterWV = BigInt(transition.worldVersionAfter),
    heldWV = BigInt(held.worldVersion);
  const lastSeq = BigInt(last),
    heldSeq = BigInt(held.eventSequence);
  if (context.schemaVersion === 'industry-persistence-schema-read-context-v1') {
    if (!(
      (afterWV < heldWV && lastSeq < heldSeq) ||
      (afterWV === heldWV && lastSeq === heldSeq)
    ))
      invalid(
        'Historical group must precede or equal held head in both coordinates',
      );
  } else {
    const c = context.commandBinding;
    if (
      c.commandId !== command.commandId ||
      c.commandFingerprint !== command.fingerprint ||
      c.simTime !== command.simTime.toCanonicalValue() ||
      transition.worldVersionBefore !== held.worldVersion ||
      afterWV !== heldWV + 1n ||
      BigInt(first) !== heldSeq + 1n
    )
      invalid(
        'Fresh candidate must bind Command and the next held-head transition',
      );
  }

  let production = false;
  const ids = new Set<string>(),
    fingerprints = new Set<string>();
  for (const item of array(r.postingIdentities, 1, 10000)) {
    const p = fields(item, [
      'schemaVersion',
      'operation',
      'worldId',
      'causationCommandId',
      'postingId',
      'fingerprint',
      'worldVersionBefore',
      'worldVersionAfter',
    ]);
    const pair = classifyInventoryPersistenceSchemaPair({
      schemaVersion: p.schemaVersion,
      operation: p.operation,
    });
    production ||= pair.family === 'INDUSTRY_PRODUCTION';
    const id = inventoryPostingId(text(p.postingId)),
      fp = fingerprint(p.fingerprint);
    if (
      worldId(text(p.worldId)) !== actualWorld ||
      commandId(text(p.causationCommandId)) !== command.commandId ||
      integer(p.worldVersionBefore) !== transition.worldVersionBefore ||
      integer(p.worldVersionAfter, true) !== transition.worldVersionAfter ||
      ids.has(id) ||
      fingerprints.has(fp)
    )
      invalid('Posting group identity, boundary or uniqueness mismatch');
    ids.add(id);
    fingerprints.add(fp);
  }
  if (!production) invalid('Production-bearing complete group required');
  return Object.freeze({
    status: 'BOUNDARY_DATA_MATCHED_NOT_ADMITTED',
    scope: 'CONTEXT_AND_CANONICAL_IDENTITIES_ONLY',
  });
}
