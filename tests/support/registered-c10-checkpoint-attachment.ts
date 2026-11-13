/** TEST_ONLY attachment to an existing owned checkpoint. No initialization,
 * source registration, new roles, economic command, Clock or WORK/PAY original.
 * Optional fixed opening-base repair only appends source-derived read data.
 * The old host must be drained. Missing actual C10 source is a hard failure. */
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Pool } from 'pg';
import { publishPostwarPhysicalInventoryProvenanceFrom } from '../../apps/world-worker/src/persistence/postwar-physical-inventory-provenance.js';
import { readRegisteredCurrentEconomicSnapshotFrom } from './registered-current-read-repair-checkpoint.js';
import type { PostwarNativeReferenceMarker } from './postwar-native-reference-db.js';
import type { createRegisteredFinalNodeSetup } from './registered-final-node-setup.js';
import {
  prepareRegisteredC10HttpActorFrom,
  createRegisteredUtilityFixtureTokenSigner,
} from './registered-c10-http-actor.js';
type BaseDescriptor = Awaited<
  ReturnType<typeof createRegisteredFinalNodeSetup>
>['descriptor'];
type Descriptor = Omit<BaseDescriptor, 'countries'> & {
  readonly countries: readonly {
    countryId: string;
    expectedRawSourceSHA256: string;
  }[];
};
const countries = ['COUNTRY_01', 'COUNTRY_02', 'COUNTRY_10'] as const;
/** Append-only existing opening-document repair. Requires an already sealed
 * prefix scope; it cannot manufacture that scope or relax the old H0 gate. */
async function repairC10OpeningBases(input: {
  marker: PostwarNativeReferenceMarker;
  clone: Readonly<{ database: string; installer: Pool }>;
  descriptor: Descriptor;
  canonicalSeedSha256: string;
}) {
  const { marker: m, clone, descriptor: d } = input;
  const sqlPath =
    'database/proposals/postwar-office-opening-read-base-repair.sql';
  const sql = await readFile(path.join(d.repositoryRoot, sqlPath), 'utf8');
  const sha = (v: string) => createHash('sha256').update(v).digest('hex');
  const sqlSha256 =
    '09dc298f358a2162fbd55db2e7bb4328f4a82ecd3cf9bfe81f8aa1bbbc83918b';
  assert.equal(sha(sql), sqlSha256, 'C10_EXACT_EXISTING_REPAIR_SQL_REQUIRED');
  const body = /as \$\$([\s\S]*?)\$\$;/.exec(sql)?.[1];
  assert(body, 'C10_EXACT_REPAIR_FUNCTION_BODY_REQUIRED');
  const signature =
    'world_v2.repair_postwar_office_opening_read_bases(text,text,text,text,text,text)';
  const catalog = async () =>
    (
      await clone.installer.query<{
        owner: string;
        language: string;
        body_sha256: string;
        security_definer: boolean;
        config: string[];
        args: string[];
        strict: boolean;
        volatility: string;
        parallel: string;
        result: string;
        readers: string[];
        delegable: boolean;
        defaults: number;
      }>(
        "select pg_get_userbyid(p.proowner)owner,l.lanname language,encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')body_sha256,p.prosecdef security_definer,p.proconfig config,p.proargnames args,p.proisstrict strict,p.provolatile volatility,p.proparallel parallel,pg_get_function_result(p.oid)result,(select coalesce(array_agg(case when a.grantee=0 then 'PUBLIC'else pg_get_userbyid(a.grantee)::text end order by case when a.grantee=0 then 'PUBLIC'else pg_get_userbyid(a.grantee)::text end),array[]::text[])from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))a where a.grantee<>p.proowner and a.privilege_type='EXECUTE')readers,(select coalesce(bool_or(a.is_grantable),false)from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))a where a.grantee<>p.proowner and a.privilege_type='EXECUTE')delegable,p.pronargdefaults defaults from pg_proc p join pg_language l on l.oid=p.prolang where p.oid=to_regprocedure($1)",
        [signature],
      )
    ).rows;
  const check = (rows: Awaited<ReturnType<typeof catalog>>) => {
    assert.equal(rows.length, 1, 'C10_REPAIR_FUNCTION_REQUIRED');
    assert.deepEqual(
      rows[0],
      {
        owner: 'world_v2_postwar_projection_owner',
        language: 'plpgsql',
        body_sha256: sha(body),
        security_definer: true,
        config: ['search_path=pg_catalog'],
        args: [
          'p_world',
          'p_country',
          'p_seed_fingerprint',
          'p_canonical_sha256',
          'p_bundle_sha256',
          'p_admission',
        ],
        strict: false,
        volatility: 'v',
        parallel: 'u',
        result: 'SETOF world_v2.postwar_office_projection_document',
        readers: ['world_v2_postwar_projection_publisher'],
        delegable: false,
        defaults: 0,
      },
      'C10_REPAIR_FUNCTION_BYTES_PROPERTIES_OR_ACL_DIFFER',
    );
  };
  const before = await readRegisteredCurrentEconomicSnapshotFrom(
    clone.installer,
    m.worldId,
  );
  let ddlStatus = 'EXISTING_EXACT_FUNCTION';
  const prior = await catalog();
  if (prior.length) check(prior);
  else {
    const installer = await clone.installer.connect();
    try {
      // Fixed reviewed SQL includes its own BEGIN/COMMIT. Never CREATE OR
      // REPLACE a different function, repair privileges, or retry uncertain DDL.
      await installer.query(sql);
      ddlStatus = 'DDL_COMMITTED_ACKNOWLEDGED';
    } catch (error) {
      try {
        await installer.query('rollback');
      } catch (rollback) {
        throw new AggregateError(
          [error, rollback],
          'C10_REPAIR_DDL_OUTCOME_REQUIRES_INSPECTION',
          { cause: rollback },
        );
      }
      throw error;
    } finally {
      installer.release();
    }
    check(await catalog());
  }
  const publisher = new Pool({
    host: m.socket,
    port: m.port,
    database: clone.database,
    user: d.publicationRole,
    password: async () => '',
    ssl: false,
    max: 1,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 1000,
  });
  const idleErrors: string[] = [];
  publisher.on('error', (error) => idleErrors.push(error.message));
  let published: unknown;
  try {
    const client = await publisher.connect();
    try {
      await client.query('begin isolation level repeatable read');
      await client.query(
        'set local role world_v2_postwar_projection_publisher',
      );
      await client.query("set local statement_timeout='120s'");
      const args = [
        m.worldId,
        'COUNTRY_10',
        m.seedFingerprint,
        input.canonicalSeedSha256,
        m.sourceBundleSha256,
        m.admissionRef,
      ];
      const docs = await client.query<Record<string, unknown>>(
        'select * from world_v2.repair_postwar_office_opening_read_bases($1,$2,$3,$4,$5,$6)',
        args,
      );
      assert.equal(
        docs.rows.length,
        13,
        'C10_EXACT_OPENING_DOCUMENT_SET_REQUIRED',
      );
      assert(
        docs.rows.every(
          (r) =>
            r.country_id === 'COUNTRY_10' &&
            String(r.world_version) === '0' &&
            String(r.event_sequence) === '0',
        ),
      );
      // Reuse the complete-inventory publication path; the repair's original
      // adopted-financial-source subset is not the child's complete inventory.
      const complete = await client.query(
        'select * from world_v2.publish_postwar_complete_opening_inventory($1,$2,$3,$4,$5,$6)',
        args,
      );
      assert.equal(
        complete.rows.length,
        2,
        'C10_COMPLETE_INDUSTRY_TRADE_INVENTORY_REQUIRED',
      );
      const provenance = await publishPostwarPhysicalInventoryProvenanceFrom(
        {
          async query<Row extends object>(
            text: string,
            values: readonly unknown[] = [],
          ) {
            const r = await client.query<Row>(text, [...values]);
            return { rows: r.rows, rowCount: r.rowCount };
          },
        },
        {
          worldId: m.worldId,
          countryId: 'COUNTRY_10',
          seedFingerprint: m.seedFingerprint,
          canonicalSeedSha256: input.canonicalSeedSha256,
          sourceBundleSha256: m.sourceBundleSha256,
          admissionRef: m.admissionRef,
        },
      );
      await client.query('commit');
      published = { documents: docs.rows, complete: complete.rows, provenance };
    } catch (error) {
      try {
        await client.query('rollback');
      } catch (rollback) {
        throw new AggregateError(
          [error, rollback],
          'C10_OPENING_REPAIR_OUTCOME_REQUIRES_INSPECTION',
          { cause: rollback },
        );
      }
      throw error;
    } finally {
      client.release();
    }
  } finally {
    await publisher.end();
  }
  assert.deepEqual(idleErrors, []);
  const after = await readRegisteredCurrentEconomicSnapshotFrom(
    clone.installer,
    m.worldId,
  );
  assert.deepEqual(
    after.economic,
    before.economic,
    'C10_OPENING_REPAIR_CHANGED_ECONOMIC_STATE',
  );
  return {
    classification: 'OPENING_BASES_NOT_CURRENT_CORE_READBACK',
    sqlPath,
    sqlSha256,
    ddlStatus,
    catalog: await catalog(),
    published,
    before,
    after,
  };
}
export async function attachRegisteredC10IndustryCheckpoint(input: {
  marker: PostwarNativeReferenceMarker;
  clone: Readonly<{ database: string; installer: Pool }>;
  descriptor: Descriptor;
  actorPublisherRole: string;
  previousHostStopped: true;
  /** Explicit append-only existing repair; missing prefix still rejects. */
  repairMissingOpeningBases?: true;
}) {
  assert.equal(process.env.ECONMIND_REGISTERED_FINAL_NODE_NATIVE, '1');
  assert.equal(input.previousHostStopped, true);
  const { marker: m, clone, descriptor: d } = input;
  assert.notEqual(clone.database, m.database);
  assert.match(clone.database, /^postwar_clone_[a-z0-9_]+$/u);
  assert.equal(d.database, clone.database);
  assert.equal(d.socket, m.socket);
  assert.equal(d.port, m.port);
  for (const key of [
    'worldId',
    'seedId',
    'seedFingerprint',
    'admissionRef',
  ] as const)
    assert.equal(d[key], m[key]);
  assert.match(input.actorPublisherRole, /^[a-z_][a-z0-9_]{0,62}$/u);
  const roles = [
    d.workerRole,
    d.readRole,
    d.intakeRole,
    d.sourceRole,
    d.publicationRole,
    d.industryPublicationRole,
    d.matchPublicationRole,
  ];
  for (const role of roles) assert.match(role, /^[a-z_][a-z0-9_]{0,62}$/u);
  // Existing setup pools retire idle clients after 1s; allow that bounded
  // drain without terminating sessions or treating a boolean as proof.
  let drained = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    const live = await clone.installer.query<{ count: string }>(
      'select count(*)::text count from pg_stat_activity where datname=$1 and usename=any($2::text[])',
      [clone.database, roles],
    );
    if (live.rows[0]?.count === '0') {
      drained = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert(drained, 'C10_OLD_HOST_AND_POOLS_MUST_BE_DRAINED');
  // Obtain actual immutable capacity pins before any identity mutation.
  const pins = await clone.installer.query<{
    country_id: string;
    source_sha256: string;
  }>(
    "select country_id,source_sha256 from world_v2.finance_budget_capacity_original where world_id=$1 and country_id=any($2::text[]) and seed_fingerprint=$3 and admission_ref=$4 and source_sha256=encode(sha256(convert_to(source_text,'UTF8')),'hex') order by country_id",
    [m.worldId, countries, m.seedFingerprint, m.admissionRef],
  );
  assert.deepEqual(
    pins.rows.map((r) => r.country_id),
    [...countries],
    'C10_ACTUAL_CAPACITY_PINS_REQUIRED',
  );
  for (const pin of pins.rows)
    assert.match(pin.source_sha256, /^[a-f0-9]{64}$/u);
  for (const prior of d.countries) {
    const current = pins.rows.find((r) => r.country_id === prior.countryId);
    // Preserve independently configured countries; only recheck the three
    // explicitly served HTTP identities here, never drop a prior selector.
    if (current)
      assert.equal(current.source_sha256, prior.expectedRawSourceSHA256);
  }
  const scope = await clone.installer.query(
    "select country_id,canonical_seed_sha256 from world_v2.postwar_social_prefix_scope where world_id=$1 and country_id='COUNTRY_10' and seed_fingerprint=$2 and admission_ref=$3",
    [m.worldId, m.seedFingerprint, m.admissionRef],
  );
  assert.equal(
    scope.rows.length,
    1,
    'C10_ACTUAL_PREFIX_BASE_REQUIRED_NO_H0_REINITIALIZATION',
  );
  const canonicalSeedSha256 = scope.rows[0]?.canonical_seed_sha256;
  assert.equal(typeof canonicalSeedSha256, 'string');
  assert.match(canonicalSeedSha256, /^[a-f0-9]{64}$/u);
  const openingRepair =
    input.repairMissingOpeningBases === true
      ? await repairC10OpeningBases({
          marker: m,
          clone,
          descriptor: d,
          canonicalSeedSha256,
        })
      : undefined;
  const before = await readRegisteredCurrentEconomicSnapshotFrom(
    clone.installer,
    m.worldId,
  );
  const c10HttpActor = await prepareRegisteredC10HttpActorFrom({
    marker: m,
    clone,
    workerRole: d.workerRole,
    actorPublisherRole: input.actorPublisherRole,
  });
  // This source-bound helper creates/reuses only the C10 Industry fixture
  // principal. A raw country string never provides actor/seat/OP ownership.
  const identities = await clone.installer.query<{
    country_id: string;
    auth_subject: string;
    actor_id: string;
  }>(
    "select distinct a.country_id,a.auth_subject::text,b.actor_id from world_v2.current_commit_authorization a join world_v2.world_actor_binding b on b.world_id=a.world_id and b.auth_subject=a.auth_subject where a.world_id=$1 and a.country_id=any($2::text[]) and a.office_id='INDUSTRY' and a.capability='INDUSTRY_PRODUCTION' and a.active and not exists(select 1 from world_v2.world_actor_binding_revocation r where r.world_id=b.world_id and r.binding_ref=b.binding_ref) order by a.country_id",
    [m.worldId, countries],
  );
  assert.deepEqual(
    identities.rows.map((r) => r.country_id),
    [...countries],
    'C10_UNIQUE_ACTUAL_HTTP_IDENTITIES_REQUIRED',
  );
  const identity = (country: (typeof countries)[number]) => {
    const rows = identities.rows.filter((r) => r.country_id === country);
    assert.equal(rows.length, 1);
    return rows[0]!;
  };
  assert.equal(identity('COUNTRY_10').auth_subject, c10HttpActor.authSubject);
  assert.equal(identity('COUNTRY_10').actor_id, c10HttpActor.actorId);
  const subjects = Object.freeze({
    COUNTRY_01: identity('COUNTRY_01').auth_subject,
    COUNTRY_02: identity('COUNTRY_02').auth_subject,
    COUNTRY_10: identity('COUNTRY_10').auth_subject,
  });
  const actors = Object.freeze({
    COUNTRY_01: identity('COUNTRY_01').actor_id,
    COUNTRY_02: identity('COUNTRY_02').actor_id,
    COUNTRY_10: identity('COUNTRY_10').actor_id,
  });
  // Disposable local test key only, held in the returned signer closure.
  // The caller replaces the stopped child's JWKS together with this signer;
  // no secret is serialized, persisted, published or configured externally.
  const keys = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const kid = 'C10_TEST_ONLY_' + randomUUID().replaceAll('-', '');
  const jwks = {
    keys: [
      {
        ...keys.publicKey.export({ format: 'jwk' }),
        kid,
        alg: 'ES256',
        use: 'sig',
      },
    ],
  };
  const signToken = createRegisteredUtilityFixtureTokenSigner({
    subjects,
    issuer: d.configuration.auth.expectedIssuer,
    kid,
    privateKey: keys.privateKey,
  });
  const unassignedSigner = createRegisteredUtilityFixtureTokenSigner({
    subjects: { COUNTRY_01: '99999999-9999-4999-8999-999999999999' },
    issuer: d.configuration.auth.expectedIssuer,
    kid,
    privateKey: keys.privateKey,
  });
  const c10Pin = pins.rows.find((r) => r.country_id === 'COUNTRY_10')!;
  const descriptor = {
    ...d,
    jwks,
    countries: d.countries.some((c) => String(c.countryId) === 'COUNTRY_10')
      ? d.countries
      : [
          ...d.countries,
          {
            countryId: 'COUNTRY_10',
            expectedRawSourceSHA256: c10Pin.source_sha256,
          },
        ],
  };
  const after = await readRegisteredCurrentEconomicSnapshotFrom(
    clone.installer,
    m.worldId,
  );
  assert.deepEqual(after, before, 'C10_ATTACHMENT_CHANGED_ECONOMIC_STATE');
  return Object.freeze({
    descriptor,
    subjects,
    actors,
    signToken,
    c10HttpActor,
    signUnassignedToken: () => unassignedSigner('COUNTRY_01'),
    receipt: Object.freeze({
      classification:
        'TEST_ONLY_C10_SOURCE_BOUND_HTTP_ATTACHMENT_NOT_LOGISTICS_EXECUTION',
      ...(openingRepair ? { openingRepair } : {}),
      sourceRef: c10HttpActor.sourceRef,
      sourceRawSha256: c10HttpActor.sourceRawSha256,
      countrySelector: {
        countryId: 'COUNTRY_10',
        expectedRawSourceSHA256: c10Pin.source_sha256,
      },
      before,
      after,
      workOrdersCreated: 0,
      paymentOrdersCreated: 0,
    }),
  });
}
