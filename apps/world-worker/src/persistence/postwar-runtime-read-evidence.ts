/** Separate bounded read-use evidence. The frozen 490 deferred execution gates
 * remain unchanged: readable adopted data is never operating authority. */
import { createHash } from 'node:crypto';
import { canonicalSerialize } from '@econmind/core';
import {
  createPostwarOfficeProjectionStore,
  POSTWAR_PROJECTION_DATASETS,
  type PostwarProjectionOffice,
  type PostwarOfficeProjectionPage,
  type PostwarOfficeProjectionSeatHeader,
} from './postwar-office-projection-store.js';
import type { SqlExecutor } from './sql-database.js';
export const POSTWAR_FROZEN_RUNTIME_AUDIT = Object.freeze({
  path: 'docs/reports/world-connection/C_OFFICIAL_WORLD_OPENING_GAPS.json',
  sha256: '1254b3c2929e10d3b8a582e032bc22648b04d01236e3098a18a1c39974d46539',
});
const targets = Object.freeze({
  TEAM_ASSIGNMENT_DEFERRED: 'TEAM_AND_ROLE_ASSIGNMENT',
  FACILITY_EXECUTION_AUTHORITY_REQUIRED: 'FACILITY_RUNTIME',
  DEPOSIT_RUNTIME_AUTHORITY_REQUIRED: 'RESOURCE_RUNTIME',
  WATER_RIGHTS_GRANT_REQUIRED: 'WATER_RUNTIME',
  POWER_ENERGIZATION_REQUIRED: 'POWER_RUNTIME',
  EMPLOYMENT_RUNTIME_BINDING_REQUIRED: 'LABOUR_RUNTIME',
  SOCIAL_ASSET_EXECUTION_AUTHORITY_REQUIRED: 'SOCIAL_RUNTIME',
});
type Gate = Readonly<{
  countryId: string;
  code: string;
  blockingTarget: string;
  execution: 'UNRESOLVED_BY_READ_EVIDENCE';
}>;
function invalid(reason: string): never {
  throw Error(`POSTWAR_RUNTIME_READ_EVIDENCE:${reason}`);
}
function freeze<T>(v: T): T {
  if (v && typeof v === 'object') {
    Object.values(v).forEach(freeze);
    Object.freeze(v);
  }
  return v;
}
function frozenGates(bytes: string): readonly Gate[] {
  if (
    createHash('sha256').update(bytes).digest('hex') !==
    POSTWAR_FROZEN_RUNTIME_AUDIT.sha256
  )
    invalid('frozen raw audit bytes differ');
  const audit: {
    countries: {
      coreCountryId: string;
      gaps: { code: string; blockingTarget: string }[];
    }[];
  } = JSON.parse(bytes);
  const rows: Gate[] = [];
  for (const c of audit.countries)
    for (const g of c.gaps) {
      if (g.blockingTarget.startsWith('OPENING_SEED')) continue;
      if (
        !Object.hasOwn(targets, g.code) ||
        targets[g.code as keyof typeof targets] !== g.blockingTarget
      )
        invalid('unrecognized deferred runtime gate');
      rows.push({
        countryId: c.coreCountryId,
        code: g.code,
        blockingTarget: g.blockingTarget,
        execution: 'UNRESOLVED_BY_READ_EVIDENCE',
      });
    }
  if (
    audit.countries.length !== 70 ||
    new Set(rows.map((r) => r.countryId)).size !== 70 ||
    rows.length !== 490 ||
    new Set(
      rows.map((r) =>
        canonicalSerialize([r.countryId, r.code, r.blockingTarget]),
      ),
    ).size !== 490
  )
    invalid('raw runtime denominator differs');
  return freeze(rows);
}
interface Data {
  readonly classification: 'ACTUAL_BOUNDED_H0_READ_SCOPE_NOT_COMMAND_OR_PRODUCTION_AUTHORITY';
  readonly header: PostwarOfficeProjectionSeatHeader;
  readonly datasets: readonly Readonly<{
    dataset: string;
    status: 'PAGE' | 'EMPTY';
    totalRows: number;
    sourceVersion: string;
    sourceRevision: string;
    sourcePointer: unknown;
  }>[];
  readonly frozenRuntimeAudit: typeof POSTWAR_FROZEN_RUNTIME_AUDIT;
  readonly deferredExecutionGates: readonly Gate[];
  readonly counts: Readonly<{
    readableOfficeScopes: 1;
    firstPagesRead: number;
    rawDeferredExecutionGates: 490;
    executionGatesClosed: 0;
    productionGatesClosed: 0;
  }>;
}
declare const tokenBrand: unique symbol;
export interface PostwarRuntimeReadEvidence {
  readonly [tokenBrand]: true;
}
const active = new WeakMap<
  object,
  { executor: SqlExecutor; data: Readonly<Data> }
>();
export function consumePostwarRuntimeReadEvidenceFrom(
  tx: SqlExecutor,
  token: PostwarRuntimeReadEvidence,
): Readonly<Data> {
  const entry = active.get(token);
  if (!entry || entry.executor !== tx)
    invalid('forged expired or different-executor evidence');
  return entry.data;
}
/** Host construction pins and raw audit bytes are server dependencies. Requests
 * select an Office only; actual country/team/revision come from the SQL header.
 * Every invocation queries current SQL, never an evidence cache/READY callback. */
export function createPostwarRuntimeReadEvidenceReader(configuration: {
  readonly runtimeReaderRole: string;
  readonly authorizationPublisherRole: string;
  readonly frozenAuditBytes: string;
  readonly worldId: string;
  readonly seedFingerprint: string;
  readonly admissionRef: string;
  readonly sourceBundleSha256: string;
}) {
  const gates = frozenGates(configuration.frozenAuditBytes);
  const pins = Object.freeze({
    worldId: configuration.worldId,
    seedFingerprint: configuration.seedFingerprint,
    admissionRef: configuration.admissionRef,
    sourceBundleSha256: configuration.sourceBundleSha256,
  });
  const store = createPostwarOfficeProjectionStore(configuration);
  return Object.freeze({
    async withEvidenceFrom<Result>(
      tx: SqlExecutor,
      officeId: PostwarProjectionOffice,
      consume: (evidence: PostwarRuntimeReadEvidence) => Promise<Result>,
    ): Promise<Result> {
      if (!Object.hasOwn(POSTWAR_PROJECTION_DATASETS, officeId))
        invalid('unknown Office');
      const headers = await store.readCurrentSeatHeadersFrom(tx, {
        worldId: pins.worldId,
      });
      const selected = headers.filter((h) => h.scope.officeId === officeId);
      if (selected.length !== 1)
        invalid('actual current Office seat missing or ambiguous');
      const header = selected[0]!;
      if (
        header.source.seedFingerprint !== pins.seedFingerprint ||
        header.source.admissionRef !== pins.admissionRef ||
        header.source.sourceBundleSha256 !== pins.sourceBundleSha256 ||
        header.source.worldVersion !== '0' ||
        header.source.eventSequence !== '0'
      )
        invalid('actual H0 admission differs from host pins');
      const pages: Data['datasets'][number][] = [];
      for (const dataset of POSTWAR_PROJECTION_DATASETS[officeId]) {
        const page: PostwarOfficeProjectionPage = await store.readPageFrom(tx, {
          worldId: pins.worldId,
          officeId,
          dataset,
          limit: 1,
        });
        if (page.status !== 'PAGE' && page.status !== 'EMPTY')
          invalid(`dataset ${dataset} unavailable:${page.status}`);
        if (
          canonicalSerialize(page.scope) !== canonicalSerialize(header.scope) ||
          page.source.admissionRef !== header.source.admissionRef ||
          page.source.seedFingerprint !== header.source.seedFingerprint ||
          page.source.sourceBundleSha256 !== header.source.sourceBundleSha256 ||
          page.source.modelVersion !== header.source.modelVersion ||
          page.source.replayBinding !== header.source.replayBinding ||
          page.source.seedId !== header.source.seedId ||
          page.source.worldVersion !== '0' ||
          page.source.eventSequence !== '0'
        )
          invalid('page and actual current seat binding differ');
        pages.push({
          dataset,
          status: page.status,
          totalRows: page.page.total,
          sourceVersion: page.source.sourceVersion,
          sourceRevision: page.source.sourceRevision,
          sourcePointer: page.source.sourcePointer,
        });
      }
      const data = freeze({
        classification:
          'ACTUAL_BOUNDED_H0_READ_SCOPE_NOT_COMMAND_OR_PRODUCTION_AUTHORITY' as const,
        header,
        datasets: pages,
        frozenRuntimeAudit: POSTWAR_FROZEN_RUNTIME_AUDIT,
        deferredExecutionGates: gates,
        counts: {
          readableOfficeScopes: 1 as const,
          firstPagesRead: pages.length,
          rawDeferredExecutionGates: 490 as const,
          executionGatesClosed: 0 as const,
          productionGatesClosed: 0 as const,
        },
      });
      const token = Object.freeze({}) as PostwarRuntimeReadEvidence;
      active.set(token, { executor: tx, data });
      try {
        return await consume(token);
      } finally {
        active.delete(token);
      }
    },
  });
}
