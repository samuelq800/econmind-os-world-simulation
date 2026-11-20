/** Actual PGlite SQL/session/role/entitlement denial tests. Test-only identities
 * and roles, no official assignment/admission or invented operating carrier. */
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  authenticateIdentity,
  authorizeOfficeCapability,
  authSubject,
  countryId,
  officeId,
  teamId,
  worldId,
  type AuthorizedOfficeContext,
  type MembershipSnapshot,
} from '@econmind/core';
import {
  createPostwarOperatingRuntimeSource,
  createAuthorizedAdmittedOpeningSource,
  consumePostwarOperatingRuntimeSourceFrom,
  type PostwarOperatingRuntimeSource,
} from '../../apps/world-worker/src/persistence/postwar-operating-runtime-source.js';
import { createPostwarSocialRuntimeConsumer } from '../../apps/world-worker/src/persistence/postwar-social-runtime-consumer.js';
import {
  createPostwarAdmittedRuntimeFixture,
  type PostwarAdmittedRuntimeFixture,
} from '../support/postwar-admitted-runtime-fixture.js';
import { officePrivateReadProjectionScopeKey } from '../../apps/world-worker/src/projections/current-authorization-entitlement-publisher.js';
import type { SqlExecutor } from '../../apps/world-worker/src/persistence/sql-database.js';
const WORLD = 'WORLD_POSTWAR_RUNTIME_SOURCE_TEST';
const COUNTRY = 'COUNTRY_01';
const TEAM = 'TEAM_POSTWAR_RUNTIME_TEST';
const SUBJECT = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const READER = 'fixture_postwar_source_reader';
const PUBLISHER = 'fixture_postwar_source_publisher';
const key = officePrivateReadProjectionScopeKey({
  countryId: countryId(COUNTRY),
  officeId: officeId('SOCIAL'),
});
const db = new PGlite();
const statements: string[] = [];
const executor: SqlExecutor = {
  async query<Row extends object>(
    statement: string,
    parameters: readonly unknown[] = [],
  ) {
    statements.push(statement);
    const result = await db.query(statement, [...parameters]);
    return {
      rows: result.rows as Row[],
      rowCount: result.affectedRows ?? result.rows.length,
    };
  },
};
const read = (relative: string) =>
  readFile(new URL(`../../${relative}`, import.meta.url), 'utf8');
const config = {
  scope: { worldId: WORLD, countryId: COUNTRY, officeId: 'SOCIAL' as const },
  runtimeReaderRole: READER,
  authorizationPublisherRole: PUBLISHER,
};
const port = createPostwarOperatingRuntimeSource(config);
let membership: MembershipSnapshot;
let authorization: AuthorizedOfficeContext;
let otherOffice: AuthorizedOfficeContext;
let consumed = 0;
const consume = async (source: Readonly<PostwarOperatingRuntimeSource>) => {
  consumed++;
  return source.scope.countryId;
};
async function inRead<T>(
  run: () => Promise<T>,
  mode = 'repeatable read read only',
  subject = SUBJECT,
  role = READER,
) {
  if (
    ![
      'repeatable read read only',
      'serializable read only',
      'read committed read only',
      'repeatable read read write',
    ].includes(mode) ||
    ![READER, PUBLISHER, 'postgres'].includes(role)
  )
    throw Error('FIXTURE_SQL_NOT_ALLOWED');
  await db.exec(`begin isolation level ${mode}`);
  try {
    await db.exec(`set local role ${role}`);
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [
      subject,
    ]);
    return await run();
  } finally {
    await db.exec('rollback');
  }
}
beforeAll(async () => {
  for (const id of [
    '0001_world_v2_namespace',
    '0002_world_v2_command_event_ledger',
    '0003_world_v2_command_receipts_outbox',
    '0007_world_v2_atomic_transition_facts',
    '0011_world_v2_current_commit_authorization',
    '0013_world_v2_read_projection_boundary',
    '0016_world_v2_opening_seed',
  ])
    await db.exec(await read(`database/migrations/artifacts/${id}.sql`));
  await db.exec(
    await read('database/proposals/runtime-read-binding-storage.sql'),
  );
  await db.exec(`create role ${READER} nologin nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
    create role ${PUBLISHER} nologin nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
    grant usage on schema world_v2 to ${READER},${PUBLISHER};
    grant select on world_v2.world_head, world_v2.current_commit_authorization, world_v2.projection_entitlement,
      world_v2.runtime_read_seat,world_v2.runtime_opening_admission,world_v2.opening_seed,
      world_v2.authoritative_event,world_v2.command_submission,world_v2.inventory_posting,world_v2.financial_posting_batch to ${READER}`);
  await db.query(
    'insert into world_v2.world_head(world_id,world_version,event_sequence) values($1,0,0)',
    [WORLD],
  );
  for (const capability of [
    'SOCIAL_LABOUR',
    'SOCIAL_EDUCATION',
    'SOCIAL_DEVELOPMENT',
  ])
    await db.query(
      `insert into world_v2.current_commit_authorization
    (world_id,auth_subject,country_id,office_id,capability,team_id,authorization_version,active,refreshed_at_real)
    values($1,$2::uuid,$3,'SOCIAL',$4,$5,'REV_1',true,'2026-10-28T00:00:00Z')`,
      [WORLD, SUBJECT, COUNTRY, capability, TEAM],
    );
  await db.query(
    `insert into world_v2.runtime_read_seat(world_id,auth_subject,country_id,office_id,team_id,authorization_revision)
    values($1,$2::uuid,$3,'SOCIAL',$4,'REV_1')`,
    [WORLD, SUBJECT, COUNTRY, TEAM],
  );
  await db.query(
    `insert into world_v2.projection_entitlement(world_id,auth_subject,classification,scope_key,authorization_version,active,granted_at)
    values($1,$2::uuid,'OFFICE_PRIVATE',$3,'REV_1',true,'2026-10-28T00:00:00Z')`,
    [WORLD, SUBJECT, key],
  );
  const principal = await authenticateIdentity({
    token: 'TEST_ONLY_INERT',
    profile: { user_id: SUBJECT, display_name: null, school_id: null },
    verifier: {
      verify: async () => ({
        subject: SUBJECT,
        issuer: 'TEST_ONLY_INERT',
        audience: 'TEST_ONLY_INERT',
        issuedAt: '2026-10-28T00:00:00.000Z',
        expiresAt: '2026-10-29T00:00:00.000Z',
      }),
    },
  });
  const resolver = {
    resolveCurrentIdentity: async () => principal.authSubject,
    resolveCurrentMembership: async () => membership,
  };
  membership = {
    authorizationVersion: 'REV_1',
    authSubject: authSubject(SUBJECT),
    worldId: worldId(WORLD),
    teamId: teamId(TEAM),
    countryId: countryId(COUNTRY),
    officeAssignments: [officeId('SOCIAL'), officeId('TRADE')],
    active: true,
    suspended: false,
    isWorldAdmin: false,
    negotiationPartyIds: [],
  };
  authorization = await authorizeOfficeCapability({
    principal,
    resolver,
    worldId: worldId(WORLD),
    requestedCountryId: countryId(COUNTRY),
    requestedOfficeId: officeId('SOCIAL'),
    capability: 'SOCIAL_LABOUR',
  });
  otherOffice = await authorizeOfficeCapability({
    principal,
    resolver,
    worldId: worldId(WORLD),
    requestedCountryId: countryId(COUNTRY),
    requestedOfficeId: officeId('TRADE'),
    capability: 'TRADE_POLICY',
  });
});
beforeEach(async () => {
  membership = {
    ...membership,
    authorizationVersion: 'REV_1',
    active: true,
    suspended: false,
  };
  await db.query(
    "update world_v2.current_commit_authorization set active=true,authorization_version='REV_1' where world_id=$1",
    [WORLD],
  );
  await db.query(
    "update world_v2.projection_entitlement set active=true,revoked_at=null,authorization_version='REV_1' where world_id=$1",
    [WORLD],
  );
  statements.length = 0;
  consumed = 0;
});
afterAll(async () => {
  await db.close();
});

describe('postwar operating runtime source — actual SQL and default denial', () => {
  it.each(['read committed read only', 'repeatable read read write'])(
    'rejects %s before reading source, membership or admission tables',
    async (mode) => {
      await expect(
        inRead(
          () => port.withSourceFrom(executor, authorization, consume),
          mode,
        ),
      ).rejects.toMatchObject({ code: 'READ_TRANSACTION_REQUIRED' });
      expect(
        statements.some((statement) => statement.includes('from world_v2.')),
      ).toBe(false);
      expect(consumed).toBe(0);
    },
  );
  it('rejects privileged and publisher sessions despite caller-selected reader configuration', async () => {
    for (const role of ['postgres', PUBLISHER])
      await expect(
        inRead(
          () => port.withSourceFrom(executor, authorization, consume),
          'repeatable read read only',
          SUBJECT,
          role,
        ),
      ).rejects.toMatchObject({ code: 'AUTHORIZATION_DENIED' });
    expect(consumed).toBe(0);
  });
  it('checks the actual session subject, not just the supplied genuine authorization object', async () => {
    await expect(
      inRead(
        () => port.withSourceFrom(executor, authorization, consume),
        'repeatable read read only',
        OTHER,
      ),
    ).rejects.toMatchObject({ code: 'AUTHORIZATION_DENIED' });
    expect(consumed).toBe(0);
  });
  it('denies missing/currently revoked membership and immutable seats from another revision', async () => {
    await db.query(
      'update world_v2.current_commit_authorization set active=false where world_id=$1',
      [WORLD],
    );
    await expect(
      inRead(() => port.withSourceFrom(executor, authorization, consume)),
    ).rejects.toMatchObject({ code: 'AUTHORIZATION_DENIED' });
    await db.query(
      "update world_v2.current_commit_authorization set active=true,authorization_version='REV_2' where world_id=$1",
      [WORLD],
    );
    membership = { ...membership, authorizationVersion: 'REV_2' };
    await expect(
      inRead(() => port.withSourceFrom(executor, authorization, consume)),
    ).rejects.toMatchObject({ code: 'AUTHORIZATION_DENIED' });
    expect(consumed).toBe(0);
  });
  it('requires active exact-office entitlement, not only a coherent seat', async () => {
    await db.query(
      "update world_v2.projection_entitlement set active=false,revoked_at='2026-10-28T00:01:00Z' where world_id=$1",
      [WORLD],
    );
    await expect(
      inRead(() => port.withSourceFrom(executor, authorization, consume)),
    ).rejects.toMatchObject({ code: 'AUTHORIZATION_DENIED' });
    expect(
      statements.some((statement) =>
        statement.includes('from world_v2.runtime_opening_admission'),
      ),
    ).toBe(false);
    expect(consumed).toBe(0);
  });
  it('denies missing immutable admission even with genuine current membership, seat, capability and entitlement', async () => {
    await expect(
      inRead(() => port.withSourceFrom(executor, authorization, consume)),
    ).rejects.toMatchObject({ code: 'SOURCE_NOT_ADMITTED' });
    expect(consumed).toBe(0);
    expect(
      statements.every((statement) => /^select\s/iu.test(statement.trim())),
    ).toBe(true);
  });
  it('never accepts caller supplied source/admitted/ready flags or a copied authorization as authority', async () => {
    const attempted = createPostwarOperatingRuntimeSource(
      Object.assign({}, config, {
        source: { facts: { ready: true } },
        admitted: true,
        ready: true,
      }),
    );
    await expect(
      inRead(() => attempted.withSourceFrom(executor, authorization, consume)),
    ).rejects.toMatchObject({ code: 'SOURCE_NOT_ADMITTED' });
    await expect(
      inRead(() =>
        attempted.withSourceFrom(executor, { ...authorization }, consume),
      ),
    ).rejects.toMatchObject({ code: 'AUTHORIZATION_DENIED' });
    expect(consumed).toBe(0);
  });
  it('rejects foreign country/world/office installation scope before any source query', async () => {
    for (const scope of [
      { ...config.scope, countryId: 'COUNTRY_02' },
      { ...config.scope, worldId: 'WORLD_OTHER_POSTWAR' },
    ]) {
      const foreign = createPostwarOperatingRuntimeSource({ ...config, scope });
      await expect(
        inRead(() => foreign.withSourceFrom(executor, authorization, consume)),
      ).rejects.toMatchObject({ code: 'SOURCE_SCOPE_MISMATCH' });
    }
    await expect(
      inRead(() => port.withSourceFrom(executor, otherOffice, consume)),
    ).rejects.toMatchObject({ code: 'SOURCE_SCOPE_MISMATCH' });
    expect(statements).toHaveLength(0);
    expect(consumed).toBe(0);
  });
  it('rejects an unrelated office capability in the shared original-source configuration', () => {
    expect(() =>
      createAuthorizedAdmittedOpeningSource({
        ...config,
        scope: { ...config.scope, officeId: 'FINANCE' },
        capabilities: ['SOCIAL_LABOUR'],
      }),
    ).toThrow('SOURCE_SCOPE_MISMATCH');
  });

  it('fails a revoked Core context and fabricated or detached source before use', async () => {
    membership = { ...membership, active: false };
    await expect(
      inRead(() => port.withSourceFrom(executor, authorization, consume)),
    ).rejects.toMatchObject({ code: 'AUTHORIZATION_DENIED' });
    expect(() =>
      consumePostwarOperatingRuntimeSourceFrom(
        executor,
        {} as PostwarOperatingRuntimeSource,
      ),
    ).toThrow('SOURCE_SCOPE_EXPIRED');
    expect(statements).toHaveLength(0);
    expect(consumed).toBe(0);
  });
});

describe('actual complete canonical postwar seed with controlled TEST_ONLY SQL admission', () => {
  let fixture: PostwarAdmittedRuntimeFixture;
  const configuration = () => ({
    scope: {
      worldId: fixture.worldId,
      countryId: fixture.countryId,
      officeId: 'SOCIAL' as const,
    },
    ...fixture.roles,
  });
  beforeAll(async () => {
    fixture = await createPostwarAdmittedRuntimeFixture();
    // Actual 70-country construction, canonical adoption and SQL publication
    // take ~84s before any runtime read. This is setup, not a callback budget;
    // all economic/authorization tests retain the default 30s timeout.
  }, 180_000);
  afterAll(async () => {
    if (fixture) await fixture.close();
  });

  it('reads actual persisted full seed through role/seat/admission/lineage and returns only the selected country E03 body', async () => {
    const source = createPostwarOperatingRuntimeSource(configuration());
    const authorization = await fixture.authorization();
    let saved: PostwarOperatingRuntimeSource | undefined;
    const result = await fixture.asReader((read) =>
      source.withSourceFrom(read, authorization, async (actual) => {
        saved = actual;
        expect(consumePostwarOperatingRuntimeSourceFrom(read, actual)).toBe(
          actual,
        );
        expect(() =>
          consumePostwarOperatingRuntimeSourceFrom({ ...read }, actual),
        ).toThrow('SOURCE_SCOPE_EXPIRED');
        expect(actual.boundary).toMatchObject({
          seedId: fixture.seed.seedId,
          seedFingerprint: fixture.seed.fingerprint,
          admissionRef: fixture.admissionRef,
          headWorldVersion: '0',
          headEventSequence: '0',
        });
        expect(actual.scope).toMatchObject({
          worldId: fixture.worldId,
          countryId: fixture.countryId,
          officeId: 'SOCIAL',
          authSubject: fixture.subject,
          authorizationVersion: 'REV_1',
        });
        expect(
          actual.facts.regions.every(
            (region) => region.countryId === fixture.countryId,
          ),
        ).toBe(true);
        expect(actual.socialEmployment.countryId).toBe(fixture.countryId);
        expect(
          actual.socialEmployment.state.labour.positions.length,
        ).toBeGreaterThan(0);
        expect(
          actual.socialEmployment.state.labour.positions.every(
            (position) => position.countryId === fixture.countryId,
          ),
        ).toBe(true);
        expect(actual.socialEmployment.offers).toEqual([]);
        expect(actual.socialEmployment.vacancyStatus).toBe('NO_ACTUAL_VACANCY');
        expect(actual.socialEmployment).not.toHaveProperty('inputs');
        expect(actual).not.toHaveProperty('seed');
        return actual.boundary.bindingFingerprint;
      }),
    );
    expect(result).toMatch(/^sha256:[a-f0-9]{64}$/u);
    expect(saved).toBeDefined();
    expect(() =>
      consumePostwarOperatingRuntimeSourceFrom(fixture.executor, saved!),
    ).toThrow('SOURCE_SCOPE_EXPIRED');
    expect(() =>
      consumePostwarOperatingRuntimeSourceFrom(fixture.executor, { ...saved! }),
    ).toThrow('SOURCE_SCOPE_EXPIRED');
    expect(fixture.permitEvidence.ephemeralEd25519SignatureVerified).toBe(true);
    expect(fixture.permitEvidence.privateKeyPersisted).toBe(false);
  });

  it('closes/reopens the actual on-disk database and reconstructs a fresh consumer from persisted source instead of preparation memory', async () => {
    await fixture.restart();
    const consumer = createPostwarSocialRuntimeConsumer(configuration());
    const authorization = await fixture.authorization();
    const result = await fixture.asReader((read) =>
      consumer.withCountryStateFrom(read, authorization, async (data) => ({
        seed: data.boundary.seedFingerprint,
        country: data.social.countryId,
        sourceRevision: data.social.sourceRevision,
        classification: data.classification,
      })),
    );
    expect(result).toEqual({
      seed: fixture.seed.fingerprint,
      country: fixture.countryId,
      sourceRevision:
        fixture.assembly.readback.socialEmployment!.countries.find(
          (country) => country.countryId === fixture.countryId,
        )!.sourceRevision,
      classification: 'ADMITTED_H0_READ_DATA_NOT_COMMAND_CUSTODY',
    });
  });
  it('uses the actual country consumer and never returns the REVOKED validation witness as an active vacancy', async () => {
    const consumer = createPostwarSocialRuntimeConsumer(configuration());
    const authorization = await fixture.authorization();
    let selection: { positionId: string; servicePoolId: string } | undefined;
    await fixture.asReader((read) =>
      consumer.withCountryStateFrom(read, authorization, async (data) => {
        expect(data.social.validationReadFacts.classification).toBe(
          'VALIDATION_ONLY_NOT_ACTIVE_OFFER',
        );
        selection = {
          positionId: data.social.state.labour.positions[0]!.positionId,
          servicePoolId: data.social.state.servicePools[0]!.poolId,
        };
      }),
    );
    let called = false;
    await expect(
      fixture.asReader((read) =>
        consumer.withVacancyDataFrom(
          read,
          authorization,
          selection!,
          async () => {
            called = true;
          },
        ),
      ),
    ).rejects.toThrow('NO_ACTUAL_VACANCY');
    expect(called).toBe(false);
  });

  it('rechecks actual entitlement and current revision and rejects a foreign office/country even after a successful persisted read', async () => {
    const authorization = await fixture.authorization();
    const source = createPostwarOperatingRuntimeSource(configuration());
    const key = officePrivateReadProjectionScopeKey({
      countryId: countryId(fixture.countryId),
      officeId: officeId('SOCIAL'),
    });
    await fixture.db.query(
      'update world_v2.projection_entitlement set active=false,revoked_at=clock_timestamp() where world_id=$1 and scope_key=$2',
      [fixture.worldId, key],
    );
    await expect(
      fixture.asReader((read) =>
        source.withSourceFrom(read, authorization, async () => null),
      ),
    ).rejects.toMatchObject({ code: 'AUTHORIZATION_DENIED' });
    await fixture.db.query(
      'update world_v2.projection_entitlement set active=true,revoked_at=null where world_id=$1 and scope_key=$2',
      [fixture.worldId, key],
    );
    const otherOffice = await fixture.authorization('FINANCE');
    await expect(
      fixture.asReader((read) =>
        source.withSourceFrom(read, otherOffice, async () => null),
      ),
    ).rejects.toMatchObject({ code: 'SOURCE_SCOPE_MISMATCH' });
    const otherCountry = createPostwarOperatingRuntimeSource({
      ...configuration(),
      scope: { ...configuration().scope, countryId: 'COUNTRY_02' },
    });
    await expect(
      fixture.asReader((read) =>
        otherCountry.withSourceFrom(read, authorization, async () => null),
      ),
    ).rejects.toMatchObject({ code: 'SOURCE_SCOPE_MISMATCH' });
    await fixture.db.query(
      "update world_v2.current_commit_authorization set authorization_version='REV_2' where world_id=$1",
      [fixture.worldId],
    );
    fixture.state.membership = {
      ...fixture.state.membership,
      authorizationVersion: 'REV_2',
    };
    await expect(
      fixture.asReader((read) =>
        source.withSourceFrom(read, authorization, async () => null),
      ),
    ).rejects.toMatchObject({ code: 'AUTHORIZATION_DENIED' });
    await fixture.db.query(
      "update world_v2.current_commit_authorization set authorization_version='REV_1' where world_id=$1",
      [fixture.worldId],
    );
    fixture.state.membership = {
      ...fixture.state.membership,
      authorizationVersion: 'REV_1',
    };
  });

  it('refuses to expose H0 state at an advanced stored head without pretending a domain replay exists', async () => {
    // TEST_ONLY fault injection of a later head, not fabricated historical events
    // or a claim that the resulting financial/event lineage was replayed.
    await fixture.db.query(
      'update world_v2.world_head set world_version=1,event_sequence=1 where world_id=$1',
      [fixture.worldId],
    );
    fixture.statements.length = 0;
    const source = createPostwarOperatingRuntimeSource(configuration());
    const authorization = await fixture.authorization();
    let called = false;
    await expect(
      fixture.asReader((read) =>
        source.withSourceFrom(read, authorization, async () => {
          called = true;
        }),
      ),
    ).rejects.toMatchObject({ code: 'REPLAY_UNAVAILABLE' });
    expect(called).toBe(false);
    expect(
      fixture.statements.some((sql) =>
        sql.includes('from world_v2.authoritative_event'),
      ),
    ).toBe(false);
  });
});
