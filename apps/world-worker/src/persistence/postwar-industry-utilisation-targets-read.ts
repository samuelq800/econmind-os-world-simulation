/** Fixed server-only committed utilisation-target reader. One held transaction and
 * genuine replay; registered facility scope, never caller-provided authority. */
import { createHash } from 'node:crypto';
import { canonicalSerialize } from '@econmind/core';
import { readIndustryFirstDayWorkState } from '@econmind/core/industry-first-day-work';
import {
  parseIndustryUtilisationTargetRow,
  type IndustryUtilisationTargetRow,
  type IndustryUtilisationTargetsCoverage,
} from '@econmind/core/postwar-industry-utilisation-targets-contract';
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
export type PostwarIndustryUtilisationTargetsPage =
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
          rowOrigin: 'fixed-industry-utilisation-targets-runtime';
          rowBinding: 'facilityId+commandFingerprint+eventFingerprint';
        }>;
        currentIndustryUtilisationTargetsCoverage: IndustryUtilisationTargetsCoverage;
      }>;
      page: Readonly<{
        offset: number;
        limit: number;
        returned: number;
        total: number;
        nextOffset: number | null;
      }>;
      rows: readonly IndustryUtilisationTargetRow[];
    }>;
export interface PostwarIndustryUtilisationTargetsReader {
  readPage(
    input: Readonly<{
      countryId: string;
      expectedHead: Head;
      offset?: number;
      limit?: number;
      expectedVersion?: string;
    }>,
  ): Promise<PostwarIndustryUtilisationTargetsPage>;
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
export function isPostwarIndustryUtilisationTargetsReader(
  value: unknown,
  worldId: string,
): value is Readonly<PostwarIndustryUtilisationTargetsReader> {
  if (!value || typeof value !== 'object') return false;
  const binding = readers.get(value);
  return !!binding && isPostwarFinanceSocialRuntimeConnection(binding, worldId);
}
/** Pure DATA projection only. Currentness and source custody are established
 * separately by the held genuine replay used by the reader below. */
export function projectIndustryUtilisationTargetRows(
  state: ReturnType<typeof readIndustryFirstDayWorkState>,
  countryId: string,
  facilityId: string,
): readonly Readonly<IndustryUtilisationTargetRow>[] {
  return state.utilisationTargets
    .filter(
      (r) =>
        r.source.countryId === countryId && r.source.facilityId === facilityId,
    )
    .map((r) => {
      if (
        r.frame.receipt.outcome !== 'COMMITTED' ||
        r.frame.events.length !== 1
      )
        throw Error('INDUSTRY_TARGETS_COMMITTED_SCHEDULE_REQUIRED');
      const event = r.frame.events[0]!;
      return parseIndustryUtilisationTargetRow({
        schemaVersion: 'postwar-industry-utilisation-target-row-v1',
        countryId: r.source.countryId,
        facilityId: r.source.facilityId,
        targetPercent: r.terms.targetPercent,
        startsAtSimTime: r.terms.startsAtSimTime,
        endsAtSimTime: r.terms.endsAtSimTime,
        sourceRef: r.terms.sourceRef,
        sourceRawSha256: r.terms.sourceRawSha256,
        commandId: r.frame.command.commandId,
        commandFingerprint: r.frame.command.fingerprint,
        eventId: event.eventId,
        eventFingerprint: event.fingerprint,
        committedWorldVersion: event.worldVersion,
        measurement:
          'COMMITTED_TARGET_INTENT_NOT_PRODUCTION_RESERVATION_OR_FEASIBILITY',
      });
    })
    .sort((x, y) =>
      x.facilityId < y.facilityId ? -1 : x.facilityId > y.facilityId ? 1 : 0,
    );
}
export function createPostwarIndustryUtilisationTargetsReader(
  config: Readonly<{
    binding: Readonly<PostwarFinanceSocialRuntimeConnection>;
  }>,
): Readonly<PostwarIndustryUtilisationTargetsReader> {
  const initial = readPostwarFinanceSocialRuntimeBinding(config.binding);
  const reader: Readonly<PostwarIndustryUtilisationTargetsReader> =
    Object.freeze({
      async readPage(
        input: Parameters<
          PostwarIndustryUtilisationTargetsReader['readPage']
        >[0],
      ): Promise<PostwarIndustryUtilisationTargetsPage> {
        if (!isPostwarIndustryUtilisationTargetsReader(reader, initial.worldId))
          throw Error('INDUSTRY_TARGETS_LIVE_BINDING_REQUIRED');
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
          throw Error('INDUSTRY_TARGETS_EXACT_BOUNDED_PAGE_REQUIRED');
        if (!ports.industryUtility)
          return {
            status: 'UNAVAILABLE',
            code: 'INDUSTRY_TARGETS_RUNTIME_NOT_INSTALLED',
          };
        const utility = ports.industryUtility;
        const scope = utility.readPlanningScope(input.countryId);
        if (!scope)
          return {
            status: 'UNAVAILABLE',
            code: 'INDUSTRY_TARGETS_REGISTERED_SCOPE_REQUIRED',
          };
        const resources = readPostwarSocialRuntimeConnectionResources(
          ports.socialConnection,
        );
        if (
          !resources.countryIds.includes(input.countryId) ||
          !/^[a-z][a-z0-9_]{0,62}$/u.test(resources.workerRole)
        )
          throw Error('INDUSTRY_TARGETS_FIXED_HOST_SCOPE_REQUIRED');
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
              code: 'INDUSTRY_TARGETS_HEAD_CHANGED',
            } as const;
          const capability = await tx.query<{ present: boolean }>(
            "select to_regprocedure('world_v2.postwar_utilisation_target_contract_version()') is not null as present",
          );
          if (capability.rows.length !== 1 || !capability.rows[0]?.present)
            return {
              status: 'UNAVAILABLE',
              code: 'INDUSTRY_TARGET_COMPLETE_PREFIX_CONTRACT_NOT_INSTALLED',
            } as const;
          await tx.query('set local role world_v2_industry_source_reader');
          const version = await tx.query<{ version: string }>(
            'select world_v2.postwar_utilisation_target_contract_version() as version',
          );
          await tx.query('set local role "' + resources.workerRole + '"');
          if (
            version.rows.length !== 1 ||
            version.rows[0]?.version !==
              'postwar-industry-utilisation-target-v1'
          )
            return {
              status: 'UNAVAILABLE',
              code: 'INDUSTRY_TARGET_COMPLETE_PREFIX_CONTRACT_NOT_INSTALLED',
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
            const rows = projectIndustryUtilisationTargetRows(
              readIndustryFirstDayWorkState(facts.workState),
              input.countryId,
              scope.facilityId,
            );
            if (
              rows.length > 1 ||
              new Set(rows.map((r) => r.facilityId)).size !== rows.length ||
              rows.some(
                (r) =>
                  r.countryId !== input.countryId ||
                  r.facilityId !== scope.facilityId,
              )
            )
              throw Error('INDUSTRY_TARGETS_BOUNDED_UNIQUE_SCOPE_REQUIRED');
            const selected = rows.slice(offset, offset + limit),
              allText = canonicalSerialize(rows),
              selectedText = canonicalSerialize(selected);
            if (
              Buffer.byteLength(allText) > 16777216 ||
              Buffer.byteLength(selectedText) > 1048576
            )
              throw Error('INDUSTRY_TARGETS_PAGE_BYTES_EXCEEDED');
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
              throw Error('INDUSTRY_TARGETS_ACTUAL_SQL_HASH_REQUIRED');
            const coverage: IndustryUtilisationTargetsCoverage = {
              schemaVersion: 'postwar-industry-utilisation-targets-coverage-v1',
              reducerVersion:
                'POSTWAR_INDUSTRY_UTILISATION_TARGETS_COMPLETE_PREFIX_V1',
              countryId: input.countryId,
              facilityId: scope.facilityId,
              globalWorldVersion: facts.head.worldVersion,
              globalEventSequence: facts.head.eventSequence,
              prefixFingerprint: facts.prefixFingerprint,
              pageChainFingerprint: facts.pageChainFingerprint,
              sourceOriginalsFingerprint: hash(facts.firstdayOriginal),
              targetRowsFingerprint: hash(rows),
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
                code: 'INDUSTRY_TARGETS_PAGE_VERSION_CHANGED',
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
                  rowOrigin: 'fixed-industry-utilisation-targets-runtime',
                  rowBinding: 'facilityId+commandFingerprint+eventFingerprint',
                },
                currentIndustryUtilisationTargetsCoverage: coverage,
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
