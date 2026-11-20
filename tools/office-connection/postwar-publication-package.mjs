/** Offline fixed-file packaging. No signing, admission, DB connection or push. */
import path from 'node:path';
import { mkdir, copyFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export async function writePostwarPublicationPackage({
  prepared,
  finalSeed,
  directory,
}) {
  const root = prepared.input.repositoryRoot;
  const load = (name) =>
    import(
      pathToFileURL(
        path.join(root, 'apps/world-worker/dist/preparation', name + '.js'),
      ).href
    );
  const {
    OfficialOpeningBundleLoader,
    officialOpeningPublicationSourceSha256,
  } = await load('official-opening-bundle-loader');
  const { validatePostwarOpeningPublicationSeed } = await load(
    'postwar-publication-seed',
  );
  const { prepareOfficialOpeningBundleCandidate } = await load(
    'official-opening-candidate-composition',
  );
  const identity = (bytes) => ({
    sha256: createHash('sha256').update(bytes).digest('hex'),
    bytes: Buffer.byteLength(bytes),
  });
  const financial = prepared.financial;
  const decisionBytes = 'null';
  const assemblyBytes = JSON.stringify(financial.assembly);
  const { encodePostwarSeedDocument } = await load('postwar-seed-document');
  const finalSeedBytes = encodePostwarSeedDocument(finalSeed);
  const financialInput = {
    inputBytes: JSON.stringify(financial.contract),
    adoptionReceiptBytes: financial.receiptBytes,
    ownerInstructionBytes: financial.instructionBytes,
    parentOwnerInstructionBytes: prepared.context.ownerOriginalBytes,
    parentOwnerReceiptBytes: prepared.context.ownerReceiptBytes,
    registeredReference: financial.registration.retainedReference,
    documents: financial.contract.documents.map((document) => ({
      documentId: document.documentId,
      sourcePath: document.sourcePath,
      bytes: document.bytes,
    })),
  };
  const bundle = {
    ...prepared.context.loaded.inputs,
    schemaVersion: 'official-opening-publication-source-v3',
    decisionBytes,
    assemblyBytes,
    ownerRecords: [],
    financial: financialInput,
    operating: { finalSeedBytes },
  };
  const incoming = {
    schemaVersion: 'server-opening-incoming-v3',
    decision: identity(decisionBytes),
    assembly: identity(assemblyBytes),
    ownerRecords: [],
    expectedBundleSha256: officialOpeningPublicationSourceSha256(bundle),
    financial: {
      input: identity(financialInput.inputBytes),
      adoptionReceipt: identity(financial.receiptBytes),
      ownerInstruction: identity(financial.instructionBytes),
      documents: financialInput.documents.map((document) => ({
        documentId: document.documentId,
        identity: identity(document.bytes),
      })),
    },
    operating: { finalSeed: identity(finalSeedBytes) },
  };
  await mkdir(directory, { recursive: false, mode: 0o700 });
  const parentRoot = 'docs/governance/owner-inputs/2026-10-07/';
  const fixed = [
    ...prepared.context.loaded.validatedFiles.map((file) => file.locator),
    parentRoot + 'OWNER_NON_HOST_DECISIONS.original.md',
    parentRoot + 'OWNER_NON_HOST_DECISION_RECEIPT.json',
  ];
  for (const locator of new Set(fixed)) {
    const target = path.join(directory, locator);
    await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    await copyFile(path.join(root, locator), target);
  }
  const files = {
    'incoming/decision.json': decisionBytes,
    'incoming/assembly.json': assemblyBytes,
    'incoming/financial/input.json': financialInput.inputBytes,
    'incoming/financial/adoption.json': financial.receiptBytes,
    'incoming/financial/owner-instruction.md': financial.instructionBytes,
    'incoming/operating/final-seed.json': finalSeedBytes,
    ...Object.fromEntries(
      financialInput.documents.map((document) => [
        document.sourcePath,
        document.bytes,
      ]),
    ),
  };
  for (const [locator, bytes] of Object.entries(files)) {
    const target = path.join(directory, locator);
    await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    await writeFile(target, bytes, { flag: 'wx', mode: 0o600 });
  }
  const loaded = await new OfficialOpeningBundleLoader({
    repositoryRoot: directory,
    incoming,
    financialAdoptionRegistration: financial.registration,
  }).load();
  const checked = validatePostwarOpeningPublicationSeed({
    loaded,
    bundle: loaded.bundle,
    financialSeed: financial.baselineSeed,
  });
  if (checked.fingerprint !== finalSeed.fingerprint)
    throw Error('POSTWAR_PACKAGE_READBACK_FINGERPRINT_MISMATCH');
  const candidate = prepareOfficialOpeningBundleCandidate(loaded);
  const report = {
    schemaVersion: 'postwar-publication-package-v1',
    sourceBundleSha256: incoming.expectedBundleSha256,
    seedFingerprint: checked.fingerprint,
    fixedFileReadback: 'PASS',
    completeSeedReinspection: 'PASS',
    publicationPreflight: candidate.status,
    remainingBlockers: candidate.blockers,
    admissionAllowed: false,
    worldStarted: false,
    clockStarted: false,
  };
  await writeFile(
    path.join(directory, 'incoming-manifest.json'),
    JSON.stringify(incoming, null, 2) + '\n',
    { flag: 'wx', mode: 0o600 },
  );
  await writeFile(
    path.join(directory, 'financial-registration.json'),
    JSON.stringify(financial.registration, null, 2) + '\n',
    { flag: 'wx', mode: 0o600 },
  );
  await writeFile(
    path.join(directory, 'package-receipt.json'),
    JSON.stringify(report, null, 2) + '\n',
    { flag: 'wx', mode: 0o600 },
  );
  return report;
}
