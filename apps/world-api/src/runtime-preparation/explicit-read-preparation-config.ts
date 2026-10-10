import { WORLD_MODEL_VERSION } from '@econmind/core';
import type { createNonactivatedRuntimeReadHost } from '../integration/nonactivated-runtime-read-host.js';
import { createPersistedReadBindingConsumer } from '../integration/postgres-full-read-provider.js';
export type ExplicitReadPreparationConfig = Parameters<
  typeof createNonactivatedRuntimeReadHost
>[0] & { readonly modelVersion: typeof WORLD_MODEL_VERSION };
const id = (v: unknown): v is string =>
  typeof v === 'string' &&
  v.length <= 256 &&
  /^[A-Z][A-Z0-9]*(?:[_-][A-Z0-9]+)*$/u.test(v);
export type ExplicitServerMetadata = Omit<
  ExplicitReadPreparationConfig,
  'pool' | 'readerRole' | 'authorizationPublisherRole'
>;
export function snapshotServerMetadata<C extends ExplicitServerMetadata>(
  input: C | null,
): C | null {
  if (!input) return null;
  const p = input.endpointPins,
    w = input.admittedWorldPins,
    a = input.auth;
  try {
    const u = new URL(p.origin),
      origin = (v: string) => {
        const x = new URL(v);
        return (
          x.origin === v &&
          x.protocol === 'https:' &&
          !x.username &&
          !x.password &&
          !['localhost', '127.0.0.1', '[::1]'].includes(x.hostname)
        );
      };
    if (
      input.modelVersion !== WORLD_MODEL_VERSION ||
      !origin(p.origin) ||
      u.pathname !== '/' ||
      ![p.projectionPath, p.finalLookupPath].every(
        (v) =>
          /^\/[a-z0-9-]+(?:\/[a-z0-9-]+)*$/u.test(v) &&
          v.length <= 256 &&
          !/^\/(?:auth|storage|healthz|readyz|season1|api|local|world-data)(?:\/|$)/u.test(
            v,
          ) &&
          ![
            '/v1/current-seat',
            '/v1/office-command',
            '/v1/financial-intake',
            '/v1/command-recovery',
          ].includes(v),
      ) ||
      p.projectionPath === p.finalLookupPath ||
      !id(p.deploymentRef) ||
      ![w.worldId, w.seedRef, w.admissionRef].every(id) ||
      !/^sha256:[0-9a-f]{64}$/u.test(w.contentHash) ||
      !/^(?:0|[1-9]\d*)$/u.test(w.minimumWorldVersion) ||
      w.minimumWorldVersion.length > 19 ||
      BigInt(w.minimumWorldVersion) > 9223372036854775807n ||
      !input.routeOptions.allowedOrigins.length ||
      !input.routeOptions.allowedOrigins.every(origin) ||
      !/^[a-z]{20}$/u.test(a.projectRef) ||
      a.expectedIssuer !== `https://${a.projectRef}.supabase.co/auth/v1` ||
      a.jwksUrl !== a.expectedIssuer + '/.well-known/jwks.json' ||
      a.audience !== 'authenticated'
    )
      return null;
    return Object.freeze({
      ...input,
      endpointPins: Object.freeze({ ...p }),
      admittedWorldPins: Object.freeze({ ...w }),
      auth: Object.freeze({ ...a }),
      routeOptions: Object.freeze({
        ...input.routeOptions,
        allowedOrigins: Object.freeze([...input.routeOptions.allowedOrigins]),
      }),
    });
  } catch {
    return null;
  }
}
export function explicitReadConfig(
  input: ExplicitReadPreparationConfig | null,
): ExplicitReadPreparationConfig | null {
  if (!input || typeof input.pool?.connect !== 'function') return null;
  try {
    createPersistedReadBindingConsumer(input); // Original role checks, no IO.
    return snapshotServerMetadata(input);
  } catch {
    return null;
  }
}
export function matchesReadPins(
  b: import('../integration/https-authenticated-read-composition.js').ServerVerifiedReadBinding,
  c: ExplicitReadPreparationConfig,
): boolean {
  const w = c.admittedWorldPins;
  return (
    b.identity.worldId === w.worldId &&
    b.identity.modelVersion === c.modelVersion &&
    b.seed.worldId === w.worldId &&
    b.seed.seedRef === w.seedRef &&
    b.seed.contentHash === w.contentHash &&
    b.seed.admissionRef === w.admissionRef &&
    BigInt(b.readback.worldVersion) >= BigInt(w.minimumWorldVersion)
  );
}
