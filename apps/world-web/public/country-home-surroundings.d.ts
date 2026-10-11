/** The legacy page owns its public record and controls; this only mounts terrain. */
export function mountLegacyCountryAtlas(
  root: HTMLElement,
  country: unknown,
  publicationBase?: URL,
): Promise<void>;
