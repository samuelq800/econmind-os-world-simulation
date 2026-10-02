import { describe, expect, it } from 'vitest';

import { resolvePublicBasePath } from '../../apps/world-web/vite.config.js';

describe('World web public base path', () => {
  it.each([undefined, ''])(
    'preserves Pages fallback for %s',
    (publicBasePath) => {
      expect(
        resolvePublicBasePath({ publicBasePath, githubActions: 'true' }),
      ).toBe('/econmind-os-world-simulation/');
    },
  );

  it.each([undefined, '', 'false'])(
    'preserves local root for %s',
    (githubActions) => {
      expect(resolvePublicBasePath({ githubActions })).toBe('/');
      expect(resolvePublicBasePath({ publicBasePath: '', githubActions })).toBe(
        '/',
      );
    },
  );

  it.each(['/', '/abc/', '/preview/v2/', '/.well-known/', '/build_1-2.3~/'])(
    'uses the explicit path %s in CI and locally',
    (publicBasePath) => {
      expect(
        resolvePublicBasePath({ publicBasePath, githubActions: 'true' }),
      ).toBe(publicBasePath);
      expect(resolvePublicBasePath({ publicBasePath })).toBe(publicBasePath);
    },
  );

  it.each([
    'abc/',
    '/abc',
    '//',
    '//example.com/',
    'https://world.econmind.group/',
    '/abc/?q=1',
    '/abc/#country',
    '/abc//def/',
    '/./',
    '/abc/../',
    '/%2e%2e/',
    '/abc\\def/',
    ' /abc/',
    '/abc/ ',
    '/abc\n/',
    '/abc/\n',
    '/abc/\r\n',
  ])('rejects unsafe or noncanonical paths: %j', (publicBasePath) => {
    expect(() =>
      resolvePublicBasePath({ publicBasePath, githubActions: 'true' }),
    ).toThrow('WORLD_WEB_PUBLIC_BASE_PATH');
  });
});
