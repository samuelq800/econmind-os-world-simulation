import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  PRODUCTION_POSTING_RELEASE,
  productionPostingPolicyFingerprint,
} from '../../scripts/production-posting-release-policy.mjs';
import { HOLD_RELEASE } from '../../scripts/world-runtime-actions.mjs';

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
const files = Object.freeze({
  host: 'apps/world-worker/src/runtime-preparation/production-world-command-host.ts',
  api: 'apps/world-api/cloudflare/runtime-api.mjs',
  finance: 'apps/world-worker/src/intake/manual-office-intake-runtime.ts',
  browser: 'apps/world-web/src/office-command/contract.ts',
  fields: 'apps/world-web/src/office-projection/model.ts',
  gate: 'status/progress.json',
});
const credentialNames = Object.freeze([
  'GH_TOKEN',
  'CLOUDFLARE_API_TOKEN',
  'CLOUDFLARE_ACCOUNT_ID',
  'SUPABASE_ACCESS_TOKEN',
  'SUPABASE_DB_PASSWORD',
  'SUPABASE_PROJECT_REF',
]);

/** Offline evidence inventory only. Source matching never certifies runtime
 * readiness, approval, credentials, admission or an actual provider deployment.
 * No shell, HTTP, DB, SQL rendering, writes or production workflow invocation.
 */
export async function planOfficeRelease({
  root = repositoryRoot,
  env = process.env,
} = {}) {
  const source = {};
  for (const [key, name] of Object.entries(files)) {
    try {
      source[key] = await readFile(path.join(root, name), 'utf8');
    } catch {
      source[key] = null;
    }
  }
  let gate = null;
  try {
    const parsed = JSON.parse(source.gate);
    gate = {
      step: parsed.current_gate.step_id,
      status: parsed.current_gate.status,
      nextStepReady: parsed.current_gate.next_step_ready === true,
    };
  } catch {
    // Historical governance is context to reconcile, not a new permission veto.
  }
  const observed = (key, pattern) =>
    source[key] === null
      ? 'UNAVAILABLE'
      : pattern.test(source[key])
        ? 'SOURCE_BLOCK_CONFIRMED'
        : 'REQUIRES_REVIEW';
  const blockers = [
    {
      code: 'FORMAL_RUNTIME_HOST_UNAVAILABLE',
      category: 'CODE_IMPLEMENTATION_GAP',
      resolutionOwner: 'IMPLEMENTATION_AGENT',
      nextAction:
        'Implement reviewed server-owned source, actor and Clock constructors with request-lifetime identity; preserve closed binding until actual composition exists.',
      evidence: files.host,
      observation: observed('host', /ServerCommandHostBinding\s*=\s*never/u),
    },
    {
      code: 'CLOUD_RUNTIME_HOLD',
      category: 'CODE_IMPLEMENTATION_GAP',
      resolutionOwner: 'IMPLEMENTATION_AGENT',
      nextAction:
        'Implement and verify a real formal API/executor composition and a new immutable release path; changing HOLD text cannot provide runtime capability.',
      evidence: files.api,
      observation: observed('api', /authoritativeCommandsEnabled:\s*false/u),
    },
    {
      code: 'FINANCE_BUDGET_SOURCE_AND_CONSUMER_UNAVAILABLE',
      category: 'CODE_IMPLEMENTATION_GAP',
      resolutionOwner: 'IMPLEMENTATION_AGENT',
      nextAction:
        'Implement admitted budget producer, atomic guard, sole durable consumer and browser family against actual authoritative records.',
      evidence: files.finance,
      observation: observed(
        'finance',
        /command\.commandType === FINANCE_BUDGET_APPROPRIATION_COMMAND\)\s*return false/u,
      ),
    },
    {
      code: 'PRODUCTION_POSTING_CALLER_NOT_READY',
      category: 'CODE_IMPLEMENTATION_GAP',
      resolutionOwner: 'IMPLEMENTATION_AGENT',
      nextAction:
        'Implement the companion-repository fixed-candidate caller with exact baseline/readback and UNKNOWN recovery; do not publish from World.',
      evidence: 'scripts/production-posting-release-policy.mjs',
      observation: `${PRODUCTION_POSTING_RELEASE.callerRegistration}/${PRODUCTION_POSTING_RELEASE.callerReadiness}`,
    },
    {
      code: 'LIVE_SCHEMA_ROLES_ADMISSION_SEATS_AND_READBACK_NOT_VERIFIED',
      category: 'INFRASTRUCTURE',
      resolutionOwner: 'PLATFORM_AND_DATABASE_OWNER',
      nextAction:
        'Read back actual schema, dedicated role references, immutable admission and current seats through existing controlled interfaces; unknown is not proven absent.',
      observation: 'NOT_RUN',
    },
    {
      code: 'FORMAL_DOMAIN_SOURCE_NOT_BOUND',
      category: 'AUTHORITATIVE_DATA',
      resolutionOwner: 'IMPLEMENTATION_AGENT_AND_SOURCE_OWNER',
      nextAction:
        'Bind the precise Finance and CB source contracts listed in authoritativeSourceRequirements; source-file presence is not admitted runtime lineage.',
      observation: 'NOT_ESTABLISHED_BY_OFFLINE_PLAN',
    },
    {
      code: 'FINAL_IMMUTABLE_CANDIDATE_INDEPENDENT_REVIEW_REQUIRED',
      category: 'FINAL_CANDIDATE_REVIEW',
      resolutionOwner: 'INDEPENDENT_REVIEWER',
      nextAction:
        'Complete implementation and required evidence first, then review the actual immutable P0 candidate; this inventory does not claim PR approval.',
      observation: 'FINAL_CANDIDATE_NOT_PREPARED',
    },
  ];
  return {
    schemaVersion: 'office-release-preflight-v1',
    mode: 'OFFLINE_READ_ONLY_PLAN',
    status: 'BLOCKED',
    productionReady: false,
    deployed: false,
    executionSupported: false,
    worldStarted: false,
    clockStarted: false,
    gate,
    authorization: {
      userRequestedOutcome: 'ALL_OFFICE_DATA_CONNECTION_AND_CLOUD_RELEASE',
      implementationMayContinue: true,
      historicalStopInstructionsArePermanentVeto: false,
      finalCandidateApprovalClaimed: false,
    },
    context: [
      {
        category: 'HISTORICAL_GOVERNANCE_CONTEXT',
        code: 'RECORDED_GATE_REQUIRES_RECONCILIATION',
        evidence: files.gate,
        observation: gate ? 'GOVERNANCE_READ_ONLY' : 'UNAVAILABLE',
        blocksImplementation: false,
        nextAction:
          'Reconcile recorded progress against new verified implementation evidence; old PLANNED/HOLD records alone do not revoke current user authorization.',
      },
    ],
    blockers,
    authoritativeSourceRequirements: {
      evidenceStatus: 'REQUIRED_CONTRACT_FACTS_NOT_PROOF_DATA_IS_ABSENT',
      financeBudget: {
        contract: 'packages/core/src/commands/finance-budget-appropriation.ts',
        missingRuntimeBinding: [
          'World/country/entity/envelope/effectivePeriod scope with currency and exact amounts',
          'Envelope cap/revision, line/revision/predecessor references and real commitment/paid/reserved history disposition',
          'Producer/source revision, approvalRule revision, approvalSet, proposal/version and current FINANCE_BUDGET authorization',
          'Same authoritative worldVersion/eventSequence/simTime and atomic append-only source transition guard',
        ],
      },
      centralBankOmo: {
        contract:
          'packages/core/src/commands/central-bank-open-market-operation.ts',
        missingRuntimeBinding: [
          'Same World/country/version/eventSequence/currentSimTime and domesticTreasuryRef',
          'Commercial-bank and central-bank complete ledger snapshots with account mappings, including explicit zero accounts',
          'Security/batch/issuer/holder/currency/maturity, face/encumbered/carrying value holdings',
          'QuoteRef/securityRef/batchRef/issuerRef/currency/pricePerFace/validAtSimTime/sourceRef/worldVersion',
          'Canonical opening plus append-only posting lineage and current CENTRAL_BANK_MONETARY_POLICY authorization',
        ],
      },
      readAdmission: [
        'Persisted current seat/authSubject/country/office/authorizationRevision',
        'Immutable ADMITTED World/seedRef/contentHash/modelVersion and current authorized projection head',
      ],
    },
    userActions: [
      {
        id: 'NETWORK_GITHUB_REST',
        category: 'INFRASTRUCTURE',
        owner: 'ENVIRONMENT_NETWORK_OWNER',
        action:
          'Permit api.github.com:443 HTTPS CONNECT for the bounded repository metadata GET operations listed in requiredNetworkAccess; no proxy bypass or policy edit is performed here.',
        evidence:
          '2026-10-28 API_PROXY_CONNECT_403_ENVOY; github.com Git transport succeeded',
        tokenPermissionStatus: 'NOT_EVALUABLE_BEFORE_CONNECT_SUCCEEDS',
      },
      {
        id: 'VERIFY_EXISTING_PUBLISHER_CONFIGURATION',
        category: 'INFRASTRUCTURE',
        owner: 'REPOSITORY_AND_PLATFORM_OWNER',
        action:
          'After network access works, verify existing configuration by names/status in the owning store; missing local values do not establish missing GitHub secrets. Do not send values in chat.',
        configuration: [
          {
            name: 'CLOUDFLARE_API_TOKEN',
            target: 'World GitHub Actions secret',
            purpose: 'Existing controlled Workers publisher',
          },
          {
            name: 'CLOUDFLARE_ACCOUNT_ID',
            target: 'World GitHub Actions variable',
            purpose: 'Fixed reviewed Cloudflare account selection',
          },
          {
            name: 'SUPABASE_ACCESS_TOKEN',
            target: 'Companion GitHub Actions secret',
            purpose: 'Sole controlled schema/readback publisher',
          },
          {
            name: 'SUPABASE_PROJECT_REF',
            target: 'Companion GitHub Actions variable',
            purpose: 'Fixed shared-production target selection',
          },
          {
            name: 'SUPABASE_DB_PASSWORD',
            target: 'Companion generic backend publisher only',
            purpose:
              'Only if that separately selected existing workflow requires it; never copy into World frontend',
          },
          {
            name: 'WORLD_OFFICIAL_READ_BASE_URL',
            target: 'World GitHub Actions variable',
            purpose:
              'Public source reader used by Pages build, not economic runtime',
          },
        ],
        runtimeConnectionReferences:
          'Provide existing reader/intake/source/executor role and secret/Hyperdrive reference names to the reviewed formal composition; concrete binding names are not registered yet.',
      },
      {
        id: 'LOCATE_AUTHORITATIVE_SOURCE_RECORDS',
        category: 'AUTHORITATIVE_DATA',
        owner: 'ECONOMIC_SOURCE_OWNER',
        action:
          'Identify the authoritative record locations and applicable adopted versions for the exact Finance/CB facts listed in authoritativeSourceRequirements when repository evidence cannot resolve them; agent implements readers and integration.',
        mayUseProposalsOrSyntheticDefaults: false,
      },
    ],
    credentials: credentialNames.map((name) => ({
      name,
      localEnvironment: env[name]?.trim() ? 'PRESENT_UNVERIFIED' : 'ABSENT',
      githubConfiguration: 'NOT_READ_BACK',
    })),
    runtimeConnections: {
      requiredSeparateRoles: ['reader', 'intake', 'source', 'executor'],
      providerBindings: 'NOT_READ_BACK',
      leastPrivilegeApproval: 'NOT_VERIFIED',
      tlsAndQueryCacheDisabled: 'NOT_VERIFIED',
    },
    offices: {
      finance: {
        availableTransportActions: [
          'INSPECT',
          'SIGN_BUYER_FINANCE',
          'BIND_REFERENCE',
        ],
        budgetIntent: 'SCHEMA_ONLY_RUNTIME_REJECTED',
        browserBudgetIntent: 'NOT_CONNECTED',
        missingProjectedFields: [
          'Available treasury balance',
          'Budget commitments',
          'Debt maturity',
        ],
      },
      centralBank: {
        availableTransportFamilies: ['CORE_CENTRAL_BANK_OMO_V1'],
        productionExecution: 'BLOCKED_BY_FORMAL_HOST_AND_ADMITTED_SOURCE',
        missingProjectedFields: [
          'Policy rate',
          'Eligible collateral',
          'Bank liquidity',
        ],
      },
      financialReadSemantics:
        'AUTHORIZED_FILTERED_OPENING_PLUS_POSTING_NONZERO_POSITIONS_NOT_SPENDABLE_CASH',
    },
    controlledPaths: {
      frontend: '.github/workflows/deploy-world-web.yml',
      holdHosting: {
        workflow: '.github/workflows/world-runtime-actions.yml',
        sourceCommit: HOLD_RELEASE.commit,
        scope: 'REVIEWED_HOLD_HOSTING_ONLY',
      },
      database: {
        repository: 'samuelq800/econmind-os',
        publisher: PRODUCTION_POSTING_RELEASE.publisher,
        candidateMigration: PRODUCTION_POSTING_RELEASE.migrationId,
        policyFingerprint: await productionPostingPolicyFingerprint(),
        callerRegistration: PRODUCTION_POSTING_RELEASE.callerRegistration,
        callerReadiness: PRODUCTION_POSTING_RELEASE.callerReadiness,
      },
      recovery: {
        schemaInspection:
          'econmind-os/.github/workflows/recover-world-v2-schema-release.yml',
        uncertainOutcome:
          'STOP_UNKNOWN_READ_ONLY_DIAGNOSTIC_NO_AUTOMATIC_RETRY_OR_ROLLBACK',
        committedEconomicFacts: 'PRESERVE_EVENTS_LEDGER_SEED_FORWARD_FIX_ONLY',
        frontend: 'REVIEW_PREVIOUS_IMMUTABLE_SOURCE_AND_REPUBLISH_VIA_PAGES',
        runtime:
          'SEPARATELY_REVIEW_FIXED_HOLD_ARTIFACT_NO_GENERIC_ACTIVE_ROLLBACK',
      },
    },
    requiredNetworkAccess: {
      domain: 'api.github.com:443',
      operations: [
        'GET /repos/samuelq800/{econmind-os,econmind-os-world-simulation}/actions/secrets (names only)',
        'GET /repos/samuelq800/{econmind-os,econmind-os-world-simulation}/actions/variables (names only)',
        'GET /repos/samuelq800/{econmind-os,econmind-os-world-simulation}/actions/runs',
        'GET /repos/samuelq800/econmind-os-world-simulation/environments/world-cloudflare-hold',
        'GET /repos/samuelq800/econmind-os-world-simulation/pages',
      ],
      verifiedHere: false,
      permissionExpansionOrTokenRequest: false,
    },
  };
}

export async function runReleasePreflight(args, options) {
  const supplied = args[0] ?? 'plan';
  const mode =
    supplied === '--plan'
      ? 'plan'
      : supplied === '--check'
        ? 'check'
        : supplied;
  if (args.length > 1 || !['plan', 'check'].includes(mode))
    return {
      exitCode: 2,
      report: { status: 'BLOCKED', code: 'READ_ONLY_PLAN_OR_CHECK_REQUIRED' },
    };
  const report = await planOfficeRelease(options);
  return { exitCode: mode === 'check' ? 2 : 0, report };
}

if (
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
) {
  try {
    const result = await runReleasePreflight(process.argv.slice(2));
    console.log(JSON.stringify(result.report, null, 2));
    process.exitCode = result.exitCode;
  } catch {
    console.error(
      JSON.stringify({
        status: 'BLOCKED',
        code: 'OFFLINE_PREFLIGHT_UNAVAILABLE',
      }),
    );
    process.exitCode = 2;
  }
}
