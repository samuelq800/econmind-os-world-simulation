/** One fixed historical audit continuation. No default network, synthetic HTTP
 * responses, alternate full-tree verifier, retry, deployment or economic write. */
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile, appendFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { isDeepStrictEqual } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  prepareOfficialSourceConnection,
  createOfficialConnectionRequester,
  reconstructOfficialDataset,
  verifyOfficialCountryConnection,
  verifyOfficialRegionAssociations,
  OFFICIAL_CONNECTION_BASE,
  OFFICIAL_CONNECTION_ORIGIN,
} from './official-source-connection-audit.mjs';
import { OFFICIAL_DATASETS } from '../supabase/functions/world-v2-official-read/lib/official-dataset-registry.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const RESUME_PIN = Object.freeze({
  inputs: '9a307091c07f4a84ca6655a1b356cd61ca27b27d594d375844f5b51ebc36b47a',
  ledger: '745e6485ebfde6cd83ca2d20abeffde54d9aed0dfc3ba1d817d1d6699d1e0ed9',
  report: '681c866179e6727822d60fa5a0ba50fb8dbf521ef41743933f37488de86aad77',
  checker: '16425fc88ddf85ff784e3e64a574a45f3cf1da8e18fe05da2bc3dfca0610ca15',
  manifest: '88dd44478f97d2e8893a4f11b3aaf96e256bdb13248aca0d08f097fabe10d315',
  sourceWorldSha: '0ec30a28d19f4ae51d81edad42d0598c356dc127',
  functionTree: '28d7ba3e102a7b4efb5cbb74088ed2a0f85f5d5b',
  failedSuffix:
    '/v1/world-data/datasets/geography?section=physical&offset=50&limit=50',
});
const historicalSlugs = OFFICIAL_DATASETS.slice(0, 12).map((spec) => spec.slug);
const resumedSpecs = OFFICIAL_DATASETS.slice(12);
const verifiedHistories = new WeakSet();
const checkedProbeReceipts = new WeakSet();
const bounds = Object.freeze({
  requestLimit: 1000,
  deadlineMillis: 600_000,
  requestTimeoutMillis: 30_000,
});
const requireThat = (value, code) => {
  if (!value) throw new Error(`OFFICIAL_RESUME_${code}`);
};
const exact = (actual, expected, code) =>
  requireThat(isDeepStrictEqual(actual, expected), code);
const safeCode = (error) =>
  /^(?:OFFICIAL_CONNECTION|OFFICIAL_RESUME)_[A-Za-z0-9_:.-]+$/u.test(
    error?.message ?? '',
  )
    ? error.message
    : 'OFFICIAL_RESUME_CHECK_FAILED';

/** Fixture documents may exercise orchestration but never become production
 * history: only hash-verified original bytes enter verifiedHistories. */
export function resumeHistoryDocuments(inputs, ledger) {
  exact(inputs.endpoint, OFFICIAL_CONNECTION_BASE, 'HISTORY_ENDPOINT');
  exact(ledger.endpoint, OFFICIAL_CONNECTION_BASE, 'HISTORY_ENDPOINT');
  exact(ledger.origin, OFFICIAL_CONNECTION_ORIGIN, 'HISTORY_ORIGIN');
  exact(inputs.checkerSha256, RESUME_PIN.checker, 'HISTORY_CHECKER');
  exact(inputs.manifestSha256, RESUME_PIN.manifest, 'HISTORY_MANIFEST');
  exact(inputs.datasetInputs, OFFICIAL_DATASETS, 'HISTORY_REGISTRY');
  exact(ledger.status, 'ALL_DATA_READBACK_FAIL', 'HISTORY_STATUS');
  exact(ledger.complete, false, 'HISTORY_COMPLETE');
  exact(
    ledger.failedRoute,
    OFFICIAL_CONNECTION_BASE + RESUME_PIN.failedSuffix,
    'HISTORY_FAILED_ROUTE',
  );
  const verified = ledger.groups
    .filter((group) => group.state === 'VERIFIED')
    .map((group) => group.id);
  exact(
    verified,
    ['catalog', ...historicalSlugs.map((slug) => `dataset:${slug}`)],
    'HISTORY_VERIFIED_GROUPS',
  );
  exact(
    ledger.groups.find((group) => group.id === 'dataset:geography')?.state,
    'FAILED',
    'HISTORY_GEOGRAPHY',
  );
  for (const spec of resumedSpecs.slice(1))
    exact(
      ledger.groups.find((group) => group.id === `dataset:${spec.slug}`)?.state,
      'NOT_RUN',
      'HISTORY_NOT_RUN',
    );
  return { inputs, ledger };
}

export async function readPinnedResumeHistory(directory) {
  const names = [
    ['inputs.json', 'inputs'],
    ['readback.json', 'ledger'],
    ['REPORT.md', 'report'],
  ];
  const raw = {};
  for (const [name, key] of names) {
    raw[key] = await readFile(path.join(directory, name));
    exact(hash(raw[key]), RESUME_PIN[key], `ORIGINAL_HASH:${key}`);
  }
  const history = resumeHistoryDocuments(
    JSON.parse(raw.inputs),
    JSON.parse(raw.ledger),
  );
  verifiedHistories.add(history);
  return history;
}

export function buildResumePlan(prepared, history) {
  exact(
    prepared.plan.selectionChecksumSha256,
    RESUME_PIN.manifest,
    'LOCAL_MANIFEST',
  );
  const groups = [
    ...resumedSpecs.map((spec) => `dataset:${spec.slug}`),
    'country-list',
    ...prepared.countries.map((country) => `country:${country.id}`),
    ...['regions', 'changes', 'seasonal-water'].flatMap((slug) =>
      prepared.countries.map((country) => `association:${slug}:${country.id}`),
    ),
  ];
  for (const id of groups.filter((id) => !id.startsWith('dataset:')))
    exact(
      history.ledger.groups.find((group) => group.id === id)?.state,
      'NOT_RUN',
      'HISTORY_COUNTRY_NOT_RUN',
    );
  exact(new Set(groups).size, groups.length, 'DUPLICATE_GROUP');
  return {
    status: 'INCOMPLETE',
    phase: 'PLAN',
    remoteGetPerformed: false,
    endpoint: OFFICIAL_CONNECTION_BASE,
    origin: OFFICIAL_CONNECTION_ORIGIN,
    pins: RESUME_PIN,
    bounds,
    historicalGroups: history.ledger.groups
      .filter((group) => group.state === 'VERIFIED')
      .map((group) => ({
        ...group,
        evidenceVersion: 'HISTORICAL_ONLY',
        evidenceLedgerSha256: RESUME_PIN.ledger,
        sourceSha256:
          OFFICIAL_DATASETS.find((spec) => group.id === `dataset:${spec.slug}`)
            ?.sha256 ?? null,
        newRequests: 0,
      })),
    resumedDatasetSlugs: resumedSpecs.map((spec) => spec.slug),
    groups: groups.map((id) => ({ id, state: 'NOT_RUN', requestIndices: [] })),
    comparisonBasisForHistoricalChanges:
      'LOCAL_HASH_VERIFIED_TREE_BACKED_BY_ORIGINAL_VERIFIED_GROUP_NOT_A_NEW_HTTP_RESPONSE',
    liveWorldState: false,
    proposalFieldsAreExecuted: false,
    openingSeedCommitted: false,
    workerStarted: false,
    sameVersionFullPass: false,
    originalAuditStatus: history.ledger.status,
    proofBoundary:
      'Original catalog/12 trees are historical. New22 trees + country list/70 detail/210 associations are separate-version DTO evidence, not remote raw-byte hashing, extra53 files, maps, browser or economic activation.',
  };
}

function binding(history, options) {
  const fixture = options.executionMode === 'FIXTURE';
  requireThat(
    fixture || options.executionMode === 'AUTHORIZED_RELEASE_READ',
    'MODE',
  );
  if (!fixture) {
    requireThat(verifiedHistories.has(history), 'PINNED_HISTORY_REQUIRED');
    for (const field of ['releaseGoReference', 'rootAuthorizationReference'])
      requireThat(
        /^[A-Za-z0-9][A-Za-z0-9_./:#-]{0,255}$/u.test(options[field] ?? ''),
        'AUTHORITY_REQUIRED',
      );
  }
  const before =
    history.inputs.historicalReleaseReceipts?.['handoff.json']
      ?.unchangedReceipt;
  return {
    executionMode: options.executionMode,
    remoteGetPerformed: false,
    sourceWorldSha: RESUME_PIN.sourceWorldSha,
    functionTree: RESUME_PIN.functionTree,
    checkerSha256: RESUME_PIN.checker,
    before: {
      rootReference: history.inputs.authorization?.rootAuthorizationReference,
      sourceWorldSha: before?.source?.world_sha,
      functionTree: before?.source?.function_tree,
      releaseRun: before?.run_id,
      originalLedgerSha256: RESUME_PIN.ledger,
      originalReportSha256: RESUME_PIN.report,
      originalInputsSha256: RESUME_PIN.inputs,
    },
    after: {
      releaseGoReference: options.releaseGoReference ?? 'FIXTURE_ONLY',
      rootReference: options.rootAuthorizationReference ?? 'FIXTURE_ONLY',
    },
    fixtureEvidenceOnly: fixture,
  };
}

export function verifyResumeProbePage(prepared, body) {
  const spec = resumedSpecs[0];
  for (const [key, value] of Object.entries({
    ok: true,
    schemaVersion: 'official-source-dataset-v1',
    dataset: spec.slug,
    dataNature: 'OFFICIAL_SELECTED_SOURCE_DATASET',
    packageId: prepared.plan.packageId,
    selectionChecksumSha256: RESUME_PIN.manifest,
    sourceSha256: spec.sha256,
    sourceBytes: spec.bytes,
    sourcePath: spec.sourcePath,
    sourceKind: spec.kind,
    unitTreatment: 'SOURCE_UNITS_PRESERVED_NO_CONVERSION',
    numericEncoding: 'DECIMAL_STRING_EXACT',
    unitsSourcePath: 'DATA_DICTIONARY.md',
    liveWorldState: false,
    proposalFieldsAreExecuted: false,
    section: 'physical',
    offset: 50,
    filters: { countryId: null, entityId: null, referenceId: null },
  }))
    exact(body[key], value, `PROBE_METADATA:${key}`);
  const rows = prepared.expected.get('geography').physical;
  exact(body.total, rows.length, 'PROBE_TOTAL');
  requireThat(
    Array.isArray(body.items) &&
      body.items.length > 0 &&
      body.items.length <= 50,
    'PROBE_ITEMS',
  );
  exact(
    body.items,
    rows.slice(50, 50 + body.items.length),
    'PROBE_EXACT_ITEMS',
  );
  exact(body.returned, body.items.length, 'PROBE_RETURNED');
  const next = 50 + body.items.length;
  requireThat(next <= rows.length, 'PROBE_OVERFLOW');
  exact(body.nextOffset, next < rows.length ? next : null, 'PROBE_CURSOR');
}

/** Probe checks only this one received page; it is not geography group closure.
 * Transport validation is the unchanged requester. Full reconstruction later
 * uses the unchanged verifier, not probe bodies or fabricated skipped responses. */
export async function probeOfficialResume(
  prepared,
  history,
  fetcher,
  options = {},
) {
  const context = binding(history, options);
  const evidence = {
    status: 'INCOMPLETE',
    phase: 'PROBE',
    ...context,
    failedSuffix: RESUME_PIN.failedSuffix,
    requests: 0,
    groupVerified: false,
    liveWorldState: false,
  };
  const requester = createOfficialConnectionRequester(
    async (url, init) => {
      evidence.remoteGetPerformed = !context.fixtureEvidenceOnly;
      const response = await fetcher(url, init);
      evidence.httpStatus = response.status;
      evidence.origin = OFFICIAL_CONNECTION_ORIGIN;
      evidence.headers = Object.fromEntries(
        [
          'access-control-allow-origin',
          'vary',
          'cache-control',
          'content-type',
        ].map((key) => [key, response.headers.get(key)]),
      );
      let bytes = 0;
      const digest = createHash('sha256');
      const stream = response.body?.pipeThrough(
        new TransformStream({
          transform(chunk, controller) {
            bytes += chunk.byteLength;
            digest.update(chunk);
            controller.enqueue(chunk);
          },
          flush() {
            evidence.responseBytes = bytes;
            evidence.responseBodySha256 = digest.digest('hex');
          },
        }),
      );
      return new Response(stream ?? null, {
        status: response.status,
        headers: response.headers,
      });
    },
    { ...bounds, requestLimit: 1 },
  );
  try {
    const body = await requester.get(RESUME_PIN.failedSuffix);
    verifyResumeProbePage(prepared, body);
    evidence.status = 'PROBE_PAGE_ACCEPTED';
    evidence.probePassed = true;
  } catch (error) {
    evidence.probePassed = false;
    evidence.error = safeCode(error);
  }
  evidence.requests = requester.count;
  return evidence;
}

export async function readProbeReceipt(file, expectedHash, options) {
  requireThat(
    /^[a-f0-9]{64}$/u.test(expectedHash ?? ''),
    'PROBE_HASH_REQUIRED',
  );
  const bytes = await readFile(file);
  exact(hash(bytes), expectedHash, 'PROBE_RECEIPT_HASH');
  const report = JSON.parse(bytes);
  for (const [key, value] of Object.entries({
    phase: 'PROBE',
    status: 'PROBE_PAGE_ACCEPTED',
    probePassed: true,
    groupVerified: false,
    requests: 1,
    executionMode: 'AUTHORIZED_RELEASE_READ',
    remoteGetPerformed: true,
    sourceWorldSha: RESUME_PIN.sourceWorldSha,
    functionTree: RESUME_PIN.functionTree,
    checkerSha256: RESUME_PIN.checker,
    failedSuffix: RESUME_PIN.failedSuffix,
  }))
    exact(report[key], value, `PROBE_RECEIPT:${key}`);
  requireThat(
    report.fixtureEvidenceOnly !== true,
    'FIXTURE_PROBE_NOT_PRODUCTION',
  );
  requireThat(
    Number.isSafeInteger(report.responseBytes) &&
      report.responseBytes > 0 &&
      report.responseBytes <= 256000 &&
      /^[a-f0-9]{64}$/u.test(report.responseBodySha256 ?? ''),
    'PROBE_BODY_EVIDENCE',
  );
  requireThat(
    ['https://world.econmind.group', OFFICIAL_CONNECTION_ORIGIN].includes(
      report.origin,
    ) && report.headers?.['access-control-allow-origin'] === report.origin,
    'PROBE_ACTUAL_ORIGIN',
  );
  exact(
    report.before?.originalLedgerSha256,
    RESUME_PIN.ledger,
    'PROBE_HISTORY_BINDING',
  );
  exact(
    report.after?.releaseGoReference,
    options.releaseGoReference,
    'PROBE_RELEASE_BINDING',
  );
  requireThat(
    report.after?.rootReference !== options.rootAuthorizationReference,
    'SEPARATE_RESUME_AUTHORITY_REQUIRED',
  );
  const receipt = { report, sha256: expectedHash };
  checkedProbeReceipts.add(receipt);
  return receipt;
}

export async function resumeOfficialSourceAudit(
  prepared,
  history,
  fetcher,
  options = {},
) {
  const context = binding(history, options);
  if (!context.fixtureEvidenceOnly)
    requireThat(
      checkedProbeReceipts.has(options.probeReceipt),
      'VERIFIED_PROBE_REQUIRED',
    );
  const report = {
    ...buildResumePlan(prepared, history),
    ...context,
    phase: 'RESUME',
    requests: [],
    probeReceipt: options.probeReceipt ?? { fixtureOnly: true },
    startedAt: new Date().toISOString(),
    timeZone: 'Asia/Shanghai',
  };
  let active;
  const complete = (group) => {
    if (group) group.state = 'VERIFIED';
  };
  const requester = createOfficialConnectionRequester(async (url, init) => {
    const parsed = new URL(url);
    const suffix = parsed.pathname.slice(
      new URL(OFFICIAL_CONNECTION_BASE).pathname.length,
    );
    const slug = suffix.split('/').at(-1);
    const id =
      suffix === '/v1/world-data/countries'
        ? 'country-list'
        : suffix.startsWith('/v1/world-data/countries/')
          ? `country:${slug}`
          : parsed.searchParams.has('countryId')
            ? `association:${slug}:${parsed.searchParams.get('countryId')}`
            : `dataset:${slug}`;
    const group = report.groups.find((item) => item.id === id);
    requireThat(group !== undefined, 'UNPLANNED_GROUP');
    if (active && active !== group) complete(active);
    active = group;
    group.state = 'READING';
    const entry = {
      index: report.requests.length,
      groupId: id,
      url,
      startedAt: new Date().toISOString(),
      state: 'INPUT',
    };
    group.requestIndices.push(entry.index);
    report.requests.push(entry);
    await options.checkpoint?.(report);
    report.remoteGetPerformed = !context.fixtureEvidenceOnly;
    const response = await fetcher(url, init);
    entry.httpStatus = response.status;
    entry.headers = Object.fromEntries(
      [
        'access-control-allow-origin',
        'vary',
        'cache-control',
        'content-type',
      ].map((key) => [key, response.headers.get(key)]),
    );
    let bytes = 0;
    const digest = createHash('sha256');
    entry.bodyEvidence = 'NOT_FULLY_CONSUMED_BY_VERIFIER';
    const body = response.body?.pipeThrough(
      new TransformStream({
        transform(chunk, controller) {
          bytes += chunk.byteLength;
          digest.update(chunk);
          controller.enqueue(chunk);
        },
        flush() {
          entry.responseBytes = bytes;
          entry.responseBodySha256 = digest.digest('hex');
          entry.bodyEvidence = 'RECEIVED_BODY_BYTES';
        },
      }),
    );
    entry.state = 'READ';
    return new Response(body ?? null, {
      status: response.status,
      headers: response.headers,
    });
  }, bounds);
  try {
    const reconstructed = new Map();
    for (const spec of resumedSpecs) {
      const actual = await reconstructOfficialDataset(requester, spec);
      exact(
        actual,
        prepared.expected.get(spec.slug),
        `EXACT_TREE:${spec.slug}`,
      );
      reconstructed.set(spec.slug, actual);
      complete(active);
      await options.checkpoint?.(report);
    }
    // Comparison basis only. No HTTP response is invented for old changes.
    reconstructed.set('changes', prepared.expected.get('changes'));
    const population = await verifyOfficialCountryConnection(
      prepared,
      requester,
    );
    complete(active);
    const associations = await verifyOfficialRegionAssociations(
      reconstructed,
      prepared.countries,
      requester,
    );
    complete(active);
    requireThat(
      report.groups.every((group) => group.state === 'VERIFIED'),
      'GROUPS_INCOMPLETE',
    );
    report.status = 'MIXED_VERSION_ALL_GROUPS_EVIDENCED';
    report.results = {
      newDatasetsVerified: reconstructed.size - 1,
      countryDetailsVerified: report.groups.filter(
        (group) =>
          group.id.startsWith('country:') && group.state === 'VERIFIED',
      ).length,
      associationChecks: associations,
      populationVerified: population.toString(),
    };
  } catch (error) {
    report.status = 'INCOMPLETE';
    report.error = safeCode(error);
    if (active) {
      active.state = 'FAILED';
      active.error = report.error;
    }
  }
  report.attemptedRequests = requester.count;
  report.finishedAt = new Date().toISOString();
  await options.checkpoint?.(report);
  return report;
}

export function parseResumeArguments(args) {
  const phase = args[0] ?? '--plan';
  requireThat(['--plan', '--probe', '--resume'].includes(phase), 'ARGUMENTS');
  const options = { phase: phase.slice(2), execute: phase !== '--plan' };
  const allowed = options.execute
    ? [
        '--original-dir',
        '--output',
        '--release-go',
        '--root-authorization',
        ...(phase === '--resume' ? ['--probe-report', '--probe-sha256'] : []),
      ]
    : ['--original-dir'];
  for (let index = 1; index < args.length; index += 2) {
    requireThat(
      allowed.includes(args[index]) &&
        typeof args[index + 1] === 'string' &&
        !args[index + 1].startsWith('--'),
      'ARGUMENTS',
    );
    requireThat(!Object.hasOwn(options, args[index]), 'DUPLICATE_ARGUMENT');
    options[args[index]] = args[index + 1];
  }
  requireThat(
    typeof options['--original-dir'] === 'string',
    'ORIGINAL_DIR_REQUIRED',
  );
  if (options.execute)
    for (const key of allowed)
      requireThat(
        typeof options[key] === 'string',
        'AUTHORITY_AND_OUTPUT_REQUIRED',
      );
  return options;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let executionEntered = false;
  try {
    const args = parseResumeArguments(process.argv.slice(2));
    const history = await readPinnedResumeHistory(args['--original-dir']);
    exact(
      hash(
        await readFile(
          path.join(root, 'scripts/official-source-connection-audit.mjs'),
        ),
      ),
      RESUME_PIN.checker,
      'CHECKER_FILE_HASH',
    );
    exact(
      execFileSync(
        'git',
        [
          'rev-parse',
          `${RESUME_PIN.sourceWorldSha}:supabase/functions/world-v2-official-read`,
        ],
        { cwd: root, encoding: 'utf8' },
      ).trim(),
      RESUME_PIN.functionTree,
      'SOURCE_FUNCTION_TREE',
    );
    exact(
      execFileSync(
        'git',
        ['rev-parse', 'HEAD:supabase/functions/world-v2-official-read'],
        { cwd: root, encoding: 'utf8' },
      ).trim(),
      RESUME_PIN.functionTree,
      'CHECKOUT_FUNCTION_TREE',
    );
    requireThat(
      execFileSync(
        'git',
        [
          'status',
          '--porcelain',
          '--',
          'supabase/functions/world-v2-official-read',
        ],
        { cwd: root, encoding: 'utf8' },
      ).trim() === '',
      'DIRTY_FUNCTION_TREE',
    );
    const prepared = await prepareOfficialSourceConnection(root);
    let report = buildResumePlan(prepared, history);
    if (args.execute) {
      const options = {
        executionMode: 'AUTHORIZED_RELEASE_READ',
        releaseGoReference: args['--release-go'],
        rootAuthorizationReference: args['--root-authorization'],
      };
      binding(history, options); // Reject missing authority before even creating output.
      if (args.phase === 'resume')
        options.probeReceipt = await readProbeReceipt(
          args['--probe-report'],
          args['--probe-sha256'],
          options,
        );
      const output = path.resolve(args['--output']);
      requireThat(
        output !== root &&
          output !== path.parse(output).root &&
          output !== path.resolve(args['--original-dir']),
        'OUTPUT_SCOPE',
      );
      await mkdir(output); // Exclusive new directory; cannot rewrite old evidence.
      options.checkpoint = (value) => {
        const requests = value.requests.slice(-2);
        const ids = new Set(requests.map((entry) => entry.groupId));
        return appendFile(
          path.join(output, 'progress.jsonl'),
          JSON.stringify({
            at: new Date().toISOString(),
            status: value.status,
            remoteGetPerformed: value.remoteGetPerformed,
            error: value.error,
            requests,
            groups: value.groups.filter((group) => ids.has(group.id)),
          }) + '\n',
        );
      };
      executionEntered = true;
      report =
        args.phase === 'probe'
          ? await probeOfficialResume(
              prepared,
              history,
              globalThis.fetch,
              options,
            )
          : await resumeOfficialSourceAudit(
              prepared,
              history,
              globalThis.fetch,
              options,
            );
      report.adapterSha256 = hash(
        await readFile(fileURLToPath(import.meta.url)),
      );
      report.checkoutSha = execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: root,
        encoding: 'utf8',
      }).trim();
      await writeFile(
        path.join(output, 'report.json'),
        JSON.stringify(report, null, 2) + '\n',
        { flag: 'wx' },
      );
      report.outputDirectory = output;
      if (report.status === 'INCOMPLETE') process.exitCode = 1;
    }
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  } catch (error) {
    process.stdout.write(
      JSON.stringify({
        status: 'INCOMPLETE',
        remoteGetPerformed: executionEntered
          ? 'UNKNOWN_CHECK_PROGRESS_LEDGER'
          : false,
        error: safeCode(error),
      }) + '\n',
    );
    process.exitCode = 1;
  }
}
