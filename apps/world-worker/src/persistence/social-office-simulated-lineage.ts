/** Same-executor documentary binding around C's real, pure joined ledger replay. */
import {
  canonicalSerialize,
  SOCIAL_OFFICE_ACTION_EVENT,
  replaySocialOfficeJoinedLineage,
  type CanonicalCommand,
  type AuthoritativeTransition,
  type FinancialPostingBatch,
  type InventoryLedgerPosting,
  type OpeningSeed,
  type Sha256Hex,
  type SocialOfficeReadFactsV1,
  type CanonicalSha256,
} from '@econmind/core';
import {
  assertSocialOfficeHistoricalReadFacts,
  bindSocialOfficeSimulatedOpening,
  SOCIAL_DEMO_EXECUTION_IDENTITY_V1,
} from '../social-office-demo/source-facts.js';
import {
  requireSocialOfficeProtectedSource,
  type SocialOfficeSimulationIdentity,
} from './social-office-resource-protection.js';
import { readSocialOfficeSimulatedRevisionFrom } from './social-office-simulated-source-custody.js';
import type { SocialOfficeSimulatedPublication } from './social-office-simulated-source-custody.js';
import type { SqlExecutor } from './sql-database.js';

export interface SocialOfficeLineageIdentity extends SocialOfficeSimulationIdentity {
  readonly seedId: string;
  readonly seedFingerprint: CanonicalSha256;
}
export interface SocialOfficeDurableGroup {
  readonly command: CanonicalCommand;
  readonly transition: AuthoritativeTransition;
  readonly financialPostingBatches: readonly FinancialPostingBatch[];
  readonly inventoryPostings: readonly InventoryLedgerPosting[];
  readonly serviceConsumptionWire: string | null;
}
function scope(identity: SocialOfficeLineageIdentity) {
  return {
    simulationId: identity.simulationId,
    worldId: identity.worldId,
    countryId: identity.countryId,
  };
}
export function readSocialOfficeExecutionIdentity(
  executor: SqlExecutor,
  identity: SocialOfficeLineageIdentity,
) {
  const current = requireSocialOfficeProtectedSource(executor, scope(identity));
  return socialOfficeExecutionIdentityFromPublication(current.publication);
}
export function socialOfficeExecutionIdentityFromPublication(
  publication: SocialOfficeSimulatedPublication,
) {
  const rows = publication.records.filter(
    (r) =>
      r.recordId === 'G_SOCIAL_EXECUTION_IDENTITY_V1' &&
      r.role === 'CURRENT_AUTHORIZATION' &&
      publication.selectedRecordIds.includes(r.recordId),
  );
  if (
    rows.length !== 1 ||
    rows[0]!.revision !== 'G_SOCIAL_DEMO_V1' ||
    rows[0]!.rawUtf8 !== canonicalSerialize(SOCIAL_DEMO_EXECUTION_IDENTITY_V1)
  )
    throw Error('SOCIAL_LINEAGE: exact selected execution identity required');
  return SOCIAL_DEMO_EXECUTION_IDENTITY_V1;
}
export async function replaySocialOfficeDurableGroups(input: {
  readonly executor: SqlExecutor;
  readonly identity: SocialOfficeLineageIdentity;
  readonly seed: OpeningSeed;
  readonly groups: readonly SocialOfficeDurableGroup[];
  readonly sha256Hex: Sha256Hex;
}) {
  const { executor, identity, seed } = input;
  readSocialOfficeExecutionIdentity(executor, identity); // Mandatory for the empty prefix too.
  if (
    input.groups.length > 256 ||
    seed.worldId !== identity.worldId ||
    seed.seedId !== identity.seedId ||
    seed.fingerprint !== identity.seedFingerprint
  )
    throw Error('SOCIAL_LINEAGE: exact seed or full-prefix bound');
  const first = await executor.query<{ manifest_hash: string }>(
    'select manifest_hash from world_v2.social_demo_source_revision where simulation_id=$1 and world_id=$2 and country_id=$3 and generation=1',
    [identity.simulationId, identity.worldId, identity.countryId],
  );
  if (first.rows.length !== 1)
    throw Error('SOCIAL_LINEAGE: immutable opening revision required');
  const original = await readSocialOfficeSimulatedRevisionFrom(
    executor,
    scope(identity),
    { generation: '1', manifestHash: first.rows[0]!.manifest_hash },
  );
  const opening = bindSocialOfficeSimulatedOpening({
    publicationUtf8: original.publicationUtf8,
    generation: original.generation,
    manifestHash: original.manifestHash,
    expectedWorldId: identity.worldId,
    expectedCountryId: identity.countryId,
    expectedSeedId: identity.seedId,
    expectedSeedFingerprint: identity.seedFingerprint,
  });
  const transitions = [];
  for (const group of input.groups) {
    if (group.transition.events.length !== 1)
      throw Error(
        'SOCIAL_LINEAGE: complete one-event Social transition required',
      );
    const event = group.transition.events[0]!;
    if (
      event.eventType !== SOCIAL_OFFICE_ACTION_EVENT ||
      event.correctsEventId !== null
    )
      throw Error(
        'SOCIAL_LINEAGE: Unsupported/unknown sibling or correction in complete Social prefix',
      );
    const payload = JSON.parse(event.canonicalPayload) as {
      readFacts?: SocialOfficeReadFactsV1;
    };
    const facts = payload.readFacts;
    if (
      !facts ||
      !facts.sourceBinding ||
      !/^sha256:[a-f0-9]{64}$/u.test(facts.sourceBinding.manifestHash)
    )
      throw Error('SOCIAL_LINEAGE: retained source binding required');
    const historical = await readSocialOfficeSimulatedRevisionFrom(
      executor,
      scope(identity),
      {
        generation: facts.sourceBinding.sourceGeneration,
        manifestHash: facts.sourceBinding.manifestHash.slice(7),
      },
    );
    assertSocialOfficeHistoricalReadFacts({
      publicationUtf8: historical.publicationUtf8,
      generation: historical.generation,
      manifestHash: historical.manifestHash,
      command: group.command,
      retainedReadFacts: facts,
    });
    transitions.push({ ...group, readFacts: facts });
  }
  return replaySocialOfficeJoinedLineage({
    seed,
    socialOpening: opening.socialOpening,
    openingReadFacts: opening.openingReadFacts,
    transitions,
    sha256Hex: input.sha256Hex,
  });
}

/** The separate SQL fingerprint is joined without repairing malformed intent bytes. */
export function socialOfficeServiceWire(
  canonicalPayload: unknown,
  fingerprint: unknown,
): string {
  if (
    typeof canonicalPayload !== 'string' ||
    typeof fingerprint !== 'string' ||
    !/^sha256:[a-f0-9]{64}$/u.test(fingerprint)
  )
    throw Error('SOCIAL_LINEAGE: canonical service row required');
  const value: unknown = JSON.parse(canonicalPayload);
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.hasOwn(value, 'fingerprint') ||
    canonicalSerialize(value) !== canonicalPayload
  )
    throw Error('SOCIAL_LINEAGE: exact service intent bytes required');
  const p = value as Record<string, unknown>;
  if (
    p.schemaVersion !== 'inventory-social-service-consumption-v1' ||
    p.operation !== 'SERVICE_CONSUME'
  )
    throw Error('SOCIAL_LINEAGE: unsupported service pair');
  return canonicalSerialize({ ...p, fingerprint });
}
