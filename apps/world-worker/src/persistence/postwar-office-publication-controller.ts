/** Fixed admitted-opening and post-commit derived publication. A failed projection never changes a
 * durable FINAL or retries an economic command. No consumer/Clock is created. */
import { createHash } from 'node:crypto';
import {
  canonicalSerialize,
  worldId,
  parseNarrowTreasuryGcuTransferTerms,
  parseNarrowTreasuryGcuShipmentTerms,
  parseNarrowTreasuryGcuDeliveryTerms,
} from '@econmind/core';
import type { DurableConsumptionStep } from '../preparation/durable-command-consumption.js';
import {
  readPostwarSocialRuntimeConnectionResources,
  type PostwarSocialRuntimeConnection,
} from '../runtime-preparation/social-runtime-connection.js';
import { DurableV08LedgerLineageReader } from './durable-v08-ledger-lineage-reader.js';
import { readFinalReceiptFrom } from './atomic-transition-repository.js';
import { createPostwarMixedCurrentProjectionSource } from './postwar-mixed-current-projection-publication.js';
import {
  createPostwarCaptainCurrentPublisher,
  createPostwarCaptainOpeningCurrentPublisher,
} from './postwar-captain-current-publication.js';
import type { SqlDatabase } from './sql-database.js';
import { createPostwarIndustryLabourCurrentPublisher } from './postwar-industry-labour-current-publication.js';

export type PostwarDerivedPublicationResult =
  | Readonly<{
      status: 'PUBLISHED';
      commandId: string;
      countryId: string;
      head: Readonly<{
        worldId: string;
        worldVersion: string;
        eventSequence: string;
      }>;
      documentCount: number;
      captain: 'PUBLISHED' | 'NO_REGISTERED_ORIGINAL';
      industryLabour?: 'PUBLISHED';
    }>
  | Readonly<{
      status: 'UNAVAILABLE';
      commandId: string;
      reason: 'DERIVED_PUBLICATION_REQUIRES_RETRY';
    }>;
export type PostwarOfficeConsumptionStep = DurableConsumptionStep & {
  readonly derivedPublication?: PostwarDerivedPublicationResult;
};
export type PostwarOpeningCaptainPublicationResult =
  | Readonly<{
      status: 'SKIPPED_NONZERO_HEAD';
      head: Readonly<{
        worldId: string;
        worldVersion: string;
        eventSequence: string;
      }>;
      countries: readonly string[];
    }>
  | Readonly<{
      status: 'PUBLISHED';
      head: Readonly<{
        worldId: string;
        worldVersion: string;
        eventSequence: string;
      }>;
      countries: readonly string[];
      sources: readonly Readonly<{
        countryId: string;
        seedFingerprint: string;
        admissionRef: string;
      }>[];
    }>;
export interface PostwarCurrentCountriesPublicationRequest {
  readonly countryIds: readonly string[];
  readonly expectedHead: Readonly<{
    worldVersion: string;
    eventSequence: string;
  }>;
}
export interface PostwarCurrentCountriesPublicationResult {
  readonly status: 'PUBLISHED';
  readonly head: Readonly<{
    worldId: string;
    worldVersion: string;
    eventSequence: string;
  }>;
  readonly countries: readonly string[];
  readonly publications: readonly Readonly<{
    countryId: string;
    documentCount: number;
    captain: 'PUBLISHED' | 'NO_REGISTERED_ORIGINAL';
    industryLabour?: 'PUBLISHED';
  }>[];
}
export interface PostwarOfficePublicationController {
  publishOpeningCaptainCountries(
    countryIds: readonly string[],
  ): Promise<PostwarOpeningCaptainPublicationResult>;
  /** Explicit current derived rebuild; no Command or FINAL is required or
   * created. Countries are acknowledged separately; failure can follow a prior
   * country publication and a same-head retry rechecks all originals again. */
  publishCurrentCountries(
    input: PostwarCurrentCountriesPublicationRequest,
  ): Promise<PostwarCurrentCountriesPublicationResult>;
  afterCommitted(
    step: DurableConsumptionStep,
  ): Promise<PostwarOfficeConsumptionStep>;
  retryCommitted(commandId: string): Promise<PostwarDerivedPublicationResult>;
  close(): Promise<void>;
}

export function createPostwarOfficePublicationController(input: {
  readonly worldId: string;
  readonly database: SqlDatabase;
  readonly workerRole: string;
  readonly socialConnection: Readonly<PostwarSocialRuntimeConnection>;
  /** Explicit borrowed publisher identity; no credentials or pool discovered. */
  readonly publicationDatabase: SqlDatabase;
  readonly industryLabour?: true;
  readonly tradeCurrent?: true;
  /** Fixed registered host scope, installed by the genuine shared composition.
   * Absence leaves this new explicit method disabled on legacy controllers. */
  readonly currentCountryIds?: readonly string[];
}): PostwarOfficePublicationController {
  const world = worldId(input.worldId);
  const currentCountries =
    input.currentCountryIds === undefined
      ? null
      : Object.freeze([...input.currentCountryIds]);
  if (!/^[a-z][a-z0-9_]{0,62}$/u.test(input.workerRole))
    throw Error('EXACT_PUBLICATION_WORKER_ROLE_REQUIRED');
  const lineage = new DurableV08LedgerLineageReader({
    database: input.database,
    sha256Hex: (text) => createHash('sha256').update(text).digest('hex'),
  });
  const source = createPostwarMixedCurrentProjectionSource({
    socialConnection: input.socialConnection,
    worldId: world,
    workerRole: input.workerRole,
    publicationDatabase: input.publicationDatabase,
    historyMode: 'PAGED_COMPLETE_V1',
  });
  const publisher = createPostwarCaptainCurrentPublisher({
    source,
    publicationDatabase: input.publicationDatabase,
  });
  const openingCaptainPublisher = createPostwarCaptainOpeningCurrentPublisher({
    worldId: world,
    publicationDatabase: input.publicationDatabase,
  });
  const industryPublisher = input.industryLabour
    ? createPostwarIndustryLabourCurrentPublisher({
        source,
        socialConnection: input.socialConnection,
        publicationDatabase: input.publicationDatabase,
      })
    : null;
  let closed = false;
  let closing: Promise<void> | undefined;
  const pending = new Set<Promise<unknown>>();
  const unavailable = (commandId: string): PostwarDerivedPublicationResult =>
    Object.freeze({
      status: 'UNAVAILABLE',
      commandId,
      reason: 'DERIVED_PUBLICATION_REQUIRES_RETRY',
    });

  async function requirePublisher(): Promise<void> {
    await input.publicationDatabase.transaction(async (tx) => {
      const role = await tx.query<{
        role_name: string;
        rolsuper: boolean;
        rolbypassrls: boolean;
        owner_member: boolean;
        publisher_member: boolean;
      }>(
        "select current_user as role_name,r.rolsuper,r.rolbypassrls,pg_has_role(current_user,'world_v2_postwar_projection_owner','MEMBER')as owner_member,pg_has_role(current_user,'world_v2_postwar_projection_publisher','MEMBER')as publisher_member from pg_roles r where r.rolname=current_user",
      );
      const identity = role.rows[0];
      if (
        role.rows.length !== 1 ||
        identity?.role_name === input.workerRole ||
        identity?.rolsuper !== false ||
        identity?.rolbypassrls !== false ||
        identity?.owner_member !== false ||
        identity?.publisher_member !== true
      )
        throw Error('EXACT_SEPARATE_DERIVED_PUBLISHER_REQUIRED');
    });
  }

  function publish(
    commandId: string,
    expected?: Extract<
      DurableConsumptionStep,
      { status: 'PROCESSED' }
    >['receipt'],
  ): Promise<PostwarDerivedPublicationResult> {
    if (closed) return Promise.resolve(unavailable(commandId));
    const task = (async (): Promise<PostwarDerivedPublicationResult> => {
      try {
        // Check the explicit publisher before holding a source connection.
        // Miswired ordinary worker pools fail here, not while nesting a second
        // checkout behind a held source transaction.
        await requirePublisher();
        const { command, tradeCountries } = await input.database.transaction(
          async (tx) => {
            await tx.query('set transaction isolation level repeatable read');
            // Immutable command/FINAL readback only. A formal database guard
            // retains its existing execution-control SHARE lock; PostgreSQL
            // rejects that lock in a READ ONLY transaction. This fixed read
            // sequence performs no business writes and retains all guard checks.
            // Source/H locks and Core replay are acquired afresh afterward.
            const identity = await tx.query<{
              role_name: string;
              rolsuper: boolean;
              rolbypassrls: boolean;
            }>(
              'select current_user as role_name,r.rolsuper,r.rolbypassrls from pg_roles r where r.rolname=current_user',
            );
            if (
              identity.rows.length !== 1 ||
              identity.rows[0]?.role_name !== input.workerRole ||
              identity.rows[0]?.rolsuper !== false ||
              identity.rows[0]?.rolbypassrls !== false
            )
              throw Error('ACTUAL_PUBLICATION_WORKER_ROLE_REQUIRED');
            const cmd = await lineage.readCommandReadOnlyFrom(
              tx,
              world,
              commandId,
            );
            const receipt = await readFinalReceiptFrom(tx, cmd);
            if (
              cmd.worldId !== world ||
              cmd.commandId !== commandId ||
              receipt?.outcome !== 'COMMITTED' ||
              receipt.commandFingerprint !== cmd.fingerprint ||
              (expected &&
                canonicalSerialize(receipt) !== canonicalSerialize(expected))
            )
              throw Error('EXACT_DURABLE_COMMITTED_RECEIPT_REQUIRED');
            let tradeCountries: readonly string[] = [];
            if (
              input.tradeCurrent &&
              [
                'CORE_GOODS_TRANSFER_V1',
                'CORE_GOODS_SHIPMENT_V1',
                'CORE_GOODS_DELIVERY_V1',
              ].includes(cmd.commandType)
            ) {
              const body = JSON.parse(cmd.canonicalPayload) as {
                transferCommandId?: unknown;
              };
              if (
                cmd.commandType !== 'CORE_GOODS_TRANSFER_V1' &&
                typeof body.transferCommandId !== 'string'
              )
                throw Error('TRADE_CURRENT_EXACT_TRANSFER_REFERENCE_REQUIRED');
              const original =
                cmd.commandType === 'CORE_GOODS_TRANSFER_V1'
                  ? cmd
                  : await lineage.readCommandReadOnlyFrom(
                      tx,
                      world,
                      String(body.transferCommandId),
                    );
              const originalFinal = await readFinalReceiptFrom(tx, original);
              if (
                originalFinal?.outcome !== 'COMMITTED' ||
                originalFinal.commandFingerprint !== original.fingerprint
              )
                throw Error('TRADE_CURRENT_COMMITTED_TRANSFER_REQUIRED');
              const sha256Hex = (text: string) =>
                createHash('sha256').update(text).digest('hex');
              if (cmd.commandType === 'CORE_GOODS_SHIPMENT_V1')
                parseNarrowTreasuryGcuShipmentTerms({
                  shipmentCommand: cmd,
                  transferCommand: original,
                  sha256Hex,
                });
              if (cmd.commandType === 'CORE_GOODS_DELIVERY_V1')
                parseNarrowTreasuryGcuDeliveryTerms({
                  deliveryCommand: cmd,
                  transferCommand: original,
                  sha256Hex,
                });
              const terms = parseNarrowTreasuryGcuTransferTerms(original);
              tradeCountries = Object.freeze([
                terms.sellerCountryId,
                terms.buyerCountryId,
              ]);
              if (!tradeCountries.includes(cmd.countryId))
                throw Error('TRADE_CURRENT_COMMAND_PARTY_REQUIRED');
            }
            return { command: cmd, tradeCountries };
          },
        );
        const result = await publisher.publishOfficeCurrentCountry(
          command.countryId,
          {
            requireCaptain: command.officeId === 'CAPTAIN',
            ...(input.tradeCurrent ? { includeTrade: true } : {}),
          },
        );
        const industry = await industryPublisher?.publishCountry(
          command.countryId,
          result.head,
        );
        if (
          industry &&
          canonicalSerialize(industry.head) !== canonicalSerialize(result.head)
        )
          throw Error('INDUSTRY_EXPECTED_PUBLICATION_HEAD_MISMATCH');
        let counterpartDocuments = 0;
        for (const country of tradeCountries.filter(
          (x) => x !== command.countryId,
        )) {
          const other = await publisher.publishOfficeCurrentCountry(country, {
            requireCaptain: false,
            includeTrade: true,
          });
          if (
            canonicalSerialize(other.head) !== canonicalSerialize(result.head)
          )
            throw Error('TRADE_CURRENT_PARTIES_SAME_OBSERVED_HEAD_REQUIRED');
          counterpartDocuments +=
            other.captain.length +
            other.financial.length +
            other.social.length +
            other.trade.length;
        }
        return Object.freeze({
          status: 'PUBLISHED',
          commandId,
          countryId: command.countryId,
          head: result.head,
          documentCount:
            result.captain.length +
            result.financial.length +
            result.social.length +
            result.trade.length +
            counterpartDocuments +
            (industry?.documents.length ?? 0),
          ...(industry ? { industryLabour: 'PUBLISHED' as const } : {}),
          captain: result.captain.length
            ? 'PUBLISHED'
            : 'NO_REGISTERED_ORIGINAL',
        });
      } catch {
        // Commit may already be FINAL. Only the derived publication is unknown;
        // callers retain the original receipt and can repeat this readback.
        return unavailable(commandId);
      }
    })();
    pending.add(task);
    void task.then(
      () => pending.delete(task),
      () => pending.delete(task),
    );
    return task;
  }
  return Object.freeze({
    publishCurrentCountries(
      request: PostwarCurrentCountriesPublicationRequest,
    ): Promise<PostwarCurrentCountriesPublicationResult> {
      if (closed) return Promise.reject(Error('PUBLICATION_CONTROLLER_CLOSED'));
      if (!currentCountries)
        return Promise.reject(
          Error('REGISTERED_CURRENT_PUBLICATION_SCOPE_REQUIRED'),
        );
      const configured = readPostwarSocialRuntimeConnectionResources(
        input.socialConnection,
      );
      const uint = (v: unknown): v is string =>
        typeof v === 'string' &&
        /^[1-9][0-9]*$/u.test(v) &&
        BigInt(v) <= 9223372036854775807n;
      if (
        !request ||
        Object.keys(request).sort().join('|') !== 'countryIds|expectedHead' ||
        !Array.isArray(request.countryIds) ||
        request.countryIds.length === 0 ||
        request.countryIds.length > 70 ||
        new Set(request.countryIds).size !== request.countryIds.length ||
        !request.expectedHead ||
        Object.keys(request.expectedHead).sort().join('|') !==
          'eventSequence|worldVersion' ||
        !uint(request.expectedHead.worldVersion) ||
        !uint(request.expectedHead.eventSequence) ||
        BigInt(request.expectedHead.worldVersion) >
          BigInt(request.expectedHead.eventSequence) ||
        currentCountries.length === 0 ||
        currentCountries.length > 70 ||
        new Set(currentCountries).size !== currentCountries.length ||
        configured.workerRole !== input.workerRole ||
        currentCountries.some((c) => !configured.countryIds.includes(c)) ||
        request.countryIds.some(
          (c) =>
            !/^COUNTRY_(0[1-9]|[1-6][0-9]|70)$/u.test(c) ||
            !currentCountries.includes(c),
        )
      )
        return Promise.reject(
          Error(
            'EXACT_CONFIGURED_CURRENT_COUNTRIES_AND_POSITIVE_HEAD_REQUIRED',
          ),
        );
      const countries = Object.freeze([...request.countryIds]),
        head = Object.freeze({ worldId: world, ...request.expectedHead });
      const task =
        (async (): Promise<PostwarCurrentCountriesPublicationResult> => {
          await requirePublisher();
          const publications: PostwarCurrentCountriesPublicationResult['publications'][number][] =
            [];
          for (const countryId of countries) {
            // Do not borrow the worker pool around this call: the existing
            // publisher holds its own genuine source/H snapshot (max1 safe).
            // expectedHead is checked on that snapshot BEFORE any publisher SQL.
            const result = await publisher.publishOfficeCurrentCountry(
              countryId,
              {
                requireCaptain: false,
                ...(input.tradeCurrent ? { includeTrade: true } : {}),
                expectedHead: head,
              },
            );
            if (canonicalSerialize(result.head) !== canonicalSerialize(head))
              throw Error(
                'CURRENT_COUNTRIES_EXPECTED_PUBLICATION_HEAD_MISMATCH',
              );
            const industry = await industryPublisher?.publishCountry(
              countryId,
              head,
            );
            if (
              industry &&
              canonicalSerialize(industry.head) !== canonicalSerialize(head)
            )
              throw Error('INDUSTRY_EXPECTED_PUBLICATION_HEAD_MISMATCH');
            publications.push(
              Object.freeze({
                countryId,
                documentCount:
                  result.captain.length +
                  result.financial.length +
                  result.social.length +
                  result.trade.length +
                  (industry?.documents.length ?? 0),
                captain: result.captain.length
                  ? 'PUBLISHED'
                  : 'NO_REGISTERED_ORIGINAL',
                ...(industry ? { industryLabour: 'PUBLISHED' as const } : {}),
              }),
            );
          }
          return Object.freeze({
            status: 'PUBLISHED',
            head,
            countries,
            publications: Object.freeze(publications),
          });
        })();
      pending.add(task);
      void task.then(
        () => pending.delete(task),
        () => pending.delete(task),
      );
      return task;
    },
    /** Startup-only derived data. The real shared owner is prepared before
     * this call; H is held while the separate fixed publisher derives H0.
     * No event, command, Clock, lease or original source is created. */
    publishOpeningCaptainCountries(countryIds: readonly string[]) {
      if (closed) return Promise.reject(Error('PUBLICATION_CONTROLLER_CLOSED'));
      if (
        countryIds.length === 0 ||
        countryIds.length > 70 ||
        new Set(countryIds).size !== countryIds.length ||
        countryIds.some((c) => !/^COUNTRY_(0[1-9]|[1-6][0-9]|70)$/u.test(c))
      )
        return Promise.reject(
          Error('EXACT_FINITE_OPENING_CAPTAIN_COUNTRIES_REQUIRED'),
        );
      const countries = Object.freeze([...countryIds]);
      const task = (async () => {
        await requirePublisher();
        return input.database.transaction(async (tx) => {
          await tx.query('set transaction isolation level repeatable read');
          const head = await tx.query<{
            world_version: string;
            event_sequence: string;
          }>(
            'select world_version::text,event_sequence::text from world_v2.world_head where world_id=$1 for share',
            [world],
          );
          const h = head.rows[0];
          if (
            head.rows.length !== 1 ||
            !h ||
            !/^(0|[1-9]\d*)$/u.test(h.world_version) ||
            !/^(0|[1-9]\d*)$/u.test(h.event_sequence) ||
            (h.world_version === '0') !== (h.event_sequence === '0')
          )
            throw Error('EXACT_ACTUAL_OPENING_PUBLICATION_HEAD_REQUIRED');
          if (h.world_version !== '0')
            return Object.freeze({
              status: 'SKIPPED_NONZERO_HEAD' as const,
              head: Object.freeze({
                worldId: world,
                worldVersion: h.world_version,
                eventSequence: h.event_sequence,
              }),
              countries: Object.freeze([]) as readonly string[],
            });
          const sources = [];
          for (const country of countries) {
            const published =
              await openingCaptainPublisher.publishCountry(country);
            sources.push(
              Object.freeze({
                countryId: country,
                seedFingerprint: published.seedFingerprint,
                admissionRef: published.admissionRef,
              }),
            );
          }
          return Object.freeze({
            status: 'PUBLISHED' as const,
            head: Object.freeze({
              worldId: world,
              worldVersion: '0',
              eventSequence: '0',
            }),
            countries,
            sources: Object.freeze(sources),
          });
        });
      })();
      pending.add(task);
      void task.then(
        () => pending.delete(task),
        () => pending.delete(task),
      );
      return task;
    },
    async afterCommitted(
      step: DurableConsumptionStep,
    ): Promise<PostwarOfficeConsumptionStep> {
      if (step.status !== 'PROCESSED' || step.receipt.outcome !== 'COMMITTED')
        return step;
      return Object.freeze({
        ...step,
        derivedPublication: await publish(step.commandId, step.receipt),
      });
    },
    retryCommitted(
      commandId: string,
    ): Promise<PostwarDerivedPublicationResult> {
      return publish(commandId);
    },
    close(): Promise<void> {
      closed = true;
      closing ??= (async () => {
        while (pending.size) await Promise.allSettled([...pending]);
        await source.close();
      })();
      return closing;
    },
  });
}
