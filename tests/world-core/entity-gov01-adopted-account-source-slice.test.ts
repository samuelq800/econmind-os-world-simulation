/** Actual receiving mechanisms under TEST_ONLY composition; no source admission. */
import { createHash } from 'node:crypto';
import { chmod, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { canonicalSerialize } from '@econmind/core';
import type { Pool } from 'pg';
import {
  GOV01_ORIGINAL_ID,
  createTestOnlyGov01RecordSource,
  type Gov01RawPin,
  type Gov01ReadRequest,
  type Gov01TypedRegisterBindingData,
} from '../../apps/world-worker/src/preparation/b06-gov01-adopted-record-source.js';
import {
  classifyGov01SourceReadFailure,
  readTestOnlyGov01AccountInTransaction,
} from '../../apps/world-worker/src/preparation/b06-gov01-source-installation.js';
import { PostgresSqlDatabase } from '../../apps/world-worker/src/persistence/postgres-sql-database.js';
import {
  createTestOnlyFinancialOpeningPackageRegistryLoader,
  type LoadedFinancialOpeningPackageRegistry,
} from '../../apps/world-worker/src/preparation/financial-opening-package-registry.js';
import { financialInputSha256 } from '../../apps/world-worker/src/preparation/formal-financial-opening-contract.js';
import {
  readEntityCashCountrySourceSlice,
  readGov01AdoptedAccountCountrySourceSliceFrom,
  readTestOnlyGov01AccountCountrySourceSliceFrom,
  readIsolatedEntityCashPair,
  type Gov01ReceiverContext,
} from '../../apps/world-worker/src/preparation/entity-native-cash-source-slice.js';
import type { SqlExecutor } from '../../apps/world-worker/src/persistence/sql-database.js';
import { originalEntityFixture } from '../support/entity-native-cash-candidate-fixture.js';
import {
  disposeFinancialOpeningPackageFixture,
  materializeFinancialOpeningPackageFixture,
  type OwnedFinancialOpeningPackageFixture,
} from '../support/financial-opening-package-fixture.js';

let fixture: OwnedFinancialOpeningPackageFixture;
let registry: LoadedFinancialOpeningPackageRegistry;
beforeAll(async () => {
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

function context(): Gov01ReceiverContext {
  const original = originalEntityFixture();
  return {
    registry,
    countryId: 'COUNTRY_01',
    mappings: {
      documentId: 'TEST_ONLY_REFERENCE_MAPPING',
      bytes: original.mappingsBytes,
      sha256: financialInputSha256(original.mappingsBytes),
    },
    originalField: {
      stableId: 'U2544::ENTITY::ENTITY_GOVERNMENT_01::account',
      ownerId: 'ENTITY_GOVERNMENT_01',
      countryId: 'COUNTRY_01',
      missingField: 'account',
    },
  };
}

const executor: SqlExecutor = {
  async query() {
    throw new Error('UNEXPECTED_DATABASE_CALL');
  },
};
const invalidRequest = {
  registrationReference: 'TEST_ONLY_GOV01_REGISTRATION',
  requestedOriginalId: 'U2544::ENTITY::ENTITY_GOVERNMENT_01::account' as const,
  sourceSetVersion: 'TEST_ONLY_GOV01_SOURCE_V1',
  worldId: 'WORLD_TEST_ONLY_GOV01',
  heldHead: { worldVersion: '0', eventSequence: '0' },
};

// Deterministic TEST_ONLY vector construction copied from exact A cc897e19.
// No A test module is imported or executed; only this new F suite runs.
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
function sourceObservation(): Observation {
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
  frames: Observation[] = Array.from({ length: 4 }, sourceObservation),
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

describe('GOV01 async receiver rejects input before touching an installed source', () => {
  async function rejects(value: unknown, code: string) {
    // Unknown external values are runtime negative inputs, never fixture sources.
    await expect(
      readGov01AdoptedAccountCountrySourceSliceFrom(
        value as Gov01ReceiverContext,
        undefined,
        executor,
        invalidRequest,
      ),
    ).rejects.toThrow(code);
  }

  it('requires the genuine loaded integrity registry', async () => {
    await rejects({ ...context(), registry: {} }, 'GENUINE_REGISTRY_REQUIRED');
  });
  it.each([
    ['countryId', 'COUNTRY_02'],
    ['ownerId', 'ENTITY_OPERATOR_01'],
    ['missingField', 'availableNativeCash'],
    ['stableId', 'U2544::ENTITY::ENTITY_GOVERNMENT_02::account'],
  ])('rejects a different original field %s', async (key, value) => {
    const input = context();
    await rejects(
      { ...input, originalField: { ...input.originalField, [key]: value } },
      'GOV01_EXACT_ACCOUNT_FIELD_REQUIRED',
    );
  });
  it('rejects a foreign context country', async () => {
    await rejects(
      { ...context(), countryId: 'COUNTRY_02' },
      'GOV01_COUNTRY_REQUIRED',
    );
  });
  it('rejects extra provider fields rather than spreading them', async () => {
    await rejects({ ...context(), source: {} }, 'GOV01_EXACT_KEYS_REQUIRED');
  });
  it('rejects getters without evaluating them', async () => {
    let calls = 0;
    const input = context();
    Object.defineProperty(input, 'mappings', {
      enumerable: true,
      get() {
        calls++;
        throw new Error('GETTER_WAS_CALLED');
      },
    });
    await rejects(input, 'GOV01_ACCESSOR_DENIED');
    expect(calls).toBe(0);
  });
  it('rejects proxies without invoking traps', async () => {
    let calls = 0;
    const input = new Proxy(context(), {
      ownKeys() {
        calls++;
        throw new Error('PROXY_WAS_CALLED');
      },
    });
    await rejects(input, 'GOV01_CLOSED_DATA_REQUIRED');
    expect(calls).toBe(0);
  });
  it('rejects changed mapping bytes and extra mapping fields', async () => {
    const input = context();
    await rejects(
      {
        ...input,
        mappings: { ...input.mappings, bytes: input.mappings.bytes + ' ' },
      },
      'MAPPING_PIN_MISMATCH',
    );
    await rejects(
      { ...input, mappings: { ...input.mappings, provider: {} } },
      'GOV01_EXACT_KEYS_REQUIRED',
    );
  });
  it('rejects a mapping above the full-byte limit', async () => {
    const input = context();
    const bytes = ' '.repeat(1024 * 1024 + 1);
    await rejects(
      {
        ...input,
        mappings: {
          ...input.mappings,
          bytes,
          sha256: financialInputSha256(bytes),
        },
      },
      'MAPPING_PIN_MISMATCH',
    );
  });
  it('uses A raw parsing to reject duplicate mapping keys and invalid UTF-8', async () => {
    const c = context();
    for (const [bytes, code] of [
      [
        '{"status":"REFERENCE_CROSSWALK_NOT_ACCOUNT_BINDING","rows":[],"rows":[]}',
        'DUPLICATE_JSON_KEY',
      ],
      ['\ud800', 'UTF8_INVALID'],
    ] as const) {
      await rejects(
        {
          ...c,
          mappings: {
            ...c.mappings,
            bytes,
            sha256: financialInputSha256(bytes),
          },
        },
        code,
      );
    }
  });
  it('rejects duplicate selected owner mappings and actual authority fields', async () => {
    const input = context();
    const original = JSON.parse(input.mappings.bytes) as {
      status: string;
      rows: Record<string, unknown>[];
    };
    const gov = original.rows.find(
      (row) =>
        row.countryId === 'COUNTRY_01' &&
        row.entityId === 'ENTITY_GOVERNMENT_01',
    )!;
    const invoke = async (rows: Record<string, unknown>[], code: string) => {
      const bytes = JSON.stringify({ status: original.status, rows });
      await rejects(
        {
          ...input,
          mappings: {
            ...input.mappings,
            bytes,
            sha256: financialInputSha256(bytes),
          },
        },
        code,
      );
    };
    await invoke([gov, gov], 'REQUESTED_OWNER_MAPPING_REQUIRED');
    await invoke(
      [{ ...gov, actualAccount: 'FORGED_ACCOUNT' }],
      'MAPPING_IS_NOT_REFERENCE_ONLY',
    );
  });
});

describe('GOV01 asynchronous addition preserves legacy B07 boundaries', () => {
  it('retains ten-field sync reads, unavailable cash and formal-settlement denial', () => {
    const c = context();
    const originals = originalEntityFixture().originalFields.filter(
      (row) => row.countryId === 'COUNTRY_01',
    );
    const slice = readEntityCashCountrySourceSlice({
      registry,
      countryId: 'COUNTRY_01',
      mappings: c.mappings,
      originalFields: originals,
      declaredInput: null,
    });
    expect(slice.rows).toHaveLength(10);
    for (const row of slice.rows.filter((r) => r.batchId === 'B07')) {
      expect(row.unit).toBe('NATIVE_MONEY');
      expect(row.currentPermission).toBe('UNKNOWN');
      expect(row.actualValue).toBeNull();
      expect(row.actualAdmission).toBeNull();
      expect(Object.values(row.originalFieldStages)).toEqual([
        false,
        false,
        false,
        false,
      ]);
    }
    expect(() =>
      readIsolatedEntityCashPair({
        slice,
        purpose: 'FORMAL_SETTLEMENT',
        payerEntityId: 'ENTITY_GOVERNMENT_01',
        payeeEntityId: 'ENTITY_OPERATOR_01',
        currency: 'XAA',
        scope: null,
      }),
    ).toThrow();
    expect(() =>
      readEntityCashCountrySourceSlice({
        registry,
        countryId: 'COUNTRY_01',
        mappings: c.mappings,
        originalFields: [c.originalField],
        declaredInput: null,
      }),
    ).toThrow('EXACT_TEN_ORIGINAL_IDS_REQUIRED');
  });
});

async function sourceFor(frames?: Observation[]) {
  return createTestOnlyGov01RecordSource({
    fixtureRoot: await diskFixture(frames),
  });
}

describe('actual A source algorithm to F one-ID assembler', () => {
  it('reads exactly one account with a distinct TEST_ONLY result and no B07 requirement', async () => {
    const c = context();
    const raw = JSON.parse(c.mappings.bytes) as {
      status: string;
      rows: Record<string, unknown>[];
    };
    const bytes = JSON.stringify({
      status: raw.status,
      rows: raw.rows.filter(
        (r) =>
          r.countryId === 'COUNTRY_01' && r.entityId === 'ENTITY_GOVERNMENT_01',
      ),
    });
    const result = await readTestOnlyGov01AccountCountrySourceSliceFrom(
      {
        ...c,
        mappings: { ...c.mappings, bytes, sha256: financialInputSha256(bytes) },
      },
      await sourceFor(),
      executor,
      request,
    );
    expect(result.readStatus).toBe('TEST_ONLY_GOV01_BINDING_READ');
    expect(result.stableId).toBe(GOV01_ORIGINAL_ID);
    expect(result.unit).toBe('ACCOUNT');
    expect(result.testOnlyBinding.ownRegister.members).toHaveLength(1);
    expect(result.testOnlyBinding.asset.account.claimId).toBe(
      result.testOnlyBinding.necessaryMirror.account.claimId,
    );
    expect(result.actualTypedRegisterBinding).toBeNull();
    expect(result.actualAvailableNativeCash).toBeNull();
    expect(result.currentPermission).toBe('UNKNOWN');
    expect(Object.values(result.originalFieldStages)).toEqual([
      false,
      false,
      false,
      false,
    ]);
    expect(result.originalIdsClosed).toBe(0);
    expect(result.accountIdsIssued).toBe(0);
    expect(
      result.productionAuthority ||
        result.admissionAllowed ||
        result.activationAllowed ||
        result.runtimeConnected,
    ).toBe(false);
    expect(Object.isFrozen(result.testOnlyBinding.asset.account)).toBe(true);
    expect(Object.isFrozen(result)).toBe(true);
  });

  it('captures request and reference context before awaiting the source', async () => {
    const c = context(),
      mutableRequest = structuredClone(request);
    const promise = readTestOnlyGov01AccountCountrySourceSliceFrom(
      c,
      await sourceFor(),
      executor,
      mutableRequest,
    );
    Object.assign(c, { countryId: 'COUNTRY_70', originalField: {} });
    Object.assign(mutableRequest, {
      heldHead: { worldVersion: '9', eventSequence: '9' },
    });
    const result = await promise;
    expect(result.countryId).toBe('COUNTRY_01');
    expect(result.testOnlyBinding.opening.heldHead.worldVersion).toBe('0');
  });

  it('does not invoke a structural source or its getters as actual installation', async () => {
    let calls = 0;
    const fake = Object.defineProperty({}, 'withCurrentBindingFrom', {
      enumerable: true,
      get() {
        calls++;
        throw new Error('FAKE_CALLBACK');
      },
    });
    await expect(
      readGov01AdoptedAccountCountrySourceSliceFrom(
        context(),
        fake,
        executor,
        request,
      ),
    ).rejects.toThrow('GOV01_ACTUAL_INSTALLATION_NOT_SUPPLIED');
    await expect(
      readTestOnlyGov01AccountCountrySourceSliceFrom(
        context(),
        fake,
        executor,
        request,
      ),
    ).rejects.toThrow('GOV01_GUARDED_FIXTURE_SOURCE_REQUIRED');
    expect(calls).toBe(0);
  });

  it('refuses fixture promotion into the actual binding slot', async () => {
    const source = await sourceFor();
    await expect(
      readGov01AdoptedAccountCountrySourceSliceFrom(
        context(),
        source,
        executor,
        request,
      ),
    ).rejects.toThrow('GOV01_TEST_ONLY_NOT_ACTUAL_SOURCE');
    const result = await readTestOnlyGov01AccountCountrySourceSliceFrom(
      context(),
      source,
      executor,
      request,
    );
    expect(result.actualTypedRegisterBinding).toBeNull();
  });

  it.each([0, 1, 2, 3])(
    'withholds output if control is revoked at actual read position %s',
    async (position) => {
      const frames = Array.from({ length: 4 }, sourceObservation);
      frames[position]!.dependencyStatuses.accounts = 'REVOKED';
      let exposed = false;
      await expect(
        readTestOnlyGov01AccountCountrySourceSliceFrom(
          context(),
          await sourceFor(frames),
          executor,
          request,
        ).then(() => {
          exposed = true;
        }),
      ).rejects.toThrow('DEPENDENCY_NOT_CURRENT');
      expect(exposed).toBe(false);
    },
  );

  it('refuses a wrong H and extra request authority without using a fake port', async () => {
    await expect(
      readTestOnlyGov01AccountCountrySourceSliceFrom(
        context(),
        await sourceFor(),
        executor,
        { ...request, heldHead: { worldVersion: '1', eventSequence: '0' } },
      ),
    ).rejects.toThrow('FIXTURE_SCOPE_OR_REUSE_DENIED');
    await expect(
      readTestOnlyGov01AccountCountrySourceSliceFrom(
        context(),
        await sourceFor(),
        executor,
        { ...request, source: {} } as Gov01ReadRequest,
      ),
    ).rejects.toThrow();
  });

  it('has no implicit source callback retry or reusable fixture authorization', async () => {
    const source = await sourceFor();
    await readTestOnlyGov01AccountCountrySourceSliceFrom(
      context(),
      source,
      executor,
      request,
    );
    await expect(
      readTestOnlyGov01AccountCountrySourceSliceFrom(
        context(),
        source,
        executor,
        request,
      ),
    ).rejects.toThrow('FIXTURE_SCOPE_OR_REUSE_DENIED');
    const fresh = await readTestOnlyGov01AccountCountrySourceSliceFrom(
      context(),
      await sourceFor(),
      executor,
      request,
    );
    expect(fresh.testOnlyBinding.asset.account.accountId).toBe(
      'ACCOUNT_GOV01_TEST_ONLY',
    );
    expect(fresh.accountIdsIssued).toBe(0);
  });
});

/** Real existing adapter, SQL protocol double; not a native backend or custody. */
function protocolDatabase(failAt?: 'begin' | 'commit' | 'rollback') {
  const trace: string[] = [];
  const client = {
    async query(statement: string) {
      trace.push(statement);
      if (statement === failAt) throw new Error('TEST_ONLY_' + statement);
      return { rows: [], rowCount: 0 };
    },
    release(error?: Error) {
      trace.push(error ? 'release-error' : 'release');
    },
  };
  const pool = {
    async connect() {
      return client;
    },
  } as unknown as Pool;
  return { database: new PostgresSqlDatabase(pool), trace };
}

describe('existing PostgreSQL outer transaction releases actual A/F TEST_ONLY data', () => {
  it('captures the request and context before the adapter awaits a connection', async () => {
    const { database } = protocolDatabase();
    const c = context(),
      r = structuredClone(request),
      source = await sourceFor();
    const promise = readTestOnlyGov01AccountInTransaction({
      database,
      context: c,
      source,
      request: r,
    });
    Object.assign(c, { countryId: 'COUNTRY_70', mappings: {} });
    Object.assign(r, { worldId: 'WORLD_CHANGED_AFTER_CALL' });
    const result = await promise;
    expect(result.result.countryId).toBe('COUNTRY_01');
    expect(result.result.testOnlyBinding.opening.worldId).toBe(request.worldId);
  });
  it('exposes assembled data only after COMMIT acknowledgement and release', async () => {
    const { database, trace } = protocolDatabase();
    const result = await readTestOnlyGov01AccountInTransaction({
      database,
      context: context(),
      source: await sourceFor(),
      request,
    }).then((value) => {
      trace.push('host-exposure');
      return value;
    });
    expect(trace).toEqual(['begin', 'commit', 'release', 'host-exposure']);
    expect(result.transactionResult).toBe('COMMITTED');
    expect(result.evidenceClass).toBe(
      'TEST_ONLY_ADAPTER_PROTOCOL_NOT_NATIVE_CUSTODY',
    );
    expect(result.result.actualTypedRegisterBinding).toBeNull();
  });
  it.each([
    ['commit', 'UNKNOWN'],
    ['begin', 'NOT_STARTED'],
  ] as const)(
    'suppresses all output when %s fails',
    async (failure, expected) => {
      const { database, trace } = protocolDatabase(failure);
      let exposed = false;
      const outcome = await readTestOnlyGov01AccountInTransaction({
        database,
        context: context(),
        source: await sourceFor(),
        request,
      }).then(() => {
        exposed = true;
        return 'UNEXPECTED_SUCCESS';
      }, classifyGov01SourceReadFailure);
      expect(outcome).toBe(expected);
      expect(exposed).toBe(false);
      expect(trace.filter((step) => step === 'begin')).toHaveLength(1);
      expect(trace.at(-1)).toBe('release-error');
      expect(trace).not.toContain('rollback');
    },
  );
  it.each([
    [false, 'ROLLED_BACK'],
    [true, 'CLEANUP_INCOMPLETE'],
  ] as const)(
    'suppresses a final-check failure with rollback failure=%s',
    async (rollbackFailure, expected) => {
      const frames = Array.from({ length: 4 }, sourceObservation);
      frames[3]!.dependencyStatuses.accounts = 'UNKNOWN';
      const { database, trace } = protocolDatabase(
        rollbackFailure ? 'rollback' : undefined,
      );
      let exposed = false;
      const outcome = await readTestOnlyGov01AccountInTransaction({
        database,
        context: context(),
        source: await sourceFor(frames),
        request,
      }).then(() => {
        exposed = true;
        return 'UNEXPECTED_SUCCESS';
      }, classifyGov01SourceReadFailure);
      expect(outcome).toBe(expected);
      expect(exposed).toBe(false);
      expect(trace).toEqual(['begin', 'rollback', 'release-error']);
    },
  );
});
