import {
  AUTHENTICATED_CURRENT_SEAT_SCHEMA,
  AUTHENTICATED_COMMAND_RECOVERY_SCHEMA,
  AUTHENTICATED_FINANCIAL_INTAKE_SCHEMA,
  type AuthenticatedCurrentSeatRequestDto,
  type AuthenticatedCommandRecoveryRequestDto,
} from '@econmind/core';
import { AUTHENTICATED_OFFICE_COMMAND_SCHEMA } from '@econmind/core/authenticated-office-command-contract';
import { parseManualOfficeCommandRequest } from '@econmind/world-worker/office-command-intake';
import { parseStagedTransferRequest } from '../integration/staged-narrow-transfer-handler.js';
import {
  trackRequestCompletion,
  trackRequestCleanup,
} from './request-completion.js';
import type { ExplicitServerMetadata } from './explicit-read-preparation-config.js';
export const EXECUTOR_PATHS = Object.freeze({
  '/v1/office-command': 'https://executor.internal/internal/v1/office-command',
  '/v1/financial-intake':
    'https://executor.internal/internal/v1/financial-intake',
  '/v1/command-recovery':
    'https://executor.internal/internal/v1/command-recovery',
});
export type ExecutorPublicPath = keyof typeof EXECUTOR_PATHS;
export const TRANSPORT_VERSION = 'world-command-forward-v1';
export const ZERO_REQUEST_ID = '00000000-0000-4000-8000-000000000000';
export const uuid = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(
    v,
  );
export const record = (v: unknown): Record<string, unknown> | null =>
  v !== null && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
export function exact(
  v: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
): Record<string, unknown> {
  const r = record(v);
  if (
    !r ||
    required.some((k) => !Object.hasOwn(r, k)) ||
    Object.keys(r).some((k) => !required.includes(k) && !optional.includes(k))
  )
    throw new Error('INVALID_REQUEST');
  return r;
}
export function bearer(v: unknown): string {
  if (
    typeof v !== 'string' ||
    v.length > 8192 ||
    !/^Bearer [A-Za-z0-9._~-]+$/u.test(v)
  )
    throw new Error('AUTHENTICATION_INVALID');
  return v;
}
export function parseOfficeEnvelope(v: unknown) {
  const r = exact(v, ['schemaVersion', 'requestId', 'request']);
  if (
    r.schemaVersion !== AUTHENTICATED_OFFICE_COMMAND_SCHEMA ||
    !uuid(r.requestId)
  )
    throw new Error('INVALID_REQUEST');
  return {
    schemaVersion: AUTHENTICATED_OFFICE_COMMAND_SCHEMA,
    requestId: r.requestId,
    request: parseManualOfficeCommandRequest(r.request),
  };
}
export function parseRecoveryRequest(
  v: unknown,
): AuthenticatedCommandRecoveryRequestDto {
  const r = exact(v, ['schemaVersion', 'requestId', 'request']);
  if (
    r.schemaVersion !== AUTHENTICATED_COMMAND_RECOVERY_SCHEMA ||
    !uuid(r.requestId)
  )
    throw new Error('INVALID_REQUEST');
  const p = exact(
    r.request,
    ['worldId', 'commandId', 'idempotencyKey', 'originalRequest'],
    ['knownCommandFingerprint'],
  );
  const original = parseOfficeEnvelope(p.originalRequest),
    d = original.request;
  if (
    p.worldId !== d.worldId ||
    p.commandId !== d.commandId ||
    p.idempotencyKey !== d.idempotencyKey ||
    (p.knownCommandFingerprint !== undefined &&
      (typeof p.knownCommandFingerprint !== 'string' ||
        !/^sha256:[0-9a-f]{64}$/u.test(p.knownCommandFingerprint)))
  )
    throw new Error('INVALID_REQUEST');
  return {
    schemaVersion: AUTHENTICATED_COMMAND_RECOVERY_SCHEMA,
    requestId: r.requestId,
    request: {
      worldId: d.worldId,
      commandId: d.commandId,
      idempotencyKey: d.idempotencyKey,
      originalRequest: original,
      ...(p.knownCommandFingerprint === undefined
        ? {}
        : { knownCommandFingerprint: p.knownCommandFingerprint as string }),
    },
  };
}
export function parseCurrentSeatRequest(
  v: unknown,
): AuthenticatedCurrentSeatRequestDto {
  const r = exact(v, ['schemaVersion', 'requestId']);
  if (
    r.schemaVersion !== AUTHENTICATED_CURRENT_SEAT_SCHEMA ||
    !uuid(r.requestId)
  )
    throw new Error('INVALID_REQUEST');
  return {
    schemaVersion: AUTHENTICATED_CURRENT_SEAT_SCHEMA,
    requestId: r.requestId,
  };
}
export function parseForwardRequest(path: ExecutorPublicPath, v: unknown) {
  if (path === '/v1/office-command') return parseOfficeEnvelope(v);
  if (path === '/v1/command-recovery') return parseRecoveryRequest(v);
  const r = exact(v, ['schemaVersion', 'requestId', 'request']);
  if (
    r.schemaVersion !== AUTHENTICATED_FINANCIAL_INTAKE_SCHEMA ||
    !uuid(r.requestId)
  )
    throw new Error('INVALID_REQUEST');
  parseStagedTransferRequest(r.request);
  return {
    schemaVersion: AUTHENTICATED_FINANCIAL_INTAKE_SCHEMA,
    requestId: r.requestId,
    request: r.request,
  };
}
export class ExecutorTransportError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}
export function requestBudget(
  signal: AbortSignal,
  deadlineMs = Date.now() + 10000,
): {
  signal: AbortSignal;
  deadline: number;
  abort: () => void;
  close: () => void;
} {
  const controller = new AbortController(),
    deadline = Math.min(deadlineMs, Date.now() + 10000);
  const abort = () =>
    controller.abort(new ExecutorTransportError(499, 'CANCELLED'));
  signal.addEventListener('abort', abort, { once: true });
  if (signal.aborted) abort();
  const timer = setTimeout(
    () =>
      controller.abort(new ExecutorTransportError(504, 'UPSTREAM_UNAVAILABLE')),
    Math.max(0, deadline - Date.now()),
  );
  if (deadline <= Date.now())
    controller.abort(new ExecutorTransportError(504, 'UPSTREAM_UNAVAILABLE'));
  return {
    signal: controller.signal,
    deadline,
    abort: () => controller.abort(),
    close: () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
    },
  };
}
export async function awaitTransport<T>(
  operation: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  trackRequestCompletion(operation);
  if (signal.aborted)
    throw signal.reason ?? new ExecutorTransportError(499, 'CANCELLED');
  let abort: () => void = () => undefined;
  const cancelled = new Promise<never>((_resolve, reject) => {
    abort = () =>
      reject(signal.reason ?? new ExecutorTransportError(499, 'CANCELLED'));
    signal.addEventListener('abort', abort, { once: true });
  });
  try {
    return await Promise.race([operation, cancelled]);
  } finally {
    signal.removeEventListener('abort', abort);
  }
}
export async function boundedBytes(
  message: Request | Response,
  limit: number,
  signal: AbortSignal,
  bodyTimeout = false,
): Promise<Uint8Array> {
  const length = message.headers.get('content-length');
  if (
    length !== null &&
    (!/^(?:0|[1-9]\d*)$/u.test(length) || BigInt(length) > BigInt(limit))
  ) {
    if (message.body)
      trackRequestCleanup(message.body.cancel()).catch(() => undefined);
    throw new ExecutorTransportError(413, 'REQUEST_TOO_LARGE');
  }
  if (!message.body) return new Uint8Array();
  const reader = message.body.getReader(),
    chunks: Uint8Array[] = [];
  let size = 0,
    expired = false;
  const cancel = () => {
    trackRequestCleanup(reader.cancel()).catch(() => undefined);
  };
  const bodyController = new AbortController(),
    onAbort = () => bodyController.abort(signal.reason);
  signal.addEventListener('abort', onAbort, { once: true });
  if (signal.aborted) onAbort();
  const timer = bodyTimeout
    ? setTimeout(() => {
        expired = true;
        bodyController.abort(new ExecutorTransportError(408, 'BODY_TIMEOUT'));
      }, 5000)
    : undefined;
  bodyController.signal.addEventListener('abort', cancel, { once: true });
  try {
    for (;;) {
      const next = await awaitTransport(reader.read(), bodyController.signal);
      if (next.done) break;
      size += next.value.byteLength;
      if (size > limit)
        throw new ExecutorTransportError(413, 'REQUEST_TOO_LARGE');
      chunks.push(next.value);
    }
    if (bodyController.signal.aborted) throw bodyController.signal.reason;
    const bytes = new Uint8Array(size);
    let at = 0;
    for (const c of chunks) {
      bytes.set(c, at);
      at += c.length;
    }
    return bytes;
  } catch (error) {
    if (expired) throw new ExecutorTransportError(408, 'BODY_TIMEOUT');
    throw error;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    signal.removeEventListener('abort', onAbort);
    bodyController.signal.removeEventListener('abort', cancel);
    trackRequestCleanup(
      reader.cancel().finally(() => reader.releaseLock()),
    ).catch(() => undefined);
  }
}
export function jsonBytes(bytes: Uint8Array): unknown {
  try {
    return JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(bytes),
    ) as unknown;
  } catch {
    throw new Error('INVALID_REQUEST');
  }
}
export function schemaFor(path: ExecutorPublicPath) {
  return path === '/v1/office-command'
    ? AUTHENTICATED_OFFICE_COMMAND_SCHEMA
    : path === '/v1/financial-intake'
      ? AUTHENTICATED_FINANCIAL_INTAKE_SCHEMA
      : AUTHENTICATED_COMMAND_RECOVERY_SCHEMA;
}
export function responseJson(
  status: number,
  body: unknown,
  origin?: string,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
      ...(origin
        ? { 'access-control-allow-origin': origin, vary: 'Origin' }
        : {}),
    },
  });
}
export function transportFailure(
  path: ExecutorPublicPath,
  requestId: string,
  status: number,
  code: string,
  origin?: string,
) {
  return responseJson(
    status,
    {
      schemaVersion: schemaFor(path),
      requestId,
      ok: false,
      error: { code, retryable: false },
    },
    origin,
  );
}
const hash = (v: unknown) =>
  typeof v === 'string' && /^sha256:[0-9a-f]{64}$/u.test(v);
const canonicalId = (v: unknown) =>
  typeof v === 'string' &&
  v.length <= 256 &&
  /^[A-Z][A-Z0-9]*(?:[_-][A-Z0-9]+)*$/u.test(v);
const integer = (v: unknown) =>
  typeof v === 'string' &&
  /^(?:0|[1-9]\d{0,18})$/u.test(v) &&
  BigInt(v) <= 9223372036854775807n;
const timestamp = (v: unknown) =>
  typeof v === 'string' &&
  Number.isFinite(Date.parse(v)) &&
  new Date(v).toISOString() === v;
function shape(
  v: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  return (
    required.every((k) => Object.hasOwn(v, k)) &&
    Object.keys(v).every((k) => required.includes(k) || optional.includes(k))
  );
}
function sameCommand(
  v: Record<string, unknown>,
  request: Record<string, unknown>,
): boolean {
  return (
    v.commandId === request.commandId &&
    v.idempotencyKey === request.idempotencyKey &&
    hash(v.commandFingerprint) &&
    (request.knownCommandFingerprint === undefined ||
      v.commandFingerprint === request.knownCommandFingerprint) &&
    (request.commandFingerprint === undefined ||
      v.commandFingerprint === request.commandFingerprint)
  );
}
/** Wire consistency only. This is never a source, signature or commit issuer. */
function validReceipt(
  value: unknown,
  request: Record<string, unknown>,
  durable: boolean,
): boolean {
  const r = record(value);
  if (
    !r ||
    !shape(
      r,
      [
        'schemaVersion',
        'worldId',
        'commandId',
        'idempotencyKey',
        'commandFingerprint',
        'outcome',
        'reasonCode',
        'transitionId',
        'worldVersionBefore',
        'worldVersionAfter',
        'simTime',
        'eventIds',
        'recordedAtReal',
      ],
      durable ? ['source'] : [],
    ) ||
    (durable && r.source !== 'DURABLE_FINAL_COMMAND_RECEIPT') ||
    r.schemaVersion !== 'command-receipt-v2' ||
    r.worldId !== request.worldId ||
    !sameCommand(r, request) ||
    !integer(r.simTime) ||
    !timestamp(r.recordedAtReal) ||
    !Array.isArray(r.eventIds) ||
    r.eventIds.length > 1000 ||
    !r.eventIds.every(canonicalId) ||
    new Set(r.eventIds).size !== r.eventIds.length
  )
    return false;
  if (r.outcome === 'COMMITTED')
    return (
      r.reasonCode === null &&
      r.transitionId === request.commandId &&
      integer(r.worldVersionBefore) &&
      integer(r.worldVersionAfter) &&
      BigInt(r.worldVersionAfter as string) ===
        BigInt(r.worldVersionBefore as string) + 1n &&
      r.eventIds.length > 0
    );
  return (
    ['REJECTED', 'AUTHORIZATION_REVOKED'].includes(String(r.outcome)) &&
    canonicalId(r.reasonCode) &&
    r.transitionId === null &&
    r.worldVersionBefore === null &&
    r.worldVersionAfter === null &&
    r.eventIds.length === 0
  );
}
function validAuthority(
  value: unknown,
  request: Record<string, unknown>,
  subject: string,
  c: ExplicitServerMetadata,
): boolean {
  const a = record(value),
    i = record(a?.identity),
    s = record(a?.seed),
    b = record(a?.readback),
    p = c.admittedWorldPins;
  if (
    !a ||
    !i ||
    !s ||
    !b ||
    !shape(a, [
      'source',
      'capability',
      'seatRef',
      'seatState',
      'identity',
      'seed',
      'readback',
    ]) ||
    !shape(i, [
      'authSubjectId',
      'worldId',
      'countryId',
      'officeId',
      'scopeKey',
      'classification',
      'authorizationRevision',
      'modelVersion',
      'projectionVersion',
    ]) ||
    !shape(s, ['worldId', 'seedRef', 'contentHash', 'admissionRef']) ||
    !shape(b, [
      'worldId',
      'seedRef',
      'contentHash',
      'admissionRef',
      'worldVersion',
      'eventSequence',
      'readbackRef',
    ])
  )
    return false;
  return (
    a.source === 'SERVER_VERIFIED_READ_BINDING' &&
    a.capability === 'READ_AUTHORIZED_PROJECTION_AND_FINAL' &&
    a.seatState === 'ACTIVE' &&
    canonicalId(a.seatRef) &&
    i.authSubjectId === subject &&
    i.worldId === p.worldId &&
    i.countryId === request.countryId &&
    i.officeId === request.officeId &&
    i.classification === 'OFFICE_PRIVATE' &&
    i.scopeKey ===
      'OFFICE_' +
        Buffer.from(String(request.countryId)).toString('hex').toUpperCase() +
        '_' +
        Buffer.from(String(request.officeId)).toString('hex').toUpperCase() &&
    typeof i.authorizationRevision === 'string' &&
    i.authorizationRevision.trim() === i.authorizationRevision &&
    i.authorizationRevision.length > 0 &&
    i.authorizationRevision.length <= 256 &&
    i.modelVersion === c.modelVersion &&
    i.projectionVersion === 'world-projection-read-v1' &&
    [s, b].every(
      (x) =>
        x.worldId === p.worldId &&
        x.seedRef === p.seedRef &&
        x.contentHash === p.contentHash &&
        x.admissionRef === p.admissionRef,
    ) &&
    b.readbackRef === p.admissionRef &&
    integer(b.worldVersion) &&
    integer(b.eventSequence) &&
    BigInt(b.worldVersion as string) >= BigInt(p.minimumWorldVersion)
  );
}
export function validateReply(
  path: ExecutorPublicPath,
  v: unknown,
  requestId: string,
  intent: unknown,
  subject: string,
  c: ExplicitServerMetadata,
  status: number,
): boolean {
  const r = record(v),
    request = record(intent);
  if (
    !r ||
    !request ||
    r.schemaVersion !== schemaFor(path) ||
    r.requestId !== requestId ||
    typeof r.ok !== 'boolean' ||
    !shape(
      r,
      ['schemaVersion', 'requestId', 'ok'],
      ['error', 'state', 'authority'],
    ) ||
    (r.ok && (status < 200 || status >= 300)) ||
    (!r.ok && status < 400)
  )
    return false;
  const error = record(r.error),
    state = record(r.state);
  if (!r.ok) {
    if (path === '/v1/financial-intake' && state?.status === 'UNKNOWN')
      return (
        !r.error &&
        !r.authority &&
        shape(state, [
          'status',
          'action',
          'worldId',
          'commandId',
          'idempotencyKey',
          'retryable',
        ]) &&
        state.action === request.action &&
        state.worldId === request.worldId &&
        state.commandId === request.commandId &&
        state.idempotencyKey === request.idempotencyKey &&
        state.retryable === true
      );
    if (
      !error ||
      !shape(error, ['code', 'retryable']) ||
      typeof error.code !== 'string' ||
      !canonicalId(error.code) ||
      typeof error.retryable !== 'boolean' ||
      r.authority
    )
      return false;
    if (!state) return r.state === undefined;
    return (
      path === '/v1/office-command' &&
      shape(state, [
        'status',
        'reason',
        'commandType',
        'submitted',
        'queued',
        'missing',
      ]) &&
      state.status === 'REJECTED' &&
      state.reason === 'SOURCE_RUNTIME_UNAVAILABLE' &&
      state.commandType === request.commandType &&
      state.submitted === false &&
      state.queued === false &&
      Array.isArray(state.missing) &&
      state.missing.length > 0 &&
      state.missing.length <= 2 &&
      new Set(state.missing).size === state.missing.length &&
      state.missing.every((x) =>
        ['ADMITTED_DOMAIN_SOURCE', 'SOLE_DURABLE_CONSUMER'].includes(String(x)),
      )
    );
  }
  if (r.error !== undefined || !state) return false;
  if (path === '/v1/office-command')
    return (
      r.authority === undefined &&
      shape(state, [
        'status',
        'source',
        'commandType',
        'commandId',
        'commandFingerprint',
        'submitted',
        'queued',
      ]) &&
      ['QUEUED', 'EXECUTING', 'FINALIZED'].includes(String(state.status)) &&
      state.queued === true &&
      ((state.source === 'NEW' &&
        state.submitted === true &&
        state.status === 'QUEUED') ||
        (state.source === 'EXISTING' && state.submitted === false)) &&
      state.commandId === request.commandId &&
      state.commandType === request.commandType &&
      hash(state.commandFingerprint)
    );
  if (path === '/v1/command-recovery') {
    const original = record(record(request.originalRequest)?.request);
    if (
      r.authority !== undefined ||
      !original ||
      state.commandType !== original.commandType
    )
      return false;
    return state.status === 'FINAL'
      ? shape(state, ['status', 'commandType', 'receipt']) &&
          validReceipt(state.receipt, request, true)
      : shape(state, [
          'status',
          'commandType',
          'commandId',
          'idempotencyKey',
          'commandFingerprint',
        ]) &&
          ['QUEUED', 'CLAIMED'].includes(String(state.status)) &&
          sameCommand(state, request);
  }
  if (!validAuthority(r.authority, request, subject, c)) return false;
  if (state.status === 'NOT_FOUND') return shape(state, ['status']);
  if (state.status === 'UNKNOWN')
    return (
      shape(state, [
        'status',
        'worldId',
        'commandId',
        'idempotencyKey',
        'commandFingerprint',
        'retryable',
      ]) &&
      state.worldId === request.worldId &&
      sameCommand(state, request) &&
      state.retryable === true
    );
  if (state.status === 'INTENT')
    return (
      shape(state, [
        'status',
        'commandId',
        'idempotencyKey',
        'commandFingerprint',
        'expectedWorldVersion',
        'simTime',
        'payload',
      ]) &&
      sameCommand(state, request) &&
      integer(state.expectedWorldVersion) &&
      integer(state.simTime) &&
      record(state.payload) !== null
    );
  if (state.status === 'SIGNATURE_RECORDED')
    return (
      shape(state, ['status', 'officeId', 'commandFingerprint']) &&
      state.officeId === request.officeId &&
      hash(state.commandFingerprint) &&
      state.commandFingerprint === request.commandFingerprint
    );
  if (state.status === 'REFERENCE_BOUND')
    return (
      shape(state, [
        'status',
        'approvalRef',
        'proposalRef',
        'commandFingerprint',
      ]) &&
      state.approvalRef === 'APPROVAL_FINANCE_' + request.commandId &&
      state.proposalRef === 'BUYER_APPROVAL_' + request.commandId &&
      state.commandFingerprint === request.commandFingerprint
    );
  const a = record(state.acknowledgement);
  if (
    !a ||
    !shape(a, [
      'schemaVersion',
      'status',
      'worldId',
      'commandId',
      'commandFingerprint',
      'acceptedSimTime',
      'acceptedAtReal',
    ]) ||
    a.schemaVersion !== 'command-acceptance-v1' ||
    a.status !== 'ACCEPTED' ||
    a.worldId !== request.worldId ||
    a.commandId !== request.commandId ||
    !hash(a.commandFingerprint) ||
    (request.commandFingerprint !== undefined &&
      a.commandFingerprint !== request.commandFingerprint) ||
    !integer(a.acceptedSimTime) ||
    !timestamp(a.acceptedAtReal)
  )
    return false;
  if (state.status === 'FINAL')
    return (
      shape(state, ['status', 'acknowledgement', 'receipt']) &&
      validReceipt(
        state.receipt,
        { ...request, commandFingerprint: a.commandFingerprint },
        false,
      )
    );
  return (
    shape(state, ['status', 'acknowledgement']) &&
    ['PENDING_APPROVAL_OR_ENQUEUE', 'QUEUED', 'EXECUTING'].includes(
      String(state.status),
    )
  );
}
