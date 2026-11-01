/** Pure cumulative-state calculations only. They issue no page proof, DB
 * source/admission or publisher authority. Product validates private Core
 * cumulative evidence before passing these independently replayed plan facts. */
import { describe, it, expect } from 'vitest';
import * as C from '../../packages/core/src/index.js';
import {
  mixedSocialOriginal,
  mixedSocialFrame,
  mixedSha as sha,
  mixedWorld,
} from '../support/finance-social-fx-replay-fixture.js';
import { assertPostwarCurrentPagedSocialMatchPlan as check } from '../../apps/world-worker/src/persistence/postwar-social-paged-match-plan.js';
function fixture() {
  const original = mixedSocialOriginal(),
    plan = mixedSocialFrame(original, '0', '1');
  const countries = (state = plan.state) => [
    {
      countryId: original.countryId,
      lifecycle: C.createSocialPositionOfferLifecycleState(
        state,
        original.offers,
      ),
      offerOrigins: [],
    },
  ];
  return {
    original,
    plan,
    countries,
    input: {
      worldId: mixedWorld,
      countryId: original.countryId,
      head: { worldVersion: '301', eventSequence: '303' },
      latestCommandSimTime: 0n,
      socialCountries: countries(),
      planCommandId: plan.command.commandId,
      requirePending: true,
    },
  };
}
describe('paged MATCH uses cumulative canonical plan metadata', () => {
  it('finds an earlier immutable PLAN without any last-page PLAN frame', () => {
    const f = fixture();
    const p = check(f.input);
    expect(p.command.fingerprint).toBe(f.plan.command.fingerprint);
    expect(p.state).toBe('PENDING');
    expect(p.command.expectedWorldVersion).toBe('0');
  });
  it('validates a genuine settled MATCH operation for idempotent publication, never calls it pending', () => {
    const f = fixture(),
      match = mixedSocialFrame(f.original, '300', '303', f.plan);
    const current = { ...f.input, socialCountries: f.countries(match.state) };
    expect(() => check(current)).toThrow('ALREADY_SETTLED');
    const p = check({ ...current, requirePending: false });
    expect(p.settlement?.commandId).toBe(match.command.commandId);
    expect(p.settlement?.commandFingerprint).toBe(match.command.fingerprint);
  });
  it('rejects a later same-scope PLAN retained in cumulative state', () => {
    const f = fixture(),
      c = f.plan.command;
    const next = C.parseCanonicalCommand(
      {
        schemaVersion: c.schemaVersion,
        worldId: c.worldId,
        countryId: c.countryId,
        officeId: c.officeId,
        commandType: c.commandType,
        commandId: 'COMMAND_TEST_ONLY_LATER_PAGED_PLAN',
        idempotencyKey: 'KEY_TEST_ONLY_LATER_PAGED_PLAN',
        actorId: c.actorId,
        authSubject: c.authSubject,
        expectedWorldVersion: '299',
        simTime: '0',
        submittedAtReal: c.submittedAtReal,
        correlationId: c.correlationId,
        payload: JSON.parse(c.canonicalPayload) as unknown,
      },
      sha,
    );
    const result = C.prepareSocialEmploymentServiceOperation({
      command: next,
      state: f.plan.state,
      readFacts: f.original.facts,
      sha256Hex: sha,
    });
    expect(() =>
      check({ ...f.input, socialCountries: f.countries(result.state) }),
    ).toThrow('SUPERSEDED');
  });
  it('refuses wrong world, absent PLAN, changed canonical bytes and later actual time', () => {
    const f = fixture();
    expect(() => check({ ...f.input, worldId: 'WORLD_WRONG' })).toThrow(
      'EXACT_DAY_ZERO',
    );
    expect(() =>
      check({ ...f.input, planCommandId: 'COMMAND_MISSING' }),
    ).toThrow('EXACT_CUMULATIVE');
    expect(() => check({ ...f.input, latestCommandSimTime: 1n })).toThrow(
      'TIME_PRECEDES',
    );
    const countries = f.countries();
    const changed = {
      ...countries[0]!.lifecycle.employment,
      plans: countries[0]!.lifecycle.employment.plans.map((p) => ({
        ...p,
        planFingerprint: ('sha256:' + 'f'.repeat(64)) as C.CanonicalSha256,
      })),
    };
    expect(() =>
      check({
        ...f.input,
        socialCountries: [
          {
            ...countries[0]!,
            lifecycle: { ...countries[0]!.lifecycle, employment: changed },
          },
        ],
      }),
    ).toThrow('EXACT_DAY_ZERO');
  });
});
