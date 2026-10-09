// TEST_ONLY. This factory is bundled only into a local workerd test service;
// it is not in either deployable Worker entry or a real authentication endpoint.
import { createCloudflareJwksVerifier } from '../../apps/world-api/src/runtime-preparation/cloudflare-jwks-verifier.js';
import { verifySupabaseJwtClaims } from '../../apps/world-api/src/integration/identity.js';

const project = 'abcdefghijklmnopqrst';
const issuer = `https://${project}.supabase.co/auth/v1`;
export function createWorkerdJwtTestFixture(jwks: unknown) {
  const verifier = createCloudflareJwksVerifier({
    projectRef: project,
    expectedIssuer: issuer,
    jwksUrl: issuer + '/.well-known/jwks.json',
    fetch: async (url, init) => {
      if (init?.redirect !== 'manual')
        throw new Error('TEST_ONLY_TRANSPORT_INVALID');
      const response = new Response(JSON.stringify(jwks), {
        headers: { 'content-type': 'application/json' },
      });
      Object.defineProperty(response, 'url', { value: String(url) });
      return response;
    },
  });
  return {
    async fetch(request: Request): Promise<Response> {
      try {
        const token =
          request.headers.get('authorization')?.replace(/^Bearer /u, '') ?? '';
        await verifySupabaseJwtClaims({
          token,
          verifier,
          policy: {
            expectedIssuer: issuer,
            expectedAudience: 'authenticated',
            nowEpochSeconds: Math.floor(Date.now() / 1000),
          },
        });
        return new Response('TEST_ONLY_VALID_SIGNATURE_AND_CLAIMS', {
          status: 200,
        });
      } catch {
        return new Response('TEST_ONLY_REJECTED', { status: 401 });
      }
    },
  };
}
