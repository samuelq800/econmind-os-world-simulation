import { sameAuthorizedIdentity } from '../prototype/authorized-read-adapter.js';
import {
  hash,
  canonicalId,
  parseAuthority,
  row,
  uuid,
  validConfig,
  type ProductionReadConfig,
  type ServerReadAuthority,
} from '../production-read/contract.js';

export const POSTWAR_RUNTIME_SCHEMA = 'postwar-office-runtime-read-v1';
export const POSTWAR_RUNTIME_PATH = '/v1/postwar-office-runtime';
export const officeDatasets: Readonly<Record<string, readonly string[]>> =
  Object.freeze({
    SOCIAL: ['positions', 'service-pools', 'offers', 'minimum-wage'],
    FINANCE: ['currency-fx', 'opening-financial-legs'],
    CENTRAL_BANK: [
      'currency-fx',
      'cb-categories',
      'cb-holdings',
      'bank-loans',
      'opening-financial-legs',
    ],
    INDUSTRY: ['opening-inventory-entries', 'regional-source-capacity'],
    TRADE: ['opening-inventory-entries'],
    CAPTAIN: ['regional-source-capacity', 'public-service-summary'],
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
          worldVersion: authority.readback.worldVersion,
          eventSequence: authority.readback.eventSequence,
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
          source.dataNature ===
            'ADMITTED_CURRENT_SOCIAL_DERIVED_FROM_COMMITTED_EVENT_MATERIALIZATION';
        if (!opening && !currentSocial)
          throw Error('UNPROVEN_CURRENT_DATA_KIND');
        if (currentSocial) {
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
            binding.sourceStateWorldVersion !== source.worldVersion ||
            binding.sourceEventSequence !== source.eventSequence ||
            ![
              `SOCIAL_POSITION_LIFECYCLE_${c.identity.countryId}`,
              `SOCIAL_EMPLOYMENT_SERVICE_${c.identity.countryId}`,
            ].includes(String(binding.materializationKey))
          )
            throw Error('CURRENT_STATE_BINDING_MISMATCH');
        } else if (source.currentStateBinding !== undefined) {
          throw Error('CURRENT_STATE_BINDING_MISMATCH');
        }
        if (
          !hash(source.sourceVersion) ||
          !hash(source.bindingVersion) ||
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
