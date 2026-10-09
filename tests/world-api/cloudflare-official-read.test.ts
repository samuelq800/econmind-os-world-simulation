import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createCloudflareOfficialReadHandler } from '../../apps/world-api/src/integration/cloudflare-official-read.js';

const root = '/functions/v1/world-v2-official-read';
const countries = readFileSync(
  new URL(
    '../../artifacts/world-balanced-candidate-v1/data/countries.json',
    import.meta.url,
  ),
  'utf8',
);

describe('Cloudflare public source transport', () => {
  it('uses manual redirects and preserves the actual pinned country source', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const handle = createCloudflareOfficialReadHandler(async (url, init) => {
      calls.push({ url, init });
      return new Response(countries, {
        headers: { 'content-type': 'application/json' },
      });
    });
    const response = await handle(
      new Request(`https://worker.test${root}/v1/world-data/countries`),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      countryCount: 70,
      liveWorldState: false,
      proposalFieldsAreExecuted: false,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.init).toMatchObject({
      method: 'GET',
      redirect: 'manual',
      credentials: 'omit',
    });
    expect(calls[0]?.url).toContain(
      '/5d493e93dfab1425731191ba7491cce47949d176e4769b33fdca48d2d31dba89.json',
    );
  });

  it.each([301, 302, 307, 308])(
    'refuses redirect status %i',
    async (status) => {
      let calls = 0;
      const handle = createCloudflareOfficialReadHandler(async () => {
        calls++;
        return new Response(null, {
          status,
          headers: { location: 'https://untrusted.invalid/source.json' },
        });
      });
      const response = await handle(
        new Request(`https://worker.test${root}/v1/world-data/countries`),
      );
      expect(response.status).toBe(503);
      expect(calls).toBe(1);
    },
  );

  it('retains hash validation and blocks economic routes before fetching', async () => {
    let calls = 0;
    const handle = createCloudflareOfficialReadHandler(async () => {
      calls++;
      return new Response(countries + ' ', {
        headers: { 'content-type': 'application/json' },
      });
    });
    expect(
      (
        await handle(
          new Request(`https://worker.test${root}/v1/commands`, {
            method: 'POST',
          }),
        )
      ).status,
    ).toBe(405);
    expect(calls).toBe(0);
    expect(
      (
        await handle(
          new Request(`https://worker.test${root}/v1/world-data/countries`),
        )
      ).status,
    ).toBe(503);
    expect(calls).toBe(1);
  });
});
