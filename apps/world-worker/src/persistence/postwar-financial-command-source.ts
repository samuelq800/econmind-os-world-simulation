/** Actual bounded financial-originals preflight for the existing OMO family.
 * A negative source report is not an OMO source or a writer assertion. There
 * is deliberately no conversion of category/register claims into securities,
 * terms, quotes, FinancialLedgerState or an executable positive preparation. */
import {
  DOMAIN_ERROR_CODES,
  DomainError,
  isAuthorizedOfficeContext,
  reauthorizeOfficeCapability,
  type AuthorizedOfficeContext,
} from '@econmind/core';
import { createPostwarOfficeProjectionStore } from './postwar-office-projection-store.js';
import type { CentralBankOmoReader } from './central-bank-omo-candidate-source.js';
import type { SqlDatabase, SqlExecutor } from './sql-database.js';
export class PostwarOmoOriginalsMissing extends DomainError {
  constructor(
    readonly missing: readonly string[],
    readonly binding: Readonly<Record<string, unknown>>,
  ) {
    super(
      DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
      `CB_OMO_ORIGINALS_MISSING:${missing.join(',')}`,
    );
  }
}
export function createPostwarCentralBankOmoReader(config: {
  readonly database: SqlDatabase;
  readonly authorization: AuthorizedOfficeContext;
  readonly runtimeReaderRole: string;
  readonly authorizationPublisherRole: string;
}): Readonly<CentralBankOmoReader> {
  if (
    !isAuthorizedOfficeContext(config.authorization) ||
    config.authorization.officeId !== 'CENTRAL_BANK' ||
    config.authorization.capability !== 'CENTRAL_BANK_MONETARY_POLICY'
  )
    throw new PostwarOmoOriginalsMissing(
      ['CURRENT_CENTRAL_BANK_MONETARY_POLICY_AUTHORIZATION'],
      {},
    );
  const store = createPostwarOfficeProjectionStore(config);
  async function inspect(
    tx: SqlExecutor,
    request: Parameters<CentralBankOmoReader['read']>[0],
  ): Promise<never> {
    const authorization = await reauthorizeOfficeCapability(
      config.authorization,
    );
    if (
      authorization.authorizationVersion !==
        config.authorization.authorizationVersion ||
      authorization.teamId !== config.authorization.teamId ||
      authorization.worldId !== request.worldId ||
      authorization.countryId !== request.countryId
    )
      throw new PostwarOmoOriginalsMissing(
        ['CURRENT_EXACT_CENTRAL_BANK_SCOPE'],
        {},
      );
    await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [
      authorization.authSubject,
    ]);
    const categories = await store.readPageFrom(tx, {
      worldId: request.worldId,
      officeId: 'CENTRAL_BANK',
      dataset: 'cb-categories',
      limit: 100,
    });
    if (
      !('scope' in categories) ||
      categories.scope.countryId !== request.countryId ||
      categories.scope.authSubject !== authorization.authSubject ||
      categories.scope.authorizationVersion !==
        authorization.authorizationVersion ||
      categories.source.worldVersion !== request.expectedWorldVersion
    )
      throw new PostwarOmoOriginalsMissing(
        ['CURRENT_ADMITTED_FINANCIAL_CATEGORY_ORIGINALS'],
        {},
      );
    if (categories.page.nextOffset !== null)
      throw new PostwarOmoOriginalsMissing(
        ['COMPLETE_BOUNDED_CB_CATEGORY_REGISTER'],
        {},
      );
    const category = categories.rows.filter(
      (v) =>
        v !== null &&
        typeof v === 'object' &&
        !Array.isArray(v) &&
        (v as Record<string, unknown>).category ===
          'DOMESTIC_GOVERNMENT_SECURITIES',
    );
    if (category.length !== 1)
      throw new PostwarOmoOriginalsMissing(
        ['DOMESTIC_GOVERNMENT_SECURITIES_CATEGORY_ORIGINAL'],
        { sourceVersion: categories.source.sourceVersion },
      );
    const binding = {
      worldId: categories.scope.worldId,
      countryId: categories.scope.countryId,
      seedRef: categories.source.seedId,
      seedFingerprint: categories.source.seedFingerprint,
      admissionRef: categories.source.admissionRef,
      sourceRevision: categories.source.sourceRevision,
      sourceVersion: categories.source.sourceVersion,
      securityRef: request.securityRef,
      batchRef: request.batchRef,
    };
    if (
      (category[0] as Record<string, unknown>).disposition ===
      'NO_DECLARED_INSTRUMENT'
    )
      throw new PostwarOmoOriginalsMissing(
        [
          'ACTUAL_GOVERNMENT_SECURITY_HOLDING',
          'SECURITY_BATCH_FACE_MATURITY_ENCUMBRANCE_TERMS',
          'ACTUAL_OMO_QUOTE_AT_SETTLEMENT_SIM_TIME',
        ],
        binding,
      );
    // The present source contract records category/holding originals, not the
    // OMO instrument register and exact quote required by Core. Even a later
    // declared holding does not supply these missing legal/pricing originals.
    throw new PostwarOmoOriginalsMissing(
      [
        'SECURITY_BATCH_FACE_MATURITY_ENCUMBRANCE_TERMS',
        'ACTUAL_OMO_QUOTE_AT_SETTLEMENT_SIM_TIME',
        'CANONICAL_BANK_AND_CB_SOURCE_ACCOUNT_MAPPING',
      ],
      binding,
    );
  }
  return Object.freeze({
    async read(request: Parameters<CentralBankOmoReader['read']>[0]) {
      return config.database.transaction(async (tx) => {
        await tx.query(
          'set transaction isolation level repeatable read read only',
        );
        return inspect(tx, request);
      });
    },
  });
}
