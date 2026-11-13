import {
  createPostwarIndustryUtilisationTargetsReader,
  type PostwarIndustryUtilisationTargetsReader,
} from './postwar-industry-utilisation-targets-read.js';
import {
  createPostwarIndustryCommittedRunsReader,
  type PostwarIndustryCommittedRunsPage,
} from './postwar-industry-committed-runs-read.js';
/** Fixed server-only planning DATA reader. One held transaction and genuine
 * replay context for all services; never a caller-supplied source or executor. */
import { createHash } from 'node:crypto';
import { canonicalSerialize } from '@econmind/core';
import {
  parseIndustryUtilityPlanningRow,
  type IndustryUtilityPlanningRow,
  type IndustryUtilityPlanningCoverage,
} from '@econmind/core/postwar-industry-utility-planning-contract';
import {
  isPostwarFinanceSocialRuntimeConnection,
  readPostwarFinanceSocialRuntimeBinding,
  type PostwarFinanceSocialRuntimeConnection,
} from '../runtime-preparation/finance-social-runtime-connection.js';
import { readPostwarSocialRuntimeConnectionResources } from '../runtime-preparation/social-runtime-connection.js';
import {
  readPostwarIndustryRunStateFrom,
  consumePostwarIndustryRunStateFrom,
  releasePostwarIndustryRunStateContext,
} from './postwar-industry-run-state.js';

type Head = Readonly<{ worldVersion: string; eventSequence: string }>;
export type PostwarIndustryUtilityPlanningPage =
  | Readonly<{ status: 'STALE' | 'UNAVAILABLE'; code: string }>
  | Readonly<{
      status: 'PAGE' | 'EMPTY';
      source: Readonly<{
        worldId: string;
        countryId: string;
        seedId: string;
        seedFingerprint: string;
        admissionRef: string;
        worldVersion: string;
        eventSequence: string;
        sourceVersion: string;
        originWorldVersion: string;
        originEventSequence: string;
        observedHead: Head;
        pageHash: string;
        returnedRowsHash: string;
        hashAlgorithm: 'POSTGRES_JSONB_TEXT_UTF8_SHA256';
        sourcePointer: Readonly<{
          rowOrigin: 'fixed-industry-utility-planning-runtime';
          rowBinding: 'planningRef+sourceRef+sourceRawSha256';
        }>;
        currentIndustryUtilityPlanningCoverage: IndustryUtilityPlanningCoverage;
      }>;
      page: Readonly<{
        offset: number;
        limit: number;
        returned: number;
        total: number;
        nextOffset: number | null;
      }>;
      rows: readonly IndustryUtilityPlanningRow[];
    }>;
export interface PostwarIndustryUtilityPlanningReader {
  readCommittedRunsPage?(
    input: Readonly<{
      countryId: string;
      expectedHead: Head;
      offset?: number;
      limit?: number;
      expectedVersion?: string;
    }>,
  ): Promise<PostwarIndustryCommittedRunsPage>;
  readPage(
    input: Readonly<{
      countryId: string;
      expectedHead: Head;
      offset?: number;
      limit?: number;
      expectedVersion?: string;
    }>,
  ): Promise<PostwarIndustryUtilityPlanningPage>;
  readUtilisationTargetsPage?: PostwarIndustryUtilisationTargetsReader['readPage'];
}
const readers = new WeakMap<
  object,
  Readonly<PostwarFinanceSocialRuntimeConnection>
>();
const hash = (v: unknown) =>
  'sha256:' +
  createHash('sha256')
    .update('SHA-256\n' + canonicalSerialize(v))
    .digest('hex');
const fp = (v: unknown): v is string =>
  typeof v === 'string' && /^sha256:[a-f0-9]{64}$/u.test(v);
const uint = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^(0|[1-9][0-9]*)$/u.test(v) &&
  BigInt(v) <= 9223372036854775807n;
export function isPostwarIndustryUtilityPlanningReader(
  value: unknown,
  worldId: string,
): value is Readonly<PostwarIndustryUtilityPlanningReader> {
  if (!value || typeof value !== 'object') return false;
  const binding = readers.get(value);
  return !!binding && isPostwarFinanceSocialRuntimeConnection(binding, worldId);
}
export function createPostwarIndustryUtilityPlanningReader(
  config: Readonly<{
    binding: Readonly<PostwarFinanceSocialRuntimeConnection>;
  }>,
): Readonly<PostwarIndustryUtilityPlanningReader> {
  const initial = readPostwarFinanceSocialRuntimeBinding(config.binding);
  const committedRuns = createPostwarIndustryCommittedRunsReader(config);
  const reader: Readonly<PostwarIndustryUtilityPlanningReader> = Object.freeze({
    readCommittedRunsPage: committedRuns.readPage,
    readUtilisationTargetsPage:
      createPostwarIndustryUtilisationTargetsReader(config).readPage,
    async readPage(
      input: Parameters<PostwarIndustryUtilityPlanningReader['readPage']>[0],
    ): Promise<PostwarIndustryUtilityPlanningPage> {
      if (!isPostwarIndustryUtilityPlanningReader(reader, initial.worldId))
        throw Error('INDUSTRY_PLANNING_LIVE_BINDING_REQUIRED');
      const ports = readPostwarFinanceSocialRuntimeBinding(config.binding),
        offset = input.offset ?? 0,
        limit = input.limit ?? 25;
      if (
        !Number.isSafeInteger(offset) ||
        offset < 0 ||
        offset > 100000 ||
        !Number.isSafeInteger(limit) ||
        limit < 1 ||
        limit > 100 ||
        !uint(input.expectedHead.worldVersion) ||
        !uint(input.expectedHead.eventSequence) ||
        (offset > 0 && !input.expectedVersion) ||
        (input.expectedVersion !== undefined && !fp(input.expectedVersion))
      )
        throw Error('INDUSTRY_PLANNING_EXACT_BOUNDED_PAGE_REQUIRED');
      if (!ports.industryUtility || !ports.industryLogistics)
        return {
          status: 'UNAVAILABLE',
          code: 'INDUSTRY_UTILITY_RUNTIME_NOT_INSTALLED',
        };
      const utility = ports.industryUtility,
        logistics = ports.industryLogistics;
      const scope = utility.readPlanningScope(input.countryId);
      if (!scope)
        return {
          status: 'UNAVAILABLE',
          code: 'INDUSTRY_UTILITY_REGISTERED_SCOPE_REQUIRED',
        };
      const resources = readPostwarSocialRuntimeConnectionResources(
        ports.socialConnection,
      );
      if (
        !resources.countryIds.includes(input.countryId) ||
        !/^[a-z][a-z0-9_]{0,62}$/u.test(resources.workerRole)
      )
        throw Error('INDUSTRY_PLANNING_FIXED_HOST_SCOPE_REQUIRED');
      return ports.database.transaction(async (tx) => {
        // The genuine shared database sets REPEATABLE READ and acquires its
        // source-revocation fence before entering this callback. Do not issue
        // another SET TRANSACTION after that first snapshot query.
        await tx.query('set local role "' + resources.workerRole + '"');
        const head = await tx.query<{
          world_version: string;
          event_sequence: string;
        }>(
          'select world_version::text,event_sequence::text from world_v2.world_head where world_id=$1 for share',
          [ports.worldId],
        );
        if (
          head.rows.length !== 1 ||
          head.rows[0]?.world_version !== input.expectedHead.worldVersion ||
          head.rows[0]?.event_sequence !== input.expectedHead.eventSequence
        )
          return {
            status: 'STALE',
            code: 'INDUSTRY_UTILITY_HEAD_CHANGED',
          } as const;
        const context = await readPostwarIndustryRunStateFrom(tx, {
          socialConnection: ports.socialConnection,
          worldId: ports.worldId,
          countryId: input.countryId,
          facilityId: scope.facilityId,
          expectedHead: input.expectedHead,
        });
        try {
          const facts = consumePostwarIndustryRunStateFrom(tx, context);
          const request = {
            countryId: input.countryId,
            expectedHead: input.expectedHead,
            context,
          };
          const a = await utility.readPlanningFrom(tx, request),
            c = await logistics.readPlanningFrom(tx, request);
          for (const part of [a, c])
            if (
              part.head.worldVersion !== facts.head.worldVersion ||
              part.head.eventSequence !== facts.head.eventSequence ||
              part.prefixFingerprint !== facts.prefixFingerprint ||
              part.pageChainFingerprint !== facts.pageChainFingerprint ||
              !fp(part.sourceOriginalsFingerprint)
            )
              throw Error('INDUSTRY_PLANNING_EXACT_SHARED_PREFIX_REQUIRED');
          const rows = [...a.rows, ...c.rows]
            .map(parseIndustryUtilityPlanningRow)
            .sort((x, y) =>
              x.planningRef < y.planningRef
                ? -1
                : x.planningRef > y.planningRef
                  ? 1
                  : 0,
            );
          if (
            rows.length > 4096 ||
            new Set(rows.map((r) => r.planningRef)).size !== rows.length ||
            rows.some(
              (r) =>
                r.countryId !== input.countryId ||
                r.facilityId !== scope.facilityId,
            )
          )
            throw Error('INDUSTRY_PLANNING_BOUNDED_UNIQUE_SCOPE_REQUIRED');
          const selected = rows.slice(offset, offset + limit),
            allText = canonicalSerialize(rows),
            selectedText = canonicalSerialize(selected);
          if (
            Buffer.byteLength(allText) > 16777216 ||
            Buffer.byteLength(selectedText) > 1048576
          )
            throw Error('INDUSTRY_PLANNING_PAGE_BYTES_EXCEEDED');
          const hashes = await tx.query<{
            all_hash: string;
            page_hash: string;
          }>(
            "select encode(sha256(convert_to($1::jsonb::text,'UTF8')),'hex') as all_hash,encode(sha256(convert_to($2::jsonb::text,'UTF8')),'hex') as page_hash",
            [allText, selectedText],
          );
          const hashesRow = hashes.rows[0];
          if (
            hashes.rows.length !== 1 ||
            !hashesRow ||
            !/^[a-f0-9]{64}$/u.test(hashesRow.all_hash) ||
            !/^[a-f0-9]{64}$/u.test(hashesRow.page_hash)
          )
            throw Error('INDUSTRY_PLANNING_ACTUAL_SQL_HASH_REQUIRED');
          const coverage: IndustryUtilityPlanningCoverage = {
            schemaVersion: 'postwar-industry-utility-planning-coverage-v1',
            reducerVersion:
              'POSTWAR_INDUSTRY_UTILITY_PLANNING_COMPLETE_PREFIX_V1',
            countryId: input.countryId,
            globalWorldVersion: facts.head.worldVersion,
            globalEventSequence: facts.head.eventSequence,
            prefixFingerprint: facts.prefixFingerprint,
            pageChainFingerprint: facts.pageChainFingerprint,
            sourceOriginalsFingerprint: hash([
              a.sourceOriginalsFingerprint,
              c.sourceOriginalsFingerprint,
            ]),
            planningRowsFingerprint: hash(rows),
          };
          const sourceVersion = hash({
            worldId: ports.worldId,
            seedPins: facts.seedPins,
            coverage,
            rowsHash: hashesRow.all_hash,
          });
          if (
            input.expectedVersion !== undefined &&
            input.expectedVersion !== sourceVersion
          )
            return {
              status: 'STALE',
              code: 'INDUSTRY_UTILITY_PAGE_VERSION_CHANGED',
            } as const;
          return {
            status: selected.length ? 'PAGE' : 'EMPTY',
            source: {
              worldId: ports.worldId,
              countryId: input.countryId,
              seedId: facts.seedPins.seedId,
              seedFingerprint: facts.seedPins.seedFingerprint,
              admissionRef: facts.seedPins.admissionRef,
              worldVersion: facts.head.worldVersion,
              eventSequence: facts.head.eventSequence,
              sourceVersion,
              originWorldVersion: '0',
              originEventSequence: '0',
              observedHead: input.expectedHead,
              pageHash: hashesRow.page_hash,
              returnedRowsHash: hashesRow.page_hash,
              hashAlgorithm: 'POSTGRES_JSONB_TEXT_UTF8_SHA256',
              sourcePointer: {
                rowOrigin: 'fixed-industry-utility-planning-runtime',
                rowBinding: 'planningRef+sourceRef+sourceRawSha256',
              },
              currentIndustryUtilityPlanningCoverage: coverage,
            },
            page: {
              offset,
              limit,
              returned: selected.length,
              total: rows.length,
              nextOffset:
                offset + selected.length < rows.length
                  ? offset + selected.length
                  : null,
            },
            rows: selected,
          } as const;
        } finally {
          releasePostwarIndustryRunStateContext(context);
        }
      });
    },
  });
  readers.set(reader, config.binding);
  return reader;
}
