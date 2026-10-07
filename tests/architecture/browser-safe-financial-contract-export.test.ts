import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { AuthenticatedFinancialIntakeRequestDto } from '@econmind/core/authenticated-financial-intake-contract';

const schema: AuthenticatedFinancialIntakeRequestDto['schemaVersion'] =
  'world-authenticated-financial-intake-v1';
describe('dedicated pure financial contract package export', () => {
  it('loads the frozen contract directly with Node-only imports denied, while root barrel remains unchanged', () => {
    // An isolated direct-module graph check, not a browser or bundle claim.
    const result = execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '--conditions=browser',
        '-e',
        `
      import {registerHooks} from 'node:module';
      registerHooks({resolve(specifier,context,next){
        if(specifier.startsWith('node:')) throw new Error('TEST_NODE_IMPORT_DENIED:'+specifier);
        return next(specifier,context);
      }});
      const contract=await import('@econmind/core/authenticated-financial-intake-contract');
      let rootDenied=false;
      try {await import('@econmind/core');}
      catch(error){rootDenied=error.message.startsWith('TEST_NODE_IMPORT_DENIED:node:');}
      process.stdout.write(JSON.stringify({schema:contract.AUTHENTICATED_FINANCIAL_INTAKE_SCHEMA,path:contract.AUTHENTICATED_FINANCIAL_INTAKE_PATH,rootDenied,frozen:Object.isFrozen(contract.FINANCIAL_INTAKE_OFFICE_ACTIONS)}));
    `,
      ],
      { cwd: new URL('../../', import.meta.url), encoding: 'utf8' },
    );
    expect(JSON.parse(result)).toEqual({
      schema,
      path: '/v1/financial-intake',
      rootDenied: true,
      frozen: true,
    });
  });
  it('keeps exact reviewed source identity and uses its existing declaration/runtime outputs', () => {
    const source = readFileSync(
      new URL(
        '../../packages/core/src/commands/authenticated-financial-intake-contract.ts',
        import.meta.url,
      ),
    );
    expect(createHash('sha256').update(source).digest('hex')).toBe(
      '889c8cf4c9d22bde9bce9af5612ad56f2bed2774b80a060fa30035249567f985',
    );
    const pkg = JSON.parse(
      readFileSync(
        new URL('../../packages/core/package.json', import.meta.url),
        'utf8',
      ),
    );
    expect(pkg.exports['./authenticated-financial-intake-contract']).toEqual({
      types: './dist/commands/authenticated-financial-intake-contract.d.ts',
      default: './dist/commands/authenticated-financial-intake-contract.js',
    });
    expect(pkg.exports['.']).toEqual({
      types: './dist/index.d.ts',
      default: './dist/index.js',
    });
  });
});
