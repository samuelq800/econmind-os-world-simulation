const FORBIDDEN_BROWSER_VARIABLE_RULES = [
  {
    category: 'Supabase service-role credential',
    pattern: /^VITE_.*(?:SUPABASE_)?SERVICE_ROLE(?:_|$)/u,
  },
  {
    category: 'Supabase server secret',
    pattern: /^VITE_.*SUPABASE_SECRET(?:_|$)/u,
  },
  {
    category: 'database administrative credential',
    pattern: /^VITE_(?:DATABASE_URL|DB_(?:PASSWORD|ADMIN|ROOT)|POSTGRES_)/u,
  },
  {
    category: 'private key',
    pattern: /^VITE_.*PRIVATE_KEY(?:_|$)/u,
  },
  {
    category: 'server-only credential',
    pattern:
      /^VITE_(?:SERVER_ONLY|SERVER|ADMIN|ROOT|SUPERUSER|INTERNAL).*?(?:TOKEN|SECRET|KEY|PASSWORD|CREDENTIAL)(?:_|$)/u,
  },
];

export function findForbiddenBrowserVariables(environment) {
  return Object.keys(environment)
    .filter((name) => name.startsWith('VITE_'))
    .flatMap((name) => {
      const rule = FORBIDDEN_BROWSER_VARIABLE_RULES.find(({ pattern }) =>
        pattern.test(name),
      );
      return rule ? [{ name, category: rule.category }] : [];
    });
}

export function assertSafeViteEnvironment(environment, context) {
  const violations = findForbiddenBrowserVariables(environment);
  if (violations.length === 0) {
    return;
  }

  const names = violations
    .map(({ name, category }) => `${name} (${category})`)
    .join(', ');
  throw new Error(
    `[VITE_ENV_UNSAFE] ${context}: forbidden browser environment variable(s): ${names}. Values omitted.`,
  );
}
