/** Explicit bounded operator choices. No caller supplies a water amount,
 * entitlement, actor or clock; the registered publisher derives all of them. */
export type RegisteredNodeAction =
  | Readonly<{ kind: 'HTTP' }>
  | Readonly<{ kind: 'CONSUME'; maxSteps: number }>
  | Readonly<{
      kind: 'PUBLISH_WATER_GRANT';
      scope: Readonly<{
        countryId: string;
        facilityId: string;
        runId: string;
      }>;
    }>;

export function parseRegisteredNodeArguments(
  args: readonly string[],
): Readonly<{
  configurationPath: string;
  action: RegisteredNodeAction;
}> {
  const configurationPath = args[0];
  if (!configurationPath?.startsWith('/'))
    throw Error('ABSOLUTE_NODE_CONFIGURATION_PATH_REQUIRED');
  if (args.length === 1) return { configurationPath, action: { kind: 'HTTP' } };
  if (
    args.length === 3 &&
    args[1] === '--consume' &&
    /^[1-9][0-9]{0,3}$/u.test(args[2]!) &&
    Number(args[2]) <= 1000
  )
    return {
      configurationPath,
      action: { kind: 'CONSUME', maxSteps: Number(args[2]) },
    };
  if (
    args.length === 5 &&
    args[1] === '--publish-water-grant' &&
    /^COUNTRY_(0[1-9]|[1-6][0-9]|70)$/u.test(args[2]!) &&
    /^[A-Z][A-Z0-9_-]{0,255}$/u.test(args[3]!) &&
    /^[A-Z][A-Z0-9_-]{0,255}$/u.test(args[4]!)
  )
    return {
      configurationPath,
      action: {
        kind: 'PUBLISH_WATER_GRANT',
        scope: {
          countryId: args[2]!,
          facilityId: args[3]!,
          runId: args[4]!,
        },
      },
    };
  throw Error('EXPLICIT_REGISTERED_NODE_ACTION_REQUIRED');
}
