/** Fixed post-commit derived publication. A failed projection never changes a
 * durable FINAL or retries an economic command. No consumer/Clock is created. */
import { createHash } from 'node:crypto';
import { canonicalSerialize, worldId } from '@econmind/core';
import type { DurableConsumptionStep } from '../preparation/durable-command-consumption.js';
import type { PostwarSocialRuntimeConnection } from '../runtime-preparation/social-runtime-connection.js';
import { DurableV08LedgerLineageReader } from './durable-v08-ledger-lineage-reader.js';
import { readFinalReceiptFrom } from './atomic-transition-repository.js';
import { createPostwarMixedCurrentProjectionSource } from './postwar-mixed-current-projection-publication.js';
import { createPostwarCaptainCurrentPublisher } from './postwar-captain-current-publication.js';
import type { SqlDatabase } from './sql-database.js';

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
    }>
  | Readonly<{
      status: 'UNAVAILABLE';
      commandId: string;
      reason: 'DERIVED_PUBLICATION_REQUIRES_RETRY';
    }>;
export type PostwarOfficeConsumptionStep = DurableConsumptionStep & {
  readonly derivedPublication?: PostwarDerivedPublicationResult;
};

export function createPostwarOfficePublicationController(input: {
  readonly worldId: string;
  readonly database: SqlDatabase;
  readonly workerRole: string;
  readonly socialConnection: Readonly<PostwarSocialRuntimeConnection>;
  /** Explicit borrowed publisher identity; no credentials or pool discovered. */
  readonly publicationDatabase: SqlDatabase;
}) {
  const world = worldId(input.worldId);
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
  });
  const publisher = createPostwarCaptainCurrentPublisher({
    source,
    publicationDatabase: input.publicationDatabase,
  });
  let closed = false;
  let closing: Promise<void> | undefined;
  const pending = new Set<Promise<unknown>>();
  const unavailable = (commandId: string): PostwarDerivedPublicationResult =>
    Object.freeze({
      status: 'UNAVAILABLE',
      commandId,
      reason: 'DERIVED_PUBLICATION_REQUIRES_RETRY',
    });

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
        const command = await input.database.transaction(async (tx) => {
          await tx.query(
            'set transaction isolation level repeatable read read only',
          );
          // Immutable command/FINAL readback only. Source/H locks and the full
          // Core replay are acquired afresh by the fixed publisher afterward.
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
          return cmd;
        });
        const result = await publisher.publishOfficeCurrentCountry(
          command.countryId,
          { requireCaptain: command.officeId === 'CAPTAIN' },
        );
        return Object.freeze({
          status: 'PUBLISHED',
          commandId,
          countryId: command.countryId,
          head: result.head,
          documentCount:
            result.captain.length +
            result.financial.length +
            result.social.length,
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
