import { createSupabaseJwksSignatureVerifier } from '../integration/supabase-jwks-signature-verifier.js';

/** Transport adaptation only. The existing verifier still pins project/issuer/
 * JWKS URL and rejects all non200, redirected or over-limit key responses.
 * This factory does not mount a route, assign a seat or authorize a command. */
export function createCloudflareJwksVerifier(
  input: Parameters<typeof createSupabaseJwksSignatureVerifier>[0],
) {
  return createSupabaseJwksSignatureVerifier({
    ...input,
    fetch: createCloudflareJwksFetch(input.fetch),
  });
}

/** Supply this same fetch port to the existing read/financial/Office factories.
 * Their original verifier still pins the actual JWKS URL, key and claims.
 * Workers implements manual redirects; redirect:error is not supported there. */
export function createCloudflareJwksFetch(
  transport: typeof globalThis.fetch = globalThis.fetch,
): typeof globalThis.fetch {
  return (url, init) => transport(url, { ...init, redirect: 'manual' });
}
