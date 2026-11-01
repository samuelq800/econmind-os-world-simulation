/** Fixed facility enumeration over genuine held E03 + complete mixed replay. */
import { createHash } from 'node:crypto';
import {
  canonicalHashInput,
  canonicalSha256,
  canonicalSerialize,
} from '@econmind/core';
import {
  parsePostwarIndustryLabourCurrentRow,
  type PostwarIndustryLabourCurrentRow,
} from '@econmind/core/postwar-industry-labour-current-contract';
import {
  consumePostwarMixedCurrentProjectionSnapshotFrom,
  isPostwarMixedCurrentProjectionSource,
  type PostwarMixedCurrentProjectionSnapshot,
  type PostwarMixedCurrentProjectionSource,
} from './postwar-mixed-current-projection-publication.js';
import {
  isPostwarSocialRuntimeConnection,
  type PostwarSocialRuntimeConnection,
} from '../runtime-preparation/social-runtime-connection.js';
import { readPostwarIndustryMixedCurrentEvidenceFrom } from './postwar-industry-mixed-current-evidence.js';
import { projectPostwarIndustryLabourAllocation } from './postwar-industry-labour-source.js';
import type { SqlDatabase, SqlExecutor } from './sql-database.js';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const hash = (v: unknown) => canonicalSha256(canonicalHashInput(v), sha);
export async function derivePostwarIndustryLabourCurrentFrom(
  tx: SqlExecutor,
  token: PostwarMixedCurrentProjectionSnapshot,
  social: Readonly<PostwarSocialRuntimeConnection>,
): Promise<
  Readonly<{
    rows: readonly Readonly<PostwarIndustryLabourCurrentRow>[];
    assertion: string;
  }>
> {
  const checked = await readPostwarIndustryMixedCurrentEvidenceFrom(
      tx,
      token,
      social,
    ),
    f = checked.facts;
  const scopes = new Map<
    string,
    {
      worldId: string;
      countryId: string;
      locationId: string;
      facilityId: string;
      operatorId: string;
    }
  >();
  for (const p of f.document.inputs.sourcePositions) {
    if (p.countryId !== f.countryId || p.sourceBucket !== 'INDUSTRY') continue;
    if (
      p.employerRole !== 'OP' ||
      p.owner !== 'PRIVATE_SECTOR' ||
      p.occupation !== 'GENERAL'
    )
      throw Error('INDUSTRY_EXACT_OP_ORIGINAL_REQUIRED');
    const scope = {
        worldId: f.head.worldId,
        countryId: f.countryId,
        locationId: p.locationId,
        facilityId: p.sourceObjectId,
        operatorId: p.employerId,
      },
      old = scopes.get(p.sourceObjectId);
    if (old && canonicalSerialize(old) !== canonicalSerialize(scope))
      throw Error('INDUSTRY_FACILITY_HAS_CONFLICTING_SCOPE');
    scopes.set(p.sourceObjectId, scope);
  }
  const rows: Readonly<PostwarIndustryLabourCurrentRow>[] = [];
  for (const scope of [...scopes.values()].sort((a, b) =>
    a.facilityId.localeCompare(b.facilityId),
  )) {
    const allocation = projectPostwarIndustryLabourAllocation({
      scope,
      originals: f.document.inputs,
      evidence: checked.evidence,
      frames: checked.evidenceFrames,
      head: f.head,
    });
    for (const p of allocation.positions)
      rows.push(
        parsePostwarIndustryLabourCurrentRow({
          schemaVersion: 'postwar-industry-labour-current-row-v1',
          countryId: f.countryId,
          facilityId: scope.facilityId,
          locationId: scope.locationId,
          operatorId: scope.operatorId,
          positionId: p.positionId,
          skill: p.skill,
          classificationId: p.classificationId,
          requiredCount: p.requiredCount,
          openingFilledCount: p.openingFilledCount,
          currentEmployedCount: p.currentEmployedCount,
          measurement: 'EMPLOYMENT_HEADCOUNT_NOT_ATTENDANCE_OR_PAYMENT',
          completedPersonDays: null,
          paidCost: null,
        }),
      );
  }
  rows.sort((a, b) =>
    a.positionId < b.positionId ? -1 : a.positionId > b.positionId ? 1 : 0,
  );
  return Object.freeze({
    rows: Object.freeze(rows),
    assertion: canonicalSerialize({
      head: f.head,
      seedPins: f.seedPins,
      coverage: f.coverage,
      rowsHash: hash(rows),
    }),
  });
}
export function createPostwarIndustryLabourCurrentPublisher(input: {
  readonly source: PostwarMixedCurrentProjectionSource;
  readonly socialConnection: Readonly<PostwarSocialRuntimeConnection>;
  readonly publicationDatabase: SqlDatabase;
}) {
  if (
    !isPostwarMixedCurrentProjectionSource(input.source) ||
    !isPostwarSocialRuntimeConnection(
      input.socialConnection,
      input.source.worldId,
    )
  )
    throw Error('INDUSTRY_GENUINE_SAME_WORLD_SOURCES_REQUIRED');
  return Object.freeze({
    publishCountry(
      countryId: string,
      expectedHead?: Readonly<{ worldVersion: string; eventSequence: string }>,
    ) {
      return input.source.withSnapshot(countryId, async (tx, token) => {
        const f = consumePostwarMixedCurrentProjectionSnapshotFrom(tx, token);
        if (
          expectedHead &&
          (expectedHead.worldVersion !== f.head.worldVersion ||
            expectedHead.eventSequence !== f.head.eventSequence)
        )
          throw Error('INDUSTRY_EXPECTED_PUBLICATION_HEAD_MISMATCH');
        const d = await derivePostwarIndustryLabourCurrentFrom(
          tx,
          token,
          input.socialConnection,
        );
        return input.publicationDatabase.transaction(async (pub) => {
          if (f.historyMode === 'PAGED_COMPLETE_V1')
            await pub.query('set transaction isolation level repeatable read');
          const r = await pub.query<Record<string, unknown>>(
            'select * from world_v2.publish_postwar_industry_labour_current($1,$2,$3)',
            [f.head.worldId, countryId, d.assertion],
          );
          if (
            r.rows.length !== 1 ||
            r.rows[0]?.country_id !== countryId ||
            String(r.rows[0]?.world_version) !== f.head.worldVersion ||
            String(r.rows[0]?.event_sequence) !== f.head.eventSequence
          )
            throw Error('INDUSTRY_EXACT_CURRENT_PUBLICATION_REQUIRED');
          return Object.freeze({
            head: f.head,
            documents: Object.freeze(r.rows),
          });
        });
      });
    },
  });
}
