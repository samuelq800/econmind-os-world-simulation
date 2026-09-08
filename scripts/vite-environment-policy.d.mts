export interface BrowserEnvironmentViolation {
  readonly name: string;
  readonly category: string;
}

export function findForbiddenBrowserVariables(
  environment: Readonly<Record<string, string>>,
): BrowserEnvironmentViolation[];

export function assertSafeViteEnvironment(
  environment: Readonly<Record<string, string>>,
  context: string,
): void;
