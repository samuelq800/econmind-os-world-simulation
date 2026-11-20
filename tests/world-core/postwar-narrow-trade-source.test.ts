/** Actual admitted-source source matching, never a synthetic GCU endowment. */
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import {
  authenticateIdentity,
  authorizeOfficeCapability,
  authSubject,
  teamId,
  countryId,
  officeId,
  worldId,
  actorId,
  parseCanonicalCommand,
  COMMAND_SCHEMA_VERSION,
  type MembershipSnapshot,
} from '@econmind/core';
import {
  createPostwarNarrowTradeFreshSourceGuard,
  PostwarNarrowTradeSourceMissing,
} from '../../apps/world-worker/src/persistence/postwar-narrow-trade-source.js';
import {
  PostgresNarrowTransferIntake,
  createPostwarNarrowTransferIntake,
} from '../../apps/world-worker/src/intake/postgres-narrow-transfer-intake.js';
import type {
  SqlDatabase,
  SqlExecutor,
} from '../../apps/world-worker/src/persistence/sql-database.js';
import {
  loadPostwarNativeReferenceMarker,
  clonePostwarNativeReference,
} from '../support/postwar-native-reference-db.js';
const descriptorPath = process.env.ECONMIND_POSTWAR_NARROW_TRADE_REFERENCE;
const native = descriptorPath ? describe : describe.skip;
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
describe('postwar narrow Trade fixed server guard boundary', () => {
  it('refuses a caller-created ready callback at the intake constructor', () => {
    let queried = false;
    const database: SqlDatabase = {
      query: async () => {
        queried = true;
        throw Error('MUST_NOT_QUERY');
      },
      transaction: async () => {
        queried = true;
        throw Error('MUST_NOT_TRANSACTION');
      },
    };
    expect(
      () =>
        new PostgresNarrowTransferIntake({
          database,
          sha256Hex: sha,
          postwarSource: {
            mode: 'POSTWAR_ADMITTED_H0',
            guard: {
              inspectFrom: async () => ({ kind: 'SOURCE_MATCH', binding: {} }),
              assertFrom: async () => {},
            } as never,
          },
        }),
    ).toThrow('registered server-owned');
    expect(queried).toBe(false);
  });
  it('does not admit elevated/public runtime roles', () => {
    for (const runtimeRole of [
      'postgres',
      'service_role',
      'authenticated',
      'anon',
      'x;grant',
    ])
      expect(() =>
        createPostwarNarrowTradeFreshSourceGuard({ runtimeRole }),
      ).toThrow('fixed separated');
  });
});
native('actual postwar narrow Trade source compatibility', () => {
  it('inspects original held H0 account classes/currencies and GRAIN ownership without adding assets', async () => {
    const d = JSON.parse(await readFile(descriptorPath!, 'utf8')) as {
      referenceMarker: string;
      templateDatabase: string;
    };
    const marker = await loadPostwarNativeReferenceMarker(d.referenceMarker);
    const clone = await clonePostwarNativeReference(
      marker,
      'narrow_trade_source',
      d.templateDatabase,
    );
    try {
      const result = await clone.installer.query(
        `with root as(
        select canonical_payload::jsonb as j,seed_fingerprint from world_v2.opening_seed where world_id=$1
      ),accounts as(select distinct on(l->'account'->>'accountId')l->'account' as a from root cross join lateral jsonb_array_elements(j->'financialBatches')b cross join lateral jsonb_array_elements(b->'legs')l order by l->'account'->>'accountId'),
      classes as(select a->>'accountClass'as class,a->>'currency'as currency,count(*)::text as count from accounts group by 1,2),
      grain as(select x from root cross join lateral jsonb_array_elements(j->'inventoryEntries')x where x->'account'->>'commodityId'='GRAIN')
      select(select seed_fingerprint from root)as fingerprint,
        (select coalesce(jsonb_agg(to_jsonb(c)order by class,currency),'[]'::jsonb)from classes c)as account_classes,
        (select count(*)::text from accounts where a->>'accountClass'='CASH'and a->>'currency'='GCU')as gcu_cash_accounts,
        (select count(*)::text from grain)as grain_entries,
        (select count(distinct x->'account'->>'countryId')::text from grain)as grain_countries,
        (select x from grain where x->'account'->>'countryId'=$2)as grain_sample,
        (select jsonb_agg(v)from(select x->'account'->>'titleHolderId'as owner,count(*)::text as count from grain group by 1 order by 1)v)as grain_owners`,
        [marker.worldId, marker.countryId],
      );
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].fingerprint).toBe(marker.seedFingerprint);
      expect(result.rows[0].gcu_cash_accounts).toBe('0');
      expect(result.rows[0].grain_entries).toBe('70');
      expect(result.rows[0].grain_countries).toBe('70');
      const audit = result.rows[0];
      await clone.installer.query(
        await readFile(
          new URL(
            '../../database/proposals/postwar-narrow-trade-source.sql',
            import.meta.url,
          ),
          'utf8',
        ),
      );
      // Exact local fixture role only. This grants row-lock columns, not an
      // ability to INSERT commands/queue or a production role membership.
      await clone.installer.query(
        `grant world_v2_postwar_narrow_trade_source to ${marker.roles.readerRole};grant update(command_id)on world_v2.command_submission to ${marker.roles.readerRole};grant update(world_version)on world_v2.world_head to ${marker.roles.readerRole};grant update(authorization_version)on world_v2.current_commit_authorization to ${marker.roles.readerRole}`,
      );
      const membership = async (): Promise<MembershipSnapshot | null> => {
        const r = await clone.installer.query(
          'select distinct country_id,team_id,authorization_version,office_id from world_v2.current_commit_authorization where world_id=$1 and auth_subject=$2::uuid and active',
          [marker.worldId, marker.subject],
        );
        if (
          !r.rows.length ||
          new Set(
            r.rows.map(
              (v) => `${v.country_id}/${v.team_id}/${v.authorization_version}`,
            ),
          ).size !== 1
        )
          return null;
        return {
          authSubject: authSubject(marker.subject),
          worldId: worldId(marker.worldId),
          countryId: countryId(r.rows[0].country_id),
          teamId: teamId(r.rows[0].team_id),
          authorizationVersion: r.rows[0].authorization_version,
          officeAssignments: r.rows.map((v) => officeId(v.office_id)),
          active: true,
          suspended: false,
          isWorldAdmin: false,
          negotiationPartyIds: [],
        };
      };
      const principal = await authenticateIdentity({
        token: 'TEST_ONLY_NATIVE_SOURCE_PRINCIPAL',
        profile: {
          user_id: marker.subject,
          display_name: null,
          school_id: null,
        },
        verifier: {
          verify: async () => ({
            subject: marker.subject,
            issuer: 'TEST_ONLY',
            audience: 'TEST_ONLY',
            issuedAt: '2026-10-28T12:00:00.000Z',
            expiresAt: '2026-10-29T12:00:00.000Z',
          }),
        },
      });
      const authorization = await authorizeOfficeCapability({
        principal,
        resolver: {
          resolveCurrentIdentity: async () =>
            (await membership()) ? principal.authSubject : null,
          resolveCurrentMembership: membership,
        },
        worldId: worldId(marker.worldId),
        requestedCountryId: countryId(marker.countryId),
        requestedOfficeId: officeId('TRADE'),
        capability: 'TRADE_CONTRACTS',
      });
      const account = audit.grain_sample.account as Record<
        string,
        string | null
      >;
      const command = parseCanonicalCommand(
        {
          schemaVersion: COMMAND_SCHEMA_VERSION,
          commandId: 'COMMAND_POSTWAR_NARROW_NATIVE_MISSING',
          commandType: 'CORE_GOODS_TRANSFER_V1',
          actorId: 'ACTOR_POSTWAR_NARROW_TEST_ONLY',
          authSubject: marker.subject,
          correlationId: 'CORRELATION_POSTWAR_NARROW_NATIVE',
          worldId: marker.worldId,
          countryId: marker.countryId,
          officeId: 'TRADE',
          expectedWorldVersion: '0',
          idempotencyKey: 'IDEM_POSTWAR_NARROW_NATIVE_MISSING',
          simTime: '0',
          submittedAtReal: '2026-10-28T12:00:00.000Z',
          payload: {
            schemaVersion: 'core-goods-transfer-v1',
            commodityId: 'GRAIN',
            sellerCountryId: marker.countryId,
            buyerCountryId: 'COUNTRY_02',
            quantity: { amount: '1', unit: account.unit },
            price: { amount: '1', currency: 'GCU', perUnit: account.unit },
            threshold: {
              policyVersion: 'V10_TREASURY_GCU_THRESHOLD_V1',
              maxSettlement: { amount: '6', currency: 'GCU' },
            },
            assetSource: {
              batchId: account.batchId,
              physicalLocationId: account.physicalLocationId,
              titleHolderId: account.titleHolderId,
              riskBearerId: account.riskBearerId,
              economicRecognitionId: account.economicRecognitionId,
            },
            paymentSource: 'BUYER_TREASURY_GCU',
            policyVersion: 'V10_TREASURY_GCU_V1',
            expiresAtReal: '2026-10-29T12:00:00.000Z',
          },
        },
        sha,
      );
      const database: SqlDatabase = {
        async query<Row extends object>(
          sql: string,
          args: readonly unknown[] = [],
        ) {
          const r = await clone.reader.query<Row>(sql, [...args]);
          return { rows: r.rows, rowCount: r.rowCount };
        },
        async transaction<T>(op: (tx: SqlExecutor) => Promise<T>) {
          const client = await clone.reader.connect();
          try {
            await client.query('begin');
            await client.query(
              "select set_config('request.jwt.claim.sub',$1,true)",
              [marker.subject],
            );
            const value = await op({
              async query<Row extends object>(
                sql: string,
                args: readonly unknown[] = [],
              ) {
                const r = await client.query<Row>(sql, [...args]);
                return { rows: r.rows, rowCount: r.rowCount };
              },
            });
            await client.query('commit');
            return value;
          } catch (e) {
            await client.query('rollback');
            throw e;
          } finally {
            client.release();
          }
        },
      };
      const intake = createPostwarNarrowTransferIntake({
        database,
        sha256Hex: sha,
        runtimeRole: marker.roles.readerRole,
      });
      expect(intake.sourceBoundary).toBe('POSTWAR_ORIGINALS_REQUIRED');
      const input = {
        command,
        scope: {
          actorId: actorId('ACTOR_POSTWAR_NARROW_TEST_ONLY'),
          authorization,
        },
        observedAtReal: '2026-10-28T12:00:00.000Z',
      };
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          await intake.submitPending(input);
          throw Error('MUST_NOT_REGISTER_WITHOUT_SOURCE');
        } catch (error) {
          expect(error).toBeInstanceOf(PostwarNarrowTradeSourceMissing);
          if (error instanceof PostwarNarrowTradeSourceMissing)
            expect(error.result.missing).toEqual([
              'BUYER_TREASURY_GCU_CASH',
              'SELLER_OWNER_GCU_CASH',
              'SELLER_OWNER_TRANSFER_MANDATE',
              'ADMITTED_CROSS_BORDER_ROUTE',
            ]);
        }
      }
      expect(await intake.read(input)).toEqual({ status: 'NOT_FOUND' });
      await expect(
        database.transaction((tx) =>
          tx.query(
            'select * from world_v2.postwar_narrow_trade_rights_admission',
          ),
        ),
      ).rejects.toMatchObject({ code: '42501' });
      await expect(
        database.transaction((tx) =>
          tx.query(
            'insert into world_v2.postwar_narrow_trade_rights_admission default values',
          ),
        ),
      ).rejects.toMatchObject({ code: '42501' });
      await expect(
        database.transaction((tx) =>
          tx.query(
            'select * from world_v2.read_postwar_narrow_trade_source($1,$2,$3,$4,$5,$6,$7)',
            [
              marker.worldId,
              'COUNTRY_02',
              'COUNTRY_03',
              account.batchId,
              marker.subject,
              authorization.teamId,
              authorization.authorizationVersion,
            ],
          ),
        ),
      ).rejects.toMatchObject({ code: '42501' });
      await clone.installer.query(
        'drop function world_v2.read_postwar_narrow_trade_source(text,text,text,text,uuid,text,text)',
      );
      try {
        await intake.submitPending(input);
        throw Error('MUST_NOT_REGISTER_WITHOUT_NATIVE_CUSTODY');
      } catch (error) {
        expect(error).toBeInstanceOf(PostwarNarrowTradeSourceMissing);
        if (error instanceof PostwarNarrowTradeSourceMissing)
          expect(error.result.missing).toEqual([
            'NATIVE_SOURCE_CUSTODY_NOT_INSTALLED',
          ]);
      }
      const counts = await clone.installer.query(
        'select(select count(*)::text from world_v2.command_submission where world_id=$1 and command_id=$2)as commands,(select count(*)::text from world_v2.command_queue where world_id=$1 and command_id=$2)as queue',
        [marker.worldId, command.commandId],
      );
      expect(counts.rows[0]).toEqual({ commands: '0', queue: '0' });
      console.log(
        JSON.stringify({
          classification:
            'TEST_ONLY_ACTUAL_ADMITTED_H0_SOURCE_MATCH_NOT_TRADE_ACCEPTANCE',
          fingerprint: audit.fingerprint,
          gcuCashAccounts: audit.gcu_cash_accounts,
          grainEntries: audit.grain_entries,
          grainCountries: audit.grain_countries,
          classes: [
            ...new Set(
              (audit.account_classes as { class: string }[]).map(
                (v) => v.class,
              ),
            ),
          ],
          nativeRegister: 'MISSING',
          commands: '0',
          queue: '0',
          read: 'NOT_FOUND',
          sourceRegenerated: false,
          cashCreated: false,
        }),
      );
    } finally {
      await clone.drop();
    }
  }, 60000);
});
