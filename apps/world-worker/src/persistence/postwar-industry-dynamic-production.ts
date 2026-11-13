/** Fixed shared-host paid-WORK preparation. No static run registry, caller
 * payment proof, current-state DTO, delivery flag or candidate callback. */
import {
  DomainError,
  DOMAIN_ERROR_CODES,
  isCommitAuthorizationProof,
  reauthorizeCommitAuthorizationProof,
  type CanonicalCommand,
} from '@econmind/core';
import {
  parseIndustryProductionIntent,
  INDUSTRY_PRODUCTION_CAPABILITY,
} from '@econmind/core/industry-production-command';
import { readIndustryCompletedWork } from '@econmind/core/industry-first-day-work';
import {
  prepareIndustryPaidWorkProduction,
  readIndustryPaidWorkProduction,
  retireIndustryPaidWorkProduction,
} from '@econmind/core/industry-paid-work-production';
import { createHash } from 'node:crypto';
import {
  isPostwarSocialRuntimeConnection,
  readPostwarSocialRuntimeConnectionResources,
  type PostwarSocialRuntimeConnection,
} from '../runtime-preparation/social-runtime-connection.js';
import {
  readPostwarIndustryRunStateFrom,
  consumePostwarIndustryRunStateFrom,
  releasePostwarIndustryRunStateContext,
} from './postwar-industry-run-state.js';
import { readPostwarIndustryPaidWorkOriginalFrom } from './postgres-postwar-industry-paid-work-originals.js';
import type { SqlDatabase, SqlExecutor } from './sql-database.js';
import type { AtomicTransitionCandidateFactory } from './atomic-transition-repository.js';
import type { IndustryProductionCutoffGuard } from './industry-production-source-cutoff.js';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
export interface IndustryDynamicProductionMissingFact {
  readonly code: string;
  readonly field: string;
  readonly detail: string;
}
export interface PostwarIndustryDynamicProductionInspection {
  readonly classification: 'CURRENT_PAID_WORK_DATA_NOT_PRODUCTION_OR_DELIVERY_AUTHORITY';
  readonly worldId: string;
  readonly countryId: string;
  readonly facilityId: string;
  readonly runId: string;
  readonly head: Readonly<{ worldVersion: string; eventSequence: string }>;
  readonly paidWork: Readonly<{
    workEventFingerprint: string;
    paymentBatchId: string;
    paymentBatchFingerprint: string;
    expenseLegId: string;
    amount: string;
    currency: string;
  }>;
  readonly availableMaterials: readonly Readonly<{
    commodityId: string;
    batchId: string;
    unit: string;
    amount: string;
    locationId: string;
    titleHolderId: string;
  }>[];
  readonly missing: readonly IndustryDynamicProductionMissingFact[];
  readonly submitted: false;
  readonly queued: false;
}
export class IndustryDynamicProductionMissing extends DomainError {
  readonly reasonCode = 'INDUSTRY_DYNAMIC_PRODUCTION_FACTS_MISSING';
  readonly submitted = false;
  readonly queued = false;
  constructor(
    readonly missing: readonly IndustryDynamicProductionMissingFact[],
    readonly inspection?: Readonly<PostwarIndustryDynamicProductionInspection>,
  ) {
    super(
      DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
      'INDUSTRY_DYNAMIC_PRODUCTION_FACTS_MISSING:' +
        missing.map((m) => m.code).join(','),
    );
  }
}
export interface PostwarIndustryDynamicProductionRuntime {
  readonly candidateFactory: Readonly<AtomicTransitionCandidateFactory>;
  readonly cutoffGuard: Readonly<IndustryProductionCutoffGuard>;
  inspect(
    command: CanonicalCommand,
  ): Promise<Readonly<PostwarIndustryDynamicProductionInspection>>;
  inspectFrom(
    tx: SqlExecutor,
    command: CanonicalCommand,
  ): Promise<Readonly<PostwarIndustryDynamicProductionInspection>>;
  close(): Promise<void>;
}
const issued = new WeakSet<object>();
export function isPostwarIndustryDynamicProductionRuntime(
  v: unknown,
): v is Readonly<PostwarIndustryDynamicProductionRuntime> {
  return !!v && typeof v === 'object' && issued.has(v);
}
function invalid(s: string): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
    'INDUSTRY_DYNAMIC_PRODUCTION:' + s,
  );
}
/** Construction is zero-I/O. All original/current-source/H checks happen again
 * on the actual executor; a successful data read cannot become a delivery. */
export function createPostwarIndustryDynamicProductionRuntime(
  input: Readonly<{
    worldId: string;
    database: SqlDatabase;
    socialConnection: Readonly<PostwarSocialRuntimeConnection>;
  }>,
): Readonly<PostwarIndustryDynamicProductionRuntime> {
  const social = input.socialConnection,
    world = input.worldId;
  if (!isPostwarSocialRuntimeConnection(social, world))
    invalid('GENUINE_SAME_WORLD_SOCIAL_CONNECTION_REQUIRED');
  const resources = readPostwarSocialRuntimeConnectionResources(social);
  let closed = false,
    closing: Promise<void> | undefined;
  const pending = new Set<Promise<unknown>>();
  const track = <T>(fn: () => Promise<T>) => {
    if (closed)
      return Promise.reject(
        new IndustryDynamicProductionMissing([
          {
            code: 'SOURCE_RETIRED',
            field: 'runtime',
            detail: 'The fixed dynamic source owner was closed.',
          },
        ]),
      );
    const p = Promise.resolve().then(fn);
    pending.add(p);
    void p.then(
      () => pending.delete(p),
      () => pending.delete(p),
    );
    return p;
  };
  const inspectFrom = async (
    tx: SqlExecutor,
    command: CanonicalCommand,
  ): Promise<Readonly<PostwarIndustryDynamicProductionInspection>> => {
    const intent = parseIndustryProductionIntent(command, sha);
    if (command.simTime.ticks < 0n || command.simTime.ticks >= 86400000n)
      invalid('ADOPTED_FIRST_DAY_PRODUCTION_WINDOW_EXPIRED');
    if (
      command.worldId !== world ||
      !resources.countryIds.includes(command.countryId)
    )
      invalid('EXACT_WORLD_AND_ADOPTED_COUNTRY_REQUIRED');
    const h = await tx.query<{ world_version: string; event_sequence: string }>(
      'select world_version::text,event_sequence::text from world_v2.world_head where world_id=$1 for share',
      [world],
    );
    if (
      h.rows.length !== 1 ||
      !h.rows[0] ||
      h.rows[0].world_version !== command.expectedWorldVersion
    )
      invalid('ACTUAL_CURRENT_COMMAND_HEAD_REQUIRED');
    const head = {
      worldVersion: h.rows[0].world_version,
      eventSequence: h.rows[0].event_sequence,
    };
    const context = await readPostwarIndustryRunStateFrom(tx, {
      socialConnection: social,
      worldId: world,
      countryId: command.countryId,
      facilityId: intent.facilityId,
      expectedHead: head,
    });
    try {
      const facts = consumePostwarIndustryRunStateFrom(tx, context);
      if (command.simTime.ticks < BigInt(facts.maxCommandSimTimeTicks))
        invalid('COMMAND_PRECEDES_COMPLETE_ACTUAL_PREFIX');
      const works = facts.completedWorks
        .map((w) => readIndustryCompletedWork(w))
        .filter(
          (w) =>
            w.data.countryId === command.countryId &&
            w.data.facilityId === intent.facilityId &&
            w.data.runId === intent.runId,
        )
        .sort((a, b) =>
          BigInt(a.frame.events[0]!.sequence) <
          BigInt(b.frame.events[0]!.sequence)
            ? -1
            : 1,
        );
      const work = works.at(-1);
      if (!work)
        throw new IndustryDynamicProductionMissing([
          {
            code: 'ACTUAL_COMPLETED_WORK_MISSING',
            field: 'completedWork',
            detail:
              'Filled employment or RUN scheduling is not distinct completed WORK.',
          },
        ]);
      const workEventFingerprint = work.frame.events[0]!.fingerprint;
      if (!facts.wageState?.paidWork.includes(workEventFingerprint))
        throw new IndustryDynamicProductionMissing([
          {
            code: 'ACTUAL_PAID_WORK_WAGE_MISSING',
            field: 'payment',
            detail:
              'The actual completed WORK has no committed wage settlement in the complete Core prefix.',
          },
        ]);
      let outcome:
        | {
            ok: true;
            original: Awaited<
              ReturnType<typeof readPostwarIndustryPaidWorkOriginalFrom>
            >;
          }
        | { ok: false; error: unknown };
      await tx.query('set local role world_v2_industry_source_reader');
      try {
        const original = await readPostwarIndustryPaidWorkOriginalFrom(tx, {
          worldId: world,
          countryId: command.countryId,
          facilityId: intent.facilityId,
          runId: intent.runId,
          workEventFingerprint,
          expectedHead: head,
          seedFingerprint: facts.seedPins.seedFingerprint,
          admissionRef: facts.seedPins.admissionRef,
        });
        outcome = { ok: true, original };
      } catch (error) {
        outcome = { ok: false, error };
      }
      try {
        await tx.query('set local role "' + resources.workerRole + '"');
      } catch (restore) {
        if (!outcome.ok)
          throw new AggregateError(
            [outcome.error, restore],
            'Industry paid-source role restore failed',
            { cause: restore },
          );
        throw restore;
      }
      if (!outcome.ok) throw outcome.error;
      const original = outcome.original;
      if (
        original.seedId !== facts.seedPins.seedId ||
        original.seedFingerprint !== facts.seedPins.seedFingerprint ||
        original.admissionRef !== facts.seedPins.admissionRef ||
        original.head.worldVersion !== head.worldVersion ||
        original.head.eventSequence !== head.eventSequence ||
        original.sourceRef !== facts.firstdayOriginal.sourceRef ||
        original.sourceRawSha256 !== facts.firstdayOriginal.rawSha256
      )
        invalid('ACTUAL_PAYMENT_AND_CURRENT_SITE_SOURCE_DIFFER');
      const preparation = prepareIndustryPaidWorkProduction(
        {
          worldId: world,
          seedFingerprint: facts.seedPins.seedFingerprint,
          head,
          mixedPrefixEvidence: facts.pagedReplay.lastPage.evidence,
          lastPageFrames: facts.pagedReplay.lastPage.frames,
          paymentFrame: original.paymentFrame,
          target: {
            countryId: command.countryId,
            facilityId: intent.facilityId,
            runId: intent.runId,
            workEventFingerprint,
          },
        },
        sha,
      );
      try {
        const paid = readIndustryPaidWorkProduction(preparation);
        if (
          facts.inventory.appliedPostings.some(
            (p) => p.production?.runId === intent.runId,
          )
        )
          invalid('ORIGINAL_PRODUCTION_RECEIPT_REQUIRED');
        const missing: readonly IndustryDynamicProductionMissingFact[] =
          Object.freeze([
            Object.freeze({
              code: 'ACTUAL_POWER_DELIVERY_MISSING',
              field: 'deliveredPower',
              detail:
                'No Industry generation/grid delivery and its consumed source fuel are registered for this actual run.',
            }),
            Object.freeze({
              code: 'ACTUAL_WATER_DELIVERY_MISSING',
              field: 'deliveredWater',
              detail:
                'Raw-water rights or quota are not delivered water; a conserved exact period delivery/debit is required.',
            }),
            Object.freeze({
              code: 'ACTUAL_LOCAL_LOGISTICS_SERVICE_MISSING',
              field: 'logistics',
              detail:
                'Adopted domestic estimates authorize only a capacity/time/cost scenario service; its actual throughput and qualified cost have not been executed.',
            }),
            Object.freeze({
              code: 'ACTUAL_RESOURCE_CONSUMPTION_BINDING_MISSING',
              field: 'resourceInputs',
              detail:
                'Existing available OP inventory is retained below; an actual recipe/stock/utility composite consumption must be calculated before a production candidate exists.',
            }),
          ]);
        return Object.freeze({
          classification:
            'CURRENT_PAID_WORK_DATA_NOT_PRODUCTION_OR_DELIVERY_AUTHORITY',
          worldId: world,
          countryId: command.countryId,
          facilityId: intent.facilityId,
          runId: intent.runId,
          head: Object.freeze(head),
          paidWork: Object.freeze({
            workEventFingerprint,
            paymentBatchId: paid.paymentBatch.batchId,
            paymentBatchFingerprint: paid.paymentBatch.fingerprint,
            expenseLegId: paid.expenseLegId,
            amount: paid.paidAmount.amount,
            currency: paid.paidAmount.currency,
          }),
          availableMaterials: Object.freeze(
            facts.inventory.balances
              .filter(
                (b) =>
                  b.account.countryId === command.countryId &&
                  b.account.physicalLocationId === paid.workData.locationId &&
                  b.account.titleHolderId === paid.workData.operatorId &&
                  b.account.riskBearerId === paid.workData.operatorId &&
                  b.account.bucket === 'AVAILABLE',
              )
              .map((b) =>
                Object.freeze({
                  commodityId: b.account.commodityId,
                  batchId: b.account.batchId,
                  unit: b.account.unit,
                  amount: b.quantity.toCanonicalValue().amount,
                  locationId: b.account.physicalLocationId,
                  titleHolderId: b.account.titleHolderId,
                }),
              ),
          ),
          missing,
          submitted: false,
          queued: false,
        });
      } finally {
        retireIndustryPaidWorkProduction(preparation);
      }
    } finally {
      releasePostwarIndustryRunStateContext(context);
    }
  };
  const runtime: Readonly<PostwarIndustryDynamicProductionRuntime> =
    Object.freeze({
      candidateFactory: Object.freeze({
        async prepare(
          candidate: Parameters<AtomicTransitionCandidateFactory['prepare']>[0],
        ) {
          const proof = candidate.commitAuthorization,
            command = candidate.command;
          if (
            !proof ||
            !isCommitAuthorizationProof(proof) ||
            proof.capability !== INDUSTRY_PRODUCTION_CAPABILITY ||
            proof.officeId !== 'INDUSTRY' ||
            proof.worldId !== world ||
            proof.countryId !== command.countryId ||
            proof.commandFingerprint !== command.fingerprint ||
            proof.commandId !== command.commandId ||
            proof.actorId !== command.actorId ||
            proof.authSubject !== command.authSubject
          )
            invalid('GENUINE_COMMAND_BOUND_INDUSTRY_AUTHORIZATION_REQUIRED');
          await reauthorizeCommitAuthorizationProof(proof);
          return track(() =>
            input.database.transaction(async (tx) => {
              const data = await inspectFrom(tx, command);
              throw new IndustryDynamicProductionMissing(data.missing, data);
            }),
          );
        },
      }),
      cutoffGuard: Object.freeze({
        assertCurrentFrom(
          tx: SqlExecutor,
          request: Parameters<
            IndustryProductionCutoffGuard['assertCurrentFrom']
          >[1],
        ) {
          return track(async () => {
            const data = await inspectFrom(tx, request.command);
            if (
              data.head.worldVersion !== request.expectedHead.worldVersion ||
              data.head.eventSequence !== request.expectedHead.eventSequence
            )
              invalid('EXACT_ATOMIC_HEAD_REQUIRED');
            throw new IndustryDynamicProductionMissing(data.missing, data);
          });
        },
      }),
      inspect(command: CanonicalCommand) {
        return track(() =>
          input.database.transaction((tx) => inspectFrom(tx, command)),
        );
      },
      inspectFrom(tx: SqlExecutor, command: CanonicalCommand) {
        return track(() => inspectFrom(tx, command));
      },
      close() {
        if (closing) return closing;
        closed = true;
        issued.delete(runtime);
        closing = (async () => {
          while (pending.size) await Promise.allSettled([...pending]);
        })();
        return closing;
      },
    });
  issued.add(runtime);
  return runtime;
}
