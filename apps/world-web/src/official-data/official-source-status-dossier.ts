export const SOURCE_DOSSIER_OFFICES = [
  ['captain', 'Captain'],
  ['finance', '财政'],
  ['central_bank', '央行'],
  ['industry', '产业'],
  ['trade', '贸易'],
  ['social', '社会'],
] as const;
export type SourceDossierOffice = (typeof SOURCE_DOSSIER_OFFICES)[number][0];

export function sourceDossierCountry(search: string): string | null {
  const input = new URLSearchParams(search).get('country');
  if (input === null) return '01';
  return (
    /^(?:visual-territory-)?(0[1-9]|[1-6][0-9]|70)$/u.exec(input)?.[1] ?? null
  );
}

/** Public display selection only; this link neither grants a seat nor submits a command. */
export function sourceDossierHref(
  office: SourceDossierOffice,
  country: string | null,
): string | undefined {
  if (country === null || !/^(?:0[1-9]|[1-6][0-9]|70)$/u.test(country))
    return undefined;
  const query = new URLSearchParams({ role: office, country });
  return `./season1-immersive/?${query.toString()}#country`;
}
