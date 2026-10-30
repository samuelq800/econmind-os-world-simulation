/** Fixed server-only derived publication source. Genuine H0 DATA is reused;
 * current SQL H/admission/source and every complete frame are read each time.
 * No actor, candidate callback, seed/ledger DTO or Ready assertion is accepted. */
import { createHash } from 'node:crypto';
import {
  canonicalHashInput,
  canonicalSha256,
  canonicalSerialize,
  worldId,
  countryId,
  type FinancialLedgerState,
} from '@econmind/core';
import type { FinanceNativeBudgetCanonicalFrame } from '@econmind/core/finance-budget-native';
import {
  isPostwarSocialRuntimeConnection,
  readPostwarSocialRuntimeFinancialReplayBase,
  type PostwarSocialRuntimeConnection,
} from '../runtime-preparation/social-runtime-connection.js';
import { consumePreparedPostwarSocialFinancialReplayBase } from './prepared-postwar-social-source.js';
import { createPostwarSocialSourceRoleScope } from './postwar-social-position-runtime.js';
import { lockRegisteredSourceFrom } from './postgres-social-operating-custody.js';
import { readBoundedPostwarSocialFramesFrom } from './bounded-postwar-social-lineage.js';
import { replayPreparedPostwarFinanceSocialFxFrom } from './prepared-postwar-finance-social-fx-replay.js';
import type { SqlDatabase, SqlExecutor } from './sql-database.js';
import type { PostwarSocialEmploymentStateDocument } from '../preparation/postwar-social-employment-state.js';
import type { PreparedFinanceSocialFxReplayResult } from '@econmind/core/finance-social-prepared-ledger';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const hash = (v: unknown) => canonicalSha256(canonicalHashInput(v), sha);
declare const snapshot: unique symbol;
export interface PostwarMixedCurrentProjectionSnapshot {
  readonly [snapshot]: true;
}
export interface PostwarMixedCurrentProjectionCoverage {
  readonly prefixFingerprint: string;
  readonly knownEffectsFingerprint: string;
  readonly coveredThroughEventId: string;
  readonly coveredThroughEventFingerprint: string;
  /** Leg count and batch count are separate exact integer strings. */
  readonly financialPostingCount: string;
  readonly financialBatchCount: string;
  readonly financialPostingsFingerprint: string;
}
export interface PostwarMixedCurrentProjectionFacts {
  readonly countryId: string;
  readonly head: Readonly<{
    worldId: string;
    worldVersion: string;
    eventSequence: string;
  }>;
  readonly seedPins: Readonly<{
    worldId: string;
    seedId: string;
    seedFingerprint: string;
    admissionRef: string;
  }>;
  readonly financial: Readonly<FinancialLedgerState>;
  readonly shared: Readonly<{
    budget: Readonly<{
      state: PreparedFinanceSocialFxReplayResult['budgetState'];
      encumbrances: PreparedFinanceSocialFxReplayResult['budgetEncumbrances'];
    }>;
    social: Readonly<{
      countries: PreparedFinanceSocialFxReplayResult['socialCountries'];
      reservations: PreparedFinanceSocialFxReplayResult['socialReservations'];
    }>;
  }>;
  readonly document: PostwarSocialEmploymentStateDocument;
  readonly frames: readonly FinanceNativeBudgetCanonicalFrame[];
  readonly coverage: Readonly<PostwarMixedCurrentProjectionCoverage>;
}
const snapshots = new WeakMap<
  object,
  { executor: SqlExecutor; facts: Readonly<PostwarMixedCurrentProjectionFacts> }
>();
export function consumePostwarMixedCurrentProjectionSnapshotFrom(
  executor: SqlExecutor,
  value: PostwarMixedCurrentProjectionSnapshot,
): Readonly<PostwarMixedCurrentProjectionFacts> {
  const entry = snapshots.get(value);
  if (!entry || entry.executor !== executor)
    throw Error('GENUINE_LIVE_MIXED_CURRENT_SNAPSHOT_REQUIRED');
  return entry.facts;
}
export interface PostwarMixedCurrentProjectionSource {
  readonly worldId: string;
  /** Server-only DATA mapper scope; no writes to authoritative state. */
  withSnapshot<T>(
    country: string,
    consume: (
      tx: SqlExecutor,
      snapshot: PostwarMixedCurrentProjectionSnapshot,
    ) => Promise<T>,
  ): Promise<T>;
  publishSocialCountry(
    country: string,
  ): Promise<readonly Readonly<Record<string, unknown>>[]>;
  close(): Promise<void>;
}
const sources = new WeakSet<object>();
export function isPostwarMixedCurrentProjectionSource(
  v: unknown,
): v is PostwarMixedCurrentProjectionSource {
  return !!v && typeof v === 'object' && sources.has(v);
}
export function createPostwarMixedCurrentProjectionSource(config: {
  readonly socialConnection: Readonly<PostwarSocialRuntimeConnection>;
  readonly worldId: string;
  readonly workerRole: string;
  readonly publicationDatabase: SqlDatabase;
}): Readonly<PostwarMixedCurrentProjectionSource> {
  const world = worldId(config.worldId),
    social = config.socialConnection;
  if (
    !isPostwarSocialRuntimeConnection(social, world) ||
    config.publicationDatabase === social.database
  )
    throw Error('GENUINE_SOURCE_AND_SEPARATE_PUBLICATION_DATABASE_REQUIRED');
  const roles = createPostwarSocialSourceRoleScope({
    workerRole: config.workerRole,
  });
  let closed = false,
    closing: Promise<void> | undefined;
  const pending = new Set<Promise<unknown>>();
  const run = <T>(operation: () => Promise<T>): Promise<T> => {
    if (closed) return Promise.reject(Error('MIXED_CURRENT_SOURCE_RETIRED'));
    const result = Promise.resolve().then(operation);
    pending.add(result);
    void result.then(
      () => pending.delete(result),
      () => pending.delete(result),
    );
    return result;
  };
  const source: Readonly<PostwarMixedCurrentProjectionSource> = Object.freeze({
    worldId: world,
    withSnapshot<T>(
      requestedCountry: string,
      consume: (
        tx: SqlExecutor,
        value: PostwarMixedCurrentProjectionSnapshot,
      ) => Promise<T>,
    ): Promise<T> {
      return run(async () => {
        const country = countryId(requestedCountry),
          baseline = readPostwarSocialRuntimeFinancialReplayBase(social, world),
          b = consumePreparedPostwarSocialFinancialReplayBase(baseline);
        if (!b.document.countries.some((c) => c.countryId === country))
          throw Error('ACTUAL_ADOPTED_COUNTRY_REQUIRED');
        return social.database.transaction((tx) =>
          roles.withSourceReaderFrom(tx, async () => {
            const locked = await lockRegisteredSourceFrom(tx, world, country),
              r = locked.rows[0];
            if (
              locked.rows.length !== 1 ||
              !r ||
              r.seed_fingerprint !== b.pins.contentHash ||
              r.admission_ref !== b.pins.admissionRef
            )
              throw Error('ACTUAL_CURRENT_SOURCE_PINS_REQUIRED');
            const bounded = await readBoundedPostwarSocialFramesFrom({
              executor: tx,
              database: social.database,
              worldId: world,
              countryId: country,
            });
            if (BigInt(bounded.head.worldVersion) <= 0n)
              throw Error('MIXED_CURRENT_POSITIVE_HEAD_REQUIRED');
            const replay = await replayPreparedPostwarFinanceSocialFxFrom({
              executor: tx,
              baseline,
              worldId: world,
              hostCountryId: country,
              officeId: 'SOCIAL',
              seedId: b.pins.seedRef,
              seedFingerprint: b.pins.contentHash,
              admissionRef: b.pins.admissionRef,
              frames: bounded.frames,
              expectedHead: bounded.head,
            });
            const frames = bounded.frames,
              events = frames.flatMap((f) => f.events),
              last = events.at(-1);
            if (!last) throw Error('COMPLETE_POSITIVE_PREFIX_REQUIRED');
            const batches = frames.flatMap((f) => f.financialPostingBatches),
              head = Object.freeze({ worldId: world, ...bounded.head });
            const coverage = Object.freeze({
              prefixFingerprint: hash({
                worldId: world,
                seedFingerprint: b.pins.contentHash,
                headWorldVersion: head.worldVersion,
                headEventSequence: head.eventSequence,
                frames,
              }),
              knownEffectsFingerprint: hash(
                frames.map((f) => ({
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
              ),
              coveredThroughEventId: last.eventId,
              coveredThroughEventFingerprint: last.fingerprint,
              financialPostingCount: String(
                batches.reduce((n, b) => n + b.legs.length, 0),
              ),
              financialBatchCount: String(batches.length),
              financialPostingsFingerprint: hash(batches),
            });
            const facts: Readonly<PostwarMixedCurrentProjectionFacts> =
              Object.freeze({
                countryId: country,
                head,
                seedPins: Object.freeze({
                  worldId: world,
                  seedId: b.pins.seedRef,
                  seedFingerprint: b.pins.contentHash,
                  admissionRef: b.pins.admissionRef,
                }),
                financial: replay.financial,
                shared: Object.freeze({
                  budget: Object.freeze({
                    state: replay.budgetState,
                    encumbrances: replay.budgetEncumbrances,
                  }),
                  social: Object.freeze({
                    countries: replay.socialCountries,
                    reservations: replay.socialReservations,
                  }),
                }),
                document: b.document,
                frames,
                coverage,
              });
            const value = Object.freeze(
              {},
            ) as PostwarMixedCurrentProjectionSnapshot;
            snapshots.set(value, { executor: tx, facts });
            try {
              return await consume(tx, value);
            } finally {
              snapshots.delete(value);
            }
          }),
        );
      });
    },
    publishSocialCountry(country: string) {
      return source.withSnapshot(country, async (tx, token) => {
        const f = consumePostwarMixedCurrentProjectionSnapshotFrom(tx, token),
          countries = f.shared.social.countries.filter(
            (c) => c.countryId === f.countryId,
          );
        if (countries.length !== 1)
          throw Error('EXACT_REPLAYED_SOCIAL_COUNTRY_REQUIRED');
        const lifecycle = countries[0]!.lifecycle,
          employment = lifecycle.employment;
        const origin = f.frames
          .filter(
            (frame) =>
              frame.command.countryId === f.countryId &&
              [
                'CORE_SOCIAL_EMPLOYMENT_POSITION_OFFER_CREATE_V1',
                'CORE_SOCIAL_EMPLOYMENT_SERVICE_PLAN_V1',
                'CORE_SOCIAL_JOB_MATCH_SETTLEMENT_V1',
              ].includes(frame.command.commandType),
          )
          .at(-1);
        const assertion = canonicalSerialize({
          coverage: f.coverage,
          head: f.head,
          seedPins: f.seedPins,
          employmentStateHash: hash(employment),
          materializationHash:
            origin?.command.commandType ===
            'CORE_SOCIAL_EMPLOYMENT_POSITION_OFFER_CREATE_V1'
              ? hash(lifecycle)
              : hash(employment),
          positionsHash: hash(employment.labour.positions),
          servicePoolsHash: hash(employment.servicePools),
        });
        return config.publicationDatabase.transaction(async (pub) => {
          const result = await pub.query(
            'select * from world_v2.publish_postwar_mixed_social_current($1,$2,$3)',
            [world, f.countryId, assertion],
          );
          if (result.rows.length !== 2)
            throw Error('EXACT_TWO_SOCIAL_CURRENT_DATASETS_REQUIRED');
          for (const row of result.rows)
            if (
              String(row.world_version) !== f.head.worldVersion ||
              String(row.event_sequence) !== f.head.eventSequence
            )
              throw Error('PUBLICATION_HEAD_DIFFERS_FROM_HELD_REPLAY');
          return Object.freeze(result.rows.map((r) => Object.freeze({ ...r })));
        });
      });
    },
    close() {
      closed = true;
      return (closing ??= (async () => {
        while (pending.size) await Promise.allSettled([...pending]);
        sources.delete(source);
      })());
    },
  });
  sources.add(source);
  return source;
}
