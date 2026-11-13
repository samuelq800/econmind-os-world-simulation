/** TEST_ONLY identity preparation on an already owned clone. No role/grant,
 * source/adoption, OP title, WORK/payment, economic command or Clock is created.
 * The existing actual source reader and separate actor publisher are reused. */
import assert from 'node:assert/strict';
import { createHash, randomUUID, sign, type KeyObject } from 'node:crypto';
import { Pool } from 'pg';
import { canonicalSerialize } from '@econmind/core';
import { publishWorldActorBindingFrom } from '../../apps/world-api/src/integration/postgres-world-actor-registry.js';
import { readPostwarIndustryFirstDaySourceFrom } from '../../apps/world-worker/src/persistence/postwar-industry-first-day-source.js';
import type { PostwarNativeReferenceMarker } from './postwar-native-reference-db.js';
export type RegisteredUtilityHttpCountry =
  'COUNTRY_01' | 'COUNTRY_02' | 'COUNTRY_10';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const countryId = 'COUNTRY_10',
  facilityId = 'OPEN-10-REFINED_FUEL';
const classification =
  'TEST_ONLY_C10_HTTP_IDENTITY_NOT_OPERATOR_TITLE_WORK_OR_PAYMENT';
/** No default subject/fallback. Only explicitly installed fixture subjects are
 * signed by the existing disposable JWK; live API authorization is separate. */
export function createRegisteredUtilityFixtureTokenSigner(input: {
  subjects: Readonly<Partial<Record<RegisteredUtilityHttpCountry, string>>>;
  issuer: string;
  kid: string;
  privateKey: KeyObject;
}): (country: RegisteredUtilityHttpCountry) => string {
  const subjects = Object.freeze({ ...input.subjects });
  for (const [country, subject] of Object.entries(subjects)) {
    assert(
      ['COUNTRY_01', 'COUNTRY_02', 'COUNTRY_10'].includes(country),
      'FIXED_FIXTURE_COUNTRIES_REQUIRED',
    );
    assert.match(subject, /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/iu);
  }
  return (country) => {
    const subject = subjects[country];
    assert(
      subject && ['COUNTRY_01', 'COUNTRY_02', 'COUNTRY_10'].includes(country),
      'EXACT_ACTUAL_SUBJECT_COUNTRY_REQUIRED',
    );
    const now = Math.floor(Date.now() / 1000),
      header = Buffer.from(
        JSON.stringify({ alg: 'ES256', typ: 'JWT', kid: input.kid }),
      ).toString('base64url');
    const body = Buffer.from(
      JSON.stringify({
        iss: input.issuer,
        aud: 'authenticated',
        sub: subject,
        iat: now,
        exp: now + 3600,
      }),
    ).toString('base64url');
    const raw = header + '.' + body;
    return (
      raw +
      '.' +
      sign('sha256', Buffer.from(raw), {
        key: input.privateKey,
        dsaEncoding: 'ieee-p1363',
      }).toString('base64url')
    );
  };
}
export async function prepareRegisteredC10HttpActorFrom(input: {
  marker: PostwarNativeReferenceMarker;
  clone: Readonly<{ database: string; installer: Pool }>;
  workerRole: string;
  actorPublisherRole: string;
}) {
  assert.equal(
    process.env.ECONMIND_REGISTERED_FINAL_NODE_NATIVE,
    '1',
    'C10_EXPLICIT_TEST_ONLY_PREPARATION_REQUIRED',
  );
  assert.notEqual(input.clone.database, input.marker.database);
  assert.match(input.clone.database, /^postwar_clone_[a-z0-9_]+$/u);
  assert(
    input.marker.socket.startsWith('/tmp/') ||
      input.marker.socket.startsWith('/workspace/'),
  );
  for (const role of [input.workerRole, input.actorPublisherRole])
    assert.match(role, /^[a-z_][a-z0-9_]{0,62}$/u);
  const m = input.marker,
    idleErrors: string[] = [];
  const open = (user: string) => {
    const p = new Pool({
      host: m.socket,
      port: m.port,
      database: input.clone.database,
      user,
      password: async () => '',
      ssl: false,
      max: 1,
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 1000,
    });
    p.on('error', (e) => idleErrors.push(e.message));
    return p;
  };
  const worker = open(input.workerRole),
    publisher = open(input.actorPublisherRole);
  const readCurrentOriginal = async () => {
    const client = await worker.connect();
    try {
      await client.query('begin isolation level repeatable read');
      await client.query('set local role world_v2_industry_source_reader');
      await client.query(
        'select world_v2.lock_postwar_source_revocation_fences($1)',
        [m.worldId],
      );
      // SourceReader has EXECUTE only. Read/lock the World head using the
      // existing worker's installed privileges, then restore the fixed reader.
      await client.query('set local role "' + input.workerRole + '"');
      const head = (
        await client.query<{ world_version: string; event_sequence: string }>(
          'select world_version::text,event_sequence::text from world_v2.world_head where world_id=$1 for share',
          [m.worldId],
        )
      ).rows;
      assert.equal(head.length, 1, 'C10_ACTUAL_HEAD_REQUIRED');
      await client.query('set local role world_v2_industry_source_reader');
      const original = await readPostwarIndustryFirstDaySourceFrom(
        {
          query: async <Row extends object>(
            sql: string,
            args: readonly unknown[] = [],
          ) => {
            const r = await client.query<Row>(sql, [...args]);
            return { rows: r.rows, rowCount: r.rowCount };
          },
        },
        {
          worldId: m.worldId,
          countryId,
          facilityId,
          head: {
            worldVersion: head[0]!.world_version,
            eventSequence: head[0]!.event_sequence,
          },
          expectedPins: {
            seedId: m.seedId,
            seedFingerprint: m.seedFingerprint,
            admissionRef: m.admissionRef,
          },
        },
      );
      assert(
        original,
        'C10_ACTUAL_REGISTERED_SOURCE_REQUIRED_NO_IDENTITY_FROM_INSPECTION',
      );
      assert.equal(
        original.data.operatorId,
        'ENTITY_OPERATOR_10',
        'C10_EXISTING_OWN_COUNTRY_OPERATOR_REQUIRED',
      );
      return original;
    } finally {
      try {
        await client.query('rollback');
      } finally {
        client.release();
      }
    }
  };
  try {
    const original = await readCurrentOriginal();
    // Release the reader fence before another pool changes authorization: that
    // DML legitimately advances the same fence. Recheck CURRENT after writing.
    const recheckCurrentOriginal = async () => {
      const current = await readCurrentOriginal();
      assert.equal(current.sourceRef, original.sourceRef);
      assert.equal(current.rawSha256, original.rawSha256);
      assert.deepEqual(
        current.data,
        original.data,
        'C10_CURRENT_SOURCE_CHANGED_DURING_REGISTRATION',
      );
    };
    const scopeKey =
      'OFFICE_' +
      Buffer.from(countryId).toString('hex').toUpperCase() +
      '_494E445553545259';
    const previous = (
      await input.clone.installer.query<{
        auth_subject: string;
        authorization_version: string;
        team_id: string;
        actor_id: string;
        binding_ref: string;
        issuer_ref: string;
        original_sha256: string;
        seat: boolean;
        entitlement: boolean;
      }>(
        "select a.auth_subject::text,a.authorization_version,a.team_id,b.actor_id,b.binding_ref,b.issuer_ref,b.original_sha256,exists(select 1 from world_v2.runtime_read_seat s where s.world_id=a.world_id and s.auth_subject=a.auth_subject and s.country_id=a.country_id and s.office_id=a.office_id and s.team_id=a.team_id and s.authorization_revision=a.authorization_version)seat,exists(select 1 from world_v2.projection_entitlement e where e.world_id=a.world_id and e.auth_subject=a.auth_subject and e.authorization_version=a.authorization_version and e.classification='OFFICE_PRIVATE'and e.scope_key=$2 and e.active and e.revoked_at is null)entitlement from world_v2.current_commit_authorization a join world_v2.world_actor_binding b on b.world_id=a.world_id and b.auth_subject=a.auth_subject where a.world_id=$1 and a.country_id='COUNTRY_10'and a.office_id='INDUSTRY'and a.capability='INDUSTRY_PRODUCTION'and a.active and not exists(select 1 from world_v2.world_actor_binding_revocation r where r.world_id=b.world_id and r.binding_ref=b.binding_ref)",
        [m.worldId, scopeKey],
      )
    ).rows;
    assert(previous.length <= 1, 'C10_UNIQUE_EXISTING_HTTP_IDENTITY_REQUIRED');
    const identityOriginal = (subject: string, actorId: string) => ({
      classification,
      worldId: m.worldId,
      countryId,
      facilityId,
      operatorId: original.data.operatorId,
      seedFingerprint: m.seedFingerprint,
      admissionRef: m.admissionRef,
      sourceRef: original.sourceRef,
      sourceRawSha256: original.rawSha256,
      authSubject: subject,
      actorId,
    });
    if (previous.length) {
      const p = previous[0]!;
      assert(
        p.seat && p.entitlement && p.team_id === m.team,
        'C10_EXISTING_COHERENT_INDUSTRY_SEAT_REQUIRED',
      );
      assert.equal(p.issuer_ref, 'TEST_ONLY_NATIVE_ACTOR_REGISTRAR');
      assert.match(
        p.actor_id,
        /^ACTOR_TEST_ONLY_REGISTERED_C10_[A-F0-9]{32}$/u,
      );
      assert.equal(
        p.original_sha256,
        sha(canonicalSerialize(identityOriginal(p.auth_subject, p.actor_id))),
        'C10_EXISTING_ACTOR_SOURCE_PINS_REQUIRED',
      );
      await recheckCurrentOriginal();
      assert.equal(idleErrors.length, 0, 'C10_FIXTURE_POOL_OPERATIONAL_ERROR');
      return Object.freeze({
        classification,
        countryId,
        authSubject: String(p.auth_subject),
        actorId: String(p.actor_id),
        bindingRef: String(p.binding_ref),
        sourceRef: original.sourceRef,
        sourceRawSha256: original.rawSha256,
        reused: true,
      });
    }
    const uid = randomUUID().replaceAll('-', '').toUpperCase(),
      subject = randomUUID(),
      actorId = 'ACTOR_TEST_ONLY_REGISTERED_C10_' + uid,
      bindingRef = 'BINDING_TEST_ONLY_FINAL_C10_' + uid,
      revision = 'TEST_ONLY_C10_HTTP_' + uid;
    const admin = await input.clone.installer.connect();
    try {
      await admin.query('begin');
      assert.equal(
        (await admin.query('select current_database()as name')).rows[0]?.name,
        input.clone.database,
      );
      await admin.query(
        "insert into world_v2.current_commit_authorization(world_id,auth_subject,country_id,office_id,capability,team_id,authorization_version,active,refreshed_at_real)values($1,$2::uuid,'COUNTRY_10','INDUSTRY','INDUSTRY_PRODUCTION',$3,$4,true,clock_timestamp())",
        [m.worldId, subject, m.team, revision],
      );
      await admin.query(
        "insert into world_v2.runtime_read_seat(world_id,auth_subject,country_id,office_id,team_id,authorization_revision)values($1,$2::uuid,'COUNTRY_10','INDUSTRY',$3,$4)",
        [m.worldId, subject, m.team, revision],
      );
      await admin.query(
        "insert into world_v2.projection_entitlement(world_id,auth_subject,classification,scope_key,authorization_version,active,granted_at)values($1,$2::uuid,'OFFICE_PRIVATE',$3,$4,true,clock_timestamp())",
        [m.worldId, subject, scopeKey, revision],
      );
      await admin.query('commit');
    } catch (e) {
      await admin.query('rollback');
      throw e;
    } finally {
      admin.release();
    }
    // Same existing low publisher lane as registered-final-node-setup. A failed
    // publication leaves test metadata closed to HTTP; no cleanup DELETE/retry.
    const actor = await publisher.connect();
    try {
      await actor.query('begin isolation level serializable');
      await publishWorldActorBindingFrom(actor, {
        worldId: m.worldId,
        authSubject: subject,
        actorId,
        bindingRef,
        issuerRef: 'TEST_ONLY_NATIVE_ACTOR_REGISTRAR',
        originalSha256: sha(
          canonicalSerialize(identityOriginal(subject, actorId)),
        ),
      });
      await actor.query('commit');
    } catch (e) {
      await actor.query('rollback');
      throw e;
    } finally {
      actor.release();
    }
    await recheckCurrentOriginal();
    assert.equal(idleErrors.length, 0, 'C10_FIXTURE_POOL_OPERATIONAL_ERROR');
    return Object.freeze({
      classification,
      countryId,
      authSubject: subject,
      actorId,
      bindingRef,
      sourceRef: original.sourceRef,
      sourceRawSha256: original.rawSha256,
      reused: false,
    });
  } finally {
    await Promise.all([worker.end(), publisher.end()]);
  }
}
