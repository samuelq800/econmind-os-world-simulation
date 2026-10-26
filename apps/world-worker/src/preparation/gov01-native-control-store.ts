/** Native control metadata only. No economic account issuance or source grant. */
import { createHash } from 'node:crypto';
import { types } from 'node:util';
import { canonicalSerialize } from '@econmind/core';
import { PostgresSqlDatabase } from '../persistence/postgres-sql-database.js';
import type { SqlExecutor } from '../persistence/sql-database.js';
import {
  GOV01_ORIGINAL_ID,
  parseGov01ReadRequest,
  type Gov01RawPin,
  type Gov01ReadRequest,
} from './b06-gov01-adopted-record-source.js';

export const GOV01_CONTROL_DEPENDENCIES = Object.freeze([
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
] as const);
export type Gov01ControlDependency =
  (typeof GOV01_CONTROL_DEPENDENCIES)[number];
type Row = Record<string, unknown>;

export class Gov01NativeControlInvalid extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.name = 'Gov01NativeControlInvalid';
    this.code = code;
  }
}
export function demandGov01Control(
  value: unknown,
  code: string,
): asserts value {
  if (!value) throw new Gov01NativeControlInvalid(code);
}
export const gov01ControlSha256 = (bytes: string | Uint8Array) =>
  createHash('sha256').update(bytes).digest('hex');

/** Descriptor-safe owned copy. Numbers are data only, never generation/money. */
export function captureGov01ControlData(input: unknown): unknown {
  let nodes = 0,
    bytes = 0;
  const active = new Set<object>();
  const copy = (v: unknown, depth: number): unknown => {
    demandGov01Control(++nodes <= 50000 && depth <= 24, 'GOV01_DATA_BUDGET');
    if (v === null || typeof v === 'boolean') return v;
    if (typeof v === 'string') {
      bytes += Buffer.byteLength(v);
      demandGov01Control(
        bytes <= 16 * 1024 * 1024 &&
          Buffer.from(v, 'utf8').toString('utf8') === v,
        'GOV01_UTF8_OR_DATA_BUDGET',
      );
      return v;
    }
    if (typeof v === 'number') {
      demandGov01Control(Number.isSafeInteger(v), 'GOV01_EXACT_DATA_REQUIRED');
      return v;
    }
    demandGov01Control(
      v !== null &&
        typeof v === 'object' &&
        !types.isProxy(v) &&
        !active.has(v),
      'GOV01_OWNED_DATA_REQUIRED',
    );
    const array = Array.isArray(v);
    demandGov01Control(
      Object.getPrototypeOf(v) === (array ? Array.prototype : Object.prototype),
      'GOV01_PLAIN_DATA_REQUIRED',
    );
    const descriptors = Object.getOwnPropertyDescriptors(v);
    const keys = Reflect.ownKeys(descriptors);
    demandGov01Control(keys.length <= (array ? 1025 : 65), 'GOV01_DATA_BUDGET');
    active.add(v);
    try {
      if (array) {
        demandGov01Control(
          keys.length === v.length + 1,
          'GOV01_DENSE_ARRAY_REQUIRED',
        );
        return Object.freeze(
          Array.from({ length: v.length }, (_, index) => {
            const d = descriptors[String(index)];
            demandGov01Control(
              d && Object.hasOwn(d, 'value') && d.enumerable,
              'GOV01_ACCESSOR_DENIED',
            );
            return copy(d.value, depth + 1);
          }),
        );
      }
      const result: Row = {};
      for (const key of keys) {
        demandGov01Control(
          typeof key === 'string' &&
            !['__proto__', 'constructor', 'prototype'].includes(key),
          'GOV01_DATA_KEY',
        );
        const d = descriptors[key]!;
        demandGov01Control(
          Object.hasOwn(d, 'value') && d.enumerable,
          'GOV01_ACCESSOR_DENIED',
        );
        Object.defineProperty(result, key, {
          value: copy(d.value, depth + 1),
          enumerable: true,
        });
      }
      return Object.freeze(result);
    } finally {
      active.delete(v);
    }
  };
  return copy(input, 0);
}
export function gov01ControlRow(value: unknown, keys?: readonly string[]): Row {
  demandGov01Control(
    value !== null && typeof value === 'object' && !Array.isArray(value),
    'GOV01_OBJECT_REQUIRED',
  );
  const result = value as Row;
  if (keys)
    demandGov01Control(
      Object.keys(result).length === keys.length &&
        Object.keys(result).every((k) => keys.includes(k)),
      'GOV01_EXACT_KEYS_REQUIRED',
    );
  return result;
}
export function gov01ControlText(value: unknown): string {
  demandGov01Control(
    typeof value === 'string' &&
      Buffer.byteLength(value) >= 1 &&
      Buffer.byteLength(value) <= 512 &&
      Array.from(value).every((character) => {
        const code = character.codePointAt(0)!;
        return code > 31 && code !== 127;
      }),
    'GOV01_REFERENCE_REQUIRED',
  );
  return value;
}
export function gov01ControlDigest(value: unknown): string {
  demandGov01Control(
    typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value),
    'GOV01_SHA256_REQUIRED',
  );
  return value;
}
export function gov01ControlDecimal(value: unknown): string {
  demandGov01Control(
    typeof value === 'string' && /^(?:0|[1-9][0-9]{0,63})$/u.test(value),
    'GOV01_INTEGER_REQUIRED',
  );
  return value;
}
function fullPin(value: unknown): Gov01RawPin {
  const p = gov01ControlRow(value, [
    'documentId',
    'sourceVersion',
    'byteLength',
    'sha256',
    'pointer',
  ]);
  gov01ControlText(p.documentId);
  gov01ControlText(p.sourceVersion);
  gov01ControlDecimal(p.byteLength);
  gov01ControlDigest(p.sha256);
  demandGov01Control(
    p.pointer === '' &&
      BigInt(p.byteLength as string) >= 1n &&
      BigInt(p.byteLength as string) <= 1048576n,
    'GOV01_FULL_DOCUMENT_PIN_REQUIRED',
  );
  return p as unknown as Gov01RawPin;
}

export interface Gov01ControlReplacement {
  readonly recordClass: 'CONTROL_PROTOCOL_ONLY' | 'RETAINED_RECORDS';
  readonly anchorReference: string;
  readonly scopeReference: string;
  readonly registrationReference: string;
  readonly sourceSetVersion: string;
  readonly targetDeploymentRef: string;
  readonly databaseIdentityRef: string;
  readonly connectorReference: string;
  readonly allowedCaller: 'WORKER_GOV01_ACCOUNT_READ_V1';
  readonly enrollmentReference: string;
  /** Owned transport fields only. Native control is derived, not self-hashed. */
  readonly bindingBase: Readonly<Row> | null;
  readonly manifestPin: Gov01RawPin | null;
  readonly documents: readonly Readonly<{ pin: Gov01RawPin; utf8: string }>[];
}
export interface Gov01ControlOperation {
  readonly schemaVersion: 'gov01-control-operation-v1';
  readonly operationId: string;
  readonly worldId: string;
  readonly originalId: typeof GOV01_ORIGINAL_ID;
  readonly heldHead: Gov01ReadRequest['heldHead'];
  readonly expected: Readonly<{
    generation: string;
    headDigest: string;
  }> | null;
  readonly kind:
    | 'REGISTER'
    | 'REPLACE_RECORD_SET'
    | 'REPLACE_INSTALLATION'
    | 'REVOKE'
    | 'RETIRE';
  readonly payload:
    | Gov01ControlReplacement
    | Readonly<{ dependency: Gov01ControlDependency }>
    | Readonly<{ reasonReference: string }>;
}
const replacementKeys = [
  'recordClass',
  'anchorReference',
  'scopeReference',
  'registrationReference',
  'sourceSetVersion',
  'targetDeploymentRef',
  'databaseIdentityRef',
  'connectorReference',
  'allowedCaller',
  'enrollmentReference',
  'bindingBase',
  'manifestPin',
  'documents',
];

export function parseGov01ControlOperation(
  value: unknown,
): Readonly<Gov01ControlOperation> {
  const b = gov01ControlRow(captureGov01ControlData(value), [
    'schemaVersion',
    'operationId',
    'worldId',
    'originalId',
    'heldHead',
    'expected',
    'kind',
    'payload',
  ]);
  demandGov01Control(
    b.schemaVersion === 'gov01-control-operation-v1' &&
      b.originalId === GOV01_ORIGINAL_ID,
    'GOV01_CONTROL_SCOPE',
  );
  demandGov01Control(
    /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,511}$/u.test(
      gov01ControlText(b.operationId),
    ),
    'GOV01_OPERATION_ID',
  );
  parseGov01ReadRequest({
    registrationReference: 'CONTROL_PROTOCOL_REQUEST',
    requestedOriginalId: GOV01_ORIGINAL_ID,
    sourceSetVersion: 'CONTROL_PROTOCOL_REQUEST',
    worldId: b.worldId,
    heldHead: b.heldHead,
  });
  demandGov01Control(
    [
      'REGISTER',
      'REPLACE_RECORD_SET',
      'REPLACE_INSTALLATION',
      'REVOKE',
      'RETIRE',
    ].includes(b.kind as string),
    'GOV01_OPERATION_KIND',
  );
  if (b.kind === 'REGISTER')
    demandGov01Control(b.expected === null, 'GOV01_EXPECTED_ABSENCE');
  else {
    const e = gov01ControlRow(b.expected, ['generation', 'headDigest']);
    gov01ControlDecimal(e.generation);
    gov01ControlDigest(e.headDigest);
  }
  if (
    ['REGISTER', 'REPLACE_RECORD_SET', 'REPLACE_INSTALLATION'].includes(
      b.kind as string,
    )
  ) {
    const p = gov01ControlRow(b.payload, replacementKeys);
    demandGov01Control(
      ['CONTROL_PROTOCOL_ONLY', 'RETAINED_RECORDS'].includes(
        p.recordClass as string,
      ) && p.allowedCaller === 'WORKER_GOV01_ACCOUNT_READ_V1',
      'GOV01_REPLACEMENT_CLASS',
    );
    for (const k of replacementKeys.slice(1, 10)) gov01ControlText(p[k]);
    if (p.bindingBase !== null)
      demandGov01Control(
        !Object.hasOwn(gov01ControlRow(p.bindingBase), 'control'),
        'GOV01_NATIVE_CONTROL_NOT_PAYLOAD_SELF_HASH',
      );
    demandGov01Control(
      Array.isArray(p.documents) && p.documents.length <= 32,
      'GOV01_DOCUMENT_COUNT',
    );
    let bytes = 0;
    const ids = new Set<string>();
    for (const v of p.documents) {
      const d = gov01ControlRow(v, ['pin', 'utf8']),
        pin = fullPin(d.pin);
      demandGov01Control(
        !ids.has(pin.documentId) && typeof d.utf8 === 'string',
        'GOV01_DUPLICATE_OR_INVALID_DOCUMENT',
      );
      ids.add(pin.documentId);
      bytes += Buffer.byteLength(d.utf8);
      demandGov01Control(
        String(Buffer.byteLength(d.utf8)) === pin.byteLength &&
          gov01ControlSha256(d.utf8) === pin.sha256,
        'GOV01_RAW_PIN_MISMATCH',
      );
    }
    demandGov01Control(bytes <= 8388608, 'GOV01_TOTAL_RAW_BUDGET');
    if (p.manifestPin !== null) {
      // Manifest selector may be non-root; A validates its exact supported JSON.
      const pin = gov01ControlRow(p.manifestPin, [
        'documentId',
        'sourceVersion',
        'byteLength',
        'sha256',
        'pointer',
      ]);
      gov01ControlText(pin.documentId);
      gov01ControlText(pin.sourceVersion);
      gov01ControlDecimal(pin.byteLength);
      gov01ControlDigest(pin.sha256);
      demandGov01Control(
        typeof pin.pointer === 'string' &&
          Buffer.byteLength(pin.pointer) <= 2048,
        'GOV01_MANIFEST_SELECTOR',
      );
    }
    if (p.recordClass === 'RETAINED_RECORDS')
      demandGov01Control(
        p.bindingBase !== null &&
          p.manifestPin !== null &&
          p.documents.length > 0,
        'GOV01_RETAINED_SET_REQUIRED',
      );
  } else if (b.kind === 'REVOKE') {
    const p = gov01ControlRow(b.payload, ['dependency']);
    demandGov01Control(
      GOV01_CONTROL_DEPENDENCIES.includes(
        p.dependency as Gov01ControlDependency,
      ),
      'GOV01_REVOCATION_SCOPE',
    );
  } else
    gov01ControlText(
      gov01ControlRow(b.payload, ['reasonReference']).reasonReference,
    );
  return b as unknown as Readonly<Gov01ControlOperation>;
}

export interface Gov01ControlSnapshot {
  readonly classification: 'CONTROL_PROTOCOL_ONLY';
  readonly status: 'ABSENT' | 'PRESENT';
  readonly worldId: string;
  readonly heldHead: Gov01ReadRequest['heldHead'];
  readonly catalogIdentity: string;
  readonly recordClass?: 'CONTROL_PROTOCOL_ONLY' | 'RETAINED_RECORDS';
  readonly anchorReference?: string;
  readonly scopeReference?: string;
  readonly generation?: string;
  readonly headDigest?: string;
  readonly previousHeadDigest?: string;
  readonly checkpointGeneration?: string;
  readonly checkpointHeadDigest?: string;
  readonly parentGeneration?: string | null;
  readonly parentHeadDigest?: string | null;
  readonly state?: Readonly<Row>;
  readonly documents?: readonly Readonly<{ pin: Gov01RawPin; utf8: string }>[];
}

/** Returned data is not an installed source, a lock token or a COMMIT result. */
export async function readGov01NativeControlSnapshotFrom(
  executor: SqlExecutor,
  requestValue: Gov01ReadRequest,
) {
  const request = parseGov01ReadRequest(requestValue);
  const result = await executor.query<{ snapshot: unknown }>(
    'select world_v2.gov01_read_control_snapshot($1,$2,$3) as snapshot',
    [
      request.worldId,
      request.heldHead.worldVersion,
      request.heldHead.eventSequence,
    ],
  );
  demandGov01Control(result.rows.length === 1, 'GOV01_SNAPSHOT_REQUIRED');
  const value = gov01ControlRow(
    captureGov01ControlData(result.rows[0]!.snapshot),
  );
  demandGov01Control(
    value.classification === 'CONTROL_PROTOCOL_ONLY' &&
      ['ABSENT', 'PRESENT'].includes(value.status as string) &&
      value.worldId === request.worldId &&
      canonicalSerialize(value.heldHead) ===
        canonicalSerialize(request.heldHead),
    'GOV01_SNAPSHOT_CONTEXT',
  );
  gov01ControlText(value.catalogIdentity);
  if (value.status === 'PRESENT') {
    gov01ControlDecimal(value.generation);
    gov01ControlDigest(value.headDigest);
    demandGov01Control(
      value.generation === value.checkpointGeneration &&
        value.headDigest === value.checkpointHeadDigest,
      'GOV01_CHECKPOINT_MISMATCH',
    );
    const payload = gov01ControlRow(gov01ControlRow(value.state).payload);
    demandGov01Control(
      payload.registrationReference === request.registrationReference &&
        payload.sourceSetVersion === request.sourceSetVersion,
      'GOV01_SELECTOR_MISMATCH',
    );
  }
  return value as unknown as Readonly<Gov01ControlSnapshot>;
}

/** One existing adapter transaction; UNKNOWN never releases a control result. */
export async function applyGov01NativeControlOperation(
  database: PostgresSqlDatabase,
  value: unknown,
) {
  demandGov01Control(
    database instanceof PostgresSqlDatabase,
    'GOV01_EXISTING_ADAPTER_REQUIRED',
  );
  const operation = parseGov01ControlOperation(value),
    body = canonicalSerialize(operation);
  const digest = gov01ControlSha256('GOV01_CONTROL_OPERATION_V1\n' + body);
  const result = await database.transaction(async (executor) => {
    const rows = await executor.query<{ outcome: unknown }>(
      'select world_v2.gov01_apply_control_operation($1,$2) as outcome',
      [body, digest],
    );
    demandGov01Control(
      rows.rows.length === 1,
      'GOV01_OPERATION_RESULT_REQUIRED',
    );
    const outcome = gov01ControlRow(
      captureGov01ControlData(rows.rows[0]!.outcome),
      [
        'classification',
        'source',
        'worldId',
        'operationId',
        'generation',
        'headDigest',
      ],
    );
    demandGov01Control(
      outcome.classification === 'CONTROL_PROTOCOL_ONLY' &&
        outcome.worldId === operation.worldId &&
        outcome.operationId === operation.operationId &&
        ['NEW_CONTROL_OPERATION', 'EXISTING_CONTROL_OPERATION'].includes(
          outcome.source as string,
        ),
      'GOV01_OPERATION_RESULT',
    );
    gov01ControlDecimal(outcome.generation);
    gov01ControlDigest(outcome.headDigest);
    return outcome;
  });
  return Object.freeze({
    transactionResult: 'COMMITTED' as const,
    result,
    sourceAdmitted: false as const,
    actualSourceInstalled: false as const,
  });
}
