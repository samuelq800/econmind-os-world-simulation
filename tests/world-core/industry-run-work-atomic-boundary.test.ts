/** Atomic ordering unit contract only: real Core RUN/WORK frame data and genuine
 * Core authorization proof, with an explicit SQL protocol double. This is not a
 * native DB/source admission, registered issuer or successful operating run. */
import { describe, expect, it } from 'vitest';
import * as C from '@econmind/core';
import {
  AtomicTransitionRepository,
  prepareAtomicTransitionCandidate,
} from '../../apps/world-worker/src/persistence/atomic-transition-repository.js';
import type {
  SqlDatabase,
  SqlExecutor,
} from '../../apps/world-worker/src/persistence/sql-database.js';
import {
  createIndustryFirstDayWorkCoreFixture,
  industryWorkTestSha as sha,
} from '../support/industry-first-day-work-core-fixture.js';
import { canonicalSerialize as sourceSerialize } from '../../packages/core/src/index.js';

async function candidate(kind: 'RUN' | 'WORK') {
  const f = createIndustryFirstDayWorkCoreFixture();
  const raw = JSON.parse(
    sourceSerialize(kind === 'RUN' ? f.schedule : f.frame),
  );
  // Crossing Core module instances as canonical DATA, never casting brands.
  const {
    canonicalPayload,
    fingerprint: _fp,
    payloadHash: _ph,
    ...intent
  } = raw.command;
  void _fp;
  void _ph;
  const command = C.parseCanonicalCommand(
    { ...intent, payload: JSON.parse(canonicalPayload) },
    sha,
  );
  const events = raw.events.map((value: Record<string, unknown>) => {
    const {
      canonicalPayload: payload,
      fingerprint,
      payloadHash,
      ...event
    } = value;
    void fingerprint;
    void payloadHash;
    return C.parseAuthoritativeEvent(
      { ...event, payload: JSON.parse(String(payload)) },
      sha,
    );
  });
  const transition = C.createAuthoritativeTransition({
    command,
    events,
    worldVersionBefore: raw.transition.worldVersionBefore,
    worldVersionAfter: raw.transition.worldVersionAfter,
  });
  const at = command.submittedAtReal;
  let proof: C.CommitAuthorizationProof | null = null;
  if (kind === 'RUN') {
    const subject = C.authSubject(command.authSubject),
      world = C.worldId(command.worldId),
      country = C.countryId(command.countryId),
      office = C.officeId('INDUSTRY');
    const principal: C.AuthenticatedPrincipal = {
      authSubject: subject,
      facts: {
        user_id: subject,
        display_name: 'TEST_ONLY_ATOMIC_BOUNDARY',
        school_id: null,
      },
      token: {
        subject,
        issuer: 'https://test.invalid',
        audience: 'TEST_ONLY',
        issuedAt: at,
        expiresAt: '2099-01-01T00:00:00.000Z',
      },
    };
    const resolver: C.AuthorizationResolver = {
      async resolveCurrentIdentity() {
        return subject;
      },
      async resolveCurrentMembership() {
        return {
          active: true,
          authorizationVersion: 'REV_TEST_ONLY',
          authSubject: subject,
          countryId: country,
          isWorldAdmin: false,
          negotiationPartyIds: [],
          officeAssignments: [office],
          suspended: false,
          teamId: C.teamId('TEAM_TEST_ONLY'),
          worldId: world,
        };
      },
    };
    const capture = Error('CAPTURE_TEST_ONLY_GENUINE_PROOF');
    try {
      await C.processQueuedCommand({
        command,
        authorityKind: 'DISCRETIONARY_USER',
        commitSimTime: command.simTime,
        recordedAtReal: at,
        requiredCapability: 'INDUSTRY_PRODUCTION',
        intakeAuthorization: await C.authorizeOfficeCapability({
          capability: 'INDUSTRY_PRODUCTION',
          principal,
          requestedCountryId: country,
          requestedOfficeId: office,
          resolver,
          worldId: world,
        }),
        persistence: {
          async readFinalReceipt() {
            return null;
          },
          async recordZeroEffectReceipt() {
            throw Error('UNEXPECTED_REVOKED');
          },
          async commitAuthorizedCommand(request) {
            proof = request.commitAuthorization;
            throw capture;
          },
        },
      });
    } catch (e) {
      if (e !== capture) throw e;
    }
    expect(C.isCommitAuthorizationProof(proof)).toBe(true);
  }
  const lease = C.acquireWorldWriterLease(
    null,
    C.worldWriterLeaseRequest(
      C.worldId(command.worldId),
      C.workerId('WORKER_TEST_ONLY_ATOMIC_BOUNDARY'),
      at,
      '2026-11-01T01:00:00.000Z',
    ),
  ).lease;
  const receipt = C.createFinalCommandReceipt({
    command,
    transition,
    outcome: 'COMMITTED',
    reasonCode: null,
    simTime: command.simTime,
    recordedAtReal: at,
  });
  return prepareAtomicTransitionCandidate({
    command,
    commitAuthorization: proof,
    draft: {
      transition,
      receipt,
      authorityKind:
        kind === 'RUN' ? 'DISCRETIONARY_USER' : 'VERSIONED_AUTOMATIC',
      commitAssertion: C.createWorldWriterCommitAssertion(
        lease,
        transition.worldVersionBefore,
      ),
      observedAtReal: at,
      inventoryPostings: [],
      financialPostingBatches: [],
      outboxMessages: [],
      currentMaterializations: [],
      officeOperatingSourceReadBinding: { TEST_ONLY: 'NOT_A_LIVE_SOURCE_PORT' },
    },
    sha256Hex: sha,
  });
}
function database(
  value: Awaited<ReturnType<typeof candidate>>,
  existing: boolean,
) {
  const c = value.command,
    r = value.receipt,
    queries: string[] = [];
  const submission = {
    world_id: c.worldId,
    command_id: c.commandId,
    idempotency_key: c.idempotencyKey,
    command_type: c.commandType,
    schema_version: c.schemaVersion,
    canonical_payload: c.canonicalPayload,
    payload_sha256: c.payloadHash,
    command_fingerprint: c.fingerprint,
    auth_subject: c.authSubject,
    actor_id: c.actorId,
    country_id: c.countryId,
    office_id: c.officeId,
    expected_world_version: c.expectedWorldVersion,
    sim_time: c.simTime.toCanonicalValue(),
    correlation_id: c.correlationId,
    submitted_at_real: c.submittedAtReal,
  };
  const receipt = {
    world_id: r.worldId,
    command_id: r.commandId,
    idempotency_key: r.idempotencyKey,
    schema_version: r.schemaVersion,
    command_fingerprint: r.commandFingerprint,
    outcome: r.outcome,
    reason_code: r.reasonCode,
    transition_id: r.transitionId,
    world_version_before: r.worldVersionBefore,
    world_version_after: r.worldVersionAfter,
    sim_time: r.simTime.toCanonicalValue(),
    event_ids: r.eventIds,
    recorded_at_real: r.recordedAtReal,
  };
  const tx: SqlExecutor = {
    async query<Row extends object>(sql: string) {
      queries.push(sql);
      let rows: object[];
      if (sql.includes('from world_v2.command_submission')) rows = [submission];
      else if (sql.includes('from world_v2.command_receipt'))
        rows = existing ? [receipt] : [];
      else if (sql.includes('assert_world_writer_commit_guard'))
        rows = [
          {
            world_version: value.transition.worldVersionBefore,
            event_sequence: (
              BigInt(value.transition.events[0]!.sequence) - 1n
            ).toString(),
          },
        ];
      else throw Error('UNEXPECTED_SQL_NO_WRITES_ALLOWED:' + sql);
      return { rows: rows as Row[], rowCount: rows.length };
    },
  };
  const db: SqlDatabase = {
    query: tx.query,
    async transaction(consume) {
      return consume(tx);
    },
  };
  const repository = new AtomicTransitionRepository({
    database: db,
    workerId: value.commitAssertion.holderId,
    sha256Hex: sha,
    authorizationGuard: {
      async assertCurrent(_tx, input) {
        if (existing) throw Error('FRESH_AUTH_GUARD_MUST_NOT_RUN_FOR_FINAL');
        expect(input.proof).toBe(value.commitAuthorization);
        expect(input.authorityKind).toBe(value.authorityKind);
      },
    },
  });
  return { repository, queries };
}
describe('Industry schedule/work require genuine fixed Atomic ports', () => {
  for (const kind of ['RUN', 'WORK'] as const) {
    it(
      kind +
        ' rejects a fresh commit without its live fixed source port before any effect SQL',
      async () => {
        const value = await candidate(kind),
          f = database(value, false);
        await expect(f.repository.commit(value)).rejects.toThrow(
          'Fresh Industry ' + kind + ' requires its live fixed guard',
        );
        expect(
          f.queries.some((q) => /^\s*(insert|update|delete)/iu.test(q)),
        ).toBe(false);
        expect(
          f.queries.some((q) => q.includes('assert_world_writer_commit_guard')),
        ).toBe(true);
      },
    );
    it(
      kind +
        ' returns exact existing FINAL before missing fresh-source guards and writes no rows',
      async () => {
        const value = await candidate(kind),
          f = database(value, true);
        const result = await f.repository.commit(value);
        expect(result.source).toBe('EXISTING_COMMIT');
        expect(result.receipt).toEqual(value.receipt);
        expect(f.queries).toHaveLength(2);
        expect(
          f.queries.some(
            (q) =>
              q.includes('assert_world_writer_commit_guard') ||
              /^\s*(insert|update|delete)/iu.test(q),
          ),
        ).toBe(false);
      },
    );
  }
});
