import { readFileSync } from 'node:fs';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  buildResumePlan,
  parseResumeArguments,
  probeOfficialResume,
  readPinnedResumeHistory,
  readProbeReceipt,
  RESUME_PIN,
  resumeHistoryDocuments,
  resumeOfficialSourceAudit,
} from '../../scripts/official-source-resume-audit.mjs';
import {
  prepareOfficialSourceConnection,
  OFFICIAL_CONNECTION_BASE,
  OFFICIAL_CONNECTION_ORIGIN,
} from '../../scripts/official-source-connection-audit.mjs';
import { OFFICIAL_DATASETS } from '../../supabase/functions/world-v2-official-read/lib/official-dataset-registry.js';
import {
  createOfficialSourceSnapshotReader,
  OFFICIAL_SOURCE_PUBLIC_BASE,
} from '../../supabase/functions/world-v2-official-read/lib/official-source-snapshot-reader.js';
import { createOfficialEdgeFetchHandler } from '../../supabase/functions/world-v2-official-read/lib/official-edge-fetch-adapter.js';
import { createHash } from 'node:crypto';

let prepared;
let history;
const fixtureMode = { executionMode: 'FIXTURE' };
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
// Deliberately synthetic orchestration documents, NOT a replacement for the
// pinned original bytes and never accepted by production execution guards.
function fixtureHistory() {
  const groups = [
    { id: 'catalog', state: 'VERIFIED' },
    ...OFFICIAL_DATASETS.map((spec, index) => ({
      id: `dataset:${spec.slug}`,
      state: index < 12 ? 'VERIFIED' : index === 12 ? 'FAILED' : 'NOT_RUN',
    })),
    { id: 'country-list', state: 'NOT_RUN' },
    ...prepared.countries.map((country) => ({
      id: `country:${country.id}`,
      state: 'NOT_RUN',
    })),
    ...['regions', 'changes', 'seasonal-water'].flatMap((slug) =>
      prepared.countries.map((country) => ({
        id: `association:${slug}:${country.id}`,
        state: 'NOT_RUN',
      })),
    ),
  ];
  return resumeHistoryDocuments(
    {
      endpoint: OFFICIAL_CONNECTION_BASE,
      checkerSha256: RESUME_PIN.checker,
      manifestSha256: RESUME_PIN.manifest,
      datasetInputs: OFFICIAL_DATASETS,
    },
    {
      endpoint: OFFICIAL_CONNECTION_BASE,
      origin: OFFICIAL_CONNECTION_ORIGIN,
      status: 'ALL_DATA_READBACK_FAIL',
      complete: false,
      failedRoute: OFFICIAL_CONNECTION_BASE + RESUME_PIN.failedSuffix,
      groups,
    },
  );
}
function transport(mutate) {
  const handler = createOfficialEdgeFetchHandler({
    reader: createOfficialSourceSnapshotReader(async (url) => {
      const spec = OFFICIAL_DATASETS.find(
        (item) => url === `${OFFICIAL_SOURCE_PUBLIC_BASE}/${item.sha256}.json`,
      );
      if (!spec) throw new Error('UNEXPECTED_FIXTURE_SOURCE');
      return new Response(
        readFileSync(
          new URL(
            `../../artifacts/world-balanced-candidate-v1/${spec.sourcePath}`,
            import.meta.url,
          ),
        ),
        { headers: { 'content-type': 'application/json' } },
      );
    }),
    allowedOrigins: [OFFICIAL_CONNECTION_ORIGIN],
  });
  return vi.fn(async (url, init) => {
    expect(url.startsWith(OFFICIAL_CONNECTION_BASE + '/v1/world-data/')).toBe(
      true,
    );
    expect(init).toMatchObject({
      method: 'GET',
      credentials: 'omit',
      redirect: 'error',
      cache: 'no-store',
      headers: { Origin: OFFICIAL_CONNECTION_ORIGIN },
    });
    const response = await handler(new Request(url, init));
    if (!mutate) return response;
    const body = await response.json();
    mutate(body, new URL(url));
    return new Response(JSON.stringify(body), {
      status: response.status,
      headers: response.headers,
    });
  });
}

describe('one fixed cross-version continuation (offline only)', () => {
  beforeAll(async () => {
    prepared = await prepareOfficialSourceConnection();
    history = fixtureHistory();
  });

  it('selects exactly original unfinished groups and keeps historical evidence separate', () => {
    const plan = buildResumePlan(prepared, history);
    expect(plan.resumedDatasetSlugs).toEqual(
      OFFICIAL_DATASETS.slice(12).map((spec) => spec.slug),
    );
    expect(plan.resumedDatasetSlugs).toHaveLength(22);
    expect(plan.groups).toHaveLength(303);
    expect(plan.historicalGroups).toHaveLength(13);
    expect(
      plan.historicalGroups.every(
        (group) =>
          group.evidenceVersion === 'HISTORICAL_ONLY' &&
          group.newRequests === 0,
      ),
    ).toBe(true);
    expect(plan.originalAuditStatus).toBe('ALL_DATA_READBACK_FAIL');
    expect(plan.sameVersionFullPass).toBe(false);
    const changed = structuredClone(history);
    changed.ledger.groups[1].state = 'NOT_RUN';
    expect(() =>
      resumeHistoryDocuments(changed.inputs, changed.ledger),
    ).toThrow('HISTORY_VERIFIED_GROUPS');
  });

  it('rejects unknown hosts/selectors, duplicate flags and incomplete execution authority', () => {
    expect(
      parseResumeArguments(['--plan', '--original-dir', '/local/original']),
    ).toMatchObject({ execute: false, phase: 'plan' });
    for (const args of [
      [],
      ['--probe'],
      ['--plan', '--original-dir', '/x', '--host', 'https://other.invalid'],
      ['--plan', '--original-dir', '/x', '--dataset', 'countries'],
      ['--plan', '--original-dir', '/x', '--original-dir', '/y'],
      [
        '--resume',
        '--original-dir',
        '/x',
        '--output',
        '/y',
        '--release-go',
        'go',
        '--root-authorization',
        'root',
      ],
    ])
      expect(() => parseResumeArguments(args)).toThrow('OFFICIAL_RESUME_');
  });

  it('fails closed on modified original evidence before a transport can be used', async () => {
    const folder = await mkdtemp(
      path.join(tmpdir(), 'resume-invalid-original-'),
    );
    await writeFile(path.join(folder, 'inputs.json'), '{}');
    await expect(readPinnedResumeHistory(folder)).rejects.toThrow(
      'ORIGINAL_HASH:inputs',
    );
    const fetch = vi.fn();
    await expect(
      resumeOfficialSourceAudit(prepared, history, fetch, {
        executionMode: 'AUTHORIZED_RELEASE_READ',
        releaseGoReference: 'go',
        rootAuthorizationReference: 'root',
      }),
    ).rejects.toThrow('PINNED_HISTORY_REQUIRED');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('performs exactly one fixture probe, preserves byte hash, and does not close geography', async () => {
    const fetch = transport();
    const report = await probeOfficialResume(
      prepared,
      history,
      fetch,
      fixtureMode,
    );
    expect(report).toMatchObject({
      status: 'PROBE_PAGE_ACCEPTED',
      requests: 1,
      probePassed: true,
      groupVerified: false,
      remoteGetPerformed: false,
      fixtureEvidenceOnly: true,
      responseBytes: 5172,
      responseBodySha256:
        '5faefc2b03e066af1fc13b5be72b1d051666f53ae83f557adc024c5b58f34f2c',
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe(
      OFFICIAL_CONNECTION_BASE + RESUME_PIN.failedSuffix,
    );
  });

  it('rejects HTTP/CORS/precision/nature/cursor probe failures without retry', async () => {
    const fetchers = [
      vi.fn(async () => new Response('{}', { status: 546 })),
      vi.fn(
        async () =>
          new Response('{}', {
            headers: { 'access-control-allow-origin': '*' },
          }),
      ),
      transport((body) => {
        body.items[0] = { ...body.items[0], changed: '0.1' };
      }),
      transport((body) => {
        body.numericEncoding = 'NUMBER_FLOAT';
      }),
      transport((body) => {
        body.dataNature = 'LIVE_WORLD';
      }),
      transport((body) => {
        body.nextOffset = 50;
      }),
    ];
    for (const fetch of fetchers) {
      const report = await probeOfficialResume(
        prepared,
        history,
        fetch,
        fixtureMode,
      );
      expect(report).toMatchObject({
        status: 'INCOMPLETE',
        probePassed: false,
        requests: 1,
        groupVerified: false,
      });
      expect(fetch).toHaveBeenCalledTimes(1);
    }
  });

  it('uses original verifiers for whole geography + later21 +70 detail +210 associations, no old dataset/catalog GET', async () => {
    const fetch = transport();
    const checkpoint = vi.fn();
    const result = await resumeOfficialSourceAudit(prepared, history, fetch, {
      ...fixtureMode,
      checkpoint,
    });
    expect(result.status).toBe('MIXED_VERSION_ALL_GROUPS_EVIDENCED');
    expect(result).toMatchObject({
      remoteGetPerformed: false,
      fixtureEvidenceOnly: true,
      sameVersionFullPass: false,
      originalAuditStatus: 'ALL_DATA_READBACK_FAIL',
      results: {
        newDatasetsVerified: 22,
        countryDetailsVerified: 70,
        associationChecks: 210,
        populationVerified: '14712146434',
      },
    });
    expect(result.groups.every((group) => group.state === 'VERIFIED')).toBe(
      true,
    );
    expect(result.requests.length).toBe(result.attemptedRequests);
    expect(fetch.mock.calls.length).toBe(result.attemptedRequests);
    for (const entry of result.requests) {
      const url = new URL(entry.url);
      expect(url.pathname).not.toBe(
        '/functions/v1/world-v2-official-read/v1/world-data/datasets',
      );
      if (!url.searchParams.has('countryId'))
        expect(entry.groupId).not.toBe('dataset:changes');
      expect(entry.responseBodySha256).toMatch(/^[a-f0-9]{64}$/u);
    }
    expect(result.requests[0].groupId).toBe('dataset:geography');
    expect(
      result.groups.filter((group) => group.id.startsWith('association:')),
    ).toHaveLength(210);
    expect(checkpoint).toHaveBeenCalled();
  });

  it('stops on a normal cursor failure, keeps old FAIL history and later groups NOT_RUN', async () => {
    const fetch = transport((body, url) => {
      if (url.searchParams.get('section') === 'partition.territories')
        body.nextOffset = 0;
    });
    const result = await resumeOfficialSourceAudit(
      prepared,
      history,
      fetch,
      fixtureMode,
    );
    expect(result.status).toBe('INCOMPLETE');
    expect(result.error).toBe('OFFICIAL_CONNECTION_PAGE_CURSOR');
    expect(result.groups[0].state).toBe('FAILED');
    expect(
      result.groups.slice(1).every((group) => group.state === 'NOT_RUN'),
    ).toBe(true);
    expect(
      result.historicalGroups.every((group) => group.state === 'VERIFIED'),
    ).toBe(true);
    expect(history.ledger.status).toBe('ALL_DATA_READBACK_FAIL');
    expect(fetch.mock.calls.length).toBe(result.attemptedRequests);
  });

  it('requires probe digest/current release identity and a separate resume authorization', async () => {
    const folder = await mkdtemp(path.join(tmpdir(), 'resume-probe-receipt-'));
    const filename = path.join(folder, 'receipt.json');
    const base = {
      phase: 'PROBE',
      status: 'PROBE_PAGE_ACCEPTED',
      probePassed: true,
      groupVerified: false,
      requests: 1,
      executionMode: 'AUTHORIZED_RELEASE_READ',
      remoteGetPerformed: true,
      responseBytes: 5172,
      responseBodySha256:
        '5faefc2b03e066af1fc13b5be72b1d051666f53ae83f557adc024c5b58f34f2c',
      origin: OFFICIAL_CONNECTION_ORIGIN,
      headers: { 'access-control-allow-origin': OFFICIAL_CONNECTION_ORIGIN },
      sourceWorldSha: RESUME_PIN.sourceWorldSha,
      functionTree: RESUME_PIN.functionTree,
      checkerSha256: RESUME_PIN.checker,
      failedSuffix: RESUME_PIN.failedSuffix,
      before: { originalLedgerSha256: RESUME_PIN.ledger },
      after: { releaseGoReference: 'release', rootReference: 'probe-root' },
    };
    for (const [change, options, error] of [
      [
        { functionTree: 'old' },
        {
          releaseGoReference: 'release',
          rootAuthorizationReference: 'resume-root',
        },
        'PROBE_RECEIPT:functionTree',
      ],
      [
        {},
        {
          releaseGoReference: 'other',
          rootAuthorizationReference: 'resume-root',
        },
        'PROBE_RELEASE_BINDING',
      ],
      [
        {},
        {
          releaseGoReference: 'release',
          rootAuthorizationReference: 'probe-root',
        },
        'SEPARATE_RESUME_AUTHORITY_REQUIRED',
      ],
    ]) {
      const bytes = JSON.stringify({ ...base, ...change });
      await writeFile(filename, bytes);
      await expect(
        readProbeReceipt(filename, sha(bytes), options),
      ).rejects.toThrow(error);
    }
    await expect(
      readProbeReceipt(filename, '0'.repeat(64), {}),
    ).rejects.toThrow('PROBE_RECEIPT_HASH');
  });
});
