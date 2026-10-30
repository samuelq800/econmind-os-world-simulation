/** Test-only diagnostics; never source or execution authority. */
export function isExactColdFxSourceRevocation(error: unknown): boolean;
export function wireColdError(
  error: unknown,
): Readonly<Record<string, unknown>>;
