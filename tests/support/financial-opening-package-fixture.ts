/** Exact-byte test provisioning only; never an economic source/approval issuer. */
import { createHash, randomBytes } from 'node:crypto';
import { constants } from 'node:fs';
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readdir,
  realpath,
  rm,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const MANIFEST_SHA256 =
  'a3306cc89cd8a9150c6bd4fb6820eeaa879f8a41e02f858514fee60344fa63cc';
const MANIFEST_BYTES = 18935;
const FILE_LIMIT = 33554432;
const OPERATION_LIMIT = 100663296;
const FILES_LIMIT = 64;
const fixtureKit = path.resolve(
  import.meta.dirname,
  '../fixtures/financial-opening-package-v1',
);
interface Pin {
  bytes: number;
  sha256: string;
}
interface Manifest {
  roots: { rootId: string; physicalRelativePath: string }[];
  packageMembers: ({ path: string; blob: string } & Pin)[];
  sources: ({
    retainedRootId: string;
    relativeLocator: string;
    proposedBlobPath: string | null;
  } & Pin)[];
}
export interface FinancialOpeningFixtureIo {
  readonly inputFiles: number;
  readonly outputFiles: number;
  readonly sourceReadBytes: number;
  readonly destinationVerificationReadBytes: number;
  readonly writtenBytes: number;
  readonly cleanupReadBytesReserved: 64;
  readonly lifecyclePreparationReadBytesUpperBound: number;
}
export interface OwnedFinancialOpeningPackageFixture {
  readonly fixtureRoot: string;
  readonly packageRoot: string;
  readonly io: FinancialOpeningFixtureIo;
}
const owned = new WeakMap<
  OwnedFinancialOpeningPackageFixture,
  {
    root: string;
    parent: string;
    uid: number;
    dev: number;
    ino: number;
    marker: string;
  }
>();
function demand(v: unknown, code: string): asserts v {
  if (!v) throw new Error(code);
}
function relative(p: string): void {
  demand(
    typeof p === 'string' &&
      p.length > 0 &&
      p.length <= 512 &&
      !p.includes('\\') &&
      !path.isAbsolute(p) &&
      path.posix.normalize(p) === p &&
      p.split('/').every((x) => x !== '' && x !== '.' && x !== '..'),
    'FIXTURE_PATH_DENIED',
  );
}
const digest = (bytes: Uint8Array) =>
  createHash('sha256').update(bytes).digest('hex');
async function guardedRead(
  filename: string,
  pin: Pin,
): Promise<{ bytes: Buffer; dev: number; ino: number }> {
  demand(
    constants.O_NOFOLLOW > 0 &&
      constants.O_NONBLOCK > 0 &&
      process.platform !== 'win32',
    'SAFE_FILE_OPEN_UNSUPPORTED',
  );
  demand(
    Number.isSafeInteger(pin.bytes) && pin.bytes > 0 && pin.bytes <= FILE_LIMIT,
    'FIXTURE_FILE_BUDGET_EXCEEDED',
  );
  const absolute = path.resolve(filename);
  let p = path.parse(absolute).root;
  const parts = absolute.slice(p.length).split('/');
  for (const [i, part] of parts.entries()) {
    p = path.join(p, part);
    const stat = await lstat(p);
    demand(!stat.isSymbolicLink(), 'FIXTURE_SYMLINK_DENIED');
    demand(
      i === parts.length - 1 ? stat.isFile() : stat.isDirectory(),
      'FIXTURE_REGULAR_COMPONENT_REQUIRED',
    );
  }
  const file = await open(
    absolute,
    constants.O_RDONLY | constants.O_NONBLOCK | constants.O_NOFOLLOW,
  );
  try {
    const stat = await file.stat();
    demand(
      stat.isFile() && stat.size === pin.bytes,
      'FIXTURE_FILE_SIZE_MISMATCH',
    );
    const buffer = Buffer.alloc(pin.bytes + 1);
    let n = 0;
    while (n < buffer.length) {
      const r = await file.read(buffer, n, buffer.length - n, n);
      if (!r.bytesRead) break;
      n += r.bytesRead;
    }
    const bytes = buffer.subarray(0, n);
    demand(
      n === pin.bytes && digest(bytes) === pin.sha256,
      'FIXTURE_FILE_HASH_MISMATCH',
    );
    new TextDecoder('utf8', { fatal: true, ignoreBOM: true }).decode(bytes);
    return { bytes, dev: stat.dev, ino: stat.ino };
  } finally {
    await file.close();
  }
}

/** Physical kit path exists only for finite bad-byte tests, never caller pins,
 * source maps or policy. Manifest and every blob are still compiled-pin bound. */
export async function materializeFinancialOpeningPackageFixture(
  input: Readonly<{ fixtureKitRoot?: string }> = {},
): Promise<OwnedFinancialOpeningPackageFixture> {
  demand(
    Object.keys(input).every((k) => k === 'fixtureKitRoot'),
    'FIXTURE_EXACT_KEYS_REQUIRED',
  );
  const kit = path.resolve(input.fixtureKitRoot ?? fixtureKit);
  demand((await realpath(kit)) === kit, 'FIXTURE_PATH_DENIED');
  const manifestInput = await guardedRead(
    path.join(kit, 'fixture-manifest.json'),
    { bytes: MANIFEST_BYTES, sha256: MANIFEST_SHA256 },
  );
  const manifest = JSON.parse(manifestInput.bytes.toString('utf8')) as Manifest;
  const pins = new Map<string, Pin>();
  const destinations = new Map<string, string>();
  for (const m of manifest.packageMembers) {
    relative(m.path);
    destinations.set('package/' + m.path, m.blob);
    pins.set(m.blob, m);
  }
  for (const s of manifest.sources) {
    if (s.proposedBlobPath === null) continue;
    const root = manifest.roots.find((r) => r.rootId === s.retainedRootId);
    demand(root, 'FIXTURE_FIXED_ROOT_REQUIRED');
    relative(root.physicalRelativePath);
    relative(s.relativeLocator);
    destinations.set(
      root.physicalRelativePath + '/' + s.relativeLocator,
      s.proposedBlobPath,
    );
    pins.set(s.proposedBlobPath, s);
  }
  demand(
    pins.size === 40 &&
      destinations.size === 40 &&
      pins.size + 1 <= FILES_LIMIT,
    'FIXTURE_CLOSED_FILE_SET_REQUIRED',
  );
  demand(
    JSON.stringify((await readdir(kit)).sort()) ===
      JSON.stringify(['blobs', 'fixture-manifest.json']),
    'FIXTURE_CLOSED_FILE_SET_REQUIRED',
  );
  demand(
    JSON.stringify((await readdir(path.join(kit, 'blobs'))).sort()) ===
      JSON.stringify([...pins.keys()].map((p) => p.slice(6)).sort()),
    'FIXTURE_CLOSED_FILE_SET_REQUIRED',
  );
  const parent = await realpath(tmpdir());
  const root = await mkdtemp(path.join(parent, 'financial-opening-fixture-'));
  await chmod(root, 0o700);
  const uid = process.getuid?.();
  demand(uid !== undefined, 'OWNED_FIXTURE_UID_REQUIRED');
  let sourceReadBytes = manifestInput.bytes.length;
  let destinationVerificationReadBytes = 0;
  let writtenBytes = 0;
  const directories = new Set<string>([root]);
  const write = async (
    relativeName: string,
    bytes: Buffer,
    original?: { dev: number; ino: number },
  ): Promise<void> => {
    relative(relativeName);
    const filename = path.join(root, relativeName);
    const directory = path.dirname(filename);
    if (!directories.has(directory)) {
      await mkdir(directory, { recursive: true, mode: 0o700 });
      directories.add(directory);
    }
    const file = await open(
      filename,
      constants.O_WRONLY |
        constants.O_CREAT |
        constants.O_EXCL |
        constants.O_NOFOLLOW |
        constants.O_NONBLOCK,
      0o600,
    );
    try {
      await file.writeFile(bytes);
      const stat = await file.stat();
      demand(
        stat.isFile() &&
          stat.uid === uid &&
          stat.nlink === 1 &&
          stat.size === bytes.length &&
          (!original || stat.dev !== original.dev || stat.ino !== original.ino),
        'FIXTURE_DISTINCT_OWNED_INODE_REQUIRED',
      );
      await file.chmod(0o444);
      writtenBytes += bytes.length;
    } finally {
      await file.close();
    }
  };
  try {
    const buffers = new Map<string, Awaited<ReturnType<typeof guardedRead>>>();
    for (const [blob, pin] of pins) {
      relative(blob);
      demand(blob === 'blobs/' + pin.sha256, 'FIXTURE_HASH_NAME_REQUIRED');
      demand(
        sourceReadBytes + pin.bytes + destinationVerificationReadBytes + 64 <=
          OPERATION_LIMIT,
        'FIXTURE_OPERATION_BUDGET_EXCEEDED',
      );
      const data = await guardedRead(path.join(kit, blob), pin);
      sourceReadBytes += data.bytes.length;
      buffers.set(blob, data);
    }
    for (const [destination, blob] of destinations) {
      const data = buffers.get(blob),
        pin = pins.get(blob);
      demand(data && pin, 'FIXTURE_PIN_REQUIRED');
      await write(destination, data.bytes, data);
      demand(
        sourceReadBytes + destinationVerificationReadBytes + pin.bytes + 64 <=
          OPERATION_LIMIT,
        'FIXTURE_OPERATION_BUDGET_EXCEEDED',
      );
      await guardedRead(path.join(root, destination), pin);
      destinationVerificationReadBytes += pin.bytes;
    }
    await write('fixture-manifest.json', manifestInput.bytes, manifestInput);
    const marker = randomBytes(32).toString('hex');
    await write('.fixture-owner', Buffer.from(marker));
    const stat = await lstat(root);
    const result: OwnedFinancialOpeningPackageFixture = Object.freeze({
      fixtureRoot: root,
      packageRoot: path.join(root, 'package'),
      io: Object.freeze({
        inputFiles: pins.size + 1,
        outputFiles: destinations.size + 2,
        sourceReadBytes,
        destinationVerificationReadBytes,
        writtenBytes,
        cleanupReadBytesReserved: 64 as const,
        lifecyclePreparationReadBytesUpperBound:
          sourceReadBytes + destinationVerificationReadBytes + 64,
      }),
    });
    demand(
      result.io.lifecyclePreparationReadBytesUpperBound === 12870787,
      'FIXTURE_IO_RECEIPT_MISMATCH',
    );
    owned.set(result, {
      root,
      parent,
      uid,
      dev: stat.dev,
      ino: stat.ino,
      marker,
    });
    return result;
  } catch (error) {
    // No unsafe cleanup of a partially provisioned root. Keep evidence of the
    // classified failure; path is owned and bounded, not an original source.
    throw new Error('FIXTURE_PROVISION_FAILED:' + root, { cause: error });
  }
}

export async function disposeFinancialOpeningPackageFixture(
  fixture: OwnedFinancialOpeningPackageFixture,
): Promise<void> {
  const proof = owned.get(fixture);
  demand(proof, 'GENUINE_OWNED_FIXTURE_REQUIRED');
  const stat = await lstat(proof.root);
  demand(
    fixture.fixtureRoot === proof.root &&
      path.dirname(proof.root) === proof.parent &&
      (await realpath(proof.root)) === proof.root &&
      stat.isDirectory() &&
      !stat.isSymbolicLink() &&
      stat.uid === proof.uid &&
      stat.dev === proof.dev &&
      stat.ino === proof.ino &&
      (stat.mode & 0o777) === 0o700,
    'OWNED_CLEANUP_PROVENANCE_REQUIRED',
  );
  const marker = await guardedRead(path.join(proof.root, '.fixture-owner'), {
    bytes: 64,
    sha256: digest(Buffer.from(proof.marker)),
  });
  demand(
    marker.bytes.toString('utf8') === proof.marker,
    'OWNED_CLEANUP_MARKER_MISMATCH',
  );
  // Recursive removal unlinks children; never follows symlink targets. Only the
  // exact mkdtemp root held by this invocation's opaque proof is disposable.
  await rm(proof.root, { recursive: true });
  owned.delete(fixture);
}
