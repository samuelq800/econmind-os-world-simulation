/** Fixed offline publisher over an existing genuine transaction-bound complete
 * mixed replay. No initial capital, receipt, approval, source or Clock created. */
import { createHash } from 'node:crypto';
import {
  canonicalHashInput,
  canonicalSha256,
  canonicalSerialize,
} from '@econmind/core';
import {
  parsePostwarCaptainPoliticalCapitalRow,
  type PostwarCaptainPoliticalCapitalRow,
} from '@econmind/core/postwar-captain-current-contract';
import {
  consumePostwarMixedCurrentProjectionSnapshotFrom,
  isPostwarMixedCurrentProjectionSource,
  derivePostwarMixedSocialCurrentFrom,
  type PostwarMixedCurrentProjectionSource,
  type PostwarMixedCurrentProjectionSnapshot,
} from './postwar-mixed-current-projection-publication.js';
import type { SqlDatabase, SqlExecutor } from './sql-database.js';
import { derivePostwarMixedFinancialCurrentFrom } from './postwar-mixed-financial-current-publication.js';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const hash = (v: unknown) => canonicalSha256(canonicalHashInput(v), sha);
export function derivePostwarCaptainCurrentFrom(
  tx: SqlExecutor,
  token: PostwarMixedCurrentProjectionSnapshot,
): Readonly<{
  rows: readonly PostwarCaptainPoliticalCapitalRow[];
  assertion: string;
  capitalStateHash: string;
}> {
  const f = consumePostwarMixedCurrentProjectionSnapshotFrom(tx, token),
    countries = f.captainCountries?.filter((x) => x.countryId === f.countryId);
  if (!countries || countries.length !== 1)
    throw Error('GENUINE_REPLAYED_CAPTAIN_ORIGINAL_REQUIRED');
  const s = countries[0]!.state;
  if (
    s.worldId !== f.head.worldId ||
    s.worldVersion !== f.head.worldVersion ||
    s.lastEventSequence !== f.head.eventSequence
  )
    throw Error('CAPTAIN_CURRENT_EXACT_COMPLETE_HEAD_REQUIRED');
  const cap = s.capital,
    rows = Object.freeze(
      cap.buckets.map((b) =>
        parsePostwarCaptainPoliticalCapitalRow({
          schemaVersion: 'postwar-captain-political-capital-row-v1',
          countryId: f.countryId,
          capitalRef: cap.capitalRef,
          bucket: b.bucket,
          unit: 'political_capital',
          balance: b.balance.amount,
          opening: cap.opening.amount,
          generated: cap.generated.amount,
          total: cap.total.amount,
          available: cap.available.amount,
          spent: cap.spent.amount,
          closing: cap.closing.amount,
          allocationNature: 'REALLOCATION_NOT_GENERATION_OR_SPENDING',
        }),
      ),
    ),
    capitalStateHash = hash(cap);
  return Object.freeze({
    rows,
    capitalStateHash,
    assertion: canonicalSerialize({
      head: f.head,
      seedPins: f.seedPins,
      coverage: f.coverage,
      capitalStateHash,
      rowsHash: hash(rows),
    }),
  });
}
export function createPostwarCaptainCurrentPublisher(input: {
  readonly source: PostwarMixedCurrentProjectionSource;
  readonly publicationDatabase: SqlDatabase;
}) {
  if (!isPostwarMixedCurrentProjectionSource(input.source))
    throw Error('GENUINE_MIXED_CURRENT_SOURCE_REQUIRED');
  return Object.freeze({
    /** Fixed finite post-commit readback: all related current pages are derived
     * from ONE held complete prefix, committed atomically in one publisher tx.
     * Does not resend a command, acquire a lease, deliver another outbox or loop. */
    publishOfficeCurrentCountry(
      countryId: string,
      options: { readonly requireCaptain: boolean } = { requireCaptain: true },
    ) {
      return input.source.withCaptainSnapshot(
        countryId,
        async (tx, token) => {
          const f = consumePostwarMixedCurrentProjectionSnapshotFrom(tx, token),
            captain =
              f.captainOriginalStatus === 'PRESENT'
                ? derivePostwarCaptainCurrentFrom(tx, token)
                : null,
            financial = derivePostwarMixedFinancialCurrentFrom(tx, token),
            social = derivePostwarMixedSocialCurrentFrom(tx, token);
          return input.publicationDatabase.transaction(async (pub) => {
            if (
              f.captainOriginalStatus !== 'PRESENT' &&
              f.captainOriginalStatus !== 'NO_REGISTERED_CAPTAIN_ORIGINAL'
            )
              throw Error('ACTUAL_CAPTAIN_CUSTODY_PRESENCE_REQUIRED');
            if (options.requireCaptain && !captain)
              throw Error('CAPTAIN_CURRENT_REGISTERED_ORIGINAL_REQUIRED');
            const cap = captain
              ? await pub.query<Record<string, unknown>>(
                  'select * from world_v2.publish_postwar_captain_current($1,$2,$3)',
                  [f.head.worldId, countryId, captain.assertion],
                )
              : { rows: [] };
            const fin = await pub.query<Record<string, unknown>>(
              'select * from world_v2.publish_postwar_mixed_financial_current($1,$2,$3)',
              [f.head.worldId, countryId, financial.assertion],
            );
            const soc = await pub.query<Record<string, unknown>>(
              'select * from world_v2.publish_postwar_mixed_social_current($1,$2,$3)',
              [f.head.worldId, countryId, social],
            );
            if (
              cap.rows.length !== (captain ? 1 : 0) ||
              fin.rows.length !== 10 ||
              soc.rows.length !== 2
            )
              throw Error('EXACT_THIRTEEN_CURRENT_DOCUMENTS_REQUIRED');
            for (const row of [...cap.rows, ...fin.rows, ...soc.rows])
              if (
                String(row.world_version) !== f.head.worldVersion ||
                String(row.event_sequence) !== f.head.eventSequence
              )
                throw Error('CURRENT_PUBLICATION_HEAD_DIFFERS_FROM_HELD_CORE');
            return Object.freeze({
              head: f.head,
              captainStatus: captain
                ? ('PUBLISHED' as const)
                : ('NO_REGISTERED_CAPTAIN_ORIGINAL' as const),
              documentCounts: Object.freeze({
                captain: cap.rows.length,
                financial: fin.rows.length,
                social: soc.rows.length,
                total: cap.rows.length + fin.rows.length + soc.rows.length,
              }),
              captain: Object.freeze(cap.rows),
              financial: Object.freeze(fin.rows),
              social: Object.freeze(soc.rows),
            });
          });
        },
        options,
      );
    },
    publishCountry(countryId: string) {
      return input.source.withCaptainSnapshot(countryId, async (tx, token) => {
        const d = derivePostwarCaptainCurrentFrom(tx, token);
        return input.publicationDatabase.transaction(async (pub) => {
          const r = await pub.query<Record<string, unknown>>(
            'select * from world_v2.publish_postwar_captain_current($1,$2,$3)',
            [input.source.worldId, countryId, d.assertion],
          );
          if (r.rows.length !== 1 || r.rows[0]?.country_id !== countryId)
            throw Error('CAPTAIN_CURRENT_EXACT_PUBLICATION_READBACK_REQUIRED');
          return Object.freeze(r.rows);
        });
      });
    },
  });
}
