import { createHash } from 'node:crypto';
import {
  canonicalSerialize,
  DOMAIN_ERROR_CODES,
  DomainError,
  countryId,
  legalEntityId,
  ECONOMIC_READ_VISIBILITY_SCHEMA,
  type EconomicReadDisclosure,
  type EconomicReadScope,
  type EconomicReadVisibilitySummary,
  type OpeningSeed,
} from '@econmind/core';
import { WorldOpeningSeedStore } from '../persistence/opening-seed-store.js';
import type { SqlDatabase, SqlExecutor } from '../persistence/sql-database.js';
import { parseOpeningEconomicDecision } from '../preparation/opening-economic-decision.js';
import {
  FROZEN_OPENING_MAPPING_SHA256,
  openingCountrySeedAssemblyFingerprint,
  type OpeningCanonicalSeedAssembly,
  type OpeningCountrySeedAssembly,
} from '../preparation/opening-canonical-seed-bridge.js';

const sha = (value: string) =>
  createHash('sha256').update(value, 'utf8').digest('hex');
const CHECKSUMS =
  '88dd44478f97d2e8893a4f11b3aaf96e256bdb13248aca0d08f097fabe10d315';
const FINANCE_SHA =
  '4f30d7dd43aa2190604d4fb73c776a8d4aaa263653dc783def6f7c2c5cc80805';
type Row = Record<string, unknown>;
type OwnerMapping = Readonly<{ treasury: string; centralBank: string }>;
const deny = (
  reason: Extract<
    EconomicReadDisclosure,
    { status: 'NOT_AUTHORIZED' }
  >['reason'],
): EconomicReadDisclosure =>
  Object.freeze({ status: 'NOT_AUTHORIZED', reason });
function object(value: unknown): Row {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('INVALID_VISIBILITY_SOURCE');
  return value as Row;
}
function list(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error('INVALID_VISIBILITY_SOURCE');
  return value;
}

/** Held-transaction classification port, shared by movement and future opening
 * consumers. Membership, signed read snapshots and minimum-head checks remain
 * separate mandatory boundaries. This object must not be cached across reads. */
export interface EconomicReadVisibilitySnapshot {
  readonly worldId: string;
  readonly worldVersion: string;
  readonly eventSequence: string;
  financial(
    account: Readonly<Record<string, unknown>>,
    scope: EconomicReadScope,
  ): EconomicReadDisclosure;
  inventory(
    account: Readonly<Record<string, unknown>>,
    scope: EconomicReadScope,
  ): EconomicReadDisclosure;
  summary(scope: EconomicReadScope): EconomicReadVisibilitySummary;
}
export interface EconomicReadVisibilitySourcePort {
  loadFrom(
    executor: SqlExecutor,
    input: Readonly<{
      worldId: string;
      worldVersion: string;
      eventSequence: string;
    }>,
  ): Promise<EconomicReadVisibilitySnapshot>;
}

/** Actual SQL/immutable seed consumer. No caller-provided mappings, labels,
 * capability inference or prefix inference. No admission publication method.
 * The existing complete canonical bridge source carries decision + assembly;
 * TEST_ONLY/non-host sources do not become disclosure grants. */
export class SqlEconomicReadVisibilitySource implements EconomicReadVisibilitySourcePort {
  readonly #opening: WorldOpeningSeedStore;
  constructor(database: SqlDatabase) {
    this.#opening = new WorldOpeningSeedStore({ database, sha256Hex: sha });
  }
  async loadFrom(
    executor: SqlExecutor,
    input: Readonly<{
      worldId: string;
      worldVersion: string;
      eventSequence: string;
    }>,
  ): Promise<EconomicReadVisibilitySnapshot> {
    input = Object.freeze({ ...input });
    const head = await executor.query<Row>(
      `select world_version::text as world_version, event_sequence::text as event_sequence
      from world_v2.world_head where world_id=$1 for share`,
      [input.worldId],
    );
    if (
      head.rows.length !== 1 ||
      head.rows[0]?.world_version !== input.worldVersion ||
      head.rows[0]?.event_sequence !== input.eventSequence
    )
      throw new DomainError(
        DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
        'Visibility source is not at the held publication head',
      );
    // Schema absence is a known unimplemented admission boundary, not permission.
    const tables =
      await executor.query<Row>(`select to_regclass('world_v2.opening_seed')::text as opening,
      to_regclass('world_v2.runtime_opening_admission')::text as admission`);
    const row = tables.rows[0];
    let mapping: ReadonlyMap<string, OwnerMapping> | null = null;
    if (row?.opening != null && row.admission != null) {
      const admissions = await executor.query<Row>(
        `select admission_ref, world_id, seed_id, seed_fingerprint, model_version, replay_binding
        from world_v2.runtime_opening_admission where world_id=$1 for share`,
        [input.worldId],
      );
      if (admissions.rows.length === 1) {
        const admitted = admissions.rows[0]!;
        const seed = await this.#opening.loadFrom(executor, input.worldId);
        if (
          typeof admitted.admission_ref === 'string' &&
          /^[A-Z][A-Z0-9]*(?:[_-][A-Z0-9]+)*$/u.test(admitted.admission_ref) &&
          admitted.world_id === seed.worldId &&
          admitted.seed_id === seed.seedId &&
          admitted.seed_fingerprint === seed.fingerprint &&
          admitted.model_version === seed.replayBinding.modelVersion &&
          admitted.replay_binding === canonicalSerialize(seed.replayBinding)
        ) {
          mapping = admittedRoster(seed);
        }
      }
    }
    const resolved = mapping;
    function financial(
      account: Readonly<Record<string, unknown>>,
      scope: EconomicReadScope,
    ): EconomicReadDisclosure {
      if (!resolved) return deny('ADMITTED_SOURCE_UNAVAILABLE');
      if (
        scope.worldId !== input.worldId ||
        account.worldId !== input.worldId ||
        scope.countryId !== account.countryId
      )
        return deny('SCOPE_NOT_AUTHORIZED');
      if (scope.classification !== 'OFFICE_PRIVATE')
        return deny('SUMMARY_SOURCE_UNAVAILABLE');
      const owners = resolved.get(scope.countryId);
      if (!owners) return deny('OWNER_MAPPING_UNAVAILABLE');
      if (account.ownerId === owners.treasury && scope.officeId === 'FINANCE')
        return Object.freeze({
          status: 'AUTHORIZED',
          sourceUnits: Object.freeze([
            'CONSTITUTION-U0381',
            'CONSTITUTION-U0382',
            'FINANCE-U0831',
          ]),
        });
      if (
        account.ownerId === owners.centralBank &&
        scope.officeId === 'CENTRAL_BANK'
      )
        return Object.freeze({
          status: 'AUTHORIZED',
          sourceUnits: Object.freeze([
            'CONSTITUTION-U0381',
            'CONSTITUTION-U0382',
            'CENTRAL_BANK-U0585',
            'CENTRAL_BANK-U0586',
          ]),
        });
      return deny('OWNER_MAPPING_UNAVAILABLE');
    }
    return Object.freeze({
      ...input,
      financial,
      // No governing source binds raw stock-account rights to an Office. Never
      // infer Trade/Industry visibility from commodity, holder or capability.
      inventory: () => deny('OWNER_MAPPING_UNAVAILABLE'),
      summary: (scope: EconomicReadScope): EconomicReadVisibilitySummary =>
        Object.freeze({
          schemaVersion: ECONOMIC_READ_VISIBILITY_SCHEMA,
          financialDetail:
            resolved?.has(scope.countryId) &&
            scope.worldId === input.worldId &&
            scope.classification === 'OFFICE_PRIVATE' &&
            ['FINANCE', 'CENTRAL_BANK'].includes(scope.officeId ?? '')
              ? 'AUTHORIZED_FILTERED'
              : 'NOT_AUTHORIZED',
          inventoryDetail: 'NOT_AUTHORIZED',
          countrySummary: 'NOT_AUTHORIZED',
        }),
    });
  }
}

function admittedRoster(
  seed: OpeningSeed,
): ReadonlyMap<string, OwnerMapping> | null {
  try {
    const candidates = seed.sources.filter(
      (source) =>
        source.sourceKind === 'AUTHORITATIVE_DATASET' &&
        source.locator ===
          'artifacts/world-balanced-candidate-v1/CHECKSUMS.json' &&
        source.sourceVersion === CHECKSUMS,
    );
    if (candidates.length !== 1) return null;
    const source = candidates[0]!;
    const payload = object(JSON.parse(source.canonicalPayload));
    if (
      payload.mappingSha256 !== FROZEN_OPENING_MAPPING_SHA256 ||
      payload.financeSha256 !== FINANCE_SHA
    )
      return null;
    const decision = parseOpeningEconomicDecision(payload.decision);
    // The parser explicitly returns UNTRUSTED. Only the exact immutable SQL
    // admission checked above lets us consume this seed's role evidence.
    if (
      decision.fingerprint !== payload.decisionFingerprint ||
      !decision.body.ownerAdoption ||
      decision.body.effectiveScope.worldId !== seed.worldId ||
      decision.body.effectiveScope.modelVersion !==
        seed.replayBinding.modelVersion
    )
      return null;
    const assembly = object(payload.assembly);
    if (
      assembly.schemaVersion !== 'opening-canonical-seed-assembly-v1' ||
      assembly.seedId !== seed.seedId ||
      assembly.sourceId !== source.sourceId ||
      assembly.orchestratorVersion !==
        decision.body.effectiveScope.orchestratorVersion ||
      canonicalSerialize(assembly.replayBinding) !==
        canonicalSerialize(seed.replayBinding)
    )
      return null;
    const countries = list(assembly.countries);
    if (countries.length !== decision.body.countries.length) return null;
    const mapping = new Map<string, OwnerMapping>();
    const owners = new Set<string>();
    for (const value of countries) {
      const country = object(value);
      const cid = countryId(String(country.countryId));
      const allocation = decision.body.countries.find(
        (c) => c.countryId === cid,
      );
      const roster = object(country.roster);
      const treasury = legalEntityId(String(roster.government));
      const centralBank = legalEntityId(String(roster.centralBank));
      const provenance = decision.body.provenance.find(
        (p) => p.ref === country.adoptionRef,
      );
      if (
        !allocation?.legalEntities ||
        allocation.legalEntities.treasury !== treasury ||
        allocation.legalEntities.centralBank !== centralBank ||
        allocation.legalEntities.bank !== roster.bank ||
        mapping.has(cid) ||
        treasury === centralBank ||
        owners.has(treasury) ||
        owners.has(centralBank) ||
        !provenance ||
        provenance.kind !== 'DOMAIN_ADOPTED' ||
        provenance.ownerRecordRef !== decision.body.ownerAdoption.reference ||
        provenance.value !==
          openingCountrySeedAssemblyFingerprint(
            assembly as unknown as OpeningCanonicalSeedAssembly,
            country as unknown as OpeningCountrySeedAssembly,
          )
      )
        return null;
      // Role evidence and account facts must be the same admitted assembly,
      // rather than unrelated metadata placed alongside another seed.
      const batch = object(country.financialBatch);
      const actualBatches = seed.financialBatches.filter(
        (b) => b.batchId === batch.batchId && b.sourceId === source.sourceId,
      );
      // Core sorts opening legs; the source assembly retains original order.
      // Compare all facts after ordering, omitting no owner/account fields.
      const sourceLegs = list(batch.legs)
        .map(object)
        .sort((a, b) =>
          String(a.legId) < String(b.legId)
            ? -1
            : String(a.legId) > String(b.legId)
              ? 1
              : 0,
        );
      if (
        actualBatches.length !== 1 ||
        canonicalSerialize({
          batchId: actualBatches[0]!.batchId,
          settlementCurrency: actualBatches[0]!.settlementCurrency,
          legs: actualBatches[0]!.legs,
        }) !== canonicalSerialize({ ...batch, legs: sourceLegs })
      )
        return null;
      if (
        actualBatches[0]!.legs.some(
          (l) =>
            l.account.countryId !== cid || l.account.worldId !== seed.worldId,
        )
      )
        return null;
      mapping.set(cid, Object.freeze({ treasury, centralBank }));
      owners.add(treasury);
      owners.add(centralBank);
    }
    return mapping;
  } catch {
    // Unsupported/ambiguous role source cannot grant disclosure. Never fallback
    // to a ledger class, owner string prefix, current capability or local labels.
    return null;
  }
}
