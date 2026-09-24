/** Local browser-session safety marker, never an authoritative command store. */
export const LOCAL_PENDING_MARKER_KEY =
  'econmind.local-world.pending-command.v1';

export interface PendingMarkerStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface PendingMarker {
  readonly schemaVersion: 'LOCAL_WORLD_PENDING_COMMAND_V1';
  readonly scopeDigest: string;
  readonly requestId: string;
  readonly commandId: string;
  readonly expectedWorldVersion: string;
}

export type PendingMarkerRead =
  | { readonly state: 'EMPTY' }
  | { readonly state: 'PENDING'; readonly marker: PendingMarker }
  | { readonly state: 'CORRUPT' }
  | { readonly state: 'UNAVAILABLE' };

const canonicalId = /^[A-Z][A-Z0-9]*(?:[_-][A-Z0-9]+)*$/u;
const canonicalUuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const canonicalVersion = /^(?:0|[1-9]\d*)$/u;
const digestPattern = /^sha256:[0-9a-f]{64}$/u;
const reservations = new WeakSet<PendingMarkerStorage>();

function loopbackHost(hostname: string): boolean {
  return ['localhost', '127.0.0.1', '[::1]'].includes(hostname);
}

/** A remote page cannot opt into this local-only command storage path. */
export function localPendingStorage(
  injected: PendingMarkerStorage | null | undefined,
): PendingMarkerStorage | null {
  if (
    typeof window !== 'undefined' &&
    !loopbackHost(window.location.hostname)
  ) {
    return null;
  }
  if (injected !== undefined) return injected;
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function parsedMarker(value: unknown): PendingMarker | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    return null;
  const input = value as Record<string, unknown>;
  const keys = Object.keys(input).sort();
  const expected = [
    'schemaVersion',
    'scopeDigest',
    'requestId',
    'commandId',
    'expectedWorldVersion',
  ].sort();
  if (
    keys.length !== expected.length ||
    keys.some((key, index) => key !== expected[index])
  ) {
    return null;
  }
  if (
    input.schemaVersion !== 'LOCAL_WORLD_PENDING_COMMAND_V1' ||
    typeof input.scopeDigest !== 'string' ||
    !digestPattern.test(input.scopeDigest) ||
    typeof input.requestId !== 'string' ||
    !canonicalUuid.test(input.requestId) ||
    typeof input.commandId !== 'string' ||
    !canonicalId.test(input.commandId) ||
    typeof input.expectedWorldVersion !== 'string' ||
    !canonicalVersion.test(input.expectedWorldVersion)
  )
    return null;
  return input as unknown as PendingMarker;
}

export function readPendingMarker(
  storage: PendingMarkerStorage | null,
): PendingMarkerRead {
  if (!storage) return { state: 'UNAVAILABLE' };
  try {
    const raw = storage.getItem(LOCAL_PENDING_MARKER_KEY);
    if (raw === null) return { state: 'EMPTY' };
    if (raw.length > 1024) return { state: 'CORRUPT' };
    const marker = parsedMarker(JSON.parse(raw) as unknown);
    return marker ? { state: 'PENDING', marker } : { state: 'CORRUPT' };
  } catch {
    return { state: 'UNAVAILABLE' };
  }
}

async function digestScope(fields: readonly string[]): Promise<string | null> {
  try {
    const input = new TextEncoder().encode(JSON.stringify(fields));
    const digest = await globalThis.crypto.subtle.digest('SHA-256', input);
    return `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
  } catch {
    return null;
  }
}

export async function reservePendingMarker(input: {
  readonly storage: PendingMarkerStorage | null;
  readonly scopeFields: readonly string[];
  readonly requestId: string;
  readonly commandId: string;
  readonly expectedWorldVersion: string;
}): Promise<'RESERVED' | 'EXISTING' | 'UNAVAILABLE'> {
  const storage = input.storage;
  if (!storage) return 'UNAVAILABLE';
  if (reservations.has(storage)) return 'EXISTING';
  reservations.add(storage);
  try {
    const scopeDigest = await digestScope(input.scopeFields);
    if (!scopeDigest) return 'UNAVAILABLE';
    const previous = readPendingMarker(storage);
    if (previous.state === 'UNAVAILABLE') return 'UNAVAILABLE';
    if (previous.state !== 'EMPTY') return 'EXISTING';
    const marker: PendingMarker = {
      schemaVersion: 'LOCAL_WORLD_PENDING_COMMAND_V1',
      scopeDigest,
      requestId: input.requestId,
      commandId: input.commandId,
      expectedWorldVersion: input.expectedWorldVersion,
    };
    storage.setItem(LOCAL_PENDING_MARKER_KEY, JSON.stringify(marker));
    return 'RESERVED';
  } catch {
    return 'UNAVAILABLE';
  } finally {
    reservations.delete(storage);
  }
}

export function clearPendingMarker(
  storage: PendingMarkerStorage | null,
): boolean {
  if (!storage) return false;
  try {
    storage.removeItem(LOCAL_PENDING_MARKER_KEY);
    return storage.getItem(LOCAL_PENDING_MARKER_KEY) === null;
  } catch {
    return false;
  }
}
