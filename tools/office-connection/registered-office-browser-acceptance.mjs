/** Isolated acceptance adapter. It starts no API, database, consumer or Clock.
 * Bindings come from the caller's already-running registered Node over TCP.
 * Commands must come from that native fixture's actual source builders. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createFixedOfficeBrowserProbe } from './fixed-office-command-browser.mjs';

const roles = Object.freeze({
  captain: 'CAPTAIN',
  finance: 'FINANCE',
  central_bank: 'CENTRAL_BANK',
  industry: 'INDUSTRY',
  trade: 'TRADE',
  social: 'SOCIAL',
});
const uint = (v) => typeof v === 'string' && /^(0|[1-9][0-9]*)$/u.test(v);
function loopback(value) {
  const u = new URL(value);
  assert.equal(u.protocol, 'http:');
  assert.equal(u.hostname, '127.0.0.1');
  assert.equal(u.username + u.password + u.search + u.hash, '');
  assert.equal(u.pathname, '/');
  return u.origin;
}

/** Returns only actual DOM results and token-free evidence. No synthetic wire
 * fixtures, fallback responses, fabricated source facts or auto-consume loop. */
export async function createRegisteredOfficeBrowserAcceptance({
  browser,
  application,
  apiBaseURL,
  applicationOrigin,
  readConfiguration,
  authSubject,
  countryId,
  countryDisplayId,
  getAccessToken,
}) {
  const backend = loopback(apiBaseURL),
    pins = Object.freeze({ ...readConfiguration.admittedWorldPins }),
    endpoints = Object.freeze({ ...readConfiguration.endpointPins });
  assert.match(countryDisplayId, /^(0[1-9]|[1-6][0-9]|70)$/u);
  assert.equal(typeof getAccessToken, 'function');
  assert.equal(new URL(applicationOrigin).protocol, 'https:');
  assert.equal(new URL(endpoints.origin).protocol, 'https:');
  assert.notEqual(applicationOrigin, endpoints.origin);
  const active = new Set(),
    evidence = {
      classification: 'ACTUAL_REGISTERED_NODE_TCP_AND_SHIPPED_BROWSER',
      bundleSha256: application.bundleSha256,
      metadata: [],
      operations: [],
      backendStartedHere: false,
      consumerStartedHere: false,
      platformURL_TLS: 'NOT_VERIFIED_BY_LOOPBACK_PROXY',
    };
  let closed = false;
  const requireLive = () => assert.equal(closed, false);
  async function currentSeat() {
    requireLive();
    const accessToken = await getAccessToken();
    assert.equal(typeof accessToken, 'string');
    assert.match(accessToken, /^Bearer [A-Za-z0-9._-]+$/u);
    const requestId = randomUUID(),
      begin = performance.now(),
      response = await fetch(backend + '/v1/current-seat', {
        method: 'POST',
        headers: {
          authorization: accessToken,
          'content-type': 'application/json',
          origin: applicationOrigin,
        },
        body: JSON.stringify({
          schemaVersion: 'world-current-seat-v1',
          requestId,
        }),
        signal: AbortSignal.timeout(10000),
        redirect: 'error',
      }),
      text = await response.text();
    assert.equal(response.status, 200);
    assert.ok(Buffer.byteLength(text) <= 65536);
    const body = JSON.parse(text);
    assert.equal(body.schemaVersion, 'world-current-seat-v1');
    assert.equal(body.requestId, requestId);
    assert.equal(body.ok, true);
    assert.deepEqual(body.world, pins);
    assert.equal(body.session.authSubjectId, authSubject);
    assert.ok(body.session.expiresAtEpochSeconds > Date.now() / 1000);
    assert.equal(body.bindings.length, 6);
    const seen = new Set(),
      heads = new Set();
    for (const a of body.bindings) {
      assert.equal(a.source, 'SERVER_VERIFIED_READ_BINDING');
      assert.equal(a.capability, 'READ_AUTHORIZED_PROJECTION_AND_FINAL');
      assert.equal(a.seatState, 'ACTIVE');
      assert.equal(a.identity.authSubjectId, authSubject);
      assert.equal(a.identity.worldId, pins.worldId);
      assert.equal(a.identity.countryId, countryId);
      assert.equal(a.identity.classification, 'OFFICE_PRIVATE');
      assert.equal(a.identity.modelVersion, readConfiguration.modelVersion);
      assert.equal(
        a.identity.projectionVersion,
        'postwar-office-runtime-read-v1',
      );
      assert.ok(Object.values(roles).includes(a.identity.officeId));
      assert.equal(seen.has(a.identity.officeId), false);
      seen.add(a.identity.officeId);
      assert.deepEqual(a.seed, {
        worldId: pins.worldId,
        seedRef: pins.seedRef,
        contentHash: pins.contentHash,
        admissionRef: pins.admissionRef,
      });
      for (const [key, value] of Object.entries(a.seed))
        assert.equal(a.readback[key], value);
      assert.ok(
        uint(a.readback.worldVersion) && uint(a.readback.eventSequence),
      );
      assert.ok(
        BigInt(a.readback.worldVersion) >= BigInt(pins.minimumWorldVersion),
      );
      heads.add(a.readback.worldVersion + '/' + a.readback.eventSequence);
    }
    assert.equal(heads.size, 1);
    evidence.metadata.push({
      status: response.status,
      bytes: Buffer.byteLength(text),
      elapsedMs: performance.now() - begin,
      worldVersion: body.bindings[0].readback.worldVersion,
      eventSequence: body.bindings[0].readback.eventSequence,
      offices: [...seen],
    });
    // TCP uses the Authorization header; the shipped browser auth provider
    // supplies the raw JWT and adds its own Bearer scheme exactly once.
    return { body, accessToken: accessToken.slice(7) };
  }
  return Object.freeze({
    evidence,
    currentSeat: async () => (await currentSeat()).body,
    async openOffice(role) {
      requireLive();
      assert.ok(Object.hasOwn(roles, role));
      // Re-read actor/seat metadata for every view. No initial header is a grant
      // for a later country, authorization revision or global head.
      const { body, accessToken } = await currentSeat(),
        authority = body.bindings.find(
          (a) => a.identity.officeId === roles[role],
        );
      assert.ok(authority);
      const binding = {
          read: {
            identity: authority.identity,
            seatRef: authority.seatRef,
            world: pins,
            endpoints,
            session: { sessionRef: 'TEST_ONLY_BROWSER_' + randomUUID() },
          },
          view: { role, countryDisplayId },
          endpoint: {
            origin: endpoints.origin,
            path: '/v1/office-command',
            deploymentRef: endpoints.deploymentRef,
          },
        },
        probe = await createFixedOfficeBrowserProbe({
          browser,
          application,
          apiBaseURL: backend,
          applicationOrigin,
          binding,
          accessToken,
        });
      active.add(probe);
      const record = async (operation, work) => {
        requireLive();
        const state = await work();
        // Complete browser state can contain private intent; the shared summary
        // deliberately records only operation/status and fixed request paths.
        evidence.operations.push({
          role,
          operation,
          status: state.status,
          requests: probe.requests.map((r) => ({ ...r })),
          failures: [...probe.failures],
        });
        assert.deepEqual(probe.failures, []);
        return state;
      };
      let retiring;
      const close = () =>
        (retiring ??= (async () => {
          try {
            await probe.close();
          } finally {
            active.delete(probe);
          }
        })());
      try {
        await probe.open();
      } catch (error) {
        await close();
        throw error;
      }
      return Object.freeze({
        page: probe.page,
        authority,
        read: () => record('READ', () => probe.read()),
        submitOnce(originalRequest) {
          assert.equal(originalRequest.request.worldId, pins.worldId);
          assert.equal(originalRequest.request.countryId, countryId);
          assert.equal(originalRequest.request.officeId, roles[role]);
          return record('ONE_EXPLICIT_SUBMIT', () =>
            probe.submitOnce(originalRequest),
          );
        },
        recover: () => record('RECOVER', () => probe.recover()),
        state: () => probe.state(),
        invalidate: () => record('INVALIDATE', () => probe.invalidate()),
        close,
      });
    },
    async close() {
      if (closed) return;
      closed = true;
      const settled = await Promise.allSettled(
        [...active].map((p) => p.close()),
      );
      active.clear();
      const errors = settled
        .filter((r) => r.status === 'rejected')
        .map((r) => r.reason);
      if (errors.length)
        throw new AggregateError(
          errors,
          'REGISTERED_BROWSER_CONTEXT_CLEANUP_FAILED',
        );
    },
  });
}
