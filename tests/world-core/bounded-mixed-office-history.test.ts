/** Mock durable transport over genuine Core transitions and explicit TEST_ONLY
 * originals. This tests bounded reconstruction/semantic replay, NOT PG custody,
 * SQL authorization, source admission, or actual selected-country balances. */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import * as C from '@econmind/core';
import {
  FINANCE_NATIVE_BUDGET_RULE,
  prepareFinanceNativeBudgetTransition,
  type FinanceNativeBudgetCanonicalFrame,
  type FinanceNativeBudgetPolicy,
  type FinanceNativeBudgetSource,
} from '@econmind/core/finance-budget-native';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const at = '2026-10-28T00:00:00.000Z',
  world = C.worldId('WORLD_TEST_ONLY_NATIVE_BUDGET'),
  country = C.countryId('COUNTRY_01'),
  subject = C.authSubject('11111111-1111-4111-8111-111111111111');
function fixture() {
  const gov = C.legalEntityId('GOV_TEST_ONLY'),
    cb = C.legalEntityId('CB_TEST_ONLY'),
    claim = C.financialClaimId('CLAIM_TEST_ONLY_TGA');
  const accounts = [gov, cb].map((ownerId, i) =>
    C.createFinancialAccount({
      worldId: world,
      countryId: country,
      accountId: C.financialAccountId(`ACCOUNT_TEST_ONLY_${i}`),
      ownerId,
      counterpartyEntityId: i === 0 ? cb : gov,
      claimId: claim,
      currency: 'GBP',
      accountClass: i === 0 ? 'ASSET' : 'LIABILITY',
    }),
  );
  const opening = C.createOpeningSource(
    {
      schemaVersion: C.OPENING_SOURCE_SCHEMA_VERSION,
      sourceId: C.openingSourceId('SOURCE_TEST_ONLY'),
      sourceKind: 'TEST_FIXTURE',
      locator: 'tests/world-core/finance-budget-native.test.ts',
      sourceVersion: 'TEST_ONLY_V1',
      payload: { classification: 'TEST_ONLY_NOT_ADMITTED' },
    },
    sha,
  );
  const seed = C.createOpeningSeed(
    {
      schemaVersion: C.OPENING_SEED_SCHEMA_VERSION,
      seedId: C.openingSeedId('SEED_TEST_ONLY'),
      worldId: world,
      openingWorldVersion: '0',
      replayBinding: C.CURRENT_REPLAY_BINDING,
      sources: [opening],
      inventoryEntries: [],
      financialBatches: [
        {
          batchId: C.financialOpeningBatchId('BATCH_TEST_ONLY'),
          sourceId: opening.sourceId,
          settlementCurrency: 'GBP',
          legs: accounts.map((account, i) => ({
            legId: C.financialOpeningLegId(`LEG_TEST_ONLY_${i}`),
            account,
            direction: i === 0 ? 'DEBIT' : 'CREDIT',
            amount: C.Money.from('1000', 'GBP'),
            counterpartLegId: C.financialOpeningLegId(`LEG_TEST_ONLY_${1 - i}`),
          })),
        },
      ],
    },
    sha,
  );
  const policy: FinanceNativeBudgetPolicy = {
    schemaVersion: 'finance-native-budget-policy-v1',
    ruleRef: FINANCE_NATIVE_BUDGET_RULE,
    ruleRevision: 'RULE_REV_TEST_ONLY',
    sourceDocumentSHA256: 'sha256:' + 'a'.repeat(64),
    normativeUnits: [
      'FINANCE-U0247',
      'FINANCE-U0252',
      'FINANCE-U0265',
      'FINANCE-U0295',
    ],
    worldId: world,
    countryId: country,
    governmentEntityId: gov,
    currency: 'GBP',
    envelopeRef: 'ENVELOPE_TEST_ONLY',
    effectivePeriodRef: 'PERIOD_TEST_ONLY',
    periodRevision: 'PERIOD_REV_TEST_ONLY',
    validFromSimTime: '0',
    validUntilSimTime: '100',
    requestingOfficeId: 'FINANCE',
    programmeOwnerOfficeId: 'FINANCE',
    classification: 'ORDINARY_DEPARTMENTAL',
    funding: 'FULL_UNCONDITIONAL',
    requiredApprovalOffices: ['FINANCE'],
  };
  const source: FinanceNativeBudgetSource = {
    policy,
    binding: {
      seedRef: seed.seedId,
      seedFingerprint: seed.fingerprint,
      admissionRef: 'ADMISSION_TEST_ONLY',
      financialSourceId: opening.sourceId,
      originalsSHA256: 'sha256:' + 'b'.repeat(64),
      policyHash: C.canonicalSha256(C.canonicalHashInput(policy), sha),
      treasuryAccountId: accounts[0]!.accountId,
      treasuryClaimId: claim,
      openingEncumbranceHash: C.canonicalSha256(C.canonicalHashInput([]), sha),
    },
    financialState: C.rebuildV08LedgersFromLineage({ seed, sha256Hex: sha })
      .financial,
    frames: [],
    openingEncumbrances: [],
    worldVersion: '0',
    eventSequence: '0',
  };
  const command = (
    operation: 'SET_ENVELOPE' | 'APPROVE_NEW_LINE' = 'SET_ENVELOPE',
    amount = '800',
    version = '0',
    suffix = 'SET',
    simTime = '0',
  ) =>
    C.parseCanonicalCommand(
      {
        schemaVersion: C.COMMAND_SCHEMA_VERSION,
        commandId: `COMMAND_TEST_ONLY_${suffix}`,
        idempotencyKey: `KEY_TEST_ONLY_${suffix}`,
        worldId: world,
        countryId: country,
        officeId: 'FINANCE',
        actorId: 'ACTOR_TEST_ONLY',
        authSubject: subject,
        commandType: 'CORE_FINANCE_BUDGET_APPROPRIATION_V1',
        expectedWorldVersion: version,
        simTime,
        correlationId: 'CORRELATION_TEST_ONLY',
        submittedAtReal: at,
        payload: {
          operation,
          scope: {
            worldId: world,
            countryId: country,
            entityRef: gov,
            envelopeRef: policy.envelopeRef,
            effectivePeriodRef: policy.effectivePeriodRef,
          },
          currency: 'GBP',
          amount,
          envelopeRevisionRef: 'ENVELOPE_REV_TEST_ONLY',
          lineRef:
            operation === 'SET_ENVELOPE' ? null : `LINE_TEST_ONLY_${suffix}`,
          revisionRef:
            operation === 'SET_ENVELOPE'
              ? 'ENVELOPE_REV_TEST_ONLY'
              : `LINE_REV_TEST_ONLY_${suffix}`,
          predecessorRevisionRef: null,
        },
      },
      sha,
    );
  return { seed, source, command };
}
async function run(
  command: C.CanonicalCommand,
  source: FinanceNativeBudgetSource,
) {
  let active = true,
    proof: C.CommitAuthorizationProof | undefined,
    result:
      | Awaited<ReturnType<typeof prepareFinanceNativeBudgetTransition>>
      | undefined;
  const intakeAuthorization = await C.authorizeOfficeCapability({
    principal: {
      authSubject: subject,
      facts: { user_id: subject, display_name: null, school_id: null },
      token: {
        subject,
        issuer: 'TEST_ONLY',
        audience: 'TEST_ONLY',
        issuedAt: at,
        expiresAt: '2026-10-29T00:00:00.000Z',
      },
    },
    resolver: {
      resolveCurrentIdentity: async () => subject,
      resolveCurrentMembership: async () => ({
        authSubject: subject,
        worldId: world,
        countryId: country,
        teamId: C.teamId('TEAM_TEST_ONLY'),
        authorizationVersion: 'REV_TEST_ONLY',
        officeAssignments: [C.officeId('FINANCE')],
        active,
        suspended: false,
        isWorldAdmin: false,
        negotiationPartyIds: [],
      }),
    },
    worldId: world,
    requestedCountryId: country,
    requestedOfficeId: 'FINANCE',
    capability: 'FINANCE_BUDGET',
  });
  await C.processQueuedCommand({
    command,
    authorityKind: 'DISCRETIONARY_USER',
    requiredCapability: 'FINANCE_BUDGET',
    intakeAuthorization,
    commitSimTime: command.simTime,
    recordedAtReal: at,
    persistence: {
      readFinalReceipt: async () => null,
      recordZeroEffectReceipt: async (r) => r,
      commitAuthorizedCommand: async (input) => {
        proof = input.commitAuthorization!;
        result = await prepareFinanceNativeBudgetTransition({
          command,
          authorization: proof,
          source,
          recordedAtReal: at,
          sha256Hex: sha,
        });
        return { transition: result.transition, receipt: result.receipt };
      },
    },
  });
  if (!result || !proof) throw Error('native transition not issued');
  return {
    result,
    proof,
    revoke() {
      active = false;
    },
  };
}

/** Small explicit TEST_ONLY states test reducer interoperability only. Actual
 * selected-country money/custody acceptance uses the separate native suite. */
function socialOriginal(countryId = 'COUNTRY_01') {
  const scope = {
    countryId,
    locationId: `LOCATION_${countryId}`,
    skill: 'HIGH' as const,
  };
  const positionId = `POSITION_${countryId}`,
    employerId = `GOV_${countryId}`;
  const populationAvailability = [
    { countryId, locationId: scope.locationId, workingAgeAvailable: '7' },
  ];
  const opening = C.materializeOpeningLabourState({
    targets: [{ ...scope, count: '2' }],
    positions: [
      {
        ...scope,
        positionId,
        requiredCount: '6',
        sourceWeight: '1',
        owner: 'PUBLIC_SERVICE',
        classificationId: 'EDUCATION',
        employerId,
        employerRole: 'GOV',
        occupation: 'TEACHER',
        wageAmount: '3600',
        wageCurrency: 'GBP',
        wagePeriod: 'SIM_YEAR',
        wageVersion: 'TEST_ONLY_WAGE',
        payrollFundingRef: `PAYROLL_${countryId}`,
      },
    ],
    populationAvailability,
    skillAvailability: [{ ...scope, count: '7' }],
    nonEmployedAggregates: [
      { ...scope, status: 'UNEMPLOYED_SEARCHING', count: '5' },
    ],
    employers: [{ countryId, employerId, role: 'GOV' }],
  });
  const state: C.SocialEmploymentServiceState = {
    schemaVersion: 'social-employment-service-state-v1',
    worldId: world,
    labour: opening.state,
    servicePools: [
      {
        ...scope,
        poolId: `POOL_${countryId}`,
        dayIndex: '0',
        ruleVersion: C.SOCIAL_JOB_MATCH_RULE_VERSION,
        capacitySlots: '3',
        usedSlots: '0',
        reservedSlots: '0',
      },
    ],
    plans: [],
    appliedOperations: [],
  };
  const facts: C.SocialEmploymentReadFacts = {
    boundary: C.createE01DailyBoundary('0'),
    simTime: '0',
    populationAvailability,
    offer: {
      ...scope,
      positionId,
      employerId,
      employerRole: 'GOV',
      legalPositionRef: `LEGAL_${countryId}`,
      payrollFundingRef: `PAYROLL_${countryId}`,
      offerVersion: 'TEST_ONLY_OFFER',
      state: 'ACTIVE',
      wageVersion: 'TEST_ONLY_WAGE',
      amount: '3600',
      currency: 'GBP',
      period: 'SIM_YEAR',
      validFromDayIndex: '0',
      validUntilDayIndex: '1',
    },
    minimumWage: {
      countryId,
      ruleId: 'TEST_ONLY_FLOOR',
      ruleVersion: 'TEST_ONLY_FLOOR_V1',
      amount: '3600',
      currency: 'GBP',
      period: 'SIM_YEAR',
      validFromDayIndex: '0',
      validUntilDayIndex: '1',
    },
  };
  return { countryId, state, offers: [facts.offer], facts, scope, positionId };
}
function socialFrame(
  original: ReturnType<typeof socialOriginal>,
  version: string,
  sequence: string,
  previous?: {
    command: C.CanonicalCommand;
    state: C.SocialEmploymentServiceState;
  },
  simTime = '0',
) {
  const due = previous !== undefined;
  const command = C.parseCanonicalCommand(
    {
      schemaVersion: C.COMMAND_SCHEMA_VERSION,
      worldId: world,
      countryId: original.countryId,
      officeId: due ? null : 'SOCIAL',
      commandType: due
        ? C.SOCIAL_JOB_MATCH_DUE_COMMAND
        : C.SOCIAL_EMPLOYMENT_SERVICE_PLAN_COMMAND,
      commandId: `COMMAND_${due ? 'MATCH' : 'PLAN'}_${original.countryId}`,
      actorId: 'ACTOR_TEST_ONLY',
      authSubject: subject,
      correlationId: 'CORRELATION_TEST_ONLY',
      idempotencyKey: `KEY_${due ? 'MATCH' : 'PLAN'}_${original.countryId}`,
      expectedWorldVersion: version,
      simTime,
      submittedAtReal: at,
      payload: due
        ? {
            schemaVersion: 'social-job-match-settlement-v1',
            planCommandId: previous.command.commandId,
            planFingerprint: previous.command.fingerprint,
            dueDayIndex: '0',
            ruleVersion: C.SOCIAL_JOB_MATCH_RULE_VERSION,
          }
        : {
            schemaVersion: 'social-employment-service-plan-v1',
            locationId: original.scope.locationId,
            skill: 'HIGH',
            positionId: original.positionId,
            servicePoolId: `POOL_${original.countryId}`,
            requestedMatches: '1',
            dueDayIndex: '0',
          },
    },
    sha,
  );
  const prepared = C.prepareSocialEmploymentServiceOperation({
    command,
    state: previous?.state ?? original.state,
    readFacts: { ...original.facts, simTime },
    sha256Hex: sha,
  });
  const event = C.parseAuthoritativeEvent(
    {
      schemaVersion: C.EVENT_SCHEMA_VERSION,
      eventId: `EVENT_${command.commandId}`,
      eventType: due ? C.SOCIAL_JOB_MATCH_EVENT : C.SOCIAL_SERVICE_PLAN_EVENT,
      worldId: world,
      causationCommandId: command.commandId,
      correlationId: command.correlationId,
      worldVersion: (BigInt(version) + 1n).toString(),
      sequence,
      simTime,
      recordedAtReal: at,
      correctsEventId: null,
      payload: prepared.eventPayload,
    },
    sha,
  );
  const transition = C.createAuthoritativeTransition({
    command,
    worldVersionBefore: version,
    worldVersionAfter: event.worldVersion,
    events: [event],
  });
  const receipt = C.createFinalCommandReceipt({
    command,
    transition,
    outcome: 'COMMITTED',
    reasonCode: null,
    simTime: command.simTime,
    recordedAtReal: at,
  });
  return {
    command,
    events: [event],
    transition,
    receipt,
    inventoryPostings: [],
    financialPostingBatches: [],
    state: prepared.state,
  };
}
const canonicalBudgetFrame = (
  command: C.CanonicalCommand,
  value: Awaited<ReturnType<typeof run>>,
): FinanceNativeBudgetCanonicalFrame => ({
  command,
  events: value.result.transition.events,
  transition: value.result.transition,
  receipt: value.result.receipt,
  inventoryPostings: [],
  financialPostingBatches: [],
});

import {
  readBoundedMixedOfficeHistoryFrom,
  BOUNDED_MIXED_OFFICE_LIMITS,
} from '../../apps/world-worker/src/persistence/bounded-mixed-office-history.js';
import type {
  SqlDatabase,
  SqlExecutor,
} from '../../apps/world-worker/src/persistence/sql-database.js';
const pins = {
  seedId: 'SEED_TEST_ONLY',
  seedFingerprint: 'sha256:' + '1'.repeat(64),
  admissionRef: 'ADMISSION_TEST_ONLY',
  canonicalSeedSha256: 'sha256:' + '2'.repeat(64),
};
function source(
  original: ReturnType<typeof socialOriginal>,
  account?: C.FinancialAccount,
) {
  return {
    schemaVersion: 'finance-budget-mixed-social-source-v1',
    worldId: world,
    countryId: original.countryId,
    ...pins,
    state: original.state,
    offers: original.offers,
    fundingAccounts: [
      {
        countryId: original.countryId,
        accountRef: account?.accountId ?? 'ACCOUNT_' + original.countryId,
        claimId: account?.claimId ?? 'CLAIM_' + original.countryId,
        payerEntityId: account?.ownerId ?? 'GOV_' + original.countryId,
        issuerEntityId:
          account?.counterpartyEntityId ?? 'CB_' + original.countryId,
        payerRole: 'GOV',
        currency: 'GBP',
        availableAmount: '1000',
        reservedAmount: '0',
      },
    ],
  };
}
async function dataset() {
  const f = fixture(),
    set = f.command(),
    first = await run(set, f.source);
  const sf = canonicalBudgetFrame(set, first);
  const line = f.command('APPROVE_NEW_LINE', '400', '1', 'LINE');
  const second = await run(line, {
    ...f.source,
    frames: [sf],
    financialState: C.rebuildV08LedgersFromLineage({
      seed: f.seed,
      transitions: [sf],
      sha256Hex: sha,
    }).financial,
    worldVersion: '1',
    eventSequence: '1',
  });
  const lf = canonicalBudgetFrame(line, second),
    c1 = socialOriginal(),
    c2 = socialOriginal('COUNTRY_02'),
    c3 = socialOriginal('COUNTRY_03');
  const plan = socialFrame(c2, '2', '5');
  const match = socialFrame(c2, '3', '6', {
    command: plan.command,
    state: plan.state,
  });
  const foreign = socialFrame(c3, '4', '7');
  return {
    frames: [sf, lf, plan, match, foreign],
    sources: [
      source(c1, f.source.financialState!.positions[0]!.account),
      source(c2),
      source(c3),
    ],
    head: { world_version: '5', event_sequence: '7' },
  };
}
function transport(data: Awaited<ReturnType<typeof dataset>>) {
  const statements: { sql: string; parameters: readonly unknown[] }[] = [],
    originals = new Map(
      data.sources.map((s) => [s.countryId, JSON.stringify(s)]),
    );
  const rows = data.frames.flatMap((f) =>
    f.events.map((e) => ({
      event_id: e.eventId,
      event_type: e.eventType,
      schema_version: e.schemaVersion,
      world_id: e.worldId,
      causation_command_id: e.causationCommandId,
      correlation_id: e.correlationId,
      world_version: e.worldVersion,
      sequence: e.sequence,
      sim_time: e.simTime.toCanonicalValue(),
      recorded_at_real: e.recordedAtReal,
      corrects_event_id: e.correctsEventId,
      canonical_payload: e.canonicalPayload,
      payload_sha256: e.payloadHash,
      event_fingerprint: e.fingerprint,
    })),
  );
  const query: SqlExecutor['query'] = async <Row extends object>(
    sql: string,
    parameters: readonly unknown[] = [],
  ) => {
    statements.push({ sql, parameters });
    let result: unknown[] = [];
    if (sql.includes('from world_v2.world_head')) result = [data.head];
    else if (sql.includes('read_postwar_bounded_journal'))
      result = [
        {
          ...data.head,
          financial_batch_count: '0',
          inventory_posting_count: '0',
          financial_batches: [],
        },
      ];
    else if (sql.startsWith('select event_id,event_type')) result = rows;
    else if (
      sql.startsWith('select exists(select 1 from world_v2.command_submission')
    )
      result = [{ present: true }];
    else if (sql.includes('as command_actor_id')) {
      const c = data.frames.find(
        (f) => f.command.commandId === parameters[1],
      )!.command;
      result = [
        {
          command_actor_id: c.actorId,
          command_auth_subject: c.authSubject,
          command_canonical_payload: c.canonicalPayload,
          command_country_id: c.countryId,
          command_expected_world_version: c.expectedWorldVersion,
          command_fingerprint: c.fingerprint,
          command_id: c.commandId,
          command_idempotency_key: c.idempotencyKey,
          command_office_id: c.officeId,
          command_payload_sha256: c.payloadHash,
          command_schema_version: c.schemaVersion,
          command_sim_time: c.simTime.toCanonicalValue(),
          command_submitted_at_real: c.submittedAtReal,
          command_type: c.commandType,
          command_world_id: c.worldId,
          correlation_id: c.correlationId,
        },
      ];
    } else if (sql.includes("outcome='COMMITTED'"))
      result = data.frames.map((f) => ({ command_id: f.command.commandId }));
    else if (sql.includes('from world_v2.command_receipt')) {
      const r = data.frames.find(
        (f) => f.command.commandId === parameters[1],
      )!.receipt;
      result = [
        {
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
        },
      ];
    } else if (sql.includes('read_finance_budget_mixed_social_original')) {
      const bytes = originals.get(String(parameters[2]));
      if (bytes)
        result = [
          {
            source_ref: 'SOURCE_' + parameters[2],
            source_text: bytes,
            source_sha256: sha(bytes),
          },
        ];
    } else throw Error('Unexpected transport query:' + sql);
    return { rows: result as Row[], rowCount: result.length };
  };
  const executor: SqlExecutor = { query },
    database: SqlDatabase = {
      query,
      transaction: async (operation) => operation(executor),
    };
  const read = () =>
    readBoundedMixedOfficeHistoryFrom({
      executor,
      database,
      worldId: world,
      countryId: country,
      expectedWorldVersion: data.head.world_version,
      workerId: 'WORKER_TEST_ONLY',
      observedAtReal: at,
      envelopeRef: 'ENVELOPE_TEST_ONLY',
      effectivePeriodRef: 'PERIOD_TEST_ONLY',
      sourcePins: pins,
    });
  return { read, query, statements, originals, rows, executor, database };
}
describe('complete bounded mixed prefix / mock transport, real Core semantics', () => {
  it('normalizes legal source cents exactly while retaining the sealed raw-byte digest', async () => {
    const data = await dataset(),
      t = transport(data),
      source = JSON.parse(t.originals.get('COUNTRY_01')!);
    source.fundingAccounts[0].availableAmount = '1000.0000';
    source.fundingAccounts[0].reservedAmount = '1.80';
    const bytes = JSON.stringify(source);
    t.originals.set('COUNTRY_01', bytes);
    const result = await t.read();
    const account = result.fundingAccounts.find(
      (a) => a.countryId === 'COUNTRY_01',
    )!;
    expect(account.availableAmount).toBe('1000');
    expect(account.reservedAmount).toBe('1.8');
    expect(
      result.sourceBindings.find((s) => s.countryId === 'COUNTRY_01')!
        .sourceSha256,
    ).toBe(sha(bytes));
    expect(t.originals.get('COUNTRY_01')).toBe(bytes);
  });
  it.each(['+1000', '01000', '1e3', '1000 ', '-0', 'NaN'])(
    'refuses an invalid source monetary lexeme %s',
    async (value) => {
      const data = await dataset(),
        t = transport(data),
        source = JSON.parse(t.originals.get('COUNTRY_01')!);
      source.fundingAccounts[0].availableAmount = value;
      t.originals.set('COUNTRY_01', JSON.stringify(source));
      await expect(t.read()).rejects.toThrow();
    },
  );
  it('keeps the established Social scope predicates while removing the false H0-publication dependency', async () => {
    const load = (path: string) =>
      readFile(new URL('../../' + path, import.meta.url), 'utf8');
    const sql = await load(
      'database/proposals/finance-budget-mixed-source.sql',
    );
    const original = await load(
      'database/proposals/postwar-social-current-prefix-read.sql',
    );
    const section = (text: string, name: string) => {
      const start = text.indexOf('create function world_v2.' + name + '(');
      const end =
        text.indexOf(
          ';',
          text.indexOf('alter function world_v2.' + name + '(', start),
        ) + 1;
      return text.slice(start, end);
    };
    expect(
      section(sql, 'finance_budget_mixed_social_effect_scoped')
        .replaceAll(
          'finance_budget_mixed_social_effect_scoped',
          'postwar_social_prefix_effect_scoped',
        )
        .replaceAll(
          'finance_budget_mixed_social_original',
          'postwar_social_prefix_scope',
        )
        .replaceAll(
          'world_v2_finance_budget_source_owner',
          'world_v2_postwar_projection_owner',
        ),
    ).toBe(section(original, 'postwar_social_prefix_effect_scoped'));
    expect(sql).not.toContain('prepare_postwar_social_prefix_scopes');
    expect(sql).not.toContain('postwar_office_projection_document');
    expect(sql).not.toContain('publish_postwar_office_projection');
    for (const field of [
      'accountRef',
      'claimId',
      'positionId',
      'poolId',
      'cohorts',
    ])
      expect(sql).toContain(field);
  });
  it('pins the SQL opening-source digest preimage to the actual Core payload envelope', async () => {
    const opening = C.createOpeningSource(
      {
        schemaVersion: C.OPENING_SOURCE_SCHEMA_VERSION,
        sourceId: C.openingSourceId('SOURCE_TEST_ONLY_HASH_ENVELOPE'),
        sourceKind: 'TEST_FIXTURE',
        locator: 'tests/world-core/bounded-mixed-office-history.test.ts',
        sourceVersion: 'TEST_ONLY_V1',
        payload: { amount: '12.3456789', classification: 'TEST_ONLY' },
      },
      sha,
    );
    expect(opening.payloadHash).toBe(
      'sha256:' + sha('SHA-256\n{"payload":' + opening.canonicalPayload + '}'),
    );
    expect(opening.payloadHash).not.toBe(
      'sha256:' + sha('SHA-256\n' + opening.canonicalPayload),
    );
    const sql = await readFile(
      new URL(
        '../../database/proposals/finance-budget-mixed-source.sql',
        import.meta.url,
      ),
      'utf8',
    );
    expect(sql).toContain(
      "E'SHA-256\\n{\"payload\":'||(op_source->>'canonicalPayload')||'}'",
    );
  });

  it('replays all Budget groups and both foreign Social countries without a full seed or dropped event', async () => {
    const data = await dataset(),
      t = transport(data),
      r = await t.read();
    expect(r.head).toEqual({ world_version: '5', event_sequence: '7' });
    expect(r.frames).toHaveLength(5);
    expect(r.state.envelopes[0]?.lines).toHaveLength(1);
    expect(r.sourceBindings.map((s) => s.countryId)).toEqual([
      'COUNTRY_01',
      'COUNTRY_02',
      'COUNTRY_03',
    ]);
    expect(r.fundingAccounts).toHaveLength(3);
    expect(r.mixedPrefixEvidence).toBeDefined();
    expect(r.sourceBytes).toBeLessThan(
      BOUNDED_MIXED_OFFICE_LIMITS.totalCountryBytes,
    );
    expect(
      t.statements
        .filter((s) =>
          s.sql.includes('read_finance_budget_mixed_social_original'),
        )
        .map((s) => s.parameters[2]),
    ).toEqual(['COUNTRY_01', 'COUNTRY_02', 'COUNTRY_03']);
    expect(
      t.statements.every(
        (s) =>
          !s.sql.includes('opening_seed') &&
          !/insert|update|delete/iu.test(s.sql),
      ),
    ).toBe(true);
  });

  it('rejects a stale/oversized head and an actual posting without an FX canonical frame before issuing mixed calculation evidence', async () => {
    const data = await dataset(),
      t = transport(data);
    const read = t.executor.query;
    t.executor.query = async (sql, parameters) => {
      if (sql.includes('read_postwar_bounded_journal'))
        return {
          rows: [
            {
              ...data.head,
              financial_batch_count: '1',
              inventory_posting_count: '0',
              financial_batches: [
                {
                  causation_command_id: 'COMMAND_ORPHAN_TEST_ONLY',
                  canonical_payload: '{}',
                  fingerprint: 'sha256:' + '1'.repeat(64),
                },
              ],
            },
          ] as never[],
          rowCount: 1,
        };
      return read(sql, parameters);
    };
    await expect(t.read()).rejects.toThrow(
      'posting set differs from complete canonical prefix',
    );
    data.head.event_sequence = '257';
    await expect(t.read()).rejects.toThrow(
      'stale head or bounded replay capacity exceeded',
    );
  });
  it('recomputes Social effects rather than treating their zero postings as no-effect', async () => {
    const data = await dataset(),
      t = transport(data),
      row = t.rows.find((r) => r.event_type === C.SOCIAL_JOB_MATCH_EVENT)!;
    const event = data.frames
      .flatMap((f) => f.events)
      .find((e) => e.eventId === row.event_id)!;
    const payload = JSON.parse(event.canonicalPayload);
    payload.afterStateHash = 'sha256:' + '0'.repeat(64);
    const changed = C.parseAuthoritativeEvent(
      {
        schemaVersion: event.schemaVersion,
        eventId: event.eventId,
        eventType: event.eventType,
        worldId: event.worldId,
        causationCommandId: event.causationCommandId,
        correlationId: event.correlationId,
        worldVersion: event.worldVersion,
        sequence: event.sequence,
        simTime: event.simTime.toCanonicalValue(),
        recordedAtReal: event.recordedAtReal,
        correctsEventId: event.correctsEventId,
        payload,
      },
      sha,
    );
    row.canonical_payload = changed.canonicalPayload;
    row.payload_sha256 = changed.payloadHash;
    row.event_fingerprint = changed.fingerprint;
    await expect(t.read()).rejects.toThrow();
  });
  it.each([
    'unknown',
    'missing',
    'receipt',
    'hash',
    'scope',
    'state',
    'overbook',
    'oversize',
  ] as const)(
    'rejects %s instead of degrading to Budget-only',
    async (variant) => {
      const data = await dataset(),
        t = transport(data);
      if (variant === 'unknown')
        t.rows[4]!.event_type = 'UNRECOGNIZED_ECONOMIC_EVENT';
      if (variant === 'missing') t.rows.pop();
      if (variant === 'receipt')
        data.frames[2]!.receipt = {
          ...data.frames[2]!.receipt,
          outcome: 'REJECTED',
          reasonCode: 'TEST_ONLY',
        } as C.FinalCommandReceipt;
      if (variant === 'hash')
        t.rows[0]!.payload_sha256 = 'sha256:' + '0'.repeat(64);
      if (['scope', 'state', 'overbook', 'oversize'].includes(variant)) {
        const p = JSON.parse(t.originals.get('COUNTRY_01')!);
        if (variant === 'scope') p.admissionRef = 'ADMISSION_OTHER';
        if (variant === 'state') p.state.plans = [{}];
        if (variant === 'overbook')
          p.fundingAccounts[0].availableAmount = '799';
        if (variant === 'oversize')
          p.padding = 'x'.repeat(BOUNDED_MIXED_OFFICE_LIMITS.countryBytes);
        t.originals.set('COUNTRY_01', JSON.stringify(p));
      }
      await expect(t.read()).rejects.toThrow();
    },
  );
  it('refuses a missing participant original, repeated account/claim, and cumulative source capacity overflow', async () => {
    for (const kind of ['missing', 'duplicate', 'total'] as const) {
      const data = await dataset(),
        t = transport(data);
      if (kind === 'missing') t.originals.delete('COUNTRY_02');
      if (kind === 'duplicate') {
        const a = JSON.parse(t.originals.get('COUNTRY_01')!),
          b = JSON.parse(t.originals.get('COUNTRY_02')!);
        b.fundingAccounts[0].claimId = a.fundingAccounts[0].claimId;
        t.originals.set('COUNTRY_02', JSON.stringify(b));
      }
      if (kind === 'total') {
        for (const id of ['COUNTRY_04', 'COUNTRY_05']) {
          const original = socialOriginal(id);
          const frame = socialFrame(
            original,
            String(data.frames.length),
            String(data.frames.flatMap((f) => f.events).length + 1),
          );
          data.frames.push(frame);
          data.sources.push(source(original));
        }
        data.head.world_version = '7';
        data.head.event_sequence = '9';
        const cumulative = transport(data);
        for (const [id, bytes] of cumulative.originals) {
          const original = JSON.parse(bytes);
          original.padding = 'x'.repeat(225000);
          cumulative.originals.set(id, JSON.stringify(original));
        }
        await expect(cumulative.read()).rejects.toThrow(
          'sealed country bytes/hash capacity mismatch',
        );
        continue;
      }
      await expect(t.read()).rejects.toThrow();
    }
  });
});
