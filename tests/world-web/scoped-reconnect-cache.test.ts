import { describe, expect, it } from 'vitest';

import {
  createScopedProjectionCache,
  scopedCacheKey,
  type CacheScope,
  type ScopedSnapshot,
} from '../../apps/world-web/src/reconnect/scoped-cache';

const scope: CacheScope = {
  worldId: 'world-1',
  authSubjectId: 'person-4',
  authorizationRevision: 'rev-3',
  countryId: 'country-9',
  officeId: 'FINANCE',
  scopeKey: 'office-private',
  modelVersion: 'model-2',
  projectionVersion: 'projection-5',
};

function snapshot(
  worldVersion: string,
  payload: unknown = { cash: '10.25' },
  snapshotRef = `snapshot-${worldVersion}`,
): ScopedSnapshot {
  return { scope, worldVersion, snapshotRef, payload };
}

describe('V26.2 scoped client recovery preparation', () => {
  it('binds every scope and version field without delimiter collisions', () => {
    const first = scopedCacheKey(scope, '11');
    const fields: (keyof CacheScope)[] = [
      'worldId',
      'authSubjectId',
      'authorizationRevision',
      'countryId',
      'officeId',
      'scopeKey',
      'modelVersion',
      'projectionVersion',
    ];
    for (const field of fields) {
      expect(
        scopedCacheKey({ ...scope, [field]: `${scope[field]}-other` }, '11'),
      ).not.toBe(first);
    }
    expect(scopedCacheKey(scope, '12')).not.toBe(first);
    expect(scopedCacheKey({ ...scope, countryId: 'a","b' }, '11')).not.toBe(
      scopedCacheKey({ ...scope, countryId: 'a', officeId: 'b' }, '11'),
    );
    expect(() => scopedCacheKey(scope, '011')).toThrow(
      'INVALID_CACHE_IDENTITY',
    );
  });

  it('accepts only monotonically newer snapshots and rejects same-version conflicts', () => {
    const cache = createScopedProjectionCache();
    expect(cache.bindAuthorization('person-4', 'rev-3')).toBe(true);
    expect(cache.acceptSnapshot(snapshot('9007199254740993'))).toBe('ACCEPTED');
    expect(cache.acceptSnapshot(snapshot('9007199254740992'))).toBe('STALE');
    expect(cache.acceptSnapshot(snapshot('9007199254740993'))).toBe(
      'DUPLICATE',
    );
    expect(
      cache.acceptSnapshot(snapshot('9007199254740993', { cash: '99' })),
    ).toBe('CONFLICT');
    expect(cache.acceptSnapshot(snapshot('9007199254740994'))).toBe('ACCEPTED');
    expect(cache.read(scope)).toMatchObject({
      state: 'DERIVED_CACHE',
      worldVersion: '9007199254740994',
      liveAvailability: 'UNAVAILABLE_NO_LIVE_CHANNEL',
    });
  });

  it('treats outbox notices as invalidation only and waits for a covering snapshot', () => {
    const cache = createScopedProjectionCache();
    cache.bindAuthorization('person-4', 'rev-3');
    cache.acceptSnapshot(snapshot('8'));
    expect(
      cache.observeNotice({
        scope,
        worldVersion: '12',
        noticeRef: 'notice-12',
      }),
    ).toBe('RECONCILIATION_REQUIRED');
    expect(
      cache.observeNotice({ scope, worldVersion: '10', noticeRef: 'late-10' }),
    ).toBe('IGNORED_OLD_OR_DUPLICATE');
    expect(
      cache.observeNotice({
        scope,
        worldVersion: '12',
        noticeRef: 'duplicate-12',
      }),
    ).toBe('IGNORED_OLD_OR_DUPLICATE');
    expect(cache.read(scope)).toMatchObject({
      state: 'DERIVED_CACHE',
      worldVersion: '8',
      payload: { cash: '10.25' },
      reconciliationRequired: true,
    });
    expect(cache.acceptSnapshot(snapshot('11'))).toBe('BEHIND_NOTICE');
    expect(cache.read(scope)).toMatchObject({ worldVersion: '8' });
    expect(cache.acceptSnapshot(snapshot('12', { cash: '14.00' }))).toBe(
      'RECONCILED',
    );
    expect(cache.read(scope)).toMatchObject({
      worldVersion: '12',
      payload: { cash: '14.00' },
      reconciliationRequired: false,
    });
  });

  it('requires snapshot reconciliation after reconnect, including at the same version', () => {
    const cache = createScopedProjectionCache();
    cache.bindAuthorization('person-4', 'rev-3');
    cache.acceptSnapshot(snapshot('5'));
    cache.onReconnect();
    expect(cache.liveAvailability()).toBe('UNAVAILABLE_NO_LIVE_CHANNEL');
    expect(cache.read(scope)).toMatchObject({ reconciliationRequired: true });
    expect(cache.acceptSnapshot(snapshot('5'))).toBe('RECONCILED');
    expect(cache.read(scope)).toMatchObject({ reconciliationRequired: false });
    cache.onReconnect();
    expect(cache.acceptSnapshot(snapshot('5', { cash: '10.26' }))).toBe(
      'CONFLICT',
    );
    expect(cache.read(scope)).toMatchObject({ reconciliationRequired: true });
  });

  it('clears values on revocation or identity revision change and isolates scope', () => {
    const cache = createScopedProjectionCache();
    expect(cache.read(scope)).toMatchObject({
      state: 'UNAVAILABLE',
      reason: 'AUTHORIZATION_NOT_BOUND',
    });
    cache.bindAuthorization('person-4', 'rev-3');
    expect(cache.acceptSnapshot(snapshot('4'))).toBe('ACCEPTED');
    expect(cache.read({ ...scope, countryId: 'country-8' })).toMatchObject({
      state: 'UNAVAILABLE',
      reason: 'NO_SNAPSHOT',
    });
    expect(
      cache.observeNotice({
        scope: { ...scope, authorizationRevision: 'rev-4' },
        worldVersion: '5',
        noticeRef: 'wrong-revision',
      }),
    ).toBe('SCOPE_MISMATCH');
    cache.revokeAuthorization();
    cache.bindAuthorization('person-4', 'rev-3');
    expect(cache.read(scope)).toMatchObject({ reason: 'NO_SNAPSHOT' });
    cache.acceptSnapshot(snapshot('4'));
    cache.bindAuthorization('person-4', 'rev-4');
    expect(cache.read(scope)).toMatchObject({ reason: 'SCOPE_MISMATCH' });
  });

  it('fails closed and clears prior data when a new authorization binding is invalid', () => {
    const cache = createScopedProjectionCache();
    cache.bindAuthorization('person-4', 'rev-3');
    cache.acceptSnapshot(snapshot('4'));
    expect(cache.bindAuthorization('person-4', '')).toBe(false);
    expect(cache.read(scope)).toMatchObject({
      state: 'UNAVAILABLE',
      reason: 'AUTHORIZATION_NOT_BOUND',
    });
    cache.bindAuthorization('person-4', 'rev-3');
    expect(cache.read(scope)).toMatchObject({ reason: 'NO_SNAPSHOT' });
  });

  it('copies payloads and rejects non-JSON projection data', () => {
    const cache = createScopedProjectionCache();
    cache.bindAuthorization('person-4', 'rev-3');
    const payload = { rows: [{ amount: '1.50' }] };
    expect(cache.acceptSnapshot(snapshot('1', payload))).toBe('ACCEPTED');
    payload.rows[0]!.amount = '99.00';
    const read = cache.read(scope);
    expect(read).toMatchObject({ payload: { rows: [{ amount: '1.50' }] } });
    if (read.state === 'DERIVED_CACHE') {
      (read.payload as { rows: { amount: string }[] }).rows[0]!.amount =
        '88.00';
    }
    expect(cache.read(scope)).toMatchObject({
      payload: { rows: [{ amount: '1.50' }] },
    });
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    expect(cache.acceptSnapshot(snapshot('2', cyclic))).toBe('INVALID');
    expect(cache.acceptSnapshot(snapshot('2', { value: Infinity }))).toBe(
      'INVALID',
    );
    let getterCalled = false;
    const accessor = Object.defineProperty({}, 'cash', {
      enumerable: true,
      get() {
        getterCalled = true;
        return '7';
      },
    });
    expect(cache.acceptSnapshot(snapshot('2', accessor))).toBe('INVALID');
    expect(getterCalled).toBe(false);
    expect(cache.acceptSnapshot(snapshot('2', Array(1)))).toBe('INVALID');
    expect(cache.read(scope)).toMatchObject({ worldVersion: '1' });
  });
});
