import { DOMAIN_ERROR_CODES, DomainError } from '../errors.js';
import { inventoryPostingId } from '../ids.js';
import { Quantity } from '../numeric/quantity.js';
import {
  canonicalHashInput,
  canonicalSerialize,
} from '../serialization/canonical.js';
import {
  canonicalSha256,
  type CanonicalCommand,
  type CanonicalSha256,
  type Sha256Hex,
} from '../commands/command.js';
import {
  bindAuthoritativeTransition,
  type AuthoritativeTransition,
} from '../commands/receipt.js';
import {
  SOCIAL_OFFICE_ACTION_EVENT,
  prepareSocialOfficeOperation,
  type SocialOfficePreparationInputV1,
  type SocialOfficeOutcomeV1,
  type SocialOfficeStateV1,
  type SocialOfficeReadFactsV1,
} from '../commands/social-office-actions.js';
import {
  createInventoryAccount,
  type InventoryLedgerState,
  type InventoryPosting,
  type InventoryPostingEntry,
} from './inventory-ledger.js';
import {
  applyFinancialPostingBatch,
  createFinancialPostingBatch,
  parseFinancialLedgerSnapshot,
  type FinancialLedgerState,
  type FinancialPostingBatch,
} from '../finance/financial-ledger.js';
import {
  authorizeFinancialLedgerState,
  isAuthoritativeFinancialLedgerState,
  isAuthoritativeInventoryLedgerState,
} from '../opening/ledger-authority.js';
import type { InventoryLedgerPosting } from './production-consumption-posting.js';
import {
  rebuildV08LedgersFromLineage,
  type OpeningSeed,
  type V08AuthoritativeLedgerTransition,
} from '../opening/opening-seed.js';
import {
  reduceSocialOfficeEvent,
  validateSocialOfficeState,
} from '../commands/social-office-actions.js';

export const SOCIAL_SERVICE_CONSUMPTION_SCHEMA_VERSION =
  'inventory-social-service-consumption-v1' as const;
export interface SocialServiceConsumptionPostingV1 extends Omit<
  InventoryPosting,
  'schemaVersion' | 'operation'
> {
  readonly schemaVersion: typeof SOCIAL_SERVICE_CONSUMPTION_SCHEMA_VERSION;
  readonly operation: 'SERVICE_CONSUME';
  readonly evidence: {
    readonly clinicId: string;
    readonly careWindowId: string;
    readonly serviceEventId: string;
    readonly ruleVersion: string;
    readonly medicineSourceRecordId: string;
    readonly inventoryBeforeHash: CanonicalSha256;
    readonly financialBeforeHash: CanonicalSha256;
    readonly deliveredCases: string;
    readonly dosesPerCase: string;
    readonly consumption: NonNullable<
      SocialOfficeOutcomeV1['inventoryRequirement']
    >;
    readonly financialRequirement: SocialOfficeOutcomeV1['financialRequirement'];
    readonly financialBatchFingerprints: readonly CanonicalSha256[];
  };
}
type Construction = SocialOfficePreparationInputV1 & {
  readonly postingId: InventoryPosting['postingId'];
  readonly transition: AuthoritativeTransition;
  readonly financialPostingBatches: readonly FinancialPostingBatch[];
  readonly socialOutcome: SocialOfficeOutcomeV1;
};
const originals = new WeakMap<
  object,
  {
    readonly financialBefore: FinancialLedgerState;
    readonly batches: readonly FinancialPostingBatch[];
  }
>();
function invalid(message: string): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.INVENTORY_INPUT_INVALID,
    `SOC-SERVICE: ${message}`,
  );
}
const hash = (v: unknown, digest: Sha256Hex) =>
  canonicalSha256(canonicalHashInput(v), digest);
function frozen<T>(v: T): T {
  if (v && typeof v === 'object') {
    for (const x of Object.values(v)) frozen(x);
    Object.freeze(v);
  }
  return v;
}
function atVersion(
  s: FinancialLedgerState,
  version: string,
): FinancialLedgerState {
  if (!isAuthoritativeFinancialLedgerState(s))
    invalid('Original Financial authority required');
  return authorizeFinancialLedgerState(
    parseFinancialLedgerSnapshot({
      worldId: s.worldId,
      worldVersion: version,
      accounts: s.accounts,
      positions: s.positions,
      appliedBatches: s.appliedBatches,
    }),
  );
}
/** Exact source-derived legs, complete current group and existing financial writer. */
function verifyFinance(
  i: SocialOfficePreparationInputV1,
  transition: AuthoritativeTransition,
  outcome: SocialOfficeOutcomeV1,
  batches: readonly FinancialPostingBatch[],
): FinancialLedgerState {
  const binding = bindAuthoritativeTransition(
      { command: i.command, transition },
      i.sha256Hex,
    ),
    requirement = outcome.financialRequirement;
  const legs = requirement?.legs ?? [];
  if (batches.length !== (legs.length === 0 ? 0 : 1))
    invalid('Missing or additional undeclared current financial batch');
  let expected = i.financialBefore;
  if (
    !isAuthoritativeFinancialLedgerState(expected) ||
    expected.worldId !== i.command.worldId ||
    expected.worldVersion !== binding.worldVersionBefore
  )
    invalid('Same-head real Financial predecessor required');
  if (legs.length !== 0) {
    const actual = batches[0]!;
    if (
      canonicalSerialize(actual.transitionBinding) !==
      canonicalSerialize(binding)
    )
      invalid('Required financial batch belongs to another full transition');
    if (actual.legs.length !== legs.length)
      invalid('Required financial leg group differs');
    const remaining = [...actual.legs];
    for (const required of legs) {
      const account = i.financialBefore.accounts.find(
          (a) => a.accountId === required.account.accountId,
        ),
        a = required.account;
      if (
        a.worldId !== i.command.worldId ||
        a.countryId !== i.command.countryId ||
        (account && canonicalSerialize(account) !== canonicalSerialize(a))
      )
        invalid('Required Financial account tuple differs from original state');
      if (
        !account &&
        !['EXPENSE', 'REVENUE', 'PAYABLE', 'RECEIVABLE'].includes(
          a.accountClass,
        )
      )
        invalid(
          'Source descriptor cannot first-register a stock or payment account',
        );
      if (['PAYABLE', 'RECEIVABLE'].includes(a.accountClass)) {
        const otherClass =
          a.accountClass === 'PAYABLE' ? 'RECEIVABLE' : 'PAYABLE';
        const opposite = legs.filter(
          (l) =>
            l.account.accountClass === otherClass &&
            l.account.claimId === a.claimId &&
            l.account.ownerId === a.counterpartyEntityId &&
            l.account.counterpartyEntityId === a.ownerId &&
            l.direction !== required.direction &&
            canonicalSerialize(l.amount) ===
              canonicalSerialize(required.amount),
        );
        if (
          a.claimId === null ||
          a.counterpartyEntityId === null ||
          opposite.length !== 1
        )
          invalid(
            'Explicit reciprocal same-group claim/counterparty basis required',
          );
      }
      const index = remaining.findIndex(
        (l) =>
          canonicalSerialize(l.account) ===
            canonicalSerialize(required.account) &&
          l.direction === required.direction &&
          canonicalSerialize(l.amount.toCanonicalValue()) ===
            canonicalSerialize(required.amount) &&
          l.counterpartyAccountId === required.counterpartyAccountId,
      );
      if (index < 0)
        invalid(
          'Actual financial legs do not reproduce selected source cost policy',
        );
      remaining.splice(index, 1);
    }
    // Reconstruct with the public canonical constructor; a DTO fingerprint is insufficient.
    const verified = createFinancialPostingBatch(
      {
        schemaVersion: actual.schemaVersion,
        batchId: actual.batchId,
        worldId: actual.worldId,
        causationCommandId: actual.causationCommandId,
        causationEventIds: actual.causationEventIds,
        worldVersionBefore: actual.worldVersionBefore,
        worldVersionAfter: actual.worldVersionAfter,
        simTime: actual.simTime,
        settlementCurrency: actual.settlementCurrency,
        legs: actual.legs,
        command: i.command,
        transition,
      },
      i.sha256Hex,
    );
    if (canonicalSerialize(verified) !== canonicalSerialize(actual))
      invalid('Financial wire/fingerprint mismatch');
    expected = applyFinancialPostingBatch(
      atVersion(expected, binding.worldVersionBefore),
      verified,
    ).state;
    for (const l of actual.legs.filter(
      (l) =>
        ['ASSET', 'CASH', 'DEPOSIT'].includes(l.account.accountClass) &&
        l.direction === 'CREDIT',
    )) {
      const before = i.financialBefore.positions.find(
        (p) => p.account.accountId === l.account.accountId,
      );
      const after = expected.positions.find(
        (p) => p.account.accountId === l.account.accountId,
      );
      if (
        !before ||
        before.netDebitBalance.amount.lessThan(l.amount.amount) ||
        (after && after.netDebitBalance.amount.isNegative())
      )
        invalid('Consumption/payment exceeds original stock-account balance');
    }
    if (requirement?.mode === 'PAID_COST_WITH_ACTUAL_BATCH') {
      if (
        !actual.legs.some(
          (l) =>
            ['CASH', 'DEPOSIT'].includes(l.account.accountClass) &&
            l.direction === 'CREDIT',
        )
      )
        invalid('Paid mode lacks actual payment leg');
      for (const l of actual.legs.filter((l) =>
        ['CASH', 'DEPOSIT'].includes(l.account.accountClass),
      )) {
        const position = expected.positions.find(
          (p) =>
            canonicalSerialize(p.account) === canonicalSerialize(l.account),
        );
        if (position && position.netDebitBalance.amount.isNegative())
          invalid('Service payment cannot create negative cash');
      }
    }
  } else expected = atVersion(expected, binding.worldVersionAfter);
  return expected;
}
function preparedEvent(
  i: SocialOfficePreparationInputV1,
  transition: AuthoritativeTransition,
) {
  const p = prepareSocialOfficeOperation(i);
  if (p.source !== 'PREPARED_NOT_COMMITTED' || !p.eventPayload)
    invalid('A new actual Social action is required');
  const binding = bindAuthoritativeTransition(
    { command: i.command, transition },
    i.sha256Hex,
  );
  const matching = transition.events.filter(
    (e) =>
      e.eventType === SOCIAL_OFFICE_ACTION_EVENT &&
      e.canonicalPayload === canonicalSerialize(p.eventPayload),
  );
  if (
    matching.length !== 1 ||
    transition.events.some((e) => e.correctsEventId !== null) ||
    transition.events.filter((e) => e.eventType === SOCIAL_OFFICE_ACTION_EVENT)
      .length !== 1
  )
    invalid('One exact uncorrected complete Social Event required');
  return { prepared: p, event: matching[0]!, binding };
}
export function createSocialServiceConsumptionPosting(
  input: {
    readonly postingId: InventoryPosting['postingId'];
    readonly command: CanonicalCommand;
    readonly transition: AuthoritativeTransition;
    readonly inventoryBefore: InventoryLedgerState;
    readonly financialBefore: FinancialLedgerState;
    readonly financialPostingBatches: readonly FinancialPostingBatch[];
    readonly socialBefore: SocialOfficeStateV1;
    readonly readFacts: SocialOfficeReadFactsV1;
    readonly socialOutcome: SocialOfficeOutcomeV1;
  },
  sha256Hex: Sha256Hex,
): SocialServiceConsumptionPostingV1 {
  const i: Construction = { ...input, state: input.socialBefore, sha256Hex };
  const { prepared, event, binding } = preparedEvent(i, input.transition),
    outcome = prepared.outcome;
  if (
    outcome.kind !== 'SERVE' ||
    !outcome.inventoryRequirement ||
    outcome.units === '0' ||
    canonicalSerialize(outcome) !== canonicalSerialize(input.socialOutcome)
  )
    invalid('Positive exact recomputed care consumption required');
  const rule = input.readFacts.clinicRules.find(
    (r) => r.clinicId === outcome.objectId,
  );
  const intentPayload = JSON.parse(input.command.canonicalPayload) as {
    careWindowId: string;
    clinicRuleVersion: string;
  };
  if (!rule || rule.ruleVersion !== intentPayload.clinicRuleVersion)
    invalid('Original clinic rule missing');
  verifyFinance(i, input.transition, outcome, input.financialPostingBatches);
  const account = createInventoryAccount(outcome.inventoryRequirement.account);
  if (
    account.worldId !== binding.worldId ||
    account.countryId !== input.command.countryId ||
    account.bucket !== 'AVAILABLE' ||
    account.reservationId !== null ||
    account.shipmentId !== null ||
    account.unit !== 'medical_dose'
  )
    invalid('Wrong actual medicine account scope/bucket');
  const entries: readonly InventoryPostingEntry[] = Object.freeze([
    {
      account,
      delta: Quantity.from(
        `-${outcome.inventoryRequirement.quantity}`,
        'medical_dose',
      ),
    },
  ]);
  const intent = {
    schemaVersion: SOCIAL_SERVICE_CONSUMPTION_SCHEMA_VERSION,
    postingId: inventoryPostingId(input.postingId),
    worldId: binding.worldId,
    causationCommandId: binding.commandId,
    causationEventIds: binding.eventIds,
    worldVersionBefore: binding.worldVersionBefore,
    worldVersionAfter: binding.worldVersionAfter,
    simTime: binding.simTime,
    transitionBinding: binding,
    operation: 'SERVICE_CONSUME' as const,
    entries,
    evidence: {
      clinicId: outcome.objectId,
      careWindowId: intentPayload.careWindowId,
      serviceEventId: event.eventId,
      ruleVersion: rule.ruleVersion,
      medicineSourceRecordId: rule.medicineSourceRecordId,
      inventoryBeforeHash: hash(input.inventoryBefore, sha256Hex),
      financialBeforeHash: hash(input.financialBefore, sha256Hex),
      deliveredCases: outcome.units,
      dosesPerCase: rule.dosesPerCase,
      consumption: outcome.inventoryRequirement,
      financialRequirement: outcome.financialRequirement,
      financialBatchFingerprints: input.financialPostingBatches.map(
        (b) => b.fingerprint,
      ),
    },
  };
  const posting: SocialServiceConsumptionPostingV1 = frozen({
    ...intent,
    fingerprint: hash(intent, sha256Hex),
  });
  originals.set(posting, {
    financialBefore: input.financialBefore,
    batches: Object.freeze([...input.financialPostingBatches]),
  });
  return posting;
}
/** @internal Constructor brand only; never an admission capability. */
export function isValidatedSocialServicePosting(
  posting: InventoryLedgerPosting,
): posting is SocialServiceConsumptionPostingV1 {
  return originals.has(posting);
}
/** @internal The sole existing Inventory writer must invoke this before changing stock. */
export function assertSocialServiceConsumptionContext(
  posting: SocialServiceConsumptionPostingV1,
  inventoryBefore: InventoryLedgerState,
  context:
    | {
        readonly settledBatches: readonly FinancialPostingBatch[];
        readonly financial: FinancialLedgerState;
        readonly sha256Hex: Sha256Hex;
      }
    | undefined,
): void {
  const original = originals.get(posting);
  if (
    !original ||
    !context ||
    !isAuthoritativeInventoryLedgerState(inventoryBefore) ||
    !isAuthoritativeFinancialLedgerState(context.financial)
  )
    invalid('Real joined writer context and constructor brand required');
  const { fingerprint, ...intent } = posting;
  if (
    hash(intent, context.sha256Hex) !== fingerprint ||
    hash(inventoryBefore, context.sha256Hex) !==
      posting.evidence.inventoryBeforeHash ||
    hash(original.financialBefore, context.sha256Hex) !==
      posting.evidence.financialBeforeHash
  )
    invalid('Posting intent/original predecessor differs');
  const actual = context.settledBatches.filter(
    (b) =>
      canonicalSerialize(b.transitionBinding) ===
      canonicalSerialize(posting.transitionBinding),
  );
  if (canonicalSerialize(actual) !== canonicalSerialize(original.batches))
    invalid('Missing/wrong/extra current transition financial group');
  let expected = original.financialBefore;
  for (const b of actual)
    expected = applyFinancialPostingBatch(
      atVersion(expected, posting.worldVersionBefore),
      b,
    ).state;
  if (actual.length === 0)
    expected = atVersion(expected, posting.worldVersionAfter);
  if (
    hash(expected, context.sha256Hex) !==
      hash(context.financial, context.sha256Hex) ||
    context.financial.worldVersion !== posting.worldVersionAfter
  )
    invalid(
      'Actual Financial after-state does not match original predecessor plus required group',
    );
}
export function assertSocialOfficeActualEffects(input: {
  readonly command: CanonicalCommand;
  readonly originalSocialState: SocialOfficeStateV1;
  readonly inventoryBefore: InventoryLedgerState;
  readonly financialBefore: FinancialLedgerState;
  readonly readFacts: SocialOfficeReadFactsV1;
  readonly transition: AuthoritativeTransition;
  readonly inventoryPostings: readonly InventoryLedgerPosting[];
  readonly financialPostingBatches: readonly FinancialPostingBatch[];
  readonly socialAfter: SocialOfficeStateV1;
  readonly sha256Hex: Sha256Hex;
}) {
  const i: SocialOfficePreparationInputV1 = {
    ...input,
    state: input.originalSocialState,
  };
  const { prepared } = preparedEvent(i, input.transition);
  if (
    canonicalSerialize(prepared.state) !== canonicalSerialize(input.socialAfter)
  )
    invalid('Actual Social after-state differs');
  verifyFinance(
    i,
    input.transition,
    prepared.outcome,
    input.financialPostingBatches,
  );
  if (prepared.outcome.inventoryRequirement) {
    if (input.inventoryPostings.length !== 1)
      invalid('Exactly one actual service Inventory posting required');
    const p = input.inventoryPostings[0]!;
    if (!isValidatedSocialServicePosting(p))
      invalid('Actual service Inventory constructor brand required');
    const verified = createSocialServiceConsumptionPosting(
      {
        postingId: p.postingId,
        command: input.command,
        transition: input.transition,
        inventoryBefore: input.inventoryBefore,
        financialBefore: input.financialBefore,
        financialPostingBatches: input.financialPostingBatches,
        socialBefore: input.originalSocialState,
        readFacts: input.readFacts,
        socialOutcome: prepared.outcome,
      },
      input.sha256Hex,
    );
    if (canonicalSerialize(verified) !== canonicalSerialize(p))
      invalid('Actual Inventory posting differs from complete recomputation');
  } else if (input.inventoryPostings.length !== 0)
    invalid('Undeclared Inventory effects');
  return Object.freeze({
    status: 'DATA_MATCHED_NOT_ADMITTED' as const,
    sourceAdmitted: false as const,
    actualCommitted: false as const,
  });
}

export interface SocialOfficeJoinedLineageRowV1 {
  readonly command: CanonicalCommand;
  readonly transition: AuthoritativeTransition;
  readonly financialPostingBatches: readonly FinancialPostingBatch[];
  readonly inventoryPostings: readonly InventoryLedgerPosting[];
  readonly serviceConsumptionWire: string | null;
  readonly readFacts: SocialOfficeReadFactsV1;
}
/** Pure composition of the existing unique replay/ledger writers, not native admission. */
export function replaySocialOfficeJoinedLineage(input: {
  readonly seed: OpeningSeed;
  readonly socialOpening: SocialOfficeStateV1;
  readonly openingReadFacts: SocialOfficeReadFactsV1;
  readonly transitions: readonly SocialOfficeJoinedLineageRowV1[];
  readonly sha256Hex: Sha256Hex;
}) {
  let ledgers = rebuildV08LedgersFromLineage({
      seed: input.seed,
      sha256Hex: input.sha256Hex,
    }),
    social = validateSocialOfficeState(
      input.socialOpening,
      input.openingReadFacts,
      input.sha256Hex,
    );
  const decoded: V08AuthoritativeLedgerTransition[] = [],
    services: SocialServiceConsumptionPostingV1[] = [];
  if (social.worldId !== input.seed.worldId)
    invalid('Original Social opening and actual seed World differ');
  for (const row of input.transitions) {
    if (
      row.transition.events.length !== 1 ||
      row.transition.events[0]!.eventType !== SOCIAL_OFFICE_ACTION_EVENT
    )
      invalid('Unsupported/unknown sibling in complete Social prefix');
    const event = row.transition.events[0]!,
      payload = JSON.parse(event.canonicalPayload) as Record<string, unknown>;
    if (
      canonicalSerialize(payload.readFacts) !==
      canonicalSerialize(row.readFacts)
    )
      invalid('Retained source facts differ from actual Event');
    const i: SocialOfficePreparationInputV1 = {
      command: row.command,
      state: social,
      readFacts: row.readFacts,
      inventoryBefore: ledgers.inventory,
      financialBefore: ledgers.financial,
      sha256Hex: input.sha256Hex,
    };
    const prepared = prepareSocialOfficeOperation(i);
    if (prepared.source !== 'PREPARED_NOT_COMMITTED')
      invalid('Duplicate transition in full prefix');
    const next = reduceSocialOfficeEvent({
      state: social,
      event: {
        transitionId: row.transition.transitionId,
        worldId: event.worldId,
        eventId: event.eventId,
        causationCommandId: event.causationCommandId!,
        correctsEventId: event.correctsEventId,
        eventType: event.eventType,
        sequence: event.sequence,
        worldVersionBefore: row.transition.worldVersionBefore,
        worldVersionAfter: row.transition.worldVersionAfter,
        simTime: event.simTime,
        payload,
      },
      inventoryBefore: ledgers.inventory,
      financialBefore: ledgers.financial,
      sha256Hex: input.sha256Hex,
    });
    let postings = row.inventoryPostings;
    if (prepared.outcome.inventoryRequirement) {
      if (
        row.serviceConsumptionWire === null ||
        row.inventoryPostings.length !== 0
      )
        invalid(
          'One retained service wire and no undeclared old posting required',
        );
      const raw = JSON.parse(row.serviceConsumptionWire) as {
        postingId: string;
      };
      const p = createSocialServiceConsumptionPosting(
        {
          postingId: inventoryPostingId(raw.postingId),
          command: row.command,
          transition: row.transition,
          inventoryBefore: ledgers.inventory,
          financialBefore: ledgers.financial,
          financialPostingBatches: row.financialPostingBatches,
          socialBefore: social,
          readFacts: row.readFacts,
          socialOutcome: prepared.outcome,
        },
        input.sha256Hex,
      );
      if (canonicalSerialize(p) !== row.serviceConsumptionWire)
        invalid(
          'Original service wire/fingerprint differs from real reconstruction',
        );
      postings = [p];
      services.push(p);
    } else if (row.serviceConsumptionWire !== null)
      invalid('Unexpected service consumption wire');
    assertSocialOfficeActualEffects({
      command: row.command,
      originalSocialState: social,
      inventoryBefore: ledgers.inventory,
      financialBefore: ledgers.financial,
      readFacts: row.readFacts,
      transition: row.transition,
      inventoryPostings: postings,
      financialPostingBatches: row.financialPostingBatches,
      socialAfter: next,
      sha256Hex: input.sha256Hex,
    });
    decoded.push({
      command: row.command,
      transition: row.transition,
      inventoryPostings: postings,
      financialPostingBatches: row.financialPostingBatches,
    });
    ledgers = rebuildV08LedgersFromLineage({
      seed: input.seed,
      transitions: decoded,
      sha256Hex: input.sha256Hex,
    });
    social = next;
  }
  return Object.freeze({
    decodedTransitions: Object.freeze(decoded),
    social,
    ledgers,
    servicePostings: Object.freeze(services),
    status: 'REPLAYED_NOT_ADMITTED' as const,
  });
}
