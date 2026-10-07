import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import type {
  AuthoritativeFinancialPosition,
  EconomicReadVisibilitySummary,
} from '@econmind/core/economic-read-visibility-contract';

it('exports one pure visibility contract runtime/type path without Node-only imports', () => {
  const expected: EconomicReadVisibilitySummary['schemaVersion'] =
    'economic-read-visibility-v1';
  const positionSchema: AuthoritativeFinancialPosition['schemaVersion'] =
    'authoritative-financial-position-v1';
  const runtime = execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '--conditions=browser',
      '-e',
      `
    import {registerHooks} from 'node:module';
    registerHooks({resolve(specifier,context,next){if(specifier.startsWith('node:'))throw new Error('NODE_ONLY_IMPORT_DENIED');return next(specifier,context);}});
    const contract=await import('@econmind/core/economic-read-visibility-contract');
    process.stdout.write(contract.ECONOMIC_READ_VISIBILITY_SCHEMA+"|"+contract.AUTHORITATIVE_FINANCIAL_POSITION_SCHEMA);
  `,
    ],
    { cwd: new URL('../../', import.meta.url), encoding: 'utf8' },
  );
  expect(runtime).toBe(expected + '|' + positionSchema);
  const pkg = JSON.parse(
    readFileSync(
      new URL('../../packages/core/package.json', import.meta.url),
      'utf8',
    ),
  );
  expect(pkg.exports['./economic-read-visibility-contract']).toEqual({
    types: './dist/authorization/economic-read-visibility-contract.d.ts',
    default: './dist/authorization/economic-read-visibility-contract.js',
  });
});
