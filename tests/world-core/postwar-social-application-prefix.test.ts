/** Small isolated PostgreSQL engine contract/forward checks. These TEST_ONLY
 * source rows do not prove native production or complete World replay. */
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';
const read = (p: string) =>
  readFile(new URL('../../' + p, import.meta.url), 'utf8');
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const path = 'database/proposals/postwar-social-application-prefix.sql';
interface FunctionSpec {
  signature: string;
  owner: string;
  bodySha256: string;
  acl: { grantee: string; privilege: string; grantable: boolean }[];
}
const declaration = (sql: string, signature: string) => {
  const name = signature.split('(')[0]!.split('.')[1]!;
  const result = sql.match(
    new RegExp(
      'create(?: or replace)? function world_v2\\.' +
        name +
        '\\([\\s\\S]*?as \\$\\$[\\s\\S]*?\\$\\$;',
    ),
  )?.[0];
  if (!result) throw Error('EXACT_FUNCTION_DECLARATION_REQUIRED:' + name);
  return result;
};
async function fixture() {
  const db = new PGlite(),
    predecessor = await read(
      'database/proposals/postwar-pending-programme-target-prefix.sql',
    );
  const manifest = JSON.parse(
    await read(
      'database/proposals/postwar-social-application-prefix.manifest.json',
    ),
  ) as {
    sqlSha256: string;
    replacedFunctions: FunctionSpec[];
    successorFunctions: FunctionSpec[];
  };
  await db.exec(`create schema world_v2;
    create role world_v2_postwar_projection_owner nologin;
    create role world_v2_social_source_owner nologin;
    create role world_v2_social_source_reader nologin;
    create role world_v2_social_source_publisher nologin;
    create role world_v2_finance_budget_source_owner nologin;
    grant usage on schema world_v2 to world_v2_postwar_projection_owner,world_v2_social_source_owner,world_v2_social_source_reader,world_v2_social_source_publisher,world_v2_finance_budget_source_owner;
    create table world_v2.postwar_social_prefix_scope(world_id text,country_id text,scope_document text,scope_sha256 text,source_id text,source_payload_hash text);
    create table world_v2.command_submission(world_id text,country_id text,office_id text,command_id text,command_type text,command_fingerprint text,canonical_payload text,sim_time bigint);
    create table world_v2.authoritative_event(world_id text,causation_command_id text,event_type text,event_sequence bigint,event_id text,world_version bigint);
    create table world_v2.command_receipt(world_id text,command_id text,outcome text,command_fingerprint text,event_ids jsonb,world_version_after bigint);
    grant select on all tables in schema world_v2 to world_v2_postwar_projection_owner;
    set check_function_bodies=off;`);
  for (const spec of manifest.replacedFunctions) {
    const sql = declaration(
      spec.signature.includes('postwar_social_complete_prefix')
        ? await read(
            'database/proposals/postwar-social-current-prefix-read.sql',
          )
        : spec.signature.includes('postwar_current_social_witness')
          ? await read(
              'database/proposals/postwar-social-current-derived-read.sql',
            )
          : predecessor,
      spec.signature,
    );
    expect(hash(sql.match(/as \$\$([\s\S]*?)\$\$;/)![1]!)).toBe(
      spec.bodySha256,
    );
    await db.exec(
      sql +
        '\nalter function ' +
        spec.signature +
        ' owner to ' +
        spec.owner +
        '; revoke all on function ' +
        spec.signature +
        ' from public;',
    );
    for (const acl of spec.acl.filter((a) => a.grantee !== spec.owner))
      await db.exec(
        'grant ' +
          acl.privilege +
          ' on function ' +
          spec.signature +
          ' to ' +
          acl.grantee +
          (acl.grantable ? ' with grant option' : '') +
          ';',
      );
  }
  await db.exec(
    declaration(
      predecessor,
      'world_v2.postwar_social_programme_effect_scoped(text,text,jsonb,jsonb,bigint)',
    ),
  );
  await db.exec(
    'alter function world_v2.postwar_social_programme_effect_scoped(text,text,jsonb,jsonb,bigint)owner to world_v2_postwar_projection_owner; revoke all on function world_v2.postwar_social_programme_effect_scoped(text,text,jsonb,jsonb,bigint)from public;',
  );
  const sql = await read(path);
  expect(hash(sql)).toBe(manifest.sqlSha256);
  return { db, manifest, sql };
}
async function source(db: PGlite) {
  const world = 'WORLD_TEST_ONLY_APPLICATION_SQL',
    country = 'COUNTRY_01',
    location = 'REGION_01_E1';
  const scope = {
    minimumWage: { currency: 'XAA' },
    populationAvailability: [
      { countryId: country, locationId: location, workingAgeAvailable: '22' },
    ],
    // Not consulted for current count: MATCH can change it later.
    aggregates: [
      {
        countryId: country,
        locationId: location,
        skill: 'LOW',
        status: 'UNEMPLOYED_SEARCHING',
        count: '22',
      },
    ],
  };
  const sourceFp = 'sha256:' + '1'.repeat(64),
    programmeFp = 'sha256:' + '2'.repeat(64);
  const terms = {
    schemaVersion: 'social-labour-programme-create-v1',
    programmeId: 'PROGRAMME_TEST_ONLY',
  };
  await db.query(
    'insert into world_v2.postwar_social_prefix_scope values($1,$2,$3,$4,$5,$6)',
    [
      world,
      country,
      JSON.stringify(scope),
      hash(JSON.stringify(scope)),
      'SOURCE_TEST_ONLY',
      sourceFp,
    ],
  );
  await db.query(
    'insert into world_v2.command_submission values($1,$2,$3,$4,$5,$6,$7,$8)',
    [
      world,
      country,
      'SOCIAL',
      'COMMAND_CREATION',
      'CORE_SOCIAL_LABOUR_PROGRAMME_CREATE_V1',
      programmeFp,
      JSON.stringify(terms),
      '10000',
    ],
  );
  await db.query(
    'insert into world_v2.authoritative_event values($1,$2,$3,$4,$5,$6)',
    [
      world,
      'COMMAND_CREATION',
      'SOCIAL_LABOUR_PROGRAMME_CREATED_V1',
      1,
      'EVENT_CREATION',
      1,
    ],
  );
  await db.query(
    'insert into world_v2.command_receipt values($1,$2,$3,$4,$5,$6)',
    [
      world,
      'COMMAND_CREATION',
      'COMMITTED',
      programmeFp,
      JSON.stringify(['EVENT_CREATION']),
      1,
    ],
  );
  const intent = {
    schemaVersion: 'social-labour-programme-apply-v1',
    programmeId: 'PROGRAMME_TEST_ONLY',
    programmeCommandFingerprint: programmeFp,
    applicationId: 'APPLICATION_TEST_ONLY',
    applicant: {
      locationId: location,
      skill: 'LOW',
      status: 'UNEMPLOYED_SEARCHING',
    },
  };
  const command = {
    worldId: world,
    countryId: country,
    officeId: 'SOCIAL',
    commandId: 'COMMAND_APPLICATION',
    commandType: 'CORE_SOCIAL_LABOUR_PROGRAMME_APPLY_V1',
    idempotencyKey: 'COMMAND_APPLICATION',
    canonicalPayload: JSON.stringify(intent),
    fingerprint: 'sha256:' + '3'.repeat(64),
    payloadHash: 'sha256:' + '4'.repeat(64),
    expectedWorldVersion: '1',
    simTime: '10001',
  };
  const { canonicalPayload, fingerprint, payloadHash, ...wire } = command;
  void canonicalPayload;
  void fingerprint;
  void payloadHash;
  const event = {
    schemaVersion: 'social-labour-programme-applied-v1',
    command: { ...wire, payload: intent },
    readFacts: {
      worldId: world,
      countryId: country,
      boundary: { kind: 'E01_DAILY_BOUNDARY', dayIndex: '0' },
      simTime: '10001',
      populationAvailability: scope.populationAvailability,
      head: { worldVersion: '1', eventSequence: '1' },
      localCurrency: 'XAA',
      sourceRef: 'SOURCE_TEST_ONLY',
      sourceFingerprint: sourceFp,
      sourceRevocations: [],
    },
    beforeStateHash: 'sha256:' + '5'.repeat(64),
    afterStateHash: 'sha256:' + '6'.repeat(64),
    result: {
      programmeId: intent.programmeId,
      applicationId: intent.applicationId,
      personCount: '20',
      status: 'APPLIED',
      classification:
        'APPLICATION_ONLY_NOT_ELIGIBILITY_APPROVAL_FUNDING_OR_SERVICE',
    },
  };
  return { world, country, intent, command, event };
}
const call = async (
  db: PGlite,
  f: Awaited<ReturnType<typeof source>>,
  command: unknown = f.command,
  event: unknown = f.event,
  country = f.country,
) =>
  (
    await db.query<{ ok: boolean }>(
      'select world_v2.postwar_social_application_effect_scoped($1,$2,$3::jsonb,$4::jsonb,2) as ok',
      [f.world, country, JSON.stringify(command), JSON.stringify(event)],
    )
  ).rows[0]!.ok;
describe('guarded Social application forward', () => {
  it('preserves predecessor OIDs/ACLs, installs all six dispatch changes and rejects repeat', async () => {
    const { db, manifest, sql } = await fixture();
    try {
      const before = (
        await db.query<{ signature: string; oid: string; acl: string }>(
          "select oid::regprocedure::text as signature,oid::text,proacl::text as acl from pg_proc where pronamespace='world_v2'::regnamespace",
        )
      ).rows;
      await db.exec(sql);
      const after = (
        await db.query<{ signature: string; oid: string; acl: string }>(
          "select oid::regprocedure::text as signature,oid::text,proacl::text as acl from pg_proc where pronamespace='world_v2'::regnamespace",
        )
      ).rows;
      for (const b of before)
        expect(after.find((a) => a.signature === b.signature)).toEqual(b);
      for (const successor of manifest.successorFunctions) {
        const body = (
          await db.query<{ body: string }>(
            'select prosrc as body from pg_proc where oid=to_regprocedure($1)',
            [successor.signature],
          )
        ).rows[0]!.body;
        expect(hash(body)).toBe(successor.bodySha256);
      }
      for (const spec of manifest.replacedFunctions) {
        const body = (
          await db.query<{ body: string }>(
            'select prosrc as body from pg_proc where oid=to_regprocedure($1)',
            [spec.signature],
          )
        ).rows[0]!.body;
        expect(body).toContain(
          spec.signature.includes('origin_at_prefix') ||
            spec.signature.includes('complete_prefix')
            ? 'SOCIAL_LABOUR_PROGRAMME_APPLIED_V1'
            : spec.signature.includes('prefix_effect')
              ? 'SOCIAL_LABOUR_PROGRAMME_APPLIED_V1'
              : 'CORE_SOCIAL_LABOUR_PROGRAMME_APPLY_V1',
        );
      }
      await db.exec('set role world_v2_social_source_reader');
      expect(
        (
          await db.query<{ version: string }>(
            'select world_v2.postwar_social_application_contract_version() as version',
          )
        ).rows[0]!.version,
      ).toBe('postwar-social-labour-application-v1');
      await expect(
        db.exec(
          "select world_v2.postwar_social_application_effect_scoped('W','C','{}','{}',1)",
        ),
      ).rejects.toThrow('permission denied');
      await db.exec('reset role');
      await expect(db.exec(sql)).rejects.toThrow(
        'SOCIAL_APPLICATION_EXACT_PREDECESSOR_REQUIRED',
      );
      await db.exec('rollback');
    } finally {
      await db.close();
    }
  });
  it('binds actual source and prior committed programme; rejects foreign source, approval, stale programme, overcount and duplicate group', async () => {
    const { db, sql } = await fixture();
    try {
      await db.exec(sql);
      const f = await source(db);
      // 20 is not initial 22. SQL validates bounds/custody; exact current count
      // and labour snapshot are independently recomputed by Core replay.
      expect(await call(db, f)).toBe(true);
      const routed = (
        await db.query<{ ok: boolean }>(
          'select world_v2.postwar_social_prefix_effect_scoped($1,$2,$3,$4::jsonb,$5::jsonb,2)as ok',
          [
            f.world,
            f.country,
            'SOCIAL_LABOUR_PROGRAMME_APPLIED_V1',
            JSON.stringify(f.command),
            JSON.stringify(f.event),
          ],
        )
      ).rows[0]!.ok;
      expect(routed).toBe(true);
      const creationIntent = {
        schemaVersion: 'social-labour-programme-create-v1',
        programmeId: 'PROGRAMME_TEST_ONLY',
        kind: 'RELOCATION_SUPPORT',
        locationId: f.intent.applicant.locationId,
        participants: '2',
        benefit: { amount: '3', currency: 'XAA' },
      };
      const creationCommand = {
        ...f.command,
        commandType: 'CORE_SOCIAL_LABOUR_PROGRAMME_CREATE_V1',
        commandId: 'COMMAND_CREATION',
        idempotencyKey: 'COMMAND_CREATION',
        expectedWorldVersion: '0',
        simTime: '10000',
        canonicalPayload: JSON.stringify(creationIntent),
      };
      const {
        canonicalPayload: discardedPayload,
        fingerprint: discardedFingerprint,
        payloadHash: discardedHash,
        ...creationWire
      } = creationCommand;
      void discardedPayload;
      void discardedFingerprint;
      void discardedHash;
      const creationEvent = {
        ...f.event,
        schemaVersion: 'social-labour-programme-created-v1',
        command: { ...creationWire, payload: creationIntent },
        readFacts: {
          ...f.event.readFacts,
          simTime: '10000',
          head: { worldVersion: '0', eventSequence: '0' },
        },
        result: {
          programmeId: creationIntent.programmeId,
          status: 'PENDING_REVIEW',
          classification:
            'TERMS_ONLY_NOT_ELIGIBILITY_APPROVAL_FUNDING_OR_SERVICE',
        },
      };
      for (const [type, c, e, sequence] of [
        [
          'SOCIAL_LABOUR_PROGRAMME_CREATED_V1',
          creationCommand,
          creationEvent,
          1,
        ],
        ['SOCIAL_LABOUR_PROGRAMME_APPLIED_V1', f.command, f.event, 2],
      ] as const) {
        const route = async (payload: unknown) =>
          (
            await db.query<{ ok: boolean }>(
              'select world_v2.postwar_social_prefix_effect_scoped($1,$2,$3,$4::jsonb,$5::jsonb,$6::bigint)as ok',
              [
                f.world,
                f.country,
                type,
                JSON.stringify(c),
                JSON.stringify(payload),
                sequence,
              ],
            )
          ).rows[0]!.ok;
        expect(await route(e)).toBe(true);
        expect(
          await route({ ...e, result: { ...e.result, status: 'APPROVED' } }),
        ).toBe(false);
      }
      const completeBody = (
        await db.query<{ body: string }>(
          "select prosrc as body from pg_proc where oid='world_v2.postwar_social_complete_prefix(text)'::regprocedure",
        )
      ).rows[0]!.body;
      expect(completeBody).toContain(
        'or not world_v2.postwar_social_prefix_effect_scoped',
      );
      const witnessBody = (
        await db.query<{ body: string }>(
          "select prosrc as body from pg_proc where oid='world_v2.postwar_current_social_witness(text,text)'::regprocedure",
        )
      ).rows[0]!.body;
      expect(witnessBody).toContain(
        "event_type in('SOCIAL_EMPLOYMENT_SERVICE_CREATED_V1','SOCIAL_LABOUR_PROGRAMME_CREATED_V1','SOCIAL_LABOUR_PROGRAMME_APPLIED_V1')",
      );
      expect(witnessBody).toContain(
        'perform 1 from world_v2.postwar_social_complete_prefix(p_world)',
      );

      for (const event of [
        {
          ...f.event,
          readFacts: {
            ...f.event.readFacts,
            sourceFingerprint: 'sha256:' + '9'.repeat(64),
          },
        },
        {
          ...f.event,
          readFacts: { ...f.event.readFacts, sourceRevocations: ['REVOKED'] },
        },
        { ...f.event, result: { ...f.event.result, status: 'APPROVED' } },
        { ...f.event, result: { ...f.event.result, personCount: '23' } },
      ])
        expect(await call(db, f, f.command, event)).toBe(false);
      expect(await call(db, f, f.command, f.event, 'COUNTRY_02')).toBe(false);
      const intent = {
        ...f.intent,
        programmeCommandFingerprint: 'sha256:' + '9'.repeat(64),
      };
      expect(
        await call(
          db,
          f,
          { ...f.command, canonicalPayload: JSON.stringify(intent) },
          { ...f.event, command: { ...f.event.command, payload: intent } },
        ),
      ).toBe(false);
      await db.query(
        'insert into world_v2.command_submission values($1,$2,$3,$4,$5,$6,$7,$8)',
        [
          f.world,
          f.country,
          'SOCIAL',
          'COMMAND_PRIOR_APPLY',
          'CORE_SOCIAL_LABOUR_PROGRAMME_APPLY_V1',
          'prior',
          JSON.stringify({ ...f.intent, applicationId: 'APPLICATION_PRIOR' }),
          '10000',
        ],
      );
      await db.query(
        'insert into world_v2.authoritative_event values($1,$2,$3,$4,$5,$6)',
        [
          f.world,
          'COMMAND_PRIOR_APPLY',
          'SOCIAL_LABOUR_PROGRAMME_APPLIED_V1',
          1,
          'EVENT_PRIOR',
          1,
        ],
      );
      await db.query(
        'insert into world_v2.command_receipt values($1,$2,$3,$4,$5,$6)',
        [
          f.world,
          'COMMAND_PRIOR_APPLY',
          'COMMITTED',
          'prior',
          JSON.stringify(['EVENT_PRIOR']),
          1,
        ],
      );
      expect(await call(db, f)).toBe(false);
    } finally {
      await db.close();
    }
  });
  it('rejects altered predecessor before creating or replacing any function', async () => {
    const { db, sql } = await fixture();
    try {
      await db.exec(
        'create or replace function world_v2.postwar_social_prefix_effect_scoped(p_world text,p_country text,p_type text,p_command jsonb,p_event jsonb,p_sequence bigint)returns boolean language plpgsql security definer set search_path=pg_catalog as $$begin return false;end;$$;',
      );
      await expect(db.exec(sql)).rejects.toThrow(
        'SOCIAL_APPLICATION_EXACT_PREDECESSOR_REQUIRED',
      );
      await db.exec('rollback');
      expect(
        (
          await db.query<{ oid: unknown }>(
            "select to_regprocedure('world_v2.postwar_social_application_contract_version()')as oid",
          )
        ).rows[0]!.oid,
      ).toBeNull();
    } finally {
      await db.close();
    }
  });
});
