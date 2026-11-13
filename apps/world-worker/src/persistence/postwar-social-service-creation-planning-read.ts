/** Fixed server-only planning DATA. The shared database establishes RR and its
 * revocation fence before the held callback; no caller reader or source DTO. */
import {
  isPostwarFinanceSocialRuntimeConnection,
  readPostwarFinanceSocialRuntimeBinding,
  type PostwarFinanceSocialRuntimeConnection,
} from '../runtime-preparation/finance-social-runtime-connection.js';
import { readPostwarSocialRuntimeConnectionResources } from '../runtime-preparation/social-runtime-connection.js';
import {
  isPostwarSocialEmploymentServiceCreationSourceCommitProtectionPort,
  type PostwarSocialServiceCreationPlanningData,
  type PostwarSocialLabourProgrammeReadData,
} from './postwar-social-employment-service-creation-runtime.js';
export type { PostwarSocialServiceCreationPlanningData } from './postwar-social-employment-service-creation-runtime.js';
export type PostwarSocialServiceCreationPlanningResult =
  | Readonly<{
      status: 'AVAILABLE';
      data: Readonly<PostwarSocialServiceCreationPlanningData>;
    }>
  | Readonly<{ status: 'UNAVAILABLE' | 'STALE'; code: string }>;
export type PostwarSocialLabourProgrammeReadResult =
  | Readonly<{
      status: 'AVAILABLE';
      data: PostwarSocialLabourProgrammeReadData;
    }>
  | Readonly<{ status: 'UNAVAILABLE' | 'STALE'; code: string }>;
export interface PostwarSocialServiceCreationPlanningReader {
  readProgrammes(
    input: Readonly<{
      countryId: string;
      offset: number;
      limit: number;
      expectedHead: Readonly<{ worldVersion: string; eventSequence: string }>;
    }>,
  ): Promise<PostwarSocialLabourProgrammeReadResult>;
  read(
    input: Readonly<{
      countryId: string;
      expectedHead: Readonly<{ worldVersion: string; eventSequence: string }>;
      servicePoolIds: readonly string[];
    }>,
  ): Promise<PostwarSocialServiceCreationPlanningResult>;
}
const issued = new WeakMap<
  object,
  Readonly<PostwarFinanceSocialRuntimeConnection>
>();
export function isPostwarSocialServiceCreationPlanningReader(
  value: unknown,
  worldId: string,
): value is Readonly<PostwarSocialServiceCreationPlanningReader> {
  if (!value || typeof value !== 'object') return false;
  const binding = issued.get(value);
  return !!binding && isPostwarFinanceSocialRuntimeConnection(binding, worldId);
}
export function createPostwarSocialServiceCreationPlanningReader(
  input: Readonly<{
    binding: Readonly<PostwarFinanceSocialRuntimeConnection>;
  }>,
): Readonly<PostwarSocialServiceCreationPlanningReader> {
  const initial = readPostwarFinanceSocialRuntimeBinding(input.binding);
  const reader: Readonly<PostwarSocialServiceCreationPlanningReader> =
    Object.freeze({
      async read(
        selection: Parameters<
          PostwarSocialServiceCreationPlanningReader['read']
        >[0],
      ): Promise<PostwarSocialServiceCreationPlanningResult> {
        if (
          !isPostwarSocialServiceCreationPlanningReader(reader, initial.worldId)
        )
          throw Error('SOCIAL_SERVICE_CREATION_PLANNING_LIVE_BINDING_REQUIRED');
        const ports = readPostwarFinanceSocialRuntimeBinding(input.binding),
          runtime = ports.socialServiceCreation;
        if (!runtime)
          return {
            status: 'UNAVAILABLE',
            code: 'SOCIAL_SERVICE_CREATION_RUNTIME_NOT_INSTALLED',
          };
        if (
          !isPostwarSocialEmploymentServiceCreationSourceCommitProtectionPort(
            runtime.sourceCommitProtectionPort,
          )
        )
          throw Error('SOCIAL_SERVICE_CREATION_FIXED_RUNTIME_REQUIRED');
        const resources = readPostwarSocialRuntimeConnectionResources(
          ports.socialConnection,
        );
        if (
          !resources.countryIds.includes(selection.countryId) ||
          !/^[a-z][a-z0-9_]{0,62}$/u.test(resources.workerRole)
        )
          throw Error('SOCIAL_SERVICE_CREATION_FIXED_HOST_COUNTRY_REQUIRED');
        try {
          return await ports.database.transaction(async (tx) => {
            await tx.query('set local role "' + resources.workerRole + '"');
            const data = await runtime.readPlanningFrom(tx, selection);
            return Object.freeze({ status: 'AVAILABLE' as const, data });
          });
        } catch (error) {
          if (
            error instanceof Error &&
            error.message ===
              'POSTWAR_SOCIAL_SERVICE_CREATE:PLANNING_CURRENT_HEAD_DIFFERS'
          )
            return {
              status: 'STALE',
              code: 'SOCIAL_SERVICE_CREATION_HEAD_CHANGED',
            };
          // Missing/revoked originals, Clock and backend errors remain failures;
          // they never become an empty licence set or empty pool page.
          throw error;
        }
      },
      async readProgrammes(
        selection: Parameters<
          PostwarSocialServiceCreationPlanningReader['readProgrammes']
        >[0],
      ): Promise<PostwarSocialLabourProgrammeReadResult> {
        if (
          !isPostwarSocialServiceCreationPlanningReader(reader, initial.worldId)
        )
          throw Error('SOCIAL_SERVICE_CREATION_PLANNING_LIVE_BINDING_REQUIRED');
        const ports = readPostwarFinanceSocialRuntimeBinding(input.binding),
          runtime = ports.socialServiceCreation;
        if (!runtime)
          return {
            status: 'UNAVAILABLE',
            code: 'SOCIAL_SERVICE_CREATION_RUNTIME_NOT_INSTALLED',
          };
        if (
          !isPostwarSocialEmploymentServiceCreationSourceCommitProtectionPort(
            runtime.sourceCommitProtectionPort,
          )
        )
          throw Error('SOCIAL_SERVICE_CREATION_FIXED_RUNTIME_REQUIRED');
        const resources = readPostwarSocialRuntimeConnectionResources(
          ports.socialConnection,
        );
        if (
          !resources.countryIds.includes(selection.countryId) ||
          !/^[a-z][a-z0-9_]{0,62}$/u.test(resources.workerRole)
        )
          throw Error('SOCIAL_SERVICE_CREATION_FIXED_HOST_COUNTRY_REQUIRED');
        try {
          return await ports.database.transaction(async (tx) => {
            await tx.query('set local role "' + resources.workerRole + '"');
            const data = await runtime.readProgrammesFrom(tx, selection);
            return Object.freeze({ status: 'AVAILABLE' as const, data });
          });
        } catch (error) {
          if (
            error instanceof Error &&
            error.message ===
              'POSTWAR_SOCIAL_SERVICE_CREATE:PROGRAMME_CURRENT_HEAD_DIFFERS'
          )
            return {
              status: 'STALE',
              code: 'SOCIAL_PROGRAMME_HEAD_CHANGED',
            };
          // Missing/revoked originals, Clock and backend errors remain failures;
          // they never become an empty licence set or empty pool page.
          throw error;
        }
      },
    });
  issued.set(reader, input.binding);
  return reader;
}
