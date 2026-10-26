/** Synthetic signatures and adapter protocols are never installed source evidence. */
import { generateKeyPairSync, sign, type KeyObject } from 'node:crypto';
import { lstat } from 'node:fs/promises';
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { canonicalSerialize } from '@econmind/core';
import {
  PostgresSqlDatabase,
  PostgresTransactionError,
} from '../../apps/world-worker/src/persistence/postgres-sql-database.js';
import {
  GOV01_ORIGINAL_ID,
  type Gov01ReadRequest,
} from '../../apps/world-worker/src/preparation/b06-gov01-adopted-record-source.js';
import { createTestOnlyFinancialOpeningPackageRegistryLoader } from '../../apps/world-worker/src/preparation/financial-opening-package-registry.js';
import { financialInputSha256 } from '../../apps/world-worker/src/preparation/formal-financial-opening-contract.js';
import { readInstalledGov01AccountInTransaction } from '../../apps/world-worker/src/preparation/b06-gov01-source-installation.js';
import {
  inspectGov01NodeEnrollmentData,
  isGov01PrivateNativeRecordSource,
} from '../../apps/world-worker/src/preparation/gov01-private-source-host.js';
import {
  applyGov01NativeControlOperation,
  parseGov01ControlOperation,
  gov01ControlSha256 as sha,
} from '../../apps/world-worker/src/preparation/gov01-native-control-store.js';
import {
  materializeFinancialOpeningPackageFixture,
  disposeFinancialOpeningPackageFixture,
} from '../support/financial-opening-package-fixture.js';
import { originalEntityFixture } from '../support/entity-native-cash-candidate-fixture.js';

const roles = [
  'retainedOriginPin',
  'installationPin',
  'cbIssuerCustodyAppointmentPin',
  'govRegisterCustodyAppointmentPin',
  'holderConcurrencePin',
  'definitionAdoptionPin',
  'exactRecordSetAdoptionPin',
  'registrationPin',
  'controlCheckpointPin',
  'currencyAdoptionPin',
  'openingPin',
] as const;
const request: Gov01ReadRequest = {
  worldId: 'WORLD_GOV01_PROTOCOL_ONLY',
  requestedOriginalId: GOV01_ORIGINAL_ID,
  registrationReference: 'TEST_REGISTRATION',
  sourceSetVersion: 'TEST_SET',
  heldHead: { worldVersion: '0', eventSequence: '0' },
};
const document = (id: string, utf8 = 'TEST_ONLY_UNAPPOINTED_RAW_ORIGINAL') => ({
  pin: {
    documentId: id,
    sourceVersion: 'TEST_ONLY',
    byteLength: String(Buffer.byteLength(utf8)),
    sha256: sha(utf8),
    pointer: '',
  },
  utf8,
});
function enrollment() {
  const root = generateKeyPairSync('ed25519');
  const spki = (key: KeyObject) =>
    key.export({ format: 'der', type: 'spki' }).toString('base64');
  const trusted = {
    schemaVersion: 'gov01-independent-authority-trust-v1',
    rootPublicKeySpki: spki(root.publicKey),
    rootAuthorityReference: 'TEST_ONLY_NOT_COMPETENT_ACTUAL_AUTHORITY',
    rootAuthorityOriginal: document('TEST_ROOT_ORIGINAL'),
  };
  const pairs = roles.map(() => generateKeyPairSync('ed25519'));
  const rolePins = Object.fromEntries(
    roles.map((role) => [role, document('TEST_' + role).pin]),
  );
  const certificates = roles.map((role, index) => {
    const body = {
      role,
      publicKeySpki: spki(pairs[index]!.publicKey),
      rootAuthorityReference: trusted.rootAuthorityReference,
      worldId: request.worldId,
      originalId: GOV01_ORIGINAL_ID,
      registrationReference: request.registrationReference,
      sourceSetVersion: request.sourceSetVersion,
      competenceEvidencePin: rolePins[role],
    };
    return {
      body,
      signature: sign(
        null,
        Buffer.from('GOV01_ROLE_CERTIFICATE_V1\n' + canonicalSerialize(body)),
        root.privateKey,
      ).toString('base64'),
    };
  });
  const body = {
    enrollmentReference: 'TEST_ENROLLMENT_NOT_INSTALLED',
    rootAuthorityReference: trusted.rootAuthorityReference,
    scope: {
      worldId: request.worldId,
      originalId: GOV01_ORIGINAL_ID,
      registrationReference: request.registrationReference,
      sourceSetVersion: request.sourceSetVersion,
      heldHead: request.heldHead,
    },
    target: {
      deploymentReference: 'TEST_NODE',
      databaseIdentityRef: 'TEST_DB',
      databaseName: 'econmind_v09_fixture_only',
      connectorReference: 'TEST_OWNED_ADAPTER',
      catalogIdentity: 'TEST_CATALOG',
      readerPrincipal: 'test_reader',
      allowedCaller: 'WORKER_GOV01_ACCOUNT_READ_V1',
    },
    control: {
      anchorReference: 'TEST_ANCHOR',
      scopeReference: 'TEST_SCOPE',
      generation: '1',
      headDigest: '1'.repeat(64),
      checkpointGeneration: '1',
      checkpointHeadDigest: '1'.repeat(64),
    },
    opening: {
      seedOrGenesisId: 'TEST_GENESIS',
      seedOrGenesisFingerprint: 'sha256:' + '2'.repeat(64),
      asOf: '2026-10-01T00:00:00.000Z',
      valueDate: '2026-10-01T00:00:00.000Z',
      calendarEpochSourceReference: 'TEST_EPOCH',
      lifecycleAttestationReference: 'TEST_INACTIVE',
      openingAuthorityEvidenceReference: 'TEST_OPENING',
    },
    currency: { code: 'XAA', unit: 'XAA_UNIT' },
    bindingSha256: '3'.repeat(64),
    pinSetSha256: '4'.repeat(64),
    rolePins,
    roleCertificateSetSha256: sha(canonicalSerialize(certificates)),
  };
  const value = {
    schemaVersion: 'gov01-node-native-installation-envelope-v1',
    body,
    roleCertificates: certificates,
    rootSignature: sign(
      null,
      Buffer.from(
        'GOV01_INSTALLATION_ENVELOPE_V1\n' + canonicalSerialize(body),
      ),
      root.privateKey,
    ).toString('base64'),
    roleSignatures: roles.map((role, index) => ({
      role,
      signature: sign(
        null,
        Buffer.from(
          'GOV01_INSTALLATION_ROLE_V1\n' +
            role +
            '\n' +
            canonicalSerialize(body),
        ),
        pairs[index]!.privateKey,
      ).toString('base64'),
    })),
  };
  return { trusted, value };
}
function operation() {
  return {
    schemaVersion: 'gov01-control-operation-v1',
    operationId: 'TEST_REGISTER',
    worldId: request.worldId,
    originalId: GOV01_ORIGINAL_ID,
    heldHead: request.heldHead,
    expected: null,
    kind: 'REGISTER',
    payload: {
      recordClass: 'CONTROL_PROTOCOL_ONLY',
      anchorReference: 'TEST_ANCHOR',
      scopeReference: 'TEST_SCOPE',
      registrationReference: request.registrationReference,
      sourceSetVersion: request.sourceSetVersion,
      targetDeploymentRef: 'TEST_TARGET',
      databaseIdentityRef: 'TEST_DB',
      connectorReference: 'TEST_CONNECTOR',
      allowedCaller: 'WORKER_GOV01_ACCOUNT_READ_V1',
      enrollmentReference: 'TEST_ONLY_NOT_APPOINTED',
      bindingBase: null,
      manifestPin: null,
      documents: [document('TEST_RAW')],
    },
  };
}
function adapter(
  failure: 'none' | 'begin' | 'callback' | 'commit' | 'rollback',
) {
  const trace: string[] = [];
  let releases = 0;
  const pool = {
    async connect() {
      return {
        async query(sql: string) {
          trace.push(sql);
          if (sql === 'begin' && failure === 'begin')
            throw Error('TEST_BEGIN_FAILURE');
          if (sql === 'commit' && failure === 'commit')
            throw Error('TEST_UNKNOWN_COMMIT_ACK');
          if (sql === 'rollback' && failure === 'rollback')
            throw Error('TEST_UNKNOWN_ROLLBACK_ACK');
          if (sql.includes('gov01_apply_control_operation')) {
            if (['callback', 'rollback'].includes(failure))
              throw Error('TEST_OPERATION_FAILURE');
            return {
              rows: [
                {
                  outcome: {
                    classification: 'CONTROL_PROTOCOL_ONLY',
                    source: 'NEW_CONTROL_OPERATION',
                    worldId: request.worldId,
                    operationId: 'TEST_REGISTER',
                    generation: '1',
                    headDigest: '1'.repeat(64),
                  },
                },
              ],
              rowCount: 1,
            };
          }
          return { rows: [], rowCount: 0 };
        },
        release() {
          releases++;
        },
      };
    },
  };
  return {
    database: new PostgresSqlDatabase(pool as unknown as Pool),
    trace,
    released: () => releases,
  };
}

describe('GOV01 private Node host delta — inert verification and refusal', () => {
  it('verifies all synthetic signatures as DATA without installing or authenticating a source', () => {
    const v = enrollment();
    const result = inspectGov01NodeEnrollmentData(v.value, v.trusted);
    expect(result.classification).toBe('ENROLLMENT_DATA_NOT_INSTALLED_SOURCE');
    expect(Object.isFrozen(result.body)).toBe(true);
    expect(isGov01PrivateNativeRecordSource(result)).toBe(false);
    expect(isGov01PrivateNativeRecordSource(v.value)).toBe(false);
    expect('sourceAdmitted' in result).toBe(false);
  });
  it.each(['rootSignature', 'roleSignatures', 'roleCertificates'])(
    'refuses a changed complete %s set',
    (field) => {
      const v = enrollment();
      const changed = {
        ...v.value,
        [field]:
          field === 'rootSignature' ? Buffer.alloc(64).toString('base64') : [],
      };
      expect(() =>
        inspectGov01NodeEnrollmentData(changed, v.trusted),
      ).toThrow();
    },
  );
  it.each(['bindingSha256', 'pinSetSha256', 'enrollmentReference'])(
    'binds the exact signed %s',
    (field) => {
      const v = enrollment();
      expect(() =>
        inspectGov01NodeEnrollmentData(
          {
            ...v.value,
            body: {
              ...v.value.body,
              [field]:
                field === 'enrollmentReference'
                  ? 'OTHER_ENROLLMENT'
                  : 'f'.repeat(64),
            },
          },
          v.trusted,
        ),
      ).toThrow('GOV01_SIGNATURE_INVALID');
    },
  );
  it('cannot appoint its verifier with a source-supplied root key', () => {
    const a = enrollment(),
      b = enrollment();
    expect(() => inspectGov01NodeEnrollmentData(a.value, b.trusted)).toThrow(
      'GOV01_SIGNATURE_INVALID',
    );
  });
  it('rejects accessor/proxy control operations without invoking caller behavior', () => {
    let calls = 0;
    const value = operation();
    Object.defineProperty(value, 'payload', {
      enumerable: true,
      get() {
        calls++;
        return {};
      },
    });
    expect(() => parseGov01ControlOperation(value)).toThrow(
      'GOV01_ACCESSOR_DENIED',
    );
    expect(() =>
      parseGov01ControlOperation(
        new Proxy(operation(), {
          ownKeys() {
            calls++;
            return [];
          },
        }),
      ),
    ).toThrow();
    expect(calls).toBe(0);
  });
  it('keeps complete raw document bytes and refuses pin mismatch, duplicate files and source-control self-hashes', () => {
    const value = operation();
    const parsed = parseGov01ControlOperation(value);
    expect(parsed.payload).toEqual(value.payload);
    expect(isGov01PrivateNativeRecordSource(parsed)).toBe(false);
    expect(() =>
      parseGov01ControlOperation({
        ...value,
        payload: {
          ...value.payload,
          documents: [value.payload.documents[0], value.payload.documents[0]],
        },
      }),
    ).toThrow();
    expect(() =>
      parseGov01ControlOperation({
        ...value,
        payload: {
          ...value.payload,
          documents: [{ ...document('BAD'), utf8: 'CHANGED' }],
        },
      }),
    ).toThrow('GOV01_RAW_PIN_MISMATCH');
    expect(() =>
      parseGov01ControlOperation({
        ...value,
        payload: {
          ...value.payload,
          bindingBase: { control: { headDigest: 'a'.repeat(64) } },
        },
      }),
    ).toThrow('GOV01_NATIVE_CONTROL_NOT_PAYLOAD_SELF_HASH');
  });
  it('releases a control-protocol result only after real adapter COMMIT and release', async () => {
    const v = adapter('none');
    const result = await applyGov01NativeControlOperation(
      v.database,
      operation(),
    );
    expect(v.trace.at(-1)).toBe('commit');
    expect(v.released()).toBe(1);
    expect(result.transactionResult).toBe('COMMITTED');
    expect(result.sourceAdmitted).toBe(false);
    expect(result.actualSourceInstalled).toBe(false);
    expect(isGov01PrivateNativeRecordSource(result)).toBe(false);
  });
  it.each([
    ['begin', 'NOT_STARTED'],
    ['callback', 'ROLLED_BACK'],
    ['commit', 'COMMIT_OUTCOME_UNKNOWN'],
    ['rollback', 'ROLLBACK_UNCONFIRMED'],
  ] as const)(
    'suppresses results for %s outcome without retry',
    async (failure, outcome) => {
      const v = adapter(failure);
      let exposed = false;
      await expect(
        applyGov01NativeControlOperation(v.database, operation()).then(() => {
          exposed = true;
        }),
      ).rejects.toMatchObject({ outcome });
      expect(exposed).toBe(false);
      expect(v.released()).toBe(1);
      expect(v.trace.filter((x) => x === 'begin')).toHaveLength(1);
    },
  );
  it('does not expose an installer accepting a key/path/source/callback parameter', async () => {
    const v = adapter('none');
    await expect(
      readInstalledGov01AccountInTransaction({
        database: v.database,
        context: {} as never,
        request,
        fixtureRoot: '/tmp/NOT_AN_INSTALLATION',
      } as never),
    ).rejects.toThrow('GOV01_FIXED_PRIVATE_ENTRY_REQUIRED');
    expect(v.trace).toEqual([]);
  });
});

describe('GOV01 actual private entry — unconfigured host refusal only', () => {
  let fixture: Awaited<
    ReturnType<typeof materializeFinancialOpeningPackageFixture>
  >;
  let registry: Awaited<
    ReturnType<
      Awaited<
        ReturnType<typeof createTestOnlyFinancialOpeningPackageRegistryLoader>
      >['load']
    >
  >;
  beforeAll(async () => {
    try {
      await lstat('/etc/econmind/world/gov01/installation-authority.json');
      throw Error('TEST_REQUIRES_UNCONFIGURED_PRIVATE_HOST');
    } catch (error) {
      if (!(
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'ENOENT'
      ))
        throw error;
    }
    fixture = await materializeFinancialOpeningPackageFixture();
    registry = await (
      await createTestOnlyFinancialOpeningPackageRegistryLoader({
        fixtureRoot: fixture.fixtureRoot,
      })
    ).load();
  });
  afterAll(async () => {
    if (fixture) await disposeFinancialOpeningPackageFixture(fixture);
  });
  it('calls the real private entry but refuses before database access when actual enrollment is absent', async () => {
    const v = adapter('none'),
      original = originalEntityFixture();
    const context = {
      registry,
      countryId: 'COUNTRY_01' as const,
      mappings: {
        documentId: 'TEST_REFERENCE_MAPPING',
        bytes: original.mappingsBytes,
        sha256: financialInputSha256(original.mappingsBytes),
      },
      originalField: {
        stableId: GOV01_ORIGINAL_ID,
        ownerId: 'ENTITY_GOVERNMENT_01',
        countryId: 'COUNTRY_01',
        missingField: 'account' as const,
      },
    };
    const error = await readInstalledGov01AccountInTransaction({
      database: v.database,
      context,
      request,
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(PostgresTransactionError);
    expect(v.trace).toEqual([]);
  });
});
