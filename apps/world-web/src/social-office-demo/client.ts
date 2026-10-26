import {
  parseSocialDemoProjection,
  parseSocialDemoReceipt,
  type SocialDemoProjection,
  type SocialDemoReceipt,
  type SocialDemoRequest,
} from './contract.js';

export interface SocialDemoClient {
  session(signal?: AbortSignal): Promise<void>;
  projection(signal?: AbortSignal): Promise<Readonly<SocialDemoProjection>>;
  command(
    request: SocialDemoRequest,
    signal?: AbortSignal,
  ): Promise<Readonly<SocialDemoReceipt>>;
  receipt(
    requestId: string,
    signal?: AbortSignal,
  ): Promise<Readonly<SocialDemoReceipt>>;
}
/** Dedicated same-origin loopback session. Bearer tokens remain in this closure only. */
export function createSocialDemoClient(
  origin: string,
  fetcher: typeof fetch = fetch,
): SocialDemoClient {
  const base = new URL(origin);
  if (
    base.protocol !== 'http:' ||
    base.hostname !== '127.0.0.1' ||
    !base.port ||
    base.origin !== origin ||
    base.username ||
    base.password
  )
    throw Error(
      'This demonstration connects only to its isolated loopback host',
    );
  let authorization: string | null = null;
  async function request(
    path: string,
    method: 'GET' | 'POST',
    body: unknown,
    signal?: AbortSignal,
  ): Promise<unknown> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (authorization !== null) headers.Authorization = authorization;
    if (body !== null) headers['Content-Type'] = 'application/json';
    const response = await fetcher(
      `${origin}/isolated/v1/social-office/${path}`,
      {
        method,
        headers,
        credentials: 'omit',
        cache: 'no-store',
        redirect: 'error',
        ...(body !== null ? { body: JSON.stringify(body) } : {}),
        signal: signal ?? AbortSignal.timeout(10000),
      },
    );
    if (!response.ok)
      throw Error(
        response.status === 401 || response.status === 403
          ? 'Current identity or permission is no longer valid'
          : `Demonstration service unavailable (${response.status})`,
      );
    if (
      !(response.headers.get('content-type') ?? '').startsWith(
        'application/json',
      )
    )
      throw Error('Invalid demonstration response format');
    const raw = await response.text();
    if (raw.length > 262144)
      throw Error('Demonstration response exceeded its bound');
    return JSON.parse(raw) as unknown;
  }
  return Object.freeze({
    async session(signal?: AbortSignal) {
      const value = (await request('session', 'POST', {}, signal)) as Record<
        string,
        unknown
      >;
      if (
        !value ||
        Object.keys(value).sort().join('|') !== 'authorization|schemaVersion' ||
        value.schemaVersion !== 'g-social-office-session-v1' ||
        typeof value.authorization !== 'string' ||
        !/^Bearer [A-Za-z0-9._-]+$/u.test(value.authorization)
      )
        throw Error('Invalid demonstration session');
      authorization = value.authorization;
    },
    async projection(signal?: AbortSignal) {
      return parseSocialDemoProjection(
        await request('projection', 'GET', null, signal),
      );
    },
    async command(value: SocialDemoRequest, signal?: AbortSignal) {
      const r = parseSocialDemoReceipt(
        await request('command', 'POST', value, signal),
      );
      if (r.requestId !== value.requestId)
        throw Error('Receipt does not belong to the original request');
      return r;
    },
    async receipt(requestId: string, signal?: AbortSignal) {
      if (!/^[a-f0-9-]{36}$/u.test(requestId))
        throw Error('Invalid original request identity');
      const r = parseSocialDemoReceipt(
        await request(
          `receipt?requestId=${encodeURIComponent(requestId)}`,
          'GET',
          null,
          signal,
        ),
      );
      if (r.requestId !== requestId)
        throw Error('Receipt does not belong to the original request');
      return r;
    },
  });
}
