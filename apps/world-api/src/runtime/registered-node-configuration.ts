/** Deployment data only: no credentials, authority records or service startup. */
import {
  snapshotServerMetadata,
  type ExplicitReadPreparationConfig,
} from '../runtime-preparation/explicit-read-preparation-config.js';

export interface RegisteredNodeConfiguration {
  readonly schemaVersion: 'registered-postwar-node-v1';
  readonly environment: 'staging' | 'production';
  readonly install?: Readonly<{
    centralBankOmo: boolean;
    trade: boolean;
    industryLabour?: boolean;
    industry?: boolean;
  }>;
  readonly workerId: string;
  readonly executionRegistrationRef: string;
  readonly port: number;
  readonly seedPath: string;
  readonly seedFileSha256: string;
  readonly beneficialRent?: Readonly<RegisteredNodeBeneficialRentArtifacts>;
  readonly roles: Readonly<{
    source: string;
    intake: string;
    worker: string;
    actor: string;
  }>;
  readonly countries: readonly {
    readonly countryId: string;
    readonly expectedRawSourceSHA256: string;
  }[];
  readonly read: Omit<ExplicitReadPreparationConfig, 'pool'>;
}

export interface RegisteredNodeBeneficialRentArtifacts {
  readonly parentSeedPath: string;
  readonly parentSeedFileSha256: string;
  readonly receiptsPath: string;
  readonly receiptsFileSha256: string;
  readonly clockBindingRef: string;
}

const exactKeys = (value: object, keys: string[]) =>
  Object.keys(value).sort().join('|') === [...keys].sort().join('|');
const ref = (v: unknown): v is string =>
  typeof v === 'string' && /^[A-Z][A-Z0-9_-]{0,255}$/u.test(v);
const role = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^[a-z][a-z0-9_]{0,62}$/u.test(v) &&
  !v.startsWith('pg_') &&
  !['postgres', 'service_role', 'anon', 'authenticated'].includes(v);
const hash = (v: unknown): v is string =>
  typeof v === 'string' && /^[a-f0-9]{64}$/u.test(v);
const artifactPath = (v: unknown): v is string =>
  typeof v === 'string' && v.startsWith('/') && !v.includes('\0');

export function validateRegisteredNodeBeneficialRentArtifacts(
  value: unknown,
): Readonly<RegisteredNodeBeneficialRentArtifacts> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    !exactKeys(value, [
      'parentSeedPath',
      'parentSeedFileSha256',
      'receiptsPath',
      'receiptsFileSha256',
      'clockBindingRef',
    ])
  )
    throw Error('NODE_EXACT_BENEFICIAL_RENT_ARTIFACTS_REQUIRED');
  const v = value as RegisteredNodeBeneficialRentArtifacts;
  if (
    !artifactPath(v.parentSeedPath) ||
    !artifactPath(v.receiptsPath) ||
    !hash(v.parentSeedFileSha256) ||
    !hash(v.receiptsFileSha256) ||
    !ref(v.clockBindingRef)
  )
    throw Error('NODE_EXACT_BENEFICIAL_RENT_ARTIFACTS_REQUIRED');
  return Object.freeze({ ...v });
}

export function parseRegisteredNodeConfiguration(
  text: string,
): Readonly<RegisteredNodeConfiguration> {
  if (Buffer.byteLength(text) > 65536)
    throw Error('NODE_CONFIGURATION_TOO_LARGE');
  const c = JSON.parse(text) as RegisteredNodeConfiguration;
  if (
    !c ||
    typeof c !== 'object' ||
    Array.isArray(c) ||
    !exactKeys(c, [
      'schemaVersion',
      'environment',
      'workerId',
      'executionRegistrationRef',
      'port',
      'seedPath',
      'seedFileSha256',
      'roles',
      'countries',
      'read',
      ...(Object.hasOwn(c, 'install') ? ['install'] : []),
      ...(Object.hasOwn(c, 'beneficialRent') ? ['beneficialRent'] : []),
    ]) ||
    (c.install !== undefined &&
      (!c.install ||
        !exactKeys(c.install, [
          'centralBankOmo',
          'trade',
          ...(Object.hasOwn(c.install, 'industry') ? ['industry'] : []),
          ...(Object.hasOwn(c.install, 'industryLabour')
            ? ['industryLabour']
            : []),
        ]) ||
        typeof c.install.centralBankOmo !== 'boolean' ||
        typeof c.install.trade !== 'boolean' ||
        (Object.hasOwn(c.install, 'industry') &&
          typeof c.install.industry !== 'boolean') ||
        (c.install.industry === true && c.install.industryLabour === false) ||
        (Object.hasOwn(c.install, 'industryLabour') &&
          typeof c.install.industryLabour !== 'boolean'))) ||
    c.schemaVersion !== 'registered-postwar-node-v1' ||
    !['staging', 'production'].includes(c.environment) ||
    !ref(c.workerId) ||
    !ref(c.executionRegistrationRef) ||
    !Number.isSafeInteger(c.port) ||
    c.port < 1024 ||
    c.port > 65535 ||
    typeof c.seedPath !== 'string' ||
    !c.seedPath.startsWith('/') ||
    c.seedPath.includes('\0') ||
    !hash(c.seedFileSha256) ||
    !c.roles ||
    !exactKeys(c.roles, ['source', 'intake', 'worker', 'actor']) ||
    !Object.values(c.roles).every(role) ||
    new Set(Object.values(c.roles)).size !== 4 ||
    !Array.isArray(c.countries) ||
    c.countries.length < 1 ||
    c.countries.length > 70 ||
    c.countries.some(
      (v) =>
        !v ||
        !exactKeys(v, ['countryId', 'expectedRawSourceSHA256']) ||
        !ref(v.countryId) ||
        !hash(v.expectedRawSourceSHA256),
    ) ||
    new Set(c.countries.map((v) => v.countryId)).size !== c.countries.length ||
    !c.read ||
    !role(c.read.readerRole) ||
    !role(c.read.authorizationPublisherRole) ||
    !snapshotServerMetadata(c.read)
  )
    throw Error('NODE_EXPLICIT_CONFIGURATION_REQUIRED');
  if (
    [c.roles.source, c.roles.intake, c.roles.worker].includes(c.read.readerRole)
  )
    throw Error('NODE_READER_ROLE_SEPARATION_REQUIRED');
  return Object.freeze({
    ...c,
    ...(c.install ? { install: Object.freeze({ ...c.install }) } : {}),
    ...(Object.hasOwn(c, 'beneficialRent')
      ? {
          beneficialRent: validateRegisteredNodeBeneficialRentArtifacts(
            c.beneficialRent,
          ),
        }
      : {}),
    roles: Object.freeze({ ...c.roles }),
    countries: Object.freeze(c.countries.map((v) => Object.freeze({ ...v }))),
    read: Object.freeze({ ...c.read, ...snapshotServerMetadata(c.read)! }),
  });
}

export const REGISTERED_NODE_DATABASE_VARIABLES = Object.freeze({
  read: 'WORLD_NODE_READ_DATABASE_URL',
  intake: 'WORLD_NODE_INTAKE_DATABASE_URL',
  source: 'WORLD_NODE_SOURCE_DATABASE_URL',
  worker: 'WORLD_NODE_WORKER_DATABASE_URL',
  publication: 'WORLD_NODE_PUBLICATION_DATABASE_URL',
});

/** Errors name the missing binding only, never echo a connection string. TLS
 * verification is mandatory; all five principals are configured by the owner. */
export function registeredNodeDatabaseUrls(
  environment: NodeJS.ProcessEnv,
  options: Readonly<{ industryPublisher?: boolean }> = {},
) {
  const result: Record<string, string> = {};
  const principals = new Set<string>();
  for (const [key, variable] of Object.entries({
    ...REGISTERED_NODE_DATABASE_VARIABLES,
    ...(options.industryPublisher
      ? { industryPublication: 'WORLD_NODE_INDUSTRY_PUBLICATION_DATABASE_URL' }
      : {}),
  })) {
    const value = environment[variable];
    let u: URL;
    try {
      u = new URL(value ?? '');
    } catch {
      throw Error('NODE_DATABASE_BINDING_REQUIRED:' + variable);
    }
    if (
      !['postgres:', 'postgresql:'].includes(u.protocol) ||
      !u.hostname ||
      !u.username ||
      u.pathname.length <= 1 ||
      [...u.searchParams.keys()].some((k) => /^ssl/iu.test(k))
    )
      throw Error('NODE_VERIFIED_TLS_DATABASE_BINDING_REQUIRED:' + variable);
    if (principals.has(u.username))
      throw Error('NODE_DISTINCT_DATABASE_PRINCIPALS_REQUIRED');
    principals.add(u.username);
    result[key] = value!;
  }
  return Object.freeze(result) as Readonly<
    Record<keyof typeof REGISTERED_NODE_DATABASE_VARIABLES, string> & {
      readonly industryPublication?: string;
    }
  >;
}
