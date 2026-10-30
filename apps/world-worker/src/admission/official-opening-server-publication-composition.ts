/** Server-only runtime wiring. No key generation, supplied approval callbacks,
 * request paths, seed bootstrap, grant, connection discovery or World start.
 */
import type { KeyObject } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { SqlDatabase, SqlExecutor } from '../persistence/sql-database.js';
import { OfficialOpeningBundleLoader } from '../preparation/official-opening-bundle-loader.js';
import { PrivateOpeningAdmissionAuthority } from './private-opening-admission-authority.js';
import { OfficialOpeningAdmissionPublicationService } from './official-opening-admission-publication.js';

export function createOfficialOpeningServerPublicationComposition(input: {
  readonly database: SqlDatabase;
  readonly publisherRole: string;
  readonly sourceDatabase: SqlDatabase;
  readonly sourceReaderRole: string;
  readonly nowReal: () => string;
  readonly trustedKeys: ReadonlyMap<
    string,
    Readonly<{ publicKey: KeyObject; ownerIdentity: string }>
  >;
  /** Provisioned pinned V2 loaders, never a request-supplied path/hash map. */
  readonly sourceLoaders: ReadonlyMap<string, OfficialOpeningBundleLoader>;
}) {
  const publisherDatabase = input.database;
  const publisherRole = input.publisherRole;
  const nowReal = input.nowReal;
  const source = Object.freeze({
    database: input.sourceDatabase,
    readerRole: input.sourceReaderRole,
  });
  if (
    !source.database ||
    source.database === publisherDatabase ||
    source.readerRole === publisherRole
  )
    throw new Error('OPENING_SERVER_SEPARATE_SOURCE_DATABASE_REQUIRED');
  // Registry refresh while H is locked must use the owning transaction. A
  // second publisher connection can deadlock a one-connection pool, and would
  // otherwise read authority outside this request's transaction/role context.
  const publisherTransaction = new AsyncLocalStorage<SqlExecutor>();
  const database: SqlDatabase = Object.freeze({
    query: <Row extends object>(
      statement: string,
      parameters?: readonly unknown[],
    ) =>
      (publisherTransaction.getStore() ?? publisherDatabase).query<Row>(
        statement,
        parameters,
      ),
    transaction: <Result>(operation: (tx: SqlExecutor) => Promise<Result>) =>
      publisherDatabase.transaction((tx) =>
        publisherTransaction.run(tx, () => operation(tx)),
      ),
  });
  const loaders = new Map(input.sourceLoaders);
  for (const [digest, loader] of loaders)
    if (
      !/^[0-9a-f]{64}$/u.test(digest) ||
      !(loader instanceof OfficialOpeningBundleLoader)
    )
      throw new Error('OPENING_SERVER_SOURCE_REGISTRY_INVALID');
  const authority = new PrivateOpeningAdmissionAuthority({
    trustedKeys: input.trustedKeys,
    registry: {
      async load(reference) {
        const result = await database.query<{
          canonical_authorization: string;
          signature_base64url: string;
        }>(
          'select canonical_authorization,signature_base64url from world_v2.read_runtime_admission_publication_authorization($1)',
          [reference],
        );
        if (result.rows.length !== 1) return null;
        const row = result.rows[0]!;
        if (
          typeof row.canonical_authorization !== 'string' ||
          typeof row.signature_base64url !== 'string'
        )
          return null;
        return {
          canonicalAuthorization: row.canonical_authorization,
          signatureBase64Url: row.signature_base64url,
        };
      },
    },
  });
  const service = new OfficialOpeningAdmissionPublicationService({
    sourceProtocol: 'PINNED_V2_ONLY',
    source,
    database,
    publisherRole,
    nowReal,
    authority,
    sources: { load: async (digest) => loaders.get(digest) ?? null },
  });
  return Object.freeze({
    publish: (
      request: Readonly<{ worldId: string; authorizationReference: string }>,
    ) => service.publish(request),
  });
}
