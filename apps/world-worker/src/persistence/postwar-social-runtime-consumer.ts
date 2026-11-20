/** Actual read-only Social H0 consumption. This is not a substitute for the
 * independent originals issuer/cooperating protection of a command custodian. */
import type { AuthorizedOfficeContext } from '@econmind/core';
import {
  selectPostwarSocialEmploymentVacancyFacts,
  type PostwarSocialEmploymentCountrySource,
} from '../preparation/postwar-social-employment-state.js';
import {
  consumePostwarOperatingRuntimeSourceFrom,
  createPostwarOperatingRuntimeSource,
  type PostwarOperatingRuntimeSource,
} from './postwar-operating-runtime-source.js';
import type { SqlExecutor } from './sql-database.js';

export interface PostwarSocialRuntimeCountryRead {
  readonly classification: 'ADMITTED_H0_READ_DATA_NOT_COMMAND_CUSTODY';
  readonly scope: PostwarOperatingRuntimeSource['scope'];
  readonly boundary: PostwarOperatingRuntimeSource['boundary'];
  readonly social: Readonly<PostwarSocialEmploymentCountrySource>;
}
export interface PostwarSocialRuntimeConsumer {
  withCountryStateFrom<Result>(
    executor: SqlExecutor,
    authorization: AuthorizedOfficeContext,
    consume: (
      data: Readonly<PostwarSocialRuntimeCountryRead>,
    ) => Promise<Result>,
  ): Promise<Result>;
  /** Returns ordinary validated data only. No active offer can be invented from
   * the REVOKED Core-validation witness; an initially filled job has no vacancy. */
  withVacancyDataFrom<Result>(
    executor: SqlExecutor,
    authorization: AuthorizedOfficeContext,
    selection: Readonly<{ positionId: string; servicePoolId: string }>,
    consume: (
      data: Readonly<{
        classification: 'ADMITTED_H0_READ_DATA_NOT_COMMAND_CUSTODY';
        scope: PostwarOperatingRuntimeSource['scope'];
        boundary: PostwarOperatingRuntimeSource['boundary'];
        vacancy: ReturnType<typeof selectPostwarSocialEmploymentVacancyFacts>;
      }>,
    ) => Promise<Result>,
  ): Promise<Result>;
}

/** Concrete nonactivated host configuration entry. It constructs the fixed SQL
 * reader itself, accepts no ready/source/admission callback, creates no pool,
 * credentials, transaction, source registry or Command family. Call it from an
 * existing verified-subject stable READ ONLY request lifecycle. Every invocation
 * re-reads role, current seat, entitlement, immutable admission, seed and head.
 * The independent SocialOperatingCustodyPort remains a separate requirement. */
export function createPostwarSocialRuntimeConsumer(
  configuration: Parameters<typeof createPostwarOperatingRuntimeSource>[0],
): Readonly<PostwarSocialRuntimeConsumer> {
  const source = createPostwarOperatingRuntimeSource(configuration);
  const withCountryStateFrom: PostwarSocialRuntimeConsumer['withCountryStateFrom'] =
    (executor, authorization, consume) =>
      source.withSourceFrom(executor, authorization, async (held) => {
        consumePostwarOperatingRuntimeSourceFrom(executor, held);
        return consume(
          Object.freeze({
            classification:
              'ADMITTED_H0_READ_DATA_NOT_COMMAND_CUSTODY' as const,
            scope: held.scope,
            boundary: held.boundary,
            social: held.socialEmployment,
          }),
        );
      });
  const withVacancyDataFrom: PostwarSocialRuntimeConsumer['withVacancyDataFrom'] =
    (executor, authorization, selection, consume) =>
      withCountryStateFrom(executor, authorization, async (country) => {
        const vacancy = selectPostwarSocialEmploymentVacancyFacts(
          country.social,
          selection,
        );
        return consume(
          Object.freeze({
            classification: country.classification,
            scope: country.scope,
            boundary: country.boundary,
            vacancy,
          }),
        );
      });
  return Object.freeze({ withCountryStateFrom, withVacancyDataFrom });
}
