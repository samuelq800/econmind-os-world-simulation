// PREPARATION_ONLY_NOT_V09_2_STARTED: test infrastructure only.

import { createHash } from 'node:crypto';

import { writeV09StagingEvidence } from '../../scripts/v09-staging-evidence-runner.mjs';
import { V09_ATOMIC_PREPARATION_STATE } from './v09-atomic-contract.js';

export type EvidenceScalar = boolean | null | number | string;
export type EvidenceValue =
  | EvidenceScalar
  | readonly EvidenceValue[]
  | { readonly [key: string]: EvidenceValue };

export interface V09AtomicEvidenceEnvelope {
  readonly payload: EvidenceValue;
  readonly payloadSha256: string;
  readonly preparationState: typeof V09_ATOMIC_PREPARATION_STATE;
  readonly schemaVersion: 'V09_ATOMIC_PREPARATION_EVIDENCE-1';
}

export interface AtomicEvidenceWriter {
  (input: {
    readonly evidence: V09AtomicEvidenceEnvelope;
    readonly evidencePath: string;
  }): Promise<void>;
}

const SENSITIVE_KEY =
  /(?:connection|credential|password|secret|database[_-]?url|service[_-]?key|anon[_-]?key|publishable[_-]?key|token)/iu;
const SENSITIVE_VALUE = /(?:postgres(?:ql)?|https?):\/\/[^\s]+/iu;

function canonicalize(value: EvidenceValue, key = ''): EvidenceValue {
  if (
    SENSITIVE_KEY.test(key) ||
    (typeof value === 'string' && SENSITIVE_VALUE.test(value))
  ) {
    return '[REDACTED]';
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new Error('Evidence numbers must be finite');
  }
  if (Array.isArray(value)) {
    return Object.freeze(value.map((entry) => canonicalize(entry)));
  }
  if (value !== null && typeof value === 'object') {
    const sorted = Object.entries(value).sort(([left], [right]) =>
      left.localeCompare(right, 'en'),
    );
    return Object.freeze(
      Object.fromEntries(
        sorted.map(([entryKey, entryValue]) => [
          entryKey,
          canonicalize(entryValue, entryKey),
        ]),
      ),
    );
  }
  return value;
}

export function serializeV09AtomicEvidence(value: EvidenceValue): string {
  return JSON.stringify(canonicalize(value));
}

export function prepareV09AtomicEvidence(
  value: EvidenceValue,
): V09AtomicEvidenceEnvelope {
  const payload = canonicalize(value);
  const serialized = JSON.stringify(payload);
  const payloadSha256 = `sha256:${createHash('sha256')
    .update(serialized, 'utf8')
    .digest('hex')}`;
  return Object.freeze({
    payload,
    payloadSha256,
    preparationState: V09_ATOMIC_PREPARATION_STATE,
    schemaVersion: 'V09_ATOMIC_PREPARATION_EVIDENCE-1',
  });
}

export async function writeV09AtomicEvidence(input: {
  readonly evidencePath: string;
  readonly payload: EvidenceValue;
  readonly writer?: AtomicEvidenceWriter;
}): Promise<V09AtomicEvidenceEnvelope> {
  const evidence = prepareV09AtomicEvidence(input.payload);
  const writer = input.writer ?? writeV09StagingEvidence;
  await writer({ evidence, evidencePath: input.evidencePath });
  return evidence;
}
