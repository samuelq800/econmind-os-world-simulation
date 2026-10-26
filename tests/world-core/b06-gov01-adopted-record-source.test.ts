// TEST_ONLY: no actual operator, World, source adoption or native protection.
import { createHash } from 'node:crypto';
import {
  chmod,
  mkdtemp,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { canonicalSerialize } from '@econmind/core';
import {
  GOV01_ORIGINAL_ID,
  createTestOnlyGov01RecordSource,
  inspectTestOnlyGov01Observation,
  isTestOnlyGov01RecordSource,
  parseGov01ReadRequest,
  parseGov01TypedRegisterBindingData,
  readGov01PinnedJsonDocument,
  type Gov01HeldReadUse,
  type Gov01RawPin,
  type Gov01ReadRequest,
  type Gov01TypedRegisterBindingData,
} from '../../apps/world-worker/src/preparation/b06-gov01-adopted-record-source.js';
import type { SqlExecutor } from '../../apps/world-worker/src/persistence/sql-database.js';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
// Exact adopted DEFINITION receipt only. Embedded bytes avoid machine-local
// evidence dependencies in CI. This does not adopt our invented fixture records.
const definitionBytes =
  'ewogICJzY2hlbWFWZXJzaW9uIjogMSwKICAicmVjb3JkSWQiOiAiT1dORVJfQjA2X0MwMV9UWVBFRF9SRUdJU1RFUl9ERUZJTklUSU9OXzIwMjYxMDIxX1YxIiwKICAiZGF0ZSI6ICIyMDI2LTEwLTIxIiwKICAidGltZXpvbmUiOiAiQXNpYS9TaGFuZ2hhaSIsCiAgImF1dGhvcml0eUtpbmQiOiAiRElSRUNUX0hVTUFOX01FU1NBR0VfSU5fUk9PVF9USFJFQUQiLAogICJyb290VGhyZWFkSWQiOiAiMDFhMDhiZjktZmUxOS03NDQwLTg4ZmEtMTU5Njc3YjYxMWJkIiwKICAidmVyYmF0aW0iOiAi5ZCM5oSP5LuF5L+u6K6iQ09VTlRSWTAx6L+Z5LqU5LiqQjA255qE57uT5p6E5o6l5Y+X5a6a5LmJ77yM5YW25LuW6Zeo5qeb5L+d5oyB5LiN5Y+Y44CC57un57ut6KGl6b2Q6LSm5oi35p2l5rqQ5ZKM5YW25L2ZMjU0NOe8uuWPo++8jOeLrOWuoemAmui/h+WQjuato+W4uOWQiOW5tm1haW7vvJvkuI3lr7zlhaXnlJ/kuqfmlbDmja7jgIHkuI3mlLnnlJ/kuqfmnYPpmZDjgIHkuI3lkK/liqhXb3JsZOaIlkNsb2Nr44CCIiwKICAicHJvcG9zYWwiOiB7CiAgICAicGF0aCI6ICIvVXNlcnMvc2FtdWVsL0RvY3VtZW50cy9lY29uY2x1Yi8uZWNvbm1pbmQtYXJ0aWZhY3RzL3Vua25vd24yNTQ0LXJlc3VtZS0yMDI2MTAyMC9CMDZfT1dORVJfREVDSVNJT05fMjAyNjEwMjAuemgtQ04ubWQiLAogICAgInNoYTI1NiI6ICI2ZDkwNzkzYWFiZmJhOTY4ZWNhYjMyOTMwNWQ1Y2FmMWQ5NzMzZmQ1MzY3MTk5OGQ4ZGM5MDBkYjE1MjRhNmM4IgogIH0sCiAgImFkb3B0ZWREZWZpbml0aW9uVmVyc2lvbiI6ICJCMDZfQzAxX1RZUEVEX1JFR0lTVEVSX1NUUlVDVFVSRV9WMSIsCiAgImRlZmluaXRpb25BZG9wdGVkIjogdHJ1ZSwKICAiZXhhY3RTdGFibGVJZHMiOiBbCiAgICAiVTI1NDQ6OkVOVElUWTo6RU5USVRZX0dPVkVSTk1FTlRfMDE6OmFjY291bnQiLAogICAgIlUyNTQ0OjpFTlRJVFk6OkVOVElUWV9PUEVSQVRPUl8wMTo6YWNjb3VudCIsCiAgICAiVTI1NDQ6OkVOVElUWTo6RU5USVRZX0hPVVNFSE9MRFNfMDE6OmFjY291bnQiLAogICAgIlUyNTQ0OjpFTlRJVFk6OkVOVElUWV9CQU5LXzAxOjphY2NvdW50IiwKICAgICJVMjU0NDo6RU5USVRZOjpFTlRJVFlfQ0VOVFJBTF9CQU5LXzAxOjphY2NvdW50IgogIF0sCiAgInN0cnVjdHVyYWxBY2NlcHRhbmNlIjogIkluZGVwZW5kZW50bHkgcmV2aWV3ZWQgYW5kIGV4YWN0bHkgc291cmNlLWFkbWl0dGVkIHR5cGVkIGZpbmFuY2lhbC1hY2NvdW50IGJpbmRpbmcgcmVjb3Jkcy9yZWdpc3RlciByZWZlcmVuY2VzOyBkbyBub3QgcmVxdWlyZSBhbiBhZGRpdGlvbmFsIGNsYWltLWZyZWUgbmF0aXZlIENBU0ggYXNzZXQgZm9yIGVhY2ggb2YgdGhlc2UgZml2ZSBlbnRpdGllcy4gUHJlc2VydmUgZXhpc3RpbmcgQ29yZSBhY2NvdW50IHR5cGVzLCBsZWdhbCByb2xlcyBhbmQgcmVjaXByb2NhbCBjbGFpbSBzaWRlcy4iLAogICJyZXByZXNlbnRhdGlvbkNoYW5nZSI6ICJTaW5nbGUgYWNjb3VudCB2YWx1ZSB0byB2ZXJzaW9uZWQgdHlwZWQgYmluZGluZy9yZWdpc3RlciByZWZlcmVuY2UgZm9yIHRoZXNlIGZpdmUgSURzIG9ubHk7IGludGVyZmFjZSBjaGFuZ2UgcmVxdWlyZXMgaW5kZXBlbmRlbnQgcmV2aWV3IGJlZm9yZSB1c2UuIiwKICAicm9sZXMiOiB7CiAgICAiRU5USVRZX0dPVkVSTk1FTlRfMDEiOiBbIlRHQV9BU1NFVCJdLAogICAgIkVOVElUWV9PUEVSQVRPUl8wMSI6IFsiQlVTSU5FU1NfREVQT1NJVF9BU1NFVCJdLAogICAgIkVOVElUWV9IT1VTRUhPTERTXzAxIjogWyJIT1VTRUhPTERfREVQT1NJVF9BU1NFVCJdLAogICAgIkVOVElUWV9CQU5LXzAxIjogWyJSRVNFUlZFX0FTU0VUIiwgIkhPVVNFSE9MRF9ERVBPU0lUX0lTU1VBTkNFX0xJQUJJTElUWSIsICJCVVNJTkVTU19ERVBPU0lUX0lTU1VBTkNFX0xJQUJJTElUWSJdLAogICAgIkVOVElUWV9DRU5UUkFMX0JBTktfMDEiOiBbIlRHQV9JU1NVQU5DRV9MSUFCSUxJVFkiLCAiUkVTRVJWRV9JU1NVQU5DRV9MSUFCSUxJVFkiXQogIH0sCiAgInVuY2hhbmdlZFJlcXVpcmVtZW50cyI6IFsKICAgICJJbW11dGFibGUgZ2VudWluZSBzb3VyY2UtcmVjb3JkIGlkZW50aXR5LCB2ZXJzaW9uLCBmdWxsLWJ5dGUgaGFzaCBhbmQgZXhhY3Qgcm93L3BvaW50ZXIiLAogICAgIlNvdXJjZSBpc3N1YW5jZS9jdXN0b2R5L2FkbWlzc2lvbiBhdXRob3JpdHkgYXBwcm9wcmlhdGUgdG8gYWNjb3VudCB0eXBlIiwKICAgICJFeGFjdCByZWNvcmQtc2V0IGFkb3B0aW9uIGV2aWRlbmNlLCBub3QgdGhpcyBkZWZpbml0aW9uIHJlY2VpcHQiLAogICAgIkV4aXN0aW5nIGxhd2Z1bCBpbmFjdGl2ZS1vcGVuaW5nIFdvcmxkL2dlbmVzaXMvaGVhZC9hc09mL3ZhbHVlRGF0ZSBhbmQgYWRtaXR0ZWQgY3VycmVuY3kgYmluZGluZyIsCiAgICAiT3JpZ2luYWwgc3RhYmxlIElEcywgQUNDT1VOVCB1bml0LCAzNTAgQjA2IGRlbm9taW5hdG9yLCAyNTQ0IHRvdGFsIGFuZCBoaXN0b3JpY2FsIHBpbnMiLAogICAgIk90aGVyIDM0NSBCMDYgSURzIHJldGFpbiB0aGUgcHJpb3IgYWNjZXB0YW5jZSBkZWZpbml0aW9uIiwKICAgICJCMDcgYWN0dWFsIG5hdGl2ZSBmdW5kcywgY29tcGxldGUgcmVzdHJpY3Rpb25zL29ibGlnYXRpb25zLCBzcGVuZGFiaWxpdHkgYW5kIGxlZ2l0aW1hdGUgc2V0dGxlbWVudCByb3V0ZSByZW1haW4gaW5kZXBlbmRlbnQiLAogICAgIkN1cnJlbnQgc2VydmVyLXNpZGUgYXV0aG9yaXphdGlvbiwgaW5kZXBlbmRlbnQgcmV2aWV3LCBhcHBsaWNhYmxlIGNoZWNrcyBhbmQgbm9ybWFsIGhlYWQtbWF0Y2hlZCBtZXJnZSIKICBdLAogICJub3RHcmFudGVkIjogWwogICAgIkFkb3B0aW9uIG9yIGlzc3VhbmNlIG9mIGFjY291bnQgYWxpYXNlcy9zb3VyY2UgcmVjb3Jkcy9yZWNvcmQgc2V0cyIsCiAgICAiQmFsYW5jZXMsIGZ1bmRpbmcsIGxvYW4sIGdyYW50LCBnb2xkLCBGWCwgZXF1aXR5IHBsdWcgb3IgbmV3IEIvUi9IL0QiLAogICAgIkN1cnJlbmN5L1hBQSBhZG9wdGlvbiBvciBMQz1HQ1UiLAogICAgIkluYWN0aXZlIG9wZW5pbmcvdGltZSBhbmNob3IgY3JlYXRpb24gb3IgYWRvcHRpb24iLAogICAgIkNCIGxpYWJpbGl0aWVzIGFzIGEgZnVuZGVkIHBheWVyIGFzc2V0IG9yIGR1cGxpY2F0ZSBjYXNoIiwKICAgICJBdXRvbWF0aWMgY2xvc3VyZSBvZiBhbnkgb3JpZ2luYWwgSUQiLAogICAgIk5ldyBDb3JlIGFjY291bnQgY2xhc3MsIHNlY29uZCBmaW5hbmNpYWwgZW5naW5lIG9yIGNsb3N1cmUgdHJ1dGgiLAogICAgIlByb2R1Y3Rpb24gZGF0YSBpbXBvcnQsIHByb2R1Y3Rpb24gcGVybWlzc2lvbiBjaGFuZ2VzLCBXb3JsZCBvciBDbG9jayBhY3RpdmF0aW9uIgogIF0sCiAgImhpc3RvcmljYWxBcHByb3ZlZDE3IjogewogICAgInBhdGgiOiAiL1VzZXJzL3NhbXVlbC9Eb2N1bWVudHMvZWNvbmNsdWIvLmVjb25taW5kLWFydGlmYWN0cy91bmtub3duMjU0NC1yZXN1bWUtMjAyNjEwMTgvaW5wdXQtYXBwcm92ZWQxNy9leGVjdXRpb25fYmF0Y2hlcy5qc29uIiwKICAgICJzaGEyNTYiOiAiZGU4ZDFkOWM1MjQwMGQ2NzViMjc2ZjJlOWRmMTRiYTc5ODcwNjQ3YjU3OWRhMjk2MzBhMTA3NDZhMjhmYTc0MSIsCiAgICAicG9pbnRlciI6ICIvNSIsCiAgICAicHJlc2VydmVPcmlnaW5hbEJ5dGVzIjogdHJ1ZQogIH0sCiAgInZlcmlmaWVkTWFpbkF0RGlzcGF0Y2giOiAiMGZkY2IwZDE0MTE1NTNjYmViMWI4ZGM3NmJiZjJlNmExYTUwMjYxMyIsCiAgImltcGxlbWVudGF0aW9uU3RhdHVzQXRSZWNvcmRDcmVhdGlvbiI6ICJOT1RfSU1QTEVNRU5URUQiLAogICJhY3R1YWxPcmlnaW5hbENsb3N1cmVzR3JhbnRlZCI6IDAsCiAgInNvdXJjZVJlY29yZEFkbWlzc2lvbkdyYW50ZWQiOiBmYWxzZSwKICAicmVjb3JkU2V0QWRvcHRpb25HcmFudGVkIjogZmFsc2UsCiAgInByb2R1Y3Rpb25NdXRhdGlvbkdyYW50ZWQiOiBmYWxzZSwKICAid29ybGRPckNsb2NrU3RhcnRHcmFudGVkIjogZmFsc2UKfQo=';
const definitionUtf8 = Buffer.from(definitionBytes, 'base64').toString('utf8');
const DEFINITION = 'B06_C01_TYPED_REGISTER_STRUCTURE_V1';
type Mutable<T> = {
  -readonly [K in keyof T]: T[K] extends string
    ? T[K]
    : T[K] extends object
      ? Mutable<T[K]>
      : T[K];
};
type Binding = Mutable<Gov01TypedRegisterBindingData>;
const request: Gov01ReadRequest = {
  registrationReference: 'REG_TEST_ONLY_GOV01',
  requestedOriginalId: GOV01_ORIGINAL_ID,
  sourceSetVersion: 'GOV01_TEST_ONLY_V1',
  worldId: 'WORLD_GOV01_VALIDATION_FIXTURE_ONLY',
  heldHead: { worldVersion: '0', eventSequence: '0' },
};
const expectation = {
  targetDeploymentRef: 'ISOLATED_TARGET_ONLY',
  databaseIdentityRef: 'ISOLATED_DB_ONLY',
  installationReference: 'ISOLATED_INSTALLATION_ONLY',
  anchorReference: 'ISOLATED_ANCHOR_ONLY',
  scope: 'GOV01_EXACT_TEST_SCOPE',
  checkpointGeneration: '4',
  checkpointHeadDigest: '4'.repeat(64),
};
type Document = { pin: Gov01RawPin; utf8: string };
interface Observation {
  schemaVersion: string;
  readOrigin: string;
  targetDeploymentRef: string;
  databaseIdentityRef: string;
  installationReference: string;
  allowedCaller: string;
  previousHeadDigest: string;
  checkpointGeneration: string;
  checkpointHeadDigest: string;
  dependencyStatuses: Record<string, string>;
  binding: Binding;
  documents: Document[];
}
function fixture(): Observation {
  const documents: Document[] = [];
  const add = (
    documentId: string,
    value: unknown,
    raw?: string,
  ): Gov01RawPin => {
    const utf8 = raw ?? JSON.stringify(value);
    const pin = {
      documentId,
      sourceVersion: request.sourceSetVersion,
      byteLength: String(Buffer.byteLength(utf8)),
      sha256: sha(utf8),
      pointer: '',
    };
    documents.push({ pin, utf8 });
    return pin;
  };
  const common = {
    worldId: request.worldId,
    countryId: 'COUNTRY_01',
    currency: 'XAA',
    claimId: 'CLAIM_GOV01_TEST_ONLY',
  };
  const a = {
    sourceRecordId: 'ASSET_RECORD_TEST_ONLY',
    sourceVersion: request.sourceSetVersion,
    account: {
      ...common,
      accountId: 'ACCOUNT_GOV01_TEST_ONLY',
      ownerId: 'ENTITY_GOVERNMENT_01',
      accountClass: 'ASSET',
      counterpartyEntityId: 'ENTITY_CENTRAL_BANK_01',
    },
    role: 'TGA_ASSET',
    holderId: 'ENTITY_GOVERNMENT_01',
    issuerId: 'ENTITY_CENTRAL_BANK_01',
    purpose: 'TREASURY_DEPOSIT_AT_CB',
    sourceHoldingKind: 'CLAIM',
  };
  const m = {
    ...a,
    sourceRecordId: 'MIRROR_RECORD_TEST_ONLY',
    account: {
      ...common,
      accountId: 'ACCOUNT_CB01_TEST_ONLY',
      ownerId: 'ENTITY_CENTRAL_BANK_01',
      accountClass: 'LIABILITY',
      counterpartyEntityId: 'ENTITY_GOVERNMENT_01',
    },
    role: 'TGA_ISSUANCE_LIABILITY',
  };
  const asset = { ...a, sourcePin: add('asset', a) },
    necessaryMirror = { ...m, sourcePin: add('mirror', m) };
  const register = {
    sourceRecordId: 'REGISTER_RECORD_TEST_ONLY',
    registerId: 'REGISTER_TEST_ONLY',
    ownerId: 'ENTITY_GOVERNMENT_01',
    countryId: 'COUNTRY_01',
    definitionVersion: DEFINITION,
    sourceVersion: request.sourceSetVersion,
    members: [
      {
        role: 'TGA_ASSET',
        accountId: a.account.accountId,
        sourceRecordId: a.sourceRecordId,
      },
    ],
  };
  const ownRegister = { ...register, sourcePin: add('register', register) };
  const open = {
    worldId: request.worldId,
    seedOrGenesisId: 'GENESIS_TEST_ONLY',
    seedOrGenesisFingerprint: 'sha256:' + 'a'.repeat(64),
    heldHead: structuredClone(request.heldHead),
    asOf: '2026-01-01',
    valueDate: '2026-01-01',
    calendarEpochSourceReference: 'CALENDAR_TEST_ONLY',
    lifecycleAttestationReference: 'LIFECYCLE_TEST_ONLY',
    openingAuthorityEvidenceReference: 'OPENING_TEST_ONLY',
  };
  const opening = {
    ...open,
    openingPin: add('opening', {
      ...open,
      lifecycle: 'INACTIVE_NOT_ACTIVATED',
    }),
  };
  const code = { code: 'XAA', unit: 'one Avenor national accounting unit' };
  const currencyPin = add('currency', code);
  const authority = (kind: string): Gov01RawPin =>
    add(kind, {
      kind,
      reference: kind,
      originalId: GOV01_ORIGINAL_ID,
      registrationReference: request.registrationReference,
      sourceSetVersion: request.sourceSetVersion,
      worldId: request.worldId,
      asOf: open.asOf,
      valueDate: open.valueDate,
      currency: code.code,
      unit: code.unit,
      generation: '5',
      status: 'ACTIVE',
    });
  const adoptionEvidencePin = authority('currencyAdoptionPin');
  const authorityEvidence = Object.fromEntries(
    [
      'retainedOriginPin',
      'installationPin',
      'cbIssuerCustodyAppointmentPin',
      'govRegisterCustodyAppointmentPin',
      'holderConcurrencePin',
      'definitionAdoptionPin',
      'exactRecordSetAdoptionPin',
      'registrationPin',
      'controlCheckpointPin',
    ].map((k) => [
      k,
      k === 'definitionAdoptionPin'
        ? add(k, null, definitionUtf8)
        : authority(k),
    ]),
  );
  const members = [
    asset.sourcePin,
    necessaryMirror.sourcePin,
    ownRegister.sourcePin,
    opening.openingPin,
    currencyPin,
    adoptionEvidencePin,
    ...Object.values(authorityEvidence),
  ];
  const sourceManifestPin = add('manifest', {
    schemaVersion: 'gov01-isolated-record-set-v1',
    sourceSetVersion: request.sourceSetVersion,
    originalId: GOV01_ORIGINAL_ID,
    members,
  });
  const dependencyStatuses = Object.fromEntries(
    [
      'origin',
      'installation',
      'cbAppointment',
      'govAppointment',
      'holder',
      'definition',
      'recordSet',
      'registration',
      'currency',
      'opening',
      'accounts',
      'register',
      'checkpoint',
    ].map((k) => [k, 'ACTIVE']),
  );
  const control = {
    anchorReference: expectation.anchorReference,
    scope: expectation.scope,
    generation: '5',
    headDigest: sha(
      canonicalSerialize({
        anchorReference: expectation.anchorReference,
        scope: expectation.scope,
        generation: '5',
        previousHeadDigest: expectation.checkpointHeadDigest,
        registrationReference: request.registrationReference,
        sourceSetVersion: request.sourceSetVersion,
        sourceManifestPin,
        dependencyStatuses,
      }),
    ),
  };
  const binding = {
    schemaVersion: 'gov01-typed-register-binding-read-v1',
    definitionVersion: DEFINITION,
    originalId: GOV01_ORIGINAL_ID,
    ownerId: 'ENTITY_GOVERNMENT_01',
    countryId: 'COUNTRY_01',
    registrationReference: request.registrationReference,
    sourceSetVersion: request.sourceSetVersion,
    sourceManifestPin,
    control,
    opening,
    currency: { ...code, currencyPin, adoptionEvidencePin },
    asset,
    necessaryMirror,
    ownRegister,
    authorityEvidence,
  } as unknown as Binding;
  return {
    schemaVersion: 'gov01-isolated-observation-v1',
    readOrigin: 'TEST_ONLY',
    targetDeploymentRef: expectation.targetDeploymentRef,
    databaseIdentityRef: expectation.databaseIdentityRef,
    installationReference: expectation.installationReference,
    allowedCaller: 'GOV01_F_ASYNC_RECEIVER',
    previousHeadDigest: expectation.checkpointHeadDigest,
    checkpointGeneration: expectation.checkpointGeneration,
    checkpointHeadDigest: expectation.checkpointHeadDigest,
    dependencyStatuses,
    binding,
    documents,
  };
}
const roots: string[] = [];
async function diskFixture(
  frames: Observation[] = Array.from({ length: 4 }, fixture),
  overrides: Record<string, unknown> = {},
) {
  const root = await realpath(
    await mkdtemp(path.join(tmpdir(), 'gov01-record-source-fixture-')),
  );
  roots.push(root);
  await chmod(root, 0o700);
  const utf8 = JSON.stringify({
    readOrigin: 'TEST_ONLY',
    request,
    expectation,
    frames,
    ...overrides,
  });
  await writeFile(path.join(root, '.fixture-owner'), 'b'.repeat(64), {
    mode: 0o600,
  });
  await writeFile(path.join(root, 'frames.json'), utf8, { mode: 0o600 });
  await writeFile(
    path.join(root, 'fixture-manifest.json'),
    JSON.stringify({
      schemaVersion: 'gov01-test-only-fixture-v1',
      framesByteLength: String(Buffer.byteLength(utf8)),
      framesSha256: sha(utf8),
    }),
    { mode: 0o600 },
  );
  return root;
}
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});
const executor: SqlExecutor = {
  async query() {
    throw new Error(
      'Fixture mechanism must not pretend to query a native backend',
    );
  },
};

describe('GOV01 closed request and raw source mechanics', () => {
  it('owns and freezes the exact five-key request', () => {
    const raw = structuredClone(request);
    const owned = parseGov01ReadRequest(raw);
    Object.assign(raw, { heldHead: { worldVersion: '9', eventSequence: '9' } });
    expect(owned.heldHead.worldVersion).toBe('0');
    expect(Object.isFrozen(owned.heldHead)).toBe(true);
  });
  it.each([
    'source',
    'store',
    'expectedPins',
    'verify',
    'amount',
    'world',
    'registration',
  ])('refuses an extra %s request field', (key) => {
    expect(() => parseGov01ReadRequest({ ...request, [key]: true })).toThrow(
      'CLOSED_KEYS_REQUIRED',
    );
  });
  it.each(['-1', '01', '1.0', '1e2', '9'.repeat(65)])(
    'refuses noncanonical/over-cap head %s',
    (worldVersion) => {
      expect(() =>
        parseGov01ReadRequest({
          ...request,
          heldHead: { worldVersion, eventSequence: '0' },
        }),
      ).toThrow('DECIMAL_INVALID');
    },
  );
  it('rejects accessors without invoking them', () => {
    let calls = 0;
    const raw = { ...request };
    Object.defineProperty(raw, 'worldId', {
      enumerable: true,
      get() {
        calls++;
        return request.worldId;
      },
    });
    expect(() => parseGov01ReadRequest(raw)).toThrow();
    expect(calls).toBe(0);
  });
  it('rejects proxy without invoking traps', () => {
    let calls = 0;
    const p = new Proxy(request, {
      ownKeys() {
        calls++;
        throw Error('trap');
      },
    });
    expect(() => parseGov01ReadRequest(p)).toThrow();
    expect(calls).toBe(0);
  });
  it('rejects hidden/symbol/class/cyclic data', () => {
    for (const raw of [
      Object.assign(Object.create({}), request),
      { ...request, [Symbol('x')]: 1 },
      Object.defineProperty({ ...request }, 'hidden', { value: true }),
    ])
      expect(() => parseGov01ReadRequest(raw)).toThrow();
    const r = { ...request, heldHead: {} };
    Object.assign(r.heldHead, { worldVersion: r });
    expect(() => parseGov01ReadRequest(r)).toThrow();
  });
  it('verifies full raw bytes before selection and preserves exact values', () => {
    const utf8 = '{"x":{"v":"0"}}';
    const pin = {
      documentId: 'd',
      sourceVersion: 'v1',
      byteLength: String(Buffer.byteLength(utf8)),
      sha256: sha(utf8),
      pointer: '/x/v',
    };
    expect(readGov01PinnedJsonDocument({ pin, utf8 })).toBe('0');
    expect(() =>
      readGov01PinnedJsonDocument({ pin, utf8: utf8 + ' ' }),
    ).toThrow('RAW_PIN_MISMATCH');
  });
  it.each(['{"x":"a","x":"b"}', '{"x":"a","\\u0078":"b"}'])(
    'rejects duplicate decoded raw keys %s',
    (utf8) => {
      const pin = {
        documentId: 'd',
        sourceVersion: 'v1',
        byteLength: String(Buffer.byteLength(utf8)),
        sha256: sha(utf8),
        pointer: '',
      };
      expect(() => readGov01PinnedJsonDocument({ pin, utf8 })).toThrow(
        'DUPLICATE_JSON_KEY',
      );
    },
  );
  it('uses RFC6901 escaping, exact own keys and canonical array selectors', () => {
    const utf8 = '{"a/b":{"~x":["ok"]}}';
    const pin = {
      documentId: 'd',
      sourceVersion: 'v1',
      byteLength: String(Buffer.byteLength(utf8)),
      sha256: sha(utf8),
      pointer: '/a~1b/~0x/0',
    };
    expect(readGov01PinnedJsonDocument({ pin, utf8 })).toBe('ok');
    for (const pointer of [
      '/a~2b',
      '/__proto__',
      '/a~1b/~0x/00',
      '/a~1b/~0x/-',
    ])
      expect(() =>
        readGov01PinnedJsonDocument({ pin: { ...pin, pointer }, utf8 }),
      ).toThrow();
  });
  it('refuses nonfinite, malformed, invalid Unicode, depth and byte overflow', () => {
    for (const utf8 of [
      '{"x":1e999}',
      '{"x":01}',
      '"\\ud800"',
      '['.repeat(26) + 'null' + ']'.repeat(26),
    ]) {
      const pin = {
        documentId: 'd',
        sourceVersion: 'v1',
        byteLength: String(Buffer.byteLength(utf8)),
        sha256: sha(utf8),
        pointer: '',
      };
      expect(() => readGov01PinnedJsonDocument({ pin, utf8 })).toThrow();
    }
    expect(() =>
      parseGov01ReadRequest({
        ...request,
        registrationReference: 'x'.repeat(17000),
      }),
    ).toThrow();
  });
});

describe('GOV01 exact pair/register and current-control data comparison', () => {
  it('reads full positive isolated records and actual definition bytes without claiming adoption', () => {
    expect(sha(definitionUtf8)).toBe(
      '968440af89bce122475915823336bbc11e6d481244424aa80bd72ac1bc3ab716',
    );
    const r = inspectTestOnlyGov01Observation(fixture(), request, expectation);
    expect(r.readOrigin).toBe('TEST_ONLY');
    expect(r.binding.asset.account.claimId).toBe(
      r.binding.necessaryMirror.account.claimId,
    );
    expect(Object.isFrozen(r.binding.asset.account)).toBe(true);
    expect('sourceAdmitted' in r).toBe(false);
  });
  const bindingFailures: [string, (b: Binding) => void][] = [
    [
      'missing mirror',
      (b) => {
        delete (b as unknown as Record<string, unknown>).necessaryMirror;
      },
    ],
    [
      'wrong owner',
      (b) => {
        b.asset.account.ownerId = 'ENTITY_CENTRAL_BANK_01' as never;
      },
    ],
    [
      'wrong holder',
      (b) => {
        b.asset.holderId = 'ENTITY_CENTRAL_BANK_01' as never;
      },
    ],
    [
      'wrong issuer',
      (b) => {
        b.asset.issuerId = 'ENTITY_GOVERNMENT_01' as never;
      },
    ],
    [
      'wrong counterparty',
      (b) => {
        b.asset.account.counterpartyEntityId = 'ENTITY_GOVERNMENT_01' as never;
      },
    ],
    [
      'mirror class',
      (b) => {
        b.necessaryMirror.account.accountClass = 'ASSET';
      },
    ],
    [
      'distinct claims',
      (b) => {
        b.necessaryMirror.account.claimId = 'CLAIM_OTHER' as never;
      },
    ],
    [
      'same account IDs',
      (b) => {
        b.necessaryMirror.account.accountId = b.asset.account.accountId;
      },
    ],
    [
      'same record IDs',
      (b) => {
        b.necessaryMirror.sourceRecordId = b.asset.sourceRecordId;
      },
    ],
    [
      'foreign World',
      (b) => {
        b.asset.account.worldId = 'WORLD_FOREIGN' as never;
      },
    ],
    [
      'foreign head',
      (b) => {
        b.opening.heldHead.worldVersion = '1';
      },
    ],
    [
      'currency mismatch',
      (b) => {
        b.necessaryMirror.account.currency = 'GCU';
      },
    ],
    [
      'currency noncanonical',
      (b) => {
        b.currency.code = 'xaa';
        b.asset.account.currency = 'xaa';
        b.necessaryMirror.account.currency = 'xaa';
      },
    ],
    [
      'invalid actual date',
      (b) => {
        b.opening.asOf = '2026-02-30';
      },
    ],
    [
      'bare opening fingerprint',
      (b) => {
        b.opening.seedOrGenesisFingerprint = 'a'.repeat(64);
      },
    ],
    [
      'wrong definition',
      (b) => {
        b.definitionVersion = 'OTHER' as never;
      },
    ],
    [
      'wrong adoption receipt',
      (b) => {
        b.authorityEvidence.definitionAdoptionPin.sha256 = 'e'.repeat(64);
      },
    ],
    [
      'foreign source set',
      (b) => {
        b.sourceSetVersion = 'OTHER';
      },
    ],
    [
      'version mismatch',
      (b) => {
        b.asset.sourceVersion = 'OTHER';
      },
    ],
    [
      'mirror as own asset',
      (b) => {
        b.ownRegister.members[0].accountId =
          b.necessaryMirror.account.accountId;
      },
    ],
    [
      'extra own member',
      (b) => {
        (b.ownRegister.members as unknown[]).push(b.ownRegister.members[0]);
      },
    ],
    [
      'balance zero field',
      (b) => {
        Object.assign(b.asset, { balance: '0' });
      },
    ],
  ];
  it.each(bindingFailures)('rejects %s', (name, mutate) => {
    void name;
    const b = fixture().binding;
    mutate(b);
    expect(() => parseGov01TypedRegisterBindingData(b, request)).toThrow();
  });
  it.each(['UNKNOWN', 'REVOKED', 'SUPERSEDED'])(
    'rejects each %s dependency, including independent appointment/currency/opening',
    (status) => {
      for (const key of Object.keys(fixture().dependencyStatuses)) {
        const f = fixture();
        f.dependencyStatuses[key] = status;
        expect(() =>
          inspectTestOnlyGov01Observation(f, request, expectation),
        ).toThrow('DEPENDENCY_NOT_CURRENT');
      }
    },
  );
  it.each([
    'targetDeploymentRef',
    'databaseIdentityRef',
    'installationReference',
    'checkpointHeadDigest',
  ])('rejects foreign %s', (key) => {
    const f = fixture();
    Object.assign(f, { [key]: 'foreign' });
    expect(() =>
      inspectTestOnlyGov01Observation(f, request, expectation),
    ).toThrow('INSTALLATION_BINDING_MISMATCH');
  });
  it('rejects genuine/unknown origin and caller-selected authority', () => {
    for (const patch of [
      { readOrigin: 'INSTALLED_SOURCE' },
      { allowedCaller: 'HTTP' },
      { verify: true },
    ])
      expect(() =>
        inspectTestOnlyGov01Observation(
          { ...fixture(), ...patch },
          request,
          expectation,
        ),
      ).toThrow();
  });
  it('rejects same revision changed digest, rollback, history gap and wrong scope', () => {
    for (const mutate of [
      (f: Observation) => {
        f.binding.control.headDigest = 'e'.repeat(64);
      },
      (f: Observation) => {
        f.binding.control.generation = '3';
      },
      (f: Observation) => {
        f.binding.control.generation = '7';
      },
      (f: Observation) => {
        f.binding.control.scope = 'other';
      },
      (f: Observation) => {
        f.previousHeadDigest = 'e'.repeat(64);
      },
    ]) {
      const f = fixture();
      mutate(f);
      expect(() =>
        inspectTestOnlyGov01Observation(f, request, expectation),
      ).toThrow();
    }
  });
  it('refuses missing/duplicate/extra/full-byte-unpinned document sets', () => {
    for (const mutate of [
      (f: Observation) => {
        f.documents.pop();
      },
      (f: Observation) => {
        f.documents.push(f.documents[0]!);
      },
      (f: Observation) => {
        f.documents[0]!.utf8 += ' ';
      },
      (f: Observation) => {
        f.binding.asset.sourcePin.pointer = '/missing';
      },
    ]) {
      const f = fixture();
      mutate(f);
      expect(() =>
        inspectTestOnlyGov01Observation(f, request, expectation),
      ).toThrow();
    }
  });
  it('rejects a validly rehashed source body that differs from normalized binding', () => {
    const f = fixture(),
      d = f.documents[0]!;
    d.utf8 = d.utf8.replace('TGA_ASSET', 'UNRELATED');
    d.pin = {
      ...d.pin,
      byteLength: String(Buffer.byteLength(d.utf8)),
      sha256: sha(d.utf8),
    };
    f.binding.asset.sourcePin = d.pin;
    const manifest = f.documents.find((d) => d.pin.documentId === 'manifest')!;
    const body = JSON.parse(manifest.utf8) as { members: Gov01RawPin[] };
    body.members[0] = d.pin;
    manifest.utf8 = JSON.stringify(body);
    manifest.pin = {
      ...manifest.pin,
      byteLength: String(Buffer.byteLength(manifest.utf8)),
      sha256: sha(manifest.utf8),
    };
    f.binding.sourceManifestPin = manifest.pin;
    f.binding.control.headDigest = sha(
      canonicalSerialize({
        anchorReference: f.binding.control.anchorReference,
        scope: f.binding.control.scope,
        generation: f.binding.control.generation,
        previousHeadDigest: f.previousHeadDigest,
        registrationReference: request.registrationReference,
        sourceSetVersion: request.sourceSetVersion,
        sourceManifestPin: manifest.pin,
        dependencyStatuses: f.dependencyStatuses,
      }),
    );
    expect(() =>
      inspectTestOnlyGov01Observation(f, request, expectation),
    ).toThrow('SOURCE_RECORD_BODY_MISMATCH');
  });
  it('does not treat a pure parsed DTO as an installed source', () => {
    const b = parseGov01TypedRegisterBindingData(fixture().binding, request);
    expect(isTestOnlyGov01RecordSource(b)).toBe(false);
    expect('withCurrentBindingFrom' in b).toBe(false);
  });
});

describe('guarded TEST_ONLY shared source lifecycle', () => {
  it('latches a failed current-use check even when consumer catches it', async () => {
    const frames = Array.from({ length: 5 }, fixture);
    frames[3]!.dependencyStatuses.accounts = 'REVOKED';
    const source = await createTestOnlyGov01RecordSource({
      fixtureRoot: await diskFixture(frames),
    });
    await expect(
      source.withCurrentBindingFrom(executor, request, async (read, use) => {
        await use.assertCurrentFrom(executor, request);
        await expect(use.assertCurrentFrom(executor, request)).rejects.toThrow(
          'DEPENDENCY_NOT_CURRENT',
        );
        return read;
      }),
    ).rejects.toThrow('RECEIVING_USE_CHECK_REQUIRED');
  });
  it('executes before/after/use/final checks, returns no actual binding and expires handle', async () => {
    const source = await createTestOnlyGov01RecordSource({
      fixtureRoot: await diskFixture(),
    });
    expect(isTestOnlyGov01RecordSource(source)).toBe(true);
    expect(isTestOnlyGov01RecordSource({ ...source })).toBe(false);
    let escaped: Gov01HeldReadUse | undefined;
    const result = await source.withCurrentBindingFrom(
      executor,
      request,
      async (read, use) => {
        escaped = use;
        await use.assertCurrentFrom(executor, request);
        expect(read.actualTypedRegisterBinding).toBeNull();
        expect(read.sourceAdmitted).toBe(false);
        return read;
      },
    );
    expect(result.readStatus).toBe('TEST_ONLY_GOV01_BINDING_READ');
    await expect(escaped!.assertCurrentFrom(executor, request)).rejects.toThrow(
      'EXPIRED_OR_FOREIGN_USE',
    );
  });
  it('captures request before await and resists caller mutations', async () => {
    const source = await createTestOnlyGov01RecordSource({
      fixtureRoot: await diskFixture(),
    });
    const r = structuredClone(request);
    const result = source.withCurrentBindingFrom(
      executor,
      r,
      async (read, use) => {
        await Promise.resolve();
        await use.assertCurrentFrom(executor, request);
        return read;
      },
    );
    Object.assign(r, { worldId: 'WORLD_MUTATED' });
    expect((await result).testOnlyBinding.opening.worldId).toBe(
      request.worldId,
    );
  });
  it('refuses missing use-check, foreign executor and changed request', async () => {
    for (const mode of ['missing', 'executor', 'request']) {
      const source = await createTestOnlyGov01RecordSource({
        fixtureRoot: await diskFixture(),
      });
      await expect(
        source.withCurrentBindingFrom(executor, request, async (read, use) => {
          if (mode === 'executor')
            await use.assertCurrentFrom({ ...executor }, request);
          if (mode === 'request')
            await use.assertCurrentFrom(executor, {
              ...request,
              worldId: 'WORLD_OTHER',
            });
          return read;
        }),
      ).rejects.toThrow();
    }
  });
  it.each([1, 2, 3])(
    'fails whole result on source change at frame %s without callback retry',
    async (index) => {
      const frames = Array.from({ length: 4 }, fixture);
      frames[index]!.dependencyStatuses.opening = 'REVOKED';
      const source = await createTestOnlyGov01RecordSource({
        fixtureRoot: await diskFixture(frames),
      });
      let calls = 0;
      await expect(
        source.withCurrentBindingFrom(executor, request, async (read, use) => {
          calls++;
          await use.assertCurrentFrom(executor, request);
          return read;
        }),
      ).rejects.toThrow('DEPENDENCY_NOT_CURRENT');
      expect(calls).toBe(index === 1 ? 0 : 1);
    },
  );
  it('expires after thrown callback and rejects reuse/reentrant scope', async () => {
    const source = await createTestOnlyGov01RecordSource({
      fixtureRoot: await diskFixture(),
    });
    let escaped: Gov01HeldReadUse | undefined;
    await expect(
      source.withCurrentBindingFrom(executor, request, async (_, use) => {
        escaped = use;
        await expect(
          source.withCurrentBindingFrom(executor, request, async (r) => r),
        ).rejects.toThrow('FIXTURE_SCOPE_OR_REUSE_DENIED');
        throw Error('consumer failed');
      }),
    ).rejects.toThrow('consumer failed');
    await expect(escaped!.assertCurrentFrom(executor, request)).rejects.toThrow(
      'EXPIRED_OR_FOREIGN_USE',
    );
  });
  it('exact fresh-fixture retries return identical IDs without issuing anything', async () => {
    const results = [];
    for (let i = 0; i < 2; i++) {
      const s = await createTestOnlyGov01RecordSource({
        fixtureRoot: await diskFixture(),
      });
      results.push(
        await s.withCurrentBindingFrom(executor, request, async (r, u) => {
          await u.assertCurrentFrom(executor, request);
          return r;
        }),
      );
    }
    expect(results[0]).toEqual(results[1]);
    expect(results[0]!.actualTypedRegisterBinding).toBeNull();
  });
  it('guards root path, modes, symlink and actual fixture byte identity', async () => {
    await expect(
      createTestOnlyGov01RecordSource({ fixtureRoot: '.' }),
    ).rejects.toThrow();
    const root = await diskFixture();
    await chmod(root, 0o755);
    await expect(
      createTestOnlyGov01RecordSource({ fixtureRoot: root }),
    ).rejects.toThrow();
    await chmod(root, 0o700);
    await writeFile(path.join(root, 'frames.json'), '{}');
    await expect(
      createTestOnlyGov01RecordSource({ fixtureRoot: root }),
    ).rejects.toThrow('RAW_PIN_MISMATCH');
    const good = await diskFixture();
    await rm(path.join(good, 'frames.json'));
    await symlink(
      path.join(root, 'frames.json'),
      path.join(good, 'frames.json'),
    );
    await expect(
      createTestOnlyGov01RecordSource({ fixtureRoot: good }),
    ).rejects.toThrow();
  });
  it('rejects fixture-origin overrides and sparse frame input', async () => {
    const root = await diskFixture(undefined, {
      readOrigin: 'INSTALLED_SOURCE',
    });
    await expect(
      createTestOnlyGov01RecordSource({ fixtureRoot: root }),
    ).rejects.toThrow('TEST_ONLY_ORIGIN_REQUIRED');
    expect(() =>
      inspectTestOnlyGov01Observation(
        { ...fixture(), documents: new Array(3) },
        request,
        expectation,
      ),
    ).toThrow();
  });
});
