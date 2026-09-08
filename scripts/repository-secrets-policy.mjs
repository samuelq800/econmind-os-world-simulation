const SENSITIVE_PATTERNS = [
  { name: 'Supabase secret key', pattern: /sb_secret_[A-Za-z0-9_-]{16,}/u },
  {
    name: 'JWT-like credential',
    pattern: /eyJ[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}/u,
  },
  {
    name: 'private key material',
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u,
  },
];

export function findSensitivePatterns(source) {
  return SENSITIVE_PATTERNS.flatMap(({ name, pattern }) =>
    pattern.test(source) ? [name] : [],
  );
}
