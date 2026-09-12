import {
  parseWorldReadResponse,
  type WorldProjectionDto,
  type WorldReadErrorCode,
  type WorldReadRequestEnvelope,
} from './contracts.js';

export interface WorldReadTransport {
  send(
    request: WorldReadRequestEnvelope,
    signal: AbortSignal,
  ): Promise<unknown>;
}

export interface WorldReadRetryPolicy {
  readonly maxAttempts: number;
  readonly timeoutMs: number;
  readonly retryDelayMs: number;
}

export class WorldReadFailure extends Error {
  readonly code: WorldReadErrorCode;
  readonly retryable: boolean;

  constructor(code: WorldReadErrorCode, message: string, retryable: boolean) {
    super(message);
    this.name = 'WorldReadFailure';
    this.code = code;
    this.retryable = retryable;
  }
}

export class OfflineWorldReadTransport implements WorldReadTransport {
  async send(): Promise<never> {
    throw new WorldReadFailure(
      'OFFLINE',
      'World read transport is offline',
      false,
    );
  }
}

export class FixtureWorldReadTransport implements WorldReadTransport {
  readonly requests: WorldReadRequestEnvelope[] = [];

  constructor(
    private readonly handler: (
      request: WorldReadRequestEnvelope,
      signal: AbortSignal,
    ) => Promise<unknown> | unknown,
  ) {}

  async send(
    request: WorldReadRequestEnvelope,
    signal: AbortSignal,
  ): Promise<unknown> {
    this.requests.push(request);
    return this.handler(request, signal);
  }
}

function localMockOrigin(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('LOCAL_MOCK_URL_INVALID');
  }
  const loopback =
    url.hostname === '127.0.0.1' ||
    url.hostname === 'localhost' ||
    url.hostname === '::1' ||
    url.hostname === '[::1]';
  if (
    url.protocol !== 'http:' ||
    !loopback ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname !== '/' && url.pathname !== '')
  ) {
    throw new Error('LOCAL_MOCK_URL_MUST_BE_LOOPBACK_HTTP_ORIGIN');
  }
  return url;
}

/**
 * Preparation-only HTTP transport. It is structurally incapable of reaching
 * Supabase or another non-loopback host and never accepts auth/key headers.
 */
export class LocalMockHttpWorldReadTransport implements WorldReadTransport {
  private readonly endpoint: URL;

  constructor(
    origin: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {
    this.endpoint = new URL('/__mock/world-read', localMockOrigin(origin));
  }

  async send(
    request: WorldReadRequestEnvelope,
    signal: AbortSignal,
  ): Promise<unknown> {
    const response = await this.fetcher(this.endpoint, {
      method: 'POST',
      redirect: 'error',
      cache: 'no-store',
      credentials: 'omit',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
      signal,
    });
    const contentLength = response.headers.get('content-length');
    if (contentLength !== null && Number(contentLength) > 1_048_576) {
      throw new WorldReadFailure(
        'PROTOCOL_ERROR',
        'Mock response exceeds the one MiB contract limit',
        false,
      );
    }
    if (!response.ok) {
      throw new WorldReadFailure(
        response.status === 429 ? 'RATE_LIMITED' : 'UPSTREAM_UNAVAILABLE',
        `Mock transport returned HTTP ${response.status}`,
        response.status === 429 || response.status >= 500,
      );
    }
    const text = await response.text();
    if (Buffer.byteLength(text) > 1_048_576) {
      throw new WorldReadFailure(
        'PROTOCOL_ERROR',
        'Mock response exceeds the one MiB contract limit',
        false,
      );
    }
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new WorldReadFailure(
        'PROTOCOL_ERROR',
        'Mock response is not JSON',
        false,
      );
    }
  }
}

function validatePolicy(policy: WorldReadRetryPolicy) {
  if (
    !Number.isSafeInteger(policy.maxAttempts) ||
    policy.maxAttempts < 1 ||
    policy.maxAttempts > 3
  ) {
    throw new Error('maxAttempts must be an integer from 1 to 3');
  }
  if (
    !Number.isSafeInteger(policy.timeoutMs) ||
    policy.timeoutMs < 1 ||
    policy.timeoutMs > 30_000
  ) {
    throw new Error('timeoutMs must be an integer from 1 to 30000');
  }
  if (
    !Number.isSafeInteger(policy.retryDelayMs) ||
    policy.retryDelayMs < 0 ||
    policy.retryDelayMs > 1_000
  ) {
    throw new Error('retryDelayMs must be an integer from 0 to 1000');
  }
}

function normalizeFailure(
  error: unknown,
  parentAborted: boolean,
  timedOut: boolean,
): WorldReadFailure {
  if (parentAborted) {
    return new WorldReadFailure('CANCELLED', 'World read cancelled', false);
  }
  if (timedOut) {
    return new WorldReadFailure('TIMEOUT', 'World read timed out', true);
  }
  if (error instanceof WorldReadFailure) return error;
  if (error instanceof TypeError) {
    return new WorldReadFailure(
      'UPSTREAM_UNAVAILABLE',
      'World read transport unavailable',
      true,
    );
  }
  return new WorldReadFailure('UNKNOWN', 'World read failed', false);
}

async function waitForRetry(milliseconds: number, signal?: AbortSignal) {
  if (milliseconds === 0) return;
  await new Promise<void>((resolve, reject) => {
    const complete = () => {
      signal?.removeEventListener('abort', cancel);
      resolve();
    };
    const timeout = setTimeout(complete, milliseconds);
    const cancel = () => {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', cancel);
      reject(new WorldReadFailure('CANCELLED', 'World read cancelled', false));
    };
    if (signal?.aborted) cancel();
    else signal?.addEventListener('abort', cancel, { once: true });
  });
}

export async function executeWorldProjectionRead(input: {
  readonly transport: WorldReadTransport;
  readonly request: WorldReadRequestEnvelope;
  readonly policy: WorldReadRetryPolicy;
  readonly signal?: AbortSignal;
}): Promise<WorldProjectionDto> {
  validatePolicy(input.policy);
  let finalFailure: WorldReadFailure | undefined;
  for (let attempt = 1; attempt <= input.policy.maxAttempts; attempt += 1) {
    const controller = new AbortController();
    let timedOut = false;
    const cancel = () => controller.abort();
    if (input.signal?.aborted) controller.abort();
    else input.signal?.addEventListener('abort', cancel, { once: true });
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, input.policy.timeoutMs);
    try {
      if (controller.signal.aborted) {
        throw new WorldReadFailure(
          'CANCELLED',
          'World read cancelled',
          false,
        );
      }
      const rawResponse = await input.transport.send(
        input.request,
        controller.signal,
      );
      let response;
      try {
        response = parseWorldReadResponse(rawResponse);
      } catch {
        throw new WorldReadFailure(
          'PROTOCOL_ERROR',
          'World read response violates the protocol',
          false,
        );
      }
      if (response.requestId !== input.request.requestId) {
        throw new WorldReadFailure(
          'PROTOCOL_ERROR',
          'Response requestId does not match request',
          false,
        );
      }
      if (response.ok) return response.data;
      throw new WorldReadFailure(
        response.error.code,
        response.error.message,
        response.error.retryable,
      );
    } catch (error) {
      finalFailure = normalizeFailure(
        error,
        input.signal?.aborted ?? false,
        timedOut,
      );
    } finally {
      clearTimeout(timeout);
      input.signal?.removeEventListener('abort', cancel);
    }
    if (!finalFailure.retryable || attempt === input.policy.maxAttempts) {
      throw finalFailure;
    }
    await waitForRetry(input.policy.retryDelayMs, input.signal);
  }
  throw (
    finalFailure ?? new WorldReadFailure('UNKNOWN', 'World read failed', false)
  );
}
