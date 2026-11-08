/** Synthetic observation assertion/preflight only. No browser, backend,
 * publication, employment service creation, PLAN or FINAL runs in this file. */
import { describe, expect, it } from 'vitest';
import {
  assertSocialServiceBrowserObservation as check,
  buildSocialServiceBrowserAdapter,
  createRegisteredSocialServiceContextBrowserProbe as createProbe,
} from '../../tools/office-connection/registered-social-service-browser-probe.mjs';
import type { RegisteredSocialServiceBrowserInput } from '../../tools/office-connection/registered-social-service-browser-probe.mjs';
const version = 'sha256:' + 'a'.repeat(64);
function fixture() {
  const expected = {
    status: 'PAGE' as const,
    countryId: 'COUNTRY_02',
    authSubject: 'TEST_ONLY_SUBJECT',
    pins: {
      worldId: 'TEST_ONLY_WORLD',
      seedRef: 'SEED_TEST_ONLY',
      contentHash: version,
      admissionRef: 'ADMISSION_TEST_ONLY',
    },
    head: { worldVersion: '7', eventSequence: '12' },
  };
  const row = {
    poolId: 'TEST_ONLY_POOL',
    countryId: expected.countryId,
    locationId: 'TEST_ONLY_LOCATION',
    skill: 'LOW',
    dayIndex: '0',
    ruleVersion: 'SOCIAL_JOB_MATCH_RULE_V1',
    capacitySlots: '9007199254740993',
    usedSlots: '1',
    reservedSlots: '2',
  };
  const wire = {
    ok: true,
    status: 'AVAILABLE',
    dataset: 'service-pools',
    authority: {
      identity: {
        officeId: 'SOCIAL',
        countryId: expected.countryId,
        authSubjectId: expected.authSubject,
      },
      readback: expected.head,
    },
    source: {
      ...expected.pins,
      officeId: 'SOCIAL',
      countryId: expected.countryId,
      dataNature: 'ADMITTED_CURRENT_SOCIAL_MIXED_FINANCIAL_PREFIX',
      sourceVersion: version,
      bindingVersion: version,
      observedHead: expected.head,
      originWorldVersion: '0',
      originEventSequence: '0',
      currentPrefixCoverage: {
        globalWorldVersion: '7',
        globalEventSequence: '12',
      },
    },
    page: { offset: 0, limit: 25, returned: 1, total: 1, nextOffset: null },
    rows: [row],
  };
  const observation = {
    httpStatus: 200,
    wire,
    rowsClearedDuringRead: true,
    dom: {
      state: { status: 'CURRENT', code: null as string | null },
      text: `原9个目录输入尚未接通 Source version ${version} World version 7 / event 12 State origin 0 / 0 Unit person 授权页范围 [0, 1) / 1`,
      rows: [
        {
          poolId: row.poolId,
          cells: [
            row.poolId,
            row.locationId,
            row.skill,
            row.dayIndex,
            row.capacitySlots,
            row.usedSlots,
            row.reservedSlots,
            row.ruleVersion,
          ],
        },
      ],
    },
  };
  return { expected, observation };
}
describe('Social read-only component probe contract (NOT actual browser/backend acceptance)', () => {
  it('builds the shipped read component adapter without starting a browser or backend', async () => {
    const adapter = await buildSocialServiceBrowserAdapter();
    expect(adapter.sha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(adapter.code).toContain('EconMindSocialServiceReadProbe');
    expect(adapter.code).toContain('socialServicePool');
    expect(adapter.code).toContain('现有就业服务');
  });
  it('requires an existing caller-owned browser/application before any adapter or backend access', async () => {
    await expect(
      createProbe({} as RegisteredSocialServiceBrowserInput),
    ).rejects.toThrow('EXISTING_BROWSER_AND_APPLICATION_REQUIRED');
  });
  it('requires an actual credential provider without generating a token', async () => {
    await expect(
      createProbe({
        browser: {},
        application: {},
      } as RegisteredSocialServiceBrowserInput),
    ).rejects.toThrow('ACTUAL_TOKEN_PROVIDER_REQUIRED');
  });
  it('compares exact pool/day/rule/counters and separates old state origin from current head', () => {
    const { expected, observation } = fixture();
    const result = check(observation, expected);
    expect(result.head).toEqual({ worldVersion: '7', eventSequence: '12' });
    expect(result.origin).toEqual({ worldVersion: '0', eventSequence: '0' });
    expect(result.rows).toEqual(observation.wire.rows);
  });
  it('rejects old values retained during refresh even if the final page is valid', () => {
    const { expected, observation } = fixture();
    observation.rowsClearedDuringRead = false;
    expect(() => check(observation, expected)).toThrow(
      'OLD_ROWS_MUST_CLEAR_BEFORE_REFRESH',
    );
  });
  it('rejects a displayed old counter after the backend has changed', () => {
    const { expected, observation } = fixture();
    observation.wire.rows[0]!.reservedSlots = '3';
    expect(() => check(observation, expected)).toThrow();
  });
  it('rejects another country or stale current head', () => {
    const { expected, observation } = fixture();
    observation.wire.source.countryId = 'COUNTRY_01';
    expect(() => check(observation, expected)).toThrow();
    observation.wire.source.countryId = expected.countryId;
    observation.wire.source.observedHead = {
      worldVersion: '6',
      eventSequence: '10',
    };
    expect(() => check(observation, expected)).toThrow();
  });
  it('does not round unsafe integer capacity and rejects used plus reserved exceeding it', () => {
    const { expected, observation } = fixture();
    observation.wire.rows[0]!.usedSlots = '9007199254740993';
    expect(() => check(observation, expected)).toThrow();
  });
  it('requires an explicit authorized EMPTY response, not an unavailable page rendered as zero', () => {
    const { expected, observation } = fixture();
    observation.wire.status = 'EMPTY';
    observation.wire.rows = [];
    observation.wire.page.returned = 0;
    observation.wire.page.total = 0;
    observation.dom.rows = [];
    observation.dom.text += ' 此授权页没有既有就业服务池';
    observation.dom.text = observation.dom.text.replace(
      '[0, 1) / 1',
      '[0, 0) / 0',
    );
    expect(check(observation, { ...expected, status: 'EMPTY' }).status).toBe(
      'EMPTY',
    );
    observation.httpStatus = 503;
    expect(() =>
      check(observation, { ...expected, status: 'EMPTY' }),
    ).toThrow();
  });
  it.each(['DENIED', 'UNAVAILABLE'] as const)(
    'requires actual %s HTTP classification and clears source and rows',
    (status) => {
      const { expected, observation } = fixture();
      const o = {
        ...observation,
        httpStatus: status === 'DENIED' ? 403 : 503,
        dom: {
          state: {
            status,
            code:
              status === 'DENIED'
                ? 'AUTHORIZATION_DENIED'
                : 'SOURCE_UNAVAILABLE',
          },
          text: '原9个目录输入尚未接通 读取未完成；没有用零值替代。',
          rows: [],
        },
      };
      expect(check(o, { ...expected, status }).status).toBe(status);
      expect(() =>
        check({ ...o, httpStatus: 200 }, { ...expected, status }),
      ).toThrow();
      expect(() =>
        check(
          { ...o, dom: { ...o.dom, rows: observation.dom.rows } },
          { ...expected, status },
        ),
      ).toThrow();
      expect(() =>
        check(
          {
            ...o,
            dom: { ...o.dom, text: o.dom.text + ' Source version ' + version },
          },
          { ...expected, status },
        ),
      ).toThrow();
    },
  );
});
