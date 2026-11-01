/** Actual candidate functions in a tiny metadata-only TEST_ONLY schema.
 * No economic/source authority, live native PG or operating adoption is claimed. */
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { describe, it, expect } from 'vitest';
import * as C from '../../packages/core/src/index.js';
import {
  mixedSocialOriginal,
  mixedSocialFrame,
  mixedSha as sha,
  mixedWorld as world,
} from '../support/finance-social-fx-replay-fixture.js';
import {
  mixedMatchSqlTestBase,
  insertMixedMatchSqlTestFrame as insertFrame,
} from '../support/postwar-mixed-match-sql-test-only.js';
import type { FinanceNativeBudgetCanonicalFrame as Frame } from '../../packages/core/src/commands/finance-budget-native.js';
const seed = 'sha256:' + '1'.repeat(64),
  admission = 'ADMISSION_' + 'A'.repeat(64),
  at = '2026-10-29T00:00:00.000Z';
const hash = (v: unknown) => C.canonicalSha256(C.canonicalHashInput(v), sha);
function budget(
  version: number,
  type = 'CORE_FINANCE_BUDGET_APPROPRIATION_V1',
): Frame {
  const c = C.parseCanonicalCommand(
    {
      schemaVersion: 'command-v1',
      worldId: world,
      countryId: 'COUNTRY_02',
      officeId: 'FINANCE',
      commandType: type,
      commandId: 'COMMAND_TEST_ONLY_PAGE_' + version,
      idempotencyKey: 'KEY_TEST_ONLY_PAGE_' + version,
      actorId: 'ACTOR_TEST_ONLY',
      authSubject: '11111111-1111-4111-8111-111111111111',
      expectedWorldVersion: String(version),
      simTime: '0',
      submittedAtReal: at,
      correlationId: 'CORRELATION_TEST_ONLY',
      payload: { operation: 'SET_ENVELOPE' },
    },
    sha,
  );
  const e = C.parseAuthoritativeEvent(
    {
      schemaVersion: 'event-v1',
      eventId: 'EVENT_' + c.commandId,
      eventType:
        type === 'CORE_FINANCE_BUDGET_APPROPRIATION_V1'
          ? 'FINANCE_NATIVE_BUDGET_ENVELOPE_SET_V1'
          : 'UNKNOWN',
      worldId: world,
      causationCommandId: c.commandId,
      correlationId: c.correlationId,
      worldVersion: String(version + 1),
      sequence: String(version + 1),
      simTime: '0',
      recordedAtReal: at,
      correctsEventId: null,
      payload: { classification: 'TEST_ONLY_METADATA_NOT_ECONOMIC_BUDGET' },
    },
    sha,
  );
  const transition = C.createAuthoritativeTransition({
    command: c,
    worldVersionBefore: String(version),
    worldVersionAfter: String(version + 1),
    events: [e],
  });
  return {
    command: c,
    events: [e],
    transition,
    receipt: C.createFinalCommandReceipt({
      command: c,
      transition,
      outcome: 'COMMITTED',
      reasonCode: null,
      simTime: c.simTime,
      recordedAtReal: at,
    }),
    financialPostingBatches: [],
    inventoryPostings: [],
  };
}
function coverage(pages: readonly Frame[][]) {
  const expectedHead = {
      worldVersion: String(pages.flat().length),
      eventSequence: String(pages.flat().length),
    },
    origin = { worldId: world, seedFingerprint: seed, expectedHead };
  let prefix = hash({
      schemaVersion: 'finance-social-replay-origin-v1',
      ...origin,
    }),
    effects = hash({
      schemaVersion: 'postwar-effects-page-origin-v1',
      ...origin,
    }),
    journal = hash({
      schemaVersion: 'postwar-financial-page-origin-v1',
      ...origin,
    }),
    head = { worldVersion: '0', eventSequence: '0' };
  for (const frames of pages) {
    const tail = frames.at(-1)!;
    const throughHead = {
        worldVersion: tail.transition.worldVersionAfter,
        eventSequence: tail.events.at(-1)!.sequence,
      },
      anchor = {
        worldId: world,
        seedFingerprint: seed,
        expectedHead,
        fromHead: head,
        throughHead,
      };
    prefix = hash({
      schemaVersion: 'finance-social-replay-page-chain-v1',
      previous: prefix,
      ...anchor,
      framesSha256: hash(frames),
    });
    effects = hash({
      schemaVersion: 'postwar-effects-page-chain-v1',
      previous: effects,
      ...anchor,
      effects: frames.map((f) => ({
        commandId: f.command.commandId,
        countryId: f.command.countryId,
        commandType: f.command.commandType,
        transitionFingerprint: hash(f.transition),
        receiptFingerprint: hash(f.receipt),
        eventFingerprints: f.events.map((e) => e.fingerprint),
        worldVersionBefore: f.transition.worldVersionBefore,
        worldVersionAfter: f.transition.worldVersionAfter,
        events: f.events.map((e) => ({
          eventId: e.eventId,
          fingerprint: e.fingerprint,
          sequence: e.sequence,
          worldVersion: e.worldVersion,
        })),
      })),
    });
    journal = hash({
      schemaVersion: 'postwar-financial-page-chain-v1',
      previous: journal,
      ...anchor,
      batches: [],
    });
    head = throughHead;
  }
  const tail = pages.at(-1)!.at(-1)!.events.at(-1)!;
  return {
    prefixFingerprint: prefix,
    knownEffectsFingerprint: effects,
    coveredThroughEventId: tail.eventId,
    coveredThroughEventFingerprint: tail.fingerprint,
    financialPostingCount: '0',
    financialBatchCount: '0',
    financialPostingsFingerprint: journal,
    pageProof: {
      schemaVersion: 'postwar-complete-page-proof-v1',
      hashAlgorithm: 'COMPLETE_CANONICAL_PAGE_CHAINS_SHA256_V1',
      pageCount: String(pages.length),
      frameCount: String(pages.flat().length),
    },
  };
}
async function install(db: PGlite) {
  await db.exec(mixedMatchSqlTestBase);
  await db.exec(`
create role world_v2_day_one_fx_history_owner nologin nosuperuser nobypassrls;
create role world_v2_social_source_reader nologin nosuperuser nobypassrls;
create role world_v2_finance_budget_source_reader nologin nosuperuser nobypassrls;
grant usage on schema world_v2 to world_v2_day_one_fx_history_owner,world_v2_social_source_reader,world_v2_finance_budget_source_reader;
alter table world_v2.runtime_opening_admission add replay_binding text,add model_version text,add admitted_at_real timestamptz;
create table world_v2.opening_seed(world_id text,seed_id text,seed_fingerprint text,replay_binding text);
create table world_v2.runtime_admission_publication_permit(authorization_id text,authorization_sha256 text,world_id text,seed_id text,seed_fingerprint text,model_version text,replay_binding text,valid_from timestamptz,valid_until timestamptz);
create table world_v2.runtime_admission_publication_revocation(authorization_id text);
create table world_v2.finance_budget_policy_original(world_id text,country_id text,policy_ref text,seed_fingerprint text,admission_ref text);
create table world_v2.finance_budget_policy_revocation(policy_ref text);
alter table world_v2.inventory_posting add posting_id text,add causation_command_id text,add canonical_payload text,add posting_fingerprint text;
grant select on all tables in schema world_v2 to world_v2_day_one_fx_history_owner;
grant update(world_version) on world_v2.world_head to world_v2_day_one_fx_history_owner;
grant update(seed_id) on world_v2.runtime_opening_admission to world_v2_day_one_fx_history_owner;
grant update(authorization_id) on world_v2.runtime_admission_publication_permit to world_v2_day_one_fx_history_owner;
grant update(registration_ref) on world_v2.social_operating_source_registration to world_v2_day_one_fx_history_owner;
grant update(policy_ref) on world_v2.finance_budget_policy_original to world_v2_day_one_fx_history_owner;
`);
  const integrity = await readFile(
    new URL(
      '../../database/migrations/artifacts/0009_world_v2_posting_payload_integrity.sql',
      import.meta.url,
    ),
    'utf8',
  );
  await db.exec(
    integrity.slice(
      0,
      integrity.indexOf(
        'create or replace function world_v2.validate_inventory_posting_payload',
      ),
    ),
  );
  for (const file of [
    'postwar-bounded-prefix-pages.sql',
    'postwar-social-match-prefix-pages.sql',
    'postwar-social-paged-match-publisher.sql',
    'postwar-source-revocation-fence.sql',
  ])
    await db.exec(
      await readFile(
        new URL('../../database/proposals/' + file, import.meta.url),
        'utf8',
      ),
    );
}
describe('fixed complete page-chain MATCH publisher SQL', () => {
  it('publishes one actual-H command across >256 complete metadata frames, denies omitted/changed/unknown/revoked sources', async () => {
    const db = new PGlite();
    try {
      await install(db);
      const p = mixedSocialFrame(mixedSocialOriginal(), '0', '1'),
        plan: Frame = {
          command: p.command,
          events: p.events,
          transition: p.transition,
          receipt: p.receipt,
          financialPostingBatches: [],
          inventoryPostings: [],
        };
      const frames = [
        plan,
        ...Array.from({ length: 256 }, (_, i) => budget(i + 1)),
      ];
      await db.query('insert into world_v2.world_head values($1,257,257)', [
        world,
      ]);
      const replay = C.canonicalSerialize({ modelVersion: 'TEST_ONLY' });
      await db.query(
        'insert into world_v2.runtime_opening_admission values($1,$2,$3,$4,$5,$6,$7)',
        [world, 'SEED_TEST_ONLY', seed, admission, replay, 'TEST_ONLY', at],
      );
      await db.query('insert into world_v2.opening_seed values($1,$2,$3,$4)', [
        world,
        'SEED_TEST_ONLY',
        seed,
        replay,
      ]);
      await db.query(
        'insert into world_v2.runtime_admission_publication_permit values($1,$2,$3,$4,$5,$6,$7,$8,$9)',
        [
          'PERMIT_TEST_ONLY',
          'a'.repeat(64),
          world,
          'SEED_TEST_ONLY',
          seed,
          'TEST_ONLY',
          replay,
          '2026-10-28T00:00:00.000Z',
          '2026-10-30T00:00:00.000Z',
        ],
      );
      await db.query(
        'insert into world_v2.social_operating_source_registration values($1,$2,$3,$4,$5)',
        [world, 'COUNTRY_01', 'REG_TEST_ONLY', seed, admission],
      );
      await db.query(
        "insert into world_v2.social_operating_match_publisher values($1,'COUNTRY_01','GRANT_TEST_ONLY','REG_TEST_ONLY',$2,'world_v2_social_source_publisher','ACTOR_AUTOMATIC_TEST_ONLY','22222222-2222-4222-8222-222222222222','SOCIAL_JOB_MATCH_RULE_V1',0,1)",
        [world, admission],
      );
      for (const f of frames) await insertFrame(db, f);
      const pages = [frames.slice(0, 256), frames.slice(256)];
      const make = (cov = coverage(pages), version = '257') =>
        C.canonicalSerialize({
          schemaVersion: 'postwar-paged-match-publication-v1',
          seedPins: {
            worldId: world,
            seedId: 'SEED_TEST_ONLY',
            seedFingerprint: seed,
            admissionRef: admission,
          },
          head: {
            worldId: world,
            worldVersion: version,
            eventSequence: version,
          },
          planState: 'PENDING',
          plan: {
            commandId: p.command.commandId,
            commandFingerprint: p.command.fingerprint,
            canonicalPayload: p.command.canonicalPayload,
          },
          coverage: cov,
        });
      const issue = async (witness = make()) => {
        await db.exec(
          'begin isolation level repeatable read;set local role world_v2_social_source_publisher',
        );
        try {
          const r = await db.query<Record<string, unknown>>(
            'select * from world_v2.publish_social_operating_paged_match_due($1,$2,$3,$4)',
            [world, 'COUNTRY_01', p.command.commandId, witness],
          );
          await db.exec('commit');
          return r.rows[0]!;
        } catch (e) {
          await db.exec('rollback');
          throw e;
        }
      };
      await expect(
        issue(
          make({
            ...coverage(pages),
            prefixFingerprint: 'sha256:' + 'f'.repeat(64),
          }),
        ),
      ).rejects.toThrow('PAGE_CHAIN_MISMATCH');
      await expect(
        issue(make(coverage([frames.slice(0, 256)]))),
      ).rejects.toThrow('PAGE_CHAIN_MISMATCH');
      // Unknown commands must be present in the actual page stream and deny;
      // their absence is never manufactured with a family WHERE filter.
      await db.exec('begin isolation level repeatable read');
      try {
        const unknown = budget(257, 'UNKNOWN_TEST_ONLY_FAMILY');
        await insertFrame(db, unknown);
        await db.query(
          'update world_v2.world_head set world_version=258,event_sequence=258 where world_id=$1',
          [world],
        );
        await db.exec('set local role world_v2_social_source_publisher');
        await expect(
          db.query(
            'select * from world_v2.publish_social_operating_paged_match_due($1,$2,$3,$4)',
            [
              world,
              'COUNTRY_01',
              p.command.commandId,
              make(
                coverage([frames.slice(0, 256), [frames[256]!, unknown]]),
                '258',
              ),
            ],
          ),
        ).rejects.toThrow('UNKNOWN_COMPLETE_PREFIX_FAMILY');
      } finally {
        await db.exec('rollback');
      }
      await db.query(
        'insert into world_v2.runtime_admission_publication_revocation values($1)',
        ['PERMIT_TEST_ONLY'],
      );
      await expect(issue()).rejects.toThrow('ADMISSION_REVOKED');
      await db.query(
        'delete from world_v2.runtime_admission_publication_revocation where authorization_id=$1',
        ['PERMIT_TEST_ONLY'],
      );
      const first = await issue();
      expect(first.expected_world_version).toBe(257);
      expect(first.office_id).toBeNull();
      expect((await issue()).command_fingerprint).toBe(
        first.command_fingerprint,
      );
      expect(
        (
          await db.query<{ n: string }>(
            'select count(*)::text n from world_v2.command_queue',
          )
        ).rows[0]!.n,
      ).toBe('1');
      const acl = await db.query<{
        publisher_raw: boolean;
        reader_publish: boolean;
        publisher_private_page: boolean;
        owner_private_page: boolean;
      }>(
        "select has_table_privilege('world_v2_social_source_publisher','world_v2.authoritative_event','SELECT') publisher_raw,has_function_privilege('world_v2_social_source_reader','world_v2.publish_social_operating_paged_match_due(text,text,text,text)','EXECUTE') reader_publish,has_function_privilege('world_v2_social_source_publisher','world_v2.read_postwar_social_match_prefix_page(text,text,bigint,bigint,bigint,bigint,text,text)','EXECUTE') publisher_private_page,has_function_privilege('world_v2_social_source_owner','world_v2.read_postwar_social_match_prefix_page(text,text,bigint,bigint,bigint,bigint,text,text)','EXECUTE') owner_private_page",
      );
      expect(acl.rows[0]).toEqual({
        publisher_raw: false,
        reader_publish: false,
        publisher_private_page: false,
        owner_private_page: true,
      });
      await db.query(
        'insert into world_v2.social_operating_source_revocation values($1)',
        ['REG_TEST_ONLY'],
      );
      await expect(issue()).rejects.toThrow('CURRENT_SOURCE');
    } finally {
      await db.close();
    }
  });
});
