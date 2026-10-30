/** TEST_ONLY integration adapter. Importing it opens no database. Exact H0
 * rows are derived offline from a genuine Core cfc seed, then registered in an
 * owned clone after actual stored-seed/admission checks. This registrar is not
 * a production publisher or an alternative admission/authority mechanism. */
import {
  createHash,
  generateKeyPairSync,
  sign,
  randomBytes,
} from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Pool } from 'pg';
import * as C from '@econmind/core';
import { readPostwarOperatingGenesisFromSeed } from '../../apps/world-worker/src/preparation/postwar-operating-genesis-adoption.js';
import { readPostwarFinancialOfficeOriginalsFromSeed } from '../../apps/world-worker/src/preparation/postwar-financial-office-originals.js';
import { readPostwarFinanceSocialRuntimeBinding } from '../../apps/world-worker/src/runtime-preparation/finance-social-runtime-connection.js';
import { PostgresSqlDatabase } from '../../apps/world-worker/src/persistence/postgres-sql-database.js';
import { createPostwarMixedCurrentProjectionSource } from '../../apps/world-worker/src/persistence/postwar-mixed-current-projection-publication.js';
import { publishPostwarMixedFinancialCurrentFrom } from '../../apps/world-worker/src/persistence/postwar-mixed-financial-current-publication.js';
import { createPostwarOfficeRuntimeFetchHandler } from '../../apps/world-api/src/runtime-preparation/postwar-office-runtime-fetch-handler.js';
import {
  createPostwarRuntimeClient,
  type RuntimePage,
} from '../../apps/world-web/src/postwar-office-runtime/client.js';
import type { ProductionReadConfig } from '../../apps/world-web/src/production-read/contract.js';
import {
  deriveCfcMixedSmallSourceData,
  type createPostwarFinanceSocialFxNativeFixture,
} from './postwar-finance-social-fx-native-fixture.js';
import { POSTWAR_DAY_ONE_FX_PINS } from './postwar-day-one-fx-native-fixture.js';
const root = path.resolve(import.meta.dirname, '../..');
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const issued = new WeakSet<object>();
function immutable<T>(value: T, seen = new WeakSet<object>()): T {
  if (value && typeof value === 'object' && !seen.has(value)) {
    seen.add(value);
    Object.values(value).forEach((v) => immutable(v, seen));
    Object.freeze(value);
  }
  return value;
}
const ident = (s: string) => {
  if (!/^[a-z][a-z0-9_]{0,62}$/u.test(s)) throw Error('OWNED_ROLE_REQUIRED');
  return '"' + s + '"';
};
type Fixture = Awaited<
  ReturnType<typeof createPostwarFinanceSocialFxNativeFixture>
>;
interface H0Data {
  readonly countryId: string;
  readonly officeId: 'FINANCE' | 'CENTRAL_BANK' | 'SOCIAL';
  readonly dataset: string;
  readonly rows: readonly unknown[];
  readonly sourcePointer: Readonly<Record<string, unknown>>;
}
export interface CfcMixedCurrentReadData {
  readonly classification: 'ACTUAL_CFC_DERIVED_H0_DATA_NOT_AUTHORITY';
  readonly seedId: string;
  readonly worldId: string;
  readonly seedFingerprint: string;
  readonly canonicalSeedSHA256: string;
  readonly admissionRef: string;
  readonly sourceId: string;
  readonly sourcePayloadHash: string;
  readonly sourceRevision: string;
  readonly modelVersion: string;
  readonly replayBinding: string;
  readonly scopes: ReturnType<
    typeof deriveCfcMixedSmallSourceData
  >['countries'];
  readonly documents: readonly H0Data[];
}
export function deriveCfcMixedCurrentReadData(input: {
  seed: C.OpeningSeed;
  admissionRef: string;
  canonicalSeedSHA256: string;
  countryIds?: readonly string[];
}): CfcMixedCurrentReadData {
  const { seed } = input;
  if (
    !C.isValidatedOpeningSeed(seed) ||
    seed.fingerprint !== POSTWAR_DAY_ONE_FX_PINS.seedFingerprint
  )
    throw Error('ACTUAL_GENUINE_CFC_SEED_REQUIRED');
  const small = deriveCfcMixedSmallSourceData(input),
    view = readPostwarOperatingGenesisFromSeed(seed),
    financial = readPostwarFinancialOfficeOriginalsFromSeed(seed);
  if (!view.socialEmployment) throw Error('ACTUAL_FULL_E03_REQUIRED');
  const op = seed.sources.filter((s) => s.sourceId === small.operatingSourceId),
    fs = seed.sources.filter((s) => s.sourceId === financial.financialSourceId);
  if (op.length !== 1 || fs.length !== 1)
    throw Error('EXACT_SOURCE_IDENTITIES_REQUIRED');
  const assembly = JSON.parse(fs[0]!.canonicalPayload) as {
    assembly: {
      countries: readonly {
        countryId: string;
        roster: { government: string; centralBank: string; bank: string };
      }[];
    };
  };
  const countries = input.countryIds ?? ['COUNTRY_01'];
  if (!countries.length || new Set(countries).size !== countries.length)
    throw Error('UNIQUE_COUNTRIES_REQUIRED');
  const docs: H0Data[] = [];
  const socialPaths: Readonly<Record<string, string>> = {
    positions: 'state.labour.positions',
    'service-pools': 'state.servicePools',
    offers: 'offers',
    'minimum-wage': 'minimumWage',
  };
  for (const countryId of countries) {
    const c = view.socialEmployment.countries.filter(
        (c) => c.countryId === countryId,
      ),
      f = financial.contract.countries.filter((c) => c.countryId === countryId),
      rosters = assembly.assembly.countries.filter(
        (c) => c.countryId === countryId,
      );
    if (c.length !== 1 || f.length !== 1 || rosters.length !== 1)
      throw Error('ACTUAL_COUNTRY_SOURCE_REQUIRED');
    const country = c[0]!,
      contract = f[0]!,
      roster = rosters[0]!.roster;
    for (const officeId of ['FINANCE', 'CENTRAL_BANK', 'SOCIAL'] as const) {
      const rows: Readonly<Record<string, readonly unknown[]>> =
        officeId === 'SOCIAL'
          ? {
              positions: country.state.labour.positions,
              'service-pools': country.state.servicePools,
              offers: country.offers,
              'minimum-wage': [country.minimumWage],
            }
          : {
              'currency-fx': [
                {
                  countryId,
                  localCurrency: contract.localCurrency,
                  openingFx: contract.openingFx,
                },
              ],
              ...(officeId === 'CENTRAL_BANK'
                ? {
                    'cb-categories': contract.cbRegister.categories,
                    'cb-holdings': contract.cbRegister.holdings,
                    'bank-loans': contract.bankLoans,
                  }
                : {}),
              'opening-financial-legs': seed.financialBatches
                .flatMap((b) =>
                  b.legs
                    .filter(
                      (l) =>
                        l.account.countryId === countryId &&
                        (officeId === 'FINANCE'
                          ? l.account.ownerId === roster.government
                          : [roster.centralBank, roster.bank].includes(
                              l.account.ownerId,
                            )),
                    )
                    .map((leg) => ({
                      batchId: b.batchId,
                      sourceId: b.sourceId,
                      leg,
                    })),
                )
                .sort((a, b) =>
                  a.batchId < b.batchId
                    ? -1
                    : a.batchId > b.batchId
                      ? 1
                      : a.leg.legId < b.leg.legId
                        ? -1
                        : a.leg.legId > b.leg.legId
                          ? 1
                          : 0,
                ),
            };
      for (const [dataset, values] of Object.entries(rows))
        docs.push({
          countryId,
          officeId,
          dataset,
          rows: JSON.parse(C.canonicalSerialize(values)) as unknown[],
          sourcePointer: {
            sourceId: op[0]!.sourceId,
            sourcePayloadHash: op[0]!.payloadHash,
            decode: 'sources[].canonicalPayload',
            countryId,
            path:
              officeId === 'SOCIAL'
                ? 'carrier.socialEmployment.countries[countryId].' +
                  (socialPaths[dataset] ?? 'INVALID_DATASET')
                : dataset === 'opening-financial-legs'
                  ? 'seed.financialBatches[].legs[account.countryId;actualOfficeRosterOwner]'
                  : 'carrier.documents[POSTWAR_FINANCIAL_OFFICE_ORIGINALS].bytes::json.contract.countries[countryId]',
            ...(dataset === 'opening-financial-legs'
              ? {
                  financialSourceId: fs[0]!.sourceId,
                  financialSourcePayloadHash: fs[0]!.payloadHash,
                  dataset,
                }
              : {}),
          },
        });
    }
  }
  const value: CfcMixedCurrentReadData = Object.freeze({
    classification: 'ACTUAL_CFC_DERIVED_H0_DATA_NOT_AUTHORITY',
    seedId: seed.seedId,
    worldId: seed.worldId,
    seedFingerprint: seed.fingerprint,
    canonicalSeedSHA256: input.canonicalSeedSHA256,
    admissionRef: input.admissionRef,
    sourceId: op[0]!.sourceId,
    sourcePayloadHash: op[0]!.payloadHash,
    sourceRevision: op[0]!.sourceVersion,
    modelVersion: seed.replayBinding.modelVersion,
    replayBinding: C.canonicalSerialize(seed.replayBinding),
    scopes: small.countries,
    documents: Object.freeze(docs),
  });
  immutable(value);
  issued.add(value);
  return value;
}
const installations = [
  [
    'postwar-office-derived-read',
    'world_v2.postwar_office_projection_document',
  ],
  [
    'postwar-social-current-derived-read',
    'world_v2.postwar_social_current_document',
  ],
  [
    'postwar-social-current-prefix-read',
    'world_v2.postwar_social_prefix_scope',
  ],
  [
    'postwar-financial-current-derived-read',
    'world_v2.postwar_financial_current_document',
  ],
  [
    'postwar-mixed-current-projection-read',
    'world_v2.postwar_mixed_current_document',
  ],
] as const;
/** No DB constructor or bootstrap. Only the already-owned cfc fixture is used.
 * Run once at offline startup, before requests; it does not load a seed online. */
export async function installCfcMixedCurrentReadbackFrom(
  fixture: Fixture,
  data: CfcMixedCurrentReadData,
) {
  if (
    process.env.ECONMIND_POSTWAR_MIXED_CURRENT_NATIVE !== '1' ||
    !issued.has(data)
  )
    throw Error('EXPLICIT_NATIVE_AND_GENUINE_DERIVED_DATA_REQUIRED');
  const ports = readPostwarFinanceSocialRuntimeBinding(fixture.connection);
  if (
    ports.worldId !== data.worldId ||
    fixture.marker.admissionRef !== data.admissionRef ||
    fixture.marker.seedFingerprint !== data.seedFingerprint
  )
    throw Error('ACTUAL_FIXTURE_PINS_REQUIRED');
  const beforeRoles = (
    await fixture.clone.installer.query<{ rolname: string }>(
      'select rolname from pg_roles where rolname=any($1::text[])',
      [
        [
          'world_v2_postwar_projection_owner',
          'world_v2_postwar_projection_publisher',
          'world_v2_postwar_projection_reader',
        ],
      ],
    )
  ).rows.map((r) => r.rolname);
  const installed: Record<string, string> = {};
  for (const [name, relation] of installations) {
    if (
      (
        await fixture.clone.installer.query(
          'select to_regclass($1)as relation',
          [relation],
        )
      ).rows[0]?.relation
    )
      continue;
    const bytes = await readFile(
      path.join(root, 'database/proposals/' + name + '.sql'),
      'utf8',
    );
    await fixture.clone.installer.query(bytes);
    installed[name] = sha(bytes);
  }
  const financeSQL = await readFile(
    path.join(
      root,
      'database/proposals/postwar-mixed-financial-current-publication.sql',
    ),
    'utf8',
  );
  await fixture.clone.installer.query(financeSQL);
  installed['postwar-mixed-financial-current-publication'] = sha(financeSQL);
  const database = new PostgresSqlDatabase(fixture.clone.installer);
  await database.transaction(async (tx) => {
    const actual = await tx.query<{
      seed_id: string;
      seed_fingerprint: string;
      canonical_sha: string;
      admission_ref: string;
      bundle: string;
      revoked: boolean;
    }>(
      "select s.seed_id,s.seed_fingerprint,encode(sha256(convert_to(s.canonical_payload,'UTF8')),'hex')canonical_sha,a.admission_ref,p.source_bundle_sha256 bundle,exists(select 1 from world_v2.runtime_admission_publication_revocation r where r.authorization_id=p.authorization_id)revoked from world_v2.opening_seed s join world_v2.runtime_opening_admission a using(world_id)join world_v2.runtime_admission_publication_permit p on 'ADMISSION_'||upper(p.authorization_sha256)=a.admission_ref where s.world_id=$1 for share of a,p",
      [data.worldId],
    );
    const a = actual.rows[0];
    if (
      actual.rows.length !== 1 ||
      !a ||
      a.seed_id !== data.seedId ||
      a.seed_fingerprint !== data.seedFingerprint ||
      a.canonical_sha !== data.canonicalSeedSHA256 ||
      a.admission_ref !== data.admissionRef ||
      a.bundle !== fixture.marker.sourceBundleSha256 ||
      a.revoked
    )
      throw Error('ACTUAL_STORED_SEED_AND_UNREVOKED_ADMISSION_REQUIRED');
    for (const c of data.scopes) {
      const text = C.canonicalSerialize(c.scope);
      await tx.query(
        'insert into world_v2.postwar_social_prefix_scope values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
        [
          data.worldId,
          c.countryId,
          data.seedFingerprint,
          data.admissionRef,
          data.canonicalSeedSHA256,
          a.bundle,
          data.sourceId,
          data.sourcePayloadHash,
          text,
          sha(text),
        ],
      );
    }
    for (const d of data.documents) {
      const raw = (
        await tx.query<{ text: string }>('select $1::jsonb::text as text', [
          C.canonicalSerialize(d.rows),
        ])
      ).rows[0]!.text;
      const ref =
        'TEST_CFC_H0_' +
        sha(
          C.canonicalSerialize({
            world: data.worldId,
            country: d.countryId,
            office: d.officeId,
            dataset: d.dataset,
            rows: sha(raw),
          }),
        ).toUpperCase();
      const pages: unknown[][] = [[]];
      for (const value of d.rows) {
        let page = pages.at(-1)!;
        if (
          page.length >= 100 ||
          Buffer.byteLength(C.canonicalSerialize([...page, value])) > 40000
        ) {
          page = [];
          pages.push(page);
        }
        page.push(value);
      }
      await tx.query(
        "insert into world_v2.postwar_office_projection_document(document_ref,world_id,country_id,office_id,dataset,projection_version,source_version,source_revision,admission_ref,seed_id,seed_fingerprint,canonical_seed_sha256,source_bundle_sha256,source_id,source_payload_hash,source_pointer,model_version,replay_binding,world_version,event_sequence,document_sha256,total_rows,page_count)values($1,$2,$3,$4,$5,'postwar-office-projection.v1',$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16,$17,0,0,$18,$19,$20)",
        [
          ref,
          data.worldId,
          d.countryId,
          d.officeId,
          d.dataset,
          'sha256:' + sha(ref + sha(raw)),
          data.sourceRevision,
          data.admissionRef,
          data.seedId,
          data.seedFingerprint,
          data.canonicalSeedSHA256,
          a.bundle,
          data.sourceId,
          data.sourcePayloadHash,
          C.canonicalSerialize(d.sourcePointer),
          data.modelVersion,
          data.replayBinding,
          sha(raw),
          d.rows.length,
          pages.length,
        ],
      );
      let offset = 0;
      for (const [index, page] of pages.entries()) {
        const text = (
          await tx.query<{ text: string }>('select $1::jsonb::text as text', [
            C.canonicalSerialize(page),
          ])
        ).rows[0]!.text;
        if (Buffer.byteLength(text) > 48000)
          throw Error('H0_PAGE_BOUNDED_BYTES_REQUIRED');
        await tx.query(
          'insert into world_v2.postwar_office_projection_page values($1,$2,$3,$4,$5,$6,$7,$8,$9)',
          [
            ref,
            data.worldId,
            d.countryId,
            d.officeId,
            index,
            offset,
            page.length,
            text,
            sha(text),
          ],
        );
        offset += page.length;
      }
    }
  });
  const role = 'mixed_current_pub_' + randomBytes(6).toString('hex');
  await fixture.clone.installer.query(
    'create role ' +
      ident(role) +
      ' login noinherit nosuperuser nobypassrls nocreatedb nocreaterole noreplication;grant world_v2_postwar_projection_publisher to ' +
      ident(role) +
      ';grant world_v2_postwar_projection_reader to ' +
      ident(fixture.readRole),
  );
  const pool = new Pool({
    host: fixture.marker.socket,
    port: fixture.marker.port,
    database: fixture.clone.database,
    user: role,
    password: async () => '',
    ssl: false,
    max: 1,
  });
  const publicationBase = new PostgresSqlDatabase(pool);
  const publicationDatabase = {
    query: publicationBase.query.bind(publicationBase),
    transaction: <T>(
      fn: Parameters<typeof publicationBase.transaction<T>>[0],
    ) =>
      publicationBase.transaction(async (tx) => {
        await tx.query('set local role world_v2_postwar_projection_publisher');
        return fn(tx);
      }),
  };
  let closeSource: (() => Promise<void>) | undefined;
  try {
    const source = createPostwarMixedCurrentProjectionSource({
      socialConnection: ports.socialConnection,
      worldId: data.worldId,
      workerRole: fixture.workerRole,
      publicationDatabase,
    });
    closeSource = () => source.close();
    const keys = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }),
      jwk = {
        ...keys.publicKey.export({ format: 'jwk' }),
        kid: 'EPHEMERAL_TEST_ONLY_CURRENT',
        alg: 'ES256',
        use: 'sig',
        key_ops: ['verify'],
      };
    const issuer = 'https://abcdefghijklmnopqrst.supabase.co/auth/v1',
      origin = 'https://current-test.example',
      pagePath = '/v1/postwar-office-runtime';
    const onlineQueries: {
      statement: string;
      rows: number;
      resultBytes: number;
    }[] = [];
    const observedReadPool: Pick<Pool, 'connect'> = {
      async connect() {
        const client = await fixture.readPool.connect();
        return new Proxy(client, {
          get(target, key, receiver) {
            if (key === 'query')
              return async (...args: unknown[]) => {
                const result = await Reflect.apply(target.query, target, args);
                onlineQueries.push({
                  statement:
                    typeof args[0] === 'string' ? args[0] : 'QUERY_CONFIG',
                  rows: result.rows?.length ?? 0,
                  resultBytes: Buffer.byteLength(
                    JSON.stringify(result.rows ?? []),
                  ),
                });
                return result;
              };
            const value: unknown = Reflect.get(target, key, receiver);
            return typeof value === 'function' ? value.bind(target) : value;
          },
        });
      },
    };
    const handler = createPostwarOfficeRuntimeFetchHandler({
      pool: observedReadPool,
      readerRole: fixture.readRole,
      authorizationPublisherRole:
        fixture.marker.roles.authorizationPublisherRole,
      modelVersion: C.WORLD_MODEL_VERSION,
      endpointPins: {
        origin,
        projectionPath: pagePath,
        finalLookupPath: '/v1/final-receipt',
        deploymentRef: 'TEST_ONLY_CFC_MIXED_CURRENT',
      },
      admittedWorldPins: {
        worldId: data.worldId,
        seedRef: data.seedId,
        contentHash: data.seedFingerprint,
        admissionRef: data.admissionRef,
        minimumWorldVersion: '0',
      },
      auth: {
        projectRef: 'abcdefghijklmnopqrst',
        expectedIssuer: issuer,
        jwksUrl: issuer + '/.well-known/jwks.json',
        audience: 'authenticated',
        fetch: async (url) => {
          const r = Response.json({ keys: [jwk] });
          Object.defineProperty(r, 'url', { value: String(url) });
          return r;
        },
      },
      routeOptions: { allowedOrigins: ['https://pages-test.example'] },
    });
    const token = (subject = fixture.marker.subject) => {
      const now = Math.floor(Date.now() / 1000),
        head = Buffer.from(
          JSON.stringify({ alg: 'ES256', typ: 'JWT', kid: jwk.kid }),
        ).toString('base64url'),
        body = Buffer.from(
          JSON.stringify({
            sub: subject,
            iss: issuer,
            aud: 'authenticated',
            iat: now - 1,
            exp: now + 300,
          }),
        ).toString('base64url'),
        input = head + '.' + body;
      return (
        'Bearer ' +
        input +
        '.' +
        sign('sha256', Buffer.from(input), {
          key: keys.privateKey,
          dsaEncoding: 'ieee-p1363',
        }).toString('base64url')
      );
    };
    const metrics: {
      status: number;
      bytes: number;
      elapsedMs: number;
      heapDeltaBytes: number;
    }[] = [];
    async function read(input: {
      officeId: 'FINANCE' | 'CENTRAL_BANK' | 'SOCIAL';
      dataset: string;
      offset?: number;
      limit?: number;
      sourceVersion?: string;
      bindingVersion?: string;
      subject?: string;
    }) {
      const start = performance.now(),
        heap = process.memoryUsage().heapUsed,
        requestId = crypto.randomUUID();
      const response = await handler(
        new Request(origin + pagePath, {
          method: 'POST',
          headers: {
            authorization: token(input.subject),
            origin: 'https://pages-test.example',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            schemaVersion: 'postwar-office-runtime-read-v1',
            requestId,
            operation: 'READ_CURRENT_OFFICE_OPENING',
            officeId: input.officeId,
            dataset: input.dataset,
            page: {
              offset: input.offset ?? 0,
              limit: input.limit ?? 25,
              ...(input.sourceVersion
                ? { sourceVersion: input.sourceVersion }
                : {}),
              ...(input.bindingVersion
                ? { bindingVersion: input.bindingVersion }
                : {}),
            },
          }),
        }),
      );
      if (!response) throw Error('FIXED_API_HANDLER_REQUIRED');
      const text = await response.text(),
        bytes = Buffer.byteLength(text);
      metrics.push({
        status: response.status,
        bytes,
        elapsedMs: performance.now() - start,
        heapDeltaBytes: process.memoryUsage().heapUsed - heap,
      });
      if (bytes > 65536) throw Error('BOUNDED_API_BYTES_REQUIRED');
      return {
        httpStatus: response.status,
        body: JSON.parse(text) as Record<string, unknown>,
        headers: response.headers,
      };
    }
    let closing: Promise<void> | undefined;
    return Object.freeze({
      classification: 'ACTUAL_TEST_ONLY_CFC_CURRENT_NOT_PRODUCTION' as const,
      source,
      installed,
      metrics,
      onlineQueries,
      read,
      token,
      async publish(countryId = fixture.marker.countryId) {
        const finance = await publishPostwarMixedFinancialCurrentFrom({
            source,
            countryId,
            publicationDatabase,
          }),
          social = await source.publishSocialCountry(countryId);
        return { finance, social };
      },
      /** Actual shipped browser parser against the same JWT/SQL Fetch path. */
      async browserPage(input: {
        config: ProductionReadConfig;
        dataset: string;
        previous?: RuntimePage;
      }) {
        const client = createPostwarRuntimeClient(input.config, {
          fetcher: async (url, init) => {
            const r = await handler(
              new Request(String(url), {
                ...init,
                headers: {
                  ...Object.fromEntries(new Headers(init?.headers)),
                  origin: 'https://pages-test.example',
                },
              }),
            );
            if (!r) throw Error('FIXED_HANDLER_REQUIRED');
            return r;
          },
        });
        try {
          return await client.readPage(
            input.dataset,
            crypto.randomUUID(),
            input.previous,
          );
        } finally {
          client.disconnect();
        }
      },
      close() {
        return (closing ??= (async () => {
          const errors: unknown[] = [];
          try {
            await source.close();
          } catch (e) {
            errors.push(e);
          }
          try {
            await pool.end();
          } catch (e) {
            errors.push(e);
          }
          try {
            await fixture.clone.installer.query('drop role ' + ident(role));
          } catch (e) {
            errors.push(e);
          }
          if (errors.length)
            throw new AggregateError(
              errors,
              'CURRENT_READBACK_OWNED_CLEANUP_FAILED',
            );
        })());
      },
      /** Invoke only after fixture.cleanup() dropped its clone, never earlier. */
      newlyCreatedFixedRoles: Object.freeze(
        [
          'world_v2_postwar_projection_owner',
          'world_v2_postwar_projection_publisher',
          'world_v2_postwar_projection_reader',
        ].filter((r) => !beforeRoles.includes(r)),
      ),
    });
  } catch (error) {
    const errors: unknown[] = [error];
    for (const operation of [
      () => closeSource?.(),
      () => pool.end(),
      () => fixture.clone.installer.query('drop role ' + ident(role)),
    ]) {
      try {
        await operation();
      } catch (cleanupError) {
        errors.push(cleanupError);
      }
    }
    if (errors.length > 1)
      throw new AggregateError(
        errors,
        'CURRENT_READBACK_CONSTRUCTION_AND_CLEANUP_FAILED',
        { cause: error },
      );
    throw error;
  }
}
