/** Owned TEST_ONLY host installation on the already initialized genuine child.
 * No seed parse, Core proof issuance, genesis, consumer or Clock service here.
 * Source and policy DATA always come from that same live initializer. */
import {
  createHash,
  generateKeyPairSync,
  randomBytes,
  sign,
} from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Pool } from 'pg';
import * as C from '@econmind/core';
import type { FinanceNativeBudgetPolicy } from '@econmind/core/finance-budget-native';
import { validateFinanceNativeBudgetPolicy } from '@econmind/core/finance-budget-native';
import { PostgresSqlDatabase } from '../../apps/world-worker/src/persistence/postgres-sql-database.js';
import {
  publishWorldActorBindingFrom,
  publishWorldActorReaderScopeFrom,
  revokeWorldActorRegistryFrom,
} from '../../apps/world-api/src/integration/postgres-world-actor-registry.js';
import {
  loadPostwarIndustryFirstDayAdoptedPolicy,
  publishPostwarIndustryFirstDaySourceFrom,
} from '../../apps/world-worker/src/persistence/postwar-industry-first-day-source.js';
import { loadPostwarSourceContext as loadPostwarIndustryRuntimeSourceContext } from '../../apps/world-worker/src/preparation/postwar-source-context.js';
import { createPostwarIndustryProductionSource } from '../../apps/world-worker/src/persistence/postwar-industry-production-source.js';
import {
  createPostwarSocialRuntimeConnection,
  readPostwarSocialRuntimeFinancialReplayBase,
} from '../../apps/world-worker/src/runtime-preparation/social-runtime-connection.js';
import {
  loadPostwarIndustryUtilitySourceProposal,
  publishPostwarIndustryUtilitySourcesFrom,
  preparePostwarIndustryUtilitySource,
  retireUnownedPostwarIndustryUtilitySource,
} from '../../apps/world-worker/src/persistence/postwar-industry-utility-source.js';
import { publishPostwarIndustryPowerServiceSourceFrom } from '../../apps/world-worker/src/persistence/postwar-industry-power-service-publication.js';
import { publishPostwarPhysicalInventoryProvenanceFrom } from '../../apps/world-worker/src/persistence/postwar-physical-inventory-provenance.js';
import {
  installRegisteredFinalNativeSqlFrom,
  type prepareRegisteredFinalNativeSqlPlan,
} from '../../tools/office-connection/registered-final-native-sql.mjs';
import type { createPostwarBeneficialRentChildNativeFixture } from './postwar-beneficial-rent-child-native-fixture.js';
import { installRegisteredFinalChildH0From } from './registered-final-child-h0-readback.js';

type Fixture = Awaited<
  ReturnType<typeof createPostwarBeneficialRentChildNativeFixture>
>;
type Plan = Awaited<ReturnType<typeof prepareRegisteredFinalNativeSqlPlan>>;
const sha = (v: string) => createHash('sha256').update(v).digest('hex');
const ident = (v: string) => {
  if (!/^[a-z][a-z0-9_]{0,62}$/u.test(v))
    throw Error('OWNED_FIXED_ROLE_REQUIRED');
  return '"' + v + '"';
};
const record = (v: unknown): Record<string, unknown> => {
  if (!v || typeof v !== 'object' || Array.isArray(v))
    throw Error('ACTUAL_SOURCE_OBJECT_REQUIRED');
  return v as Record<string, unknown>;
};
const text = (v: unknown): string => {
  if (typeof v !== 'string' || v === '')
    throw Error('ACTUAL_SOURCE_STRING_REQUIRED');
  return v;
};
const records = (v: unknown) => {
  if (!Array.isArray(v)) throw Error('ACTUAL_SOURCE_ARRAY_REQUIRED');
  return v.map(record);
};
function socialLocator(
  scope: Record<string, unknown>,
  state: Record<string, unknown>,
) {
  const funding = records(scope.funding).filter((v) => v.payerRole === 'GOV');
  if (funding.length !== 1) throw Error('ACTUAL_UNIQUE_GOV_FUNDING_REQUIRED');
  const labour = record(state.labour),
    aggregates = records(labour.aggregates);
  const wage = records(scope.wages)
    .filter(
      (v) =>
        v.owner === 'PUBLIC_SERVICE' &&
        v.employerRole === 'GOV' &&
        v.employerId === funding[0]!.payerEntityId &&
        v.occupation === 'GENERAL' &&
        v.wagePeriod === 'SIM_YEAR' &&
        ['PUBLIC_SAFETY', 'PUBLIC_ADMINISTRATION'].includes(
          text(v.classificationId),
        ),
    )
    .sort((a, b) => text(a.positionId).localeCompare(text(b.positionId)))
    .find(
      (v) =>
        aggregates.some(
          (a) =>
            a.locationId === v.locationId &&
            a.skill === v.skill &&
            a.status === 'UNEMPLOYED_SEARCHING' &&
            BigInt(text(a.count)) > 0n,
        ) &&
        C.Money.from(text(funding[0]!.remainingAmount), text(v.wageCurrency))
          .amount.mul(360)
          .greaterThan(
            C.Money.from(text(v.wageAmount), text(v.wageCurrency)).amount,
          ),
    );
  if (!wage) throw Error('ACTUAL_VACANCY_WAGE_FUNDING_REQUIRED');
  const pools = records(state.servicePools).filter(
    (p) => p.locationId === wage.locationId && p.skill === wage.skill,
  );
  if (pools.length !== 1) throw Error('ACTUAL_UNIQUE_SERVICE_POOL_REQUIRED');
  const requiredWage = Object.fromEntries(
    [
      'locationId',
      'skill',
      'classificationId',
      'occupation',
      'positionId',
      'wageAmount',
      'wageCurrency',
      'wagePeriod',
    ].map((k) => [k, text(wage[k])]),
  ) as Record<
    | 'locationId'
    | 'skill'
    | 'classificationId'
    | 'occupation'
    | 'positionId'
    | 'wageAmount'
    | 'wageCurrency'
    | 'wagePeriod',
    string
  >;
  return Object.freeze({
    wage: Object.freeze(requiredWage),
    funding: Object.freeze({
      ...funding[0]!,
      accountRef: text(funding[0]!.accountRef),
    }),
    servicePoolId: text(pools[0]!.poolId),
  });
}
const countries = ['COUNTRY_01', 'COUNTRY_02'] as const;
type Country = (typeof countries)[number];

export async function createRegisteredFinalNodeSetup(input: {
  fixture: Fixture;
  repositoryRoot: string;
  sqlPlan: Plan;
  recordCommitted?: (
    receipt: Readonly<{ name: string; sha256: string; status: string }>,
  ) => Promise<void>;
}) {
  if (process.env.ECONMIND_REGISTERED_FINAL_NODE_NATIVE !== '1')
    throw Error('REGISTERED_FINAL_NATIVE_EXPLICIT_OPT_IN_REQUIRED');
  const f = input.fixture,
    m = f.marker;
  if (
    f.fixtureKind !== 'ACTUAL_REGISTERED_CHILD_H0_FIXTURE' ||
    m.seedFingerprint !==
      'sha256:cd6cd0825fd8b15c13dab28f030e2df24b804d5675e132ff77715a20ec67056a'
  )
    throw Error('LIVE_ACTUAL_INITIALIZED_CHILD_REQUIRED');
  const installedSources = Object.fromEntries(
    [...m.installedArtifacts, ...f.installedSql]
      .filter((v) => v.path.startsWith('database/proposals/'))
      .map((v) => [path.basename(v.path, '.sql'), v.sha256]),
  );
  const ddlReceipts = await installRegisteredFinalNativeSqlFrom({
    plan: input.sqlPlan,
    fixture: f,
    installedSources,
    recordCommitted: async (receipt: {
      name: string;
      sha256: string;
      status: string;
    }) => {
      await input.recordCommitted?.(receipt);
    },
  });
  const suffix = randomBytes(5).toString('hex'),
    uid = suffix.toUpperCase();
  const roles = Object.freeze({
    worker: f.workerRole,
    intake: f.intakeRole,
    read: 'final_read_' + suffix,
    source: 'final_social_' + suffix,
    publication: 'final_projection_pub_' + suffix,
    industryPublication: 'final_industry_pub_' + suffix,
    matchPublication: 'final_social_pub_' + suffix,
    actorPublication: 'final_actor_pub_' + suffix,
  });
  const workerId = 'WORKER_TEST_ONLY_REGISTERED_FINAL_' + uid;
  const subjects = Object.freeze({
    COUNTRY_01: m.subject,
    COUNTRY_02: '22222222-2222-4222-8222-222222222222',
  });
  const actors = Object.freeze({
    COUNTRY_01: 'ACTOR_TEST_ONLY_REGISTERED_C01_' + uid,
    COUNTRY_02: 'ACTOR_TEST_ONLY_REGISTERED_C02_' + uid,
  });
  const admin = new PostgresSqlDatabase(f.clone.installer),
    pools: Pool[] = [];
  const open = (user: string) => {
    const p = new Pool({
      host: m.socket,
      port: m.port,
      database: f.clone.database,
      user,
      password: async () => '',
      ssl: false,
      max: 1,
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 1000,
    });
    p.on('error', (error) => idleErrors.push(error.message));
    pools.push(p);
    return p;
  };
  const idleErrors: string[] = [];
  let closed: Promise<void> | undefined;
  const close = () =>
    (closed ??= (async () => {
      const results = await Promise.allSettled(pools.map((p) => p.end()));
      const errors = results
        .filter((v): v is PromiseRejectedResult => v.status === 'rejected')
        .map((v) => v.reason as unknown);
      if (errors.length)
        throw new AggregateError(
          errors,
          'REGISTERED_FINAL_SETUP_POOLS_CLOSE_FAILED',
        );
    })());
  try {
    // These are disposable test principals, never production enrollment. Keep
    // publishers separate; source group membership conveys no actor capability.
    for (const role of [
      roles.read,
      roles.source,
      roles.publication,
      roles.industryPublication,
      roles.matchPublication,
      roles.actorPublication,
    ])
      await f.clone.installer.query(
        'create role ' +
          ident(role) +
          ' login nosuperuser nobypassrls nocreatedb nocreaterole noreplication',
      );
    const w = ident(roles.worker),
      i = ident(roles.intake);
    await f.clone.installer.query(`
      grant usage on schema world_v2 to ${Object.values(roles).map(ident).join(',')};
      grant world_v2_postwar_projection_reader,world_v2_actor_registry_reader to ${ident(roles.read)};
      grant world_v2_social_source_reader to ${ident(roles.source)};
      grant world_v2_postwar_projection_publisher to ${ident(roles.publication)};
      grant world_v2_industry_source_publisher to ${ident(roles.industryPublication)};
      grant world_v2_social_source_publisher to ${ident(roles.matchPublication)};
      grant world_v2_actor_registry_publisher to ${ident(roles.actorPublication)};
      grant world_v2_social_source_reader,world_v2_finance_budget_source_reader,world_v2_day_one_fx_source_reader,world_v2_captain_source_reader,world_v2_cb_omo_source_reader,world_v2_beneficial_rent_source_reader,world_v2_postwar_narrow_trade_source,world_v2_industry_source_reader to ${w};
      grant world_v2_finance_budget_source_reader,world_v2_social_intake_lock_reader,world_v2_day_one_fx_source_reader,world_v2_captain_source_reader,world_v2_cb_omo_source_reader,world_v2_postwar_narrow_trade_source,world_v2_industry_source_reader to ${i};
      grant select on world_v2.world_head,world_v2.current_commit_authorization,world_v2.runtime_read_seat,world_v2.projection_entitlement,world_v2.runtime_opening_admission,world_v2.command_submission,world_v2.command_queue,world_v2.command_receipt,world_v2.authoritative_event,world_v2.financial_posting_batch,world_v2.inventory_posting,world_v2.authoritative_commit_authorization,world_v2.current_materialization,world_v2.notification_outbox,world_v2.world_writer_lease to ${w};
      grant insert on world_v2.command_submission,world_v2.command_queue,world_v2.command_receipt,world_v2.authoritative_event,world_v2.financial_posting_batch,world_v2.inventory_posting,world_v2.authoritative_commit_authorization,world_v2.notification_outbox,world_v2.current_materialization to ${w};
      grant update on world_v2.command_queue,world_v2.world_head,world_v2.current_materialization to ${w};
      grant update(command_id,actor_id)on world_v2.command_submission to ${w};
      grant update(renewed_at_real)on world_v2.world_writer_lease to ${w};
      grant execute on function world_v2.assert_world_writer_commit_guard(text,text,bigint,bigint,timestamptz),world_v2.lock_world_command_execution_registration(text,text,text),world_v2.industry_opening_inventory_batch_exists(text,text) to ${w};
      grant select on world_v2.world_head,world_v2.current_commit_authorization,world_v2.runtime_read_seat,world_v2.projection_entitlement,world_v2.runtime_opening_admission,world_v2.command_submission,world_v2.command_queue,world_v2.command_receipt to ${i};
      grant select(world_id,seed_id,seed_fingerprint,replay_binding)on world_v2.opening_seed to ${i};
      grant insert on world_v2.command_submission,world_v2.command_queue to ${i};
      grant update(command_id)on world_v2.command_submission to ${i};
      grant update(world_version)on world_v2.world_head to ${i};
      create policy final_lease_read_${suffix} on world_v2.world_writer_lease for select to ${w} using(world_id='${m.worldId}');
      create policy final_lease_lock_${suffix} on world_v2.world_writer_lease for update to ${w} using(world_id='${m.worldId}')with check(false);
    `);
    // The initializer deliberately makes these two logins NOINHERIT. Only
    // fixed existing adapter RPCs executed without a role switch are enrolled
    // directly; source DATA calls continue to SET ROLE the fixed reader.
    const directRpcEnrollment = [
      ...[
        'lock_finance_budget_current_authorization(text,uuid,text,text,text)',
        'lock_finance_budget_revoked_authorization(text,uuid,text,text)',
        'lock_postwar_day_one_fx_current_authorization(text,uuid,text,text,text)',
        'lock_postwar_day_one_fx_revoked_authorization(text,uuid,text,text)',
        'lock_postwar_captain_current_authorization(text,uuid,text,text,text)',
        'lock_postwar_captain_revoked_authorization(text,uuid,text,text)',
        'lock_postwar_central_bank_current_authorization(text,uuid,text,text,text)',
        'lock_postwar_central_bank_revoked_authorization(text,uuid,text,text)',
        'lock_postwar_industry_current_authorization(text,uuid,text,text,text)',
        'lock_postwar_industry_revoked_authorization(text,uuid,text,text)',
      ].map((signature) => ({
        role: roles.worker,
        signature: 'world_v2.' + signature,
      })),
      ...[
        'lock_finance_budget_intake_binding(text,uuid,text,text,text,text,text,text)',
        'lock_social_intake_binding(text,uuid,text,text,text,text,text,text)',
        'lock_postwar_day_one_fx_intake_binding(text,uuid,text,text,text,text,text,text)',
        'lock_postwar_captain_intake_binding(text,uuid,text,text,text,text,text,text)',
        'lock_postwar_central_bank_intake_binding(text,uuid,text,text,text,text,text,text)',
        'lock_postwar_trade_intake_binding(text,uuid,text,text,text,text,text,text)',
        'lock_postwar_industry_intake_binding(text,uuid,text,text,text,text,text,text)',
        'read_postwar_office_recovery_binding(text,uuid,text,text,text,text,text,text)',
        'read_postwar_captain_recovery_binding(text,uuid,text,text,text,text,text,text)',
        'read_postwar_central_bank_recovery_binding(text,uuid,text,text,text,text,text,text)',
        'read_postwar_trade_recovery_binding(text,uuid,text,text,text,text,text,text)',
        'read_postwar_industry_recovery_binding(text,uuid,text,text,text,text,text,text)',
      ].map((signature) => ({
        role: roles.intake,
        signature: 'world_v2.' + signature,
      })),
    ];
    for (const entry of directRpcEnrollment)
      await f.clone.installer.query(
        'grant execute on function ' +
          entry.signature +
          ' to ' +
          ident(entry.role),
      );
    const directRpcReadback = await f.clone.installer.query<{
      role: string;
      signature: string;
      can_execute: boolean;
      inherits: boolean;
    }>(
      "select x.role,x.signature,has_function_privilege(x.role,x.signature,'EXECUTE')can_execute,r.rolinherit as inherits from jsonb_to_recordset($1::jsonb)x(role text,signature text)join pg_roles r on r.rolname=x.role",
      [JSON.stringify(directRpcEnrollment)],
    );
    if (
      directRpcReadback.rows.length !== directRpcEnrollment.length ||
      directRpcReadback.rows.some((v) => !v.can_execute || v.inherits)
    )
      throw Error('EXACT_NOINHERIT_DIRECT_RPC_ENROLLMENT_REQUIRED');
    const acl = await f.clone.installer.query<{
      role: string;
      raw: boolean;
      auth_update: boolean;
      entitlement_update: boolean;
    }>(
      "select r as role,has_column_privilege(r,'world_v2.opening_seed','canonical_payload','SELECT')raw,has_column_privilege(r,'world_v2.current_commit_authorization','authorization_version','UPDATE')auth_update,has_column_privilege(r,'world_v2.projection_entitlement','active','UPDATE')entitlement_update from unnest($1::text[])r",
      [[roles.worker, roles.intake, roles.read, roles.source]],
    );
    if (
      acl.rows.length !== 4 ||
      acl.rows.some((r) => r.raw || r.auth_update || r.entitlement_update)
    )
      throw Error('ONLINE_RAW_OR_AUTHORITY_PRIVILEGE_FORBIDDEN');
    // A different TEST_ONLY identity is installed for C2. Reusing the C1 actor
    // across active countries would violate the actual coherent-seat protocol.
    await admin.transaction(async (tx) => {
      for (const [office, definition] of Object.entries(C.OFFICE_DEFINITIONS)) {
        for (const capability of definition.capabilities)
          await tx.query(
            "insert into world_v2.current_commit_authorization(world_id,auth_subject,country_id,office_id,capability,team_id,authorization_version,active,refreshed_at_real)values($1,$2::uuid,'COUNTRY_02',$3,$4,$5,'REV_1',true,clock_timestamp())",
            [m.worldId, subjects.COUNTRY_02, office, capability, m.team],
          );
        await tx.query(
          "insert into world_v2.runtime_read_seat(world_id,auth_subject,country_id,office_id,team_id,authorization_revision)values($1,$2::uuid,'COUNTRY_02',$3,$4,'REV_1')",
          [m.worldId, subjects.COUNTRY_02, office, m.team],
        );
        const scope =
          'OFFICE_' +
          Buffer.from('COUNTRY_02').toString('hex').toUpperCase() +
          '_' +
          Buffer.from(office).toString('hex').toUpperCase();
        await tx.query(
          "insert into world_v2.projection_entitlement(world_id,auth_subject,classification,scope_key,authorization_version,active,granted_at)values($1,$2::uuid,'OFFICE_PRIVATE',$3,'REV_1',true,clock_timestamp())",
          [m.worldId, subjects.COUNTRY_02, scope],
        );
      }
    });
    const normativeSha = sha(
      await readFile(
        path.join(input.repositoryRoot, 'specs/extracted/FINANCE.md'),
        'utf8',
      ),
    );
    if (
      normativeSha !==
      '6152e2c87a5545e1c354c8a6dbe8b948bbfcb3d396ef54624d9326d0bc1b8385'
    )
      throw Error('FIXED_FINANCE_NORMATIVE_BYTES_REQUIRED');
    const policies = {} as Record<Country, FinanceNativeBudgetPolicy>;
    const selectors = {} as Record<
      Country,
      Readonly<{
        countryId: Country;
        sourceSha256: string;
        capacity: Record<string, unknown>;
        scope: Record<string, unknown>;
        state: Record<string, unknown>;
      }>
    >;
    const locators = {} as Record<Country, ReturnType<typeof socialLocator>>;
    const captain = {} as Record<
      Country,
      Readonly<{ reasonFactRef: string; packetSha256: string }>
    >;
    for (const cid of countries) {
      const rows = f.financeSocialDerivation.countries.filter(
        (v) => v.countryId === cid,
      );
      if (
        rows.length !== 1 ||
        sha(rows[0]!.derivedText) !== rows[0]!.derivedSha256
      )
        throw Error('ACTUAL_CHILD_COUNTRY_DERIVATION_REQUIRED');
      const data = record(JSON.parse(rows[0]!.derivedText) as unknown),
        capacity = record(data.capacity),
        treasury = record(capacity.treasury),
        asset = record(treasury.assetAccount);
      if (
        data.seedFingerprint !== m.seedFingerprint ||
        data.worldId !== m.worldId ||
        data.countryId !== cid ||
        capacity.seedFingerprint !== m.seedFingerprint
      )
        throw Error('ACTUAL_CHILD_COUNTRY_PINS_REQUIRED');
      const policy: FinanceNativeBudgetPolicy = {
        schemaVersion: 'finance-native-budget-policy-v1',
        ruleRef: 'FINANCE_ORDINARY_SELF_ADMINISTRATION_FULL_V1',
        ruleRevision: 'TEST_ONLY_REGISTERED_FINAL_RULE_V1',
        sourceDocumentSHA256: 'sha256:' + normativeSha,
        normativeUnits: [
          'FINANCE-U0247',
          'FINANCE-U0252',
          'FINANCE-U0265',
          'FINANCE-U0295',
        ],
        worldId: m.worldId,
        countryId: cid,
        governmentEntityId: text(capacity.governmentEntityId),
        currency: text(asset.currency),
        envelopeRef: 'ENVELOPE_TEST_ONLY_FINAL_' + cid + '_' + uid,
        effectivePeriodRef: 'PERIOD_TEST_ONLY_FINAL_' + cid + '_' + uid,
        periodRevision: 'PERIOD_REV_TEST_ONLY_FINAL_' + cid + '_' + uid,
        validFromSimTime: '0',
        validUntilSimTime: '86400000',
        requestingOfficeId: 'FINANCE',
        programmeOwnerOfficeId: 'FINANCE',
        classification: 'ORDINARY_DEPARTMENTAL',
        funding: 'FULL_UNCONDITIONAL',
        requiredApprovalOffices: ['FINANCE'],
      };
      validateFinanceNativeBudgetPolicy(policy);
      policies[cid] = Object.freeze(policy);
      const actualCapacity = await f.clone.installer.query<{
        source_sha256: string;
        seed_fingerprint: string;
        admission_ref: string;
      }>(
        "select source_sha256,seed_fingerprint,admission_ref from world_v2.finance_budget_capacity_original where world_id=$1 and country_id=$2 and source_sha256=encode(sha256(convert_to(source_text,'UTF8')),'hex')",
        [m.worldId, cid],
      );
      if (
        actualCapacity.rows.length !== 1 ||
        actualCapacity.rows[0]!.seed_fingerprint !== m.seedFingerprint ||
        actualCapacity.rows[0]!.admission_ref !== m.admissionRef
      )
        throw Error('ACTUAL_PUBLISHED_CAPACITY_SHA_REQUIRED');
      selectors[cid] = Object.freeze({
        countryId: cid,
        sourceSha256: actualCapacity.rows[0]!.source_sha256,
        capacity,
        scope: record(data.scope),
        state: record(data.state),
      });
      locators[cid] = socialLocator(selectors[cid].scope, selectors[cid].state);
      const packetRows = await f.clone.installer.query<{
        packet_text: string;
        packet_sha256: string;
        seed_fingerprint: string;
        world_admission_ref: string;
      }>(
        'select packet_text,packet_sha256,seed_fingerprint,world_admission_ref from world_v2.captain_source_publication_registry where world_id=$1 and country_id=$2',
        [m.worldId, cid],
      );
      if (
        packetRows.rows.length !== 1 ||
        sha(packetRows.rows[0]!.packet_text) !==
          packetRows.rows[0]!.packet_sha256 ||
        packetRows.rows[0]!.seed_fingerprint !== m.seedFingerprint ||
        packetRows.rows[0]!.world_admission_ref !== m.admissionRef
      )
        throw Error('ACTUAL_ADOPTED_CAPTAIN_PACKET_REQUIRED');
      const reasons = records(
        record(JSON.parse(packetRows.rows[0]!.packet_text) as unknown).reasons,
      );
      if (reasons.length !== 1)
        throw Error('ACTUAL_ADOPTED_CAPTAIN_REASON_REQUIRED');
      captain[cid] = Object.freeze({
        reasonFactRef: text(reasons[0]!.factRef),
        packetSha256: packetRows.rows[0]!.packet_sha256,
      });
      const raw = C.canonicalSerialize(policy);
      // Explicit fixture registrar, not the whole-seed legacy SQL publisher.
      await f.clone.installer.query(
        'insert into world_v2.finance_budget_policy_original values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
        [
          'POLICY_TEST_ONLY_FINAL_' + cid + '_' + uid,
          m.worldId,
          cid,
          policy.envelopeRef,
          policy.effectivePeriodRef,
          m.seedFingerprint,
          m.admissionRef,
          'TEST_ONLY_ACTUAL_CHILD_BOUNDED_POLICY_REGISTRAR',
          raw,
          sha(raw),
          normativeSha,
        ],
      );
      await f.clone.installer.query(
        "insert into world_v2.social_operating_match_publisher select r.world_id,r.country_id,'SOCIAL_MATCH_GRANT_'||upper(q.hash),r.registration_ref,r.admission_ref,'world_v2_social_source_publisher','ACTOR_SOCIAL_MATCH_'||upper(q.hash),(substr(q.hash,1,8)||'-'||substr(q.hash,9,4)||'-4'||substr(q.hash,14,3)||'-a'||substr(q.hash,18,3)||'-'||substr(q.hash,21,12))::uuid,'SOCIAL_JOB_MATCH_RULE_V1',0,1,1 from world_v2.social_operating_source_registration r cross join lateral(select encode(sha256(convert_to(jsonb_build_array(r.world_id,r.country_id,r.registration_ref,'SOCIAL_JOB_MATCH_RULE_V1')::text,'UTF8')),'hex')hash)q where r.world_id=$1 and r.country_id=$2",
        [m.worldId, cid],
      );
    }
    const industryContext = await loadPostwarIndustryRuntimeSourceContext(
        input.repositoryRoot,
      ),
      adoptedPolicy = await loadPostwarIndustryFirstDayAdoptedPolicy(
        input.repositoryRoot,
      );
    const industryPublicationDatabase = new PostgresSqlDatabase(
      open(roles.industryPublication),
    );
    const industrySource = await industryPublicationDatabase.transaction(
      async (tx) => {
        await tx.query('set transaction isolation level repeatable read');
        await tx.query('set local role world_v2_industry_source_publisher');
        const session = await tx.query<{
          session_role: string;
          effective_role: string;
          safe: boolean;
          publisher_member: boolean;
          owner_member: boolean;
        }>(
          "select session_user::text session_role,current_setting('role')effective_role,not(rolsuper or rolbypassrls or rolcreaterole or rolcreatedb or rolreplication)safe,pg_has_role(session_user,'world_v2_industry_source_publisher','MEMBER')publisher_member,pg_has_role(session_user,'world_v2_industry_source_owner','MEMBER')owner_member from pg_roles where rolname=session_user",
        );
        if (
          session.rows.length !== 1 ||
          session.rows[0]?.session_role !== roles.industryPublication ||
          session.rows[0].effective_role !==
            'world_v2_industry_source_publisher' ||
          !session.rows[0].safe ||
          !session.rows[0].publisher_member ||
          session.rows[0].owner_member
        )
          throw Error('ACTUAL_SEPARATED_INDUSTRY_PUBLISHER_SESSION_REQUIRED');
        await writeFile(
          path.join(m.evidenceDirectory, 'industry-publisher-session.json'),
          JSON.stringify(session.rows[0], null, 2) + '\n',
        );
        const registration = await createPostwarIndustryProductionSource({
          sourceContext: industryContext,
          scope: { worldId: m.worldId, countryId: 'COUNTRY_02' },
          runtimeReaderRole: 'world_v2_industry_source_reader',
        }).registerFrom(tx);
        if (
          registration.rows.filter(
            (v) => v.facility_id === 'OPEN-02-REFINED_FUEL',
          ).length !== 1
        )
          throw Error('ACTUAL_C2_REFINERY_REGISTRATION_REQUIRED');
        return publishPostwarIndustryFirstDaySourceFrom(tx, {
          worldId: m.worldId,
          countryId: 'COUNTRY_02',
          facilityId: 'OPEN-02-REFINED_FUEL',
          adoptedPolicy,
          sourceContext: industryContext,
        });
      },
    );
    const h0 = await installRegisteredFinalChildH0From({
      fixture: f,
      seed: f.seed,
      preparation: f.preparation,
      derivation: f.financeSocialDerivation,
      countryIds: countries,
    });
    // The owned initializer publishes fixed source DATA before the registered
    // host starts. Startup itself never grants or invents a utility original.
    const utilitySocial = createPostwarSocialRuntimeConnection({
      worldId: m.worldId,
      workerId,
      workerPool: open(roles.worker),
      workerRole: roles.worker,
      openingAdoption: industryContext.labourSocial,
    });
    try {
      await utilitySocial.prepare({
        observedAtReal: new Date().toISOString(),
        admittedWorldPins: {
          worldId: m.worldId,
          seedRef: m.seedId,
          contentHash: m.seedFingerprint,
          admissionRef: m.admissionRef,
        },
        modelVersion: C.WORLD_MODEL_VERSION,
        startupSeed: f.seed,
        startupBeneficialHousingRentSource: f.preparation,
      });
      const proposal = await loadPostwarIndustryUtilitySourceProposal({
        repositoryRoot: input.repositoryRoot,
        socialConnection: utilitySocial,
        startupSeed: f.seed,
        startupBeneficialHousingRentSource: f.preparation,
      });
      await industryPublicationDatabase.transaction(async (tx) => {
        await tx.query('set transaction isolation level repeatable read');
        await tx.query('set local role world_v2_industry_source_publisher');
        await publishPostwarIndustryUtilitySourcesFrom(tx, { proposal });
      });
      // Reuse this real prepared Social source only for controlled immutable
      // staff-original publication. It issues no schedule, WORK, wage or power.
      const utilityPreparation = await preparePostwarIndustryUtilitySource({
        repositoryRoot: input.repositoryRoot,
        socialConnection: utilitySocial,
        startupSeed: f.seed,
        startupBeneficialHousingRentSource: f.preparation,
      });
      try {
        await new PostgresSqlDatabase(
          open(roles.industryPublication),
        ).transaction(async (tx) => {
          await tx.query('set transaction isolation level repeatable read');
          await tx.query('set local role world_v2_industry_source_publisher');
          await publishPostwarIndustryPowerServiceSourceFrom(tx, {
            baseline: readPostwarSocialRuntimeFinancialReplayBase(
              utilitySocial,
              m.worldId,
            ),
            preparation: utilityPreparation,
          });
        });
      } finally {
        retireUnownedPostwarIndustryUtilitySource(utilityPreparation);
      }
    } finally {
      await utilitySocial.close();
    }
    const inventoryProvenance = [];
    for (const countryId of countries)
      inventoryProvenance.push(
        await admin.transaction(async (tx) => {
          await tx.query('set transaction isolation level repeatable read');
          await tx.query(
            'set local role world_v2_postwar_projection_publisher',
          );
          await tx.query(
            'select world_v2.lock_postwar_source_revocation_fences($1)',
            [m.worldId],
          );
          return publishPostwarPhysicalInventoryProvenanceFrom(tx, {
            worldId: m.worldId,
            countryId,
            seedFingerprint: m.seedFingerprint,
            canonicalSeedSha256: f.financeSocialDerivation.canonicalSeedSha256,
            sourceBundleSha256: m.sourceBundleSha256,
            admissionRef: m.admissionRef,
          });
        }),
      );
    const release = new PostgresSqlDatabase(open(m.roles.registrarRole)),
      actorPool = open(roles.actorPublication);
    const actorRefs = {} as Record<
      Country,
      { bindingRef: string; scopeRef: string }
    >;
    const client = await actorPool.connect();
    try {
      await client.query('begin isolation level serializable');
      for (const cid of countries) {
        const refs = {
          bindingRef: 'BINDING_TEST_ONLY_FINAL_' + cid + '_' + uid,
          scopeRef: 'ACTOR_READER_TEST_ONLY_FINAL_' + cid + '_' + uid,
        };
        actorRefs[cid] = refs;
        await publishWorldActorBindingFrom(client, {
          worldId: m.worldId,
          authSubject: subjects[cid],
          actorId: actors[cid],
          bindingRef: refs.bindingRef,
          issuerRef: 'TEST_ONLY_NATIVE_ACTOR_REGISTRAR',
          originalSha256: sha(
            C.canonicalSerialize({
              classification: 'TEST_ONLY_ACTUAL_CHILD_ACTOR',
              worldId: m.worldId,
              countryId: cid,
              authSubject: subjects[cid],
              actorId: actors[cid],
            }),
          ),
        });
      }
      const scopeRef = 'ACTOR_READER_TEST_ONLY_FINAL_' + uid;
      await publishWorldActorReaderScopeFrom(client, {
        worldId: m.worldId,
        readerRole: roles.read,
        scopeRef,
        issuerRef: 'TEST_ONLY_NATIVE_ACTOR_REGISTRAR',
        originalSha256: sha(
          C.canonicalSerialize({
            classification: 'TEST_ONLY_ACTUAL_CHILD_READER',
            worldId: m.worldId,
            readerRole: roles.read,
          }),
        ),
      });
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
    const lease = await f.clone.installer.query(
      'select * from world_v2.acquire_world_writer_lease($1,$2,clock_timestamp(),3600000)',
      [m.worldId, workerId],
    );
    if (lease.rows.length !== 1)
      throw Error('ACTUAL_EXCLUSIVE_WRITER_LEASE_REQUIRED');
    let registrationRef: string | undefined,
      simTime = '0',
      generation = 0;
    const registerClock = async (next: string) => {
      if (
        !/^(0|[1-9][0-9]{0,18})$/u.test(next) ||
        BigInt(next) < BigInt(simTime) ||
        BigInt(next) > 86400000n
      )
        throw Error('FINITE_ADOPTED_FIRST_DAY_CLOCK_BOUND_REQUIRED');
      const tag = uid + '_' + ++generation,
        ref = 'EXECUTION_TEST_ONLY_FINAL_' + tag,
        clockRef = 'CLOCK_TEST_ONLY_FINAL_' + tag,
        controlRef = 'CONTROL_TEST_ONLY_FINAL_' + tag;
      const validFromReal = new Date(Date.now() - 300000).toISOString(),
        validUntilReal = new Date(Date.now() + 3600000).toISOString();
      const clockOriginal = C.canonicalSerialize({
        schemaVersion: 'world-clock-original-v1',
        worldId: m.worldId,
        seedFingerprint: m.seedFingerprint,
        sourceRef: clockRef,
        clockVersion: 'SIMULATION_CLOCK_V1',
        simTime: next,
        issuerRef: 'TEST_ONLY_NATIVE_EXECUTION_REGISTRAR',
        provenanceRef: 'TEST_ONLY_FINITE_ISOLATED_FIRST_DAY_NO_CLOCK_SERVICE',
      });
      const controlOriginal = C.canonicalSerialize({
        schemaVersion: 'world-execution-control-original-v1',
        worldId: m.worldId,
        seedFingerprint: m.seedFingerprint,
        sourceRef: controlRef,
        controlMode: 'MANUAL_FINITE',
        soleConsumerRef: 'SOLE_TEST_ONLY_FINAL_' + tag,
        workerId,
        consumerRole: roles.worker,
        validFromReal,
        validUntilReal,
        issuerRef: 'TEST_ONLY_NATIVE_EXECUTION_REGISTRAR',
        provenanceRef: 'TEST_ONLY_NEW_IMMUTABLE_FINITE_REGISTRATION_NO_DAEMON',
      });
      const registration = {
        schemaVersion: 'world-command-execution-registration-v1',
        registrationRef: ref,
        worldId: m.worldId,
        workerId,
        seedId: m.seedId,
        seedFingerprint: m.seedFingerprint,
        admissionRef: m.admissionRef,
        modelVersion: C.WORLD_MODEL_VERSION,
        consumerRole: roles.worker,
        controlMode: 'MANUAL_FINITE',
        clockSourceRef: clockRef,
        clockSourceSha256: sha(clockOriginal),
        controlSourceRef: controlRef,
        controlSourceSha256: sha(controlOriginal),
        soleConsumerRef: 'SOLE_TEST_ONLY_FINAL_' + tag,
        clockVersion: 'SIMULATION_CLOCK_V1',
        simTime: next,
        validFromReal,
        validUntilReal,
      };
      await release.transaction(async (tx) => {
        await tx.query('set local role world_v2_admission_release');
        if (registrationRef)
          await tx.query(
            'select world_v2.revoke_world_command_execution($1,$2,$3)',
            [
              m.worldId,
              registrationRef,
              'TEST_ONLY_FINITE_CLOCK_GENERATION_RETIRED',
            ],
          );
        const raw = C.canonicalSerialize(registration);
        await tx.query(
          'select world_v2.register_world_command_execution($1,$2,$3,$4)',
          [raw, sha(raw), clockOriginal, controlOriginal],
        );
      });
      registrationRef = ref;
      simTime = next;
      return Object.freeze(registration);
    };
    const initialRegistration = await registerClock('0');
    const keys = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }),
      kid = 'EPHEMERAL_TEST_ONLY_REGISTERED_FINAL_' + uid;
    const jwks = {
      keys: [
        {
          ...keys.publicKey.export({ format: 'jwk' }),
          kid,
          alg: 'ES256',
          use: 'sig',
          key_ops: ['verify'],
        },
      ],
    };
    const issuer = 'https://abcdefghijklmnopqrst.supabase.co/auth/v1',
      configuration = {
        readerRole: roles.read,
        authorizationPublisherRole: m.roles.authorizationPublisherRole,
        modelVersion: C.WORLD_MODEL_VERSION,
        endpointPins: {
          origin: 'https://registered-final-test.example',
          projectionPath: '/v1/postwar-office-runtime',
          finalLookupPath: '/v1/final-receipt',
          deploymentRef: 'TEST_ONLY_REGISTERED_CHILD_FINAL',
        },
        admittedWorldPins: {
          worldId: m.worldId,
          seedRef: m.seedId,
          contentHash: m.seedFingerprint,
          admissionRef: m.admissionRef,
          minimumWorldVersion: '0',
        },
        auth: {
          projectRef: 'abcdefghijklmnopqrst',
          expectedIssuer: issuer,
          jwksUrl: issuer + '/.well-known/jwks.json',
          audience: 'authenticated',
        },
        routeOptions: { allowedOrigins: ['https://pages-test.example'] },
      };
    const descriptor = {
      schemaVersion: 'test-only-registered-final-child-host-v1',
      repositoryRoot: input.repositoryRoot,
      worldId: m.worldId,
      seedId: m.seedId,
      seedFingerprint: m.seedFingerprint,
      admissionRef: m.admissionRef,
      socket: m.socket,
      port: m.port,
      database: f.clone.database,
      workerId,
      workerRole: roles.worker,
      readRole: roles.read,
      intakeRole: roles.intake,
      sourceRole: roles.source,
      publicationRole: roles.publication,
      industryPublicationRole: roles.industryPublication,
      matchPublicationRole: roles.matchPublication,
      authorizationPublisherRole: m.roles.authorizationPublisherRole,
      registrationRef: initialRegistration.registrationRef,
      seedFile: m.seedFile,
      seedFileSHA256: m.seedFileSha256,
      countries: countries.map((cid) => ({
        countryId: cid,
        expectedRawSourceSHA256: selectors[cid].sourceSha256,
      })),
      configuration,
      jwks,
      install: {
        centralBankOmo: true,
        trade: true,
        industry: true,
        industryUtilities: true,
      },
      beneficialRent: {
        parentSeedPath:
          '/workspace/.cloud-setup/evidence/postwar-gcu-opening-fresh-20261029T020748Z/final-seed.json',
        parentSeedFileSha256:
          'ee2f777126e9050ce7139e2d9d9e24d2ec7305de95b8380d3e4c35fc4edb314f',
        receiptsPath: path.join(path.dirname(m.seedFile), 'receipts.json'),
        receiptsFileSha256:
          '7d37e721da1021b290d8a1464e4fec096046efe623c2a5d12ee719a28fba5ae6',
        clockBindingRef: initialRegistration.clockSourceRef,
      },
    };
    const counts = async () => {
      const result = await f.clone.installer.query<{
        worldVersion: string;
        eventSequence: string;
        commands: string;
        receipts: string;
        events: string;
        batches: string;
        inventory: string;
        queues: string;
      }>(
        'select h.world_version::text as "worldVersion",h.event_sequence::text as "eventSequence",(select count(*)::text from world_v2.command_submission where world_id=$1)commands,(select count(*)::text from world_v2.command_receipt where world_id=$1)receipts,(select count(*)::text from world_v2.authoritative_event where world_id=$1)events,(select count(*)::text from world_v2.financial_posting_batch where world_id=$1)batches,(select count(*)::text from world_v2.inventory_posting where world_id=$1)inventory,(select count(*)::text from world_v2.command_queue where world_id=$1)queues from world_v2.world_head h where h.world_id=$1',
        [m.worldId],
      );
      if (result.rows.length !== 1)
        throw Error('ACTUAL_SINGLE_WORLD_HEAD_REQUIRED');
      return result.rows[0]!;
    };
    const initial = await counts();
    if (Object.values(initial).some((v) => v !== '0'))
      throw Error('NEW_HOST_SETUP_REQUIRES_UNTOUCHED_H0');
    const issueToken = (subject: string) => {
      const now = Math.floor(Date.now() / 1000),
        head = Buffer.from(
          JSON.stringify({ alg: 'ES256', typ: 'JWT', kid }),
        ).toString('base64url'),
        body = Buffer.from(
          JSON.stringify({
            iss: issuer,
            aud: 'authenticated',
            sub: subject,
            iat: now,
            exp: now + 3600,
          }),
        ).toString('base64url'),
        input = head + '.' + body;
      return (
        input +
        '.' +
        sign('sha256', Buffer.from(input), {
          key: keys.privateKey,
          dsaEncoding: 'ieee-p1363',
        }).toString('base64url')
      );
    };
    return Object.freeze({
      fixture: f,
      descriptor: Object.freeze(descriptor),
      roles,
      workerId,
      subjects,
      actors,
      policies: Object.freeze(policies),
      selectors: Object.freeze(selectors),
      locators: Object.freeze(locators),
      captain: Object.freeze(captain),
      industrySource,
      h0,
      inventoryProvenance,
      initial,
      ddlReceipts,
      acl: acl.rows,
      directRpcEnrollment: directRpcReadback.rows,
      idleErrors,
      counts,
      close,
      signToken(cid: Country = 'COUNTRY_01') {
        return issueToken(subjects[cid]);
      },
      signUnassignedToken() {
        return issueToken('99999999-9999-4999-8999-999999999999');
      },
      async rotateFiniteClock(
        request: Readonly<{ simTime: string; previousHostStopped: true }>,
      ) {
        if (request.previousHostStopped !== true)
          throw Error('COLD_HOST_STOP_REQUIRED');
        const sessions = await f.clone.installer.query<{ count: string }>(
          'select count(*)::text count from pg_stat_activity where datname=$1 and usename=any($2::text[])',
          [
            f.clone.database,
            [
              roles.worker,
              roles.intake,
              roles.source,
              roles.read,
              roles.publication,
              roles.industryPublication,
              roles.matchPublication,
            ],
          ],
        );
        if (sessions.rows[0]?.count !== '0')
          throw Error(
            'ACTUAL_RUNTIME_CONNECTIONS_MUST_BE_DRAINED_BEFORE_NEW_FINITE_REGISTRATION',
          );
        const registration = await registerClock(request.simTime);
        return Object.freeze({
          ...descriptor,
          registrationRef: registration.registrationRef,
          beneficialRent: Object.freeze({
            ...descriptor.beneficialRent,
            clockBindingRef: registration.clockSourceRef,
          }),
        });
      },
      async revokeExecution() {
        await release.transaction(async (tx) => {
          await tx.query('set local role world_v2_admission_release');
          await tx.query(
            'select world_v2.revoke_world_command_execution($1,$2,$3)',
            [m.worldId, registrationRef, 'TEST_ONLY_FINAL_EXECUTION_REVOKED'],
          );
        });
      },
      async revokeActor(cid: Country) {
        const c = await actorPool.connect();
        try {
          await c.query('begin');
          await revokeWorldActorRegistryFrom(c, 'BINDING', {
            worldId: m.worldId,
            targetRef: actorRefs[cid].bindingRef,
            revocationRef: 'ACTOR_REVOKE_TEST_ONLY_FINAL_' + cid + '_' + uid,
            issuerRef: 'TEST_ONLY_NATIVE_ACTOR_REGISTRAR',
            originalSha256: sha(
              C.canonicalSerialize({
                classification: 'TEST_ONLY_FINAL_ACTOR_REVOKED',
                worldId: m.worldId,
                countryId: cid,
                targetRef: actorRefs[cid].bindingRef,
              }),
            ),
          });
          await c.query('commit');
        } catch (e) {
          await c.query('rollback');
          throw e;
        } finally {
          c.release();
        }
      },
    });
  } catch (error) {
    try {
      await close();
    } catch (cleanup) {
      throw new AggregateError(
        [error, cleanup],
        'REGISTERED_FINAL_SETUP_FAILED_AND_POOL_CLEANUP_FAILED',
        { cause: cleanup },
      );
    }
    throw error;
  }
}
