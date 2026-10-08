import { createHash } from 'node:crypto';
import {
  AUTHORITATIVE_FINANCIAL_POSITION_SCHEMA,
  type AuthoritativeFinancialPosition,
  DOMAIN_ERROR_CODES,
  DomainError,
  Money,
  Quantity,
  canonicalSerialize,
  createAuthoritativeTransition,
  createFinalCommandReceipt,
  parseAuthoritativeEvent,
  SimTime,
  countryId,
  officeId,
  workerId,
  type CountryId,
  type EconomicReadScope,
  type OfficeId,
  type WorldWriterCommitAssertion,
  type DecisionResultHead,
} from '@econmind/core';
import {
  projectCountryDecisionResultSummary,
  projectOfficeDecisionResults,
  validateCommittedDecisionLineage,
  type CommittedOfficeDecisionTransition,
} from './office-decision-result-projector.js';

import { DurableV08LedgerLineageReader } from '../persistence/durable-v08-ledger-lineage-reader.js';
import type { SqlDatabase, SqlExecutor } from '../persistence/sql-database.js';
import {
  SqlEconomicReadVisibilitySource,
  type EconomicReadVisibilitySnapshot,
} from './economic-read-visibility-source.js';
import {
  countryReadProjectionScopeKey,
  officePrivateReadProjectionScopeKey,
} from './current-authorization-entitlement-publisher.js';
import { WORLD_READ_PROJECTION_SCHEMA_VERSION } from './world-read-projection-publisher.js';

const RFC3339_MILLISECONDS =
  /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.[0-9]{3}Z$/u;
const NON_NEGATIVE_INTEGER = /^(?:0|[1-9]\d*)$/u;
const MAX_READ_PROJECTION_PAYLOAD_BYTES = 1_000_000;

type ActivityProjectionClassification = 'COUNTRY' | 'OFFICE_PRIVATE';

export const WORLD_ACTIVITY_PROJECTION_SCHEMA_VERSION =
  'world-activity-projection-v1' as const;

export interface AuthoritativeActivityProjectionPublicationResult {
  readonly countryProjections: number;
  readonly eventSequence: string;
  readonly officePrivateProjections: number;
  readonly worldVersion: string;
}

interface GuardRow {
  readonly event_sequence: unknown;
  readonly world_version: unknown;
}

interface CurrentAuthorizationRow {
  readonly country_id: unknown;
  readonly office_id: unknown;
}

interface EventActivityRow {
  readonly country_id: unknown;
  readonly event_count: unknown;
  readonly last_event_sequence: unknown;
  readonly last_event_world_version: unknown;
  readonly office_id: unknown;
}

interface CountRow {
  readonly count: unknown;
}

interface CanonicalPostingRow {
  readonly canonical_payload: unknown;
  readonly world_version_after: unknown;
}

interface CountryOfficeScope {
  readonly countryId: CountryId;
  readonly officeId: OfficeId;
}

interface ActivitySummary {
  readonly authoritativeEventCount: string;
  readonly lastAuthoritativeEventSequence: string;
  readonly lastAuthoritativeEventWorldVersion: string;
}

interface FinancialPosition {
  readonly accountClass: string;
  readonly accountId: string;
  readonly currency: string;
  readonly netDebitBalance: string;
}

interface InventoryPosition {
  readonly bucket: 'AVAILABLE' | 'RESERVED' | 'IN_TRANSIT';
  readonly commodityId: string;
  readonly quantity: string;
  readonly unit: string;
}

interface LedgerEconomicSummary {
  readonly financialPositions: readonly FinancialPosition[];
  readonly inventoryPositions: readonly InventoryPosition[];
}

interface FinancialPositionAccumulator {
  readonly accountIdentity: string;
  readonly accountClass: string;
  readonly accountId: string;
  readonly currency: string;
  readonly value: Money;
}

interface InventoryPositionAccumulator {
  readonly bucket: 'AVAILABLE' | 'RESERVED' | 'IN_TRANSIT';
  readonly commodityId: string;
  readonly unit: string;
  readonly value: Quantity;
}

interface LedgerEconomicAccumulator {
  readonly financial: Map<string, FinancialPositionAccumulator>;
  readonly inventory: Map<string, InventoryPositionAccumulator>;
}

interface PreparedProjection {
  readonly canonicalPayload: string;
  readonly classification: ActivityProjectionClassification;
  readonly scopeKey: string;
}

function invalid(message: string): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
    message,
  );
}

function timestamp(value: string): string {
  if (!RFC3339_MILLISECONDS.test(value)) {
    invalid(
      'Activity projection publication time must be canonical RFC3339 milliseconds',
    );
  }
  return value;
}

function databaseInteger(value: unknown, label: string): string {
  const rendered =
    typeof value === 'number' || typeof value === 'bigint'
      ? String(value)
      : value;
  if (typeof rendered !== 'string' || !NON_NEGATIVE_INTEGER.test(rendered)) {
    invalid(`${label} must be a canonical non-negative integer`);
  }
  return rendered;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    invalid(`${label} must be a non-empty string`);
  }
  return value;
}

function object(
  value: unknown,
  label: string,
): Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    invalid(`${label} must be an object`);
  }
  return value as Readonly<Record<string, unknown>>;
}

function array(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) invalid(`${label} must be an array`);
  return value;
}

function canonicalPostingPayload(
  value: unknown,
  label: string,
): Readonly<Record<string, unknown>> {
  const raw = requiredString(value, `${label} canonical payload`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    invalid(`${label} canonical payload must be valid JSON`);
  }
  if (canonicalSerialize(parsed) !== raw) {
    invalid(`${label} canonical payload is not canonical`);
  }
  return object(parsed, `${label} canonical payload`);
}

function canonicalWorldId(
  payload: Readonly<Record<string, unknown>>,
  expectedWorldId: string,
  label: string,
): void {
  if (payload.worldId !== expectedWorldId) {
    invalid(`${label} payload World ID does not match the publication World`);
  }
}

function canonicalWorldVersion(
  payload: Readonly<Record<string, unknown>>,
  rowValue: unknown,
  label: string,
): string {
  const rowVersion = databaseInteger(
    rowValue,
    `${label} database WorldVersion`,
  );
  const payloadVersion = databaseInteger(
    payload.worldVersionAfter,
    `${label} payload WorldVersion`,
  );
  if (payloadVersion !== rowVersion) {
    invalid(`${label} payload WorldVersion does not match its durable row`);
  }
  return rowVersion;
}

function exactKey(parts: readonly string[]): string {
  return canonicalSerialize(parts);
}

function emptyLedgerEconomicSummary(): LedgerEconomicSummary {
  return Object.freeze({
    financialPositions: Object.freeze([]),
    inventoryPositions: Object.freeze([]),
  });
}

function ledgerAccumulator(
  values: Map<string, LedgerEconomicAccumulator>,
  country: string,
): LedgerEconomicAccumulator {
  const existing = values.get(country);
  if (existing !== undefined) return existing;
  const created: LedgerEconomicAccumulator = {
    financial: new Map(),
    inventory: new Map(),
  };
  values.set(country, created);
  return created;
}

function inventoryBucket(
  value: unknown,
): 'AVAILABLE' | 'RESERVED' | 'IN_TRANSIT' {
  if (value === 'AVAILABLE' || value === 'RESERVED' || value === 'IN_TRANSIT') {
    return value;
  }
  invalid('Inventory posting account has an unsupported bucket');
}

function financialAccountClass(value: unknown): string {
  const rendered = requiredString(value, 'Financial posting account class');
  if (!/^[A-Z][A-Z0-9_]{0,63}$/u.test(rendered)) {
    invalid('Financial posting account class is not canonical');
  }
  return rendered;
}

function finalizeLedgerEconomicSummary(
  value: LedgerEconomicAccumulator,
): LedgerEconomicSummary {
  const financialPositions = [...value.financial.values()]
    .filter((position) => !position.value.amount.isZero())
    .map((position) =>
      Object.freeze({
        accountClass: position.accountClass,
        accountId: position.accountId,
        currency: position.currency,
        netDebitBalance: position.value.toCanonicalValue().amount,
      }),
    )
    .sort((left, right) =>
      exactKey([left.accountId, left.currency]).localeCompare(
        exactKey([right.accountId, right.currency]),
      ),
    );
  const inventoryPositions = [...value.inventory.values()]
    .filter((position) => !position.value.amount.isZero())
    .map((position) =>
      Object.freeze({
        bucket: position.bucket,
        commodityId: position.commodityId,
        quantity: position.value.toCanonicalValue().amount,
        unit: position.unit,
      }),
    )
    .sort((left, right) =>
      exactKey([left.commodityId, left.unit, left.bucket]).localeCompare(
        exactKey([right.commodityId, right.unit, right.bucket]),
      ),
    );
  return Object.freeze({
    financialPositions: Object.freeze(financialPositions),
    inventoryPositions: Object.freeze(inventoryPositions),
  });
}

function nullableOfficeId(value: unknown): OfficeId | null {
  if (value === null) return null;
  try {
    return officeId(requiredString(value, 'office_id'));
  } catch {
    invalid('Authoritative event source has a malformed office identifier');
  }
}

function parseCountryOfficeScope(
  row: CurrentAuthorizationRow,
): CountryOfficeScope {
  try {
    return Object.freeze({
      countryId: countryId(requiredString(row.country_id, 'country_id')),
      officeId: officeId(requiredString(row.office_id, 'office_id')),
    });
  } catch {
    invalid('Current authorization source contains malformed scope evidence');
  }
}

function emptyActivity(): ActivitySummary {
  return Object.freeze({
    authoritativeEventCount: '0',
    lastAuthoritativeEventSequence: '0',
    lastAuthoritativeEventWorldVersion: '0',
  });
}

function parseActivity(row: EventActivityRow): ActivitySummary {
  return Object.freeze({
    authoritativeEventCount: databaseInteger(
      row.event_count,
      'authoritative event count',
    ),
    lastAuthoritativeEventSequence: databaseInteger(
      row.last_event_sequence,
      'last authoritative event sequence',
    ),
    lastAuthoritativeEventWorldVersion: databaseInteger(
      row.last_event_world_version,
      'last authoritative event WorldVersion',
    ),
  });
}

function readScope(
  world: string,
  scope: CountryOfficeScope,
): EconomicReadScope {
  return Object.freeze({
    worldId: world,
    ...scope,
    classification: 'OFFICE_PRIVATE',
  });
}

function countryKey(country: CountryId): string {
  return country;
}

function officeKey(input: CountryOfficeScope): string {
  return `${input.countryId}:${input.officeId}`;
}

function prepareProjection(input: {
  readonly classification: ActivityProjectionClassification;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly scopeKey: string;
}): PreparedProjection {
  const canonicalPayload = canonicalSerialize(input.payload);
  if (
    Buffer.byteLength(canonicalPayload, 'utf8') >
    MAX_READ_PROJECTION_PAYLOAD_BYTES
  ) {
    invalid('Activity projection payload exceeds its one MiB limit');
  }
  return Object.freeze({
    canonicalPayload,
    classification: input.classification,
    scopeKey: input.scopeKey,
  });
}

/**
 * Worker-owned V10.1 source-to-projection boundary. It derives compact,
 * labelled activity summaries from append-only authoritative Events joined to
 * their canonical Commands, plus exact financial and inventory positions from
 * the immutable Posting facts. It never infers economic values from counts.
 */
export class AuthoritativeActivityReadProjectionPublisher {
  readonly #database: SqlDatabase;
  readonly #visibility: SqlEconomicReadVisibilitySource;
  readonly #lineage: DurableV08LedgerLineageReader;
  readonly #workerId: ReturnType<typeof workerId>;

  constructor(input: {
    readonly database: SqlDatabase;
    readonly workerId: string;
  }) {
    this.#database = input.database;
    this.#visibility = new SqlEconomicReadVisibilitySource(input.database);
    this.#lineage = new DurableV08LedgerLineageReader({
      database: input.database,
      sha256Hex: (value) =>
        createHash('sha256').update(value, 'utf8').digest('hex'),
    });
    this.#workerId = workerId(input.workerId);
  }

  async replace(input: {
    readonly assertion: WorldWriterCommitAssertion;
    readonly observedAtReal: string;
  }): Promise<Readonly<AuthoritativeActivityProjectionPublicationResult>> {
    if (input.assertion.holderId !== this.#workerId) {
      invalid(
        'Activity projection assertion holder does not match this Worker',
      );
    }
    const observedAtReal = timestamp(input.observedAtReal);

    return this.#database.transaction(async (transaction) => {
      const watermark = await this.#assertCommitGuard(
        transaction,
        input.assertion,
        observedAtReal,
      );
      const scopes = await this.#readCurrentScopes(
        transaction,
        input.assertion.worldId,
      );
      const activity = await this.#readAuthoritativeActivity(
        transaction,
        input.assertion.worldId,
        watermark,
      );
      const visibility = await this.#visibility.loadFrom(transaction, {
        worldId: input.assertion.worldId,
        ...watermark,
      });
      const economics = await this.#readLedgerEconomics(
        transaction,
        input.assertion.worldId,
        watermark,
        scopes.offices,
        visibility,
      );
      const absolute = await this.#readAuthoritativeFinancialPosition(
        transaction,
        scopes.offices,
        visibility,
      );
      const decisionHead = Object.freeze({
        worldId: input.assertion.worldId,
        ...watermark,
      });
      const decisions = await this.#readCommittedDecisions(
        transaction,
        decisionHead,
      );
      const projections = this.#deriveProjections(
        scopes,
        activity,
        economics,
        visibility,
        absolute,
        decisions,
        decisionHead,
      );

      await transaction.query(
        `delete from world_v2.read_projection
          where world_id = $1
            and classification in ('COUNTRY', 'OFFICE_PRIVATE')`,
        [input.assertion.worldId],
      );
      for (const projection of projections) {
        await transaction.query(
          `insert into world_v2.read_projection
             (world_id, classification, scope_key, schema_version, world_version,
              event_sequence, payload, generated_at)
           values ($1, $2, $3, $4, $5::bigint, $6::bigint, $7::jsonb, $8::timestamptz)
           on conflict (world_id, classification, scope_key) do update
             set schema_version = excluded.schema_version,
                 world_version = excluded.world_version,
                 event_sequence = excluded.event_sequence,
                 payload = excluded.payload,
                 generated_at = excluded.generated_at`,
          [
            input.assertion.worldId,
            projection.classification,
            projection.scopeKey,
            WORLD_READ_PROJECTION_SCHEMA_VERSION,
            watermark.worldVersion,
            watermark.eventSequence,
            projection.canonicalPayload,
            observedAtReal,
          ],
        );
      }
      const verification = await transaction.query<CountRow>(
        `select count(*) as count
           from world_v2.read_projection
          where world_id = $1
            and classification in ('COUNTRY', 'OFFICE_PRIVATE')
            and (world_version <> $2::bigint or event_sequence <> $3::bigint)`,
        [
          input.assertion.worldId,
          watermark.worldVersion,
          watermark.eventSequence,
        ],
      );
      if (
        databaseInteger(
          verification.rows[0]?.count,
          'activity watermark mismatch count',
        ) !== '0'
      ) {
        invalid(
          'Activity projection publication produced a non-head watermark',
        );
      }

      return Object.freeze({
        countryProjections: projections.filter(
          (projection) => projection.classification === 'COUNTRY',
        ).length,
        eventSequence: watermark.eventSequence,
        officePrivateProjections: projections.filter(
          (projection) => projection.classification === 'OFFICE_PRIVATE',
        ).length,
        worldVersion: watermark.worldVersion,
      });
    });
  }

  async #assertCommitGuard(
    transaction: SqlExecutor,
    assertion: WorldWriterCommitAssertion,
    observedAtReal: string,
  ): Promise<Readonly<{ eventSequence: string; worldVersion: string }>> {
    const result = await transaction.query<GuardRow>(
      `select world_version, event_sequence
         from world_v2.assert_world_writer_commit_guard($1, $2, $3, $4, $5)`,
      [
        assertion.worldId,
        assertion.holderId,
        assertion.fencingToken,
        assertion.expectedWorldVersion,
        observedAtReal,
      ],
    );
    const worldVersion = databaseInteger(
      result.rows[0]?.world_version,
      'guard WorldVersion',
    );
    if (worldVersion !== assertion.expectedWorldVersion) {
      invalid('Activity projection guard returned a different WorldVersion');
    }
    return Object.freeze({
      eventSequence: databaseInteger(
        result.rows[0]?.event_sequence,
        'guard Event sequence',
      ),
      worldVersion,
    });
  }

  async #readCurrentScopes(
    transaction: SqlExecutor,
    worldId: string,
  ): Promise<
    Readonly<{
      countries: readonly CountryId[];
      offices: readonly CountryOfficeScope[];
    }>
  > {
    const result = await transaction.query<CurrentAuthorizationRow>(
      `select country_id, office_id
         from world_v2.current_commit_authorization
        where world_id = $1
          and active
        order by country_id, office_id, auth_subject, capability
        for share`,
      [worldId],
    );
    const countries = new Map<string, CountryId>();
    const offices = new Map<string, CountryOfficeScope>();
    for (const row of result.rows) {
      const scope = parseCountryOfficeScope(row);
      countries.set(countryKey(scope.countryId), scope.countryId);
      offices.set(officeKey(scope), scope);
    }
    return Object.freeze({
      countries: Object.freeze([...countries.values()].sort()),
      offices: Object.freeze(
        [...offices.values()].sort((left, right) =>
          officeKey(left).localeCompare(officeKey(right)),
        ),
      ),
    });
  }

  async #readAuthoritativeActivity(
    transaction: SqlExecutor,
    worldId: string,
    watermark: Readonly<{ eventSequence: string; worldVersion: string }>,
  ): Promise<
    Readonly<{
      countries: ReadonlyMap<string, ActivitySummary>;
      offices: ReadonlyMap<string, ActivitySummary>;
    }>
  > {
    const result = await transaction.query<EventActivityRow>(
      `select command.country_id,
              command.office_id,
              count(event.event_id)::text as event_count,
              max(event.event_sequence)::text as last_event_sequence,
              max(event.world_version)::text as last_event_world_version
         from world_v2.authoritative_event as event
         inner join world_v2.command_submission as command
           on command.world_id = event.world_id
          and command.command_id = event.causation_command_id
        where event.world_id = $1
        group by command.country_id, command.office_id
        order by command.country_id, command.office_id`,
      [worldId],
    );
    const countries = new Map<string, ActivitySummary>();
    const offices = new Map<string, ActivitySummary>();
    for (const row of result.rows) {
      let country: CountryId;
      try {
        country = countryId(requiredString(row.country_id, 'country_id'));
      } catch {
        invalid(
          'Authoritative event source has a malformed country identifier',
        );
      }
      const summary = parseActivity(row);
      if (
        BigInt(summary.lastAuthoritativeEventSequence) >
          BigInt(watermark.eventSequence) ||
        BigInt(summary.lastAuthoritativeEventWorldVersion) >
          BigInt(watermark.worldVersion)
      ) {
        invalid(
          'Authoritative event source is ahead of the guarded World watermark',
        );
      }
      const existingCountry = countries.get(countryKey(country));
      if (existingCountry === undefined) {
        countries.set(countryKey(country), summary);
      } else {
        countries.set(
          countryKey(country),
          this.#combineActivity(existingCountry, summary),
        );
      }
      const office = nullableOfficeId(row.office_id);
      if (office !== null) {
        const scope = Object.freeze({ countryId: country, officeId: office });
        offices.set(officeKey(scope), summary);
      }
    }
    return Object.freeze({ countries, offices });
  }

  async #readLedgerEconomics(
    transaction: SqlExecutor,
    worldId: string,
    watermark: Readonly<{ eventSequence: string; worldVersion: string }>,
    scopes: readonly CountryOfficeScope[],
    visibility: EconomicReadVisibilitySnapshot,
  ): Promise<ReadonlyMap<string, LedgerEconomicSummary>> {
    const [inventory, financial] = await Promise.all([
      transaction.query<CanonicalPostingRow>(
        `select canonical_payload, world_version_after
           from world_v2.inventory_posting
          where world_id = $1
            and world_version_after <= $2::bigint
          order by world_version_after, posting_id`,
        [worldId, watermark.worldVersion],
      ),
      transaction.query<CanonicalPostingRow>(
        `select canonical_payload, world_version_after
           from world_v2.financial_posting_batch
          where world_id = $1
            and world_version_after <= $2::bigint
          order by world_version_after, batch_id`,
        [worldId, watermark.worldVersion],
      ),
    ]);
    const countries = new Map<string, LedgerEconomicAccumulator>();
    for (const row of inventory.rows) {
      this.#accumulateInventoryPosting(
        countries,
        row,
        worldId,
        watermark.worldVersion,
        scopes,
        visibility,
      );
    }
    for (const row of financial.rows) {
      this.#accumulateFinancialPosting(
        countries,
        row,
        worldId,
        watermark.worldVersion,
        scopes,
        visibility,
      );
    }
    return new Map(
      [...countries.entries()].map(([country, accumulator]) =>
        Object.freeze([country, finalizeLedgerEconomicSummary(accumulator)]),
      ),
    );
  }

  #accumulateInventoryPosting(
    countries: Map<string, LedgerEconomicAccumulator>,
    row: CanonicalPostingRow,
    worldId: string,
    watermarkWorldVersion: string,
    scopes: readonly CountryOfficeScope[],
    visibility: EconomicReadVisibilitySnapshot,
  ): void {
    const payload = canonicalPostingPayload(
      row.canonical_payload,
      'Inventory posting',
    );
    if (payload.schemaVersion !== 'inventory-posting-v1') {
      invalid('Inventory posting payload has an unsupported schema version');
    }
    canonicalWorldId(payload, worldId, 'Inventory posting');
    const version = canonicalWorldVersion(
      payload,
      row.world_version_after,
      'Inventory posting',
    );
    if (BigInt(version) > BigInt(watermarkWorldVersion)) {
      invalid(
        'Inventory posting source is ahead of the guarded World watermark',
      );
    }
    for (const entry of array(payload.entries, 'Inventory posting entries')) {
      const entryValue = object(entry, 'Inventory posting entry');
      const account = object(entryValue.account, 'Inventory posting account');
      const delta = object(entryValue.delta, 'Inventory posting delta');
      let country: CountryId;
      try {
        country = countryId(
          requiredString(account.countryId, 'Inventory posting country ID'),
        );
      } catch {
        invalid('Inventory posting account has a malformed country identifier');
      }
      const commodityId = requiredString(
        account.commodityId,
        'Inventory posting commodity ID',
      );
      if (account.worldId !== worldId) {
        invalid('Inventory posting account belongs to a different World');
      }
      const unit = requiredString(
        account.unit,
        'Inventory posting account unit',
      );
      const bucket = inventoryBucket(account.bucket);
      if (delta.unit !== unit) {
        invalid('Inventory posting delta unit does not match its account');
      }
      let quantity: Quantity;
      try {
        quantity = Quantity.from(
          requiredString(delta.amount, 'Inventory posting delta amount'),
          unit,
        );
      } catch {
        invalid('Inventory posting delta is not an exact canonical quantity');
      }
      // Selection precedes aggregation; private account details cannot leak
      // through an aggregate built from all country accounts.
      for (const scope of scopes) {
        if (scope.countryId !== country) continue;
        if (
          visibility.inventory(account, readScope(worldId, scope)).status !==
          'AUTHORIZED'
        )
          continue;
        const accumulator = ledgerAccumulator(countries, officeKey(scope));
        const key = exactKey([commodityId, unit, bucket]);
        const prior = accumulator.inventory.get(key);
        accumulator.inventory.set(
          key,
          Object.freeze({
            bucket,
            commodityId,
            unit,
            value: prior === undefined ? quantity : prior.value.add(quantity),
          }),
        );
      }
    }
  }

  #accumulateFinancialPosting(
    countries: Map<string, LedgerEconomicAccumulator>,
    row: CanonicalPostingRow,
    worldId: string,
    watermarkWorldVersion: string,
    scopes: readonly CountryOfficeScope[],
    visibility: EconomicReadVisibilitySnapshot,
  ): void {
    const payload = canonicalPostingPayload(
      row.canonical_payload,
      'Financial posting',
    );
    if (payload.schemaVersion !== 'financial-posting-v1') {
      invalid('Financial posting payload has an unsupported schema version');
    }
    canonicalWorldId(payload, worldId, 'Financial posting');
    const version = canonicalWorldVersion(
      payload,
      row.world_version_after,
      'Financial posting',
    );
    if (BigInt(version) > BigInt(watermarkWorldVersion)) {
      invalid(
        'Financial posting source is ahead of the guarded World watermark',
      );
    }
    for (const leg of array(payload.legs, 'Financial posting legs')) {
      const legValue = object(leg, 'Financial posting leg');
      const account = object(legValue.account, 'Financial posting account');
      const amount = object(legValue.amount, 'Financial posting amount');
      let country: CountryId;
      try {
        country = countryId(
          requiredString(account.countryId, 'Financial posting country ID'),
        );
      } catch {
        invalid('Financial posting account has a malformed country identifier');
      }
      const accountId = requiredString(
        account.accountId,
        'Financial posting account ID',
      );
      const accountClass = financialAccountClass(account.accountClass);
      const currency = requiredString(
        account.currency,
        'Financial posting account currency',
      );
      if (account.worldId !== worldId) {
        invalid('Financial posting account belongs to a different World');
      }
      if (amount.currency !== currency) {
        invalid('Financial posting amount currency does not match its account');
      }
      let value: Money;
      try {
        value = Money.from(
          requiredString(amount.amount, 'Financial posting amount'),
          currency,
        );
      } catch {
        invalid('Financial posting amount is not exact canonical money');
      }
      const direction = legValue.direction;
      if (direction !== 'DEBIT' && direction !== 'CREDIT') {
        invalid('Financial posting leg has an unsupported direction');
      }
      for (const scope of scopes) {
        if (scope.countryId !== country) continue;
        if (
          visibility.financial(account, readScope(worldId, scope)).status !==
          'AUTHORIZED'
        )
          continue;
        const accumulator = ledgerAccumulator(countries, officeKey(scope));
        const key = exactKey([accountId, currency]);
        const prior = accumulator.financial.get(key);
        const accountIdentity = canonicalSerialize(account);
        if (prior !== undefined && prior.accountIdentity !== accountIdentity)
          invalid('Financial movement redefines an account identity');
        const balance =
          prior === undefined ? Money.from('0', currency) : prior.value;
        accumulator.financial.set(
          key,
          Object.freeze({
            accountIdentity,
            accountClass,
            accountId,
            currency,
            value:
              direction === 'DEBIT'
                ? balance.add(value)
                : balance.subtract(value),
          }),
        );
      }
    }
  }

  /** Uses the existing joint ledger authority; no second balance arithmetic. */
  async #readAuthoritativeFinancialPosition(
    transaction: SqlExecutor,
    scopes: readonly CountryOfficeScope[],
    visibility: EconomicReadVisibilitySnapshot,
  ): Promise<ReadonlyMap<string, AuthoritativeFinancialPosition>> {
    const binding = visibility.openingBinding;
    const allowed = scopes.filter(
      (scope) =>
        visibility.summary(readScope(visibility.worldId, scope))
          .financialDetail === 'AUTHORIZED_FILTERED',
    );
    if (binding === null || allowed.length === 0) return new Map();
    const replay = await this.#lineage.rebuildFrom(
      transaction,
      visibility.worldId,
    );
    if (
      replay.headWorldVersion !== visibility.worldVersion ||
      replay.headEventSequence !== visibility.eventSequence ||
      replay.ledgers.seedId !== binding.seedId ||
      replay.ledgers.seedFingerprint !== binding.seedFingerprint ||
      replay.ledgers.financial.worldId !== visibility.worldId ||
      replay.ledgers.financial.worldVersion !== visibility.worldVersion
    )
      invalid(
        'Authoritative financial position differs from its admitted held source/head',
      );
    return new Map(
      allowed.map((scope) => {
        const sourceUnits = new Set<string>();
        const positions = replay.ledgers.financial.positions.flatMap(
          (position) => {
            const disclosure = visibility.financial(
              position.account as unknown as Record<string, unknown>,
              readScope(visibility.worldId, scope),
            );
            if (disclosure.status !== 'AUTHORIZED') return [];
            disclosure.sourceUnits.forEach((unit) => sourceUnits.add(unit));
            return [
              Object.freeze({
                accountId: position.account.accountId,
                accountClass: position.account.accountClass,
                currency: position.account.currency,
                netDebitBalance:
                  position.netDebitBalance.toCanonicalValue().amount,
              }),
            ];
          },
        );
        return [
          officeKey(scope),
          Object.freeze({
            schemaVersion: AUTHORITATIVE_FINANCIAL_POSITION_SCHEMA,
            status: 'AUTHORIZED_FILTERED' as const,
            semantics: 'OPENING_PLUS_POSTING_LINEAGE' as const,
            positionCoverage: 'NONZERO_LEDGER_POSITIONS' as const,
            opening: binding,
            sourceHead: Object.freeze({
              worldVersion: replay.headWorldVersion,
              eventSequence: replay.headEventSequence,
            }),
            sourceUnits: Object.freeze([...sourceUnits].sort()),
            positions: Object.freeze(positions),
          }),
        ] as const;
      }),
    );
  }

  /** The existing replace transaction is the only writer. No cache or materialization source. */
  async #readCommittedDecisions(
    transaction: SqlExecutor,
    head: DecisionResultHead,
  ): Promise<readonly CommittedOfficeDecisionTransition[]> {
    const result = await transaction.query<{
      event_row: unknown;
      receipt_row: unknown;
    }>(
      `select to_jsonb(event) || jsonb_build_object(
                'event_sequence', event.event_sequence::text,
                'world_version', event.world_version::text,
                'sim_time', event.sim_time::text) as event_row,
              to_jsonb(receipt) || jsonb_build_object(
                'world_version_before', receipt.world_version_before::text,
                'world_version_after', receipt.world_version_after::text,
                'sim_time', receipt.sim_time::text) as receipt_row
         from world_v2.authoritative_event as event
         left join world_v2.command_receipt as receipt
           on receipt.world_id = event.world_id and receipt.command_id = event.causation_command_id
        where event.world_id = $1
        order by event.event_sequence`,
      [head.worldId],
    );
    const sha256Hex = (value: string) =>
      createHash('sha256').update(value, 'utf8').digest('hex');
    const groups = new Map<
      string,
      {
        receipt: Readonly<Record<string, unknown>>;
        events: ReturnType<typeof parseAuthoritativeEvent>[];
      }
    >();
    const real = (value: unknown) => {
      const parsed =
        value instanceof Date
          ? value
          : new Date(requiredString(value, 'durable timestamp'));
      if (!Number.isFinite(parsed.getTime()))
        invalid('Decision durable timestamp is invalid');
      return parsed.toISOString();
    };
    for (const raw of result.rows) {
      const row = object(raw.event_row, 'decision Event'),
        receipt = object(raw.receipt_row, 'decision receipt');
      const event = parseAuthoritativeEvent(
        {
          schemaVersion: row.schema_version,
          worldId: row.world_id,
          eventId: row.event_id,
          eventType: row.event_type,
          causationCommandId: row.causation_command_id,
          correlationId: row.correlation_id,
          worldVersion: databaseInteger(row.world_version, 'decision version'),
          sequence: databaseInteger(row.event_sequence, 'decision sequence'),
          simTime: databaseInteger(row.sim_time, 'decision SimTime'),
          recordedAtReal: real(row.recorded_at_real),
          correctsEventId: row.corrects_event_id,
          payload: canonicalPostingPayload(
            row.canonical_payload,
            'decision Event',
          ),
        },
        sha256Hex,
      );
      if (
        event.fingerprint !== row.event_fingerprint ||
        event.payloadHash !== row.payload_sha256
      )
        invalid('Durable decision Event hashes differ');
      const existing = groups.get(event.causationCommandId);
      if (
        existing &&
        canonicalSerialize(existing.receipt) !== canonicalSerialize(receipt)
      )
        invalid('Decision receipt differs within a transition');
      if (existing) existing.events.push(event);
      else groups.set(event.causationCommandId, { receipt, events: [event] });
    }
    const transitions: CommittedOfficeDecisionTransition[] = [];
    for (const [commandId, group] of groups) {
      const command = await this.#lineage.readCommandFrom(
        transaction,
        head.worldId,
        commandId,
      );
      const row = group.receipt;
      const transition = createAuthoritativeTransition({
        command,
        events: group.events,
        worldVersionBefore: databaseInteger(
          row.world_version_before,
          'decision receipt before',
        ),
        worldVersionAfter: databaseInteger(
          row.world_version_after,
          'decision receipt after',
        ),
      });
      const receipt = createFinalCommandReceipt({
        command,
        transition,
        outcome: 'COMMITTED',
        reasonCode: null,
        simTime: SimTime.fromTicks(
          databaseInteger(row.sim_time, 'decision receipt SimTime'),
        ),
        recordedAtReal: real(row.recorded_at_real),
      });
      if (
        row.world_id !== receipt.worldId ||
        row.command_id !== receipt.commandId ||
        row.schema_version !== receipt.schemaVersion ||
        row.command_fingerprint !== receipt.commandFingerprint ||
        row.idempotency_key !== receipt.idempotencyKey ||
        row.outcome !== receipt.outcome ||
        row.reason_code !== null ||
        row.transition_id !== receipt.transitionId ||
        canonicalSerialize(row.event_ids) !==
          canonicalSerialize(receipt.eventIds)
      )
        invalid('Decision durable receipt differs from canonical transition');
      transitions.push(Object.freeze({ command, transition, receipt }));
    }
    validateCommittedDecisionLineage({
      sourceHead: head,
      transitions,
      sha256Hex,
    });
    return Object.freeze(transitions);
  }

  #combineActivity(
    left: ActivitySummary,
    right: ActivitySummary,
  ): ActivitySummary {
    return Object.freeze({
      authoritativeEventCount: (
        BigInt(left.authoritativeEventCount) +
        BigInt(right.authoritativeEventCount)
      ).toString(),
      lastAuthoritativeEventSequence:
        BigInt(left.lastAuthoritativeEventSequence) >=
        BigInt(right.lastAuthoritativeEventSequence)
          ? left.lastAuthoritativeEventSequence
          : right.lastAuthoritativeEventSequence,
      lastAuthoritativeEventWorldVersion:
        BigInt(left.lastAuthoritativeEventWorldVersion) >=
        BigInt(right.lastAuthoritativeEventWorldVersion)
          ? left.lastAuthoritativeEventWorldVersion
          : right.lastAuthoritativeEventWorldVersion,
    });
  }

  #deriveProjections(
    scopes: Readonly<{
      countries: readonly CountryId[];
      offices: readonly CountryOfficeScope[];
    }>,
    activity: Readonly<{
      countries: ReadonlyMap<string, ActivitySummary>;
      offices: ReadonlyMap<string, ActivitySummary>;
    }>,
    economics: ReadonlyMap<string, LedgerEconomicSummary>,
    visibility: EconomicReadVisibilitySnapshot,
    absolute: ReadonlyMap<string, AuthoritativeFinancialPosition>,
    decisions: readonly CommittedOfficeDecisionTransition[],
    decisionHead: DecisionResultHead,
  ): readonly PreparedProjection[] {
    const decisionResults = projectOfficeDecisionResults({
      sourceHead: decisionHead,
      transitions: decisions,
      visibility,
      scopes: scopes.offices,
      sha256Hex: (value) =>
        createHash('sha256').update(value, 'utf8').digest('hex'),
    });
    const countries = scopes.countries.map((country) =>
      prepareProjection({
        classification: 'COUNTRY',
        scopeKey: countryReadProjectionScopeKey(country),
        payload: {
          activity:
            activity.countries.get(countryKey(country)) ?? emptyActivity(),
          countryId: country,
          decisionResults: projectCountryDecisionResultSummary(
            country,
            decisionHead,
          ),
          ledger: {
            ...emptyLedgerEconomicSummary(),
            authoritativeFinancialPosition: {
              schemaVersion: AUTHORITATIVE_FINANCIAL_POSITION_SCHEMA,
              status: 'NOT_AUTHORIZED',
              reason: 'SCOPE_NOT_AUTHORIZED',
            },
            visibility: visibility.summary({
              worldId: visibility.worldId,
              countryId: country,
              classification: 'COUNTRY',
              officeId: null,
            }),
          },
          schemaVersion: WORLD_ACTIVITY_PROJECTION_SCHEMA_VERSION,
        },
      }),
    );
    const offices = scopes.offices.map((scope) =>
      prepareProjection({
        classification: 'OFFICE_PRIVATE',
        scopeKey: officePrivateReadProjectionScopeKey(scope),
        payload: {
          activity: activity.offices.get(officeKey(scope)) ?? emptyActivity(),
          countryId: scope.countryId,
          decisionResult:
            decisionResults.get(
              canonicalSerialize([scope.countryId, scope.officeId]),
            ) ?? null,
          ledger: {
            ...(economics.get(officeKey(scope)) ??
              emptyLedgerEconomicSummary()),
            authoritativeFinancialPosition: absolute.get(officeKey(scope)) ?? {
              schemaVersion: AUTHORITATIVE_FINANCIAL_POSITION_SCHEMA,
              status: 'NOT_AUTHORIZED',
              reason:
                visibility.openingBinding === null
                  ? 'ADMITTED_SOURCE_UNAVAILABLE'
                  : 'SCOPE_NOT_AUTHORIZED',
            },
            visibility: visibility.summary(
              readScope(visibility.worldId, scope),
            ),
          },
          officeId: scope.officeId,
          schemaVersion: WORLD_ACTIVITY_PROJECTION_SCHEMA_VERSION,
        },
      }),
    );
    return Object.freeze([...countries, ...offices]);
  }
}
