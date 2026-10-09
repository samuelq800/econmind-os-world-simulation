import { createSupabaseJwksSignatureVerifier } from '../integration/supabase-jwks-signature-verifier.js';

/** Transport adaptation only. The existing verifier still pins project/issuer/
 * JWKS URL and rejects all non200, redirected or over-limit key responses.
 * This factory does not mount a route, assign a seat or authorize a command. */
export function createCloudflareJwksVerifier(
  input: Parameters<typeof createSupabaseJwksSignatureVerifier>[0],
) {
  const transport = input.fetch ?? globalThis.fetch;
  return createSupabaseJwksSignatureVerifier({
    ...input,
    fetch: (url, init) => transport(url, { ...init, redirect: 'manual' }),
  });
}
