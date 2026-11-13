/** Offline source runner only: resolve emitted .js imports to the same tree's
 * TypeScript sources. Core remains the actual built package and its brands. */
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
const base = fileURLToPath(new URL('../../', import.meta.url));
registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (
        error?.code !== 'ERR_MODULE_NOT_FOUND' ||
        !specifier.endsWith('.js') ||
        !context.parentURL?.startsWith('file:')
      )
        throw error;
      const resolved = new URL(specifier, context.parentURL);
      if (resolved.protocol !== 'file:') throw error;
      const candidate = fileURLToPath(resolved).slice(0, -3) + '.ts';
      if (!candidate.startsWith(base) || !existsSync(candidate)) throw error;
      return nextResolve(pathToFileURL(candidate).href, context);
    }
  },
});
