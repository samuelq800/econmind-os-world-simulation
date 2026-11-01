import {
  POSTWAR_CAPTAIN_CURRENT_NATURE,
  POSTWAR_CAPTAIN_CURRENT_DATASET,
  POSTWAR_CAPTAIN_CURRENT_BUCKETS,
  parsePostwarCaptainCurrentCoverage,
  parsePostwarCaptainPoliticalCapitalRow,
} from '@econmind/core/postwar-captain-current-contract';
import {
  POSTWAR_SOCIAL_MIXED_CURRENT_NATURE,
  parsePostwarSocialMixedCoverage,
  parsePostwarSocialMixedStateBinding,
} from '@econmind/core/postwar-social-mixed-current-contract';
import {
  POSTWAR_FINANCIAL_MIXED_CURRENT_NATURE,
  parsePostwarFinancialMixedCoverage,
  parsePostwarMixedFinancialBalanceRow,
  parsePostwarMixedTreasuryCapacityRow,
} from '@econmind/core/postwar-financial-mixed-current-contract';
import { sameAuthorizedIdentity } from '../prototype/authorized-read-adapter.js';
import {
  hash,
  canonicalId,
  parseAuthority,
  row,
  uuid,
  validConfig,
  version,
  type ProductionReadConfig,
  type ServerReadAuthority,
} from '../production-read/contract.js';

export const POSTWAR_RUNTIME_SCHEMA = 'postwar-office-runtime-read-v1';
export const POSTWAR_RUNTIME_PATH = '/v1/postwar-office-runtime';
export const officeDatasets: Readonly<Record<string, readonly string[]>> =
  Object.freeze({
    SOCIAL: ['positions', 'service-pools', 'offers', 'minimum-wage'],
    FINANCE: [
      'currency-fx',
      'opening-financial-legs',
      'ledger-balances',
      'treasury-capacity',
    ],
    CENTRAL_BANK: [
      'currency-fx',
      'cb-categories',
      'cb-holdings',
      'bank-loans',
      'opening-financial-legs',
      'ledger-balances',
    ],
    INDUSTRY: ['opening-inventory-entries', 'regional-source-capacity'],
    TRADE: ['opening-inventory-entries'],
    CAPTAIN: [
      POSTWAR_CAPTAIN_CURRENT_DATASET,
      'regional-source-capacity',
      'public-service-summary',
    ],
  });
export interface RuntimePage {
  readonly status: 'PAGE' | 'EMPTY';
  readonly dataset: string;
  readonly authority: ServerReadAuthority;
  readonly source: Readonly<Record<string, unknown>> & {
    readonly sourceVersion: string;
    readonly bindingVersion: string;
  };
  readonly page: {
    readonly offset: number;
    readonly limit: number;
    readonly returned: number;
    readonly total: number;
    readonly nextOffset: number | null;
  };
  readonly rows: readonly Readonly<Record<string, unknown>>[];
}
export type RuntimeResult =
  | RuntimePage
  | {
      readonly status: 'NOT_CONNECTED' | 'STALE' | 'DENIED' | 'UNAVAILABLE';
      readonly code: string;
    };

/** A coverage document describes the server-verified complete prefix. It does
 * not promote the originating materialization to a different World version. */
function coversCurrentPrefix(
  source: Record<string, unknown>,
  binding: Record<string, unknown>,
  country: string,
): boolean {
  if (source.currentPrefixCoverage === undefined)
    return (
      binding.sourceStateWorldVersion === source.worldVersion &&
      binding.sourceEventSequence === source.eventSequence
    );
  const coverage = row(source.currentPrefixCoverage);
  const fields = [
    'schemaVersion',
    'coverageRef',
    'countryId',
    'globalWorldVersion',
    'globalEventSequence',
    'originWorldVersion',
    'originEventSequence',
    'prefixFingerprint',
    'knownEffectsFingerprint',
    'coveredThroughEventId',
    'coveredThroughEventFingerprint',
    'reducerVersion',
  ];
  return (
    !!coverage &&
    Object.keys(coverage).length === fields.length &&
    fields.every((key) => Object.hasOwn(coverage, key)) &&
    coverage.schemaVersion === 'postwar-social-current-prefix-coverage-v2' &&
    coverage.reducerVersion === 'POSTWAR_SOCIAL_COMPLETE_PREFIX_SCOPE_V2' &&
    coverage.countryId === country &&
    canonicalId(coverage.coverageRef) &&
    canonicalId(coverage.coveredThroughEventId) &&
    [
      'prefixFingerprint',
      'knownEffectsFingerprint',
      'coveredThroughEventFingerprint',
    ].every((key) => hash(coverage[key])) &&
    coverage.globalWorldVersion === source.worldVersion &&
    coverage.globalEventSequence === source.eventSequence &&
    coverage.originWorldVersion === binding.sourceStateWorldVersion &&
    coverage.originEventSequence === binding.sourceEventSequence &&
    version(coverage.originWorldVersion) &&
    version(coverage.originEventSequence) &&
    version(coverage.globalWorldVersion) &&
    version(coverage.globalEventSequence) &&
    coverage.originWorldVersion !== '0' &&
    coverage.originEventSequence !== '0' &&
    BigInt(coverage.originWorldVersion) <=
      BigInt(coverage.globalWorldVersion) &&
    BigInt(coverage.originEventSequence) <= BigInt(coverage.globalEventSequence)
  );
}
function observedHeadMatches(
  source: Record<string, unknown>,
  authority: ServerReadAuthority,
): boolean {
  const observed = row(source.observedHead);
  return (
    !!observed &&
    Object.keys(observed).length === 2 &&
    observed.worldVersion === authority.readback.worldVersion &&
    observed.eventSequence === authority.readback.eventSequence
  );
}
function financialCoverageMatches(
  source: Record<string, unknown>,
  authority: ServerReadAuthority,
): boolean {
  const coverage = row(source.currentFinancialCoverage);
  if (
    coverage?.schemaVersion === 'postwar-financial-current-prefix-coverage-v2'
  ) {
    try {
      parsePostwarFinancialMixedCoverage(coverage, {
        countryId: authority.identity.countryId,
        worldVersion: authority.readback.worldVersion,
        eventSequence: authority.readback.eventSequence,
      });
      return true;
    } catch {
      return false;
    }
  }
  const fields = [
    'schemaVersion',
    'reducerVersion',
    'coverageRef',
    'prefixFingerprint',
    'knownEffectsFingerprint',
    'globalWorldVersion',
    'globalEventSequence',
    'coveredThroughEventId',
    'coveredThroughEventFingerprint',
    'noFinancialPostings',
    'noInventoryPostings',
  ];
  return (
    !!coverage &&
    Object.keys(coverage).length === fields.length &&
    fields.every((key) => Object.hasOwn(coverage, key)) &&
    coverage.schemaVersion === 'postwar-financial-current-prefix-coverage-v1' &&
    coverage.reducerVersion ===
      'POSTWAR_FINANCIAL_COMPLETE_NO_POSTING_PREFIX_V1' &&
    canonicalId(coverage.coverageRef) &&
    canonicalId(coverage.coveredThroughEventId) &&
    [
      'prefixFingerprint',
      'knownEffectsFingerprint',
      'coveredThroughEventFingerprint',
    ].every((key) => hash(coverage[key])) &&
    coverage.globalWorldVersion === authority.readback.worldVersion &&
    coverage.globalEventSequence === authority.readback.eventSequence &&
    coverage.noFinancialPostings === true &&
    coverage.noInventoryPostings === true
  );
}
export function createPostwarRuntimeClient(
  supplied: ProductionReadConfig | null,
  options: { fetcher?: typeof fetch; timeoutMs?: number } = {},
) {
  const c =
    validConfig(supplied) &&
    supplied.identity.projectionVersion === POSTWAR_RUNTIME_SCHEMA &&
    supplied.endpoints.projectionPath === POSTWAR_RUNTIME_PATH
      ? {
          ...supplied,
          identity: Object.freeze({ ...supplied.identity }),
          world: Object.freeze({ ...supplied.world }),
          endpoints: Object.freeze({ ...supplied.endpoints }),
          session: Object.freeze({ ...supplied.session }),
        }
      : null;
  let epoch = 0,
    retired = !c,
    active: AbortController | null = null,
    unsubscribe: (() => void) | undefined;
  const current = () => {
    try {
      return (
        !!c &&
        !retired &&
        c.session.isCurrent() &&
        sameAuthorizedIdentity(c.currentIdentity(), c.identity)
      );
    } catch {
      return false;
    }
  };
  function disconnect() {
    retired = true;
    epoch++;
    active?.abort();
    active = null;
    const stop = unsubscribe;
    unsubscribe = undefined;
    stop?.();
  }
  if (c) {
    try {
      unsubscribe = c.session.onInvalidate(disconnect);
      if (typeof unsubscribe !== 'function' || !current()) disconnect();
    } catch {
      disconnect();
    }
  }
  return Object.freeze({
    disconnect,
    async readPage(
      dataset: string,
      requestId: string,
      previous?: RuntimePage,
    ): Promise<RuntimeResult> {
      const fail = (
        status: 'NOT_CONNECTED' | 'STALE' | 'DENIED' | 'UNAVAILABLE',
        code: string,
      ): RuntimeResult => ({ status, code });
      if (!c || retired)
        return fail('NOT_CONNECTED', 'TRUSTED_READ_BINDING_MISSING');
      if (!current()) {
        disconnect();
        return fail('STALE', 'SESSION_CHANGED');
      }
      if (
        !uuid(requestId) ||
        !officeDatasets[c.identity.officeId]?.includes(dataset)
      )
        return fail('DENIED', 'INVALID_DATASET');
      if (
        previous &&
        (previous.dataset !== dataset ||
          !parseAuthority(previous.authority, c) ||
          previous.page.nextOffset === null)
      )
        return fail('STALE', 'INVALID_CONTINUATION');
      const started = ++epoch;
      active?.abort();
      const abort = new AbortController();
      active = abort;
      const timer = setTimeout(
        () => abort.abort(),
        Math.min(10000, Math.max(1, options.timeoutMs ?? 10000)),
      );
      const wait = <T>(work: Promise<T>) =>
        new Promise<T>((resolve, reject) => {
          const cancel = () => reject(Error('CANCELLED'));
          if (abort.signal.aborted) {
            cancel();
            return;
          }
          abort.signal.addEventListener('abort', cancel, { once: true });
          work
            .then(resolve, reject)
            .finally(() => abort.signal.removeEventListener('abort', cancel));
        });
      try {
        const token = await wait(c.getAccessToken());
        if (started !== epoch || !current())
          return fail('STALE', 'SESSION_CHANGED');
        if (!token) {
          disconnect();
          return fail('DENIED', 'AUTH_REQUIRED');
        }
        const response = await wait(
          (options.fetcher ?? fetch)(
            c.endpoints.origin + POSTWAR_RUNTIME_PATH,
            {
              method: 'POST',
              credentials: 'omit',
              cache: 'no-store',
              redirect: 'error',
              headers: {
                authorization: `Bearer ${token}`,
                'content-type': 'application/json',
              },
              signal: abort.signal,
              body: JSON.stringify({
                schemaVersion: POSTWAR_RUNTIME_SCHEMA,
                requestId,
                operation: 'READ_CURRENT_OFFICE_OPENING',
                officeId: c.identity.officeId,
                dataset,
                page: {
                  offset: previous?.page.nextOffset ?? 0,
                  limit: 25,
                  ...(previous
                    ? {
                        sourceVersion: previous.source.sourceVersion,
                        bindingVersion: previous.source.bindingVersion,
                      }
                    : {}),
                },
              }),
            },
          ),
        );
        if (response.status === 401 || response.status === 403) {
          disconnect();
          return fail('DENIED', 'AUTHORIZATION_DENIED');
        }
        if (
          response.redirected ||
          (response.url !== '' &&
            response.url !== c.endpoints.origin + POSTWAR_RUNTIME_PATH) ||
          !response.headers
            .get('content-type')
            ?.match(/^application\/json(?:;|$)/iu) ||
          Number(response.headers.get('content-length') ?? 0) > 65536 ||
          !response.body
        )
          throw Error('INVALID_RESPONSE');
        const reader = response.body.getReader();
        const cancelReader = () => {
          void reader.cancel().catch(() => undefined);
        };
        abort.signal.addEventListener('abort', cancelReader, { once: true });
        let text = '',
          bytes = 0;
        const decoder = new TextDecoder('utf-8', { fatal: true });
        try {
          while (true) {
            const next = await wait(reader.read());
            if (next.done) break;
            bytes += next.value.byteLength;
            if (bytes > 65536) throw Error('RESPONSE_TOO_LARGE');
            text += decoder.decode(next.value, { stream: true });
          }
          text += decoder.decode();
        } finally {
          abort.signal.removeEventListener('abort', cancelReader);
          void reader.cancel().catch(() => undefined);
          try {
            reader.releaseLock();
          } catch {
            /* Cancellation owns pending stream reads. */
          }
        }
        if (started !== epoch || !current())
          return fail('STALE', 'SESSION_CHANGED');
        const body = row(JSON.parse(text));
        if (
          !body ||
          body.schemaVersion !== POSTWAR_RUNTIME_SCHEMA ||
          body.requestId !== requestId
        )
          throw Error('INVALID_RESPONSE');
        if (body.ok !== true) {
          const code = row(body.error)?.code;
          if (typeof code !== 'string' || code.length > 128)
            throw Error('INVALID_RESPONSE');
          return fail(response.status === 409 ? 'STALE' : 'UNAVAILABLE', code);
        }
        const authority = parseAuthority(body.authority, c),
          source = row(body.source),
          page = row(body.page),
          rows = body.rows;
        if (
          !response.ok ||
          !authority ||
          !source ||
          !page ||
          !Array.isArray(rows) ||
          rows.some((v) => !row(v)) ||
          body.dataset !== dataset ||
          !['AVAILABLE', 'EMPTY'].includes(String(body.status))
        )
          throw Error('INVALID_RESPONSE');
        const historical =
          source.dataNature === 'ADMITTED_IMMUTABLE_OPENING_FACTS';
        for (const [key, value] of Object.entries({
          worldId: c.identity.worldId,
          countryId: c.identity.countryId,
          officeId: c.identity.officeId,
          authSubjectId: c.identity.authSubjectId,
          authorizationRevision: c.identity.authorizationRevision,
          scopeKey: c.identity.scopeKey,
          modelVersion: c.identity.modelVersion,
          seedRef: c.world.seedRef,
          contentHash: c.world.contentHash,
          admissionRef: c.world.admissionRef,
          worldVersion: historical ? '0' : authority.readback.worldVersion,
          eventSequence: historical ? '0' : authority.readback.eventSequence,
        }))
          if (source[key] !== value) throw Error('SOURCE_SCOPE_MISMATCH');
        const opening =
          source.worldVersion === '0' &&
          source.eventSequence === '0' &&
          source.dataNature ===
            'ADMITTED_H0_DERIVED_PROJECTION_NOT_POST_H0_REPLAY';
        const currentSocial =
          source.worldVersion !== '0' &&
          source.eventSequence !== '0' &&
          c.identity.officeId === 'SOCIAL' &&
          ['positions', 'service-pools'].includes(dataset) &&
          (source.dataNature ===
            'ADMITTED_CURRENT_SOCIAL_DERIVED_FROM_COMMITTED_EVENT_MATERIALIZATION' ||
            source.dataNature === POSTWAR_SOCIAL_MIXED_CURRENT_NATURE);
        const currentCaptain =
          source.dataNature === POSTWAR_CAPTAIN_CURRENT_NATURE &&
          c.identity.officeId === 'CAPTAIN' &&
          dataset === POSTWAR_CAPTAIN_CURRENT_DATASET &&
          source.worldVersion !== '0' &&
          source.eventSequence !== '0';
        if (dataset === POSTWAR_CAPTAIN_CURRENT_DATASET && !currentCaptain)
          throw Error('CURRENT_STATE_BINDING_MISMATCH');
        if (currentCaptain) {
          const coverage = parsePostwarCaptainCurrentCoverage(
            source.currentCaptainCoverage,
          );
          if (
            !observedHeadMatches(source, authority) ||
            coverage.countryId !== c.identity.countryId ||
            coverage.globalWorldVersion !== authority.readback.worldVersion ||
            coverage.globalEventSequence !== authority.readback.eventSequence ||
            coverage.originWorldVersion !== source.originWorldVersion ||
            coverage.originEventSequence !== source.originEventSequence ||
            page.total !== POSTWAR_CAPTAIN_CURRENT_BUCKETS.length
          )
            throw Error('CURRENT_STATE_BINDING_MISMATCH');
          const capitals = rows.map(parsePostwarCaptainPoliticalCapitalRow);
          if (
            capitals.some((v) => v.countryId !== c.identity.countryId) ||
            new Set(capitals.map((v) => v.bucket)).size !== capitals.length ||
            new Set(capitals.map((v) => v.capitalRef)).size > 1
          )
            throw Error('CURRENT_STATE_BINDING_MISMATCH');
        } else if (source.currentCaptainCoverage !== undefined)
          throw Error('CURRENT_STATE_BINDING_MISMATCH');
        const financialOffice = ['FINANCE', 'CENTRAL_BANK'].includes(
          c.identity.officeId,
        );
        const financialCurrent =
          (source.dataNature ===
            'ADMITTED_CURRENT_FINANCIAL_NO_POSTING_PREFIX' ||
            source.dataNature === POSTWAR_FINANCIAL_MIXED_CURRENT_NATURE) &&
          financialOffice &&
          ['ledger-balances', 'treasury-capacity'].includes(dataset) &&
          (source.dataNature === POSTWAR_FINANCIAL_MIXED_CURRENT_NATURE ||
            (source.worldVersion !== '0' && source.eventSequence !== '0'));
        const historicalFacts =
          historical &&
          c.identity.officeId !== 'SOCIAL' &&
          !['ledger-balances', 'treasury-capacity'].includes(dataset);
        if (
          !opening &&
          !currentSocial &&
          !currentCaptain &&
          !financialCurrent &&
          !historicalFacts
        )
          throw Error('UNPROVEN_CURRENT_DATA_KIND');
        if (source.dataNature === POSTWAR_FINANCIAL_MIXED_CURRENT_NATURE) {
          const office = c.identity.officeId;
          if (office !== 'FINANCE' && office !== 'CENTRAL_BANK')
            throw Error('CURRENT_STATE_BINDING_MISMATCH');
          if (dataset === 'ledger-balances')
            for (const value of rows)
              parsePostwarMixedFinancialBalanceRow(value, {
                countryId: c.identity.countryId,
                officeId: office,
              });
          if (dataset === 'treasury-capacity') {
            if (office !== 'FINANCE' || page.total !== 1)
              throw Error('CURRENT_STATE_BINDING_MISMATCH');
            for (const value of rows)
              parsePostwarMixedTreasuryCapacityRow(value, c.identity.countryId);
          }
        }
        if (financialCurrent || historicalFacts) {
          if (
            source.originWorldVersion !== '0' ||
            source.originEventSequence !== '0' ||
            !observedHeadMatches(source, authority) ||
            (financialCurrent &&
              !financialCoverageMatches(source, authority)) ||
            (source.currentFinancialCoverage !== undefined &&
              (!financialOffice ||
                !financialCoverageMatches(source, authority)))
          )
            throw Error('CURRENT_STATE_BINDING_MISMATCH');
        }
        if (
          currentSocial &&
          source.dataNature === POSTWAR_SOCIAL_MIXED_CURRENT_NATURE
        ) {
          try {
            if (!observedHeadMatches(source, authority))
              throw Error('HEAD_MISMATCH');
            const coverage = parsePostwarSocialMixedCoverage(
              source.currentPrefixCoverage,
              {
                countryId: c.identity.countryId,
                worldVersion: authority.readback.worldVersion,
                eventSequence: authority.readback.eventSequence,
              },
            );
            if (
              source.originWorldVersion !== coverage.originWorldVersion ||
              source.originEventSequence !== coverage.originEventSequence
            )
              throw Error('ORIGIN_MISMATCH');
            const binding = parsePostwarSocialMixedStateBinding(
              source.currentStateBinding,
              coverage,
            );
            if (
              binding &&
              ![
                `SOCIAL_POSITION_LIFECYCLE_${c.identity.countryId}`,
                `SOCIAL_EMPLOYMENT_SERVICE_${c.identity.countryId}`,
              ].includes(binding.materializationKey)
            )
              throw Error('MATERIALIZATION_SCOPE_MISMATCH');
            for (const value of rows)
              if (row(value)?.countryId !== c.identity.countryId)
                throw Error('ROW_COUNTRY_MISMATCH');
          } catch {
            throw Error('CURRENT_STATE_BINDING_MISMATCH');
          }
        } else if (currentSocial) {
          const binding = row(source.currentStateBinding);
          const fields = [
            'sourceCommandId',
            'commandFingerprint',
            'sourceEventId',
            'eventFingerprint',
            'materializationKey',
            'materializationHash',
            'canonicalMaterializationSha256',
            'sourceStateWorldVersion',
            'sourceEventSequence',
          ];
          if (
            !binding ||
            Object.keys(binding).length !== fields.length ||
            !fields.every((key) => Object.hasOwn(binding, key)) ||
            !canonicalId(binding.sourceCommandId) ||
            !canonicalId(binding.sourceEventId) ||
            ![
              'commandFingerprint',
              'eventFingerprint',
              'materializationHash',
            ].every((key) => hash(binding[key])) ||
            typeof binding.canonicalMaterializationSha256 !== 'string' ||
            !/^[a-f0-9]{64}$/u.test(binding.canonicalMaterializationSha256) ||
            !coversCurrentPrefix(source, binding, c.identity.countryId) ||
            ![
              `SOCIAL_POSITION_LIFECYCLE_${c.identity.countryId}`,
              `SOCIAL_EMPLOYMENT_SERVICE_${c.identity.countryId}`,
            ].includes(String(binding.materializationKey))
          )
            throw Error('CURRENT_STATE_BINDING_MISMATCH');
        } else if (
          source.currentStateBinding !== undefined ||
          source.currentPrefixCoverage !== undefined
        ) {
          throw Error('CURRENT_STATE_BINDING_MISMATCH');
        }
        if (
          !hash(source.sourceVersion) ||
          !hash(source.bindingVersion) ||
          !['pageHash', 'returnedRowsHash'].every(
            (key) =>
              typeof source[key] === 'string' &&
              /^[a-f0-9]{64}$/u.test(source[key]),
          ) ||
          source.hashAlgorithm !== 'POSTGRES_JSONB_TEXT_UTF8_SHA256' ||
          !row(source.sourcePointer) ||
          (previous &&
            (previous.source.sourceVersion !== source.sourceVersion ||
              previous.source.bindingVersion !== source.bindingVersion))
        )
          throw Error('STALE_SOURCE_SCOPE');
        const offset = previous?.page.nextOffset ?? 0;
        if (
          ![page.offset, page.limit, page.returned, page.total].every(
            Number.isSafeInteger,
          ) ||
          page.offset !== offset ||
          page.limit !== 25 ||
          page.returned !== rows.length ||
          rows.length > 25 ||
          Number(page.total) < offset + rows.length ||
          (rows.length === 0 && Number(page.total) !== 0) ||
          (body.status === 'EMPTY') !== (rows.length === 0) ||
          (page.nextOffset !== null &&
            (page.nextOffset !== offset + rows.length ||
              rows.length === 0 ||
              Number(page.nextOffset) >= Number(page.total))) ||
          (page.nextOffset === null &&
            offset + rows.length !== Number(page.total))
        )
          throw Error('INVALID_PAGINATION');
        return {
          status: body.status === 'EMPTY' ? 'EMPTY' : 'PAGE',
          dataset,
          authority,
          source: source as RuntimePage['source'],
          page: page as unknown as RuntimePage['page'],
          rows: rows as RuntimePage['rows'],
        };
      } catch (error) {
        return fail(
          started !== epoch || !current() ? 'STALE' : 'UNAVAILABLE',
          abort.signal.aborted
            ? 'CANCELLED_OR_TIMEOUT'
            : error instanceof Error &&
                [
                  'STALE_SOURCE_SCOPE',
                  'SOURCE_SCOPE_MISMATCH',
                  'CURRENT_STATE_BINDING_MISMATCH',
                ].includes(error.message)
              ? error.message
              : 'FETCH_FAILED',
        );
      } finally {
        clearTimeout(timer);
        abort.abort();
        if (active === abort) active = null;
      }
    },
  });
}
