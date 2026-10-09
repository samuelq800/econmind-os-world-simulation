/** Actual frozen-source ingest and ordinary integrity failures only.
 * No synthetic approved seed, DB, host, network or production permission. */
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  OfficialOpeningBundleLoader,
  OFFICIAL_OPENING_BUNDLE_LIMITS,
  type LoadedOfficialOpeningBundle,
  type OpeningBundleFileIdentity,
  type ServerOpeningIncomingManifest,
} from '../../apps/world-worker/src/preparation/official-opening-bundle-loader.js';
import { preflightOfficialOpeningBundle } from '../../apps/world-worker/src/preparation/official-opening-bundle-preflight.js';
import {
  OfficialOpeningAdmissionPublicationService,
  officialOpeningPublicationSourceSha256,
} from '../../apps/world-worker/src/admission/official-opening-admission-publication.js';
import { OfficialWorldOpeningBootstrapper } from '../../apps/world-worker/src/preparation/official-world-opening-admission.js';
import { WorldOpeningSeedStore } from '../../apps/world-worker/src/persistence/opening-seed-store.js';
import { WorldOpeningBootstrapReadback } from '../../apps/world-worker/src/persistence/world-opening-bootstrap-readback.js';

const repositoryRoot = path.resolve(import.meta.dirname, '../..');
const ownedTemps: string[] = [];
let loaded: LoadedOfficialOpeningBundle;
const hashIdentity = (bytes: Uint8Array): OpeningBundleFileIdentity => ({
  sha256: createHash('sha256').update(bytes).digest('hex'),
  bytes: bytes.length,
});
async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(
    path.join(await realpath(tmpdir()), 'opening-bundle-read-test-'),
  );
  ownedTemps.push(root);
  return root;
}
async function copiedSource(): Promise<string> {
  const root = await temporaryRoot();
  // Real copies/COW copies, never hard links to source or relaxed symlink checks.
  for (const file of loaded.validatedFiles) {
    const destination = path.join(root, file.locator);
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(
      path.join(repositoryRoot, file.locator),
      destination,
      constants.COPYFILE_FICLONE,
    );
  }
  return root;
}
async function mutate(
  root: string,
  locator: string,
  transform: (bytes: Buffer) => Buffer,
) {
  const target = path.join(root, locator);
  await writeFile(target, transform(await readFile(target)));
}
async function wrongCarrier(
  root: string,
): Promise<ServerOpeningIncomingManifest> {
  // Exact existing bytes, deliberately NOT the required decision/assembly schemas.
  // This proves raw bundle identity is not adoption; it is not a positive seed.
  const owner = await readFile(
    path.join(
      repositoryRoot,
      'docs/governance/owner-inputs/2026-10-07/OWNER_NON_HOST_DECISION_RECEIPT.json',
    ),
  );
  const assembly = await readFile(
    path.join(
      repositoryRoot,
      'artifacts/world-balanced-candidate-v1/data/opening-material-reconciliation.json',
    ),
  );
  await mkdir(path.join(root, 'incoming/owner-records'), { recursive: true });
  await writeFile(path.join(root, 'incoming/decision.json'), owner);
  await writeFile(path.join(root, 'incoming/assembly.json'), assembly);
  await writeFile(
    path.join(root, 'incoming/owner-records/ACTUAL_SUBSET_RECEIPT.json'),
    owner,
  );
  const reference = 'sha256:' + hashIdentity(owner).sha256 + '#/decisions';
  const bundle = {
    ...loaded.inputs,
    decisionBytes: owner.toString('utf8'),
    assemblyBytes: assembly.toString('utf8'),
    ownerRecords: [{ reference, recordBytes: owner.toString('utf8') }],
  };
  return {
    decision: hashIdentity(owner),
    assembly: hashIdentity(assembly),
    ownerRecords: [
      {
        recordId: 'ACTUAL_SUBSET_RECEIPT',
        reference,
        identity: hashIdentity(owner),
      },
    ],
    expectedBundleSha256: officialOpeningPublicationSourceSha256(bundle),
  };
}
beforeAll(async () => {
  loaded = await new OfficialOpeningBundleLoader({ repositoryRoot }).load();
}, 30_000);
afterAll(async () => {
  // Each exact path was created by this test's own mkdtemp.
  for (const root of ownedTemps)
    await rm(root, { recursive: true, force: true });
});

describe('actual frozen opening bundle read-only ingest', () => {
  it('reads all 86 raw original files plus 7 pinned carriers, retaining exact 34 JSON sources', async () => {
    expect(loaded.validatedFiles).toHaveLength(93);
    expect(new Set(loaded.validatedFiles.map((r) => r.locator)).size).toBe(93);
    expect(Object.keys(loaded.inputs.source.datasets)).toHaveLength(34);
    for (const file of loaded.validatedFiles)
      expect(file).toMatchObject(
        hashIdentity(await readFile(path.join(repositoryRoot, file.locator))),
      );
    expect(loaded.inputs.source.datasets['data/finance.json']).toBe(
      await readFile(
        path.join(
          repositoryRoot,
          'artifacts/world-balanced-candidate-v1/data/finance.json',
        ),
        'utf8',
      ),
    );
    expect(loaded.inputs.source.datasets['data/regions.json']).toBe(
      loaded.inputs.regionsBytes,
    );
    expect(loaded.totalBytes).toBe(62374856);
    expect(loaded.bundle).toBeNull();
    expect(loaded.sourceBundleSha256).toBeNull();
    expect(Object.isFrozen(loaded.inputs.source.datasets)).toBe(true);
  });

  it('actually runs existing source/admission/decision/bridge validators and retains real blockers without any write', () => {
    const bootstrap = vi.spyOn(
      OfficialWorldOpeningBootstrapper.prototype,
      'bootstrap',
    );
    const store = vi.spyOn(WorldOpeningSeedStore.prototype, 'bootstrap');
    const readback = vi.spyOn(
      WorldOpeningBootstrapReadback.prototype,
      'bootstrapAndReadback',
    );
    const publish = vi.spyOn(
      OfficialOpeningAdmissionPublicationService.prototype,
      'publish',
    );
    try {
      const result = preflightOfficialOpeningBundle(loaded);
      expect(result).toMatchObject({
        status: 'PREFLIGHT_BLOCKED',
        sourceStatus: 'VALIDATED_SOURCE_NOT_ADOPTION',
        admissionStatus: 'BLOCKED',
        decisionStatus: 'BLOCKED',
        bridgeStatus: 'BLOCKED',
        coreValidation: 'NOT_RUN_NO_SEED',
        seedFingerprint: null,
        seedWorldId: null,
        decisionOrigin: 'EXISTING_VALIDATOR_UNRESOLVED_DIAGNOSTIC',
        realFinancialProducer: 'NOT_CONNECTED_IN_CURRENT_BASE',
        activationAllowed: false,
        admissionEvaluated: false,
      });
      expect(result.blockers.map((r) => r.code)).toEqual(
        expect.arrayContaining([
          'WORLD_ID_BINDING_REQUIRED',
          'OWNER_ADOPTION_RECORD_MISSING',
          'CANONICAL_SEED_ASSEMBLY_MISSING',
          'INCOMING_DECISION_FILE_NOT_PROVISIONED',
          'INCOMING_ASSEMBLY_FILE_NOT_PROVISIONED',
        ]),
      );
      expect(result.producerGap).toEqual({
        legacyBridge: 'ONE_GCU_BATCH_PER_COUNTRY',
        officialConsumer: 'LC_BATCH_PER_COUNTRY_OPTIONAL_ADDITIONAL_GCU',
        coreInterface: 'OpeningSeed.financialBatches: FinancialOpeningBatch[]',
        missingContract: 'FORMAL_LC_FX_AND_COMPLETE_CB_REGISTER_PRODUCER',
      });
      expect(result.implementationGaps).toEqual([
        'REAL_FINANCIAL_PRODUCER_NOT_CONNECTED',
      ]);
      for (const method of [bootstrap, store, readback, publish])
        expect(method).not.toHaveBeenCalled();
      expect(result).not.toHaveProperty('approved');
      expect(result).not.toHaveProperty('ready');
    } finally {
      vi.restoreAllMocks();
    }
  }, 30_000);

  it('can load a complete byte-bound incoming bundle but rejects actual subset receipt as a full-intent decision', async () => {
    const root = await copiedSource();
    const incoming = await wrongCarrier(root);
    const complete = await new OfficialOpeningBundleLoader({
      repositoryRoot: root,
      incoming,
    }).load();
    expect(complete.validatedFiles).toHaveLength(96);
    expect(complete.sourceBundleSha256).toBe(incoming.expectedBundleSha256);
    const result = preflightOfficialOpeningBundle(complete);
    expect(result.status).toBe('PREFLIGHT_BLOCKED');
    expect(result.decisionOrigin).toBe('INCOMING_FILE');
    expect(result.decisionStatus).toBe('BLOCKED');
    expect(result.bridgeStatus).toBe('NOT_RUN_DECISION_REJECTED');
    expect(result.seedFingerprint).toBeNull();
    expect(result.blockers.some((r) => r.stage === 'decision')).toBe(true);
  }, 30_000);

  it('does not accept caller READY/approval reports in place of genuine loaded bytes', () => {
    expect(() =>
      preflightOfficialOpeningBundle({
        ...loaded,
        approved: true,
        status: 'READY',
      } as LoadedOfficialOpeningBundle),
    ).toThrow('LOADER_SNAPSHOT_REQUIRED');
  });
});

describe('bounded ordinary file integrity rejection', () => {
  it.each([
    [
      'same-size changed dataset',
      'artifacts/world-balanced-candidate-v1/data/finance.json',
      'OPENING_FILE_HASH_MISMATCH',
      (bytes: Buffer) => {
        bytes[0] = bytes[0] === 91 ? 93 : 91;
        return bytes;
      },
    ],
    [
      'truncated dataset',
      'artifacts/world-balanced-candidate-v1/data/finance.json',
      'OPENING_FILE_SIZE_INVALID',
      (bytes: Buffer) => bytes.subarray(0, bytes.length - 1),
    ],
    [
      'invalid UTF-8',
      'status/world-data-selection.json',
      'OPENING_FILE_UTF8_INVALID',
      (bytes: Buffer) => {
        bytes[0] = 255;
        return bytes;
      },
    ],
    [
      'changed source locator/manifest',
      'docs/reports/world-connection/C_OFFICIAL_WORLD_OPENING_MAPPING.json',
      'OPENING_FILE_HASH_MISMATCH',
      (bytes: Buffer) => {
        bytes[0] = 91;
        return bytes;
      },
    ],
  ] as const)(
    'rejects %s rather than using filename or self-declared status',
    async (_name, locator, code, transform) => {
      const root = await copiedSource();
      await mutate(root, locator, transform);
      await expect(
        new OfficialOpeningBundleLoader({ repositoryRoot: root }).load(),
      ).rejects.toMatchObject({ code, locator });
    },
  );

  it('rejects an incomplete original file set, including files outside the 34 structured datasets', async () => {
    const root = await copiedSource();
    const locator = 'artifacts/world-balanced-candidate-v1/README.md';
    await rm(path.join(root, locator));
    await expect(
      new OfficialOpeningBundleLoader({ repositoryRoot: root }).load(),
    ).rejects.toMatchObject({ code: 'OPENING_FILE_UNAVAILABLE', locator });
  });
  it('rejects file and parent-directory symlinks to otherwise authentic source', async () => {
    const root = await copiedSource();
    const locator = 'artifacts/world-balanced-candidate-v1/data/finance.json';
    await rm(path.join(root, locator));
    await symlink(path.join(repositoryRoot, locator), path.join(root, locator));
    await expect(
      new OfficialOpeningBundleLoader({ repositoryRoot: root }).load(),
    ).rejects.toMatchObject({ code: 'OPENING_FILE_PATH_DENIED', locator });
    const parentRoot = await temporaryRoot();
    await mkdir(path.join(parentRoot, 'artifacts'));
    await symlink(
      path.join(repositoryRoot, 'artifacts/world-balanced-candidate-v1'),
      path.join(parentRoot, 'artifacts/world-balanced-candidate-v1'),
    );
    await expect(
      new OfficialOpeningBundleLoader({ repositoryRoot: parentRoot }).load(),
    ).rejects.toMatchObject({ code: 'OPENING_FILE_PATH_DENIED' });
  });
  it('rejects a symlinked root and a caller path in the private composition manifest', async () => {
    const parent = await temporaryRoot();
    const link = path.join(parent, 'source');
    await symlink(repositoryRoot, link);
    await expect(
      new OfficialOpeningBundleLoader({ repositoryRoot: link }).load(),
    ).rejects.toMatchObject({ code: 'OPENING_FILE_PATH_DENIED' });
    expect(
      () =>
        new OfficialOpeningBundleLoader({
          repositoryRoot,
          path: '../../outside',
          approved: true,
        } as ConstructorParameters<typeof OfficialOpeningBundleLoader>[0]),
    ).toThrow('OPENING_FILE_MANIFEST_INVALID');
  });
  it('rejects changed incoming bytes and a mismatched whole-bundle digest', async () => {
    const root = await copiedSource();
    const incoming = await wrongCarrier(root);
    await expect(
      new OfficialOpeningBundleLoader({
        repositoryRoot: root,
        incoming: { ...incoming, expectedBundleSha256: '0'.repeat(64) },
      }).load(),
    ).rejects.toMatchObject({ code: 'OPENING_BUNDLE_DIGEST_MISMATCH' });
    await mutate(root, 'incoming/decision.json', (bytes) => {
      bytes[0] = 91;
      return bytes;
    });
    await expect(
      new OfficialOpeningBundleLoader({
        repositoryRoot: root,
        incoming,
      }).load(),
    ).rejects.toMatchObject({
      code: 'OPENING_FILE_HASH_MISMATCH',
      locator: 'incoming/decision.json',
    });
  });
  it('bounds individual expected bytes and denies owner-record traversal/duplicates', async () => {
    const root = await copiedSource();
    const incoming = await wrongCarrier(root);
    expect(
      () =>
        new OfficialOpeningBundleLoader({
          repositoryRoot: root,
          incoming: {
            ...incoming,
            decision: {
              ...incoming.decision,
              bytes: OFFICIAL_OPENING_BUNDLE_LIMITS.fileBytes + 1,
            },
          },
        }),
    ).toThrow('OPENING_FILE_SIZE_INVALID');
    expect(
      () =>
        new OfficialOpeningBundleLoader({
          repositoryRoot: root,
          incoming: {
            ...incoming,
            ownerRecords: [
              { ...incoming.ownerRecords[0]!, recordId: '../OUTSIDE' },
            ],
          },
        }),
    ).toThrow('OPENING_FILE_PATH_DENIED');
    expect(
      () =>
        new OfficialOpeningBundleLoader({
          repositoryRoot: root,
          incoming: {
            ...incoming,
            ownerRecords: [
              incoming.ownerRecords[0]!,
              incoming.ownerRecords[0]!,
            ],
          },
        }),
    ).toThrow('OPENING_FILE_SET_INVALID');
  });
  it('bounds total raw bytes before opening the file that would exceed the budget', async () => {
    const root = await copiedSource();
    const mapping = await readFile(
      path.join(
        repositoryRoot,
        'docs/reports/world-connection/C_OFFICIAL_WORLD_OPENING_MAPPING.json',
      ),
    );
    await mkdir(path.join(root, 'incoming'));
    await writeFile(path.join(root, 'incoming/decision.json'), mapping);
    // No assembly file: the aggregate limit must fail BEFORE any open attempt.
    await expect(
      new OfficialOpeningBundleLoader({
        repositoryRoot: root,
        incoming: {
          decision: hashIdentity(mapping),
          assembly: hashIdentity(mapping),
          ownerRecords: [],
          expectedBundleSha256: '0'.repeat(64),
        },
      }).load(),
    ).rejects.toMatchObject({
      code: 'OPENING_FILE_SIZE_INVALID',
      locator: 'incoming/assembly.json',
    });
  });
});
