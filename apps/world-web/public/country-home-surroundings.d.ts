/** The legacy page owns its images, pins and controls; this only adds context. */
export function mountLegacyCountryAtlas(
  root: HTMLElement,
  country: unknown,
  publicationBase?: URL,
): Promise<void>;

export function unambiguousPinIds(
  points: readonly { id: string; x: number; y: number }[],
  diameter?: number,
): string[];

export function geographicPinGroups(
  points: readonly { id: string; x: number; y: number }[],
  diameter?: number,
): { id: string; x: number; y: number; ids: string[] }[];
