import type {
  AuthorizedBrowserIdentity,
  BrowserCommandResult,
  BrowserReadResult,
} from '../authorized-client/client.js';
import type { CommandLifecycleState } from './CommandLifecycleStatus.js';

export interface AuthorizedUiInjection {
  readonly currentIdentity: AuthorizedBrowserIdentity | null;
  /** Local in-flight state only; never means server acceptance. */
  readonly pendingCommandId?: string | null;
  readonly read: {
    readonly identity: AuthorizedBrowserIdentity;
    readonly result: BrowserReadResult;
  } | null;
  readonly command: {
    readonly identity: AuthorizedBrowserIdentity;
    readonly commandId: string;
    readonly result: BrowserCommandResult;
  } | null;
}

export interface AuthorizedMetric {
  readonly id: string;
  readonly label: string;
  readonly canonicalValue: string;
  readonly displayValue: string;
  readonly unit: string;
  readonly changeLabel: string | null;
  readonly accessibleSummary: string;
}

export interface AuthorizedValueTrail {
  readonly metricId: string;
  readonly input: {
    readonly canonicalValue: string;
    readonly sourceRef: string;
  };
  readonly difference: {
    readonly canonicalValue: string;
    readonly label: string;
    readonly eventId: string;
    readonly eventVersion: string;
  };
  readonly output: {
    readonly canonicalValue: string;
    readonly snapshotVersion: string;
  };
}

export type AuthorizedReadState =
  | { readonly kind: 'UNAVAILABLE'; readonly reason: string }
  | {
      readonly kind: 'CURRENT';
      readonly countryId: string;
      readonly officeId: string;
      readonly worldVersion: string;
      readonly snapshotRef: string;
      readonly metrics: readonly AuthorizedMetric[];
      readonly trails: readonly AuthorizedValueTrail[];
    };

export interface AuthorizedUiState {
  readonly read: AuthorizedReadState;
  readonly command: CommandLifecycleState;
}

const canonicalId = /^[A-Z][A-Z0-9]*(?:[_-][A-Z0-9]+)*$/u;
const version = /^(?:0|[1-9]\d*)$/u;
const positiveVersion = /^[1-9]\d*$/u;
const integer = /^(?:0|[1-9]\d*|-[1-9]\d*)$/u;
const fingerprint = /^sha256:[0-9a-f]{64}$/u;
const reasonCode = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/u;
const timestamp =
  /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function sameAuthorizedIdentity(
  left: AuthorizedBrowserIdentity | null,
  right: AuthorizedBrowserIdentity,
): boolean {
  return (
    left !== null &&
    left.worldId === right.worldId &&
    left.countryId === right.countryId &&
    left.officeId === right.officeId &&
    left.scopeKey === right.scopeKey &&
    left.authSubjectId === right.authSubjectId &&
    left.authorizationRevision === right.authorizationRevision &&
    left.modelVersion === right.modelVersion &&
    left.projectionVersion === right.projectionVersion &&
    left.classification === right.classification
  );
}

function shortText(value: unknown, maximum = 160): value is string {
  return (
    typeof value === 'string' && value.length > 0 && value.length <= maximum
  );
}

function parseMetric(value: unknown): AuthorizedMetric | null {
  const item = record(value);
  if (
    !item ||
    !shortText(item.id, 64) ||
    !canonicalId.test(item.id) ||
    !shortText(item.label) ||
    !shortText(item.canonicalValue, 80) ||
    !integer.test(item.canonicalValue) ||
    !shortText(item.displayValue, 80) ||
    !shortText(item.unit, 40) ||
    !(item.changeLabel === null || shortText(item.changeLabel, 80)) ||
    !shortText(item.accessibleSummary, 320)
  )
    return null;
  return {
    id: item.id,
    label: item.label,
    canonicalValue: item.canonicalValue,
    displayValue: item.displayValue,
    unit: item.unit,
    changeLabel: item.changeLabel as string | null,
    accessibleSummary: item.accessibleSummary,
  };
}

function parseTrail(
  value: unknown,
  metric: AuthorizedMetric,
  worldVersion: string,
): AuthorizedValueTrail | null {
  const item = record(value);
  const input = record(item?.input);
  const difference = record(item?.difference);
  const output = record(item?.output);
  if (
    !item ||
    item.metricId !== metric.id ||
    !input ||
    !difference ||
    !output ||
    !shortText(input.canonicalValue, 80) ||
    !integer.test(input.canonicalValue) ||
    !shortText(input.sourceRef, 160) ||
    !shortText(difference.canonicalValue, 80) ||
    !integer.test(difference.canonicalValue) ||
    !shortText(difference.label) ||
    !shortText(difference.eventId, 80) ||
    !canonicalId.test(difference.eventId) ||
    !shortText(difference.eventVersion, 80) ||
    !version.test(difference.eventVersion) ||
    BigInt(difference.eventVersion) > BigInt(worldVersion) ||
    !shortText(output.canonicalValue, 80) ||
    !integer.test(output.canonicalValue) ||
    output.snapshotVersion !== worldVersion ||
    output.canonicalValue !== metric.canonicalValue ||
    BigInt(input.canonicalValue) + BigInt(difference.canonicalValue) !==
      BigInt(output.canonicalValue)
  )
    return null;
  return {
    metricId: metric.id,
    input: { canonicalValue: input.canonicalValue, sourceRef: input.sourceRef },
    difference: {
      canonicalValue: difference.canonicalValue,
      label: difference.label,
      eventId: difference.eventId,
      eventVersion: difference.eventVersion,
    },
    output: {
      canonicalValue: output.canonicalValue,
      snapshotVersion: worldVersion,
    },
  };
}

function parseProjection(
  payload: unknown,
  identity: AuthorizedBrowserIdentity,
  result: Extract<BrowserReadResult, { readonly status: 'PROJECTION' }>,
): AuthorizedReadState {
  const input = record(payload);
  if (
    !input ||
    input.schemaVersion !== 'g02-derived-read-v1' ||
    input.worldId !== identity.worldId ||
    input.countryId !== identity.countryId ||
    input.officeId !== identity.officeId ||
    input.scopeKey !== identity.scopeKey ||
    input.authSubjectId !== identity.authSubjectId ||
    input.authorizationRevision !== identity.authorizationRevision ||
    input.modelVersion !== identity.modelVersion ||
    input.projectionVersion !== identity.projectionVersion ||
    input.classification !== identity.classification ||
    input.worldVersion !== result.worldVersion ||
    input.snapshotRef !== result.snapshotRef ||
    !version.test(result.worldVersion) ||
    !shortText(result.snapshotRef, 160) ||
    !Array.isArray(input.metrics) ||
    input.metrics.length === 0 ||
    input.metrics.length > 40 ||
    !Array.isArray(input.trails) ||
    input.trails.length > 40
  )
    return {
      kind: 'UNAVAILABLE',
      reason: 'No current G02 derived projection is available.',
    };
  const metrics = input.metrics.map(parseMetric);
  if (metrics.some((item) => item === null)) {
    return {
      kind: 'UNAVAILABLE',
      reason: 'The G02 projection could not be verified.',
    };
  }
  const validMetrics = metrics as AuthorizedMetric[];
  const metricMap = new Map(validMetrics.map((item) => [item.id, item]));
  if (metricMap.size !== validMetrics.length) {
    return {
      kind: 'UNAVAILABLE',
      reason: 'The G02 projection has duplicate signals.',
    };
  }
  const trails = input.trails.map((value: unknown) => {
    const item = record(value);
    const metric = metricMap.get(String(item?.metricId));
    return metric ? parseTrail(value, metric, result.worldVersion) : null;
  });
  if (
    trails.some((item) => item === null) ||
    new Set(trails.map((item) => item?.metricId)).size !== trails.length
  ) {
    return {
      kind: 'UNAVAILABLE',
      reason: 'The G02 value evidence could not be verified.',
    };
  }
  return {
    kind: 'CURRENT',
    countryId: identity.countryId,
    officeId: identity.officeId,
    worldVersion: result.worldVersion,
    snapshotRef: result.snapshotRef,
    metrics: validMetrics,
    trails: trails as AuthorizedValueTrail[],
  };
}

function commandState(injection: AuthorizedUiInjection): CommandLifecycleState {
  if (injection.pendingCommandId) {
    if (
      !injection.currentIdentity ||
      !canonicalId.test(injection.pendingCommandId)
    ) {
      return {
        source: 'AUTHORIZED_READ_MODEL',
        kind: 'UNAVAILABLE',
        reason: 'The in-flight Command reference is invalid.',
      };
    }
    return {
      source: 'AUTHORIZED_READ_MODEL',
      kind: 'SENDING_UNCONFIRMED',
      commandId: injection.pendingCommandId,
    };
  }
  const command = injection.command;
  if (
    !command ||
    !sameAuthorizedIdentity(injection.currentIdentity, command.identity)
  ) {
    return {
      source: 'AUTHORIZED_READ_MODEL',
      kind: 'UNAVAILABLE',
      reason: 'No current Command result is supplied.',
    };
  }
  if (!canonicalId.test(command.commandId)) {
    return {
      source: 'AUTHORIZED_READ_MODEL',
      kind: 'UNAVAILABLE',
      reason: 'The Command reference is invalid.',
    };
  }
  const result = command.result;
  switch (result.status) {
    case 'UNKNOWN':
      return {
        source: 'AUTHORIZED_READ_MODEL',
        kind: 'UNKNOWN_OUTCOME',
        commandId: command.commandId,
      };
    case 'FINAL_RECEIPT':
      if (
        result.receipt.source !== 'DURABLE_FINAL_COMMAND_RECEIPT' ||
        result.receipt.commandId !== command.commandId ||
        result.receipt.worldId !== command.identity.worldId ||
        !canonicalId.test(result.receipt.idempotencyKey) ||
        !fingerprint.test(result.receipt.commandFingerprint) ||
        !timestamp.test(result.receipt.recordedAtReal) ||
        !['COMMITTED', 'REJECTED', 'AUTHORIZATION_REVOKED'].includes(
          result.receipt.outcome,
        ) ||
        !Array.isArray(result.receipt.eventIds) ||
        result.receipt.eventIds.length > 1000 ||
        !result.receipt.eventIds.every((id) => canonicalId.test(id)) ||
        new Set(result.receipt.eventIds).size !==
          result.receipt.eventIds.length ||
        (result.receipt.outcome === 'COMMITTED' &&
          (result.receipt.worldVersionAfter === null ||
            !positiveVersion.test(result.receipt.worldVersionAfter) ||
            result.receipt.reasonCode !== null ||
            result.receipt.eventIds.length === 0)) ||
        (result.receipt.outcome !== 'COMMITTED' &&
          (result.receipt.worldVersionAfter !== null ||
            !shortText(result.receipt.reasonCode, 80) ||
            !reasonCode.test(result.receipt.reasonCode) ||
            result.receipt.eventIds.length !== 0))
      ) {
        return {
          source: 'AUTHORIZED_READ_MODEL',
          kind: 'UNAVAILABLE',
          reason: 'The final receipt does not match this Command.',
        };
      }
      if (result.receipt.outcome === 'COMMITTED') {
        return {
          source: 'AUTHORIZED_READ_MODEL',
          kind: 'SUCCEEDED',
          receipt: {
            outcome: 'COMMITTED',
            commandId: command.commandId,
            worldVersionAfter: result.receipt.worldVersionAfter,
            eventIds: result.receipt.eventIds,
          },
        };
      }
      if (result.receipt.outcome === 'REJECTED') {
        return {
          source: 'AUTHORIZED_READ_MODEL',
          kind: 'REJECTED',
          receipt: {
            outcome: 'REJECTED',
            commandId: command.commandId,
            reasonCode: result.receipt.reasonCode,
          },
        };
      }
      return {
        source: 'AUTHORIZED_READ_MODEL',
        kind: 'AUTHORIZATION_REVOKED',
        reason: 'The final receipt revoked this Office authorization.',
      };
    case 'STALE':
      return {
        source: 'AUTHORIZED_READ_MODEL',
        kind: 'UNAVAILABLE',
        reason: 'Command result is stale. Refresh authorization.',
      };
    case 'DENIED':
      return {
        source: 'AUTHORIZED_READ_MODEL',
        kind: 'AUTHORIZATION_REVOKED',
        reason: 'This Office no longer has access.',
      };
    case 'UNAVAILABLE':
      return {
        source: 'AUTHORIZED_READ_MODEL',
        kind: 'UNAVAILABLE',
        reason: `Command result unavailable: ${result.reason}.`,
      };
  }
}

/** Display binding only. The F client and server remain responsible for authorization. */
export function resolveAuthorizedUi(
  injection: AuthorizedUiInjection,
): AuthorizedUiState {
  const read = injection.read;
  const accessDenied =
    read !== null &&
    sameAuthorizedIdentity(injection.currentIdentity, read.identity) &&
    read.result.status === 'DENIED';
  const command: CommandLifecycleState = accessDenied
    ? {
        source: 'AUTHORIZED_READ_MODEL',
        kind: 'AUTHORIZATION_REVOKED',
        reason: 'This Office no longer has access.',
      }
    : commandState(injection);
  let readState: AuthorizedReadState = {
    kind: 'UNAVAILABLE',
    reason: 'No current authorized projection is supplied.',
  };
  if (
    injection.currentIdentity &&
    read &&
    sameAuthorizedIdentity(injection.currentIdentity, read.identity)
  ) {
    const result = read.result;
    if (
      result.status === 'PROJECTION' &&
      result.source === 'DERIVED_SERVER_PROJECTION'
    ) {
      readState = parseProjection(
        result.payload,
        injection.currentIdentity,
        result,
      );
    } else {
      readState = {
        kind: 'UNAVAILABLE',
        reason:
          'The authorized projection is unavailable or no longer current.',
      };
    }
  }
  if (
    command.kind === 'SENDING_UNCONFIRMED' ||
    command.kind === 'UNKNOWN_OUTCOME' ||
    command.kind === 'AUTHORIZATION_REVOKED' ||
    (command.kind === 'SUCCEEDED' &&
      readState.kind === 'CURRENT' &&
      command.receipt.worldVersionAfter !== null &&
      BigInt(command.receipt.worldVersionAfter) >
        BigInt(readState.worldVersion))
  ) {
    readState = {
      kind: 'UNAVAILABLE',
      reason: 'Refresh the authorized projection before reading values.',
    };
  }
  return { read: readState, command };
}
