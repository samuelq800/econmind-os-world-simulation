/** Pure private-issuer + actual immutable source rejection. No database/server,
 * seed bootstrap, simulation, native URL, production key or real grant. */
import { generateKeyPairSync, sign, createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { canonicalSerialize, CURRENT_REPLAY_BINDING } from '@econmind/core';
import {
  PrivateOpeningAdmissionAuthority,
  resolvePrivateOpeningPublicationAuthorization,
  OPENING_PUBLICATION_SIGNATURE_DOMAIN,
  type OpeningPublicationAuthorization,
  type SignedOpeningPublicationAuthorization,
  type VerifiedOpeningPublicationApproval,
} from '../../apps/world-worker/src/admission/private-opening-admission-authority.js';
import {
  OfficialOpeningAdmissionPublicationService,
  officialOpeningPublicationSourceSha256,
  type OfficialOpeningPublicationSourceBundle,
} from '../../apps/world-worker/src/admission/official-opening-admission-publication.js';
import {
  inspectOfficialOpeningDecisionSource,
  unresolvedOfficialOpeningDecision,
} from '../../apps/world-worker/src/preparation/official-opening-decision-reconciliation.js';
import type { SqlDatabase } from '../../apps/world-worker/src/persistence/sql-database.js';

const root = path.resolve(import.meta.dirname, '../..');
const read = (file: string) => readFile(path.join(root, file), 'utf8');
const keys = generateKeyPairSync('ed25519'); // Ephemeral TEST_ONLY keys, not provisioning.
const now = '2026-10-08T06:00:00.000Z';
const mappingBytes = await read(
  'docs/reports/world-connection/C_OFFICIAL_WORLD_OPENING_MAPPING.json',
);
const mapping = JSON.parse(mappingBytes) as {
  source: { dataFiles: Record<string, unknown> };
};
const source = {
  mappingBytes,
  coverageBytes: await read(
    'docs/reports/world-connection/C_OFFICIAL_WORLD_COMPLETE_COVERAGE.json',
  ),
  checksumsBytes: await read(
    'artifacts/world-balanced-candidate-v1/CHECKSUMS.json',
  ),
  proposalBytes: await read(
    'artifacts/E_OPENING_SEMANTIC_MAPPING_PROPOSAL_2026_10_07.md',
  ),
  datasets: Object.fromEntries(
    await Promise.all(
      Object.keys(mapping.source.dataFiles).map(async (file) => [
        file,
        await read(`artifacts/world-balanced-candidate-v1/${file}`),
      ]),
    ),
  ),
};
const checked = inspectOfficialOpeningDecisionSource(source);
if (!checked.source)
  throw new Error('Actual fixed source fixture failed identity check');
const bundle: OfficialOpeningPublicationSourceBundle = {
  source,
  selectionBytes: await read('status/world-data-selection.json'),
  mapManifestBytes: await read('artifacts/world-map-files-v1/manifest.json'),
  regionsBytes: source.datasets['data/regions.json']!,
  gapsBytes: await read(
    'docs/reports/world-connection/C_OFFICIAL_WORLD_OPENING_GAPS.json',
  ),
  decisionBytes: JSON.stringify(
    unresolvedOfficialOpeningDecision(checked.source, {
      worldId: 'WORLD_TEST_PUBLICATION',
      modelVersion: CURRENT_REPLAY_BINDING.modelVersion,
      orchestratorVersion: 'TEST_ONLY_NOT_AUTHORITY',
    }),
  ),
  assemblyBytes: 'null',
  ownerRecords: [],
};

function claims(
  overrides: Partial<OpeningPublicationAuthorization> = {},
): OpeningPublicationAuthorization {
  return {
    schemaVersion: 'opening-publication-authorization-v1',
    purpose: 'AUTHORIZE_OFFICIAL_OPENING_ADMISSION_PUBLICATION',
    authorizationId: 'AUTHORIZATION_TEST_ONLY',
    keyId: 'TEST_KEY',
    ownerIdentity: 'TEST_ONLY_NOT_OWNER',
    issuedAtReal: '2026-10-08T05:00:00.000Z',
    expiresAtReal: '2026-10-08T07:00:00.000Z',
    worldId: 'WORLD_TEST_PUBLICATION',
    seedId: 'SEED_NOT_EXISTENT_TEST_BOUND',
    seedFingerprint: 'sha256:' + '1'.repeat(64),
    modelVersion: CURRENT_REPLAY_BINDING.modelVersion,
    replayBinding: canonicalSerialize(CURRENT_REPLAY_BINDING),
    sourceBundleSha256: officialOpeningPublicationSourceSha256(bundle),
    ...overrides,
  };
}
function signed(body: unknown): SignedOpeningPublicationAuthorization {
  const canonicalAuthorization = canonicalSerialize(body);
  return {
    canonicalAuthorization,
    signatureBase64Url: sign(
      null,
      Buffer.from(
        OPENING_PUBLICATION_SIGNATURE_DOMAIN + canonicalAuthorization,
      ),
      keys.privateKey,
    ).toString('base64url'),
  };
}
function authority(
  record: SignedOpeningPublicationAuthorization | null = signed(claims()),
) {
  return new PrivateOpeningAdmissionAuthority({
    trustedKeys: new Map([
      [
        'TEST_KEY',
        { publicKey: keys.publicKey, ownerIdentity: 'TEST_ONLY_NOT_OWNER' },
      ],
    ]),
    registry: { load: async () => record },
  });
}
function service(
  input: {
    authority?: PrivateOpeningAdmissionAuthority;
    sourceBundle?: OfficialOpeningPublicationSourceBundle | null;
  } = {},
) {
  let queries = 0,
    transactions = 0,
    sourceReads = 0;
  const database: SqlDatabase = {
    async query() {
      queries++;
      throw new Error('DATABASE_ACCESS_UNEXPECTED');
    },
    async transaction() {
      transactions++;
      throw new Error('TRANSACTION_UNEXPECTED');
    },
  };
  return {
    entry: new OfficialOpeningAdmissionPublicationService({
      database,
      authority: input.authority ?? authority(),
      sources: {
        load: async () => {
          sourceReads++;
          return input.sourceBundle === undefined ? bundle : input.sourceBundle;
        },
      },
      publisherRole: 'world_v2_opening_admission_publisher',
      nowReal: () => now,
    }),
    observations: () => ({ queries, transactions, sourceReads }),
  };
}
const request = {
  worldId: 'WORLD_TEST_PUBLICATION',
  authorizationReference: 'AUTHORIZATION_TEST_ONLY',
};

describe('private Owner publication authorization (not admission)', () => {
  it('checks Ed25519 signature/purpose/Owner/world/seed/model/replay/source binding', async () => {
    const issuer = authority();
    const proof = await issuer.resolve(request.authorizationReference, now);
    expect(issuer.claims(proof)).toEqual(claims());
    expect(Object.keys(proof)).toEqual([]);
    expect(issuer.claims(proof)).not.toHaveProperty('status', 'ADMITTED');
  });
  it('refuses structural caller proofs and proofs from a different issuer', async () => {
    const issuer = authority();
    expect(() =>
      issuer.claims({} as VerifiedOpeningPublicationApproval),
    ).toThrow('AUTHORIZATION_DENIED');
    const another = await authority().resolve(
      request.authorizationReference,
      now,
    );
    expect(() => issuer.claims(another)).toThrow('AUTHORIZATION_DENIED');
  });
  it.each([
    'worldId',
    'seedId',
    'seedFingerprint',
    'modelVersion',
    'replayBinding',
    'sourceBundleSha256',
  ] as const)('rejects unsigned mutation of exact %s', async (field) => {
    const original = signed(claims());
    const raw = JSON.parse(original.canonicalAuthorization) as Record<
      string,
      unknown
    >;
    raw[field] = 'ALTERED';
    await expect(
      authority({
        ...original,
        canonicalAuthorization: canonicalSerialize(raw),
      }).resolve(request.authorizationReference, now),
    ).rejects.toThrow('AUTHORIZATION_DENIED');
  });
  it.each([
    { ownerIdentity: 'SOME_OTHER_OWNER' },
    { keyId: 'UNTRUSTED_KEY' },
    { issuedAtReal: '2026-10-08T06:00:00.001Z' },
    { expiresAtReal: now },
    { issuedAtReal: '2026-02-30T00:00:00.000Z' },
  ])(
    'rejects wrong issuer/Owner/time despite a test signature: %j',
    async (changes) => {
      await expect(
        authority(signed(claims(changes))).resolve(
          request.authorizationReference,
          now,
        ),
      ).rejects.toThrow('AUTHORIZATION_DENIED');
    },
  );
  it('rejects caller approval flags, ADMITTED results and a different purpose', async () => {
    for (const body of [
      { ...claims(), approved: true },
      { ...claims(), status: 'ADMITTED' },
      { ...claims(), purpose: 'SOURCE_READY_NOT_APPROVAL' },
    ])
      await expect(
        authority(signed(body)).resolve(request.authorizationReference, now),
      ).rejects.toThrow('AUTHORIZATION_DENIED');
  });
  it('rejects a forged signature, noncanonical envelope, missing/revoked record and wrong reference', async () => {
    const valid = signed(claims());
    for (const record of [
      null,
      { ...valid, signatureBase64Url: Buffer.alloc(64).toString('base64url') },
      { ...valid, canonicalAuthorization: JSON.stringify(claims()) },
    ])
      await expect(
        authority(record).resolve(request.authorizationReference, now),
      ).rejects.toThrow('AUTHORIZATION_DENIED');
    await expect(authority().resolve('OTHER_REFERENCE', now)).rejects.toThrow(
      'AUTHORIZATION_DENIED',
    );
  });
  it('bundles no trusted production key or automatic signer', async () => {
    const closed = new PrivateOpeningAdmissionAuthority({
      trustedKeys: new Map(),
      registry: { load: async () => signed(claims()) },
    });
    await expect(
      closed.resolve(request.authorizationReference, now),
    ).rejects.toThrow('AUTHORIZATION_DENIED');
  });
  it('does not accept structural issuers or replaced instance approval methods', async () => {
    const fabricated = Object.create(
      PrivateOpeningAdmissionAuthority.prototype,
    ) as PrivateOpeningAdmissionAuthority;
    await expect(
      resolvePrivateOpeningPublicationAuthorization(
        fabricated,
        request.authorizationReference,
        now,
      ),
    ).rejects.toThrow('AUTHORIZATION_DENIED');
    const genuine = authority(null);
    Object.assign(genuine, {
      resolve: async () => Object.freeze({}),
      claims: () => claims(),
    });
    await expect(
      resolvePrivateOpeningPublicationAuthorization(
        genuine,
        request.authorizationReference,
        now,
      ),
    ).rejects.toThrow('AUTHORIZATION_DENIED');
  });
});

describe('official opening publication source-blocked entry', () => {
  it('reuses real fixed 70-country source; a signed authorization cannot fill its gaps', async () => {
    expect(checked.status).toBe('VALIDATED_SOURCE_NOT_ADOPTION');
    expect(checked.source!.countryIds).toHaveLength(70);
    const s = service();
    await expect(s.entry.publish(request)).rejects.toMatchObject({
      code: 'OPENING_SOURCE_BLOCKED',
      blockerCodes: expect.arrayContaining([
        'WORLD_ID_BINDING_REQUIRED',
        'OWNER_LEGAL_ENTITY_BINDING_REQUIRED',
        'SCENARIO_CURRENCY_CORE_BINDING_REQUIRED',
        'TREASURY_CENTRAL_BANK_SPLIT_REQUIRED',
      ]),
    });
    expect(s.observations()).toEqual({
      queries: 0,
      transactions: 0,
      sourceReads: 1,
    });
  });
  it('requires real authorization before source or database access', async () => {
    const s = service({ authority: authority(null) });
    await expect(s.entry.publish(request)).rejects.toThrow(
      'AUTHORIZATION_DENIED',
    );
    expect(s.observations()).toEqual({
      queries: 0,
      transactions: 0,
      sourceReads: 0,
    });
  });
  it('rejects cross-World invocation before source access', async () => {
    const s = service();
    await expect(
      s.entry.publish({ ...request, worldId: 'OTHER_WORLD' }),
    ).rejects.toMatchObject({ code: 'OPENING_BINDING_MISMATCH' });
    expect(s.observations()).toEqual({
      queries: 0,
      transactions: 0,
      sourceReads: 0,
    });
  });
  it('does not turn absent source into zero, an empty seed or READY', async () => {
    const s = service({ sourceBundle: null });
    await expect(s.entry.publish(request)).rejects.toMatchObject({
      code: 'OPENING_SOURCE_UNAVAILABLE',
    });
    expect(s.observations().transactions).toBe(0);
  });
  it('rejects modified source/decision/assembly/owner bytes against signed bundle identity', async () => {
    for (const replacement of [
      { ...bundle, assemblyBytes: '{"status":"READY"}' },
      {
        ...bundle,
        ownerRecords: [
          { reference: 'CALLER_OWNER', recordBytes: '{"approved":true}' },
        ],
      },
      { ...bundle, decisionBytes: '{"status":"ADMITTED"}' },
    ]) {
      const s = service({ sourceBundle: replacement });
      await expect(s.entry.publish(request)).rejects.toMatchObject({
        code: 'OPENING_SOURCE_IDENTITY_MISMATCH',
      });
      expect(s.observations().transactions).toBe(0);
    }
  });
  it('even signed changed source bytes must pass independent fixed-source validation', async () => {
    const altered = { ...bundle, source: { ...source, checksumsBytes: '[]' } };
    const s = service({
      sourceBundle: altered,
      authority: authority(
        signed(
          claims({
            sourceBundleSha256: officialOpeningPublicationSourceSha256(altered),
          }),
        ),
      ),
    });
    await expect(s.entry.publish(request)).rejects.toMatchObject({
      code: 'OPENING_SOURCE_INVALID',
    });
    expect(s.observations().transactions).toBe(0);
  });
  it('rejects caller READY/approval fields and broad publisher roles', async () => {
    const s = service();
    await expect(
      s.entry.publish({ ...request, approved: true } as typeof request),
    ).rejects.toMatchObject({ code: 'OPENING_PUBLICATION_REQUEST_INVALID' });
    expect(s.observations().sourceReads).toBe(0);
    const database = {} as SqlDatabase;
    for (const publisherRole of [
      'postgres',
      'service_role',
      'world_v2_api_reader',
    ])
      expect(
        () =>
          new OfficialOpeningAdmissionPublicationService({
            database,
            authority: authority(),
            sources: { load: async () => null },
            publisherRole,
            nowReal: () => now,
          }),
      ).toThrow('OPENING_PUBLISHER_ROLE_DENIED');
  });
  it('retains exact read-only store and SQL publication veto from main', async () => {
    for (const file of [
      'apps/world-worker/src/persistence/runtime-read-binding-store.ts',
      'database/proposals/runtime-read-binding-storage.sql',
    ]) {
      const base = execFileSync(
        'git',
        [
          '--no-replace-objects',
          'show',
          `bcfc66787631a13aa5093df42954070c2d7dd66b:${file}`,
        ],
        { cwd: root },
      );
      expect(await readFile(path.join(root, file))).toEqual(base);
      expect(base.toString()).toContain(
        'ADMISSION_PUBLICATION_ENTRYPOINT_MISSING',
      );
    }
    const sha = createHash('sha256').update(mappingBytes).digest('hex');
    expect(sha).toBe(
      'd2811910a9021e68fabe894504701d6dc8d88e362fc2354b0c826e3446456253',
    );
  });
});
