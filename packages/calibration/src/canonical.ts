import { createHash } from 'node:crypto';

function normalize(value: unknown): unknown {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError('Canonical JSON rejects non-finite numbers');
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(normalize);
  }
  if (typeof value === 'object') {
    const output: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      const item = (value as Record<string, unknown>)[key];
      if (item === undefined) {
        throw new TypeError(`Canonical JSON rejects undefined at ${key}`);
      }
      output[key] = normalize(item);
    }
    return output;
  }
  throw new TypeError(`Canonical JSON rejects ${typeof value}`);
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalize(value));
}

export function sha256Bytes(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function sha256Canonical(value: unknown): string {
  return sha256Bytes(Buffer.from(canonicalJson(value), 'utf8'));
}
