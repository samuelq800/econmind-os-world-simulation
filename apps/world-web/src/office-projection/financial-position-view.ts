import type { CurrentFinancialPositionView } from './model.js';

/** Shared read-only rendering for the office drawer and original FINAL refresh. */
export function renderCurrentFinancialPosition(
  document: Document,
  model: CurrentFinancialPositionView,
): HTMLElement {
  const section = document.createElement('section');
  section.setAttribute('aria-label', 'Current ledger position');
  const node = (tag: string, text: string) => {
    const el = document.createElement(tag);
    el.textContent = text;
    return el;
  };
  section.append(node('h3', 'Current ledger position'));
  if (model.availability !== 'AVAILABLE') {
    section.append(
      node(
        'p',
        model.availability === 'NOT_AUTHORIZED'
          ? 'NOT_AUTHORIZED'
          : 'Unavailable · FINANCIAL_POSITION_UNAVAILABLE',
      ),
    );
    return section;
  }
  const values = document.createElement('dl');
  for (const field of model.fields)
    values.append(
      node('dt', field.label),
      node('dd', `${field.canonicalValue} ${field.unit}`),
    );
  section.append(values);
  if (!model.fields.length)
    section.append(
      node(
        'p',
        'No authorized non-zero entries. Missing accounts are not shown as zero.',
      ),
    );
  section.append(node('p', 'Opening + posted entries · Not spendable funds'));
  const source = document.createElement('details');
  source.append(node('summary', 'Position source'));
  const provenance = document.createElement('dl');
  for (const field of model.provenance)
    provenance.append(node('dt', field.label), node('dd', field.value));
  source.append(provenance);
  section.append(source);
  return section;
}
