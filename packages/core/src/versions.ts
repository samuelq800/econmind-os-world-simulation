import { DOMAIN_ERROR_CODES, DomainError } from './errors.js';

export const WORLD_MODEL_VERSION = 'world-v2-foundation-1' as const;
export const WORLD_SCHEMA_VERSION = 'world-v2-schema-1' as const;
export const WORLD_REGISTRY_VERSION = 'world-v2-registry-1' as const;

export interface WorldVersions {
  readonly model: string;
  readonly registry: string;
  readonly schema: string;
}

export const CURRENT_WORLD_VERSIONS: WorldVersions = Object.freeze({
  model: WORLD_MODEL_VERSION,
  registry: WORLD_REGISTRY_VERSION,
  schema: WORLD_SCHEMA_VERSION,
});

export function assertWorldVersions(actual: WorldVersions): void {
  for (const key of ['model', 'registry', 'schema'] as const) {
    if (actual[key] !== CURRENT_WORLD_VERSIONS[key]) {
      throw new DomainError(
        DOMAIN_ERROR_CODES.VERSION_MISMATCH,
        `World ${key} version mismatch`,
      );
    }
  }
}
