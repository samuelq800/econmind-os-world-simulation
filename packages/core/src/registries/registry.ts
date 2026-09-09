import { DOMAIN_ERROR_CODES, DomainError } from '../errors.js';

export interface RegistryEntry {
  readonly id: string;
}

export class CanonicalRegistry<Entry extends RegistryEntry> {
  readonly entries: readonly Entry[];
  readonly name: string;
  readonly #byId: ReadonlyMap<string, Entry>;

  constructor(name: string, entries: readonly Entry[]) {
    const byId = new Map<string, Entry>();
    for (const entry of entries) {
      if (byId.has(entry.id)) {
        throw new DomainError(
          DOMAIN_ERROR_CODES.DUPLICATE_REGISTRY_ID,
          `${name} contains duplicate canonical ID ${entry.id}`,
        );
      }
      byId.set(entry.id, Object.freeze({ ...entry }));
    }
    this.name = name;
    this.entries = Object.freeze([...byId.values()]);
    this.#byId = byId;
    Object.freeze(this);
  }

  get(id: string): Entry {
    const entry = this.#byId.get(id);
    if (!entry) {
      throw new DomainError(
        DOMAIN_ERROR_CODES.REGISTRY_ENTRY_NOT_FOUND,
        `${this.name} has no entry ${id}`,
      );
    }
    return entry;
  }

  has(id: string): boolean {
    return this.#byId.has(id);
  }
}
