/** TEST_ONLY small SQL custody fixture. Core-created source bytes and a real
 * ephemeral signature exercise SQL protocols; this is NOT full E03 genesis,
 * project Owner approval, OP mandate issuance or a production installation.
 * Importing this module opens no database or network connection. */
import { readFile } from 'node:fs/promises';
import { createHash, generateKeyPairSync, sign, verify } from 'node:crypto';
import * as C from '@econmind/core';
import { OPENING_PUBLICATION_SIGNATURE_DOMAIN } from '../../apps/world-worker/src/admission/private-opening-admission-authority.js';
export const narrowCutoffSha = (s: string) =>
  createHash('sha256').update(s).digest('hex');
export interface NarrowTradeTestDatabase {
  exec(sql: string): Promise<unknown>;
  query<T extends object = Record<string, unknown>>(
    sql: string,
    args?: unknown[],
  ): Promise<{ rows: T[] }>;
}
const read = (p: string) =>
  readFile(new URL('../../' + p, import.meta.url), 'utf8');
export async function installPostwarNarrowTradeCutoffFixture(
  db: NarrowTradeTestDatabase,
) {
  const sha = narrowCutoffSha,
    world = 'WORLD_TEST_ONLY_TRADE_CUTOFF',
    seller = 'COUNTRY_01',
    buyer = 'COUNTRY_02',
    subject = '00000000-0000-4000-8000-000000000001',
    readerRole = 'test_narrow_current_reader',
    publisher = 'world_v2_opening_admission_test_narrow',
    team = 'TEAM_TEST_ONLY_TRADE',
    revision = 'REV_TEST_ONLY_1';
  for (const id of [
    '0001_world_v2_namespace',
    '0002_world_v2_command_event_ledger',
    '0003_world_v2_command_receipts_outbox',
    '0007_world_v2_atomic_transition_facts',
    '0009_world_v2_posting_payload_integrity',
    '0011_world_v2_current_commit_authorization',
    '0013_world_v2_read_projection_boundary',
    '0016_world_v2_opening_seed',
  ])
    await db.exec(await read('database/migrations/artifacts/' + id + '.sql'));
  for (const proposal of [
    'runtime-read-binding-storage',
    'runtime-admission-publication',
    'postwar-office-derived-read',
    'postwar-day-one-fx-custody',
    'postwar-narrow-trade-source',
    'postwar-narrow-trade-current-source',
  ]) {
    // Native cluster roles are shared across its owned databases. Reuse safe
    // pre-existing fixed role names without granting memberships or changing
    // attributes; every real candidate function/table/policy remains verbatim.
    let sql = await read('database/proposals/' + proposal + '.sql');
    sql = sql.replace(
      /^create role ([a-z0-9_]+) nologin nosuperuser nobypassrls nocreatedb nocreaterole noreplication;/gmu,
      (_, role: string) =>
        `do $$begin if not exists(select 1 from pg_roles where rolname='${role}')then create role ${role} nologin nosuperuser nobypassrls nocreatedb nocreaterole noreplication;end if;if exists(select 1 from pg_roles where rolname='${role}'and(rolcanlogin or rolsuper or rolbypassrls or rolcreatedb or rolcreaterole or rolreplication))then raise exception 'UNSAFE_TEST_ROLE_REUSE';end if;end;$$;`,
    );
    await db.exec(sql);
  }
  const rights = C.createOpeningSource(
    {
      schemaVersion: C.OPENING_SOURCE_SCHEMA_VERSION,
      sourceId: C.openingSourceId('SOURCE_TEST_ONLY_TRADE_RIGHTS'),
      sourceKind: 'TEST_FIXTURE',
      sourceVersion: 'TEST_ONLY_V1',
      locator: 'TEST_ONLY_NOT_OWNER_APPROVAL',
      payload: {
        schemaVersion: 'postwar-narrow-trade-operating-rights-v1',
        worldId: world,
        records: [
          {
            kind: 'OWNER_TRANSFER_MANDATE',
            countryId: seller,
            ownerId: 'ENTITY_TEST_ONLY_BANK_1',
            authSubject: subject,
            batchId: 'BATCH_TEST_ONLY_GRAIN',
            buyerCountryId: buyer,
            commodityId: 'GRAIN',
            unit: 'tonne',
            maximumQuantity: '1',
            effectiveFromSimTime: '0',
            effectiveUntilSimTime: null,
            revokedByRevision: null,
          },
          {
            kind: 'CROSS_BORDER_ROUTE',
            fromCountryId: seller,
            toCountryId: buyer,
            commodityId: 'GRAIN',
            unit: 'tonne',
            maximumQuantity: '1',
            effectiveFromSimTime: '0',
            effectiveUntilSimTime: null,
            revokedByRevision: null,
          },
        ],
      },
    },
    sha,
  );
  const financial = C.createOpeningSource(
    {
      schemaVersion: C.OPENING_SOURCE_SCHEMA_VERSION,
      sourceId: C.openingSourceId('SOURCE_TEST_ONLY_TRADE_FINANCIAL'),
      sourceKind: 'TEST_FIXTURE',
      sourceVersion: 'TEST_ONLY_V1',
      locator: 'TEST_ONLY_SQL_NOT_ECONOMIC_APPROVAL',
      payload: {
        schemaVersion: 'adopted-financial-opening-source-v2',
        assembly: {
          countries: [
            {
              countryId: seller,
              roster: { government: 'ENTITY_TEST_ONLY_GOV_1' },
            },
            {
              countryId: buyer,
              roster: { government: 'ENTITY_TEST_ONLY_GOV_2' },
            },
          ],
        },
      },
    },
    sha,
  );
  const operating = C.createOpeningSource(
    {
      schemaVersion: C.OPENING_SOURCE_SCHEMA_VERSION,
      sourceId: C.openingSourceId('SOURCE_TEST_ONLY_TRADE_OPERATING'),
      sourceKind: 'TEST_FIXTURE',
      sourceVersion: 'TEST_ONLY_V1',
      locator: 'TEST_ONLY_SQL_NOT_FULL_E03',
      payload: {
        schemaVersion: 'postwar-operating-genesis-seed-source-v1',
        carrier: {
          socialEmployment: {
            countries: [{ countryId: seller }, { countryId: buyer }],
          },
        },
      },
    },
    sha,
  );
  const account = C.createInventoryAccount({
    worldId: C.worldId(world),
    countryId: C.countryId(seller),
    commodityId: C.commodityId('GRAIN'),
    batchId: C.inventoryBatchId('BATCH_TEST_ONLY_GRAIN'),
    unit: 'tonne',
    physicalLocationId: C.inventoryLocationId('LOCATION_TEST_ONLY_GRAIN'),
    bucket: 'AVAILABLE',
    reservationId: null,
    shipmentId: null,
    titleHolderId: C.legalEntityId('ENTITY_TEST_ONLY_BANK_1'),
    riskBearerId: C.legalEntityId('ENTITY_TEST_ONLY_BANK_1'),
    economicRecognitionId: null,
  });
  const seed = C.createOpeningSeed(
    {
      schemaVersion: C.OPENING_SEED_SCHEMA_VERSION,
      seedId: C.openingSeedId('SEED_TEST_ONLY_TRADE_CUTOFF'),
      worldId: C.worldId(world),
      openingWorldVersion: '0',
      replayBinding: C.CURRENT_REPLAY_BINDING,
      sources: [financial, operating],
      inventoryEntries: [
        {
          entryId: C.openingInventoryEntryId('ENTRY_TEST_ONLY_GRAIN'),
          sourceId: financial.sourceId,
          account,
          quantity: C.Quantity.from('1', 'tonne'),
        },
      ],
      financialBatches: [
        {
          batchId: C.financialOpeningBatchId('OPENING_TEST_ONLY_GCU'),
          sourceId: financial.sourceId,
          settlementCurrency: 'GCU',
          legs: [
            {
              legId: C.financialOpeningLegId('OPENING_BANK_CASH'),
              counterpartLegId: C.financialOpeningLegId('OPENING_BANK_EQUITY'),
              account: C.createFinancialAccount({
                worldId: C.worldId(world),
                countryId: C.countryId(seller),
                accountId: C.financialAccountId('ACCOUNT_TEST_ONLY_BANK_CASH'),
                ownerId: C.legalEntityId('ENTITY_TEST_ONLY_BANK_1'),
                accountClass: 'CASH',
                currency: 'GCU',
                claimId: null,
                counterpartyEntityId: null,
              }),
              direction: 'DEBIT',
              amount: C.Money.from('1', 'GCU'),
            },
            {
              legId: C.financialOpeningLegId('OPENING_BANK_EQUITY'),
              counterpartLegId: C.financialOpeningLegId('OPENING_BANK_CASH'),
              account: C.createFinancialAccount({
                worldId: C.worldId(world),
                countryId: C.countryId(seller),
                accountId: C.financialAccountId(
                  'ACCOUNT_TEST_ONLY_BANK_EQUITY',
                ),
                ownerId: C.legalEntityId('ENTITY_TEST_ONLY_BANK_1'),
                accountClass: 'EQUITY',
                currency: 'GCU',
                claimId: null,
                counterpartyEntityId: null,
              }),
              direction: 'CREDIT',
              amount: C.Money.from('1', 'GCU'),
            },
            {
              legId: C.financialOpeningLegId('OPENING_GOV_CASH'),
              counterpartLegId: C.financialOpeningLegId('OPENING_GOV_EQUITY'),
              account: C.createFinancialAccount({
                worldId: C.worldId(world),
                countryId: C.countryId(buyer),
                accountId: C.financialAccountId('ACCOUNT_TEST_ONLY_GOV_CASH'),
                ownerId: C.legalEntityId('ENTITY_TEST_ONLY_GOV_2'),
                accountClass: 'CASH',
                currency: 'GCU',
                claimId: null,
                counterpartyEntityId: null,
              }),
              direction: 'DEBIT',
              amount: C.Money.from('1', 'GCU'),
            },
            {
              legId: C.financialOpeningLegId('OPENING_GOV_EQUITY'),
              counterpartLegId: C.financialOpeningLegId('OPENING_GOV_CASH'),
              account: C.createFinancialAccount({
                worldId: C.worldId(world),
                countryId: C.countryId(buyer),
                accountId: C.financialAccountId('ACCOUNT_TEST_ONLY_GOV_EQUITY'),
                ownerId: C.legalEntityId('ENTITY_TEST_ONLY_GOV_2'),
                accountClass: 'EQUITY',
                currency: 'GCU',
                claimId: null,
                counterpartyEntityId: null,
              }),
              direction: 'CREDIT',
              amount: C.Money.from('1', 'GCU'),
            },
          ],
        },
      ],
    },
    sha,
  );
  const { fingerprint, ...intent } = seed,
    intentBytes = C.canonicalSerialize(intent),
    canonicalSeedSha256 = sha(intentBytes),
    sourceBundleSha256 = '1'.repeat(64);
  await db.query('insert into world_v2.world_head values($1,0,0)', [world]);
  await db.query(
    'insert into world_v2.opening_seed values($1,$2,0,$3,$4,$5,now())',
    [
      world,
      seed.seedId,
      C.canonicalSerialize(seed.replayBinding),
      intentBytes,
      fingerprint,
    ],
  );
  await db.exec(
    `create role ${readerRole} nologin inherit nosuperuser nobypassrls nocreatedb nocreaterole noreplication;grant world_v2_postwar_narrow_trade_source to ${readerRole};grant usage on schema world_v2 to ${readerRole};create role ${publisher} nologin nosuperuser nobypassrls nocreatedb nocreaterole noreplication;grant usage on schema world_v2 to ${publisher};grant execute on function world_v2.publish_runtime_admission_publication(text,text,text)to ${publisher};`,
  );
  const at = Date.now(),
    keys = generateKeyPairSync('ed25519'),
    claims = {
      schemaVersion: 'opening-publication-authorization-v1',
      purpose: 'AUTHORIZE_OFFICIAL_OPENING_ADMISSION_PUBLICATION',
      authorizationId: 'AUTHORIZATION_TEST_ONLY_TRADE',
      keyId: 'TEST_ONLY_EPHEMERAL_TRADE_KEY',
      ownerIdentity: 'TEST_ONLY_NOT_PROJECT_OWNER',
      issuedAtReal: new Date(at - 60000).toISOString(),
      expiresAtReal: new Date(at + 3600000).toISOString(),
      worldId: world,
      seedId: seed.seedId,
      seedFingerprint: seed.fingerprint,
      modelVersion: seed.replayBinding.modelVersion,
      replayBinding: C.canonicalSerialize(seed.replayBinding),
      sourceBundleSha256,
    };
  const canonical = C.canonicalSerialize(claims),
    signature = sign(
      null,
      Buffer.from(OPENING_PUBLICATION_SIGNATURE_DOMAIN + canonical),
      keys.privateKey,
    );
  if (
    !verify(
      null,
      Buffer.from(OPENING_PUBLICATION_SIGNATURE_DOMAIN + canonical),
      keys.publicKey,
      signature,
    )
  )
    throw Error('ACTUAL_TEST_SIGNATURE_FAILED');
  await db.exec('set role world_v2_admission_release');
  await db.query(
    'insert into world_v2.runtime_admission_publication_permit(authorization_id,authorization_sha256,canonical_authorization,signature_base64url,world_id,seed_id,seed_fingerprint,model_version,replay_binding,source_bundle_sha256,caller_session_role,valid_from,valid_until)values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',
    [
      claims.authorizationId,
      sha(canonical),
      canonical,
      signature.toString('base64url'),
      world,
      seed.seedId,
      seed.fingerprint,
      claims.modelVersion,
      claims.replayBinding,
      sourceBundleSha256,
      publisher,
      claims.issuedAtReal,
      claims.expiresAtReal,
    ],
  );
  await db.exec('reset role;set session authorization ' + publisher);
  await db.query(
    'select world_v2.publish_runtime_admission_publication($1,$2,$3)',
    [claims.authorizationId, sha(canonical), sourceBundleSha256],
  );
  await db.exec('reset role;set session authorization postgres');
  const admissionRef = 'ADMISSION_' + sha(canonical).toUpperCase();
  await db.query(
    "insert into world_v2.current_commit_authorization values($1,$2::uuid,$3,'TRADE','TRADE_CONTRACTS',$4,$5,true,now())",
    [world, subject, seller, team, revision],
  );
  await db.query(
    "insert into world_v2.runtime_read_seat(world_id,auth_subject,country_id,office_id,team_id,authorization_revision)values($1,$2::uuid,$3,'TRADE',$4,$5)",
    [world, subject, seller, team, revision],
  );
  const scope =
    'OFFICE_' +
    Buffer.from(seller).toString('hex').toUpperCase() +
    '_' +
    Buffer.from('TRADE').toString('hex').toUpperCase();
  await db.query(
    "insert into world_v2.projection_entitlement values($1,$2::uuid,'OFFICE_PRIVATE',$3,$4,true,now(),null)",
    [world, subject, scope, revision],
  );
  await db.exec('set role world_v2_postwar_projection_publisher');
  await db.query(
    'select world_v2.publish_postwar_office_projection($1,$2,$3,$4,$5,$6,$7,$8)',
    [
      world,
      seller,
      'TRADE',
      'opening-inventory-entries',
      seed.fingerprint,
      canonicalSeedSha256,
      sourceBundleSha256,
      admissionRef,
    ],
  );
  await db.exec('reset role');
  const domainAdmissionRef = 'TEST_ONLY_RIGHTS_ADMISSION';
  await db.query(
    'insert into world_v2.postwar_narrow_trade_rights_admission values($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    [
      world,
      seed.fingerprint,
      rights.sourceId,
      rights.payloadHash,
      'TEST_ONLY_ISSUER_NOT_FORMAL_OWNER',
      'TEST_ONLY_CUSTODIAN',
      domainAdmissionRef,
      'TEST_ONLY_REV_1',
      '2'.repeat(64),
    ],
  );
  await db.query(
    'insert into world_v2.postwar_narrow_trade_current_original values($1,$2,$3,$4,$5)',
    [
      world,
      rights.sourceId,
      seed.fingerprint,
      rights.payloadHash,
      rights.canonicalPayload,
    ],
  );
  await db.exec(
    `create function world_v2.test_only_narrow_membership()returns table(country_id text,team_id text,authorization_version text)language sql security definer set search_path=pg_catalog as $$select a.country_id,a.team_id,a.authorization_version from world_v2.current_commit_authorization a where a.world_id='${world}'and a.auth_subject='${subject}'::uuid and a.office_id='TRADE'and a.capability='TRADE_CONTRACTS'and a.active$$;revoke all on function world_v2.test_only_narrow_membership()from public;grant execute on function world_v2.test_only_narrow_membership()to ${readerRole};`,
  );
  const params = [
    world,
    seller,
    buyer,
    account.batchId,
    subject,
    team,
    revision,
  ];
  const reset = async () => {
    await db.exec('rollback;reset role;set session authorization postgres');
  };
  const begin = async () => {
    await reset();
    await db.exec('set session authorization ' + readerRole);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      subject,
    ]);
    await db.exec('begin');
  };
  return {
    classification:
      'TEST_ONLY_SQL_CUSTODY_NOT_FULL_E03_OR_TRADE_ACCEPTANCE' as const,
    db,
    seed,
    rights,
    financial,
    account,
    world,
    seller,
    buyer,
    subject,
    team,
    revision,
    readerRole,
    admissionRef,
    domainAdmissionRef,
    params,
    begin,
    reset,
  };
}

/** Actual Core proof/candidate and actual SQL membership, never a copied brand.
 * The captured lifecycle callback writes nothing; final SQL/atomic execution is
 * a separate test assertion. This function requires an already opened fixture. */
export async function createPostwarNarrowTradeCutoffCandidate(
  f: Awaited<ReturnType<typeof installPostwarNarrowTradeCutoffFixture>>,
) {
  const Cx = C,
    sha = narrowCutoffSha,
    at = '2026-10-30T00:00:00.000Z';
  const command = Cx.parseCanonicalCommand(
    {
      schemaVersion: Cx.COMMAND_SCHEMA_VERSION,
      commandId: 'COMMAND_TEST_ONLY_TRADE_CUTOFF',
      commandType: 'CORE_GOODS_TRANSFER_V1',
      actorId: 'ACTOR_TEST_ONLY_TRADE',
      authSubject: f.subject,
      worldId: f.world,
      countryId: f.seller,
      officeId: 'TRADE',
      correlationId: 'CORRELATION_TEST_ONLY_TRADE',
      idempotencyKey: 'IDEM_TEST_ONLY_TRADE',
      expectedWorldVersion: '0',
      simTime: '0',
      submittedAtReal: at,
      payload: {
        schemaVersion: 'core-goods-transfer-v1',
        commodityId: 'GRAIN',
        sellerCountryId: f.seller,
        buyerCountryId: f.buyer,
        quantity: { amount: '1', unit: 'tonne' },
        price: { amount: '1', currency: 'GCU', perUnit: 'tonne' },
        threshold: {
          policyVersion: 'V10_TREASURY_GCU_THRESHOLD_V1',
          maxSettlement: { amount: '6', currency: 'GCU' },
        },
        assetSource: {
          batchId: f.account.batchId,
          physicalLocationId: f.account.physicalLocationId,
          titleHolderId: f.account.titleHolderId,
          riskBearerId: f.account.riskBearerId,
          economicRecognitionId: null,
        },
        paymentSource: 'BUYER_TREASURY_GCU',
        policyVersion: 'V10_TREASURY_GCU_V1',
        expiresAtReal: '2099-01-01T00:00:00.000Z',
      },
    },
    sha,
  );
  const subject = Cx.authSubject(f.subject);
  const authorization = await Cx.authorizeOfficeCapability({
    principal: {
      authSubject: subject,
      facts: { user_id: subject, display_name: null, school_id: null },
      token: {
        subject,
        issuer: 'TEST_ONLY_CUTOFF',
        audience: 'TEST_ONLY_CUTOFF',
        issuedAt: at,
        expiresAt: '2099-01-01T00:00:00.000Z',
      },
    },
    resolver: {
      resolveCurrentIdentity: async () => subject,
      resolveCurrentMembership: async () => {
        const r = await f.db.query<{
          country_id: string;
          team_id: string;
          authorization_version: string;
        }>('select * from world_v2.test_only_narrow_membership()');
        if (r.rows.length !== 1) return null;
        const m = r.rows[0]!;
        return {
          authSubject: subject,
          worldId: Cx.worldId(f.world),
          countryId: Cx.countryId(m.country_id),
          teamId: Cx.teamId(m.team_id),
          authorizationVersion: m.authorization_version,
          officeAssignments: [Cx.officeId('TRADE')],
          active: true,
          suspended: false,
          isWorldAdmin: false,
          negotiationPartyIds: [],
        };
      },
    },
    worldId: Cx.worldId(f.world),
    requestedCountryId: Cx.countryId(f.seller),
    requestedOfficeId: Cx.officeId('TRADE'),
    capability: 'TRADE_CONTRACTS',
  });
  const event = Cx.parseAuthoritativeEvent(
    {
      schemaVersion: Cx.EVENT_SCHEMA_VERSION,
      eventId: 'EVENT_TEST_ONLY_TRADE_CUTOFF',
      eventType: 'NARROW_TREASURY_GCU_RESERVED_V1',
      worldId: f.world,
      causationCommandId: command.commandId,
      correlationId: command.correlationId,
      correctsEventId: null,
      worldVersion: '1',
      sequence: '1',
      simTime: '0',
      recordedAtReal: at,
      payload: {
        schemaVersion: 'narrow-treasury-gcu-reservation-event-v1',
        transferFingerprint: command.fingerprint,
      },
    },
    sha,
  );
  const transition = Cx.createAuthoritativeTransition({
    command,
    worldVersionBefore: '0',
    worldVersionAfter: '1',
    events: [event],
  });
  const posting = Cx.createReservationPosting(
    {
      schemaVersion: Cx.INVENTORY_POSTING_SCHEMA_VERSION,
      postingId: Cx.inventoryPostingId('POSTING_TEST_ONLY_TRADE_CUTOFF'),
      worldId: command.worldId,
      causationCommandId: command.commandId,
      causationEventIds: [event.eventId],
      worldVersionBefore: '0',
      worldVersionAfter: '1',
      simTime: command.simTime,
      command,
      transition,
      quantity: Cx.Quantity.from('1', 'tonne'),
      source: f.account,
      destination: Cx.createInventoryAccount({
        ...f.account,
        bucket: 'RESERVED',
        reservationId: Cx.inventoryReservationId(
          'RESERVATION_TEST_ONLY_TRADE_CUTOFF',
        ),
      }),
    },
    sha,
  );
  let proof: C.CommitAuthorizationProof | null = null;
  const sentinel = Error('TEST_ONLY_CAPTURE_GENUINE_PROOF');
  try {
    await Cx.processQueuedCommand({
      command,
      authorityKind: 'DISCRETIONARY_USER',
      requiredCapability: 'TRADE_CONTRACTS',
      intakeAuthorization: authorization,
      commitSimTime: command.simTime,
      recordedAtReal: at,
      persistence: {
        readFinalReceipt: async () => null,
        recordZeroEffectReceipt: async () => {
          throw Error('UNEXPECTED_ZERO_EFFECT');
        },
        commitAuthorizedCommand: async (input) => {
          proof = input.commitAuthorization;
          throw sentinel;
        },
      },
    });
  } catch (error) {
    if (error !== sentinel) throw error;
  }
  if (!Cx.isCommitAuthorizationProof(proof))
    throw Error('GENUINE_TEST_COMMIT_PROOF_REQUIRED');
  return {
    command,
    authorization,
    transition,
    posting,
    proof,
    at,
    head: { worldId: f.world, worldVersion: '0', eventSequence: '0' },
  };
}
