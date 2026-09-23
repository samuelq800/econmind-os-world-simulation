/** Derived presentation cache only. Its values are never authoritative state. */
export interface CacheScope {
  readonly worldId: string;
  readonly authSubjectId: string;
  readonly authorizationRevision: string;
  readonly countryId: string;
  readonly officeId: string;
  readonly scopeKey: string;
  readonly modelVersion: string;
  readonly projectionVersion: string;
}

export interface ScopedSnapshot {
  readonly scope: CacheScope;
  readonly worldVersion: string;
  readonly snapshotRef: string;
  readonly payload: unknown;
}

export interface ScopedOutboxNotice {
  readonly scope: CacheScope;
  readonly worldVersion: string;
  readonly noticeRef: string;
}

export type SnapshotDecision =
  | 'ACCEPTED'
  | 'RECONCILED'
  | 'DUPLICATE'
  | 'STALE'
  | 'CONFLICT'
  | 'BEHIND_NOTICE'
  | 'SCOPE_MISMATCH'
  | 'INVALID';

export type NoticeDecision =
  | 'RECONCILIATION_REQUIRED'
  | 'IGNORED_OLD_OR_DUPLICATE'
  | 'SCOPE_MISMATCH'
  | 'INVALID';

export type CacheRead =
  | {
      readonly state: 'UNAVAILABLE';
      readonly reason:
        'AUTHORIZATION_NOT_BOUND' | 'SCOPE_MISMATCH' | 'NO_SNAPSHOT';
      readonly liveAvailability: 'UNAVAILABLE_NO_LIVE_CHANNEL';
    }
  | {
      readonly state: 'DERIVED_CACHE';
      readonly cacheKey: string;
      readonly snapshotRef: string;
      readonly worldVersion: string;
      readonly reconciliationRequired: boolean;
      readonly liveAvailability: 'UNAVAILABLE_NO_LIVE_CHANNEL';
      readonly payload: unknown;
    };

interface CacheEntry {
  readonly snapshotRef: string;
  readonly worldVersion: string;
  readonly canonicalPayload: string;
}

interface ScopeProgress {
  noticeWatermark: string | null;
  reconciliationRequired: boolean;
}

const keyVersion = 'V26_DERIVED_CACHE_V1';
const canonicalVersion = /^(?:0|[1-9]\d*)$/;

function nonempty(value: unknown): value is string {
  return (
    typeof value === 'string' && value.length > 0 && value.trim() === value
  );
}

function validScope(scope: CacheScope | null | undefined): scope is CacheScope {
  return (
    !!scope &&
    nonempty(scope.worldId) &&
    nonempty(scope.authSubjectId) &&
    nonempty(scope.authorizationRevision) &&
    nonempty(scope.countryId) &&
    nonempty(scope.officeId) &&
    nonempty(scope.scopeKey) &&
    nonempty(scope.modelVersion) &&
    nonempty(scope.projectionVersion)
  );
}

function validVersion(version: unknown): version is string {
  return typeof version === 'string' && canonicalVersion.test(version);
}

function compareVersion(left: string, right: string): number {
  const a = BigInt(left);
  const b = BigInt(right);
  return a < b ? -1 : a > b ? 1 : 0;
}

function scopeTuple(scope: CacheScope): readonly string[] {
  return [
    keyVersion,
    scope.worldId,
    scope.authSubjectId,
    scope.authorizationRevision,
    scope.countryId,
    scope.officeId,
    scope.scopeKey,
    scope.modelVersion,
    scope.projectionVersion,
  ];
}

function scopeKey(scope: CacheScope): string {
  return JSON.stringify(scopeTuple(scope));
}

/** JSON tuple encoding prevents delimiter collisions between scope fields. */
export function scopedCacheKey(
  scope: CacheScope,
  worldVersion: string,
): string {
  if (!validScope(scope) || !validVersion(worldVersion)) {
    throw new Error('INVALID_CACHE_IDENTITY');
  }
  return JSON.stringify([...scopeTuple(scope), worldVersion]);
}

/** Canonical JSON copy rejects cycles, non-JSON values and mutable prototypes. */
function canonicalPayload(
  value: unknown,
  ancestors = new Set<object>(),
): string {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return JSON.stringify(value);
  }
  if (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    !Object.is(value, -0)
  ) {
    return JSON.stringify(value);
  }
  if (typeof value !== 'object') throw new Error('INVALID_CACHE_PAYLOAD');
  if (ancestors.has(value)) throw new Error('INVALID_CACHE_PAYLOAD');
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      if (
        Reflect.ownKeys(value).some(
          (key) =>
            key !== 'length' &&
            (typeof key !== 'string' || !/^(?:0|[1-9]\d*)$/.test(key)),
        )
      )
        throw new Error('INVALID_CACHE_PAYLOAD');
      const items: string[] = [];
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(
          value,
          String(index),
        );
        if (!descriptor || !('value' in descriptor)) {
          throw new Error('INVALID_CACHE_PAYLOAD');
        }
        items.push(canonicalPayload(descriptor.value, ancestors));
      }
      return `[${items.join(',')}]`;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error('INVALID_CACHE_PAYLOAD');
    }
    if (Object.getOwnPropertySymbols(value).length > 0) {
      throw new Error('INVALID_CACHE_PAYLOAD');
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const pairs = Object.keys(descriptors)
      .sort()
      .map((key) => {
        if (
          key === '__proto__' ||
          key === 'constructor' ||
          key === 'prototype'
        ) {
          throw new Error('INVALID_CACHE_PAYLOAD');
        }
        const descriptor = descriptors[key];
        if (!descriptor?.enumerable || !('value' in descriptor)) {
          throw new Error('INVALID_CACHE_PAYLOAD');
        }
        return `${JSON.stringify(key)}:${canonicalPayload(descriptor.value, ancestors)}`;
      });
    return `{${pairs.join(',')}}`;
  } finally {
    ancestors.delete(value);
  }
}

export function createScopedProjectionCache() {
  const snapshots = new Map<string, CacheEntry>();
  const progress = new Map<string, ScopeProgress>();
  let authorization: {
    readonly authSubjectId: string;
    readonly authorizationRevision: string;
  } | null = null;

  function matchesAuthorization(scope: CacheScope): boolean {
    return (
      authorization?.authSubjectId === scope.authSubjectId &&
      authorization.authorizationRevision === scope.authorizationRevision
    );
  }

  return {
    bindAuthorization(
      authSubjectId: string,
      authorizationRevision: string,
    ): boolean {
      if (!nonempty(authSubjectId) || !nonempty(authorizationRevision))
        return false;
      if (
        authorization?.authSubjectId !== authSubjectId ||
        authorization.authorizationRevision !== authorizationRevision
      ) {
        snapshots.clear();
        progress.clear();
      }
      authorization = { authSubjectId, authorizationRevision };
      return true;
    },
    revokeAuthorization(): void {
      snapshots.clear();
      progress.clear();
      authorization = null;
    },
    acceptSnapshot(snapshot: ScopedSnapshot): SnapshotDecision {
      if (
        !validScope(snapshot?.scope) ||
        !validVersion(snapshot.worldVersion) ||
        !nonempty(snapshot.snapshotRef)
      )
        return 'INVALID';
      if (!matchesAuthorization(snapshot.scope)) return 'SCOPE_MISMATCH';

      let payload: string;
      try {
        payload = canonicalPayload(snapshot.payload);
      } catch {
        return 'INVALID';
      }
      const key = scopeKey(snapshot.scope);
      const current = snapshots.get(key);
      const marker = progress.get(key);
      if (
        current &&
        compareVersion(snapshot.worldVersion, current.worldVersion) < 0
      )
        return 'STALE';
      if (
        marker?.noticeWatermark &&
        compareVersion(snapshot.worldVersion, marker.noticeWatermark) < 0
      )
        return 'BEHIND_NOTICE';

      if (
        current &&
        compareVersion(snapshot.worldVersion, current.worldVersion) === 0
      ) {
        if (
          current.snapshotRef !== snapshot.snapshotRef ||
          current.canonicalPayload !== payload
        )
          return 'CONFLICT';
        if (!marker?.reconciliationRequired) return 'DUPLICATE';
        marker.reconciliationRequired = false;
        return 'RECONCILED';
      }

      snapshots.set(key, {
        snapshotRef: snapshot.snapshotRef,
        worldVersion: snapshot.worldVersion,
        canonicalPayload: payload,
      });
      progress.set(key, {
        noticeWatermark: marker?.noticeWatermark ?? null,
        reconciliationRequired: false,
      });
      return marker?.reconciliationRequired ? 'RECONCILED' : 'ACCEPTED';
    },
    observeNotice(notice: ScopedOutboxNotice): NoticeDecision {
      if (
        !validScope(notice?.scope) ||
        !validVersion(notice.worldVersion) ||
        !nonempty(notice.noticeRef)
      )
        return 'INVALID';
      if (!matchesAuthorization(notice.scope)) return 'SCOPE_MISMATCH';
      const key = scopeKey(notice.scope);
      const current = snapshots.get(key);
      const marker = progress.get(key);
      if (
        (current &&
          compareVersion(notice.worldVersion, current.worldVersion) <= 0) ||
        (marker?.noticeWatermark &&
          compareVersion(notice.worldVersion, marker.noticeWatermark) <= 0)
      )
        return 'IGNORED_OLD_OR_DUPLICATE';
      progress.set(key, {
        noticeWatermark: notice.worldVersion,
        reconciliationRequired: true,
      });
      return 'RECONCILIATION_REQUIRED';
    },
    onReconnect(): void {
      for (const key of snapshots.keys()) {
        const marker = progress.get(key) ?? {
          noticeWatermark: null,
          reconciliationRequired: false,
        };
        marker.reconciliationRequired = true;
        progress.set(key, marker);
      }
    },
    read(scope: CacheScope): CacheRead {
      const liveAvailability = 'UNAVAILABLE_NO_LIVE_CHANNEL' as const;
      if (!authorization) {
        return {
          state: 'UNAVAILABLE',
          reason: 'AUTHORIZATION_NOT_BOUND',
          liveAvailability,
        };
      }
      if (!validScope(scope) || !matchesAuthorization(scope)) {
        return {
          state: 'UNAVAILABLE',
          reason: 'SCOPE_MISMATCH',
          liveAvailability,
        };
      }
      const key = scopeKey(scope);
      const current = snapshots.get(key);
      if (!current) {
        return {
          state: 'UNAVAILABLE',
          reason: 'NO_SNAPSHOT',
          liveAvailability,
        };
      }
      return {
        state: 'DERIVED_CACHE',
        cacheKey: scopedCacheKey(scope, current.worldVersion),
        snapshotRef: current.snapshotRef,
        worldVersion: current.worldVersion,
        reconciliationRequired:
          progress.get(key)?.reconciliationRequired ?? false,
        liveAvailability,
        payload: JSON.parse(current.canonicalPayload) as unknown,
      };
    },
    liveAvailability(): 'UNAVAILABLE_NO_LIVE_CHANNEL' {
      return 'UNAVAILABLE_NO_LIVE_CHANNEL';
    },
  };
}
