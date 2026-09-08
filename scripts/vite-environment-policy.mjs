// Explicitly approved public configuration only. New keys require a deliberate
// contract change plus semantic validation; unknown VITE_* keys fail closed.
const PUBLIC_CLIENT_ENV = new Map([
  ['VITE_WORLD_API_URL', 'http-endpoint'],
  ['VITE_WORLD_API_BASE_URL', 'http-endpoint'],
  ['VITE_SUPABASE_ANON_KEY', 'anonymous-jwt'],
  ['VITE_SUPABASE_PUBLISHABLE_KEY', 'publishable-key'],
  // Vite creates this from dotenv NODE_ENV. It is not an application secret.
  ['VITE_USER_NODE_ENV', 'vite-node-env'],
]);

function decodedText(value) {
  let decoded = value;
  for (;;) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      return null;
    }
  }
  return decoded;
}

function decodedJwt(value) {
  const parts = value.split('.');
  if (
    parts.length !== 3 ||
    parts.some((part) => !/^[A-Za-z0-9_-]+$/u.test(part))
  ) {
    return null;
  }
  try {
    const header = JSON.parse(
      Buffer.from(parts[0], 'base64url').toString('utf8'),
    );
    const payload = JSON.parse(
      Buffer.from(parts[1], 'base64url').toString('utf8'),
    );
    return header &&
      typeof header === 'object' &&
      payload &&
      typeof payload === 'object'
      ? { header, payload }
      : null;
  } catch {
    return null;
  }
}

function unsafeValueReason(value) {
  const decoded = decodedText(value);
  if (decoded === null) return 'INVALID_PUBLIC_VALUE_ENCODING';
  if (
    /(?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|redis):\/\//iu.test(
      decoded,
    )
  ) {
    return 'DATABASE_CONNECTION_STRING';
  }
  if (/-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----/u.test(decoded)) {
    return 'PRIVATE_KEY_MATERIAL';
  }
  if (
    /\bsb_secret_[A-Za-z0-9_-]+/u.test(decoded) ||
    /\bBearer\s+\S+/iu.test(decoded) ||
    /(?:^|[?&;\s])(?:password|secret|admin_token|access_token|api_key)\s*=/iu.test(
      decoded,
    )
  ) {
    return 'SERVER_CREDENTIAL';
  }
  const jwtCandidates =
    decoded.match(
      /(?<![A-Za-z0-9_-])[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+(?![A-Za-z0-9_-])/gu,
    ) ?? [];
  if (
    jwtCandidates.some((token) => {
      const parsed = decodedJwt(token);
      return parsed !== null && parsed.payload.role !== 'anon';
    })
  ) {
    return 'SERVER_AUTHENTICATION_TOKEN';
  }
  return null;
}

function serverKeyCategory(name) {
  // Token boundaries avoid matching harmless words such as DATABASELINE. These
  // categories explain rejections; the allowlist, not these patterns, permits keys.
  if (/(?:^|_)SERVICE_ROLE(?:_|$)/u.test(name))
    return 'Supabase service-role credential';
  if (
    /(?:^|_)(?:DATABASE|DB|POSTGRES|PRIVATE_KEY|SERVER_SECRET|ADMIN_TOKEN|SUPABASE_SECRET)(?:_|$)/u.test(
      name,
    )
  ) {
    return 'SERVER_ONLY_KEY';
  }
  return null;
}

function publicValueReason(kind, value) {
  if (kind === 'http-endpoint') {
    let url;
    try {
      url = new URL(value);
    } catch {
      return 'INVALID_PUBLIC_API_URL';
    }
    if (!['http:', 'https:'].includes(url.protocol))
      return 'INVALID_PUBLIC_API_PROTOCOL';
    if (url.username || url.password) return 'URL_CONTAINS_CREDENTIALS';
    if (url.search || url.hash)
      return 'PUBLIC_API_URL_MUST_NOT_CONTAIN_QUERY_OR_FRAGMENT';
    if (value.trim() !== value || /[\r\n\t]/u.test(value))
      return 'INVALID_PUBLIC_API_URL';
    return null;
  }
  if (kind === 'anonymous-jwt') {
    const token = decodedJwt(value);
    return token?.header.alg === 'HS256' && token.payload.role === 'anon'
      ? null
      : 'INVALID_PUBLIC_ANON_KEY';
  }
  if (kind === 'publishable-key') {
    return /^sb_publishable_[A-Za-z0-9_-]{16,}$/u.test(value)
      ? null
      : 'INVALID_PUBLIC_PUBLISHABLE_KEY';
  }
  return ['development', 'production', 'test'].includes(value)
    ? null
    : 'INVALID_VITE_NODE_ENV';
}

export function findForbiddenBrowserVariables(environment) {
  return Object.entries(environment)
    .filter(([name]) => name.startsWith('VITE_'))
    .flatMap(([name, value]) => {
      const kind = PUBLIC_CLIENT_ENV.get(name);
      const category =
        typeof value !== 'string'
          ? 'INVALID_PUBLIC_VALUE'
          : (serverKeyCategory(name) ??
            unsafeValueReason(value) ??
            (kind ? publicValueReason(kind, value) : 'UNAPPROVED_PUBLIC_KEY'));
      return category ? [{ name, category }] : [];
    });
}

export function assertSafeViteEnvironment(environment, context) {
  const violations = findForbiddenBrowserVariables(environment);
  if (violations.length === 0) return;
  const names = violations
    .map(({ name, category }) => `${name} reason=${category}`)
    .join(', ');
  throw new Error(
    `[VITE_ENV_UNSAFE] FORBIDDEN_BROWSER_ENV ${context}: ${names}. Values omitted.`,
  );
}
