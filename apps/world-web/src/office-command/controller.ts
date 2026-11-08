import {
  INDUSTRY_UTILITY_PLANNING_DATASET,
  parseIndustryUtilityPlanningRow,
} from '@econmind/core/postwar-industry-utility-planning-contract';
import {
  buildIndustryUtilityRequest,
  type IndustryUtilityDraft,
} from '../industry-utility/form.js';
import {
  buildSocialEmploymentPlanRequest,
  type SocialEmploymentPlanDraft,
} from '../social-employment/plan-form.js';
import {
  buildCaptainCapitalRequest,
  type CaptainCapitalDraft,
} from '../captain-capital/form.js';
import {
  INDUSTRY_RUN_PARAMETERS_DATASET,
  parseIndustryRunParameterRow,
} from '@econmind/core/postwar-industry-run-parameters-contract';
import {
  buildIndustryRunRequest,
  type IndustryRunDraft,
} from '../industry-run/form.js';
import {
  POSTWAR_TRADE_CURRENT_DATASETS,
  type PostwarTradeCurrentDataset,
} from '@econmind/core/postwar-trade-current-contract';
import type {
  AuthenticatedOfficeCommandRequestDto,
  ManualOfficeQueueAcknowledgementDto,
} from '@econmind/core/authenticated-office-command-contract';
import type { BrowserFinalReceipt } from '../authorized-client/client.js';
import {
  createProductionReadClient,
  type FinalLookupIdentity,
} from '../production-read/client.js';
import {
  canonicalId,
  hash,
  row,
  validConfig,
  type ProductionReadConfig,
} from '../production-read/contract.js';
import { sameAuthorizedIdentity } from '../prototype/authorized-read-adapter.js';
import {
  consumeOfficeProjection,
  officeProjectionRoles,
  type OfficeProjectionModel,
  type OfficeProjectionView,
} from '../office-projection/model.js';
import { createOfficeCommandClient } from './client.js';
import { createOfficeRecoveryClient } from './recovery-client.js';
import {
  createPostwarRuntimeClient,
  POSTWAR_RUNTIME_SCHEMA,
  type RuntimePage,
} from '../postwar-office-runtime/client.js';
import {
  officeFamilies,
  parseOfficeIntent,
  validOfficeEndpoint,
  type OfficeCommandEndpoint,
} from './contract.js';

export interface OfficeCommandBinding {
  readonly read: ProductionReadConfig;
  readonly view: OfficeProjectionView;
  readonly endpoint: OfficeCommandEndpoint;
}
export function validOfficeBinding(
  b: OfficeCommandBinding | null,
): b is OfficeCommandBinding {
  return (
    !!b &&
    !!b.view &&
    Object.hasOwn(officeProjectionRoles, b.view.role) &&
    validConfig(b.read) &&
    validOfficeEndpoint(b.endpoint, b.read) &&
    b.read.identity.classification === 'OFFICE_PRIVATE' &&
    Object.hasOwn(officeFamilies, b.read.identity.officeId) &&
    officeProjectionRoles[b.view.role] === b.read.identity.officeId &&
    /^(0[1-9]|[1-6][0-9]|70)$/u.test(b.view.countryDisplayId)
  );
}
type Status =
  | 'MISSING'
  | 'READY_TO_READ'
  | 'READING'
  | 'CURRENT'
  | 'CURRENT_AUTHORIZED_HEAD'
  | 'REVIEW_REQUIRED'
  | 'REVIEWED'
  | 'SUBMITTING'
  | 'QUEUE_ACK'
  | 'UNKNOWN'
  | 'REJECTED'
  | 'LOOKING_UP_FINAL'
  | 'FINAL_VERIFIED'
  | 'UNAVAILABLE'
  | 'DENIED';
export function createOfficeCommandController(
  supplied: OfficeCommandBinding | null,
  currentView: () => OfficeProjectionView | null,
  options: {
    readonly fetcher?: typeof fetch;
    readonly requestId?: () => string;
  } = {},
) {
  const b = validOfficeBinding(supplied)
    ? {
        view: { ...supplied.view },
        endpoint: { ...supplied.endpoint },
        read: {
          ...supplied.read,
          identity: { ...supplied.read.identity },
          world: { ...supplied.read.world },
          endpoints: { ...supplied.read.endpoints },
          session: { ...supplied.read.session },
        },
      }
    : null;
  const reader = b ? createProductionReadClient(b.read, options) : null,
    runtimeReader =
      b?.read.identity.projectionVersion === POSTWAR_RUNTIME_SCHEMA
        ? createPostwarRuntimeClient(b.read, options)
        : null,
    industryUtilityReader =
      b?.read.identity.officeId === 'INDUSTRY' && runtimeReader
        ? createPostwarRuntimeClient(b.read, options)
        : null,
    industryRunReader =
      b?.read.identity.officeId === 'INDUSTRY' && runtimeReader
        ? createPostwarRuntimeClient(b.read, options)
        : null,
    socialPoolsReader =
      b?.read.identity.officeId === 'SOCIAL' && runtimeReader
        ? createPostwarRuntimeClient(b.read, options)
        : null,
    recoverer = b
      ? createOfficeRecoveryClient(b.endpoint, b.read, options)
      : null,
    writer = b ? createOfficeCommandClient(b.endpoint, b.read, options) : null;
  const requestId = options.requestId ?? (() => crypto.randomUUID()),
    listeners = new Set<() => void>();
  let retired = !b,
    busy = false,
    epoch = 0,
    attempted = false,
    outcomeUnknown = false,
    stop: (() => void) | null = null;
  let status: Status = b ? 'READY_TO_READ' : 'MISSING',
    code: string | null = b ? null : 'OFFICE_BINDING_MISSING_OR_UNSUPPORTED';
  let runtimePage: RuntimePage | null = null;
  let runParametersPage: RuntimePage | null = null;
  let utilityPlanningPage: RuntimePage | null = null;
  let utilityPlanningCode: string | null = null;
  let socialPoolsPage: RuntimePage | null = null;
  let socialPoolsCode: string | null = null;
  let model: OfficeProjectionModel | null = null,
    intent: AuthenticatedOfficeCommandRequestDto | null = null,
    acknowledgement: ManualOfficeQueueAcknowledgementDto | null = null,
    lookup: FinalLookupIdentity | null = null,
    receipt: BrowserFinalReceipt | null = null;
  let floor = b?.read.world.minimumWorldVersion ?? '0';
  // Local read selection only. It cannot change the server's dataset, source
  // custody, current head or command authority.
  let tradeDataset: PostwarTradeCurrentDataset = 'inventory-current';
  let submitStatus: Status | null = null;
  let submitCode: string | null = null;
  // Local presentation metadata only; never source freshness or authority.
  let lastAuthorizedReadAtClient: string | null = null;
  const currentHead = () =>
    runtimePage?.authority.readback ?? model?.head ?? null;
  const notify = () => {
    for (const fn of [...listeners]) fn();
  };
  function disconnect(reason = 'SESSION_OR_VIEW_LOST') {
    retired = true;
    epoch++;
    busy = false;
    status = reason === 'DENIED' ? 'DENIED' : 'MISSING';
    code = reason;
    model = null;
    runtimePage = null;
    runParametersPage = null;
    utilityPlanningPage = null;
    utilityPlanningCode = null;
    socialPoolsPage = null;
    socialPoolsCode = null;
    intent = null;
    acknowledgement = null;
    lookup = null;
    receipt = null;
    lastAuthorizedReadAtClient = null;
    reader?.disconnect();
    runtimeReader?.disconnect();
    industryRunReader?.disconnect();
    industryUtilityReader?.disconnect();
    socialPoolsReader?.disconnect();
    recoverer?.disconnect();
    writer?.disconnect();
    const cleanup = stop;
    stop = null;
    try {
      cleanup?.();
    } catch {
      /* Retirement is irreversible. */
    }
    notify();
  }
  function checkLiveness() {
    if (retired || !b) return false;
    try {
      const view = currentView();
      if (
        b.read.session.isCurrent() &&
        sameAuthorizedIdentity(b.read.currentIdentity(), b.read.identity) &&
        view?.role === b.view.role &&
        view.countryDisplayId === b.view.countryDisplayId
      )
        return true;
    } catch {
      /* Unavailable host is not authority. */
    }
    disconnect();
    return false;
  }
  if (b) {
    try {
      const unsubscribe = b.read.session.onInvalidate(() => disconnect());
      if (typeof unsubscribe !== 'function') disconnect();
      else if (retired) unsubscribe();
      else stop = unsubscribe;
    } catch {
      disconnect();
    }
    checkLiveness();
  }
  function fail(reason: string) {
    if (reason === 'DENIED') {
      disconnect('DENIED');
      return;
    }
    model = null;
    runtimePage = null;
    runParametersPage = null;
    utilityPlanningPage = null;
    utilityPlanningCode = null;
    socialPoolsPage = null;
    socialPoolsCode = null;
    status = 'UNAVAILABLE';
    code = reason;
  }
  async function operation(fn: () => Promise<void>) {
    if (busy || !checkLiveness()) return;
    busy = true;
    const started = epoch;
    try {
      await fn();
    } catch {
      if (started === epoch && checkLiveness()) fail('UNAVAILABLE');
    } finally {
      if (started === epoch) {
        busy = false;
        notify();
      }
    }
  }
  async function readUtilityPlanning(previous?: RuntimePage) {
    if (!industryUtilityReader || !currentHead()) return;
    const next = await industryUtilityReader.readPage(
      INDUSTRY_UTILITY_PLANNING_DATASET,
      requestId(),
      previous,
    );
    if (!checkLiveness()) return;
    if (next.status === 'DENIED') {
      disconnect('DENIED');
      return;
    }
    if (next.status === 'STALE') {
      fail('STALE');
      return;
    }
    utilityPlanningPage = null;
    utilityPlanningCode = next.status;
    if (next.status === 'PAGE' || next.status === 'EMPTY') {
      const head = currentHead();
      if (
        !head ||
        next.authority.readback.worldVersion !== head.worldVersion ||
        next.authority.readback.eventSequence !== head.eventSequence
      ) {
        fail('STALE');
        return;
      }
      utilityPlanningPage = next;
      utilityPlanningCode = null;
    }
  }
  function clearUnsubmittedSocialPlan() {
    if (
      !attempted &&
      intent?.request.commandType === 'CORE_SOCIAL_EMPLOYMENT_SERVICE_PLAN_V1'
    ) {
      intent = null;
      status = 'CURRENT_AUTHORIZED_HEAD';
      code = null;
    }
  }
  async function readSocialPools(previous?: RuntimePage) {
    if (!socialPoolsReader || !currentHead()) return;
    clearUnsubmittedSocialPlan();
    socialPoolsPage = null;
    socialPoolsCode = 'READING';
    notify();
    const next = await socialPoolsReader.readPage(
      'service-pools',
      requestId(),
      previous,
    );
    if (!checkLiveness()) return;
    if (next.status === 'DENIED') {
      disconnect('DENIED');
      return;
    }
    if (next.status === 'STALE') {
      fail('STALE');
      return;
    }
    socialPoolsCode = next.status;
    if (next.status === 'PAGE' || next.status === 'EMPTY') {
      const h = currentHead();
      if (
        !h ||
        next.authority.readback.worldVersion !== h.worldVersion ||
        next.authority.readback.eventSequence !== h.eventSequence
      ) {
        fail('STALE');
        return;
      }
      socialPoolsPage = next;
      socialPoolsCode = null;
    }
  }
  async function read(tradeOpeningH0 = false, previous?: RuntimePage) {
    if (!b || !reader) return;
    model = null;
    runtimePage = null;
    runParametersPage = null;
    utilityPlanningPage = null;
    utilityPlanningCode = null;
    socialPoolsPage = null;
    socialPoolsCode = null;
    clearUnsubmittedSocialPlan();
    status = 'READING';
    notify();
    if (runtimeReader) {
      const dataset =
        b.read.identity.officeId === 'INDUSTRY'
          ? 'industry-labour-current'
          : b.read.identity.officeId === 'CENTRAL_BANK'
            ? 'ledger-balances'
            : b.read.identity.officeId === 'TRADE'
              ? tradeOpeningH0
                ? 'opening-inventory-entries'
                : tradeDataset
              : b.read.identity.officeId === 'SOCIAL'
                ? 'positions'
                : b.read.identity.officeId === 'CAPTAIN'
                  ? 'political-capital-current'
                  : 'ledger-balances';
      const result = await runtimeReader.readPage(
        dataset,
        requestId(),
        previous,
      );
      if (!checkLiveness()) return;
      if (result.status !== 'PAGE' && result.status !== 'EMPTY') {
        fail(result.status);
        return;
      }
      if (
        previous &&
        (previous.authority.readback.worldVersion !==
          result.authority.readback.worldVersion ||
          previous.authority.readback.eventSequence !==
            result.authority.readback.eventSequence)
      ) {
        fail('STALE');
        return;
      }
      if (BigInt(result.authority.readback.worldVersion) < BigInt(floor)) {
        fail('STALE');
        return;
      }
      const observedOpeningHead = tradeOpeningH0
        ? row(result.source.observedHead)
        : null;
      if (
        tradeOpeningH0 &&
        (floor !== '0' ||
          result.dataset !== 'opening-inventory-entries' ||
          result.authority.readback.worldVersion !== '0' ||
          result.authority.readback.eventSequence !== '0' ||
          result.source.worldVersion !== '0' ||
          result.source.eventSequence !== '0' ||
          (result.source.originWorldVersion !== undefined &&
            result.source.originWorldVersion !== '0') ||
          (result.source.originEventSequence !== undefined &&
            result.source.originEventSequence !== '0') ||
          (result.source.observedHead !== undefined &&
            (!observedOpeningHead ||
              observedOpeningHead.worldVersion !== '0' ||
              observedOpeningHead.eventSequence !== '0')) ||
          ![
            'ADMITTED_IMMUTABLE_OPENING_FACTS',
            'ADMITTED_H0_DERIVED_PROJECTION_NOT_POST_H0_REPLAY',
          ].includes(String(result.source.dataNature)))
      ) {
        // A verified positive head is still a real lower bound, even though
        // these historical rows cannot be used as the current Trade readout.
        floor = result.authority.readback.worldVersion;
        fail('TRADE_OPENING_REQUIRES_EXACT_H0');
        return;
      }
      floor = result.authority.readback.worldVersion;
      runtimePage = result;
      await readSocialPools();
      if (!checkLiveness() || !runtimePage) return;
      if (industryRunReader) {
        const parameters = await industryRunReader.readPage(
          INDUSTRY_RUN_PARAMETERS_DATASET,
          requestId(),
        );
        if (!checkLiveness()) return;
        if (parameters.status === 'DENIED') {
          disconnect('DENIED');
          return;
        }
        if (parameters.status === 'PAGE' || parameters.status === 'EMPTY') {
          if (
            parameters.authority.readback.worldVersion !==
              result.authority.readback.worldVersion ||
            parameters.authority.readback.eventSequence !==
              result.authority.readback.eventSequence
          ) {
            fail('STALE');
            return;
          }
          runParametersPage = parameters;
        }
      }
      await readUtilityPlanning();
      if (!checkLiveness() || !runtimePage) return;
      try {
        lastAuthorizedReadAtClient = new Date().toISOString();
      } catch {
        lastAuthorizedReadAtClient = null;
      }
      code = receipt ? null : submitCode;
      status = receipt
        ? 'FINAL_VERIFIED'
        : (submitStatus ?? 'CURRENT_AUTHORIZED_HEAD');
      return;
    }
    const r = await reader.readProjection(requestId());
    if (!checkLiveness()) return;
    if (r.status !== 'PROJECTION') {
      fail(r.status);
      return;
    }
    const next = consumeOfficeProjection(r, b.read, b.view.role);
    if (next.kind !== 'CURRENT') {
      fail(next.code);
      return;
    }
    if (BigInt(next.head.worldVersion) < BigInt(floor)) {
      fail('STALE');
      return;
    }
    floor = next.head.worldVersion;
    model = next;
    try {
      lastAuthorizedReadAtClient = new Date().toISOString();
    } catch {
      lastAuthorizedReadAtClient = null;
    }
    code = receipt ? null : submitCode;
    status = receipt ? 'FINAL_VERIFIED' : (submitStatus ?? 'CURRENT');
  }
  async function recoverOriginal() {
    if (
      !b ||
      !recoverer ||
      !intent ||
      !attempted ||
      receipt ||
      (!outcomeUnknown && !lookup)
    )
      return;
    status = 'LOOKING_UP_FINAL';
    code = null;
    notify();
    const result = await recoverer.recover(
      intent,
      requestId(),
      lookup?.commandFingerprint,
    );
    if (!checkLiveness()) return;
    if (result.status === 'DENIED') {
      disconnect('DENIED');
      return;
    }
    if (result.status === 'PENDING') {
      lookup = {
        commandId: result.state.commandId,
        idempotencyKey: result.state.idempotencyKey,
        commandFingerprint: result.state.commandFingerprint,
      };
      outcomeUnknown = false;
      status = 'QUEUE_ACK';
      code = 'RECOVERY_PENDING';
      submitStatus = status;
      submitCode = code;
      return;
    }
    if (result.status === 'FINAL') {
      receipt = Object.freeze({
        ...result.receipt,
        eventIds: Object.freeze([...result.receipt.eventIds]),
      });
      lookup = {
        commandId: result.receipt.commandId,
        idempotencyKey: result.receipt.idempotencyKey,
        commandFingerprint: result.receipt.commandFingerprint,
      };
      outcomeUnknown = false;
      if (
        result.receipt.worldVersionAfter !== null &&
        BigInt(result.receipt.worldVersionAfter) > BigInt(floor)
      )
        floor = result.receipt.worldVersionAfter;
      await read();
      return;
    }
    status = outcomeUnknown ? 'UNKNOWN' : 'QUEUE_ACK';
    code =
      ('code' in result ? result.code : undefined) ?? 'RECOVERY_UNAVAILABLE';
    submitStatus = status;
    submitCode = code;
  }
  function restoreOriginalForRecovery(value: unknown) {
    // An explicit original is query identity only. Unlike staging a new intent,
    // its expected head may precede the current authorized projection.
    if (!b || busy || attempted || receipt || !checkLiveness()) return false;
    const original = parseOfficeIntent(value, b.read);
    if (
      !original ||
      (currentHead() &&
        BigInt(original.request.expectedWorldVersion) >
          BigInt(currentHead()!.worldVersion))
    ) {
      intent = null;
      status = 'UNAVAILABLE';
      code = 'ORIGINAL_RECOVERY_SCOPE_OR_HEAD_MISMATCH';
      notify();
      return false;
    }
    intent = original;
    acknowledgement = null;
    lookup = null;
    attempted = true;
    outcomeUnknown = true;
    submitStatus = 'UNKNOWN';
    submitCode = 'ORIGINAL_REQUEST_RESTORED_FOR_RECOVERY_ONLY';
    status = submitStatus;
    code = submitCode;
    notify();
    return true;
  }
  function stageIntent(value: unknown) {
    if (!b || busy || attempted || !checkLiveness()) return false;
    const next = parseOfficeIntent(value, b.read);
    if (
      !next ||
      !currentHead() ||
      next.request.expectedWorldVersion !== currentHead()!.worldVersion
    ) {
      intent = null;
      status = 'UNAVAILABLE';
      code = 'INTENT_OR_CURRENT_VERSION_MISMATCH';
      notify();
      return false;
    }
    intent = next;
    status = 'REVIEW_REQUIRED';
    code = null;
    notify();
    return true;
  }
  return Object.freeze({
    disconnect,
    checkLiveness,
    subscribe(fn: () => void) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    getState() {
      checkLiveness();
      return {
        status,
        code,
        model: model
          ? (JSON.parse(JSON.stringify(model)) as OfficeProjectionModel)
          : null,
        receipt,
        acknowledgement,
        runtimePage: runtimePage
          ? (JSON.parse(JSON.stringify(runtimePage)) as RuntimePage)
          : null,
        runParametersPage: runParametersPage
          ? (JSON.parse(JSON.stringify(runParametersPage)) as RuntimePage)
          : null,
        utilityPlanningPage: utilityPlanningPage
          ? (JSON.parse(JSON.stringify(utilityPlanningPage)) as RuntimePage)
          : null,
        utilityPlanningCode,
        socialPoolsPage: socialPoolsPage
          ? (JSON.parse(JSON.stringify(socialPoolsPage)) as RuntimePage)
          : null,
        socialPoolsCode,
        tradeDataset:
          b?.read.identity.officeId === 'TRADE' && runtimeReader
            ? tradeDataset
            : null,
        canReadTradeOpeningH0:
          !retired &&
          !busy &&
          !!runtimeReader &&
          b?.read.identity.officeId === 'TRADE' &&
          floor === '0',
        currentHead: currentHead()
          ? {
              worldVersion: currentHead()!.worldVersion,
              eventSequence: currentHead()!.eventSequence,
            }
          : null,
        lastAuthorizedReadAtClient,
        intent: intent
          ? (JSON.parse(
              JSON.stringify(intent),
            ) as AuthenticatedOfficeCommandRequestDto)
          : null,
        canRead: !retired && !busy,
        canStage: !retired && !busy && !attempted && !!currentHead(),
        canRestoreOriginal: !retired && !busy && !attempted && !receipt,
        canReview:
          !retired && !busy && !attempted && !!intent && !!currentHead(),
        canConfirm:
          !retired &&
          !busy &&
          !attempted &&
          status === 'REVIEWED' &&
          !!currentHead(),
        canLookupFinal: !retired && !busy && !!lookup,
        canRecover:
          !retired &&
          !busy &&
          attempted &&
          !!intent &&
          !receipt &&
          (outcomeUnknown || !!lookup),
        completion:
          status === 'FINAL_VERIFIED' &&
          receipt?.outcome === 'COMMITTED' &&
          model?.decisionResult.result?.cause?.commandId ===
            lookup?.commandId &&
          model?.decisionResult.result?.cause?.commandFingerprint ===
            lookup?.commandFingerprint &&
          model?.decisionResult.result?.cause?.worldVersionAfter ===
            receipt.worldVersionAfter &&
          receipt.eventIds.includes(
            model?.decisionResult.result?.cause?.eventId ?? '',
          ),
      };
    },
    refresh: () =>
      operation(async () => {
        await read();
      }),
    selectTradeDataset(dataset: PostwarTradeCurrentDataset) {
      if (
        !b ||
        b.read.identity.officeId !== 'TRADE' ||
        !runtimeReader ||
        !POSTWAR_TRADE_CURRENT_DATASETS.includes(dataset)
      )
        return Promise.resolve();
      return operation(async () => {
        tradeDataset = dataset;
        await read();
      });
    },
    readTradeOpeningH0() {
      if (
        !b ||
        b.read.identity.officeId !== 'TRADE' ||
        !runtimeReader ||
        floor !== '0'
      )
        return Promise.resolve();
      return operation(() => read(true));
    },
    nextTradePage() {
      if (
        !b ||
        b.read.identity.officeId !== 'TRADE' ||
        !runtimeReader ||
        !runtimePage ||
        runtimePage.page.nextOffset === null
      )
        return Promise.resolve();
      const previous = runtimePage,
        opening = previous.dataset === 'opening-inventory-entries';
      if (
        (!opening && previous.dataset !== tradeDataset) ||
        (opening && floor !== '0')
      )
        return Promise.resolve();
      return operation(() => read(opening, previous));
    },
    stage: stageIntent,
    restoreOriginalForRecovery,
    nextSocialPositionsPage() {
      if (
        !b ||
        b.read.identity.officeId !== 'SOCIAL' ||
        runtimePage?.dataset !== 'positions' ||
        runtimePage.page.nextOffset === null
      )
        return Promise.resolve();
      const previous = runtimePage;
      return operation(() => read(false, previous));
    },
    nextSocialPoolsPage() {
      if (
        !b ||
        b.read.identity.officeId !== 'SOCIAL' ||
        !socialPoolsPage ||
        socialPoolsPage.page.nextOffset === null
      )
        return Promise.resolve();
      const previous = socialPoolsPage;
      return operation(() => readSocialPools(previous));
    },
    stageSocialEmploymentPlan(draft: SocialEmploymentPlanDraft) {
      if (
        !b ||
        busy ||
        attempted ||
        !checkLiveness() ||
        b.read.identity.officeId !== 'SOCIAL' ||
        runtimePage?.dataset !== 'positions' ||
        !socialPoolsPage
      )
        return false;
      try {
        const id = requestId().replaceAll('-', '').toUpperCase();
        return stageIntent(
          buildSocialEmploymentPlanRequest({
            positions: runtimePage,
            pools: socialPoolsPage,
            worldId: b.read.identity.worldId,
            countryId: b.read.identity.countryId,
            draft,
            requestId: requestId(),
            commandId: 'SOCIAL_PLAN_' + id,
            idempotencyKey: 'SOCIAL_PLAN_KEY_' + id,
          }),
        );
      } catch {
        intent = null;
        status = 'UNAVAILABLE';
        code = 'SOCIAL_PLAN_CURRENT_SELECTION_INVALID';
        notify();
        return false;
      }
    },
    stageCaptainCapital(draft: CaptainCapitalDraft) {
      const head = currentHead();
      if (
        !b ||
        !checkLiveness() ||
        b.read.identity.officeId !== 'CAPTAIN' ||
        runtimePage?.dataset !== 'political-capital-current' ||
        !head
      )
        return false;
      try {
        const id = requestId().replaceAll('-', '').toUpperCase();
        return stageIntent(
          buildCaptainCapitalRequest({
            rows: runtimePage.rows,
            options: runtimePage.source.currentCaptainAllocationOptions,
            coverage: runtimePage.source.currentCaptainCoverage,
            draft,
            worldId: b.read.identity.worldId,
            countryId: b.read.identity.countryId,
            worldVersion: head.worldVersion,
            eventSequence: head.eventSequence,
            requestId: requestId(),
            commandId: 'CAPTAIN_ALLOCATION_' + id,
            idempotencyKey: 'CAPTAIN_ALLOCATION_KEY_' + id,
          }),
        );
      } catch {
        return false;
      }
    },
    stageIndustryRun(draft: IndustryRunDraft) {
      if (
        !b ||
        !checkLiveness() ||
        runParametersPage?.dataset !== INDUSTRY_RUN_PARAMETERS_DATASET ||
        !currentHead()
      )
        return false;
      try {
        const source = runParametersPage.rows
          .map(parseIndustryRunParameterRow)
          .find((row) => row.facilityId === draft.facilityId);
        if (!source) return false;
        const id = requestId().replaceAll('-', '').toUpperCase();
        return stageIntent(
          buildIndustryRunRequest({
            row: source,
            draft,
            worldId: b.read.identity.worldId,
            countryId: b.read.identity.countryId,
            worldVersion: currentHead()!.worldVersion,
            requestId: requestId(),
            commandId: 'INDUSTRY_RUN_' + id,
            idempotencyKey: 'INDUSTRY_RUN_KEY_' + id,
            runId: 'INDUSTRY_PLAN_' + id,
          }),
        );
      } catch {
        return false;
      }
    },
    nextIndustryUtilityPlanningPage: () =>
      operation(async () => {
        if (
          !attempted &&
          utilityPlanningPage?.page.nextOffset !== null &&
          utilityPlanningPage
        )
          await readUtilityPlanning(utilityPlanningPage);
      }),
    stageIndustryUtility(draft: IndustryUtilityDraft) {
      if (
        !b ||
        !checkLiveness() ||
        !currentHead() ||
        utilityPlanningPage?.dataset !== INDUSTRY_UTILITY_PLANNING_DATASET ||
        utilityPlanningPage.authority.readback.worldVersion !==
          currentHead()!.worldVersion ||
        utilityPlanningPage.authority.readback.eventSequence !==
          currentHead()!.eventSequence
      )
        return false;
      try {
        const row = utilityPlanningPage.rows
          .map(parseIndustryUtilityPlanningRow)
          .find((r) => r.planningRef === draft.planningRef);
        if (!row) return false;
        const id = requestId().replaceAll('-', '').toUpperCase();
        return stageIntent(
          buildIndustryUtilityRequest({
            row,
            draft,
            worldId: b.read.identity.worldId,
            countryId: b.read.identity.countryId,
            worldVersion: currentHead()!.worldVersion,
            requestId: requestId(),
            commandId: 'INDUSTRY_UTILITY_' + id,
            idempotencyKey: 'INDUSTRY_UTILITY_KEY_' + id,
          }),
        );
      } catch {
        return false;
      }
    },
    review() {
      if (
        !checkLiveness() ||
        busy ||
        attempted ||
        !intent ||
        !currentHead() ||
        intent.request.expectedWorldVersion !== currentHead()!.worldVersion
      )
        return false;
      status = 'REVIEWED';
      notify();
      return true;
    },
    confirm: () =>
      operation(async () => {
        if (
          !writer ||
          !intent ||
          !currentHead() ||
          attempted ||
          status !== 'REVIEWED' ||
          intent.request.expectedWorldVersion !== currentHead()!.worldVersion
        )
          return;
        attempted = true;
        status = 'SUBMITTING';
        code = null;
        notify();
        const result = await writer.submit(intent);
        if (!checkLiveness()) return;
        if (result.status === 'DENIED') {
          disconnect('DENIED');
          return;
        }
        if (result.status === 'QUEUE_ACK') {
          acknowledgement = result.acknowledgement;
          lookup = {
            commandId: intent.request.commandId,
            idempotencyKey: intent.request.idempotencyKey,
            commandFingerprint: acknowledgement.commandFingerprint,
          };
          status = 'QUEUE_ACK';
        } else {
          outcomeUnknown = result.status === 'UNKNOWN';
          status =
            result.status === 'REJECTED'
              ? 'REJECTED'
              : outcomeUnknown
                ? 'UNKNOWN'
                : 'UNAVAILABLE';
          code = result.status === 'REJECTED' ? result.code : result.status;
        }
        submitStatus = status;
        submitCode = code;
      }),
    recoverLookup(original: FinalLookupIdentity) {
      if (
        !checkLiveness() ||
        busy ||
        !outcomeUnknown ||
        lookup ||
        !intent ||
        !canonicalId(original.commandId) ||
        !canonicalId(original.idempotencyKey) ||
        !hash(original.commandFingerprint) ||
        original.commandId !== intent.request.commandId ||
        original.idempotencyKey !== intent.request.idempotencyKey
      )
        return false;
      lookup = Object.freeze({ ...original });
      notify();
      return true;
    },
    recoverOriginal: () => operation(recoverOriginal),
    lookupAndRefresh: () =>
      operation(async () => {
        if (runtimeReader) {
          await recoverOriginal();
          return;
        }
        if (!reader || !lookup) return;
        model = null;
        receipt = null;
        status = 'LOOKING_UP_FINAL';
        code = null;
        notify();
        const r = await reader.lookupFinal(requestId(), lookup);
        if (!checkLiveness()) return;
        if (r.status !== 'FINAL_RECEIPT') {
          fail(r.status);
          return;
        }
        receipt = Object.freeze({
          ...r.receipt,
          eventIds: Object.freeze([...r.receipt.eventIds]),
        });
        if (BigInt(r.authority.readback.worldVersion) > BigInt(floor))
          floor = r.authority.readback.worldVersion;
        await read();
      }),
  });
}
