/** Bounded read-only wiring/negative tests. No positive formal adoption package,
 * real keys, admission, database, host, native run or production permissions. */
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { constants } from 'node:fs';
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { canonicalSerialize, CURRENT_REPLAY_BINDING } from '@econmind/core';
import {
  OfficialOpeningBundleLoader,
  officialOpeningPublicationSourceSha256,
  type LoadedOfficialOpeningBundle,
  type ServerOpeningIncomingManifestV2,
  type OfficialOpeningPublicationSourceBundleV2,
} from '../../apps/world-worker/src/preparation/official-opening-bundle-loader.js';
import { prepareOfficialOpeningBundleCandidate } from '../../apps/world-worker/src/preparation/official-opening-candidate-composition.js';
import { preflightOfficialOpeningBundle } from '../../apps/world-worker/src/preparation/official-opening-bundle-preflight.js';
import {
  openingV2AssemblyIntentFingerprint,
  prepareFinancialSupplementOpeningSeed,
  type OpeningCanonicalSeedAssemblyV2,
} from '../../apps/world-worker/src/preparation/opening-canonical-seed-bridge.js';
import {
  loadOwnerNonHostSourceAdoption,
  loadFinancialSupplementAdoption,
  snapshotFinancialSupplementRegistration,
  type OwnerNonHostSourceAdoption,
  type FinancialSupplementAdoption,
  type FinancialSupplementRegistration,
} from '../../apps/world-worker/src/preparation/owner-non-host-source-adoption.js';
import {
  parseFormalFinancialOpeningContract,
  financialInputSha256,
  type FormalFinancialOpeningContract,
} from '../../apps/world-worker/src/preparation/formal-financial-opening-contract.js';
import { produceFormalFinancialOpening } from '../../apps/world-worker/src/preparation/formal-financial-opening-producer.js';
import {
  OfficialOpeningAdmissionPublicationService,
  officialOpeningPublicationSourceSha256 as publisherDigest,
} from '../../apps/world-worker/src/admission/official-opening-admission-publication.js';
import {
  PrivateOpeningAdmissionAuthority,
  OPENING_PUBLICATION_SIGNATURE_DOMAIN,
  type OpeningPublicationAuthorization,
} from '../../apps/world-worker/src/admission/private-opening-admission-authority.js';
import { financialCompositionVector } from '../support/financial-composition-vector.js';

const repositoryRoot = path.resolve(import.meta.dirname, '../..');
const parentPrefix = 'docs/governance/owner-inputs/2026-10-07/';
const instructionPath = parentPrefix + 'OWNER_NON_HOST_DECISIONS.original.md';
const receiptPath = parentPrefix + 'OWNER_NON_HOST_DECISION_RECEIPT.json';
const identity = (bytes: string | Buffer) => ({
  sha256: createHash('sha256').update(bytes).digest('hex'),
  bytes: Buffer.byteLength(bytes),
});
const copy = <T>(value: T): T => JSON.parse(canonicalSerialize(value)) as T;
const temps: string[] = [];
let parent: OwnerNonHostSourceAdoption,
  base: LoadedOfficialOpeningBundle,
  loaded: LoadedOfficialOpeningBundle,
  incoming: ServerOpeningIncomingManifestV2,
  vector: FormalFinancialOpeningContract,
  testRoot: string;
async function carrier(contract: FormalFinancialOpeningContract) {
  const ownerInstructionBytes =
    'GENERATED MECHANISM TEST ONLY; NOT OWNER ADOPTION';
  const adoptionReceiptBytes = '{}',
    decisionBytes = 'null',
    assemblyBytes = 'null';
  const financial: OfficialOpeningPublicationSourceBundleV2['financial'] = {
    inputBytes: canonicalSerialize(contract),
    adoptionReceiptBytes,
    ownerInstructionBytes,
    parentOwnerInstructionBytes: await readFile(
      path.join(repositoryRoot, instructionPath),
      'utf8',
    ),
    parentOwnerReceiptBytes: await readFile(
      path.join(repositoryRoot, receiptPath),
      'utf8',
    ),
    registeredReference: null,
    documents: vector.documents.map((d) => ({
      documentId: d.documentId,
      sourcePath: d.sourcePath,
      bytes: d.bytes,
    })),
  };
  const bundle: OfficialOpeningPublicationSourceBundleV2 = {
    ...base.inputs,
    schemaVersion: 'official-opening-publication-source-v2',
    decisionBytes,
    assemblyBytes,
    ownerRecords: [],
    financial,
  };
  const files: Record<string, string> = {
    'incoming/decision.json': decisionBytes,
    'incoming/assembly.json': assemblyBytes,
    'incoming/financial/input.json': financial.inputBytes,
    'incoming/financial/adoption.json': adoptionReceiptBytes,
    'incoming/financial/owner-instruction.md': ownerInstructionBytes,
  };
  for (const doc of financial.documents) files[doc.sourcePath] = doc.bytes;
  for (const [locator, bytes] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(testRoot, locator)), {
      recursive: true,
    });
    await writeFile(path.join(testRoot, locator), bytes);
  }
  return {
    schemaVersion: 'server-opening-incoming-v2' as const,
    decision: identity(decisionBytes),
    assembly: identity(assemblyBytes),
    ownerRecords: [],
    financial: {
      input: identity(financial.inputBytes),
      adoptionReceipt: identity(adoptionReceiptBytes),
      ownerInstruction: identity(ownerInstructionBytes),
      documents: financial.documents.map((d) => ({
        documentId: d.documentId,
        identity: identity(d.bytes),
      })),
    },
    expectedBundleSha256: officialOpeningPublicationSourceSha256(bundle),
  };
}
beforeAll(async () => {
  base = await new OfficialOpeningBundleLoader({ repositoryRoot }).load();
  parent = await loadOwnerNonHostSourceAdoption({
    repositoryRoot,
    ownerDocumentPath: path.join(repositoryRoot, instructionPath),
    rootReceiptPath: path.join(repositoryRoot, receiptPath),
    scope: { environment: 'NON_ACTIVATED_PREPARATION', worldId: null },
  });
  vector = financialCompositionVector(parent);
  testRoot = await mkdtemp(
    path.join(await realpath(tmpdir()), 'opening-composition-negative-'),
  );
  temps.push(testRoot);
  for (const locator of [
    ...base.validatedFiles.map((f) => f.locator),
    instructionPath,
    receiptPath,
  ]) {
    const destination = path.join(testRoot, locator);
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(
      path.join(repositoryRoot, locator),
      destination,
      constants.COPYFILE_FICLONE,
    );
  }
  incoming = await carrier(vector);
  loaded = await new OfficialOpeningBundleLoader({
    repositoryRoot: testRoot,
    incoming,
  }).load();
}, 30_000);
afterAll(async () => {
  for (const root of temps) await rm(root, { recursive: true, force: true });
});
const registration: FinancialSupplementRegistration = {
  recordId: 'TEST_NEGATIVE_ONLY',
  ownerIdentity: 'NOT_OWNER',
  expectedReceiptSha256: identity('{}').sha256,
  expectedInstructionSha256: identity('NOT_ADOPTED').sha256,
  retainedReference:
    'git:' +
    '1'.repeat(40) +
    ':docs/governance/owner-inputs/TEST_NEGATIVE_ONLY.json',
  channel: 'DIRECT_USER_MESSAGE_IN_CURRENT_ROOT_CHAT',
};

function hashOnlyAssembly(): OpeningCanonicalSeedAssemblyV2 {
  return {
    schemaVersion: 'opening-canonical-seed-assembly-v2',
    worldId: vector.worldId,
    seedId: 'SEED_HASH_ONLY_NOT_IMPORTABLE',
    sourceId: vector.sourceId,
    adoptionRecordId: 'TEST_NEGATIVE_ONLY',
    parentReceiptSha256: parent.ownerPolicy.receiptSha256,
    adoptionManifestFingerprint: parent.manifestFingerprint,
    contractFingerprint: 'sha256:' + '2'.repeat(64),
    candidateFingerprint: 'sha256:' + '3'.repeat(64),
    replayBinding: CURRENT_REPLAY_BINDING,
    orchestratorVersion: 'TEST_ONLY',
    countries: parent.manifest.countries.map((c) => ({
      countryId: c.countryId,
      adoptionRef: 'TEST_NEGATIVE_ONLY',
      roster: {
        operator: c.holderRoster.operator,
        government: c.holderRoster.treasury,
        households: c.holderRoster.households,
        bank: c.holderRoster.bank,
        centralBank: c.holderRoster.centralBank,
      },
      inventoryEntries: [],
      financialBatches: [],
    })),
  };
}

describe('genuine V2 read-only financial composition (no formal source installed)', () => {
  it('loads all exact bytes immutably; publication digest has one implementation and V1 remains unchanged', () => {
    expect(loaded.validatedFiles).toHaveLength(101);
    expect(loaded.sourceBundleSha256).toBe(incoming.expectedBundleSha256);
    expect(Object.isFrozen(loaded.financialProvenance)).toBe(true);
    expect(
      Object.isFrozen(
        (loaded.bundle as OfficialOpeningPublicationSourceBundleV2).financial
          .documents,
      ),
    ).toBe(true);
    expect(publisherDigest).toBe(officialOpeningPublicationSourceSha256);
    const v1 = {
      ...base.inputs,
      decisionBytes: 'null',
      assemblyBytes: 'null',
      ownerRecords: [],
    };
    expect(publisherDigest(v1)).toBe(
      financialInputSha256(canonicalSerialize(v1)),
    );
    expect(base).not.toHaveProperty('financialProvenance');
  });
  it('publication digest binds every supplemental/parent/adoption byte and retained reference', () => {
    const bundle = loaded.bundle as OfficialOpeningPublicationSourceBundleV2;
    for (const field of [
      'inputBytes',
      'adoptionReceiptBytes',
      'ownerInstructionBytes',
      'parentOwnerReceiptBytes',
      'parentOwnerInstructionBytes',
      'registeredReference',
    ] as const)
      expect(
        officialOpeningPublicationSourceSha256({
          ...bundle,
          financial: {
            ...bundle.financial,
            [field]: (bundle.financial[field] ?? '') + 'CHANGED',
          },
        }),
      ).not.toBe(loaded.sourceBundleSha256);
    expect(
      officialOpeningPublicationSourceSha256({
        ...bundle,
        financial: {
          ...bundle.financial,
          documents: bundle.financial.documents.map((d) => ({
            ...d,
            bytes: d.bytes + 'CHANGED',
          })),
        },
      }),
    ).not.toBe(loaded.sourceBundleSha256);
  });
  it('actually calls the original producer and preserves all raw BLOCKED labels and obligations', () => {
    const composed = prepareOfficialOpeningBundleCandidate(loaded);
    const original = produceFormalFinancialOpening({
      adoption: parent,
      contract: parseFormalFinancialOpeningContract(vector, parent),
    });
    expect(composed.rawFinancialResult).toEqual(original);
    expect(composed.rawFinancialResult).toMatchObject({
      status: 'BLOCKED',
      seed: null,
      admissionAllowed: false,
      activationAllowed: false,
    });
    expect(composed.rawFinancialResult?.candidate).not.toBeNull();
    expect(composed.blockers.map((b) => b.code)).toEqual(
      expect.arrayContaining([
        'MECHANISM_VECTOR_NOT_FORMAL_SOURCE',
        'SUPPLEMENTAL_FINANCIAL_SOURCE_ADOPTION_UNRESOLVED',
        'FORMAL_WORLD_BINDING_UNRESOLVED',
      ]),
    );
    expect(composed).toMatchObject({
      status: 'PREFLIGHT_BLOCKED',
      seed: null,
      resolvedObligations: [],
      admissionAllowed: false,
      activationAllowed: false,
    });
    expect(composed.gapOverlay.length).toBeGreaterThan(400);
    expect(composed.gapOverlay.every((g) => g.resolvedBy === null)).toBe(true);
  });
  it('preflight shares the assembler and reports actual wiring, while keeping every deferred/nonfinancial gap', () => {
    const composed = prepareOfficialOpeningBundleCandidate(loaded),
      report = preflightOfficialOpeningBundle(loaded);
    expect(report.financialComposition).toEqual(composed);
    expect(report.blockers).toEqual(composed.blockers);
    expect(report).toMatchObject({
      realFinancialProducer: 'CALLED_ORIGINAL_PRODUCER',
      producerGap: null,
      implementationGaps: [],
      activationAllowed: false,
      admissionEvaluated: false,
    });
    const originalGaps = JSON.parse(base.inputs.gapsBytes) as {
      globalGaps: { code: string }[];
      countries: { gaps: { code: string }[] }[];
    };
    for (const gap of [
      ...originalGaps.globalGaps,
      ...originalGaps.countries.flatMap((c) => c.gaps),
    ])
      expect(report.blockers.some((b) => b.code === gap.code)).toBe(true);
  });
  it('rejects structural JSON clone and spread of loader snapshots; proof DTO cannot enter bridge', () => {
    for (const fake of [JSON.parse(JSON.stringify(loaded)), { ...loaded }]) {
      expect(() => prepareOfficialOpeningBundleCandidate(fake)).toThrow(
        'OPENING_BUNDLE_LOADER_SNAPSHOT_REQUIRED',
      );
      expect(() => preflightOfficialOpeningBundle(fake)).toThrow(
        'OPENING_BUNDLE_LOADER_SNAPSHOT_REQUIRED',
      );
    }
    const candidate = produceFormalFinancialOpening({
      adoption: parent,
      contract: parseFormalFinancialOpeningContract(vector, parent),
    }).candidate!;
    expect(() =>
      prepareFinancialSupplementOpeningSeed({
        assembly: hashOnlyAssembly(),
        proof: {} as FinancialSupplementAdoption,
        candidate,
      }),
    ).toThrow('GENUINE_FINANCIAL_ADOPTION_REQUIRED');
  });
  it('retagging a mechanism vector without independently registered adoption still fails closed', async () => {
    const retag = { ...vector, evidenceKind: 'SOURCE_CANDIDATE' as const };
    const target = await new OfficialOpeningBundleLoader({
      repositoryRoot: testRoot,
      incoming: await carrier(retag),
    }).load();
    const report = prepareOfficialOpeningBundleCandidate(target);
    expect(report.rawFinancialResult?.candidate).not.toBeNull();
    expect(report).toMatchObject({
      sourceAdoptionStatus: 'FINANCIAL_ADOPTION_REGISTRATION_NOT_PROVISIONED',
      seed: null,
      resolvedObligations: [],
    });
    expect(report.blockers.map((b) => b.code)).toContain(
      'FINANCIAL_ADOPTION_REGISTRATION_NOT_PROVISIONED',
    );
  });
  it('contract embedded document cannot differ from independently bounded loader bytes', async () => {
    const doc = vector.documents[0]!,
      bytes = canonicalSerialize([
        ...(JSON.parse(doc.bytes) as unknown[]),
        { extra: 'MECHANISM_ONLY_NOT_ADOPTED' },
      ]);
    const contract = {
      ...vector,
      documents: [{ ...doc, bytes, sha256: financialInputSha256(bytes) }],
    };
    const target = await new OfficialOpeningBundleLoader({
      repositoryRoot: testRoot,
      incoming: await carrier(contract),
    }).load();
    const result = prepareOfficialOpeningBundleCandidate(target);
    expect(result.rawFinancialResult).toBeNull();
    expect(
      result.blockers
        .filter((b) => b.stage === 'financial')
        .map((b) => b.field),
    ).toContain('FINANCIAL_DOCUMENT_SET_DIFFERS_FROM_LOADER_BYTES');
  });
  it('registered identity is independent, immutable, strict, and cannot authorize old receipt as new scoped adoption', () => {
    const snapshot = snapshotFinancialSupplementRegistration(registration);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(() =>
      snapshotFinancialSupplementRegistration({
        ...registration,
        approved: true,
      } as FinancialSupplementRegistration),
    ).toThrow('FINANCIAL_REGISTRATION_INVALID');
    const contract = parseFormalFinancialOpeningContract(vector, parent),
      candidate = produceFormalFinancialOpening({
        adoption: parent,
        contract,
      }).candidate!;
    const args = {
      registration,
      parent,
      contract,
      candidate,
      assemblyIntentFingerprint: 'sha256:' + '4'.repeat(64),
      seedId: 'TEST_ONLY',
      orchestratorVersion: 'TEST_ONLY',
    };
    expect(() =>
      loadFinancialSupplementAdoption({
        ...args,
        receiptBytes: '{}',
        instructionBytes: 'CHANGED',
      }),
    ).toThrow('REGISTERED_FINANCIAL_ADOPTION_IDENTITY_MISMATCH');
    expect(() =>
      loadFinancialSupplementAdoption({
        ...args,
        receiptBytes: '{}',
        instructionBytes: 'NOT_ADOPTED',
      }),
    ).toThrow('FINANCIAL_ADOPTION_EXACT_KEYS_REQUIRED');
    const financial = (
      loaded.bundle as OfficialOpeningPublicationSourceBundleV2
    ).financial;
    expect(() =>
      loadFinancialSupplementAdoption({
        ...args,
        registration: {
          ...registration,
          expectedReceiptSha256: identity(financial.parentOwnerReceiptBytes)
            .sha256,
          expectedInstructionSha256: identity(
            financial.parentOwnerInstructionBytes,
          ).sha256,
        },
        receiptBytes: financial.parentOwnerReceiptBytes,
        instructionBytes: financial.parentOwnerInstructionBytes,
      }),
    ).toThrow('FINANCIAL_ADOPTION_EXACT_KEYS_REQUIRED');
  });
  it.each([
    'document-id',
    'single-document',
    'total-documents',
    'document-count',
    'record-count',
    'schema-version',
  ] as const)('enforces V2 manifest limit/identity: %s', (mode) => {
    const bad = JSON.parse(
      JSON.stringify(incoming),
    ) as ServerOpeningIncomingManifestV2;
    const one = bad.financial.documents[0]!;
    if (mode === 'document-id')
      (bad.financial.documents as unknown[]).push(one);
    if (mode === 'single-document')
      (one.identity as { bytes: number }).bytes = 4 * 1024 * 1024 + 1;
    if (mode === 'total-documents' || mode === 'document-count')
      (bad.financial as unknown as { documents: unknown[] }).documents =
        Array.from(
          { length: mode === 'total-documents' ? 5 : 257 },
          (_, i) => ({
            documentId: 'DOC_' + i,
            identity: {
              ...one.identity,
              bytes: mode === 'total-documents' ? 4 * 1024 * 1024 : 1,
            },
          }),
        );
    if (mode === 'record-count')
      (bad as unknown as { ownerRecords: unknown[] }).ownerRecords = Array.from(
        { length: 63 },
        (_, i) => ({
          recordId: 'RECORD_' + i,
          reference: 'ref_' + i,
          identity: identity('{}'),
        }),
      );
    if (mode === 'schema-version')
      (bad as { schemaVersion: string }).schemaVersion =
        'server-opening-incoming-v999';
    expect(
      () =>
        new OfficialOpeningBundleLoader({
          repositoryRoot: testRoot,
          incoming: bad,
        }),
    ).toThrow();
  });
  it('rejects adoption config on a V1 loader instead of silently changing V1 semantics', () => {
    expect(
      () =>
        new OfficialOpeningBundleLoader({
          repositoryRoot,
          financialAdoptionRegistration: registration,
        }),
    ).toThrow('OPENING_FILE_MANIFEST_INVALID');
  });
  it('publication calls the shared genuine V2 path and denies structural V2 before any SQL', async () => {
    const freshIncoming = await carrier(vector);
    const loader = new OfficialOpeningBundleLoader({
      repositoryRoot: testRoot,
      incoming: freshIncoming,
    });
    const keys = generateKeyPairSync('ed25519'); // Ephemeral negative-test signature, NOT adoption.
    const claims: OpeningPublicationAuthorization = {
      schemaVersion: 'opening-publication-authorization-v1',
      purpose: 'AUTHORIZE_OFFICIAL_OPENING_ADMISSION_PUBLICATION',
      authorizationId: 'AUTHORIZATION_TEST_ONLY',
      keyId: 'TEST_KEY',
      ownerIdentity: 'NOT_OWNER',
      issuedAtReal: '2026-10-08T05:00:00.000Z',
      expiresAtReal: '2026-10-08T07:00:00.000Z',
      worldId: vector.worldId,
      seedId: 'SEED_NOT_EXISTENT_TEST_BOUND',
      seedFingerprint: 'sha256:' + '1'.repeat(64),
      modelVersion: CURRENT_REPLAY_BINDING.modelVersion,
      replayBinding: canonicalSerialize(CURRENT_REPLAY_BINDING),
      sourceBundleSha256: loaded.sourceBundleSha256!,
    };
    const canonicalAuthorization = canonicalSerialize(claims),
      signatureBase64Url = sign(
        null,
        Buffer.from(
          OPENING_PUBLICATION_SIGNATURE_DOMAIN + canonicalAuthorization,
        ),
        keys.privateKey,
      ).toString('base64url');
    let databaseCalls = 0,
      reads = 0;
    for (const source of [loader, loaded.bundle!]) {
      const authority = new PrivateOpeningAdmissionAuthority({
        trustedKeys: new Map([
          [
            'TEST_KEY',
            { publicKey: keys.publicKey, ownerIdentity: 'NOT_OWNER' },
          ],
        ]),
        registry: {
          load: async () => ({ canonicalAuthorization, signatureBase64Url }),
        },
      });
      const publisher = new OfficialOpeningAdmissionPublicationService({
        authority,
        database: {
          async query() {
            databaseCalls++;
            throw Error('SQL_FORBIDDEN');
          },
          async transaction() {
            databaseCalls++;
            throw Error('SQL_FORBIDDEN');
          },
        },
        sources: {
          load: async () => {
            reads++;
            return source;
          },
        },
        publisherRole: 'world_v2_opening_admission_publisher',
        nowReal: () => '2026-10-08T06:00:00.000Z',
      });
      const rejection = publisher.publish({
        worldId: vector.worldId,
        authorizationReference: 'AUTHORIZATION_TEST_ONLY',
      });
      await expect(rejection).rejects.toMatchObject(
        source === loader
          ? {
              code: 'OPENING_SOURCE_BLOCKED',
              blockerCodes: [
                ...new Set(
                  prepareOfficialOpeningBundleCandidate(loaded).blockers.map(
                    (b) => b.code,
                  ),
                ),
              ].sort(),
            }
          : { code: 'OPENING_SOURCE_INVALID' },
      );
      if (source === loader) {
        // Reload, rather than reusing a previously loaded immutable snapshot.
        await writeFile(
          path.join(testRoot, 'incoming/financial/input.json'),
          'CHANGED_NOT_INPUT',
        );
        await expect(
          publisher.publish({
            worldId: vector.worldId,
            authorizationReference: 'AUTHORIZATION_TEST_ONLY',
          }),
        ).rejects.toMatchObject({ code: 'OPENING_SOURCE_UNAVAILABLE' });
      }
    }
    expect(databaseCalls).toBe(0);
    expect(reads).toBe(3);
  });
});

describe('acyclic deterministic V2 assembly intent, not authority', () => {
  it('excludes only own adoptionRef; country order is canonical; every other adopted field changes intent', () => {
    const a = hashOnlyAssembly(),
      fingerprint = openingV2AssemblyIntentFingerprint(a);
    expect(
      openingV2AssemblyIntentFingerprint({
        ...a,
        countries: [...a.countries]
          .reverse()
          .map((c) => ({ ...c, adoptionRef: 'OWN_REFERENCE_NOT_HASHED' })),
      }),
    ).toBe(fingerprint);
    for (const key of [
      'worldId',
      'seedId',
      'sourceId',
      'adoptionRecordId',
      'parentReceiptSha256',
      'adoptionManifestFingerprint',
      'contractFingerprint',
      'candidateFingerprint',
      'orchestratorVersion',
    ] as const)
      expect(
        openingV2AssemblyIntentFingerprint({
          ...a,
          [key]: a[key] + '_CHANGED',
        }),
      ).not.toBe(fingerprint);
    expect(() =>
      openingV2AssemblyIntentFingerprint({ ...a, bundleSha256: 'SELF_HASH' }),
    ).toThrow('UNSUPPORTED_ASSEMBLY_FIELDS');
  });
  it('property: changing adopted country intent changes fingerprint; changing own reference does not', () => {
    const a = hashOnlyAssembly(),
      fingerprint = openingV2AssemblyIntentFingerprint(a);
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 69 }),
        fc.string({ minLength: 1, maxLength: 30 }),
        (index, suffix) => {
          const changed = copy(a),
            country = changed.countries[index]!;
          expect(
            openingV2AssemblyIntentFingerprint({
              ...changed,
              countries: changed.countries.map((c, i) =>
                i === index
                  ? {
                      ...country,
                      roster: {
                        ...country.roster,
                        operator: country.roster.operator + suffix,
                      },
                    }
                  : c,
              ),
            }),
          ).not.toBe(fingerprint);
          expect(
            openingV2AssemblyIntentFingerprint({
              ...changed,
              countries: changed.countries.map((c, i) =>
                i === index ? { ...country, adoptionRef: suffix } : c,
              ),
            }),
          ).toBe(fingerprint);
        },
      ),
      { numRuns: 30 },
    );
  });
  it('fresh processes reload identical bytes and reproduce intent/output/blockers in either import order', async () => {
    const a = hashOnlyAssembly();
    const manifest = await carrier(vector);
    const result = prepareOfficialOpeningBundleCandidate(loaded);
    const expected = {
      intent: openingV2AssemblyIntentFingerprint(a),
      digest: loaded.sourceBundleSha256,
      candidate: result.rawFinancialResult?.candidate?.fingerprint,
      status: result.rawFinancialResult?.status,
      blockers: result.blockers.map((b) => b.code),
    };
    for (const order of [true, false]) {
      const code = `const root=${JSON.stringify(repositoryRoot)};const p=root+'/apps/world-worker/dist/';
        for(const f of ${JSON.stringify(order ? ['admission/official-opening-admission-publication.js', 'preparation/official-opening-bundle-preflight.js'] : ['preparation/official-opening-bundle-preflight.js', 'admission/official-opening-admission-publication.js'])}) await import(p+f);
        const {openingV2AssemblyIntentFingerprint:hash}=await import(p+'preparation/opening-canonical-seed-bridge.js');
        const {OfficialOpeningBundleLoader}=await import(p+'preparation/official-opening-bundle-loader.js');
        const {prepareOfficialOpeningBundleCandidate:compose}=await import(p+'preparation/official-opening-candidate-composition.js');
        const loaded=await new OfficialOpeningBundleLoader({repositoryRoot:${JSON.stringify(testRoot)},incoming:${JSON.stringify(manifest)}}).load();
        const result=compose(loaded);process.stdout.write(JSON.stringify({intent:hash(${canonicalSerialize(a)}),digest:loaded.sourceBundleSha256,
          candidate:result.rawFinancialResult?.candidate?.fingerprint,status:result.rawFinancialResult?.status,blockers:result.blockers.map(b=>b.code)}));`;
      const child = spawnSync(
        process.execPath,
        ['--input-type=module', '-e', code],
        {
          env: { PATH: path.dirname(process.execPath) },
          encoding: 'utf8',
          timeout: 10_000,
        },
      );
      expect(child.status, child.stderr).toBe(0);
      expect(JSON.parse(child.stdout)).toEqual(expected);
    }
  });
});
