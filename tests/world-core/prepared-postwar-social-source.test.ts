import { describe, it, expect } from 'vitest';
import {
  createPostwarSocialSourcePreparation,
  preparePostwarSocialSource,
  readPreparedSocialOriginals,
  readSocialCanonicalLineageFrom,
  readPreparedPostwarSocialLineageFrom,
} from '../../apps/world-worker/src/persistence/prepared-postwar-social-source.js';
import { readBoundedPostwarSocialFramesFrom } from '../../apps/world-worker/src/persistence/bounded-postwar-social-lineage.js';
import type {
  SqlDatabase,
  SqlExecutor,
} from '../../apps/world-worker/src/persistence/sql-database.js';

describe('prepared Social source data boundary (protocol, not admission)', () => {
  it('unprepared/forged tokens and escaped lexical views cannot provide source data', async () => {
    const token = createPostwarSocialSourcePreparation();
    expect(() => readPreparedSocialOriginals(token)).toThrow(
      'SOURCE_NOT_PREPARED',
    );
    expect(() =>
      readSocialCanonicalLineageFrom(
        { query: async () => ({ rows: [], rowCount: 0 }) },
        {} as never,
      ),
    ).toThrow('forged');
    let queries = 0;
    const database: SqlDatabase = {
      query: async () => {
        queries++;
        throw Error('unexpected');
      },
      transaction: async () => {
        queries++;
        throw Error('unexpected');
      },
    };
    await expect(
      readPreparedPostwarSocialLineageFrom({
        preparation: token,
        executor: database,
        database,
        worldId: 'WORLD_TEST',
        countryId: 'COUNTRY_01',
      }),
    ).rejects.toThrow('SOURCE_NOT_PREPARED');
    await expect(
      preparePostwarSocialSource({
        preparation: {} as never,
        database,
        workerRole: 'worker_test',
        countryIds: ['COUNTRY_01'],
        configuration: {
          observedAtReal: '2026-10-29T00:00:00.000Z',
          modelVersion: 'MODEL_TEST',
          admittedWorldPins: {
            worldId: 'WORLD_TEST',
            seedRef: 'SEED_TEST',
            contentHash: 'sha256:' + '1'.repeat(64),
            admissionRef: 'ADMISSION_TEST',
          },
        },
      }),
    ).rejects.toThrow('GENUINE_PREPARATION_REQUIRED');
    expect(queries).toBe(0);
  });
  it('failed real preparation leaves no usable baseline and does not swallow the DB cause', async () => {
    const token = createPostwarSocialSourcePreparation(),
      failure = Error('actual backend unavailable');
    const database: SqlDatabase = {
      query: async () => {
        throw failure;
      },
      transaction: async () => {
        throw failure;
      },
    };
    const input = {
      preparation: token,
      database,
      workerRole: 'worker_test',
      countryIds: ['COUNTRY_01'],
      configuration: {
        observedAtReal: '2026-10-29T00:00:00.000Z',
        modelVersion: 'MODEL_TEST',
        admittedWorldPins: {
          worldId: 'WORLD_TEST',
          seedRef: 'SEED_TEST',
          contentHash: 'sha256:' + '1'.repeat(64),
          admissionRef: 'ADMISSION_TEST',
        },
      },
    };
    await expect(preparePostwarSocialSource(input)).rejects.toBe(failure);
    await expect(preparePostwarSocialSource(input)).rejects.toBe(failure);
    expect(() => readPreparedSocialOriginals(token)).toThrow(
      'SOURCE_NOT_PREPARED',
    );
  });
  it('bounded H0 protocol reads actual head/effect/event/receipt rows with no seed SQL', async () => {
    const statements: string[] = [];
    const executor: SqlExecutor = {
      query: async <Row extends object>(sql: string) => {
        statements.push(sql);
        let rows: unknown[];
        if (sql.includes('lock_social_operating_lineage_head'))
          rows = [{ world_version: '0', event_sequence: '0' }];
        else if (sql.includes('as financial'))
          rows = [{ financial: false, inventory: false }];
        else if (
          sql.includes('authoritative_event') ||
          sql.includes('command_receipt')
        )
          rows = [];
        else throw Error('unexpected SQL ' + sql);
        return { rows: rows as Row[], rowCount: rows.length };
      },
    };
    const database: SqlDatabase = {
      ...executor,
      transaction: async (consume) => consume(executor),
    };
    const result = await readBoundedPostwarSocialFramesFrom({
      executor,
      database,
      worldId: 'WORLD_TEST',
      countryId: 'COUNTRY_01',
    });
    expect(result.head).toEqual({ worldVersion: '0', eventSequence: '0' });
    expect(result.frames).toEqual([]);
    expect(statements).toHaveLength(4);
    expect(statements.every((s) => !s.includes('opening_seed'))).toBe(true);
  });
  it('unknown family, missing prefix rows, unsupported posting and bounds fail closed', async () => {
    for (const scenario of ['UNKNOWN', 'MISSING', 'POSTING', 'LIMIT']) {
      const executor: SqlExecutor = {
        query: async <Row extends object>(sql: string) => {
          let rows: unknown[];
          if (sql.includes('lock_social_operating_lineage_head'))
            rows = [
              {
                world_version:
                  scenario === 'LIMIT'
                    ? '257'
                    : scenario === 'POSTING'
                      ? '0'
                      : '1',
                event_sequence:
                  scenario === 'LIMIT'
                    ? '257'
                    : scenario === 'POSTING'
                      ? '0'
                      : '1',
              },
            ];
          else if (sql.includes('as financial'))
            rows = [{ financial: scenario === 'POSTING', inventory: false }];
          else if (sql.includes('count(*)')) rows = [{ count: '1' }];
          else if (sql.includes('from world_v2.financial_posting_batch'))
            rows = [
              {
                causation_command_id: 'COMMAND_ORPHAN_TEST_ONLY',
                canonical_payload: '{}',
                fingerprint: 'sha256:' + '1'.repeat(64),
              },
            ];
          else if (sql.includes('authoritative_event'))
            rows =
              scenario === 'UNKNOWN' ? [{ event_type: 'UNKNOWN_EVENT' }] : [];
          else throw Error('unexpected query');
          return { rows: rows as Row[], rowCount: rows.length };
        },
      };
      const database: SqlDatabase = {
        ...executor,
        transaction: async (consume) => consume(executor),
      };
      await expect(
        readBoundedPostwarSocialFramesFrom({
          executor,
          database,
          worldId: 'WORLD_TEST',
          countryId: 'COUNTRY_01',
        }),
      ).rejects.toThrow(
        scenario === 'UNKNOWN'
          ? 'unknown intervening family'
          : scenario === 'POSTING'
            ? 'posting set differs from complete canonical prefix'
            : scenario === 'LIMIT'
              ? 'bounded replay capacity exceeded'
              : 'complete bounded event prefix required',
      );
    }
  });
});
