/** Opt-in total driver. Actual isolated 74-source child, one registered Node
 * consumer, real JWT/TCP + immutable SQL inspection + shipped Chromium UI.
 * No test DTO can issue a source/permission/proof/clock or economic receipt. */
import { randomUUID, createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, mkdtemp, stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import * as C from '@econmind/core';
import { createPostwarBeneficialRentChildNativeFixture } from '../support/postwar-beneficial-rent-child-native-fixture.js';
import { createRegisteredFinalNodeSetup } from '../support/registered-final-node-setup.js';
import { prepareRegisteredFinalNativeSqlPlan } from '../../tools/office-connection/registered-final-native-sql.mjs';
import {
  createRegisteredFinalDriver,
  deriveRegisteredFinalIndustryRunPlan,
  registeredFinalPublishedCommand,
  registeredFinalAssert as must,
  registeredFinalRecord as object,
} from '../support/postwar-registered-final-driver.js';
import { SELECT_POSTWAR_COUNTRY_VACANCY_SOURCE } from '../support/postwar-social-country-source-selection.js';
import { executeRegisteredFinalIndustryRunWorkWageSteps } from '../support/registered-final-industry-steps.js';
import {
  createRegisteredOfficeBrowserStages,
  type RegisteredOfficeBrowserStages,
} from '../../tools/office-connection/registered-office-browser-stages.mjs';
import { serializePostwarSocialPrefixEvidence } from '../support/postwar-social-prefix-evidence-json.js';
const gate = process.env.ECONMIND_REGISTERED_FINAL_NODE_NATIVE;
if (gate !== undefined && gate !== '1')
  throw Error('REGISTERED_FINAL_NATIVE_FLAG_MUST_BE_EXPLICIT_1');
const native = gate === '1' ? describe : describe.skip;
const root = path.resolve(import.meta.dirname, '../..');
const exec = promisify(execFile);
const sha = (s: string | Buffer) =>
  createHash('sha256').update(s).digest('hex');
const text = (v: unknown): string => {
  must(typeof v === 'string' && v !== '', 'ACTUAL_SOURCE_STRING_REQUIRED');
  return v;
};
const nonce = () => randomUUID().replaceAll('-', '').toUpperCase();

/** These tests cover DRIVER planning/transport validation only. They do not
 * constitute a registered source, a database/native pass, or economic output. */
describe('registered final driver finite DATA protocol', () => {
  const planning = () => ({
    classification:
      'ACTUAL_CURRENT_INDUSTRY_PLANNING_DATA_NOT_EXECUTION_AUTHORITY',
    currentSimTime: '0',
    site: {
      countryId: 'COUNTRY_02',
      facilityId: 'OPEN-02-REFINED_FUEL',
      capacityPerSimDay: '86400',
      labourPersonDaysPerOutput: '0.008',
      outputUnit: 'barrel_equivalent',
      positions: [{ positionId: 'TEST_ONLY_POSITION', count: '2' }],
    },
    source: { sourceRef: 'TEST_ONLY_SOURCE', sourceRawSha256: 'a'.repeat(64) },
    currentEmployment: [
      { positionId: 'TEST_ONLY_POSITION', employedCount: '2' },
    ],
    positionFunding: [
      {
        positionId: 'TEST_ONLY_POSITION',
        accountRef: 'TEST_ONLY_OP_ACCOUNT',
        currency: 'XAA',
        amount: '100',
      },
    ],
    fundingAccount: {
      accountRef: 'TEST_ONLY_OP_ACCOUNT',
      currency: 'XAA',
      reservedAmount: '100',
    },
    financialPositions: [
      { netDebitBalance: { amount: '1000', currency: 'XAA' } },
    ],
  });
  it('derives exact finite request bounds from actual-field DATA without changing people or source values', () => {
    const input = planning(),
      before = JSON.stringify(input),
      result = deriveRegisteredFinalIndustryRunPlan(input);
    expect(result.endsAtSimTime).toBe('115200');
    expect(result.maximumExpense).toEqual({ amount: '100', currency: 'XAA' });
    expect(result.derivation.requiredPersonMilliseconds).toBe('230400');
    expect(JSON.stringify(input)).toBe(before);
  });
  it('rejects missing current workers and a request cap exceeding real unreserved funds', () => {
    const noWorkers = planning();
    noWorkers.currentEmployment[0]!.employedCount = '0';
    expect(() => deriveRegisteredFinalIndustryRunPlan(noWorkers)).toThrow(
      'POSITIVE_ACTUAL_CAPACITY_AND_LABOUR_REQUIRED',
    );
    const noFreeCash = planning();
    noFreeCash.financialPositions[0]!.netDebitBalance.amount = '100';
    expect(() => deriveRegisteredFinalIndustryRunPlan(noFreeCash)).toThrow(
      'ACTUAL_UNRESERVED_OPERATOR_FUNDS',
    );
  });
  it('rejects a repeated payroll funding row and a non-opening planning observation', () => {
    const duplicate = planning();
    duplicate.positionFunding.push({ ...duplicate.positionFunding[0]! });
    expect(() => deriveRegisteredFinalIndustryRunPlan(duplicate)).toThrow(
      'ACTUAL_UNIQUE_POSITION_PAYROLL_RESERVATION_REQUIRED',
    );
    const later = planning();
    later.currentSimTime = '1';
    expect(() => deriveRegisteredFinalIndustryRunPlan(later)).toThrow(
      'ACTUAL_C2_T0_PLANNING_DATA_REQUIRED',
    );
  });
  it('keeps fixed publication envelopes distinct and rejects a Ready or FINAL substitute', () => {
    const command = {
      schemaVersion: 'command-v1',
      commandId: 'TEST_ONLY_DUE',
      fingerprint: 'sha256:' + 'a'.repeat(64),
    };
    expect(
      registeredFinalPublishedCommand({ status: 'QUEUED', command }),
    ).toEqual({
      commandId: command.commandId,
      commandFingerprint: command.fingerprint,
    });
    expect(registeredFinalPublishedCommand(command, 'CANONICAL')).toEqual({
      commandId: command.commandId,
      commandFingerprint: command.fingerprint,
    });
    expect(() =>
      registeredFinalPublishedCommand({ ready: true, ...command }),
    ).toThrow();
    expect(() =>
      registeredFinalPublishedCommand({ status: 'FINAL', command }),
    ).toThrow();
  });
});

native('actual registered child finite cross-office acceptance', () => {
  it('publishes real H0 pages, consumes a single global queue, cold-restarts once and recovers durable originals in HTTP and Chromium', async () => {
    const expectedCommit = process.env.ECONMIND_REGISTERED_FINAL_CANDIDATE_SHA;
    must(
      expectedCommit && /^[a-f0-9]{40}$/u.test(expectedCommit),
      'EXACT_FROZEN_FINAL_CANDIDATE_SHA_REQUIRED',
    );
    // Bind the clean source candidate first. Critical loaded dist bytes and
    // their freshness are checked separately below, before initialization.
    const sqlPlan = await prepareRegisteredFinalNativeSqlPlan({
      repositoryRoot: root,
      expectedCommit,
    });
    const evidenceDirectory =
      process.env.ECONMIND_REGISTERED_FINAL_EVIDENCE_DIR ??
      (await mkdtemp('/workspace/.cloud-setup/evidence/rf-'));
    await mkdir(evidenceDirectory, { recursive: true });
    const report: Record<string, unknown> = {
      classification:
        'TEST_ONLY_ACTUAL_REGISTERED_CHILD_NOT_PRODUCTION_APPROVAL',
      status: 'RUNNING',
      candidate: expectedCommit,
      sqlPlanSha256: sqlPlan.planSha256,
      production: 'PRODUCTION_NOT_YET_IMPLEMENTED_IN_CANDIDATE',
      scope: 'C1_FINANCE_FX_CAPTAIN_SOCIAL_AND_C2_INDUSTRY_RUN_WORK_WAGE',
      populationScope:
        'SEVENTY_COUNTRY_CHILD_INITIALIZATION_NOT_SEVENTY_COUNTRY_COMMAND_ACCEPTANCE',
      sourceReconstructionCount: 0,
      nodeColdStarts: [],
      cleanup: [],
    };
    let fixture:
        | Awaited<
            ReturnType<typeof createPostwarBeneficialRentChildNativeFixture>
          >
        | undefined,
      setup:
        Awaited<ReturnType<typeof createRegisteredFinalNodeSetup>> | undefined,
      driver: ReturnType<typeof createRegisteredFinalDriver> | undefined,
      browser: RegisteredOfficeBrowserStages | undefined,
      failure: unknown;
    const cleanupErrors: unknown[] = [];
    try {
      const manifest: Record<string, string> = {};
      const files = (
        await exec(
          'git',
          [
            'ls-files',
            '--',
            'apps',
            'packages',
            'database',
            'config',
            'tools',
            'tests',
          ],
          { cwd: root, maxBuffer: 8 * 1024 * 1024 },
        )
      ).stdout
        .trim()
        .split('\n');
      for (const file of files)
        if (!file.endsWith('/'))
          manifest[file] = sha(await readFile(path.join(root, file)));
      await writeFile(
        path.join(evidenceDirectory, 'source-hashes.json'),
        JSON.stringify(
          {
            candidate: expectedCommit,
            classification: 'SOURCE_BYTES_NOT_TEST_PASS',
            files: manifest,
          },
          null,
          2,
        ) + '\n',
        { flag: 'wx' },
      );
      report.sourceManifestSha256 = sha(
        await readFile(path.join(evidenceDirectory, 'source-hashes.json')),
      );
      const compiled: Record<string, unknown>[] = [];
      for (const unit of [
        'packages/core/index',
        'apps/world-worker/runtime-preparation/finance-social-runtime-connection',
        'apps/world-worker/runtime-preparation/social-runtime-connection',
        'apps/world-worker/persistence/postwar-industry-run-runtime',
        'apps/world-worker/persistence/postwar-industry-work-runtime',
        'apps/world-worker/persistence/postwar-industry-operating-wage-runtime',
        'apps/world-worker/persistence/postwar-industry-dynamic-production',
        'apps/world-api/runtime/registered-postwar-office-node-bootstrap',
        'apps/world-api/runtime/registered-node-beneficial-rent-loader',
        'apps/world-api/runtime/postwar-office-node-bootstrap',
        'apps/world-api/integration/postwar-office-runtime-read-service',
      ]) {
        const packageRoot = unit.startsWith('packages/core/')
            ? 'packages/core'
            : unit.startsWith('apps/world-worker/')
              ? 'apps/world-worker'
              : 'apps/world-api',
          module = unit.slice(packageRoot.length + 1),
          sourcePath = packageRoot + '/src/' + module + '.ts',
          distPath = packageRoot + '/dist/' + module + '.js';
        const [sourceBytes, distBytes, sourceStat, distStat] =
          await Promise.all([
            readFile(path.join(root, sourcePath)),
            readFile(path.join(root, distPath)),
            stat(path.join(root, sourcePath)),
            stat(path.join(root, distPath)),
          ]);
        must(
          distStat.mtimeMs >= sourceStat.mtimeMs,
          'CANDIDATE_EMIT_REQUIRED_BEFORE_NATIVE:' + sourcePath,
        );
        compiled.push({
          sourcePath,
          sourceSha256: sha(sourceBytes),
          distPath,
          distSha256: sha(distBytes),
          sourceMtimeMs: sourceStat.mtimeMs,
          distMtimeMs: distStat.mtimeMs,
        });
      }
      report.loadedCriticalCompiledModules = compiled;
      const initialization = performance.now();
      fixture = await createPostwarBeneficialRentChildNativeFixture({
        repositoryRoot: root,
        evidenceDirectory: path.join(evidenceDirectory, 'pg'),
        artifactDirectory:
          '/workspace/.cloud-setup/evidence/beneficial-rent-candidate-20261101',
      });
      report.sourceReconstructionCount = 1;
      report.initialization = {
        elapsedMs: performance.now() - initialization,
        sourceCount: fixture.seed.sources.length,
        seedFingerprint: fixture.seed.fingerprint,
        parentFingerprint:
          'sha256:cfc55796562b44bd616f33082cbbafd9dbd43d58733a24ac550339cbc8376274',
        admissionRef: fixture.marker.admissionRef,
        classification: 'ONE_NEW_ISOLATED_CHILD_NOT_PARENT_WORLD_MUTATION',
      };
      must(
        fixture.seed.sources.length === 74,
        'ACTUAL_74_SOURCE_CHILD_REQUIRED',
      );
      setup = await createRegisteredFinalNodeSetup({
        fixture,
        repositoryRoot: root,
        sqlPlan,
      });
      const f = fixture,
        s = setup;
      driver = createRegisteredFinalDriver({
        repositoryRoot: root,
        evidenceDirectory,
        worldId: f.marker.worldId,
        installer: f.clone.installer,
        allowedOrigin: 'https://pages-test.example',
        signToken: (cid) => {
          must(
            cid === 'COUNTRY_01' || cid === 'COUNTRY_02',
            'EXACT_TEST_SUBJECT_COUNTRY_REQUIRED',
          );
          return s.signToken(cid);
        },
      });
      const d = driver;
      report.driver = d.report;
      report.installation = {
        sql: s.ddlReceipts,
        h0Documents: s.h0.documentCount,
        scopeCount: s.h0.scopeCount,
        onlineAcl: s.acl,
      };
      expect(await d.readHead()).toEqual({
        worldVersion: '0',
        eventSequence: '0',
      });
      const firstReady = await d.launch(s.descriptor);
      expect(object(firstReady.sourceEvidence)).toMatchObject({
        childFingerprint: f.seed.fingerprint,
        parentFingerprint:
          'sha256:cfc55796562b44bd616f33082cbbafd9dbd43d58733a24ac550339cbc8376274',
        receiptCount: 70,
      });
      report.nodeColdStarts = [firstReady];
      expect(await d.rpc('CLOCK')).toBe('0');
      expect(await d.rpc('ACTOR', { subject: s.subjects.COUNTRY_01 })).toBe(
        s.actors.COUNTRY_01,
      );
      const acl = await d.rpc('ACL');
      must(
        Array.isArray(acl) &&
          acl.length === 2 &&
          acl.every((v: unknown) => object(v).denied === true),
        'LOW_ROLE_REGISTRY_RAW_DENIAL_REQUIRED',
      );
      const beforeH0Publication = await s.counts(),
        labourPublications: unknown[] = [];
      for (const countryId of ['COUNTRY_01', 'COUNTRY_02']) {
        const result = object(await d.rpc('PUBLISH_H0_LABOUR', { countryId }));
        expect(result.head).toMatchObject({
          worldVersion: '0',
          eventSequence: '0',
        });
        must(
          Array.isArray(result.documents) && result.documents.length > 0,
          'ACTUAL_H0_LABOUR_DOCUMENT_PUBLICATION_REQUIRED',
        );
        labourPublications.push({ countryId, ...result });
      }
      expect(await s.counts()).toEqual(beforeH0Publication);
      const h0Pages: Record<string, unknown>[] = [];
      for (const [officeId, dataset, countryId] of [
        ['FINANCE', 'currency-fx', 'COUNTRY_01'],
        ['CENTRAL_BANK', 'cb-holdings', 'COUNTRY_01'],
        ['SOCIAL', 'positions', 'COUNTRY_01'],
        ['INDUSTRY', 'industry-labour-current', 'COUNTRY_02'],
        ['TRADE', 'opening-inventory-entries', 'COUNTRY_01'],
      ] as const) {
        const result = await d.post(
            '/v1/postwar-office-runtime',
            {
              schemaVersion: 'postwar-office-runtime-read-v1',
              requestId: randomUUID(),
              operation: 'READ_CURRENT_OFFICE_OPENING',
              officeId,
              dataset,
              page: { offset: 0, limit: 25 },
            },
            countryId,
          ),
          body = result.body,
          authority = object(body.authority),
          identity = object(authority.identity),
          source = object(body.source),
          readback = object(authority.readback);
        must(
          result.status === 200 &&
            body.ok === true &&
            body.status === 'AVAILABLE' &&
            Array.isArray(body.rows) &&
            body.rows.length > 0,
          'ACTUAL_SUPPORTED_NONEMPTY_H0_PAGE_REQUIRED:' +
            officeId +
            ':' +
            JSON.stringify(result),
        );
        must(
          identity.countryId === countryId &&
            identity.officeId === officeId &&
            identity.authSubjectId === s.subjects[countryId] &&
            source.contentHash === f.seed.fingerprint &&
            source.admissionRef === f.marker.admissionRef &&
            readback.worldVersion === '0' &&
            readback.eventSequence === '0',
          'EXACT_H0_AUTHORIZED_COUNTRY_SOURCE_AND_HEAD_REQUIRED',
        );
        h0Pages.push({
          officeId,
          dataset,
          countryId,
          httpStatus: result.status,
          body,
        });
      }
      const captainH0 = await d.post(
        '/v1/postwar-office-runtime',
        {
          schemaVersion: 'postwar-office-runtime-read-v1',
          requestId: randomUUID(),
          operation: 'READ_CURRENT_OFFICE_OPENING',
          officeId: 'CAPTAIN',
          dataset: 'political-capital-current',
          page: { offset: 0, limit: 25 },
        },
        'COUNTRY_01',
      );
      must(
        captainH0.status === 503 &&
          captainH0.body.ok === false &&
          object(captainH0.body.error).code === 'CURRENT_CAPTAIN_UNAVAILABLE' &&
          !Object.hasOwn(captainH0.body, 'rows'),
        'EXPLICIT_CAPTAIN_H0_CURRENT_GATE_MUST_STAY_UNAVAILABLE',
      );
      expect(await s.counts()).toEqual(beforeH0Publication);
      report.h0Acceptance = {
        classification:
          'FIVE_SUPPORTED_OPENING_CURRENT_HTTP_PAGES_NOT_SIX_OFFICE_CURRENT_BROWSER',
        positiveReadOfficeCount: 5,
        totalOfficeDenominator: 6,
        labourPublications,
        pages: h0Pages,
        captain: {
          status: 'EXPECTED_UNAVAILABLE',
          readConnected: false,
          empty: false,
          productLimitation: 'CAPTAIN_PURE_H0_CURRENT_GATE',
          actualResponse: captainH0,
        },
      };
      browser = await createRegisteredOfficeBrowserStages({
        actualOrigin: d.origin(),
        applicationOrigin: 'https://pages-test.example',
        readConfiguration: s.descriptor.configuration,
        authSubject: s.subjects.COUNTRY_01,
        countryId: 'COUNTRY_01',
        countryDisplayId: 'visual-territory-01',
        getAccessToken: () => 'Bearer ' + s.signToken('COUNTRY_01'),
        evidenceDir: path.join(evidenceDirectory, 'browser'),
      });
      await d.start();
      const id = nonce();
      const budget = async (
        operation: 'SET_ENVELOPE' | 'APPROVE_NEW_LINE',
        name: string,
      ) => {
        const p = s.policies.COUNTRY_01,
          revision = 'FINAL_ENVELOPE_REV_' + id;
        return d.makeRequest({
          countryId: 'COUNTRY_01',
          officeId: 'FINANCE',
          commandType: 'CORE_FINANCE_BUDGET_APPROPRIATION_V1',
          commandId: 'FINAL_BUDGET_' + name + '_' + id,
          idempotencyKey: 'FINAL_BUDGET_KEY_' + name + '_' + id,
          payload: {
            operation,
            scope: {
              worldId: f.marker.worldId,
              countryId: 'COUNTRY_01',
              entityRef: p.governmentEntityId,
              envelopeRef: p.envelopeRef,
              effectivePeriodRef: p.effectivePeriodRef,
            },
            currency: p.currency,
            amount: operation === 'SET_ENVELOPE' ? '1000' : '100',
            envelopeRevisionRef: revision,
            lineRef:
              operation === 'SET_ENVELOPE' ? null : 'FINAL_BUDGET_LINE_' + id,
            revisionRef:
              operation === 'SET_ENVELOPE'
                ? revision
                : 'FINAL_BUDGET_LINE_REV_' + id,
            predecessorRevisionRef: null,
          },
        });
      };
      const executeManual = async (
        original: Awaited<ReturnType<typeof d.makeRequest>>,
        financialBatches = 0,
        financialLegs = 0,
      ) => {
        const fingerprint = await d.submit(original);
        await d.consume(original.request.commandId, {
          countryId: original.request.countryId,
          commandType: original.request.commandType,
          financialBatches,
          financialLegs,
          inventoryPostings: 0,
          fingerprint,
        });
        await d.recover(original);
        return original;
      };
      await executeManual(await budget('SET_ENVELOPE', 'SET'));
      const h1Head = await d.readHead();
      expect(h1Head.worldVersion).toBe('1');
      const h1Browser = await browser.readAll({ expectedHead: h1Head }),
        captainBrowser = h1Browser.filter((page) => page.role === 'captain');
      must(
        captainBrowser.length === 1 &&
          captainBrowser[0]!.state.runtimePage?.status === 'PAGE',
        'ACTUAL_CAPTAIN_FIRST_CURRENT_PAGE_REQUIRED',
      );
      const captainRows = captainBrowser[0]!.state.runtimePage.rows;
      const genesisRows = await f.clone.installer.query<{
        original_text: string;
        original_sha256: string;
        admission_ref: string;
        seed_fingerprint: string;
      }>(
        "select o.original_text,o.original_sha256,a.admission_ref,a.seed_fingerprint from world_v2.captain_operating_original o join world_v2.captain_operating_source_adoption a using(adoption_ref)where a.world_id=$1 and a.country_id=$2 and o.record_kind='GENESIS'",
        [f.marker.worldId, 'COUNTRY_01'],
      );
      must(
        genesisRows.rows.length === 1 &&
          genesisRows.rows[0]!.seed_fingerprint === f.seed.fingerprint &&
          sha(genesisRows.rows[0]!.original_text) ===
            genesisRows.rows[0]!.original_sha256,
        'ACTUAL_CAPTAIN_GENESIS_ORIGINAL_HASH_REQUIRED',
      );
      const genesisOriginal = object(
          JSON.parse(genesisRows.rows[0]!.original_text),
        ),
        genesisBytes = text(genesisOriginal.canonicalPayload),
        genesis = object(JSON.parse(genesisBytes)),
        genesisOpening = object(object(genesis.capital).opening);
      must(
        sha(genesisBytes) === genesisOriginal.payloadSHA256 &&
          genesis.worldId === f.marker.worldId &&
          genesis.countryId === 'COUNTRY_01' &&
          genesis.seedFingerprint === f.seed.fingerprint &&
          genesisOpening.amount === '70' &&
          genesisOpening.unit === 'political_capital',
        'ACTUAL_ADOPTED_CAPTAIN_OPENING_SEVENTY_REQUIRED',
      );
      must(
        captainRows.length > 0 &&
          captainRows.every(
            (row) => row.opening === '70' && row.total === '70',
          ),
        'ACTUAL_CAPTAIN_GENESIS_OPENING_SEVENTY_REQUIRED_BEFORE_CAPTAIN_WRITE',
      );
      report.h1Acceptance = {
        classification:
          'SIX_OFFICE_SAME_CURRENT_HEAD_ACTUAL_BROWSER_AFTER_FIXED_PUBLICATION',
        positiveReadOfficeCount: 6,
        totalOfficeDenominator: 6,
        head: h1Head,
        pages: h1Browser,
        captainGenesisOpening: '70',
        captainGenesisOriginal: {
          originalSha256: genesisRows.rows[0]!.original_sha256,
          payloadSha256: genesisOriginal.payloadSHA256,
          admissionRef: genesisRows.rows[0]!.admission_ref,
          seedFingerprint: f.seed.fingerprint,
        },
        captainWriteOccurred: false,
      };
      const financeBrowser = await browser.open('finance');
      const fx = object(await d.rpc('FX_SELECTORS')),
        quote = object(fx.quote),
        treasury = object(s.selectors.COUNTRY_01.capacity.treasury),
        asset = object(treasury.assetAccount);
      must(
        quote.worldId === f.marker.worldId &&
          quote.seedFingerprint === f.seed.fingerprint &&
          quote.countryId === 'COUNTRY_01',
        'ACTUAL_C1_FX_QUOTE_PINS_REQUIRED',
      );
      const fxRequest = await d.makeRequest({
        countryId: 'COUNTRY_01',
        officeId: 'FINANCE',
        commandType: 'POSTWAR_DAY_ONE_TREASURY_FX_SPOT_V1',
        commandId: 'FINAL_FX_' + id,
        idempotencyKey: 'FINAL_FX_KEY_' + id,
        payload: {
          schemaVersion: 'postwar-day-one-treasury-fx-command-v1',
          quoteRef: text(quote.quoteRef),
          payerTreasuryAccountId: text(asset.accountId),
          payerGcuAccountId: text(fx.governmentGcuAccountId),
          dealerGcuAccountId: text(quote.dealerGcuAccountId),
          localAmount: '100',
          localCurrency: text(quote.localCurrency),
          expectedQuoteSha256: text(quote.quoteSha256),
        },
      });
      await executeManual(fxRequest, 2, 6);
      const reasons = await f.clone.installer.query<{
        fact_ref: string;
        original_text: string;
        original_sha256: string;
      }>(
        "select o.fact_ref,o.original_text,o.original_sha256 from world_v2.captain_operating_original o join world_v2.captain_operating_source_adoption a using(adoption_ref)where a.world_id=$1 and a.country_id=$2 and o.record_kind='REASON'order by o.fact_ref",
        [f.marker.worldId, 'COUNTRY_01'],
      );
      must(
        reasons.rows.length === 1 &&
          sha(reasons.rows[0]!.original_text) ===
            reasons.rows[0]!.original_sha256,
        'ACTUAL_ADOPTED_CAPTAIN_REASON_REQUIRED',
      );
      await executeManual(
        await d.makeRequest({
          countryId: 'COUNTRY_01',
          officeId: 'CAPTAIN',
          commandType: 'CAPTAIN_POLITICAL_CAPITAL_ALLOCATE_V1',
          commandId: 'FINAL_CAPTAIN_' + id,
          idempotencyKey: 'FINAL_CAPTAIN_KEY_' + id,
          payload: {
            schemaVersion: 'captain-political-capital-allocation-v1',
            fromBucket: 'FISCAL_REFORM',
            toBucket: 'INDUSTRIAL_STRATEGY',
            amount: { amount: '2.75', unit: 'political_capital' },
            reasonFactRef: reasons.rows[0]!.fact_ref,
          },
        }),
      );
      const locators = await f.clone.installer.query<{
        wage: Record<string, unknown>;
        funding: Record<string, unknown>;
        seed_fingerprint: string;
        admission_ref: string;
      }>(SELECT_POSTWAR_COUNTRY_VACANCY_SOURCE, [
        f.marker.worldId,
        'COUNTRY_01',
      ]);
      must(
        locators.rows.length === 1 &&
          locators.rows[0]!.seed_fingerprint === f.seed.fingerprint &&
          locators.rows[0]!.admission_ref === f.marker.admissionRef,
        'ACTUAL_CURRENT_COUNTRY_VACANCY_LOCATOR_REQUIRED',
      );
      const loc = locators.rows[0]!,
        w = loc.wage;
      const pools = await f.clone.installer.query<{ pool_id: string }>(
        "select p->>'poolId'pool_id from world_v2.postwar_social_prefix_scope s cross join lateral jsonb_array_elements(s.scope_document::jsonb->'servicePools')p where s.world_id=$1 and s.country_id=$2 and p->>'locationId'=$3 and p->>'skill'=$4",
        [f.marker.worldId, 'COUNTRY_01', w.locationId, w.skill],
      );
      must(
        pools.rows.length === 1,
        'ACTUAL_MATCHING_SOCIAL_SERVICE_POOL_REQUIRED',
      );
      const positionId = 'FINAL_POSITION_' + id;
      await executeManual(
        await d.makeRequest({
          countryId: 'COUNTRY_01',
          officeId: 'SOCIAL',
          commandType: C.SOCIAL_POSITION_OFFER_CREATE_COMMAND,
          commandId: 'FINAL_POSITION_COMMAND_' + id,
          idempotencyKey: 'FINAL_POSITION_KEY_' + id,
          payload: {
            schemaVersion: 'social-employment-position-offer-create-v1',
            positionId,
            locationId: w.locationId,
            skill: w.skill,
            publicService: w.classificationId,
            occupation: w.occupation,
            requiredCount: '1',
            wageScheduleRef: w.positionId,
            fundingAccountId: loc.funding.accountRef,
            coverageDays: '1',
          },
        }),
      );
      const plan = await executeManual(
        await d.makeRequest({
          countryId: 'COUNTRY_01',
          officeId: 'SOCIAL',
          commandType: C.SOCIAL_EMPLOYMENT_SERVICE_PLAN_COMMAND,
          commandId: 'FINAL_PLAN_' + id,
          idempotencyKey: 'FINAL_PLAN_KEY_' + id,
          payload: {
            schemaVersion: 'social-employment-service-plan-v1',
            locationId: w.locationId,
            skill: w.skill,
            positionId,
            servicePoolId: pools.rows[0]!.pool_id,
            requestedMatches: '1',
            dueDayIndex: '0',
          },
        }),
      );
      const line = await budget('APPROVE_NEW_LINE', 'LINE');
      // Shipped confirm submits exactly once at a genuinely published current
      // head. H0 opening HTTP reads are not relabelled browser write evidence.
      d.originals.push(line);
      await d.checkpoint('BEFORE_BROWSER_LINE_SUBMIT', {
        commandId: line.request.commandId,
      });
      const queued = await financeBrowser.submitOnce(line);
      must(
        queued.status === 'QUEUE_ACK',
        'SHIPPED_BROWSER_ACTUAL_QUEUE_ACK_REQUIRED',
      );
      await d.consume(line.request.commandId, {
        countryId: 'COUNTRY_01',
        commandType: line.request.commandType,
        financialBatches: 0,
        financialLegs: 0,
        inventoryPostings: 0,
      });
      await financeBrowser.recoverFinal({ expectedHead: await d.readHead() });
      must(
        BigInt((await d.readHead()).eventSequence) >
          BigInt((await d.readHead()).worldVersion),
        'BUDGET_LINE_MULTIEVENT_HEAD_MUST_BE_DISTINCT',
      );
      const match = registeredFinalPublishedCommand(
        await d.rpc('PUBLISH_MATCH', {
          countryId: 'COUNTRY_01',
          planCommandId: plan.request.commandId,
        }),
        'CANONICAL',
      );
      await d.consume(text(match.commandId), {
        countryId: 'COUNTRY_01',
        commandType: C.SOCIAL_JOB_MATCH_DUE_COMMAND,
        financialBatches: 0,
        financialLegs: 0,
        inventoryPostings: 0,
        fingerprint: text(match.commandFingerprint),
      });
      await d.checkpoint('REAL_SOCIAL_MATCH_AFTER_FINANCE_LINE');
      // This fixed IPC must project real prepared baseline/site/current funds.
      // It cannot accept caller rows, an elapsed-work assertion or a READY flag.
      const industry = deriveRegisteredFinalIndustryRunPlan(
          await d.rpc('INDUSTRY_SELECTORS', {
            countryId: 'COUNTRY_02',
            facilityId: 'OPEN-02-REFINED_FUEL',
          }),
        ),
        quantity = industry.quantity,
        expense = industry.maximumExpense;
      must(
        industry.sourceRef === s.industrySource.sourceRef &&
          industry.sourceRawSha256 === s.industrySource.sourceSha256 &&
          industry.startsAtSimTime === '0',
        'EXACT_CURRENT_C2_RUN_SOURCE_AND_EXPLICIT_PLAN_REQUIRED',
      );
      const runPlan = {
        runId: 'FINAL_RUN_' + id,
        quantity: { amount: text(quantity.amount), unit: text(quantity.unit) },
        startsAtSimTime: industry.startsAtSimTime,
        endsAtSimTime: industry.endsAtSimTime,
        maximumExpense: {
          amount: text(expense.amount),
          currency: text(expense.currency),
        },
      };
      report.industryPlanningRequest = industry;
      let secondReady: Record<string, unknown> | undefined;
      const industryResult =
        await executeRegisteredFinalIndustryRunWorkWageSteps({
          selectors: {
            worldId: f.marker.worldId,
            countryId: 'COUNTRY_02',
            facilityId: 'OPEN-02-REFINED_FUEL',
            sourceRef: s.industrySource.sourceRef,
            sourceRawSha256: s.industrySource.sourceSha256,
            policyVersion: C.INDUSTRY_FIRST_DAY_POLICY_VERSION,
          },
          commandPrefix: 'FINAL_INDUSTRY_' + id,
          plan: runPlan,
          driver: {
            get origin() {
              return d.origin();
            },
            allowedOrigin: 'https://pages-test.example',
            accessToken: async () => s.signToken('COUNTRY_02'),
            readHead: d.readHead,
            consumeOnce: () => d.rpc('CONSUME'),
            publishWork: async (scope) =>
              registeredFinalPublishedCommand(
                await d.rpc('PUBLISH_WORK', { ...scope }),
              ),
            publishWage: async (scope) =>
              registeredFinalPublishedCommand(
                await d.rpc('PUBLISH_WAGE', { ...scope }),
              ),
            inspectStored: async (commandId) => {
              const actual = await d.inspect(commandId);
              must(
                actual.officeId === 'INDUSTRY' || actual.officeId === null,
                'EXACT_INDUSTRY_MANUAL_AUTOMATIC_BOUNDARY',
              );
              return { ...actual, officeId: actual.officeId };
            },
          },
          afterRunCommitted: async (run) => {
            d.originals.push(run);
            await d.checkpoint('RUN_FINAL_BEFORE_COLD_RESTART');
            const before = await s.counts();
            await d.stop();
            const nextDescriptor = await s.rotateFiniteClock({
              simTime: runPlan.endsAtSimTime,
              previousHostStopped: true,
            });
            secondReady = await d.launch(nextDescriptor);
            expect(object(secondReady.sourceEvidence)).toMatchObject({
              childFingerprint: f.seed.fingerprint,
              parentFingerprint:
                'sha256:cfc55796562b44bd616f33082cbbafd9dbd43d58733a24ac550339cbc8376274',
              receiptCount: 70,
            });
            must(
              secondReady.pid !== firstReady.pid,
              'ACTUAL_DIFFERENT_OS_PID_REQUIRED',
            );
            expect(await s.counts()).toEqual(before);
            await browser!.setActualOrigin(d.origin());
            await d.start();
            for (const original of d.originals) await d.recover(original);
            await financeBrowser.reloadRestore(line, { recover: false });
            await financeBrowser.recoverFinal({ requireCurrent: false });
            await d.checkpoint('COLD_OS_NEW_PRIVATE_PROOF_AND_DURABLE_FINALS', {
              clock: await d.rpc('CLOCK'),
            });
          },
        });
      report.industry = industryResult;
      must(secondReady, 'SECOND_COLD_OS_REQUIRED');
      report.nodeColdStarts = [firstReady, secondReady];
      const beforeProduction = await s.counts(),
        production = await d.makeRequest({
          countryId: 'COUNTRY_02',
          officeId: 'INDUSTRY',
          commandType: 'CORE_INDUSTRY_PRODUCTION_V1',
          commandId: 'FINAL_PRODUCTION_NOT_READY_' + id,
          idempotencyKey: 'FINAL_PRODUCTION_NOT_READY_KEY_' + id,
          payload: { facilityId: 'OPEN-02-REFINED_FUEL', runId: runPlan.runId },
        }),
        denied = await d.post('/v1/office-command', production, 'COUNTRY_02');
      must(
        denied.status === 503 &&
          denied.body.ok === false &&
          object(denied.body.error).code === 'SOURCE_RUNTIME_UNAVAILABLE' &&
          object(denied.body.state).status === 'REJECTED' &&
          object(denied.body.state).reason === 'SOURCE_RUNTIME_UNAVAILABLE' &&
          object(denied.body.state).submitted === false &&
          object(denied.body.state).queued === false,
        'TYPED_MISSING_PRODUCTION_MUST_NOT_QUEUE',
      );
      expect(await s.counts()).toEqual(beforeProduction);
      report.productionBoundary = {
        classification: 'PRODUCTION_NOT_YET_IMPLEMENTED_IN_CANDIDATE',
        httpStatus: denied.status,
        response: denied.body,
        unchangedHeadAndJournals: true,
      };
      for (const original of d.originals) await d.recover(original);
      // C2's committed frames advance the global head. Re-derive C1 through
      // the fixed controller using an existing LINE FINAL; do not re-submit
      // the economic command or describe C1's old cached document as current.
      const beforeC1Publication = await s.counts(),
        publicationHead = await d.readHead(),
        c1Publication = object(
          await d.rpc('RETRY_PUBLICATION', {
            commandId: line.request.commandId,
          }),
        );
      expect(c1Publication).toMatchObject({
        status: 'PUBLISHED',
        commandId: line.request.commandId,
        countryId: 'COUNTRY_01',
        head: publicationHead,
        documentCount: 14,
        industryLabour: 'PUBLISHED',
        captain: 'PUBLISHED',
      });
      expect(await s.counts()).toEqual(beforeC1Publication);
      report.crossCountryCurrentPublication = {
        source: 'EXISTING_C1_LINE_FINAL_FIXED_RETRY_DERIVED_ONLY',
        result: c1Publication,
        economicCountsUnchanged: true,
      };
      report.finalBrowser = await browser.readAll({
        expectedHead: publicationHead,
      });
      const beforeDenied = await s.counts();
      await financeBrowser.setAccessTokenForNextRequest(
        'Bearer ' + s.signUnassignedToken(),
      );
      report.unassignedSubjectBrowser =
        await financeBrowser.assertDeniedCleared();
      expect(await s.counts()).toEqual(beforeDenied);
      report.browser = browser.evidence;
      report.finalCounts = await s.counts();
      report.status = 'PASS';
    } catch (error) {
      failure = error;
      report.status = 'FAIL';
      report.failure = {
        name: error instanceof Error ? error.name : 'UNKNOWN',
        message: error instanceof Error ? error.message : String(error),
      };
    } finally {
      for (const [name, close] of [
        ['CHROMIUM', () => browser?.close()],
        ['NODE', () => driver?.stop()],
        ['SETUP_POOLS', () => setup?.close()],
        ['OWNED_CHILD_INSTALLATION', () => fixture?.cleanup()],
      ] as const)
        try {
          await close();
          (report.cleanup as unknown[]).push({ name, status: 'CLOSED' });
        } catch (error) {
          cleanupErrors.push(error);
          (report.cleanup as unknown[]).push({
            name,
            status: 'FAILED',
            message: error instanceof Error ? error.message : String(error),
          });
        }
      if (cleanupErrors.length) report.status = 'FAIL';
      await driver?.finish(
        report.status === 'PASS' ? 'PASS' : 'FAIL',
        failure ?? cleanupErrors[0],
      );
      await writeFile(
        path.join(evidenceDirectory, 'registered-final-report.json'),
        serializePostwarSocialPrefixEvidence(report),
      );
    }
    if (failure || cleanupErrors.length)
      throw new AggregateError(
        [...(failure ? [failure] : []), ...cleanupErrors],
        'REGISTERED_FINAL_ACTUAL_ACCEPTANCE_FAILED',
        { cause: failure ?? cleanupErrors[0] },
      );
  }, 1_800_000);
});
